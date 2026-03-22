/**
 * =====================================================================
 * Editor API Module
 * =====================================================================
 *
 * Responsibilities:
 * - Call backend routes exposed by router.js
 * - Load/upload AsyncAPI file
 * - Load parsed AsyncAPI metadata
 * - Save/load user selections
 * - Trigger runtime MQTT connect/message handling
 */

/**
 * Load previously uploaded AsyncAPI file.
 *
 * @param {string} nodeId
 * @returns {Promise<object>}
 */
export function getFile(nodeId) {
    return new Promise(function (resolve, reject) {
        $.ajax({
            url: `/async-api-red/${nodeId}/file`,
            type: "GET",
            success: function (response) {
                try {
                    const blob = new Blob([response.fileContent], { type: "text/plain" });
                    const file = new File([blob], response.fileName, { type: response.fileType });

                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);

                    $("#node-input-file")[0].files = dataTransfer.files;

                    resolve(response);
                } catch (e) {
                    reject(e);
                }
            },
            error: reject
        });
    });
}

/**
 * Upload AsyncAPI file.
 *
 * @param {string} nodeId
 * @param {File} file
 * @returns {jqXHR}
 */
export function uploadFile(nodeId, file) {
    const formData = new FormData();
    formData.append("file", file);

    return $.ajax({
        url: `/async-api-red/${nodeId}/file`,
        type: "POST",
        data: formData,
        processData: false,
        contentType: false
    });
}

/**
 * Get parsed AsyncAPI metadata.
 *
 * @param {string} nodeId
 * @returns {Promise<object>}
 */
export function getData(nodeId) {
    return new Promise(function (resolve, reject) {
        $.ajax({
            type: "GET",
            url: `/async-api-red/${nodeId}/data`,
            success: resolve,
            error: reject
        });
    });
}

/**
 * Save user selections into runtime node.
 *
 * @param {string} nodeId
 * @param {object} data
 * @returns {jqXHR}
 */
export function saveUserSelections(nodeId, data) {
    return $.ajax({
        url: `/async-api-red/${nodeId}/user-selections`,
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(data)
    });
}

/**
 * Load saved user selections.
 *
 * @param {string} nodeId
 * @returns {Promise<object>}
 */
export function getUserSelections(nodeId) {
    return new Promise(function (resolve, reject) {
        $.ajax({
            url: `/async-api-red/${nodeId}/user-selections`,
            type: "GET",
            success: resolve,
            error: reject
        });
    });
}

/**
 * Ask runtime node to connect to MQTT server.
 *
 * @param {string} nodeId
 * @returns {Promise<object>}
 */
export function connectToServer(nodeId) {
    return new Promise(function (resolve, reject) {
        $.ajax({
            url: `/async-api-red/${nodeId}/server-connect`,
            type: "GET",
            success: resolve,
            error: reject
        });
    });
}

/**
 * Ask runtime node to initialize message handling.
 *
 * @param {string} nodeId
 * @param {string} topicName
 * @returns {Promise<object>}
 */
export function handleMessage(nodeId, topicName) {
    return new Promise(function (resolve, reject) {
        $.ajax({
            url: `/async-api-red/${nodeId}/message`,
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({ topic: topicName }),
            success: resolve,
            error: reject
        });
    });
}