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
                    console.error(`${index + 1}. ${error.message} (at ${error.location.pointer})`);
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

        //locally srv ----> mqtt://172.17.0.1:1883
        node.serverUrl = node.context().get("serverUrl");
        node.topic = node.context().get("topic");

        if (!node.serverUrl || !node.topic) {
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
        fetchFile,
        getFilePath
    }
};
