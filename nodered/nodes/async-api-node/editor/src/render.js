/**
 * =====================================================================
 * Editor Render Module
 * =====================================================================
 *
 * Responsibilities:
 * - Render all dropdowns and dynamic inputs
 * - Reset visible UI containers
 * - Restore selected values into UI after rendering
 */
import {
    state,
    getSelectedChannel,
    getSelectedOperation
} from "./state.js";

import {
    escapeHtml
} from "./dom-utils.js";

/**
 * Reset visible UI containers.
 */
export function resetUi() {
    $("#node-input-select-server").empty();
    $("#node-input-channel").empty();
    $("#node-input-operations").empty();
    $("#node-parameters-display").empty();
    $("#node-messages-display").empty();
}

/**
 * Render everything.
 */
export function renderAll() {
    renderServers();
    renderChannels();
    renderOperations();
    renderParameters();
    renderMessages();
    applySelectionsToUi();
}

/**
 * Render server dropdown.
 */
export function renderServers() {
    const serverDropdown = $("#node-input-select-server");

    serverDropdown.empty();

    state.asyncApiData.servers.forEach(function (server) {
        serverDropdown.append(
            `<option value="${escapeHtml(server.url)}">${escapeHtml(server.url)}</option>`
        );
    });
}

/**
 * Render channel dropdown.
 */
export function renderChannels() {
    const channelDropdown = $("#node-input-channel");

    channelDropdown.empty();

    state.asyncApiData.channels.forEach(function (channel) {
        channelDropdown.append(
            `<option value="${escapeHtml(channel.address)}">${escapeHtml(channel.address)}</option>`
        );
    });
}

/**
 * Render operation dropdown.
 */
export function renderOperations() {
    const operationDropdown = $("#node-input-operations");
    const selectedChannel = getSelectedChannel();

    operationDropdown.empty();

    if (!selectedChannel || !Array.isArray(selectedChannel.operations) || !selectedChannel.operations.length) {
        return;
    }

    selectedChannel.operations.forEach(function (operation) {
        operationDropdown.append(
            `<option value="${escapeHtml(operation.id)}">${escapeHtml(operation.id)}</option>`
        );
    });
}

/**
 * Render channel parameters.
 */
export function renderParameters() {
    const container = $("#node-parameters-display");
    const selectedChannel = getSelectedChannel();
    const parameters = selectedChannel?.parameters || [];

    container.empty();

    if (!parameters.length) {
        container.append("<div>No parameters available for this channel.</div>");
        return;
    }

    parameters.forEach(function (param) {
        const paramName = param.id || param.name;
        const savedValue = state.selections.parameterValues?.[paramName] ?? "";

        container.append(`
            <div class="form-row">
                <label>${escapeHtml(paramName)}</label>
                <input
                    id="node-input-param-${state.nodeId}-${escapeHtml(paramName)}"
                    data-param-name="${escapeHtml(paramName)}"
                    data-node-id="${state.nodeId}"
                    value="${escapeHtml(String(savedValue))}">
            </div>
        `);
    });
}
/**
 * Render payload fields from selected operation.
 */
export function renderMessages() {
    const container = $("#node-messages-display");
    const selectedOperation = getSelectedOperation();

    container.empty();

    if (!selectedOperation || !Array.isArray(selectedOperation.messages) || !selectedOperation.messages.length) {
        container.append("<div>No message payload fields available for this operation.</div>");
        return;
    }

    selectedOperation.messages.forEach(function (message) {
        if (!Array.isArray(message.payload) || !message.payload.length) {
            return;
        }

        message.payload.forEach(function (field) {
            if (!field || !field.name) {
                return;
            }

            const fieldName = field.name;
            const savedValue = state.selections.payloadValues?.[fieldName] ?? "";

            container.append(`
                <div class="form-row">
                    <label>${escapeHtml(fieldName)}</label>
                    <input
                        id="node-input-${state.nodeId}-${escapeHtml(fieldName)}"
                        data-field-name="${escapeHtml(fieldName)}"
                        data-node-id="${state.nodeId}"
                        value="${escapeHtml(String(savedValue))}">
                </div>
            `);
        });
    });
}

/**
 * Restore selected dropdown values after rendering.
 */
export function applySelectionsToUi() {
    $("#node-input-select-server").val(state.selections.serverUrl);
    $("#node-input-channel").val(state.selections.topic);
    $("#node-input-operations").val(state.selections.operationId);
}