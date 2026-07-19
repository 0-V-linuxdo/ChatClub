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
  var CONTENT_RUNTIME_SOURCE_SHA256 = "56ae70c075c19ca583d76133e0edc0d694fecc58c3112f9e246a5812e8650b8f";
  var CONTENT_RUNTIME_BUILD_RECIPE_VERSION = "1+recipe.39e7dff3b817dd590d108ce155af13e47b28138e33c477502664105276787094";
  var CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "39e7dff3b817dd590d108ce155af13e47b28138e33c477502664105276787094";
  var CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "330f3a3515c38cb4bb3d34cf09d63dcb258c91cd538e9214385bdfb2d1ea9799";
  var CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "2026.07.16.2+implementation.330f3a3515c38cb4bb3d34cf09d63dcb258c91cd538e9214385bdfb2d1ea9799";
  var CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/preferred-model.js", "entryPath": "content-src/content-preferred-model.js", "sourceSha256": "c2a9f205b61493cd917d0728d7028c78f7df70f6e746b59b329043297394690f", "implementationSha256": "c6d66a9c78750bfd831f6db619f965102fdaef9436fa2eed21bfa1d967ab3ffd", "implementationVersion": "2026.07.16.2+bundle.c6d66a9c78750bfd831f6db619f965102fdaef9436fa2eed21bfa1d967ab3ffd" });

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

  // content-src/shared/summary-runtime.js
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
      return dispatchPointerActivation(el, modelCenterPoint(el)) || nativeModelClick(el);
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
  function createPreferredDomRuntime(deps = {}) {
    const {
      activateElement: activateElement2,
      closest: closest2,
      normalize: normalize2,
      qsa: qsa2,
      visible: visible2,
      assertPreferredModelRun,
      armPreferredModelFocusShield
    } = deps;
    const dom = createDomRuntime({ activateElement: activateElement2, closest: closest2, normalize: normalize2, qsa: qsa2, visible: visible2 });
    const {
      isDisabledElement: isDisabledElement2,
      nativeModelClick,
      modelDirectClick
    } = dom;
    function compactModelText(value) {
      return normalize2(value).toLowerCase().replace(/\s+/g, " ");
    }
    function alnumModelToken(value) {
      return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    }
    function parseBooleanAttr(value) {
      const token = String(value ?? "").trim().toLowerCase();
      if (token === "true") return true;
      if (token === "false") return false;
      return null;
    }
    function preferredModelActivate(context, target) {
      assertPreferredModelRun(context);
      if (!target || !visible2(target) || isDisabledElement2(target) || typeof target.click !== "function") return false;
      armPreferredModelFocusShield(context);
      try {
        target.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      assertPreferredModelRun(context);
      context.interactionCount += 1;
      return nativeModelClick(target);
    }
    function preferredModelPointerActivate(context, target) {
      assertPreferredModelRun(context);
      if (!target || !visible2(target) || isDisabledElement2(target)) return false;
      armPreferredModelFocusShield(context);
      assertPreferredModelRun(context);
      context.interactionCount += 1;
      return modelDirectClick(target);
    }
    return Object.freeze({
      firstVisibleBySelectors: dom.firstVisibleBySelectors,
      isDisabledElement: isDisabledElement2,
      modelElementArea: dom.modelElementArea,
      modelElementText: dom.modelElementText,
      modelEventConstructor: dom.modelEventConstructor,
      modelRect: dom.modelRect,
      visibleSelectorElements: dom.visibleSelectorElements,
      compactModelText,
      alnumModelToken,
      parseBooleanAttr,
      preferredModelActivate,
      preferredModelPointerActivate
    });
  }

  // content-src/capabilities/preferred-common.js
  function createPreferredCommonCapability(deps = {}) {
    const {
      contentDocumentId,
      GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE,
      PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS,
      PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE,
      PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS,
      GEMINI_MODEL_PICKER_SOURCE: GEMINI_MODEL_PICKER_SOURCE2,
      contentBridgeIsCurrent
    } = deps;
    let preferredModelBridgeRunSequence = Math.max(
      0,
      Number(window.__CHATCLUB_PREFERRED_MODEL_BRIDGE_RUN_SEQUENCE__) || 0
    );
    const preferredModelState = { activeRun: null };
    function nextPreferredModelBridgeRunSequence() {
      preferredModelBridgeRunSequence += 1;
      window.__CHATCLUB_PREFERRED_MODEL_BRIDGE_RUN_SEQUENCE__ = preferredModelBridgeRunSequence;
      return preferredModelBridgeRunSequence;
    }
    function preferredModelBridgeToken(context) {
      if (!context?.runId || !context?.bridgeGeneration) return "";
      return `${contentDocumentId}:${context.bridgeGeneration}:${context.runId}`;
    }
    function publishPreferredModelBridgeRun(context) {
      if (!context) return "";
      context.bridgeToken = preferredModelBridgeToken(context);
      context.bridgeReleased = false;
      try {
        document.documentElement?.setAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE, context.bridgeToken);
      } catch {
      }
      return context.bridgeToken;
    }
    function preferredModelFocusShieldValue(context, expiresAt) {
      return JSON.stringify({
        token: String(context?.bridgeToken || ""),
        generation: Math.max(0, Number(context?.focusShieldGeneration) || 0),
        expiresAt: Math.max(0, Number(expiresAt) || 0)
      });
    }
    function armPreferredModelFocusShield(context, leaseMs = PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS) {
      assertPreferredModelRun(context);
      context.focusShieldGeneration = Math.max(0, Number(context.focusShieldGeneration) || 0) + 1;
      context.focusShieldReleaseScheduled = false;
      const value = preferredModelFocusShieldValue(
        context,
        Date.now() + Math.max(250, Number(leaseMs) || PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS)
      );
      context.focusShieldValue = value;
      try {
        document.documentElement?.setAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE, value);
      } catch {
      }
      return value;
    }
    function releasePreferredModelFocusShield(context) {
      if (!context?.focusShieldValue || context.focusShieldReleaseScheduled) return;
      context.focusShieldReleaseScheduled = true;
      const generation = context.focusShieldGeneration;
      const afterFrame = (callback) => {
        try {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(callback);
            return;
          }
        } catch {
        }
        setTimeout(callback, 17);
      };
      afterFrame(() => afterFrame(() => {
        if (context.focusShieldGeneration !== generation || !context.focusShieldReleaseScheduled) return;
        let current = "";
        try {
          current = String(document.documentElement?.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) || "");
        } catch {
        }
        if (!current || current !== context.focusShieldValue) return;
        const value = preferredModelFocusShieldValue(
          context,
          Date.now() + PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS
        );
        context.focusShieldValue = value;
        try {
          document.documentElement?.setAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE, value);
        } catch {
        }
        setTimeout(() => {
          if (context.focusShieldGeneration !== generation) return;
          try {
            if (document.documentElement?.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) === value) {
              document.documentElement.removeAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE);
            }
          } catch {
          }
        }, PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS + 50);
      }));
    }
    function postGeminiModelPickerBridgeCancel(context, reason = "preferred model apply cancelled") {
      if (!context?.runId || !context?.bridgeToken) return;
      try {
        window.postMessage({
          source: GEMINI_MODEL_PICKER_SOURCE2,
          type: "request",
          action: "cancel",
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          runId: context.runId,
          runGeneration: context.bridgeGeneration,
          runToken: context.bridgeToken,
          reason: String(reason || "preferred model apply cancelled")
        }, "*");
      } catch {
      }
    }
    function releasePreferredModelBridgeRun(context, reason = "preferred model apply finished") {
      releasePreferredModelFocusShield(context);
      if (!context || context.bridgeReleased) return;
      context.bridgeReleased = true;
      try {
        if (document.documentElement?.getAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE) === context.bridgeToken) {
          document.documentElement.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE);
        }
      } catch {
      }
      postGeminiModelPickerBridgeCancel(context, reason);
    }
    function abortActivePreferredModelRun(reason = "preferred model apply cancelled", runId = "") {
      const active = preferredModelState.activeRun;
      if (!active || runId && active.runId !== String(runId)) return false;
      active.abortKind = reason === "preferred model apply timed out" ? "timeout" : "cancel";
      active.abortReason = String(reason || "preferred model apply cancelled");
      releasePreferredModelBridgeRun(active, active.abortReason);
      try {
        active.controller.abort(active.abortReason);
      } catch {
        try {
          active.controller.abort();
        } catch {
        }
      }
      return true;
    }
    function modelResult(ok, appId, modelId, reason = "", extra = {}) {
      if (!ok && reason) console.warn(`[ChatClub] ${appId} preferred model: ${reason}`);
      const {
        skipped: rawSkipped,
        changed: rawChanged,
        cancelled: rawCancelled,
        retryable: rawRetryable,
        runId: rawRunId,
        interactionCount: rawInteractionCount,
        ...details
      } = extra || {};
      const skipped = Boolean(rawSkipped);
      const cancelled = Boolean(rawCancelled);
      const interactionCount = Math.max(0, Number(rawInteractionCount) || 0);
      return {
        ...details,
        ok: Boolean(ok),
        appId,
        modelId,
        skipped,
        changed: Boolean(rawChanged),
        cancelled,
        retryable: Boolean(rawRetryable) && !cancelled && interactionCount === 0,
        reason: String(reason || ""),
        runId: String(rawRunId || ""),
        interactionCount
      };
    }
    function preferredModelAbortReason(context) {
      if (!context) return "preferred model apply cancelled";
      return String(
        context.abortReason || context.signal?.reason || (contentBridgeIsCurrent() ? "preferred model apply cancelled" : "content bridge superseded")
      );
    }
    function preferredModelCancelled(context) {
      let tokenIsCurrent = false;
      try {
        tokenIsCurrent = Boolean(
          context?.bridgeToken && document.documentElement?.getAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE) === context.bridgeToken
        );
      } catch {
      }
      return !context || context.signal?.aborted || preferredModelState.activeRun !== context || !contentBridgeIsCurrent() || !tokenIsCurrent;
    }
    function assertPreferredModelRun(context) {
      if (!preferredModelCancelled(context)) return;
      const error = new Error(preferredModelAbortReason(context));
      error.name = "PreferredModelCancelledError";
      error.preferredModelCancelled = true;
      throw error;
    }
    function preferredModelResult(context, ok, appId, modelId, reason = "", extra = {}) {
      return modelResult(ok, appId, modelId, reason, {
        ...extra,
        runId: context?.runId || extra?.runId || "",
        interactionCount: context?.interactionCount || 0
      });
    }
    function preferredModelSleep(context, ms) {
      assertPreferredModelRun(context);
      return new Promise((resolve) => {
        let timer = null;
        const finish = () => {
          if (timer) clearTimeout(timer);
          try {
            context.signal.removeEventListener("abort", finish);
          } catch {
          }
          resolve();
        };
        timer = setTimeout(finish, Math.max(0, Number(ms) || 0));
        try {
          context.signal.addEventListener("abort", finish, { once: true });
        } catch {
        }
        if (context.signal.aborted) finish();
      }).then(() => assertPreferredModelRun(context));
    }
    async function waitForPreferredModel(context, getter, timeoutMs = 2500, intervalMs = 120) {
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        assertPreferredModelRun(context);
        const value = getter();
        if (value) return value;
        await preferredModelSleep(context, Math.max(30, Number(intervalMs) || 30));
      }
      assertPreferredModelRun(context);
      return getter();
    }
    function requestGeminiModelPickerBridgeOpen(context, timeoutMs = 900) {
      assertPreferredModelRun(context);
      const runId = String(context.runId || "");
      const runToken = String(context.bridgeToken || "");
      return new Promise((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          try {
            context.signal.removeEventListener("abort", onAbort);
          } catch {
          }
          resolve(value);
        };
        const timer = setTimeout(() => finish({ ok: false, reason: "bridge timeout" }), Math.max(300, Number(timeoutMs) || 900));
        function onMessage(event) {
          const message = event.data;
          if (message?.source !== GEMINI_MODEL_PICKER_SOURCE2 || message.type !== "response" || message.action !== "open" || message.id !== id || String(message.runId || "") !== runId || String(message.runToken || "") !== runToken) return;
          finish(message);
        }
        const onAbort = () => finish({ ok: false, cancelled: true, reason: preferredModelAbortReason(context) });
        window.addEventListener("message", onMessage, true);
        try {
          context.signal.addEventListener("abort", onAbort, { once: true });
        } catch {
        }
        try {
          assertPreferredModelRun(context);
          armPreferredModelFocusShield(context);
          window.postMessage({
            source: GEMINI_MODEL_PICKER_SOURCE2,
            type: "request",
            action: "open",
            id,
            runId,
            runGeneration: context.bridgeGeneration,
            runToken
          }, "*");
        } catch (error) {
          finish({ ok: false, reason: error?.message || String(error || "bridge failed") });
        }
      }).then((result) => {
        if (result?.activated === true) context.interactionCount += 1;
        assertPreferredModelRun(context);
        return result;
      });
    }
    return Object.freeze({
      modelResult,
      preferredModelResult,
      preferredModelSleep,
      waitForPreferredModel,
      requestGeminiModelPickerBridgeOpen,
      abortActivePreferredModelRun,
      preferredModelState,
      nextPreferredModelBridgeRunSequence,
      publishPreferredModelBridgeRun,
      releasePreferredModelBridgeRun,
      armPreferredModelFocusShield,
      preferredModelCancelled,
      preferredModelAbortReason,
      assertPreferredModelRun
    });
  }

  // content-src/capabilities/preferred-gemini.js
  function createPreferredGeminiCapability(deps = {}) {
    const {
      compactModelText,
      firstVisibleBySelectors,
      modelElementText,
      visible: visible2,
      matches: matches2,
      modelRect,
      visibleSelectorElements,
      modelElementArea,
      assertPreferredModelRun,
      waitForPreferredModel,
      requestGeminiModelPickerBridgeOpen,
      preferredModelActivate,
      closest: closest2,
      isDisabledElement: isDisabledElement2,
      qsa: qsa2,
      parseBooleanAttr,
      armPreferredModelFocusShield,
      modelEventConstructor,
      preferredModelResult
    } = deps;
    const GEMINI_MODEL_TARGETS = Object.freeze({
      pro: Object.freeze({ id: "pro", labels: ["3.1 Pro", "Advanced math and code"] }),
      thinking: Object.freeze({ id: "thinking", labels: ["Standard", "Best for most questions"] }),
      extended: Object.freeze({ id: "extended", labels: ["Extended", "Complex problem solving"] }),
      fast: Object.freeze({ id: "fast", labels: ["3.1 Flash-Lite", "Flash-Lite", "Fastest answers"] }),
      flash35: Object.freeze({ id: "flash35", labels: ["3.5 Flash", "All-around help"] })
    });
    const GEMINI_MODEL_BUTTON_SELECTORS = Object.freeze([
      "button[aria-label='Open mode picker']",
      "button[aria-label^='Open mode picker' i]",
      "bard-mode-switcher button[aria-label='Open mode picker']",
      "bard-mode-switcher button",
      "button[aria-label*='mode picker' i]",
      "button[aria-label*='model' i]"
    ]);
    const GEMINI_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
      "gem-mode-menu",
      ".cdk-overlay-pane",
      ".cdk-overlay-container .cdk-overlay-pane",
      ".cdk-overlay-container [role='menu']",
      ".cdk-overlay-container [role='listbox']",
      ".cdk-overlay-container [role='dialog']",
      ".cdk-overlay-pane .gds-mode-switch-menu.mat-mdc-menu-panel",
      ".cdk-overlay-pane .gds-mode-switch-menu",
      ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
      ".cdk-overlay-pane .mat-mdc-menu-panel",
      ".cdk-overlay-pane .mat-menu-panel[role='menu']",
      ".cdk-overlay-pane .mat-menu-panel",
      ".cdk-overlay-pane [role='menu']",
      ".cdk-overlay-pane [role='listbox']",
      ".gds-mode-switch-menu",
      ".mat-mdc-menu-panel[role='menu']",
      ".mat-mdc-menu-panel",
      ".mat-menu-panel[role='menu']",
      ".mat-menu-panel",
      "[role='menu']",
      "[role='listbox']",
      "[role='dialog']"
    ]);
    const GEMINI_MODEL_ITEM_SELECTORS = Object.freeze([
      "gem-menu-item",
      "button.bard-mode-list-button[role='menuitemradio']",
      ".bard-mode-list-button",
      "button[role='menuitemradio']",
      "button[role='menuitem']",
      "button[role='option']",
      "button[role='button']",
      "button[aria-haspopup='menu']",
      "button[mat-menu-item]",
      "button.mat-mdc-menu-item",
      "[role='menuitemradio']",
      "[role='menuitem']",
      "[role='option']",
      "[role='button']",
      "mat-list-option",
      "mat-selection-list mat-list-option",
      "[tabindex]:not([tabindex='-1'])",
      "button",
      "div",
      "span"
    ]);
    function geminiModelKeysFromText(value) {
      const token = compactModelText(value);
      const keys = /* @__PURE__ */ new Set();
      if (!token) return keys;
      const hasFlashLite = /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) || /(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) || token.includes("fastest answers");
      if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token) || token.includes("complex problem solving")) keys.add("extended");
      if (/(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token) || token.includes("best for most questions")) keys.add("thinking");
      if (/(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token) || /(^|[^a-z0-9])gemini\s+pro([^a-z0-9]|$)/.test(token) || /(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token) || token.includes("advanced math and code")) {
        keys.add("pro");
      }
      if (hasFlashLite) {
        keys.add("fast");
      }
      if (/(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token) || token.includes("all-around help") || !hasFlashLite && /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token)) {
        keys.add("flash35");
      }
      return keys;
    }
    function geminiModelKeyFromText(value) {
      const keys = Array.from(geminiModelKeysFromText(value));
      return keys.length === 1 ? keys[0] : "";
    }
    function inferGeminiModelKey(value) {
      const token = compactModelText(value);
      if (!token) return "";
      const key = geminiModelKeyFromText(value);
      if (key) return key;
      if (/(^|[^a-z0-9])extended\s+thinking([^a-z0-9]|$)/.test(token)) return "extended";
      if (/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) return "extended";
      if (/(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) return "pro";
      if (/(^|[^a-z0-9])gemini\s+pro([^a-z0-9]|$)/.test(token)) return "pro";
      if (/(^|[^a-z0-9])thinking\s+level([^a-z0-9]|$)/.test(token)) return "thinking";
      if (/(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token)) return "flash35";
      if (/(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token)) return "fast";
      if (["pro", "thinking", "extended", "fast", "flash35"].includes(token)) return token;
      if (/(^|[^a-z0-9])pro([^a-z0-9]|$)/.test(token)) return "pro";
      if (/(^|[^a-z0-9])thinking([^a-z0-9]|$)/.test(token)) return "thinking";
      if (/(^|[^a-z0-9])fast([^a-z0-9]|$)/.test(token)) return "fast";
      if (/(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token)) return "flash35";
      return "";
    }
    function currentGeminiPickerState() {
      const button = firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS);
      if (!button) return { button: null, label: "", baseModelId: "", thinkingLevel: "" };
      const label = String(button.getAttribute?.("aria-label") || modelElementText(button) || "");
      const keys = geminiModelKeysFromText(label);
      const baseModelId = ["fast", "flash35", "pro"].find((key) => keys.has(key)) || (() => {
        const inferred = inferGeminiModelKey(label);
        return ["fast", "flash35", "pro"].includes(inferred) ? inferred : "";
      })();
      const token = compactModelText(label);
      const thinkingLevel = baseModelId === "pro" ? keys.has("extended") || /\bextended(?:\s+thinking)?\b/.test(token) ? "extended" : "standard" : "";
      return { button, label, baseModelId, thinkingLevel };
    }
    function geminiThinkingLevelModelId(value) {
      const token = String(value || "").trim().toLowerCase();
      if (token === "extended") return "extended";
      if (token === "standard" || token === "thinking") return "thinking";
      return "";
    }
    function scoreGeminiModelMenuRoot(root) {
      if (!root || !visible2(root)) return 0;
      const text = modelElementText(root);
      const token = compactModelText(text);
      if (!token) return 0;
      const keys = geminiModelKeysFromText(text);
      let score = keys.size * 80;
      if (token.includes("thinking level")) score += 60;
      if (token.includes("select a model") || token.includes("mode picker")) score += 40;
      if (token.includes("gemini") || token.includes("flash")) score += 15;
      if (matches2(root, ".cdk-overlay-pane, .gds-mode-switch-menu, .mat-mdc-menu-panel, .mat-menu-panel, [role='menu'], [role='listbox']")) score += 25;
      const rect = modelRect(root);
      if (rect) {
        if (rect.height >= 100 && rect.width >= 180) score += 20;
        if (rect.height > window.innerHeight * 0.9 || rect.width > window.innerWidth * 0.9) score -= 120;
      }
      if (keys.size < 2 && !token.includes("thinking level")) score -= 120;
      return score;
    }
    function geminiModelMenuRootCandidates() {
      const candidates = visibleSelectorElements(GEMINI_MODEL_MENU_ROOT_SELECTORS).map((element, index) => ({
        element,
        index,
        score: scoreGeminiModelMenuRoot(element),
        area: modelElementArea(element)
      })).filter((candidate) => candidate.score > 0);
      candidates.sort((a, b) => b.score - a.score || b.area - a.area || b.index - a.index);
      return candidates;
    }
    function geminiModelMenuRoot() {
      const candidates = geminiModelMenuRootCandidates();
      return candidates[0]?.element || null;
    }
    function geminiModelMenuRoots() {
      return geminiModelMenuRootCandidates().map((candidate) => candidate.element);
    }
    async function openGeminiModelMenu(context) {
      assertPreferredModelRun(context);
      context.geminiMenuFailureTerminal = false;
      const existing = geminiModelMenuRoot();
      if (existing) return existing;
      const trigger = await waitForPreferredModel(context, () => firstVisibleBySelectors(GEMINI_MODEL_BUTTON_SELECTORS), 1e4, 150);
      if (!trigger) return null;
      const bridgeResult = await requestGeminiModelPickerBridgeOpen(context, 1200);
      if (bridgeResult?.cancelled === true || bridgeResult?.stale === true) {
        context.abortKind = "cancel";
        context.abortReason = String(bridgeResult.reason || "Gemini model picker bridge run was cancelled");
        try {
          context.controller.abort(context.abortReason);
        } catch {
          try {
            context.controller.abort();
          } catch {
          }
        }
        assertPreferredModelRun(context);
      }
      let root = await waitForPreferredModel(context, geminiModelMenuRoot, 1400, 80);
      if (root) return root;
      if (bridgeResult?.activated === true || bridgeResult?.alreadyOpen === true) {
        context.geminiMenuFailureTerminal = true;
        return null;
      }
      if (String(bridgeResult?.reason || "").toLowerCase().includes("timeout")) {
        context.geminiMenuFailureTerminal = true;
        return null;
      }
      if (!preferredModelActivate(context, trigger)) return null;
      root = await waitForPreferredModel(context, geminiModelMenuRoot, 1400, 80);
      return root || null;
    }
    function geminiModelItemRow(element, root) {
      if (!element || !root || element === root || !root.contains?.(element)) return null;
      const direct = closest2(element, [
        "gem-menu-item",
        "button",
        "[role='menuitemradio']",
        "[role='menuitem']",
        "[role='option']",
        "[role='button']",
        "mat-list-option",
        ".bard-mode-list-button",
        ".mat-mdc-menu-item",
        ".mat-menu-item",
        "[tabindex]:not([tabindex='-1'])"
      ].join(", "));
      if (direct && root.contains(direct) && direct !== root) return direct;
      let node = element;
      for (let guard = 0; node && node !== root && guard < 6; guard += 1, node = node.parentElement) {
        const rect = modelRect(node);
        if (!rect || rect.height < 18 || rect.height > 140) continue;
        if (modelElementArea(node) > modelElementArea(root) * 0.92) continue;
        if (compactModelText(modelElementText(node))) return node;
      }
      return null;
    }
    function geminiModelItems(root) {
      if (!root) return [];
      const rows = [];
      const seen = /* @__PURE__ */ new Set();
      const rootArea = Math.max(1, modelElementArea(root));
      const add = (element) => {
        const row = geminiModelItemRow(element, root);
        if (!row || seen.has(row) || !visible2(row) || isDisabledElement2(row)) return;
        if (row === root || modelElementArea(row) > rootArea * 0.92) return;
        const text = modelElementText(row);
        if (!compactModelText(text)) return;
        seen.add(row);
        rows.push(row);
      };
      for (const element of visibleSelectorElements(GEMINI_MODEL_ITEM_SELECTORS, root)) add(element);
      return rows;
    }
    function geminiCompactMenuRows(root) {
      if (!root) return [];
      const rows = [];
      const seen = /* @__PURE__ */ new Set();
      const rootArea = Math.max(1, modelElementArea(root));
      for (const element of qsa2("*", root)) {
        if (!visible2(element)) continue;
        let row = element;
        for (let node = element; node && node !== root; node = node.parentElement) {
          const rect = modelRect(node);
          if (!rect) continue;
          const area = rect.width * rect.height;
          if (rect.width > 80 && rect.height >= 30 && rect.height <= 96 && area < rootArea * 0.85) {
            row = node;
            break;
          }
        }
        if (!row || seen.has(row) || row === root || !visible2(row) || isDisabledElement2(row)) continue;
        const text = modelElementText(row);
        if (!compactModelText(text)) continue;
        seen.add(row);
        rows.push(row);
      }
      rows.sort((a, b) => modelElementArea(a) - modelElementArea(b));
      return rows;
    }
    function geminiTargetMatchesText(modelId, value) {
      const token = compactModelText(value);
      if (!token) return false;
      if (modelId === "pro") return /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token) || token.includes("advanced math and code");
      if (modelId === "thinking") return /(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token) || token.includes("best for most questions");
      if (modelId === "extended") return /(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token) || token.includes("complex problem solving");
      if (modelId === "fast") {
        return /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) || /(^|[^a-z0-9])3\s*\.?\s*1\s*flash\s*-?\s*lite([^a-z0-9]|$)/.test(token) || token.includes("fastest answers");
      }
      if (modelId === "flash35") {
        const hasFlashLite = /(^|[^a-z0-9])flash\s*-?\s*lite([^a-z0-9]|$)/.test(token);
        return /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token) || token.includes("all-around help") || !hasFlashLite && /(^|[^a-z0-9])flash([^a-z0-9]|$)/.test(token);
      }
      return false;
    }
    function scoreGeminiModelItem(item, modelId) {
      const text = modelElementText(item);
      if (!geminiTargetMatchesText(modelId, text)) return -1;
      const token = compactModelText(text);
      const keys = geminiModelKeysFromText(text);
      const rect = modelRect(item);
      let score = 100;
      if (keys.size === 1 && keys.has(modelId)) score += 80;
      if (keys.size > 1) score -= 120;
      if (matches2(item, "button, [role='menuitemradio'], [role='menuitem'], [role='option'], [role='button'], mat-list-option")) score += 35;
      if (modelId === "thinking" && token.includes("thinking level")) score -= 220;
      if (modelId === "extended" && token.includes("thinking level") && !/(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) score -= 160;
      if (modelId === "thinking" && /(^|[^a-z0-9])standard([^a-z0-9]|$)/.test(token)) score += 70;
      if (modelId === "extended" && /(^|[^a-z0-9])extended([^a-z0-9]|$)/.test(token)) score += 70;
      if (modelId === "fast" && /flash\s*-?\s*lite/.test(token)) score += 70;
      if (modelId === "flash35" && /(^|[^a-z0-9])3\s*\.?\s*5\s*flash([^a-z0-9]|$)/.test(token)) score += 70;
      if (modelId === "pro" && /(^|[^a-z0-9])3\s*\.?\s*1\s*pro([^a-z0-9]|$)/.test(token)) score += 70;
      if (rect) {
        if (rect.height >= 26 && rect.height <= 96) score += 20;
        if (rect.width < 80 || rect.height < 18) score -= 80;
      }
      return score;
    }
    function findGeminiModelItem(root, modelId) {
      const candidates = geminiModelItems(root).map((item, index) => ({
        item,
        index,
        score: scoreGeminiModelItem(item, modelId),
        area: modelElementArea(item)
      })).filter((candidate) => candidate.score >= 0);
      candidates.sort((a, b) => b.score - a.score || a.area - b.area || a.index - b.index);
      return candidates[0]?.item || null;
    }
    function findGeminiModelItemInMenus(modelId) {
      for (const root of geminiModelMenuRoots()) {
        const item = findGeminiModelItem(root, modelId);
        if (item) return { root, item };
      }
      return { root: null, item: null };
    }
    function findGeminiThinkingLevelOption(root, modelId) {
      if (modelId !== "thinking" && modelId !== "extended") return null;
      const row = geminiCompactMenuRows(root).filter((row2) => {
        const text = modelElementText(row2);
        const token = compactModelText(text);
        if (!token || token.includes("thinking level")) return false;
        const keys = geminiModelKeysFromText(text);
        if (modelId === "thinking" && keys.has("extended")) return false;
        if (modelId === "extended" && keys.has("thinking")) return false;
        return geminiTargetMatchesText(modelId, text);
      }).sort((a, b) => modelElementArea(a) - modelElementArea(b))[0] || null;
      return geminiActualMenuItem(row, root) || row;
    }
    function findGeminiThinkingLevelOptionInMenus(modelId) {
      for (const root of geminiModelMenuRoots()) {
        const item = findGeminiThinkingLevelOption(root, modelId);
        if (item) return { root, item };
      }
      return { root: null, item: null };
    }
    function geminiActualMenuItem(element, root = null) {
      if (!element) return null;
      const item = element.closest?.("gem-menu-item, button[role='menuitemradio'], button[role='menuitem'], [role='menuitemradio'], [role='menuitem'], [role='option'], mat-list-option") || null;
      if (!item || root && !root.contains?.(item)) return null;
      return item;
    }
    function findGeminiExtendedThinkingToggle(root) {
      if (!root) return null;
      const candidates = [
        ...qsa2("gem-menu-item", root, { all: true }),
        ...geminiModelItems(root)
      ];
      const seen = /* @__PURE__ */ new Set();
      for (const candidate of candidates) {
        const item = geminiActualMenuItem(candidate, root) || candidate;
        if (!item || seen.has(item) || !visible2(item) || isDisabledElement2(item)) continue;
        seen.add(item);
        const token = compactModelText(modelElementText(item));
        if (/\bextended\s+thinking\b/.test(token)) return item;
      }
      return null;
    }
    function geminiElementHasSelectedState(element) {
      if (!element) return false;
      const actualItem = geminiActualMenuItem(element);
      const candidates = actualItem && String(actualItem.tagName || "").toLowerCase() === "gem-menu-item" ? [actualItem] : [element, ...qsa2("*", element).slice(0, 20)];
      for (let node = element.parentElement, guard = 0; node && guard < 5; node = node.parentElement, guard += 1) {
        if (String(node.tagName || "").toLowerCase() === "gem-mode-menu") break;
        candidates.push(node);
      }
      for (const node of candidates) {
        if (node.hasAttribute?.("selected") && String(node.getAttribute?.("selected") || "").trim().toLowerCase() !== "false") return true;
        if (node.hasAttribute?.("checked") && String(node.getAttribute?.("checked") || "").trim().toLowerCase() !== "false") return true;
        if (parseBooleanAttr(node.getAttribute?.("aria-checked")) === true) return true;
        if (parseBooleanAttr(node.getAttribute?.("aria-selected")) === true) return true;
        if (parseBooleanAttr(node.getAttribute?.("aria-pressed")) === true) return true;
        const dataState = String(node.getAttribute?.("data-state") || "").trim().toLowerCase();
        if (["checked", "selected", "active"].includes(dataState)) return true;
        const dataSelected = parseBooleanAttr(node.getAttribute?.("data-selected"));
        if (dataSelected === true) return true;
        const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
        if (/(^|\s)(selected|is-selected|checked|is-checked|active|mdc-list-item--selected|mat-mdc-menu-item-highlighted)(\s|$)/i.test(className)) return true;
      }
      return false;
    }
    async function dismissPreferredModelMenu(context, getMenuRoot, timeoutMs = 700) {
      assertPreferredModelRun(context);
      const getter = typeof getMenuRoot === "function" ? getMenuRoot : () => null;
      if (!getter()) return true;
      armPreferredModelFocusShield(context);
      const KeyboardEventCtor = modelEventConstructor("KeyboardEvent", document);
      if (typeof KeyboardEventCtor === "function") {
        try {
          document.dispatchEvent(new KeyboardEventCtor("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true
          }));
        } catch {
        }
      }
      return Boolean(await waitForPreferredModel(context, () => !getter(), timeoutMs, 80));
    }
    function geminiPickerMatches(baseModelId, thinkingModelId = "") {
      const state = currentGeminiPickerState();
      if (baseModelId && state.baseModelId !== baseModelId) return false;
      if (thinkingModelId === "extended") return state.baseModelId === "pro" && state.thinkingLevel === "extended";
      if (thinkingModelId === "thinking") return state.baseModelId === "pro" && state.thinkingLevel === "standard";
      return Boolean(state.baseModelId);
    }
    async function waitGeminiPickerSettled(context, baseModelId, thinkingModelId = "") {
      return Boolean(await waitForPreferredModel(
        context,
        () => geminiPickerMatches(baseModelId, thinkingModelId),
        2600,
        100
      ));
    }
    async function applyGeminiBaseModelTarget(context, modelId) {
      assertPreferredModelRun(context);
      if (currentGeminiPickerState().baseModelId === modelId) {
        return preferredModelResult(context, true, "Gemini", modelId, "", { skipped: true });
      }
      const root = await openGeminiModelMenu(context);
      if (!root) return preferredModelResult(context, false, "Gemini", modelId, "model menu not found", {
        retryable: context.geminiMenuFailureTerminal !== true
      });
      if (currentGeminiPickerState().baseModelId === modelId) {
        const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return preferredModelResult(context, true, "Gemini", modelId, "", { skipped: true, menuClosed: menuClosed2 });
      }
      const found = findGeminiModelItemInMenus(modelId);
      const foundRoot = found.root || root;
      const item = geminiActualMenuItem(found.item || findGeminiModelItem(foundRoot, modelId), foundRoot) || found.item || findGeminiModelItem(foundRoot, modelId);
      if (!item) {
        const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return preferredModelResult(context, false, "Gemini", modelId, "target model item not found", { menuClosed: menuClosed2 });
      }
      if (!preferredModelActivate(context, item)) {
        const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return preferredModelResult(context, false, "Gemini", modelId, "target model item could not be clicked", { menuClosed: menuClosed2 });
      }
      const settled = await waitGeminiPickerSettled(context, modelId);
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return settled ? preferredModelResult(context, true, "Gemini", modelId, "", { changed: true, menuClosed }) : preferredModelResult(context, false, "Gemini", modelId, "selection did not settle", { menuClosed });
    }
    async function applyGeminiThinkingTarget(context, modelId) {
      assertPreferredModelRun(context);
      const desiredLevel = modelId === "extended" ? "extended" : "standard";
      if (geminiPickerMatches("pro", modelId)) {
        return preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel });
      }
      const root = await openGeminiModelMenu(context);
      if (!root) return preferredModelResult(context, false, "Gemini", "pro", "model menu not found", {
        retryable: context.geminiMenuFailureTerminal !== true,
        thinkingLevel: desiredLevel
      });
      if (geminiPickerMatches("pro", modelId)) {
        const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed: menuClosed2 });
      }
      const toggle = findGeminiExtendedThinkingToggle(root);
      let item = null;
      if (toggle) {
        const selected = geminiElementHasSelectedState(toggle);
        const shouldBeSelected = modelId === "extended";
        if (selected === shouldBeSelected) {
          const settled2 = await waitGeminiPickerSettled(context, "pro", modelId);
          const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
          return settled2 ? preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed: menuClosed2 }) : preferredModelResult(context, false, "Gemini", "pro", "thinking level did not settle", { thinkingLevel: desiredLevel, menuClosed: menuClosed2 });
        }
        item = toggle;
      } else {
        const option = findGeminiThinkingLevelOptionInMenus(modelId);
        const optionRoot = option.root || root;
        item = geminiActualMenuItem(option.item || findGeminiThinkingLevelOption(optionRoot, modelId), optionRoot) || option.item || findGeminiThinkingLevelOption(optionRoot, modelId);
        if (item && geminiElementHasSelectedState(item)) {
          const settled2 = await waitGeminiPickerSettled(context, "pro", modelId);
          const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
          return settled2 ? preferredModelResult(context, true, "Gemini", "pro", "", { skipped: true, thinkingLevel: desiredLevel, menuClosed: menuClosed2 }) : preferredModelResult(context, false, "Gemini", "pro", "thinking level did not settle", { thinkingLevel: desiredLevel, menuClosed: menuClosed2 });
        }
      }
      if (!item) {
        const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return preferredModelResult(context, false, "Gemini", "pro", "thinking level item not found", { thinkingLevel: desiredLevel, menuClosed: menuClosed2 });
      }
      if (!preferredModelActivate(context, item)) {
        const menuClosed2 = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
        return preferredModelResult(context, false, "Gemini", "pro", "thinking level item could not be clicked", { thinkingLevel: desiredLevel, menuClosed: menuClosed2 });
      }
      const settled = await waitGeminiPickerSettled(context, "pro", modelId);
      const menuClosed = await dismissPreferredModelMenu(context, geminiModelMenuRoot);
      return settled ? preferredModelResult(context, true, "Gemini", "pro", "", { changed: true, thinkingLevel: desiredLevel, menuClosed }) : preferredModelResult(context, false, "Gemini", "pro", "selection did not settle", { thinkingLevel: desiredLevel, menuClosed });
    }
    async function applyGeminiPreferredModel(context, modelId, options = {}) {
      if (!GEMINI_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "Gemini", modelId, "unknown model");
      if (modelId === "thinking" || modelId === "extended") return applyGeminiThinkingTarget(context, modelId);
      const thinkingModelId = modelId === "pro" ? geminiThinkingLevelModelId(options?.thinkingLevel) : "";
      if (modelId === "pro" && options?.thinkingLevel && !thinkingModelId) {
        return preferredModelResult(context, false, "Gemini", modelId, "unknown thinking level");
      }
      if (geminiPickerMatches(modelId, thinkingModelId)) {
        return preferredModelResult(context, true, "Gemini", modelId, "", {
          skipped: true,
          ...thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {}
        });
      }
      let baseResult = null;
      if (currentGeminiPickerState().baseModelId !== modelId) {
        baseResult = await applyGeminiBaseModelTarget(context, modelId);
        if (!baseResult.ok) return baseResult;
      }
      let thinkingResult = null;
      if (thinkingModelId && !geminiPickerMatches("pro", thinkingModelId)) {
        thinkingResult = await applyGeminiThinkingTarget(context, thinkingModelId);
        if (!thinkingResult.ok) return thinkingResult;
      }
      const changed = Boolean(baseResult?.changed || thinkingResult?.changed);
      return preferredModelResult(context, true, "Gemini", modelId, "", {
        skipped: !changed,
        changed,
        ...thinkingModelId ? { thinkingLevel: options.thinkingLevel } : {},
        baseApplied: Boolean(baseResult?.changed),
        thinkingApplied: Boolean(thinkingResult?.changed),
        menuClosed: thinkingResult?.menuClosed ?? baseResult?.menuClosed
      });
    }
    return Object.freeze({
      applyGeminiPreferredModel,
      dismissPreferredModelMenu
    });
  }

  // content-src/capabilities/preferred-grok.js
  function createPreferredGrokCapability(deps = {}) {
    const {
      alnumModelToken,
      modelElementArea,
      modelRect,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      modelElementText,
      visibleSelectorElements,
      normalize: normalize2,
      qsa: qsa2,
      qs: qs2,
      compactModelText,
      matches: matches2,
      closest: closest2,
      parseBooleanAttr,
      assertPreferredModelRun,
      waitForPreferredModel,
      preferredModelPointerActivate,
      preferredModelSleep,
      preferredModelResult,
      dismissPreferredModelMenu,
      preferredModelActivate
    } = deps;
    const GROK_MODEL_TARGETS = Object.freeze({
      auto: Object.freeze({ id: "auto", aliases: ["auto", "model auto"] }),
      fast: Object.freeze({ id: "fast", aliases: ["fast", "model fast"] }),
      expert: Object.freeze({ id: "expert", aliases: ["expert", "model expert"] }),
      grok43: Object.freeze({ id: "grok43", aliases: ["grok 4.3", "grok43", "grok 4.3 beta", "grok43beta", "model grok 4.3"] }),
      heavy: Object.freeze({ id: "heavy", aliases: ["heavy", "model heavy"] })
    });
    const GROK_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
      "[role='menu']",
      "[role='listbox']",
      "[role='dialog']",
      "[data-radix-menu-content]",
      "[data-radix-popper-content-wrapper]",
      "[data-radix-portal]",
      "[data-floating-ui-portal]",
      "[data-headlessui-portal]"
    ]);
    const GROK_MODEL_MENU_ITEM_SELECTORS = Object.freeze([
      "[role='menuitemradio']",
      "[role='menuitem']",
      "[role='option']",
      "button",
      "[data-radix-collection-item]",
      "[cmdk-item]"
    ]);
    const GROK_MODEL_TRIGGER_BUTTON_SELECTOR = [
      "button[aria-label='Model select']",
      "[role='button'][aria-label='Model select']",
      "button[aria-label*='model' i][aria-haspopup]",
      "[role='button'][aria-label*='model' i][aria-haspopup]",
      "button[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
      "[data-slot='dropdown-menu-trigger'][aria-label*='model' i]"
    ].join(", ");
    const GROK_MODEL_DIRECT_TRIGGER_SELECTORS = Object.freeze([
      "button",
      "[role='button']",
      "[aria-haspopup='menu']",
      "[aria-haspopup='listbox']",
      "[aria-haspopup='true']",
      "[data-slot='dropdown-menu-trigger']"
    ]);
    const GROK_MODEL_TRIGGER_SELECTORS = Object.freeze([
      "button",
      "[role='button']",
      "[aria-haspopup='menu']",
      "[aria-haspopup='listbox']",
      "[aria-haspopup='true']",
      "button[aria-label='Model select']",
      "[role='button'][aria-label='Model select']",
      "button[aria-label*='model' i][aria-haspopup]",
      "[role='button'][aria-label*='model' i][aria-haspopup]",
      "button[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
      "[data-slot='dropdown-menu-trigger'][aria-label*='model' i]",
      "[data-testid*='model' i]",
      "[data-testid*='mode' i]",
      "[aria-label*='model' i]",
      "[aria-label*='mode' i]",
      "[aria-label*='模型' i]",
      "[aria-label*='模式' i]",
      "[title*='model' i]",
      "[title*='mode' i]",
      "button[aria-haspopup='menu']",
      "button[aria-haspopup='listbox']",
      "button[aria-haspopup='true']",
      "[role='button'][aria-haspopup='menu']",
      "[role='button'][aria-haspopup='listbox']",
      "[role='button'][aria-haspopup='true']"
    ]);
    function grokModelIdFromText(value) {
      for (const [targetId, target] of Object.entries(GROK_MODEL_TARGETS)) {
        if (grokTextLooksLikeTarget(value, target)) return targetId;
      }
      return "";
    }
    function grokTextLooksLikeTarget(value, target) {
      if (!target) return false;
      const parts = String(value || "").split(/\n+/).map((part) => part.trim()).filter(Boolean);
      const values = parts.length ? parts : [String(value || "")];
      for (const part of values) {
        const token = alnumModelToken(part);
        if (!token) continue;
        for (const alias of target.aliases || []) {
          const aliasToken = alnumModelToken(alias);
          if (token === aliasToken || token.startsWith(aliasToken) || aliasToken.startsWith(token) || token.includes(aliasToken)) return true;
        }
      }
      return false;
    }
    function countGrokModelTargets(value) {
      return Object.values(GROK_MODEL_TARGETS).reduce((count, target) => count + (grokTextLooksLikeTarget(value, target) ? 1 : 0), 0);
    }
    function grokModelMenuItemRow(element, root, matchesSpec = null) {
      const rootArea = modelElementArea(root);
      const rootRect = modelRect(root);
      let bestRoleRow = null;
      let bestAction = null;
      let bestRowLike = null;
      let fallback = null;
      let node = element;
      while (node && node.nodeType === 1 && node !== root) {
        if (!visible2(node) || isDisabledElement2(node)) {
          node = node.parentElement || null;
          continue;
        }
        if (typeof matchesSpec === "function" && !matchesSpec(node)) {
          node = node.parentElement || null;
          continue;
        }
        const textValue = modelElementText(node);
        const targetCount = countGrokModelTargets(textValue);
        const area = modelElementArea(node);
        if (rootArea > 0 && area >= rootArea * 0.85) break;
        if (targetCount > 1) {
          node = node.parentElement || null;
          continue;
        }
        const rect = modelRect(node);
        const tag = String(node.tagName || "").toLowerCase();
        const role = String(node.getAttribute?.("role") || "").toLowerCase();
        const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
        const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
        const actionLike = roleRowLike || tag === "button" || role === "button" || tabIndex && tabIndex !== "-1";
        const rowLike = rect && rootRect && rect.height >= 22 && rect.height <= 94 && rect.width >= Math.min(120, rootRect.width * 0.36) && rect.width <= rootRect.width + 32;
        if (roleRowLike && !bestRoleRow) bestRoleRow = node;
        if (actionLike && !bestAction) bestAction = node;
        if (rowLike && !bestRowLike) bestRowLike = node;
        if (!fallback) fallback = node;
        node = node.parentElement || null;
      }
      return bestRoleRow || bestAction || bestRowLike || fallback || element;
    }
    function grokItemCandidates(root) {
      if (!root) return [];
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      const add = (element) => {
        if (!element || !visible2(element) || isDisabledElement2(element)) return;
        const textValue = modelElementText(element);
        if (!grokModelIdFromText(textValue) && countGrokModelTargets(textValue) !== 1) return;
        const item = grokModelMenuItemRow(element, root);
        if (!item || seen.has(item) || !root.contains?.(item) || !visible2(item) || isDisabledElement2(item)) return;
        const itemText = modelElementText(item);
        if (!grokModelIdFromText(itemText) || countGrokModelTargets(itemText) > 1) return;
        seen.add(item);
        candidates.push(item);
      };
      for (const element of visibleSelectorElements(GROK_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "li"], root)) add(element);
      return candidates;
    }
    function grokModelItemText(item) {
      const text = modelElementText(item);
      return text.split(/\n+/).map((part) => part.trim()).find(Boolean) || text;
    }
    function modelDirectText(element) {
      try {
        return normalize2(Array.from(element?.childNodes || []).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || "").join(" "));
      } catch {
        return "";
      }
    }
    function modelColorChannels(value) {
      const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
      if (!match) return null;
      return {
        r: Number(match[1]) || 0,
        g: Number(match[2]) || 0,
        b: Number(match[3]) || 0,
        a: match[4] == null ? 1 : Number(match[4])
      };
    }
    function modelEffectiveOpacity(element, stop = null) {
      let opacity = 1;
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        try {
          opacity *= Math.max(0, Math.min(1, Number(getComputedStyle(node).opacity || 1)));
        } catch {
        }
        if (node === stop) break;
      }
      return opacity;
    }
    function grokModelLabelElements(item, target) {
      if (!item || !target) return [];
      const aliases = (target.aliases || []).map(alnumModelToken).filter(Boolean);
      const elements = [item, ...qsa2("*", item).slice(0, 80)];
      return elements.filter((element) => {
        const own = alnumModelToken(modelDirectText(element));
        if (!own) return false;
        return aliases.some((alias) => own === alias || own.startsWith(alias) || alias.startsWith(own));
      });
    }
    function grokModelElementLooksMuted(element, item) {
      if (!element) return false;
      let style = null;
      try {
        style = getComputedStyle(element);
      } catch {
      }
      if (!style) return false;
      const color = modelColorChannels(style.color);
      const opacity = modelEffectiveOpacity(element, item);
      if (opacity > 0 && opacity < 0.66) return true;
      if (!color) return false;
      const alpha = Number.isFinite(color.a) ? color.a : 1;
      const maxChannel = Math.max(color.r, color.g, color.b);
      return alpha * opacity < 0.72 || maxChannel < 190;
    }
    function grokModelItemLooksUnavailable(item, modelId) {
      const target = GROK_MODEL_TARGETS[modelId] || null;
      if (!item || !target) return false;
      if (isDisabledElement2(item)) return true;
      for (let node = item, depth = 0; node && node.nodeType === 1 && depth < 5; node = node.parentElement, depth += 1) {
        if (isDisabledElement2(node)) return true;
        const ariaDisabled = String(node.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
        const dataDisabled = String(node.getAttribute?.("data-disabled") || "").trim().toLowerCase();
        const dataState = String(node.getAttribute?.("data-state") || "").trim().toLowerCase();
        const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
        if (ariaDisabled === "true" || dataDisabled === "true" || dataState === "disabled") return true;
        if (/(^|\s)(disabled|is-disabled|unavailable|locked|is-locked|paywall|requires-upgrade|opacity-50|pointer-events-none)(\s|$)/i.test(className)) return true;
        try {
          const style = getComputedStyle(node);
          if (style.pointerEvents === "none") return true;
          if (Number(style.opacity || 1) > 0 && Number(style.opacity || 1) < 0.55) return true;
        } catch {
        }
        if (node.getAttribute?.("role") === "menu" || node.getAttribute?.("role") === "listbox") break;
      }
      const labels = grokModelLabelElements(item, target);
      return labels.length > 0 && labels.every((element) => grokModelElementLooksMuted(element, item));
    }
    function grokTextStartsWithAlias(value, alias) {
      const token = alnumModelToken(value);
      const aliasToken = alnumModelToken(alias);
      return Boolean(token && aliasToken && (token === aliasToken || token.startsWith(aliasToken)));
    }
    function grokMenuRootLooksLikeModel(root) {
      if (!root || !visible2(root)) return false;
      const rootText = modelElementText(root);
      const rootSignal = /\b(model|mode|grok)\b|模型|模式/i.test(rootText);
      let targetCount = 0;
      for (const item of grokItemCandidates(root)) {
        if (grokModelIdFromText(modelElementText(item))) targetCount += 1;
        if (targetCount >= 2) return true;
      }
      return Boolean(countGrokModelTargets(rootText) >= 2 || grokModelIdFromText(rootText) && (rootSignal || targetCount >= 1));
    }
    function grokModelMenuRoot(triggerEl = null) {
      if (triggerEl) {
        const controlsId = String(triggerEl.getAttribute?.("aria-controls") || "").trim();
        if (controlsId) {
          const controlled = document.getElementById(controlsId);
          if (grokMenuRootLooksLikeModel(controlled)) return controlled;
        }
        const triggerId = String(triggerEl.getAttribute?.("id") || "").trim();
        if (triggerId) {
          const escapedTriggerId = triggerId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          for (const selector of GROK_MODEL_MENU_ROOT_SELECTORS) {
            const labelled = qs2(`${selector}[aria-labelledby="${escapedTriggerId}"]`);
            if (grokMenuRootLooksLikeModel(labelled)) return labelled;
          }
        }
      }
      const roots = visibleSelectorElements(GROK_MODEL_MENU_ROOT_SELECTORS).filter(grokMenuRootLooksLikeModel).sort((a, b) => Number(a.getBoundingClientRect?.().bottom || 0) - Number(b.getBoundingClientRect?.().bottom || 0));
      return roots[roots.length - 1] || null;
    }
    function grokTextLooksLikeComposerPrompt(value) {
      const textValue = compactModelText(value);
      return Boolean(textValue && (textValue.includes("ask anything") || textValue.includes("message grok") || textValue.includes("ask grok") || textValue.includes("what can i help") || textValue.includes("message") || textValue.includes("prompt") || textValue.includes("输入") || textValue.includes("提问") || textValue.includes("问我")));
    }
    function grokComposerCandidateText(element) {
      if (!element) return "";
      return [
        element.getAttribute?.("placeholder"),
        element.getAttribute?.("aria-placeholder"),
        element.getAttribute?.("data-placeholder"),
        modelElementText(element)
      ].filter(Boolean).join(" ");
    }
    function isLikelyGrokComposerRect(rect) {
      if (!rect || rect.width < 260 || rect.height < 36 || rect.height > 260) return false;
      const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
      const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
      if (viewportWidth > 0 && rect.right < viewportWidth * 0.3) return false;
      if (viewportHeight > 0 && rect.bottom < viewportHeight * 0.35) return false;
      return true;
    }
    function findGrokComposerRoot() {
      const selector = [
        "textarea",
        '[contenteditable="true"]',
        '[role="textbox"]',
        "[data-placeholder]",
        "[aria-placeholder]",
        "form",
        "[data-testid*='composer' i]",
        "[data-testid*='prompt' i]",
        "div"
      ].join(", ");
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      for (const element of visibleSelectorElements(selector)) {
        if (!element || seen.has(element)) continue;
        seen.add(element);
        if (!grokTextLooksLikeComposerPrompt(grokComposerCandidateText(element))) continue;
        let node = element;
        let best = element;
        while (node && node.nodeType === 1 && node !== document.body) {
          const rect2 = modelRect(node);
          if (rect2 && rect2.width >= 280 && rect2.height >= 40 && rect2.height <= 260) best = node;
          node = node.parentElement || null;
        }
        const rect = modelRect(best);
        if (!rect || !isLikelyGrokComposerRect(rect)) continue;
        candidates.push({ element: best, score: rect.bottom + Math.min(260, rect.width) });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.element || null;
    }
    function isGrokModelTriggerNearComposer(element, composerRoot = null, composerRect = null) {
      if (!element) return false;
      if (composerRoot?.contains?.(element)) return true;
      const rect = modelRect(element);
      if (!rect || !composerRect || !isLikelyGrokComposerRect(composerRect)) return false;
      const inComposerY = rect.top >= composerRect.top - 14 && rect.bottom <= composerRect.bottom + 14;
      const inComposerX = rect.left >= composerRect.left - 14 && rect.right <= composerRect.right + 14;
      const controlSized = rect.width >= 20 && rect.width <= 220 && rect.height >= 18 && rect.height <= 80;
      return inComposerY && inComposerX && controlSized;
    }
    function grokModelTriggerLooksLikeVoiceControl(value) {
      return /\b(voice|dictation|microphone|mic|record(?:ing)?|audio|speech|speak)\b|语音|麦克风|录音|听写/i.test(String(value || ""));
    }
    function grokModelTriggerHasModelSignal(value) {
      const textValue = String(value || "");
      if (/\bmodel\b|模型|模式/i.test(textValue)) return true;
      return /\bmode\b/i.test(textValue) && !/\bvoice\s+mode\b/i.test(textValue);
    }
    function grokModelTriggerButton(element) {
      if (!element) return null;
      if (matches2(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR)) return element;
      return closest2(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR) || closest2(element, "button, [role='button']") || element;
    }
    function directGrokModelTriggerBoost(element) {
      if (!element || !visible2(element) || isDisabledElement2(element)) return 0;
      const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
      if (element.closest?.(rootsSelector)) return 0;
      const textValue = modelElementText(element);
      const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
      const title = String(element.getAttribute?.("title") || "").trim();
      const dataSlot = String(element.getAttribute?.("data-slot") || "").trim();
      const dataTestId = String(element.getAttribute?.("data-testid") || "").trim();
      const searchValue = [textValue, ariaLabel, title, dataSlot, dataTestId].filter(Boolean).join(" ");
      const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(ariaLabel) || grokModelIdFromText(searchValue);
      const modelSelect = /\bmodel\s*select\b/i.test(searchValue);
      const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      if (grokModelTriggerLooksLikeVoiceControl(searchValue) && !targetId && !modelSelect) return 0;
      if (!targetId && !modelSelect) return 0;
      let score = 650;
      if (modelSelect) score += 520;
      if (targetId) score += 240;
      if (popup === "menu" || popup === "listbox" || popup === "true") score += 120;
      if (dataSlot === "dropdown-menu-trigger") score += 80;
      if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 30;
      return score;
    }
    function scoreGrokModelTrigger(element, options = {}) {
      if (!element || !visible2(element) || isDisabledElement2(element)) return -1;
      const rootsSelector = GROK_MODEL_MENU_ROOT_SELECTORS.join(", ");
      if (element.closest?.(rootsSelector)) return -1;
      const textValue = modelElementText(element);
      const dataTestId = String(element.getAttribute?.("data-testid") || "");
      const ariaLabel = String(element.getAttribute?.("aria-label") || "").trim();
      const title = String(element.getAttribute?.("title") || "");
      const searchValue = [textValue, dataTestId, ariaLabel, title].filter(Boolean).join(" ");
      const targetId = grokModelIdFromText(textValue) || grokModelIdFromText(searchValue);
      const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      const nearComposer = isGrokModelTriggerNearComposer(element, options.composerRoot || null, options.composerRect || null);
      const hasModelSignal = grokModelTriggerHasModelSignal(searchValue);
      const hasGrokSignal = /\bgrok\b/i.test(searchValue);
      const exactModelTrigger = matches2(element, GROK_MODEL_TRIGGER_BUTTON_SELECTOR);
      if (grokModelTriggerLooksLikeVoiceControl(searchValue) && !targetId && !/\bmodel\b|模型|模式/i.test(searchValue)) return -1;
      let score = 0;
      if (exactModelTrigger) score += 800;
      if (targetId) score += 500;
      if (nearComposer) score += 360;
      if (hasModelSignal) score += 320;
      if (hasGrokSignal) score += 120;
      if (popup === "menu" || popup === "listbox" || popup === "true") score += 110;
      if (parseBooleanAttr(element.getAttribute?.("aria-expanded")) !== null) score += 20;
      if (parseBooleanAttr(element.getAttribute?.("aria-pressed")) !== null) score += 10;
      if (options.composerRoot && !nearComposer && !targetId && !hasModelSignal) score -= 260;
      const compact = compactModelText(textValue);
      const allowIconLikeComposerControl = nearComposer && (popup === "menu" || popup === "listbox" || popup === "true" || compact.length <= 36);
      if (!targetId && !hasModelSignal && !allowIconLikeComposerControl) return -1;
      return score > 0 ? score : -1;
    }
    function grokModelTriggerCandidates() {
      const composerRoot = findGrokComposerRoot();
      const composerRect = modelRect(composerRoot);
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      const add = (element, boost = 0) => {
        const trigger = grokModelTriggerButton(element);
        if (!trigger || seen.has(trigger)) return;
        seen.add(trigger);
        const score = scoreGrokModelTrigger(trigger, { composerRoot, composerRect });
        if (score <= 0 && boost <= 0) return;
        candidates.push({ element: trigger, score: Math.max(0, score) + boost, bottom: Number(trigger.getBoundingClientRect?.().bottom || 0) });
      };
      for (const element of visibleSelectorElements(GROK_MODEL_DIRECT_TRIGGER_SELECTORS)) {
        add(element, directGrokModelTriggerBoost(grokModelTriggerButton(element) || element));
      }
      for (const element of visibleSelectorElements(GROK_MODEL_TRIGGER_SELECTORS)) {
        add(element);
      }
      candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
      return candidates;
    }
    function findGrokModelTrigger() {
      return grokModelTriggerCandidates()[0]?.element || null;
    }
    async function openGrokModelMenu(context) {
      assertPreferredModelRun(context);
      const existing = grokModelMenuRoot();
      if (existing) return existing;
      const trigger = await waitForPreferredModel(context, findGrokModelTrigger, 1e4, 150);
      if (!trigger || !preferredModelPointerActivate(context, trigger)) return null;
      return await waitForPreferredModel(context, () => grokModelMenuRoot(trigger), 1200, 90) || null;
    }
    function currentGrokModelId() {
      const trigger = findGrokModelTrigger();
      const current = grokModelIdFromText(modelElementText(trigger));
      if (current) return current;
      const root = grokModelMenuRoot();
      if (!root) return "";
      const selected = grokItemCandidates(root).find((item) => {
        const state = String(item.getAttribute?.("data-state") || "").trim().toLowerCase();
        const ariaChecked = String(item.getAttribute?.("aria-checked") || "").trim().toLowerCase();
        const ariaSelected = String(item.getAttribute?.("aria-selected") || "").trim().toLowerCase();
        return state === "checked" || state === "selected" || state === "active" || ariaChecked === "true" || ariaSelected === "true";
      });
      return grokModelIdFromText(modelElementText(selected));
    }
    function findGrokModelItem(root, modelId, options = {}) {
      const target = GROK_MODEL_TARGETS[modelId];
      if (!target) return null;
      const matchesTarget = (element) => grokTextLooksLikeTarget(modelElementText(element), target);
      for (const item of grokItemCandidates(root)) {
        if (!options.includeUnavailable && grokModelItemLooksUnavailable(item, modelId)) continue;
        const itemText = grokModelItemText(item);
        if (grokModelIdFromText(itemText) === modelId) return item;
        if (matchesTarget(item)) return item;
        for (const alias of target.aliases || []) {
          if (grokTextStartsWithAlias(itemText, alias)) return item;
        }
      }
      return null;
    }
    async function waitGrokModelSettled(context, modelId) {
      const deadline = Date.now() + 2e3;
      while (Date.now() <= deadline) {
        assertPreferredModelRun(context);
        const current = currentGrokModelId();
        if (current && current === modelId) return true;
        await preferredModelSleep(context, 120);
      }
      assertPreferredModelRun(context);
      const final = currentGrokModelId();
      return final === modelId;
    }
    async function applyGrokPreferredModel(context, modelId) {
      if (!GROK_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "Grok", modelId, "unknown model");
      assertPreferredModelRun(context);
      if (currentGrokModelId() === modelId) return preferredModelResult(context, true, "Grok", modelId, "", { skipped: true });
      const root = await openGrokModelMenu(context);
      if (!root) return preferredModelResult(context, false, "Grok", modelId, "model menu not found", { retryable: true });
      const maybeItem = findGrokModelItem(root, modelId, { includeUnavailable: true });
      if (maybeItem && grokModelItemLooksUnavailable(maybeItem, modelId)) {
        const menuClosed2 = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
        return preferredModelResult(context, true, "Grok", modelId, "", { skipped: true, unavailable: true, menuClosed: menuClosed2 });
      }
      const item = maybeItem || findGrokModelItem(root, modelId);
      if (!item) {
        const menuClosed2 = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
        return preferredModelResult(context, false, "Grok", modelId, "target model item not found", { menuClosed: menuClosed2 });
      }
      if (!preferredModelActivate(context, item)) {
        const menuClosed2 = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
        return preferredModelResult(context, false, "Grok", modelId, "target model item could not be clicked", { menuClosed: menuClosed2 });
      }
      const settled = await waitGrokModelSettled(context, modelId);
      const menuClosed = await dismissPreferredModelMenu(context, () => grokModelMenuRoot());
      return settled ? preferredModelResult(context, true, "Grok", modelId, "", { changed: true, menuClosed }) : preferredModelResult(context, false, "Grok", modelId, "selection did not settle", { menuClosed });
    }
    return Object.freeze({
      applyGrokPreferredModel
    });
  }

  // content-src/capabilities/preferred-notion-deepseek.js
  function createPreferredNotionDeepSeekCapability(deps = {}) {
    const {
      normalize: normalize2,
      modelElementText,
      visibleSelectorElements,
      modelRect,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      assertPreferredModelRun,
      preferredModelActivate,
      waitForPreferredModel,
      modelElementArea,
      preferredModelSleep,
      dismissPreferredModelMenu,
      preferredModelResult,
      alnumModelToken,
      closest: closest2,
      applyGeminiPreferredModel,
      applyGrokPreferredModel,
      abortActivePreferredModelRun,
      nextPreferredModelBridgeRunSequence,
      preferredModelState,
      publishPreferredModelBridgeRun,
      preferredModelCancelled,
      preferredModelAbortReason,
      releasePreferredModelBridgeRun,
      modelResult
    } = deps;
    const NOTION_MODEL_TARGETS = Object.freeze({
      auto: Object.freeze({ id: "auto", label: "Auto", aliases: ["Automatic"] }),
      sonnet46: Object.freeze({ id: "sonnet46", label: "Claude Sonnet 4.6", aliases: ["Sonnet 4.6"] }),
      opus47: Object.freeze({ id: "opus47", label: "Claude Opus 4.7", aliases: ["Opus 4.7"] }),
      opus48: Object.freeze({ id: "opus48", label: "Claude Opus 4.8", aliases: ["Opus 4.8"] }),
      gemini31pro: Object.freeze({ id: "gemini31pro", label: "Gemini 3.1 Pro", aliases: ["Gemini Pro"] }),
      gpt52: Object.freeze({ id: "gpt52", label: "GPT-5.2", aliases: ["GPT 5.2"] }),
      gpt54: Object.freeze({ id: "gpt54", label: "GPT-5.4", aliases: ["GPT 5.4"] }),
      gpt55: Object.freeze({ id: "gpt55", label: "GPT-5.5", aliases: ["GPT 5.5"] }),
      grok43: Object.freeze({ id: "grok43", label: "Grok 4.3", aliases: ["Grok 43", "grok43"] }),
      grokBuild01: Object.freeze({ id: "grokBuild01", label: "Grok Build 0.1", aliases: ["Grok Build 01", "Grok Build"] }),
      kimi26: Object.freeze({ id: "kimi26", label: "Kimi K2.6", aliases: ["Kimi K2.6"] }),
      deepseekV4Pro: Object.freeze({ id: "deepseekV4Pro", label: "DeepSeek V4 Pro", aliases: ["DeepSeek V4"] }),
      glm52: Object.freeze({ id: "glm52", label: "GLM 5.2", aliases: ["GLM-5.2", "GLM"] })
    });
    const NOTION_MODEL_TRIGGER_SELECTORS = Object.freeze([
      '[data-testid="unified-chat-model-button"]',
      '[data-testid*="model" i]',
      '[aria-label*="model" i]',
      '[aria-label*="模型" i]',
      'button[aria-label*="model" i]',
      'button[aria-label*="模型" i]',
      'button[aria-haspopup="menu"]',
      'button[aria-haspopup="listbox"]',
      '[role="button"][aria-label*="model" i]',
      '[role="button"][aria-label*="模型" i]',
      '[role="button"][aria-haspopup="menu"]',
      '[role="button"][aria-haspopup="listbox"]',
      '[role="combobox"]',
      "button"
    ]);
    const NOTION_MODEL_MENU_ROOT_SELECTORS = Object.freeze([
      '[role="menu"]',
      '[role="listbox"]',
      '[role="dialog"]',
      "[data-radix-menu-content]",
      "[data-radix-popper-content-wrapper]",
      "[data-radix-portal]",
      "[data-floating-ui-portal]",
      '[data-floating-ui-portal] [role="menu"]'
    ]);
    const NOTION_MODEL_MENU_ITEM_SELECTORS = Object.freeze([
      '[role="menuitem"]',
      '[role="menuitemradio"]',
      '[role="option"]',
      '[role="button"]',
      "[data-model]",
      "[data-value]",
      "button",
      '[tabindex]:not([tabindex="-1"])'
    ]);
    function notionText(value) {
      return normalize2(value).toLowerCase().replace(/\s+/g, " ");
    }
    function notionLabels(target) {
      return [target?.label, ...target?.aliases || []].map(notionText).filter(Boolean);
    }
    function notionTextLooksLikeTarget(value, target) {
      const textValue = notionText(value);
      if (!textValue || !target) return false;
      if (notionLabels(target).some((label) => textValue === label || textValue.includes(label))) return true;
      if (target.id === "gemini31pro") return textValue.includes("gemini") && textValue.includes("pro");
      if (target.id === "opus48") return textValue.includes("opus") && textValue.includes("4.8");
      if (target.id === "opus47") return textValue.includes("opus") && textValue.includes("4.7");
      if (target.id === "sonnet46") return textValue.includes("sonnet") && textValue.includes("4.6");
      if (target.id === "grok43") return textValue.includes("grok") && textValue.includes("4.3");
      if (target.id === "grokBuild01") return textValue.includes("grok") && textValue.includes("build");
      if (target.id === "deepseekV4Pro") return textValue.includes("deepseek") && textValue.includes("v4");
      if (target.id === "kimi26") return textValue.includes("kimi") && textValue.includes("k2.6");
      if (target.id === "glm52") return textValue.includes("glm") && textValue.includes("5.2");
      return false;
    }
    function notionModelIdFromText(value) {
      for (const [id, target] of Object.entries(NOTION_MODEL_TARGETS)) {
        if (notionTextLooksLikeTarget(value, target)) return id;
      }
      return "";
    }
    function countNotionModelTargets(value) {
      return Object.values(NOTION_MODEL_TARGETS).reduce((count, target) => count + (notionTextLooksLikeTarget(value, target) ? 1 : 0), 0);
    }
    function notionViewportSize() {
      return {
        width: Number(window.innerWidth || document.documentElement?.clientWidth || 0),
        height: Number(window.innerHeight || document.documentElement?.clientHeight || 0)
      };
    }
    function isLikelyNotionMainComposerRect(rect) {
      if (!rect || rect.width < 280 || rect.height < 40 || rect.height > 280) return false;
      const viewport = notionViewportSize();
      if (viewport.width > 0 && rect.right < viewport.width * 0.35) return false;
      if (viewport.height > 0 && rect.bottom < viewport.height * 0.28) return false;
      return true;
    }
    function notionTextLooksLikeComposerPrompt(value) {
      const textValue = notionText(value);
      return Boolean(textValue && (textValue.includes("do anything with ai") || textValue.includes("ask anything") || textValue.includes("what can i help") || textValue.includes("what should i help") || textValue.includes("prompt") || textValue.includes("message") || textValue.includes("send a message") || textValue.includes("提问") || textValue.includes("输入") || textValue.includes("问我")));
    }
    function notionComposerCandidateText(element) {
      if (!element) return "";
      return [
        element.getAttribute?.("placeholder"),
        element.getAttribute?.("aria-placeholder"),
        element.getAttribute?.("data-placeholder"),
        modelElementText(element)
      ].filter(Boolean).join(" ");
    }
    function findNotionComposerRoot() {
      const selector = [
        "textarea",
        '[contenteditable="true"]',
        '[role="textbox"]',
        "[data-placeholder]",
        "[aria-placeholder]",
        "form",
        "div"
      ].join(", ");
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      for (const element of visibleSelectorElements(selector)) {
        if (!element || seen.has(element)) continue;
        seen.add(element);
        if (!notionTextLooksLikeComposerPrompt(notionComposerCandidateText(element))) continue;
        let node = element;
        let best = element;
        let bestScore = -1;
        while (node && node.nodeType === 1 && node !== document.body) {
          const rect2 = modelRect(node);
          if (rect2 && rect2.width >= 320 && rect2.height >= 44 && rect2.height <= 260) {
            best = node;
          }
          node = node.parentElement || null;
        }
        const rect = modelRect(best);
        if (!rect || !isLikelyNotionMainComposerRect(rect)) continue;
        bestScore = rect.bottom + Math.min(300, rect.width);
        candidates.push({ element: best, score: bestScore });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.element || null;
    }
    function isNotionModelTriggerNearMainComposer(element, composerRoot = null, composerRect = null) {
      if (!element) return false;
      if (composerRoot?.contains?.(element)) return true;
      const rect = modelRect(element);
      if (!rect || !composerRect || !isLikelyNotionMainComposerRect(composerRect)) return false;
      const inComposerY = rect.top >= composerRect.top - 12 && rect.bottom <= composerRect.bottom + 12;
      const inComposerX = rect.left >= composerRect.left - 12 && rect.right <= composerRect.right + 12;
      const controlSized = rect.width >= 24 && rect.width <= 180 && rect.height >= 20 && rect.height <= 76;
      return inComposerY && inComposerX && controlSized;
    }
    function scoreNotionModelTrigger(element, options = {}) {
      if (!element || !visible2(element) || !options.allowDisabled && isDisabledElement2(element)) return -1;
      if (element.closest?.(NOTION_MODEL_MENU_ROOT_SELECTORS.join(", "))) return -1;
      const textValue = modelElementText(element);
      const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
      const ariaLabel = String(element.getAttribute?.("aria-label") || "");
      const title = String(element.getAttribute?.("title") || "");
      const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      const nearMainComposer = isNotionModelTriggerNearMainComposer(element, options.composerRoot || null, options.composerRect || null);
      let score = 0;
      if (nearMainComposer) score += 900;
      if (options.composerRoot && !nearMainComposer) score -= 420;
      if (dataTestId === "unified-chat-model-button") score += 1e3;
      if (dataTestId.includes("model")) score += 500;
      if (/\bmodel\b|模型/i.test(ariaLabel)) score += 420;
      if (/\bmodel\b|模型/i.test(title)) score += 320;
      if (notionModelIdFromText(textValue)) score += 360;
      if (popup === "menu" || popup === "listbox") score += 80;
      if (notionText(textValue) === "auto" || notionTextLooksLikeTarget(textValue, NOTION_MODEL_TARGETS.auto)) score += 80;
      return score > 0 ? score : -1;
    }
    function findNotionModelControl({ allowDisabled = false } = {}) {
      const composerRoot = findNotionComposerRoot();
      const composerRect = modelRect(composerRoot);
      const candidates = visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS).map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { composerRoot, composerRect, allowDisabled }),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      })).filter((item) => item.score > 0);
      candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
      return candidates[0]?.element || null;
    }
    function findNotionModelTrigger() {
      return findNotionModelControl();
    }
    function findNotionModelIndicator() {
      return findNotionModelControl({ allowDisabled: true });
    }
    function scoreNotionModelMenuRoot(root) {
      if (!root || !visible2(root)) return -1;
      const textValue = modelElementText(root);
      const normalized = notionText(textValue);
      let score = 0;
      if (normalized.includes("select a model")) score += 160;
      if (normalized.includes("open models")) score += 80;
      score += Math.min(5, countNotionModelTargets(textValue)) * 80;
      return score >= 160 ? score : -1;
    }
    function notionModelMenuRoot(trigger = null) {
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      if (controlsId) {
        const controlled = document.getElementById(controlsId);
        if (scoreNotionModelMenuRoot(controlled) > 0) return controlled;
      }
      const roots = visibleSelectorElements(NOTION_MODEL_MENU_ROOT_SELECTORS).map((element) => ({ element, score: scoreNotionModelMenuRoot(element) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
      return roots[0]?.element || null;
    }
    async function openNotionModelMenu(context, trigger) {
      assertPreferredModelRun(context);
      const existing = notionModelMenuRoot(trigger);
      if (existing) return existing;
      if (!trigger || !preferredModelActivate(context, trigger)) return null;
      return waitForPreferredModel(context, () => notionModelMenuRoot(trigger), 3e3, 120);
    }
    function notionMenuItemRow(element, root, matchesSpec = null) {
      const rootArea = modelElementArea(root);
      const rootRect = modelRect(root);
      let bestRoleRow = null;
      let bestAction = null;
      let bestRowLike = null;
      let fallback = null;
      let node = element;
      while (node && node.nodeType === 1 && node !== root) {
        if (!visible2(node) || isDisabledElement2(node)) {
          node = node.parentElement || null;
          continue;
        }
        const textValue = modelElementText(node);
        const targetCount = countNotionModelTargets(textValue);
        const area = modelElementArea(node);
        if (rootArea > 0 && area >= rootArea * 0.85) break;
        if (typeof matchesSpec === "function" && !matchesSpec(node)) {
          node = node.parentElement || null;
          continue;
        }
        if (targetCount > 1) {
          node = node.parentElement || null;
          continue;
        }
        const rect = modelRect(node);
        const tag = String(node.tagName || "").toLowerCase();
        const role = String(node.getAttribute?.("role") || "").toLowerCase();
        const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
        const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
        const actionLike = roleRowLike || tag === "button" || role === "button" || tabIndex && tabIndex !== "-1";
        const rowLike = rect && rootRect && rect.height >= 22 && rect.height <= 88 && rect.width >= Math.min(120, rootRect.width * 0.38) && rect.width <= rootRect.width + 32;
        if (roleRowLike && !bestRoleRow) bestRoleRow = node;
        if (actionLike && !bestAction) bestAction = node;
        if (rowLike && !bestRowLike) bestRowLike = node;
        if (!fallback) fallback = node;
        node = node.parentElement || null;
      }
      return bestRoleRow || bestAction || bestRowLike || fallback || element;
    }
    function scoreNotionModelItem(element, modelId) {
      if (!element || !visible2(element) || isDisabledElement2(element)) return Number.NEGATIVE_INFINITY;
      const textValue = modelElementText(element);
      const target = NOTION_MODEL_TARGETS[modelId];
      let score = 0;
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const tag = String(element.tagName || "").toLowerCase();
      const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
      const targetCount = countNotionModelTargets(textValue);
      if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
      if (tag === "button" || role === "button") score += 360;
      if (tabIndex && tabIndex !== "-1") score += 120;
      if (targetCount === 1) score += 260;
      if (targetCount > 1) score -= 700;
      if (notionTextLooksLikeTarget(textValue, target)) score += 620;
      const labels = notionLabels(target);
      if (labels.includes(notionText(textValue))) score += 260;
      const rect = modelRect(element);
      if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
      if (rect && rect.width >= 120) score += 40;
      score -= Math.min(160, modelElementArea(element) / 6e3);
      return score;
    }
    function findNotionModelItem(root, modelId) {
      if (!root || !NOTION_MODEL_TARGETS[modelId]) return null;
      const target = NOTION_MODEL_TARGETS[modelId];
      const matchesSpec = (element) => notionTextLooksLikeTarget(modelElementText(element), target);
      const seenRows = /* @__PURE__ */ new Set();
      const rows = [];
      const add = (element) => {
        if (!element || !matchesSpec(element)) return;
        const row = notionMenuItemRow(element, root, matchesSpec);
        if (!row || seenRows.has(row) || !root.contains?.(row)) return;
        if (!matchesSpec(row)) return;
        if (countNotionModelTargets(modelElementText(row)) > 1) return;
        seenRows.add(row);
        rows.push(row);
      };
      for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
      rows.sort((a, b) => scoreNotionModelItem(b, modelId) - scoreNotionModelItem(a, modelId));
      return rows[0] || null;
    }
    function notionElementHasSelectedState(element) {
      if (!element) return false;
      for (const attr of ["aria-checked", "aria-selected", "aria-current", "data-state", "data-selected", "data-active", "data-checked"]) {
        const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
        if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page") return true;
      }
      const className = String(element.className || "");
      return /\b(?:selected|checked|active)\b/i.test(className) && !/\b(?:unselected|inactive|unchecked)\b/i.test(className);
    }
    function notionRowHasRightCheckMarker(row) {
      const rowRect = modelRect(row);
      if (!rowRect || rowRect.width <= 0 || rowRect.height <= 0) return false;
      if (/[✓✔]/.test(String(row?.innerText || row?.textContent || ""))) return true;
      for (const marker of visibleSelectorElements([
        "[aria-label*='check' i]",
        "[aria-label*='selected' i]",
        "[data-testid*='check' i]",
        "[class*='check' i]",
        "svg"
      ], row)) {
        if (notionElementHasSelectedState(marker)) return true;
        const label = [
          marker.getAttribute?.("aria-label"),
          marker.getAttribute?.("data-testid"),
          marker.getAttribute?.("class"),
          marker.getAttribute?.("title"),
          marker.innerText || marker.textContent || ""
        ].filter(Boolean).join(" ");
        if (/\b(?:check|checked|selected|done)\b|✓|✔/i.test(label)) return true;
        const rect = modelRect(marker);
        if (!rect || rect.width < 5 || rect.height < 5 || rect.width > 32 || rect.height > 32) continue;
        const nearRight = rect.left >= rowRect.left + rowRect.width * 0.66 && rect.right <= rowRect.right + 10;
        const verticallyInside = rect.top >= rowRect.top - 3 && rect.bottom <= rowRect.bottom + 3;
        if (nearRight && verticallyInside) return true;
      }
      return false;
    }
    function notionRowLooksSelected(row) {
      if (!row) return false;
      if (notionElementHasSelectedState(row)) return true;
      for (const element of visibleSelectorElements([
        "[aria-checked]",
        "[aria-selected]",
        "[aria-current]",
        "[data-state]",
        "[data-selected]",
        "[data-active]",
        "[data-checked]"
      ], row)) {
        if (notionElementHasSelectedState(element)) return true;
      }
      return notionRowHasRightCheckMarker(row);
    }
    function selectedNotionModelId(root) {
      if (!root) return "";
      const seenRows = /* @__PURE__ */ new Set();
      const rows = [];
      const add = (element) => {
        if (!element) return;
        const row = notionMenuItemRow(element, root);
        if (!row || seenRows.has(row) || !root.contains?.(row)) return;
        const textValue = modelElementText(row);
        if (countNotionModelTargets(textValue) !== 1) return;
        const id = notionModelIdFromText(textValue);
        if (!id || !notionRowLooksSelected(row)) return;
        seenRows.add(row);
        rows.push({ element: row, id, score: scoreNotionModelItem(row, id) });
      };
      for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "button", "svg"], root)) add(element);
      rows.sort((a, b) => b.score - a.score);
      return rows[0]?.id || "";
    }
    function currentNotionModelId(trigger = null) {
      const selected = selectedNotionModelId(notionModelMenuRoot(trigger));
      if (selected) return selected;
      const triggerElement = trigger && visible2(trigger) ? trigger : findNotionModelIndicator();
      return notionModelIdFromText(modelElementText(triggerElement));
    }
    async function waitNotionReadableCurrentModelId(context, trigger = null, timeoutMs = 2200) {
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        assertPreferredModelRun(context);
        const current = currentNotionModelId(trigger);
        if (current) return current;
        await preferredModelSleep(context, 120);
      }
      assertPreferredModelRun(context);
      return currentNotionModelId(trigger);
    }
    async function closeNotionModelMenu(context, trigger = null) {
      return dismissPreferredModelMenu(context, () => notionModelMenuRoot(trigger), 900);
    }
    async function waitNotionModelSettled(context, modelId, trigger) {
      const deadline = Date.now() + 3e3;
      while (Date.now() <= deadline) {
        assertPreferredModelRun(context);
        const current = currentNotionModelId(trigger);
        if (current && current === modelId) return true;
        await preferredModelSleep(context, 120);
      }
      assertPreferredModelRun(context);
      const final = currentNotionModelId(trigger);
      return final === modelId;
    }
    async function applyNotionPreferredModel(context, modelId) {
      if (!NOTION_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "NotionAI", modelId, "unknown model");
      if (await waitNotionReadableCurrentModelId(context, null, 1600) === modelId) {
        const menuClosed2 = await closeNotionModelMenu(context);
        return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed: menuClosed2 });
      }
      const trigger = await waitForPreferredModel(context, findNotionModelTrigger, 1e4, 150);
      if (!trigger) {
        await closeNotionModelMenu(context);
        return preferredModelResult(context, false, "NotionAI", modelId, "model trigger not found", { retryable: true });
      }
      if (await waitNotionReadableCurrentModelId(context, trigger, 2200) === modelId) {
        const menuClosed2 = await closeNotionModelMenu(context, trigger);
        return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed: menuClosed2 });
      }
      const root = await openNotionModelMenu(context, trigger);
      if (!root) {
        await closeNotionModelMenu(context, trigger);
        return preferredModelResult(context, false, "NotionAI", modelId, "model menu not found", { retryable: true });
      }
      if (currentNotionModelId(trigger) === modelId) {
        const menuClosed2 = await closeNotionModelMenu(context, trigger);
        return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed: menuClosed2 });
      }
      const item = findNotionModelItem(root, modelId);
      if (!item) {
        const menuClosed2 = await closeNotionModelMenu(context, trigger);
        return preferredModelResult(context, false, "NotionAI", modelId, "target model item not found", { menuClosed: menuClosed2 });
      }
      const clicked = preferredModelActivate(context, item);
      let settled = clicked ? await waitNotionModelSettled(context, modelId, trigger) : false;
      const menuClosed = await closeNotionModelMenu(context, trigger);
      if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
      if (!clicked) return preferredModelResult(context, false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
      return settled ? preferredModelResult(context, true, "NotionAI", modelId, "", { changed: true, menuClosed }) : preferredModelResult(context, false, "NotionAI", modelId, "selection did not settle", { menuClosed });
    }
    const DEEPSEEK_MODE_TARGETS = Object.freeze({
      instant: Object.freeze({ id: "instant", label: "Instant" }),
      expert: Object.freeze({ id: "expert", label: "Expert" }),
      vision: Object.freeze({ id: "vision", label: "Vision" })
    });
    const DEEPSEEK_MODE_SELECTORS = Object.freeze([
      "button",
      "[role='radio']",
      "[role='tab']",
      "[role='button']",
      "input[type='radio']",
      "label",
      "[aria-label]",
      "[aria-checked]",
      "[aria-selected]",
      "[data-testid]"
    ]);
    function deepSeekModeIdFromText(value) {
      const token = alnumModelToken(value);
      if (!token) return "";
      if (token.includes("instant")) return "instant";
      if (token.includes("expert")) return "expert";
      if (token.includes("vision")) return "vision";
      return "";
    }
    function deepSeekModeIdCount(value) {
      const token = alnumModelToken(value);
      if (!token) return 0;
      return ["instant", "expert", "vision"].reduce((count, id) => count + (token.includes(id) ? 1 : 0), 0);
    }
    function deepSeekModeCandidateText(element) {
      if (!element) return "";
      return [
        element.getAttribute?.("aria-label"),
        element.getAttribute?.("aria-valuetext"),
        element.getAttribute?.("title"),
        element.getAttribute?.("data-testid"),
        element.getAttribute?.("data-value"),
        element.getAttribute?.("value"),
        modelElementText(element),
        element.value
      ].filter(Boolean).join(" ");
    }
    function deepSeekModeElementLooksSelected(element) {
      if (!element) return false;
      if (element.checked) return true;
      for (const attr of ["aria-checked", "aria-selected", "aria-current", "aria-pressed", "data-state", "data-selected", "data-active", "data-checked"]) {
        const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
        if (value === "true" || value === "checked" || value === "selected" || value === "active" || value === "page" || value === "on") return true;
      }
      const className = String(element.className || "");
      return /\b(?:active|selected|checked)\b/i.test(className) && !/\b(?:inactive|unselected|unchecked)\b/i.test(className);
    }
    function deepSeekModeClickableElement(element) {
      return closest2(element, "button, [role='radio'], [role='tab'], [role='button'], label, input[type='radio']") || element;
    }
    function deepSeekModeCandidates() {
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      for (const element of visibleSelectorElements(DEEPSEEK_MODE_SELECTORS)) {
        if (!element || !visible2(element) || isDisabledElement2(element)) continue;
        const textValue = deepSeekModeCandidateText(element);
        if (!deepSeekModeIdFromText(textValue) || deepSeekModeIdCount(textValue) !== 1) continue;
        const clickable = deepSeekModeClickableElement(element);
        if (!clickable || seen.has(clickable) || !visible2(clickable) || isDisabledElement2(clickable)) continue;
        const clickableText = deepSeekModeCandidateText(clickable);
        if (!deepSeekModeIdFromText(clickableText) || deepSeekModeIdCount(clickableText) !== 1) continue;
        seen.add(clickable);
        candidates.push(clickable);
      }
      candidates.sort((a, b) => {
        const ar = modelRect(a);
        const br = modelRect(b);
        if (ar && br) return ar.top - br.top || ar.left - br.left;
        return 0;
      });
      return candidates;
    }
    function currentDeepSeekModeId() {
      const selected = deepSeekModeCandidates().find((element) => deepSeekModeElementLooksSelected(element));
      const selectedId = deepSeekModeIdFromText(deepSeekModeCandidateText(selected));
      if (selectedId) return selectedId;
      const heading = visibleSelectorElements("h1, h2, h3, [role='heading']").map((element) => modelElementText(element)).find((value) => /start chatting with/i.test(String(value || "")));
      return deepSeekModeIdFromText(heading);
    }
    function findDeepSeekModeTarget(modeId) {
      if (!DEEPSEEK_MODE_TARGETS[modeId]) return null;
      const matches2 = deepSeekModeCandidates().filter((element) => deepSeekModeIdFromText(deepSeekModeCandidateText(element)) === modeId).map((element) => ({
        element,
        rect: modelRect(element),
        text: deepSeekModeCandidateText(element)
      })).filter((item) => item.rect && item.rect.width >= 20 && item.rect.height >= 16);
      matches2.sort((a, b) => {
        const aExact = alnumModelToken(a.text) === modeId ? 1 : 0;
        const bExact = alnumModelToken(b.text) === modeId ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return a.rect.top - b.rect.top || a.rect.left - b.rect.left;
      });
      return matches2[0]?.element || null;
    }
    function clickDeepSeekMode(context, element) {
      const target = deepSeekModeClickableElement(element);
      return preferredModelActivate(context, target);
    }
    async function waitDeepSeekModeSettled(context, modeId) {
      const deadline = Date.now() + 2500;
      while (Date.now() <= deadline) {
        assertPreferredModelRun(context);
        if (currentDeepSeekModeId() === modeId) return true;
        await preferredModelSleep(context, 100);
      }
      assertPreferredModelRun(context);
      return currentDeepSeekModeId() === modeId;
    }
    async function applyDeepSeekPreferredModel(context, modeId) {
      if (!DEEPSEEK_MODE_TARGETS[modeId]) return preferredModelResult(context, false, "DeepSeek", modeId, "unknown mode");
      await waitForPreferredModel(context, () => currentDeepSeekModeId() || (deepSeekModeCandidates().length ? "ready" : ""), 1e4, 150);
      const current = currentDeepSeekModeId();
      if (current === modeId) return preferredModelResult(context, true, "DeepSeek", modeId, "", { skipped: true });
      const target = await waitForPreferredModel(context, () => findDeepSeekModeTarget(modeId), 1e4, 150);
      if (!target) return preferredModelResult(context, false, "DeepSeek", modeId, "target mode not found", { retryable: true });
      if (!clickDeepSeekMode(context, target)) return preferredModelResult(context, false, "DeepSeek", modeId, "target mode could not be clicked");
      return await waitDeepSeekModeSettled(context, modeId) ? preferredModelResult(context, true, "DeepSeek", modeId, "", { changed: true }) : preferredModelResult(context, false, "DeepSeek", modeId, "selection did not settle", { current: currentDeepSeekModeId() });
    }
    async function applyPreferredModel(context, data = {}) {
      assertPreferredModelRun(context);
      const rawAppId = String(data.appId || "").trim();
      const appId = {
        "GrokMirror": "Grok",
        "Grok Mirror": "Grok",
        "DeepSeek AI": "DeepSeek",
        "Notion AI": "NotionAI"
      }[rawAppId] || rawAppId;
      const modelId = String(data.modelId || "").trim();
      if (!appId || !modelId) return preferredModelResult(context, true, appId || "unknown", modelId, "", { skipped: true });
      if (appId === "Gemini") return applyGeminiPreferredModel(context, modelId, { thinkingLevel: data.thinkingLevel });
      if (appId === "Grok") return applyGrokPreferredModel(context, modelId);
      if (appId === "DeepSeek") return applyDeepSeekPreferredModel(context, modelId);
      if (appId === "NotionAI") return applyNotionPreferredModel(context, modelId);
      return preferredModelResult(context, true, appId, modelId, "", { skipped: true, unsupported: true });
    }
    async function runPreferredModelApply(data = {}) {
      const runId = String(data.runId || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      abortActivePreferredModelRun("superseded by a newer preferred model run");
      const controller = new AbortController();
      const context = {
        runId,
        controller,
        signal: controller.signal,
        bridgeGeneration: nextPreferredModelBridgeRunSequence(),
        bridgeToken: "",
        bridgeReleased: false,
        focusShieldGeneration: 0,
        focusShieldValue: "",
        focusShieldReleaseScheduled: false,
        interactionCount: 0,
        abortKind: "",
        abortReason: ""
      };
      preferredModelState.activeRun = context;
      publishPreferredModelBridgeRun(context);
      const timeoutMs = Math.max(1e3, Math.min(14e3, Number(data.timeoutMs) || 12e3));
      const timeout = setTimeout(() => {
        abortActivePreferredModelRun("preferred model apply timed out", runId);
      }, timeoutMs);
      const rawAppId = String(data.appId || "").trim();
      const appId = {
        "GrokMirror": "Grok",
        "Grok Mirror": "Grok",
        "DeepSeek AI": "DeepSeek",
        "Notion AI": "NotionAI"
      }[rawAppId] || rawAppId || "unknown";
      const modelId = String(data.modelId || "").trim();
      try {
        return await applyPreferredModel(context, data);
      } catch (error) {
        const cancelled = Boolean(error?.preferredModelCancelled || preferredModelCancelled(context));
        if (cancelled) {
          const timedOut = context.abortKind === "timeout";
          return preferredModelResult(context, false, appId, modelId, error?.message || preferredModelAbortReason(context), {
            cancelled: !timedOut,
            retryable: timedOut
          });
        }
        return preferredModelResult(context, false, appId, modelId, error?.message || String(error));
      } finally {
        clearTimeout(timeout);
        releasePreferredModelBridgeRun(context);
        if (preferredModelState.activeRun === context) preferredModelState.activeRun = null;
      }
    }
    function cancelPreferredModelApply(data = {}) {
      const runId = String(data.runId || "");
      const active = preferredModelState.activeRun;
      const appId = String(data.appId || active?.appId || "unknown");
      const modelId = String(data.modelId || active?.modelId || "");
      const reason = String(data.reason || "preferred model apply cancelled");
      const cancelled = abortActivePreferredModelRun(reason, runId);
      return modelResult(true, appId, modelId, cancelled ? reason : "preferred model run is not active", {
        runId,
        skipped: !cancelled,
        cancelled,
        interactionCount: active?.interactionCount || 0
      });
    }
    return Object.freeze({
      runPreferredModelApply,
      cancelPreferredModelApply
    });
  }

  // content-src/content-preferred-model.js
  function installPreferredModelCapability() {
    const runtimes = runtimeRegistry(window);
    const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY);
    runtimes.registerBundle(runtimeIdentity);
    const { contentDocumentId } = createContentDocumentIdentity(window);
    const current = () => Boolean(
      runtimes.isActive && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === runtimeIdentity.implementationVersion
    );
    const common = createPreferredCommonCapability({
      contentDocumentId,
      GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE: "data-chatclub-gemini-model-picker-run",
      PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS: 5e3,
      PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE: "data-chatclub-preferred-model-focus-shield",
      PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS: 400,
      GEMINI_MODEL_PICKER_SOURCE: CONTENT_PROTOCOL.GEMINI_MODEL_PICKER_SOURCE,
      contentBridgeIsCurrent: current
    });
    const dom = createPreferredDomRuntime({
      activateElement,
      closest,
      normalize,
      qsa,
      visible,
      assertPreferredModelRun: common.assertPreferredModelRun,
      armPreferredModelFocusShield: common.armPreferredModelFocusShield
    });
    const gemini = createPreferredGeminiCapability({
      closest,
      matches,
      qsa,
      visible,
      armPreferredModelFocusShield: common.armPreferredModelFocusShield,
      assertPreferredModelRun: common.assertPreferredModelRun,
      preferredModelResult: common.preferredModelResult,
      requestGeminiModelPickerBridgeOpen: common.requestGeminiModelPickerBridgeOpen,
      waitForPreferredModel: common.waitForPreferredModel,
      compactModelText: dom.compactModelText,
      firstVisibleBySelectors: dom.firstVisibleBySelectors,
      isDisabledElement: dom.isDisabledElement,
      modelElementArea: dom.modelElementArea,
      modelElementText: dom.modelElementText,
      modelEventConstructor: dom.modelEventConstructor,
      modelRect: dom.modelRect,
      parseBooleanAttr: dom.parseBooleanAttr,
      preferredModelActivate: dom.preferredModelActivate,
      visibleSelectorElements: dom.visibleSelectorElements
    });
    const grok = createPreferredGrokCapability({
      closest,
      matches,
      normalize,
      qs,
      qsa,
      visible,
      assertPreferredModelRun: common.assertPreferredModelRun,
      preferredModelResult: common.preferredModelResult,
      preferredModelSleep: common.preferredModelSleep,
      waitForPreferredModel: common.waitForPreferredModel,
      dismissPreferredModelMenu: gemini.dismissPreferredModelMenu,
      alnumModelToken: dom.alnumModelToken,
      compactModelText: dom.compactModelText,
      isDisabledElement: dom.isDisabledElement,
      modelElementArea: dom.modelElementArea,
      modelElementText: dom.modelElementText,
      modelRect: dom.modelRect,
      parseBooleanAttr: dom.parseBooleanAttr,
      preferredModelActivate: dom.preferredModelActivate,
      preferredModelPointerActivate: dom.preferredModelPointerActivate,
      visibleSelectorElements: dom.visibleSelectorElements
    });
    const handlers = createPreferredNotionDeepSeekCapability({
      closest,
      normalize,
      visible,
      abortActivePreferredModelRun: common.abortActivePreferredModelRun,
      assertPreferredModelRun: common.assertPreferredModelRun,
      nextPreferredModelBridgeRunSequence: common.nextPreferredModelBridgeRunSequence,
      preferredModelAbortReason: common.preferredModelAbortReason,
      preferredModelCancelled: common.preferredModelCancelled,
      preferredModelResult: common.preferredModelResult,
      preferredModelSleep: common.preferredModelSleep,
      preferredModelState: common.preferredModelState,
      publishPreferredModelBridgeRun: common.publishPreferredModelBridgeRun,
      releasePreferredModelBridgeRun: common.releasePreferredModelBridgeRun,
      waitForPreferredModel: common.waitForPreferredModel,
      modelResult: common.modelResult,
      applyGeminiPreferredModel: gemini.applyGeminiPreferredModel,
      dismissPreferredModelMenu: gemini.dismissPreferredModelMenu,
      applyGrokPreferredModel: grok.applyGrokPreferredModel,
      alnumModelToken: dom.alnumModelToken,
      isDisabledElement: dom.isDisabledElement,
      modelElementArea: dom.modelElementArea,
      modelElementText: dom.modelElementText,
      modelRect: dom.modelRect,
      preferredModelActivate: dom.preferredModelActivate,
      visibleSelectorElements: dom.visibleSelectorElements
    });
    installContentCapability(runtimes, {
      capability: "preferred-model",
      owner: "content-capability:preferred-model",
      version: runtimeIdentity.bundle.implementationVersion,
      routerVersion: runtimeIdentity.implementationVersion,
      handlers: {
        applyPreferredModel: handlers.runPreferredModelApply,
        cancelPreferredModelApply: handlers.cancelPreferredModelApply
      },
      dispose: () => common.abortActivePreferredModelRun("preferred model capability disposed")
    });
  }
  installPreferredModelCapability();
})();
