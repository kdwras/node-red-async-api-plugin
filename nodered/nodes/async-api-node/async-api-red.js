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
            node.payload = msg.payload;

            Utils.connectToServer(node);
            Utils.handleMessage(node); // stores lastMsg

            // event to send the message every time arrives to node red ui editor
            RED.comms.publish(`async-api-red/payload-update/${node.id}`, {
                payload: node.payload
            });

            // Send the last message received from the MQTT server
            if (node.messageReceivedFromSrv) {
                send({ payload: JSON.parse(node.messageReceivedFromSrv) });
            } else {
                node.warn("No message has been received yet.");
            }

            done();
        });
    }

    RED.nodesMap = nodesMap;

    RED.nodes.registerType("async-api-red", getNode);
};
