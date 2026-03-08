/**
 * Express router module for AsyncAPI Node-RED integration
 *
 * Exposes REST endpoints for:
 * - Uploading AsyncAPI files
 * - Parsing and extracting servers/channels
 * - Persisting user selections
 * - Managing MQTT connections and messages
 */
module.exports = (RED) => {

    /**
     * Dependencies
     */
    const express = require("express");
    const fs = require("fs");

    // Provider and utility helpers bound to Node-RED runtime
    const Providers = require("../providers/providers")(RED);
    const Utils = require("../utils/utils")(RED);

    const router = express.Router();

    // Initialize all REST routes
    initRoutes();

    /**
     * Parse uploaded AsyncAPI file and return structured data
     *
     * @route GET /async-api-red/:nodeId/data
     * @param {object} req
     * @param {object} res
     */
    async function getData(req, res) {

        const { nodeId } = req.params;
        const node = RED.nodes.getNode(nodeId);

        // Validate Node-RED node existence
        if (!node) {
            return res.status(404).json({ error: "Node not found!" });
        }

        try {
            // Load uploaded AsyncAPI file
            const filePath = Utils.getFilePath(nodeId);
            const file = await Utils.fetchFile(filePath);
            const fileContent = file.fileContent;

            if (!fileContent) {
                return res.status(400).json({ error: "No file content provided" });
            }

            // Parse AsyncAPI document
            const data = await Utils.getParsedAsyncApiFile(fileContent);
            const document = data.document;

            /**
             * Extract server definitions
             */
            const servers = [];
            document.servers().forEach((server) => {
                servers.push({
                    url: server.url(),
                    protocol: server.protocol(),
                    description: server.description()
                });
            });

            /**
             * Extract channels, operations, messages, and parameters
             */
            const channels = [];
            document.channels().forEach((channel) => {

                let operations = [];
                let parameters = [];

                // Channel operations (publish / subscribe)
                channel.operations().forEach((operation) => {
                    const action = operation.action();
                    const summary = operation.summary();
                    const id = operation.id();

                    const messages = [];
                    operation.messages().forEach((msg) => {

                        let payload = [];
                        const payloadJson = msg.payload().json();

                        // Extract payload schema properties
                        if (payloadJson?.properties) {
                            Object.entries(payloadJson.properties).forEach(
                                ([propName, propSchema]) => {
                                    payload.push({
                                        name: propName,
                                        type: propSchema.type,
                                        description: propSchema.description
                                    });
                                }
                            );
                        }

                        messages.push({
                            name: msg.name(),
                            description: msg.description(),
                            payload: payload,
                            contentType: msg.contentType()
                        });
                    });

                    operations.push({
                        id,
                        action,
                        summary,
                        messages
                    });
                });

                // Channel parameters
                channel.parameters().forEach((param) => {
                    parameters.push({
                        id: param.id(),
                        description: param.description()
                    });
                });

                channels.push({
                    address: channel.address(),
                    parameters,
                    operations
                });
            });

            res.json({
                servers,
                channels
            });

        } catch (error) {
            res.status(500).json({ error });
        }
    }

    /**
     * Handle AsyncAPI file upload
     *
     * @route POST /async-api-red/:nodeId/file
     */
    function uploadFile(req, res) {

        const { nodeId } = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({ error: "Node not found!" });
        }

        // File presence is handled by multer middleware
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        res.status(204).send();
    }

    /**
     * Retrieve previously uploaded AsyncAPI file metadata/content
     *
     * @route GET /async-api-red/:nodeId/file
     */
    async function getFile(req, res) {

        const { nodeId } = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({ error: "Node not found!" });
        }

        const fileDest = Utils.getFilePath(nodeId);

        if (!fs.existsSync(fileDest)) {
            return res.status(404).json({ error: "No uploaded files found" });
        }

        try {
            const file = await Utils.fetchFile(fileDest);
            res.json(file);
        } catch (error) {
            res.status(500).json({ error });
        }
    }

    /**
     * Persist user selections (server, topic, operation)
     *
     * @route POST /async-api-red/:nodeId/user-selections
     */
    function saveUserSelections(req, res) {

        const { nodeId } = req.params;
        const payload = req.body;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({ error: "Node not found!" });
        }

        try {
            node.serverUrl = payload.serverUrl;
            node.topic = payload.topic;
            node.parameters = payload.parameters;
            node.operation = payload.operation;
            node.expectedPayload = payload.expectedPayload;

            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error });
        }
    }

    /**
     * Retrieve previously saved user selections
     *
     * @route GET /async-api-red/:nodeId/user-selections
     */
    function getUserSelections(req, res) {

        const { nodeId } = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({ error: "Node not found!" });
        }

        res.status(200).json({
            serverUrl: node.serverUrl,
            topic: node.topic,
            payload: node.payload,
            operation: node.operation
        });
    }

    /**
     * Initiate MQTT server connection
     *
     * @route GET /async-api-red/:nodeId/server-connect
     */
    function connectToServer(req, res) {

        const { nodeId } = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({ error: "Node not found" });
        }

        try {
            Utils.connectToServer(node);
            res.status(204).send();
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Handle MQTT publish/subscribe action
     *
     * @route POST /async-api-red/:nodeId/message
     */
    function handleMessage(req, res) {

        const { nodeId } = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({ error: "Node not found" });
        }

        try {
            Utils.handleMessage(node);
            res.status(200).json({ message: "Topic has been successfully created" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Register all Express routes
     */
    function initRoutes() {
        router.get("/async-api-red/:nodeId/data", getData);
        router.post(
            "/async-api-red/:nodeId/file",
            Providers.getFile().single("file"),
            uploadFile
        );
        router.get("/async-api-red/:nodeId/file", getFile);
        router.get("/async-api-red/:nodeId/user-selections", getUserSelections);
        router.post("/async-api-red/:nodeId/user-selections", saveUserSelections);
        router.get("/async-api-red/:nodeId/server-connect", connectToServer);
        router.post("/async-api-red/:nodeId/message", handleMessage);
    }

    return router;
};
