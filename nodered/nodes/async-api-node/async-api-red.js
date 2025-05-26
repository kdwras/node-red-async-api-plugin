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

        node.on("close", () => {
            console.log(`Close node ${node.id}`);
            delete nodesMap[node.id]; // Cleanup on node deletion
        });

        node.on("input", function (msg, send, done) {
            node.context().set("payload", msg.payload);

            // Connect to the server
            const Utils = require("./utils/utils")(RED);  // Make sure this path is correct
            Utils.connectToServer(node);

            Utils.handleMessage(node);

            done();
        });
    }

    RED.nodesMap = nodesMap;

    RED.nodes.registerType("async-api-red", getNode);
};
