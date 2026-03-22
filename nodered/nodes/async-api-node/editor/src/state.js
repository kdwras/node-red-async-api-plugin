/**
 * =====================================================================
 * Editor State Module
 * =====================================================================
 *
 * Responsibilities:
 * - Store temporary editor state in the browser
 * - Reset state when dialog opens/closes
 * - Normalize backend data
 * - Restore saved selections
 * - Ensure restored selections still exist in loaded AsyncAPI data
 */

export const state = {
    nodeId: null,
    asyncApiData: {
        servers: [],
        channels: []
    },
    selections: {
        serverUrl: "",
        topic: "",
        operationId: "",
        parameterValues: {},
        payloadValues: {}
    }
};

/**
 * Reset all editor state.
 */
export function resetEditorState() {
    state.nodeId = null;
    state.asyncApiData = {
        servers: [],
        channels: []
    };
    state.selections = {
        serverUrl: "",
        topic: "",
        operationId: "",
        parameterValues: {},
        payloadValues: {}
    };
}

/**
 * Normalize backend response.
 *
 * @param {object} data
 * @returns {{servers: Array, channels: Array}}
 */
export function normalizeAsyncApiData(data) {
    return {
        servers: Array.isArray(data?.servers) ? data.servers : [],
        channels: Array.isArray(data?.channels) ? data.channels : []
    };
}

/**
 * Restore saved selections into state.
 *
 * @param {object} saved
 */
export function applySavedSelections(saved) {
    state.selections.serverUrl = saved.serverUrl || "";
    state.selections.topic = saved.topic || "";
    state.selections.operationId = saved.operation?.id || "";
    state.selections.parameterValues = saved.parameterValues || {};
    state.selections.payloadValues = saved.payload || {};
}

/**
 * Return selected channel object.
 *
 * @returns {object|undefined}
 */
export function getSelectedChannel() {
    return state.asyncApiData.channels.find(function (channel) {
        return channel.address === state.selections.topic;
    });
}

/**
 * Return selected operation object.
 *
 * @returns {object|undefined}
 */
export function getSelectedOperation() {
    const channel = getSelectedChannel();

    return channel?.operations?.find(function (operation) {
        return operation.id === state.selections.operationId;
    });
}

/**
 * Ensure restored selections still exist after reloading AsyncAPI data.
 * If something no longer exists, fallback to first available values.
 */
export function ensureValidSelections() {
    if (!state.asyncApiData.servers.length || !state.asyncApiData.channels.length) {
        return;
    }

    const serverExists = state.asyncApiData.servers.some(function (server) {
        return server.url === state.selections.serverUrl;
    });

    if (!serverExists) {
        state.selections.serverUrl = state.asyncApiData.servers[0]?.url || "";
    }

    const channelExists = state.asyncApiData.channels.some(function (channel) {
        return channel.address === state.selections.topic;
    });

    if (!channelExists) {
        state.selections.topic = state.asyncApiData.channels[0]?.address || "";
    }

    const channel = getSelectedChannel();

    const operationExists = channel?.operations?.some(function (operation) {
        return operation.id === state.selections.operationId;
    });

    if (!operationExists) {
        state.selections.operationId = channel?.operations?.[0]?.id || "";
    }
}