/**
 * Runtime logic for AsyncAPI Node-RED node
 *
 * Responsibilities:
 * - Register node
 * - Handle input messages
 * - Resolve payload & parameters
 * - Trigger MQTT service
 * - Communicate with editor UI
 */
module.exports = function (RED) {

    const router = require("../routes/router")(RED);
    const mqttService = require("../services/mqtt-service")(RED);

    /**
     * Attach router to Node-RED admin API
     */
    RED.httpAdmin.use(router);

    /**
     * Store runtime node instances
     */
    const nodesMap = {};

    /**
     * Node constructor
     */
    function AsyncApiRedNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;

        /**
         * Load configuration from editor
         */
        node.serverUrl = config.serverUrl || "";
        node.topic = config.topic || "";
        node.operation = config.operation || null;
        node.expectedPayload = config.expectedPayload || [];
        node.parameterValues = config.parameterValues || {};
        node.savedPayload = config.payload || {};
        node.parameters = config.parameters || [];
        node.resolvedParameters = {};

        /**
         * Register node
         */
        nodesMap[node.id] = node;

        /**
         * Auto-connect to MQTT on deploy
         */
        if (node.serverUrl && node.topic && node.operation) {
            mqttService.connect(node);
        }

        /**
         * Cleanup on node close
         */
        node.on("close", function () {
            if (node.mqttClient) {
                node.mqttClient.end(true);
            }

            delete nodesMap[node.id];
        });

        /**
         * Handle incoming messages
         */
        node.on("input", function (msg, send, done) {
            try {

                /**
                 * Store incoming message
                 */
                node.msg = msg || {};

                /**
                 * Resolve payload and parameters
                 */
                node.payload = resolvePayload(node, msg);
                node.resolvedParameters = resolveParameters(node, msg);

                /**
                 * Ensure MQTT connection exists
                 */
                mqttService.connect(node);

                /**
                 * Handle MQTT logic
                 */
                mqttService.handle(node);

                /**
                 * Notify editor UI
                 */
                RED.comms.publish(`async-api-red/payload-update/${node.id}`, {
                    payload: node.payload,
                    parameters: node.resolvedParameters
                });

                if (done) {
                    done();
                }

            } catch (err) {

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
     * Resolve payload
     *
     * Priority:
     * 1. msg.payload
     * 2. saved payload from editor
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
     * Resolve parameters
     *
     * Priority:
     * 1. msg.parameters
     * 2. saved parameters
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
     * Expose nodes map globally
     */
    RED.nodesMap = nodesMap;

    /**
     * Register node type
     */
    RED.nodes.registerType("async-api-red", AsyncApiRedNode);
};