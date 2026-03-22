/**
 * =====================================================================
 * Express Router for AsyncAPI Node-RED Integration
 * =====================================================================
 *
 * This router acts as the bridge between:
 * - the Node-RED editor UI (async-api-red.html)
 * - the runtime node instance (async-api-red.js)
 * - utility logic (utils.js)
 *
 * Responsibilities:
 * - upload and retrieve AsyncAPI files
 * - parse AsyncAPI document data for the editor UI
 * - save and load user selections
 * - trigger MQTT connection
 * - trigger MQTT send/receive initialization
 */
module.exports = (RED) => {
    const express = require("express");
    const fs = require("fs");

    const Providers = require("../providers/providers")(RED);
    const fileUtils = require("../utils/file-utils")(RED);
    const asyncapiService = require("../services/asyncapi-service")();
    const nodeConfigService = require("../services/node-config-service")();
    const mqttService = require("../services/mqtt-service")(RED);

    const router = express.Router();

    /**
     * Register all HTTP routes immediately.
     */
    initRoutes();

    /**
     * =================================================================
     * Helpers
     * =================================================================
     */

    /**
     * Return the live runtime node instance by id.
     *
     * The editor communicates with the backend using nodeId.
     * From that id, we retrieve the actual in-memory runtime node.
     *
     * @param {string} nodeId
     * @returns {object|null}
     */
    function getRuntimeNode(nodeId) {
        return RED.nodesMap?.[nodeId] || null;
    }

    /**
     * Send a standard "node not found" response.
     *
     * This happens when:
     * - the node has not been deployed yet
     * - the node was removed
     * - the runtime instance no longer exists
     *
     * @param {object} res
     * @returns {object}
     */
    function sendNodeNotFound(res) {
        return res.status(404).json({
            error: "Node not found!"
        });
    }

    /**
     * Convert a parsed AsyncAPI document into a simpler JSON structure
     * that is easier for the editor UI to consume.
     *
     * Extracted data:
     * - servers
     * - channels
     * - operations
     * - messages
     * - payload fields
     * - channel parameters
     *
     * @param {object} document - Parsed AsyncAPI document
     * @returns {{servers: Array, channels: Array}}
     */
    function extractAsyncApiData(document) {
        const servers = [];
        const channels = [];

        /**
         * -------------------------------------------------------------
         * Extract servers
         * -------------------------------------------------------------
         */
        document.servers().forEach((server) => {
            servers.push({
                url: server.url(),
                protocol: server.protocol(),
                description: server.description()
            });
        });

        /**
         * -------------------------------------------------------------
         * Extract channels, parameters, operations, and message schemas
         * -------------------------------------------------------------
         */
        document.channels().forEach((channel) => {
            const operations = [];
            const parameters = [];

            /**
             * Extract operations for this channel.
             */
            channel.operations().forEach((operation) => {
                const messages = [];

                /**
                 * Extract messages and their payload schemas.
                 */
                operation.messages().forEach((msg) => {
                    const payload = [];
                    const payloadJson = msg.payload()?.json?.();

                    /**
                     * Determine which payload fields are required.
                     */
                    const requiredFields = Array.isArray(payloadJson?.required)
                        ? payloadJson.required
                        : [];

                    /**
                     * Extract payload properties as editor-friendly fields.
                     */
                    if (payloadJson?.properties) {
                        Object.entries(payloadJson.properties).forEach(([propName, propSchema]) => {
                            payload.push({
                                name: propName,
                                type: propSchema.type,
                                description: propSchema.description,
                                enum: Array.isArray(propSchema.enum) ? propSchema.enum : undefined,
                                minimum: propSchema.minimum,
                                maximum: propSchema.maximum,
                                items: propSchema.items || undefined,
                                required: requiredFields.includes(propName)
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

            /**
             * Extract channel parameters used for topic placeholders.
             * Example: devices/{deviceId}/status
             */
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
     * =================================================================
     * Route Handlers
     * =================================================================
     */

    /**
     * GET /async-api-red/:nodeId/data
     *
     * Parse the uploaded AsyncAPI file for this node
     * and return extracted servers/channels/operations.
     *
     * Used by the editor to build dropdowns and dynamic forms.
     *
     * @param {object} req
     * @param {object} res
     */
    async function getData(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            const filePath = fileUtils.getFilePath(nodeId);
            const file = await fileUtils.fetchFile(filePath);
            const fileContent = file?.fileContent;

            if (!fileContent) {
                return res.status(400).json({ error: "No file content provided" });
            }

            const parsed = await asyncapiService.parse(fileContent);
            const data = asyncapiService.extract(parsed.document);

            return res.json(data);

        } catch (error) {
            return res.status(500).json({
                error: error.message || error
            });
        }
    }

    /**
     * POST /async-api-red/:nodeId/file
     *
     * Handle file upload for the given node.
     *
     * The actual file storage is handled by the provider middleware.
     * This route only verifies that:
     * - the node exists
     * - a file was uploaded successfully
     *
     * @param {object} req
     * @param {object} res
     */
    function uploadFile(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        if (!req.file) {
            return res.status(400).json({
                error: "No file uploaded"
            });
        }

        return res.status(204).send();
    }

    /**
     * GET /async-api-red/:nodeId/file
     *
     * Return the uploaded AsyncAPI file for the given node.
     *
     * Used when reopening a saved node so the editor can restore
     * the previously uploaded file.
     *
     * @param {object} req
     * @param {object} res
     */
    async function getFile(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        const fileDir = fileUtils.getFilePath(nodeId);

        if (!fs.existsSync(fileDir)) {
            return res.status(404).json({
                error: "No uploaded files found"
            });
        }

        try {
            const file = await fileUtils.fetchFile(fileDir);
            return res.json(file);
        } catch (error) {
            return res.status(500).json({
                error: error.message || error
            });
        }
    }

    /**
     * POST /async-api-red/:nodeId/user-selections
     *
     * Save all editor-side selections into the live runtime node.
     *
     * Saved values include:
     * - selected server URL
     * - selected topic
     * - selected operation
     * - expected payload schema fields
     * - channel parameters
     * - user-entered parameter values
     * - user-entered payload values
     *
     * @param {object} req
     * @param {object} res
     */
    function saveUserSelections(req, res) {
        const { nodeId } = req.params;
        const payload = req.body;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            nodeConfigService.save(node, req.body);
            return res.status(204).send();
        } catch (error) {
            return res.status(500).json({
                error: error.message || error
            });
        }
    }

    /**
     * GET /async-api-red/:nodeId/user-selections
     *
     * Return previously saved node selections.
     *
     * Used when reopening the editor dialog so fields can be prefilled.
     *
     * @param {object} req
     * @param {object} res
     */
    function getUserSelections(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }
        return res.status(200).json(nodeConfigService.load(node));
    }

    /**
     * GET /async-api-red/:nodeId/server-connect
     *
     * Ask the runtime node to establish an MQTT connection.
     *
     * This is usually triggered from the editor after saving configuration,
     * but the runtime node also reconnects on deploy if configuration exists.
     *
     * @param {object} req
     * @param {object} res
     */
    function connectToServer(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            mqttService.connect(node);
            return res.status(204).send();
        } catch (err) {
            return res.status(500).json({
                error: err.message
            });
        }
    }

    /**
     * POST /async-api-red/:nodeId/message
     *
     * Ask the runtime node to initialize MQTT send/receive behavior.
     *
     * Important:
     * - This does not directly send output to Node-RED downstream nodes
     * - It only triggers MQTT publish/subscribe logic
     * - Actual node output happens later only when an MQTT message is received
     *
     * @param {object} req
     * @param {object} res
     */
    function handleMessage(req, res) {
        const { nodeId } = req.params;
        const node = getRuntimeNode(nodeId);

        if (!node) {
            return sendNodeNotFound(res);
        }

        try {
            mqttService.handle(node);
            return res.status(200).json({
                message: "Message handling initialized successfully"
            });

        } catch (err) {
            return res.status(500).json({
                error: err.message
            });
        }
    }

    /**
     * =================================================================
     * Route Registration
     * =================================================================
     * Mount all routes used by the editor UI.
     */
    function initRoutes() {
        /**
         * Parse and return AsyncAPI data for the editor.
         */
        router.get("/async-api-red/:nodeId/data", getData);

        /**
         * Upload AsyncAPI file.
         * The provider middleware handles storage.
         */
        router.post(
            "/async-api-red/:nodeId/file",
            Providers.getFile().single("file"),
            uploadFile
        );

        /**
         * Retrieve previously uploaded AsyncAPI file.
         */
        router.get("/async-api-red/:nodeId/file", getFile);

        /**
         * Save/load user selections.
         */
        router.get("/async-api-red/:nodeId/user-selections", getUserSelections);
        router.post("/async-api-red/:nodeId/user-selections", saveUserSelections);

        /**
         * Connect runtime node to MQTT broker.
         */
        router.get("/async-api-red/:nodeId/server-connect", connectToServer);

        /**
         * Trigger MQTT message handling logic.
         */
        router.post("/async-api-red/:nodeId/message", handleMessage);
    }

    return router;
};