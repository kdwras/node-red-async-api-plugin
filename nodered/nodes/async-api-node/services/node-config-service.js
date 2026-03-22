/**
 * Node Configuration Service
 *
 * Responsibilities:
 * - Save editor selections into the live runtime node
 * - Return saved selections back to the editor
 */
module.exports = () => {

    /**
     * Save configuration values into runtime node.
     *
     * @param {object} node
     * @param {object} payload
     */
    function save(node, payload) {
        if (!node) {
            throw new Error("Runtime node is required.");
        }

        if (!payload || typeof payload !== "object") {
            throw new Error("Configuration payload is invalid.");
        }

        /**
         * Core selections.
         */
        node.serverUrl = payload.serverUrl || "";
        node.topic = payload.topic || "";
        node.operation = payload.operation || null;

        /**
         * Schema / metadata.
         */
        node.expectedPayload = Array.isArray(payload.expectedPayload)
            ? payload.expectedPayload
            : [];

        node.parameters = Array.isArray(payload.parameters)
            ? payload.parameters
            : [];

        /**
         * User-entered values from the editor dialog.
         */
        node.parameterValues = payload.parameterValues && typeof payload.parameterValues === "object"
            ? payload.parameterValues
            : {};

        node.savedPayload = payload.payload && typeof payload.payload === "object"
            ? payload.payload
            : null;
    }

    /**
     * Return saved configuration from runtime node.
     *
     * @param {object} node
     * @returns {object}
     */
    function load(node) {
        if (!node) {
            throw new Error("Runtime node is required.");
        }

        return {
            serverUrl: node.serverUrl || "",
            topic: node.topic || "",
            operation: node.operation || null,
            payload: node.savedPayload || null,
            parameters: Array.isArray(node.parameters) ? node.parameters : [],
            expectedPayload: Array.isArray(node.expectedPayload) ? node.expectedPayload : [],
            parameterValues: node.parameterValues && typeof node.parameterValues === "object"
                ? node.parameterValues
                : {}
        };
    }

    return {
        save: save,
        load: load
    };
};