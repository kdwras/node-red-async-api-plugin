/**
 * Entry point for Node-RED
 *
 * This file is required by Node-RED and acts as a bridge
 * to the actual runtime implementation.
 */
module.exports = function (RED) {
    require("./runtime/runtime")(RED);
};