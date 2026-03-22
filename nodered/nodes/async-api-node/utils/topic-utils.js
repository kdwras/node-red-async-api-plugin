/**
 * Topic Utilities
 *
 * Responsibilities:
 * - Resolve topic placeholders using parameters
 * - Validate that required topic parameters exist
 *
 * Example:
 * topic template: devices/{deviceId}/status
 * parameters: { deviceId: "lamp1" }
 * result: devices/lamp1/status
 */
module.exports = () => {

    /**
     * Resolve topic placeholders using available parameter values.
     *
     * Priority:
     * 1. msg.parameters
     * 2. node.resolvedParameters
     * 3. node.parameterValues
     * 4. parameter default value
     *
     * @param {object} node
     * @returns {string}
     */
    function resolveTopic(node) {
        if (!node) {
            throw new Error("Runtime node is required.");
        }

        let topic = node.topic || "";

        if (!topic) {
            return "";
        }

        const params = Array.isArray(node.parameters) ? node.parameters : [];
        const msgParameters = node.msg && node.msg.parameters && typeof node.msg.parameters === "object"
            ? node.msg.parameters
            : {};

        const resolvedParameters = node.resolvedParameters && typeof node.resolvedParameters === "object"
            ? node.resolvedParameters
            : {};

        const nodeParameterValues = node.parameterValues && typeof node.parameterValues === "object"
            ? node.parameterValues
            : {};

        params.forEach(function (param) {
            const name = param.id || param.name;

            const value =
                msgParameters[name] ??
                resolvedParameters[name] ??
                nodeParameterValues[name] ??
                param.value;

            if (value === undefined || value === null || value === "") {
                throw new Error(`Missing required topic parameter: "${name}"`);
            }

            topic = topic.replaceAll(`{${name}}`, String(value));
        });

        return topic;
    }

    /**
     * Validate that all declared parameters can be resolved.
     *
     * @param {object} node
     * @returns {boolean}
     */
    function validateTopicParameters(node) {
        resolveTopic(node);
        return true;
    }

    return {
        resolveTopic: resolveTopic,
        validateTopicParameters: validateTopicParameters
    };
};