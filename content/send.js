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
  var CONTENT_RUNTIME_SEND_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/send.js", "entryPath": "content-src/content-send.js", "sourceSha256": "1141d5952f56096819242f09acf46fb4597aa1123cc1073f5615129b54eea006", "implementationSha256": "d00111ce181d9713a96d27466165b98cca9f6badab06ed1833549edbfd19ab6f", "implementationVersion": "2026.07.16.2+bundle.d00111ce181d9713a96d27466165b98cca9f6badab06ed1833549edbfd19ab6f" });

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
  function text(el) {
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
    return el.innerText || el.textContent || "";
  }
  function compareText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, "");
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

  // content-src/capabilities/send-runtime.js
  function createSendCapability(deps = {}) {
    const {
      qsa: qsa2,
      visible: visible2,
      normalize: normalize2,
      isDisabledElement: isDisabledElement2,
      sleep: sleep2,
      PROMPT_IMAGE_PASTE_STRATEGY_BATCH,
      buttonText: buttonText2,
      compareText: compareText2,
      text: text2,
      NOTION_SEND_PROMPT_SOURCE: NOTION_SEND_PROMPT_SOURCE2,
      NOTION_SEND_PROMPT_EVENT: NOTION_SEND_PROMPT_EVENT2,
      NOTION_SEND_TEXT_SOURCE: NOTION_SEND_TEXT_SOURCE2,
      NOTION_SEND_TEXT_EVENT: NOTION_SEND_TEXT_EVENT2,
      contentBridgeIsCurrent,
      markSubmissionNavigation
    } = deps;
    function inputCandidates(selector) {
      const selectors = [
        selector,
        "textarea",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']",
        "input[type='text']"
      ].filter(Boolean);
      for (const sel of selectors) {
        const candidate = qsa2(sel).filter(visible2).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        if (candidate) return candidate;
      }
      return null;
    }
    async function setInputValue(target, value) {
      target.focus?.();
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        try {
          const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
          if (descriptor?.set) descriptor.set.call(target, value);
          else target.value = value;
        } catch {
          target.value = value;
        }
        try {
          const length = String(value || "").length;
          target.setSelectionRange?.(length, length);
        } catch {
        }
        try {
          target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, composed: true, inputType: "insertText", data: String(value || "") }));
        } catch {
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, value);
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function submitButtonLabel(button) {
      return normalize2([
        button?.getAttribute?.("aria-label"),
        button?.getAttribute?.("title"),
        button?.getAttribute?.("data-testid"),
        button?.getAttribute?.("data-test-id"),
        button?.getAttribute?.("type"),
        button?.innerText,
        button?.textContent
      ].filter(Boolean).join(" "));
    }
    function submitButtonExcluded(button) {
      const label = submitButtonLabel(button).toLowerCase();
      return /\b(close|cancel|delete|remove|clear|dismiss|stop|attach|upload|file|image|photo)\b|关闭|取消|删除|移除|清空|停止|上传/.test(label);
    }
    function submitButtonScore(button, inputRect = null, explicit = false) {
      const label = submitButtonLabel(button).toLowerCase();
      let score = explicit ? 500 : 0;
      if (button?.matches?.("button[data-testid='send-button']")) score += 900;
      if (/submit\s+ai\s+message/.test(label)) score += 760;
      if (/^(send|发送|提交)$/.test(label)) score += 700;
      if (button?.matches?.("button[type='submit']")) score += 420;
      if (/\b(send|submit)\b|发送|提交/.test(label)) score += 320;
      if (inputRect && button?.getBoundingClientRect) {
        const rect = button.getBoundingClientRect();
        const yDistance = Math.abs((rect.top + rect.bottom) / 2 - (inputRect.top + inputRect.bottom) / 2);
        const rightDelta = rect.left - inputRect.left;
        score += Math.max(0, 240 - yDistance);
        if (rightDelta > 0) score += Math.min(180, rightDelta / 4);
        if (rect.bottom >= inputRect.top - 80 && rect.top <= inputRect.bottom + 120) score += 180;
      }
      return score;
    }
    function submitCandidates(selector, input) {
      const inputRect = input?.getBoundingClientRect?.() || null;
      const explicit = qsa2(selector).filter(visible2);
      const generic = qsa2([
        "button[data-testid='send-button']",
        "button[data-testid*='send' i]",
        "button[data-test-id*='send' i]",
        "button[aria-label*='Send' i]",
        "button[aria-label*='Submit' i]",
        "button[aria-label*='发送' i]",
        "button[aria-label*='提交' i]",
        "button[title*='Send' i]",
        "button[title*='Submit' i]",
        "button[type='submit']",
        "[role='button'][aria-label*='Send' i]",
        "[role='button'][aria-label*='Submit' i]",
        "[role='button'][data-testid*='send' i]",
        "[role='button'][data-test-id*='send' i]"
      ].join(",")).filter(visible2);
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      for (const entry of [...explicit.map((button) => [button, true]), ...generic.map((button) => [button, false])]) {
        const [button, isExplicit] = entry;
        if (!button || seen.has(button) || submitButtonExcluded(button)) continue;
        const score = submitButtonScore(button, inputRect, isExplicit);
        if (!isExplicit && score <= 0) continue;
        seen.add(button);
        candidates.push({ button, score });
      }
      return candidates.sort((a, b) => b.score - a.score).map((item) => item.button);
    }
    function clickPromptSubmit(button) {
      if (!button) return false;
      try {
        button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      } catch {
      }
      try {
        button.focus?.({ preventScroll: true });
      } catch {
      }
      if (typeof button.click === "function") {
        try {
          button.click();
          return true;
        } catch {
          return false;
        }
      }
      try {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window }));
        return true;
      } catch {
        return false;
      }
    }
    async function waitForPromptSubmitReady(input, selector = "", deadlineAt = 0, timeoutMs = 1e4) {
      const endAt = Math.min(
        Date.now() + Math.max(1e3, Number(timeoutMs) || 1e4),
        Number(deadlineAt) > Date.now() ? Number(deadlineAt) : Date.now() + Math.max(1e3, Number(timeoutMs) || 1e4)
      );
      let last = null;
      while (Date.now() < endAt) {
        last = submitCandidates(selector, input);
        const ready = last.find((button) => !isDisabledElement2(button));
        if (ready) return ready;
        await sleep2(Math.min(140, Math.max(0, endAt - Date.now())));
      }
      last = submitCandidates(selector, input);
      return last.find((button) => !isDisabledElement2(button)) || null;
    }
    function inferImageExtension(mime) {
      const value = String(mime || "").trim().toLowerCase();
      if (value === "image/jpeg") return "jpg";
      if (value === "image/png") return "png";
      if (value === "image/webp") return "webp";
      if (value === "image/gif") return "gif";
      if (value === "image/bmp") return "bmp";
      if (value === "image/svg+xml") return "svg";
      if (value === "image/avif") return "avif";
      const tail = value.split("/").pop();
      return tail ? tail.replace(/[^a-z0-9]+/gi, "") || "png" : "png";
    }
    function inferMimeFromDataUrl(dataUrl) {
      const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
      return match ? match[1].toLowerCase() : "";
    }
    function promptImageDataUrlToFile(entry = {}, index = 0) {
      const dataUrl = String(entry.dataUrl || entry.dataURL || "").trim();
      if (!/^data:image\//i.test(dataUrl)) return null;
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex < 0) return null;
      const meta = dataUrl.slice(5, commaIndex);
      const payload = dataUrl.slice(commaIndex + 1);
      const type = String(entry.type || "").trim() || inferMimeFromDataUrl(dataUrl) || "image/png";
      const name = String(entry.name || "").trim() || `prompt-image-${index + 1}.${inferImageExtension(type)}`;
      const lastModifiedRaw = Number(entry.lastModified);
      const lastModified = Number.isFinite(lastModifiedRaw) ? lastModifiedRaw : Date.now();
      try {
        let bytes;
        if (/(?:^|;)base64(?:;|$)/i.test(meta)) {
          const binary = atob(payload);
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } else {
          bytes = new TextEncoder().encode(decodeURIComponent(payload));
        }
        return new File([bytes], name, { type, lastModified });
      } catch {
        return null;
      }
    }
    function promptImageFilesFromPayload(images = []) {
      return (Array.isArray(images) ? images : []).map((entry, index) => promptImageDataUrlToFile(entry, index)).filter((file) => file && String(file.type || "").startsWith("image/"));
    }
    function createPromptDataTransfer({ text: text3 = "", files = [] } = {}) {
      if (typeof DataTransfer !== "function") return null;
      try {
        const transfer = new DataTransfer();
        for (const file of files || []) transfer.items.add(file);
        if (text3) {
          try {
            transfer.setData("text/plain", String(text3));
          } catch {
          }
        }
        return transfer;
      } catch {
        return null;
      }
    }
    function dispatchPromptTransferEvent(target, type, transfer, options = {}) {
      if (!target || type !== "paste") return false;
      const init = { bubbles: options.bubbles !== false, cancelable: true, composed: true };
      let event = null;
      try {
        if (typeof ClipboardEvent === "function") {
          event = new ClipboardEvent("paste", { ...init, clipboardData: transfer });
        }
      } catch {
      }
      if (!event) {
        try {
          event = new Event(type, init);
        } catch {
          event = null;
        }
      }
      if (!event) return false;
      if (transfer) {
        try {
          Object.defineProperty(event, "clipboardData", { value: transfer, configurable: true });
        } catch {
        }
        if (options.exposeDataTransfer !== false) {
          try {
            Object.defineProperty(event, "dataTransfer", { value: transfer, configurable: true });
          } catch {
          }
        }
      }
      try {
        target.dispatchEvent(event);
        return true;
      } catch {
        return false;
      }
    }
    function promptComposerScope(input) {
      if (!input) return document.body || document.documentElement || document;
      return input.closest?.("form") || input.closest?.("[data-testid*='composer' i],[data-test-id*='composer' i],[class*='composer' i],[class*='input-area' i],[class*='InputArea']") || input.parentElement?.parentElement || input.parentElement || document.body || document.documentElement || document;
    }
    function grokHost(hostname = location.hostname) {
      const host = String(hostname || "").toLowerCase();
      return host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai");
    }
    function isGrokSendTarget(data = {}) {
      const appId = String(data?.appId || "").trim().toLowerCase();
      const appName = String(data?.appName || "").trim().toLowerCase();
      return appId === "grok" || appName === "grok" || grokHost();
    }
    function kagiHost(hostname = location.hostname) {
      const host = String(hostname || "").toLowerCase();
      return host === "assistant.kagi.com";
    }
    function isKagiSendTarget(data = {}) {
      const appId = String(data?.appId || "").trim().toLowerCase();
      const appName = String(data?.appName || "").trim().toLowerCase();
      return appId === "kagi" || /\bkagi\b/.test(appName) || kagiHost();
    }
    function geminiHost(hostname = location.hostname) {
      const host = String(hostname || "").toLowerCase();
      return host === "gemini.google.com" || host.endsWith(".gemini.google.com");
    }
    function isGeminiSendTarget(data = {}) {
      const appId = String(data?.appId || "").trim().toLowerCase();
      const appName = String(data?.appName || "").trim().toLowerCase();
      return appId === "gemini" || /\bgemini\b/.test(appName) || geminiHost();
    }
    function promptImagePasteStrategy(data = {}) {
      return String(data?.imagePasteStrategy || "").trim().toLowerCase() === PROMPT_IMAGE_PASTE_STRATEGY_BATCH ? PROMPT_IMAGE_PASTE_STRATEGY_BATCH : "sequential";
    }
    function grokComposerScope(input) {
      if (!input) return promptComposerScope(input);
      let best = null;
      for (let node = input.parentElement, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
        const controls = qsa2("button,[role='button']", node).filter(visible2);
        const label = controls.map((button) => buttonText2(button)).join(" ");
        if (/附件|attach|model|模型|submit|send|提交|发送|voice|听写/i.test(label)) best = node;
        if (/移除此附件|remove\s+(?:this\s+)?attachment/i.test(label)) return node;
      }
      return best || promptComposerScope(input);
    }
    function geminiComposerScope(input) {
      if (!input) return promptComposerScope(input);
      let best = null;
      for (let node = input.parentElement, depth = 0; node && node !== document.body && depth < 10; node = node.parentElement, depth += 1) {
        const controls = qsa2("button,[role='button']", node).filter(visible2);
        const labels = controls.map((button) => buttonText2(button)).join(" ");
        const hasUpload = /upload\s*(?:&|and)?\s*tools|\bupload\b|上传/i.test(labels);
        const hasSend = /send\s*message|\bsend\b|发送|提交/i.test(labels);
        const hasComposerControl = /microphone|mode\s*picker|麦克风|模式/i.test(labels);
        if (hasUpload && hasSend) return node;
        if (hasUpload && hasComposerControl) best = node;
      }
      return best || promptComposerScope(input);
    }
    function attachmentRemoveButton(button) {
      const label = buttonText2(button).toLowerCase();
      return /^(?:remove|delete|移除|删除)$|remove\s+(?:this\s+)?(?:attachment|file|image|photo)|delete\s+(?:attachment|file|image|photo)|(?:remove|delete)\s+[^\n]{1,180}\.(?:avif|bmp|gif|jpe?g|png|svg|webp)\b|移除此附件|移除.*(?:附件|文件|图片|照片)|删除.*(?:附件|文件|图片|照片)/i.test(label);
    }
    function geminiAttachmentCloseButton(button) {
      const label = buttonText2(button).toLowerCase();
      return /close\s+(?:this\s+)?attachment|关闭(?:此)?附件/i.test(label);
    }
    function geminiAttachmentRows(scope) {
      const controls = qsa2("button,[role='button']", scope).filter((button) => visible2(button) && (geminiAttachmentCloseButton(button) || attachmentRemoveButton(button)));
      const images = qsa2("img[alt='attachment' i],img[aria-label='attachment' i]", scope).filter(visible2);
      return controls.length >= images.length ? controls : images;
    }
    function geminiPromptAttachmentSnapshot(input) {
      const scope = geminiComposerScope(input);
      const rows = geminiAttachmentRows(scope);
      const busySelectors = [
        "[aria-busy='true']",
        "[role='progressbar']",
        "progress",
        "mat-progress-spinner",
        "mat-progress-bar"
      ].join(",");
      let busy = false;
      try {
        busy = Array.from(scope.querySelectorAll(busySelectors)).some((node) => visible2(node));
        if (!busy) {
          busy = qsa2("[aria-label],[title],span,div", scope).some((node) => {
            if (!visible2(node)) return false;
            const explicit = normalize2([node.getAttribute?.("aria-label"), node.getAttribute?.("title")].filter(Boolean).join(" "));
            const leafText = node.children?.length ? "" : normalize2(node.textContent || "");
            return /^(?:loading image|uploading(?: image| file)?|正在加载图片|正在上传)/i.test(explicit || leafText);
          });
        }
      } catch {
      }
      return {
        count: rows.length,
        busy,
        key: rows.map((node) => {
          const rect = node.getBoundingClientRect?.();
          const image = node.matches?.("img") ? node : node.querySelector?.("img[alt='attachment' i],img[aria-label='attachment' i]");
          return [
            node.tagName,
            buttonText2(node),
            image?.getAttribute?.("src") || "",
            rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : ""
          ].join("|");
        }).join("\n")
      };
    }
    function promptAttachmentSnapshot(input, options = {}) {
      if (options.grok) return grokPromptAttachmentSnapshot(input);
      if (options.gemini) return geminiPromptAttachmentSnapshot(input);
      const scope = promptComposerScope(input);
      const selectors = [
        "img[src^='blob:']",
        "img[src^='data:image/']",
        "[data-testid*='attachment' i]",
        "[data-testid*='file' i]",
        "[data-test-id*='attachment' i]",
        "[data-test-id*='file' i]",
        "[aria-label*='remove file' i]",
        "[aria-label*='remove image' i]",
        "[aria-label*='delete file' i]",
        "[aria-label*='delete image' i]",
        "[class*='attachment' i]",
        "[class*='file-preview' i]",
        "[class*='image-preview' i]",
        "mat-chip"
      ].join(",");
      let nodes = [];
      try {
        nodes = Array.from(scope.querySelectorAll(selectors));
      } catch {
      }
      nodes = nodes.filter((node) => node && node !== input && visible2(node));
      const busySelectors = [
        "[aria-busy='true']",
        "[role='progressbar']",
        "progress",
        "mat-progress-spinner",
        "mat-progress-bar",
        "[class*='uploading' i]",
        "[class*='loading' i]"
      ].join(",");
      let busy = false;
      try {
        busy = Array.from(scope.querySelectorAll(busySelectors)).some((node) => visible2(node));
      } catch {
      }
      return {
        count: nodes.length,
        busy,
        key: nodes.map((node) => {
          const rect = node.getBoundingClientRect?.();
          return [
            node.tagName,
            node.getAttribute?.("src") || "",
            node.getAttribute?.("aria-label") || "",
            rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : ""
          ].join("|");
        }).join("\n")
      };
    }
    function grokAttachmentRows(scope) {
      const rows = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (node) => {
        if (!node || node === scope || seen.has(node) || !visible2(node)) return;
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          if (row === node || row.contains?.(node)) return;
          if (node.contains?.(row)) {
            rows[index] = node;
            seen.add(node);
            return;
          }
        }
        seen.add(node);
        rows.push(node);
      };
      const removeButtons = qsa2("button,[role='button']", scope).filter((button) => visible2(button) && attachmentRemoveButton(button));
      for (const button of removeButtons) {
        add(button.closest?.("li,[role='listitem'],[data-testid*='attachment' i],[data-test-id*='attachment' i],[class*='attachment' i],[class*='file' i]") || button.parentElement);
      }
      const inputRect = qsa2("textarea,[contenteditable='true']", scope).filter(visible2).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]?.getBoundingClientRect?.() || null;
      const tileButtons = qsa2("button,[role='button']", scope).filter((button) => {
        if (!visible2(button) || attachmentRemoveButton(button)) return false;
        const rect = button.getBoundingClientRect?.();
        if (!rect || rect.width < 18 || rect.height < 18 || rect.width > 96 || rect.height > 96) return false;
        if (inputRect && (rect.bottom < inputRect.top - 140 || rect.top > inputRect.top + 80)) return false;
        if (inputRect && rect.top >= inputRect.top - 8) return false;
        if (!qsa2("img,svg,canvas,[role='progressbar'],progress", button).some(visible2)) return false;
        const label = buttonText2(button).toLowerCase();
        return !/(attach|附件|model|模型|voice|听写|send|submit|发送|提交|plus|\+|add)/i.test(label);
      });
      for (const button of tileButtons) add(button.closest?.("li,[role='listitem'],[data-testid*='attachment' i],[data-test-id*='attachment' i],[class*='attachment' i],[class*='file' i]") || button);
      if (rows.length) return rows;
      for (const list of qsa2("[aria-label*='attachment' i],[aria-label*='附件' i],[role='list']", scope).filter(visible2)) {
        for (const child of Array.from(list.children || [])) {
          if (qsa2("img,button,[role='button']", child).some(visible2)) add(child);
        }
      }
      if (rows.length) return rows;
      for (const image of qsa2("img[src^='blob:'],img[src^='data:image/']", scope).filter(visible2)) {
        add(image.closest?.("[data-testid*='attachment' i],[data-test-id*='attachment' i],[class*='attachment' i],[class*='file' i],li,[role='listitem']") || image.parentElement);
      }
      return rows;
    }
    function grokPromptAttachmentSnapshot(input) {
      const scope = grokComposerScope(input);
      const rows = grokAttachmentRows(scope);
      const busySelectors = [
        "[aria-busy='true']",
        "[role='progressbar']",
        "progress",
        "[class*='uploading' i]",
        "[class*='loading' i]",
        "[class*='pending' i]"
      ].join(",");
      let busy = false;
      try {
        busy = Array.from(scope.querySelectorAll(busySelectors)).some((node) => visible2(node));
      } catch {
      }
      return {
        count: rows.length,
        busy,
        key: rows.map((node) => {
          const rect = node.getBoundingClientRect?.();
          return [
            node.tagName,
            buttonText2(node),
            rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : ""
          ].join("|");
        }).join("\n")
      };
    }
    function sendDeadlineAt(data = {}, fallbackMs = 1e4) {
      const value = Number(data?.deadlineAt);
      return Number.isFinite(value) && value > Date.now() ? value : Date.now() + Math.max(1e3, Number(fallbackMs) || 1e4);
    }
    function remainingDeadlineMs(deadlineAt, fallbackMs = 1e3) {
      const value = Number(deadlineAt);
      if (!Number.isFinite(value) || value <= 0) return Math.max(0, Number(fallbackMs) || 0);
      return Math.max(0, value - Date.now());
    }
    function deadlineExpired(deadlineAt) {
      return remainingDeadlineMs(deadlineAt, 1) <= 0;
    }
    async function sleepUntilDeadline(ms, deadlineAt) {
      const delay = Math.min(Math.max(0, Number(ms) || 0), remainingDeadlineMs(deadlineAt, ms));
      if (delay <= 0) return false;
      await sleep2(delay);
      return !deadlineExpired(deadlineAt);
    }
    async function waitForPromptImagesReady(input, expectedCount, timeoutMs = 45e3, deadlineAt = 0, options = {}) {
      const expected = Math.max(1, Number(expectedCount) || 1);
      const start = Date.now();
      let stableSince = 0;
      let lastKey = "";
      let last = promptAttachmentSnapshot(input, options);
      while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
        last = promptAttachmentSnapshot(input, options);
        if (options.exactCount && last.count > expected && !last.busy) {
          return { ok: false, reason: "Image attachment count exceeded expected count", overflow: true, snapshot: last };
        }
        const enough = options.exactCount ? last.count === expected : last.count >= expected;
        const same = last.key === lastKey;
        if (enough && !last.busy) {
          if (!same) stableSince = Date.now();
          if (Date.now() - stableSince >= 550) return { ok: true, snapshot: last };
        } else {
          stableSince = 0;
        }
        lastKey = last.key;
        if (!await sleepUntilDeadline(180, deadlineAt)) break;
      }
      return { ok: false, reason: deadlineExpired(deadlineAt) ? "Send deadline exceeded" : "timeout", snapshot: last };
    }
    function clearPromptAttachments(input, options = {}) {
      const scope = options.grok ? grokComposerScope(input) : options.gemini ? geminiComposerScope(input) : promptComposerScope(input);
      const selectors = [
        "button[aria-label*='remove file' i]",
        "button[aria-label*='remove image' i]",
        "button[aria-label*='remove attachment' i]",
        "button[aria-label*='remove this attachment' i]",
        "button[aria-label*='delete file' i]",
        "button[aria-label*='delete image' i]",
        "button[aria-label*='移除此附件' i]",
        "button[aria-label*='移除' i]",
        "button[aria-label*='删除' i]",
        "button[title*='remove' i]",
        "button[title*='delete' i]",
        "button[title*='移除此附件' i]",
        "button[title*='移除' i]",
        "button[title*='删除' i]",
        "button[aria-label*='close attachment' i]",
        "button[title*='close attachment' i]"
      ].join(",");
      let clicked = 0;
      try {
        const candidates = [];
        const seen = /* @__PURE__ */ new Set();
        const add = (button) => {
          if (!button || seen.has(button)) return;
          seen.add(button);
          candidates.push(button);
        };
        try {
          Array.from(scope.querySelectorAll(selectors)).forEach(add);
        } catch {
        }
        const attachmentAction = (button) => attachmentRemoveButton(button) || options.gemini && geminiAttachmentCloseButton(button);
        try {
          Array.from(scope.querySelectorAll("button,[role='button']")).filter(attachmentAction).forEach(add);
        } catch {
        }
        for (const button of candidates.filter((item) => visible2(item) && attachmentAction(item)).slice(0, 20)) {
          try {
            button.click?.();
            clicked += 1;
          } catch {
          }
        }
      } catch {
      }
      return clicked;
    }
    async function waitForPromptAttachmentsCleared(input, options = {}, timeoutMs = 2500, deadlineAt = 0) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
        const snapshot = promptAttachmentSnapshot(input, options);
        if (snapshot.count <= 0 && !snapshot.busy) return true;
        if (!await sleepUntilDeadline(120, deadlineAt)) break;
      }
      return promptAttachmentSnapshot(input, options).count <= 0;
    }
    async function attachPromptImageOnce(file, input) {
      input?.focus?.();
      const transfer = createPromptDataTransfer({ files: [file] });
      if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
      const target = input || document.activeElement;
      const fired = dispatchPromptTransferEvent(target, "paste", transfer);
      return fired ? { ok: true } : { ok: false, reason: "Paste image insertion was not accepted" };
    }
    async function attachGrokPromptImagesOnce(files, input, textValue = "") {
      input?.focus?.();
      const transfer = createPromptDataTransfer({ files, text: textValue });
      if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
      const target = input || document.activeElement || grokComposerScope(input);
      const fired = dispatchPromptTransferEvent(target, "paste", transfer, { exposeDataTransfer: false, bubbles: false });
      return fired ? { ok: true } : { ok: false, reason: "Grok image paste was not accepted" };
    }
    async function attachKagiPromptImagesOnce(files, input, textValue = "") {
      input?.focus?.();
      const transfer = createPromptDataTransfer({ files, text: textValue });
      if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
      const target = input || document.activeElement;
      const fired = dispatchPromptTransferEvent(target, "paste", transfer);
      return fired ? { ok: true } : { ok: false, reason: "Kagi image and text paste was not accepted" };
    }
    async function attachGeminiPromptImagesOnce(files, input, textValue = "") {
      input?.focus?.();
      const transfer = createPromptDataTransfer({ files, text: textValue });
      if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
      const target = input || document.activeElement;
      const fired = dispatchPromptTransferEvent(target, "paste", transfer);
      return fired ? { ok: true } : { ok: false, reason: "Gemini image and text paste was not accepted" };
    }
    async function attachBatchPromptImagesOnce(files, input) {
      input?.focus?.();
      const transfer = createPromptDataTransfer({ files });
      if (!transfer) return { ok: false, reason: "DataTransfer unavailable" };
      const target = input || document.activeElement;
      const fired = dispatchPromptTransferEvent(target, "paste", transfer);
      return fired ? { ok: true } : { ok: false, reason: "Batch image paste was not accepted" };
    }
    function promptImageSendTimeoutMs(data = {}, fallbackMs = 65e3) {
      const hasImages = Array.isArray(data?.images) && data.images.length > 0;
      if (!hasImages) return fallbackMs;
      return 6e4;
    }
    async function attachPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0) {
      const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
      if (!list.length) return { ok: true };
      const attempts = Math.max(0, Number(retryCount) || 0) + 1;
      let lastReason = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        if (attempt > 1) {
          clearPromptAttachments(input);
          if (!await waitForPromptAttachmentsCleared(input, {}, 2500, deadlineAt)) {
            return { ok: false, reason: "Batch attachments could not be cleared before retry" };
          }
          if (!await sleepUntilDeadline(450, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
          input = inputCandidates(inputSelector) || input;
        }
        const baseline = promptAttachmentSnapshot(input);
        for (const file of list) {
          if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
          const result = await attachPromptImageOnce(file, input);
          if (!result.ok) lastReason = result.reason || "Image insertion failed";
          if (!await sleepUntilDeadline(160, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        }
        const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45e3, remainingDeadlineMs(deadlineAt, 45e3)), deadlineAt);
        if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
        lastReason = ready.reason || "Image upload did not become ready";
      }
      return { ok: false, reason: lastReason || "Image upload did not become ready" };
    }
    async function attachBatchPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0) {
      const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
      if (!list.length) return { ok: true };
      const attempts = Math.max(0, Number(retryCount) || 0) + 1;
      let lastReason = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        if (attempt > 1) {
          clearPromptAttachments(input);
          if (!await sleepUntilDeadline(450, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
          input = inputCandidates(inputSelector) || input;
        }
        const baseline = promptAttachmentSnapshot(input);
        const result = await attachBatchPromptImagesOnce(list, input);
        if (!result.ok) lastReason = result.reason || "Batch image insertion failed";
        if (!await sleepUntilDeadline(220, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45e3, remainingDeadlineMs(deadlineAt, 45e3)), deadlineAt);
        if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
        lastReason = ready.reason || "Batch image upload did not become ready";
      }
      return { ok: false, reason: lastReason || "Batch image upload did not become ready" };
    }
    async function commitPastedPromptTextEarly(input, textValue = "", inputSelector = "", deadlineAt = 0) {
      const expected = compareText2(textValue);
      if (!expected) return { ok: true, input, usedFallback: false };
      if (!await sleepUntilDeadline(80, deadlineAt)) return { ok: false, input, usedFallback: false, reason: "Send deadline exceeded" };
      input = inputCandidates(inputSelector) || input;
      if (compareText2(text2(input)) === expected) return { ok: true, input, usedFallback: false };
      try {
        await setInputValue(input, textValue);
      } catch (error) {
        return { ok: false, input, usedFallback: true, reason: error?.message || "Prompt text fallback failed" };
      }
      if (!await sleepUntilDeadline(90, deadlineAt)) return { ok: false, input, usedFallback: true, reason: "Send deadline exceeded" };
      input = inputCandidates(inputSelector) || input;
      return {
        ok: compareText2(text2(input)) === expected,
        input,
        usedFallback: true,
        reason: compareText2(text2(input)) === expected ? "" : "Prompt text was not committed immediately after paste"
      };
    }
    async function attachGeminiPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0, textValue = "") {
      const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
      if (!list.length) return { ok: true, input };
      const attempts = Math.max(0, Number(retryCount) || 0) + 1;
      let lastReason = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        if (attempt > 1) {
          clearPromptAttachments(input, { gemini: true });
          if (!await waitForPromptAttachmentsCleared(input, { gemini: true }, 2500, deadlineAt)) {
            return { ok: false, reason: "Gemini attachments could not be cleared before retry" };
          }
          input = inputCandidates(inputSelector) || input;
          if (textValue.trim()) {
            await setInputValue(input, "");
            if (!await sleepUntilDeadline(120, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
            input = inputCandidates(inputSelector) || input;
          }
        }
        const baseline = promptAttachmentSnapshot(input, { gemini: true });
        const result = await attachGeminiPromptImagesOnce(list, input, textValue);
        if (!result.ok) lastReason = result.reason || "Gemini image and text insertion failed";
        const earlyText = await commitPastedPromptTextEarly(input, textValue, inputSelector, deadlineAt);
        input = earlyText.input || input;
        const ready = await waitForPromptImagesReady(
          input,
          baseline.count + list.length,
          Math.min(45e3, remainingDeadlineMs(deadlineAt, 45e3)),
          deadlineAt,
          { gemini: true, exactCount: true }
        );
        if (ready.ok && earlyText.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot, input };
        lastReason = ready.overflow ? "Gemini attached duplicate image files" : !earlyText.ok ? earlyText.reason || "Gemini prompt text was not committed immediately after paste" : ready.reason || "Gemini image upload did not become ready";
      }
      return { ok: false, reason: lastReason || "Gemini image and text upload did not become ready" };
    }
    async function attachGrokPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0, textValue = "") {
      const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
      if (!list.length) return { ok: true };
      const attempts = Math.min(2, Math.max(0, Number(retryCount) || 0) + 1);
      let lastReason = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        const existing = promptAttachmentSnapshot(input, { grok: true });
        if (attempt > 1 || existing.count > 0) {
          clearPromptAttachments(input, { grok: true });
          if (!await waitForPromptAttachmentsCleared(input, { grok: true }, 2500, deadlineAt)) {
            return { ok: false, reason: "Grok attachments could not be cleared before retry" };
          }
          input = inputCandidates(inputSelector) || input;
        }
        const baseline = promptAttachmentSnapshot(input, { grok: true });
        const result = await attachGrokPromptImagesOnce(list, input, textValue);
        if (!result.ok) lastReason = result.reason || "Grok image insertion failed";
        if (!await sleepUntilDeadline(220, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45e3, remainingDeadlineMs(deadlineAt, 45e3)), deadlineAt, { grok: true, exactCount: true });
        if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
        lastReason = ready.overflow ? "Grok attached duplicate image files" : ready.reason || "Grok image upload did not become ready";
      }
      return { ok: false, reason: lastReason || "Grok image upload did not become ready" };
    }
    async function attachKagiPromptImagesWithRetries(input, files = [], retryCount = 3, inputSelector = "", deadlineAt = 0, textValue = "") {
      const list = Array.from(files || []).filter((file) => file && String(file.type || "").startsWith("image/"));
      if (!list.length) return { ok: true };
      const attempts = Math.max(0, Number(retryCount) || 0) + 1;
      let lastReason = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        if (attempt > 1) {
          clearPromptAttachments(input);
          if (!await waitForPromptAttachmentsCleared(input, {}, 2500, deadlineAt)) {
            return { ok: false, reason: "Kagi attachments could not be cleared before retry" };
          }
          input = inputCandidates(inputSelector) || input;
          if (textValue.trim()) {
            await setInputValue(input, "");
            if (!await sleepUntilDeadline(120, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
          }
        }
        const baseline = promptAttachmentSnapshot(input);
        const result = await attachKagiPromptImagesOnce(list, input, textValue);
        if (!result.ok) lastReason = result.reason || "Kagi image and text insertion failed";
        if (!await sleepUntilDeadline(220, deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        const ready = await waitForPromptImagesReady(input, baseline.count + list.length, Math.min(45e3, remainingDeadlineMs(deadlineAt, 45e3)), deadlineAt);
        if (ready.ok) return { ok: true, attempts: attempt, snapshot: ready.snapshot };
        lastReason = ready.reason || "Kagi image upload did not become ready";
      }
      return { ok: false, reason: lastReason || "Kagi image upload did not become ready" };
    }
    function isNotionSendTarget(data = {}) {
      const appId = String(data?.appId || "").trim().toLowerCase();
      const appName = String(data?.appName || "").trim().toLowerCase();
      const host = String(location.hostname || "").toLowerCase();
      return appId === "notionai" || /\bnotion\b/.test(appName) || host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so");
    }
    function requestNotionSendPrompt(data = {}, timeoutMs = promptImageSendTimeoutMs(data, 65e3)) {
      return new Promise((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const deadlineAt = sendDeadlineAt(data, timeoutMs);
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMessage, true);
          resolve({ ok: false, sent: false, method: "notion-prompt-bridge", reason: "Notion AI prompt bridge timed out" });
        }, Math.max(1e3, remainingDeadlineMs(deadlineAt, timeoutMs)));
        function finish(result) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve(result && typeof result === "object" ? result : { ok: false, sent: false, method: "notion-prompt-bridge" });
        }
        function onMessage(event) {
          const message = event.data;
          if (message?.source !== NOTION_SEND_PROMPT_SOURCE2 || message.type !== "response" || message.id !== id) return;
          finish(message.data || {});
        }
        window.addEventListener("message", onMessage, true);
        try {
          window.dispatchEvent(new CustomEvent(NOTION_SEND_PROMPT_EVENT2, {
            detail: {
              id,
              sendId: String(data?.sendId || ""),
              deadlineAt,
              text: String(data?.text || ""),
              images: Array.isArray(data?.images) ? data.images : [],
              imageRetryCount: Math.max(0, Number(data?.imageRetryCount) || 0),
              sendKeyMode: data?.sendKeyMode || "enter"
            }
          }));
        } catch (error) {
          finish({
            ok: false,
            sent: false,
            method: "notion-prompt-bridge",
            reason: error?.message || String(error || "Notion AI prompt send failed")
          });
        }
      });
    }
    function requestNotionSendText(data = {}, timeoutMs = 9e3) {
      return new Promise((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const deadlineAt = sendDeadlineAt(data, timeoutMs);
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMessage, true);
          resolve({ ok: false, sent: false, method: "notion-bridge", reason: "Notion AI send bridge timed out" });
        }, Math.max(1e3, remainingDeadlineMs(deadlineAt, timeoutMs)));
        function finish(result) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve(result && typeof result === "object" ? result : { ok: false, sent: false, method: "notion-bridge" });
        }
        function onMessage(event) {
          const message = event.data;
          if (message?.source !== NOTION_SEND_TEXT_SOURCE2 || message.type !== "response" || message.id !== id) return;
          finish(message.data || {});
        }
        window.addEventListener("message", onMessage, true);
        try {
          window.dispatchEvent(new CustomEvent(NOTION_SEND_TEXT_EVENT2, {
            detail: {
              id,
              sendId: String(data?.sendId || ""),
              deadlineAt,
              text: String(data?.text || ""),
              sendKeyMode: data?.sendKeyMode || "enter"
            }
          }));
        } catch (error) {
          finish({
            ok: false,
            sent: false,
            method: "notion-bridge",
            reason: error?.message || String(error || "Notion AI send bridge failed")
          });
        }
      });
    }
    async function sendNotionText(data = {}) {
      const hasImages = Array.isArray(data?.images) && data.images.length > 0;
      const result = hasImages ? await requestNotionSendPrompt(data) : await requestNotionSendText(data);
      if (result?.ok && result?.sent) {
        return {
          sent: true,
          method: result.method || "notion-bridge",
          verified: result.verified !== false
        };
      }
      return {
        sent: false,
        method: result?.method || "notion-bridge",
        verified: false,
        reason: result?.reason || "Notion AI did not accept the prompt"
      };
    }
    const sendTextRequestCache = window.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ instanceof Map ? window.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ : /* @__PURE__ */ new Map();
    window.__CHATCLUB_SEND_TEXT_REQUEST_CACHE__ = sendTextRequestCache;
    function sendTextRequestKey(data = {}) {
      return String(data?.sendId || "").trim();
    }
    function forgetSendTextRequest(key, record, delayMs) {
      setTimeout(() => {
        if (sendTextRequestCache.get(key) === record) sendTextRequestCache.delete(key);
      }, delayMs);
    }
    async function runSendTextOnce(data, runner) {
      const key = sendTextRequestKey(data);
      if (!key) return runner();
      const existing = sendTextRequestCache.get(key);
      if (existing) return existing.promise;
      const record = { promise: null };
      record.promise = Promise.resolve().then(runner).then((result) => {
        record.promise = Promise.resolve(result);
        forgetSendTextRequest(key, record, 12e4);
        return result;
      }, (error) => {
        forgetSendTextRequest(key, record, 3e4);
        throw error;
      });
      sendTextRequestCache.set(key, record);
      return record.promise;
    }
    async function sendText(data) {
      return runSendTextOnce(data, () => sendTextUncached(data));
    }
    async function sendTextUncached(data) {
      if (isNotionSendTarget(data)) return sendNotionText(data);
      const grok = isGrokSendTarget(data);
      const kagi = isKagiSendTarget(data);
      const gemini = isGeminiSendTarget(data);
      const deadlineAt = sendDeadlineAt(data, Array.isArray(data?.images) && data.images.length ? 6e4 : 1e4);
      if (deadlineExpired(deadlineAt)) throw new Error("Send deadline exceeded");
      let input = inputCandidates(data?.inputSelector);
      if (!input) throw new Error("Input element not found");
      const files = promptImageFilesFromPayload(data?.images);
      const textValue = String(data.text || "");
      if (Array.isArray(data?.images) && data.images.length && !files.length) {
        throw new Error("Image payload could not be restored");
      }
      const batch = promptImagePasteStrategy(data) === PROMPT_IMAGE_PASTE_STRATEGY_BATCH;
      const geminiBatch = gemini && batch;
      if (files.length) {
        const attached = grok ? await attachGrokPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt, textValue) : kagi ? await attachKagiPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt, textValue) : geminiBatch ? await attachGeminiPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt, textValue) : batch ? await attachBatchPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt) : await attachPromptImagesWithRetries(input, files, data?.imageRetryCount ?? 3, data?.inputSelector || "", deadlineAt);
        if (!attached.ok) throw new Error(attached.reason || "Image insertion failed");
        if (grok || kagi || geminiBatch) input = inputCandidates(data?.inputSelector) || attached.input || input;
      }
      if (deadlineExpired(deadlineAt)) throw new Error("Send deadline exceeded");
      const combinedPaste = files.length > 0 && (grok || kagi || geminiBatch);
      if (textValue.trim() && (!combinedPaste || compareText2(text2(input)) !== compareText2(textValue))) await setInputValue(input, textValue);
      await sleepUntilDeadline(grok ? 320 : 140, deadlineAt);
      const submit = await waitForPromptSubmitReady(input, data?.sendButtonSelector, deadlineAt, files.length ? 12e3 : 8e3);
      if (submit) {
        if (!contentBridgeIsCurrent()) throw new Error("Send bridge was superseded before submit");
        markSubmissionNavigation(data, "button");
        if (!clickPromptSubmit(submit)) throw new Error("Submit button activation failed");
        return { sent: true, method: "button", verified: false };
      }
      if (files.length) throw new Error("Submit button stayed disabled");
      if (deadlineExpired(deadlineAt)) throw new Error("Send deadline exceeded");
      if (!contentBridgeIsCurrent()) throw new Error("Send bridge was superseded before submit");
      const keyInit = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      markSubmissionNavigation(data, "enter");
      input.dispatchEvent(new KeyboardEvent("keydown", keyInit));
      input.dispatchEvent(new KeyboardEvent("keyup", keyInit));
      return { sent: true, method: "enter", verified: false };
    }
    return Object.freeze({
      sendText,
      newChatPreprocess: () => ({ ok: true })
    });
  }

  // content-src/content-send.js
  function installSendCapability() {
    const runtimes = runtimeRegistry(window);
    const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SEND_BUNDLE_IDENTITY);
    runtimes.registerBundle(runtimeIdentity);
    const submissionNavigation = createSubmissionNavigationTracker(window);
    const handlers = createSendCapability({
      qsa,
      visible,
      normalize,
      isDisabledElement,
      sleep,
      buttonText,
      compareText,
      text,
      PROMPT_IMAGE_PASTE_STRATEGY_BATCH: "batch",
      NOTION_SEND_PROMPT_SOURCE: CONTENT_PROTOCOL.NOTION_SEND_PROMPT_SOURCE,
      NOTION_SEND_PROMPT_EVENT: CONTENT_PROTOCOL.NOTION_SEND_PROMPT_EVENT,
      NOTION_SEND_TEXT_SOURCE: CONTENT_PROTOCOL.NOTION_SEND_TEXT_SOURCE,
      NOTION_SEND_TEXT_EVENT: CONTENT_PROTOCOL.NOTION_SEND_TEXT_EVENT,
      contentBridgeIsCurrent: () => Boolean(
        runtimes.isActive && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === runtimeIdentity.implementationVersion
      ),
      markSubmissionNavigation: submissionNavigation.mark
    });
    installContentCapability(runtimes, {
      capability: "send",
      owner: "content-capability:send",
      version: runtimeIdentity.bundle.implementationVersion,
      routerVersion: runtimeIdentity.implementationVersion,
      handlers
    });
  }
  installSendCapability();
})();
