/**
 * External dependencies
 */
const { Parser: Utils } = require('@asyncapi/parser');
const fs = require('fs');
const mqtt = require("mqtt");
const path = require("path");
const mime = require("mime-types");

/**
 * Node-RED module export
 * @param {object} RED - Node-RED runtime object
 */
module.exports = (RED) => {

    /**
     * Parse and validate an AsyncAPI document
     *
     * @param {string|object} data - AsyncAPI document (YAML or JSON)
     * @returns {Promise<object|undefined>} Parsed AsyncAPI document or undefined on error
     */
    async function getParsedAsyncApiFile(data) {
        try {
            const parser = new Utils();

            // Validate AsyncAPI document
            const errors = await parser.validate(data);

            if (errors.length) {
                console.error('❌ Validation errors found:');
                errors.forEach((error, index) => {
                    console.error(`${index + 1}. ${error.message}`);
                });
                return;
            }

            // Parse AsyncAPI document
            const ret = await parser.parse(data);

            console.log('✅ AsyncAPI document is valid!');
            return ret;

        } catch (error) {
            console.error('Error reading or parsing the file:', error);
        }
    }

    /**
     * Connect to an MQTT broker and update Node-RED node status
     *
     * @param {object} node - Node-RED node instance
     */
    function connectToServer(node) {
        // Validate required MQTT configuration
        if (!node.serverUrl) {
            node.error("MQTT Server URL or Topic is missing!");
            node.status({ fill: "red", shape: "ring", text: "Missing MQTT Config" });
            return;
        }

        // Update node status to connecting
        node.status({ fill: "yellow", shape: "ring", text: "Connecting..." });

        // MQTT connection options
        const options = {
            connectTimeout: 5000,
            reconnectPeriod: 2000
        };

        // Create MQTT client
        node.mqttClient = mqtt.connect(node.serverUrl, options);

        // Successful connection handler
        node.mqttClient.on("connect", function () {
            node.log(`Connected to MQTT Broker: ${node.serverUrl}`);
            node.status({ fill: "green", shape: "dot", text: "Connected" });
        });

        // Error handler
        node.mqttClient.on("error", function (error) {
            node.error("MQTT Connection Error: " + error.message);
            node.status({ fill: "red", shape: "dot", text: "Error" });
        });

        // Disconnection handler
        node.mqttClient.on("close", function () {
            node.status({ fill: "red", shape: "ring", text: "Disconnected" });
        });
    }

    /**
     * Handle MQTT send/receive logic based on AsyncAPI operation
     *
     * @param {object} node - Node-RED node instance
     */
    function handleMessage(node) {
        if (!node.mqttClient) {
            return;
        }

        /**
         * Subscribe to topic only once
         */
        const subscribeIfNeeded = () => {
            if (!node.subscribed) {
                const resolvedTopic = resolveTopic(node);
                node.mqttClient.subscribe(resolvedTopic, {}, (err) => {
                    if (err) {
                        node.error("Failed to subscribe: " + err.message);
                    } else {
                        node.log("Subscribed to topic: " + node.topic);
                        node.subscribed = true;
                    }
                });

                // Message listener
                node.mqttClient.on("message", (topic, message) => {
                    let payload;

                    // Try to parse JSON payload, fallback to string
                    try {
                        payload = JSON.parse(message.toString());
                    } catch (e) {
                        payload = message.toString();
                    }

                    // Store last received message
                    node.lastMessage = payload;

                    node.log("Message received on " + topic + ": " + JSON.stringify(payload));
                    node.send({ payload });
                });
            }
        };

        // Receive operation: subscribe and listen
        if (node.operation?.action === 'receive') {
            subscribeIfNeeded();
        }

        // Send operation: publish payload
        if (node.operation?.action === 'send') {
            subscribeIfNeeded(); // ensure connection is ready

            const toPublish = node.payload || node.lastMessage;

            if (!toPublish) {
                node.warn("Nothing to publish (no payload or last message available).");
                return;
            }

            const resolvedTopic = resolveTopic(node);

            node.mqttClient.publish(
                resolvedTopic,
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
     * Resolves topic parameters defined in the AsyncAPI channel address.
     *
     * Priority:
     *   1. value set in node dialog (node.parameterValues)
     *   2. msg.<parameter>
     *   3. msg.payload.<parameter>
     *
     * Example:
     *   topic template: home/{homeId}/ac/state
     *   dialog value:   homeId = 1
     *   result:         home/1/ac/state
     */
    function resolveTopic(node) {

        // Topic template from AsyncAPI
        let topic = node.topic || "";

        // If no parameters are defined, return topic unchanged
        if (!Array.isArray(node.parameters) || node.parameters.length === 0) {
            return topic;
        }


        // Parameter values configured in the editor dialog
        const dialogValues = node.parameters;

        // Resolve each AsyncAPI channel parameter
        for (const param of node.parameters) {

            const name = param.id || param.name;

            // Priority:
            // 1. dialog parameter
            // 2. msg.<parameter>
            const value = dialogValues[name];

            // If still missing, topic cannot be resolved
            if (value === undefined || value === null || value === "") {
                throw new Error(`Cannot resolve topic parameter "${name}"`);
            }

            // Replace placeholder in topic
            topic = topic.replace(
                new RegExp(`\\{${name}\\}`, "g"),
                String(value)
            );
        }

        return topic;
    }
    /**
     * Fetch the most recently uploaded file for a node
     *
     * @param {string} uri - Directory path
     * @returns {Promise<{fileContent: string, fileName: string, fileType: string}>}
     */
    function fetchFile(uri) {
        return new Promise((resolve, reject) => {
            fs.readdir(uri, (err, files) => {
                if (err || files.length === 0) {
                    reject(new Error("No saved file found"));
                    return;
                }

                // Take the first file (assumed latest)
                const latestFile = files[0];
                const filePath = path.join(uri, latestFile);
                const fileType = mime.lookup(latestFile);

                fs.readFile(filePath, "utf8", (err, data) => {
                    if (err) {
                        reject(new Error('Could not read file'));
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
     * Build upload directory path for a Node-RED node
     *
     * @param {string} nodeId - Node ID
     * @returns {string} Absolute file path
     */
    function getFilePath(nodeId) {
        const userDir = RED.settings.userDir;
        const projects = RED.settings.get("projects");

        // Determine project-aware upload directory
        const basePath = projects?.activeProject
            ? path.join(userDir, "projects", projects.activeProject, "uploads")
            : path.join(userDir, "uploads");

        return path.join(basePath, nodeId);
    }

    /**
     * Expose module functions
     */
    return {
        getParsedAsyncApiFile,
        connectToServer,
        handleMessage,
        fetchFile,
        getFilePath
    };
};
