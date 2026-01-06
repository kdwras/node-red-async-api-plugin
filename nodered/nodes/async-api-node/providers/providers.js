/**
 * Multer file upload provider for Node-RED AsyncAPI integration
 *
 * Responsible for:
 * - Handling file uploads via multipart/form-data
 * - Creating per-node upload directories
 * - Ensuring only one file exists per node (old files removed)
 */
module.exports = (RED) => {

    /**
     * Dependencies
     */
    const fs = require("fs");
    const multer = require("multer");
    const path = require("path");

    // Utility helpers bound to Node-RED runtime
    const Utils = require("../utils/utils")(RED);

    /**
     * Configure and return Multer middleware for file uploads
     *
     * Upload behavior:
     * - Destination folder is based on Node-RED nodeId
     * - Folder is created if it does not exist
     * - Existing files in the folder are removed before saving new file
     *
     * @returns {object} Multer middleware instance
     */
    function getFile() {

        /**
         * Configure Multer disk storage
         */
        const storage = multer.diskStorage({

            /**
             * Determine upload destination directory
             *
             * @param {object} req
             * @param {object} file
             * @param {function} cb
             */
            destination: (req, file, cb) => {
                const { nodeId } = req.params;

                // Validate nodeId presence
                if (!nodeId) {
                    return cb(new Error("Missing nodeId"), null);
                }

                // Resolve upload directory for this node
                const projectFolder = Utils.getFilePath(nodeId);

                // Ensure directory exists
                if (!fs.existsSync(projectFolder)) {
                    fs.mkdirSync(projectFolder, { recursive: true });
                }

                cb(null, projectFolder);
            },

            /**
             * Define uploaded file name
             *
             * Also removes previously uploaded files to ensure
             * only one AsyncAPI file exists per node.
             *
             * @param {object} req
             * @param {object} file
             * @param {function} cb
             */
            filename: (req, file, cb) => {
                const { nodeId } = req.params;
                const projectFolder = Utils.getFilePath(nodeId);
                const originalName = file.originalname;

                try {
                    // Remove existing files in upload directory
                    const files = fs.readdirSync(projectFolder);
                    for (const f of files) {
                        const filePath = path.join(projectFolder, f);
                        if (fs.statSync(filePath).isFile()) {
                            fs.unlinkSync(filePath);
                        }
                    }
                } catch (err) {
                    return cb(err);
                }

                // Preserve original filename
                cb(null, originalName);
            },
        });

        /**
         * Return Multer middleware
         *
         * upload.single("file") will:
         * - Extract file from multipart request
         * - Store it using configured disk storage
         * - Attach metadata to req.file
         */
        return multer({ storage });
    }

    /**
     * Public provider API
     */
    return {
        getFile
    };
};
