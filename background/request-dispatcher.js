import {
  BACKGROUND_REQUEST_SOURCE,
  BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS,
  assertBackgroundRequestError,
  assertBackgroundContractValue
} from "../shared/background-requests.js";

function handlerEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError("Background request handlers must be an entry array");
  const handlers = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new TypeError("Background request handler entries must be [action, handler] pairs");
    }
    const action = String(entry[0] || "");
    const handler = entry[1];
    if (!action || typeof handler !== "function") {
      throw new TypeError(`Invalid background request handler: ${action || "(empty)"}`);
    }
    if (handlers.has(action)) throw new TypeError(`Duplicate background request handler: ${action}`);
    handlers.set(action, handler);
  }
  return handlers;
}

function assertDispatcherCoverage(specifications, handlers, authorizers) {
  for (const [action, spec] of Object.entries(specifications)) {
    if (!handlers.has(action)) throw new TypeError(`Missing background request handler: ${action}`);
    if (!spec || typeof spec !== "object") throw new TypeError(`Invalid background request specification: ${action}`);
    if (!spec.senderClass || !spec.authorize) {
      throw new TypeError(`Background request authorization contract is incomplete: ${action}`);
    }
    const expectedAuthorizer = BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS[spec.senderClass];
    if (expectedAuthorizer && expectedAuthorizer !== spec.authorize) {
      throw new TypeError(`Background request sender/authorizer mismatch: ${action}`);
    }
    if (typeof spec.mutates !== "boolean") {
      throw new TypeError(`Background request mutation contract is invalid: ${action}`);
    }
    if (!spec.payload?.required || !spec.payload?.optional || !spec.response?.required || !spec.response?.optional) {
      throw new TypeError(`Background request payload/response contract is incomplete: ${action}`);
    }
    if (!spec.error?.envelope || !Array.isArray(spec.error?.codes)) {
      throw new TypeError(`Background request error contract is incomplete: ${action}`);
    }
    if (typeof authorizers[spec.authorize] !== "function") {
      throw new TypeError(`Missing background request authorizer: ${spec.authorize} (${action})`);
    }
  }
  for (const action of handlers.keys()) {
    if (!Object.hasOwn(specifications, action)) {
      throw new TypeError(`Unknown background request handler: ${action}`);
    }
  }
}

function resultPayload(action, value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Background response for ${action} must be an object`);
  }
  if (Object.hasOwn(value, "success") || Object.hasOwn(value, "error")) {
    throw new TypeError(`Background response for ${action} must not define envelope fields`);
  }
  return value;
}

export function createBackgroundRequestDispatcher(specs, entries, authorizers = {}) {
  const specifications = specs && typeof specs === "object" ? specs : {};
  const routes = handlerEntries(entries);
  const authorizationHooks = authorizers && typeof authorizers === "object" ? authorizers : {};
  assertDispatcherCoverage(specifications, routes, authorizationHooks);

  return async function dispatchBackgroundRequest(message, sender = {}) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new TypeError("Background request must be an object");
    }
    const action = String(message.action || "");
    if (message.source !== BACKGROUND_REQUEST_SOURCE) throw new Error("Invalid background request source");
    const spec = specifications[action];
    const handler = routes.get(action);
    if (!spec || !handler) throw new Error(`Unknown action: ${action}`);
    const payload = { ...message };
    delete payload.source;
    delete payload.action;
    assertBackgroundContractValue(spec.payload, payload, `Background request ${action}`);
    const authorization = await authorizationHooks[spec.authorize](message, sender, spec);
    let handled;
    try {
      handled = await handler(message, sender, authorization, spec);
    } catch (error) {
      assertBackgroundRequestError(spec, error, `Background handler ${action}`);
      throw error;
    }
    const result = resultPayload(action, handled);
    assertBackgroundContractValue(spec.response, result, `Background response ${action}`);
    return { success: true, ...result };
  };
}

function backgroundRequestErrorResponse(error) {
  const response = {
    success: false,
    error: String(error?.message || error || "Background request failed")
  };
  const code = String(error?.code || "").trim();
  if (code) response.code = code;
  if (typeof error?.delivered === "boolean") response.delivered = error.delivered;
  return response;
}

export function createBackgroundRequestListener(dispatch, options = {}) {
  if (typeof dispatch !== "function") throw new TypeError("Background request dispatcher is required");
  const source = String(options.source || BACKGROUND_REQUEST_SOURCE);
  return function onBackgroundRequest(message, sender, sendResponse) {
    if (message?.source !== source) return false;
    Promise.resolve()
      .then(() => dispatch(message, sender))
      .then(sendResponse, (error) => sendResponse(backgroundRequestErrorResponse(error)));
    return true;
  };
}
