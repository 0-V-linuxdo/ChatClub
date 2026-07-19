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
  var GROK_COOKIE_BRIDGE_VERSION = "2026.07.15.1";
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
  var CONTENT_RUNTIME_SOURCE_SHA256 = "56ae70c075c19ca583d76133e0edc0d694fecc58c3112f9e246a5812e8650b8f";
  var CONTENT_RUNTIME_BUILD_RECIPE_VERSION = "1+recipe.39e7dff3b817dd590d108ce155af13e47b28138e33c477502664105276787094";
  var CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "39e7dff3b817dd590d108ce155af13e47b28138e33c477502664105276787094";
  var CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "330f3a3515c38cb4bb3d34cf09d63dcb258c91cd538e9214385bdfb2d1ea9799";
  var CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "2026.07.16.2+implementation.330f3a3515c38cb4bb3d34cf09d63dcb258c91cd538e9214385bdfb2d1ea9799";
  var CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/grok-cookie-bridge.js", "entryPath": "content-src/grok-cookie-bridge.js", "sourceSha256": "d09cd36316d9c63abfc773c63295861f25eeb935ac626f943481d76048e64800", "implementationSha256": "83aa277d1f684448ce86fedac76585e47d309fc83299d3ea66145142c4d6b6e4", "implementationVersion": "2026.07.16.2+bundle.83aa277d1f684448ce86fedac76585e47d309fc83299d3ea66145142c4d6b6e4" });

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

  // content-src/grok-cookie-bridge.js
  function installGrokCookieBridge() {
    const runtimes = runtimeRegistry(window);
    const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY);
    runtimes.registerBundle(runtimeIdentity);
    const BRIDGE_VERSION = GROK_COOKIE_BRIDGE_VERSION;
    const INSTALLATION_VERSION = runtimeIdentity.bundle.implementationVersion;
    const INSTALLATION_KEY = "__CHATCLUB_GROK_COOKIE_BRIDGE_VERSION__";
    const RELOAD_MARKER = `chatclub:grok-cookie-bridge:reload:${INSTALLATION_VERSION}`;
    if (location.protocol !== "https:" || location.hostname.toLowerCase() !== "grok.com") return;
    if (window.top === window) return;
    runtimes.install("grok-cookie-bridge-root", INSTALLATION_VERSION, () => {
      let disposed = false;
      return {
        api: Object.freeze({ version: INSTALLATION_VERSION, runtimeIdentity }),
        activate() {
          if (disposed || globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) return;
          globalThis[INSTALLATION_KEY] = `${INSTALLATION_VERSION}:pending`;
          requestBackground(SYNC_GROK_SESSION_COOKIES_REQUEST, { bridgeVersion: BRIDGE_VERSION }).then((response) => {
            if (disposed) return;
            if (!response.reloadRequired) {
              try {
                sessionStorage.removeItem(RELOAD_MARKER);
              } catch {
              }
              return;
            }
            let alreadyReloaded = false;
            try {
              alreadyReloaded = sessionStorage.getItem(RELOAD_MARKER) === location.href;
              if (!alreadyReloaded) sessionStorage.setItem(RELOAD_MARKER, location.href);
            } catch {
              return;
            }
            if (!alreadyReloaded && !disposed) location.reload();
          }).catch(() => {
          }).finally(() => {
            if (globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) {
              delete globalThis[INSTALLATION_KEY];
            }
          });
        },
        dispose() {
          disposed = true;
          if (globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) {
            delete globalThis[INSTALLATION_KEY];
          }
        }
      };
    });
  }
  installGrokCookieBridge();
})();
