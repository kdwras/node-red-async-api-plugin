module.exports = (RED) => {
    const fs = require("fs");
    const multer = require("multer");
    const Utils = require("../utils/utils")(RED);
    const path = require("path");

    /**
     *
     * @returns {*}
     */
    function getFile() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                const {nodeId} = req.params;  // Get node ID from URL

                if (!nodeId) {
                    return cb(new Error("Missing nodeId"), null);
                }

                const projectFolder = Utils.getFilePath(nodeId);
                // Ensure the folder exists
                if (!fs.existsSync(projectFolder)) {
                    fs.mkdirSync(projectFolder, {recursive: true});
                }

                // Set the destination folder for uploads
                cb(null, projectFolder);
            },
            filename: (req, file, cb) => {
                const { nodeId } = req.params;
                const projectFolder = Utils.getFilePath(nodeId);
                const originalName = file.originalname;

                try {
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

                // Set the filename to be the original name of the file
                cb(null, originalName);
            },
        });
        //Multer provides a middleware (upload.single("file")) that extracts the file from the request, processes it, and stores it in a defined location.
        return multer({storage});
    }

    return {
        getFile
    };
};
