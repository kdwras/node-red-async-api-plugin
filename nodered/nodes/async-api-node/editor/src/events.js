/**
 * =====================================================================
 * Editor Events Module
 * =====================================================================
 *
 * Responsibilities:
 * - Bind UI events
 * - Subscribe/unsubscribe to runtime events
 * - Keep shared state in sync as user interacts with the editor
 */
import {
    state,
    normalizeAsyncApiData,
    ensureValidSelections,
    getSelectedChannel
} from "./state.js";

import {
    uploadFile,
    getData
} from "./api.js";

import {
    renderAll,
    renderOperations,
    renderParameters,
    renderMessages,
    applySelectionsToUi
} from "./render.js";
import {escapeHtml} from "./dom-utils";

/**
 * Bind all static UI events.
 */
export function bindStaticEvents() {
    /**
     * File upload.
     */
    $("#node-input-file")
        .off("change.asyncapi")
        .on("change.asyncapi", function (event) {
            const file = event.target.files[0];

            if (file && state.nodeId) {
                uploadFile(state.nodeId, file)
                    .then(function () {
                        return getData(state.nodeId);
                    })
                    .then(function (data) {
                        state.asyncApiData = normalizeAsyncApiData(data);
                        ensureValidSelections();
                        renderAll();
                    })
                    .catch(function () {
                        RED.notify("File upload failed", "error");
                    });
            }
        });

    /**
     * Server change.
     */
    $("#node-input-select-server")
        .off("change.asyncapi")
        .on("change.asyncapi", function () {
            state.selections.serverUrl = $(this).val() || "";
        });

    /**
     * Channel change.
     */
    $("#node-input-channel")
        .off("change.asyncapi")
        .on("change.asyncapi", function () {
            state.selections.topic = $(this).val() || "";

            const channel = getSelectedChannel();
            state.selections.operationId = channel?.operations?.[0]?.id || "";

            renderOperations();
            renderParameters();
            renderMessages();
            applySelectionsToUi();
        });

    /**
     * Operation change.
     */
    $("#node-input-operations")
        .off("change.asyncapi")
        .on("change.asyncapi", function () {
            state.selections.operationId = $(this).val() || "";
            renderMessages();
        });

    /**
     * Parameter input changes.
     */
    $("#node-parameters-display")
        .off("input.asyncapi")
        .on("input.asyncapi", "input[id^='node-input-param-']", function () {
            const name = this.id.replace("node-input-param-", "");
            state.selections.parameterValues[name] = $(this).val() || "";
        });

    /**
     * Payload input changes.
     */
    $("#node-messages-display")
        .off("input.asyncapi")
        .on("input.asyncapi", "input[id^='node-input-']:not([id^='node-input-param-'])", function () {
            const name = this.id.replace("node-input-", "");
            state.selections.payloadValues[name] = $(this).val() || "";
        });
}

/**
 * Subscribe to runtime events for this node.
 *
 * @param {string} nodeId
 */
export function subscribeRuntimeEvents(nodeId) {
    RED.comms.subscribe(`async-api-red/payload-update/${nodeId}`, function (topic, msg) {

        if (msg?.payload && typeof msg.payload === "object") {
            Object.entries(msg.payload).forEach(function ([key, value]) {
                const input = $(`#node-input-${nodeId}-${key}`);

                if (input.length) {
                    input.val(value);
                }
            });
        }

        if (msg?.parameters && typeof msg.parameters === "object") {
            Object.entries(msg.parameters).forEach(function ([key, value]) {
                const input = $(`#node-input-param-${nodeId}-${key}`);

                if (input.length) {
                    input.val(value);
                }
            });
        }
    });
    RED.comms.subscribe(`async-api-red/payload-error/${nodeId}`, function (topic, msg) {
        RED.notify(`❌ Validation Error: ${msg.error}`, "error");
    });
}

/**
 * Unsubscribe from runtime events.
 *
 * @param {string} nodeId
 */
export function unsubscribeRuntimeEvents(nodeId) {
    if (RED.comms && typeof RED.comms.unsubscribe === "function") {
        RED.comms.unsubscribe(`async-api-red/payload-update/${nodeId}`);
        RED.comms.unsubscribe(`async-api-red/payload-error/${nodeId}`);
    }
}