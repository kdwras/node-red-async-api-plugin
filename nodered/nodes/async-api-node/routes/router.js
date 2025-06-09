module.exports = (RED) => {

    const express = require("express");
    const fs = require("fs");
    const Providers = require("../providers/providers")(RED);
    const Utils = require("../utils/utils")(RED);

    const router = express.Router();

    initRoutes();

    /**
     *
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    async function getData(req, res) {

        const {nodeId} = req.params;

        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({error: "Node not found!"});
        }

        try {
            const filePath = Utils.getFilePath(nodeId);
            const file = await Utils.fetchFile(filePath);
            const fileContent = file.fileContent;

            if (!fileContent) {
                return res.status(400).json({error: "No file content provided"});
            }

            const data = await Utils.getParsedAsyncApiFile(fileContent);
            const document = data.document;

            const servers = [];
            document.servers().forEach((server, name) => {
                servers.push({
                    url: server.url(),
                    protocol: server.protocol(),
                    description: server.description()
                });
            });

            const channels = [];
            document.channels().forEach((channel, name) => {
                let operations = [];
                let parameters = [];
                channel.operations().forEach((operation) => {
                    const action = operation.action(); // "publish" or "subscribe"
                    const summary = operation.summary();
                    const id = operation.id();
                    const messages = [];
                    operation.messages().forEach((msg) => {
                        let payload = [];
                        const payloadJson = msg.payload().json();
                        if (payloadJson?.properties) {
                            Object.entries(payloadJson.properties).forEach(([propName, propSchema]) => {
                                payload.push({
                                    type: propSchema.type,
                                    description: propSchema.description,
                                    name: propName
                                });
                            });
                        }
                        messages.push({
                            name: msg.name(),
                            description: msg.description(),
                            payload: payload,
                            contentType: msg.contentType(),
                        });
                    });
                    operations.push({
                        id,
                        action,
                        summary,
                        messages
                    });
                });
                channel.parameters().forEach((param) => {
                    parameters.push({id: param.id(), description: param.description()});
                });
                channels.push({
                    address: channel.address(),
                    parameters: parameters,
                    operations: operations
                });
            });

            res.json({
                servers: servers,
                channels: channels
            });
        } catch (error) {
            res.status(500).json({error: error});
        }
    }

    /**
     *
     * @param req
     * @param res
     * @returns {*}
     */
    function uploadFile(req, res) {
        const {nodeId} = req.params;

        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({error: "Node not found!"});
        }
        // Check if file exists in request (handled by multer)
        if (!req.file) {
            return res.status(400).json({error: "No file uploaded"});
        }
        res.json(204).send();
    }

    /**
     *
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    async function getFile(req, res) {

        const {nodeId} = req.params;

        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({error: "Node not found!"});
        }

        const fileDest = Utils.getFilePath(nodeId);

        if (!fs.existsSync(fileDest)) {
            return res.status(404).json({error: "No uploaded files found"});
        }

        try {
            const file = await Utils.fetchFile(fileDest);
            res.json(file);
        } catch (error) {
            res.status(500).json({error: error});
        }

    }

    /**
     *
     * @param req
     * @param res
     */
    function saveUserSelections(req, res) {
        const {nodeId} = req.params;
        const payload = req.body;
        const node = RED.nodes.getNode(nodeId);
        if (!node) {
            res.status(404).json({error: "Node not found!"});
        }
        try {
            node.serverUrl = payload.serverUrl;
            node.topic = payload.topic;
            node.action = payload.action;
            node.expectedPayload = payload.expectedPayload;
            res.status(204).send();
        } catch (error) {
            res.status(500).json({error: error});
        }
    }

    /**
     *
     * @param req
     * @param res
     */
    function getUserSelections(req, res) {
        const {nodeId} = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({error: "Node not found!"});
        }
        const serverUrl = node.serverUrl;
        const topic = node.topic;
        const payload = node.payload;
        const action = node.action;
        res.status(200).json({serverUrl: serverUrl, topic: topic, payload: payload, action: action});
    }

    /**
     *
     * @param req
     * @param res
     * @returns {*}
     */
    function connectToServer(req, res) {
        const {nodeId} = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({error: "Node not found"});
        }

        try {
            Utils.connectToServer(node);
            res.status(204).send();
        } catch (err) {
            res.status(500).json({error: err.message});
        }
    }

    /**
     *
     * @param req
     * @param res
     * @returns {*}
     */
    function handleMessage(req, res) {
        const {nodeId} = req.params;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            return res.status(404).json({error: "Node not found"});
        }

        try {
            Utils.handleMessage(node);
            res.status(200).json({message: `Topic: has successfully created`});
        } catch (err) {
            res.status(500).json({error: err.message});
        }
    }

    /**
     *
     */
    function initRoutes() {
        // Assign handlers to routes
        router.get("/async-api-red/:nodeId/data", getData);
        router.post("/async-api-red/:nodeId/file", Providers.getFile().single("file"), uploadFile);
        router.get("/async-api-red/:nodeId/file", getFile);
        router.get("/async-api-red/:nodeId/user-selections", getUserSelections);
        router.post("/async-api-red/:nodeId/user-selections", saveUserSelections);
        router.get("/async-api-red/:nodeId/server-connect", connectToServer);
        router.post("/async-api-red/:nodeId/message", handleMessage);
    }

    return router;

}
