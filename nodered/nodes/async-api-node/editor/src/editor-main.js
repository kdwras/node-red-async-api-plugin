/**
 * =====================================================================
 * Editor Main Module
 * =====================================================================
 *
 * Responsibilities:
 * - Register custom node type in Node-RED
 * - Delegate editor lifecycle hooks to controller module
 */
import {
    oneditprepare,
    oneditsave,
    oneditcancel
} from "./controller.js";

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
        payload: { value: {} }
    },

    inputs: 1,
    outputs: 1,
    icon: "white-globe.svg",

    /**
     * Label shown on workspace.
     */
    label: function () {
        return this.name || "AsyncApi-red";
    },

    /**
     * Editor lifecycle hooks.
     */
    oneditprepare: function () {
        oneditprepare(this);
    },

    oneditsave: function () {
        return oneditsave(this);
    },

    oneditcancel: function () {
        oneditcancel(this);
    }
});