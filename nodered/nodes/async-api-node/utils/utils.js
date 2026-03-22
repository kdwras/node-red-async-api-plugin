/**
 * External dependencies
 */
const {Parser: AsyncApiParser} = require("@asyncapi/parser");
const fs = require("fs");
const mqtt = require("mqtt");
const path = require("path");
const mime = require("mime-types");

/**
 * Node-RED module export
 *
 * @param {object} RED - Node-RED runtime object
 */
module.exports = (RED) => {

    /**
     * Parse and validate an AsyncAPI document.
     *
     * @param {string|object} data - AsyncAPI YAML or JSON document
     * @returns {Promise<object|undefined>}
     */
    async function getParsedAsyncApiFile(data) {
        try {
            const parser = new AsyncApiParser();
            const errors = await parser.validate(data);

            if (errors.length) {
                errors.forEach((error, index) => {
                    RED.log.error(`AsyncAPI validation error ${index + 1}: ${error.message}`);
                });
                return;
            }

            return await parser.parse(data);

        } catch (error) {
            RED.log.error(`Error reading or parsing AsyncAPI document: ${error.message}`);
        }
    }

    /**
     * Create MQTT connection once per node.
     *
     * Important:
     * - A node should not create a new MQTT client on every input message
     * - The connection should be reused while the node instance is alive
     *
     * @param {object} node - Node-RED node instance
     */
    function connectToServer(node) {
        if (!node.serverUrl) {
            node.error("MQTT server URL is missing.");
            node.status({fill: "red", shape: "ring", text: "Missing MQTT server"});
            return;
        }

        /**
         * Reuse the existing client if it is already created and alive.
         * This avoids duplicate connections/listeners after multiple inputs.
         */
        if (node.mqttClient && !node.mqttClient.disconnected) {
            return;
        }

        node.status({fill: "yellow", shape: "ring", text: "Connecting..."});

        const options = {
            connectTimeout: 5000,
            reconnectPeriod: 2000
        };

        node.mqttClient = mqtt.connect(node.serverUrl, options);

        /**
         * Runtime flags used to avoid duplicate listeners/subscriptions.
         */
        node.subscribed = false;
        node.subscribedTopic = null;
        node.messageHandlerAttached = false;

        node.mqttClient.on("connect", function () {
            node.log(`Connected to MQTT Broker: ${node.serverUrl}`);
            node.status({fill: "green", shape: "dot", text: "Connected"});

            /**
             * If the node already knows which topic it should listen to,
             * restore the subscription automatically after reconnect.
             */
            if (node.subscribedTopic) {
                node.mqttClient.subscribe(node.subscribedTopic, {}, (err) => {
                    if (err) {
                        node.error("Failed to resubscribe: " + err.message);
                    } else {
                        node.log("Resubscribed to topic: " + node.subscribedTopic);
                        node.subscribed = true;
                    }
                });
            }
        });

        node.mqttClient.on("error", function (error) {
            node.error("MQTT Connection Error: " + error.message);
            node.status({fill: "red", shape: "dot", text: "Error"});
        });

        node.mqttClient.on("close", function () {
            node.status({fill: "red", shape: "ring", text: "Disconnected"});

            /**
             * The client is closed, so active subscription state is no longer valid.
             * Keep subscribedTopic so reconnect can use it again.
             */
            node.subscribed = false;
            node.messageHandlerAttached = false;
        });
    }

    /**
     * Attach MQTT message listener only once.
     *
     * This is the ONLY place where the node sends output downstream.
     * So every output message truly comes from MQTT.
     *
     * @param {object} node
     */
    function attachMessageListenerIfNeeded(node) {
        if (node.messageHandlerAttached || !node.mqttClient) {
            return;
        }

        node.mqttClient.on("message", (topic, message) => {
            let payload;

            try {
                payload = JSON.parse(message.toString());
            } catch (e) {
                payload = message.toString();
            }

            /**
             * Store last received MQTT message for debugging or fallback behavior.
             */
            node.lastMessage = payload;

            node.log("Message received on " + topic + ": " + JSON.stringify(payload));

            /**
             * Forward ONLY MQTT-received messages to node output.
             */
            node.send({
                payload,
                topic,
                parameters: node.resolvedParameters || {}
            });
        });

        node.messageHandlerAttached = true;
    }

    /**
     * Subscribe only when needed.
     *
     * Behavior:
     * - If already subscribed to the same topic, do nothing
     * - If topic changed, unsubscribe from previous topic and subscribe to the new one
     *
     * @param {object} node
     * @param {string} topic
     */
    function subscribeIfNeeded(node, topic) {
        if (!node.mqttClient) {
            node.warn("Cannot subscribe: MQTT client is not initialized.");
            return;
        }

        if (!topic) {
            node.warn("Cannot subscribe: topic is empty.");
            return;
        }

        /**
         * Already subscribed to the same topic.
         */
        if (node.subscribed && node.subscribedTopic === topic) {
            return;
        }

        /**
         * If there was an old topic, unsubscribe first.
         */
        if (node.subscribedTopic && node.subscribedTopic !== topic) {
            node.mqttClient.unsubscribe(node.subscribedTopic, (err) => {
                if (err) {
                    node.warn(`Failed to unsubscribe from ${node.subscribedTopic}: ${err.message}`);
                }
            });

            node.subscribed = false;
        }

        node.mqttClient.subscribe(topic, {}, (err) => {
            if (err) {
                node.error(`Failed to subscribe to ${topic}: ${err.message}`);
            } else {
                node.log("Subscribed to topic: " + topic);
                node.subscribed = true;
                node.subscribedTopic = topic;
            }
        });
    }

    /**
     * Resolve AsyncAPI topic parameters inside channel topics.
     *
     * Example:
     * topic template: "devices/{deviceId}/status"
     * parameters: { deviceId: "lamp1" }
     * resolved topic: "devices/lamp1/status"
     *
     * Priority:
     * 1. msg.parameters[name]
     * 2. node.resolvedParameters[name]
     * 3. node.parameterValues[name]
     * 4. parameter default value from schema
     *
     * @param {object} node
     * @returns {string}
     */
    function resolveTopic(node) {
        let topic = node.topic || "";

        const msg = node.msg || {};
        const msgParameters = msg.parameters || {};
        const resolvedParameters = node.resolvedParameters || {};
        const nodeParameterValues = node.parameterValues || {};

        for (const param of Array.isArray(node.parameters) ? node.parameters : []) {
            const name = param.id || param.name;

            const value =
                msgParameters[name] ??
                resolvedParameters[name] ??
                nodeParameterValues[name] ??
                param.value;

            if (value === undefined || value === null || value === "") {
                throw new Error(`Cannot resolve topic parameter "${name}"`);
            }

            topic = topic.replaceAll(`{${name}}`, String(value));
        }

        return topic;
    }

    /**
     * Handle MQTT send/receive behavior.
     *
     * Flow:
     * 1. Resolve final topic
     * 2. Attach MQTT message listener
     * 3. Subscribe to topic
     * 4. If operation is "receive", wait for messages only
     * 5. If operation is "send", publish the resolved payload
     *
     * IMPORTANT:
     * - Output is NOT sent after publish
     * - Output happens only when MQTT emits a real "message" event
     *
     * @param {object} node - Node-RED node instance
     */
    function handleMessage(node) {
        if (!node.mqttClient) {
            node.warn("MQTT client is not initialized.");
            return;
        }

        const resolvedTopic = resolveTopic(node);

        if (!resolvedTopic) {
            node.warn("Resolved topic is empty.");
            return;
        }

        /**
         * Ensure the node can actually receive MQTT messages.
         */
        attachMessageListenerIfNeeded(node);

        /**
         * Subscribe first, so any returned MQTT message can be captured.
         */
        subscribeIfNeeded(node, resolvedTopic);

        /**
         * Receive-only operation:
         * do not publish anything, just wait for MQTT traffic.
         */
        if (node.operation?.action === "receive") {
            return;
        }

        /**
         * Send operation:
         * publish the resolved payload.
         *
         * Priority:
         * 1. payload resolved from msg.payload
         * 2. saved payload from editor
         * 3. last received MQTT payload
         */
        if (node.operation?.action === "send") {
            const toPublish = node.payload ?? node.savedPayload ?? node.lastMessage;

            if (toPublish === undefined || toPublish === null) {
                node.warn("Nothing to publish.");
                return;
            }

            node.mqttClient.publish(
                resolvedTopic,
                JSON.stringify(toPublish),
                {},
                (err) => {
                    if (err) {
                        node.error("Failed to publish: " + err.message);
                    } else {
                        /**
                         * Important:
                         * We do NOT call node.send() here.
                         * The message must go through MQTT first and then return
                         * from the broker in order to appear at the node output.
                         */
                        node.log("Message published to " + resolvedTopic + ": " + JSON.stringify(toPublish));
                    }
                }
            );
        }
    }

    /**
     * Fetch uploaded AsyncAPI file for a specific node.
     *
     * @param {string} uri - Directory path
     * @returns {Promise<{fileContent: string, fileName: string, fileType: string | false}>}
     */
    function fetchFile(uri) {
        return new Promise((resolve, reject) => {
            fs.readdir(uri, (err, files) => {
                if (err || files.length === 0) {
                    reject(new Error("No saved file found"));
                    return;
                }

                const latestFile = files[0];
                const filePath = path.join(uri, latestFile);
                const fileType = mime.lookup(latestFile);

                fs.readFile(filePath, "utf8", (err, data) => {
                    if (err) {
                        reject(new Error("Could not read file"));
                        return;
                    }

                    resolve({
                        fileContent: data,
                        fileName: latestFile,
                        fileType: fileType
                    });
                });
            });
        });
    }

    /**
     * Build upload directory path for a node.
     *
     * @param {string} nodeId - Node-RED node id
     * @returns {string}
     */
    function getFilePath(nodeId) {
        const userDir = RED.settings.userDir;
        const projects = RED.settings.get("projects");

        const basePath = projects?.activeProject
            ? path.join(userDir, "projects", projects.activeProject, "uploads")
            : path.join(userDir, "uploads");

        return path.join(basePath, nodeId);
    }

    /**
     * Expose utility functions.
     */
    return {
        getParsedAsyncApiFile,
        connectToServer,
        handleMessage,
        fetchFile,
        getFilePath
    };
};