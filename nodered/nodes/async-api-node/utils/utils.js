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
     * @param {object} node - Node-RED node instance
     */
    function connectToServer(node) {
        if (!node.serverUrl) {
            node.error("MQTT Server URL or Topic is missing!");
            node.status({ fill: "red", shape: "ring", text: "Missing MQTT Config" });
            return;
        }

        if (node.mqttClient && !node.mqttClient.disconnected) {
            return;
        }

        node.status({ fill: "yellow", shape: "ring", text: "Connecting..." });

        const options = {
            connectTimeout: 5000,
            reconnectPeriod: 2000
        };

        node.mqttClient = mqtt.connect(node.serverUrl, options);
        node.subscribed = false;

        node.mqttClient.on("connect", function () {
            node.log(`Connected to MQTT Broker: ${node.serverUrl}`);
            node.status({ fill: "green", shape: "dot", text: "Connected" });

            if (node.operation?.action === "receive" && node.topic && !node.subscribed) {
                node.mqttClient.subscribe(node.topic, {}, (err) => {
                    if (err) {
                        node.error("Failed to subscribe: " + err.message);
                    } else {
                        node.log("Subscribed to topic: " + node.topic);
                        node.subscribed = true;
                    }
                });
            }
        });

        node.mqttClient.on("error", function (error) {
            node.error("MQTT Connection Error: " + error.message);
            node.status({ fill: "red", shape: "dot", text: "Error" });
        });

        node.mqttClient.on("close", function () {
            node.status({ fill: "red", shape: "ring", text: "Disconnected" });
            node.subscribed = false;
        });

        node.mqttClient.on("message", (topic, message) => {
            let payload;
            try {
                payload = JSON.parse(message.toString());
            } catch (e) {
                payload = message.toString();
            }

            node.lastMessage = payload;
            node.log("Message received on " + topic + ": " + JSON.stringify(payload));
            node.send({ payload });
        });
    }

    /**
     * Handle MQTT send/receive behavior.
     *
     * @param {object} node - Node-RED node instance
     */
    function handleMessage(node) {
        if (!node.mqttClient) {
            return;
        }

        const subscribeIfNeeded = () => {
            if (!node.subscribed && node.topic) {
                node.mqttClient.subscribe(node.topic, {}, (err) => {
                    if (err) {
                        node.error("Failed to subscribe: " + err.message);
                    } else {
                        node.log("Subscribed to topic: " + node.topic);
                        node.subscribed = true;
                    }
                });
            }
        };

        if (node.operation?.action === "receive") {
            subscribeIfNeeded();
        }

        if (node.operation?.action === "send") {
            const toPublish = node.payload || node.lastMessage;

            if (!toPublish) {
                node.warn("Nothing to publish (no payload or last message available).");
                return;
            }

            node.mqttClient.publish(
                node.topic,
                JSON.stringify(toPublish),
                {},
                (err) => {
                    if (err) {
                        node.error("Failed to publish: " + err.message);
                    } else {
                        node.log("Message published to " + node.topic + ": " + JSON.stringify(toPublish));
                        node.send({ payload: toPublish });
                    }
                }
            );
        }
    }


    /**
     * Attach MQTT message listener only once.
     *
     * @param {object} node
     */
    function attachMessageListenerIfNeeded(node) {
        if (node.messageHandlerAttached) {
            return;
        }

        node.mqttClient.on("message", (topic, message) => {
            let payload;

            try {
                payload = JSON.parse(message.toString());
            } catch (e) {
                payload = message.toString();
            }

            node.lastMessage = payload;

            node.send({
                payload,
                topic
            });
        });

        node.messageHandlerAttached = true;
    }

    /**
     * Resolve AsyncAPI channel topic parameters.
     *
     * Priority:
     * 1. msg.parameters[name]
     * 2. node.parameterValues[name]
     * 3. param.value
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
     * Fetch uploaded AsyncAPI file for a node.
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
                        fileType
                    });
                });
            });
        });
    }

    /**
     * Build upload directory path for a Node-RED node.
     *
     * @param {string} nodeId
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
     * Public API
     */
    return {
        getParsedAsyncApiFile,
        connectToServer,
        handleMessage,
        fetchFile,
        getFilePath
    };
};