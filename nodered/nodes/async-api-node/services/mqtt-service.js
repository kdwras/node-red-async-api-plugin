/**
 * MQTT Service
 *
 * Responsibilities:
 * - Connect to broker
 * - Subscribe to topic
 * - Publish messages
 * - Forward MQTT messages to node output
 */
const mqtt = require("mqtt");

module.exports = (RED) => {

    /**
     * Connect to MQTT broker
     */
    function connect(node) {
        if (!node.serverUrl) {
            return;
        }

        if (node.mqttClient) {
            return;
        }

        node.mqttClient = mqtt.connect(node.serverUrl);

        node.isConnected = false;
        node.subscribedTopic = null;
        node.listenerAttached = false;


        node.mqttClient.on("connect", function () {
            node.isConnected = true;

            node.status({
                fill: "green",
                shape: "dot",
                text: "connected"
            });

        });

        node.mqttClient.on("close", function () {
            node.isConnected = false;

            node.status({
                fill: "red",
                shape: "ring",
                text: "disconnected"
            });

        });

        node.mqttClient.on("error", function (err) {
            node.error(err.message);
        });
    }

    /**
     * Attach MQTT message listener
     */
    function attachListener(node) {
        if (node.listenerAttached) {
            return;
        }

        node.mqttClient.on("message", function (topic, message) {
            let payload;

            try {
                payload = JSON.parse(message.toString());
            } catch (e) {
                payload = message.toString();
            }

            node.send({
                payload: payload,
                topic: topic,
                parameters: node.resolvedParameters
            });
        });

        node.listenerAttached = true;
    }

    /**
     * Resolve topic parameters
     */
    function resolveTopic(node) {
        let topic = node.topic || "";

        if (node.resolvedParameters && typeof node.resolvedParameters === "object") {
            Object.entries(node.resolvedParameters).forEach(function ([key, value]) {
                topic = topic.replace(`{${key}}`, value);
            });
        }

        return topic;
    }

    /**
     * Handle MQTT logic (subscribe + publish)
     */
    function handle(node) {
        if (!node.mqttClient) {
            return;
        }

        const topic = resolveTopic(node);

        attachListener(node);

        /**
         * Subscribe to topic
         */
        if (node.subscribedTopic !== topic) {
            node.mqttClient.subscribe(topic);
            node.subscribedTopic = topic;
        }

        /**
         * Publish if operation is send
         */
        if (node.operation && node.operation.action === "send") {

            let payload = null;

            if (node.payload !== undefined && node.payload !== null) {
                payload = node.payload;
            } else if (node.savedPayload !== undefined && node.savedPayload !== null) {
                payload = node.savedPayload;
            }

            if (payload !== null) {
                node.mqttClient.publish(topic, JSON.stringify(payload));
            }
        }
    }

    return {
        connect: connect,
        handle: handle
    };
};