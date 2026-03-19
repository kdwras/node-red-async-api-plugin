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

        // Store runtime node reference
        nodesMap[node.id] = node;

        /**
         * Cleanup when node is stopped / redeployed / removed.
         */
        node.on("close", function () {
            node.log(`Closing node ${node.id}`);
            delete nodesMap[node.id];
        });

        /**
         * Handle incoming runtime messages.
         *
         * Priority rules:
         * - payload: saved editor payload first, otherwise msg.payload
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
                node.parameters = resolveParameters(node, msg);


                if (!Array.isArray(node.expectedPayload) || node.expectedPayload.length === 0) {
                    node.expectedPayload = getExpectedPayloadFromOperation(node.operation);
                }

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
                    parameters: node.parameters
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
     * 1. saved payload from editor
     * 2. incoming msg.payload
     *
     * @param {object} node
     * @param {object} msg
     * @returns {*}
     */
    function resolvePayload(node, msg) {
        return node.savedPayload ?? msg.payload;
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
     * Validate node.payload against expected AsyncAPI payload schema.
     *
     * expectedPayload example:
     * [
     *   { name: "temperature", type: "number" },
     *   { name: "device", type: "string" }
     * ]
     *
     * Validation runs only when:
     * - payload is a plain object
     * - expectedPayload is an array
     *
     * @param {object} node
     */
    function validatePayload(node) {
        const payload = node.payload;

        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
            return;
        }

        if (!Array.isArray(node.expectedPayload) || node.expectedPayload?.length === 0) {
            node.warn("No expected payload schema found; skipping payload validation.");
            return;
        }

        for (const spec of node.expectedPayload) {
            const value = payload[spec.name];

            if (value === undefined) {
                throw new Error(`Missing required key: "${spec.name}"`);
            }

            if (spec.type === "string" && typeof value !== "string") {
                throw new Error(`Key "${spec.name}" must be a string.`);
            }

            if (spec.type === "integer") {
                const parsed = Number(value);
                if (!Number.isInteger(parsed)) {
                    throw new Error(`Key "${spec.name}" must be an integer.`);
                }
            }

            if (spec.type === "number") {
                const parsed = Number(value);
                if (Number.isNaN(parsed)) {
                    throw new Error(`Key "${spec.name}" must be a number.`);
                }
            }

            if (spec.type === "boolean" && typeof value !== "boolean") {
                throw new Error(`Key "${spec.name}" must be a boolean.`);
            }
        }

    }

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
     * Expose active node instances for routes/debugging.
     */
    RED.nodesMap = nodesMap;

    /**
     * Register node type in Node-RED runtime.
     */
    RED.nodes.registerType("async-api-red", AsyncApiRedNode);
};