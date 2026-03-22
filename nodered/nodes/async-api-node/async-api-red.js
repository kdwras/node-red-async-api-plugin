/**
 * Main Node-RED runtime entry for the custom "async-api-red" node.
 *
 * Responsibilities:
 * - Register the node type in Node-RED
 * - Mount editor/backend HTTP routes
 * - Handle incoming runtime messages
 * - Validate payloads against the selected AsyncAPI schema
 * - Connect to MQTT and publish/subscribe based on selected operation
 * - Notify the editor UI about payload updates and validation errors
 */
module.exports = function (RED) {

    const Ajv = require("ajv");

    /**
     * Runtime HTTP routes used by the editor UI.
     */
    const router = require("./routes/router")(RED);

    /**
     * Mount custom admin routes into Node-RED.
     */
    RED.httpAdmin.use(router);

    /**
     * Keep references to active runtime node instances.
     * Useful for route handlers that need access to a live node.
     */
    const nodesMap = {};

    /**
     * Node constructor.
     *
     * Called whenever a new instance of this node is created.
     *
     * @param {object} config - Editor-side node configuration
     */
    function AsyncApiRedNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        const Utils = require("./utils/utils")(RED);

        node.serverUrl = config.serverUrl || "";
        node.topic = config.topic || "";
        node.operation = config.operation || null;
        node.expectedPayload = Array.isArray(config.expectedPayload) ? config.expectedPayload : [];
        node.parameterValues = config.parameterValues || {};
        node.savedPayload = config.payload || {};
        node.parameters = Array.isArray(config.parameters) ? config.parameters : [];
        node.resolvedParameters = {};

        // Store runtime node reference
        nodesMap[node.id] = node;

        if (node.serverUrl && node.topic && node.operation) {
            Utils.connectToServer(node);
        }

        /**
         * Cleanup when node is stopped / redeployed / removed.
         */
        node.on("close", function () {
            if (node.mqttClient) {
                node.mqttClient.end(true);
            }
            delete nodesMap[node.id];
        });

        /**
         * Handle incoming runtime messages.
         *
         * Priority rules:
         * - payload: incoming msg.payload first, otherwise saved editor payload
         * - parameters: msg.parameters first, otherwise saved editor parameters
         */
        node.on("input", function (msg, send, done) {
            const Utils = require("./utils/utils")(RED);

            try {
                /**
                 * Store full incoming message for later use.
                 */
                node.msg = msg;

                /**
                 * Resolve final payload and parameters.
                 */
                node.payload = resolvePayload(node, msg);
                node.resolvedParameters = resolveParameters(node, msg);
                /**
                 * Fallback: if expectedPayload is missing, rebuild it from the selected operation.
                 */
                if (!Array.isArray(node.expectedPayload) || node.expectedPayload.length === 0) {
                    node.expectedPayload = getExpectedPayloadFromOperation(node.operation);
                }

                /**
                 * Validate parameters BEFORE using them in topic resolution
                 */
                validateParameters(node);

                /**
                 * Validate resolved payload against expected schema.
                 */
                validatePayload(node);

                /**
                 * Connect to MQTT server and process send/receive logic.
                 */
                Utils.connectToServer(node);
                Utils.handleMessage(node);

                /**
                 * Notify editor UI with latest resolved runtime values.
                 */
                RED.comms.publish(`async-api-red/payload-update/${node.id}`, {
                    payload: node.payload,
                    parameters: node.resolvedParameters
                });

                if (done) {
                    done();
                }

            } catch (err) {
                /**
                 * Notify editor UI and Node-RED runtime about the error.
                 */
                RED.comms.publish(`async-api-red/payload-error/${node.id}`, {
                    error: err.message
                });

                node.error(err.message, msg);

                if (done) {
                    done(err);
                }
            }
        });
    }

    /**
     * Resolve final payload.
     *
     * Priority:
     * 1. incoming msg.payload
     * 2. saved payload from editor
     *
     * @param {object} node
     * @param {object} msg
     * @returns {*}
     */
    function resolvePayload(node, msg) {
        return msg.payload ?? node.savedPayload ?? {};
    }

    /**
     * Resolve final parameter values.
     *
     * Priority:
     * 1. msg.parameters
     * 2. saved parameters from editor
     *
     * @param {object} node
     * @param {object} msg
     * @returns {object}
     */
    function resolveParameters(node, msg) {
        return msg.parameters ?? node.parameterValues ?? {};
    }

    /**
     * Validate node.payload against a JSON Schema built from the selected AsyncAPI operation.
     *
     * Current scope:
     * - object payloads
     * - flat properties extracted from AsyncAPI
     * - required fields inferred from expectedPayload entries
     * - string / number / integer / boolean / array types supported by AJV
     *
     * @param {object} node
     */
    function validatePayload(node) {
        const payload = node.payload;

        if (payload === undefined || payload === null) {
            throw new Error("Payload is missing.");
        }

        if (typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error("Payload must be a JSON object.");
        }

        const schema = buildJsonSchemaFromOperation(node.operation, node.expectedPayload);

        if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
            node.warn("No expected payload schema found; skipping payload validation.");
            return;
        }

        const ajv = new Ajv({
            allErrors: true,
            strict: false
        });

        const validate = ajv.compile(schema);
        const valid = validate(payload);

        if (!valid) {
            const message = (validate.errors || [])
                .map((err) => {
                    const where = err.instancePath || err.schemaPath || "";
                    return where ? `${where} ${err.message}` : `${err.message}`;
                })
                .join("; ");

            throw new Error(`Payload validation failed: ${message}`);
        }
    }

    /**
     * Build JSON Schema from selected AsyncAPI operation.
     *
     * First choice:
     * - operation.messages[].payload[]
     *
     * Fallback:
     * - expectedPayload[]
     *
     * Output example:
     * {
     *   type: "object",
     *   properties: {
     *     temperature: { type: "number" },
     *     mode: { type: "string" }
     *   },
     *   required: ["temperature", "mode"],
     *   additionalProperties: true
     * }
     *
     * @param {object|null} operation
     * @param {Array} expectedPayload
     * @returns {object}
     */
    function buildJsonSchemaFromOperation(operation, expectedPayload = []) {
        const properties = {};
        const required = [];

        const messages = Array.isArray(operation?.messages) ? operation.messages : [];

        for (const message of messages) {
            const fields = Array.isArray(message?.payload) ? message.payload : [];

            for (const field of fields) {
                if (!field?.name) {
                    continue;
                }

                properties[field.name] = mapFieldToJsonSchema(field);

                /**
                 * For now, fields extracted into expectedPayload are treated as required.
                 * Later we can improve this with explicit AsyncAPI "required" support.
                 */
                if (field.required === true) {
                    required.push(field.name);
                }
            }
        }

        /**
         * Fallback if operation payload is missing but expectedPayload exists
         */
        if (Object.keys(properties).length === 0 && Array.isArray(expectedPayload)) {
            for (const field of expectedPayload) {
                if (!field?.name) {
                    continue;
                }

                properties[field.name] = mapFieldToJsonSchema(field);
                if (field.required === true) {
                    required.push(field.name);
                }
            }
        }

        return {
            type: "object",
            properties,
            required: [...new Set(required)],
            additionalProperties: true
        };
    }

    /**
     * Convert a payload field extracted from AsyncAPI into a JSON Schema property.
     *
     * This function maps the simplified field structure (produced in router.js)
     * into a valid JSON Schema fragment used by AJV for runtime validation.
     *
     * Current supported mappings:
     * - type → JSON Schema type (string, number, integer, boolean, array, etc.)
     * - enum → restricts value to a predefined set of allowed values
     * - minimum → numeric lower bound (inclusive)
     * - maximum → numeric upper bound (inclusive)
     * - items → schema definition for array elements
     *
     * Notes:
     * - enum validation works only if router.js includes `enum` from AsyncAPI
     * - items should ideally be a valid JSON Schema object (not raw AsyncAPI)
     *
     * Limitations (to be extended in future steps):
     * - No support yet for:
     *   - required fields (handled at parent schema level)
     *   - nested object properties
     *   - oneOf / anyOf / allOf
     *   - string formats (e.g. date-time, email)
     *   - pattern validation (regex)
     *   - array constraints (minItems, maxItems)
     *
     * @param {object} field - Field metadata extracted from AsyncAPI payload
     * @returns {object} JSON Schema property definition
     */
    function mapFieldToJsonSchema(field) {
        const schema = {};

        // Map primitive type (string, number, integer, boolean, array, etc.)
        if (field.type) {
            schema.type = field.type;
        }

        // Apply enum constraint if defined
        if (Array.isArray(field.enum) && field.enum.length > 0) {
            schema.enum = field.enum;
        }

        // Numeric constraints
        if (typeof field.minimum === "number") {
            schema.minimum = field.minimum;
        }

        if (typeof field.maximum === "number") {
            schema.maximum = field.maximum;
        }

        // Array item schema
        if (field.type === "array" && field.items) {
            schema.items = field.items;
        }

        return schema;
    }
    /**
     * Fallback helper to extract payload field metadata from operation.
     *
     * @param {object} operation
     * @returns {Array}
     */
    function getExpectedPayloadFromOperation(operation) {
        const fields = [];

        if (!operation || !Array.isArray(operation.messages)) {
            return fields;
        }

        for (const message of operation.messages) {
            if (Array.isArray(message.payload)) {
                for (const field of message.payload) {
                    fields.push(field);
                }
            }
        }

        return fields;
    }

    /**
     * Validate channel parameters before topic resolution.
     *
     * In AsyncAPI, channel parameters (e.g. {homeId}) are part of the topic template,
     * so they must always be resolved into concrete values before publishing/subscribing.
     *
     * Validation rules:
     * - Every declared parameter in node.parameters MUST have a value
     * - Value can come from:
     *   1. msg.parameters (highest priority)
     *   2. node.parameterValues (saved from editor UI)
     *
     * If any parameter is missing or empty, an error is thrown and
     * message processing is stopped.
     *
     * @param {object} node - Node-RED node instance
     */
    function validateParameters(node) {
        const params = Array.isArray(node.parameters) ? node.parameters : [];
        const values = node.resolvedParameters || {};

        for (const param of params) {
            const name = param.id || param.name;

            if (values[name] === undefined || values[name] === null || values[name] === "") {
                throw new Error(`Missing required parameter "${name}"`);
            }
        }
    }

    /**
     * Expose active node instances for routes/debugging.
     */
    RED.nodesMap = nodesMap;

    /**
     * Register node type in Node-RED runtime.
     */
    RED.nodes.registerType("async-api-red", AsyncApiRedNode);
};