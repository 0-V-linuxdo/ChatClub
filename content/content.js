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

  // shared/default-shortcuts.js
  var DEFAULT_SHORTCUT_CONFIG = {
    schemaVersion: 2,
    profiles: {
      mac: {
        sendKeyMode: "enter",
        shortcuts: {
          focusInput: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyK" },
          newChat: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyN" },
          newChatAll: { disabled: false, command: true, control: false, option: false, shift: true, code: "KeyN" },
          deleteThread: { disabled: false, command: false, control: false, option: true, shift: true, code: "KeyD" },
          optimizePrompt: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyO" },
          openSummaryPanel: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyS" },
          openPocketPanel: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyP" },
          toggleMessageNavigator: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyM" },
          closeChat: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyW" },
          refreshPage: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyR" },
          reloadChat: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyH" },
          enterFullscreen: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyF" },
          insertPrompt: { disabled: false, command: false, control: false, option: true, shift: false, codePattern: "Digit" },
          switchLayout: { disabled: false, command: true, control: false, option: false, shift: true, codePattern: "Digit" },
          switchPlatformTab: { disabled: false, command: true, control: false, option: false, shift: false, codePattern: "Digit" }
        }
      },
      windows: {
        sendKeyMode: "enter",
        shortcuts: {
          focusInput: { disabled: false, control: false, alt: true, shift: false, code: "KeyK" },
          newChat: { disabled: false, control: true, alt: false, shift: false, code: "KeyN" },
          newChatAll: { disabled: false, control: true, alt: false, shift: true, code: "KeyN" },
          deleteThread: { disabled: false, control: false, alt: true, shift: true, code: "KeyD" },
          optimizePrompt: { disabled: false, control: false, alt: true, shift: false, code: "KeyO" },
          openSummaryPanel: { disabled: false, control: false, alt: true, shift: false, code: "KeyS" },
          openPocketPanel: { disabled: false, control: true, alt: false, shift: false, code: "KeyP" },
          toggleMessageNavigator: { disabled: false, control: true, alt: false, shift: false, code: "KeyM" },
          closeChat: { disabled: false, control: false, alt: true, shift: false, code: "KeyW" },
          refreshPage: { disabled: false, control: true, alt: false, shift: false, code: "KeyR" },
          reloadChat: { disabled: false, control: true, alt: false, shift: false, code: "KeyH" },
          enterFullscreen: { disabled: false, control: false, alt: true, shift: false, code: "KeyF" },
          insertPrompt: { disabled: false, control: false, alt: true, shift: false, codePattern: "Digit" },
          switchLayout: { disabled: false, control: true, alt: false, shift: true, codePattern: "Digit" },
          switchPlatformTab: { disabled: false, control: true, alt: false, shift: false, codePattern: "Digit" }
        }
      }
    }
  };

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

  // chatclub-runtime-version:shared/content-runtime-version.generated.js
  var CONTENT_RUNTIME_PROTOCOL_VERSION = "2026.07.16.2";
  var CONTENT_RUNTIME_SOURCE_SHA256 = "56ae70c075c19ca583d76133e0edc0d694fecc58c3112f9e246a5812e8650b8f";
  var CONTENT_RUNTIME_BUILD_RECIPE_VERSION = "1+recipe.39e7dff3b817dd590d108ce155af13e47b28138e33c477502664105276787094";
  var CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "39e7dff3b817dd590d108ce155af13e47b28138e33c477502664105276787094";
  var CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "330f3a3515c38cb4bb3d34cf09d63dcb258c91cd538e9214385bdfb2d1ea9799";
  var CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "2026.07.16.2+implementation.330f3a3515c38cb4bb3d34cf09d63dcb258c91cd538e9214385bdfb2d1ea9799";
  var CONTENT_RUNTIME_CONTENT_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/content.js", "entryPath": "content-src/content.js", "sourceSha256": "fb07d06d0adeb220ca6618ce8787dbb9ffb84b10edb16fce94d3c03546608202", "implementationSha256": "ec86fbd2404c15f4f11c55f36f1a2433c35611696d1405ed44325c5663b7b372", "implementationVersion": "2026.07.16.2+bundle.ec86fbd2404c15f4f11c55f36f1a2433c35611696d1405ed44325c5663b7b372" });

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

  // shared/shortcuts.js
  var SHORTCUT_CONFIG_SCHEMA_VERSION = 2;
  var KEYBOARD_PLATFORM_MAC = "mac";
  var KEYBOARD_PLATFORM_WINDOWS = "windows";
  var ALL_SHORTCUT_ACTIONS = [
    "focusInput",
    "newChat",
    "newChatAll",
    "deleteThread",
    "optimizePrompt",
    "openSummaryPanel",
    "openPocketPanel",
    "toggleMessageNavigator",
    "closeChat",
    "refreshPage",
    "reloadChat",
    "enterFullscreen",
    "insertPrompt",
    "switchLayout",
    "switchPlatformTab"
  ];
  var PATTERN_ACTIONS = ["insertPrompt", "switchLayout", "switchPlatformTab"];
  var LEGACY_KAGI_CONFLICT_DELETE_THREAD_SHORTCUT = Object.freeze({
    alt: false,
    shift: true,
    cmdOrCtrl: true,
    code: "Backspace"
  });
  var LEGACY_DEFAULT_NEW_CHAT_SHORTCUT = Object.freeze({
    alt: true,
    shift: false,
    cmdOrCtrl: false,
    code: "KeyN"
  });
  var LEGACY_DEFAULT_RELOAD_CHAT_SHORTCUTS = Object.freeze([
    Object.freeze({ alt: true, shift: false, cmdOrCtrl: false, code: "KeyR" }),
    Object.freeze({ alt: false, shift: false, cmdOrCtrl: true, code: "KeyR" }),
    Object.freeze({ alt: false, shift: true, cmdOrCtrl: true, code: "KeyR" })
  ]);
  function bool(value, fallback = false) {
    return value == null ? fallback : Boolean(value);
  }
  function normalizeKeyboardPlatform(platform) {
    return String(platform || "").toLowerCase() === KEYBOARD_PLATFORM_MAC ? KEYBOARD_PLATFORM_MAC : KEYBOARD_PLATFORM_WINDOWS;
  }
  function detectKeyboardPlatform(navigatorLike = globalThis.navigator) {
    const platform = [
      navigatorLike?.userAgentData?.platform,
      navigatorLike?.platform,
      navigatorLike?.userAgent
    ].filter(Boolean).join(" ");
    return /Mac|iPhone|iPad|iPod/i.test(platform) ? KEYBOARD_PLATFORM_MAC : KEYBOARD_PLATFORM_WINDOWS;
  }
  function defaultProfile(platform) {
    return DEFAULT_SHORTCUT_CONFIG.profiles[normalizeKeyboardPlatform(platform)] || {};
  }
  function defaultShortcut(action, platform) {
    return defaultProfile(platform).shortcuts?.[action] || {};
  }
  function shortcutSameFixedShape(shortcut, expected) {
    if (!shortcut || !expected) return false;
    return Boolean(shortcut.disabled) === Boolean(expected.disabled) && Boolean(shortcut.cmdOrCtrl) === Boolean(expected.cmdOrCtrl) && Boolean(shortcut.alt) === Boolean(expected.alt) && Boolean(shortcut.shift) === Boolean(expected.shift) && String(shortcut.code || "") === String(expected.code || "");
  }
  function normalizeFixedShortcut(action, raw, platform) {
    const normalizedPlatform = normalizeKeyboardPlatform(platform);
    const base = defaultShortcut(action, normalizedPlatform);
    const source = raw || {};
    const modifiers = normalizedPlatform === KEYBOARD_PLATFORM_MAC ? {
      command: bool(source.command, Boolean(base.command)),
      control: bool(source.control, Boolean(base.control)),
      option: bool(source.option, Boolean(base.option)),
      shift: bool(source.shift, Boolean(base.shift))
    } : {
      control: bool(source.control, Boolean(base.control)),
      alt: bool(source.alt, Boolean(base.alt)),
      shift: bool(source.shift, Boolean(base.shift))
    };
    return {
      disabled: Boolean(source.disabled),
      ...modifiers,
      code: String(source.code || base.code || "")
    };
  }
  function normalizePatternShortcut(action, raw, platform) {
    const normalizedPlatform = normalizeKeyboardPlatform(platform);
    const base = defaultShortcut(action, normalizedPlatform);
    const source = raw || {};
    const modifiers = normalizedPlatform === KEYBOARD_PLATFORM_MAC ? {
      command: bool(source.command, Boolean(base.command)),
      control: bool(source.control, Boolean(base.control)),
      option: bool(source.option, Boolean(base.option)),
      shift: bool(source.shift, Boolean(base.shift))
    } : {
      control: bool(source.control, Boolean(base.control)),
      alt: bool(source.alt, Boolean(base.alt)),
      shift: bool(source.shift, Boolean(base.shift))
    };
    return {
      disabled: Boolean(source.disabled),
      ...modifiers,
      codePattern: "Digit"
    };
  }
  function normalizeShortcutProfile(raw, platform) {
    const source = raw && typeof raw === "object" ? raw : {};
    const rawShortcuts = { ...source.shortcuts || {} };
    if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) {
      rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
    }
    const shortcuts = {};
    for (const action of ALL_SHORTCUT_ACTIONS) {
      shortcuts[action] = PATTERN_ACTIONS.includes(action) ? normalizePatternShortcut(action, rawShortcuts[action], platform) : normalizeFixedShortcut(action, rawShortcuts[action], platform);
    }
    return {
      sendKeyMode: source.sendKeyMode === "mod-enter" ? "mod-enter" : "enter",
      shortcuts
    };
  }
  function legacyDefaultShortcut(action) {
    const mac = defaultShortcut(action, KEYBOARD_PLATFORM_MAC);
    return {
      alt: Boolean(mac.option),
      shift: Boolean(mac.shift),
      cmdOrCtrl: Boolean(mac.command),
      ...mac.codePattern ? { codePattern: "Digit" } : { code: String(mac.code || "") }
    };
  }
  function migrateLegacyShortcutConfig(source) {
    const rawShortcuts = { ...source.shortcuts || {} };
    if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) {
      rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
    }
    if (source.deleteThreadShortcutMigrated !== true && shortcutSameFixedShape(rawShortcuts.deleteThread, LEGACY_KAGI_CONFLICT_DELETE_THREAD_SHORTCUT)) {
      rawShortcuts.deleteThread = legacyDefaultShortcut("deleteThread");
    }
    if (source.newChatShortcutMigrated !== true && shortcutSameFixedShape(rawShortcuts.newChat, LEGACY_DEFAULT_NEW_CHAT_SHORTCUT)) {
      rawShortcuts.newChat = legacyDefaultShortcut("newChat");
    }
    if (source.homeShortcutMigrated !== true && LEGACY_DEFAULT_RELOAD_CHAT_SHORTCUTS.some((shortcut) => shortcutSameFixedShape(rawShortcuts.reloadChat, shortcut))) {
      rawShortcuts.reloadChat = legacyDefaultShortcut("reloadChat");
    }
    const sendKeyMode = source.sendKeyMode === "mod-enter" ? "mod-enter" : "enter";
    const profiles = {};
    for (const platform of [KEYBOARD_PLATFORM_MAC, KEYBOARD_PLATFORM_WINDOWS]) {
      const shortcuts = {};
      for (const action of ALL_SHORTCUT_ACTIONS) {
        const base = legacyDefaultShortcut(action);
        const item = rawShortcuts[action] || {};
        const common = {
          disabled: Boolean(item.disabled),
          shift: bool(item.shift, Boolean(base.shift))
        };
        const modifiers = platform === KEYBOARD_PLATFORM_MAC ? {
          command: bool(item.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
          control: false,
          option: bool(item.alt, Boolean(base.alt))
        } : {
          control: bool(item.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
          alt: bool(item.alt, Boolean(base.alt))
        };
        shortcuts[action] = shortcutUsesDigitPattern(action, item) ? { ...common, ...modifiers, codePattern: "Digit" } : { ...common, ...modifiers, code: String(item.code || base.code || "") };
      }
      profiles[platform] = normalizeShortcutProfile({ sendKeyMode, shortcuts }, platform);
    }
    return { schemaVersion: SHORTCUT_CONFIG_SCHEMA_VERSION, profiles };
  }
  function normalizeShortcutConfig(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (source.schemaVersion !== SHORTCUT_CONFIG_SCHEMA_VERSION || !source.profiles) {
      return migrateLegacyShortcutConfig(source);
    }
    return {
      schemaVersion: SHORTCUT_CONFIG_SCHEMA_VERSION,
      profiles: {
        mac: normalizeShortcutProfile(source.profiles.mac, KEYBOARD_PLATFORM_MAC),
        windows: normalizeShortcutProfile(source.profiles.windows, KEYBOARD_PLATFORM_WINDOWS)
      }
    };
  }
  function shortcutProfile(shortcutConfig, platform = detectKeyboardPlatform()) {
    return normalizeShortcutConfig(shortcutConfig).profiles[normalizeKeyboardPlatform(platform)];
  }
  function shortcutUsesDigitPattern(action, shortcut) {
    return PATTERN_ACTIONS.includes(action) || shortcut?.codePattern === "Digit";
  }
  function digitMatch(code) {
    return /^Digit([1-9])$/.exec(code || "") || /^Numpad([1-9])$/.exec(code || "");
  }
  function matchSingleShortcut(event, action, shortcut, platform) {
    if (!shortcut || shortcut.disabled) return null;
    const normalizedPlatform = normalizeKeyboardPlatform(platform);
    if (normalizedPlatform === KEYBOARD_PLATFORM_MAC) {
      if (Boolean(shortcut.command) !== Boolean(event.metaKey)) return null;
      if (Boolean(shortcut.control) !== Boolean(event.ctrlKey)) return null;
      if (Boolean(shortcut.option) !== Boolean(event.altKey)) return null;
    } else {
      if (event.metaKey) return null;
      if (Boolean(shortcut.control) !== Boolean(event.ctrlKey)) return null;
      if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return null;
    }
    if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return null;
    if (shortcutUsesDigitPattern(action, shortcut)) {
      const match = digitMatch(event.code);
      return match ? { digit: match[1] } : null;
    }
    return shortcut.code && event.code === shortcut.code ? {} : null;
  }
  function matchShortcut(event, shortcutConfig, platform = detectKeyboardPlatform()) {
    const normalizedPlatform = normalizeKeyboardPlatform(platform);
    const profile = shortcutProfile(shortcutConfig, normalizedPlatform);
    for (const action of ALL_SHORTCUT_ACTIONS) {
      const matchObj = matchSingleShortcut(event, action, profile.shortcuts[action], normalizedPlatform);
      if (matchObj) return { action, matchObj };
    }
    return null;
  }

  // content-src/shared/summary-runtime.js
  var normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  function qsa(selector, root = document, options = {}) {
    try {
      const result = Array.from(root.querySelectorAll(selector));
      return options.all === false ? result.slice(0, 1) : result;
    } catch {
      return [];
    }
  }
  function pageLogoUrl() {
    const candidates = qsa("link[rel][href]", document).map((link, index) => {
      const rel = normalize(link.getAttribute?.("rel") || "").toLowerCase();
      if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
      const href = link.getAttribute?.("href") || "";
      let url = "";
      try {
        url = href ? new URL(href, location.href).href : "";
      } catch {
        return null;
      }
      if (!/^https?:\/\//i.test(url)) return null;
      const sizes = normalize(link.getAttribute?.("sizes") || "");
      const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
      const type = normalize(link.getAttribute?.("type") || "").toLowerCase();
      const relScore = rel.includes("apple-touch-icon") ? 4 : rel.includes("mask-icon") ? 5 : rel.includes("icon") ? 0 : 3;
      const typeScore = type.includes("png") || type.includes("x-icon") || type.includes("icon") ? 0 : 1;
      return { url, score: relScore * 100 + sizeScore * 10 + typeScore, index };
    }).filter(Boolean).sort((a, b) => a.score - b.score || a.index - b.index);
    return candidates[0]?.url || "";
  }
  function pageMeta() {
    return {
      href: location.href,
      title: normalize(document.title || ""),
      logoUrl: pageLogoUrl()
    };
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

  // content-src/shared/submission-navigation.js
  function createSubmissionNavigationTracker(target = globalThis, now = () => Date.now()) {
    let activeSubmissionNavigation = null;
    const normalize2 = (value = {}) => {
      const sendId = String(value?.sendId || "").trim();
      if (!sendId) return null;
      const activatedAt = Math.max(0, Number(value?.activatedAt) || now());
      return {
        sendId,
        appId: String(value?.appId || "").trim(),
        initialHref: String(value?.initialHref || target.location?.href || ""),
        activatedAt,
        expiresAt: Math.max(activatedAt + 15e3, Number(value?.expiresAt) || 0),
        method: String(value?.method || "submit")
      };
    };
    const mark = (data = {}, method = "submit") => {
      const activatedAt = now();
      const deadlineAt = Math.max(0, Number(data?.deadlineAt) || 0);
      const next = normalize2({
        sendId: data?.sendId,
        appId: data?.appId || data?.appName,
        initialHref: target.location?.href || "",
        activatedAt,
        expiresAt: Math.max(
          activatedAt + 15e3,
          deadlineAt > activatedAt ? deadlineAt + 15e3 : 0
        ),
        method
      });
      if (!next) return null;
      activeSubmissionNavigation = next;
      target.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__ = next;
      return next;
    };
    const clear = () => {
      activeSubmissionNavigation = null;
      delete target.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__;
    };
    const current = (kind = "") => {
      const navigationKind = String(kind || "navigation");
      if (navigationKind === "popstate" || navigationKind === "hashchange") return null;
      const candidate = activeSubmissionNavigation || normalize2(target.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__ || {});
      if (!candidate || candidate.expiresAt < now()) {
        clear();
        return null;
      }
      activeSubmissionNavigation = candidate;
      return candidate;
    };
    const intentTarget = (value) => {
      const element = value?.nodeType === 1 ? value : value?.parentElement;
      if (!element?.closest) return null;
      const direct = element.closest("a[href], [role='link'], [role='tab']");
      if (direct) return direct;
      const control = element.closest("button, [role='button'], [role='menuitem']");
      if (!control) return null;
      const signal = [
        control.getAttribute?.("aria-label"),
        control.getAttribute?.("title"),
        control.getAttribute?.("data-testid"),
        control.getAttribute?.("data-action"),
        control.innerText || control.textContent || ""
      ].filter(Boolean).join(" ");
      return /\b(?:new\s+chat|new\s+conversation|conversation|thread|history|sidebar)\b|新建(?:聊天|对话|会话)|聊天记录|对话|会话|历史/i.test(signal) ? control : null;
    };
    const clearForTrustedIntent = (event) => {
      if (!event?.isTrusted || !current("trusted-intent")) return;
      const targetElement = intentTarget(event.target);
      const key = String(event.key || "");
      const keyboardNavigation = event.type === "keydown" && (event.altKey && (key === "ArrowLeft" || key === "ArrowRight") || (event.metaKey || event.ctrlKey) && (key === "[" || key === "]") || (key === "Enter" || key === " ") && targetElement);
      if (event.type === "pointerdown" ? targetElement : keyboardNavigation) clear();
    };
    return Object.freeze({
      mark,
      clear,
      current,
      clearForTrustedIntent
    });
  }

  // content-src/shared/runtime-registry.js
  var BROKER_KIND = "ChatClubContentRuntimeBroker";
  var BROKER_VERSION = 1;
  function validName(name) {
    const value = String(name || "").trim();
    if (!value) throw new TypeError("Runtime name is required");
    return value;
  }
  function validGeneration(version) {
    const value = String(version || "").trim();
    if (!value) throw new TypeError("Content runtime generation is required");
    return value;
  }
  function legacyRegistries(target) {
    const registries = [];
    let keys = [];
    try {
      keys = Object.getOwnPropertyNames(target);
    } catch {
    }
    for (const key of keys) {
      if (key === RUNTIME_REGISTRY_KEY || !/^__CHATCLUB_RUNTIME_REGISTRY_V\d+(?:_SOURCE_[a-f0-9]{64})?__$/i.test(key)) continue;
      let registry = null;
      try {
        registry = target[key];
      } catch {
      }
      if (!registry || typeof registry.dispose !== "function" && typeof registry.shutdown !== "function") continue;
      registries.push(Object.freeze({ key, registry }));
    }
    return registries;
  }
  function migrationStage(target) {
    let stage = null;
    let descriptor = null;
    try {
      stage = target[RUNTIME_MIGRATION_STAGE_KEY];
      descriptor = Object.getOwnPropertyDescriptor(target, RUNTIME_MIGRATION_STAGE_KEY);
    } catch {
    }
    if (!stage || typeof stage !== "object" || descriptor?.value !== stage || descriptor.writable || stage.registryKey !== RUNTIME_REGISTRY_KEY || stage.generation !== CONTENT_RUNTIME_IMPLEMENTATION_VERSION) return null;
    return stage;
  }
  function createBroker({ legacy = [] } = {}) {
    const generations = /* @__PURE__ */ new Map();
    const retiredGenerations = /* @__PURE__ */ new Map();
    let stagedLegacyRegistries = [...legacy];
    let activeGenerationVersion = "";
    let brokerShutdownReason = "";
    function assertBrokerRunning() {
      if (brokerShutdownReason) {
        throw new Error(`Content runtime broker is shut down: ${brokerShutdownReason}`);
      }
    }
    function disposeStagedLegacy(reason) {
      const staged = stagedLegacyRegistries;
      stagedLegacyRegistries = [];
      for (const { registry } of staged) {
        try {
          if (typeof registry.dispose === "function") registry.dispose(reason);
          else registry.shutdown(reason);
        } catch {
        }
      }
    }
    function completeLegacyMigration(generation) {
      disposeStagedLegacy(`migrated to content runtime generation ${generation} through ${RUNTIME_REGISTRY_KEY}`);
    }
    function generationRecord(version, { create = false } = {}) {
      const generation = validGeneration(version);
      const retiredState = retiredGenerations.get(generation);
      if (retiredState) {
        throw new Error(`Content runtime generation ${generation} is ${retiredState}`);
      }
      let record = generations.get(generation) || null;
      if (!record && create) {
        record = {
          version: generation,
          state: "pending",
          entries: /* @__PURE__ */ new Map(),
          bundles: /* @__PURE__ */ new Map(),
          facade: null
        };
        record.facade = createGenerationFacade(record);
        generations.set(generation, record);
      }
      return record;
    }
    function assertUsable(record) {
      if (record.state === "aborted" || record.state === "superseded") {
        throw new Error(`Content runtime generation ${record.version} is ${record.state}`);
      }
    }
    function disposeEntry(record, key, reason) {
      const entry = record.entries.get(key);
      if (!entry) return false;
      record.entries.delete(key);
      try {
        entry.dispose?.(String(reason || "invalidated"));
      } catch {
      }
      return true;
    }
    function disposeRecord(record, state, reason) {
      record.state = state;
      for (const key of [...record.entries.keys()]) disposeEntry(record, key, reason);
      record.bundles.clear();
      generations.delete(record.version);
      retiredGenerations.set(record.version, state);
    }
    function activateEntry(entry) {
      if (entry.activated) return;
      entry.activate?.();
      entry.activated = true;
    }
    function descriptorEntry(key, version, descriptor) {
      if (!descriptor || typeof descriptor !== "object" || !("api" in descriptor)) {
        throw new TypeError(`Runtime ${key} requires an api descriptor`);
      }
      return {
        version,
        api: descriptor.api,
        activate: typeof descriptor.activate === "function" ? descriptor.activate : null,
        dispose: typeof descriptor.dispose === "function" ? descriptor.dispose : null,
        activated: false
      };
    }
    function bundleClaim(identity, generation = "") {
      const source = identity?.bundle && typeof identity.bundle === "object" ? identity.bundle : identity;
      const claim = Object.freeze({
        outputPath: String(source?.outputPath || ""),
        entryPath: String(source?.entryPath || ""),
        sourceSha256: String(source?.sourceSha256 || ""),
        implementationSha256: String(source?.implementationSha256 || ""),
        implementationVersion: String(source?.implementationVersion || "")
      });
      if (!claim.outputPath || !claim.entryPath || !/^[a-f0-9]{64}$/i.test(claim.sourceSha256) || !/^[a-f0-9]{64}$/i.test(claim.implementationSha256) || !claim.implementationVersion) throw new TypeError("Content runtime bundle identity is incomplete");
      const declaredGeneration = String(identity?.implementationVersion || "");
      if (generation && declaredGeneration && declaredGeneration !== generation) {
        throw new Error(`Content runtime bundle ${claim.outputPath} belongs to generation ${declaredGeneration}, expected ${generation}`);
      }
      return claim;
    }
    function registerEntry(record, key, entry) {
      assertUsable(record);
      const previous = record.entries.get(key);
      if (previous?.version === entry.version) return previous.api;
      if (record.state === "active") {
        try {
          activateEntry(entry);
        } catch (error) {
          try {
            entry.dispose?.(`activation failed: ${error?.message || String(error)}`);
          } catch {
          }
          throw error;
        }
      }
      record.entries.set(key, entry);
      if (previous) {
        try {
          previous.dispose?.(`replaced by ${entry.version}`);
        } catch {
        }
      }
      return entry.api;
    }
    function createGenerationFacade(record) {
      return Object.freeze({
        abiVersion: RUNTIME_REGISTRY_ABI_VERSION,
        generationVersion: record.version,
        get state() {
          return record.state;
        },
        get isActive() {
          return record.state === "active";
        },
        registerBundle(identity) {
          assertUsable(record);
          const claim = bundleClaim(identity, record.version);
          const previous = record.bundles.get(claim.outputPath);
          if (previous) {
            if (JSON.stringify(previous) !== JSON.stringify(claim)) {
              throw new Error(`Content runtime bundle ${claim.outputPath} was registered with conflicting identities`);
            }
            return previous;
          }
          record.bundles.set(claim.outputPath, claim);
          return claim;
        },
        bundleRegistration(outputPath) {
          assertUsable(record);
          return record.bundles.get(String(outputPath || "")) || null;
        },
        register(name, descriptor = {}) {
          const key = validName(name);
          const version = String(descriptor.version || "");
          if (!version) throw new TypeError(`Runtime ${key} requires a version`);
          if (!("api" in descriptor)) throw new TypeError(`Runtime ${key} requires an api`);
          return registerEntry(record, key, descriptorEntry(key, version, descriptor));
        },
        install(name, version, factory) {
          const key = validName(name);
          const expectedVersion = String(version || "");
          if (!expectedVersion) throw new TypeError(`Runtime ${key} requires a version`);
          assertUsable(record);
          const previous = record.entries.get(key);
          if (previous?.version === expectedVersion) return previous.api;
          if (typeof factory !== "function") throw new TypeError(`Runtime ${key} requires an installer`);
          const descriptor = factory();
          const entry = descriptorEntry(key, expectedVersion, descriptor);
          return registerEntry(record, key, entry);
        },
        require(name, version) {
          assertUsable(record);
          const key = validName(name);
          const entry = record.entries.get(key);
          if (!entry) throw new Error(`Runtime ${key} is not registered in generation ${record.version}`);
          if (version != null && entry.version !== String(version)) {
            throw new Error(`Runtime ${key} version ${entry.version} does not satisfy ${String(version)}`);
          }
          return entry.api;
        },
        registration(name) {
          assertUsable(record);
          const entry = record.entries.get(validName(name));
          return entry ? Object.freeze({ version: entry.version, api: entry.api }) : null;
        },
        invalidate(name, reason = "invalidated") {
          assertUsable(record);
          return disposeEntry(record, validName(name), reason);
        },
        dispose(reason = "generation registry disposed") {
          assertUsable(record);
          for (const key of [...record.entries.keys()]) disposeEntry(record, key, reason);
        },
        beginGeneration(version) {
          return broker.beginGeneration(version);
        },
        activateGeneration(version) {
          return broker.activateGeneration(version);
        },
        prepareGeneration(version, expectedBundles) {
          return broker.prepareGeneration(version, expectedBundles);
        },
        commitGeneration(version) {
          return broker.commitGeneration(version);
        },
        abortGeneration(version, reason) {
          return broker.abortGeneration(version, reason);
        },
        shutdown(reason) {
          return broker.shutdown(reason);
        }
      });
    }
    const broker = Object.freeze({
      kind: BROKER_KIND,
      brokerVersion: BROKER_VERSION,
      abiVersion: RUNTIME_REGISTRY_ABI_VERSION,
      get closed() {
        return Boolean(brokerShutdownReason);
      },
      get activeGenerationVersion() {
        return activeGenerationVersion;
      },
      beginGeneration(version) {
        assertBrokerRunning();
        const generation = validGeneration(version);
        const retiredState = retiredGenerations.get(generation);
        if (retiredState) throw new Error(`Content runtime generation ${generation} is ${retiredState}`);
        const active = activeGenerationVersion ? generations.get(activeGenerationVersion) : null;
        if (active?.version === generation) return active.facade;
        const existing = generations.get(generation);
        if (existing) {
          assertUsable(existing);
          return existing.facade;
        }
        return generationRecord(generation, { create: true }).facade;
      },
      activateGeneration(version) {
        this.prepareGeneration(version);
        return this.commitGeneration(version);
      },
      prepareGeneration(version, expectedBundles = []) {
        assertBrokerRunning();
        const generation = validGeneration(version);
        const next = generations.get(generation);
        if (!next) throw new Error(`Content runtime generation ${generation} was not begun`);
        assertUsable(next);
        const expected = Array.isArray(expectedBundles) ? expectedBundles.map((identity) => bundleClaim(identity)) : [];
        for (const claim of expected) {
          const registered = next.bundles.get(claim.outputPath);
          if (!registered || JSON.stringify(registered) !== JSON.stringify(claim)) {
            throw new Error(`Content runtime bundle ${claim.outputPath} is missing or has the wrong identity`);
          }
        }
        if (next.state === "active" || next.state === "prepared") return next.facade;
        if (next.state !== "pending") {
          throw new Error(`Content runtime generation ${generation} cannot prepare from ${next.state}`);
        }
        next.state = "prepared";
        return next.facade;
      },
      commitGeneration(version) {
        assertBrokerRunning();
        const generation = validGeneration(version);
        const next = generations.get(generation);
        if (!next) throw new Error(`Content runtime generation ${generation} was not begun`);
        assertUsable(next);
        if (next.state === "active") return next.facade;
        if (next.state !== "prepared") {
          throw new Error(`Content runtime generation ${generation} cannot commit from ${next.state}`);
        }
        try {
          for (const entry of next.entries.values()) activateEntry(entry);
        } catch (error) {
          const reason = `activation failed closed: ${error?.message || String(error)}`;
          activeGenerationVersion = "";
          for (const record of [...generations.values()]) disposeRecord(record, "aborted", reason);
          disposeStagedLegacy(reason);
          throw error;
        }
        const previous = activeGenerationVersion ? generations.get(activeGenerationVersion) : null;
        next.state = "active";
        activeGenerationVersion = generation;
        if (previous && previous !== next) {
          disposeRecord(previous, "superseded", `superseded by content runtime generation ${generation}`);
        }
        for (const candidate of [...generations.values()]) {
          if (candidate !== next && ["pending", "prepared"].includes(candidate.state)) {
            disposeRecord(candidate, "aborted", `superseded by content runtime generation ${generation}`);
          }
        }
        completeLegacyMigration(generation);
        return next.facade;
      },
      abortGeneration(version, reason = "generation installation aborted") {
        assertBrokerRunning();
        const generation = validGeneration(version);
        const record = generations.get(generation);
        if (!record) return false;
        if (record.state === "active") {
          throw new Error(`Active content runtime generation ${generation} cannot be aborted`);
        }
        assertUsable(record);
        disposeRecord(record, "aborted", reason);
        return true;
      },
      shutdown(reason = "content runtime generation activation failed closed") {
        const detail = String(reason || "content runtime generation activation failed closed");
        if (brokerShutdownReason) return 0;
        brokerShutdownReason = detail;
        const records = [...generations.values()];
        activeGenerationVersion = "";
        for (const record of records) {
          disposeRecord(record, "aborted", detail);
        }
        disposeStagedLegacy(detail);
        return records.length;
      },
      dispose(reason = "content runtime broker disposed") {
        return broker.shutdown(reason);
      },
      acquireGeneration(version) {
        assertBrokerRunning();
        const generation = validGeneration(version);
        const retiredState = retiredGenerations.get(generation);
        if (retiredState) throw new Error(`Content runtime generation ${generation} is ${retiredState}`);
        const existing = generations.get(generation);
        if (existing) {
          assertUsable(existing);
          return existing.facade;
        }
        const facade = broker.beginGeneration(generation);
        return broker.activateGeneration(generation) || facade;
      }
    });
    return broker;
  }
  function isRuntimeBroker(value) {
    return Boolean(
      value && value.kind === BROKER_KIND && value.brokerVersion === BROKER_VERSION && value.abiVersion === RUNTIME_REGISTRY_ABI_VERSION && typeof value.acquireGeneration === "function" && typeof value.beginGeneration === "function" && typeof value.prepareGeneration === "function" && typeof value.commitGeneration === "function" && typeof value.activateGeneration === "function" && typeof value.abortGeneration === "function" && typeof value.shutdown === "function"
    );
  }
  function runtimeRegistry(target = globalThis) {
    let broker = target[RUNTIME_REGISTRY_KEY];
    if (broker != null && !isRuntimeBroker(broker)) {
      throw new Error(
        `Runtime broker key ${RUNTIME_REGISTRY_KEY} is occupied by ABI ${String(broker?.abiVersion ?? "unknown")}; incrementing RUNTIME_REGISTRY_ABI_VERSION must also produce a new broker key`
      );
    }
    if (!broker) {
      const legacy = legacyRegistries(target);
      broker = createBroker({ legacy });
      Object.defineProperty(target, RUNTIME_REGISTRY_KEY, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: broker
      });
    }
    const stage = migrationStage(target);
    if (stage) {
      try {
        delete target[RUNTIME_MIGRATION_STAGE_KEY];
      } catch {
      }
      return broker.beginGeneration(CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
    }
    return broker.acquireGeneration(CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
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
      hosts: ["grok.com"],
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

  // content-src/shared/secure-frame-rpc.js
  function installSecureFrameRpc(options = {}) {
    const extensionApi = options.extensionApi;
    const runtimes = options.runtimes;
    const version = String(options.version || "");
    const source = String(options.source || "");
    const bridgeDocumentId = String(options.bridgeDocumentId || "");
    const secureFrameToken = String(options.secureFrameToken || "");
    const dispatch = options.dispatch;
    if (!runtimes?.install || !version || !source || !bridgeDocumentId || !secureFrameToken || typeof dispatch !== "function") {
      throw new TypeError("Secure Frame RPC installation is incomplete");
    }
    return runtimes.install("frame-rpc", version, () => {
      const listener = (message, sender, sendResponse) => {
        if (message?.source !== source || message.type !== "request" || message.bridgeDocumentId !== bridgeDocumentId || message.secureFrameToken !== secureFrameToken || sender?.id !== extensionApi?.runtime?.id) return false;
        Promise.resolve(dispatch(message.action, message.data || {})).then((data) => sendResponse({ success: true, data })).catch((error) => sendResponse({
          success: false,
          error: error?.message || String(error),
          ...error?.code === "CAPABILITY_UNAVAILABLE" ? {
            code: "CAPABILITY_UNAVAILABLE",
            capability: String(error.capability || ""),
            delivered: false
          } : { delivered: true }
        }));
        return true;
      };
      return {
        api: Object.freeze({ listener, bridgeDocumentId }),
        activate() {
          extensionApi?.runtime?.onMessage?.addListener?.(listener);
        },
        dispose() {
          try {
            extensionApi?.runtime?.onMessage?.removeListener?.(listener);
          } catch {
          }
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

  // content-src/content.js
  function installContentBridge() {
    const PROTOCOL = CONTENT_PROTOCOL;
    const runtimes = runtimeRegistry(window);
    const CONTENT_RUNTIME_IDENTITY2 = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_CONTENT_BUNDLE_IDENTITY);
    runtimes.registerBundle(CONTENT_RUNTIME_IDENTITY2);
    const commandRouter = contentCommandRouter(runtimes, CONTENT_RUNTIME_IDENTITY2.implementationVersion);
    const EXTENSION_API = globalThis.browser || globalThis.chrome;
    const EXTENSION_ORIGIN = (() => {
      try {
        return String(EXTENSION_API?.runtime?.getURL?.("") || "").match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i)?.[0] || "";
      } catch {
        return "";
      }
    })();
    const SOURCE = PROTOCOL.GENERIC_POST_MESSAGE_SOURCE;
    const MAIN_WORLD_LOCATION_SOURCE2 = PROTOCOL.MAIN_WORLD_LOCATION_SOURCE;
    const NOTION_SEND_ACTIVATED_EVENT2 = PROTOCOL.NOTION_SEND_ACTIVATED_EVENT;
    const GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE = "data-chatclub-gemini-model-picker-run";
    const CONTENT_BRIDGE_VERSION2 = PROTOCOL.CONTENT_BRIDGE_VERSION;
    const CONTENT_RUNTIME_VERSION = CONTENT_RUNTIME_IDENTITY2.implementationVersion;
    const FRAME_BINDING_POST_MESSAGE_SOURCE2 = PROTOCOL.FRAME_BINDING_POST_MESSAGE_SOURCE;
    const SEND_TEXT_POST_MESSAGE_SOURCE2 = PROTOCOL.SEND_TEXT_POST_MESSAGE_SOURCE;
    const DELETE_THREAD_POST_MESSAGE_SOURCE2 = PROTOCOL.DELETE_THREAD_POST_MESSAGE_SOURCE;
    const PREFERRED_MODEL_POST_MESSAGE_SOURCE2 = PROTOCOL.PREFERRED_MODEL_POST_MESSAGE_SOURCE;
    const SECURE_FRAME_COMMAND_SOURCE2 = PROTOCOL.SECURE_FRAME_COMMAND_SOURCE;
    const MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE2 = PROTOCOL.MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE;
    const SUMMARY_POST_MESSAGE_SOURCE2 = PROTOCOL.SUMMARY_POST_MESSAGE_SOURCE;
    const { contentDocumentId, secureFrameToken, currentBrowserDocumentAttestationId, currentFrameBindingId } = createContentDocumentIdentity(window);
    let contentLocationRevision = Math.max(0, Number(window.__CHATCLUB_CONTENT_LOCATION_REVISION__) || 0);
    const submissionNavigation = createSubmissionNavigationTracker(window);
    const markSubmissionNavigation = submissionNavigation.mark;
    const clearSubmissionNavigation = submissionNavigation.clear;
    const currentSubmissionNavigation = submissionNavigation.current;
    const clearSubmissionNavigationForTrustedIntent = submissionNavigation.clearForTrustedIntent;
    function abortActivePreferredModelRun(reason = "preferred model apply cancelled", runId = "") {
      commandRouter.dispatch("cancelPreferredModelApply", { reason, runId }).catch(() => {
      });
      return true;
    }
    function contentLifecycleData() {
      return {
        documentId: contentDocumentId,
        frameBindingId: currentFrameBindingId(),
        bridgeVersion: CONTENT_BRIDGE_VERSION2,
        runtimeIdentity: CONTENT_RUNTIME_IDENTITY2,
        href: location.href,
        title: String(document.title || "").replace(/\s+/g, " ").trim()
      };
    }
    function announceContentRegistration() {
      return requestBackground(REGISTER_FRAME_CONTEXT_REQUEST, {
        bridgeDocumentId: contentDocumentId,
        browserDocumentId: currentBrowserDocumentAttestationId(),
        secureFrameToken,
        frameBindingId: currentFrameBindingId(),
        bridgeVersion: CONTENT_BRIDGE_VERSION2,
        runtimeIdentity: CONTENT_RUNTIME_IDENTITY2
      }).catch((error) => {
        console.warn("[ChatClub] Secure frame registration failed", error);
      });
    }
    async function relayFrameBindingChallenge(message = {}) {
      const challenge = String(message.challenge || "");
      const generation = Number(message.generation);
      const expectedBindingId = String(message.expectedBindingId || "");
      const browserDocumentId = String(message.browserDocumentId || "").trim();
      if (!/^[a-f0-9]{64}$/i.test(challenge) || !Number.isSafeInteger(generation) || generation <= 0 || !/^[a-f0-9]{64}$/i.test(expectedBindingId) || !browserDocumentId || /^legacy:/i.test(browserDocumentId) && browserDocumentId !== currentBrowserDocumentAttestationId()) return false;
      const bootstrap = String(globalThis.__CHATCLUB_FRAME_BINDING_ID__ || "");
      if (bootstrap && bootstrap !== expectedBindingId) return false;
      if (!bootstrap) {
        Object.defineProperty(globalThis, "__CHATCLUB_FRAME_BINDING_ID__", {
          configurable: false,
          enumerable: false,
          writable: false,
          value: expectedBindingId
        });
      }
      const registration = await requestBackground(REGISTER_FRAME_CONTEXT_REQUEST, {
        bridgeDocumentId: contentDocumentId,
        browserDocumentId: currentBrowserDocumentAttestationId(),
        secureFrameToken,
        frameBindingId: expectedBindingId,
        bridgeVersion: CONTENT_BRIDGE_VERSION2,
        runtimeIdentity: CONTENT_RUNTIME_IDENTITY2
      });
      if (!registration?.success) throw new Error(registration?.error || "Secure frame registration failed");
      const relayed = await requestBackground(RELAY_FRAME_BINDING_REQUEST, {
        bridgeDocumentId: contentDocumentId,
        browserDocumentId,
        frameBindingId: expectedBindingId,
        challenge,
        generation
      });
      if (!relayed?.success) throw new Error(relayed?.error || "Secure frame binding relay failed");
      return true;
    }
    function postContentUnloading() {
      requestBackground(RELAY_FRAME_LIFECYCLE_REQUEST, {
        lifecycleAction: "contentUnloading",
        bridgeDocumentId: contentDocumentId,
        browserDocumentId: currentBrowserDocumentAttestationId({ allowDirty: true }),
        frameBindingId: currentFrameBindingId(),
        data: contentLifecycleData()
      }).catch(() => {
      });
    }
    function postLocationChanged(data = {}) {
      requestBackground(RELAY_FRAME_LIFECYCLE_REQUEST, {
        lifecycleAction: "locationChanged",
        bridgeDocumentId: contentDocumentId,
        browserDocumentId: currentBrowserDocumentAttestationId(),
        frameBindingId: currentFrameBindingId(),
        data
      }).catch((error) => console.warn("[ChatClub] Frame lifecycle relay failed", error));
    }
    const hadContentBridge = Boolean(window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__);
    if (runtimes.isActive && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_RUNTIME_VERSION) {
      announceContentRegistration();
      return;
    }
    const previousLocationReportCleanup = window.__CHATCLUB_LOCATION_REPORT_CLEANUP__;
    const previousShortcutBridgeCleanup = window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__;
    let locationReportCleanup = null;
    let shortcutBridgeCleanup = null;
    let contentGenerationActivated = false;
    function contentBridgeIsCurrent() {
      return Boolean(
        contentGenerationActivated && runtimes.isActive && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_RUNTIME_VERSION
      );
    }
    function activateContentGeneration() {
      if (contentGenerationActivated) return;
      try {
        previousLocationReportCleanup?.();
      } catch {
      }
      try {
        previousShortcutBridgeCleanup?.();
      } catch {
      }
      try {
        document.documentElement?.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE);
      } catch {
      }
      installLocationReportResources();
      installShortcutBridgeResources();
      window.__CHATCLUB_CONTENT_PROTOCOL_VERSION__ = CONTENT_BRIDGE_VERSION2;
      window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ = CONTENT_RUNTIME_VERSION;
      window.__CHATCLUB_CONTENT_RUNTIME_IDENTITY__ = CONTENT_RUNTIME_IDENTITY2;
      window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__ = true;
      if (locationReportCleanup) window.__CHATCLUB_LOCATION_REPORT_CLEANUP__ = locationReportCleanup;
      if (shortcutBridgeCleanup) window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__ = shortcutBridgeCleanup;
      contentGenerationActivated = true;
    }
    let lastReportedHref = String(location.href || "");
    function reportLocationChange(reportedHref = "", force = false, metadata = {}) {
      if (!contentBridgeIsCurrent()) return;
      const href = String(reportedHref || location.href || "");
      if (metadata?.requireCurrentHref && href !== String(location.href || "")) return;
      if (!href || !force && href === lastReportedHref) return;
      const previousHref = lastReportedHref;
      lastReportedHref = href;
      abortActivePreferredModelRun("navigation changed");
      contentLocationRevision += 1;
      window.__CHATCLUB_CONTENT_LOCATION_REVISION__ = contentLocationRevision;
      const kind = String(metadata?.kind || "navigation");
      const submission = currentSubmissionNavigation(kind);
      postLocationChanged({
        ...contentLifecycleData(),
        href,
        previousHref,
        navigation: {
          kind,
          forced: Boolean(force),
          revision: contentLocationRevision,
          at: Math.max(0, Number(metadata?.at) || Date.now()),
          ...submission ? {
            submission: {
              sendId: submission.sendId,
              appId: submission.appId,
              initialHref: submission.initialHref,
              activatedAt: submission.activatedAt,
              method: submission.method
            }
          } : {}
        }
      });
    }
    function installLocationReportResources() {
      const controller = new AbortController();
      const options = { capture: true, signal: controller.signal };
      let timer = null;
      locationReportCleanup = () => {
        if (timer !== null) clearInterval(timer);
        controller.abort();
      };
      window.addEventListener("pointerdown", (event) => {
        if (contentBridgeIsCurrent()) clearSubmissionNavigationForTrustedIntent(event);
      }, options);
      window.addEventListener("keydown", (event) => {
        if (contentBridgeIsCurrent()) clearSubmissionNavigationForTrustedIntent(event);
      }, options);
      window.addEventListener(NOTION_SEND_ACTIVATED_EVENT2, (event) => {
        if (!contentBridgeIsCurrent()) return;
        let detail = event?.detail;
        try {
          if (typeof detail === "string") detail = JSON.parse(detail);
        } catch {
          detail = null;
        }
        if (!detail || typeof detail !== "object") return;
        markSubmissionNavigation(detail, detail.method || "notion-submit");
      }, options);
      window.addEventListener("message", (event) => {
        if (!contentBridgeIsCurrent()) return;
        const message = event.data;
        if (message?.source !== MAIN_WORLD_LOCATION_SOURCE2 || message.type !== "notification" || message.action !== "locationChanged") return;
        reportLocationChange(message.href, message.force === true, {
          kind: message.kind,
          at: message.at,
          requireCurrentHref: true
        });
      }, options);
      window.addEventListener("pagehide", () => {
        if (!contentBridgeIsCurrent()) return;
        abortActivePreferredModelRun("navigation changed");
        clearSubmissionNavigation();
        postContentUnloading();
      }, options);
      window.addEventListener("pageshow", () => {
        if (!contentBridgeIsCurrent()) return;
        currentBrowserDocumentAttestationId();
        announceContentRegistration();
      }, options);
      timer = setInterval(() => {
        reportLocationChange("", false, { kind: "poll", at: Date.now() });
      }, 800);
    }
    function respond(source, id, action, data, error, responseSource = SOURCE) {
      if (!EXTENSION_ORIGIN) return;
      source?.postMessage({ source: responseSource, type: "response", id, action, data, error }, EXTENSION_ORIGIN);
    }
    const ACTIVE_KEYBOARD_PLATFORM = detectKeyboardPlatform();
    let activeShortcutConfig = normalizeShortcutConfig(DEFAULT_SHORTCUT_CONFIG);
    function eventMatchesKagiNativeDeleteShortcut(event, platform = ACTIVE_KEYBOARD_PLATFORM) {
      if (event.code !== "Backspace" || event.altKey || !event.shiftKey) return false;
      return normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC ? Boolean(event.metaKey) && !event.ctrlKey : Boolean(event.ctrlKey) && !event.metaKey;
    }
    async function loadShortcutConfig() {
      try {
        const stored = await EXTENSION_API?.storage?.local?.get("shortcutConfig");
        activeShortcutConfig = normalizeShortcutConfig(stored.shortcutConfig);
      } catch {
      }
    }
    function postShortcutTriggered(match) {
      requestBackground(RELAY_SHORTCUT_TRIGGERED_REQUEST, {
        bridgeDocumentId: contentDocumentId,
        browserDocumentId: currentBrowserDocumentAttestationId(),
        frameBindingId: currentFrameBindingId(),
        shortcutAction: String(match?.action || ""),
        matchObj: match?.matchObj || {}
      }).catch((error) => console.warn("[ChatClub] Shortcut relay failed", error));
    }
    function shouldBridgeShortcut(match, event) {
      const action = String(match?.action || "");
      const host = String(location.hostname || "").toLowerCase();
      if (action === "deleteThread" && host === "assistant.kagi.com" && eventMatchesKagiNativeDeleteShortcut(event)) {
        return false;
      }
      return true;
    }
    installContentCapability(runtimes, {
      capability: "base",
      owner: "content-capability:base",
      version: CONTENT_RUNTIME_IDENTITY2.bundle.implementationVersion,
      routerVersion: CONTENT_RUNTIME_IDENTITY2.implementationVersion,
      handlers: {
        getLocationHref: () => location.href,
        getPageMeta: () => pageMeta(),
        getPageText: () => normalize(document.body?.innerText || "")
      }
    });
    const handleContentAction = commandRouter.dispatch;
    installSecureFrameRpc({
      extensionApi: EXTENSION_API,
      runtimes,
      version: CONTENT_BRIDGE_VERSION2,
      source: SECURE_FRAME_COMMAND_SOURCE2,
      bridgeDocumentId: contentDocumentId,
      secureFrameToken,
      dispatch: handleContentAction
    });
    const onParentWindowMessage = async (event) => {
      if (!EXTENSION_ORIGIN || event.source !== window.parent || event.origin !== EXTENSION_ORIGIN) return;
      if (!contentBridgeIsCurrent()) return;
      const message = event.data;
      if (message?.source === FRAME_BINDING_POST_MESSAGE_SOURCE2) {
        if (!event.isTrusted || message.type !== "request" || message.action !== "bindFrame") return;
        try {
          await relayFrameBindingChallenge(message);
        } catch (error) {
          console.warn("[ChatClub] Secure frame binding relay failed", error);
        }
        return;
      }
      const versionedDeleteRequest = message?.source === DELETE_THREAD_POST_MESSAGE_SOURCE2;
      const versionedSendTextRequest = message?.source === SEND_TEXT_POST_MESSAGE_SOURCE2;
      const versionedPreferredModelRequest = message?.source === PREFERRED_MODEL_POST_MESSAGE_SOURCE2;
      const versionedNavigatorRequest = message?.source === MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE2;
      const versionedSummaryRequest = message?.source === SUMMARY_POST_MESSAGE_SOURCE2;
      const genericRequest = message?.source === SOURCE;
      if (!versionedDeleteRequest && !versionedSendTextRequest && !versionedPreferredModelRequest && !versionedNavigatorRequest && !versionedSummaryRequest && !genericRequest || message.type !== "request") return;
      if (genericRequest && hadContentBridge) return;
      if (genericRequest && ["applyPreferredModel", "cancelPreferredModelApply"].includes(message.action)) return;
      if (versionedDeleteRequest && message.action !== "deleteThread" && message.action !== "getDeleteConfirmState") return;
      if (versionedSendTextRequest && message.action !== "sendText") return;
      if (versionedPreferredModelRequest && !["applyPreferredModel", "cancelPreferredModelApply"].includes(message.action)) return;
      if (versionedNavigatorRequest && !["setMessageNavigator", "hideMessageNavigatorMenu", "getMessageNavigatorState"].includes(message.action)) return;
      if (versionedSummaryRequest && !["getLocationHref", "getPageMeta", "getPageText", "collectSummary"].includes(message.action)) return;
      const responseSource = versionedDeleteRequest ? DELETE_THREAD_POST_MESSAGE_SOURCE2 : versionedSendTextRequest ? SEND_TEXT_POST_MESSAGE_SOURCE2 : versionedPreferredModelRequest ? PREFERRED_MODEL_POST_MESSAGE_SOURCE2 : versionedNavigatorRequest ? MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE2 : versionedSummaryRequest ? SUMMARY_POST_MESSAGE_SOURCE2 : SOURCE;
      try {
        const data = await handleContentAction(message.action, message.data || {});
        respond(event.source, message.id, message.action, data, null, responseSource);
      } catch (error) {
        respond(event.source, message.id, message.action, null, error.message || String(error), responseSource);
      }
    };
    runtimes.install("parent-window-rpc", CONTENT_BRIDGE_VERSION2, () => {
      return {
        api: Object.freeze({ source: SOURCE, bridgeVersion: CONTENT_BRIDGE_VERSION2 }),
        activate() {
          window.addEventListener("message", onParentWindowMessage, true);
        },
        dispose() {
          window.removeEventListener("message", onParentWindowMessage, true);
        }
      };
    });
    const shortcutStorageChanged = (changes, areaName) => {
      if (!contentBridgeIsCurrent()) return;
      if (areaName === "local" && changes.shortcutConfig) {
        activeShortcutConfig = normalizeShortcutConfig(changes.shortcutConfig.newValue);
      }
    };
    function installShortcutBridgeResources() {
      const controller = new AbortController();
      const options = { capture: true, signal: controller.signal };
      shortcutBridgeCleanup = () => {
        controller.abort();
        try {
          EXTENSION_API?.storage?.onChanged?.removeListener(shortcutStorageChanged);
        } catch {
        }
      };
      window.addEventListener("keydown", (event) => {
        if (!contentBridgeIsCurrent()) return;
        if (!event.isTrusted) return;
        const matched = matchShortcut(event, activeShortcutConfig, ACTIVE_KEYBOARD_PLATFORM);
        if (!matched) return;
        if (!shouldBridgeShortcut(matched, event)) return;
        event.preventDefault();
        event.stopPropagation();
        postShortcutTriggered(matched);
      }, options);
      try {
        EXTENSION_API?.storage?.onChanged?.addListener(shortcutStorageChanged);
      } catch {
      }
      loadShortcutConfig();
    }
    runtimes.register("content-bridge-generation", {
      version: CONTENT_RUNTIME_VERSION,
      api: CONTENT_RUNTIME_IDENTITY2,
      activate() {
        activateContentGeneration();
        queueMicrotask(() => {
          if (contentBridgeIsCurrent()) announceContentRegistration();
        });
      },
      dispose() {
        contentGenerationActivated = false;
        locationReportCleanup?.();
        shortcutBridgeCleanup?.();
        if (window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ !== CONTENT_RUNTIME_VERSION) return;
        delete window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__;
        delete window.__CHATCLUB_CONTENT_BRIDGE_VERSION__;
        delete window.__CHATCLUB_CONTENT_PROTOCOL_VERSION__;
        delete window.__CHATCLUB_CONTENT_RUNTIME_IDENTITY__;
        if (window.__CHATCLUB_LOCATION_REPORT_CLEANUP__ === locationReportCleanup) {
          delete window.__CHATCLUB_LOCATION_REPORT_CLEANUP__;
        }
        if (window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__ === shortcutBridgeCleanup) {
          delete window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__;
        }
      }
    });
  }
  installContentBridge();
})();
