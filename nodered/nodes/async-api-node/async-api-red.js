/**
 * Main Node-RED node module entry
 *
 * Responsibilities:
 * - Register the Node-RED node type ("async-api-red")
 * - Mount HTTP admin routes (Express router) for editor UI / REST calls
 * - Handle incoming Node-RED messages (msg) and perform:
 *   - payload validation
 *   - MQTT connection
 *   - send/receive handling
 *   - editor notifications via RED.comms.publish
 */
const express = require("express");

module.exports = function (RED) {

    /**
     * Admin HTTP routes for this node (file upload, AsyncAPI parsing, user selections, etc.)
     */
    const router = require("./routes/router")(RED);

    /**
     * Express app instance (note: created but not mounted directly; routes are mounted on RED.httpAdmin)
     */
    const app = express();

    /**
     * Mount router on Node-RED admin HTTP server
     * (this exposes the endpoints under Node-RED's /admin context)
     */
    RED.httpAdmin.use(router);

    /**
     * In-memory map of active node instances, keyed by node.id
     * Useful for debugging or external modules needing access to node runtime objects.
     */
    const nodesMap = {}; // Store node instances

    /**
     * Node constructor / factory function
     *
     * Called by Node-RED when a node instance is created from the editor configuration.
     *
     * @param {object} config - Node configuration from the editor
     */
    function getNode(config) {
        // Initialize Node-RED node instance (sets this.id, this.name, wiring, etc.)
        RED.nodes.createNode(this, config);

        const node = this;

        // Track node instance by id
        nodesMap[node.id] = node;

        /**
         * close event
         * Called just before the node is stopped/removed (e.g., flows re-deploy, node deleted).
         * Use it to clean up resources (connections, timers, etc.)
         */
        node.on("close", () => {
            console.log(`Close node ${node.id}`);
            delete nodesMap[node.id]; // Cleanup on node deletion
        });

        /**
         * input event
         * Called whenever a message arrives at this node.
         *
         * @param {object} msg - Node-RED message
         * @param {function} send - send function (Node-RED v1+)
         * @param {function} done - completion callback
         */
        node.on("input", function (msg, send, done) {
            // Load utils on demand (keeps module boundaries; also ensures RED-bound utilities)
            const Utils = require("./utils/utils")(RED);
            try {
                // Store the incoming payload on the node instance
                // (used later by MQTT send/publish logic and editor UI updates)
                node.payload = msg.payload;

                // Validate payload against expected schema (if configured)
                validatePayload(node);

                // If validation passes, connect to broker and perform send/receive action
                Utils.connectToServer(node);
                Utils.handleMessage(node);

                /**
                 * Notify the editor UI about the latest payload
                 * Frontend can subscribe to this channel to update UI state.
                 */
                RED.comms.publish(`async-api-red/payload-update/${node.id}`, {
                    payload: node.payload,
                    parameters: node.parameters
                });

                // Signal message processing is complete
                done();

            } catch (err) {
                /**
                 * Notify the editor UI about validation/runtime error
                 * Frontend can display it near node configuration UI.
                 */
                RED.comms.publish(`async-api-red/payload-error/${node.id}`, {
                    error: err.message
                });

                // Log error in Node-RED runtime and stop execution
                node.error(err.message, msg);
            }

        });
    }

    /**
     * Validate node.payload against node.expectedPayload spec.
     *
     * expectedPayload is assumed to be an array of objects like:
     * [{ name: "field", type: "string" }, ...]
     *
     * Behavior:
     * - Only validates when payload is a plain object
     * - Only validates when expectedPayload is an array
     * - Throws Error if required keys are missing or type mismatches are found
     *
     * @param {object} node - Node-RED node instance
     */
    function validatePayload(node) {
        // Only validate plain objects (ignore null, arrays, primitives)
        if (typeof node.payload !== 'object' || Array.isArray(node.payload) || node.payload === null) {
            return;
        }

        // If no expected schema is configured, skip validation
        if (!Array.isArray(node.expectedPayload)) {
            return;
        }

        const expectedPayload = node.expectedPayload || [];

        // Validate required fields and their expected types
        for (const spec of expectedPayload) {
            const value = node.payload[spec.name];

            if (value === undefined) {
                throw new Error(`Missing required key: "${spec.name}"`);
            }

            if (spec.type === "string" && typeof value !== "string") {
                throw new Error(`Key "${spec.name}" must be a string.`);
            }

            if (spec.type === "integer" && typeof value !== "number") {
                throw new Error(`Key "${spec.name}" must be an integer.`);
            }
        }
    }


    /**
     * Expose nodesMap on RED for other modules/debugging
     */
    RED.nodesMap = nodesMap;

    /**
     * Register this module as a Node-RED node type
     * Type name must match the one used in the HTML editor file.
     */
    RED.nodes.registerType("async-api-red", getNode);
};
