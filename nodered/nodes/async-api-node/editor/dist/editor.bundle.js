(() => {
  // editor/src/state.js
  var state = {
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
  function resetEditorState() {
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
  function normalizeAsyncApiData(data) {
    return {
      servers: Array.isArray(data?.servers) ? data.servers : [],
      channels: Array.isArray(data?.channels) ? data.channels : []
    };
  }
  function applySavedSelections(saved) {
    state.selections.serverUrl = saved.serverUrl || "";
    state.selections.topic = saved.topic || "";
    state.selections.operationId = saved.operation?.id || "";
    state.selections.parameterValues = saved.parameterValues || {};
    state.selections.payloadValues = saved.payload || {};
  }
  function getSelectedChannel() {
    return state.asyncApiData.channels.find(function(channel) {
      return channel.address === state.selections.topic;
    });
  }
  function getSelectedOperation() {
    const channel = getSelectedChannel();
    return channel?.operations?.find(function(operation) {
      return operation.id === state.selections.operationId;
    });
  }
  function ensureValidSelections() {
    if (!state.asyncApiData.servers.length || !state.asyncApiData.channels.length) {
      return;
    }
    const serverExists = state.asyncApiData.servers.some(function(server) {
      return server.url === state.selections.serverUrl;
    });
    if (!serverExists) {
      state.selections.serverUrl = state.asyncApiData.servers[0]?.url || "";
    }
    const channelExists = state.asyncApiData.channels.some(function(channel2) {
      return channel2.address === state.selections.topic;
    });
    if (!channelExists) {
      state.selections.topic = state.asyncApiData.channels[0]?.address || "";
    }
    const channel = getSelectedChannel();
    const operationExists = channel?.operations?.some(function(operation) {
      return operation.id === state.selections.operationId;
    });
    if (!operationExists) {
      state.selections.operationId = channel?.operations?.[0]?.id || "";
    }
  }

  // editor/src/api.js
  function getFile(nodeId) {
    return new Promise(function(resolve, reject) {
      $.ajax({
        url: `/async-api-red/${nodeId}/file`,
        type: "GET",
        success: function(response) {
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
  function uploadFile(nodeId, file) {
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
  function getData(nodeId) {
    return new Promise(function(resolve, reject) {
      $.ajax({
        type: "GET",
        url: `/async-api-red/${nodeId}/data`,
        success: resolve,
        error: reject
      });
    });
  }
  function saveUserSelections(nodeId, data) {
    return $.ajax({
      url: `/async-api-red/${nodeId}/user-selections`,
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify(data)
    });
  }
  function getUserSelections(nodeId) {
    return new Promise(function(resolve, reject) {
      $.ajax({
        url: `/async-api-red/${nodeId}/user-selections`,
        type: "GET",
        success: resolve,
        error: reject
      });
    });
  }
  function connectToServer(nodeId) {
    return new Promise(function(resolve, reject) {
      $.ajax({
        url: `/async-api-red/${nodeId}/server-connect`,
        type: "GET",
        success: resolve,
        error: reject
      });
    });
  }
  function handleMessage(nodeId, topicName) {
    return new Promise(function(resolve, reject) {
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

  // editor/src/dom-utils.js
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function clearFileInput() {
    $("#node-input-file").val("");
  }
  function getPayloadValuesFromUi() {
    const values = {};
    $("#node-messages-display").find(`input[data-node-id="${state.nodeId}"]`).each(function() {
      const name = $(this).data("field-name");
      if (!name) {
        return;
      }
      values[name] = $(this).val() || "";
    });
    return values;
  }
  function getParameterValuesFromUi() {
    const values = {};
    $("#node-parameters-display").find(`input[data-node-id="${state.nodeId}"]`).each(function() {
      const name = $(this).data("param-name");
      if (!name) {
        return;
      }
      values[name] = $(this).val() || "";
    });
    return values;
  }
  function syncStateFromUi() {
    state.selections.serverUrl = $("#node-input-select-server").val() || "";
    state.selections.topic = $("#node-input-channel").val() || "";
    state.selections.operationId = $("#node-input-operations").val() || "";
    state.selections.parameterValues = getParameterValuesFromUi();
    state.selections.payloadValues = getPayloadValuesFromUi();
  }
  function getExpectedPayloadFromOperation(operation) {
    const fields = [];
    if (!operation || !operation.messages) {
      return fields;
    }
    const messages = Array.isArray(operation.messages) ? operation.messages : Object.values(operation.messages);
    for (const message of messages) {
      const payload = Array.isArray(message?.payload) ? message.payload : Array.isArray(message?.message?.payload) ? message.message.payload : [];
      for (const field of payload) {
        fields.push(field);
      }
    }
    return fields;
  }

  // editor/src/render.js
  function resetUi() {
    $("#node-input-select-server").empty();
    $("#node-input-channel").empty();
    $("#node-input-operations").empty();
    $("#node-parameters-display").empty();
    $("#node-messages-display").empty();
  }
  function renderAll() {
    renderServers();
    renderChannels();
    renderOperations();
    renderParameters();
    renderMessages();
    applySelectionsToUi();
  }
  function renderServers() {
    const serverDropdown = $("#node-input-select-server");
    serverDropdown.empty();
    state.asyncApiData.servers.forEach(function(server) {
      serverDropdown.append(
        `<option value="${escapeHtml(server.url)}">${escapeHtml(server.url)}</option>`
      );
    });
  }
  function renderChannels() {
    const channelDropdown = $("#node-input-channel");
    channelDropdown.empty();
    state.asyncApiData.channels.forEach(function(channel) {
      channelDropdown.append(
        `<option value="${escapeHtml(channel.address)}">${escapeHtml(channel.address)}</option>`
      );
    });
  }
  function renderOperations() {
    const operationDropdown = $("#node-input-operations");
    const selectedChannel = getSelectedChannel();
    operationDropdown.empty();
    if (!selectedChannel || !Array.isArray(selectedChannel.operations) || !selectedChannel.operations.length) {
      return;
    }
    selectedChannel.operations.forEach(function(operation) {
      operationDropdown.append(
        `<option value="${escapeHtml(operation.id)}">${escapeHtml(operation.id)}</option>`
      );
    });
  }
  function renderParameters() {
    const container = $("#node-parameters-display");
    const selectedChannel = getSelectedChannel();
    const parameters = selectedChannel?.parameters || [];
    container.empty();
    if (!parameters.length) {
      container.append("<div>No parameters available for this channel.</div>");
      return;
    }
    parameters.forEach(function(param) {
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
  function renderMessages() {
    const container = $("#node-messages-display");
    const selectedOperation = getSelectedOperation();
    container.empty();
    if (!selectedOperation || !Array.isArray(selectedOperation.messages) || !selectedOperation.messages.length) {
      container.append("<div>No message payload fields available for this operation.</div>");
      return;
    }
    selectedOperation.messages.forEach(function(message) {
      if (!Array.isArray(message.payload) || !message.payload.length) {
        return;
      }
      message.payload.forEach(function(field) {
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
  function applySelectionsToUi() {
    $("#node-input-select-server").val(state.selections.serverUrl);
    $("#node-input-channel").val(state.selections.topic);
    $("#node-input-operations").val(state.selections.operationId);
  }

  // editor/src/events.js
  function bindStaticEvents() {
    $("#node-input-file").off("change.asyncapi").on("change.asyncapi", function(event) {
      const file = event.target.files[0];
      if (file && state.nodeId) {
        uploadFile(state.nodeId, file).then(function() {
          return getData(state.nodeId);
        }).then(function(data) {
          state.asyncApiData = normalizeAsyncApiData(data);
          ensureValidSelections();
          renderAll();
        }).catch(function() {
          RED.notify("File upload failed", "error");
        });
      }
    });
    $("#node-input-select-server").off("change.asyncapi").on("change.asyncapi", function() {
      state.selections.serverUrl = $(this).val() || "";
    });
    $("#node-input-channel").off("change.asyncapi").on("change.asyncapi", function() {
      state.selections.topic = $(this).val() || "";
      const channel = getSelectedChannel();
      state.selections.operationId = channel?.operations?.[0]?.id || "";
      renderOperations();
      renderParameters();
      renderMessages();
      applySelectionsToUi();
    });
    $("#node-input-operations").off("change.asyncapi").on("change.asyncapi", function() {
      state.selections.operationId = $(this).val() || "";
      renderMessages();
    });
    $("#node-parameters-display").off("input.asyncapi").on("input.asyncapi", "input[id^='node-input-param-']", function() {
      const name = this.id.replace("node-input-param-", "");
      state.selections.parameterValues[name] = $(this).val() || "";
    });
    $("#node-messages-display").off("input.asyncapi").on("input.asyncapi", "input[id^='node-input-']:not([id^='node-input-param-'])", function() {
      const name = this.id.replace("node-input-", "");
      state.selections.payloadValues[name] = $(this).val() || "";
    });
  }
  function subscribeRuntimeEvents(nodeId) {
    RED.comms.subscribe(`async-api-red/payload-update/${nodeId}`, function(topic, msg) {
      if (msg?.payload && typeof msg.payload === "object") {
        Object.entries(msg.payload).forEach(function([key, value]) {
          const input = $(`#node-input-${nodeId}-${key}`);
          if (input.length) {
            input.val(value);
          }
        });
      }
      if (msg?.parameters && typeof msg.parameters === "object") {
        Object.entries(msg.parameters).forEach(function([key, value]) {
          const input = $(`#node-input-param-${nodeId}-${key}`);
          if (input.length) {
            input.val(value);
          }
        });
      }
    });
    RED.comms.subscribe(`async-api-red/payload-error/${nodeId}`, function(topic, msg) {
      RED.notify(`\u274C Validation Error: ${msg.error}`, "error");
    });
  }
  function unsubscribeRuntimeEvents(nodeId) {
    if (RED.comms && typeof RED.comms.unsubscribe === "function") {
      RED.comms.unsubscribe(`async-api-red/payload-update/${nodeId}`);
      RED.comms.unsubscribe(`async-api-red/payload-error/${nodeId}`);
    }
  }

  // editor/src/controller.js
  function oneditprepare(node) {
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
    Promise.resolve().then(function() {
      if (isDuplicatedNode) {
        return null;
      }
      return getFile(node.id).catch(function() {
        return null;
      });
    }).then(function() {
      return getData(node.id);
    }).then(function(data) {
      state.asyncApiData = normalizeAsyncApiData(data);
      if (isDuplicatedNode) {
        return {};
      }
      return getUserSelections(node.id).catch(function() {
        return {};
      });
    }).then(function(saved) {
      applySavedSelections(saved || {});
      ensureValidSelections();
      renderAll();
    }).catch(function(err) {
      console.error("Editor init failed:", err);
      RED.notify("Failed to initialize AsyncAPI editor", "error");
    });
  }
  function oneditsave(node) {
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
    node.serverUrl = data.serverUrl;
    node.topic = data.topic;
    node.operation = data.operation;
    node.expectedPayload = data.expectedPayload;
    node.parameters = data.parameters;
    node.parameterValues = data.parameterValues;
    node.payload = data.payload;
    return saveUserSelections(node.id, data).then(function() {
      return connectToServer(node.id);
    }).then(function() {
      return handleMessage(node.id, selectedChannel.address);
    }).then(function() {
      unsubscribeRuntimeEvents(node.id);
    }).catch(function(err) {
      console.error("Failed during save/connect flow:", err);
      RED.notify("Failed to save selections or connect to MQTT server", "error");
    });
  }
  function oneditcancel(node) {
    if (state.nodeId) {
      unsubscribeRuntimeEvents(state.nodeId);
    }
    resetEditorState();
    resetUi();
    clearFileInput();
  }

  // editor/src/editor-main.js
  RED.nodes.registerType("async-api-red", {
    category: "network",
    color: "rgb(136 81 251)",
    defaults: {
      name: { value: "" },
      serverUrl: { value: "" },
      topic: { value: "" },
      operation: { value: null },
      expectedPayload: { value: [] },
      parameters: { value: [] },
      parameterValues: { value: {} },
      payload: { value: {} },
      savedNodeId: { value: "" }
    },
    inputs: 1,
    outputs: 1,
    icon: "white-globe.svg",
    /**
     * Label shown on workspace.
     */
    label: function() {
      return this.name || "AsyncApi-red";
    },
    /**
     * Editor lifecycle hooks.
     */
    oneditprepare: function() {
      oneditprepare(this);
    },
    oneditsave: function() {
      return oneditsave(this);
    },
    oneditcancel: function() {
      oneditcancel(this);
    }
  });
})();
