/**
 * AsyncAPI Service
 *
 * Responsibilities:
 * - Parse AsyncAPI file content
 * - Validate AsyncAPI document
 * - Extract editor-friendly data:
 *   servers, channels, operations, messages, parameters
 */
const { Parser } = require("@asyncapi/parser");

module.exports = () => {

    /**
     * Parse and validate AsyncAPI document content.
     *
     * @param {string|object} fileContent
     * @returns {Promise<object>}
     */
    async function parse(fileContent) {
        const parser = new Parser();

        if (!fileContent) {
            throw new Error("AsyncAPI file content is empty.");
        }

        let diagnostics = [];

        try {
            diagnostics = await parser.validate(fileContent);
        } catch (err) {
            throw new Error("AsyncAPI validation failed: " + err.message);
        }

        if (Array.isArray(diagnostics) && diagnostics.length > 0) {
            console.warn("⚠️ AsyncAPI validation diagnostics:");
            diagnostics.forEach(function (item, index) {
                console.warn(`${index + 1}. ${item.message}`);
            });
        }

        try {
            const result = await parser.parse(fileContent);

            const document =
                result?.document ||
                result?.extras?.document ||
                result;

            if (!document) {
                throw new Error("Parser returned empty document.");
            }

            return document;

        } catch (err) {
            throw new Error("AsyncAPI parse failed: " + err.message);
        }
    }

    /**
     * Convert parsed AsyncAPI document into UI-friendly JSON.
     *
     * @param {object} document
     * @returns {{servers: Array, channels: Array}}
     */
    function extract(document) {
        const servers = [];
        const channels = [];

        /**
         * Guard: no document
         */
        if (!document) {
            return { servers, channels };
        }

        /**
         * Extract servers
         */
        document.servers().forEach(function (server) {
            servers.push({
                url: server.url(),
                protocol: server.protocol(),
                description: server.description()
            });
        });

        /**
         * Extract channels
         */
        document.channels().forEach(function (channel) {
            const operations = [];
            const parameters = [];

            /**
             * Channel parameters
             */
            channel.parameters().forEach(function (param) {
                parameters.push({
                    id: param.id(),
                    description: param.description()
                });
            });

            /**
             * Operations
             */
            channel.operations().forEach(function (operation) {
                const messages = [];

                /**
                 * Messages
                 */
                operation.messages().forEach(function (msg) {
                    const payload = [];
                    const payloadJson = msg.payload()?.json?.();

                    const requiredFields = Array.isArray(payloadJson?.required)
                        ? payloadJson.required
                        : [];

                    if (payloadJson && payloadJson.properties) {
                        Object.entries(payloadJson.properties).forEach(function ([propName, propSchema]) {
                            payload.push({
                                name: propName,
                                type: propSchema.type || "string",
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
                        contentType: msg.contentType(),
                        payload
                    });
                });

                operations.push({
                    id: operation.id(),
                    action: operation.action(),
                    summary: operation.summary(),
                    messages
                });
            });

            channels.push({
                address: channel.address(),
                parameters,
                operations
            });
        });

        return {
            servers,
            channels
        };
    }

    return {
        parse,
        extract
    };
};