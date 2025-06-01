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
            node.payload = msg.payload;

            // Connect to the server
            const Utils = require("./utils/utils")(RED);
            Utils.connectToServer(node);
            Utils.handleMessage(node);
            // Send the message onward
            send(msg);
            // Indicate processing is done (especially important for async work)
            done();
        });
    }

    RED.nodesMap = nodesMap;

    RED.nodes.registerType("async-api-red", getNode);
};
