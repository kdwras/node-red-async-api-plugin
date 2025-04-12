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
            delete nodesMap[node.id]; // Cleanup on node deletion
        });
    }

    RED.nodesMap = nodesMap;

    RED.nodes.registerType("async-api-red", getNode);
};
