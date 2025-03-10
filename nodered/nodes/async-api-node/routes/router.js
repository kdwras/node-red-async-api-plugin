const express = require("express");
const fs = require("fs");
const path = require('path');
const multer = require("multer");
const getParsedAsyncApiFile = require("../async-api-parser/async-api-parser");
const mime = require("mime-types");

module.exports = (RED) => {

    const router = express.Router();

    initRoutes();

    async function getServers(req, res) {

        const {nodeId} = req.params;

        try {
            const filePath = getFilePath(nodeId);
            const file = await fetchFile(filePath);
            const fileContent = file.fileContent;

            if (!fileContent) {
                return res.status(400).json({error: "No file content provided"});
            }

            const data = await getParsedAsyncApiFile(fileContent);
            const document = data.document;

            const servers = {};
            document.servers().forEach((server, name) => {
                servers[name] = {
                    url: server.url(),
                    protocol: server.protocol(),
                    description: server.description()
                };
            });

            res.json({servers});
        } catch (error) {
            res.status(500).json({error: error});
        }
    }

    async function getChannels(req, res) {

        const {nodeId} = req.params;

        try {
            const filePath = getFilePath(nodeId);
            const file = await fetchFile(filePath);
            const fileContent = file.fileContent;


            if (!fileContent) {
                return res.status(400).json({error: "No file content provided"});
            }

            const data = await getParsedAsyncApiFile(fileContent);
            const document = data.document;

            const channels = {};
            document.channels().forEach((channel, name) => {
                channels[name] = {
                    address: channel.address()
                }
            });

            res.json({channels});
        } catch (error) {
            res.status(500).json({error: error});
        }
    }

    function uploadFile(req, res) {
        // Check if file exists in request (handled by multer)
        if (!req.file) {
            return res.status(400).json({error: "No file uploaded"});
        }
        res.json(204);
    }

    async function getFile(req, res) {

        const {nodeId} = req.params;

        const fileDest = getFilePath(nodeId);

        if (!fs.existsSync(fileDest)) {
            return res.status(404).json({error: "No uploaded files found"});
        }

        try {
            const file = await fetchFile(fileDest);
            res.json(file);
        } catch (error) {
            res.status(500).json({error: error});
        }

    }

    /** private functions **/
    function getFileProvider() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                const {nodeId} = req.params;  // Get node ID from URL

                if (!nodeId) {
                    return cb(new Error("Missing nodeId"), null);
                }

                const projectFolder = getFilePath(nodeId);
                // Ensure the folder exists
                if (!fs.existsSync(projectFolder)) {
                    fs.mkdirSync(projectFolder, {recursive: true});
                }

                // Set the destination folder for uploads
                cb(null, projectFolder);
            },
            filename: (req, file, cb) => {
                // Set the filename to be the original name of the file
                cb(null, file.originalname);
            },
        });
        //Multer provides a middleware (upload.single("file")) that extracts the file from the request, processes it, and stores it in a defined location.
        return multer({storage});
    }

    function getFilePath(nodeId) {
        const userDir = RED.settings.userDir;
        const projects = RED.settings.get("projects");

        const basePath = projects?.activeProject
            ? path.join(userDir, "projects", projects.activeProject, "uploads")
            : path.join(userDir, "uploads");

        return path.join(basePath, nodeId);
    }

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

    function initRoutes() {
        // Assign handlers to routes
        router.get("/async-api-red/:nodeId/servers", getServers);
        router.get("/async-api-red/:nodeId/channels", getChannels);
        router.post("/async-api-red/:nodeId/file", getFileProvider().single("file"), uploadFile);
        router.get("/async-api-red/:nodeId/file", getFile);
    }

    return router;

}
