/**
 * Main Node-RED runtime entry for the custom "async-api-red" node.
 *
 * Responsibilities:
 * - Register the node type in Node-RED
 * - Mount editor/backend HTTP routes
 * - Handle incoming runtime messages
 * - Resolve payload and parameters from input or saved editor state
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
     * Useful for route handlers or debugging.
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

        /**
         * Persisted configuration from the editor dialog.
         */
        node.serverUrl = config.serverUrl || "";
        node.topic = config.topic || "";
        node.operation = config.operation || null;
        node.expectedPayload = Array.isArray(config.expectedPayload) ? config.expectedPayload : [];
        node.parameterValues = config.parameterValues || {};
        node.savedPayload = config.payload || {};
        node.parameters = Array.isArray(config.parameters) ? config.parameters : [];
        node.resolvedParameters = {};

        /**
         * Store active runtime node.
         */
        nodesMap[node.id] = node;

        /**
         * Connect immediately when the node is created,
         * if enough configuration already exists.
         *
         * This prevents the node from staying disconnected after deploy
         * until the first input message arrives.
         */
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
         *
         * Important:
         * - The input does NOT directly go to node output
         * - It is only used to publish through MQTT
         * - Output happens later only when MQTT sends back a real message
         */
        node.on("input", function (msg, send, done) {
            try {
                /**
                 * Store the full incoming message for later use
                 * (for example during topic parameter resolution).
                 */
                node.msg = msg || {};

                /**
                 * Resolve final payload and parameters.
                 * These values will be used by MQTT publish logic.
                 */
                node.payload = resolvePayload(node, msg);
                node.resolvedParameters = resolveParameters(node, msg);

                /**
                 * If expectedPayload is missing, rebuild it from the selected operation.
                 * This helps when a node instance was loaded without full schema data.
                 */
                if (!Array.isArray(node.expectedPayload) || node.expectedPayload.length === 0) {
                    node.expectedPayload = getExpectedPayloadFromOperation(node.operation);
                }

                /**
                 * Validate topic parameters before they are injected into the topic template.
                 */
                validateParameters(node);

                /**
                 * Validate payload only if one exists.
                 * This avoids publishing invalid data and avoids validating null payloads.
                 */
                if (node.payload !== undefined && node.payload !== null) {
                    validatePayload(node);
                }

                /**
                 * Ensure MQTT connection exists and then handle send/receive logic.
                 */
                Utils.connectToServer(node);
                Utils.handleMessage(node);

                /**
                 * Notify editor UI with latest resolved runtime values.
                 * Useful for showing current runtime state inside the dialog.
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
     * Returns null if nothing exists.
     * This is safer than returning {} because an empty object could be published by mistake.
     *
     * @param {object} node
     * @param {object} msg
     * @returns {*}
     */
    function resolvePayload(node, msg) {
        if (msg && msg.payload !== undefined && msg.payload !== null) {
            return msg.payload;
        }

        if (node.savedPayload !== undefined && node.savedPayload !== null) {
            return node.savedPayload;
        }

        return null;
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
        if (msg && msg.parameters && typeof msg.parameters === "object") {
            return msg.parameters;
        }

        if (node.parameterValues && typeof node.parameterValues === "object") {
            return node.parameterValues;
        }

        return {};
    }

    /**
     * Validate topic parameters before topic resolution.
     *
     * Ensures all declared topic parameters have a resolved value.
     *
     * @param {object} node
     */
    function validateParameters(node) {
        const params = Array.isArray(node.parameters) ? node.parameters : [];
        const values = node.resolvedParameters || {};

        for (const param of params) {
            const name = param.id || param.name;

            const value =
                values[name] ??
                node.parameterValues?.[name] ??
                param.value;

            if (value === undefined || value === null || value === "") {
                throw new Error(`Missing required parameter: "${name}"`);
            }
        }
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
                required.push(field.name);
            }
        }

        /**
         * Fallback to expectedPayload if operation.messages did not provide schema info.
         */
        if (Object.keys(properties).length === 0) {
            for (const field of Array.isArray(expectedPayload) ? expectedPayload : []) {
                if (!field?.name) {
                    continue;
                }

                properties[field.name] = mapFieldToJsonSchema(field);
                required.push(field.name);
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
     * Convert AsyncAPI field metadata into a JSON Schema property definition.
     *
     * @param {object} field
     * @returns {object}
     */
    function mapFieldToJsonSchema(field) {
        const fieldType = (field?.type || "string").toLowerCase();

        switch (fieldType) {
            case "number":
                return {type: "number"};

            case "integer":
                return {type: "integer"};

            case "boolean":
                return {type: "boolean"};

            case "array":
                return {type: "array"};

            case "object":
                return {type: "object"};

            case "string":
            default:
                return {type: "string"};
        }
    }

    /**
     * Extract expected payload fields directly from the selected AsyncAPI operation.
     *
     * @param {object|null} operation
     * @returns {Array}
     */
    function getExpectedPayloadFromOperation(operation) {
        const result = [];
        const messages = Array.isArray(operation?.messages) ? operation.messages : [];

        for (const message of messages) {
            const fields = Array.isArray(message?.payload) ? message.payload : [];

            for (const field of fields) {
                if (!field?.name) {
                    continue;
                }

                result.push({
                    name: field.name,
                    type: field.type || "string"
                });
            }
        }

        return result;
    }

    /**
     * Expose nodesMap on RED for other modules/debugging.
     */
    RED.nodesMap = nodesMap;

    /**
     * Register the node type.
     * Type name must match the one used in the HTML editor file.
     */
    RED.nodes.registerType("async-api-red", AsyncApiRedNode);
};