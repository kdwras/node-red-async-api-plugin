/**
 * File utilities
 *
 * Responsibilities:
 * - Resolve file storage path
 * - Read uploaded AsyncAPI file
 */
const path = require("path");
const fs = require("fs");

module.exports = (RED) => {

    /**
     * Get upload directory path for node
     */
    function getFilePath(nodeId) {
        return path.join(RED.settings.userDir, "uploads", nodeId);
    }

    /**
     * Fetch stored file
     */
    async function fetchFile(dir) {
        if (!fs.existsSync(dir)) {
            return null;
        }

        const files = fs.readdirSync(dir);

        if (!files.length) {
            return null;
        }

        const file = files[0];
        const filePath = path.join(dir, file);

        const content = fs.readFileSync(filePath, "utf8");

        return {
            fileContent: content,
            fileName: file
        };
    }

    return {
        getFilePath: getFilePath,
        fetchFile: fetchFile
    };
};