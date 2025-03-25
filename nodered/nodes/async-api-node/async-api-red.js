const express = require("express");
const mqtt = require("mqtt");

module.exports = function (RED) {

    const router = require("./routes/router")(RED);

    const app = express();

    RED.httpAdmin.use(router);

    const nodesMap = {}; // Store node instances

    function getNode(config) {
        RED.nodes.createNode(this, config);

        console.log(`config --> ${config}`);

        const node = this;

        nodesMap[node.id] = node;
        //mqtt://172.17.0.1:1883
        node.serverUrl = 'mqtt://172.17.0.1:1883';
        node.topic = 'home/sensor';

        console.log(config);
        if (!node.serverUrl || !node.topic) {
            node.error("MQTT Server URL or Topic is missing!");
            node.status({fill: "red", shape: "ring", text: "Missing MQTT Config"});
            return;
        }
        connectToServer(node);

        // Store node reference using its ID

        node.on("close", () => {
            delete nodesMap[node.id]; // Cleanup on node deletion
        });
    }

    function connectToServer(node) {

        node.status({fill: "yellow", shape: "ring", text: "Connecting..."});

        const options = {
            connectTimeout: 5000,  // Wait for 5 seconds before timeout
            reconnectPeriod: 2000  // Try to reconnect every 2 seconds
        };

        // Connect to MQTT broker
        const client = mqtt.connect(node.serverUrl, options);

        client.on("connect", function () {

            node.log("Connected to MQTT Broker: " + node.serverUrl);
            node.status({fill: "green", shape: "dot", text: "Connected"});

            client.subscribe(node.topic, function (err) {
                if (!err) {
                    node.log(`Subscribed to topic: ${node.topic}`);
                } else {
                    node.error("Subscription error: " + err.message);
                }
            });

        });

        client.on("message", function (topic, message) {
            node.log(`Received message on ${topic}: ${message.toString()}`);
            node.send({payload: message.toString(), topic: topic});
        });

        client.on("error", function (error) {
            node.error("MQTT Connection Error: " + error.message);
        });

    }

    RED.nodesMap = nodesMap;

    RED.nodes.registerType("async-api-red", getNode);
};
