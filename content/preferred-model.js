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
  var CONTENT_RUNTIME_SOURCE_SHA256 = "b4d5d10d9b6d901ff45c4e0c1244ca4a6160747cbc6f209b3bc5cb9126e51914";
  var CONTENT_RUNTIME_BUILD_RECIPE_VERSION = "1+recipe.47d871506813d2066becb2ac4b8e101df80e418ad697eadddf5e577fcc1a3a76";
  var CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = "47d871506813d2066becb2ac4b8e101df80e418ad697eadddf5e577fcc1a3a76";
  var CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = "551597662bc0bb9388e264ba0eb8acc70b1ced0c1ed9513f1751b0a74354fecb";
  var CONTENT_RUNTIME_IMPLEMENTATION_VERSION = "2026.07.16.2+implementation.551597662bc0bb9388e264ba0eb8acc70b1ced0c1ed9513f1751b0a74354fecb";
  var CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/preferred-model.js", "entryPath": "content-src/content-preferred-model.js", "sourceSha256": "32385a60aaeefd10444dc0a52f3173c667f9aac631379d0f4e1a68cb2da28752", "implementationSha256": "6149f91ce86c664ac915317d356191d513750da26b6699bad6f0e9d76e1f6de1", "implementationVersion": "2026.07.16.2+bundle.6149f91ce86c664ac915317d356191d513750da26b6699bad6f0e9d76e1f6de1" });

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
      ...options.hosts ? { hosts: Object.freeze([...options.hosts]) } : {},
      ...options.requiredHosts ? { requiredHosts: Object.freeze([...options.requiredHosts]) } : {}
    });
  }
  var CONTENT_BUNDLES = Object.freeze({
    preload: contentBundle({ id: "chatclub-preload", file: "content/preload.js", world: "MAIN", runAt: "document_start" }),
    grokCookie: contentBundle({
      id: "chatclub-grok-cookie-bridge",
      file: "content/grok-cookie-bridge.js",
      hosts: ["grok.com", "gk.dairoot.cn", "manus.im"],
      requiredHosts: ["grok.com", "gk.dairoot.cn"],
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
    captureStart: command({ timeoutMs: 1e4, mutating: true, capability: "base" }),
    triggerScroll: command({ timeoutMs: 8e3, mutating: true, capability: "base" }),
    captureEnd: command({ timeoutMs: 5e3, mutating: true, capability: "base" }),
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
      const safePreselectionRetry = extra?.retryableBeforeSelection === true && extra?.selectionActivated !== true && extra?.menuClosed === true;
      return {
        ...details,
        ok: Boolean(ok),
        appId,
        modelId,
        skipped,
        changed: Boolean(rawChanged),
        cancelled,
        retryable: Boolean(rawRetryable) && !cancelled && (interactionCount === 0 || safePreselectionRetry),
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
        if (!grokModelMenuRoot() && !current) return true;
        await preferredModelSleep(context, 120);
      }
      assertPreferredModelRun(context);
      const final = currentGrokModelId();
      return final === modelId || !grokModelMenuRoot() && !final;
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
        return preferredModelResult(context, true, "Grok", modelId, "", {
          skipped: true,
          unavailable: true,
          fallbackEligible: menuClosed2 === true,
          selectionActivated: false,
          menuClosed: menuClosed2
        });
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
      return settled ? preferredModelResult(context, true, "Grok", modelId, "", { changed: true, menuClosed }) : preferredModelResult(context, false, "Grok", modelId, "selection did not settle", {
        // A free Grok account can accept the activation gesture while
        // silently refusing Expert/Heavy. Once the picker is closed, that is
        // a typed, safe signal to try the configured secondary model (Fast).
        // Keep the activation state explicit so the controller cannot confuse
        // this with a pre-delivery or uncertain interaction failure.
        fallbackEligible: menuClosed === true,
        selectionActivated: true,
        selectionUnsettled: true,
        menuClosed
      });
    }
    return Object.freeze({
      applyGrokPreferredModel
    });
  }

  // content-src/capabilities/preferred-notion-source-indicator.js
  var NOTION_SOURCE_INDICATOR_SELECTORS = Object.freeze([
    '[data-testid="unified-chat-search-scope-button"]',
    '[role="button"][aria-haspopup="menu"]',
    'button[aria-haspopup="menu"]'
  ]);
  var NOTION_SOURCE_NON_INDICATOR_TEST_IDS = /* @__PURE__ */ new Set([
    "unified-chat-plus-menu-button",
    "unified-chat-start-recording-button",
    "agent-send-message-button"
  ]);
  var NOTION_SOURCE_NON_INDICATOR_LABELS = /* @__PURE__ */ new Set([
    "give context",
    "add context",
    "attach files",
    "start voice recording",
    "submit ai message",
    "send message",
    "添加上下文",
    "附件",
    "开始录音",
    "提交 ai 消息",
    "发送消息"
  ]);
  var NOTION_SOURCE_DISABLED_ICON_SELECTOR = 'svg.teamspaceSlashSmall[role="graphics-symbol"]';
  var NOTION_SOURCE_ENABLED_LABELS = /* @__PURE__ */ new Set([
    "all sources i can access",
    "all sources",
    "我可以访问的所有来源",
    "我能访问的所有来源",
    "所有我可以访问的来源",
    "所有来源",
    "全部来源",
    "所有资料源",
    "全部资料源"
  ]);
  var NOTION_SOURCE_DISABLED_LABELS = /* @__PURE__ */ new Set([
    "web search only",
    "no sources",
    "仅限网页搜索",
    "仅限网络搜索",
    "仅使用网页搜索",
    "仅使用网络搜索",
    "只搜索网页",
    "只搜索网络",
    "无来源",
    "没有来源",
    "无资料源",
    "没有资料源"
  ]);
  function createPreferredNotionSourceIndicator(deps = {}) {
    const {
      notionText,
      visibleSelectorElements,
      modelRect,
      findNotionComposerRoot,
      isNotionControlNearMainComposer,
      findNotionSourcesTrigger,
      waitForPreferredModelWithinDeadline,
      assertPreferredModelRun
    } = deps;
    function notionSourceIndicatorLabel(element) {
      for (const name of ["aria-label", "aria-valuetext", "title"]) {
        const value = notionText(element?.getAttribute?.(name));
        if (value) return value;
      }
      return "";
    }
    function notionSourceStateFromLabel(label) {
      if (NOTION_SOURCE_ENABLED_LABELS.has(label)) return true;
      if (NOTION_SOURCE_DISABLED_LABELS.has(label)) return false;
      return null;
    }
    function notionSourceIndicatorIsSettings(element) {
      const testId = notionText(element?.getAttribute?.("data-testid"));
      const label = notionSourceIndicatorLabel(element);
      return testId === "unified-chat-mode-menu-button" || label === "settings" || label === "设置";
    }
    function notionSourceIndicatorIsNonSourceControl(element) {
      const testId = notionText(element?.getAttribute?.("data-testid"));
      if (NOTION_SOURCE_NON_INDICATOR_TEST_IDS.has(testId)) return true;
      return NOTION_SOURCE_NON_INDICATOR_LABELS.has(notionSourceIndicatorLabel(element));
    }
    function notionSourceIndicatorIsModelControl(element) {
      const testId = notionText(element?.getAttribute?.("data-testid"));
      const label = notionSourceIndicatorLabel(element);
      return testId === "unified-chat-model-button" || testId.includes("model") || /^(?:select |open )?models?$/.test(label) || /^(?:选择|打开)?模型$/.test(label);
    }
    function notionSourceIndicatorCandidates(composerRoot, composerRect) {
      const candidates = visibleSelectorElements(NOTION_SOURCE_INDICATOR_SELECTORS).filter((element) => isNotionControlNearMainComposer(element, composerRoot, composerRect)).filter((element) => !notionSourceIndicatorIsSettings(element)).filter((element) => !notionSourceIndicatorIsModelControl(element)).filter((element) => !notionSourceIndicatorIsNonSourceControl(element));
      return [...new Set(candidates)];
    }
    function notionSourceButtonForDisabledIcon(icon) {
      let node = icon?.parentElement || null;
      while (node && node.nodeType === 1) {
        if (String(node.getAttribute?.("role") || "").toLowerCase() === "button" && (String(node.getAttribute?.("aria-haspopup") || "").toLowerCase() === "menu" || notionSourceIndicatorIsNonSourceControl(node))) return node;
        node = node.parentElement || null;
      }
      return null;
    }
    function observeNotionMainSourceState() {
      const composer = findNotionComposerRoot();
      const composerRect = modelRect(composer);
      const trigger = findNotionSourcesTrigger();
      if (!composer || !composerRect || !trigger) {
        return { state: null, reason: "sources indicator is not ready" };
      }
      const candidates = notionSourceIndicatorCandidates(composer, composerRect);
      const disabledIcons = visibleSelectorElements(NOTION_SOURCE_DISABLED_ICON_SELECTOR).map((icon) => ({ icon, indicator: notionSourceButtonForDisabledIcon(icon) })).filter(({ indicator: indicator2 }) => indicator2 && (composer.contains?.(indicator2) || isNotionControlNearMainComposer(indicator2, composer, composerRect)));
      if (disabledIcons.length > 1) {
        return { state: null, reason: "sources disabled indicator is ambiguous" };
      }
      if (disabledIcons.length === 1) {
        const { icon, indicator: indicator2 } = disabledIcons[0];
        const candidateMatches = candidates.length === 1 && candidates[0] === indicator2;
        const explicitDisabledMarkerOwner = notionSourceIndicatorIsNonSourceControl(indicator2) && !notionSourceIndicatorIsSettings(indicator2) && !notionSourceIndicatorIsModelControl(indicator2);
        if (!candidateMatches && !explicitDisabledMarkerOwner) {
          return { state: null, reason: "sources indicator is ambiguous" };
        }
        if (notionSourceStateFromLabel(notionSourceIndicatorLabel(indicator2)) === true) {
          return { state: null, reason: "sources indicator state conflicts" };
        }
        return { state: false, proofElement: icon, indicator: indicator2, composer, trigger, reason: "" };
      }
      if (candidates.length > 1) {
        return { state: null, reason: "sources indicator is ambiguous" };
      }
      const indicator = candidates[0] || null;
      if (!indicator) {
        return { state: true, proofElement: null, indicator: null, composer, trigger, reason: "" };
      }
      const state = notionSourceStateFromLabel(notionSourceIndicatorLabel(indicator));
      return {
        state,
        proofElement: indicator,
        indicator,
        composer,
        trigger,
        reason: state === null ? "sources indicator state is unreadable" : ""
      };
    }
    function sameNotionSourceIndicator(first, second) {
      if (!first || !second || first.state !== second.state) return false;
      if (first.proofElement || second.proofElement) return first.proofElement === second.proofElement;
      if (!first.indicator && !second.indicator) return true;
      return first.composer === second.composer && first.trigger === second.trigger;
    }
    async function waitNotionMainSourceState(context, desiredState = null, timeoutMs = 1e3) {
      let previous = null;
      let samples = 0;
      const observation = await waitForPreferredModelWithinDeadline(context, () => {
        const current = observeNotionMainSourceState();
        if (current.state === null || desiredState !== null && current.state !== desiredState) {
          previous = null;
          samples = 0;
          return null;
        }
        if (!sameNotionSourceIndicator(previous, current)) {
          previous = current;
          samples = 1;
          return null;
        }
        samples += 1;
        previous = current;
        return samples >= 2 ? current : null;
      }, timeoutMs, 120);
      assertPreferredModelRun(context);
      return observation || null;
    }
    return Object.freeze({ observeNotionMainSourceState, waitNotionMainSourceState });
  }

  // content-src/capabilities/preferred-notion-sources.js
  var NOTION_ALL_SOURCES_STATES = Object.freeze(["enabled", "disabled"]);
  function createPreferredNotionSourcesCapability(deps = {}) {
    const {
      normalize: normalize2,
      modelElementText,
      visibleSelectorElements,
      modelRect,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      assertPreferredModelRun,
      preferredModelActivate,
      preferredModelPointerActivate,
      waitForPreferredModel,
      modelElementArea,
      modelEventConstructor,
      closest: closest2,
      preferredModelResult,
      findNotionComposerRoot,
      isNotionControlNearMainComposer
    } = deps;
    const NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS = Object.freeze([
      '[data-testid="unified-chat-mode-menu-button"]',
      '[data-testid="unified-chat-search-scope-button"]'
    ]);
    const NOTION_SOURCES_TRIGGER_SELECTORS = Object.freeze([
      ...NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS,
      'button[aria-label="Settings" i]',
      '[role="button"][aria-label="Settings" i]',
      'button[title="Settings" i]',
      '[role="button"][title="Settings" i]',
      'button[aria-label="设置"]',
      '[role="button"][aria-label="设置"]',
      'button[title="设置"]',
      '[role="button"][title="设置"]'
    ]);
    const NOTION_SOURCES_MENU_ROOT_SELECTORS = Object.freeze([
      '[role="menu"]',
      '[role="listbox"]',
      '[role="dialog"]',
      "[data-radix-menu-content]",
      "[data-radix-popper-content-wrapper]",
      "[data-popper-placement]",
      "[data-floating-ui-focusable]",
      '[data-floating-ui-portal] [role="menu"]',
      '[data-floating-ui-portal] [role="listbox"]'
    ]);
    const NOTION_SOURCES_MENU_ITEM_SELECTORS = Object.freeze([
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="switch"]',
      "button",
      '[tabindex]:not([tabindex="-1"])'
    ]);
    const NOTION_SOURCES_TOGGLE_SELECTORS = Object.freeze([
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="menuitemcheckbox"]',
      'input[type="checkbox"]',
      "button[aria-checked]",
      "[aria-checked]",
      'button[data-state="checked"]',
      'button[data-state="unchecked"]',
      '[data-state="checked"]',
      '[data-state="unchecked"]'
    ]);
    const NOTION_SOURCES_TRIGGER_WAIT_MS = 1700;
    const NOTION_SOURCES_HYDRATION_TRIGGER_WAIT_MS = 3e3;
    const NOTION_SOURCES_MENU_OPEN_WAIT_MS = 3e3;
    const NOTION_SOURCES_SUBMENU_WAIT_MS = 2300;
    const NOTION_SOURCES_SETTLE_WAIT_MS = 1e3;
    const NOTION_SOURCES_MENU_CLOSE_WAIT_MS = 1500;
    const NOTION_SOURCES_STABLE_SAMPLES = 2;
    let notionSourcesOperationTail = Promise.resolve();
    const notionText = (value) => normalize2(value).toLowerCase().replace(/\s+/g, " ");
    function activateNotionSourcesElement(context, element, options = {}) {
      const activate = options.pointer === false ? preferredModelActivate : typeof preferredModelPointerActivate === "function" ? preferredModelPointerActivate : preferredModelActivate;
      return activate(context, element);
    }
    function preferredModelTimeRemaining(context, requestedMs) {
      const requested = Math.max(0, Number(requestedMs) || 0);
      const deadlineAt = Math.max(0, Number(context?.deadlineAt) || 0);
      return deadlineAt > 0 ? Math.min(requested, Math.max(0, deadlineAt - Date.now())) : requested;
    }
    function waitForPreferredModelWithinDeadline(context, getter, timeoutMs, intervalMs) {
      const remaining = preferredModelTimeRemaining(context, timeoutMs);
      if (remaining <= 0) return Promise.resolve(null);
      return waitForPreferredModel(context, getter, remaining, intervalMs);
    }
    function notionTextLooksLikeMySourcesSeed(value) {
      const textValue = notionText(value);
      return Boolean(textValue && (textValue === "my sources" || textValue.startsWith("my sources ") || textValue.includes("我的来源") || textValue.includes("我的资料源") || textValue.includes("我的资源")));
    }
    function notionTextContainsMySources(value) {
      const textValue = notionText(value);
      return Boolean(textValue && (textValue.includes("my sources") || textValue.includes("我的来源") || textValue.includes("我的资料源") || textValue.includes("我的资源")));
    }
    function notionTextLooksLikeAllSources(value) {
      const textValue = notionText(value);
      return Boolean(textValue && (textValue === "all sources" || textValue === "all sources i can access" || textValue.includes("all sources") || textValue.includes("all sources i can access") || textValue.includes("全部来源") || textValue.includes("所有来源") || textValue.includes("全部资料源") || textValue.includes("所有资料源")));
    }
    function notionTextLooksLikeWebAccess(value) {
      const textValue = notionText(value);
      return Boolean(textValue && (textValue.includes("web access") || textValue.includes("internet access") || textValue.includes("联网") || textValue.includes("网络访问")));
    }
    function notionSourcesDisclosureState(element) {
      if (!element) return null;
      const ariaExpanded = String(element.getAttribute?.("aria-expanded") || "").trim().toLowerCase();
      if (ariaExpanded === "true") return true;
      if (ariaExpanded === "false") return false;
      const dataState = String(element.getAttribute?.("data-state") || "").trim().toLowerCase();
      if (dataState === "open") return true;
      if (dataState === "closed") return false;
      return null;
    }
    function notionSourcesPopupIsOpen(root) {
      if (!root || root.isConnected === false || !visible2(root)) return false;
      let node = root;
      while (node && node.nodeType === 1) {
        if (node.hidden === true || node.inert === true || node.hasAttribute?.("inert") || String(node.getAttribute?.("aria-hidden") || "").trim().toLowerCase() === "true" || String(node.getAttribute?.("data-state") || "").trim().toLowerCase() === "closed") return false;
        let style = null;
        try {
          const view = node.ownerDocument?.defaultView || globalThis;
          style = view?.getComputedStyle?.(node) || null;
        } catch {
        }
        if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number.parseFloat(style.opacity) === 0)) return false;
        node = node.parentElement || null;
      }
      return true;
    }
    function scoreNotionSourcesMenuRoot(root) {
      if (!notionSourcesPopupIsOpen(root)) return -1;
      const textValue = modelElementText(root);
      const normalized = notionText(textValue);
      let score = 0;
      if (notionTextContainsMySources(textValue)) score += 180;
      if (notionTextLooksLikeAllSources(textValue)) score += 220;
      if (notionTextLooksLikeWebAccess(textValue)) score += 240;
      if (normalized.includes("add sources") || normalized.includes("添加来源") || normalized.includes("添加资料源")) score += 180;
      if (normalized.includes("personalize") || normalized.includes("个性化")) score += 60;
      if (normalized.includes("mode") || normalized.includes("模式")) score += 40;
      if (normalized.includes("default") && normalized.includes("ask") && normalized.includes("plan")) score += 220;
      if (normalized.includes("answers only") || normalized.includes("plans first") || normalized.includes("think deeper")) score += 100;
      return score >= 160 ? score : -1;
    }
    function innermostIndependentElements(elements) {
      const unique = [...new Set(elements.filter(Boolean))];
      return unique.filter((element) => !unique.some((other) => other !== element && element.contains?.(other)));
    }
    function notionSourcesMenuRoots() {
      const roots = visibleSelectorElements(NOTION_SOURCES_MENU_ROOT_SELECTORS).map((element) => ({ element, score: scoreNotionSourcesMenuRoot(element), area: modelElementArea(element) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.area - b.area).map((item) => item.element);
      return innermostIndependentElements(roots);
    }
    function findNotionSourcesTrigger() {
      const directCandidates = visibleSelectorElements(NOTION_SOURCES_DIRECT_TRIGGER_SELECTORS).filter((element) => !isDisabledElement2(element));
      const composerRoot = findNotionComposerRoot();
      const composerRect = modelRect(composerRoot);
      const rank = (pool) => pool.map((element) => {
        const testId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
        const label = notionText(element.getAttribute?.("aria-label") || "");
        const title = notionText(element.getAttribute?.("title") || "");
        const rect = modelRect(element);
        let score = 0;
        if (testId === "unified-chat-mode-menu-button") score += 500;
        if (testId === "unified-chat-search-scope-button") score += 400;
        if (label === "settings" || label === "设置") score += 300;
        if (title === "settings" || title === "设置") score += 240;
        if (String(element.getAttribute?.("aria-haspopup") || "").toLowerCase() === "dialog") score += 80;
        return { element, score, bottom: Number(rect?.bottom || 0) };
      }).sort((a, b) => b.score - a.score || b.bottom - a.bottom);
      if (directCandidates.length) {
        const scoped = directCandidates.filter((element) => isNotionControlNearMainComposer(element, composerRoot, composerRect));
        if (!composerRoot || !composerRect || !scoped.length) return null;
        const ranked2 = rank(scoped);
        if (ranked2[0] && (!ranked2[1] || ranked2[0].score > ranked2[1].score)) return ranked2[0].element;
        return null;
      }
      if (!composerRoot || !composerRect) return null;
      const scopedFallbacks = visibleSelectorElements(NOTION_SOURCES_TRIGGER_SELECTORS).filter((element) => !isDisabledElement2(element)).filter((element) => isNotionControlNearMainComposer(element, composerRoot, composerRect));
      const ranked = rank(scopedFallbacks);
      return ranked[0] && ranked[0].score > 0 && (!ranked[1] || ranked[0].score > ranked[1].score) ? ranked[0].element : null;
    }
    const notionMainSourceIndicator = createPreferredNotionSourceIndicator({
      notionText,
      visibleSelectorElements,
      modelRect,
      findNotionComposerRoot,
      isNotionControlNearMainComposer,
      findNotionSourcesTrigger,
      waitForPreferredModelWithinDeadline,
      assertPreferredModelRun
    });
    function notionRawRect(element) {
      try {
        const rect = element?.getBoundingClientRect?.();
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
    function notionRawSelectorElements(selectors, root) {
      if (!root?.querySelectorAll) return [];
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
        try {
          for (const element of root.querySelectorAll(selector)) {
            if (!seen.has(element)) {
              seen.add(element);
              out.push(element);
            }
          }
        } catch {
        }
      }
      return out;
    }
    function notionIsSemanticToggle(element) {
      if (!element) return false;
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const tag = String(element.tagName || "").toLowerCase();
      const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();
      return ["switch", "checkbox", "menuitemcheckbox"].includes(role) || tag === "input" && type === "checkbox" || element.hasAttribute?.("aria-checked") || ["checked", "unchecked"].includes(String(element.getAttribute?.("data-state") || "").toLowerCase());
    }
    function notionToggleIsLaidOut(element) {
      if (!notionIsSemanticToggle(element) || isDisabledElement2(element)) return false;
      const rect = notionRawRect(element);
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      let style = null;
      try {
        const view = element.ownerDocument?.defaultView || globalThis;
        style = view?.getComputedStyle?.(element) || null;
      } catch {
      }
      if (!style) return true;
      return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
    }
    function notionElementAcceptsPointerInput(element) {
      if (!element) return false;
      let style = null;
      try {
        const view = element.ownerDocument?.defaultView || globalThis;
        style = view?.getComputedStyle?.(element) || null;
      } catch {
      }
      return !style || style.pointerEvents !== "none";
    }
    function notionToggleIsEligible(element) {
      if (!notionIsSemanticToggle(element) || isDisabledElement2(element)) return false;
      if (visible2(element)) return true;
      const tag = String(element.tagName || "").toLowerCase();
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();
      return tag === "input" && (type === "checkbox" || ["switch", "checkbox"].includes(role)) && notionToggleIsLaidOut(element);
    }
    function notionRectsShareVisualRow(first, second) {
      const firstRect = notionRawRect(first);
      const secondRect = notionRawRect(second);
      if (!firstRect || !secondRect) return false;
      const verticalOverlap = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
      return verticalOverlap >= Math.min(8, Math.min(firstRect.height, secondRect.height) * 0.35);
    }
    function notionSourcesCandidateRow(element, root, predicate) {
      if (!element || !root || typeof predicate !== "function") return null;
      const rootArea = modelElementArea(root);
      const rootRect = modelRect(root);
      let bestToggleOwner = null;
      let bestAction = null;
      let bestRowLike = null;
      let fallback = null;
      let node = element;
      while (node && node.nodeType === 1 && node !== root && root.contains?.(node)) {
        if (!visible2(node) || isDisabledElement2(node) || !predicate(modelElementText(node))) {
          node = node.parentElement || null;
          continue;
        }
        const area = modelElementArea(node);
        if (rootArea > 0 && area >= rootArea * 0.85) break;
        const role = String(node.getAttribute?.("role") || "").toLowerCase();
        const tag = String(node.tagName || "").toLowerCase();
        const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
        const actionLike = ["menuitem", "menuitemcheckbox", "switch", "checkbox", "button"].includes(role) || tag === "button" || tabIndex && tabIndex !== "-1";
        const rect = modelRect(node);
        const rowLike = rect && rootRect && rect.height >= 22 && rect.height <= 96 && rect.width >= Math.min(140, rootRect.width * 0.4) && rect.width <= rootRect.width + 32;
        const toggle = findNotionAllSourcesToggle(node, element);
        const sameVisualRow = toggle.target && notionRectsShareVisualRow(toggle.target, element);
        if (!bestToggleOwner && (actionLike || rowLike) && (toggle.ambiguous || sameVisualRow)) bestToggleOwner = node;
        if (actionLike && !bestAction) bestAction = node;
        if (rowLike && !bestRowLike) bestRowLike = node;
        if (!fallback) fallback = node;
        node = node.parentElement || null;
      }
      return bestToggleOwner || bestAction || bestRowLike || fallback;
    }
    function findNotionSourcesRows(root, seedPredicate, ancestorPredicate = seedPredicate) {
      if (!root || typeof seedPredicate !== "function" || typeof ancestorPredicate !== "function") return [];
      const rows = /* @__PURE__ */ new Set();
      const add = (element) => {
        if (!element || !seedPredicate(modelElementText(element))) return;
        const row = notionSourcesCandidateRow(element, root, ancestorPredicate);
        if (row && root.contains?.(row)) rows.add(row);
      };
      for (const element of visibleSelectorElements(NOTION_SOURCES_MENU_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "button", "label"], root)) add(element);
      return [...rows].sort((a, b) => modelElementArea(a) - modelElementArea(b));
    }
    function singleNotionSourcesRow(root, seedPredicate, ancestorPredicate = seedPredicate) {
      const rows = innermostIndependentElements(findNotionSourcesRows(root, seedPredicate, ancestorPredicate));
      return { row: rows.length === 1 ? rows[0] : null, ambiguous: rows.length > 1 };
    }
    function findNotionSourcesMenuRoot(trigger = null, options = {}) {
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      if (controlsId) {
        const controlled = document.getElementById?.(controlsId) || null;
        if (scoreNotionSourcesMenuRoot(controlled) > 0) return controlled;
      }
      if (options.exactOnly === true) return null;
      const excluded = options.excludeRoots instanceof Set ? options.excludeRoots : null;
      const roots = notionSourcesMenuRoots().filter((root) => !excluded?.has(root));
      return roots.length === 1 ? roots[0] : null;
    }
    function notionAllSourcesBindingBelongsToSettingsRoot(binding, root, lease) {
      const overlay = binding?.overlay || null;
      if (!overlay || !binding?.row || binding?.ambiguous || lease?.baselineAllSources?.has(overlay) || lease?.settingsRootsBeforeActivation?.has(overlay)) return false;
      return overlay === root || root?.contains?.(overlay) || overlay.contains?.(root);
    }
    function bindDirectNotionAllSources(lease, binding) {
      lease.directAllSources = true;
      lease.allSourcesOverlay = binding.overlay || null;
      lease.allSourcesRow = binding.row || null;
      lease.allSourcesTarget = binding.target || null;
      return binding;
    }
    function findOpenNotionAllSourcesBinding() {
      const overlays = notionSourcesMenuRoots().filter((root) => notionTextLooksLikeAllSources(modelElementText(root)));
      if (overlays.length !== 1) {
        return { overlay: null, row: null, target: null, state: null, ambiguous: overlays.length > 1 };
      }
      const overlay = overlays[0];
      const rowResult = singleNotionSourcesRow(overlay, notionTextLooksLikeAllSources);
      if (!rowResult.row) {
        return { overlay, row: null, target: null, state: null, ambiguous: rowResult.ambiguous };
      }
      const toggleResult = findNotionAllSourcesToggle(rowResult.row);
      if (!toggleResult.target) {
        return {
          overlay,
          row: rowResult.row,
          target: null,
          state: null,
          ambiguous: toggleResult.ambiguous
        };
      }
      return {
        overlay,
        row: rowResult.row,
        target: toggleResult.target,
        state: notionToggleState(toggleResult.target),
        ambiguous: false
      };
    }
    function notionToggleState(element) {
      if (!element) return null;
      const candidates = [.../* @__PURE__ */ new Set([element, ...visibleSelectorElements([
        'input[type="checkbox"]',
        "[aria-checked]",
        "[data-state]"
      ], element), ...notionRawSelectorElements([
        'input[type="checkbox"]',
        '[role="switch"]',
        '[role="checkbox"]',
        "[aria-checked]",
        "[data-state]"
      ], element)])];
      for (const candidate of candidates) {
        const tag = String(candidate?.tagName || "").toLowerCase();
        const type = String(candidate?.type || candidate?.getAttribute?.("type") || "").toLowerCase();
        const role = String(candidate?.getAttribute?.("role") || "").toLowerCase();
        if (tag === "input" && (type === "checkbox" || ["switch", "checkbox"].includes(role)) && typeof candidate.checked === "boolean") return candidate.checked;
        const ariaChecked = String(candidate?.getAttribute?.("aria-checked") || "").trim().toLowerCase();
        if (ariaChecked === "true") return true;
        if (ariaChecked === "false") return false;
        const dataState = String(candidate?.getAttribute?.("data-state") || "").trim().toLowerCase();
        if (["checked", "on", "open"].includes(dataState)) return true;
        if (["unchecked", "off", "closed"].includes(dataState)) return false;
      }
      return null;
    }
    function notionAllSourcesLabelAnchor(row) {
      if (!row) return null;
      const candidates = [row, ...visibleSelectorElements(["div", "span", "label", "button"], row)].filter((element) => notionTextLooksLikeAllSources(modelElementText(element))).filter((element) => {
        const rect = notionRawRect(element);
        return visible2(element) && rect && rect.height > 0 && rect.height <= 56;
      });
      const innermost = innermostIndependentElements(candidates);
      return innermost.length === 1 ? innermost[0] : null;
    }
    function notionToggleActivationTarget(target, row) {
      if (!target || !row) return null;
      if (visible2(target) && !isDisabledElement2(target) && notionElementAcceptsPointerInput(target)) return target;
      const targetRect = notionRawRect(target);
      if (!targetRect) return null;
      const proxies = [];
      let node = target.parentElement || null;
      while (node && node.nodeType === 1 && node !== row && row.contains?.(node)) {
        const nodeRect = notionRawRect(node);
        const widthLimit = Math.max(targetRect.width + 8, targetRect.width * 1.75);
        const heightLimit = Math.max(targetRect.height + 8, targetRect.height * 1.75);
        const centerDeltaX = nodeRect ? Math.abs(nodeRect.left + nodeRect.width / 2 - (targetRect.left + targetRect.width / 2)) : Number.MAX_SAFE_INTEGER;
        const centerDeltaY = nodeRect ? Math.abs(nodeRect.top + nodeRect.height / 2 - (targetRect.top + targetRect.height / 2)) : Number.MAX_SAFE_INTEGER;
        if (visible2(node) && !isDisabledElement2(node) && notionElementAcceptsPointerInput(node) && nodeRect && notionRectsShareVisualRow(node, target) && nodeRect.width <= widthLimit && nodeRect.height <= heightLimit && centerDeltaX <= Math.max(4, targetRect.width * 0.25) && centerDeltaY <= Math.max(4, targetRect.height * 0.25)) proxies.push(node);
        node = node.parentElement || null;
      }
      const innermost = innermostIndependentElements(proxies);
      return innermost.length === 1 ? innermost[0] : null;
    }
    function findNotionAllSourcesToggle(row, labelAnchor = null) {
      if (!row) return { target: null, ambiguous: false };
      const candidates = [];
      const role = String(row.getAttribute?.("role") || "").toLowerCase();
      const tag = String(row.tagName || "").toLowerCase();
      const type = String(row.type || row.getAttribute?.("type") || "").toLowerCase();
      if (["switch", "checkbox", "menuitemcheckbox"].includes(role) || tag === "input" && type === "checkbox") {
        candidates.push(row);
      }
      candidates.push(...visibleSelectorElements(NOTION_SOURCES_TOGGLE_SELECTORS, row));
      candidates.push(...notionRawSelectorElements(NOTION_SOURCES_TOGGLE_SELECTORS, row));
      const anchor = labelAnchor || notionAllSourcesLabelAnchor(row);
      const unique = [...new Set(candidates)].filter((element) => notionToggleIsEligible(element)).filter((element) => anchor && notionRectsShareVisualRow(element, anchor));
      const leaves = unique.filter((element) => !unique.some((other) => other !== element && element.contains?.(other)));
      const target = leaves.length === 1 ? leaves[0] : null;
      return {
        target,
        activationTarget: target ? notionToggleActivationTarget(target, row) : null,
        anchor,
        ambiguous: leaves.length > 1
      };
    }
    function notionSourcesOverlayMatches(expected, current) {
      return Boolean(expected && current && expected === current);
    }
    function createNotionSourcesLease() {
      const baselineRoots = new Set(notionSourcesMenuRoots());
      return {
        baselineRoots,
        baselineAllSources: new Set(
          [...baselineRoots].filter((root) => notionTextLooksLikeAllSources(modelElementText(root)))
        ),
        trigger: null,
        settingsRoot: null,
        settingsRootsBeforeActivation: null,
        settingsActivated: false,
        mySourcesRoot: null,
        mySourcesRow: null,
        mySourcesTarget: null,
        submenuActivated: false,
        directAllSources: false,
        allSourcesRootsBeforeActivation: null,
        allSourcesOverlay: null,
        allSourcesRow: null,
        allSourcesTarget: null,
        unownedMenuDetected: false,
        cleanupEscapedRoots: /* @__PURE__ */ new Set(),
        cleanupTriggerRootsWithOverlay: /* @__PURE__ */ new Set(),
        cleanupTriggerSettingsRoots: /* @__PURE__ */ new Set()
      };
    }
    function connectedVisibleNotionSourcesRoot(root) {
      const currentRoots = notionSourcesMenuRoots();
      return Boolean(
        root && root.isConnected !== false && notionSourcesPopupIsOpen(root) && scoreNotionSourcesMenuRoot(root) > 0 && currentRoots.some((candidate) => candidate === root || root.contains?.(candidate))
      );
    }
    function resetNotionSourcesCleanupAttempts(lease) {
      lease.cleanupEscapedRoots = /* @__PURE__ */ new Set();
      lease.cleanupTriggerRootsWithOverlay = /* @__PURE__ */ new Set();
      lease.cleanupTriggerSettingsRoots = /* @__PURE__ */ new Set();
    }
    function exactBoundNotionSettingsRoot(lease) {
      const trigger = lease?.trigger || null;
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      const root = controlsId ? document.getElementById?.(controlsId) || null : null;
      return connectedVisibleNotionSourcesRoot(root) && !lease?.baselineRoots?.has(root) && !lease?.settingsRootsBeforeActivation?.has(root) ? root : null;
    }
    function resolveOwnedNotionSettingsRoot(lease) {
      if (lease?.settingsRoot) {
        if (connectedVisibleNotionSourcesRoot(lease.settingsRoot)) return lease.settingsRoot;
        const replacement = exactBoundNotionSettingsRoot(lease);
        if (replacement) lease.settingsRoot = replacement;
        return replacement;
      }
      if (!lease?.settingsActivated || !lease.trigger) return null;
      const exact = exactBoundNotionSettingsRoot(lease);
      if (exact) {
        lease.settingsRoot = exact;
        return exact;
      }
      const roots = notionSourcesMenuRoots().filter((root) => !lease.baselineRoots.has(root) && !lease.settingsRootsBeforeActivation?.has(root));
      if (roots.length === 1) lease.settingsRoot = roots[0];
      return roots.length === 1 ? roots[0] : null;
    }
    function exactBoundNotionAllSourcesOverlay(lease) {
      const controlsId = String(
        (lease?.directAllSources ? lease?.trigger?.getAttribute?.("aria-controls") : lease?.mySourcesTarget?.getAttribute?.("aria-controls")) || lease?.mySourcesRow?.getAttribute?.("aria-controls") || ""
      ).trim();
      const root = controlsId ? document.getElementById?.(controlsId) || null : null;
      return connectedVisibleNotionSourcesRoot(root) && !lease?.baselineAllSources?.has(root) && !lease?.allSourcesRootsBeforeActivation?.has(root) && notionTextLooksLikeAllSources(modelElementText(root)) ? root : null;
    }
    function resolveOwnedNotionAllSourcesOverlay(lease) {
      if (lease?.allSourcesOverlay) {
        if (connectedVisibleNotionSourcesRoot(lease.allSourcesOverlay) && !lease.baselineAllSources.has(lease.allSourcesOverlay)) return lease.allSourcesOverlay;
        const replacement = exactBoundNotionAllSourcesOverlay(lease);
        if (replacement) lease.allSourcesOverlay = replacement;
        return replacement;
      }
      if (!lease?.submenuActivated || !lease.mySourcesRoot) return null;
      const exact = exactBoundNotionAllSourcesOverlay(lease);
      if (exact) {
        lease.allSourcesOverlay = exact;
        return exact;
      }
      const overlays = notionSourcesMenuRoots().filter((root) => notionTextLooksLikeAllSources(modelElementText(root)) && !lease.baselineAllSources.has(root) && !lease.allSourcesRootsBeforeActivation?.has(root));
      if (overlays.length === 1) lease.allSourcesOverlay = overlays[0];
      return overlays.length === 1 ? overlays[0] : null;
    }
    function observeNotionAllSourcesState(binding, options = {}) {
      const allowBindingReplacement = options.allowBindingReplacement === true;
      const overlays = notionSourcesMenuRoots().filter((root) => notionTextLooksLikeAllSources(modelElementText(root)));
      if (overlays.length > 1) return { state: null, reason: "all sources overlay is ambiguous" };
      const overlay = overlays[0] || null;
      if (!overlay) return { state: null, reason: "all sources row not found" };
      if (binding?.overlay && !notionSourcesOverlayMatches(binding.overlay, overlay)) {
        return { state: null, reason: "all sources overlay changed" };
      }
      const rowResult = singleNotionSourcesRow(overlay, notionTextLooksLikeAllSources);
      if (rowResult.ambiguous) return { state: null, reason: "all sources row is ambiguous" };
      if (!rowResult.row) return { state: null, reason: "all sources row not found" };
      if (binding?.row && binding.row !== rowResult.row && !allowBindingReplacement) {
        return { state: null, reason: "all sources row changed" };
      }
      const toggleResult = findNotionAllSourcesToggle(rowResult.row);
      if (toggleResult.ambiguous) return { state: null, reason: "all sources toggle is ambiguous", row: rowResult.row };
      if (!toggleResult.target) return { state: null, reason: "all sources toggle not found", row: rowResult.row };
      if (binding?.target && binding.target !== toggleResult.target && !allowBindingReplacement) {
        return { state: null, reason: "all sources toggle changed", row: rowResult.row };
      }
      if (binding?.anchor && binding.anchor !== toggleResult.anchor && !allowBindingReplacement) {
        return { state: null, reason: "all sources label changed", row: rowResult.row };
      }
      const state = notionToggleState(toggleResult.target);
      const currentOverlays = notionSourcesMenuRoots().filter((root) => notionTextLooksLikeAllSources(modelElementText(root)));
      const currentOverlay = currentOverlays.length === 1 ? currentOverlays[0] : null;
      if (!notionSourcesOverlayMatches(overlay, currentOverlay) || !notionToggleIsEligible(toggleResult.target) || !(currentOverlay === toggleResult.target || currentOverlay?.contains?.(toggleResult.target))) {
        return { state: null, reason: "all sources overlay changed" };
      }
      return {
        state,
        reason: state === null ? "all sources toggle state is unreadable" : "",
        overlay,
        row: rowResult.row,
        target: toggleResult.target,
        activationTarget: toggleResult.activationTarget,
        anchor: toggleResult.anchor,
        rebound: allowBindingReplacement && Boolean(
          binding?.row !== rowResult.row || binding?.target !== toggleResult.target || binding?.anchor !== toggleResult.anchor
        )
      };
    }
    async function waitNotionAllSourcesStable(context, desiredState, binding, timeoutMs = NOTION_SOURCES_SETTLE_WAIT_MS, options = {}) {
      let samples = 0;
      let currentBinding = binding;
      return await waitForPreferredModelWithinDeadline(context, () => {
        const observation = observeNotionAllSourcesState(currentBinding, options);
        if (observation.state !== desiredState) {
          samples = 0;
          return null;
        }
        if (options.allowBindingReplacement && observation.rebound) currentBinding = { ...currentBinding, ...observation };
        if (++samples < NOTION_SOURCES_STABLE_SAMPLES) return null;
        return true;
      }, timeoutMs, 120);
    }
    async function openNotionSourcesMenu(context, trigger, lease) {
      const existing = findNotionSourcesMenuRoot(trigger, { exactOnly: true });
      lease.trigger = trigger;
      if (existing) {
        lease.unownedMenuDetected = true;
        return null;
      }
      const rootsBeforeActivation = new Set(notionSourcesMenuRoots());
      lease.settingsRootsBeforeActivation = rootsBeforeActivation;
      if (notionSourcesDisclosureState(trigger) === true || rootsBeforeActivation.size > 0) {
        lease.unownedMenuDetected = true;
        return null;
      }
      resetNotionSourcesCleanupAttempts(lease);
      if (!trigger || !activateNotionSourcesElement(context, trigger)) return null;
      lease.settingsActivated = true;
      const root = await waitForPreferredModelWithinDeadline(
        context,
        () => {
          const exact = findNotionSourcesMenuRoot(trigger, { exactOnly: true });
          if (exact && !rootsBeforeActivation.has(exact)) return exact;
          return findNotionSourcesMenuRoot(trigger, { excludeRoots: rootsBeforeActivation });
        },
        NOTION_SOURCES_MENU_OPEN_WAIT_MS,
        120
      );
      if (root && !rootsBeforeActivation.has(root) && !lease.baselineRoots.has(root)) {
        lease.settingsRoot = root;
      }
      return root;
    }
    function notionMySourcesActivationTargets(row, root) {
      const rect = modelRect(row);
      const targets = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (target) => {
        if (!target || seen.has(target) || !visible2(target) || isDisabledElement2(target) || target !== row && !row.contains?.(target) || root && target !== root && !root.contains?.(target)) return;
        seen.add(target);
        targets.push(target);
      };
      if (rect && rect.width > 0 && rect.height > 0) {
        for (const ratio of [0.18, 0.52, 0.88]) {
          let pointElement = null;
          try {
            pointElement = document.elementFromPoint?.(
              rect.left + rect.width * ratio,
              rect.top + rect.height * 0.5
            ) || null;
          } catch {
          }
          add(closest2(pointElement, "button, [role='button'], [role='menuitem'], [tabindex]:not([tabindex='-1'])"));
          add(pointElement);
        }
      }
      add(closest2(row, "button, [role='button'], [role='menuitem'], [tabindex]:not([tabindex='-1'])"));
      add(row);
      return targets;
    }
    async function activateNotionMySourcesRow(context, row, root, lease) {
      const deadlineAt = Math.min(
        Math.max(0, Number(context?.deadlineAt) || Number.MAX_SAFE_INTEGER),
        Date.now() + NOTION_SOURCES_SUBMENU_WAIT_MS
      );
      const overlaysBeforeActivation = new Set(
        notionSourcesMenuRoots().filter((candidate) => notionTextLooksLikeAllSources(modelElementText(candidate)))
      );
      lease.mySourcesRoot = root;
      lease.mySourcesRow = row;
      lease.allSourcesRootsBeforeActivation = overlaysBeforeActivation;
      const ownedBinding = () => {
        const current = findOpenNotionAllSourcesBinding();
        if (current.overlay && overlaysBeforeActivation.has(current.overlay)) return null;
        return current.row || current.ambiguous ? current : null;
      };
      const target = notionMySourcesActivationTargets(row, root)[0] || null;
      if (!target || !activateNotionSourcesElement(context, target)) return null;
      lease.mySourcesTarget = target;
      lease.submenuActivated = true;
      const result = await waitForPreferredModelWithinDeadline(
        context,
        ownedBinding,
        Math.max(0, deadlineAt - Date.now()),
        120
      );
      if (result) {
        lease.allSourcesOverlay = result.overlay || null;
        lease.allSourcesRow = result.row || null;
        lease.allSourcesTarget = result.target || null;
      }
      return result;
    }
    async function ensureNotionAllSourcesRow(context, lease, triggerWaitMs = NOTION_SOURCES_TRIGGER_WAIT_MS) {
      const trigger = await waitForPreferredModelWithinDeadline(
        context,
        findNotionSourcesTrigger,
        triggerWaitMs,
        120
      );
      if (!trigger) {
        return {
          row: null,
          ambiguous: false,
          reason: "sources trigger not found",
          trigger: null,
          menusOwned: false
        };
      }
      const preexisting = findOpenNotionAllSourcesBinding();
      if (preexisting.overlay || preexisting.ambiguous) {
        return {
          row: null,
          ambiguous: preexisting.ambiguous,
          reason: "unowned all sources overlay is open",
          trigger,
          menusOwned: false
        };
      }
      const root = await openNotionSourcesMenu(context, trigger, lease);
      if (!root) return {
        row: null,
        ambiguous: false,
        reason: lease.unownedMenuDetected ? "unowned sources menu is open" : "sources menu not found",
        trigger,
        menusOwned: false
      };
      const directAllSources = findOpenNotionAllSourcesBinding();
      if (notionAllSourcesBindingBelongsToSettingsRoot(directAllSources, root, lease)) {
        return { ...bindDirectNotionAllSources(lease, directAllSources), trigger, menusOwned: true };
      }
      if (directAllSources.ambiguous) {
        return { row: null, ambiguous: true, reason: "all sources overlay is ambiguous", trigger, menusOwned: true };
      }
      const mySources = singleNotionSourcesRow(root, notionTextLooksLikeMySourcesSeed, notionTextContainsMySources);
      if (mySources.ambiguous) return { row: null, ambiguous: true, reason: "my sources row is ambiguous", trigger, menusOwned: true };
      if (!mySources.row) return { row: null, ambiguous: false, reason: "my sources row not found", trigger, menusOwned: true };
      const result = await activateNotionMySourcesRow(context, mySources.row, root, lease);
      return result ? { ...result, trigger, menusOwned: true } : { row: null, ambiguous: false, reason: "my sources row could not be opened", trigger, menusOwned: true };
    }
    function dispatchNotionSourcesEscapeEvent(target) {
      const KeyboardEventCtor = modelEventConstructor?.("KeyboardEvent", target) || null;
      if (!target || typeof KeyboardEventCtor !== "function") return false;
      const options = {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
        composed: true
      };
      let dispatched = false;
      for (const type of ["keydown", "keyup"]) {
        try {
          target.dispatchEvent?.(new KeyboardEventCtor(type, options));
          dispatched = true;
        } catch {
        }
      }
      return dispatched;
    }
    function dispatchNotionSourcesEscape(root) {
      if (!root || !connectedVisibleNotionSourcesRoot(root)) return false;
      return dispatchNotionSourcesEscapeEvent(notionSourcesEscapeTarget(root));
    }
    function notionSourcesCleanupSleep(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, Number(ms) || 0));
      });
    }
    async function waitOwnedNotionSourcesRootClosed(root, deadlineAt, intervalMs) {
      while (Date.now() < deadlineAt) {
        if (!connectedVisibleNotionSourcesRoot(root)) return true;
        await notionSourcesCleanupSleep(Math.min(
          Math.max(20, Number(intervalMs) || 20),
          Math.max(0, deadlineAt - Date.now())
        ));
      }
      return !connectedVisibleNotionSourcesRoot(root);
    }
    function notionSourcesEscapeTarget(root) {
      const activeElement = document.activeElement || null;
      return activeElement && (root === activeElement || root.contains?.(activeElement)) ? activeElement : root;
    }
    function clickOwnedNotionSourcesTrigger(lease, root) {
      const trigger = lease?.trigger || null;
      if (!trigger || lease?.settingsActivated !== true || lease?.settingsRoot !== root || !visible2(trigger) || isDisabledElement2(trigger) || !connectedVisibleNotionSourcesRoot(root) || lease.baselineRoots.has(root) || lease.settingsRootsBeforeActivation?.has(root) || scoreNotionSourcesMenuRoot(root) <= 0 || root === trigger || root.contains?.(trigger) || notionSourcesDisclosureState(trigger) === false || typeof trigger.click !== "function") return false;
      try {
        trigger.click();
        return true;
      } catch {
        return false;
      }
    }
    function notionSourcesLeaseIsClosed(lease) {
      if (resolveOwnedNotionAllSourcesOverlay(lease) || resolveOwnedNotionSettingsRoot(lease)) return false;
      const roots = notionSourcesMenuRoots();
      if (lease?.submenuActivated && roots.some((root) => notionTextLooksLikeAllSources(modelElementText(root)) && !lease.baselineAllSources.has(root) && !lease.allSourcesRootsBeforeActivation?.has(root))) return false;
      if (lease?.settingsActivated && roots.some((root) => !lease.baselineRoots.has(root) && !lease.settingsRootsBeforeActivation?.has(root))) return false;
      return true;
    }
    async function closeNotionSourcesMenus(context, lease, options = {}) {
      const contextRemaining = preferredModelTimeRemaining(context, NOTION_SOURCES_MENU_CLOSE_WAIT_MS);
      const cleanupBudget = options.forceCleanup === true || context?.signal?.aborted ? NOTION_SOURCES_MENU_CLOSE_WAIT_MS : contextRemaining;
      const deadlineAt = Date.now() + Math.max(0, cleanupBudget);
      const escapedRoots = lease.cleanupEscapedRoots || (lease.cleanupEscapedRoots = /* @__PURE__ */ new Set());
      const triggerFallbackRootsWithOverlay = lease.cleanupTriggerRootsWithOverlay || (lease.cleanupTriggerRootsWithOverlay = /* @__PURE__ */ new Set());
      const triggerFallbackSettingsOnlyRoots = lease.cleanupTriggerSettingsRoots || (lease.cleanupTriggerSettingsRoots = /* @__PURE__ */ new Set());
      while (Date.now() < deadlineAt) {
        const overlay = resolveOwnedNotionAllSourcesOverlay(lease);
        if (overlay) {
          const settingsRoot2 = resolveOwnedNotionSettingsRoot(lease);
          const unexpectedOverlay = notionSourcesMenuRoots().some((root) => notionTextLooksLikeAllSources(modelElementText(root)) && root !== overlay && !lease.baselineAllSources.has(root) && !lease.allSourcesRootsBeforeActivation?.has(root));
          if (settingsRoot2 && !unexpectedOverlay && !triggerFallbackRootsWithOverlay.has(settingsRoot2) && clickOwnedNotionSourcesTrigger(lease, settingsRoot2)) {
            triggerFallbackRootsWithOverlay.add(settingsRoot2);
            await waitOwnedNotionSourcesRootClosed(
              overlay,
              Math.min(deadlineAt, Date.now() + 320),
              40
            );
            if (!connectedVisibleNotionSourcesRoot(overlay)) continue;
          }
          if (!escapedRoots.has(overlay)) {
            escapedRoots.add(overlay);
            dispatchNotionSourcesEscape(overlay);
            await waitOwnedNotionSourcesRootClosed(
              overlay,
              Math.min(deadlineAt, Date.now() + 360),
              40
            );
            if (!connectedVisibleNotionSourcesRoot(overlay)) continue;
          }
          await waitOwnedNotionSourcesRootClosed(
            overlay,
            Math.min(deadlineAt, Date.now() + 60),
            40
          );
          continue;
        }
        const settingsRoot = resolveOwnedNotionSettingsRoot(lease);
        if (settingsRoot) {
          const unexpectedOverlay = notionSourcesMenuRoots().some((root) => notionTextLooksLikeAllSources(modelElementText(root)) && !lease.baselineAllSources.has(root) && !lease.allSourcesRootsBeforeActivation?.has(root));
          if (!unexpectedOverlay && !triggerFallbackSettingsOnlyRoots.has(settingsRoot) && clickOwnedNotionSourcesTrigger(lease, settingsRoot)) {
            triggerFallbackSettingsOnlyRoots.add(settingsRoot);
            await waitOwnedNotionSourcesRootClosed(
              settingsRoot,
              Math.min(deadlineAt, Date.now() + 320),
              40
            );
            if (!connectedVisibleNotionSourcesRoot(settingsRoot)) continue;
          }
          if (!escapedRoots.has(settingsRoot)) {
            escapedRoots.add(settingsRoot);
            dispatchNotionSourcesEscape(settingsRoot);
            await waitOwnedNotionSourcesRootClosed(
              settingsRoot,
              Math.min(deadlineAt, Date.now() + 360),
              40
            );
            if (!connectedVisibleNotionSourcesRoot(settingsRoot)) continue;
          }
          await waitOwnedNotionSourcesRootClosed(settingsRoot, deadlineAt, 60);
          if (connectedVisibleNotionSourcesRoot(settingsRoot)) break;
          continue;
        }
        if (notionSourcesLeaseIsClosed(lease)) return true;
        await notionSourcesCleanupSleep(Math.min(40, Math.max(0, deadlineAt - Date.now())));
      }
      return notionSourcesLeaseIsClosed(lease);
    }
    const closeNotionSourcesMenusForResult = (context, lease) => closeNotionSourcesMenus(context, lease, { forceCleanup: true });
    const preflightNotionAllSourcesTrigger = (context) => waitForPreferredModelWithinDeadline(context, findNotionSourcesTrigger, NOTION_SOURCES_TRIGGER_WAIT_MS, 120);
    async function applyNotionAllSourcesPreference(context, modelId, allSourcesState, lease) {
      const desiredState = allSourcesState === "enabled";
      const triggerWaitMs = context.interactionCount === 0 ? NOTION_SOURCES_TRIGGER_WAIT_MS : NOTION_SOURCES_HYDRATION_TRIGGER_WAIT_MS;
      const trigger = await waitForPreferredModelWithinDeadline(
        context,
        findNotionSourcesTrigger,
        triggerWaitMs,
        120
      );
      if (!trigger) {
        const menuClosed2 = notionSourcesMenuRoots().length === 0;
        return preferredModelResult(context, false, "NotionAI", modelId, "sources trigger not found", {
          retryable: context.interactionCount === 0,
          menuClosed: menuClosed2,
          allSourcesState
        });
      }
      if (lease.baselineRoots.size > 0) {
        assertPreferredModelRun(context);
        const reason = lease.baselineAllSources.size > 0 ? "unowned all sources overlay is open" : "unowned sources menu is open";
        return preferredModelResult(context, false, "NotionAI", modelId, reason, {
          retryable: context.interactionCount === 0,
          menuClosed: false,
          allSourcesState
        });
      }
      const mainState = await notionMainSourceIndicator.waitNotionMainSourceState(
        context,
        null,
        NOTION_SOURCES_SETTLE_WAIT_MS
      );
      if (!mainState) {
        const observation = notionMainSourceIndicator.observeNotionMainSourceState();
        return preferredModelResult(context, false, "NotionAI", modelId, observation.reason || "sources indicator state is unreadable", {
          retryable: context.interactionCount === 0,
          menuClosed: true,
          allSourcesState
        });
      }
      if (mainState.state === desiredState) {
        return preferredModelResult(context, true, "NotionAI", modelId, "", {
          skipped: true,
          menuClosed: true,
          allSourcesState
        });
      }
      const opened = await ensureNotionAllSourcesRow(context, lease, NOTION_SOURCES_TRIGGER_WAIT_MS);
      if (!opened.row) {
        const menuClosed2 = opened.menusOwned === false ? notionSourcesMenuRoots().length === 0 : await closeNotionSourcesMenus(context, lease);
        assertPreferredModelRun(context);
        const reason = opened.reason || (opened.ambiguous ? "all sources overlay is ambiguous" : "all sources row not found");
        return preferredModelResult(context, false, "NotionAI", modelId, reason, {
          retryable: context.interactionCount === 0,
          menuClosed: menuClosed2,
          allSourcesState
        });
      }
      const initial = observeNotionAllSourcesState(opened);
      if (initial.state === null) {
        const menuClosed2 = await closeNotionSourcesMenus(context, lease);
        assertPreferredModelRun(context);
        return preferredModelResult(context, false, "NotionAI", modelId, initial.reason, { menuClosed: menuClosed2, allSourcesState });
      }
      const stableInitial = await waitNotionAllSourcesStable(context, initial.state, opened);
      if (!stableInitial) {
        const menuClosed2 = await closeNotionSourcesMenus(context, lease);
        assertPreferredModelRun(context);
        return preferredModelResult(context, false, "NotionAI", modelId, "all sources state was not stable", {
          menuClosed: menuClosed2,
          allSourcesState
        });
      }
      const changed = initial.state !== desiredState;
      if (changed && (!initial.activationTarget || !activateNotionSourcesElement(context, initial.activationTarget, { pointer: false }))) {
        const menuClosed2 = await closeNotionSourcesMenus(context, lease);
        assertPreferredModelRun(context);
        return preferredModelResult(context, false, "NotionAI", modelId, "all sources toggle could not be clicked", { menuClosed: menuClosed2, allSourcesState });
      }
      const stable = changed && await waitNotionAllSourcesStable(context, desiredState, opened, NOTION_SOURCES_SETTLE_WAIT_MS, {
        allowBindingReplacement: true
      });
      const menuClosed = await closeNotionSourcesMenusForResult(context, lease);
      assertPreferredModelRun(context);
      if (!menuClosed) {
        return preferredModelResult(context, false, "NotionAI", modelId, "sources menu did not close", {
          menuClosed,
          allSourcesState
        });
      }
      if (!changed) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, skipped: true, menuClosed, allSourcesState });
      const settled = await notionMainSourceIndicator.waitNotionMainSourceState(
        context,
        desiredState,
        NOTION_SOURCES_SETTLE_WAIT_MS
      );
      assertPreferredModelRun(context);
      if (settled) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, menuClosed, allSourcesState });
      const mainProof = notionMainSourceIndicator.observeNotionMainSourceState();
      if (stable && mainProof?.state === desiredState) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, menuClosed, allSourcesState });
      if (stable && !desiredState && mainState.state === true && !mainState.indicator && !mainState.proofElement) return preferredModelResult(context, true, "NotionAI", modelId, "", { changed, menuClosed, allSourcesState });
      return preferredModelResult(context, false, "NotionAI", modelId, "main sources indicator did not settle", {
        menuClosed,
        allSourcesState
      });
    }
    async function runNotionPreferenceOperation(context, operation) {
      const previous = notionSourcesOperationTail.catch(() => {
      });
      let releaseOperation = () => {
      };
      const operationGate = new Promise((resolve) => {
        releaseOperation = resolve;
      });
      notionSourcesOperationTail = previous.then(() => operationGate);
      await previous;
      let lease = null;
      let outcome;
      let operationError = null;
      try {
        assertPreferredModelRun(context);
        lease = createNotionSourcesLease();
        outcome = await operation(lease);
      } catch (error) {
        operationError = error;
      } finally {
        try {
          if (lease) await closeNotionSourcesMenus(context, lease, { forceCleanup: true });
        } catch {
        }
        releaseOperation();
      }
      if (operationError) throw operationError;
      assertPreferredModelRun(context);
      return outcome;
    }
    return Object.freeze({ applyNotionAllSourcesPreference, preflightNotionAllSourcesTrigger, runNotionPreferenceOperation });
  }

  // shared/notion-efforts.js
  var EMPTY_NOTION_EFFORT_TARGETS = Object.freeze([]);
  var NOTION_EFFORT_TARGETS = Object.freeze({
    none: Object.freeze({ id: "none", label: "No thinking", aliases: ["No thinking", "None"] }),
    minimal: Object.freeze({ id: "minimal", label: "Minimal", aliases: ["Minimal"] }),
    low: Object.freeze({ id: "low", label: "Low", aliases: ["Low"] }),
    medium: Object.freeze({ id: "medium", label: "Medium", aliases: ["Medium"] }),
    high: Object.freeze({ id: "high", label: "High", aliases: ["High"] }),
    xhigh: Object.freeze({ id: "xhigh", label: "xHigh", aliases: ["xHigh", "x-High", "Extra high"] }),
    max: Object.freeze({ id: "max", label: "Max", aliases: ["Max", "Maximum"] })
  });
  var NOTION_EFFORT_TARGETS_BY_MODEL = Object.freeze({
    auto: EMPTY_NOTION_EFFORT_TARGETS,
    sonnet46: Object.freeze(["low", "medium", "high", "max"]),
    sonnet5: Object.freeze(["none", "low", "medium", "high"]),
    opus47: Object.freeze(["none", "low", "medium", "high", "max"]),
    opus48: Object.freeze(["none", "low", "medium", "high", "max"]),
    opus5: Object.freeze(["none", "low", "medium", "high", "max"]),
    fable5: Object.freeze(["low", "medium", "high", "max"]),
    gemini31pro: Object.freeze(["low", "medium"]),
    gemini35flash: Object.freeze(["low", "medium", "high"]),
    gpt56sol: Object.freeze(["none", "low", "medium", "high", "xhigh", "max"]),
    gpt56terra: Object.freeze(["none", "low", "medium", "high", "xhigh", "max"]),
    gpt52: Object.freeze(["medium", "high"]),
    gpt54: Object.freeze(["medium", "high"]),
    gpt55: Object.freeze(["medium", "high"]),
    grok43: Object.freeze(["low", "medium", "high"]),
    grok45: Object.freeze(["low", "medium", "high"]),
    grokBuild01: EMPTY_NOTION_EFFORT_TARGETS,
    kimi26: EMPTY_NOTION_EFFORT_TARGETS,
    kimi27code: EMPTY_NOTION_EFFORT_TARGETS,
    kimi3: Object.freeze(["low", "high", "max"]),
    deepseekV4Pro: Object.freeze(["none", "minimal", "low", "medium", "high", "max", "xhigh"]),
    glm52: Object.freeze(["none", "high", "max"])
  });
  var DEFAULT_NOTION_EFFORT_PREFERENCES = Object.freeze(
    Object.fromEntries(Object.keys(NOTION_EFFORT_TARGETS_BY_MODEL).map((modelId) => [modelId, ""]))
  );
  function notionEffortTargetsForModel(modelId) {
    return NOTION_EFFORT_TARGETS_BY_MODEL[String(modelId || "")] || EMPTY_NOTION_EFFORT_TARGETS;
  }

  // content-src/capabilities/preferred-notion-effort.js
  function createPreferredNotionEffortCapability(deps = {}) {
    const {
      modelTargets,
      menuRootSelectors,
      notionText,
      notionTextKey,
      notionElementTextEvidence,
      visibleSelectorElements,
      modelElementText,
      modelRect,
      modelElementArea,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      findNotionComposerRoot,
      isControlNearMainComposer,
      assertPreferredModelRun,
      preferredModelActivate,
      waitForPreferredModel,
      preferredModelSleep,
      dismissPreferredModelMenu,
      preferredModelResult
    } = deps;
    const NOTION_EFFORT_TRIGGER_SELECTORS = Object.freeze([
      '[data-testid="unified-chat-reasoning-effort-button"]',
      '[data-testid*="reasoning-effort" i]',
      '[aria-label*="Change effort" i]',
      '[aria-label*="effort" i]',
      '[aria-label*="推理" i]',
      '[role="button"][data-testid*="effort" i]',
      '[role="button"][aria-label*="effort" i]'
    ]);
    const NOTION_EFFORT_DIRECT_TRIGGER_SELECTORS = Object.freeze([
      '[data-testid="unified-chat-reasoning-effort-button"]'
    ]);
    const NOTION_EFFORT_MENU_ROOT_SELECTORS = menuRootSelectors;
    const NOTION_EFFORT_ITEM_SELECTORS = Object.freeze([
      '[role="menuitem"]',
      '[role="menuitemradio"]',
      '[role="option"]',
      '[role="button"]',
      "[data-model]",
      "[data-value]",
      "button",
      '[tabindex]:not([tabindex="-1"])'
    ]);
    const NOTION_EFFORT_MENU_OPEN_WAIT_MS = 1800;
    const NOTION_EFFORT_ITEM_READY_WAIT_MS = 700;
    const NOTION_EFFORT_SETTLE_WAIT_MS = 1800;
    const NOTION_EFFORT_MENU_CLOSE_WAIT_MS = 600;
    const notionOwnedEffortMenuRoots = /* @__PURE__ */ new WeakMap();
    function notionEffortIdFromText(value) {
      const normalized = notionText(value).replace(/\bdefault\b/g, " ").replace(/\s+/g, " ").trim();
      if (!normalized) return "";
      const candidates = Object.values(NOTION_EFFORT_TARGETS).flatMap((target) => [target.id, target.label, ...target.aliases || []].map((label) => ({ id: target.id, label: notionText(label) }))).filter((candidate) => candidate.label).sort((a, b) => b.label.length - a.label.length);
      return candidates.find((candidate) => normalized === candidate.label || notionTextKey(normalized) === notionTextKey(candidate.label) || normalized.includes(candidate.label))?.id || "";
    }
    function notionEffortIdFromElement(element) {
      if (!element) return "";
      for (const evidence of notionElementTextEvidence(element)) {
        const effortId = notionEffortIdFromText(evidence);
        if (effortId) return effortId;
      }
      return "";
    }
    function notionElementLooksLikeEffortTarget(element, target) {
      if (!element || !target) return false;
      return notionElementTextEvidence(element).some((evidence) => notionEffortIdFromText(evidence) === target.id);
    }
    function scoreNotionEffortTrigger(element, options = {}) {
      if (!element || !visible2(element) || !options.allowDisabled && isDisabledElement2(element)) return -1;
      if (element.closest?.(NOTION_EFFORT_MENU_ROOT_SELECTORS.join(", "))) return -1;
      const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
      const ariaLabel = String(element.getAttribute?.("aria-label") || "");
      const title = String(element.getAttribute?.("title") || "");
      const composerRoot = options.composerRoot || null;
      const composerRect = options.composerRect || null;
      const nearMainComposer = isControlNearMainComposer(element, composerRoot, composerRect);
      let semanticScore = 0;
      if (dataTestId === "unified-chat-reasoning-effort-button") semanticScore += 1e3;
      if (dataTestId.includes("effort") || dataTestId.includes("reasoning")) semanticScore += 500;
      if (/\beffort\b|推理/i.test(ariaLabel)) semanticScore += 480;
      if (/\beffort\b|推理/i.test(title)) semanticScore += 320;
      if (notionEffortIdFromElement(element)) semanticScore += 280;
      if (semanticScore <= 0) return -1;
      let score = semanticScore;
      if (nearMainComposer) score += 900;
      if (composerRoot && !nearMainComposer) score -= 420;
      return score > 0 ? score : -1;
    }
    function findNotionEffortControl({ allowDisabled = false } = {}) {
      const directCandidates = [...new Set(visibleSelectorElements(NOTION_EFFORT_DIRECT_TRIGGER_SELECTORS))].map((element) => ({
        element,
        score: scoreNotionEffortTrigger(element, { allowDisabled })
      })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
      if (directCandidates.length > 0) {
        return directCandidates.length === 1 ? directCandidates[0].element : null;
      }
      const composerRoot = findNotionComposerRoot();
      if (!composerRoot) return null;
      const composerRect = modelRect(composerRoot);
      const candidates = [...new Set(visibleSelectorElements(NOTION_EFFORT_TRIGGER_SELECTORS))].map((element) => ({
        element,
        score: scoreNotionEffortTrigger(element, { composerRoot, composerRect, allowDisabled }),
        nearMainComposer: isControlNearMainComposer(element, composerRoot, composerRect)
      })).filter((item) => item.nearMainComposer && item.score > 0).sort((a, b) => b.score - a.score);
      return candidates.length === 1 ? candidates[0].element : null;
    }
    function findNotionEffortTrigger() {
      return findNotionEffortControl();
    }
    function scoreNotionEffortMenuRoot(root) {
      if (!root || !visible2(root)) return -1;
      const normalized = notionText(modelElementText(root));
      let score = normalized.includes("effort") ? 360 : 0;
      for (const target of Object.values(NOTION_EFFORT_TARGETS)) {
        if (notionElementLooksLikeEffortTarget(root, target)) score += 70;
      }
      return score >= 360 ? score : -1;
    }
    function notionEffortMenuRoots() {
      const roots = [...new Set(visibleSelectorElements(NOTION_EFFORT_MENU_ROOT_SELECTORS))].filter((element) => scoreNotionEffortMenuRoot(element) > 0);
      return roots.filter((root) => !roots.some((candidate) => candidate !== root && root.contains?.(candidate)));
    }
    function notionControlledEffortMenuRoot(trigger) {
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      if (!controlsId) return null;
      let controlled = [];
      const escapeId = globalThis.CSS?.escape;
      if (typeof document.querySelectorAll === "function" && typeof escapeId === "function") {
        try {
          controlled = [...document.querySelectorAll(`#${escapeId(controlsId)}`)];
        } catch {
        }
      } else {
        const element = document.getElementById?.(controlsId);
        if (element) controlled = [element];
      }
      return controlled.length === 1 && scoreNotionEffortMenuRoot(controlled[0]) > 0 ? controlled[0] : null;
    }
    function notionEffortMenuRoot(trigger = null) {
      if (!trigger) return null;
      const controlled = notionControlledEffortMenuRoot(trigger);
      if (controlled) return controlled;
      const owned = notionOwnedEffortMenuRoots.get(trigger);
      if (scoreNotionEffortMenuRoot(owned) > 0) return owned;
      notionOwnedEffortMenuRoots.delete(trigger);
      return null;
    }
    async function openNotionEffortMenu(context, trigger) {
      assertPreferredModelRun(context);
      const existing = notionEffortMenuRoot(trigger);
      if (existing) return existing;
      const baselineRoots = new Set(notionEffortMenuRoots());
      if (!trigger || !preferredModelActivate(context, trigger)) return null;
      return waitForPreferredModel(context, () => {
        const controlled = notionControlledEffortMenuRoot(trigger);
        if (controlled) {
          notionOwnedEffortMenuRoots.set(trigger, controlled);
          return controlled;
        }
        const opened = notionEffortMenuRoots().filter((root) => !baselineRoots.has(root));
        if (opened.length !== 1) return null;
        notionOwnedEffortMenuRoots.set(trigger, opened[0]);
        return opened[0];
      }, NOTION_EFFORT_MENU_OPEN_WAIT_MS, 100);
    }
    function notionEffortMenuItemRow(element, root, effortId, options = {}) {
      const allowDisabled = options.allowDisabled === true;
      const target = NOTION_EFFORT_TARGETS[effortId];
      const rootArea = modelElementArea(root);
      const rootRect = modelRect(root);
      let bestRoleRow = null;
      let bestAction = null;
      let bestRowLike = null;
      let node = element;
      while (node && node.nodeType === 1 && node !== root) {
        if (!visible2(node)) {
          node = node.parentElement || null;
          continue;
        }
        if (!allowDisabled && isDisabledElement2(node)) return null;
        if (!notionElementLooksLikeEffortTarget(node, target)) {
          node = node.parentElement || null;
          continue;
        }
        const area = modelElementArea(node);
        if (rootArea > 0 && area >= rootArea * 0.85) break;
        const rect = modelRect(node);
        const tag = String(node.tagName || "").toLowerCase();
        const role = String(node.getAttribute?.("role") || "").toLowerCase();
        const tabIndex = String(node.getAttribute?.("tabindex") || "").trim();
        const roleRowLike = role === "menuitem" || role === "menuitemradio" || role === "option";
        const actionLike = roleRowLike || tag === "button" || role === "button" || tabIndex && tabIndex !== "-1";
        const rowLike = rect && rootRect && rect.height >= 22 && rect.height <= 88 && rect.width >= Math.min(100, rootRect.width * 0.35) && rect.width <= rootRect.width + 32;
        if (roleRowLike && !bestRoleRow) bestRoleRow = node;
        if (actionLike && !bestAction) bestAction = node;
        if (rowLike) bestRowLike = node;
        node = node.parentElement || null;
      }
      return bestRoleRow || bestAction || bestRowLike || null;
    }
    function scoreNotionEffortItem(element, effortId, options = {}) {
      const allowDisabled = options.allowDisabled === true;
      const target = NOTION_EFFORT_TARGETS[effortId];
      if (!element || !target || !visible2(element) || !allowDisabled && isDisabledElement2(element)) {
        return Number.NEGATIVE_INFINITY;
      }
      if (!notionElementLooksLikeEffortTarget(element, target)) return Number.NEGATIVE_INFINITY;
      let score = 880;
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const tag = String(element.tagName || "").toLowerCase();
      const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
      if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
      if (tag === "button" || role === "button") score += 360;
      if (tabIndex && tabIndex !== "-1") score += 120;
      const rect = modelRect(element);
      if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
      return score - Math.min(160, modelElementArea(element) / 6e3);
    }
    function notionEffortItemRows(root, effortId, options = {}) {
      if (!root || !NOTION_EFFORT_TARGETS[effortId]) return [];
      const allowDisabled = options.allowDisabled === true;
      const target = NOTION_EFFORT_TARGETS[effortId];
      const seenRows = /* @__PURE__ */ new Set();
      const rows = [];
      const add = (element) => {
        if (!element || !notionElementLooksLikeEffortTarget(element, target)) return;
        const row = notionEffortMenuItemRow(element, root, effortId, { allowDisabled });
        if (!row || seenRows.has(row) || !root.contains?.(row)) return;
        if (!allowDisabled && isDisabledElement2(row)) return;
        if (!Number.isFinite(scoreNotionEffortItem(row, effortId, { allowDisabled }))) return;
        seenRows.add(row);
        rows.push(row);
      };
      for (const element of visibleSelectorElements(NOTION_EFFORT_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
      rows.sort((a, b) => scoreNotionEffortItem(b, effortId, { allowDisabled }) - scoreNotionEffortItem(a, effortId, { allowDisabled }));
      const semanticRows = rows.filter((row) => {
        const role = String(row.getAttribute?.("role") || "").toLowerCase();
        return role === "menuitem" || role === "menuitemradio" || role === "option";
      });
      return semanticRows.length > 0 ? semanticRows : rows;
    }
    function findNotionEffortItem(root, effortId) {
      const rows = notionEffortItemRows(root, effortId);
      return rows.length === 1 ? rows[0] : null;
    }
    async function closeNotionEffortMenu(context, trigger) {
      return dismissPreferredModelMenu(
        context,
        () => notionEffortMenuRoot(trigger),
        NOTION_EFFORT_MENU_CLOSE_WAIT_MS
      );
    }
    async function waitNotionEffortSettled(context, effortId, trigger) {
      const deadline = Date.now() + NOTION_EFFORT_SETTLE_WAIT_MS;
      let targetSamples = 0;
      while (Date.now() <= deadline) {
        assertPreferredModelRun(context);
        if (notionEffortIdFromElement(trigger || findNotionEffortControl()) === effortId) {
          targetSamples += 1;
          if (targetSamples >= 2) return true;
        } else {
          targetSamples = 0;
        }
        await preferredModelSleep(context, 100);
      }
      assertPreferredModelRun(context);
      return notionEffortIdFromElement(trigger || findNotionEffortControl()) === effortId;
    }
    async function applyNotionPreferredEffort(context, modelId, effortId) {
      if (!modelTargets[modelId]) {
        return preferredModelResult(context, false, "NotionAI", modelId, "unknown model", { effortId });
      }
      if (!notionEffortTargetsForModel(modelId).includes(effortId)) {
        return preferredModelResult(context, false, "NotionAI", modelId, "unknown effort for model", { effortId });
      }
      const trigger = await waitForPreferredModel(context, findNotionEffortTrigger, 2500, 120);
      if (!trigger) {
        await closeNotionEffortMenu(context, null);
        return preferredModelResult(context, false, "NotionAI", modelId, "effort trigger not found", {
          effortId,
          retryable: true
        });
      }
      if (notionEffortIdFromElement(trigger) === effortId) {
        const menuClosed2 = await closeNotionEffortMenu(context, trigger);
        return preferredModelResult(context, true, "NotionAI", modelId, "", {
          effortId,
          skipped: true,
          menuClosed: menuClosed2
        });
      }
      const root = await openNotionEffortMenu(context, trigger);
      if (!root) {
        await closeNotionEffortMenu(context, trigger);
        return preferredModelResult(context, false, "NotionAI", modelId, "effort menu not found", {
          effortId,
          retryable: true
        });
      }
      const item = findNotionEffortItem(root, effortId) || await waitForPreferredModel(
        context,
        () => findNotionEffortItem(notionEffortMenuRoot(trigger), effortId),
        NOTION_EFFORT_ITEM_READY_WAIT_MS,
        80
      );
      if (!item) {
        const menuClosed2 = await closeNotionEffortMenu(context, trigger);
        return preferredModelResult(context, false, "NotionAI", modelId, "target effort item not found", {
          effortId,
          retryable: menuClosed2 === true,
          retryableBeforeSelection: true,
          selectionActivated: false,
          menuClosed: menuClosed2
        });
      }
      const clicked = preferredModelActivate(context, item);
      const settled = clicked ? await waitNotionEffortSettled(context, effortId, trigger) : false;
      const menuClosed = await closeNotionEffortMenu(context, trigger);
      if (!clicked) {
        return preferredModelResult(context, false, "NotionAI", modelId, "target effort item could not be clicked", {
          effortId,
          menuClosed
        });
      }
      return settled ? preferredModelResult(context, true, "NotionAI", modelId, "", { effortId, changed: true, menuClosed }) : preferredModelResult(context, false, "NotionAI", modelId, "effort selection did not settle", {
        effortId,
        fallbackEligible: menuClosed === true,
        selectionActivated: true,
        selectionUnsettled: true,
        menuClosed
      });
    }
    return Object.freeze({
      applyNotionPreferredEffort,
      currentNotionEffortId: () => notionEffortIdFromElement(findNotionEffortControl({ allowDisabled: true })),
      isSupported: (modelId, effortId) => Boolean(
        modelTargets[modelId] && notionEffortTargetsForModel(modelId).includes(effortId)
      )
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
      preferredModelPointerActivate,
      waitForPreferredModel,
      modelElementArea,
      modelEventConstructor,
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
      sonnet5: Object.freeze({ id: "sonnet5", label: "Claude Sonnet 5", aliases: ["Sonnet 5"] }),
      opus47: Object.freeze({ id: "opus47", label: "Claude Opus 4.7", aliases: ["Opus 4.7"] }),
      opus48: Object.freeze({ id: "opus48", label: "Claude Opus 4.8", aliases: ["Opus 4.8"] }),
      opus5: Object.freeze({ id: "opus5", label: "Claude Opus 5", aliases: ["Opus 5", "Opus 5 New", "Opus5New"] }),
      fable5: Object.freeze({ id: "fable5", label: "Claude Fable 5", aliases: ["Fable 5", "Fable 5 Beta", "Fable5Beta"] }),
      gemini31pro: Object.freeze({ id: "gemini31pro", label: "Gemini 3.1 Pro", aliases: [] }),
      gemini35flash: Object.freeze({ id: "gemini35flash", label: "Gemini 3.5 Flash", aliases: [] }),
      gpt56sol: Object.freeze({ id: "gpt56sol", label: "GPT-5.6 Sol", aliases: ["GPT 5.6 Sol"] }),
      gpt56terra: Object.freeze({ id: "gpt56terra", label: "GPT-5.6 Terra", aliases: ["GPT 5.6 Terra"] }),
      gpt52: Object.freeze({ id: "gpt52", label: "GPT-5.2", aliases: ["GPT 5.2"] }),
      gpt54: Object.freeze({ id: "gpt54", label: "GPT-5.4", aliases: ["GPT 5.4"] }),
      gpt55: Object.freeze({ id: "gpt55", label: "GPT-5.5", aliases: ["GPT 5.5"] }),
      grok43: Object.freeze({ id: "grok43", label: "Grok 4.3", aliases: [] }),
      grok45: Object.freeze({ id: "grok45", label: "Grok 4.5", aliases: [] }),
      grokBuild01: Object.freeze({ id: "grokBuild01", label: "Grok Build 0.1", aliases: ["Grok Build 01"] }),
      kimi26: Object.freeze({ id: "kimi26", label: "Kimi K2.6", aliases: [] }),
      kimi27code: Object.freeze({ id: "kimi27code", label: "Kimi K2.7 Code", aliases: [] }),
      kimi3: Object.freeze({ id: "kimi3", label: "Kimi K3", aliases: [] }),
      deepseekV4Pro: Object.freeze({ id: "deepseekV4Pro", label: "DeepSeek V4 Pro", aliases: [] }),
      glm52: Object.freeze({ id: "glm52", label: "GLM 5.2", aliases: ["GLM-5.2"] })
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
      '[role="button"][aria-haspopup="dialog"]',
      '[role="combobox"]',
      "button"
    ]);
    const NOTION_MODEL_DIRECT_TRIGGER_SELECTORS = Object.freeze([
      '[data-testid="agent-chat-model-button"]',
      '[data-testid="unified-chat-model-button"]'
    ]);
    const NOTION_MODEL_TRIGGER_WAIT_MS = 3500;
    const NOTION_MODEL_TRIGGER_HYDRATION_WAIT_MS = 600;
    const NOTION_MODEL_TRIGGER_HYDRATION_SAMPLES = 2;
    const NOTION_MODEL_MENU_OPEN_WAIT_MS = 2200;
    const NOTION_MODEL_ITEM_READY_WAIT_MS = 800;
    const NOTION_MODEL_SETTLE_WAIT_MS = 2200;
    const NOTION_MODEL_MENU_CLOSE_WAIT_MS = 700;
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
    const NOTION_OLDER_MODEL_SECTION_LABELS = Object.freeze([
      "Older models",
      "旧模型",
      "旧版模型"
    ]);
    const notionOwnedMenuRoots = /* @__PURE__ */ new WeakMap();
    function notionText(value) {
      return normalize2(value).toLowerCase().replace(/\s+/g, " ");
    }
    function notionTextKey(value) {
      return notionText(value).replace(/[\s\u200b\u200c\u200d]+/g, "");
    }
    function notionLabels(target) {
      return [target?.id, target?.label, ...target?.aliases || []].map(notionText).filter(Boolean);
    }
    function notionTextEvidence(value) {
      const evidence = /* @__PURE__ */ new Set();
      const add = (candidate) => {
        const normalized = notionText(candidate);
        if (normalized) evidence.add(normalized);
      };
      const raw = String(value || "");
      add(raw);
      for (const line of raw.split(/[\r\n\u2028\u2029]+/)) add(line);
      return [...evidence];
    }
    function notionTextLooksLikeTarget(value, target) {
      if (!target) return false;
      const labels = notionLabels(target);
      const keys = new Set(labels.map(notionTextKey));
      return notionTextEvidence(value).some((candidate) => labels.includes(candidate) || keys.has(notionTextKey(candidate)));
    }
    function notionModelIdsFromEvidence(evidence) {
      const ids = /* @__PURE__ */ new Set();
      for (const candidate of evidence) {
        const candidateKey = notionTextKey(candidate);
        for (const [id, target] of Object.entries(NOTION_MODEL_TARGETS)) {
          const labels = notionLabels(target);
          if (labels.includes(candidate) || labels.some((label) => notionTextKey(label) === candidateKey)) {
            ids.add(id);
          }
        }
      }
      return ids;
    }
    function notionElementTextEvidence(element) {
      if (!element) return [];
      const evidence = /* @__PURE__ */ new Set();
      const add = (value) => {
        for (const candidate of notionTextEvidence(value)) evidence.add(candidate);
      };
      const nodes = [element];
      try {
        nodes.push(...element.querySelectorAll?.("*") || []);
      } catch {
      }
      for (const node of nodes) {
        add(node.getAttribute?.("aria-label"));
        add(node.getAttribute?.("aria-valuetext"));
        add(node.getAttribute?.("title"));
        add(node.getAttribute?.("data-model"));
        add(node.getAttribute?.("data-model-id"));
        add(node.getAttribute?.("data-model-key"));
        add(node.getAttribute?.("data-value"));
        add(node.getAttribute?.("value"));
        add(node.innerText || node.textContent || "");
        add(node.value);
        add(modelElementText(node));
      }
      return [...evidence];
    }
    function notionModelIdsFromElement(element) {
      return notionModelIdsFromEvidence(notionElementTextEvidence(element));
    }
    function notionElementMatchesExactLabels(element, labels) {
      const labelKeys = new Set((labels || []).map(notionTextKey).filter(Boolean));
      if (!element || labelKeys.size === 0) return false;
      return notionElementTextEvidence(element).some((evidence) => labelKeys.has(notionTextKey(evidence)));
    }
    function notionElementLooksLikeTarget(element, target) {
      if (!element || !target) return false;
      return notionElementTextEvidence(element).some((candidate) => notionTextLooksLikeTarget(candidate, target));
    }
    function notionModelIdFromElement(element) {
      const ids = notionModelIdsFromElement(element);
      return ids.size === 1 ? [...ids][0] : "";
    }
    function notionViewportSize() {
      return {
        width: Number(window.innerWidth || document.documentElement?.clientWidth || 0),
        height: Number(window.innerHeight || document.documentElement?.clientHeight || 0)
      };
    }
    function notionResponsiveComposerMinWidth(wideMinimum) {
      const viewportWidth = notionViewportSize().width;
      if (!(viewportWidth > 0)) return wideMinimum;
      return Math.min(wideMinimum, Math.max(216, Math.floor(viewportWidth * 0.7)));
    }
    function isLikelyNotionMainComposerRect(rect) {
      if (!rect || rect.width < notionResponsiveComposerMinWidth(280) || rect.height < 40 || rect.height > 280) return false;
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
        'input[role="textbox"]',
        '[contenteditable="true"]',
        '[role="textbox"]',
        "[data-placeholder]",
        "[aria-placeholder]",
        "form"
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
          if (rect2 && rect2.width >= notionResponsiveComposerMinWidth(320) && rect2.height >= 44 && rect2.height <= 260) {
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
      const dataTestId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
      const ariaLabel = String(element.getAttribute?.("aria-label") || "");
      const title = String(element.getAttribute?.("title") || "");
      const popup = String(element.getAttribute?.("aria-haspopup") || "").trim().toLowerCase();
      const nearMainComposer = isNotionModelTriggerNearMainComposer(element, options.composerRoot || null, options.composerRect || null);
      let semanticScore = 0;
      if (dataTestId === "agent-chat-model-button" || dataTestId === "unified-chat-model-button") semanticScore += 1e3;
      if (dataTestId.includes("model")) semanticScore += 500;
      if (/\bmodel\b|模型/i.test(ariaLabel)) semanticScore += 420;
      if (/\bmodel\b|模型/i.test(title)) semanticScore += 320;
      if (notionModelIdFromElement(element)) semanticScore += 360;
      if (semanticScore <= 0) return -1;
      let score = semanticScore;
      if (nearMainComposer) score += 900;
      if (options.composerRoot && !nearMainComposer) score -= 420;
      if (popup === "menu" || popup === "listbox") score += 80;
      if (notionElementLooksLikeTarget(element, NOTION_MODEL_TARGETS.auto)) score += 80;
      return score > 0 ? score : -1;
    }
    function findNotionModelControl({ allowDisabled = false } = {}) {
      const directCandidates = [...new Set(visibleSelectorElements(NOTION_MODEL_DIRECT_TRIGGER_SELECTORS))].map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { allowDisabled }),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      })).filter((item) => item.score > 0);
      directCandidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
      if (directCandidates.length > 0) {
        return directCandidates.length === 1 ? directCandidates[0].element : null;
      }
      const composerRoot = findNotionComposerRoot();
      if (!composerRoot) return null;
      const composerRect = modelRect(composerRoot);
      const candidates = [...new Set(visibleSelectorElements(NOTION_MODEL_TRIGGER_SELECTORS))].map((element) => ({
        element,
        score: scoreNotionModelTrigger(element, { composerRoot, composerRect, allowDisabled }),
        nearMainComposer: isNotionModelTriggerNearMainComposer(element, composerRoot, composerRect),
        bottom: Number(element.getBoundingClientRect?.().bottom || 0)
      })).filter((item) => item.nearMainComposer && item.score > 0);
      candidates.sort((a, b) => b.score - a.score || b.bottom - a.bottom);
      return candidates.length === 1 ? candidates[0].element : null;
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
      if (normalized.includes("for your hardest tasks")) score += 160;
      if (normalized.includes("open models")) score += 80;
      score += Math.min(5, notionModelIdsFromElement(root).size) * 80;
      return score >= 160 ? score : -1;
    }
    function notionModelMenuRoots() {
      const roots = [...new Set(visibleSelectorElements(NOTION_MODEL_MENU_ROOT_SELECTORS))].filter((element) => scoreNotionModelMenuRoot(element) > 0);
      return roots.filter((root) => !roots.some((candidate) => candidate !== root && root.contains?.(candidate)));
    }
    function notionControlledModelMenuRoot(trigger) {
      const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
      if (!controlsId) return null;
      let controlled = [];
      const escapeId = globalThis.CSS?.escape;
      if (typeof document.querySelectorAll === "function" && typeof escapeId === "function") {
        try {
          controlled = [...document.querySelectorAll(`#${escapeId(controlsId)}`)];
        } catch {
        }
      } else {
        const element = document.getElementById?.(controlsId);
        if (element) controlled = [element];
      }
      return controlled.length === 1 && scoreNotionModelMenuRoot(controlled[0]) > 0 ? controlled[0] : null;
    }
    function notionModelMenuRoot(trigger = null) {
      if (!trigger) return null;
      const controlled = notionControlledModelMenuRoot(trigger);
      if (controlled) return controlled;
      const owned = notionOwnedMenuRoots.get(trigger);
      if (scoreNotionModelMenuRoot(owned) > 0) return owned;
      notionOwnedMenuRoots.delete(trigger);
      return null;
    }
    async function openNotionModelMenu(context, trigger) {
      assertPreferredModelRun(context);
      const existing = notionModelMenuRoot(trigger);
      if (existing) return existing;
      const baselineRoots = new Set(notionModelMenuRoots());
      if (!trigger || !preferredModelActivate(context, trigger)) return null;
      return waitForPreferredModel(context, () => {
        const controlled = notionControlledModelMenuRoot(trigger);
        if (controlled) {
          notionOwnedMenuRoots.set(trigger, controlled);
          return controlled;
        }
        const opened = notionModelMenuRoots().filter((root) => !baselineRoots.has(root));
        if (opened.length !== 1) return null;
        notionOwnedMenuRoots.set(trigger, opened[0]);
        return opened[0];
      }, NOTION_MODEL_MENU_OPEN_WAIT_MS, 120);
    }
    function notionMenuItemRow(element, root, modelId = "", options = {}) {
      const allowDisabled = options.allowDisabled === true;
      const rootArea = modelElementArea(root);
      const rootRect = modelRect(root);
      let bestRoleRow = null;
      let bestAction = null;
      let bestRowLike = null;
      let node = element;
      while (node && node.nodeType === 1 && node !== root) {
        if (!visible2(node)) {
          node = node.parentElement || null;
          continue;
        }
        if (!allowDisabled && isDisabledElement2(node)) return null;
        const targetIds = notionModelIdsFromElement(node);
        const area = modelElementArea(node);
        if (rootArea > 0 && area >= rootArea * 0.85) break;
        if (modelId && !targetIds.has(modelId)) {
          node = node.parentElement || null;
          continue;
        }
        if (targetIds.size > 1) {
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
        if (rowLike) bestRowLike = node;
        node = node.parentElement || null;
      }
      return bestRoleRow || bestAction || bestRowLike || null;
    }
    function scoreNotionModelItem(element, modelId, options = {}) {
      const allowDisabled = options.allowDisabled === true;
      if (!element || !visible2(element) || !allowDisabled && isDisabledElement2(element)) {
        return Number.NEGATIVE_INFINITY;
      }
      const target = NOTION_MODEL_TARGETS[modelId];
      if (!target || !notionElementLooksLikeTarget(element, target)) return Number.NEGATIVE_INFINITY;
      let score = 0;
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const tag = String(element.tagName || "").toLowerCase();
      const tabIndex = String(element.getAttribute?.("tabindex") || "").trim();
      const targetCount = notionModelIdsFromElement(element).size;
      if (role === "menuitem" || role === "menuitemradio" || role === "option") score += 900;
      if (tag === "button" || role === "button") score += 360;
      if (tabIndex && tabIndex !== "-1") score += 120;
      if (targetCount === 1) score += 260;
      if (targetCount > 1) score -= 700;
      score += 880;
      const rect = modelRect(element);
      if (rect && rect.height >= 24 && rect.height <= 72) score += 100;
      if (rect && rect.width >= 120) score += 40;
      score -= Math.min(160, modelElementArea(element) / 6e3);
      return score;
    }
    function notionModelRowIsDisabled(row, root) {
      for (let node = row; node && node.nodeType === 1 && node !== root; node = node.parentElement || null) {
        if (isDisabledElement2(node)) return true;
      }
      return false;
    }
    function notionModelItemRows(root, modelId, options = {}) {
      if (!root || !NOTION_MODEL_TARGETS[modelId]) return [];
      const allowDisabled = options.allowDisabled === true;
      const target = NOTION_MODEL_TARGETS[modelId];
      const seenRows = /* @__PURE__ */ new Set();
      const rows = [];
      const add = (element) => {
        if (!element || !notionElementLooksLikeTarget(element, target)) return;
        const row = notionMenuItemRow(element, root, modelId, { allowDisabled });
        if (!row || seenRows.has(row) || !root.contains?.(row)) return;
        if (!allowDisabled && notionModelRowIsDisabled(row, root)) return;
        const targetIds = notionModelIdsFromElement(row);
        if (targetIds.size !== 1 || !targetIds.has(modelId)) return;
        if (!Number.isFinite(scoreNotionModelItem(row, modelId, { allowDisabled }))) return;
        seenRows.add(row);
        rows.push(row);
      };
      for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "button"], root)) add(element);
      rows.sort((a, b) => scoreNotionModelItem(b, modelId, { allowDisabled }) - scoreNotionModelItem(a, modelId, { allowDisabled }));
      const semanticRows = rows.filter((row) => {
        const role = String(row.getAttribute?.("role") || "").toLowerCase();
        return role === "menuitem" || role === "menuitemradio" || role === "option";
      });
      return semanticRows.length > 0 ? semanticRows : rows;
    }
    function findNotionModelItem(root, modelId) {
      const rows = notionModelItemRows(root, modelId);
      if (rows.length === 1) return rows[0];
      const groupedPicker = notionText(modelElementText(root)).includes("for your hardest tasks");
      if (groupedPicker && rows.length > 1 && rows.every((row) => notionModelIdsFromElement(row).size === 1 && notionModelIdsFromElement(row).has(modelId))) {
        return rows[0];
      }
      return null;
    }
    function findNotionExactUnavailableModelItem(root, modelId) {
      const rows = notionModelItemRows(root, modelId, { allowDisabled: true });
      return rows.length === 1 && notionModelRowIsDisabled(rows[0], root) ? rows[0] : null;
    }
    function notionModelSearchRoots(root) {
      const roots = [root, ...notionModelMenuRoots()];
      const seen = /* @__PURE__ */ new Set();
      return roots.filter((candidate) => {
        if (!candidate || seen.has(candidate) || !visible2(candidate)) return false;
        seen.add(candidate);
        return true;
      });
    }
    function findNotionModelItemAcrossRoots(root, modelId) {
      const matches2 = [];
      const seenItems = /* @__PURE__ */ new Set();
      for (const candidate of notionModelSearchRoots(root)) {
        const item = findNotionModelItem(candidate, modelId);
        if (!item || seenItems.has(item)) continue;
        seenItems.add(item);
        matches2.push({ item, root: candidate });
      }
      return matches2.length === 1 ? matches2[0] : null;
    }
    function findNotionExactUnavailableModelItemAcrossRoots(root, modelId) {
      const matches2 = [];
      const seenItems = /* @__PURE__ */ new Set();
      for (const candidate of notionModelSearchRoots(root)) {
        const item = findNotionExactUnavailableModelItem(candidate, modelId);
        if (!item || seenItems.has(item)) continue;
        seenItems.add(item);
        matches2.push({ item, root: candidate });
      }
      return matches2.length === 1 ? matches2[0] : null;
    }
    function findNotionOlderModelSection(root) {
      const candidates = visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root).filter((element) => notionElementMatchesExactLabels(element, NOTION_OLDER_MODEL_SECTION_LABELS));
      return candidates.length === 1 ? candidates[0] : null;
    }
    async function expandNotionOlderModelSection(context, root, modelId) {
      assertPreferredModelRun(context);
      if (findNotionModelItemAcrossRoots(root, modelId)) return true;
      const section = findNotionOlderModelSection(root);
      if (!section) return false;
      const pointerActivate = typeof preferredModelPointerActivate === "function" ? preferredModelPointerActivate : preferredModelActivate;
      if (!pointerActivate(context, section)) return false;
      return Boolean(await waitForPreferredModel(
        context,
        () => findNotionModelItemAcrossRoots(root, modelId) || notionElementMatchesExactLabels(section, NOTION_OLDER_MODEL_SECTION_LABELS) && String(section.getAttribute?.("aria-expanded") || "").trim().toLowerCase() === "true",
        NOTION_MODEL_ITEM_READY_WAIT_MS,
        80
      ));
    }
    function notionElementHasSelectedState(element) {
      if (!element) return false;
      for (const attr of ["aria-checked", "aria-selected", "aria-current", "aria-pressed", "data-state", "data-selected", "data-active", "data-checked"]) {
        const value = String(element.getAttribute?.(attr) || "").trim().toLowerCase();
        if (["true", "checked", "selected", "active", "on", "page", "step", "location", "date", "time"].includes(value)) return true;
      }
      const className = String(element.className || "");
      return /\b(?:selected|checked|active)\b/i.test(className) && !/\b(?:not[-_\s]?(?:selected|checked|active)|unselected|inactive|unchecked)\b/i.test(className);
    }
    function notionRowHasRightCheckMarker(row) {
      const rowRect = modelRect(row);
      if (!rowRect || rowRect.width <= 0 || rowRect.height <= 0) return false;
      if (/[✓✔]/.test(String(row?.innerText || row?.textContent || ""))) return true;
      for (const marker of visibleSelectorElements([
        "[aria-label]",
        "[data-testid]",
        "[class]",
        "[title]",
        "[data-icon]",
        "[data-icon-name]",
        "svg"
      ], row)) {
        if (notionElementHasSelectedState(marker)) return true;
        const label = [
          marker.getAttribute?.("aria-label"),
          marker.getAttribute?.("data-testid"),
          marker.getAttribute?.("class"),
          marker.getAttribute?.("title"),
          marker.getAttribute?.("data-icon"),
          marker.getAttribute?.("data-icon-name"),
          marker.innerText || marker.textContent || ""
        ].filter(Boolean).join(" ");
        if (/\b(?:not[ -]?selected|unselected|unchecked|not[ -]?checked|inactive)\b/i.test(label)) continue;
        if (/\b(?:check|checked|selected|done)\b|✓|✔/i.test(label)) return true;
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
        "[aria-pressed]",
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
        const targetIds = notionModelIdsFromElement(row);
        if (targetIds.size !== 1) return;
        const id = [...targetIds][0];
        if (!id || !notionRowLooksSelected(row)) return;
        seenRows.add(row);
        rows.push({ element: row, id, score: scoreNotionModelItem(row, id) });
      };
      for (const element of visibleSelectorElements(NOTION_MODEL_MENU_ITEM_SELECTORS, root)) add(element);
      for (const element of visibleSelectorElements(["div", "span", "button", "svg"], root)) add(element);
      rows.sort((a, b) => b.score - a.score);
      return rows.length === 1 ? rows[0].id : "";
    }
    function currentNotionModelId(trigger = null) {
      const selected = selectedNotionModelId(notionModelMenuRoot(trigger));
      if (selected) return selected;
      const triggerElement = trigger && visible2(trigger) ? trigger : findNotionModelIndicator();
      return notionModelIdFromElement(triggerElement);
    }
    async function closeNotionModelMenu(context, trigger = null) {
      return dismissPreferredModelMenu(context, () => notionModelMenuRoot(trigger), NOTION_MODEL_MENU_CLOSE_WAIT_MS);
    }
    async function waitNotionModelSettled(context, modelId, trigger) {
      const deadline = Date.now() + NOTION_MODEL_SETTLE_WAIT_MS;
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
    async function waitNotionModelItemOrCurrent(context, modelId, trigger) {
      return waitForPreferredModel(context, () => {
        if (currentNotionModelId(trigger) === modelId) return { current: true, item: null };
        const activeRoot = notionModelMenuRoot(trigger);
        const match = findNotionModelItemAcrossRoots(activeRoot, modelId);
        return match ? { current: false, item: match.item } : null;
      }, NOTION_MODEL_ITEM_READY_WAIT_MS, 80);
    }
    function notionTriggerModelId(trigger) {
      return notionModelIdFromElement(trigger);
    }
    async function waitNotionTriggerHydration(context, modelId, trigger, deadlineAt) {
      const initialModelId = notionTriggerModelId(trigger);
      if (initialModelId === modelId) return { current: true, modelId: initialModelId };
      if (initialModelId && initialModelId !== "auto") return { current: false, modelId: initialModelId };
      const timeoutMs = Math.min(
        NOTION_MODEL_TRIGGER_HYDRATION_WAIT_MS,
        Math.max(0, Number(deadlineAt || 0) - Date.now())
      );
      if (timeoutMs <= 0) return { current: false, modelId: initialModelId };
      let targetSamples = 0;
      const readiness = await waitForPreferredModel(context, () => {
        const currentModelId = notionTriggerModelId(trigger);
        if (currentModelId === modelId) {
          targetSamples += 1;
          return targetSamples >= NOTION_MODEL_TRIGGER_HYDRATION_SAMPLES ? { current: true, modelId: currentModelId } : null;
        }
        targetSamples = 0;
        if (currentModelId && currentModelId !== "auto") {
          return { current: false, modelId: currentModelId };
        }
        return null;
      }, timeoutMs, 80);
      return readiness || { current: false, modelId: notionTriggerModelId(trigger) };
    }
    const notionEffort = createPreferredNotionEffortCapability({
      modelTargets: NOTION_MODEL_TARGETS,
      menuRootSelectors: NOTION_MODEL_MENU_ROOT_SELECTORS,
      notionText,
      notionTextKey,
      notionElementTextEvidence,
      visibleSelectorElements,
      modelElementText,
      modelRect,
      modelElementArea,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      findNotionComposerRoot,
      isControlNearMainComposer: isNotionModelTriggerNearMainComposer,
      assertPreferredModelRun,
      preferredModelActivate,
      waitForPreferredModel,
      preferredModelSleep,
      dismissPreferredModelMenu,
      preferredModelResult
    });
    async function notionUnavailableModelResult(context, modelId, trigger) {
      const menuClosed = await closeNotionModelMenu(context, trigger);
      return preferredModelResult(context, true, "NotionAI", modelId, "", {
        skipped: true,
        unavailable: true,
        fallbackEligible: menuClosed === true,
        selectionActivated: false,
        menuClosed
      });
    }
    async function applyNotionPreferredModel(context, modelId) {
      if (!NOTION_MODEL_TARGETS[modelId]) return preferredModelResult(context, false, "NotionAI", modelId, "unknown model");
      if (currentNotionModelId() === modelId) {
        const menuClosed2 = await closeNotionModelMenu(context);
        return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed: menuClosed2 });
      }
      const triggerDeadlineAt = Date.now() + NOTION_MODEL_TRIGGER_WAIT_MS;
      const trigger = await waitForPreferredModel(context, findNotionModelTrigger, NOTION_MODEL_TRIGGER_WAIT_MS, 150);
      if (!trigger) {
        await closeNotionModelMenu(context);
        return preferredModelResult(context, false, "NotionAI", modelId, "model trigger not found", { retryable: true });
      }
      const triggerReadiness = await waitNotionTriggerHydration(context, modelId, trigger, triggerDeadlineAt);
      if (triggerReadiness.current) {
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
      let immediateMatch = findNotionModelItemAcrossRoots(root, modelId);
      if (!immediateMatch) await expandNotionOlderModelSection(context, root, modelId);
      immediateMatch = immediateMatch || findNotionModelItemAcrossRoots(root, modelId);
      const immediateItem = immediateMatch?.item || null;
      const immediateUnavailableItem = immediateItem ? null : findNotionExactUnavailableModelItemAcrossRoots(root, modelId)?.item || null;
      if (immediateUnavailableItem) {
        return notionUnavailableModelResult(context, modelId, trigger);
      }
      const readiness = immediateItem ? { current: false, item: immediateItem } : await waitNotionModelItemOrCurrent(context, modelId, trigger);
      if (readiness?.current) {
        const menuClosed2 = await closeNotionModelMenu(context, trigger);
        return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed: menuClosed2 });
      }
      const item = readiness?.item || null;
      if (!item) {
        const unavailableItem = findNotionExactUnavailableModelItemAcrossRoots(notionModelMenuRoot(trigger), modelId)?.item || null;
        if (unavailableItem) {
          return notionUnavailableModelResult(context, modelId, trigger);
        }
        const menuClosed2 = await closeNotionModelMenu(context, trigger);
        if (currentNotionModelId(trigger) === modelId) {
          return preferredModelResult(context, true, "NotionAI", modelId, "", { skipped: true, menuClosed: menuClosed2 });
        }
        return preferredModelResult(context, false, "NotionAI", modelId, "target model item not found", {
          retryable: menuClosed2 === true,
          retryableBeforeSelection: true,
          selectionActivated: false,
          menuClosed: menuClosed2
        });
      }
      const clicked = preferredModelActivate(context, item);
      let settled = clicked ? await waitNotionModelSettled(context, modelId, trigger) : false;
      const menuClosed = await closeNotionModelMenu(context, trigger);
      if (!settled && currentNotionModelId(trigger) === modelId) settled = true;
      if (!clicked) return preferredModelResult(context, false, "NotionAI", modelId, "target model item could not be clicked", { menuClosed });
      return settled ? preferredModelResult(context, true, "NotionAI", modelId, "", { changed: true, menuClosed }) : preferredModelResult(context, false, "NotionAI", modelId, "selection did not settle", {
        fallbackEligible: menuClosed === true,
        selectionActivated: true,
        selectionUnsettled: true,
        menuClosed
      });
    }
    const notionSources = createPreferredNotionSourcesCapability({
      normalize: normalize2,
      modelElementText,
      visibleSelectorElements,
      modelRect,
      visible: visible2,
      isDisabledElement: isDisabledElement2,
      assertPreferredModelRun,
      preferredModelActivate,
      preferredModelPointerActivate,
      waitForPreferredModel,
      modelElementArea,
      modelEventConstructor,
      closest: closest2,
      preferredModelResult,
      findNotionComposerRoot,
      isNotionControlNearMainComposer: isNotionModelTriggerNearMainComposer
    });
    async function applyNotionPreferencesTransaction(context, modelId, effortId, allSourcesState, sourcesLease) {
      let modelOutcome = null;
      let effortOutcome = null;
      let sourceOutcome = null;
      if (modelId && allSourcesState) {
        const sourceTrigger = await notionSources.preflightNotionAllSourcesTrigger(context);
        assertPreferredModelRun(context);
        if (!sourceTrigger) {
          return preferredModelResult(context, false, "NotionAI", modelId, "sources trigger not found", {
            retryable: true,
            allSourcesState
          });
        }
      }
      if (modelId) {
        modelOutcome = await applyNotionPreferredModel(context, modelId);
        if (modelOutcome.ok !== true || modelOutcome.unavailable === true) {
          return modelOutcome;
        }
      }
      if (effortId) {
        effortOutcome = await notionEffort.applyNotionPreferredEffort(context, modelId, effortId);
        if (effortOutcome.ok !== true) return effortOutcome;
      }
      if (allSourcesState) {
        sourceOutcome = await notionSources.applyNotionAllSourcesPreference(
          context,
          modelId,
          allSourcesState,
          sourcesLease
        );
        if (sourceOutcome.ok !== true || !modelId) return sourceOutcome;
      }
      if (!allSourcesState && !effortId) return modelOutcome;
      if (currentNotionModelId() !== modelId) {
        return preferredModelResult(context, false, "NotionAI", modelId, "model changed while applying sources", {
          menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
          effortId,
          allSourcesState
        });
      }
      await preferredModelSleep(context, 120);
      if (currentNotionModelId() !== modelId) {
        return preferredModelResult(context, false, "NotionAI", modelId, "model was not stable after applying sources", {
          menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
          effortId,
          allSourcesState
        });
      }
      if (effortId && notionEffort.currentNotionEffortId() !== effortId) {
        return preferredModelResult(context, false, "NotionAI", modelId, "effort was not stable after applying", {
          menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
          effortId,
          allSourcesState
        });
      }
      const changed = modelOutcome?.changed === true || effortOutcome?.changed === true || sourceOutcome?.changed === true;
      return preferredModelResult(context, true, "NotionAI", modelId, "", {
        changed,
        skipped: !changed,
        menuClosed: sourceOutcome?.menuClosed ?? effortOutcome?.menuClosed ?? modelOutcome?.menuClosed,
        effortId,
        allSourcesState
      });
    }
    function applyNotionPreferences(context, modelId, effortId, allSourcesState) {
      return notionSources.runNotionPreferenceOperation(
        context,
        (sourcesLease) => applyNotionPreferencesTransaction(context, modelId, effortId, allSourcesState, sourcesLease)
      );
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
      const rawEffortId = String(data.effortId || "").trim();
      const rawAllSourcesState = String(data.allSourcesState || "").trim();
      const allSourcesState = NOTION_ALL_SOURCES_STATES.includes(rawAllSourcesState) ? rawAllSourcesState : "";
      if (!appId) return preferredModelResult(context, true, "unknown", modelId, "", { skipped: true });
      if (appId === "NotionAI") {
        if (rawAllSourcesState && !allSourcesState) {
          return preferredModelResult(context, false, appId, modelId, "unknown all sources state");
        }
        if (rawEffortId && !modelId) {
          return preferredModelResult(context, false, appId, modelId, "effort requires a model", { effortId: rawEffortId });
        }
        if (!modelId && !allSourcesState) {
          return preferredModelResult(context, true, appId, modelId, "", { skipped: true });
        }
        if (modelId && !NOTION_MODEL_TARGETS[modelId]) {
          return preferredModelResult(context, false, appId, modelId, "unknown model");
        }
        if (rawEffortId && !notionEffort.isSupported(modelId, rawEffortId)) {
          return preferredModelResult(context, false, appId, modelId, "unknown effort for model", { effortId: rawEffortId });
        }
        return applyNotionPreferences(context, modelId, rawEffortId, allSourcesState);
      }
      if (!modelId) return preferredModelResult(context, true, appId, modelId, "", { skipped: true });
      if (appId === "Gemini") return applyGeminiPreferredModel(context, modelId, { thinkingLevel: data.thinkingLevel });
      if (appId === "Grok") return applyGrokPreferredModel(context, modelId);
      if (appId === "DeepSeek") return applyDeepSeekPreferredModel(context, modelId);
      return preferredModelResult(context, true, appId, modelId, "", { skipped: true, unsupported: true });
    }
    async function runPreferredModelApply(data = {}) {
      const runId = String(data.runId || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      abortActivePreferredModelRun("superseded by a newer preferred model run");
      const controller = new AbortController();
      const rawAppId = String(data.appId || "").trim();
      const appId = {
        "GrokMirror": "Grok",
        "Grok Mirror": "Grok",
        "DeepSeek AI": "DeepSeek",
        "Notion AI": "NotionAI"
      }[rawAppId] || rawAppId || "unknown";
      const hasNotionSourcesPreference = appId === "NotionAI" && NOTION_ALL_SOURCES_STATES.includes(String(data.allSourcesState || "").trim());
      const defaultTimeoutMs = hasNotionSourcesPreference ? 43e3 : 12e3;
      const maximumTimeoutMs = hasNotionSourcesPreference ? 44e3 : 14e3;
      const timeoutMs = Math.max(1e3, Math.min(maximumTimeoutMs, Number(data.timeoutMs) || defaultTimeoutMs));
      const context = {
        runId,
        controller,
        signal: controller.signal,
        deadlineAt: Date.now() + timeoutMs,
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
      const timeout = setTimeout(() => {
        abortActivePreferredModelRun("preferred model apply timed out", runId);
      }, timeoutMs);
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
      modelEventConstructor: dom.modelEventConstructor,
      modelElementText: dom.modelElementText,
      modelRect: dom.modelRect,
      preferredModelActivate: dom.preferredModelActivate,
      preferredModelPointerActivate: dom.preferredModelPointerActivate,
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
