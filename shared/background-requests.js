import {
  BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS,
  BACKGROUND_REQUEST_AUTHORIZERS,
  BACKGROUND_REQUEST_SOURCE,
  FRAME_ROUTE_ERROR_CODES,
  assertBackgroundContractValue,
  assertBackgroundRequestError,
  assertBackgroundRequestSpecifications as assertSpecifications,
  backgroundRequestContract,
  contract,
  createBackgroundRequestContractClient,
  extensionPageRequest
} from "./background-request-core.js";
import {
  CONTENT_BACKGROUND_REQUEST_CONTRACTS,
  EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
  EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST,
  INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
  REGISTER_FRAME_CONTEXT_REQUEST,
  RELAY_FRAME_BINDING_REQUEST,
  RELAY_FRAME_LIFECYCLE_REQUEST,
  RELAY_SHORTCUT_TRIGGERED_REQUEST,
  SYNC_GROK_SESSION_COOKIES_REQUEST
} from "./content-background-requests.js";

export {
  BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS,
  BACKGROUND_REQUEST_AUTHORIZERS,
  BACKGROUND_REQUEST_SOURCE,
  FRAME_ROUTE_ERROR_CODES,
  assertBackgroundContractValue,
  assertBackgroundRequestError
};

export const BACKGROUND_REQUEST_ACTIONS = Object.freeze({
  CLAIM_WORKSPACE_SESSION_RECOVERY: "claimWorkspaceSessionRecovery",
  COMMIT_WORKSPACE_SESSION_RECOVERY: "commitWorkspaceSessionRecovery",
  REGISTER_FRAME_CONTEXT: REGISTER_FRAME_CONTEXT_REQUEST.action,
  SEND_FRAME_COMMAND: "sendFrameCommand",
  VERIFY_FRAME_CONTEXT: "verifyFrameContext",
  RELAY_SHORTCUT_TRIGGERED: RELAY_SHORTCUT_TRIGGERED_REQUEST.action,
  RELAY_FRAME_BINDING: RELAY_FRAME_BINDING_REQUEST.action,
  RELAY_FRAME_LIFECYCLE: RELAY_FRAME_LIFECYCLE_REQUEST.action,
  RELOAD_CONFIGS: "reloadConfigs",
  PREPARE_FRAME_LOAD: "prepareFrameLoad",
  MARK_GROK_FRAME_PREFLIGHT_FALLBACK: "markGrokFramePreflightFallback",
  SYNC_GROK_SESSION_COOKIES: SYNC_GROK_SESSION_COOKIES_REQUEST.action,
  GET_CONFIG_INFO: "getConfigInfo",
  RESET_CONFIG: "resetConfig",
  INSTALL_TOPIC_DELETE_USERSCRIPT: INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST.action,
  EXECUTE_SUMMARY_USERSCRIPT: EXECUTE_SUMMARY_USERSCRIPT_REQUEST.action,
  EXECUTE_TOPIC_DELETE_USERSCRIPT: EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST.action,
  ENSURE_CONTENT_BRIDGE: "ensureContentBridge",
  REQUEST_FRAME_BINDING: "requestFrameBinding",
  DISPATCH_TRUSTED_CLICK: "dispatchTrustedClick",
  DISPATCH_TRUSTED_MOUSE_MOVE: "dispatchTrustedMouseMove",
  DISPATCH_TRUSTED_KEY_SEQUENCE: "dispatchTrustedKeySequence",
  RECORD_FUNCTIONAL_ANOMALIES: "recordFunctionalAnomalies",
  LIST_FUNCTIONAL_ANOMALIES: "listFunctionalAnomalies",
  REMOVE_FUNCTIONAL_ANOMALIES: "removeFunctionalAnomalies",
  CLEAR_FUNCTIONAL_ANOMALIES: "clearFunctionalAnomalies",
  OPEN_WORKSPACE_TAB: "openWorkspaceTab",
  OPEN_TAB: "openTab"
});

const ACTION = BACKGROUND_REQUEST_ACTIONS;
const extensionPage = extensionPageRequest;
const contentSpecs = Object.fromEntries(
  CONTENT_BACKGROUND_REQUEST_CONTRACTS.map(({ action, spec }) => [action, spec])
);

export const BACKGROUND_REQUEST_SPECS = Object.freeze({
  [ACTION.CLAIM_WORKSPACE_SESSION_RECOVERY]: extensionPage({
    mutates: true,
    payload: contract({}, { workspaceId: "string" }),
    response: contract({
      claimed: "boolean",
      recovered: "boolean",
      workspaceId: "string",
      claimId: "string",
      workspaceSessionGeneration: "string",
      snapshot: "any"
    })
  }),
  [ACTION.COMMIT_WORKSPACE_SESSION_RECOVERY]: extensionPage({
    mutates: true,
    payload: contract({ workspaceId: "string", claimId: "string" }),
    response: contract({
      committed: "boolean",
      workspaceId: "string",
      claimId: "string",
      workspaceSessionGeneration: "string"
    })
  }),
  [ACTION.SEND_FRAME_COMMAND]: extensionPage({
    mutates: true,
    payload: contract(
      { appTabId: "integer", bridgeDocumentId: "string", command: "string" },
      { data: "object", timeoutMs: "number" }
    ),
    response: contract({ data: "any" }),
    errorCodes: FRAME_ROUTE_ERROR_CODES
  }),
  [ACTION.VERIFY_FRAME_CONTEXT]: extensionPage({
    payload: contract({ appTabId: "integer", bridgeDocumentId: "string" }),
    response: contract({ data: "object" })
  }),
  [ACTION.RELOAD_CONFIGS]: extensionPage({ mutates: true, payload: contract({}, { data: "object" }) }),
  [ACTION.PREPARE_FRAME_LOAD]: extensionPage({
    mutates: true,
    payload: contract({ url: "string" }, { preflightId: "string" }),
    response: contract({ grokCookieBridge: "object" })
  }),
  [ACTION.MARK_GROK_FRAME_PREFLIGHT_FALLBACK]: extensionPage({
    mutates: true,
    payload: contract({ url: "string", preflightId: "string" }),
    response: contract({ marked: "boolean" })
  }),
  [ACTION.GET_CONFIG_INFO]: extensionPage({
    response: contract({ options: "object", customConfig: "array", contentScripts: "array" })
  }),
  [ACTION.RESET_CONFIG]: extensionPage({
    mutates: true,
    response: contract({ options: "object", workspaceSessionGeneration: "string" })
  }),
  [ACTION.ENSURE_CONTENT_BRIDGE]: extensionPage({
    mutates: true,
    payload: contract({ tabId: "integer", hrefs: "array" }, {
      hosts: "array",
      features: "array",
      expectedFrameId: "integer",
      expectedBindingId: "string",
      bindingChallenge: "string",
      bindingGeneration: "integer"
    }),
    response: contract({
      tabId: "integer",
      frameIds: "array",
      injected: "integer",
      injectedFiles: "array",
      fallbackFiles: "array",
      plannedFiles: "array",
      browserDocumentId: "string",
      bindingRelayed: "boolean",
      features: "array",
      errors: "array"
    })
  }),
  [ACTION.REQUEST_FRAME_BINDING]: extensionPage({
    mutates: true,
    payload: contract({
      tabId: "integer",
      bindingChallenge: "string",
      bindingGeneration: "integer",
      expectedFrameId: "integer",
      expectedBindingId: "string"
    }, { hrefs: "array", hosts: "array", browserDocumentId: "string" }),
    response: contract({ tabId: "integer", frameId: "integer", browserDocumentId: "string", bindingRelayed: "boolean" })
  }),
  [ACTION.DISPATCH_TRUSTED_CLICK]: extensionPage({
    mutates: true,
    payload: contract({
      tabId: "integer",
      expectedFrameId: "integer",
      expectedBindingId: "string",
      expectedBrowserDocumentId: "string",
      expectedBridgeDocumentId: "string",
      expectedFrameHref: "string",
      x: "number",
      y: "number"
    }, { kind: "string", hoverSettleMs: "number", reason: "string" }),
    response: contract({ tabId: "integer", frameId: "integer", x: "number", y: "number" })
  }),
  [ACTION.DISPATCH_TRUSTED_MOUSE_MOVE]: extensionPage({
    mutates: true,
    payload: contract({
      tabId: "integer",
      expectedFrameId: "integer",
      expectedBindingId: "string",
      expectedBrowserDocumentId: "string",
      expectedBridgeDocumentId: "string",
      expectedFrameHref: "string",
      x: "number",
      y: "number"
    }, { kind: "string", reason: "string" }),
    response: contract({ tabId: "integer", frameId: "integer", x: "number", y: "number" })
  }),
  [ACTION.DISPATCH_TRUSTED_KEY_SEQUENCE]: extensionPage({
    mutates: true,
    payload: contract({
      tabId: "integer",
      expectedFrameId: "integer",
      expectedBindingId: "string",
      expectedBrowserDocumentId: "string",
      expectedBridgeDocumentId: "string",
      expectedFrameHref: "string",
      keys: "array"
    }, { keySettleMs: "number", kind: "string", reason: "string" }),
    response: contract({ tabId: "integer", frameId: "integer", keys: "array" })
  }),
  [ACTION.RECORD_FUNCTIONAL_ANOMALIES]: extensionPage({
    mutates: true,
    payload: contract({}, {
      feature: "string",
      operation: "string",
      appId: "string",
      appName: "string",
      host: "string",
      errorName: "string",
      errorCode: "string",
      delivered: "boolean",
      reason: "string",
      message: "string",
      severity: "string",
      appVersion: "string",
      surface: "string"
    }),
    response: contract({ record: "object", records: "array" })
  }),
  [ACTION.LIST_FUNCTIONAL_ANOMALIES]: extensionPage({
    response: contract({ records: "array" })
  }),
  [ACTION.REMOVE_FUNCTIONAL_ANOMALIES]: extensionPage({
    mutates: true,
    payload: contract({ id: "string" }),
    response: contract({ records: "array" })
  }),
  [ACTION.CLEAR_FUNCTIONAL_ANOMALIES]: extensionPage({
    mutates: true,
    response: contract({ records: "array" })
  }),
  [ACTION.OPEN_WORKSPACE_TAB]: extensionPage({
    mutates: true,
    response: contract({ tabId: "integer" })
  }),
  [ACTION.OPEN_TAB]: extensionPage({
    mutates: true,
    payload: contract({ url: "string" }, { openerTab: "object" })
  }),
  ...contentSpecs
});

const requestContracts = Object.freeze(Object.fromEntries(
  Object.entries(BACKGROUND_REQUEST_SPECS).map(([action, spec]) => [
    action,
    backgroundRequestContract(action, spec)
  ])
));

export function createBackgroundRequestClient(sendMessage) {
  const requestContract = createBackgroundRequestContractClient(sendMessage);
  return function requestBackground(actionName, payload = {}) {
    const action = String(actionName || "").trim();
    const request = requestContracts[action];
    if (!request) throw new TypeError(`Unknown background request action: ${action || "(empty)"}`);
    return requestContract(request, payload);
  };
}

assertSpecifications(BACKGROUND_REQUEST_SPECS, BACKGROUND_REQUEST_ACTIONS);
