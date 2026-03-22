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

        /**
         * Validate first.
         */
        const errors = await parser.validate(fileContent);

        if (Array.isArray(errors) && errors.length > 0) {
            const message = errors.map(function (error) {
                return error.message;
            }).join("; ");

            throw new Error("AsyncAPI validation failed: " + message);
        }

        /**
         * Parse validated content.
         */
        return await parser.parse(fileContent);
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

        if (!document) {
            return {
                servers: servers,
                channels: channels
            };
        }

        /**
         * Extract servers.
         */
        document.servers().forEach(function (server) {
            servers.push({
                url: server.url(),
                protocol: server.protocol(),
                description: server.description()
            });
        });

        /**
         * Extract channels, channel parameters, operations and message payload fields.
         */
        document.channels().forEach(function (channel) {
            const operations = [];
            const parameters = [];

            /**
             * Extract channel parameters.
             */
            channel.parameters().forEach(function (param) {
                parameters.push({
                    id: param.id(),
                    description: param.description()
                });
            });

            /**
             * Extract operations.
             */
            channel.operations().forEach(function (operation) {
                const messages = [];

                /**
                 * Extract operation messages.
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
                        payload: payload
                    });
                });

                operations.push({
                    id: operation.id(),
                    action: operation.action(),
                    summary: operation.summary(),
                    messages: messages
                });
            });

            channels.push({
                address: channel.address(),
                parameters: parameters,
                operations: operations
            });
        });

        return {
            servers: servers,
            channels: channels
        };
    }

    return {
        parse: parse,
        extract: extract
    };
};