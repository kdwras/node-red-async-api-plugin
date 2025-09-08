const {Parser: Utils} = require('@asyncapi/parser');
const fs = require('fs');
const mqtt = require("mqtt");
const path = require("path");
const mime = require("mime-types");

module.exports = (RED) => {


    /**
     *
     * @param data
     */
    async function getParsedAsyncApiFile(data) {

        // Read the AsyncAPI file

        try {
            const parser = new Utils();

            const errors = await parser.validate(data);

            if (errors.length) {
                console.error('❌ Validation errors found:');
                errors.forEach((error, index) => {
                    console.error(`${index + 1}. ${error.message}`);
                });
                return;
            }

            const ret = await parser.parse(data);

            console.log('✅ AsyncAPI document is valid!');
            //  console.log('Parsed Document:', ret);

            return ret;

        } catch (error) {
            console.error('Error reading or parsing the file:', error);
        }
    }

    /**
     *
     * @param node
     */
    function connectToServer(node) {
        if (!node.serverUrl) {
            node.error("MQTT Server URL or Topic is missing!");
            node.status({fill: "red", shape: "ring", text: "Missing MQTT Config"});
            return;
        }

        node.status({fill: "yellow", shape: "ring", text: "Connecting..."});

        const options = {
            connectTimeout: 5000,
            reconnectPeriod: 2000
        };

        node.mqttClient = mqtt.connect(node.serverUrl, options);

        node.mqttClient.on("connect", function () {
            node.log(`Connected to MQTT Broker: ${node.serverUrl}`);
            node.status({fill: "green", shape: "dot", text: "Connected"});
        });

        node.mqttClient.on("error", function (error) {
            node.error("MQTT Connection Error: " + error.message);
            node.status({fill: "red", shape: "dot", text: "Error"});
        });

        node.mqttClient.on("close", function () {
            node.status({fill: "red", shape: "ring", text: "Disconnected"});
        });
    }


    function handleMessage(node) {
        if (!node.mqttClient) {
            return;
        }

        const subscribeIfNeeded = () => {
            if (!node.subscribed) {
                node.mqttClient.subscribe(node.topic, {}, (err) => {
                    if (err) {
                        node.error("Failed to subscribe: " + err.message);
                    } else {
                        node.log("Subscribed to topic: " + node.topic);
                        node.subscribed = true;
                    }
                });
                // Listen to messages
                node.mqttClient.on("message", (topic, message) => {
                    let payload;
                    try {
                        payload = JSON.parse(message.toString());
                    } catch (e) {
                        payload = message.toString();
                    }
                    node.lastMessage = payload; // save last message
                    node.log("Message received on " + topic + ": " + JSON.stringify(payload));
                    node.send({payload});
                });
            }
        };

        if (node.operation?.action === 'receive') {
            subscribeIfNeeded();
        }

        if (node.operation?.action === 'send') {
            subscribeIfNeeded(); // ensure subscribed before sending

            const toPublish = node.payload || node.lastMessage;
            if (!toPublish) {
                node.warn("Nothing to publish (no payload or last message available).");
                return;
            }

            node.mqttClient.publish(node.topic, JSON.stringify(toPublish), {}, (err) => {
                if (err) {
                    node.error("Failed to publish: " + err.message);
                } else {
                    node.log("Message published to " + node.topic + ": " + JSON.stringify(toPublish));
                    node.send({payload: toPublish});
                }
            });
        }
    }

    /**
     *
     * @param uri
     * @returns {Promise<unknown>}
     */
    function fetchFile(uri) {
        return new Promise((resolve, reject) => {
            fs.readdir(uri, (err, files) => {
                if (err || files.length === 0) {
                    reject(new Error("No saved file found"));
                    return;
                }

                const latestFile = files[0];
                const filePath = path.join(uri, latestFile); // Get the first file
                const fileType = mime.lookup(latestFile); // Get MIME type

                fs.readFile(filePath, "utf8", (err, data) => {
                    if (err) {
                        reject(new Error('Could not read file'));
                        return;
                    }
                    resolve({
                        fileContent: data,
                        fileName: files[0],
                        fileType: fileType
                    });
                });
            });
        });
    }

    /**
     *
     * @param nodeId
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

    return {
        getParsedAsyncApiFile,
        connectToServer,
        handleMessage,
        fetchFile,
        getFilePath
    }
};
