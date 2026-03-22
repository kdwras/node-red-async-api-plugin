/**
 * Multer file upload provider for Node-RED AsyncAPI integration
 *
 * Responsibilities:
 * - Handle multipart file uploads
 * - Store uploaded AsyncAPI documents per node
 * - Ensure only one file exists per node
 */

module.exports = (RED) => {

    const fs = require("fs");
    const multer = require("multer");
    const path = require("path");

    const fileUtils = require("../utils/file-utils")(RED);

    /**
     * Allowed AsyncAPI file types
     */
    const ALLOWED_EXTENSIONS = [".yaml", ".yml", ".json"];

    /**
     * Create Multer upload middleware
     */
    function getFile() {

        const storage = multer.diskStorage({

            /**
             * Determine destination folder
             */
            destination: (req, file, cb) => {
                try {

                    const { nodeId } = req.params;

                    if (!nodeId) {
                        return cb(new Error("Missing nodeId"));
                    }

                    const uploadDir = fileUtils.getFilePath(nodeId);

                    // Ensure upload directory exists
                    fs.mkdirSync(uploadDir, { recursive: true });

                    cb(null, uploadDir);

                } catch (err) {
                    cb(err);
                }
            },

            /**
             * Save file and remove previous uploads
             */
            filename: (req, file, cb) => {

                try {

                    const { nodeId } = req.params;
                    const uploadDir = fileUtils.getFilePath(nodeId);

                    /**
                     * Remove existing files so only one AsyncAPI file exists
                     */
                    const files = fs.readdirSync(uploadDir);

                    for (const f of files) {
                        const filePath = path.join(uploadDir, f);

                        if (fs.statSync(filePath).isFile()) {
                            fs.unlinkSync(filePath);
                        }
                    }

                    cb(null, file.originalname);

                } catch (err) {
                    cb(err);
                }
            }
        });

        /**
         * Validate uploaded file type
         */
        function fileFilter(req, file, cb) {

            const ext = path.extname(file.originalname).toLowerCase();

            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                return cb(new Error("Only .yaml, .yml or .json AsyncAPI files are allowed"));
            }

            cb(null, true);
        }

        /**
         * Create multer instance
         */
        return multer({
            storage,
            fileFilter,

            /**
             * Optional safety limits
             */
            limits: {
                fileSize: 5 * 1024 * 1024 // 5MB
            }
        });
    }

    return {
        getFile
    };
};