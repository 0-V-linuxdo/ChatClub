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
  var DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread:2026.07.16.1";
  var PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript:2026.07.16.2";
  var RUNTIME_REGISTRY_ABI_VERSION = 1;
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
  var CONTENT_RUNTIME_SOURCE_SHA256 = "42d1e137fe2015d43fe6732ef431f641cc51d65ec7986e095d9a243339d4e9c2";
  var CONTENT_RUNTIME_BUILD_RECIPE_VERSION = "1+recipe.cd06beed22e9f6fcab8057bd949a3c0c68974967bda920471fc1d62f06999029";
  var CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "cd06beed22e9f6fcab8057bd949a3c0c68974967bda920471fc1d62f06999029";
  var CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "ebe2ed4ec1fc3680d7cd904b38a423d86055d3ce43ef5f1d0cb0f96f6d83fd83";
  var CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "2026.07.16.2+implementation.ebe2ed4ec1fc3680d7cd904b38a423d86055d3ce43ef5f1d0cb0f96f6d83fd83";
  var CONTENT_RUNTIME_SUMMARY_BRIDGE_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/summary-bridge.js", "entryPath": "content-src/content-summary-bridge.js", "sourceSha256": "62d7a7e5baf6502fa2c31f6de2178d1c34762ac838584ff7f9f95d6889ee76dd", "implementationSha256": "129d64723acf8a43b7eed347ee102201529be9078049083ccf317792b887c363", "implementationVersion": "2026.07.16.2+bundle.129d64723acf8a43b7eed347ee102201529be9078049083ccf317792b887c363" });
  var CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/summary-userscripts-main.js", "entryPath": "content-src/summary-userscripts-main.js", "sourceSha256": "12ac7c360b98ebc28bd00c1ab5d46d33a7329fb503e27b5994744ee2cc639968", "implementationSha256": "32e94a5fc5e6045d632c923e7f24256fe385a8a9e90a2ea12b598b7a415b7258", "implementationVersion": "2026.07.16.2+bundle.32e94a5fc5e6045d632c923e7f24256fe385a8a9e90a2ea12b598b7a415b7258" });
  var CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/summary-userscripts.js", "entryPath": "content-src/summary-userscripts.js", "sourceSha256": "1a4124691bcc0b61609986cf6870b922dfc8f5d133acbfac1203789b98ace4b9", "implementationSha256": "03d726386eb69789437d77afb428ca4799d6c4ba4572ca82a327bdf957fb55a9", "implementationVersion": "2026.07.16.2+bundle.03d726386eb69789437d77afb428ca4799d6c4ba4572ca82a327bdf957fb55a9" });

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
    INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
    EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
    EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST
  ]);

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
  function normalizeContentRuntimeIdentity(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const identity = Object.fromEntries(
      IDENTITY_FIELDS.map((field) => [field, String(source[field] || "")])
    );
    if (source.bundle && typeof source.bundle === "object") {
      identity.bundle = normalizeContentRuntimeBundleIdentity(source.bundle);
    }
    return Object.freeze(identity);
  }
  function contentRuntimeIdentityMatches(value, expected = CONTENT_RUNTIME_IDENTITY) {
    const candidate = normalizeContentRuntimeIdentity(value);
    const wanted = normalizeContentRuntimeIdentity(expected);
    return IDENTITY_FIELDS.every((field) => candidate[field] && candidate[field] === wanted[field]);
  }
  function contentRuntimeBundleIdentityMatches(value, expectedBundleIdentity) {
    let expected;
    try {
      expected = expectedBundleIdentity?.bundle ? normalizeContentRuntimeIdentity(expectedBundleIdentity) : createContentRuntimeBundleIdentity(expectedBundleIdentity);
    } catch {
      return false;
    }
    const candidate = normalizeContentRuntimeIdentity(value);
    if (!contentRuntimeIdentityMatches(candidate, expected) || !candidate.bundle) return false;
    return BUNDLE_IDENTITY_FIELDS.every((field) => candidate.bundle[field] && candidate.bundle[field] === expected.bundle[field]);
  }

  // content-src/shared/summary-runtime.js
  var COPY_SOURCE = NATIVE_COPY_SOURCE;
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
  function qs(selector, root = document) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }
  function closest(el, selector) {
    try {
      return el?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }
  function text(el) {
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
    return el.innerText || el.textContent || "";
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
  function merge(messages) {
    const out = [];
    for (const message of messages || []) {
      const role = String(message?.role || "assistant").toLowerCase();
      const value = cleanCaptured(message?.text || message?.content || "");
      if (!value) continue;
      const previous = out[out.length - 1];
      if (previous && previous.role === role) previous.text = normalize(`${previous.text}

${value}`);
      else out.push({ role, text: value });
    }
    return out;
  }
  function toRegex(value) {
    if (!value) return null;
    if (value instanceof RegExp) return value;
    try {
      return new RegExp(String(value), "i");
    } catch {
      return null;
    }
  }
  function compareText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, "");
  }
  function cleanCaptured(value) {
    return normalize(String(value || "").replace(/Show more\s*Show less/gi, "").replace(/^\s*(Show more|Show less|显示更多|收起)\s*$/gim, ""));
  }
  function copyLooksUseful(value) {
    const next = cleanCaptured(value);
    return Boolean(next && next.length >= 2 && next.length <= 5e4 && !/^(copy|copied|复制|已复制|share|link)$/i.test(next) && !/^(https?:\/\/|mailto:|#)[^\s]{1,240}$/i.test(next));
  }
  function hasUserAndAssistant(messages) {
    return Array.isArray(messages) && messages.some((item) => item?.role === "user") && messages.some((item) => item?.role === "assistant");
  }
  function elementOrder(a, b) {
    try {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    } catch {
      return 0;
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
  function userscriptMeta(el) {
    if (!el) return "";
    return normalize([
      el.tagName,
      classText(el),
      el.getAttribute?.("role"),
      buttonText(el),
      el.getAttribute?.("data-message-author-role")
    ].filter(Boolean).join(" "));
  }
  function matches(el, selector) {
    try {
      return Boolean(el?.matches?.(selector));
    } catch {
      return false;
    }
  }
  function isNativeCopyButton(el) {
    return /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(userscriptMeta(el));
  }
  function svgSignature(el) {
    return normalize([el, ...qsa("svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", el).slice(0, 80)].map((node) => [
      classText(node),
      node.getAttribute?.("data-icon"),
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.getAttribute?.("alt"),
      node.getAttribute?.("src"),
      node.getAttribute?.("href"),
      node.getAttribute?.("xlink:href"),
      node.getAttribute?.("viewBox"),
      node.getAttribute?.("d"),
      node.getAttribute?.("width"),
      node.getAttribute?.("height")
    ].filter(Boolean).join(" ")).join(" ")).toLowerCase();
  }
  function userscriptLooksLikeCopyIcon(el) {
    const signature = svgSignature(el);
    if (!signature) return false;
    if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(icon|line|fill)/i.test(signature)) return true;
    const rects = qsa("rect", el).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
    return rects.length >= 2;
  }
  function internalTool(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }
  function userscriptButtonOk(el, options = {}) {
    if (!el || internalTool(el)) return false;
    const meta = userscriptMeta(el);
    const exclude = toRegex(options.copyButtonExcludePattern);
    if (exclude?.test(meta)) return false;
    const include = toRegex(options.copyButtonPattern);
    if (include) return include.test(meta) || options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el);
    return isNativeCopyButton(el) || options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el);
  }
  function userscriptCopyRoots(el, options = {}) {
    const roots = [];
    const add = (node) => {
      if (node?.nodeType === 1 && node !== document.documentElement && !roots.includes(node)) roots.push(node);
    };
    add(el);
    if (options.expanded !== false) {
      for (let node = el, depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
        add(node);
        add(node.previousElementSibling);
        add(node.nextElementSibling);
      }
    }
    return roots;
  }
  function userscriptFindCopyButtons(root = document.body, options = {}) {
    let rootRect = null;
    try {
      rootRect = root?.getBoundingClientRect?.();
    } catch {
    }
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem]").trim();
    const seen = /* @__PURE__ */ new Set();
    const scored = [];
    const distanceScore = (candidate) => {
      if (!rootRect?.width || !rootRect?.height || !candidate?.getBoundingClientRect) return 0;
      let rect = null;
      try {
        rect = candidate.getBoundingClientRect();
      } catch {
      }
      return rect?.width && rect?.height ? Math.abs(rect.top - rootRect.bottom) * 20 + Math.abs(rect.left - rootRect.left) : 0;
    };
    let order = 0;
    const add = (candidate, score) => {
      if (!candidate || seen.has(candidate)) return;
      if (!matches(candidate, selector) && candidate !== root) return;
      seen.add(candidate);
      if (userscriptButtonOk(candidate, options)) scored.push({ button: candidate, score: score + distanceScore(candidate) });
    };
    for (const copyRoot of userscriptCopyRoots(root, options)) {
      for (const candidate of [copyRoot, ...qsa(selector, copyRoot, { all: true })]) add(candidate, order++);
    }
    if (!scored.length && options.expanded !== false && rootRect?.width && rootRect?.height) {
      for (const candidate of qsa(selector, document, { all: true })) {
        if (seen.has(candidate) || internalTool(candidate)) continue;
        let rect = null;
        try {
          rect = candidate.getBoundingClientRect();
        } catch {
        }
        if (!rect?.width || !rect?.height || rect.bottom < rootRect.top - 260 || rect.top > rootRect.bottom + 520) continue;
        add(candidate, 1e6 + order++);
      }
    }
    return scored.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }
  function userscriptFindMenuButtons(root = document.body, options = {}) {
    const selector = String(options.copyMenuButtonSelector || "button[aria-haspopup],button[aria-expanded],[role=button][aria-haspopup],button,[role=button]").trim();
    const include = toRegex(options.copyMenuButtonPattern) || /(more|menu|actions|options|overflow|ellipsis|kebab|three dots|更多|操作|菜单|选项|•••|\.\.\.)/i;
    return qsa(selector, root, { all: true }).filter((button) => visible(button) && !internalTool(button) && include.test(userscriptMeta(button))).sort(elementOrder);
  }
  function userscriptOpenCopyButtons(options = {}) {
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]").trim();
    return qsa(selector, document, { all: true }).filter((button) => visible(button) && userscriptButtonOk(button, options)).sort(elementOrder);
  }
  function userscriptCloseMenus() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch {
    }
  }
  function copyMatches(copied, expected) {
    const copiedText = compareText(copied);
    const expectedText = compareText(expected);
    if (!expectedText) return true;
    if (!copiedText) return false;
    if (copiedText === expectedText || copiedText.includes(expectedText)) return true;
    if (expectedText.includes(copiedText) && copiedText.length >= Math.min(expectedText.length * 0.75, 240)) return true;
    return false;
  }
  function userscriptCopyAccepted(copied, expected, role, options = {}) {
    const value = cleanCaptured(copied);
    if (!copyLooksUseful(value)) return "";
    const exclude = toRegex(options.copyTextExcludePattern);
    if (exclude?.test(value)) return "";
    if (options.matchMode === "anyUseful" || !expected) return value;
    return copyMatches(value, expected) ? value : "";
  }
  function copyBridgeRequest(action, id, data = {}, timeout = 1e3) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve(null);
      }, timeout);
      const onMessage = (event) => {
        const message = event.data;
        if (message?.source === COPY_SOURCE && message.id === id && message.type === "response" && message.action === action) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve(message.data || null);
        }
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: COPY_SOURCE, type: "request", id, action, data }, "*");
    });
  }
  function pageSummaryRequest(config = {}) {
    return new Promise((resolve) => {
      const id = copyId();
      const ackTimeoutMs = Math.max(350, Math.min(1800, Number(config.userscriptFallbackDelayMs) || 900));
      const totalTimeoutMs = Math.max(5e3, Math.min(45e3, Number(config.userscriptTimeoutMs) || 15e3));
      let acked = false;
      let done = false;
      const cleanup = () => {
        clearTimeout(ackTimer);
        clearTimeout(totalTimer);
        window.removeEventListener("message", onMessage, true);
      };
      const finish = (result) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      };
      const ackTimer = setTimeout(() => {
        if (!acked) finish({ ok: false, missing: true, messages: [], error: "Summary page-world runtime did not acknowledge the request." });
      }, ackTimeoutMs);
      const totalTimer = setTimeout(() => {
        finish({ ok: false, timeout: true, messages: [], error: "Summary page-world runtime timed out." });
      }, totalTimeoutMs);
      const onMessage = (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.id !== id || message.action !== "extract") return;
        if (message.type === "ack") {
          acked = true;
          clearTimeout(ackTimer);
          return;
        }
        if (message.type !== "response") return;
        const data = message.data || {};
        finish({
          ok: Boolean(message.ok),
          messages: Array.isArray(message.messages) ? message.messages : Array.isArray(data.messages) ? data.messages : [],
          rawMessageCount: data.rawMessageCount,
          hasUserAndAssistant: data.hasUserAndAssistant,
          error: message.error || data.error || ""
        });
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "request", action: "extract", id, data: { config } }, "*");
    });
  }
  function pageSummaryRuntimeState(timeoutMs = 900) {
    return new Promise((resolve) => {
      const id = copyId();
      let settled = false;
      const finish = (state = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve(state);
      };
      const onMessage = (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.type !== "response" || message.action !== "runtimeState" || message.id !== id) return;
        finish(message.data && typeof message.data === "object" ? message.data : null);
      };
      const timer = setTimeout(() => finish(null), Math.max(250, Math.min(1800, Number(timeoutMs) || 900)));
      window.addEventListener("message", onMessage, true);
      window.postMessage({
        source: PAGE_SUMMARY_SOURCE,
        type: "request",
        action: "runtimeState",
        id
      }, "*");
    });
  }
  function copyId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function isCopyProbeText(value) {
    return /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || ""));
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
  async function copy(button, options = {}) {
    if (!button) return "";
    const copyTimeoutMs = Math.max(300, Math.min(1e4, Number(options.copyTimeoutMs || options.timeoutMs) || 2600));
    const copyPollMs = Math.max(20, Math.min(150, Number(options.copyPollMs) || 50));
    const copyCaptureGraceMs = Math.max(80, Math.min(800, Number(options.copyCaptureGraceMs) || 240));
    const acceptUnchangedClipboard = Boolean(options.acceptUnchangedClipboard);
    const resetClipboardBeforeCopy = Boolean(options.resetClipboardBeforeCopy);
    const allowUnchangedClipboard = acceptUnchangedClipboard && !resetClipboardBeforeCopy;
    const id = copyId();
    let before = "";
    let captured = "";
    let capturedPriority = 0;
    let capturedAt = 0;
    try {
      before = normalize(await navigator.clipboard.readText());
    } catch {
    }
    const acceptsClipboardValue = (value) => value && !isCopyProbeText(value) && (value !== before || allowUnchangedClipboard);
    const onCapture = (event) => {
      const message = event.data;
      if (message?.source !== COPY_SOURCE || message.type !== "capture" || message.id !== id) return;
      const value = normalize(message.data?.text || "");
      const priority = Number(message.data?.priority) || 1;
      if (value && !isCopyProbeText(value) && priority >= capturedPriority) {
        captured = value;
        capturedPriority = priority;
        capturedAt = Date.now();
      }
    };
    window.addEventListener("message", onCapture, true);
    try {
      const bridge = await copyBridgeRequest("install", id, { timeoutMs: copyTimeoutMs }, 900);
      if (!bridge?.installed || !bridge?.hooks) return "";
      try {
        activateElement(button);
      } catch {
        try {
          button.click?.();
        } catch {
        }
      }
      for (let index = 0, max = Math.ceil(copyTimeoutMs / copyPollMs); index < max; index += 1) {
        await sleep(copyPollMs);
        if (captured && (capturedPriority >= 5 || Date.now() - capturedAt >= copyCaptureGraceMs)) break;
        try {
          const current = normalize(await navigator.clipboard.readText());
          if (acceptsClipboardValue(current)) {
            captured = current;
            capturedPriority = Math.max(capturedPriority, 6);
            break;
          }
        } catch {
        }
      }
      if (captured && !isCopyProbeText(captured)) return cleanCaptured(captured);
      try {
        const after = normalize(await navigator.clipboard.readText());
        if (acceptsClipboardValue(after)) return cleanCaptured(after);
      } catch {
      }
      return "";
    } finally {
      window.removeEventListener("message", onCapture, true);
      await copyBridgeRequest("restore", id, {}, 900);
    }
  }
  async function copyFirst(buttons, params = {}) {
    const details = params || {};
    const options = details.options || details;
    for (const button of (buttons || []).slice(0, 12)) {
      const value = userscriptCopyAccepted(await copy(button, options), details.expected, details.role, options);
      if (value) return value;
    }
    if (details.scope && options.copyMenu !== false) {
      for (const menuButton of userscriptFindMenuButtons(details.scope, options).slice(0, 8)) {
        userscriptCloseMenus();
        reveal(menuButton);
        try {
          activateElement(menuButton);
        } catch {
        }
        await sleep(180);
        const value = await copyFirst(userscriptOpenCopyButtons(options).filter((button) => button !== menuButton && !menuButton.contains(button)), details);
        userscriptCloseMenus();
        if (value) return value;
      }
    }
    return "";
  }
  function userscriptRole(el, options = {}) {
    const nodes = [el, closest(el, "[data-message-author-role]")].filter(Boolean);
    let value = "";
    const attr = String(options.roleAttribute || "").trim();
    if (attr) {
      for (const node of nodes) value += `${node.getAttribute?.(attr) || ""} `;
    }
    value += nodes.map(userscriptMeta).join(" ");
    const userPattern = toRegex(options.userRolePattern);
    const assistantPattern = toRegex(options.assistantRolePattern);
    if (userPattern?.test(value)) return "user";
    if (assistantPattern?.test(value)) return "assistant";
    const role = String(closest(el, "[data-message-author-role]")?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    return role === "user" || role === "assistant" ? role : null;
  }
  function fallbackRole(index, options = {}) {
    const sequence = options.roleFallbackSequence;
    if (sequence === "userFirst") return index % 2 === 0 ? "user" : "assistant";
    if (sequence === "assistantFirst") return index % 2 === 0 ? "assistant" : "user";
    if (sequence === "userThenAssistant") return index === 0 ? "user" : "assistant";
    if (sequence === "assistantOnly") return "assistant";
    if (sequence === "userOnly") return "user";
    if (Array.isArray(sequence)) return sequence[index % sequence.length] || null;
    return null;
  }
  function pushMessage(out, role, value, seen) {
    const text2 = cleanCaptured(value);
    if (role !== "user" && role !== "assistant" || !text2) return;
    const compact = compareText(text2);
    const key = `${role}|${compact}`;
    if (seen.has(key)) return;
    const existing = out.find((item) => item.role === role && compareText(item.text) && (compareText(item.text).includes(compact) || compact.includes(compareText(item.text))));
    if (existing) {
      if (compact.length > compareText(existing.text).length) existing.text = text2;
      seen.add(key);
      return;
    }
    seen.add(key);
    out.push({ role, text: text2 });
  }
  async function extractTurns(options = {}) {
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const messageSelector = String(options.messageSelector || "").trim();
    if (!messageSelector) return [];
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const turns = [];
    for (const root of searchRoots) {
      for (const turn of qsa(messageSelector, root, { all: true }).filter(visible)) if (!turns.includes(turn)) turns.push(turn);
    }
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    let roleIndex = 0;
    for (const turn of turns.sort(elementOrder)) {
      let role = userscriptRole(turn, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") continue;
      reveal(turn);
      await sleep(80);
      const expected = text(turn);
      const copied = await copyFirst(userscriptFindCopyButtons(turn, options), { expected, role, options, scope: turn });
      if (copied) {
        pushMessage(out, role, copied, seen);
        roleIndex += 1;
      }
    }
    return merge(out);
  }
  async function extractCopySequence(options = {}) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const buttons = [];
    const buttonSet = /* @__PURE__ */ new Set();
    for (const root of searchRoots) {
      for (const button of userscriptFindCopyButtons(root, { ...options, expanded: false })) {
        if (!buttonSet.has(button)) {
          buttonSet.add(button);
          buttons.push(button);
        }
      }
    }
    buttons.sort(elementOrder);
    let roleIndex = 0;
    const maxButtons = Number(options.maxButtons) || 40;
    const accept = async (button, roleHint) => {
      const role = roleHint || userscriptRole(button, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") return false;
      const value = userscriptCopyAccepted(await copy(button, options), "", role, { ...options, matchMode: "anyUseful" });
      if (!value) return false;
      pushMessage(out, role, value, seen);
      roleIndex += 1;
      return true;
    };
    for (const button of buttons.slice(0, maxButtons)) await accept(button);
    if (out.length < 2 && options.copyMenu !== false) {
      for (const root of searchRoots) {
        for (const menuButton of userscriptFindMenuButtons(root, options).slice(0, Math.min(maxButtons, 16))) {
          userscriptCloseMenus();
          reveal(menuButton);
          try {
            activateElement(menuButton);
          } catch {
          }
          await sleep(180);
          const roleHint = userscriptRole(menuButton, options) || fallbackRole(roleIndex, options);
          for (const button of userscriptOpenCopyButtons(options).filter((item) => item !== menuButton && !menuButton.contains(item)).slice(0, 8)) {
            if (await accept(button, roleHint)) break;
          }
          userscriptCloseMenus();
          if (out.length >= 2) break;
        }
      }
    }
    return merge(out);
  }
  function nodeTextForCopy(node) {
    if (!node?.cloneNode) return text(node);
    try {
      const clone = node.cloneNode(true);
      clone.querySelectorAll?.("button,svg,script,style,noscript,input,textarea,select,option,form,nav,aside,footer,header").forEach((el) => el.remove());
      return normalize(clone.innerText || clone.textContent || "");
    } catch {
      return text(node);
    }
  }
  function internalCopyScope(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }
  function copyButtonRole(button, options = {}) {
    const roleNode = closest(button, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const label = buttonText(button);
    if (/(response|answer|assistant|回答|答复|回复)/i.test(label)) return "assistant";
    if (/(message|prompt|question|user|提问|消息|问题)/i.test(label)) return "user";
    const userRe = toRegex(options.copyUserContextPattern) || /(you\s+said|user\s+said|human|prompt|question|用户|你说|提问)/i;
    const assistantRe = toRegex(options.copyAssistantContextPattern) || /(assistant\s+said|assistant|answer|response|回答|回复|助手)/i;
    for (let node = button, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth += 1) {
      const context = normalize([
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.innerText || node.textContent || ""
      ].filter(Boolean).join(" "));
      if (!context || context.length > 3500) continue;
      const hasUser = userRe.test(context);
      const hasAssistant = assistantRe.test(context);
      if (hasUser && !hasAssistant) return "user";
      if (hasAssistant && !hasUser) return "assistant";
    }
    return null;
  }
  function conversationCopyButtons(root = document.body) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    for (const button of qsa(selector, root || document, { all: true })) {
      if (seen.has(button) || closest(button, "nav,header,footer,form") || internalCopyScope(button)) continue;
      const meta = userscriptMeta(button);
      if (/(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交)/i.test(meta)) continue;
      if (!(isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button))) continue;
      seen.add(button);
      out.push(button);
    }
    return out.sort(elementOrder);
  }
  function nativeCopyDedup(a, b) {
    const left = compareText(a);
    const right = compareText(b);
    return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
  }
  function hoverCopyBadButton(button) {
    const meta = userscriptMeta(button);
    return /(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:new chat|new conversation|history|sidebar|toggle sidebar|home page|open notifications|link|share|search|deepthink|send|ask|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|regenerate|upload|voice|submit|model|fullscreen|reload|close)|链接|分享|搜索|深度思考|发送|新聊天|新对话|历史|侧边栏|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交|全屏|刷新|关闭)/i.test(meta);
  }
  function hoverCopyRect(node) {
    try {
      const rect = node?.getBoundingClientRect?.();
      return rect?.width && rect?.height ? rect : null;
    } catch {
      return null;
    }
  }
  function hoverCopySmallIconButton(button) {
    const rect = hoverCopyRect(button);
    if (!rect || rect.width > 72 || rect.height > 72) return false;
    const label = buttonText(button);
    if (label && label.length > 24) return false;
    return Boolean(button.querySelector?.("svg,path,rect,use,img,i,[class]"));
  }
  function hoverCopyCandidateButtons(anchor, options = {}) {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    const rootRect = hoverCopyRect(anchor);
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    const add = (button, base) => {
      if (!button || seen.has(button) || internalCopyScope(button) || closest(button, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
      seen.add(button);
      if (hoverCopyBadButton(button)) return;
      const rect = hoverCopyRect(button);
      if (!rect) return;
      let score = base;
      const copyish = isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button);
      if (!copyish && !hoverCopySmallIconButton(button)) return;
      if (rootRect) {
        if (rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) return;
        score += Math.abs(rect.top - rootRect.bottom) * 12 + Math.abs(rect.left - rootRect.left);
      }
      score += copyish ? 0 : 12e3;
      found.push({ button, score });
    };
    for (const button of userscriptFindCopyButtons(anchor, { ...options, expanded: true })) add(button, -2e4);
    let order = 0;
    for (const scope of userscriptCopyRoots(anchor, { expanded: true })) {
      for (const button of qsa(selector, scope, { all: true })) add(button, order++);
    }
    if (rootRect) {
      for (const button of qsa(selector, document, { all: true })) {
        const rect = hoverCopyRect(button);
        if (!rect || rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) continue;
        add(button, 5e4 + order++);
      }
    }
    return found.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }
  function hoverCopyAnchorRole(anchor, index) {
    const roleNode = closest(anchor, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || anchor?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const meta = normalize([
      classText(anchor),
      anchor?.getAttribute?.("data-testid"),
      anchor?.getAttribute?.("aria-label")
    ].filter(Boolean).join(" "));
    if (/assistant|answer|response|bot|ai|model|ds-assistant/i.test(meta)) return "assistant";
    if (/user|human|question|query|ds-user/i.test(meta)) return "user";
    return index % 2 === 0 ? "user" : "assistant";
  }
  function hoverCopyAddAnchor(list, node) {
    if (!node || node.nodeType !== 1 || list.includes(node) || closest(node, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
    const rect = hoverCopyRect(node);
    if (!rect || rect.width < 20 || rect.height < 8) return;
    const value = nodeTextForCopy(node);
    if (!value || value.length < 2 || value.length > 6e4) return;
    if (/^(?:copy|copied|edit|share|like|dislike|ask anything|message|send|search)$/i.test(value)) return;
    list.push(node);
  }
  function hoverCopyMessageAnchors(root = document.body) {
    const anchors = [];
    for (const assistant of qsa(".ds-assistant-message-main-content", root || document, { all: true })) {
      const box = closest(assistant, ".ds-message") || assistant;
      let prev = box?.previousElementSibling;
      for (let index = 0; prev && index < 5; prev = prev.previousElementSibling, index += 1) {
        if (nodeTextForCopy(prev)) {
          hoverCopyAddAnchor(anchors, prev);
          break;
        }
      }
      hoverCopyAddAnchor(anchors, assistant);
    }
    for (const selector of ["[data-message-author-role]", "article", "[data-testid*=message]", "[data-testid*=conversation]", "[class*=message]", "[class*=Message]", "[class*=response]", "[class*=Response]", "[class*=prose]", "main section", "main div"]) {
      for (const node of qsa(selector, root || document, { all: true })) hoverCopyAddAnchor(anchors, node);
      if (anchors.length > 120) break;
    }
    const textCache = /* @__PURE__ */ new Map();
    const cachedText = (node) => {
      if (!textCache.has(node)) textCache.set(node, nodeTextForCopy(node));
      return textCache.get(node) || "";
    };
    const specific = anchors.filter((node) => {
      const value = cachedText(node);
      if (!value) return false;
      return !anchors.some((other) => other !== node && node.contains?.(other) && cachedText(other).length >= Math.min(value.length * 0.55, 500) && hoverCopyRect(other));
    });
    return specific.sort((a, b) => {
      const ar = hoverCopyRect(a);
      const br = hoverCopyRect(b);
      return ar && br ? ar.top - br.top || ar.left - br.left : elementOrder(a, b);
    }).filter((node, index, list) => !list.slice(0, index).some((prev) => nativeCopyDedup(cachedText(prev), cachedText(node))));
  }
  async function extractHoverNativeCopyConversation(root = document.body) {
    const options = {
      copyButtonSelector: "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]",
      copyButtonPattern: "copy|copied|clipboard|复制|已复制|拷贝",
      copyButtonExcludePattern: "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交",
      copyButtonIconFallback: true,
      expanded: true,
      roleFallbackSequence: "userFirst",
      matchMode: "anyUseful",
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6500,
      copyPollMs: 40,
      copyCaptureGraceMs: 380
    };
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    let roleIndex = 0;
    for (const anchor of hoverCopyMessageAnchors(root).slice(0, 60)) {
      const role = hoverCopyAnchorRole(anchor, roleIndex);
      const expected = nodeTextForCopy(anchor);
      if (role !== "user" && role !== "assistant") continue;
      reveal(anchor);
      await sleep(180);
      for (const button of hoverCopyCandidateButtons(anchor, options).slice(0, 14)) {
        const copied = await copy(button, options);
        const value = userscriptCopyAccepted(copied, expected, role, options);
        if (value) {
          pushMessage(out, role, value, seen);
          roleIndex += 1;
          break;
        }
        userscriptCloseMenus();
        await sleep(80);
      }
      if (hasUserAndAssistant(out)) break;
    }
    const messages = merge(out);
    return hasUserAndAssistant(messages) ? messages : null;
  }
  async function extractNativeCopyConversation(root = document.body) {
    let buttons = conversationCopyButtons(root || document.body);
    if (buttons.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      if (hovered) return hovered;
      buttons = conversationCopyButtons(root || document.body);
    }
    if (buttons.length < 2) return null;
    const seenText = [];
    const items = [];
    const copyOptions = {
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6e3,
      copyPollMs: 40,
      copyCaptureGraceMs: 300
    };
    for (const button of buttons.slice(0, 16)) {
      try {
        button.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      reveal(button);
      const copied = cleanCaptured(await copy(button, copyOptions));
      if (!copyLooksUseful(copied) || seenText.some((item) => nativeCopyDedup(item, copied))) continue;
      seenText.push(copied);
      items.push({ role: copyButtonRole(button), text: copied });
    }
    if (items.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      return hovered || null;
    }
    let fallback = "user";
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of items) {
      let role = item.role;
      if (role !== "user" && role !== "assistant") role = fallback;
      fallback = role === "user" ? "assistant" : "user";
      pushMessage(out, role, item.text, seen);
    }
    const firstUser = out.findIndex((item) => item.role === "user");
    const messages = merge(firstUser > 0 ? out.slice(firstUser) : out);
    return hasUserAndAssistant(messages) ? messages : null;
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
  var CONTENT_CAPABILITY_BUNDLES = Object.freeze({
    base: Object.freeze([
      Object.freeze({ file: "content/preload.js", world: "MAIN" }),
      Object.freeze({ file: "content/content.js", world: "ISOLATED" })
    ]),
    send: Object.freeze([Object.freeze({ file: "content/send.js", world: "ISOLATED" })]),
    summary: Object.freeze([
      Object.freeze({ file: "content/summary-userscripts-main.js", world: "MAIN" }),
      Object.freeze({ file: "content/summary-userscripts.js", world: "ISOLATED" }),
      Object.freeze({ file: "content/summary-bridge.js", world: "ISOLATED" })
    ]),
    "preferred-model": Object.freeze([Object.freeze({ file: "content/preferred-model.js", world: "ISOLATED" })]),
    delete: Object.freeze([Object.freeze({ file: "content/delete.js", world: "ISOLATED" })]),
    "message-navigator": Object.freeze([Object.freeze({ file: "content/message-navigator.js", world: "ISOLATED" })])
  });
  var CONTENT_ANCILLARY_BUNDLES = Object.freeze({
    "grok-cookie": Object.freeze({
      file: "content/grok-cookie-bridge.js",
      world: "ISOLATED",
      hosts: Object.freeze(["grok.com"]),
      runAt: "document_start"
    })
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
    applyPreferredModel: command({ timeoutMs: 18e3, mutating: true, features: Object.freeze(["preferred-model"]) }),
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

  // content-src/capabilities/summary-runtime.js
  function createSummaryCapability(deps = {}) {
    const {
      requestBackground: requestBackground2,
      EXECUTE_SUMMARY_USERSCRIPT_REQUEST: EXECUTE_SUMMARY_USERSCRIPT_REQUEST2,
      contentDocumentId,
      runtimes,
      CONTENT_BRIDGE_VERSION: CONTENT_BRIDGE_VERSION2,
      merge: merge2,
      hasUserAndAssistant: hasUserAndAssistant2,
      pageSummaryRequest: pageSummaryRequest2,
      pageSummaryRuntimeState: pageSummaryRuntimeState2,
      sleep: sleep2,
      normalize: normalize2,
      qsa: qsa2,
      qs: qs2,
      closest: closest2,
      visible: visible2,
      text: text2,
      buttonText: buttonText2,
      reveal: reveal2,
      copy: copy2,
      copyFirst: copyFirst2,
      extractCopySequence: extractCopySequence2,
      extractNativeCopyConversation: extractNativeCopyConversation2,
      extractTurns: extractTurns2,
      userscriptFindCopyButtons: userscriptFindCopyButtons2,
      contentRuntimeBundleIdentityMatches: contentRuntimeBundleIdentityMatches2,
      SUMMARY_MAIN_RUNTIME_IDENTITY,
      SUMMARY_ISOLATED_RUNTIME_IDENTITY,
      CONTENT_RUNTIME_IDENTITY: CONTENT_RUNTIME_IDENTITY2
    } = deps;
    function shouldUseCustomSummaryUserscript(config, runner) {
      const customMode = config.builtIn === false || config.sourceMode === "custom" || config.userscriptOverride === true;
      return customMode && (!runner || customMode);
    }
    async function executeCustomSummaryUserscript(config = {}) {
      const response = await requestBackground2(EXECUTE_SUMMARY_USERSCRIPT_REQUEST2, {
        configId: String(config.id || "")
      });
      return response.data || { messages: [] };
    }
    function assertSummaryTargetCurrent(data = {}) {
      const expectedDocumentId = String(data?.expectedDocumentId || "");
      if (expectedDocumentId && expectedDocumentId !== contentDocumentId) {
        throw new Error("Summary target document changed before collection");
      }
      const expectedHref = String(data?.expectedHref || "");
      if (expectedHref && expectedHref !== String(location.href || "")) {
        throw new Error("Summary target URL changed during collection");
      }
    }
    function finishSummaryCollection(data, result) {
      assertSummaryTargetCurrent(data);
      return result;
    }
    async function collectSummary(data) {
      assertSummaryTargetCurrent(data);
      const config = data?.config || {};
      let registry = {};
      try {
        registry = runtimes.require("summary-runners", CONTENT_BRIDGE_VERSION2).scripts || {};
      } catch {
      }
      const packagedRunner = registry[config.id] || registry[config.userscriptFile];
      if (shouldUseCustomSummaryUserscript(config, packagedRunner)) {
        const customResult = await executeCustomSummaryUserscript(config);
        const customMessages = merge2(Array.isArray(customResult?.messages) ? customResult.messages : []);
        return finishSummaryCollection(data, {
          ...customResult,
          messages: hasUserAndAssistant2(customMessages) ? customMessages : [],
          rawMessageCount: Number(customResult?.rawMessageCount) || customMessages.length,
          hasUserAndAssistant: hasUserAndAssistant2(customMessages),
          runner: "user-scripts"
        });
      }
      if (config.userscriptRunMode !== "serial") {
        const pageResult = await pageSummaryRequest2(config);
        const pageMessages = merge2(Array.isArray(pageResult?.messages) ? pageResult.messages : []);
        if (hasUserAndAssistant2(pageMessages)) {
          return finishSummaryCollection(data, {
            messages: pageMessages,
            rawMessageCount: Number(pageResult.rawMessageCount) || pageMessages.length,
            hasUserAndAssistant: true,
            runner: "page-world"
          });
        }
      }
      const runner = packagedRunner;
      if (!runner) return finishSummaryCollection(data, { messages: [] });
      const api = {
        config,
        sleep: sleep2,
        normalize: normalize2,
        qsa: qsa2,
        qs: qs2,
        closest: closest2,
        visible: visible2,
        text: text2,
        buttonText: buttonText2,
        reveal: reveal2,
        merge: merge2,
        copy: copy2,
        copyFirst: copyFirst2,
        extractCopySequence: extractCopySequence2,
        extractNativeCopyConversation: extractNativeCopyConversation2,
        extractDeepSeekNativeCopyMessages: extractNativeCopyConversation2,
        extractGrokNativeCopyMessages: extractNativeCopyConversation2,
        extractTurns: extractTurns2,
        findCopyButtons: userscriptFindCopyButtons2
      };
      const result = await runner(api);
      const messages = merge2(Array.isArray(result) ? result : result?.messages || []);
      return finishSummaryCollection(data, {
        messages: hasUserAndAssistant2(messages) ? messages : [],
        rawMessageCount: messages.length,
        hasUserAndAssistant: hasUserAndAssistant2(messages)
      });
    }
    async function getSummaryRuntimeState() {
      const registration = runtimes.registration("summary-runners");
      const registry = registration?.api?.scripts;
      const isolatedVersion = String(registration?.version || "");
      const isolatedReady = Boolean(
        registry && typeof registry === "object" && Object.keys(registry).length && isolatedVersion === CONTENT_BRIDGE_VERSION2 && contentRuntimeBundleIdentityMatches2(registration?.api?.runtimeIdentity, SUMMARY_ISOLATED_RUNTIME_IDENTITY) && runtimes.isActive
      );
      const pageState = await pageSummaryRuntimeState2();
      const mainReady = Boolean(
        pageState?.ready && pageState.bridgeVersion === CONTENT_BRIDGE_VERSION2 && contentRuntimeBundleIdentityMatches2(pageState.runtimeIdentity, SUMMARY_MAIN_RUNTIME_IDENTITY)
      );
      return {
        ready: isolatedReady && mainReady,
        isolatedReady,
        mainReady,
        isolatedVersion,
        mainVersion: String(pageState?.bridgeVersion || ""),
        documentId: contentDocumentId,
        bridgeVersion: CONTENT_BRIDGE_VERSION2,
        runtimeIdentity: CONTENT_RUNTIME_IDENTITY2,
        isolatedRuntimeIdentity: registration?.api?.runtimeIdentity || null,
        mainRuntimeIdentity: pageState?.runtimeIdentity || null
      };
    }
    return Object.freeze({
      collectSummary,
      getSummaryRuntimeState
    });
  }

  // content-src/content-summary-bridge.js
  function installSummaryBridgeCapability() {
    const runtimes = runtimeRegistry(window);
    const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_BRIDGE_BUNDLE_IDENTITY);
    const mainRuntimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY);
    const isolatedRuntimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY);
    runtimes.registerBundle(runtimeIdentity);
    const { contentDocumentId } = createContentDocumentIdentity(window);
    const handlers = createSummaryCapability({
      buttonText,
      closest,
      copy,
      copyFirst,
      extractCopySequence,
      extractNativeCopyConversation,
      extractTurns,
      hasUserAndAssistant,
      merge,
      normalize,
      pageSummaryRequest,
      pageSummaryRuntimeState,
      qs,
      qsa,
      reveal,
      sleep,
      text,
      userscriptFindCopyButtons,
      visible,
      requestBackground,
      EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
      contentDocumentId,
      runtimes,
      CONTENT_BRIDGE_VERSION: CONTENT_PROTOCOL.CONTENT_BRIDGE_VERSION,
      contentRuntimeBundleIdentityMatches,
      SUMMARY_MAIN_RUNTIME_IDENTITY: mainRuntimeIdentity,
      SUMMARY_ISOLATED_RUNTIME_IDENTITY: isolatedRuntimeIdentity,
      CONTENT_RUNTIME_IDENTITY: runtimeIdentity
    });
    installContentCapability(runtimes, {
      capability: "summary",
      owner: "content-capability:summary",
      version: runtimeIdentity.bundle.implementationVersion,
      routerVersion: runtimeIdentity.implementationVersion,
      handlers
    });
  }
  installSummaryBridgeCapability();
})();
