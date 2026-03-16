/**
 * Express router module for AsyncAPI Node-RED integration
 *
 * Exposes REST endpoints for:
 * - uploading AsyncAPI files
 * - parsing AsyncAPI document data
 * - saving/loading user selections
 * - connecting to MQTT
 * - triggering send/receive handling
 */
module.exports = (RED) => {
    const express = require("express");
    const fs = require("fs");

    const Providers = require("../providers/providers")(RED);
    const Utils = require("../utils/utils")(RED);

    const router = express.Router();

    initRoutes();

    /**
     * ------------------------------------------------------------------
     * Helpers
     * ------------------------------------------------------------------
     */

    /**
     * Get live runtime node by id.
     *
     * @param {string} nodeId
     * @returns {object|null}
     */
    function getRuntimeNode(nodeId) {
        return RED.nodes.getNode(nodeId);
    }

    /**
     * Standard 404 response for missing nodes.
     *
     * @param {object} res
     * @returns {object}
     */
    function sendNodeNotFound(res) {
        return res.status(404).json({ error: "Node not found!" });
    }

    /**
     * Convert parsed AsyncAPI document into UI-friendly JSON.
     *
     * @param {object} document
     * @returns {{servers: Array, channels: Array}}
     */
    function extractAsyncApiData(document) {
        const servers = [];
        const channels = [];

        /**
         * Extract servers
         */
        document.servers().forEach((server) => {
            servers.push({
                url: server.url(),
                protocol: server.protocol(),
                description: server.description()
            });
        });

        /**
         * Extract channels, operations, messages and parameters
         */
        document.channels().forEach((channel) => {
            const operations = [];
            const parameters = [];

            channel.operations().forEach((operation) => {
                const messages = [];

                operation.messages().forEach((msg) => {
                    const payload = [];
                    const payloadJson = msg.payload()?.json?.();

                    if (payloadJson?.properties) {
                        Object.entries(payloadJson.properties).forEach(([propName, propSchema]) => {
                            payload.push({
                                name: propName,
                                type: propSchema.type,
                                description: propSchema.description
                            });
                        });
                    }

                    messages.push({
                        name: msg.name(),
                        description: msg.description(),
                        payload,
                        contentType: msg.contentType()
                    });
                });

                operations.push({
                    id: operation.id(),
                    action: operation.action(),
                    summary: operation.summary(),
                    messages
                });
            });

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

        return { servers, channels };
    }

    /**
     * ------------------------------------------------------------------
     * Routes
     * ------------------------------------------------------------------
     */

    /**
     * Parse uploaded AsyncAPI file and return extracted data.
     *
     * @route GET /async-api-red/:nodeId/data
     */
    async function getData(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            const filePath = Utils.getFilePath(nodeId);
            const file = await Utils.fetchFile(filePath);
            const fileContent = file?.fileContent;

            if (!fileContent) {
                return res.status(400).json({ error: "No file content provided" });
            }

            const parsed = await Utils.getParsedAsyncApiFile(fileContent);

            if (!parsed?.document) {
                return res.status(400).json({ error: "Failed to parse AsyncAPI document" });
            }

            const data = extractAsyncApiData(parsed.document);
            return res.json(data);

        } catch (error) {
            return res.status(500).json({ error: error.message || error });
        }
    }

    /**
     * Handle AsyncAPI file upload.
     *
     * @route POST /async-api-red/:nodeId/file
     */
    function uploadFile(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        return res.status(204).send();
    }

    /**
     * Retrieve uploaded AsyncAPI file.
     *
     * @route GET /async-api-red/:nodeId/file
     */
    async function getFile(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        const fileDir = Utils.getFilePath(nodeId);

        if (!fs.existsSync(fileDir)) {
            return res.status(404).json({ error: "No uploaded files found" });
        }

        try {
            const file = await Utils.fetchFile(fileDir);
            return res.json(file);
        } catch (error) {
            return res.status(500).json({ error: error.message || error });
        }
    }

    /**
     * Save user selections from the editor.
     *
     * @route POST /async-api-red/:nodeId/user-selections
     */
    function saveUserSelections(req, res) {
        const { nodeId } = req.params;
        const payload = req.body;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            /**
             * Core AsyncAPI selections
             */
            node.serverUrl = payload.serverUrl;
            node.topic = payload.topic;
            node.operation = payload.operation;

            /**
             * Schema / parameter metadata
             */
            node.expectedPayload = payload.expectedPayload || [];
            node.parameters = payload.parameters || [];

            /**
             * Values entered by the user in the editor
             */
            node.parameterValues = payload.parameterValues || {};
            node.savedPayload = payload.payload || null;

            return res.status(204).send();

        } catch (error) {
            return res.status(500).json({ error: error.message || error });
        }
    }

    /**
     * Return previously saved user selections.
     *
     * @route GET /async-api-red/:nodeId/user-selections
     */
    function getUserSelections(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        return res.status(200).json({
            serverUrl: node.serverUrl || "",
            topic: node.topic || "",
            payload: node.savedPayload || null,
            operation: node.operation || null,
            parameters: node.parameters || [],
            parameterValues: node.parameterValues || {}
        });
    }

    /**
     * Connect runtime node to MQTT broker.
     *
     * @route GET /async-api-red/:nodeId/server-connect
     */
    function connectToServer(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            Utils.connectToServer(node);
            return res.status(204).send();
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    /**
     * Trigger MQTT send/receive handling.
     *
     * @route POST /async-api-red/:nodeId/message
     */
    function handleMessage(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            Utils.handleMessage(node);
            return res.status(200).json({ message: "Message handling initialized successfully" });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    /**
     * Register all routes.
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