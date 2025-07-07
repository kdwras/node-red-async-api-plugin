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
            connectTimeout: 5000,  // Wait for 5 seconds before timeout
            reconnectPeriod: 2000  // Try to reconnect every 2 seconds
        };

        // Connect to MQTT broker
        node.mqttClient = mqtt.connect(node.serverUrl, options);

        node.mqttClient.on("connect", function () {
            node.log(`Connected to MQTT Broker: ${node.serverUrl}`);
            node.status({fill: "green", shape: "dot", text: "Connected"});
        });

        node.mqttClient.on("error", function (error) {
            node.error("MQTT Connection Error: " + error.message);
        });

    }

    /**
     *
     * @param node
     */
    function handleMessage(node) {
        if (!node.mqttClient) {
            return;
        }
        //TODo
        console.log(node.operation.action);
        if (node.operation?.action === 'receive') {
            node.mqttClient.subscribe(node.topic, {}, function (err) {
                if (err) {
                    node.error("Failed to create topic" + err.message);
                }
                node.log('Topic created:', node.topic);
            });
        }
        if (node.operation?.action === 'send') {
            node.mqttClient.publish(node.topic, JSON.stringify(node.payload), {}, (err) => {
                if (err) {
                    node.error("Failed to create topic" + err.message);
                } else {
                    node.log('message published!');
                    node.send({payload: node.payload});
                }
            });
        }
    }

    //Todo
    function createMqttTopic() {

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
