import {
  backgroundRequestContract,
  contract,
  directChildFrameRequest,
  grokFrameRequest,
  registeredFrameRequest
} from "./background-request-core.js";

const request = (action, spec) => backgroundRequestContract(action, spec);

export const REGISTER_FRAME_CONTEXT_REQUEST = /* @__PURE__ */ request(
  "registerFrameContext",
  /* @__PURE__ */ directChildFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract({
      bridgeDocumentId: "string",
      browserDocumentId: "string",
      secureFrameToken: "string",
      frameBindingId: "string",
      bridgeVersion: "string",
      runtimeIdentity: "object"
    }),
    response: /* @__PURE__ */ contract({
      documentId: "string",
      browserDocumentId: "string",
      frameId: "integer",
      runtimeIdentity: "object"
    })
  })
);

export const RELAY_SHORTCUT_TRIGGERED_REQUEST = /* @__PURE__ */ request(
  "relayShortcutTriggered",
  /* @__PURE__ */ registeredFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract(
      { bridgeDocumentId: "string", browserDocumentId: "string", frameBindingId: "string", shortcutAction: "string" },
      { matchObj: "object" }
    )
  })
);

export const RELAY_FRAME_BINDING_REQUEST = /* @__PURE__ */ request(
  "relayFrameBinding",
  /* @__PURE__ */ registeredFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract({
      bridgeDocumentId: "string",
      browserDocumentId: "string",
      frameBindingId: "string",
      challenge: "string",
      generation: "integer"
    })
  })
);

export const RELAY_FRAME_LIFECYCLE_REQUEST = /* @__PURE__ */ request(
  "relayFrameLifecycle",
  /* @__PURE__ */ registeredFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract(
      { bridgeDocumentId: "string", browserDocumentId: "string", frameBindingId: "string", lifecycleAction: "string" },
      { data: "object" }
    )
  })
);

export const SYNC_GROK_SESSION_COOKIES_REQUEST = /* @__PURE__ */ request(
  "syncGrokSessionCookies",
  /* @__PURE__ */ grokFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract({ bridgeVersion: "string" }),
    response: /* @__PURE__ */ contract({
      supported: "boolean",
      changed: "boolean",
      created: "number",
      updated: "number",
      removed: "number",
      skipped: "number",
      reloadRequired: "boolean"
    })
  })
);

export const INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST = /* @__PURE__ */ request(
  "installTopicDeleteUserscript",
  /* @__PURE__ */ directChildFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract({ config: "object" }),
    response: /* @__PURE__ */ contract({ mode: "string", runtimeConfig: "object" }, { file: "string" })
  })
);

export const EXECUTE_SUMMARY_USERSCRIPT_REQUEST = /* @__PURE__ */ request(
  "executeSummaryUserscript",
  /* @__PURE__ */ directChildFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract({ configId: "string" }),
    response: /* @__PURE__ */ contract({ data: "object" })
  })
);

export const EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST = /* @__PURE__ */ request(
  "executeTopicDeleteUserscript",
  /* @__PURE__ */ directChildFrameRequest({
    mutates: true,
    payload: /* @__PURE__ */ contract({ configId: "string", payload: "object" }),
    response: /* @__PURE__ */ contract({ data: "object" })
  })
);

export const CONTENT_BACKGROUND_REQUEST_CONTRACTS = Object.freeze([
  REGISTER_FRAME_CONTEXT_REQUEST,
  RELAY_SHORTCUT_TRIGGERED_REQUEST,
  RELAY_FRAME_BINDING_REQUEST,
  RELAY_FRAME_LIFECYCLE_REQUEST,
  SYNC_GROK_SESSION_COOKIES_REQUEST,
  INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
  EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
  EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST
]);
