export const BACKGROUND_REQUEST_SOURCE = "chatclub";

const BACKGROUND_REQUEST_SENDER_CLASSES = Object.freeze({
  EXTENSION_PAGE: "extension-page",
  DIRECT_CHILD_FRAME: "direct-child-frame",
  REGISTERED_FRAME: "registered-frame",
  GROK_FRAME: "grok-frame"
});

export const BACKGROUND_REQUEST_AUTHORIZERS = Object.freeze({
  EXTENSION_PAGE: "verifyExtensionPage",
  DIRECT_CHILD_FRAME: "verifyDirectChildFrame",
  REGISTERED_FRAME: "verifyRegisteredFrame",
  GROK_FRAME: "verifyGrokFrame"
});

export const BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS = Object.freeze({
  [BACKGROUND_REQUEST_SENDER_CLASSES.EXTENSION_PAGE]: BACKGROUND_REQUEST_AUTHORIZERS.EXTENSION_PAGE,
  [BACKGROUND_REQUEST_SENDER_CLASSES.DIRECT_CHILD_FRAME]: BACKGROUND_REQUEST_AUTHORIZERS.DIRECT_CHILD_FRAME,
  [BACKGROUND_REQUEST_SENDER_CLASSES.REGISTERED_FRAME]: BACKGROUND_REQUEST_AUTHORIZERS.REGISTERED_FRAME,
  [BACKGROUND_REQUEST_SENDER_CLASSES.GROK_FRAME]: BACKGROUND_REQUEST_AUTHORIZERS.GROK_FRAME
});

const BACKGROUND_REQUEST_ERROR_CONTRACT = Object.freeze({
  required: Object.freeze({ success: "boolean", error: "string" }),
  optional: Object.freeze({ code: "string", delivered: "boolean" })
});

const COMMON_BACKGROUND_REQUEST_ERROR_CODES = Object.freeze([]);
export const FRAME_ROUTE_ERROR_CODES = Object.freeze([
  "NOT_REGISTERED",
  "STALE_DOCUMENT",
  "INJECTION_FAILED",
  "TIMEOUT",
  "ABORTED",
  "REMOTE_ERROR"
]);

const EMPTY_FIELDS = Object.freeze({});
function fields(value = {}) {
  return Object.freeze({ ...value });
}

export function contract(required = EMPTY_FIELDS, optional = EMPTY_FIELDS) {
  return Object.freeze({ required: fields(required), optional: fields(optional) });
}

function requestSpec({
  senderClass,
  authorize,
  mutates = false,
  payload = contract(),
  response = contract(),
  errorCodes = COMMON_BACKGROUND_REQUEST_ERROR_CODES
}) {
  return Object.freeze({
    senderClass,
    authorize,
    mutates: Boolean(mutates),
    payload,
    response,
    error: Object.freeze({
      envelope: BACKGROUND_REQUEST_ERROR_CONTRACT,
      codes: Object.freeze([...errorCodes])
    })
  });
}

const SENDER = BACKGROUND_REQUEST_SENDER_CLASSES;
const AUTH = BACKGROUND_REQUEST_AUTHORIZERS;
export const extensionPageRequest = (options = {}) => requestSpec({
  senderClass: SENDER.EXTENSION_PAGE,
  authorize: AUTH.EXTENSION_PAGE,
  ...options
});
export const directChildFrameRequest = (options = {}) => requestSpec({
  senderClass: SENDER.DIRECT_CHILD_FRAME,
  authorize: AUTH.DIRECT_CHILD_FRAME,
  ...options
});
export const registeredFrameRequest = (options = {}) => requestSpec({
  senderClass: SENDER.REGISTERED_FRAME,
  authorize: AUTH.REGISTERED_FRAME,
  ...options
});
export const grokFrameRequest = (options = {}) => requestSpec({
  senderClass: SENDER.GROK_FRAME,
  authorize: AUTH.GROK_FRAME,
  ...options
});

export function backgroundRequestContract(actionName, spec) {
  const action = String(actionName || "").trim();
  if (!action || !spec || typeof spec !== "object") throw new TypeError("Background request contract is invalid");
  return Object.freeze({ action, spec });
}

function matchesContractType(value, type) {
  if (type === "any") return true;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

export function assertBackgroundContractValue(contractValue, value, label = "Background request") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const [field, type] of Object.entries(contractValue?.required || {})) {
    if (!Object.hasOwn(value, field)) throw new TypeError(`${label} is missing required field: ${field}`);
    if (!matchesContractType(value[field], type)) throw new TypeError(`${label}.${field} must be ${type}`);
  }
  for (const [field, type] of Object.entries(contractValue?.optional || {})) {
    if (Object.hasOwn(value, field) && value[field] !== undefined && !matchesContractType(value[field], type)) {
      throw new TypeError(`${label}.${field} must be ${type}`);
    }
  }
  const declared = new Set([
    ...Object.keys(contractValue?.required || {}),
    ...Object.keys(contractValue?.optional || {})
  ]);
  const unknown = Object.keys(value).filter((field) => !declared.has(field));
  if (unknown.length) throw new TypeError(`${label} has undeclared field: ${unknown.join(", ")}`);
  return value;
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const normalized = values.map((value) => String(value || "").trim());
  if (normalized.some((value) => !value)) throw new TypeError(`${label} contains an empty value`);
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} contains duplicates`);
  return normalized;
}

export function assertBackgroundRequestSpecifications(specifications, actions) {
  const expectedActions = uniqueStrings(Object.values(actions || {}), "Background request actions").sort();
  const actualActions = Object.keys(specifications || {}).sort();
  if (JSON.stringify(actualActions) !== JSON.stringify(expectedActions)) {
    throw new TypeError("Background request actions and specifications must have exact coverage");
  }
  for (const action of actualActions) {
    const spec = specifications[action];
    if (!spec || typeof spec !== "object") throw new TypeError(`Invalid background request specification: ${action}`);
    const expectedAuthorizer = BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS[spec.senderClass];
    if (!expectedAuthorizer) throw new TypeError(`Unknown background request sender class: ${action}`);
    if (spec.authorize !== expectedAuthorizer) {
      throw new TypeError(`Background request sender/authorizer mismatch: ${action}`);
    }
    if (typeof spec.mutates !== "boolean") throw new TypeError(`Background request mutation contract is invalid: ${action}`);
    if (!spec.payload?.required || !spec.payload?.optional || !spec.response?.required || !spec.response?.optional) {
      throw new TypeError(`Background request payload/response contract is incomplete: ${action}`);
    }
    if (spec.error?.envelope !== BACKGROUND_REQUEST_ERROR_CONTRACT) {
      throw new TypeError(`Background request error envelope is invalid: ${action}`);
    }
    uniqueStrings(spec.error?.codes || [], `Background request error codes (${action})`);
    if (spec.mutates && spec.error.envelope.optional?.delivered !== "boolean") {
      throw new TypeError(`Mutating background request must preserve delivery state: ${action}`);
    }
  }
  return specifications;
}

export function assertBackgroundRequestError(spec, error, label = "Background request") {
  const code = String(error?.code || "").trim();
  if (code && !spec?.error?.codes?.includes(code)) {
    throw new TypeError(`${label} returned undeclared error code: ${code}`, { cause: error });
  }
  if (error?.delivered !== undefined && typeof error.delivered !== "boolean") {
    throw new TypeError(`${label}.delivered must be boolean`, { cause: error });
  }
  return error;
}

class BackgroundRequestError extends Error {
  constructor(action, response, spec) {
    super(String(response?.error || `Background request failed: ${action}`));
    this.name = "BackgroundRequestError";
    this.action = String(action || "");
    this.mutates = spec?.mutates === true;
    const code = String(response?.code || "").trim();
    if (code) this.code = code;
    if (typeof response?.delivered === "boolean") this.delivered = response.delivered;
  }
}

function backgroundRequestMessageForContract(request, payload = {}) {
  const action = String(request?.action || "").trim();
  const spec = request?.spec;
  if (!action || !spec) throw new TypeError("Unknown background request contract");
  assertBackgroundContractValue(spec.payload, payload, `Background request ${action}`);
  return { source: BACKGROUND_REQUEST_SOURCE, action, ...payload };
}

export function createBackgroundRequestContractClient(sendMessage) {
  if (typeof sendMessage !== "function") throw new TypeError("Background request transport is required");
  return async function requestBackground(request, payload = {}) {
    const action = String(request?.action || "").trim();
    const spec = request?.spec;
    const message = backgroundRequestMessageForContract(request, payload);
    const response = await sendMessage(message);
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new TypeError(`Background response for ${action} must be an object`);
    }
    if (response.success !== true) {
      assertBackgroundContractValue(
        BACKGROUND_REQUEST_ERROR_CONTRACT,
        response,
        `Background error response ${action}`
      );
      assertBackgroundRequestError(spec, response, `Background error response ${action}`);
      throw new BackgroundRequestError(action, response, spec);
    }
    const payloadValue = { ...response };
    delete payloadValue.success;
    assertBackgroundContractValue(spec.response, payloadValue, `Background response ${action}`);
    return response;
  };
}
