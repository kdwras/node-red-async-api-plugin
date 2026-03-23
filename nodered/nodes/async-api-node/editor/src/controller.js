/**
 * =====================================================================
 * Editor Controller Module
 * =====================================================================
 *
 * Responsibilities:
 * - Orchestrate Node-RED editor lifecycle:
 *   oneditprepare, oneditsave, oneditcancel
 */
import {
    state,
    resetEditorState,
    normalizeAsyncApiData,
    applySavedSelections,
    ensureValidSelections,
    getSelectedChannel,
    getSelectedOperation
} from "./state.js";

import {
    getFile,
    getData,
    getUserSelections,
    saveUserSelections,
    connectToServer,
    handleMessage
} from "./api.js";

import {
    clearFileInput,
    syncStateFromUi,
    getExpectedPayloadFromOperation,
    getParameterValuesFromUi,
    getPayloadValuesFromUi
} from "./dom-utils.js";

import {
    resetUi,
    renderAll
} from "./render.js";

import {
    bindStaticEvents,
    subscribeRuntimeEvents,
    unsubscribeRuntimeEvents
} from "./events.js";

/**
 * Prepare editor dialog.
 *
 * @param {object} node
 */
export function oneditprepare(node) {
    const isDuplicatedNode = !!(node.savedNodeId && node.savedNodeId !== node.id);

    resetEditorState();
    resetUi();
    clearFileInput();

    if (isDuplicatedNode) {
        node.serverUrl = "";
        node.topic = "";
        node.operation = null;
        node.expectedPayload = [];
        node.parameters = [];
        node.parameterValues = {};
        node.payload = {};
        node.savedNodeId = "";

        state.selections.serverUrl = "";
        state.selections.topic = "";
        state.selections.operationId = "";
        state.selections.parameterValues = {};
        state.selections.payloadValues = {};
    }

    state.nodeId = node.id || null;

    bindStaticEvents();

    if (!node?.id) {
        $("#node-messages-display").html(
            "<div style='color:#666'>Deploy the flow once, then reopen this node to upload and configure the AsyncAPI file.</div>"
        );
        return;
    }

    subscribeRuntimeEvents(node.id);

    Promise.resolve()
        .then(function () {
            if (isDuplicatedNode) {
                return null;
            }

            return getFile(node.id).catch(function () {
                return null;
            });
        })
        .then(function () {
            return getData(node.id);
        })
        .then(function (data) {
            state.asyncApiData = normalizeAsyncApiData(data);

            if (isDuplicatedNode) {
                return {};
            }

            return getUserSelections(node.id).catch(function () {
                return {};
            });
        })
        .then(function (saved) {
            applySavedSelections(saved || {});
            ensureValidSelections();
            renderAll();
        })
        .catch(function (err) {
            console.error("Editor init failed:", err);
            RED.notify("Failed to initialize AsyncAPI editor", "error");
        });
}

/**
 * Save editor dialog.
 *
 * @param {object} node
 * @returns {Promise|undefined}
 */
export function oneditsave(node) {
    if (!node?.id) {
        return;
    }

    node.savedNodeId = node.id;

    syncStateFromUi();

    const selectedChannel = getSelectedChannel();
    const selectedOperation = getSelectedOperation();

    if (!selectedChannel || !selectedOperation) {
        RED.notify("Select a channel and operation first.", "warning");
        return;
    }

    const data = {
        serverUrl: state.selections.serverUrl,
        topic: selectedChannel.address,
        operation: selectedOperation,
        expectedPayload: getExpectedPayloadFromOperation(selectedOperation),
        parameters: Array.isArray(selectedChannel.parameters) ? selectedChannel.parameters : [],
        parameterValues: getParameterValuesFromUi(),
        payload: getPayloadValuesFromUi()
    };

    /**
     * Update editor-side node object so Node-RED persists values in flow JSON.
     */
    node.serverUrl = data.serverUrl;
    node.topic = data.topic;
    node.operation = data.operation;
    node.expectedPayload = data.expectedPayload;
    node.parameters = data.parameters;
    node.parameterValues = data.parameterValues;
    node.payload = data.payload;

    return saveUserSelections(node.id, data)
        .then(function () {
            return connectToServer(node.id);
        })
        .then(function () {
            return handleMessage(node.id, selectedChannel.address);
        })
        .then(function () {
            unsubscribeRuntimeEvents(node.id);
        })
        .catch(function (err) {
            console.error("Failed during save/connect flow:", err);
            RED.notify("Failed to save selections or connect to MQTT server", "error");
        });
}

/**
 * Cancel editor dialog.
 *
 * @param {object} node
 */
export function oneditcancel(node) {
    if (state.nodeId) {
        unsubscribeRuntimeEvents(state.nodeId);
    }

    resetEditorState();
    resetUi();
    clearFileInput();
}