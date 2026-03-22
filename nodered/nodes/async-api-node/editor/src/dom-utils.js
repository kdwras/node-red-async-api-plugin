/**
 * =====================================================================
 * Editor DOM / Utility Module
 * =====================================================================
 *
 * Responsibilities:
 * - Escape HTML values
 * - Clear file input
 * - Read payload/parameter values from DOM
 * - Sync UI values back into state
 * - Extract expected payload schema from selected operation
 */
import { state } from "./state.js";

/**
 * Escape text before inserting into HTML.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Clear file input.
 */
export function clearFileInput() {
    $("#node-input-file").val("");
}

/**
 * Collect payload values from current UI.
 *
 * @returns {object}
 */
export function getPayloadValuesFromUi() {
    const values = {};

    $("#node-messages-display")
        .find("input[id^='node-input-']:not([id^='node-input-param-'])")
        .each(function () {
            const name = this.id.replace("node-input-", "");
            values[name] = $(this).val() || "";
        });

    return values;
}

/**
 * Collect parameter values from current UI.
 *
 * @returns {object}
 */
export function getParameterValuesFromUi() {
    const values = {};

    $("#node-parameters-display")
        .find("input[id^='node-input-param-']")
        .each(function () {
            const name = this.id.replace("node-input-param-", "");
            values[name] = $(this).val() || "";
        });

    return values;
}

/**
 * Synchronize current UI values into state.
 */
export function syncStateFromUi() {
    state.selections.serverUrl = $("#node-input-select-server").val() || "";
    state.selections.topic = $("#node-input-channel").val() || "";
    state.selections.operationId = $("#node-input-operations").val() || "";
    state.selections.parameterValues = getParameterValuesFromUi();
    state.selections.payloadValues = getPayloadValuesFromUi();
}

/**
 * Extract expected payload field definitions from selected operation.
 *
 * @param {object} operation
 * @returns {Array}
 */
export function getExpectedPayloadFromOperation(operation) {
    const fields = [];

    if (!operation || !operation.messages) {
        return fields;
    }

    const messages = Array.isArray(operation.messages)
        ? operation.messages
        : Object.values(operation.messages);

    for (const message of messages) {
        const payload = Array.isArray(message?.payload)
            ? message.payload
            : Array.isArray(message?.message?.payload)
                ? message.message.payload
                : [];

        for (const field of payload) {
            fields.push(field);
        }
    }

    return fields;
}