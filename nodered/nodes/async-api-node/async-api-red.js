const express = require("express");

module.exports = function (RED) {

    const router = require("./routes/router")(RED);

    const app = express();

    RED.httpAdmin.use(router);

    const nodesMap = {}; // Store node instances

    function getNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;

        nodesMap[node.id] = node;

        //It’s called just before your node instance is shut down.
        node.on("close", () => {
            console.log(`Close node ${node.id}`);
            delete nodesMap[node.id]; // Cleanup on node deletion
        });

        //This sets up a handler that is called every time a message (msg) arrives into node.
        node.on("input", function (msg, send, done) {
            const Utils = require("./utils/utils")(RED);

            try {
                node.payload = msg.payload;

                validatePayload(node);

                // If validation passes
                Utils.connectToServer(node);
                Utils.handleMessage(node);

                RED.comms.publish(`async-api-red/payload-update/${node.id}`, {
                    payload: node.payload
                });

                if (node.messageReceivedFromSrv !== undefined) {
                    send({payload: JSON.parse(node.messageReceivedFromSrv)});
                } else {
                    node.warn("No message has been received yet.");
                }

                done();

            } catch (err) {
                // ❗ Notify the editor
                RED.comms.publish(`async-api-red/payload-error/${node.id}`, {
                    error: err.message
                });

                // ❌ Stop execution
                node.error(err.message, msg);
            }

        });
    }

    /**
     *
     * @param node
     */
    function validatePayload(node) {
        if (typeof node.payload !== 'object' || Array.isArray(node.payload) || node.payload === null) {
            return;
        }

        if (!Array.isArray(node.expectedPayload)) {
            return;
        }

        const expectedPayload = node.expectedPayload || [];

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

    RED.nodesMap = nodesMap;

    RED.nodes.registerType("async-api-red", getNode);
};
