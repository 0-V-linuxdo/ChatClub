(() => {
  // shared/protocol.js
  var GENERIC_POST_MESSAGE_SOURCE = "chatclub";
  var NATIVE_COPY_SOURCE = "chatclub-native-copy:2026.07.15.1";
  var GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker:2026.07.13.3";
  var MAIN_WORLD_LOCATION_SOURCE = "chatclub:main-world-location:2026.07.13.3";
  var NOTION_SEND_TEXT_SOURCE = "chatclub-notion-send-text:2026.07.15.2";
  var NOTION_SEND_PROMPT_SOURCE = "chatclub-notion-send-prompt:2026.07.15.2";
  var NOTION_SEND_TEXT_EVENT = "chatclub:notion-send-text:2026.07.15.2";
  var NOTION_SEND_PROMPT_EVENT = "chatclub:notion-send-prompt:2026.07.15.2";
  var NOTION_SEND_ACTIVATED_EVENT = "chatclub:notion-send-activated:2026.07.15.2";
  var SEND_TEXT_POST_MESSAGE_SOURCE = "chatclub:send-text:2026.07.16.2";
  var DELETE_THREAD_POST_MESSAGE_SOURCE = "chatclub:delete-thread:2026.07.16.2";
  var MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = "chatclub:message-navigator:2026.07.16.2";
  var SUMMARY_POST_MESSAGE_SOURCE = "chatclub:summary:2026.07.16.2";
  var PREFERRED_MODEL_POST_MESSAGE_SOURCE = "chatclub:preferred-model:2026.07.16.2";
  var CONTENT_BRIDGE_VERSION = "2026.07.16.2";
  var EXTENSION_RUNTIME_RELAY_SOURCE = "chatclub:runtime-relay:2026.07.16.2";
  var FRAME_BINDING_POST_MESSAGE_SOURCE = `chatclub:frame-binding:${CONTENT_BRIDGE_VERSION}`;
  var SECURE_FRAME_COMMAND_SOURCE = "chatclub:frame-command:2026.07.16.2";
  var DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread:2026.08.01.1";
  var PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript:2026.07.16.2";
  var RUNTIME_REGISTRY_ABI_VERSION = 2;
  var RUNTIME_REGISTRY_KEY = `__CHATCLUB_RUNTIME_REGISTRY_V${RUNTIME_REGISTRY_ABI_VERSION}__`;
  var RUNTIME_MIGRATION_STAGE_KEY = `__CHATCLUB_RUNTIME_MIGRATION_STAGE_V${RUNTIME_REGISTRY_ABI_VERSION}__`;
  var NAVIGATION_FOCUS_GUARD_RUNTIME = "navigation-focus-guard";
  var NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION = "2026.07.15.2";
  var FRAME_TOAST_POSITION_EVENT = "chatclub:frame-toast-position:2026.07.13.1";
  var CUSTOM_SUMMARY_EXECUTOR = "__CHATCLUB_SUMMARY_CUSTOM_EXECUTOR_2026_07_14__";
  var TOPIC_DELETE_REQUEST_EVENT = "chatclub:delete-site:request";
  var TOPIC_DELETE_MENU_COMMAND_EVENT = "chatclub:delete-site:menu-command";
  var TOPIC_DELETE_RESULT_EVENT = "chatclub:delete-site:result";
  var TOPIC_DELETE_PING_EVENT = "chatclub:delete-site:ping";
  var TOPIC_DELETE_READY_EVENT = "chatclub:delete-site:ready";
  var TOPIC_DELETE_BRIDGE_SOURCE = "chatclub-delete-sites";
  var CONTENT_PROTOCOL = Object.freeze({
    GENERIC_POST_MESSAGE_SOURCE,
    NATIVE_COPY_SOURCE,
    GEMINI_MODEL_PICKER_SOURCE,
    MAIN_WORLD_LOCATION_SOURCE,
    NOTION_SEND_TEXT_SOURCE,
    NOTION_SEND_PROMPT_SOURCE,
    NOTION_SEND_TEXT_EVENT,
    NOTION_SEND_PROMPT_EVENT,
    NOTION_SEND_ACTIVATED_EVENT,
    SEND_TEXT_POST_MESSAGE_SOURCE,
    DELETE_THREAD_POST_MESSAGE_SOURCE,
    MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE,
    SUMMARY_POST_MESSAGE_SOURCE,
    PREFERRED_MODEL_POST_MESSAGE_SOURCE,
    CONTENT_BRIDGE_VERSION,
    EXTENSION_RUNTIME_RELAY_SOURCE,
    FRAME_BINDING_POST_MESSAGE_SOURCE,
    SECURE_FRAME_COMMAND_SOURCE,
    DEEPSEEK_DELETE_SOURCE,
    PAGE_SUMMARY_SOURCE,
    NAVIGATION_FOCUS_GUARD_RUNTIME,
    NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
    FRAME_TOAST_POSITION_EVENT,
    CUSTOM_SUMMARY_EXECUTOR,
    TOPIC_DELETE_REQUEST_EVENT,
    TOPIC_DELETE_MENU_COMMAND_EVENT,
    TOPIC_DELETE_RESULT_EVENT,
    TOPIC_DELETE_PING_EVENT,
    TOPIC_DELETE_READY_EVENT,
    TOPIC_DELETE_BRIDGE_SOURCE
  });

  // chatclub-runtime-version:shared/content-runtime-version.generated.js
  var CONTENT_RUNTIME_PROTOCOL_VERSION = "2026.07.16.2";
  var CONTENT_RUNTIME_SOURCE_SHA256 = "e66523d447d225e24609db367336dc89c6220e49159fdfa601148c1ad2c50daf";
  var CONTENT_RUNTIME_BUILD_RECIPE_VERSION = "1+recipe.47d871506813d2066becb2ac4b8e101df80e418ad697eadddf5e577fcc1a3a76";
  var CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "47d871506813d2066becb2ac4b8e101df80e418ad697eadddf5e577fcc1a3a76";
  var CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "2d9de5b5cbd4fbdd9ef0d3a2bde30c98b40720f49e38ed504880d9766ca4998e";
  var CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "2026.07.16.2+implementation.2d9de5b5cbd4fbdd9ef0d3a2bde30c98b40720f49e38ed504880d9766ca4998e";
  var CONTENT_RUNTIME_DELETE_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/delete.js", "entryPath": "content-src/content-delete.js", "sourceSha256": "90881bc50ee3e75c9460ed8edcd70344ed324a656150a3bb5ec4f6ab9d5e06a2", "implementationSha256": "df0b383b3452090073f2c3940596fb5e61dcc4645ec406c2d25fff87278a3c52", "implementationVersion": "2026.07.16.2+bundle.df0b383b3452090073f2c3940596fb5e61dcc4645ec406c2d25fff87278a3c52" });

  // shared/content-runtime-identity.js
  if (CONTENT_RUNTIME_PROTOCOL_VERSION !== CONTENT_BRIDGE_VERSION) {
    throw new Error("Generated content runtime identity does not match the packaged protocol");
  }
  var CONTENT_RUNTIME_IDENTITY = Object.freeze({
    protocolVersion: CONTENT_RUNTIME_PROTOCOL_VERSION,
    implementationVersion: CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
    implementationSha256: CONTENT_RUNTIME_IMPLEMENTATION_SHA256,
    sourceSha256: CONTENT_RUNTIME_SOURCE_SHA256,
    buildRecipeVersion: CONTENT_RUNTIME_BUILD_RECIPE_VERSION,
    buildRecipeSha256: CONTENT_RUNTIME_BUILD_RECIPE_SHA256
  });
  var IDENTITY_FIELDS = Object.freeze(Object.keys(CONTENT_RUNTIME_IDENTITY));
  var BUNDLE_IDENTITY_FIELDS = Object.freeze([
    "outputPath",
    "entryPath",
    "sourceSha256",
    "implementationSha256",
    "implementationVersion"
  ]);
  function normalizeContentRuntimeBundleIdentity(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.freeze(Object.fromEntries(
      BUNDLE_IDENTITY_FIELDS.map((field) => [field, String(source[field] || "")])
    ));
  }
  function createContentRuntimeBundleIdentity(bundle) {
    const normalized = normalizeContentRuntimeBundleIdentity(bundle);
    if (BUNDLE_IDENTITY_FIELDS.some((field) => !normalized[field])) {
      throw new TypeError("Packaged content runtime bundle identity is incomplete");
    }
    return Object.freeze({ ...CONTENT_RUNTIME_IDENTITY, bundle: normalized });
  }

  // shared/delete-completion.js
  var DELETE_COMPLETION_STATE_VERSION = 1;
  var MAX_IDENTITY_ID_LENGTH = 512;
  function hostMatches(host, roots = []) {
    return roots.some((root) => host === root || host.endsWith(`.${root}`));
  }
  function cleanIdentityId(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > MAX_IDENTITY_ID_LENGTH) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  function identity(provider, value) {
    const id = cleanIdentityId(value);
    return id ? Object.freeze({ provider, id }) : null;
  }
  function normalizeDeleteConversationIdentity(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const provider = String(value.provider || "").trim();
    if (!/^(?:chatgpt|claude|gemini|kagi|notion|grok|deepseek)$/.test(provider)) return null;
    return identity(provider, value.id);
  }
  function normalizeDeleteFrameHref(value) {
    try {
      const url = new URL(String(value || ""));
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function deleteConversationIdentityFromHref(value, baseHref = void 0) {
    let url;
    try {
      url = baseHref ? new URL(String(value || ""), String(baseHref)) : new URL(String(value || ""));
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname || "/";
    let match = null;
    if (hostMatches(host, ["chatgpt.com", "chat.openai.com"])) {
      match = /\/(?:g\/[^/?#]+\/)?c\/([^/?#]+)/i.exec(path);
      return match ? identity("chatgpt", match[1]) : null;
    }
    if (hostMatches(host, ["claude.ai"])) {
      match = /^\/chat\/([^/?#]+)\/?$/i.exec(path);
      return match ? identity("claude", match[1]) : null;
    }
    if (hostMatches(host, ["gemini.google.com", "bard.google.com"])) {
      match = /^\/app\/([^/?#]+)/i.exec(path);
      return match ? identity("gemini", match[1]) : null;
    }
    if (host === "assistant.kagi.com") {
      match = /^\/chat\/([^/?#]+)/i.exec(path);
      return match ? identity("kagi", match[1]) : null;
    }
    if (hostMatches(host, ["app.notion.com", "notion.so"]) && /^\/chat\/?$/i.test(path)) {
      return identity("notion", url.searchParams.get("t"));
    }
    if (hostMatches(host, ["grok.com", "grok.x.ai", "gk.dairoot.cn"])) {
      match = /^\/(?:c|chat)\/([^/?#]+)/i.exec(path);
      return match ? identity("grok", match[1]) : null;
    }
    if (hostMatches(host, ["deepseek.com"])) {
      match = /\/(?:a\/)?chat\/s\/([^/?#]+)/i.exec(path);
      return match ? identity("deepseek", match[1]) : null;
    }
    return null;
  }
  function sameDeleteConversationIdentity(left, right) {
    const normalizedLeft = normalizeDeleteConversationIdentity(left);
    const normalizedRight = normalizeDeleteConversationIdentity(right);
    return Boolean(
      normalizedLeft && normalizedRight && normalizedLeft.provider === normalizedRight.provider && normalizedLeft.id === normalizedRight.id
    );
  }
  function deleteCompletionTargetState(expectedIdentity, currentHref, linkHrefs = []) {
    const expected = normalizeDeleteConversationIdentity(expectedIdentity);
    if (!expected) return null;
    const current = deleteConversationIdentityFromHref(currentHref);
    const present = (Array.isArray(linkHrefs) ? linkHrefs : []).some((href) => sameDeleteConversationIdentity(expected, deleteConversationIdentityFromHref(href, currentHref)));
    return {
      identity: expected,
      current: sameDeleteConversationIdentity(expected, current),
      present
    };
  }

  // shared/background-request-core.js
  var BACKGROUND_REQUEST_SOURCE = "chatclub";
  var BACKGROUND_REQUEST_SENDER_CLASSES = Object.freeze({
    EXTENSION_PAGE: "extension-page",
    DIRECT_CHILD_FRAME: "direct-child-frame",
    REGISTERED_FRAME: "registered-frame",
    GROK_FRAME: "grok-frame"
  });
  var BACKGROUND_REQUEST_AUTHORIZERS = Object.freeze({
    EXTENSION_PAGE: "verifyExtensionPage",
    DIRECT_CHILD_FRAME: "verifyDirectChildFrame",
    REGISTERED_FRAME: "verifyRegisteredFrame",
    GROK_FRAME: "verifyGrokFrame"
  });
  var BACKGROUND_REQUEST_AUTHORIZER_BY_SENDER_CLASS = Object.freeze({
    [BACKGROUND_REQUEST_SENDER_CLASSES.EXTENSION_PAGE]: BACKGROUND_REQUEST_AUTHORIZERS.EXTENSION_PAGE,
    [BACKGROUND_REQUEST_SENDER_CLASSES.DIRECT_CHILD_FRAME]: BACKGROUND_REQUEST_AUTHORIZERS.DIRECT_CHILD_FRAME,
    [BACKGROUND_REQUEST_SENDER_CLASSES.REGISTERED_FRAME]: BACKGROUND_REQUEST_AUTHORIZERS.REGISTERED_FRAME,
    [BACKGROUND_REQUEST_SENDER_CLASSES.GROK_FRAME]: BACKGROUND_REQUEST_AUTHORIZERS.GROK_FRAME
  });
  var BACKGROUND_REQUEST_ERROR_CONTRACT = Object.freeze({
    required: Object.freeze({ success: "boolean", error: "string" }),
    optional: Object.freeze({ code: "string", delivered: "boolean" })
  });
  var COMMON_BACKGROUND_REQUEST_ERROR_CODES = Object.freeze([]);
  var FRAME_ROUTE_ERROR_CODES = Object.freeze([
    "NOT_REGISTERED",
    "STALE_DOCUMENT",
    "INJECTION_FAILED",
    "TIMEOUT",
    "ABORTED",
    "REMOTE_ERROR"
  ]);
  var EMPTY_FIELDS = Object.freeze({});
  function fields(value = {}) {
    return Object.freeze({ ...value });
  }
  function contract(required = EMPTY_FIELDS, optional = EMPTY_FIELDS) {
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
  var SENDER = BACKGROUND_REQUEST_SENDER_CLASSES;
  var AUTH = BACKGROUND_REQUEST_AUTHORIZERS;
  var directChildFrameRequest = (options = {}) => requestSpec({
    senderClass: SENDER.DIRECT_CHILD_FRAME,
    authorize: AUTH.DIRECT_CHILD_FRAME,
    ...options
  });
  var registeredFrameRequest = (options = {}) => requestSpec({
    senderClass: SENDER.REGISTERED_FRAME,
    authorize: AUTH.REGISTERED_FRAME,
    ...options
  });
  var grokFrameRequest = (options = {}) => requestSpec({
    senderClass: SENDER.GROK_FRAME,
    authorize: AUTH.GROK_FRAME,
    ...options
  });
  function backgroundRequestContract(actionName, spec) {
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
  function assertBackgroundContractValue(contractValue, value, label = "Background request") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${label} must be an object`);
    }
    for (const [field, type] of Object.entries(contractValue?.required || {})) {
      if (!Object.hasOwn(value, field)) throw new TypeError(`${label} is missing required field: ${field}`);
      if (!matchesContractType(value[field], type)) throw new TypeError(`${label}.${field} must be ${type}`);
    }
    for (const [field, type] of Object.entries(contractValue?.optional || {})) {
      if (Object.hasOwn(value, field) && value[field] !== void 0 && !matchesContractType(value[field], type)) {
        throw new TypeError(`${label}.${field} must be ${type}`);
      }
    }
    const declared = /* @__PURE__ */ new Set([
      ...Object.keys(contractValue?.required || {}),
      ...Object.keys(contractValue?.optional || {})
    ]);
    const unknown = Object.keys(value).filter((field) => !declared.has(field));
    if (unknown.length) throw new TypeError(`${label} has undeclared field: ${unknown.join(", ")}`);
    return value;
  }
  function assertBackgroundRequestError(spec, error, label = "Background request") {
    const code = String(error?.code || "").trim();
    if (code && !spec?.error?.codes?.includes(code)) {
      throw new TypeError(`${label} returned undeclared error code: ${code}`, { cause: error });
    }
    if (error?.delivered !== void 0 && typeof error.delivered !== "boolean") {
      throw new TypeError(`${label}.delivered must be boolean`, { cause: error });
    }
    return error;
  }
  var BackgroundRequestError = class extends Error {
    constructor(action, response, spec) {
      super(String(response?.error || `Background request failed: ${action}`));
      this.name = "BackgroundRequestError";
      this.action = String(action || "");
      this.mutates = spec?.mutates === true;
      const code = String(response?.code || "").trim();
      if (code) this.code = code;
      if (typeof response?.delivered === "boolean") this.delivered = response.delivered;
    }
  };
  function backgroundRequestMessageForContract(request2, payload = {}) {
    const action = String(request2?.action || "").trim();
    const spec = request2?.spec;
    if (!action || !spec) throw new TypeError("Unknown background request contract");
    assertBackgroundContractValue(spec.payload, payload, `Background request ${action}`);
    return { source: BACKGROUND_REQUEST_SOURCE, action, ...payload };
  }
  function createBackgroundRequestContractClient(sendMessage) {
    if (typeof sendMessage !== "function") throw new TypeError("Background request transport is required");
    return async function requestBackground2(request2, payload = {}) {
      const action = String(request2?.action || "").trim();
      const spec = request2?.spec;
      const message = backgroundRequestMessageForContract(request2, payload);
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

  // shared/content-background-requests.js
  var request = (action, spec) => backgroundRequestContract(action, spec);
  var REGISTER_FRAME_CONTEXT_REQUEST = /* @__PURE__ */ request(
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
  var RELAY_SHORTCUT_TRIGGERED_REQUEST = /* @__PURE__ */ request(
    "relayShortcutTriggered",
    /* @__PURE__ */ registeredFrameRequest({
      mutates: true,
      payload: /* @__PURE__ */ contract(
        { bridgeDocumentId: "string", browserDocumentId: "string", frameBindingId: "string", shortcutAction: "string" },
        { matchObj: "object" }
      )
    })
  );
  var RELAY_FRAME_BINDING_REQUEST = /* @__PURE__ */ request(
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
  var RELAY_FRAME_LIFECYCLE_REQUEST = /* @__PURE__ */ request(
    "relayFrameLifecycle",
    /* @__PURE__ */ registeredFrameRequest({
      mutates: true,
      payload: /* @__PURE__ */ contract(
        { bridgeDocumentId: "string", browserDocumentId: "string", frameBindingId: "string", lifecycleAction: "string" },
        { data: "object" }
      )
    })
  );
  var SYNC_GROK_SESSION_COOKIES_REQUEST = /* @__PURE__ */ request(
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
  var ARM_GROK_MIRROR_ACCOUNT_SWITCH_REQUEST = /* @__PURE__ */ request(
    "armGrokMirrorAccountSwitch",
    /* @__PURE__ */ grokFrameRequest({
      mutates: true,
      payload: /* @__PURE__ */ contract({ bridgeVersion: "string" }),
      response: /* @__PURE__ */ contract({ armed: "boolean", proceed: "boolean" })
    })
  );
  var INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST = /* @__PURE__ */ request(
    "installTopicDeleteUserscript",
    /* @__PURE__ */ directChildFrameRequest({
      mutates: true,
      payload: /* @__PURE__ */ contract({ config: "object" }),
      response: /* @__PURE__ */ contract({ mode: "string", runtimeConfig: "object" }, { file: "string" })
    })
  );
  var EXECUTE_SUMMARY_USERSCRIPT_REQUEST = /* @__PURE__ */ request(
    "executeSummaryUserscript",
    /* @__PURE__ */ directChildFrameRequest({
      mutates: true,
      payload: /* @__PURE__ */ contract({ configId: "string" }),
      response: /* @__PURE__ */ contract({ data: "object" })
    })
  );
  var EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST = /* @__PURE__ */ request(
    "executeTopicDeleteUserscript",
    /* @__PURE__ */ directChildFrameRequest({
      mutates: true,
      payload: /* @__PURE__ */ contract({ configId: "string", payload: "object" }),
      response: /* @__PURE__ */ contract({ data: "object" })
    })
  );
  var CONTENT_BACKGROUND_REQUEST_CONTRACTS = Object.freeze([
    REGISTER_FRAME_CONTEXT_REQUEST,
    RELAY_SHORTCUT_TRIGGERED_REQUEST,
    RELAY_FRAME_BINDING_REQUEST,
    RELAY_FRAME_LIFECYCLE_REQUEST,
    SYNC_GROK_SESSION_COOKIES_REQUEST,
    ARM_GROK_MIRROR_ACCOUNT_SWITCH_REQUEST,
    INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
    EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
    EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST
  ]);

  // content-src/shared/summary-runtime.js
  var sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
  var normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  function visible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }
  function qsa(selector, root = document, options = {}) {
    try {
      const result = Array.from(root.querySelectorAll(selector));
      return options.all === false ? result.slice(0, 1) : result;
    } catch {
      return [];
    }
  }
  function closest(el, selector) {
    try {
      return el?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }
  function reveal(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      for (const type of ["pointerover", "pointermove", "mouseover", "mousemove"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    } catch {
    }
  }
  function classText(el) {
    const value = el?.getAttribute?.("class") || el?.className || "";
    return typeof value === "string" ? value : value?.baseVal || "";
  }
  function buttonText(el) {
    if (!el) return "";
    const labelledBy = String(el.getAttribute?.("aria-labelledby") || "").split(/\s+/).map((id) => id && document.getElementById(id)).filter(Boolean).map((node) => node.innerText || node.textContent || "").join(" ");
    return normalize([
      el.getAttribute?.("aria-label"),
      labelledBy,
      el.getAttribute?.("aria-description"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-tooltip"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"),
      el.innerText || el.textContent || ""
    ].filter(Boolean).join(" "));
  }
  function matches(el, selector) {
    try {
      return Boolean(el?.matches?.(selector));
    } catch {
      return false;
    }
  }
  function activateElement(button) {
    button.focus?.();
    reveal(button);
    const init = { bubbles: true, cancelable: true, view: window };
    try {
      if (window.PointerEvent) {
        button.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }));
        button.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
      }
    } catch {
    }
    button.dispatchEvent(new MouseEvent("mousedown", init));
    button.dispatchEvent(new MouseEvent("mouseup", init));
    button.dispatchEvent(new MouseEvent("click", init));
    button.click?.();
  }

  // content-src/shared/content-document-identity.js
  function randomHex(cryptoApi, byteLength) {
    const bytes = new Uint8Array(byteLength);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  function browserDocumentAttestationState(target, cryptoApi) {
    const key = "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__";
    const pattern = /^legacy:[a-f0-9]{64}$/i;
    const rotate = (state2) => {
      state2.id = `legacy:${randomHex(cryptoApi, 32)}`;
      state2.epoch = Number.isSafeInteger(state2.epoch) && state2.epoch > 0 && state2.epoch < Number.MAX_SAFE_INTEGER ? state2.epoch + 1 : 1;
      state2.dirty = false;
    };
    let state = target[key];
    if (state) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor || descriptor.configurable || descriptor.writable || descriptor.value !== state || typeof state !== "object" || !pattern.test(String(state.id || "")) || !Number.isSafeInteger(state.epoch) || state.epoch <= 0 || typeof state.dirty !== "boolean" || typeof state.lifecycleInstalled !== "boolean") throw new Error("Browser document attestation state is invalid");
    } else {
      state = { id: "", epoch: 0, dirty: false, lifecycleInstalled: false };
      rotate(state);
      Object.defineProperty(target, key, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: state
      });
    }
    if (!state.lifecycleInstalled) {
      state.lifecycleInstalled = true;
      target.addEventListener("pagehide", () => {
        state.dirty = true;
      }, { capture: true });
      target.addEventListener("pageshow", () => {
        if (state.dirty) rotate(state);
      }, { capture: true });
    }
    return { state, rotate };
  }
  function createContentDocumentIdentity(target = globalThis) {
    const cryptoApi = target.crypto || globalThis.crypto;
    if (!cryptoApi?.getRandomValues) throw new Error("Secure randomness is unavailable");
    const contentDocumentId = target.__CHATCLUB_CONTENT_DOCUMENT_ID__ || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    target.__CHATCLUB_CONTENT_DOCUMENT_ID__ = contentDocumentId;
    const secureFrameToken = target.__CHATCLUB_SECURE_FRAME_TOKEN__ || randomHex(cryptoApi, 16);
    target.__CHATCLUB_SECURE_FRAME_TOKEN__ = secureFrameToken;
    const attestation = browserDocumentAttestationState(target, cryptoApi);
    const currentBrowserDocumentAttestationId = ({ allowDirty = false } = {}) => {
      const { state, rotate } = attestation;
      if (state.dirty && !allowDirty) rotate(state);
      return String(state.id || "");
    };
    const SearchParams = target.URLSearchParams || globalThis.URLSearchParams;
    const initialFrameBindingId = (() => {
      try {
        const values = new SearchParams(String(target.name || "")).getAll("chatclub_frame_binding");
        return values.length === 1 && /^[a-f0-9]{64}$/i.test(values[0]) ? values[0] : "";
      } catch {
        return "";
      }
    })();
    const currentFrameBindingId = () => {
      const bootstrap = String(target.__CHATCLUB_FRAME_BINDING_ID__ || "");
      if (bootstrap) return /^[a-f0-9]{64}$/i.test(bootstrap) ? bootstrap : "";
      return initialFrameBindingId;
    };
    return Object.freeze({
      contentDocumentId,
      secureFrameToken,
      currentBrowserDocumentAttestationId,
      currentFrameBindingId
    });
  }

  // content-src/shared/runtime-registry-client.js
  function runtimeRegistry(target = globalThis) {
    const broker = target[RUNTIME_REGISTRY_KEY];
    if (!broker || broker.abiVersion !== RUNTIME_REGISTRY_ABI_VERSION || typeof broker.beginGeneration !== "function") {
      throw new Error("Content base runtime broker must be installed before optional capabilities");
    }
    return broker.beginGeneration(CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  }

  // shared/frame-commands.js
  function command(options) {
    return Object.freeze({
      timeoutMs: 5e3,
      mutating: false,
      features: Object.freeze([]),
      ...options
    });
  }
  var CONTENT_CAPABILITIES = Object.freeze([
    "base",
    "send",
    "summary",
    "preferred-model",
    "delete",
    "message-navigator"
  ]);
  function contentBundle(options) {
    return Object.freeze({
      world: "ISOLATED",
      runAt: "document_idle",
      ...options,
      ...options.hosts ? { hosts: Object.freeze([...options.hosts]) } : {}
    });
  }
  var CONTENT_BUNDLES = Object.freeze({
    preload: contentBundle({ id: "chatclub-preload", file: "content/preload.js", world: "MAIN", runAt: "document_start" }),
    grokCookie: contentBundle({
      id: "chatclub-grok-cookie-bridge",
      file: "content/grok-cookie-bridge.js",
      hosts: ["grok.com", "gk.dairoot.cn"],
      runAt: "document_start"
    }),
    content: contentBundle({ id: "chatclub-content", file: "content/content.js" }),
    summaryMain: contentBundle({ id: "chatclub-summary-userscripts-main", file: "content/summary-userscripts-main.js", world: "MAIN" }),
    summaryIsolated: contentBundle({ id: "chatclub-summary-userscripts", file: "content/summary-userscripts.js" }),
    summaryBridge: contentBundle({ id: "chatclub-summary-bridge", file: "content/summary-bridge.js" }),
    send: contentBundle({ id: "chatclub-send", file: "content/send.js" }),
    preferredModel: contentBundle({ id: "chatclub-preferred-model", file: "content/preferred-model.js" }),
    delete: contentBundle({ id: "chatclub-delete", file: "content/delete.js" }),
    messageNavigator: contentBundle({ id: "chatclub-message-navigator", file: "content/message-navigator.js" })
  });
  var CONTENT_CAPABILITY_BUNDLES = Object.freeze({
    base: Object.freeze([
      CONTENT_BUNDLES.preload,
      CONTENT_BUNDLES.content
    ]),
    send: Object.freeze([CONTENT_BUNDLES.send]),
    summary: Object.freeze([
      CONTENT_BUNDLES.summaryMain,
      CONTENT_BUNDLES.summaryIsolated,
      CONTENT_BUNDLES.summaryBridge
    ]),
    "preferred-model": Object.freeze([CONTENT_BUNDLES.preferredModel]),
    delete: Object.freeze([CONTENT_BUNDLES.delete]),
    "message-navigator": Object.freeze([CONTENT_BUNDLES.messageNavigator])
  });
  var CONTENT_ANCILLARY_BUNDLES = Object.freeze({
    "grok-cookie": CONTENT_BUNDLES.grokCookie
  });
  var FRAME_COMMAND_SPECS = Object.freeze({
    getLocationHref: command({ timeoutMs: 1200, capability: "base" }),
    getPageMeta: command({ timeoutMs: 1800, capability: "base" }),
    getPageText: command({ timeoutMs: 2500, capability: "base" }),
    getSummaryRuntimeState: command({ timeoutMs: 1800, features: Object.freeze(["summary"]) }),
    collectSummary: command({ timeoutMs: 36e3, mutating: true, features: Object.freeze(["summary"]) }),
    sendText: command({ timeoutMs: 12e3, mutating: true, features: Object.freeze(["send"]) }),
    newChatPreprocess: command({ timeoutMs: 1500, mutating: true, features: Object.freeze(["send"]) }),
    prepareNavigationFocusGuard: command({ timeoutMs: 1200, mutating: true, transport: "main-world", features: Object.freeze(["preferred-model"]) }),
    adoptNavigationFocusGuard: command({ timeoutMs: 1200, mutating: true, transport: "main-world", features: Object.freeze(["preferred-model"]) }),
    deleteThread: command({ timeoutMs: 37e3, mutating: true, features: Object.freeze(["delete"]) }),
    getDeleteConfirmState: command({ timeoutMs: 2400, features: Object.freeze(["delete"]) }),
    applyPreferredModel: command({ timeoutMs: 5e4, mutating: true, features: Object.freeze(["preferred-model"]) }),
    cancelPreferredModelApply: command({ timeoutMs: 2e3, mutating: true, features: Object.freeze(["preferred-model"]) }),
    setMessageNavigator: command({ timeoutMs: 6e3, mutating: true, features: Object.freeze(["message-navigator"]) }),
    hideMessageNavigatorMenu: command({ timeoutMs: 2e3, mutating: true, features: Object.freeze(["message-navigator"]) }),
    getMessageNavigatorState: command({ timeoutMs: 2e3, features: Object.freeze(["message-navigator"]) })
  });

  // content-src/shared/command-router.js
  function commandCapability(command2) {
    const spec = FRAME_COMMAND_SPECS[command2];
    if (!spec) return "";
    return String(spec.capability || spec.features?.[0] || "base");
  }
  function contentCommandRouter(runtimes, version) {
    return runtimes.install("content-command-router", version, () => {
      const routes = /* @__PURE__ */ new Map();
      const owners = /* @__PURE__ */ new Map();
      function register(capability, owner, handlers = {}) {
        const feature = String(capability || "").trim();
        const token = String(owner || "").trim();
        if (!feature || !token) throw new TypeError("Content command registration requires capability and owner");
        unregister(token);
        const commands = [];
        for (const [command2, handler] of Object.entries(handlers)) {
          if (!FRAME_COMMAND_SPECS[command2]) throw new TypeError(`Unknown content command handler: ${command2}`);
          if (commandCapability(command2) !== feature) {
            throw new TypeError(`Content command ${command2} belongs to ${commandCapability(command2)}, not ${feature}`);
          }
          if (typeof handler !== "function") throw new TypeError(`Content command ${command2} requires a handler`);
          const existing = routes.get(command2);
          if (existing && existing.owner !== token) throw new Error(`Content command ${command2} is already registered`);
          routes.set(command2, Object.freeze({ owner: token, handler }));
          commands.push(command2);
        }
        owners.set(token, Object.freeze(commands));
        return () => unregister(token);
      }
      function unregister(owner) {
        const token = String(owner || "");
        const commands = owners.get(token) || [];
        for (const command2 of commands) {
          if (routes.get(command2)?.owner === token) routes.delete(command2);
        }
        owners.delete(token);
      }
      async function dispatch(commandName, data = {}) {
        const command2 = String(commandName || "");
        const spec = FRAME_COMMAND_SPECS[command2];
        if (!spec) throw new Error(`Unknown action: ${command2}`);
        const route = routes.get(command2);
        if (!route) {
          const capability = commandCapability(command2);
          const error = new Error(`Content capability is not installed: ${capability}`);
          error.code = "CAPABILITY_UNAVAILABLE";
          error.capability = capability;
          throw error;
        }
        return route.handler(data);
      }
      return {
        api: Object.freeze({ dispatch, register, unregister, commandCapability }),
        dispose() {
          routes.clear();
          owners.clear();
        }
      };
    });
  }
  function installContentCapability(runtimes, options = {}) {
    const capability = String(options.capability || "").trim();
    const owner = String(options.owner || `content-capability:${capability}`).trim();
    const version = String(options.version || "").trim();
    const handlers = options.handlers || {};
    const onActivate = typeof options.activate === "function" ? options.activate : null;
    const onDispose = typeof options.dispose === "function" ? options.dispose : null;
    if (!capability || !owner || !version) throw new TypeError("Content capability installation is incomplete");
    const router = contentCommandRouter(runtimes, options.routerVersion || version);
    return runtimes.install(owner, version, () => {
      let unregister = null;
      return {
        api: Object.freeze({ capability, commands: Object.freeze(Object.keys(handlers)) }),
        activate() {
          unregister = router.register(capability, owner, handlers);
          onActivate?.();
        },
        dispose() {
          try {
            onDispose?.();
          } catch {
          }
          unregister?.();
          unregister = null;
        }
      };
    });
  }

  // content-src/shared/dom-runtime.js
  function isDisabledElement(el) {
    if (!el) return true;
    if (el.disabled || el.hasAttribute?.("disabled") || el.hasAttribute?.("data-disabled")) return true;
    const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
    if (ariaDisabled === "true") return true;
    const dataState = String(el.getAttribute?.("data-state") || "").trim().toLowerCase();
    if (dataState === "disabled") return true;
    try {
      if (typeof el.matches === "function" && el.matches(":disabled")) return true;
    } catch {
    }
    const className = typeof el.className === "string" ? el.className : String(el.className?.baseVal || "");
    return className.split(/\s+/).some((token) => /^(disabled|is-disabled|is_disabled)$/i.test(token));
  }
  function createDomRuntime(deps = {}) {
    const {
      qsa: qsa2,
      visible: visible2,
      normalize: normalize2,
      closest: closest2,
      activateElement: activateElement2
    } = deps;
    function visibleSelectorElements(selectors, root = document) {
      const list = Array.isArray(selectors) ? selectors : [selectors];
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const selector of list) {
        const value = String(selector || "").trim();
        if (!value) continue;
        for (const element of qsa2(value, root, { all: true })) {
          if (seen.has(element) || !visible2(element)) continue;
          seen.add(element);
          out.push(element);
        }
      }
      return out;
    }
    function firstVisibleBySelectors(selectors, options = {}) {
      const elements = visibleSelectorElements(selectors, options.root || document);
      return options.last ? elements[elements.length - 1] || null : elements[0] || null;
    }
    function modelElementText(el) {
      if (!el) return "";
      return normalize2([
        el.getAttribute?.("aria-label"),
        el.getAttribute?.("aria-valuetext"),
        el.getAttribute?.("title"),
        el.getAttribute?.("data-testid"),
        el.getAttribute?.("data-test-id"),
        el.getAttribute?.("data-value"),
        el.getAttribute?.("value"),
        el.innerText || el.textContent || "",
        el.value
      ].filter(Boolean).join(" "));
    }
    function modelEventView(el = null) {
      try {
        return el?.ownerDocument?.defaultView || document?.defaultView || window;
      } catch {
      }
      try {
        return window;
      } catch {
      }
      return null;
    }
    function modelEventConstructor(name, el = null) {
      try {
        const view = modelEventView(el);
        return view?.[name] || window?.[name] || null;
      } catch {
        return null;
      }
    }
    function modelRect(el) {
      try {
        const rect = el?.getBoundingClientRect?.();
        if (!rect) return null;
        return {
          top: Number(rect.top || 0),
          right: Number(rect.right || 0),
          bottom: Number(rect.bottom || 0),
          left: Number(rect.left || 0),
          width: Math.max(0, Number(rect.width || 0)),
          height: Math.max(0, Number(rect.height || 0))
        };
      } catch {
        return null;
      }
    }
    function modelElementArea(el) {
      const rect = modelRect(el);
      return rect ? rect.width * rect.height : Number.MAX_SAFE_INTEGER;
    }
    function modelCenterPoint(el) {
      const rect = modelRect(el);
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
      const viewportHeight = Math.max(1, Number(window.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
      return {
        x: Math.min(Math.max(rect.left + rect.width / 2, 1), viewportWidth - 1),
        y: Math.min(Math.max(rect.top + rect.height / 2, 1), viewportHeight - 1)
      };
    }
    function modelElementFromPoint(point, el = null) {
      if (!point) return null;
      try {
        const doc = el?.ownerDocument || document;
        return doc.elementFromPoint?.(point.x, point.y) || null;
      } catch {
        return null;
      }
    }
    function modelClickableAncestor(el) {
      return closest2(el, "button, a[href], [role='button'], [role='menuitem'], [role='menuitemradio'], [role='option'], [tabindex]:not([tabindex='-1'])");
    }
    function modelCustomActivationAncestor(el) {
      return closest2(el, "gem-button, .gem-button, .gds-mode-switch-button");
    }
    function modelActivationTargets(el) {
      const targets = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (target) => {
        if (!target || seen.has(target)) return;
        seen.add(target);
        targets.push(target);
      };
      const point = modelCenterPoint(el);
      const pointTarget = modelElementFromPoint(point, el);
      if (pointTarget && (pointTarget === el || el.contains?.(pointTarget) || pointTarget.contains?.(el))) {
        add(modelCustomActivationAncestor(pointTarget));
        add(modelClickableAncestor(pointTarget));
        add(pointTarget);
      }
      add(el);
      add(modelCustomActivationAncestor(el));
      add(modelClickableAncestor(el));
      return targets.filter((target) => visible2(target) && !isDisabledElement(target));
    }
    function dispatchPointerActivation(target, point) {
      if (!target || !point) return false;
      const PointerEventCtor = modelEventConstructor("PointerEvent", target);
      const MouseEventCtor = modelEventConstructor("MouseEvent", target);
      if (typeof PointerEventCtor !== "function" && typeof MouseEventCtor !== "function") return false;
      const clientX = Number(point.x) || 1;
      const clientY = Number(point.y) || 1;
      const view = modelEventView(target);
      const common = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: view || null,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        button: 0
      };
      const plans = [
        typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerover", opts: { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
        typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mouseover", opts: { ...common, buttons: 0, detail: 0 } },
        typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerenter", opts: { ...common, bubbles: false, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
        typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mouseenter", opts: { ...common, bubbles: false, buttons: 0, detail: 0 } },
        typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointermove", opts: { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
        typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mousemove", opts: { ...common, buttons: 0, detail: 0 } },
        typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerdown", opts: { ...common, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true } },
        typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mousedown", opts: { ...common, buttons: 1, detail: 1 } },
        typeof PointerEventCtor === "function" && { ctor: PointerEventCtor, type: "pointerup", opts: { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true } },
        typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "mouseup", opts: { ...common, buttons: 0, detail: 1 } },
        typeof MouseEventCtor === "function" && { ctor: MouseEventCtor, type: "click", opts: { ...common, buttons: 0, detail: 1 } }
      ].filter(Boolean);
      let dispatched = false;
      for (const plan of plans) {
        try {
          target.dispatchEvent(new plan.ctor(plan.type, plan.opts));
          dispatched = true;
        } catch {
        }
      }
      return dispatched;
    }
    function nativeModelClick(target) {
      if (!target || typeof target.click !== "function") return false;
      try {
        target.click();
        return true;
      } catch {
        return false;
      }
    }
    function modelClick(el) {
      if (!el || !visible2(el) || isDisabledElement(el)) return false;
      try {
        el.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      const point = modelCenterPoint(el);
      let clicked = false;
      for (const target of modelActivationTargets(el)) {
        try {
          target.focus?.({ preventScroll: true });
        } catch {
          try {
            target.focus?.();
          } catch {
          }
        }
        clicked = dispatchPointerActivation(target, point || modelCenterPoint(target)) || clicked;
        clicked = nativeModelClick(target) || clicked;
        if (clicked) return true;
      }
      try {
        activateElement2(el);
        clicked = true;
      } catch {
      }
      return clicked;
    }
    function modelDirectClick(el) {
      if (!el || !visible2(el) || isDisabledElement(el)) return false;
      try {
        el.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      try {
        el.focus?.({ preventScroll: true });
      } catch {
        try {
          el.focus?.();
        } catch {
        }
      }
      const pointerDispatched = dispatchPointerActivation(el, modelCenterPoint(el));
      const nativeClicked = nativeModelClick(el);
      return pointerDispatched || nativeClicked;
    }
    return Object.freeze({
      isDisabledElement,
      visibleSelectorElements,
      firstVisibleBySelectors,
      modelElementText,
      modelEventConstructor,
      modelRect,
      modelElementArea,
      modelCenterPoint,
      modelElementFromPoint,
      modelClickableAncestor,
      modelCustomActivationAncestor,
      dispatchPointerActivation,
      nativeModelClick,
      modelClick,
      modelDirectClick
    });
  }

  // content-src/shared/extension-runtime.js
  function sendExtensionRuntimeMessage(message) {
    const extensionApi = globalThis.browser || globalThis.chrome;
    const promiseRuntime = globalThis.browser?.runtime;
    if (promiseRuntime?.sendMessage) return promiseRuntime.sendMessage(message);
    return new Promise((resolve, reject) => {
      if (!extensionApi?.runtime?.sendMessage) {
        reject(new Error("Extension runtime messaging is unavailable"));
        return;
      }
      extensionApi.runtime.sendMessage(message, (response) => {
        const runtimeError = extensionApi.runtime.lastError?.message;
        if (runtimeError) reject(new Error(runtimeError));
        else resolve(response);
      });
    });
  }
  var requestBackground = createBackgroundRequestContractClient(sendExtensionRuntimeMessage);

  // content-src/capabilities/delete-common.js
  function createDeleteCommonCapability(deps = {}) {
    const {
      normalize: normalize2,
      buttonText: buttonText2,
      modelElementText,
      qsa: qsa2,
      classText: classText2,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      modelRect,
      closest: closest2,
      modelClick,
      modelDirectClick,
      modelCenterPoint,
      modelElementFromPoint,
      modelCustomActivationAncestor,
      modelClickableAncestor,
      dispatchPointerActivation,
      nativeModelClick,
      activateElement: activateElement2,
      sleep: sleep2,
      visibleSelectorElements,
      modelElementArea,
      deleteCompletionTargetState: deleteCompletionTargetState2,
      DELETE_COMPLETION_STATE_VERSION: DELETE_COMPLETION_STATE_VERSION2,
      modelEventConstructor
    } = deps;
    function deleteResult(ok, site, reason = "", extra = {}) {
      if (!ok && reason) console.warn(`[ChatClub] ${site} delete thread: ${reason}`);
      return { ok, site, ...reason ? { reason } : {}, ...extra };
    }
    function deleteTextToken(value) {
      return normalize2(value).toLowerCase().replace(/\s+/g, " ").trim();
    }
    function deleteCompactToken(value) {
      return String(value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
    }
    function deleteElementText(el) {
      if (!el) return "";
      return normalize2([
        buttonText2(el),
        modelElementText(el),
        el.getAttribute?.("aria-label"),
        el.getAttribute?.("title"),
        el.innerText || el.textContent || ""
      ].filter(Boolean).join(" "));
    }
    function svgSignature(node) {
      return normalize2([node, ...qsa2("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((element) => [
        classText2(element),
        element?.getAttribute?.("data-icon"),
        element?.getAttribute?.("aria-label"),
        element?.getAttribute?.("title"),
        element?.getAttribute?.("alt"),
        element?.getAttribute?.("src"),
        element?.getAttribute?.("href"),
        element?.getAttribute?.("xlink:href"),
        element?.getAttribute?.("viewBox"),
        element?.getAttribute?.("d"),
        element?.getAttribute?.("x"),
        element?.getAttribute?.("y"),
        element?.getAttribute?.("width"),
        element?.getAttribute?.("height")
      ].filter(Boolean).join(" ")).join(" ")).toLowerCase();
    }
    function deleteLabelMatches(value, labels, { exact = false } = {}) {
      const textValue = deleteTextToken(value);
      const compactValue = deleteCompactToken(value);
      if (!textValue && !compactValue) return false;
      return (labels || []).some((label) => {
        const textLabel = deleteTextToken(label);
        const compactLabel = deleteCompactToken(label);
        if (!textLabel && !compactLabel) return false;
        if (exact) return textValue === textLabel || compactValue === compactLabel;
        return textValue.includes(textLabel) || compactValue.includes(compactLabel);
      });
    }
    function deleteLabelMatchesExactish(value, labels) {
      const textValue = deleteTextToken(value);
      const compactValue = deleteCompactToken(value);
      return (labels || []).some((label) => {
        const textLabel = deleteTextToken(label);
        const compactLabel = deleteCompactToken(label);
        if (!textLabel && !compactLabel) return false;
        if (textValue === textLabel || compactValue === compactLabel) return true;
        if (!compactValue || !compactLabel || compactValue.length % compactLabel.length !== 0) return false;
        for (let offset = 0; offset < compactValue.length; offset += compactLabel.length) {
          if (compactValue.slice(offset, offset + compactLabel.length) !== compactLabel) return false;
        }
        return true;
      });
    }
    const DELETE_CLICKABLE_SELECTOR = "button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]";
    const DELETE_CONFIRM_CLICKABLE_SELECTOR = `${DELETE_CLICKABLE_SELECTOR},[class*='button' i],[class*='btn' i]`;
    const DELETE_CONFIRM_CANDIDATE_SELECTOR = `${DELETE_CLICKABLE_SELECTOR},[class*='button' i],[class*='btn' i]`;
    function officialDeleteSelectors(value) {
      return (Array.isArray(value) ? value : []).map((selector) => String(selector || "").trim()).filter(Boolean).slice(0, 8);
    }
    function deleteSelectorUnion(packaged, official = []) {
      return [packaged, ...officialDeleteSelectors(official)].filter(Boolean).join(",");
    }
    function visibleDeleteCandidates(root = document, selector = DELETE_CLICKABLE_SELECTOR) {
      return qsa2(selector, root, { all: true }).filter((element) => visible2(element) && !isDisabledElement2(element));
    }
    function layoutDeleteCandidates(root = document, selector = DELETE_CLICKABLE_SELECTOR) {
      return qsa2(selector, root, { all: true }).filter((element) => {
        if (!element || !element.isConnected || isDisabledElement2(element)) return false;
        const rect = modelRect(element);
        if (!rect || rect.width < 2 || rect.height < 2) return false;
        try {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        } catch {
          return true;
        }
      });
    }
    function deleteClickableElement(element) {
      return closest2(element, DELETE_CONFIRM_CANDIDATE_SELECTOR) || element;
    }
    function deleteClick(element) {
      const target = deleteClickableElement(element);
      return modelClick(target) || modelDirectClick(target);
    }
    function deleteLayoutActivationTargets(el) {
      const targets = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (target) => {
        if (!target || seen.has(target) || isDisabledElement2(target)) return;
        const rect = modelRect(target);
        if (!rect || rect.width < 2 || rect.height < 2) return;
        try {
          const style = getComputedStyle(target);
          if (style.display === "none" || style.visibility === "hidden") return;
        } catch {
        }
        seen.add(target);
        targets.push(target);
      };
      const point = modelCenterPoint(el);
      const pointTarget = modelElementFromPoint(point, el);
      if (pointTarget) {
        add(modelCustomActivationAncestor(pointTarget));
        add(modelClickableAncestor(pointTarget));
        add(pointTarget);
      }
      add(el);
      add(modelCustomActivationAncestor(el));
      add(modelClickableAncestor(el));
      return targets;
    }
    function deleteClickLayout(element) {
      const target = deleteClickableElement(element);
      if (!target || !target.isConnected || isDisabledElement2(target)) return false;
      const rect = modelRect(target);
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      try {
        target.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      let clicked = false;
      for (const item of deleteLayoutActivationTargets(target)) {
        try {
          item.focus?.({ preventScroll: true });
        } catch {
          try {
            item.focus?.();
          } catch {
          }
        }
        clicked = dispatchPointerActivation(item, modelCenterPoint(item) || modelCenterPoint(target)) || clicked;
        clicked = nativeModelClick(item) || clicked;
        if (clicked) return true;
      }
      return clicked;
    }
    async function deleteActivateUntil(element, getter, { allowHidden = false, settleMs = 180 } = {}) {
      const target = deleteClickableElement(element);
      if (!target || !target.isConnected || isDisabledElement2(target)) return null;
      const rect = modelRect(target);
      if (!rect || rect.width < 2 || rect.height < 2) return null;
      if (!allowHidden && !visible2(target)) return null;
      try {
        const style = getComputedStyle(target);
        if (style.display === "none" || style.visibility === "hidden") return null;
      } catch {
      }
      try {
        target.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      try {
        target.focus?.({ preventScroll: true });
      } catch {
        try {
          target.focus?.();
        } catch {
        }
      }
      const read = () => {
        try {
          return typeof getter === "function" ? getter() : null;
        } catch {
          return null;
        }
      };
      const initial = read();
      if (initial) return initial;
      const point = modelCenterPoint(target);
      const attempts = [
        () => dispatchPointerActivation(target, point),
        () => nativeModelClick(target),
        () => activateElement2(target),
        () => deleteClickLayout(target)
      ];
      for (const attempt of attempts) {
        try {
          attempt();
        } catch {
        }
        await sleep2(Math.max(40, Number(settleMs) || 40));
        const value = read();
        if (value) return value;
      }
      return read();
    }
    const DELETE_CONFIRM_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Delete", "Confirm", "Confirm delete", "确认", "确认删除", "删除聊天", "删除话题", "删除"];
    const DELETE_CONFIRM_STRICT_LABELS = ["Delete chat", "Delete Chat", "Delete thread", "Confirm delete", "确认删除", "删除聊天", "删除话题"];
    const DELETE_CONFIRM_GENERIC_LABELS = ["Delete", "Confirm", "确认", "删除"];
    const DELETE_CANCEL_LABELS = ["Cancel", "取消", "Keep", "保留"];
    const DELETE_CONFIRM_REJECT_LABEL_PATTERN = /\b(rename|more|options|menu|pin|share|settings|history)\b|重命名|更多|菜单|选项|置顶|分享|设置|历史/i;
    function deleteConfirmRejectButtonMatches(element) {
      const value = deleteElementText(element);
      return DELETE_CONFIRM_REJECT_LABEL_PATTERN.test(deleteTextToken(value)) || DELETE_CONFIRM_REJECT_LABEL_PATTERN.test(deleteCompactToken(value));
    }
    function deleteConfirmButtonMatches(element, root = null) {
      const value = deleteElementText(element);
      if (!value || deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return false;
      if (deleteConfirmRejectButtonMatches(element)) return false;
      if (deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS)) return true;
      if (deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS)) return true;
      if (root && deleteConfirmRootTextMatches(deleteElementText(root))) return deleteLabelMatches(value, DELETE_CONFIRM_LABELS);
      return deleteLabelMatches(value, DELETE_CONFIRM_STRICT_LABELS);
    }
    function deleteCancelButtonMatches(element) {
      return deleteLabelMatches(deleteElementText(element), DELETE_CANCEL_LABELS);
    }
    function deleteConfirmActivationElementMatches(element, expected, root = null) {
      const candidate = deleteClickableElement(element);
      const target = deleteClickableElement(expected);
      if (!candidate || !visible2(candidate) || isDisabledElement2(candidate)) return false;
      if (deleteCancelButtonMatches(candidate) || deleteConfirmRejectButtonMatches(candidate)) return false;
      if (target && (candidate === target || candidate.contains?.(target) || target.contains?.(candidate))) return true;
      return deleteConfirmButtonMatches(candidate, root);
    }
    function deleteDialogRoots(officialSelectors = []) {
      const roots = visibleSelectorElements([
        "[role='alertdialog']",
        "[role='dialog']",
        "dialog",
        "[aria-modal='true']",
        "mat-dialog-container",
        "[data-radix-dialog-content]",
        "[data-state='open']",
        "[class*='modal' i]",
        "[class*='dialog' i]",
        ".fixed",
        ...officialDeleteSelectors(officialSelectors)
      ]).filter((root) => {
        const value = deleteElementText(root);
        return deleteConfirmRootTextMatches(value);
      });
      for (const root of deleteQuestionDialogRoots()) {
        if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
      }
      for (const root of deleteButtonPairDialogRoots()) {
        if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
      }
      roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
      return roots;
    }
    function deleteConfirmQuestionMatches(value) {
      const textValue = deleteTextToken(value);
      const compactValue = deleteCompactToken(value);
      return /are you sure you want to delete(?: this)? chat|are you sure.*delete|this chat can(?:'|’)?t be recovered|this chat cant be recovered|delete this chat|delete (?:the )?(?:chat|conversation)\s*[?？]|share links from it will be disabled|cannot be undone|can(?:'|’)?t be undone|permanently delete|permanent deletion|删除(?:此|该|这个|本)?(?:聊天|对话|会话|话题)\s*[?？]|确定.*删除|确认.*删除|删除.*不可恢复|无法恢复|不能恢复/i.test(textValue) || /confirmdelete|deleteconfirm|删除确认|确认删除/.test(compactValue);
    }
    function deleteConfirmRootTextMatches(value) {
      const textValue = deleteTextToken(value);
      const compactValue = deleteCompactToken(value);
      if (deleteConfirmQuestionMatches(textValue)) return true;
      const hasDelete = /delete|删除/.test(textValue) || /delete|删除/.test(compactValue);
      const hasConfirm = /confirm|确认/.test(textValue) || /confirm|确认/.test(compactValue);
      const hasCancel = /cancel|取消/.test(textValue) || /cancel|取消/.test(compactValue);
      const hasRecoverWarning = /recover|recovered|不可恢复|无法恢复|不能恢复/.test(textValue) || /recover|recovered|不可恢复|无法恢复|不能恢复/.test(compactValue);
      return hasCancel && (hasRecoverWarning || hasDelete && hasConfirm);
    }
    function deleteQuestionDialogRoots() {
      const roots = [];
      const questions = qsa2("div,section,[role='dialog'],[role='alertdialog'],dialog,[aria-modal='true'],mat-dialog-container,[class*='modal' i],[class*='dialog' i]", document, { all: true }).filter((element) => visible2(element) && deleteConfirmQuestionMatches(deleteElementText(element))).sort((a, b) => modelElementArea(a) - modelElementArea(b)).slice(0, 24);
      for (const question of questions) {
        let node = question;
        for (let depth = 0; node && node !== document.body && depth < 8; depth += 1, node = node.parentElement) {
          if (!visible2(node)) continue;
          const buttons = visibleDeleteCandidates(node, DELETE_CONFIRM_CLICKABLE_SELECTOR);
          const hasConfirm = buttons.some((button) => deleteConfirmButtonMatches(button, node));
          const hasCancel = buttons.some(deleteCancelButtonMatches);
          if (!hasConfirm || !hasCancel) continue;
          if (!roots.some((root) => root === node || root.contains?.(node) || node.contains?.(root))) roots.push(node);
          break;
        }
      }
      return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    }
    function deleteButtonPairDialogRoots() {
      const roots = [];
      const seedButtons = visibleDeleteCandidates(document, DELETE_CONFIRM_CLICKABLE_SELECTOR).filter((button) => deleteConfirmButtonMatches(button) || deleteCancelButtonMatches(button));
      for (const button of seedButtons) {
        let node = button;
        for (let depth = 0; node && node !== document.body && depth < 9; depth += 1, node = node.parentElement) {
          if (!visible2(node)) continue;
          const buttons = visibleDeleteCandidates(node, DELETE_CONFIRM_CLICKABLE_SELECTOR);
          if (!buttons.some((candidate) => deleteConfirmButtonMatches(candidate, node)) || !buttons.some(deleteCancelButtonMatches)) continue;
          if (!deleteConfirmRootTextMatches(deleteElementText(node))) continue;
          if (!roots.some((root) => root === node || root.contains?.(node) || node.contains?.(root))) roots.push(node);
          break;
        }
      }
      return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    }
    function findDeleteConfirmButtonInfo(officialHints = {}) {
      const candidates = [];
      const addCandidate = (element, root = null, extraScore = 0) => {
        const target = deleteClickableElement(element);
        const value = deleteElementText(target) || deleteElementText(element);
        if (!deleteConfirmButtonMatches(target, root) && !deleteConfirmButtonMatches(element, root)) return;
        if (deleteCancelButtonMatches(target) || deleteCancelButtonMatches(element)) return;
        const rect = modelRect(target);
        if (!rect || rect.width < 12 || rect.height < 10 || rect.width > 760 || rect.height > 160) return;
        candidates.push({
          element: target,
          root,
          score: extraScore + (deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS) ? 700 : 0) + (deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS) ? 420 : 0) + (target.matches?.("button,[role='button']") ? 220 : 0),
          right: rect.right || rect.left || 0,
          top: rect.top || 0,
          area: rect.width * rect.height
        });
      };
      const candidateSelector = deleteSelectorUnion(DELETE_CONFIRM_CLICKABLE_SELECTOR, officialHints?.confirmCandidate);
      for (const root of deleteDialogRoots(officialHints?.dialog)) {
        for (const element of visibleDeleteCandidates(root, candidateSelector)) {
          addCandidate(element, root, 260);
        }
      }
      if (!candidates.length && qsa2("div,section,[role='dialog'],[role='alertdialog'],dialog,[aria-modal='true'],mat-dialog-container,[class*='modal' i],[class*='dialog' i],h1,h2,h3,p,span", document, { all: true }).some((element) => visible2(element) && deleteConfirmQuestionMatches(deleteElementText(element)))) {
        const buttons = visibleDeleteCandidates(document, candidateSelector);
        const cancelButtons = buttons.filter(deleteCancelButtonMatches);
        if (cancelButtons.length) {
          for (const element of buttons) {
            const value = deleteElementText(element);
            if (!deleteLabelMatchesExactish(value, DELETE_CONFIRM_GENERIC_LABELS) && !deleteLabelMatchesExactish(value, DELETE_CONFIRM_STRICT_LABELS)) continue;
            const rect = modelRect(element);
            if (!rect) continue;
            const nearCancel = cancelButtons.some((cancel) => {
              const cancelRect = modelRect(cancel);
              if (!cancelRect) return false;
              return Math.abs((cancelRect.left + cancelRect.right) / 2 - (rect.left + rect.right) / 2) < 360 && Math.abs((cancelRect.top + cancelRect.bottom) / 2 - (rect.top + rect.bottom) / 2) < 220;
            });
            if (nearCancel) addCandidate(element, null, 180);
          }
        }
      }
      candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.top - a.top || a.area - b.area);
      return candidates[0] || null;
    }
    function findDeleteConfirmButton(officialHints = {}) {
      return findDeleteConfirmButtonInfo(officialHints)?.element || null;
    }
    function serializableDeleteRect(box) {
      if (!box) return null;
      const round = (value) => Math.round(Number(value || 0) * 100) / 100;
      return {
        left: round(box.left),
        top: round(box.top),
        right: round(box.right),
        bottom: round(box.bottom),
        width: round(box.width),
        height: round(box.height)
      };
    }
    function deleteConfirmTrustedClick(site = "topic-delete", reason = "delete confirmation requires trusted browser input", officialHints = {}) {
      const info = findDeleteConfirmButtonInfo(officialHints);
      const button = info?.element || null;
      const box = modelRect(button);
      if (!button || !box) return null;
      return {
        kind: "delete-confirm",
        site,
        reason: String(reason || ""),
        framePoint: {
          x: Math.round((box.left + box.width / 2) * 100) / 100,
          y: Math.round((box.top + box.height / 2) * 100) / 100
        },
        frameRect: serializableDeleteRect(box)
      };
    }
    function deleteResultWithTrustedConfirm(site, reason, officialHints = {}) {
      const trustedClick = deleteConfirmTrustedClick(site, reason, officialHints);
      return deleteResult(false, site, reason, trustedClick ? { needsTrustedClick: true, trustedClick } : {});
    }
    function trustedDeleteShortcut(site = "topic-delete", reason = "delete shortcut requires trusted browser input") {
      const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
      return {
        kind: "delete-shortcut",
        site,
        reason: String(reason || ""),
        keys: [
          {
            key: "Backspace",
            shiftKey: true,
            metaKey: mac,
            ctrlKey: !mac,
            settleMs: 520
          }
        ],
        keySettleMs: 180,
        settleMs: 900
      };
    }
    function deleteResultWithTrustedDeleteShortcut(site, reason) {
      return deleteResult(false, site, reason, {
        needsTrustedKeySequence: true,
        trustedKeySequence: trustedDeleteShortcut(site, reason)
      });
    }
    function trustedMenuClickPoint(site = "topic-delete", reason = "topic menu trigger requires trusted browser input", point = {}, frameRect = null) {
      const x = Number(point.x ?? point.clientX);
      const y = Number(point.y ?? point.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        kind: "topic-menu-trigger",
        site,
        reason: String(reason || ""),
        framePoint: {
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100
        },
        ...frameRect ? { frameRect } : {}
      };
    }
    function trustedMenuClickForElement(element, site = "topic-delete", reason = "topic menu trigger requires trusted browser input") {
      const box = modelRect(element);
      if (!element || !box) return null;
      return trustedMenuClickPoint(site, reason, {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2
      }, serializableDeleteRect(box));
    }
    function deleteResultWithTrustedMenuClick(site, reason, element) {
      const trustedMenuClick = trustedMenuClickForElement(element, site, reason);
      return deleteResult(false, site, reason, trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {});
    }
    function deleteCompletionLinkHrefs(officialHints = {}) {
      const links = new Set(qsa2("a[href]", document, { all: true }));
      for (const selector of officialDeleteSelectors(officialHints?.completionLinks)) {
        for (const element of qsa2(selector, document, { all: true })) {
          if (element?.matches?.("a[href]")) links.add(element);
          for (const link of qsa2("a[href]", element, { all: true })) links.add(link);
        }
      }
      return [...links].map((link) => String(link.href || link.getAttribute?.("href") || ""));
    }
    function topicDeleteConfirmState(site = "topic-delete", expectedIdentity = null, officialHints = {}) {
      const trustedClick = deleteConfirmTrustedClick(site, "delete confirmation is still visible", officialHints);
      const target = deleteCompletionTargetState2(
        expectedIdentity,
        location.href,
        deleteCompletionLinkHrefs(officialHints)
      );
      return {
        version: DELETE_COMPLETION_STATE_VERSION2,
        present: Boolean(trustedClick) || deleteDialogRoots(officialHints?.dialog).length > 0,
        target,
        trustedClick
      };
    }
    function deleteConfirmDialogClosed(officialHints = {}) {
      return !findDeleteConfirmButton(officialHints) && !deleteDialogRoots(officialHints?.dialog).length;
    }
    function dispatchDeleteConfirmKey(target, key = "Enter") {
      if (!target) return false;
      const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
      if (typeof KeyboardEventCtor !== "function") return false;
      const isSpace = key === " " || /^space(?:bar)?$/i.test(key);
      const code = isSpace ? "Space" : "Enter";
      const keyValue = isSpace ? " " : "Enter";
      const keyCode = isSpace ? 32 : 13;
      let dispatched = false;
      const init = {
        key: keyValue,
        code,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true
      };
      for (const type of ["keydown", "keypress", "keyup"]) {
        try {
          target.dispatchEvent(new KeyboardEventCtor(type, init));
          dispatched = true;
        } catch {
        }
      }
      return dispatched;
    }
    function dispatchDeleteConfirmEnter(target) {
      return dispatchDeleteConfirmKey(target, "Enter") || dispatchDeleteConfirmKey(target, " ");
    }
    function clickDeleteConfirmButton(button, root = null) {
      if (!button || !button.isConnected || isDisabledElement2(button)) return false;
      const target = deleteClickableElement(button);
      const point = modelCenterPoint(target) || modelCenterPoint(button);
      const pointTarget = modelElementFromPoint(point, target || button);
      const targets = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (element) => {
        const candidate = deleteClickableElement(element);
        if (!candidate || seen.has(candidate) || isDisabledElement2(candidate)) return;
        if (!deleteConfirmActivationElementMatches(candidate, target, root)) return;
        if (!visible2(candidate) && !modelRect(candidate)) return;
        seen.add(candidate);
        targets.push(candidate);
      };
      add(modelClickableAncestor(pointTarget));
      add(modelCustomActivationAncestor(pointTarget));
      add(pointTarget);
      add(target);
      add(button);
      for (let node = target?.parentElement, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth += 1) {
        add(node);
      }
      let clicked = false;
      for (const element of targets) {
        try {
          element.scrollIntoView?.({ block: "center", inline: "nearest" });
        } catch {
        }
        try {
          element.focus?.({ preventScroll: true });
        } catch {
          try {
            element.focus?.();
          } catch {
          }
        }
        clicked = dispatchDeleteConfirmEnter(element) || clicked;
        clicked = dispatchPointerActivation(element, modelCenterPoint(element) || point) || clicked;
        clicked = nativeModelClick(element) || clicked;
      }
      try {
        activateElement2(target || button);
        clicked = true;
      } catch {
      }
      return clicked;
    }
    async function clickDeleteConfirmIfPresent(timeoutMs = 4200, guard = null, officialHints = {}) {
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      let clickedButton = null;
      let clickedAt = 0;
      while (Date.now() <= deadline) {
        if (clickedButton && deleteConfirmDialogClosed(officialHints)) return true;
        const info = findDeleteConfirmButtonInfo(officialHints);
        const button = info?.element || null;
        if (button && typeof guard === "function" && guard() !== true) return false;
        if (button && (button !== clickedButton || Date.now() - clickedAt > 900) && clickDeleteConfirmButton(button, info.root || null)) {
          clickedButton = button;
          clickedAt = Date.now();
          await sleep2(220);
          if (deleteConfirmDialogClosed(officialHints)) return true;
        }
        await sleep2(120);
      }
      if (clickedButton && deleteConfirmDialogClosed(officialHints)) return true;
      return false;
    }
    function dispatchDeleteKeyboardShortcut() {
      const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
      const init = {
        key: "Backspace",
        code: "Backspace",
        keyCode: 8,
        which: 8,
        bubbles: true,
        cancelable: true,
        composed: true,
        shiftKey: true,
        metaKey: mac,
        ctrlKey: !mac,
        altKey: false
      };
      const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
      let dispatched = false;
      const seen = /* @__PURE__ */ new Set();
      for (const target of targets) {
        if (!target || seen.has(target)) continue;
        seen.add(target);
        const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", target);
        if (typeof KeyboardEventCtor !== "function") continue;
        for (const type of ["keydown", "keyup"]) {
          try {
            target.dispatchEvent(new KeyboardEventCtor(type, init));
            dispatched = true;
          } catch {
          }
        }
      }
      return dispatched;
    }
    return Object.freeze({
      deleteResult,
      deleteCompactToken,
      deleteElementText,
      svgSignature,
      deleteLabelMatches,
      deleteLabelMatchesExactish,
      visibleDeleteCandidates,
      layoutDeleteCandidates,
      deleteClickableElement,
      deleteClick,
      deleteActivateUntil,
      findDeleteConfirmButton,
      findDeleteConfirmButtonInfo,
      deleteResultWithTrustedConfirm,
      deleteResultWithTrustedDeleteShortcut,
      deleteResultWithTrustedMenuClick,
      topicDeleteConfirmState,
      clickDeleteConfirmIfPresent,
      dispatchDeleteKeyboardShortcut,
      DELETE_CANCEL_LABELS,
      deleteDialogRoots,
      deleteClickLayout,
      serializableDeleteRect,
      trustedMenuClickForElement,
      trustedMenuClickPoint
    });
  }

  // content-src/capabilities/delete-claude.js
  function createDeleteClaudeCapability(deps = {}) {
    const {
      qsa: qsa2,
      normalize: normalize2,
      deleteCompactToken,
      modelRect,
      deleteClickableElement,
      isDisabledElement: isDisabledElement2,
      visible: visible2,
      deleteLabelMatchesExactish,
      deleteClickLayout,
      sleep: sleep2,
      deleteClick,
      findDeleteConfirmButton,
      deleteResult,
      deleteDialogRoots,
      modelElementArea,
      modelElementFromPoint,
      waitForModel,
      deleteResultWithTrustedMenuClick
    } = deps;
    const CLAUDE_CHAT_TITLE_ROOT_SELECTOR = "[data-testid='chat-title-split']";
    const CLAUDE_DELETE_LABELS = ["Delete chat", "Delete", "删除聊天", "删除"];
    const CLAUDE_DELETE_MENU_SHORTCUT_COMPACT_VALUES = /* @__PURE__ */ new Set(["DeleteD", "deleteD", "删除D"]);
    const CLAUDE_PRIVATE_USE_PATTERN = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
    const CLAUDE_ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u2060\uFEFF]/g;
    const CLAUDE_WRONG_DELETE_TARGET_PATTERN = /\b(?:delete|remove)\b[^\n]{0,48}\b(?:project|account|workspace)\b|(?:删除|移除)[^\n]{0,24}(?:项目|账户|帐号|账号|工作区)/i;
    const CLAUDE_DELETE_CONFIRMATION_HEADING = "Delete chat";
    const CLAUDE_DELETE_CONFIRMATION_PROMPT = "Are you sure you want to delete this chat?";
    let claudeTrustedDeleteLease = null;
    function claudeLabelText(value) {
      return normalize2(String(value || "").replace(CLAUDE_PRIVATE_USE_PATTERN, " ").replace(CLAUDE_ZERO_WIDTH_PATTERN, " "));
    }
    function claudeConversationIdFromHref(value = location.href) {
      try {
        const url = new URL(String(value || ""), location.origin);
        const host = String(url.hostname || "").toLowerCase();
        if (url.protocol !== "https:" || !(host === "claude.ai" || host.endsWith(".claude.ai"))) return "";
        const match = String(url.pathname || "").match(/^\/chat\/([^/]+)\/?$/);
        if (!match) return "";
        const id = decodeURIComponent(match[1]).trim();
        return id && !/[/?#]/.test(id) ? id : "";
      } catch {
        return "";
      }
    }
    function claudeDeleteRouteGuard(data = {}) {
      const expected = data?.expectedDeleteIdentity;
      const currentId = claudeConversationIdFromHref();
      const expectedId = expected ? String(expected.provider || "").toLowerCase() === "claude" ? String(expected.id || "").trim() : "" : currentId;
      return () => Boolean(expectedId) && claudeConversationIdFromHref() === expectedId;
    }
    function claudeOfficialHints(data = {}) {
      return data?.officialRuleHints && typeof data.officialRuleHints === "object" && !Array.isArray(data.officialRuleHints) ? data.officialRuleHints : {};
    }
    function claudeOfficialSelectors(hints = {}, slot = "") {
      return (Array.isArray(hints?.[slot]) ? hints[slot] : []).map((selector) => String(selector || "").trim()).filter(Boolean).slice(0, 8);
    }
    function claudeSelectorUnion(packaged, hints = {}, slot = "") {
      return [packaged, ...claudeOfficialSelectors(hints, slot)].filter(Boolean).join(",");
    }
    function claudeChatTitleRoot() {
      const roots = qsa2(CLAUDE_CHAT_TITLE_ROOT_SELECTOR, document, { all: true }).filter((root) => {
        if (!root?.isConnected || !visible2(root)) return false;
        const box = modelRect(root);
        return Boolean(box && box.width >= 40 && box.height >= 12 && box.height <= 180);
      });
      return roots.length === 1 ? roots[0] : null;
    }
    function claudeConversationTitleFromMenuLabel(value) {
      const match = String(value || "").trim().match(/^More options for\s+(.+)$/i);
      return match ? normalize2(match[1]) : "";
    }
    function claudeTitleEvidenceMatches(root, trigger, title) {
      const wanted = normalize2(title).toLowerCase();
      if (!wanted) return false;
      const triggerBox = modelRect(trigger);
      if (!triggerBox) return false;
      const allowed = /* @__PURE__ */ new Set([
        wanted,
        `${wanted}, rename chat`,
        `${wanted}, rename conversation`,
        `${wanted} rename chat`,
        `${wanted} rename conversation`
      ]);
      return qsa2("[aria-label],[title],button,[role='button']", root, { all: true }).some((node) => {
        if (!node || node === trigger || trigger?.contains?.(node) || node.contains?.(trigger)) return false;
        if (!node.isConnected || !visible2(node)) return false;
        const box = modelRect(node);
        if (!box || box.width < 8 || box.height < 8) return false;
        const verticalOverlap = Math.min(box.bottom, triggerBox.bottom) - Math.max(box.top, triggerBox.top);
        if (verticalOverlap < Math.min(box.height, triggerBox.height) * 0.3) return false;
        const values = [
          node.getAttribute?.("aria-label"),
          node.getAttribute?.("title"),
          node.innerText,
          node.textContent
        ].map((value) => normalize2(value).toLowerCase()).filter(Boolean);
        return values.some((value) => allowed.has(value));
      });
    }
    function claudeConversationMenuTrigger(hints = {}) {
      const root = claudeChatTitleRoot();
      if (!root) return null;
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const selector = claudeSelectorUnion("button[aria-label],[role='button'][aria-label]", hints, "menuTrigger");
      for (const node of qsa2(selector, root, { all: true })) {
        const label = String(node.getAttribute?.("aria-label") || "").trim();
        const title = claudeConversationTitleFromMenuLabel(label);
        if (!title) continue;
        const target = deleteClickableElement(node);
        if (!target || target === root || seen.has(target) || !root.contains?.(target)) continue;
        if (!target.isConnected || !visible2(target) || isDisabledElement2(target)) continue;
        const targetLabel = String(target.getAttribute?.("aria-label") || "").trim();
        const targetTitle = claudeConversationTitleFromMenuLabel(targetLabel);
        if (!targetTitle || normalize2(targetTitle).toLowerCase() !== normalize2(title).toLowerCase()) continue;
        if (!claudeTitleEvidenceMatches(root, target, title)) continue;
        const box = modelRect(target);
        if (!box || box.width < 8 || box.height < 8 || box.width > 120 || box.height > 96) continue;
        seen.add(target);
        candidates.push(target);
      }
      return candidates.length === 1 ? candidates[0] : null;
    }
    function claudeMenuBindingIds(trigger = null) {
      const byAttribute = ["aria-controls", "aria-owns"].map((name) => ({
        name,
        ids: String(trigger?.getAttribute?.(name) || "").trim().split(/\s+/).filter(Boolean)
      }));
      const ids = byAttribute.flatMap((entry) => entry.ids);
      return {
        byAttribute,
        ids,
        key: byAttribute.map((entry) => `${entry.name}:${entry.ids.join(" ")}`).join("|")
      };
    }
    function claudeLinkedDeleteMenuRoot(trigger = null) {
      const binding = claudeMenuBindingIds(trigger);
      if (!binding.ids.length) return null;
      const roots = /* @__PURE__ */ new Set();
      try {
        for (const id of binding.ids) {
          const root = document.getElementById(id) || null;
          if (!root || String(root.id || "") !== id) return null;
          roots.add(root);
        }
      } catch {
        return null;
      }
      return roots.size === 1 ? [...roots][0] : null;
    }
    function claudeDeleteMenuRoots(trigger = null, hints = {}) {
      const roots = [];
      const seen = /* @__PURE__ */ new Set();
      const confirmationRoots = deleteDialogRoots(hints?.dialog);
      const add = (root) => {
        if (!root || root === trigger || seen.has(root) || !root.isConnected || !visible2(root)) return;
        if (trigger && (root.contains?.(trigger) || trigger.contains?.(root))) return;
        if (confirmationRoots.some((dialog) => dialog === root || dialog.contains?.(root) || root.contains?.(dialog))) return;
        const box = modelRect(root);
        if (!box || box.width < 48 || box.height < 20 || box.width > 640 || box.height > 720) return;
        seen.add(root);
        roots.push(root);
      };
      const linkedRoot = claudeLinkedDeleteMenuRoot(trigger);
      add(linkedRoot);
      for (const selector of claudeOfficialSelectors(hints, "menuRoot")) {
        for (const candidate of qsa2(selector, document, { all: true })) {
          if (candidate === linkedRoot || linkedRoot?.contains?.(candidate)) add(linkedRoot);
        }
      }
      return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    }
    function claudeDeleteLabelMatchesExact(value) {
      const text = claudeLabelText(value);
      if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
      return deleteLabelMatchesExactish(text, CLAUDE_DELETE_LABELS);
    }
    function claudeDeleteMenuLabelMatchesExact(value) {
      const text = claudeLabelText(value);
      if (claudeDeleteLabelMatchesExact(text)) return true;
      if (!text || CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text)) return false;
      return /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
    }
    function claudeDeleteMenuShortcutTokenMatches(value) {
      const compactValue = claudeLabelText(value).replace(/[^A-Za-z0-9\u4E00-\u9FFF]+/g, "");
      return CLAUDE_DELETE_MENU_SHORTCUT_COMPACT_VALUES.has(compactValue);
    }
    function claudeMenuSemanticTokens(target) {
      return [
        target?.getAttribute?.("aria-label"),
        target?.getAttribute?.("title"),
        target?.innerText,
        target?.textContent
      ].map((value) => deleteCompactToken(claudeLabelText(value))).filter(Boolean);
    }
    function claudeDeleteMenuHasConversationFingerprint(root, deleteItem) {
      const readStateTargets = /* @__PURE__ */ new Set();
      const conversationActionTargets = /* @__PURE__ */ new Set();
      for (const node of qsa2("[role='menuitem'],[role='option'],button,[role='button']", root, { all: true })) {
        const target = deleteClickableElement(node);
        if (!target || target === deleteItem || !root.contains?.(target) || !target.isConnected || !visible2(target) || isDisabledElement2(target)) continue;
        for (const token of claudeMenuSemanticTokens(target)) {
          if (/^(?:markasunread|markasread)u?$/.test(token) || /^(?:标记为未读|标记为已读)u?$/.test(token)) {
            readStateTargets.add(target);
          }
          if (/^(?:star|unstar)p?$/.test(token) || /^rename(?:chat|conversation)?r?$/.test(token) || token === "addtoproject" || /^(?:加星|取消加星)p?$/.test(token) || /^重命名(?:聊天|对话)?r?$/.test(token) || token === "添加到项目") {
            conversationActionTargets.add(target);
          }
        }
      }
      return [...readStateTargets].some((readTarget) => [...conversationActionTargets].some((actionTarget) => actionTarget !== readTarget));
    }
    function claudeDeleteMenuTargetLabelMatchesExact(target) {
      if (!target) return false;
      const semanticValues = [
        target.getAttribute?.("aria-label"),
        target.getAttribute?.("title"),
        target.innerText,
        target.textContent
      ].map((value) => String(value || "").trim()).filter(Boolean);
      if (!semanticValues.length) return false;
      const hasRawShortcutEvidence = semanticValues.some((value) => {
        const text = claudeLabelText(value);
        return Boolean(text) && !CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text) && /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
      });
      return semanticValues.every((value) => claudeDeleteMenuLabelMatchesExact(value) || hasRawShortcutEvidence && claudeDeleteMenuShortcutTokenMatches(value));
    }
    function claudeDeleteTargetIsTopmost(node) {
      const box = modelRect(node);
      if (!node || !box) return false;
      const pointTarget = modelElementFromPoint({
        x: box.left + box.width / 2,
        y: box.top + box.height / 2
      }, node);
      return Boolean(pointTarget && (pointTarget === node || node.contains?.(pointTarget)));
    }
    function findClaudeDeleteMenuItem(root, trigger = null, hints = {}) {
      if (!root || !root.isConnected || !visible2(root)) return null;
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const selector = claudeSelectorUnion("[role='menuitem'],[role='option'],button,[role='button']", hints, "deleteCandidate");
      for (const node of qsa2(selector, root, { all: true })) {
        const target = deleteClickableElement(node);
        if (!target || target === root || target === trigger || seen.has(target) || !root.contains?.(target)) continue;
        if (!target.isConnected || !visible2(target) || isDisabledElement2(target)) continue;
        if (!claudeDeleteMenuTargetLabelMatchesExact(target)) continue;
        const box = modelRect(target);
        if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 120) continue;
        if (!claudeDeleteTargetIsTopmost(target)) continue;
        seen.add(target);
        candidates.push(target);
      }
      if (candidates.length !== 1) return null;
      return claudeDeleteMenuHasConversationFingerprint(root, candidates[0]) ? candidates[0] : null;
    }
    function claudeDeleteMenuShortcutTargetMatches(target) {
      if (!claudeDeleteMenuTargetLabelMatchesExact(target)) return false;
      return [
        target?.getAttribute?.("aria-label"),
        target?.getAttribute?.("title"),
        target?.innerText,
        target?.textContent
      ].some((value) => {
        const text = claudeLabelText(value);
        return Boolean(text) && !CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(text) && /^(?:delete(?:\s+chat)?|删除(?:聊天)?)\s+d$/i.test(text);
      });
    }
    function findClaudeDeleteMenuShortcutItem(root, trigger = null, hints = {}) {
      if (!root || !root.isConnected || !visible2(root)) return null;
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const selector = claudeSelectorUnion("[role='menuitem'],[role='option'],button,[role='button']", hints, "deleteCandidate");
      for (const node of qsa2(selector, root, { all: true })) {
        const target = deleteClickableElement(node);
        if (!target || target === root || target === trigger || seen.has(target) || !root.contains?.(target)) continue;
        if (!target.isConnected || !visible2(target) || isDisabledElement2(target)) continue;
        if (!claudeDeleteMenuShortcutTargetMatches(target)) continue;
        const box = modelRect(target);
        if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 120) continue;
        seen.add(target);
        candidates.push(target);
      }
      if (candidates.length !== 1) return null;
      return claudeDeleteMenuHasConversationFingerprint(root, candidates[0]) ? candidates[0] : null;
    }
    function claudeOwnedDeleteMenuRoots(trigger = null, hints = {}) {
      return new Set(
        claudeDeleteMenuRoots(trigger, hints).filter((root) => Boolean(findClaudeDeleteMenuItem(root, trigger, hints)))
      );
    }
    function claudeShortcutDeleteMenuRoots(trigger = null, hints = {}) {
      return new Set(
        claudeDeleteMenuRoots(trigger, hints).filter((root) => Boolean(findClaudeDeleteMenuShortcutItem(root, trigger, hints)))
      );
    }
    function claudeDeleteMenuSession(trigger, baselineRoots = /* @__PURE__ */ new Set(), hints = {}) {
      const sessionsByItem = /* @__PURE__ */ new Map();
      for (const root of claudeDeleteMenuRoots(trigger, hints)) {
        if (baselineRoots.has(root)) continue;
        const item = findClaudeDeleteMenuItem(root, trigger, hints);
        if (!item) continue;
        const existing = sessionsByItem.get(item);
        if (!existing || modelElementArea(root) < modelElementArea(existing.root)) sessionsByItem.set(item, { root, item });
      }
      const sessions = [...sessionsByItem.values()];
      return sessions.length === 1 ? sessions[0] : null;
    }
    function claudeDeleteMenuShortcutSession(trigger, baselineRoots = /* @__PURE__ */ new Set(), hints = {}) {
      const sessionsByItem = /* @__PURE__ */ new Map();
      for (const root of claudeDeleteMenuRoots(trigger, hints)) {
        if (baselineRoots.has(root)) continue;
        const item = findClaudeDeleteMenuShortcutItem(root, trigger, hints);
        if (!item) continue;
        const existing = sessionsByItem.get(item);
        if (!existing || modelElementArea(root) < modelElementArea(existing.root)) sessionsByItem.set(item, { root, item });
      }
      const sessions = [...sessionsByItem.values()];
      return sessions.length === 1 ? sessions[0] : null;
    }
    function refreshClaudeDeleteMenuSession(session, trigger, hints = {}) {
      const root = session?.root || null;
      if (!root || !root.isConnected || !visible2(root)) return null;
      if (!claudeDeleteMenuRoots(trigger, hints).includes(root)) return null;
      const item = findClaudeDeleteMenuItem(root, trigger, hints);
      return item ? { root, item } : null;
    }
    function refreshClaudeDeleteMenuShortcutSession(session, trigger, hints = {}) {
      const root = session?.root || null;
      const expectedItem = session?.item || null;
      if (!root || !expectedItem || !root.isConnected || !visible2(root)) return null;
      if (!claudeDeleteMenuRoots(trigger, hints).includes(root)) return null;
      const item = findClaudeDeleteMenuShortcutItem(root, trigger, hints);
      return item && item === expectedItem ? { root, item } : null;
    }
    function claudeExactActionLabelMatches(target, expectedLabel) {
      if (!target) return false;
      const values = [
        target.getAttribute?.("aria-label"),
        target.getAttribute?.("title"),
        target.innerText,
        target.textContent
      ].map(claudeLabelText).filter(Boolean);
      return Boolean(values.length) && values.every((value) => value === expectedLabel);
    }
    function claudeDeleteConfirmationDetails(root, hints = {}) {
      if (!root || !root.isConnected || !visible2(root)) return null;
      const headings = qsa2("h1,h2,h3,h4,[role='heading']", root, { all: true }).filter((node) => node?.isConnected && visible2(node)).filter((node) => claudeLabelText(node.innerText || node.textContent) === CLAUDE_DELETE_CONFIRMATION_HEADING);
      if (headings.length !== 1) return null;
      const rootText = claudeLabelText(root.innerText || root.textContent);
      if (CLAUDE_WRONG_DELETE_TARGET_PATTERN.test(rootText) || !rootText.includes(CLAUDE_DELETE_CONFIRMATION_PROMPT)) return null;
      const actions = [];
      const seen = /* @__PURE__ */ new Set();
      const selector = claudeSelectorUnion("button,[role='button']", hints, "confirmCandidate");
      for (const node of qsa2(selector, root, { all: true })) {
        const target = deleteClickableElement(node);
        if (!target || seen.has(target) || !root.contains?.(target)) continue;
        if (!target.isConnected || !visible2(target) || isDisabledElement2(target)) continue;
        const box = modelRect(target);
        if (!box || box.width < 12 || box.height < 10 || box.width > 420 || box.height > 120) continue;
        seen.add(target);
        actions.push(target);
      }
      const cancelButtons = actions.filter((target) => claudeExactActionLabelMatches(target, "Cancel"));
      const deleteButtons = actions.filter((target) => claudeExactActionLabelMatches(target, "Delete"));
      if (cancelButtons.length !== 1 || deleteButtons.length !== 1 || cancelButtons[0] === deleteButtons[0]) return null;
      return { button: deleteButtons[0], cancelButton: cancelButtons[0] };
    }
    function claudeDeleteConfirmationOwnerships(baselineRoots = /* @__PURE__ */ new Set(), hints = {}) {
      const ownedByButton = /* @__PURE__ */ new Map();
      for (const root of deleteDialogRoots(hints?.dialog)) {
        if (!root || baselineRoots.has(root) || !root.isConnected || !visible2(root)) continue;
        const details = claudeDeleteConfirmationDetails(root, hints);
        if (!details) continue;
        const { button, cancelButton } = details;
        const existing = ownedByButton.get(button);
        if (!existing || modelElementArea(root) < modelElementArea(existing.root)) {
          ownedByButton.set(button, { root, button, cancelButton, baselineRoots });
        }
      }
      return [...ownedByButton.values()];
    }
    function claudeLeaseCoreIsCurrent(lease, routeStillCurrent) {
      return Boolean(
        lease?.attemptId && claudeTrustedDeleteLease === lease && lease.documentRef === document && lease.routeId === claudeConversationIdFromHref() && Number(lease.expiresAt) >= Date.now() && routeStillCurrent()
      );
    }
    function claudeReleaseActiveDeleteLease(lease) {
      if (claudeTrustedDeleteLease !== lease) return;
      claudeDisposeTrustedDeleteKeyObserver(lease);
      claudeTrustedDeleteLease = null;
    }
    function claudeLeaseOriginalMenuClosed(lease, routeStillCurrent) {
      if (!lease?.trigger || !lease?.menuRoot || !lease?.item) return false;
      if (!claudeLeaseCoreIsCurrent(lease, routeStillCurrent)) return false;
      if (claudeConversationMenuTrigger(lease.officialHints) !== lease.trigger) return false;
      const binding = claudeMenuBindingIds(lease.trigger);
      if (String(lease.trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "false") return false;
      if (binding.ids.length) {
        if (binding.key !== lease.menuBindingKey) return false;
        try {
          for (const id of binding.ids) {
            const current = document.getElementById?.(id) || null;
            if (current !== lease.menuRoot) return false;
          }
        } catch {
          return false;
        }
      }
      return !visible2(lease.menuRoot) && !visible2(lease.item);
    }
    function claudeLeaseObservedTrustedDeleteShortcut(lease) {
      if (lease?.activationKind !== "shortcut") return true;
      const observer = lease.trustedKeyObserver;
      return Boolean(observer?.observed && !observer.invalid && Number(observer.observedAt) >= Number(observer.installedAt));
    }
    function claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent) {
      if (!claudeLeaseOriginalMenuClosed(lease, routeStillCurrent)) return null;
      if (!claudeLeaseObservedTrustedDeleteShortcut(lease) || lease.confirmationAmbiguous) return null;
      if (lease.frozenConfirmation) {
        return claudeDeleteConfirmationOwnershipIsCurrent(lease.frozenConfirmation, routeStillCurrent) ? lease.frozenConfirmation : null;
      }
      const ownerships = claudeDeleteConfirmationOwnerships(lease?.confirmationBaseline, lease?.officialHints);
      if (ownerships.length > 1) {
        lease.confirmationAmbiguous = true;
        return null;
      }
      const ownership = ownerships.length === 1 ? ownerships[0] : null;
      const active = document.activeElement || null;
      if (!ownership || !active || !ownership.root.contains?.(active)) return null;
      const frozen = { ...ownership, lease };
      lease.frozenConfirmation = frozen;
      return frozen;
    }
    function claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent) {
      const root = ownership?.root || null;
      const button = ownership?.button || null;
      const cancelButton = ownership?.cancelButton || null;
      const lease = ownership?.lease || null;
      if (!root || !button || !cancelButton || lease?.frozenConfirmation !== ownership) return false;
      if (!claudeLeaseOriginalMenuClosed(lease, routeStillCurrent)) return false;
      if (!claudeLeaseObservedTrustedDeleteShortcut(lease) || lease.confirmationAmbiguous) return false;
      if (!root.isConnected || !button.isConnected || !cancelButton.isConnected || !visible2(root) || !visible2(button) || !visible2(cancelButton)) return false;
      if (!root.contains?.(button) || !root.contains?.(cancelButton)) return false;
      if (!root.contains?.(document.activeElement || null)) return false;
      if (ownership.baselineRoots?.has(root)) return false;
      const details = claudeDeleteConfirmationDetails(root, lease?.officialHints);
      if (!details || details.button !== button || details.cancelButton !== cancelButton) return false;
      const currentOwnerships = claudeDeleteConfirmationOwnerships(ownership.baselineRoots, lease?.officialHints);
      return currentOwnerships.length === 1 && currentOwnerships[0].root === root && currentOwnerships[0].button === button && currentOwnerships[0].cancelButton === cancelButton;
    }
    function claudeDisposeTrustedDeleteKeyObserver(lease) {
      try {
        lease?.trustedKeyObserver?.dispose?.();
      } catch {
      }
    }
    function claudeInstallTrustedDeleteKeyObserver(lease, routeStillCurrent) {
      if (typeof document.addEventListener !== "function" || typeof document.removeEventListener !== "function") return null;
      const state = {
        installedAt: Date.now(),
        observedAt: 0,
        observed: false,
        invalid: false,
        disposed: false,
        dispose: null
      };
      let listening = false;
      let expiryTimer = null;
      const dispose = () => {
        if (expiryTimer != null) {
          clearTimeout(expiryTimer);
          expiryTimer = null;
        }
        if (listening) {
          listening = false;
          document.removeEventListener("keydown", onKeyDown, true);
        }
        state.disposed = true;
      };
      const onKeyDown = (event) => {
        dispose();
        let path = [];
        try {
          const value = event?.composedPath?.();
          if (Array.isArray(value)) path = value;
        } catch {
        }
        const target = event?.target || null;
        const exactPath = path.includes(lease.item) && path.includes(lease.menuRoot);
        const exactTarget = Boolean(target && (target === lease.item || lease.item.contains?.(target)));
        const valid = event?.isTrusted === true && event.key === "d" && event.repeat !== true && event.isComposing !== true && Number(event.keyCode || 0) !== 229 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && exactTarget && exactPath && claudeTrustedDeleteLease === lease && claudeLeaseCoreIsCurrent(lease, routeStillCurrent) && claudeConversationMenuTrigger(lease.officialHints) === lease.trigger && claudeLinkedDeleteMenuRoot(lease.trigger) === lease.menuRoot && String(lease.trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() === "true" && document.hasFocus?.() && document.activeElement === lease.item && Boolean(refreshClaudeDeleteMenuShortcutSession({ root: lease.menuRoot, item: lease.item }, lease.trigger, lease.officialHints));
        if (!valid) {
          state.invalid = true;
          return;
        }
        state.observed = true;
        state.observedAt = Date.now();
      };
      state.dispose = dispose;
      try {
        document.addEventListener("keydown", onKeyDown, true);
        listening = true;
        expiryTimer = setTimeout(() => {
          state.invalid = true;
          dispose();
        }, Math.max(0, Number(lease.expiresAt) - Date.now()));
        expiryTimer?.unref?.();
        return state;
      } catch {
        dispose();
        return null;
      }
    }
    function claudeHasNewDeleteConfirmation(baselineRoots = /* @__PURE__ */ new Set(), hints = {}) {
      return deleteDialogRoots(hints?.dialog).some((root) => !baselineRoots.has(root));
    }
    function claudeTrustedMenuResult(reason, element, kind) {
      const value = deleteResultWithTrustedMenuClick("claude", reason, element);
      return value?.trustedMenuClick ? { ...value, trustedMenuClick: { ...value.trustedMenuClick, kind } } : value;
    }
    function claudeTrustedDeleteShortcutResult(reason) {
      return deleteResult(false, "claude", reason, {
        needsTrustedKeySequence: true,
        trustedKeySequence: {
          kind: "claude-menu-delete-shortcut",
          site: "claude",
          reason,
          keys: [{ key: "d", settleMs: 420 }],
          keySettleMs: 160,
          settleMs: 520
        }
      });
    }
    function claudeExactConfirmationClick(button, ownershipStillCurrent) {
      if (!button || typeof button.click !== "function") return false;
      try {
        button.focus?.({ preventScroll: true });
      } catch {
        return false;
      }
      if (!document.hasFocus?.() || document.activeElement !== button) return false;
      if (typeof ownershipStillCurrent !== "function" || ownershipStillCurrent() !== true) return false;
      try {
        button.click();
        return true;
      } catch {
        return false;
      }
    }
    async function finishClaudeDeleteConfirmation(ownership, routeStillCurrent) {
      if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
        return deleteResult(false, "claude", "delete confirmation ownership is uncertain");
      }
      const root = ownership.root;
      const button = ownership.button;
      if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete confirmation");
      if (!claudeExactConfirmationClick(
        button,
        () => claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)
      )) {
        return deleteResult(false, "claude", "exact delete confirmation click was not accepted");
      }
      const closed = await waitForModel(() => !root.isConnected || !visible2(root), 5200, 100);
      if (closed) return deleteResult(true, "claude");
      if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during delete confirmation");
      if (!claudeDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent)) {
        return deleteResult(false, "claude", "delete confirmation ownership changed");
      }
      return deleteResult(false, "claude", "delete confirmation outcome is uncertain after its one allowed click");
    }
    async function waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent, timeoutMs = 2200) {
      const confirmation = await waitForModel(() => {
        if (!routeStillCurrent()) return null;
        return claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent);
      }, timeoutMs, 90);
      if (!routeStillCurrent()) return { state: "route-changed" };
      if (confirmation) return { state: "confirmation", confirmation };
      const session = refreshClaudeDeleteMenuSession({ root: lease.menuRoot, item: lease.item }, trigger, lease.officialHints);
      return session && session.item === lease.item ? { state: "menu-open", session } : { state: "uncertain" };
    }
    function claudeLeaseMatches(lease, data, phase, routeStillCurrent) {
      return Boolean(
        lease && lease.phase === phase && lease.attemptId && lease.attemptId === String(data?.deleteAttemptId || "") && lease.documentRef === document && lease.routeId === claudeConversationIdFromHref() && Number(lease.expiresAt) >= Date.now() && routeStillCurrent()
      );
    }
    function leaseClaudeTrustedDeleteShortcut(data, session, routeStillCurrent, confirmationBaseline) {
      const hints = claudeOfficialHints(data);
      const trigger = claudeConversationMenuTrigger(hints);
      const current = refreshClaudeDeleteMenuShortcutSession(session, trigger, hints);
      if (!current || !routeStillCurrent()) {
        return deleteResult(false, "claude", "owned Claude delete shortcut changed before activation");
      }
      if (claudeHasNewDeleteConfirmation(confirmationBaseline, hints)) {
        return deleteResult(false, "claude", "unverified delete confirmation appeared before Delete D activation");
      }
      const menuBinding = claudeMenuBindingIds(trigger);
      if (!menuBinding.ids.length || claudeLinkedDeleteMenuRoot(trigger) !== current.root || String(trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true") {
        return deleteResult(false, "claude", "owned Claude delete shortcut lost its title-menu binding");
      }
      claudeDisposeTrustedDeleteKeyObserver(claudeTrustedDeleteLease);
      claudeTrustedDeleteLease = {
        phase: "shortcut",
        activationKind: "shortcut",
        attemptId: String(data?.deleteAttemptId || ""),
        routeId: claudeConversationIdFromHref(),
        documentRef: document,
        trigger,
        menuRoot: current.root,
        menuBindingKey: menuBinding.key,
        item: current.item,
        officialHints: hints,
        confirmationBaseline,
        expiresAt: Date.now() + 12e3
      };
      return claudeTrustedDeleteShortcutResult("owned Claude menu requires its Delete D shortcut");
    }
    function focusClaudeDeleteShortcutLease(lease, routeStillCurrent) {
      if (!lease?.trigger || !lease?.menuRoot || !lease?.item || !routeStillCurrent()) return null;
      if (claudeConversationMenuTrigger(lease.officialHints) !== lease.trigger) return null;
      if (claudeLinkedDeleteMenuRoot(lease.trigger) !== lease.menuRoot) return null;
      if (claudeMenuBindingIds(lease.trigger).key !== lease.menuBindingKey) return null;
      if (String(lease.trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true") return null;
      const current = refreshClaudeDeleteMenuShortcutSession(
        { root: lease.menuRoot, item: lease.item },
        lease.trigger,
        lease.officialHints
      );
      if (!current || current.item !== lease.item) return null;
      try {
        current.item.focus?.({ preventScroll: true });
      } catch {
        return null;
      }
      const focused = refreshClaudeDeleteMenuShortcutSession(current, lease.trigger, lease.officialHints);
      if (!focused || focused.item !== lease.item || !routeStillCurrent()) return null;
      return document.hasFocus?.() && document.activeElement === focused.item ? focused : null;
    }
    function preflightClaudeTrustedDeleteShortcut(data, routeStillCurrent) {
      const lease = claudeTrustedDeleteLease;
      if (!claudeLeaseMatches(lease, data, "shortcut", routeStillCurrent)) {
        return deleteResult(false, "claude", "trusted Claude Delete D shortcut has no owned activation lease");
      }
      lease.phase = "preflighting";
      claudeDisposeTrustedDeleteKeyObserver(lease);
      if (claudeHasNewDeleteConfirmation(lease.confirmationBaseline, lease.officialHints)) {
        claudeReleaseActiveDeleteLease(lease);
        return deleteResult(false, "claude", "unverified delete confirmation appeared before trusted Delete D activation");
      }
      const focused = focusClaudeDeleteShortcutLease(lease, routeStillCurrent);
      if (!focused) {
        claudeReleaseActiveDeleteLease(lease);
        return deleteResult(false, "claude", "trusted Claude Delete D shortcut could not establish exact menu focus");
      }
      if (claudeHasNewDeleteConfirmation(lease.confirmationBaseline, lease.officialHints)) {
        claudeReleaseActiveDeleteLease(lease);
        return deleteResult(false, "claude", "unverified delete confirmation appeared while focusing trusted Delete D activation");
      }
      Object.assign(lease, {
        phase: "confirmation",
        activationKind: "shortcut",
        menuRoot: focused.root,
        item: focused.item,
        frozenConfirmation: null,
        confirmationAmbiguous: false,
        expiresAt: Date.now() + 12e3
      });
      const trustedKeyObserver = claudeInstallTrustedDeleteKeyObserver(lease, routeStillCurrent);
      if (!trustedKeyObserver) {
        claudeReleaseActiveDeleteLease(lease);
        return deleteResult(false, "claude", "trusted Claude Delete D observer could not be installed");
      }
      lease.trustedKeyObserver = trustedKeyObserver;
      return claudeTrustedDeleteShortcutResult("owned Claude menu Delete D shortcut is ready");
    }
    async function activateClaudeDeleteMenuItem(session, trigger, data, routeStillCurrent, confirmationBaseline) {
      const hints = claudeOfficialHints(data);
      if (!session || !routeStillCurrent()) return deleteResult(false, "claude", "owned delete menu item changed before activation");
      if (claudeHasNewDeleteConfirmation(confirmationBaseline, hints)) {
        return deleteResult(false, "claude", "unverified delete confirmation appeared before delete activation");
      }
      const menuBinding = claudeMenuBindingIds(trigger);
      if (!menuBinding.ids.length || claudeLinkedDeleteMenuRoot(trigger) !== session.root || String(trigger.getAttribute?.("aria-expanded") || "").trim().toLowerCase() !== "true") {
        return deleteResult(false, "claude", "owned delete menu lost its title-trigger binding before activation");
      }
      const lease = {
        phase: "confirmation",
        activationKind: "click",
        attemptId: String(data?.deleteAttemptId || ""),
        routeId: claudeConversationIdFromHref(),
        documentRef: document,
        trigger,
        menuRoot: session.root,
        menuBindingKey: menuBinding.key,
        item: session.item,
        officialHints: hints,
        confirmationBaseline,
        frozenConfirmation: null,
        confirmationAmbiguous: false,
        expiresAt: Date.now() + 12e3
      };
      claudeDisposeTrustedDeleteKeyObserver(claudeTrustedDeleteLease);
      claudeTrustedDeleteLease = lease;
      deleteClick(session.item) || deleteClickLayout(session.item);
      const outcome = await waitForClaudeDeleteOutcome(lease, trigger, routeStillCurrent);
      if (outcome.state === "confirmation") {
        if (claudeTrustedDeleteLease !== lease) {
          return deleteResult(false, "claude", "delete confirmation lease was replaced before finalization");
        }
        lease.phase = "confirming";
        try {
          return await finishClaudeDeleteConfirmation(outcome.confirmation, routeStillCurrent);
        } finally {
          claudeReleaseActiveDeleteLease(lease);
        }
      }
      if (outcome.state === "menu-open") {
        if (claudeTrustedDeleteLease !== lease || lease.phase !== "confirmation") {
          return deleteResult(false, "claude", "delete menu item lease was replaced before trusted retry");
        }
        return claudeTrustedMenuResult("delete menu item did not open an owned confirmation", lease.item, "delete-menu-item");
      }
      claudeReleaseActiveDeleteLease(lease);
      if (outcome.state === "route-changed") return deleteResult(false, "claude", "current conversation changed after delete activation");
      return deleteResult(false, "claude", "delete menu item outcome is uncertain");
    }
    async function resumeClaudeTrustedMenuTrigger(data, routeStillCurrent) {
      const lease = claudeTrustedDeleteLease;
      if (!claudeLeaseMatches(lease, data, "menu", routeStillCurrent)) {
        return deleteResult(false, "claude", "trusted conversation menu click has no owned activation lease");
      }
      if (!lease.trigger?.isConnected || claudeConversationMenuTrigger(lease.officialHints) !== lease.trigger) {
        return deleteResult(false, "claude", "trusted conversation menu trigger changed");
      }
      lease.phase = "opening-menu";
      try {
        const activation = await waitForModel(() => {
          if (claudeTrustedDeleteLease !== lease || lease.phase !== "opening-menu" || !claudeLeaseCoreIsCurrent(lease, routeStillCurrent)) return null;
          const shortcut = claudeDeleteMenuShortcutSession(lease.trigger, lease.shortcutMenuBaseline, lease.officialHints);
          if (shortcut) return { kind: "shortcut", session: shortcut };
          const session = claudeDeleteMenuSession(lease.trigger, lease.ownedMenuBaseline, lease.officialHints);
          return session ? { kind: "item", session } : null;
        }, 3200, 90);
        if (claudeTrustedDeleteLease !== lease) {
          return deleteResult(false, "claude", "trusted conversation menu lease was replaced while opening");
        }
        if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during trusted conversation menu click");
        if (!activation) return deleteResult(false, "claude", "trusted topic menu click did not open");
        if (activation.kind === "shortcut") {
          return leaseClaudeTrustedDeleteShortcut(data, activation.session, routeStillCurrent, lease.confirmationBaseline);
        }
        return await activateClaudeDeleteMenuItem(activation.session, lease.trigger, data, routeStillCurrent, lease.confirmationBaseline);
      } finally {
        claudeReleaseActiveDeleteLease(lease);
      }
    }
    async function resumeClaudeTrustedDeleteItem(data, routeStillCurrent) {
      const lease = claudeTrustedDeleteLease;
      if (!claudeLeaseMatches(lease, data, "confirmation", routeStillCurrent)) {
        return deleteResult(false, "claude", "trusted delete menu click has no owned activation lease");
      }
      lease.phase = "confirming";
      claudeDisposeTrustedDeleteKeyObserver(lease);
      try {
        if (lease.activationKind === "shortcut" && !claudeLeaseObservedTrustedDeleteShortcut(lease)) {
          return deleteResult(false, "claude", "trusted Claude Delete D keydown was not observed on the owned menu item");
        }
        const confirmation = claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent) || await waitForModel(() => routeStillCurrent() && claudeDeleteConfirmationOwnershipForLease(lease, routeStillCurrent), 3200, 90);
        if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed during trusted delete menu click");
        if (!confirmation) return deleteResult(false, "claude", "trusted delete menu click did not open an owned confirmation");
        return await finishClaudeDeleteConfirmation(confirmation, routeStillCurrent);
      } finally {
        claudeReleaseActiveDeleteLease(lease);
      }
    }
    async function deleteClaudeThread(data = {}) {
      const hints = claudeOfficialHints(data);
      const routeStillCurrent = claudeDeleteRouteGuard(data);
      if (!routeStillCurrent()) return deleteResult(false, "claude", "stable current conversation identity not found");
      if (data?.trustedKeySequencePreflight) return preflightClaudeTrustedDeleteShortcut(data, routeStillCurrent);
      if (data?.trustedMenuClickRetried || data?.trustedKeySequenceRetried) return resumeClaudeTrustedDeleteItem(data, routeStillCurrent);
      if (data?.trustedMenuTriggerRetried) return resumeClaudeTrustedMenuTrigger(data, routeStillCurrent);
      claudeDisposeTrustedDeleteKeyObserver(claudeTrustedDeleteLease);
      claudeTrustedDeleteLease = null;
      if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
        return deleteResult(false, "claude", "unverified delete confirmation is already open");
      }
      const trigger = claudeConversationMenuTrigger(hints);
      if (!trigger) return deleteResult(false, "claude", "conversation menu trigger not found");
      const ownedMenuBaseline = claudeOwnedDeleteMenuRoots(trigger, hints);
      const shortcutMenuBaseline = claudeShortcutDeleteMenuRoots(trigger, hints);
      const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete menu opened");
      const openingLease = {
        phase: "opening-menu",
        attemptId: String(data?.deleteAttemptId || ""),
        routeId: claudeConversationIdFromHref(),
        documentRef: document,
        trigger,
        officialHints: hints,
        ownedMenuBaseline,
        shortcutMenuBaseline,
        confirmationBaseline,
        expiresAt: Date.now() + 12e3
      };
      claudeTrustedDeleteLease = openingLease;
      let retainOpeningLease = false;
      try {
        deleteClick(trigger) || deleteClickLayout(trigger);
        const activation = await waitForModel(() => {
          if (claudeTrustedDeleteLease !== openingLease || !claudeLeaseMatches(openingLease, data, "opening-menu", routeStillCurrent)) return null;
          const shortcut = claudeDeleteMenuShortcutSession(trigger, shortcutMenuBaseline, hints);
          if (shortcut) return { kind: "shortcut", session: shortcut };
          const session = claudeDeleteMenuSession(trigger, ownedMenuBaseline, hints);
          return session ? { kind: "item", session } : null;
        }, 2400, 80);
        if (claudeTrustedDeleteLease !== openingLease) {
          return deleteResult(false, "claude", "initial conversation menu lease was replaced while opening");
        }
        if (!claudeLeaseMatches(openingLease, data, "opening-menu", routeStillCurrent)) {
          return deleteResult(false, "claude", "current conversation changed before delete menu opened");
        }
        if (!activation) {
          openingLease.phase = "menu";
          openingLease.expiresAt = Date.now() + 12e3;
          retainOpeningLease = true;
          return claudeTrustedMenuResult("owned delete menu item not found", trigger, "conversation-menu-trigger");
        }
        if (activation.kind === "shortcut") {
          return leaseClaudeTrustedDeleteShortcut(data, activation.session, routeStillCurrent, confirmationBaseline);
        }
        await sleep2(120);
        if (claudeTrustedDeleteLease !== openingLease) {
          return deleteResult(false, "claude", "initial conversation menu lease was replaced before delete activation");
        }
        if (!routeStillCurrent()) return deleteResult(false, "claude", "current conversation changed before delete activation");
        if (!claudeLeaseMatches(openingLease, data, "opening-menu", routeStillCurrent)) {
          return deleteResult(false, "claude", "initial conversation menu lease expired before delete activation");
        }
        const currentSession = refreshClaudeDeleteMenuSession(activation.session, trigger, hints);
        if (!currentSession || !routeStillCurrent()) {
          return deleteResult(false, "claude", routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
        }
        if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
          return deleteResult(false, "claude", "unverified delete confirmation appeared before delete activation");
        }
        return activateClaudeDeleteMenuItem(currentSession, trigger, data, routeStillCurrent, confirmationBaseline);
      } finally {
        if (!retainOpeningLease) claudeReleaseActiveDeleteLease(openingLease);
      }
    }
    return Object.freeze({ deleteClaudeThread });
  }

  // content-src/capabilities/delete-sites.js
  function createDeleteSitesCapability(deps = {}) {
    const {
      qsa: qsa2,
      normalize: normalize2,
      deleteCompactToken,
      modelRect,
      deleteElementText,
      deleteClickableElement,
      isDisabledElement: isDisabledElement2,
      svgSignature,
      visible: visible2,
      deleteLabelMatchesExactish,
      deleteLabelMatches,
      DELETE_CANCEL_LABELS,
      matches: matches2,
      visibleSelectorElements,
      deleteClickLayout,
      sleep: sleep2,
      deleteClick,
      closest: closest2,
      findDeleteConfirmButton,
      findDeleteConfirmButtonInfo,
      clickDeleteConfirmIfPresent,
      deleteResult,
      dispatchDeleteKeyboardShortcut,
      deleteDialogRoots,
      deleteResultWithTrustedConfirm,
      deleteResultWithTrustedDeleteShortcut,
      visibleDeleteCandidates,
      modelElementArea,
      modelElementFromPoint,
      deleteActivateUntil,
      waitForModel,
      deleteResultWithTrustedMenuClick
    } = deps;
    const { deleteClaudeThread } = createDeleteClaudeCapability(deps);
    const officialHints = (data = {}) => data?.officialRuleHints && typeof data.officialRuleHints === "object" ? data.officialRuleHints : {};
    const officialSelectors = (data = {}, slot = "") => (Array.isArray(officialHints(data)?.[slot]) ? officialHints(data)[slot] : []).map((selector) => String(selector || "").trim()).filter(Boolean).slice(0, 8);
    const pendingDeleteConfirmationLeases = /* @__PURE__ */ new Map();
    const deleteAttemptIdentity = (data = {}) => {
      const attemptId = String(data?.deleteAttemptId || "").trim();
      const provider = String(data?.expectedDeleteIdentity?.provider || "").trim().toLowerCase();
      const id = String(data?.expectedDeleteIdentity?.id || "").trim();
      return attemptId && attemptId.length <= 256 && provider && id ? { attemptId, provider, id } : null;
    };
    const currentDeleteHref = () => {
      try {
        return String(location.href || "");
      } catch {
        return "";
      }
    };
    const deleteAttemptRouteGuard = (data = {}, expectedHref = "") => {
      const identity2 = deleteAttemptIdentity(data);
      const href = String(expectedHref || currentDeleteHref());
      if (!identity2 || !href || currentDeleteHref() !== href) return null;
      return () => {
        const current = deleteAttemptIdentity(data);
        return Boolean(
          current && current.attemptId === identity2.attemptId && current.provider === identity2.provider && current.id === identity2.id && currentDeleteHref() === href
        );
      };
    };
    const grokDeleteAttemptRouteGuard = (data = {}) => {
      const identity2 = deleteAttemptIdentity(data);
      let routeId = "";
      try {
        routeId = new URL(String(location.href || "")).pathname.match(/^\/(?:c|chat)\/([^/?#]+)/i)?.[1] || "";
      } catch {
      }
      if (!identity2 || identity2.provider !== "grok" || !routeId || identity2.id !== routeId) return null;
      return deleteAttemptRouteGuard(data);
    };
    const armDeleteConfirmationLease = (site, data, phase, baseline, metadata = {}) => {
      const identity2 = deleteAttemptIdentity(data);
      const href = currentDeleteHref();
      if (!identity2 || !href) return false;
      pendingDeleteConfirmationLeases.set(site, {
        ...identity2,
        href,
        phase,
        baseline,
        metadata,
        expiresAt: Date.now() + 2e4
      });
      return true;
    };
    const consumeDeleteConfirmationLease = (site, data) => {
      const identity2 = deleteAttemptIdentity(data);
      const lease = pendingDeleteConfirmationLeases.get(site) || null;
      pendingDeleteConfirmationLeases.delete(site);
      return Boolean(
        identity2 && lease && lease.attemptId === identity2.attemptId && lease.provider === identity2.provider && lease.id === identity2.id && lease.href === currentDeleteHref() && Number(lease.expiresAt) >= Date.now()
      ) ? lease : null;
    };
    const deleteConfirmationAlreadyOpen = (hints = {}) => Boolean(
      findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length
    );
    const sameDeleteConfirmationRoot = (left, right) => Boolean(
      left && right && (left === right || left.contains?.(right) || right.contains?.(left))
    );
    const deleteConfirmationOwnership = (baseline = /* @__PURE__ */ new Set(), hints = {}, attemptGuard = null) => {
      if (typeof attemptGuard === "function" && attemptGuard() !== true) return null;
      const roots = deleteDialogRoots(hints.dialog);
      const info = findDeleteConfirmButtonInfo(hints);
      const button = info?.element || null;
      const root = info?.root || roots.find((candidate) => candidate === button || candidate.contains?.(button)) || null;
      if (!button || !root || baseline?.has(root)) return null;
      if ([...baseline || []].some((candidate) => sameDeleteConfirmationRoot(candidate, root))) return null;
      if (!button.isConnected || !root.isConnected || !visible2(button) || !visible2(root) || !root.contains?.(button)) return null;
      if (!roots.some((candidate) => candidate === root)) return null;
      if (roots.some((candidate) => !sameDeleteConfirmationRoot(candidate, root))) return null;
      return { root, button };
    };
    const deleteConfirmationOwnershipIsCurrent = (ownership, hints = {}, attemptGuard = null) => {
      const root = ownership?.root || null;
      const button = ownership?.button || null;
      if (typeof attemptGuard === "function" && attemptGuard() !== true) return false;
      if (!root || !button || !root.isConnected || !button.isConnected || !visible2(root) || !visible2(button)) return false;
      if (!root.contains?.(button)) return false;
      const roots = deleteDialogRoots(hints.dialog);
      const info = findDeleteConfirmButtonInfo(hints);
      const currentRoot = info?.root || roots.find((candidate) => candidate === info?.element || candidate.contains?.(info?.element)) || null;
      return info?.element === button && currentRoot === root && roots.some((candidate) => candidate === root) && roots.every((candidate) => sameDeleteConfirmationRoot(candidate, root));
    };
    const waitForOwnedDeleteConfirmation = (baseline, hints, timeoutMs = 2600, attemptGuard = null) => waitForModel(
      () => deleteConfirmationOwnership(baseline, hints, attemptGuard),
      timeoutMs,
      80
    );
    const deleteConfirmationObservation = (baseline, hints, attemptGuard = null) => {
      const hasConfirmation = deleteConfirmationAlreadyOpen(hints);
      if (!hasConfirmation) return { state: "none", ownership: null };
      const ownership = deleteConfirmationOwnership(baseline, hints, attemptGuard);
      return ownership ? { state: "owned", ownership } : { state: "unowned", ownership: null };
    };
    async function observeOptionalDeleteConfirmation(baseline, hints, attemptGuard, timeoutMs = 900) {
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        const observation = deleteConfirmationObservation(baseline, hints, attemptGuard);
        if (observation.state !== "none") return observation;
        await sleep2(80);
      }
      return deleteConfirmationObservation(baseline, hints, attemptGuard);
    }
    async function finishOwnedDeleteConfirmation(site, ownership, hints, timeoutMs, attemptGuard = null, allowTrustedFallback = true) {
      const guard = () => deleteConfirmationOwnershipIsCurrent(ownership, hints, attemptGuard);
      if (!guard()) return deleteResult(false, site, "delete confirmation ownership is uncertain");
      const confirmed = await clickDeleteConfirmIfPresent(timeoutMs, guard, hints);
      if (confirmed) return deleteResult(true, site);
      if (guard() && allowTrustedFallback) return deleteResultWithTrustedConfirm(site, "delete confirmation did not close", hints);
      if (guard()) return deleteResult(false, site, "delete confirmation did not close");
      return deleteResult(false, site, "delete confirmation ownership changed");
    }
    async function deleteKagiThread(data = {}) {
      const hints = officialHints(data);
      const attemptGuard = deleteAttemptRouteGuard(data);
      pendingDeleteConfirmationLeases.delete("kagi");
      if (!attemptGuard || !attemptGuard()) return deleteResult(false, "kagi", "stable delete attempt and route identity not found");
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "kagi", "unverified delete confirmation is already open");
      const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      const shortcutDispatched = dispatchDeleteKeyboardShortcut();
      if (!shortcutDispatched) return deleteResult(false, "kagi", "delete shortcut dispatch failed");
      if (!attemptGuard()) return deleteResult(false, "kagi", "current conversation changed before delete shortcut");
      const confirmation = await waitForOwnedDeleteConfirmation(confirmationBaseline, hints, 2600, attemptGuard);
      if (!confirmation) return deleteResult(false, "kagi", deleteConfirmationAlreadyOpen(hints) ? "delete confirmation ownership is uncertain" : "delete shortcut did not open confirmation");
      return finishOwnedDeleteConfirmation("kagi", confirmation, hints, 3600, attemptGuard);
    }
    async function deleteChatGptThread(data = {}) {
      const hints = officialHints(data);
      if (data?.trustedKeySequenceRetried) {
        const lease = consumeDeleteConfirmationLease("chatgpt", data);
        if (!lease || lease.phase !== "shortcut-confirmation") {
          return deleteResult(false, "chatgpt", "trusted delete shortcut does not match the pending attempt");
        }
        const attemptGuard2 = deleteAttemptRouteGuard(data, lease.href);
        if (!attemptGuard2) return deleteResult(false, "chatgpt", "trusted delete shortcut route ownership changed");
        const confirmation = deleteConfirmationOwnership(lease.baseline, hints, attemptGuard2) || await waitForOwnedDeleteConfirmation(lease.baseline, hints, 2600, attemptGuard2);
        if (!confirmation) return deleteResult(false, "chatgpt", deleteConfirmationAlreadyOpen(hints) ? "delete confirmation ownership is uncertain" : "trusted delete shortcut did not open confirmation");
        return finishOwnedDeleteConfirmation("chatgpt", confirmation, hints, 4200, attemptGuard2);
      }
      const attemptGuard = deleteAttemptRouteGuard(data);
      pendingDeleteConfirmationLeases.delete("chatgpt");
      if (!attemptGuard || !attemptGuard()) return deleteResult(false, "chatgpt", "stable delete attempt and route identity not found");
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "chatgpt", "unverified delete confirmation is already open");
      const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      const shortcutDispatched = dispatchDeleteKeyboardShortcut();
      if (shortcutDispatched) {
        const confirmation = await waitForOwnedDeleteConfirmation(confirmationBaseline, hints, 2600, attemptGuard);
        if (confirmation) return finishOwnedDeleteConfirmation("chatgpt", confirmation, hints, 4200, attemptGuard);
        if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "chatgpt", "delete confirmation ownership is uncertain");
      }
      const reason = shortcutDispatched ? "delete shortcut did not open confirmation" : "delete shortcut dispatch failed";
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "chatgpt", "delete confirmation ownership is uncertain");
      if (!attemptGuard() || !armDeleteConfirmationLease("chatgpt", data, "shortcut-confirmation", confirmationBaseline)) {
        return deleteResult(false, "chatgpt", `${reason}; trusted retry ownership unavailable`);
      }
      return deleteResultWithTrustedDeleteShortcut("chatgpt", reason);
    }
    const DELETE_MENU_ROOT_SELECTORS = [
      "[role='menu']",
      "[role='listbox']",
      "[role='dialog']",
      "[data-radix-menu-content]",
      "[data-radix-popper-content-wrapper]",
      "[data-floating-ui-portal]",
      "[data-slot='dropdown-menu-content']",
      "[cmdk-root]",
      "[class*='dropdown' i]",
      "[class*='popover' i]",
      "[class*='popper' i]",
      "[class*='menu' i]"
    ];
    function menuRootsWithDelete(labels, candidateSelectors = []) {
      const roots = visibleSelectorElements([...DELETE_MENU_ROOT_SELECTORS, ...candidateSelectors]).filter((root) => {
        const value = deleteElementText(root);
        return deleteLabelMatches(value, labels) || /rename|pin|share|重命名|置顶|分享/i.test(value);
      }).sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0);
      });
      const pushRoot = (root) => {
        if (!root || !visible2(root)) return;
        const rect = modelRect(root);
        if (!rect || rect.width < 72 || rect.height < 28 || rect.width > 520 || rect.height > 620) return;
        const value = deleteElementText(root);
        if (!deleteLabelMatches(value, labels) && !/rename|pin|share|重命名|置顶|分享/i.test(value)) return;
        if (!roots.some((item) => item === root || item.contains?.(root) || root.contains?.(item))) roots.push(root);
      };
      for (const item of visibleDeleteCandidates(document)) {
        if (!deleteLabelMatches(deleteElementText(item), labels)) continue;
        for (let node = item; node && node !== document.body; node = node.parentElement) {
          pushRoot(node);
          if (roots.some((root) => root === node)) break;
        }
      }
      roots.sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0) || modelElementArea(a) - modelElementArea(b);
      });
      return roots;
    }
    function findDeleteMenuItem(root, labels, candidateSelectors = []) {
      const candidates = [];
      const cancelLabels = ["Cancel", "取消"];
      const seen = /* @__PURE__ */ new Set();
      const add = (element, { exactOnly = false, extraScore = 0 } = {}) => {
        if (!element || seen.has(element)) return;
        const value = deleteElementText(element);
        if (!deleteLabelMatches(value, labels)) return;
        if (exactOnly && !deleteLabelMatchesExactish(value, labels)) return;
        if (deleteLabelMatches(value, cancelLabels)) return;
        const target = deleteClickableElement(element);
        if (!target || seen.has(target) || !visible2(target) || isDisabledElement2(target)) return;
        const rect = modelRect(target);
        if (exactOnly && (!rect || rect.width < 12 || rect.height < 10 || rect.width > 360 || rect.height > 90)) return;
        seen.add(element);
        seen.add(target);
        candidates.push({
          element: target,
          score: extraScore + (deleteLabelMatches(value, labels, { exact: true }) ? 500 : 0),
          top: rect?.top || 0,
          area: rect ? rect.width * rect.height : 0
        });
      };
      for (const element of visibleDeleteCandidates(root)) add(element);
      for (const selector of candidateSelectors) {
        for (const element of qsa2(selector, root, { all: true })) add(element, { extraScore: 260 });
      }
      if (!candidates.length) {
        for (const element of qsa2("[role='menuitem'],[role='option'],button,[role='button'],li,div,span", root, { all: true })) {
          if (!visible2(element) || isDisabledElement2(element)) continue;
          add(element, { exactOnly: true, extraScore: 180 });
        }
      }
      candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
      return candidates[0]?.element || null;
    }
    function findOpenDeleteMenuItem(labels, menuRootSelectors = [], candidateSelectors = []) {
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const menuRoots = visibleSelectorElements([...DELETE_MENU_ROOT_SELECTORS, ...menuRootSelectors]);
      const add = (element, extraScore = 0) => {
        if (!element || seen.has(element) || !visible2(element) || isDisabledElement2(element)) return;
        const value = deleteElementText(element);
        if (!deleteLabelMatchesExactish(value, labels)) return;
        if (deleteLabelMatches(value, DELETE_CANCEL_LABELS)) return;
        const target = deleteClickableElement(element);
        if (!target || seen.has(target) || !visible2(target) || isDisabledElement2(target)) return;
        const rect = modelRect(target);
        if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 420 || rect.height > 110) return;
        const root = menuRoots.find((item) => item === target || item.contains?.(target));
        seen.add(element);
        seen.add(target);
        candidates.push({
          element: target,
          score: extraScore + (root ? 320 : 0) + (matches2(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 160 : 0),
          top: rect.top,
          right: rect.right,
          area: rect.width * rect.height
        });
      };
      for (const root of menuRoots) {
        for (const selector of candidateSelectors) {
          for (const element of qsa2(selector, root, { all: true })) add(element, 360);
        }
        for (const element of qsa2("[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", root, { all: true })) {
          add(element, 220);
        }
      }
      if (!candidates.length) {
        for (const element of qsa2("[role='menuitem'],[role='option'],button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),li,div,span", document, { all: true })) {
          add(element, 0);
        }
      }
      candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top || a.area - b.area);
      return candidates[0]?.element || null;
    }
    async function openTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false, guard = null, hints = {} } = {}) {
      if (!trigger || !visible2(trigger) && !allowHiddenTrigger) return false;
      const guarded = () => typeof guard !== "function" || guard() === true;
      if (!guarded()) return false;
      const menuRootSelectors = Array.isArray(hints.menuRoot) ? hints.menuRoot : [];
      const deleteSelectors = Array.isArray(hints.deleteCandidate) ? hints.deleteCandidate : [];
      const existingRoot = menuRootsWithDelete(labels, menuRootSelectors)[0] || null;
      if (!existingRoot && !(allowHiddenTrigger ? deleteClickLayout(trigger) : deleteClick(trigger))) return false;
      await sleep2(140);
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        const root = menuRootsWithDelete(labels, menuRootSelectors)[0] || existingRoot;
        const item = (root ? findDeleteMenuItem(root, labels, deleteSelectors) : null) || findOpenDeleteMenuItem(labels, menuRootSelectors, deleteSelectors);
        if (item && guarded() && (deleteClick(item) || deleteClickLayout(item))) return true;
        await sleep2(120);
      }
      return false;
    }
    function topRightMenuTrigger({ labels = [], selectors = [] } = {}) {
      const viewportWidth = Math.max(1, Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const selector = [
        ...selectors,
        "button",
        "[role='button']",
        "[aria-haspopup='menu']",
        "[aria-expanded]"
      ].join(", ");
      for (const element of qsa2(selector, document, { all: true })) {
        const target = deleteClickableElement(element);
        if (!target || seen.has(target) || !visible2(target) || isDisabledElement2(target)) continue;
        seen.add(target);
        const rect = modelRect(target);
        if (!rect || rect.top > 190 || rect.right < viewportWidth * 0.45) continue;
        if (target.closest?.(DELETE_MENU_ROOT_SELECTORS.join(", "))) continue;
        const value = deleteElementText(target);
        const hasLabel = deleteLabelMatches(value, labels);
        const popup = String(target.getAttribute?.("aria-haspopup") || "").toLowerCase();
        const compact = deleteCompactToken(value);
        const hasMore = /more|menu|options|ellipsis|delete|rename|更多|菜单|选项|删除|重命名/.test(compact);
        const svg = svgSignature(target);
        const hasEllipsisIcon = /ellipsis|more|dots|circle/.test(svg) || qsa2("circle", target).length >= 2;
        if (!hasLabel && !hasMore && popup !== "menu" && !hasEllipsisIcon) continue;
        candidates.push({
          element: target,
          score: (hasLabel ? 900 : 0) + (hasMore ? 320 : 0) + (popup === "menu" ? 160 : 0) + (hasEllipsisIcon ? 140 : 0) + (rect.right >= viewportWidth * 0.72 ? 80 : 0) + (rect.width <= 64 ? 40 : 0),
          right: rect.right,
          top: rect.top
        });
      }
      candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
      return candidates[0]?.element || null;
    }
    async function deleteGrokThread(data = {}) {
      const hints = officialHints(data);
      const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
      const attemptGuard = grokDeleteAttemptRouteGuard(data);
      if (!attemptGuard || !attemptGuard()) {
        return deleteResult(false, "grok", "stable delete attempt and route identity not found");
      }
      if (deleteConfirmationAlreadyOpen(hints)) {
        return deleteResult(false, "grok", "unverified delete confirmation is already open");
      }
      const trigger = topRightMenuTrigger({
        labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"],
        selectors: officialSelectors(data, "menuTrigger")
      });
      if (!trigger) return deleteResult(false, "grok", "conversation menu trigger not found");
      const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      if (!attemptGuard()) return deleteResult(false, "grok", "current conversation changed before delete activation");
      const preDeleteGuard = () => attemptGuard() && !deleteConfirmationAlreadyOpen(hints);
      if (!await openTriggerAndClickDelete(trigger, labels, { guard: preDeleteGuard, hints })) {
        if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "grok", "unverified delete confirmation appeared before delete activation");
        return deleteResult(false, "grok", "delete menu item not found");
      }
      const observation = await observeOptionalDeleteConfirmation(confirmationBaseline, hints, attemptGuard, 900);
      if (observation.state === "owned") {
        return finishOwnedDeleteConfirmation("grok", observation.ownership, hints, 5200, attemptGuard, false);
      }
      if (observation.state === "unowned") {
        return deleteResult(false, "grok", "delete confirmation ownership is uncertain");
      }
      return deleteResult(true, "grok");
    }
    const GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR = [
      "top-bar-actions conversation-actions-icon button[data-test-id='conversation-actions-menu-icon-button']",
      "top-bar-actions button[data-test-id='conversation-actions-menu-icon-button']",
      "top-bar-actions button.conversation-actions-menu-button",
      "top-bar-actions button[aria-label*='conversation actions' i]",
      "top-bar-actions button[aria-label*='open menu' i]",
      "button[data-test-id='conversation-actions-menu-icon-button']",
      "button.conversation-actions-menu-button",
      "button[aria-label*='Open menu for conversation actions' i]",
      "button[aria-label*='conversation actions' i]",
      "button[aria-label*='more options' i]",
      "button[data-test-id='actions-menu-button']"
    ].join(", ");
    const GEMINI_DELETE_MENU_ROOT_SELECTOR = [
      ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
      ".cdk-overlay-pane .mat-menu-panel[role='menu']",
      ".cdk-overlay-pane [role='menu']",
      ".cdk-overlay-pane .mat-mdc-menu-panel",
      ".cdk-overlay-pane .mat-menu-panel",
      ".mat-mdc-menu-panel[role='menu']",
      ".mat-menu-panel[role='menu']",
      ".cdk-overlay-pane"
    ].join(", ");
    const GEMINI_DELETE_MENU_ITEM_SELECTOR = [
      "button[mat-menu-item]",
      "button.mat-mdc-menu-item",
      "button[aria-label]",
      "button[jslog]",
      "button[data-test-id]",
      "[role='menuitem']",
      "[role='menuitemradio']",
      "[role='menuitemcheckbox']",
      "[role='button']",
      "[aria-label]",
      "[title]",
      "[jslog]",
      "[data-test-id]",
      "[tabindex]",
      "mat-icon",
      "span",
      "div"
    ].join(", ");
    const GEMINI_DELETE_MENU_MARKERS = ["Delete", "Rename", "Pin", "Share", "Unpin", "删除", "重命名", "固定", "取消固定", "分享"];
    function geminiDeleteCollectTextExcludingIcons(node, parts = []) {
      if (!node) return parts;
      if (node.nodeType === 3) {
        parts.push(node.nodeValue || "");
        return parts;
      }
      if (node.nodeType !== 1) return parts;
      const tagName = String(node.tagName || "").toLowerCase();
      if (tagName === "mat-icon") return parts;
      if (String(node.getAttribute?.("aria-hidden") || "").trim().toLowerCase() === "true") return parts;
      if (node.hasAttribute?.("fonticon") || node.hasAttribute?.("data-mat-icon-name")) return parts;
      try {
        for (const child of Array.from(node.childNodes || [])) geminiDeleteCollectTextExcludingIcons(child, parts);
      } catch {
      }
      return parts;
    }
    function geminiDeleteUiText(node) {
      if (!node) return "";
      const ariaLabel = node.getAttribute?.("aria-label");
      if (ariaLabel && String(ariaLabel).trim()) return normalize2(ariaLabel);
      const title = node.getAttribute?.("title");
      if (title && String(title).trim()) return normalize2(title);
      const withoutIcons = normalize2(geminiDeleteCollectTextExcludingIcons(node, []).join(" "));
      if (withoutIcons) return withoutIcons;
      return normalize2(node.textContent || "");
    }
    function geminiDeleteJslogId(node) {
      for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
        const match = String(current.getAttribute?.("jslog") || "").match(/^\s*([0-9]+)/);
        if (match) return match[1];
      }
      return "";
    }
    function geminiDeleteDataTestIds(node) {
      const ids = [];
      const add = (item) => {
        const id = String(item?.getAttribute?.("data-test-id") || "").trim().toLowerCase();
        if (id && !ids.includes(id)) ids.push(id);
      };
      add(node);
      qsa2("[data-test-id]", node, { all: true }).forEach(add);
      return ids;
    }
    function geminiDeleteMenuItemLooksLikeNotebook(node) {
      const value = normalize2([geminiDeleteUiText(node), deleteElementText(node), geminiDeleteDataTestIds(node).join(" ")].join(" "));
      return /\bnotebook\b/i.test(value) || value.includes("笔记本");
    }
    function geminiDeleteMenuMarkerCount(node) {
      const value = normalize2([geminiDeleteUiText(node), node?.textContent].filter(Boolean).join(" ")).toLowerCase();
      const matched = [];
      for (const marker of GEMINI_DELETE_MENU_MARKERS.map((item) => item.toLowerCase()).sort((a, b) => b.length - a.length)) {
        if (!value.includes(marker) || matched.some((existing) => existing.includes(marker))) continue;
        matched.push(marker);
      }
      return matched.length;
    }
    function geminiDeleteConversationMenuRoot(node) {
      if (!node || !visible2(node)) return false;
      const tagName = String(node.tagName || "").toLowerCase();
      const role = String(node.getAttribute?.("role") || "").toLowerCase();
      if (tagName === "mat-dialog-container" || role === "dialog") return false;
      const isOverlay = Boolean(node.matches?.(".cdk-overlay-pane"));
      const panel = node.matches?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']") ? node : node.querySelector?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']");
      if (!panel && !isOverlay) return false;
      if (node.querySelector?.("mat-dialog-container, [role='dialog']")) return false;
      if (node.querySelector?.("button[data-test-id='delete-button'],button[data-test-id='pin-button'],button[data-test-id='rename-button'],button[aria-label*='Delete' i],button[aria-label*='Rename' i],button[aria-label*='Pin' i],button[aria-label*='Share' i]")) return true;
      return geminiDeleteMenuMarkerCount(node) > 0;
    }
    function geminiDeleteConversationActionButtonExcluded(button) {
      if (!button || !visible2(button)) return true;
      if (button.closest?.("bard-sidenav, side-navigation-content, .sidenav-with-history-container, .conversation-items-container, side-nav-action-button")) return true;
      if (button.closest?.("input-area-v2, [data-node-type='input-area'], [contenteditable='true'], .prompt-input, .composer, .prompt-composer")) return true;
      if (button.closest?.("user-query,user-query-content,model-response,message-content,message-actions,response-actions,.message-actions,.response-actions,[data-test-id*='user-query' i],[data-test-id*='model-response' i],[data-test-id*='response' i],[data-test-id*='message' i],[data-test-id*='query' i]")) return true;
      if (button.closest?.(".cdk-overlay-pane .mat-mdc-menu-panel,.cdk-overlay-pane .mat-menu-panel,.cdk-overlay-pane [role='menu'],mat-dialog-container,[role='dialog']")) return true;
      return false;
    }
    function geminiDeleteConversationActionButton(data = {}) {
      const candidates = [];
      const selector = [...officialSelectors(data, "menuTrigger"), GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR].join(",");
      for (const button of qsa2(selector, document, { all: true })) {
        if (geminiDeleteConversationActionButtonExcluded(button)) continue;
        const dataTestId = String(button.getAttribute?.("data-test-id") || "").trim().toLowerCase();
        const ariaLabel = normalize2(button.getAttribute?.("aria-label") || "").toLowerCase();
        const title = normalize2(button.getAttribute?.("title") || "").toLowerCase();
        const textValue = geminiDeleteUiText(button).toLowerCase();
        const className = String(button.className || "").toLowerCase();
        const inTopBar = Boolean(button.closest?.("top-bar-actions"));
        const explicitlyConversationAction = inTopBar || dataTestId === "conversation-actions-menu-icon-button" || className.includes("conversation-actions-menu-button") || ariaLabel.includes("conversation actions") || ariaLabel.includes("open menu for conversation actions") || title.includes("conversation actions") || textValue.includes("conversation actions");
        if (!explicitlyConversationAction) continue;
        const box = modelRect(button);
        let score = 0;
        if (dataTestId === "conversation-actions-menu-icon-button") score += 160;
        if (dataTestId === "actions-menu-button") score += 70;
        if (className.includes("conversation-actions-menu-button")) score += 130;
        if (inTopBar) score += 120;
        if (ariaLabel.includes("conversation actions")) score += 100;
        if (ariaLabel.includes("open menu for conversation actions")) score += 140;
        if (inTopBar && ariaLabel.includes("more options")) score += 40;
        if (title.includes("conversation actions")) score += 60;
        if (textValue.includes("conversation actions")) score += 70;
        if (inTopBar && /more_vert/i.test(deleteElementText(button))) score += 35;
        if (box && box.top <= Math.max(220, (window.innerHeight || 1) * 0.32)) score += 20;
        if (box && box.left >= (window.innerWidth || 1) * 0.42) score += 20;
        candidates.push({ element: button, score });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.element || null;
    }
    function geminiDeleteConversationMenuRoots(trigger = null, data = {}) {
      const roots = [];
      const add = (node) => {
        if (node && geminiDeleteConversationMenuRoot(node) && !roots.includes(node)) roots.push(node);
      };
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      if (controlsId) {
        try {
          add(document.getElementById(controlsId));
        } catch {
        }
      }
      const selector = [...officialSelectors(data, "menuRoot"), GEMINI_DELETE_MENU_ROOT_SELECTOR].join(",");
      qsa2(selector, document, { all: true }).forEach(add);
      return roots;
    }
    function geminiDeleteMenuItemMatches(node) {
      if (!node || !visible2(node) || isDisabledElement2(node) || geminiDeleteMenuItemLooksLikeNotebook(node)) return false;
      const uiText = geminiDeleteUiText(node);
      if (/\bdelete\b/i.test(uiText) || uiText.includes("删除")) return true;
      if (uiText) return false;
      if (geminiDeleteDataTestIds(node).includes("delete-button")) return true;
      return geminiDeleteJslogId(node) === "186000";
    }
    function findGeminiDeleteMenuItem(trigger = null, data = {}) {
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const roots = geminiDeleteConversationMenuRoots(trigger, data);
      const add = (node, root, extraScore = 0) => {
        if (!node || seen.has(node) || !geminiDeleteMenuItemMatches(node)) return;
        let target = deleteClickableElement(node) || node;
        if (target === root || geminiDeleteMenuMarkerCount(target) > 1) {
          target = closest2(node, "button,[role='menuitem'],[role='button'],[mat-menu-item],[data-test-id],[jslog],[tabindex]") || node;
        }
        if (!target || target === root || seen.has(target) || !visible2(target) || isDisabledElement2(target) || geminiDeleteMenuMarkerCount(target) > 1 || geminiDeleteMenuItemLooksLikeNotebook(target)) return;
        const box = modelRect(target);
        if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 140) return;
        const ids = geminiDeleteDataTestIds(target);
        const uiText = geminiDeleteUiText(target);
        seen.add(node);
        seen.add(target);
        candidates.push({
          element: target,
          score: extraScore + (ids.includes("delete-button") ? 1e3 : 0) + (geminiDeleteJslogId(target) === "186000" ? 800 : 0) + (/^(delete|删除)$/i.test(uiText) ? 650 : 0) + (target.matches?.("button,[role='menuitem'],[role='button']") ? 180 : 0),
          top: box.top,
          right: box.right
        });
      };
      for (let index = roots.length - 1; index >= 0; index -= 1) {
        const root = roots[index];
        for (const selector of officialSelectors(data, "deleteCandidate")) {
          qsa2(selector, root, { all: true }).forEach((node) => add(node, root, 520 + index));
        }
        qsa2(GEMINI_DELETE_MENU_ITEM_SELECTOR, root, { all: true }).forEach((node) => add(node, root, 240 + index));
      }
      candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
      return candidates[0]?.element || null;
    }
    async function resolveGeminiDeleteMenuItem(trigger, data = {}) {
      const menuReady = () => findGeminiDeleteMenuItem(trigger, data);
      let item = menuReady();
      if (!item) item = await deleteActivateUntil(trigger, menuReady, { settleMs: 220 });
      if (!item) return null;
      await sleep2(120);
      return findGeminiDeleteMenuItem(trigger, data) || item;
    }
    async function activateGeminiDeleteItem(item, data, hints, attemptGuard) {
      if (!item) return deleteResult(false, "gemini", "delete menu item not found");
      if (typeof attemptGuard !== "function" || attemptGuard() !== true) {
        return deleteResult(false, "gemini", "current conversation or delete attempt changed before delete activation");
      }
      if (deleteConfirmationAlreadyOpen(hints)) {
        return deleteResult(false, "gemini", "unverified delete confirmation appeared before delete activation");
      }
      const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      const activated = deleteClick(item) || deleteClickLayout(item);
      if (activated) {
        const confirmation = await waitForOwnedDeleteConfirmation(confirmationBaseline, hints, 3e3, attemptGuard);
        if (confirmation) return finishOwnedDeleteConfirmation("gemini", confirmation, hints, 6500, attemptGuard);
        if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "delete confirmation ownership is uncertain");
      }
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "delete confirmation ownership is uncertain");
      const stillOpenItem = findGeminiDeleteMenuItem(null, data);
      if (!stillOpenItem) return deleteResult(false, "gemini", activated ? "delete confirmation button not found" : "delete menu item activation failed");
      if (!attemptGuard() || !armDeleteConfirmationLease("gemini", data, "delete-confirmation", confirmationBaseline)) {
        return deleteResult(false, "gemini", "delete menu item requires trusted input; trusted retry ownership unavailable");
      }
      return deleteResultWithTrustedMenuClick("gemini", "delete menu item did not open confirmation", stillOpenItem);
    }
    async function deleteGeminiThread(data = {}) {
      const hints = officialHints(data);
      if (data?.trustedMenuClickRetried) {
        const lease = consumeDeleteConfirmationLease("gemini", data);
        if (!lease) return deleteResult(false, "gemini", "trusted menu click does not match the pending attempt");
        const attemptGuard2 = deleteAttemptRouteGuard(data, lease.href);
        if (!attemptGuard2) return deleteResult(false, "gemini", "trusted menu click route ownership changed");
        if (lease.phase === "delete-confirmation") {
          const confirmation = deleteConfirmationOwnership(lease.baseline, hints, attemptGuard2) || await waitForOwnedDeleteConfirmation(lease.baseline, hints, 3e3, attemptGuard2);
          if (!confirmation) return deleteResult(false, "gemini", deleteConfirmationAlreadyOpen(hints) ? "delete confirmation ownership is uncertain" : "trusted delete menu click did not open confirmation");
          return finishOwnedDeleteConfirmation("gemini", confirmation, hints, 6500, attemptGuard2);
        }
        if (lease.phase !== "conversation-menu") {
          return deleteResult(false, "gemini", "trusted menu click phase is invalid");
        }
        if (deleteConfirmationAlreadyOpen(hints)) {
          return deleteResult(false, "gemini", "unverified delete confirmation appeared before delete activation");
        }
        const openItem = await waitForModel(() => findGeminiDeleteMenuItem(null, data), 3e3, 90);
        return openItem ? activateGeminiDeleteItem(openItem, data, hints, attemptGuard2) : deleteResult(false, "gemini", "trusted conversation menu click did not open delete menu");
      }
      const attemptGuard = deleteAttemptRouteGuard(data);
      pendingDeleteConfirmationLeases.delete("gemini");
      if (!attemptGuard || !attemptGuard()) return deleteResult(false, "gemini", "stable delete attempt and route identity not found");
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "unverified delete confirmation is already open");
      const trigger = geminiDeleteConversationActionButton(data);
      if (!trigger) return deleteResult(false, "gemini", "conversation menu trigger not found");
      const item = await resolveGeminiDeleteMenuItem(trigger, data);
      if (item) return activateGeminiDeleteItem(item, data, hints, attemptGuard);
      if (deleteConfirmationAlreadyOpen(hints)) return deleteResult(false, "gemini", "unverified delete confirmation appeared before delete activation");
      if (!attemptGuard() || !armDeleteConfirmationLease("gemini", data, "conversation-menu", new Set(deleteDialogRoots(hints.dialog)))) {
        return deleteResult(false, "gemini", "delete menu item not found; trusted retry ownership unavailable");
      }
      return deleteResultWithTrustedMenuClick("gemini", "delete menu item not found", trigger);
    }
    function findNotionDeleteMenuTrigger(data = {}) {
      const selectors = [
        ...officialSelectors(data, "menuTrigger"),
        "button[aria-label*='Delete, rename, and more' i]",
        "[role='button'][aria-label*='Delete, rename, and more' i]",
        "button[aria-label*='delete, rename' i]",
        "[role='button'][aria-label*='delete, rename' i]",
        "button[aria-label*='删除'][aria-label*='重命名']",
        "[role='button'][aria-label*='删除'][aria-label*='重命名']",
        "button[aria-label*='more' i][aria-haspopup='menu']",
        "[role='button'][aria-label*='more' i][aria-haspopup='menu']"
      ];
      return topRightMenuTrigger({ selectors, labels: ["Delete, rename, and more", "More", "更多", "删除", "重命名"] });
    }
    const NOTION_DELETE_MENU_ROOT_SELECTORS = [
      "[role='menu']",
      "[role='listbox']",
      "[role='dialog']",
      "[data-radix-menu-content]",
      "[data-radix-popper-content-wrapper]",
      "[data-floating-ui-portal]",
      "[data-slot='dropdown-menu-content']",
      "[class*='dropdown' i]",
      "[class*='popover' i]",
      "[class*='popper' i]"
    ];
    const NOTION_DELETE_LABELS = ["Delete", "Delete topic", "删除", "删除话题"];
    function notionDeleteLabelMatchesExact(value) {
      if (deleteLabelMatchesExactish(value, NOTION_DELETE_LABELS)) return true;
      let token = deleteCompactToken(value);
      if (!token) return false;
      const allowed = NOTION_DELETE_LABELS.map(deleteCompactToken).filter(Boolean).sort((a, b) => b.length - a.length);
      let parts = 0;
      while (token && parts < 8) {
        const next = allowed.find((label) => token.startsWith(label));
        if (!next) return false;
        token = token.slice(next.length);
        parts += 1;
      }
      return parts > 0 && !token;
    }
    function notionDeleteTargetLabelMatchesExact(target) {
      if (!target) return false;
      const semanticValues = [
        target.getAttribute?.("aria-label"),
        target.getAttribute?.("title"),
        target.innerText,
        target.textContent
      ].map((value) => String(value || "").trim()).filter(Boolean);
      if (semanticValues.length) return semanticValues.every(notionDeleteLabelMatchesExact);
      return notionDeleteLabelMatchesExact(deleteElementText(target));
    }
    function notionDeleteLinkedMenuRoot(trigger = null) {
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      if (!controlsId) return null;
      try {
        return document.getElementById(controlsId) || null;
      } catch {
        return null;
      }
    }
    function notionDeleteMenuRoots(trigger = null, data = {}) {
      const roots = [];
      const seen = /* @__PURE__ */ new Set();
      const confirmationRoots = deleteDialogRoots();
      const add = (root) => {
        if (!root || root === trigger || seen.has(root) || !root.isConnected || !visible2(root)) return;
        if (trigger && (root.contains?.(trigger) || trigger.contains?.(root))) return;
        if (confirmationRoots.some((dialog) => dialog === root || dialog.contains?.(root) || root.contains?.(dialog))) return;
        const rect = modelRect(root);
        if (!rect || rect.width < 48 || rect.height < 20 || rect.width > 640 || rect.height > 720) return;
        seen.add(root);
        roots.push(root);
      };
      add(notionDeleteLinkedMenuRoot(trigger));
      visibleSelectorElements([...NOTION_DELETE_MENU_ROOT_SELECTORS, ...officialSelectors(data, "menuRoot")]).forEach(add);
      return roots.sort((a, b) => modelElementArea(a) - modelElementArea(b));
    }
    function notionDeleteItemCenterIsTopmost(element) {
      const rect = modelRect(element);
      if (!element || !rect) return false;
      const pointTarget = modelElementFromPoint({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }, element);
      return Boolean(pointTarget && (pointTarget === element || element.contains?.(pointTarget)));
    }
    function findNotionDeleteMenuItem(root, trigger = null, data = {}) {
      if (!root || !root.isConnected || !visible2(root)) return null;
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (element, extraScore = 0) => {
        if (!element || element === trigger || seen.has(element) || !visible2(element) || isDisabledElement2(element)) return;
        const target = deleteClickableElement(element);
        if (!target || target === trigger || target === root || seen.has(target) || !root?.contains?.(target)) return;
        if (!visible2(target) || isDisabledElement2(target)) return;
        if (!notionDeleteTargetLabelMatchesExact(target)) return;
        const rect = modelRect(target);
        if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 520 || rect.height > 120) return;
        if (!notionDeleteItemCenterIsTopmost(target)) return;
        seen.add(element);
        seen.add(target);
        candidates.push({
          element: target,
          score: extraScore + (matches2(target, "[role='menuitem'],[role='option'],button,[role='button']") ? 240 : 0),
          top: rect.top,
          area: rect.width * rect.height
        });
      };
      for (const selector of officialSelectors(data, "deleteCandidate")) {
        for (const element of qsa2(selector, root, { all: true })) add(element, 520);
      }
      for (const element of qsa2("[role='menuitem'],[role='option'],button,[role='button'],[tabindex]:not([tabindex='-1']),li,div,span", root, { all: true })) {
        add(element, 320);
      }
      candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
      return candidates[0]?.element || null;
    }
    function notionDeleteMenuSession(trigger, baselineRoots = /* @__PURE__ */ new Set(), data = {}) {
      const linkedRoot = notionDeleteLinkedMenuRoot(trigger);
      for (const root of notionDeleteMenuRoots(trigger, data)) {
        if (root !== linkedRoot && baselineRoots.has(root)) continue;
        const item = findNotionDeleteMenuItem(root, trigger, data);
        if (item) return { root, item };
      }
      return null;
    }
    function refreshNotionDeleteMenuSession(session, trigger, data = {}) {
      const root = session?.root || null;
      if (!root || !root.isConnected || !visible2(root)) return null;
      if (!notionDeleteMenuRoots(trigger, data).includes(root)) return null;
      const item = findNotionDeleteMenuItem(root, trigger, data);
      return item ? { root, item } : null;
    }
    function notionDeleteConversationId() {
      try {
        const url = new URL(String(location.href || ""));
        const host = url.hostname.toLowerCase();
        if (!(host === "app.notion.com" || host === "notion.so" || host.endsWith(".notion.so"))) return "";
        return /^\/chat\/?$/i.test(url.pathname || "/") ? String(url.searchParams.get("t") || "") : "";
      } catch {
        return "";
      }
    }
    function notionDeleteRouteGuard(data = {}) {
      const expected = data?.expectedDeleteIdentity;
      const expectedId = expected ? expected.provider === "notion" ? String(expected.id || "").trim() : "" : notionDeleteConversationId();
      return () => Boolean(expectedId) && notionDeleteConversationId() === expectedId;
    }
    async function openNotionDeleteMenu(trigger, routeStillCurrent, data = {}) {
      const baselineRoots = new Set(notionDeleteMenuRoots(trigger, data));
      if (!routeStillCurrent()) return null;
      const session = await deleteActivateUntil(
        trigger,
        () => routeStillCurrent() && notionDeleteMenuSession(trigger, baselineRoots, data),
        { settleMs: 220 }
      );
      if (!session || !routeStillCurrent()) return null;
      await sleep2(120);
      return waitForModel(() => routeStillCurrent() && refreshNotionDeleteMenuSession(session, trigger, data), 1800, 80);
    }
    function notionDeleteConfirmationOwnership(baselineRoots = null, hints = {}) {
      const button = findDeleteConfirmButton(hints);
      if (!button || !button.isConnected || !visible2(button)) return null;
      const root = deleteDialogRoots(hints.dialog).find((candidate) => candidate === button || candidate.contains?.(button)) || null;
      if (!root || !root.isConnected || !visible2(root) || baselineRoots?.has(root)) return null;
      return { root, button };
    }
    function notionDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent, hints = {}) {
      const root = ownership?.root || null;
      const button = ownership?.button || null;
      if (!root || !button || !routeStillCurrent()) return false;
      if (!root.isConnected || !button.isConnected || !visible2(root) || !visible2(button) || !root.contains?.(button)) return false;
      if (findDeleteConfirmButton(hints) !== button) return false;
      return deleteDialogRoots(hints.dialog).some((candidate) => candidate === root);
    }
    async function waitForNotionDeleteMenuOutcome(session, trigger, routeStillCurrent, confirmationBaseline, timeoutMs = 1800, data = {}) {
      const hints = officialHints(data);
      const confirmation = await waitForModel(() => {
        if (!routeStillCurrent()) return null;
        return notionDeleteConfirmationOwnership(confirmationBaseline, hints);
      }, timeoutMs, 90);
      if (!routeStillCurrent()) return { state: "route-changed", item: null };
      if (confirmation) return { state: "confirmation", confirmation };
      const currentSession = refreshNotionDeleteMenuSession(session, trigger, data);
      return currentSession ? { state: "menu-open", session: currentSession } : { state: "uncertain" };
    }
    async function finishNotionDeleteConfirmation(ownership, routeStillCurrent, hints = {}) {
      const ownershipGuard = () => notionDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent, hints);
      if (!ownershipGuard()) return deleteResult(false, "notion", "delete confirmation ownership is uncertain");
      const confirmed = await clickDeleteConfirmIfPresent(6500, ownershipGuard, hints);
      if (confirmed) return deleteResult(true, "notion");
      if (!routeStillCurrent()) return deleteResult(false, "notion", "current conversation changed during delete confirmation");
      if (!ownershipGuard()) return deleteResult(false, "notion", "delete confirmation ownership changed");
      return deleteResultWithTrustedConfirm("notion", "delete confirmation did not close");
    }
    async function deleteNotionThread(data = {}) {
      const hints = officialHints(data);
      if (!data?.trustedMenuClickRetried) pendingDeleteConfirmationLeases.delete("notion");
      const routeStillCurrent = notionDeleteRouteGuard(data);
      if (!routeStillCurrent()) {
        return deleteResult(false, "notion", "stable current conversation identity not found");
      }
      if (data?.trustedMenuClickRetried) {
        const lease = consumeDeleteConfirmationLease("notion", data);
        if (!lease || lease.phase !== "delete-confirmation") {
          return deleteResult(false, "notion", "trusted delete menu click does not match the pending attempt");
        }
        const leasedRouteStillCurrent = deleteAttemptRouteGuard(data, lease.href);
        if (!leasedRouteStillCurrent) {
          return deleteResult(false, "notion", "trusted delete menu click route ownership changed");
        }
        if (visible2(lease.metadata?.menuRoot) || visible2(lease.metadata?.item)) {
          return deleteResult(false, "notion", "trusted delete menu click did not activate the leased Delete item");
        }
        const confirmation = notionDeleteConfirmationOwnership(lease.baseline, hints) || await waitForModel(() => leasedRouteStillCurrent() && notionDeleteConfirmationOwnership(lease.baseline, hints), 3e3, 90);
        if (!routeStillCurrent()) return deleteResult(false, "notion", "current conversation changed during trusted delete menu click");
        if (confirmation) return finishNotionDeleteConfirmation(confirmation, leasedRouteStillCurrent, hints);
        if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
          return deleteResult(false, "notion", "delete confirmation ownership is uncertain");
        }
        return deleteResult(false, "notion", "trusted delete menu click did not open an owned confirmation");
      }
      if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
        return deleteResult(false, "notion", "unverified delete confirmation is already open");
      }
      const trigger = findNotionDeleteMenuTrigger(data);
      if (!trigger) return deleteResult(false, "notion", "conversation menu trigger not found");
      let session = await openNotionDeleteMenu(trigger, routeStillCurrent, data);
      if (!session) return deleteResult(false, "notion", routeStillCurrent() ? "owned delete menu item not found" : "current conversation changed before delete menu opened");
      await sleep2(120);
      session = refreshNotionDeleteMenuSession(session, trigger, data);
      if (!session || !routeStillCurrent()) {
        return deleteResult(false, "notion", routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
      }
      if (findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length) {
        return deleteResult(false, "notion", "unverified delete confirmation appeared before delete activation");
      }
      const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      deleteClick(session.item) || deleteClickLayout(session.item);
      const outcome = await waitForNotionDeleteMenuOutcome(session, trigger, routeStillCurrent, confirmationBaseline, 1800, data);
      if (outcome.state === "confirmation") return finishNotionDeleteConfirmation(outcome.confirmation, routeStillCurrent, hints);
      if (outcome.state === "menu-open") {
        if (!routeStillCurrent() || !armDeleteConfirmationLease("notion", data, "delete-confirmation", confirmationBaseline, {
          trigger,
          menuRoot: outcome.session.root,
          item: outcome.session.item
        })) {
          return deleteResult(false, "notion", "delete menu item requires trusted input; trusted retry ownership unavailable");
        }
        return deleteResultWithTrustedMenuClick("notion", "delete menu item did not open confirmation", outcome.session.item);
      }
      if (outcome.state === "route-changed") return deleteResult(false, "notion", "current conversation changed after delete activation");
      return deleteResult(false, "notion", "delete menu item outcome is uncertain");
    }
    return Object.freeze({
      deleteKagiThread,
      deleteChatGptThread,
      deleteGrokThread,
      deleteGeminiThread,
      deleteNotionThread,
      deleteClaudeThread,
      menuRootsWithDelete,
      findDeleteMenuItem,
      findOpenDeleteMenuItem
    });
  }

  // content-src/capabilities/delete-deepseek.js
  function createDeleteDeepSeekCapability(deps = {}) {
    const {
      qsa: qsa2,
      visible: visible2,
      modelRect,
      deleteElementText,
      modelElementArea,
      firstVisibleBySelectors,
      visibleSelectorElements,
      svgSignature,
      deleteCompactToken,
      modelElementFromPoint,
      deleteClickableElement,
      isDisabledElement: isDisabledElement2,
      dispatchPointerActivation,
      nativeModelClick,
      modelDirectClick,
      waitForModel,
      deleteClick,
      normalize: normalize2,
      trustedMenuClickForElement,
      trustedMenuClickPoint,
      serializableDeleteRect,
      deleteResult,
      layoutDeleteCandidates,
      modelEventConstructor,
      reveal: reveal2,
      closest: closest2,
      menuRootsWithDelete,
      findOpenDeleteMenuItem,
      deleteActivateUntil,
      sleep: sleep2,
      findDeleteMenuItem,
      deleteClickLayout,
      findDeleteConfirmButton,
      findDeleteConfirmButtonInfo,
      deleteDialogRoots,
      clickDeleteConfirmIfPresent,
      DEEPSEEK_DELETE_SOURCE: DEEPSEEK_DELETE_SOURCE2
    } = deps;
    function deepSeekOfficialSelectors(hints = {}, slot = "") {
      return (Array.isArray(hints?.[slot]) ? hints[slot] : []).map((selector) => String(selector || "").trim()).filter(Boolean).slice(0, 8);
    }
    function deepSeekSelectorUnion(packaged, hints = {}, slot = "") {
      return [packaged, ...deepSeekOfficialSelectors(hints, slot)].filter(Boolean).join(",");
    }
    function deepSeekConversationLinkIsLocal(link) {
      try {
        const url = new URL(String(link?.href || link?.getAttribute?.("href") || ""), location.href);
        return url.protocol === "https:" && url.origin === location.origin && /^\/(?:a\/)?chat\/s\/[^/?#]+\/?$/.test(url.pathname);
      } catch {
        return false;
      }
    }
    function deepSeekChatLinks(root = document, hints = {}) {
      const selector = deepSeekSelectorUnion("a[href*='/chat/s/'],a[href*='/a/chat/s/']", hints, "conversationLink");
      return qsa2(selector, root, { all: true }).filter((link) => link?.matches?.("a[href]") && deepSeekConversationLinkIsLocal(link)).filter((link) => visible2(link) && modelRect(link));
    }
    function deepSeekSidebarRootFromLinks(hints = {}) {
      const links = deepSeekChatLinks(document, hints).filter((link) => {
        const rect = modelRect(link);
        return rect && rect.left <= 470 && rect.width >= 100 && rect.height >= 20 && rect.height <= 96;
      });
      if (!links.length) return null;
      const currentId = deepSeekChatIdFromHref(location.href);
      const current = currentId ? links.find((link) => deepSeekChatIdFromHref(link.href || link.getAttribute?.("href")) === currentId) : null;
      const seeds = current ? [current] : links.slice(0, 4);
      const scoreRoot = (root, officialScope = false) => {
        if (!root || !root.isConnected) return null;
        const rect = modelRect(root);
        if (!rect || rect.left > 560 || rect.width < 120 || rect.width > 620 || rect.height < 40) return null;
        const rootLinks = deepSeekChatLinks(root, hints).length;
        if (rootLinks < (current ? 1 : 2)) return null;
        const value = deleteElementText(root);
        const className = String(root.className || "");
        const hasHistoryText = /today|yesterday|pinned|new chat|今天|昨天|新聊天|置顶/i.test(value);
        const looksScrollable = /scroll|history|sidebar|sider/i.test(className);
        if (!officialScope && !hasHistoryText && !looksScrollable && rootLinks < 3) return null;
        return (officialScope ? 180 : 0) + (looksScrollable ? 900 : 0) + Math.min(rootLinks, 12) * 80 + Math.min(rect.height, 900) * 0.02 - rect.left;
      };
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      for (const selector of deepSeekOfficialSelectors(hints, "scope")) {
        for (const root of qsa2(selector, document, { all: true })) {
          if (seen.has(root)) continue;
          seen.add(root);
          const score = scoreRoot(root, true);
          if (score == null || current && !root.contains?.(current)) continue;
          candidates.push({ element: root, score: score + 120, area: modelElementArea(root) });
        }
      }
      for (const seed of seeds) {
        for (let node = seed; node && node !== document.body; node = node.parentElement) {
          if (seen.has(node)) continue;
          seen.add(node);
          const score = scoreRoot(node);
          if (score == null) continue;
          candidates.push({ element: node, score, area: modelElementArea(node) });
        }
      }
      candidates.sort((a, b) => b.score - a.score || a.area - b.area);
      return candidates[0]?.element || null;
    }
    function deepSeekSidebarRoot(hints = {}) {
      const linkRoot = deepSeekSidebarRootFromLinks(hints);
      if (linkRoot) return linkRoot;
      return null;
    }
    function findDeepSeekSidebarToggle() {
      const direct = firstVisibleBySelectors([
        "button[aria-label*='sidebar' i]",
        "[role='button'][aria-label*='sidebar' i]",
        "button[title*='sidebar' i]",
        "[role='button'][title*='sidebar' i]",
        "button:has(svg path[d*='M9.67269'])",
        "[role='button']:has(svg path[d*='M9.67269'])"
      ]);
      if (direct) return direct;
      const candidates = visibleSelectorElements("button,[role='button']").map((element) => ({ element, rect: modelRect(element), text: deleteElementText(element), svg: svgSignature(element) })).filter((item) => item.rect && item.rect.top <= 90 && item.rect.left <= 130 && item.rect.width >= 20 && item.rect.width <= 64 && item.rect.height >= 20 && item.rect.height <= 64).filter((item) => /sidebar|menu|panel|sider|侧边栏|菜单/i.test(item.text) || /sidebar|panel|menu|M9\.67269/i.test(item.svg));
      candidates.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
      return candidates[0]?.element || findDeepSeekTopHeaderIconButton(0) || findDeepSeekTopHeaderIconButton(1) || null;
    }
    function findDeepSeekTopHeaderIconButton(indexFromLeft = 0) {
      const buttons = visibleSelectorElements("button,a[href],[role='button'],[onclick],[tabindex]:not([tabindex='-1'])").map((element) => ({ element, rect: modelRect(element), text: deleteElementText(element) })).filter((item) => item.rect && item.rect.top >= 0 && item.rect.top < 90 && item.rect.left >= 0 && item.rect.left < 420).filter((item) => item.rect.width >= 16 && item.rect.width <= 56 && item.rect.height >= 16 && item.rect.height <= 56).filter((item) => !deleteCompactToken(item.text));
      buttons.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
      return buttons[indexFromLeft]?.element || buttons[0]?.element || null;
    }
    async function clickDeepSeekSidebarToggleByPoint(hints = {}) {
      const points = [
        { x: 22, y: 28 },
        { x: 22, y: 44 },
        { x: 22, y: 60 },
        { x: 46, y: 28 },
        { x: 46, y: 44 },
        { x: 46, y: 60 }
      ];
      for (const point of points) {
        const target = modelElementFromPoint(point);
        const button = deleteClickableElement(target);
        const rect = modelRect(button);
        if (!button || !rect || !visible2(button) || isDisabledElement2(button)) continue;
        if (rect.top > 96 || rect.left > 110 || rect.width > 80 || rect.height > 80) continue;
        if (!dispatchPointerActivation(button, point) && !nativeModelClick(button) && !modelDirectClick(button)) continue;
        if (await waitForModel(() => deepSeekSidebarRoot(hints), 1400, 100)) return true;
      }
      return false;
    }
    async function ensureDeepSeekSidebarOpen(hints = {}) {
      if (deepSeekSidebarRoot(hints)) return true;
      const toggle = findDeepSeekSidebarToggle();
      if (toggle && deleteClick(toggle) && await waitForModel(() => deepSeekSidebarRoot(hints), 3200, 120)) return true;
      return clickDeepSeekSidebarToggleByPoint(hints);
    }
    function deepSeekTitleTokenFromValue(value) {
      const raw = normalize2(value || "").replace(/\s*[-|–]\s*DeepSeek.*$/i, "").replace(/\s*-\s*深度求索.*$/i, "");
      const token = deleteCompactToken(raw);
      return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
    }
    function deepSeekChatIdFromHref(value) {
      const match = String(value || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
      return match?.[1] || "";
    }
    function deepSeekDeleteHints(data = {}) {
      const titleTokens = new Set([
        document.title,
        data.currentTitle,
        data.title
      ].map(deepSeekTitleTokenFromValue).filter(Boolean));
      const official = data?.officialRuleHints && typeof data.officialRuleHints === "object" && !Array.isArray(data.officialRuleHints) ? data.officialRuleHints : {};
      return {
        ...official,
        titleTokens: Array.from(titleTokens)
      };
    }
    function findDeepSeekCurrentTopicRow(root, hints = {}) {
      if (!root) return null;
      const links = deepSeekChatLinks(root, hints);
      const currentId = deepSeekChatIdFromHref(location.href);
      if (!currentId) return null;
      return links.find((link) => deepSeekChatIdFromHref(link.href || link.getAttribute?.("href")) === currentId) || null;
    }
    function deepSeekVisualTopicRow(row, hints = {}) {
      const rowRect = modelRect(row);
      if (!row || !rowRect) return row;
      const rowText = deleteCompactToken(deleteElementText(row));
      let best = { element: row, score: 0 };
      const consider = (node, depth = 0, extraScore = 0) => {
        const rect = modelRect(node);
        if (!rect || rect.left > 560 || rect.width < 110 || rect.width > 620 || rect.height < 28 || rect.height > 110) return;
        if (rect.top > rowRect.top + 10 || rect.bottom < rowRect.bottom - 10) return;
        const token = deleteCompactToken(deleteElementText(node));
        if (rowText && token && !token.includes(rowText) && !rowText.includes(token)) return;
        const className = String(node.className || "");
        const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
        const buttons = qsa2("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", node, { all: true }).length;
        const score = extraScore + rect.width + (active ? 420 : 0) + Math.min(buttons, 3) * 90 - depth * 12;
        if (score > best.score) best = { element: node, score };
      };
      for (const selector of deepSeekOfficialSelectors(hints, "conversationRow")) {
        for (const candidate of qsa2(selector, document, { all: true })) {
          if (candidate === row || candidate.contains?.(row)) consider(candidate, 0, 120);
        }
      }
      for (let node = row, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
        consider(node, depth, 0);
      }
      return best.element || row;
    }
    function deepSeekRowMenuRightEdge(row, visualRow = row, hints = {}) {
      const rowRect = modelRect(visualRow) || modelRect(row);
      if (!rowRect) return rowRect?.right || 0;
      const roots = [];
      const sidebar = deepSeekSidebarRoot(hints);
      if (sidebar) roots.push(sidebar);
      for (let node = visualRow || row; node && node !== document.body && roots.length < 8; node = node.parentElement) roots.push(node);
      const candidates = roots.map((element) => ({ element, rect: modelRect(element) })).filter((item) => item.rect && item.rect.left <= 560 && item.rect.width >= 140 && item.rect.width <= 620 && item.rect.top <= rowRect.top + 8 && item.rect.bottom >= rowRect.bottom - 8).map((item) => item.rect.right);
      return Math.max(rowRect.right, ...candidates);
    }
    function deepSeekTopicMenuRect(row, hints = {}) {
      const visualRow = deepSeekVisualTopicRow(row, hints);
      const rowRect = modelRect(visualRow) || modelRect(row);
      if (!rowRect) return null;
      const right = Math.max(rowRect.right, deepSeekRowMenuRightEdge(row, visualRow, hints));
      return {
        left: rowRect.left,
        top: rowRect.top,
        right,
        bottom: rowRect.bottom,
        width: right - rowRect.left,
        height: rowRect.height
      };
    }
    function deepSeekTrustedMenuClick(row, trigger = null, reason = "topic menu trigger requires trusted browser input", hints = {}) {
      const rowRect = deepSeekTopicMenuRect(row, hints);
      const triggerClick = trustedMenuClickForElement(trigger, "deepseek", reason);
      if (!rowRect) return triggerClick;
      const y = rowRect.top + rowRect.height / 2;
      const points = [18, 28, 38, 48, 60, 76, 96, 118, 142].map((offset) => ({
        x: Math.max(rowRect.left + 16, rowRect.right - offset),
        y
      }));
      if (triggerClick?.framePoint) points.push(triggerClick.framePoint);
      const seen = /* @__PURE__ */ new Set();
      const framePoints = points.map((point) => ({
        x: Math.round(Number(point.x) * 100) / 100,
        y: Math.round(Number(point.y) * 100) / 100
      })).filter((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
        const key = `${point.x},${point.y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const primary = framePoints[0];
      const trustedMenuClick = primary ? trustedMenuClickPoint("deepseek", reason, primary, serializableDeleteRect(rowRect)) : triggerClick;
      return trustedMenuClick ? { ...trustedMenuClick, framePoints, hoverSettleMs: 360 } : null;
    }
    function deleteResultWithDeepSeekTrustedMenuClick(reason, row, trigger = null, hints = {}) {
      const trustedMenuClick = deepSeekTrustedMenuClick(row, trigger, reason, hints);
      return deleteResult(false, "deepseek", reason, trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {});
    }
    function deepSeekTrustedKeySequence(row, reason = "topic menu trigger requires keyboard focus", hints = {}) {
      const rowRect = deepSeekTopicMenuRect(row, hints);
      const visualRect = modelRect(deepSeekVisualTopicRow(row, hints)) || modelRect(row) || rowRect;
      if (!rowRect || !visualRect) return null;
      const focusX = Math.min(
        rowRect.right - 104,
        Math.max(rowRect.left + 24, visualRect.left + Math.min(180, visualRect.width * 0.42))
      );
      return {
        kind: "topic-menu-keyboard",
        site: "deepseek",
        reason: String(reason || ""),
        framePoint: {
          x: Math.round(focusX * 100) / 100,
          y: Math.round((rowRect.top + rowRect.height / 2) * 100) / 100
        },
        frameRect: serializableDeleteRect(rowRect),
        keys: [
          { key: "Tab", settleMs: 140 },
          { key: "Enter", settleMs: 260 }
        ],
        clickSettleMs: 160,
        keySettleMs: 140,
        settleMs: 460
      };
    }
    function deleteResultWithDeepSeekTrustedKeySequence(reason, row, hints = {}) {
      const trustedKeySequence = deepSeekTrustedKeySequence(row, reason, hints);
      const trustedMenuClick = deepSeekTrustedMenuClick(row, null, reason, hints);
      return deleteResult(false, "deepseek", reason, {
        ...trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {},
        ...trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {}
      });
    }
    function closeDeepSeekTransientMenus() {
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      } catch {
      }
    }
    function deepSeekHeaderMenuButton(hints = deepSeekDeleteHints()) {
      const titleTokens = (hints.titleTokens || []).filter(Boolean);
      if (!titleTokens.length) return null;
      const titleNodes = [];
      const seenTitles = /* @__PURE__ */ new Set();
      for (const element of qsa2("h1,h2,h3,button,[role='button'],div,span", document, { all: true })) {
        if (!element || seenTitles.has(element) || !visible2(element)) continue;
        const rect = modelRect(element);
        if (!rect || rect.top < 0 || rect.top > 190 || rect.left < 120 || rect.width < 20 || rect.height < 14 || rect.height > 92) continue;
        if (String(element.href || element.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
        if (element.closest?.("a[href*='/chat/s/'],a[href*='/a/chat/s/']") || qsa2("a[href*='/chat/s/'],a[href*='/a/chat/s/']", element, { all: true }).length) continue;
        const token = deleteCompactToken(deleteElementText(element));
        if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
        seenTitles.add(element);
        titleNodes.push({ element, rect });
      }
      const candidates = [];
      const seenButtons = /* @__PURE__ */ new Set();
      const addButton = (button, titleRect, extraScore = 0) => {
        const target = deleteClickableElement(button);
        if (!target || seenButtons.has(target) || isDisabledElement2(target)) return;
        const rect = modelRect(target);
        if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 76 || rect.height > 76) return;
        if (rect.top > titleRect.bottom + 34 || rect.bottom < titleRect.top - 34) return;
        if (rect.left < titleRect.left - 72 || rect.left > titleRect.right + 260) return;
        if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
        const value = deleteElementText(target);
        const token = deleteCompactToken(value);
        if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
        const signature = deleteCompactToken(svgSignature(target));
        const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || qsa2("circle", target, { all: true }).length >= 2 || rect.width <= 44;
        if (!iconish) return;
        seenButtons.add(target);
        candidates.push({
          element: target,
          score: extraScore + (rect.left >= titleRect.right - 8 ? 520 : 0) + (!token ? 180 : 0) + (/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(token + signature) ? 360 : 0) + (/circle|dots|ellipsis|kebab/.test(signature) ? 180 : 0) + Math.max(0, 160 - Math.abs(rect.left - titleRect.right)),
          right: rect.right,
          left: rect.left
        });
      };
      for (const { element, rect: titleRect } of titleNodes.slice(0, 8)) {
        for (let scope = element, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
          const scopeRect = modelRect(scope);
          if (!scopeRect || scopeRect.top > 210 || scopeRect.height > 180 || scopeRect.width > 900) continue;
          const triggerSelector2 = deepSeekSelectorUnion("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", hints, "menuTrigger");
          for (const button of layoutDeleteCandidates(scope, triggerSelector2)) {
            addButton(button, titleRect, 120 - depth * 12);
          }
        }
        const triggerSelector = deepSeekSelectorUnion("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", hints, "menuTrigger");
        for (const button of qsa2(triggerSelector, document, { all: true })) {
          addButton(button, titleRect, 0);
        }
      }
      candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
      return candidates[0]?.element || null;
    }
    function hoverDeepSeekTopicRow(row) {
      const rowRect = modelRect(row);
      if (!rowRect) return;
      const point = { clientX: Math.max(rowRect.left + 16, rowRect.right - 24), clientY: rowRect.top + rowRect.height / 2 };
      const targets = [];
      for (let node = row; node && node !== document.body && targets.length < 5; node = node.parentElement) targets.push(node);
      for (const target of targets) {
        for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
          try {
            const EventCtor = type.startsWith("pointer") ? modelEventConstructor("PointerEvent", target) : modelEventConstructor("MouseEvent", target);
            target.dispatchEvent(new EventCtor(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              ...point
            }));
          } catch {
          }
        }
      }
    }
    function deepSeekTopicMoreButton(row, hints = {}) {
      if (!row) return null;
      reveal2(row);
      const visualRow = deepSeekVisualTopicRow(row, hints);
      const rowRect = deepSeekTopicMenuRect(row, hints);
      hoverDeepSeekTopicRow(visualRow || row);
      if (!rowRect) return null;
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (button, source = "", extraScore = 0) => {
        const target = deleteClickableElement(button);
        if (!target || seen.has(target) || target === row || isDisabledElement2(target)) return;
        const rect = modelRect(target);
        if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 72 || rect.height > 72) return;
        const overlaps = rect.top < rowRect.bottom + 10 && rect.bottom > rowRect.top - 10;
        const nearRight = rect.left >= rowRect.right - 120 && rect.left <= rowRect.right + 80;
        if (!overlaps || !nearRight) return;
        const value = deleteElementText(target);
        const compact = deleteCompactToken(value);
        if (compact && !/more|options|menu|ellipsis|dots|更多|菜单|选项/.test(compact)) return;
        if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
        const signature = svgSignature(target);
        const iconish = !compact || /more|options|menu|ellipsis|dots|circle/.test(signature) || qsa2("circle", target).length >= 2 || rect.width <= 44;
        if (!iconish) return;
        seen.add(target);
        candidates.push({
          element: target,
          score: extraScore + (visible2(target) ? 140 : 40) + (!compact ? 180 : 0) + (/more|options|menu|更多|菜单|选项/.test(compact) ? 220 : 0) + (/ellipsis|more|dots|circle/.test(signature) ? 120 : 0) + Math.max(0, 90 - Math.abs((rect.left + rect.right) / 2 - (rowRect.right - 28))),
          right: rect.right,
          source
        });
      };
      const scopes = [];
      for (const seed of [visualRow, row]) {
        for (let node = seed; node && node !== document.body && scopes.length < 8; node = node.parentElement) {
          if (!scopes.includes(node)) scopes.push(node);
        }
      }
      const iconSelector = deepSeekSelectorUnion("button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]", hints, "menuTrigger");
      for (const scope of scopes) {
        for (const button of layoutDeleteCandidates(scope, iconSelector)) add(button, "scope", 80);
      }
      for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
        const point = { x: Math.max(rowRect.left + 16, rowRect.right - offset), y: rowRect.top + rowRect.height / 2 };
        const pointTarget = modelElementFromPoint(point, row);
        if (pointTarget) add(pointTarget, "point", 160 - offset);
        const pointButton = pointTarget && closest2(pointTarget, iconSelector);
        if (pointButton) add(pointButton, "point-button", 180 - offset);
      }
      for (const button of qsa2(iconSelector, document, { all: true })) add(button, "nearby", 0);
      candidates.sort((a, b) => b.score - a.score || b.right - a.right);
      return candidates[0]?.element || null;
    }
    async function openDeepSeekTriggerAndClickDelete(trigger, labels, { timeoutMs = 3200, allowHiddenTrigger = false, guard = null, hints = {} } = {}) {
      if (!trigger) return false;
      const guarded = () => typeof guard !== "function" || guard() === true;
      if (!guarded()) return false;
      const menuRoots = deepSeekOfficialSelectors(hints, "menuRoot");
      const deleteCandidates = deepSeekOfficialSelectors(hints, "deleteCandidate");
      const menuReady = () => menuRootsWithDelete(labels, menuRoots)[0] || findOpenDeleteMenuItem(labels, menuRoots, deleteCandidates);
      if (menuReady()) return false;
      if (!await deleteActivateUntil(trigger, menuReady, { allowHidden: allowHiddenTrigger, settleMs: 220 })) return false;
      await sleep2(140);
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        const root = menuRootsWithDelete(labels, menuRoots)[0] || null;
        const item = (root ? findDeleteMenuItem(root, labels, deleteCandidates) : null) || findOpenDeleteMenuItem(labels, menuRoots, deleteCandidates);
        if (item && guarded() && (deleteClick(item) || deleteClickLayout(item))) return true;
        await sleep2(120);
      }
      return false;
    }
    let deepSeekPendingTrustedAttempt = null;
    function deepSeekTrustedRetryRequested(data = {}) {
      return Boolean(data?.trustedMenuClickRetried || data?.trustedKeySequenceRetried);
    }
    function deepSeekAttemptIdentity(data = {}) {
      return {
        attemptId: normalize2(data?.deleteAttemptId),
        routeId: deepSeekChatIdFromHref(location.href)
      };
    }
    function deepSeekTrustedRetryOwned(data = {}) {
      const identity2 = deepSeekAttemptIdentity(data);
      return Boolean(
        identity2.attemptId && identity2.routeId && deepSeekPendingTrustedAttempt?.attemptId === identity2.attemptId && deepSeekPendingTrustedAttempt?.routeId === identity2.routeId && deepSeekPendingTrustedAttempt?.phase === "awaiting-menu-trigger" && deepSeekPendingTrustedAttempt?.baseline === "no-delete-ui" && Number(deepSeekPendingTrustedAttempt?.expiresAt) >= Date.now()
      );
    }
    function armDeepSeekTrustedRetry(data = {}, value = {}) {
      const identity2 = deepSeekAttemptIdentity(data);
      if (!identity2.attemptId || !identity2.routeId) {
        deepSeekPendingTrustedAttempt = null;
        return deleteResult(false, "deepseek", `${value.reason || "trusted retry required"}; trusted retry ownership unavailable`);
      }
      deepSeekPendingTrustedAttempt = { ...identity2, phase: "awaiting-menu-trigger", baseline: "no-delete-ui", expiresAt: Date.now() + 2e4 };
      return value;
    }
    function validateDeepSeekTrustedCoordinates(value = {}, hints = {}) {
      const needsTrusted = value?.needsTrustedHover || value?.needsTrustedMenuClick || value?.needsTrustedKeySequence;
      if (!needsTrusted) return { ok: true, instructions: {} };
      const root = deepSeekSidebarRoot(hints);
      const row = findDeepSeekCurrentTopicRow(root, hints);
      const rowRect = row ? deepSeekTopicMenuRect(row, hints) : null;
      if (!root || !row || !rowRect) {
        return { ok: false, reason: "MAIN trusted-input result has no independently verified current sidebar row" };
      }
      const pointInside = (point) => {
        const x = Number(point?.x);
        const y = Number(point?.y);
        return Number.isFinite(x) && Number.isFinite(y) && x >= rowRect.left - 8 && x <= rowRect.right + 8 && y >= rowRect.top - 8 && y <= rowRect.bottom + 8;
      };
      const pointInMenuStrip = (point) => pointInside(point) && Number(point?.x) >= rowRect.right - 160;
      const pointInSafeText = (point) => pointInside(point) && Number(point?.x) >= rowRect.left + 12 && Number(point?.x) <= rowRect.right - 80;
      const cleanPoint = (point) => ({
        x: Math.round(Number(point?.x) * 100) / 100,
        y: Math.round(Number(point?.y) * 100) / 100
      });
      const cleanRect = {
        left: Math.round(Number(rowRect.left) * 100) / 100,
        top: Math.round(Number(rowRect.top) * 100) / 100,
        right: Math.round(Number(rowRect.right) * 100) / 100,
        bottom: Math.round(Number(rowRect.bottom) * 100) / 100,
        width: Math.round(Number(rowRect.width || rowRect.right - rowRect.left) * 100) / 100,
        height: Math.round(Number(rowRect.height || rowRect.bottom - rowRect.top) * 100) / 100
      };
      const instructions = {};
      if (value?.needsTrustedHover && !pointInMenuStrip(value?.trustedHover?.framePoint)) {
        return { ok: false, reason: "MAIN trusted hover is outside the independently verified current row" };
      }
      if (value?.needsTrustedHover) {
        instructions.needsTrustedHover = true;
        instructions.trustedHover = {
          kind: "topic-menu-hover",
          site: "deepseek",
          framePoint: cleanPoint(value.trustedHover.framePoint),
          frameRect: cleanRect,
          hoverSettleMs: 520
        };
      }
      if (value?.needsTrustedMenuClick) {
        const click = value?.trustedMenuClick || {};
        const points = Array.isArray(click.framePoints) && click.framePoints.length ? click.framePoints : [click.framePoint];
        if (!points.length || points.length > 12 || points.some((point) => !pointInMenuStrip(point))) {
          return { ok: false, reason: "MAIN trusted menu click is outside the independently verified current row" };
        }
        const cleanPoints = points.map(cleanPoint);
        instructions.needsTrustedMenuClick = true;
        instructions.trustedMenuClick = {
          kind: "topic-menu-trigger",
          site: "deepseek",
          framePoint: cleanPoints[0],
          framePoints: cleanPoints,
          frameRect: cleanRect,
          hoverSettleMs: 360
        };
      }
      if (value?.needsTrustedKeySequence) {
        const sequence = value?.trustedKeySequence || {};
        const keys = Array.isArray(sequence.keys) ? sequence.keys : [];
        const keyName = (entry) => String(typeof entry === "string" ? entry : entry?.key || "").toLowerCase();
        const safeKey = (entry) => {
          const item = typeof entry === "string" ? { key: entry } : entry || {};
          const settleMs = Number(item.settleMs);
          return !item.shiftKey && !item.ctrlKey && !item.metaKey && !item.altKey && Number(item.modifiers || 0) === 0 && Number.isFinite(settleMs) && settleMs >= 0 && settleMs <= 600;
        };
        const boundedSettle = (value2, max) => Number.isFinite(Number(value2)) && Number(value2) >= 0 && Number(value2) <= max;
        const safeSequence = keys.length === 2 && keyName(keys[0]) === "tab" && /^(?:enter|return)$/.test(keyName(keys[1])) && keys.every(safeKey) && boundedSettle(sequence.clickSettleMs, 500) && boundedSettle(sequence.keySettleMs, 500) && boundedSettle(sequence.settleMs, 1200);
        if (!pointInSafeText(sequence.framePoint) || !safeSequence) {
          return { ok: false, reason: "MAIN trusted key sequence is outside the verified DeepSeek contract" };
        }
        instructions.needsTrustedKeySequence = true;
        instructions.trustedKeySequence = {
          kind: "topic-menu-keyboard",
          site: "deepseek",
          framePoint: cleanPoint(sequence.framePoint),
          frameRect: cleanRect,
          keys: [
            { key: "Tab", settleMs: 140 },
            { key: "Enter", settleMs: 260 }
          ],
          clickSettleMs: 160,
          keySettleMs: 140,
          settleMs: 460
        };
      }
      return { ok: true, row, rowRect, instructions };
    }
    function sanitizeDeepSeekTrustedResult(value = {}, validation = {}) {
      const sanitized = { ...value };
      for (const key of [
        "needsTrustedHover",
        "trustedHover",
        "needsTrustedMenuClick",
        "trustedMenuClick",
        "needsTrustedKeySequence",
        "trustedKeySequence"
      ]) delete sanitized[key];
      return { ...sanitized, ...validation.instructions || {} };
    }
    function validateDeepSeekBridgeTrustedResult(bridged = {}, data = {}, currentRouteId = "", hints = {}) {
      const needsTrusted = bridged?.needsTrustedHover || bridged?.needsTrustedMenuClick || bridged?.needsTrustedKeySequence;
      if (!needsTrusted) return { ok: true };
      const attemptId = normalize2(data?.deleteAttemptId);
      if (!attemptId || normalize2(bridged?.deleteAttemptId) !== attemptId || String(bridged?.routeId || "") !== currentRouteId) {
        return { ok: false, reason: "MAIN trusted-input result does not match the current attempt and route" };
      }
      return validateDeepSeekTrustedCoordinates(bridged, hints);
    }
    function deepSeekBridgeFallbackDisposition(bridged = {}, retryRequested = false) {
      const reason = String(bridged?.reason || "MAIN delete bridge failed");
      const explicitlyPreDelivery = bridged?.delivered === false && bridged?.phase === "pre-delete";
      if (!explicitlyPreDelivery || retryRequested) return { useNativeFallback: false, reason };
      return { useNativeFallback: true, reason };
    }
    function sameDeepSeekConfirmationRoot(left, right) {
      return Boolean(
        left && right && (left === right || left.contains?.(right) || right.contains?.(left))
      );
    }
    function deepSeekConfirmationAlreadyOpen(hints = {}) {
      return Boolean(findDeleteConfirmButton(hints) || deleteDialogRoots(hints.dialog).length);
    }
    function deepSeekConfirmationOwnership(baseline = /* @__PURE__ */ new Set(), hints = {}, attemptGuard = null) {
      if (typeof attemptGuard === "function" && attemptGuard() !== true) return null;
      const roots = deleteDialogRoots(hints.dialog);
      const info = findDeleteConfirmButtonInfo(hints);
      const button = info?.element || null;
      const root = info?.root || roots.find((candidate) => candidate === button || candidate.contains?.(button)) || null;
      if (!button || !root || baseline?.has(root)) return null;
      if ([...baseline || []].some((candidate) => sameDeepSeekConfirmationRoot(candidate, root))) return null;
      if (!button.isConnected || !root.isConnected || !visible2(button) || !visible2(root) || !root.contains?.(button)) return null;
      if (!roots.some((candidate) => candidate === root)) return null;
      if (roots.some((candidate) => !sameDeepSeekConfirmationRoot(candidate, root))) return null;
      return { root, button };
    }
    function deepSeekConfirmationOwnershipIsCurrent(ownership, hints = {}, attemptGuard = null) {
      const root = ownership?.root || null;
      const button = ownership?.button || null;
      if (typeof attemptGuard === "function" && attemptGuard() !== true) return false;
      if (!root || !button || !root.isConnected || !button.isConnected || !visible2(root) || !visible2(button)) return false;
      if (!root.contains?.(button)) return false;
      const roots = deleteDialogRoots(hints.dialog);
      const info = findDeleteConfirmButtonInfo(hints);
      const currentRoot = info?.root || roots.find((candidate) => candidate === info?.element || candidate.contains?.(info?.element)) || null;
      return info?.element === button && currentRoot === root && roots.some((candidate) => candidate === root) && roots.every((candidate) => sameDeepSeekConfirmationRoot(candidate, root));
    }
    async function waitForDeepSeekConfirmation(baseline, hints, attemptGuard, timeoutMs = 3e3) {
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        if (typeof attemptGuard === "function" && attemptGuard() !== true) return { state: "invalid", ownership: null };
        if (deepSeekConfirmationAlreadyOpen(hints)) {
          const ownership = deepSeekConfirmationOwnership(baseline, hints, attemptGuard);
          return ownership ? { state: "owned", ownership } : { state: "unowned", ownership: null };
        }
        await sleep2(80);
      }
      return { state: "none", ownership: null };
    }
    async function finishDeepSeekConfirmation(ownership, hints, attemptGuard) {
      const ownershipGuard = () => deepSeekConfirmationOwnershipIsCurrent(ownership, hints, attemptGuard);
      if (!ownershipGuard()) return deleteResult(false, "deepseek", "delete confirmation ownership is uncertain");
      const confirmed = await clickDeleteConfirmIfPresent(6500, ownershipGuard, hints);
      if (confirmed) return deleteResult(true, "deepseek");
      return deleteResult(false, "deepseek", ownershipGuard() ? "delete confirmation did not close" : "delete confirmation ownership changed");
    }
    async function deepSeekConfirmationResult(baseline, hints, attemptGuard, fallbackReason = "delete confirmation button not found") {
      const observation = await waitForDeepSeekConfirmation(baseline, hints, attemptGuard, 3e3);
      if (observation.state === "owned") return finishDeepSeekConfirmation(observation.ownership, hints, attemptGuard);
      if (observation.state === "unowned") return deleteResult(false, "deepseek", "delete confirmation ownership is uncertain");
      if (observation.state === "invalid") return deleteResult(false, "deepseek", "current conversation or delete attempt changed after delete activation");
      return deleteResult(false, "deepseek", fallbackReason);
    }
    async function deleteDeepSeekThread(data = {}) {
      const hints = deepSeekDeleteHints(data);
      const currentRouteId = deepSeekChatIdFromHref(location.href);
      const attemptId = normalize2(data?.deleteAttemptId);
      if (!currentRouteId) return deleteResult(false, "deepseek", "stable current conversation route is required");
      if (!attemptId) return deleteResult(false, "deepseek", "delete attempt identity is required");
      if (String(data?.expectedDeleteIdentity?.provider || "").toLowerCase() !== "deepseek" || String(data?.expectedDeleteIdentity?.id || "") !== currentRouteId) {
        return deleteResult(false, "deepseek", "delete target identity does not match the current route");
      }
      const routeStillCurrent = () => deepSeekChatIdFromHref(location.href) === currentRouteId;
      const attemptStillCurrent = () => normalize2(data?.deleteAttemptId) === attemptId && routeStillCurrent();
      const retryRequested = deepSeekTrustedRetryRequested(data);
      const nativeRetryOwned = retryRequested && deepSeekTrustedRetryOwned(data);
      if (!retryRequested) deepSeekPendingTrustedAttempt = null;
      if (nativeRetryOwned) deepSeekPendingTrustedAttempt = null;
      await ensureDeepSeekSidebarOpen(hints);
      if (!attemptStillCurrent()) {
        return deleteResult(false, "deepseek", "current conversation or delete attempt changed while preparing deletion");
      }
      const labels = ["Delete", "删除"];
      if (deepSeekConfirmationAlreadyOpen(hints)) {
        return deleteResult(false, "deepseek", "unverified delete confirmation is already open");
      }
      if (nativeRetryOwned) {
        const menuRoots = deepSeekOfficialSelectors(hints, "menuRoot");
        const deleteCandidates = deepSeekOfficialSelectors(hints, "deleteCandidate");
        const deleteItem = await waitForModel(
          () => findOpenDeleteMenuItem(labels, menuRoots, deleteCandidates),
          3200,
          90
        );
        if (deleteItem) {
          if (!attemptStillCurrent()) return deleteResult(false, "deepseek", "current conversation or delete attempt changed during trusted menu retry");
          const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
          if (deepSeekConfirmationAlreadyOpen(hints)) {
            return deleteResult(false, "deepseek", "unverified delete confirmation appeared before delete activation");
          }
          if (!deleteClick(deleteItem) && !deleteClickLayout(deleteItem)) {
            return deleteResult(false, "deepseek", "explicit Delete action could not be safely activated");
          }
          return deepSeekConfirmationResult(confirmationBaseline, hints, attemptStillCurrent);
        }
        if (data?.trustedMenuClickRetried) {
          if (!routeStillCurrent()) return deleteResult(false, "deepseek", "current conversation changed during trusted menu retry");
          if (findOpenDeleteMenuItem(labels, menuRoots, deleteCandidates) || deepSeekConfirmationAlreadyOpen(hints)) {
            return deleteResult(false, "deepseek", "delete menu state is not clean; trusted retry was not renewed");
          }
          return armDeepSeekTrustedRetry(data, deleteResult(false, "deepseek", "trusted topic menu click did not open"));
        }
      }
      let bridgeReason = "";
      let useNativeFallback = nativeRetryOwned;
      if (!useNativeFallback) {
        const bridged = await requestDeepSeekDeleteBridge(10500, data);
        const trustedValidation = validateDeepSeekBridgeTrustedResult(bridged, data, currentRouteId, hints);
        if (!trustedValidation.ok) return deleteResult(false, "deepseek", trustedValidation.reason);
        const safeBridged = sanitizeDeepSeekTrustedResult(bridged, trustedValidation);
        const hasTrustedBridgeInstruction = Boolean(
          safeBridged?.needsTrustedHover && safeBridged.trustedHover || safeBridged?.needsTrustedMenuClick && safeBridged.trustedMenuClick || safeBridged?.needsTrustedKeySequence && safeBridged.trustedKeySequence
        );
        if (hasTrustedBridgeInstruction) {
          return deleteResult(false, "deepseek", safeBridged.reason || "topic menu trigger requires trusted browser input", {
            ...safeBridged?.needsTrustedHover && safeBridged.trustedHover ? { needsTrustedHover: true, trustedHover: safeBridged.trustedHover } : {},
            ...safeBridged?.needsTrustedMenuClick && safeBridged.trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick: safeBridged.trustedMenuClick } : {},
            ...safeBridged?.needsTrustedKeySequence && safeBridged.trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence: safeBridged.trustedKeySequence } : {}
          });
        }
        if (bridged?.ok) return deleteResult(true, "deepseek");
        const disposition = deepSeekBridgeFallbackDisposition(bridged, retryRequested);
        bridgeReason = disposition.reason;
        if (!disposition.useNativeFallback) return deleteResult(false, "deepseek", bridgeReason);
        useNativeFallback = disposition.useNativeFallback;
      }
      if (!useNativeFallback) return deleteResult(false, "deepseek", bridgeReason || "native fallback is unavailable");
      if (!routeStillCurrent()) {
        return deleteResult(false, "deepseek", "current conversation changed before native delete fallback");
      }
      const root = deepSeekSidebarRoot(hints);
      const row = findDeepSeekCurrentTopicRow(root, hints);
      let rowFailureReason = bridgeReason || "current topic row not found";
      let moreButton = null;
      if (row) {
        moreButton = await waitForModel(() => deepSeekTopicMoreButton(row, hints), 1600, 100);
        if (moreButton) {
          if (deepSeekConfirmationAlreadyOpen(hints)) {
            return deleteResult(false, "deepseek", "unverified delete confirmation appeared before delete activation");
          }
          const confirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
          const preDeleteGuard = () => attemptStillCurrent() && !deepSeekConfirmationAlreadyOpen(hints);
          if (await openDeepSeekTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true, guard: preDeleteGuard, hints })) {
            return deepSeekConfirmationResult(confirmationBaseline, hints, attemptStillCurrent, bridgeReason || "delete confirmation button not found");
          }
          if (deepSeekConfirmationAlreadyOpen(hints)) return deleteResult(false, "deepseek", "delete confirmation ownership is uncertain");
          rowFailureReason = bridgeReason || "delete menu item not found";
        } else {
          rowFailureReason = bridgeReason || "topic menu trigger not found";
        }
        closeDeepSeekTransientMenus();
      }
      if (!attemptStillCurrent()) return deleteResult(false, "deepseek", "current conversation or delete attempt changed before header delete fallback");
      if (deepSeekConfirmationAlreadyOpen(hints)) {
        return deleteResult(false, "deepseek", "unverified delete confirmation appeared before header delete activation");
      }
      const headerButton = deepSeekHeaderMenuButton(hints);
      const headerConfirmationBaseline = new Set(deleteDialogRoots(hints.dialog));
      const headerPreDeleteGuard = () => attemptStillCurrent() && !deepSeekConfirmationAlreadyOpen(hints);
      if (headerButton && await openDeepSeekTriggerAndClickDelete(headerButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true, guard: headerPreDeleteGuard, hints })) {
        return deepSeekConfirmationResult(headerConfirmationBaseline, hints, attemptStillCurrent, bridgeReason || "delete confirmation button not found");
      }
      if (deepSeekConfirmationAlreadyOpen(hints)) return deleteResult(false, "deepseek", "delete confirmation ownership is uncertain");
      if (headerButton) closeDeepSeekTransientMenus();
      if (!row) return deleteResult(false, "deepseek", rowFailureReason);
      const cleanBaseline = await waitForModel(
        () => !findOpenDeleteMenuItem(
          labels,
          deepSeekOfficialSelectors(hints, "menuRoot"),
          deepSeekOfficialSelectors(hints, "deleteCandidate")
        ) && !deepSeekConfirmationAlreadyOpen(hints),
        700,
        70
      );
      if (!cleanBaseline) return deleteResult(false, "deepseek", "delete menu state remained open; trusted retry was not leased");
      return armDeepSeekTrustedRetry(
        data,
        data?.trustedKeySequenceRetried ? deleteResultWithDeepSeekTrustedMenuClick(rowFailureReason, row, moreButton, hints) : deleteResultWithDeepSeekTrustedKeySequence(rowFailureReason, row, hints)
      );
    }
    const TOPIC_DELETE_FALLBACK_CONFIGS = Object.freeze({
      chatgpt: Object.freeze({
        id: "chatgpt",
        name: "ChatGPT",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["chatgpt.com", "chat.openai.com"]),
        userscript: "",
        userscriptTimeoutMs: 15e3
      }),
      claude: Object.freeze({
        id: "claude",
        name: "Claude",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["claude.ai"]),
        userscript: "",
        userscriptTimeoutMs: 15e3
      }),
      gemini: Object.freeze({
        id: "gemini",
        name: "Gemini",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["gemini.google.com"]),
        userscript: "",
        userscriptTimeoutMs: 18e3
      }),
      kagi: Object.freeze({
        id: "kagi",
        name: "Kagi Assistant",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["assistant.kagi.com"]),
        userscript: "",
        userscriptTimeoutMs: 15e3
      }),
      grok: Object.freeze({
        id: "grok",
        name: "Grok",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["grok.com", "grok.x.ai"]),
        userscript: "",
        userscriptTimeoutMs: 15e3
      }),
      grokMirror: Object.freeze({
        id: "grokMirror",
        name: "Grok Mirror",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["gk.dairoot.cn"]),
        userscript: "",
        userscriptTimeoutMs: 15e3
      }),
      notion: Object.freeze({
        id: "notion",
        name: "Notion AI",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["app.notion.com", "notion.so", "www.notion.so"]),
        userscript: "",
        userscriptTimeoutMs: 15e3
      }),
      deepseek: Object.freeze({
        id: "deepseek",
        name: "DeepSeek",
        builtIn: true,
        enabled: true,
        deleteAuthorizedHosts: Object.freeze(["deepseek.com", "chat.deepseek.com"]),
        userscript: "",
        userscriptTimeoutMs: 36e3
      })
    });
    function requestDeepSeekDeleteBridge(timeoutMs = 9e3, data = {}) {
      return new Promise((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMessage, true);
          resolve({ ok: false, delivered: "unknown", phase: "unknown", reason: "bridge timeout" });
        }, Math.max(500, Number(timeoutMs) || 9e3));
        function onMessage(event) {
          const message = event.data;
          if (message?.source !== DEEPSEEK_DELETE_SOURCE2 || message.type !== "response" || message.id !== id) return;
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve({
            ...message,
            delivered: message?.delivered === true || message?.delivered === false ? message.delivered : "unknown",
            phase: typeof message?.phase === "string" ? message.phase : "unknown"
          });
        }
        window.addEventListener("message", onMessage, true);
        try {
          window.postMessage({ source: DEEPSEEK_DELETE_SOURCE2, type: "request", action: "deleteThread", id, data }, "*");
        } catch (error) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve({ ok: false, delivered: false, phase: "pre-delete", reason: error?.message || String(error || "bridge failed") });
        }
      });
    }
    return Object.freeze({
      deleteDeepSeekThread,
      validateDeepSeekTrustedCoordinates,
      sanitizeDeepSeekTrustedResult,
      TOPIC_DELETE_FALLBACK_CONFIGS
    });
  }

  // shared/url-match.js
  function normalizeHost(host) {
    const raw = String(host || "").trim().toLowerCase();
    if (!raw || /\s|:\/\/|[/?#@]/.test(raw)) return "";
    const wildcard = raw.startsWith("*.");
    const candidate = wildcard ? raw.slice(2) : raw;
    if (!candidate || candidate.includes("*") || !candidate.startsWith("[") && candidate.includes(":")) return "";
    let hostname = "";
    try {
      const parsed = new URL(`http://${candidate}`);
      if (parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
      hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      return "";
    }
    if (!hostname || hostname.length > 253) return "";
    const bracketedIpv6 = hostname.startsWith("[") && hostname.endsWith("]");
    if (!bracketedIpv6) {
      const labels = hostname.split(".");
      if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return "";
    }
    if (wildcard && (bracketedIpv6 || /^\d+(?:\.\d+){3}$/.test(hostname) || hostname === "localhost")) return "";
    return wildcard ? `*.${hostname}` : hostname;
  }
  function officialRuleConfigMatchesHref(config, href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = normalizeHost(url.hostname);
    if (!hostname || hostname.startsWith("*.")) return false;
    const hosts = Array.isArray(config?.officialRuleHosts) ? config.officialRuleHosts : [];
    const exactHostMatch = hosts.some((host) => {
      const candidate = normalizeHost(host);
      return Boolean(candidate && !candidate.startsWith("*.") && candidate === hostname);
    });
    if (!exactHostMatch) return false;
    const prefixes = Array.isArray(config?.officialRulePathPrefixes) ? config.officialRulePathPrefixes.map((prefix) => String(prefix || "").trim()).filter(Boolean) : [];
    return prefixes.length === 0 || prefixes.some((prefix) => url.pathname.startsWith(prefix));
  }
  function deleteConfigAuthorizedForHref(config, href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = normalizeHost(url.hostname);
    if (!hostname || hostname.startsWith("*.")) return false;
    return (Array.isArray(config?.deleteAuthorizedHosts) ? config.deleteAuthorizedHosts : []).some((host) => {
      const candidate = normalizeHost(host);
      return Boolean(candidate && !candidate.startsWith("*.") && candidate === hostname);
    });
  }

  // content-src/capabilities/delete-runtime.js
  function createDeleteRuntimeCapability(deps = {}) {
    const {
      TOPIC_DELETE_FALLBACK_CONFIGS,
      PROTOCOL,
      deleteCompactToken,
      requestBackground: requestBackground2,
      EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST: EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST2,
      INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST: INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST2,
      deleteResult,
      deleteChatGptThread,
      deleteClaudeThread,
      deleteGeminiThread,
      deleteKagiThread,
      deleteGrokThread,
      deleteNotionThread,
      deleteDeepSeekThread,
      normalize: normalize2,
      normalizeDeleteFrameHref: normalizeDeleteFrameHref2,
      deleteConversationIdentityFromHref: deleteConversationIdentityFromHref2,
      sameDeleteConversationIdentity: sameDeleteConversationIdentity2,
      contentDocumentId,
      validateDeepSeekTrustedCoordinates,
      sanitizeDeepSeekTrustedResult
    } = deps;
    function topicDeleteFallbackConfig(config = {}, payload = {}) {
      const id = String(config?.id || "").trim().toLowerCase();
      const app = `${payload?.appId || ""} ${payload?.appName || ""} ${config?.name || ""}`.toLowerCase();
      const host = String(location.hostname || "").toLowerCase();
      let fallback = null;
      if (id === "chatgpt" || /chatgpt|chat gpt/.test(app) || host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com" || host.endsWith(".chat.openai.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.chatgpt;
      else if (id === "claude" || /claude/.test(app) || host === "claude.ai" || host.endsWith(".claude.ai")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.claude;
      else if (id === "gemini" || /gemini/.test(app) || host === "gemini.google.com" || host.endsWith(".gemini.google.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.gemini;
      else if (id === "kagi" || /kagi/.test(app) || host === "assistant.kagi.com") fallback = TOPIC_DELETE_FALLBACK_CONFIGS.kagi;
      else if (id === "grokmirror" || /grokmirror|grok mirror/.test(app) || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.grokMirror;
      else if (id === "grok" || /grok/.test(app) || host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.grok;
      else if (id === "notion" || /notion/.test(app) || host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.notion;
      else if (id === "deepseek" || /deepseek/.test(app) || host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.deepseek;
      if (!fallback) return null;
      const sourceMode = config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride) ? "custom" : "builtIn";
      const userscript = String(sourceMode === "custom" ? config?.customUserscript || config?.userscript || "" : fallback.userscript || config?.userscript || "").trim();
      return {
        ...fallback,
        ...config,
        id: config?.id || fallback.id,
        name: config?.name || fallback.name,
        builtIn: config?.builtIn !== false,
        enabled: config?.enabled !== false,
        sourceMode,
        userscript,
        ...sourceMode === "custom" ? { customUserscript: userscript } : {},
        userscriptLength: userscript.length,
        userscriptTimeoutMs: Number(config?.userscriptTimeoutMs) || fallback.userscriptTimeoutMs || 15e3
      };
    }
    const TOPIC_DELETE_MENU_COMMAND_EVENT2 = PROTOCOL.TOPIC_DELETE_MENU_COMMAND_EVENT;
    const TOPIC_DELETE_RESULT_EVENT2 = PROTOCOL.TOPIC_DELETE_RESULT_EVENT;
    const TOPIC_DELETE_PING_EVENT2 = PROTOCOL.TOPIC_DELETE_PING_EVENT;
    const TOPIC_DELETE_READY_EVENT2 = PROTOCOL.TOPIC_DELETE_READY_EVENT;
    const TOPIC_DELETE_BRIDGE_SOURCE2 = PROTOCOL.TOPIC_DELETE_BRIDGE_SOURCE;
    const TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON = "userscript does not expose menu command trigger";
    function topicDeleteSiteName(config = {}, payload = {}) {
      return String(config.id || config.name || payload.appId || payload.appName || location.hostname || "topic-delete").trim() || "topic-delete";
    }
    function isStandaloneTopicDeleteUserscript(source = "") {
      return /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(String(source || ""));
    }
    function topicDeleteSiteKeys(config = {}, payload = {}) {
      return [config.id, config.name, payload.appId, payload.appName].map((item) => String(item || "").trim()).filter(Boolean);
    }
    function topicDeleteScriptId(config = {}) {
      return String(config.scriptId || config.id || "").trim();
    }
    function topicDeleteStandaloneVersion(config = {}) {
      if (config.userscriptVersion) return String(config.userscriptVersion).trim();
      const source = String(config.userscript || "");
      const match = source.match(/^\s*\/\/\s*@version\s+(.+?)\s*$/m);
      return match ? String(match[1] || "").trim() : "";
    }
    function topicDeleteSupportsVersionedRequest(config = {}) {
      if (typeof config.supportsVersionedRequest === "boolean") return config.supportsVersionedRequest;
      const source = String(config.userscript || "");
      return source.includes("VERSIONED_REQUEST_EVENT") && /request:\s*"\s*\+\s*VERSION|request:\s*['"]/.test(source);
    }
    function topicDeleteSupportsVersionedMenuCommand(config = {}) {
      if (typeof config.supportsVersionedMenuCommand === "boolean") return config.supportsVersionedMenuCommand;
      const source = String(config.userscript || "");
      return source.includes("VERSIONED_MENU_COMMAND_EVENT") && /menu-command:\s*"\s*\+\s*VERSION|menu-command:\s*['"]/.test(source);
    }
    function topicDeleteSourceSupportsMenuCommand(config = {}) {
      if (typeof config.supportsMenuCommand === "boolean") return config.supportsMenuCommand;
      const source = String(config.userscript || "");
      return source.includes("MENU_COMMAND_EVENT") || source.includes("chatclub:delete-site:menu-command") || /\bmenuCommand\b/.test(source);
    }
    function topicDeleteReadyVersion(config = {}) {
      return topicDeleteSupportsVersionedMenuCommand(config) || topicDeleteSupportsVersionedRequest(config) ? topicDeleteStandaloneVersion(config) : "";
    }
    function topicDeleteVersionMatches(version, expectedVersion = "") {
      const current = String(version || "").trim();
      return !expectedVersion || current === expectedVersion;
    }
    function topicDeleteUsesPackagedDefault(config = {}) {
      return config?.builtIn !== false && config?.sourceMode !== "custom" && !config?.userscriptOverride;
    }
    function topicDeleteReadyMatches(detail = {}, keys = [], expectedVersion = "", expectedScriptId = "") {
      const wanted = keys.map(deleteCompactToken).filter(Boolean);
      const siteMatches = !wanted.length || [detail.site, detail.siteId, detail.name].some((item) => {
        const token = deleteCompactToken(item);
        return token && wanted.includes(token);
      });
      const expectedScript = deleteCompactToken(expectedScriptId);
      const scriptMatches = !expectedScript || [detail.scriptId, detail.script, detail.siteId, detail.site].some((item) => {
        const token = deleteCompactToken(item);
        return token && token === expectedScript;
      });
      return siteMatches && scriptMatches && topicDeleteVersionMatches(detail.version, expectedVersion);
    }
    function topicDeleteDirectStandaloneApi(config = {}, payload = {}, options = {}) {
      const registry = window.ChatClubDeleteSites;
      if (!registry || typeof registry !== "object") return null;
      const wanted = topicDeleteSiteKeys(config, payload).map(deleteCompactToken).filter(Boolean);
      const expectedScriptId = deleteCompactToken(topicDeleteScriptId(config));
      const expectedVersion = topicDeleteStandaloneVersion(config);
      const acceptMatchingVersion = options.acceptMatchingVersion !== false;
      for (const [entryKey, entry] of Object.entries(registry)) {
        if (!entry || typeof entry.menuCommand !== "function" && typeof entry.run !== "function") continue;
        const candidates = [entryKey, entry.scriptId, entry.site, entry.siteId, entry.name, entry.id].map(deleteCompactToken).filter(Boolean);
        if (wanted.length && !candidates.some((candidate) => wanted.includes(candidate))) continue;
        if (expectedScriptId && !candidates.includes(expectedScriptId)) continue;
        if (acceptMatchingVersion && topicDeleteVersionMatches(entry.version, expectedVersion)) return entry;
        try {
          entry.dispose?.();
        } catch {
        }
        try {
          delete registry[entryKey];
        } catch {
        }
      }
      return null;
    }
    function waitForTopicDeleteUserscriptReady(config = {}, payload = {}, timeoutMs = 450) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const keys = topicDeleteSiteKeys(config, payload);
      const scriptId = topicDeleteScriptId(config);
      const expectedVersion = topicDeleteReadyVersion(config);
      const sourceVersion = topicDeleteStandaloneVersion(config);
      return new Promise((resolve) => {
        let timer = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          window.removeEventListener(TOPIC_DELETE_READY_EVENT2, onReady);
          window.removeEventListener("message", onMessage);
        };
        const handleReadyDetail = (detail2 = {}) => {
          if (detail2.id !== id || !topicDeleteReadyMatches(detail2, keys, expectedVersion, scriptId)) return;
          cleanup();
          resolve(detail2);
        };
        const onReady = (event) => {
          handleReadyDetail(event?.detail || {});
        };
        const onMessage = (event) => {
          const message = event?.data || {};
          if (message.source !== TOPIC_DELETE_BRIDGE_SOURCE2 || message.type !== "ready") return;
          handleReadyDetail(message.detail || {});
        };
        window.addEventListener(TOPIC_DELETE_READY_EVENT2, onReady);
        window.addEventListener("message", onMessage);
        timer = setTimeout(() => {
          cleanup();
          resolve(null);
        }, Math.max(80, Number(timeoutMs) || 450));
        const detail = {
          id,
          site: config.id || payload.appId || "",
          siteId: config.id || "",
          scriptId,
          name: config.name || payload.appName || "",
          version: sourceVersion,
          expectedVersion: sourceVersion
        };
        window.dispatchEvent(new CustomEvent(TOPIC_DELETE_PING_EVENT2, { detail }));
        window.postMessage({ source: TOPIC_DELETE_BRIDGE_SOURCE2, type: "ping", detail }, "*");
      });
    }
    async function installStandaloneTopicDeleteUserscript(config = {}) {
      const installConfig = {
        id: config.id || ""
      };
      const response = await requestBackground2(INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST2, {
        config: installConfig
      });
      if (response.runtimeConfig && typeof response.runtimeConfig === "object") {
        Object.assign(config, response.runtimeConfig);
      }
      return response;
    }
    async function ensureStandaloneTopicDeleteUserscript(config = {}, payload = {}, timeoutMs = 15e3) {
      const canReuseExisting = topicDeleteUsesPackagedDefault(config);
      if (canReuseExisting) {
        const alreadyDirect = topicDeleteDirectStandaloneApi(config, payload);
        if (alreadyDirect) return { mode: "direct", api: alreadyDirect };
        const alreadyReady = await waitForTopicDeleteUserscriptReady(config, payload, 360);
        if (alreadyReady) return { mode: "event", ready: alreadyReady };
      } else {
        topicDeleteDirectStandaloneApi(config, payload, { acceptMatchingVersion: false });
      }
      const installed = await installStandaloneTopicDeleteUserscript(config);
      const installedDirect = topicDeleteDirectStandaloneApi(config, payload);
      if (installedDirect) return { mode: "direct", api: installedDirect, installed };
      const installedReady = await waitForTopicDeleteUserscriptReady(config, payload, Math.min(1600, Math.max(600, Number(timeoutMs) || 15e3)));
      if (installedReady) return { mode: "event", ready: installedReady, installed };
      return { mode: "event", ready: null, installed };
    }
    async function runStandaloneTopicDeleteUserscript(config = {}, payload = {}, timeoutMs = 15e3) {
      const site = topicDeleteSiteName(config, payload);
      const readyState = await ensureStandaloneTopicDeleteUserscript(config, payload, timeoutMs);
      if (readyState?.api) {
        if (typeof readyState.api.menuCommand !== "function") {
          return deleteResult(false, site, TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON);
        }
        try {
          return await readyState.api.menuCommand(payload);
        } catch (error) {
          return deleteResult(false, site, error?.message || String(error));
        }
      }
      if (readyState?.ready && readyState.ready.menuCommand !== true) {
        return deleteResult(false, site, TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON);
      }
      if (!topicDeleteSourceSupportsMenuCommand(config)) {
        return deleteResult(false, site, TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON);
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve) => {
        let timer = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          window.removeEventListener(TOPIC_DELETE_RESULT_EVENT2, onResult);
          window.removeEventListener("message", onMessage);
        };
        const handleResultDetail = (detail = {}) => {
          if (detail.id !== id) return;
          cleanup();
          resolve(detail);
        };
        const onResult = (event) => {
          handleResultDetail(event?.detail || {});
        };
        const onMessage = (event) => {
          const message = event?.data || {};
          if (message.source !== TOPIC_DELETE_BRIDGE_SOURCE2 || message.type !== "result") return;
          handleResultDetail(message.detail || {});
        };
        window.addEventListener(TOPIC_DELETE_RESULT_EVENT2, onResult);
        window.addEventListener("message", onMessage);
        timer = setTimeout(() => {
          cleanup();
          resolve(deleteResult(false, site, "userscript menu command timed out"));
        }, Math.max(5e3, Math.min(45e3, Number(timeoutMs) || 15e3)));
        try {
          const expectedVersion = topicDeleteStandaloneVersion(config);
          const useVersionedMenuCommand = topicDeleteSupportsVersionedMenuCommand(config) && expectedVersion;
          const commandEvent = useVersionedMenuCommand ? `${TOPIC_DELETE_MENU_COMMAND_EVENT2}:${expectedVersion}` : TOPIC_DELETE_MENU_COMMAND_EVENT2;
          const commandType = useVersionedMenuCommand ? `menu-command:${expectedVersion}` : "menu-command";
          const detail = {
            id,
            site: config.id || site,
            siteId: config.id || "",
            scriptId: topicDeleteScriptId(config),
            name: config.name || site,
            version: expectedVersion,
            expectedVersion,
            menuCommand: true,
            payload,
            data: payload
          };
          window.dispatchEvent(new CustomEvent(commandEvent, { detail }));
          window.postMessage({ source: TOPIC_DELETE_BRIDGE_SOURCE2, type: commandType, detail }, "*");
        } catch (error) {
          cleanup();
          resolve(deleteResult(false, site, error?.message || String(error)));
        }
      });
    }
    function topicDeleteNativeSiteId(config = {}, payload = {}) {
      const id = String(config?.id || "").trim().toLowerCase();
      const app = `${payload?.appId || ""} ${payload?.appName || ""} ${config?.name || ""}`.toLowerCase();
      const host = String(location.hostname || "").toLowerCase();
      if (id === "chatgpt" || /chatgpt|chat gpt/.test(app) || host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com" || host.endsWith(".chat.openai.com")) return "chatgpt";
      if (id === "claude" || /claude/.test(app) || host === "claude.ai" || host.endsWith(".claude.ai")) return "claude";
      if (id === "gemini" || /gemini/.test(app) || host === "gemini.google.com" || host.endsWith(".gemini.google.com")) return "gemini";
      if (id === "kagi" || /kagi/.test(app) || host === "assistant.kagi.com") return "kagi";
      if (id === "grokmirror" || /grokmirror|grok mirror/.test(app) || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) return "grokMirror";
      if (id === "grok" || /grok/.test(app) || host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai")) return "grok";
      if (id === "notion" || /notion/.test(app) || host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so")) return "notion";
      if (id === "deepseek" || /deepseek/.test(app) || host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) return "deepseek";
      return "";
    }
    function topicDeleteNativeRunner(config = {}, payload = {}) {
      if (config?.builtIn === false) return null;
      const siteId = topicDeleteNativeSiteId(config, payload);
      if (!siteId) return null;
      const nativePayload = {
        ...payload,
        ...config?.officialRuleHints && typeof config.officialRuleHints === "object" ? { officialRuleHints: config.officialRuleHints } : {}
      };
      return async () => {
        if (siteId === "chatgpt") return deleteChatGptThread(nativePayload);
        if (siteId === "claude") return deleteClaudeThread(nativePayload);
        if (siteId === "gemini") return deleteGeminiThread(nativePayload);
        if (siteId === "kagi") return deleteKagiThread(nativePayload);
        if (siteId === "grokMirror") {
          const result = await deleteGrokThread(nativePayload);
          return { ...result, site: "grokMirror" };
        }
        if (siteId === "grok") return deleteGrokThread(nativePayload);
        if (siteId === "notion") return deleteNotionThread(nativePayload);
        if (siteId === "deepseek") return deleteDeepSeekThread(nativePayload);
        return deleteResult(false, siteId || "topic-delete", "unsupported site");
      };
    }
    function normalizeTopicDeleteUserscriptResult(value, config = {}, payload = {}) {
      const site = topicDeleteSiteName(config, payload);
      if (value && typeof value === "object") {
        const ok = Object.prototype.hasOwnProperty.call(value, "ok") ? Boolean(value.ok) : true;
        return {
          ...value,
          ok,
          site: String(value.site || site)
        };
      }
      return deleteResult(Boolean(value), site, value ? "" : "userscript returned false");
    }
    function topicDeleteUsesCustomUserscript(config = {}) {
      return config.builtIn === false || config.sourceMode === "custom" || config.userscriptOverride === true;
    }
    async function executeCustomTopicDeleteUserscript(config = {}, payload = {}) {
      const response = await requestBackground2(EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST2, {
        configId: String(config.id || ""),
        payload
      });
      return response.data || deleteResult(false, topicDeleteSiteName(config, payload), "Custom Delete Site returned no result");
    }
    async function runTopicDeleteUserscript(config = {}, payload = {}) {
      const site = topicDeleteSiteName(config, payload);
      const source = String(config.userscript || "").trim();
      const customMode = topicDeleteUsesCustomUserscript(config);
      const nativeRunner = customMode ? null : topicDeleteNativeRunner(config, payload);
      const standalone = !customMode && !nativeRunner && (config.standaloneUserscript === true || isStandaloneTopicDeleteUserscript(source));
      if (!customMode && !standalone && source) {
        return deleteResult(false, site, "Legacy bridge snippets are unsupported under MV3 CSP; convert this Delete Site to a standalone userscript.");
      }
      if (!customMode && !standalone && !nativeRunner) return deleteResult(false, site, "userscript missing");
      const nativeSiteId = nativeRunner ? topicDeleteNativeSiteId(config, payload) : "";
      const requestedTimeoutMs = Math.max(5e3, Math.min(45e3, Number(config.userscriptTimeoutMs) || 15e3));
      const timeoutMs = nativeSiteId === "deepseek" ? Math.max(requestedTimeoutMs, 36e3) : requestedTimeoutMs;
      let timer = null;
      try {
        const timeoutResult = new Promise((resolve) => {
          timer = setTimeout(() => resolve({ ok: false, site, reason: "userscript timed out" }), timeoutMs);
        });
        const value = await Promise.race([
          customMode ? executeCustomTopicDeleteUserscript(config, payload) : standalone ? runStandaloneTopicDeleteUserscript(config, payload, timeoutMs) : nativeRunner ? nativeRunner() : deleteResult(false, site, "userscript missing"),
          timeoutResult
        ]);
        return normalizeTopicDeleteUserscriptResult(value, config, payload);
      } catch (error) {
        return deleteResult(false, site, error?.message || String(error));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    function validateTopicDeleteInvocation(data = {}) {
      const attemptId = normalize2(data?.deleteAttemptId);
      if (!attemptId || attemptId.length > 256) {
        return { ok: false, reason: "delete attempt identity is missing or malformed" };
      }
      const currentHref = normalizeDeleteFrameHref2(location.href);
      const expectedIdentity = data?.expectedDeleteIdentity;
      if (!expectedIdentity) return { ok: false, reason: "delete target identity is missing" };
      const currentIdentity = deleteConversationIdentityFromHref2(currentHref);
      return sameDeleteConversationIdentity2(expectedIdentity, currentIdentity) ? { ok: true, attemptId, currentHref, expectedIdentity } : { ok: false, reason: "current conversation changed before delete handler execution" };
    }
    function bindDeleteTrustedInstructions(value, attemptId) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const bound = { ...value };
      for (const key of ["trustedClick", "trustedHover", "trustedMenuClick", "trustedKeySequence"]) {
        if (bound[key] && typeof bound[key] === "object" && !Array.isArray(bound[key])) {
          bound[key] = { ...bound[key], attemptId, documentId: contentDocumentId };
        }
      }
      return bound;
    }
    function hasDeleteTrustedInstructions(value) {
      return Boolean(
        value?.needsTrustedClick || value?.needsTrustedHover || value?.needsTrustedMenuClick || value?.needsTrustedKeySequence
      );
    }
    async function deleteThread(data = {}) {
      const invocation = validateTopicDeleteInvocation(data);
      if (!invocation.ok) {
        return deleteResult(false, "topic-delete", invocation.reason, { delivered: false, preDelivery: true });
      }
      const incomingConfig = data?.config && typeof data.config === "object" ? data.config : null;
      const incomingPayload = data?.payload && typeof data.payload === "object" ? data.payload : data;
      const payload = {
        ...incomingPayload,
        deleteAttemptId: invocation.attemptId,
        expectedDeleteIdentity: invocation.expectedIdentity
      };
      const officialRuleActive = officialRuleConfigMatchesHref(incomingConfig, String(location.href || ""));
      const config = incomingConfig ? {
        ...incomingConfig,
        officialRuleHints: officialRuleActive ? incomingConfig.officialRuleHints : {},
        userscriptTimeoutMs: officialRuleActive ? incomingConfig.officialRuleTimeoutMs || incomingConfig.userscriptTimeoutMs : incomingConfig.userscriptTimeoutMs
      } : topicDeleteFallbackConfig({}, payload);
      if (config?.enabled === false) {
        return deleteResult(false, topicDeleteSiteName(config, payload), "site disabled");
      }
      if (config && !topicDeleteUsesCustomUserscript(config) && !deleteConfigAuthorizedForHref(config, String(location.href || ""))) {
        return deleteResult(false, topicDeleteSiteName(config, payload), "delete target host is not authorized for the packaged runner", {
          delivered: false,
          preDelivery: true
        });
      }
      if (!topicDeleteUsesCustomUserscript(config) && config?.standaloneUserscript !== true && !String(config?.userscript || "").trim() && !topicDeleteNativeRunner(config, payload)) {
        return deleteResult(false, topicDeleteSiteName(config || {}, payload), "unsupported site or userscript missing");
      }
      const customMode = topicDeleteUsesCustomUserscript(config);
      const source = String(config?.userscript || "").trim();
      const nativeRunner = customMode ? null : topicDeleteNativeRunner(config, payload);
      const nativeClaudeExecution = Boolean(
        !customMode && !source && nativeRunner && topicDeleteNativeSiteId(config, payload) === "claude"
      );
      let value = await runTopicDeleteUserscript(config, payload);
      if (value?.needsTrustedKeySequence && value?.trustedKeySequence?.kind === "claude-menu-delete-shortcut" && !nativeClaudeExecution) {
        return deleteResult(false, topicDeleteSiteName(config, payload), "trusted Claude Delete D shortcut requires the isolated native Claude runner");
      }
      if (hasDeleteTrustedInstructions(value)) {
        const postRunInvocation = validateTopicDeleteInvocation(data);
        if (!postRunInvocation.ok) {
          return deleteResult(false, topicDeleteSiteName(config, payload), postRunInvocation.reason);
        }
      }
      const siteId = topicDeleteNativeSiteId(config, payload);
      if (siteId === "deepseek") {
        const validation = validateDeepSeekTrustedCoordinates(value, config?.officialRuleHints || {});
        if (!validation.ok) return deleteResult(false, "deepseek", validation.reason);
        value = sanitizeDeepSeekTrustedResult(value, validation);
      }
      return bindDeleteTrustedInstructions(value, invocation.attemptId);
    }
    return Object.freeze({
      deleteThread
    });
  }

  // content-src/content-delete.js
  function installDeleteCapability() {
    const runtimes = runtimeRegistry(window);
    const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_DELETE_BUNDLE_IDENTITY);
    runtimes.registerBundle(runtimeIdentity);
    const { contentDocumentId } = createContentDocumentIdentity(window);
    const dom = createDomRuntime({ activateElement, closest, normalize, qsa, visible });
    const common = createDeleteCommonCapability({
      activateElement,
      buttonText,
      classText,
      closest,
      normalize,
      qsa,
      sleep,
      visible,
      deleteCompletionTargetState,
      DELETE_COMPLETION_STATE_VERSION,
      dispatchPointerActivation: dom.dispatchPointerActivation,
      isDisabledElement: dom.isDisabledElement,
      modelCenterPoint: dom.modelCenterPoint,
      modelClick: dom.modelClick,
      modelClickableAncestor: dom.modelClickableAncestor,
      modelCustomActivationAncestor: dom.modelCustomActivationAncestor,
      modelDirectClick: dom.modelDirectClick,
      modelElementArea: dom.modelElementArea,
      modelElementFromPoint: dom.modelElementFromPoint,
      modelElementText: dom.modelElementText,
      modelEventConstructor: dom.modelEventConstructor,
      modelRect: dom.modelRect,
      nativeModelClick: dom.nativeModelClick,
      visibleSelectorElements: dom.visibleSelectorElements
    });
    const waitForModel = async (getter, timeoutMs = 2500, intervalMs = 120) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = getter();
        if (value) return value;
        await sleep(intervalMs);
      }
      return getter();
    };
    const sites = createDeleteSitesCapability({
      closest,
      matches,
      normalize,
      qsa,
      sleep,
      visible,
      deleteActivateUntil: common.deleteActivateUntil,
      DELETE_CANCEL_LABELS: common.DELETE_CANCEL_LABELS,
      deleteClick: common.deleteClick,
      deleteClickableElement: common.deleteClickableElement,
      deleteClickLayout: common.deleteClickLayout,
      deleteCompactToken: common.deleteCompactToken,
      deleteDialogRoots: common.deleteDialogRoots,
      deleteElementText: common.deleteElementText,
      deleteLabelMatches: common.deleteLabelMatches,
      deleteLabelMatchesExactish: common.deleteLabelMatchesExactish,
      deleteResult: common.deleteResult,
      deleteResultWithTrustedConfirm: common.deleteResultWithTrustedConfirm,
      deleteResultWithTrustedDeleteShortcut: common.deleteResultWithTrustedDeleteShortcut,
      deleteResultWithTrustedMenuClick: common.deleteResultWithTrustedMenuClick,
      dispatchDeleteKeyboardShortcut: common.dispatchDeleteKeyboardShortcut,
      clickDeleteConfirmIfPresent: common.clickDeleteConfirmIfPresent,
      findDeleteConfirmButton: common.findDeleteConfirmButton,
      findDeleteConfirmButtonInfo: common.findDeleteConfirmButtonInfo,
      isDisabledElement: dom.isDisabledElement,
      modelElementArea: dom.modelElementArea,
      modelElementFromPoint: dom.modelElementFromPoint,
      modelRect: dom.modelRect,
      svgSignature: common.svgSignature,
      visibleDeleteCandidates: common.visibleDeleteCandidates,
      visibleSelectorElements: dom.visibleSelectorElements,
      waitForModel
    });
    const deepSeek = createDeleteDeepSeekCapability({
      closest,
      normalize,
      qsa,
      reveal,
      sleep,
      visible,
      deleteActivateUntil: common.deleteActivateUntil,
      deleteClick: common.deleteClick,
      deleteClickableElement: common.deleteClickableElement,
      deleteClickLayout: common.deleteClickLayout,
      deleteCompactToken: common.deleteCompactToken,
      deleteElementText: common.deleteElementText,
      deleteResult: common.deleteResult,
      findDeleteConfirmButton: common.findDeleteConfirmButton,
      findDeleteConfirmButtonInfo: common.findDeleteConfirmButtonInfo,
      deleteDialogRoots: common.deleteDialogRoots,
      clickDeleteConfirmIfPresent: common.clickDeleteConfirmIfPresent,
      layoutDeleteCandidates: common.layoutDeleteCandidates,
      serializableDeleteRect: common.serializableDeleteRect,
      svgSignature: common.svgSignature,
      trustedMenuClickForElement: common.trustedMenuClickForElement,
      trustedMenuClickPoint: common.trustedMenuClickPoint,
      dispatchPointerActivation: dom.dispatchPointerActivation,
      firstVisibleBySelectors: dom.firstVisibleBySelectors,
      isDisabledElement: dom.isDisabledElement,
      modelDirectClick: dom.modelDirectClick,
      modelElementArea: dom.modelElementArea,
      modelElementFromPoint: dom.modelElementFromPoint,
      modelEventConstructor: dom.modelEventConstructor,
      modelRect: dom.modelRect,
      nativeModelClick: dom.nativeModelClick,
      visibleSelectorElements: dom.visibleSelectorElements,
      findDeleteMenuItem: sites.findDeleteMenuItem,
      findOpenDeleteMenuItem: sites.findOpenDeleteMenuItem,
      menuRootsWithDelete: sites.menuRootsWithDelete,
      waitForModel,
      DEEPSEEK_DELETE_SOURCE: CONTENT_PROTOCOL.DEEPSEEK_DELETE_SOURCE
    });
    const runtime = createDeleteRuntimeCapability({
      normalize,
      deleteCompactToken: common.deleteCompactToken,
      deleteResult: common.deleteResult,
      deleteChatGptThread: sites.deleteChatGptThread,
      deleteClaudeThread: sites.deleteClaudeThread,
      deleteGeminiThread: sites.deleteGeminiThread,
      deleteGrokThread: sites.deleteGrokThread,
      deleteKagiThread: sites.deleteKagiThread,
      deleteNotionThread: sites.deleteNotionThread,
      deleteDeepSeekThread: deepSeek.deleteDeepSeekThread,
      sanitizeDeepSeekTrustedResult: deepSeek.sanitizeDeepSeekTrustedResult,
      TOPIC_DELETE_FALLBACK_CONFIGS: deepSeek.TOPIC_DELETE_FALLBACK_CONFIGS,
      validateDeepSeekTrustedCoordinates: deepSeek.validateDeepSeekTrustedCoordinates,
      PROTOCOL: CONTENT_PROTOCOL,
      requestBackground,
      EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST,
      INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
      contentDocumentId,
      normalizeDeleteFrameHref,
      deleteConversationIdentityFromHref,
      sameDeleteConversationIdentity
    });
    installContentCapability(runtimes, {
      capability: "delete",
      owner: "content-capability:delete",
      version: runtimeIdentity.bundle.implementationVersion,
      routerVersion: runtimeIdentity.implementationVersion,
      handlers: {
        deleteThread: runtime.deleteThread,
        getDeleteConfirmState: (data) => common.topicDeleteConfirmState(
          data?.site || "topic-delete",
          data?.identity || null,
          data?.officialRuleHints || {}
        )
      }
    });
  }
  installDeleteCapability();
})();
