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
  var CONTENT_RUNTIME_MESSAGE_NAVIGATOR_BUNDLE_IDENTITY = /* @__PURE__ */ Object.freeze({ "outputPath": "content/message-navigator.js", "entryPath": "content-src/message-navigator.js", "sourceSha256": "7b2470dd44488ffddaf5759e0dfae671ee5e59854546a2c41f50afcf3713609d", "implementationSha256": "acc5f1eb76561986d291a4afaa6757cca7fd8c35941c5bcab45498401dcff0c8", "implementationVersion": "2026.07.16.2+bundle.acc5f1eb76561986d291a4afaa6757cca7fd8c35941c5bcab45498401dcff0c8" });

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

  // content-src/shared/message-navigator-port.js
  function createMessageNavigatorPort(runtimes) {
    const runtime = (required = true) => {
      const api = runtimes?.registration?.("message-navigator")?.api;
      if (api && typeof api.setEnabled === "function") return api;
      if (required) throw new Error("Message navigator runtime is unavailable");
      return null;
    };
    return Object.freeze({
      setEnabled(data = {}) {
        return runtime().setEnabled(data);
      },
      hideMenu() {
        const api = runtime();
        return typeof api.closeMenu === "function" ? api.closeMenu() : api.state();
      },
      state() {
        const api = runtime(false);
        return api && typeof api.state === "function" ? api.state() : { ok: false, enabled: false, messageCount: 0, error: "Message navigator runtime is unavailable" };
      }
    });
  }

  // content-src/message-navigator/constants.js
  var MESSAGE_NAVIGATOR_RUNTIME_NAME = "message-navigator";
  var MESSAGE_NAVIGATOR_ROOT_ID = "chatclub-message-nav-root";
  var MESSAGE_NAVIGATOR_STYLE_ID = "chatclub-message-nav-style";
  var MESSAGE_NAVIGATOR_EFFECT_MODES = Object.freeze([
    "none",
    "border",
    "pulse",
    "fade",
    "jiggle"
  ]);

  // content-src/message-navigator/dom-kernel.js
  var normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  function safeQsa(selector, root = document) {
    try {
      return selector ? Array.from((root || document).querySelectorAll(selector)) : [];
    } catch {
      return [];
    }
  }
  function safeClosest(element, selector) {
    try {
      return element?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }
  function safeMatches(element, selector) {
    try {
      return Boolean(element?.matches?.(selector));
    } catch {
      return false;
    }
  }
  function visible(element) {
    if (!element || element.nodeType !== 1) return false;
    try {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
    } catch {
      return false;
    }
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
  function uniqueElements(elements) {
    const out = [];
    for (const element of elements || []) {
      if (!element || out.includes(element)) continue;
      if (out.some((other) => other !== element && other.contains?.(element))) continue;
      for (let index = out.length - 1; index >= 0; index -= 1) {
        if (element.contains?.(out[index])) out.splice(index, 1);
      }
      out.push(element);
    }
    return out.sort(elementOrder);
  }
  function cloneText(element, cleanupSelectors = []) {
    if (!element) return "";
    let clone;
    try {
      clone = element.cloneNode(true);
    } catch {
      return normalize(element.innerText || element.textContent || "");
    }
    const noisy = [
      "button",
      "svg",
      "header",
      "footer",
      "nav",
      "menu",
      "form",
      "input",
      "textarea",
      "select",
      "[aria-hidden='true']",
      "[hidden]",
      "[role='toolbar']",
      "[data-files]",
      "[data-edit]",
      ".sr-only",
      ".visually-hidden",
      ".selector",
      ".code-buttons",
      ...cleanupSelectors
    ];
    for (const selector of noisy) {
      for (const node of safeQsa(selector, clone)) node.remove();
    }
    return normalize(clone.innerText || clone.textContent || "");
  }
  function compactText(value, limit = 60) {
    const text = normalize(value).replace(/\s+/g, " ");
    if (!text) return "";
    const max = Math.max(20, Math.min(180, Number(limit) || 60));
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}...` : text;
  }
  function rawText(element) {
    return normalize(element?.innerText || element?.textContent || "");
  }
  function metaText(element) {
    return normalize([
      element?.tagName,
      element?.getAttribute?.("id"),
      element?.getAttribute?.("role"),
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-test-id"),
      element?.getAttribute?.("data-message-author-role"),
      element?.getAttribute?.("data-author"),
      element?.getAttribute?.("data-turn-role"),
      element?.getAttribute?.("data-message-role"),
      element?.getAttribute?.("class")
    ].filter(Boolean).join(" ")).toLowerCase();
  }
  function fullMetaText(element) {
    return normalize([
      metaText(element),
      element?.getAttribute?.("name"),
      element?.getAttribute?.("value"),
      element?.textContent,
      element?.innerText
    ].filter(Boolean).join(" "));
  }
  function pageRoot(selector = "main,[role='main']") {
    return safeQsa(selector).filter(visible).find((element) => !safeClosest(element, "nav,aside,header,footer")) || safeQsa("main,[role='main']").filter(visible).find((element) => !safeClosest(element, "nav,aside,header,footer")) || document.body || document.documentElement;
  }
  function inChromeScope(element) {
    return Boolean(safeClosest(element, [
      `#${MESSAGE_NAVIGATOR_ROOT_ID}`,
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "input",
      "textarea",
      "select",
      "[contenteditable='true']"
    ].join(",")));
  }
  function cleanLine(value) {
    return normalize(value).replace(/^[-•]\s*/, "").replace(/\s+/g, " ").trim();
  }
  function referenceOnlyText(value) {
    const text = normalize(value).replace(/\s+/g, " ");
    if (!text) return true;
    if (/^(?:References|Sources|Citations|引用|来源|参考)\b/i.test(text)) return true;
    if (/^\(?\d+\s+total\)?$/i.test(text)) return true;
    if (/^(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:\s+\d+%)?$/i.test(text)) return true;
    return false;
  }
  function controlOnlyText(value) {
    const text = normalize(value).replace(/\s+/g, " ");
    return /^(?:copy|copied|copy message|copy response|copy text|复制|已复制|拷贝|Quick|Default|Prompt|助手|其他|High|Send|Ask anything|Message)$/i.test(text);
  }
  function usefulTurnText(value, maxLength = 5e4) {
    const text = normalize(value);
    if (!text || text.length < 2 || text.length > maxLength) return "";
    if (!/[\w\u4e00-\u9fff]/.test(text)) return "";
    if (controlOnlyText(text) || referenceOnlyText(text)) return "";
    return text;
  }
  function elementArea(element) {
    try {
      const rect = element.getBoundingClientRect();
      return Math.max(1, rect.width * rect.height);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  function textMatchesNeedle(text, needle) {
    const haystack = cleanLine(text).toLowerCase();
    const rawNeedle = cleanLine(needle).toLowerCase();
    if (!haystack || !rawNeedle) return false;
    const compactNeedle = rawNeedle.length > 96 ? rawNeedle.slice(0, 96).trim() : rawNeedle;
    return haystack.includes(compactNeedle) || haystack.length >= 12 && rawNeedle.includes(haystack);
  }
  function targetForText(root, config, needles, options = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const selector = options.selector || "article,section,div,p,[role='article'],[data-message-author-role],[data-testid*='message'],[class*='message' i],[class*='bubble' i],[class*='response' i]";
    const wanted = (Array.isArray(needles) ? needles : [needles]).map(cleanLine).filter(Boolean);
    if (!wanted.length) return root;
    const candidates = safeQsa(selector, root).filter((element) => element !== root && visible(element) && !inChromeScope(element)).filter((element) => !options.reject?.(element)).map((element) => ({ element, text: cloneText(element, cleanupSelectors) })).filter((item) => usefulTurnText(item.text, options.maxLength || 6e4)).filter((item) => wanted.some((needle) => textMatchesNeedle(item.text, needle)));
    candidates.sort((a, b) => {
      const area = elementArea(a.element) - elementArea(b.element);
      return area || a.text.length - b.text.length || elementOrder(a.element, b.element);
    });
    return candidates[0]?.element || root;
  }

  // content-src/message-navigator/effect-target.js
  var STRICT_MESSAGE_ROOT_SELECTOR = [
    "[data-nsan-owner='nsan']",
    "[data-nsan-article='1']",
    "article[data-testid^='conversation-turn-']",
    "article[data-testid*='conversation-turn']",
    "article[data-turn-id]",
    "article[data-turn]",
    "[data-message-author-role]",
    "ms-chat-turn[id^='turn-']",
    "ms-chat-turn",
    "user-query",
    "model-response",
    ".user-query",
    ".model-response",
    ".chat_bubble[role='article']",
    ".chat_bubble",
    ".ds-message",
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[class*='ChatMessage_chatMessage']",
    "[data-turn-role]",
    ".chat-turn-container",
    "[role='article']",
    "[role='user']",
    "[role='assistant']"
  ].join(",");
  var LOOSE_MESSAGE_ROOT_SELECTOR = [
    STRICT_MESSAGE_ROOT_SELECTOR,
    "[class*='message' i]",
    "[class*='response' i]",
    "[class*='turn' i]",
    "[class*='bubble' i]"
  ].join(",");
  var USER_EFFECT_BODY_SELECTOR = [
    ".user-message-bubble-color",
    "[class*='user-message-bubble' i]",
    "[class*='rightSideMessageBubble']",
    "[class*='Message_rightSideMessageBubble']",
    "[class*='bubble-color' i]",
    ".user-query-bubble-with-background",
    ".query-text",
    ".query-content",
    ".fbb737a4",
    ".rounded-3xl",
    ".chat_bubble_content",
    "[data-testid='user-message']"
  ].join(",");
  var ASSISTANT_EFFECT_BODY_SELECTOR = [
    "[data-message-part-type='answer'].markdown-container-style",
    ".markdown-container-style",
    ".font-claude-response",
    ".font-claude-response-body",
    ".model-response-text .markdown",
    "message-content .markdown",
    ".turn-content",
    "[class*='turn-content']",
    ".ds-markdown:not(.ds-think-content)",
    ".chat_bubble_content",
    "[class*='Message_messageTextContainer']",
    "[class*='Message_leftSideMessageBubble']",
    ".assistant-message-bubble-color",
    ".markdown.prose",
    ".markdown",
    ".prose"
  ].join(",");
  var MESSAGE_ROLE_MARKER_SELECTOR = [
    "[data-message-author-role]",
    "[data-author]",
    "[data-role]",
    "[data-turn-role]",
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[role='user']",
    "[role='assistant']",
    "user-query",
    "model-response",
    ".user-query",
    ".model-response",
    ".user-message-bubble-color",
    ".assistant-message-bubble-color",
    "[class*='rightSideMessageBubble']",
    "[class*='leftSideMessageBubble']",
    ".fbb737a4",
    ".ds-markdown"
  ].join(",");
  var COMPOSER_CHROME_SELECTOR = [
    "form",
    "textarea",
    "input:not([type='hidden'])",
    "[contenteditable='true']",
    "[role='textbox']",
    "[aria-label*='Chat with' i]",
    "[aria-label*='Ask anything' i]",
    "textarea[aria-label*='Message' i]",
    "input[aria-label*='Message' i]",
    "[contenteditable='true'][aria-label*='Message' i]",
    "[role='textbox'][aria-label*='Message' i]",
    "[placeholder*='Ask' i]",
    "[placeholder*='Message' i]",
    "[class*='composer' i]",
    "[data-testid*='composer' i]"
  ].join(",");
  function normalizeRoleName(value) {
    const text = String(value || "").toLowerCase();
    if (/\b(user|human|you|query|prompt)\b/.test(text)) return "user";
    if (/\b(assistant|bot|model|response|answer|tool)\b/.test(text)) return "assistant";
    return "";
  }
  function directMessageRole(element) {
    if (!element || element.nodeType !== 1) return "";
    const attrs = [
      "data-message-author-role",
      "data-author",
      "data-role",
      "data-turn-role",
      "data-testid",
      "aria-label"
    ];
    for (const attr of attrs) {
      const role = normalizeRoleName(element.getAttribute?.(attr));
      if (role) return role;
    }
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "user-query") return "user";
    if (tag === "model-response") return "assistant";
    const classText = String(element.className || "");
    if (/(^|\s)(user-query|user-message-bubble-color|fbb737a4)(\s|$)|rightSideMessageBubble/i.test(classText)) return "user";
    if (/(^|\s)(model-response|assistant-message-bubble-color|ds-markdown)(\s|$)|leftSideMessageBubble|font-claude-response/i.test(classText)) return "assistant";
    return "";
  }
  function roleMarkersWithin(element) {
    if (!element || element.nodeType !== 1) return [];
    const markers = [];
    if (safeMatches(element, MESSAGE_ROLE_MARKER_SELECTOR)) markers.push(element);
    markers.push(...safeQsa(MESSAGE_ROLE_MARKER_SELECTOR, element));
    return uniqueElements(markers).filter((node) => visible(node) && !safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`));
  }
  function containsConflictingRole(element, role) {
    const wanted = role === "user" ? "user" : role ? "assistant" : "";
    if (!wanted) return false;
    return roleMarkersWithin(element).some((node) => {
      const markerRole = directMessageRole(node);
      return markerRole && markerRole !== wanted;
    });
  }
  function containsComposerChrome(element) {
    if (!element || element.nodeType !== 1) return false;
    const controls = safeQsa(COMPOSER_CHROME_SELECTOR, element).filter((node) => node !== element && visible(node) && !safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`));
    return controls.length > 0;
  }
  function effectRect(element) {
    try {
      const rect = element?.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0 ? rect : null;
    } catch {
      return null;
    }
  }
  function invalidEffectTarget(element, config = {}) {
    if (!element || element.nodeType !== 1 || !visible(element)) return true;
    if (safeClosest(element, `#${MESSAGE_NAVIGATOR_ROOT_ID}`)) return true;
    if (safeMatches(element, [
      "html",
      "body",
      "main",
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "button",
      "input",
      "textarea",
      "select",
      "svg",
      "img",
      "canvas",
      "video",
      "menu",
      "[role='toolbar']",
      "[role='menu']",
      "[aria-hidden='true']",
      "[hidden]"
    ].join(","))) return true;
    if (safeClosest(element, [
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "[role='toolbar']",
      "[role='menu']",
      "[class*='toolbar' i]",
      "[class*='action' i]",
      "[class*='actions' i]",
      "[class*='copy' i]",
      "[data-testid*='action' i]"
    ].join(","))) return true;
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const hasText = usefulTurnText(cloneText(element, cleanupSelectors), 8e4);
    const hasMedia = Boolean(safeQsa("pre,code,blockquote,ul,ol,table,img,video,canvas,svg", element).find(visible));
    return !hasText && !hasMedia;
  }
  function containsMultipleMessageRoots(element) {
    const roots = safeQsa(STRICT_MESSAGE_ROOT_SELECTOR, element).filter((node) => node !== element && visible(node) && !safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`));
    const directRoots = uniqueElements(roots).filter((node) => !safeQsa(STRICT_MESSAGE_ROOT_SELECTOR, node).some((child) => child !== node && roots.includes(child)));
    return directRoots.length > 1;
  }
  function blockedEffectBoundary(element, role = "") {
    if (!element || element.nodeType !== 1) return true;
    if (containsConflictingRole(element, role)) return true;
    if (containsMultipleMessageRoots(element)) return true;
    if (containsComposerChrome(element)) return true;
    return false;
  }
  function effectTargetTooBroad(element) {
    if (!element || safeMatches(element, STRICT_MESSAGE_ROOT_SELECTOR)) return false;
    if (containsMultipleMessageRoots(element)) return true;
    const rect = effectRect(element);
    const root = pageRoot();
    const rootRect = effectRect(root);
    if (!rect || !rootRect) return false;
    return rect.width >= rootRect.width * 0.92 && rect.height >= Math.max(500, rootRect.height * 0.72);
  }
  function usableEffectTarget(element, config = {}, options = {}) {
    if (invalidEffectTarget(element, config)) return false;
    if (!options.allowBoundaryCrossing && blockedEffectBoundary(element, options.role || "")) return false;
    if (!options.allowBroad && effectTargetTooBroad(element)) return false;
    return true;
  }
  function effectMatches(root, selector, config = {}, options = {}) {
    const candidates = [];
    if (safeMatches(root, selector)) candidates.push(root);
    candidates.push(...safeQsa(selector, root));
    const seen = /* @__PURE__ */ new Set();
    const filtered = [];
    for (const element of candidates) {
      if (!element || seen.has(element) || !usableEffectTarget(element, config, options)) continue;
      seen.add(element);
      filtered.push(element);
    }
    if (options.prefer === "last") return filtered[filtered.length - 1] || null;
    filtered.sort((a, b) => {
      const area = elementArea(a) - elementArea(b);
      return options.prefer === "largest" ? -area || elementOrder(a, b) : area || elementOrder(a, b);
    });
    return filtered[0] || null;
  }
  function closestEffectMatch(seed, selector, config = {}, options = {}) {
    for (let node = seed; node && node !== document.documentElement; node = node.parentElement) {
      if (safeMatches(node, selector) && usableEffectTarget(node, config, options)) return node;
      if (safeMatches(node, "main,body")) break;
    }
    return null;
  }
  function messageRootForEffect(element, target, config = {}, options = {}) {
    const seeds = [target, element].filter(Boolean);
    for (const seed of seeds) {
      const strict = closestEffectMatch(seed, STRICT_MESSAGE_ROOT_SELECTOR, config, { ...options, allowBroad: true });
      if (strict && !blockedEffectBoundary(strict, options.role || "")) return strict;
    }
    for (const seed of seeds) {
      const loose = closestEffectMatch(seed, LOOSE_MESSAGE_ROOT_SELECTOR, config, options);
      if (loose && !blockedEffectBoundary(loose, options.role || "")) return loose;
    }
    return seeds.find((seed) => usableEffectTarget(seed, config, options)) || element || target || null;
  }
  function roleRootForEffect(element, target, selector, config = {}, role = "") {
    const options = { allowBroad: true, role };
    for (const seed of [target, element].filter(Boolean)) {
      const closest = closestEffectMatch(seed, selector, config, options);
      if (closest) return closest;
    }
    for (const seed of [element, target].filter(Boolean)) {
      const match = effectMatches(seed, selector, config, { ...options, prefer: "largest" });
      if (match) return match;
    }
    return null;
  }
  function promoteSafeMessageBlock(seed, config = {}, role = "assistant", options = {}) {
    let best = null;
    const minArea = Math.max(1, options.minArea || elementArea(seed));
    for (let node = seed; node && node !== document.documentElement; node = node.parentElement) {
      if (safeMatches(node, "main,body")) break;
      if (node !== seed && safeMatches(node, options.stopSelector || "")) break;
      if (!usableEffectTarget(node, config, { allowBroad: true, role })) {
        if (best) break;
        continue;
      }
      const area = elementArea(node);
      if (area >= minArea) best = node;
      const parent = node.parentElement;
      if (!parent || blockedEffectBoundary(parent, role) || containsComposerChrome(parent)) break;
      if (options.maxAreaRatio && elementArea(parent) > minArea * options.maxAreaRatio) break;
    }
    return best;
  }
  function chatGptAssistantEffectBlock(element, target, config = {}) {
    const seed = target || element;
    const block = promoteSafeMessageBlock(seed, config, "assistant", {
      maxAreaRatio: 5,
      stopSelector: "article[data-testid^='conversation-turn-'],article[data-testid*='conversation-turn'],article[data-turn-id],article[data-turn]"
    });
    if (!block || block === seed) return null;
    const hasAnswer = safeQsa(".markdown.prose,.markdown, [data-message-author-role='assistant']", block).some(visible) || seed && block.contains?.(seed);
    const hasAssistantChrome = Array.from(block.querySelectorAll("button,[role='button']")).some((button) => /thought|思考|推理/i.test(cleanLine(button.textContent || button.getAttribute?.("aria-label") || "")));
    const text = usefulTurnText(cloneText(block, config.textCleanupSelectors), 8e4);
    return hasAnswer && text && (hasAssistantChrome || text.length > usefulTurnText(cloneText(seed, config.textCleanupSelectors), 8e4).length + 12) ? block : null;
  }
  function fallbackEffectTarget(element, target, config = {}, role = "assistant") {
    const selector = role === "user" ? USER_EFFECT_BODY_SELECTOR : ASSISTANT_EFFECT_BODY_SELECTOR;
    const prefer = role === "user" ? "" : "largest";
    for (const seed of [target, element].filter(Boolean)) {
      const match = effectMatches(seed, selector, config, { role, prefer });
      if (match) return match;
    }
    return [target, element].filter(Boolean).find((seed) => usableEffectTarget(seed, config, { role, allowBroad: false })) || null;
  }
  function resolveEffectTarget(item = {}, config = {}, adapter = null) {
    const role = item.role === "user" || item.role === "thinking" ? item.role : "assistant";
    const effectRole = role === "user" ? "user" : "assistant";
    const element = item.element || item.target;
    const target = item.target || element;
    const explicit = item.effectTarget || adapter?.effectTarget?.(element, config, { ...item, role, target, effectRole }) || null;
    if (usableEffectTarget(explicit, config, { allowBroad: true, role: effectRole })) return explicit;
    const root = messageRootForEffect(element, target, config, { allowBroad: role !== "user", role: effectRole });
    if (role === "user") {
      return effectMatches(root || element || target, USER_EFFECT_BODY_SELECTOR, config, { role: effectRole }) || (usableEffectTarget(target, config, { role: effectRole }) ? target : null) || (usableEffectTarget(root, config, { role: effectRole }) ? root : null) || fallbackEffectTarget(element, target, config, effectRole);
    }
    const rootUsable = usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) && !effectTargetTooBroad(root);
    return (rootUsable ? root : null) || effectMatches(root || element || target, ASSISTANT_EFFECT_BODY_SELECTOR, config, { prefer: "largest", role: effectRole }) || (usableEffectTarget(target, config, { allowBroad: true, role: effectRole }) ? target : null) || fallbackEffectTarget(element, target, config, effectRole);
  }

  // content-src/message-navigator/collection-kernel.js
  function conversationLooksUseful(items = []) {
    const useful = items.filter((item) => item?.element && item?.text);
    return useful.length >= 2 && useful.some((item) => item.role === "user") && useful.some((item) => item.role === "assistant");
  }
  function nearestTextAncestor(seed, cleanupSelectors = [], options = {}) {
    const root = options.root || pageRoot();
    const maxDepth = Math.max(3, Math.min(16, Number(options.maxDepth) || 10));
    const maxLength = Math.max(500, Math.min(8e4, Number(options.maxLength) || 5e4));
    let node = seed;
    for (let depth = 0; node && node !== document.documentElement && depth < maxDepth; depth += 1, node = node.parentElement) {
      if (!visible(node)) continue;
      if (node !== seed && inChromeScope(node)) continue;
      const text = usefulTurnText(cloneText(node, cleanupSelectors), maxLength);
      if (text && node !== seed) return { element: node, text };
      if (node === root || safeMatches(node, "main,[role='main'],body")) break;
    }
    return null;
  }
  function messageCopyButton(button) {
    const meta = fullMetaText(button);
    return /\bcopy\s+message\b|复制(?:消息|讯息)|拷贝(?:消息|讯息)/i.test(meta);
  }
  function referenceCopyButton(button) {
    const meta = fullMetaText(button);
    return /\bcopy\s+(?:references?|sources?|citations?)\b|引用|来源|参考|citation|source/i.test(meta);
  }
  function collectFromCopyButtons(config, options = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const root = pageRoot(options.rootSelector || "main,[role='main']");
    const buttons = safeQsa("button,[role='button']", root).filter((button) => visible(button) && !inChromeScope(button) && messageCopyButton(button) && !referenceCopyButton(button)).sort(elementOrder).slice(0, Math.max(4, Math.min(80, Number(options.limit) || 48)));
    const items = [];
    const seen = /* @__PURE__ */ new Set();
    for (const button of buttons) {
      const ancestor = nearestTextAncestor(button, cleanupSelectors, { root, maxDepth: options.maxDepth || 10 });
      if (!ancestor) continue;
      const role = genericRole(ancestor.element, config) || (items.length % 2 === 0 ? "user" : "assistant");
      const key = `${role}
${ancestor.text.toLowerCase().replace(/\s+/g, " ").slice(0, 500)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        element: ancestor.element,
        target: ancestor.element,
        role,
        text: compactText(ancestor.text, config.summaryMaxChars)
      });
    }
    return dedupeItems(items);
  }
  function candidateTextBlocks(root, config, selector, options = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const nodes = uniqueElements(safeQsa(selector, root).filter((element) => visible(element) && !inChromeScope(element)).filter((element) => !options.reject?.(element)));
    const items = [];
    const seen = /* @__PURE__ */ new Set();
    for (const element of nodes) {
      const text = usefulTurnText(cloneText(element, cleanupSelectors), options.maxLength || 5e4);
      if (!text) continue;
      const key = text.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ element, target: element, text });
    }
    return items.sort((a, b) => elementOrder(a.element, b.element));
  }
  function genericRole(element, config = {}) {
    if (config.userSelector && (safeMatches(element, config.userSelector) || safeQsa(config.userSelector, element).length)) return "user";
    if (config.assistantSelector && (safeMatches(element, config.assistantSelector) || safeQsa(config.assistantSelector, element).length)) return "assistant";
    const meta = metaText(element);
    if (/\b(user|human|query|prompt)\b|data-message-author-role=.user/.test(meta)) return "user";
    if (/\b(assistant|bot|model|response|answer)\b|data-message-author-role=.assistant/.test(meta)) return "assistant";
    const label = normalize(element?.innerText || element?.textContent || "").slice(0, 80);
    if (/^(you|you said|你|你说|用户)[:：\s]/i.test(label)) return "user";
    if (/^(assistant|claude|gemini|chatgpt|kagi|poe|助手)[:：\s]/i.test(label)) return "assistant";
    return "";
  }
  function genericTarget(element) {
    return safeQsa([
      ".markdown",
      ".prose",
      "[class*='markdown' i]",
      "[class*='message' i]",
      "[class*='bubble' i]",
      "[data-message-author-role]",
      "[role='article']"
    ].join(","), element).find(visible) || element;
  }
  function cleanKey(item) {
    return `${item.role}
${normalize(item.text).toLowerCase().slice(0, 260)}`;
  }
  function dedupeItems(items) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const item of items) {
      if (!item?.element || !item.text) continue;
      const key = cleanKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }
  function adapterBaseQuery(config) {
    return uniqueElements(safeQsa(config.messageSelector).filter(visible));
  }
  function adapterBaseItems(config, adapter = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    return dedupeItems(adapterBaseQuery(config).map((element) => {
      const role = adapter.role?.(element, config) || genericRole(element, config) || "assistant";
      const target = adapter.target?.(element, config) || genericTarget(element);
      const textSource = adapter.summaryElement?.(element, config) || target || element;
      const rawValue = adapter.text?.(element, config, { role, target, textSource }) || cloneText(textSource, cleanupSelectors) || cloneText(element, cleanupSelectors);
      const effectTarget = resolveEffectTarget({ element, target, role, textSource }, config, adapter);
      return {
        element,
        target,
        effectTarget,
        role,
        text: compactText(rawValue, config.summaryMaxChars)
      };
    }));
  }

  // content-src/message-navigator/sites/chatgpt.js
  function chatgptFallbackItems(config) {
    const root = pageRoot("main,[role='main']");
    const roleNodes = safeQsa("[data-message-author-role='user'], [data-message-author-role='assistant']", root).filter((element) => visible(element) && !inChromeScope(element)).sort(elementOrder);
    const items = roleNodes.map((element) => {
      const role = /user/i.test(element.getAttribute("data-message-author-role") || "") ? "user" : "assistant";
      const target = safeQsa([
        ".user-message-bubble-color",
        ".assistant-message-bubble-color",
        "[class*='message-bubble']",
        ".markdown.prose",
        ".markdown"
      ].join(","), element).find(visible) || element;
      const text = usefulTurnText(cloneText(target, config.textCleanupSelectors) || cloneText(element, config.textCleanupSelectors));
      return { element, target, role, text: compactText(text, config.summaryMaxChars) };
    });
    if (conversationLooksUseful(items)) return dedupeItems(items);
    const blocks = candidateTextBlocks(root, config, [
      "article",
      "[data-testid*='conversation-turn']",
      "[class*='message' i]",
      ".markdown",
      ".prose"
    ].join(","));
    return dedupeItems(blocks.map((item, index) => ({
      ...item,
      role: genericRole(item.element, config) || (index % 2 === 0 ? "user" : "assistant"),
      text: compactText(item.text, config.summaryMaxChars)
    })));
  }
  function createChatGptAdapter() {
    const adapter = {
      role(element) {
        const role = element.getAttribute("data-message-author-role") || safeQsa("[data-message-author-role]", element)[0]?.getAttribute("data-message-author-role") || "";
        if (/user/i.test(role)) return "user";
        if (/assistant|tool/i.test(role)) return "assistant";
        return genericRole(element);
      },
      target(element, config = {}) {
        const role = this.role(element);
        const roleRoot = role === "user" || role === "assistant" ? roleRootForEffect(element, element, `[data-message-author-role='${role}']`, config, role) : null;
        const root = roleRoot || element;
        return safeQsa([
          ".user-message-bubble-color",
          ".assistant-message-bubble-color",
          "[class*='message-bubble']",
          ".markdown.prose",
          ".markdown",
          "[data-message-author-role]"
        ].join(","), root).find(visible) || root || element;
      },
      effectTarget(element, config, context = {}) {
        const effectRole = context.effectRole || (context.role === "user" ? "user" : "assistant");
        const roleRoot = roleRootForEffect(
          element,
          context.target,
          `[data-message-author-role='${effectRole}']`,
          config,
          effectRole
        );
        const root = roleRoot || messageRootForEffect(
          element,
          context.target,
          config,
          { allowBroad: true, role: effectRole }
        );
        if (effectRole === "user") {
          return effectMatches(root || element, [
            ".user-message-bubble-color",
            "[class*='user-message-bubble' i]",
            "[class*='message-bubble' i]",
            "[class*='bubble-color' i]"
          ].join(","), config, { role: effectRole }) || root || context.target || element;
        }
        const assistantBlock = chatGptAssistantEffectBlock(element, context.target, config);
        return assistantBlock || roleRoot || closestEffectMatch(context.target || element, [
          "article[data-testid^='conversation-turn-']",
          "article[data-testid*='conversation-turn']",
          "article[data-turn-id]",
          "article[data-turn]",
          "[data-message-author-role='assistant']"
        ].join(","), config, { allowBroad: true, role: effectRole }) || root || effectMatches(element, ".markdown.prose,.markdown", config, { prefer: "largest", role: effectRole }) || context.target || element;
      },
      collect(config) {
        const base = adapterBaseItems(config, this).filter((item) => !safeClosest(item.element, "aside"));
        return conversationLooksUseful(base) ? base : chatgptFallbackItems(config);
      }
    };
    return Object.freeze(adapter);
  }

  // content-src/message-navigator/sites/gemini.js
  var geminiChromeLinePattern = /^(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options|Share|Export|Open menu for conversation actions\.?|Ask Gemini|Microphone|Upload & tools|Send message|Flash(?:[-\s]?Lite)?|Flash|Pro|Experimental|Deep Research|Canvas|Search|Explain|Translate|翻译|搜索|复制|已复制|编辑|重新生成|更多|分享|导出|点赞|点踩)$/i;
  var geminiAnnouncementPattern = /(?:You said|You asked|You wrote|Gemini said|Gemini answered|你说|您说|Gemini\s*说|Gemini\s*回答)/i;
  function stripGeminiAnnouncements(value) {
    return String(value || "").replace(new RegExp(`(^|\\n)\\s*(?:${geminiAnnouncementPattern.source})(?:\\s*[:：]\\s*|\\s+)(?=\\S)`, "gi"), "$1").replace(new RegExp(`(^|\\n)\\s*(?:${geminiAnnouncementPattern.source})\\s*(?=\\n|$)`, "gi"), "\n").replace(/(^|\n)\s*(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options)\s*(?=\n|$)/gi, "\n");
  }
  function cleanGeminiText(value) {
    const text = normalize(stripGeminiAnnouncements(value)).split(/\n+/).map((line) => line.trim().replace(new RegExp(`^(?:${geminiAnnouncementPattern.source})(?:\\s*[:：]\\s*|\\s+)`, "i"), "").trim()).filter((line) => line && !geminiChromeLinePattern.test(line)).join("\n");
    return usefulTurnText(text);
  }
  function createGeminiAdapter() {
    const adapter = {
      role(element) {
        const meta = metaText(element);
        if (/user-query|query|user/.test(meta)) return "user";
        if (/model-response|model|assistant|response/.test(meta)) return "assistant";
        return genericRole(element);
      },
      target(element) {
        return safeQsa(
          ".model-response-text .markdown, message-content .markdown, .markdown, .query-text, .query-content, .user-query-bubble-with-background",
          element
        ).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        if (context.role === "user") {
          return effectMatches(
            root || element,
            ".user-query-bubble-with-background,.query-text,.query-content,.user-query-container",
            config
          ) || context.target || root || element;
        }
        return effectMatches(
          root || element,
          ".model-response-text .markdown,message-content .markdown,.model-response-text,message-content,.response-container-content,.response-container,structured-content-container",
          config,
          { prefer: "largest" }
        ) || root || context.target || element;
      },
      text(element, config, context = {}) {
        const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
        return cleanGeminiText(
          cloneText(context.textSource || context.target || element, cleanupSelectors) || cloneText(element, cleanupSelectors)
        );
      },
      collect(config) {
        return adapterBaseItems(config, this);
      }
    };
    return Object.freeze(adapter);
  }

  // content-src/message-navigator/sites/grok.js
  var grokUiLinePattern = /^(?:Copy|Copied|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
  function cleanGrokText(value) {
    const lines = normalize(String(value || "").replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "")).split(/\n+/).map((line) => line.trim()).filter((line) => line && !grokUiLinePattern.test(line));
    const text = trimGrokSourceLead(lines).join("\n");
    return usefulTurnText(text);
  }
  function grokSourceCardLine(line) {
    const text = cleanLine(line);
    if (!text) return true;
    if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i.test(text)) return true;
    if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+[^\u4e00-\u9fff]{0,160}$/i.test(text)) return true;
    if (/^(?:How to|What is|What are|Why|Chrome|Google|Wikipedia|YouTube|GitHub|Stack Overflow)\b/i.test(text) && !/[\u4e00-\u9fff。！？]/.test(text) && text.length <= 160) return true;
    if (/^(?:[\w.-]+\.)+[a-z]{2,}\S+/i.test(text) && !/[\u4e00-\u9fff]/.test(text)) return true;
    return false;
  }
  function grokAnswerStartLine(line) {
    const text = cleanLine(line);
    if (!text) return false;
    if (/^(?:你好|您好|当然|可以|这个|这里|这是|我(?:是|会|可以|来)|以下|简单来说|总之|结论|Sure\b|Here\b|Absolutely\b|In short\b|The short answer\b|To\b)/i.test(text)) return true;
    if (/[\u4e00-\u9fff]/.test(text) && text.length >= 14 && /[。！？!?.，,]/.test(text)) return true;
    return text.length >= 140 && /[.!?。！？]/.test(text);
  }
  function trimGrokEmbeddedSourcePrefix(line) {
    return cleanLine(line).replace(/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:[^\u4e00-\u9fff\n]{0,220}?)(?=(?:你好|您好|当然|可以|这个|这里|这是|我是|我会|以下|简单来说|总之|结论))/i, "");
  }
  function trimGrokSourceLead(lines = []) {
    const normalizedLines = lines.map(trimGrokEmbeddedSourcePrefix).map(cleanLine).filter(Boolean);
    const answerIndex = normalizedLines.findIndex(grokAnswerStartLine);
    if (answerIndex > 0 && normalizedLines.slice(0, answerIndex).some(grokSourceCardLine)) {
      return normalizedLines.slice(answerIndex);
    }
    let start = 0;
    while (start < normalizedLines.length - 1 && grokSourceCardLine(normalizedLines[start])) start += 1;
    return normalizedLines.slice(start);
  }
  function grokTextOf(element, config = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    return cleanGrokText(cloneText(element, cleanupSelectors));
  }
  function grokThoughtLabel(value) {
    const match = normalize(value).match(/(?:\b(?:Thought|Worked)\s+for\s+[^,。\n]{1,32}|(?:思考|工作)了\s*[^,。\n]{1,32})/i);
    return match ? normalize(match[0]) : "";
  }
  function grokHasProgressMarker(value) {
    return /(?:\b(?:Thought|Worked)\s+for\b|(?:思考|工作)了)/i.test(normalize(value));
  }
  function grokLooksMessageText(value) {
    const text = cleanGrokText(value);
    if (!text || text.length < 2 || text.length > 45e3) return false;
    if (/Simple Chat Hub|Summary Panel|pages checked/i.test(text)) return false;
    return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
  }
  function grokCompactKey(value) {
    return normalize(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  }
  function grokStripUserPromptPrefix(value, expected) {
    const text = cleanGrokText(value);
    const prompt = cleanGrokText(expected);
    const promptKey = grokCompactKey(prompt);
    if (!text || !promptKey) return text;
    if (grokCompactKey(text) === promptKey) return "";
    if (text.toLowerCase().startsWith(prompt.toLowerCase())) {
      const stripped = cleanGrokText(text.slice(prompt.length));
      if (stripped && grokCompactKey(stripped) !== promptKey) return stripped;
    }
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    let index = 0;
    let consumed = "";
    while (index < Math.min(lines.length, 4)) {
      consumed = cleanGrokText([consumed, lines[index]].filter(Boolean).join("\n"));
      const consumedKey = grokCompactKey(consumed);
      if (consumedKey && (consumedKey === promptKey || promptKey.includes(consumedKey) || consumedKey.includes(promptKey))) {
        index += 1;
        if (consumedKey === promptKey || consumedKey.includes(promptKey)) break;
        continue;
      }
      break;
    }
    if (index > 0) {
      const stripped = cleanGrokText(lines.slice(index).join("\n"));
      if (stripped && grokCompactKey(stripped) !== promptKey) return stripped;
      if (!stripped) return "";
    }
    return text;
  }
  function grokLooksLeadingUserPrompt(line, expected = "") {
    const text = normalize(line);
    if (!text || text.length > 280) return false;
    const textKey = grokCompactKey(text);
    const promptKey = grokCompactKey(expected);
    if (promptKey && textKey && (textKey === promptKey || promptKey.includes(textKey) || textKey.includes(promptKey))) return true;
    if (/[?？]\s*$/.test(text)) return true;
    return /^(?:请|帮|为什么|为何|怎么|如何|能否|可以|what|why|how|please|tell|explain|summari[sz]e|can you|could you)\b/i.test(text);
  }
  function grokStripLeadingUserPromptLine(value, expected = "") {
    const text = cleanGrokText(value);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return text;
    const rest = cleanGrokText(lines.slice(1).join("\n"));
    if (!rest || rest.length < 12 || !grokLooksLeadingUserPrompt(lines[0], expected)) return text;
    return rest;
  }
  function grokPreviousTextBlock(root, marker, config) {
    const markerRect = (() => {
      try {
        return marker?.getBoundingClientRect?.() || null;
      } catch {
        return null;
      }
    })();
    const candidates = [];
    for (const node of safeQsa("article,section,div,[role]", root)) {
      if (!visible(node) || node === marker || node.contains?.(marker) || inChromeScope(node)) continue;
      if (elementOrder(node, marker) >= 0) continue;
      const text = grokTextOf(node, config);
      if (!grokLooksMessageText(text) || /(?:Thought|Worked) for|(?:思考|工作)了|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
      const rect = (() => {
        try {
          return node.getBoundingClientRect();
        } catch {
          return null;
        }
      })();
      if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
      const tooBroad = safeQsa("article,section,div,[role]", node).some((child) => {
        if (child === node || !visible(child)) return false;
        const childText = grokTextOf(child, config);
        return grokLooksMessageText(childText) && childText.length >= Math.min(text.length * 0.65, text.length - 8);
      });
      if (tooBroad && text.length > 300) continue;
      candidates.push({ node, rect, text });
    }
    candidates.sort((a, b) => {
      if (a.rect && b.rect && Math.abs(a.rect.bottom - b.rect.bottom) > 4) return b.rect.bottom - a.rect.bottom;
      return elementArea(a.node) - elementArea(b.node) || elementOrder(a.node, b.node);
    });
    return candidates[0] || null;
  }
  function grokAssistantNodeForMarker(root, marker, config) {
    let best = marker;
    for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
      if (inChromeScope(node)) continue;
      const raw = rawText(node);
      const text = grokTextOf(node, config);
      if (text.length > 40 && grokHasProgressMarker(raw) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(raw)) {
        best = node;
        if (text.length > 120) break;
      }
    }
    return best;
  }
  function grokFindProgressMarker(element) {
    const candidates = [element, ...safeQsa("button,[role='button'],span,div", element)].filter((node) => node && visible(node) && !inChromeScope(node) && grokThoughtLabel(rawText(node)));
    candidates.sort((a, b) => elementArea(a) - elementArea(b) || elementOrder(a, b));
    return candidates[0] || null;
  }
  function grokSafeScrollBlock(node, root, config = {}) {
    if (!node || !visible(node) || node === root || inChromeScope(node)) return false;
    if (safeClosest(node, `#${MESSAGE_NAVIGATOR_ROOT_ID}`)) return false;
    if (safeMatches(node, "html,body,main,[role='main'],nav,aside,header,footer,form,input,textarea,select,svg,img,canvas,video")) return false;
    if (containsComposerChrome(node)) return false;
    return Boolean(usefulTurnText(cloneText(node, config.textCleanupSelectors), 9e4) || safeQsa("pre,code,blockquote,ul,ol,table", node).find(visible));
  }
  function grokAssistantScrollTarget(root, marker, assistantNode, config = {}, previousUserNode = null) {
    const markerNode = marker || grokFindProgressMarker(assistantNode);
    const rootRect = effectRect(root);
    const answerRect = effectRect(assistantNode);
    let best = null;
    for (let node = assistantNode; node && node !== document.documentElement; node = node.parentElement) {
      if (safeMatches(node, "main,[role='main'],body")) break;
      if (previousUserNode && node.contains?.(previousUserNode)) break;
      if (!grokSafeScrollBlock(node, root, config)) {
        if (best) break;
        continue;
      }
      const rect = effectRect(node);
      if (!rect) continue;
      const hasAnswer = !assistantNode || node === assistantNode || node.contains?.(assistantNode);
      if (!hasAnswer) continue;
      if (markerNode && !node.contains?.(markerNode)) {
        const markerRect = effectRect(markerNode);
        if (!markerRect || rect.top > markerRect.top + 24) continue;
      }
      if (rootRect && rect.height > Math.max(rootRect.height * 2.4, (answerRect?.height || 0) + 640)) continue;
      best = node;
    }
    return best || markerNode || assistantNode;
  }
  function grokSimilarText(value, expected) {
    const key = grokCompactKey(value);
    const expectedKey = grokCompactKey(expected);
    if (!key || !expectedKey) return false;
    return key === expectedKey || key.includes(expectedKey) || expectedKey.includes(key);
  }
  function grokPromoteUserBubble(seed, expectedText, config = {}, rootRect = null) {
    let best = seed;
    for (let node = seed?.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      if (safeMatches(node, "main,[role='main'],body") || inChromeScope(node) || containsComposerChrome(node)) break;
      const text = grokTextOf(node, config);
      if (!grokSimilarText(text, expectedText) || grokHasProgressMarker(text)) break;
      const rect = effectRect(node);
      const bestRect = effectRect(best);
      if (!rect || !bestRect) break;
      if (rootRect && rect.width > rootRect.width * 0.88 && bestRect.width < rootRect.width * 0.82) break;
      if (rect.width - bestRect.width > Math.max(96, bestRect.width * 0.42)) break;
      if (rect.height - bestRect.height > Math.max(80, bestRect.height * 1.4)) break;
      if (elementArea(node) > elementArea(best) * 2.4) break;
      best = node;
    }
    return best;
  }
  function grokUserBubbleTarget(element, config = {}) {
    const expected = grokTextOf(element, config);
    if (!expected) return null;
    const root = pageRoot("main,[role='main']");
    const rootRect = effectRect(root);
    const selector = "article,section,div,p,span,[role='article'],[class*='message' i],[class*='Message'],[class*='bubble' i],[class*='query' i]";
    const rawCandidates = [];
    const seenCandidates = /* @__PURE__ */ new Set();
    for (const node of [element, ...safeQsa(selector, element)]) {
      if (!node || seenCandidates.has(node)) continue;
      seenCandidates.add(node);
      rawCandidates.push(node);
    }
    const candidates = rawCandidates.filter((node) => visible(node) && !inChromeScope(node) && !containsComposerChrome(node)).map((node) => {
      const text = grokTextOf(node, config);
      if (!grokSimilarText(text, expected) || grokHasProgressMarker(text)) return null;
      const promoted = grokPromoteUserBubble(node, expected, config, rootRect);
      const rect = effectRect(promoted);
      if (!rect) return null;
      return {
        element: promoted,
        rect,
        text,
        area: elementArea(promoted),
        widthPenalty: rootRect && rect.width > rootRect.width * 0.86 ? 1 : 0,
        rightGap: rootRect ? Math.abs(rootRect.right - rect.right) : 0,
        lengthDelta: Math.abs(grokCompactKey(text).length - grokCompactKey(expected).length)
      };
    }).filter(Boolean);
    const seen = /* @__PURE__ */ new Set();
    const bubbles = [];
    for (const item of candidates) {
      if (seen.has(item.element)) continue;
      seen.add(item.element);
      bubbles.push(item);
    }
    bubbles.sort((a, b) => {
      return a.widthPenalty - b.widthPenalty || a.lengthDelta - b.lengthDelta || a.rightGap - b.rightGap || a.area - b.area || elementOrder(a.element, b.element);
    });
    return bubbles[0]?.element || null;
  }
  function grokUserScrollTarget(element, config = {}) {
    const bubble = grokUserBubbleTarget(element, config);
    if (bubble) return bubble;
    const root = messageRootForEffect(element, element, config, { allowBroad: true, role: "user" });
    if (root && !safeMatches(root, "main,[role='main'],body")) return root;
    return effectMatches(element, USER_EFFECT_BODY_SELECTOR, config, { role: "user", prefer: "largest" }) || element;
  }
  function grokAssistantEffectTarget(element, config = {}) {
    return effectMatches(element, ".markdown,[class*='message' i],[class*='response' i],article,[role='article']", config, { prefer: "largest", role: "assistant" }) || messageRootForEffect(element, element, config, { allowBroad: true, role: "assistant" }) || element;
  }
  function grokRole(element) {
    const meta = metaText(element);
    if (/user|human|prompt|query|question/.test(meta)) return "user";
    if (/assistant|response|answer|bot|grok/.test(meta)) return "assistant";
    return genericRole(element);
  }
  function grokScrollTarget(element, config = {}, role = "") {
    if ((role || grokRole(element)) === "user") return grokUserScrollTarget(element, config);
    const root = pageRoot("main,[role='main']");
    return grokAssistantScrollTarget(root, grokFindProgressMarker(element), element, config);
  }
  function grokDomItems(config) {
    const root = pageRoot("main,[role='main']");
    const markerSelectors = ["button,[role='button']", "button,div,span,[role='button']", "article,section,div,[role]"];
    let markers = [];
    for (const selector of markerSelectors) {
      const seen = /* @__PURE__ */ new Set();
      markers = safeQsa(selector, root).filter((node) => visible(node) && !inChromeScope(node) && grokThoughtLabel(rawText(node))).sort(elementOrder).filter((node) => {
        const rect = (() => {
          try {
            return node.getBoundingClientRect();
          } catch {
            return null;
          }
        })();
        const key = `${grokThoughtLabel(rawText(node)).toLowerCase()}|${Math.round((rect?.top || 0) / 8)}`;
        if (!key.trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (markers.length) break;
    }
    const items = [];
    const assistantSeen = /* @__PURE__ */ new Set();
    for (const marker of markers.slice(0, 10)) {
      const assistantNode = grokAssistantNodeForMarker(root, marker, config);
      const user = grokPreviousTextBlock(root, assistantNode, config) || grokPreviousTextBlock(root, marker, config);
      const assistantText = grokStripLeadingUserPromptLine(grokStripUserPromptPrefix(grokTextOf(assistantNode, config), user?.text || ""), user?.text || "");
      const assistantKey = assistantText.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
      if (!assistantText || assistantSeen.has(assistantKey)) continue;
      assistantSeen.add(assistantKey);
      if (user?.node) {
        const userTarget = grokUserScrollTarget(user.node, config);
        items.push({
          element: user.node,
          target: userTarget,
          effectTarget: userTarget,
          role: "user",
          text: compactText(user.text, config.summaryMaxChars)
        });
      }
      const assistantTarget = grokAssistantScrollTarget(root, marker, assistantNode, config, user?.node || null);
      items.push({
        element: assistantNode,
        target: assistantTarget,
        effectTarget: grokAssistantEffectTarget(assistantNode, config),
        role: "assistant",
        text: compactText(assistantText, config.summaryMaxChars)
      });
    }
    return dedupeItems(items);
  }
  function createGrokAdapter() {
    const adapter = {
      role(element) {
        return grokRole(element);
      },
      target(element, config = {}) {
        return grokScrollTarget(element, config, grokRole(element)) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        if (context.role === "user") {
          return grokUserScrollTarget(root || element, config) || effectMatches(root || element, USER_EFFECT_BODY_SELECTOR, config) || root || context.target || element;
        }
        return grokAssistantEffectTarget(element, config) || root || context.target || element;
      },
      text(element, config, context = {}) {
        return grokTextOf(context.textSource || context.target || element, config) || grokTextOf(element, config);
      },
      collect(config) {
        const fromDom = grokDomItems(config);
        if (conversationLooksUseful(fromDom)) return fromDom;
        const base = adapterBaseItems(config, this);
        return conversationLooksUseful(base) ? base : fromDom;
      }
    };
    return Object.freeze(adapter);
  }

  // content-src/message-navigator/sites/kagi.js
  var kagiModeLinePattern = /^(?:Quick|Expert|Research|Fast|Deep|Creative|Balanced|Precise|Custom|快速|专家|研究)$/i;
  var kagiMetaLinePattern = /^(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|Today|Yesterday)$/i;
  var kagiChromeLinePattern = /^(?:Kagi Assistant|Kagi products|Settings|Search threads|Thread navigation|Folders|Threads|Add folder|Start organizing your threads\.?|Ask anything\.{0,3}|Message|View message statistics|Copy message|Copied|Send)$/i;
  var kagiLikelyPromptPattern = /[?？]$|^(?:任务|需求|要求|目标|提示|为我|帮我|介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找)(?:[:：\s]|$)|^(?:Task|Request|Requirement|Requirements|Goal|Prompt|Draft|Compose|Create|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i;
  function kagiLines(root) {
    const lines = [];
    for (const rawLine of rawText(root).split(/\n+/)) {
      const line = cleanLine(rawLine);
      if (!line || line.length < 2) continue;
      if (kagiChromeLinePattern.test(line) || kagiMetaLinePattern.test(line)) continue;
      if (referenceOnlyText(line)) continue;
      if (!lines.includes(line)) lines.push(line);
    }
    return lines;
  }
  function kagiPromptFromLines(lines) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/^(?:搜索|Search)\s*[:：]/i.test(line)) continue;
      const parts = [line];
      let endIndex = index;
      for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
        const nextLine = lines[next];
        if (kagiModeLinePattern.test(nextLine) || kagiChromeLinePattern.test(nextLine)) break;
        if (/^(?:Searched with Kagi|Using full content from|Gathered details on)\b/i.test(nextLine)) break;
        parts.push(nextLine);
        endIndex = next;
        if (/[?？]$/.test(nextLine)) break;
      }
      const text = usefulTurnText(parts.join("\n"));
      if (text) return { text, index, endIndex, parts };
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!kagiLikelyPromptPattern.test(line)) continue;
      const previous = lines[index - 1];
      const parts = previous && !kagiModeLinePattern.test(previous) && !kagiChromeLinePattern.test(previous) && previous.length < 80 ? [previous, line] : [line];
      const text = usefulTurnText(parts.join("\n"));
      if (text) return { text, index: Math.max(0, index - (parts.length - 1)), endIndex: index, parts };
    }
    return null;
  }
  function kagiDomFallbackItems(config) {
    const root = pageRoot("main,[role='main']");
    const lines = kagiLines(root);
    const prompt = kagiPromptFromLines(lines);
    if (!prompt) return [];
    let answerStart = prompt.endIndex + 1;
    while (answerStart < lines.length && (kagiModeLinePattern.test(lines[answerStart]) || kagiChromeLinePattern.test(lines[answerStart]) || kagiMetaLinePattern.test(lines[answerStart]))) {
      answerStart += 1;
    }
    const assistantLines = [];
    for (let index = answerStart; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^References\b/i.test(line) && assistantLines.length) break;
      if (kagiChromeLinePattern.test(line) || kagiMetaLinePattern.test(line)) continue;
      if (kagiModeLinePattern.test(line) && !assistantLines.length) continue;
      if (line === prompt.text || prompt.parts.includes(line)) continue;
      assistantLines.push(line);
      if (assistantLines.length >= 120) break;
    }
    const assistant = usefulTurnText(assistantLines.join("\n"), 6e4);
    if (assistant.length < 20) return [];
    const userTarget = targetForText(root, config, [prompt.text, ...prompt.parts], {
      selector: "article,section,div,p,[class*='message' i],[class*='bubble' i],[class*='chat' i]"
    });
    const assistantTarget = targetForText(root, config, assistantLines.slice(0, 3), {
      selector: "article,section,div,p,[role='article'],[class*='message' i],[class*='response' i],[class*='markdown' i]"
    });
    return dedupeItems([
      {
        element: userTarget,
        target: userTarget,
        role: "user",
        text: compactText(prompt.text, config.summaryMaxChars)
      },
      {
        element: assistantTarget,
        target: assistantTarget,
        role: "assistant",
        text: compactText(assistant, config.summaryMaxChars)
      }
    ]);
  }
  function createKagiAdapter() {
    const adapter = {
      role(element) {
        const meta = metaText(element);
        if (/\buser\b|human|query/.test(meta)) return "user";
        if (/\bassistant\b|bot|answer/.test(meta)) return "assistant";
        return genericRole(element) || (safeQsa(".assistant, [data-role='assistant']", element).length ? "assistant" : "");
      },
      target(element) {
        return safeQsa(
          ".chat_bubble_content, .markdown, [class*='message' i], [role='article']",
          element
        ).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const effectRole = context.effectRole || (context.role === "user" ? "user" : "assistant");
        const root = closestEffectMatch(
          context.target || element,
          ".chat_bubble[role='article'],.chat_bubble,[role='article']",
          config,
          { allowBroad: true, role: effectRole }
        ) || messageRootForEffect(
          element,
          context.target,
          config,
          { allowBroad: true, role: effectRole }
        );
        if (effectRole === "user") {
          return (usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) ? root : null) || effectMatches(
            root || element,
            ".chat_bubble_content,.markdown",
            config,
            { role: effectRole, prefer: "largest" }
          ) || context.target || element;
        }
        return (usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) ? root : null) || effectMatches(
          root || element,
          ".chat_bubble_content,.markdown",
          config,
          { prefer: "largest", role: effectRole }
        ) || context.target || element;
      },
      collect(config) {
        const fromDom = kagiDomFallbackItems(config);
        if (conversationLooksUseful(fromDom)) return fromDom;
        const fromCopies = collectFromCopyButtons(config, {
          rootSelector: "main,[role='main']",
          maxDepth: 12
        });
        if (conversationLooksUseful(fromCopies)) return fromCopies;
        const base = adapterBaseItems(config, this);
        if (conversationLooksUseful(base)) return base;
        const root = pageRoot("main,[role='main']");
        const blocks = candidateTextBlocks(root, config, [
          ".chat_bubble",
          "[role='article']",
          "[data-message-author-role]",
          "[data-testid*='message']",
          "[class*='message' i]",
          "[class*='response' i]",
          ".markdown"
        ].join(","), { maxLength: 6e4 });
        return dedupeItems(blocks.slice(0, 24).map((item, index) => ({
          ...item,
          role: genericRole(item.element, config) || (index % 2 === 0 ? "user" : "assistant"),
          text: compactText(item.text, config.summaryMaxChars)
        })));
      }
    };
    return Object.freeze(adapter);
  }

  // content-src/message-navigator/sites/notion.js
  var notionChromeLinePattern = /^(?:Notion AI|\/|history|New agent|Share chat|Start new chat|Pin chat|Delete, rename, and more…?|Give context|Settings|Gemini\s+\d|Do anything with AI\.{0,3}|Ask anything|Response copied to clipboard|Copied to clipboard|Loading\.?|Start voice recording|Submit AI message|Thought(?:\s+for\s+.*)?|思考.*)$/i;
  var notionMetaLinePattern = /^(?:\d+\s*steps?|\d{1,2}:\d{2}\s*(?:AM|PM)?|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)$/i;
  function notionLikelyPrompt(line) {
    return /[?？]$|^(?:任务|需求|要求|目标|提示|为我|帮我|介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找)(?:[:：\s]|$)|^(?:Task|Request|Requirement|Requirements|Goal|Prompt|Draft|Compose|Create|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
  }
  function trimNotionPromptMeta(line) {
    return cleanLine(line).replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "").replace(/\s+(?:Today|Yesterday)$/i, "").trim();
  }
  function notionLines(root) {
    const lines = [];
    for (const rawLine of rawText(root).split(/\n+/)) {
      const line = cleanLine(rawLine);
      if (!line || line.length < 2) continue;
      if (notionChromeLinePattern.test(line)) continue;
      if (!lines.includes(line)) lines.push(line);
    }
    return lines;
  }
  function notionChromePollutedText(value) {
    const text = normalize(value);
    if (!text) return false;
    const lines = text.split(/\n+/).map(cleanLine).filter(Boolean);
    if (lines.some((line) => notionChromeLinePattern.test(line))) return true;
    return /\b(?:New agent|Share chat|Start new chat|Pin chat|Delete, rename, and more)\b/i.test(text);
  }
  function notionPromptFromIndex(lines, index) {
    const seed = trimNotionPromptMeta(lines[index]);
    if (!seed) return null;
    const parts = [seed];
    let startIndex = index;
    for (let previous = index - 1; previous >= Math.max(0, index - 3); previous -= 1) {
      const line = trimNotionPromptMeta(lines[previous]);
      if (!line || notionMetaLinePattern.test(line) || notionChromeLinePattern.test(line)) break;
      if (/^(?:搜索|Search)\s*[:：]/i.test(line)) {
        parts.unshift(line);
        startIndex = previous;
        break;
      }
      if (line.length <= 48 && !/[。.!！?？]$/.test(line) && /[?？]$/.test(seed)) {
        parts.unshift(line);
        startIndex = previous;
        continue;
      }
      break;
    }
    const text = usefulTurnText(parts.join("\n"));
    return text ? { text, parts, startIndex, endIndex: index } : null;
  }
  function notionPairFromLines(root) {
    const lines = notionLines(root);
    const stepIndex = lines.findIndex((line) => /^\d+\s*steps?$/i.test(line));
    let promptIndex = -1;
    if (stepIndex > 0) {
      for (let index = stepIndex - 1; index >= 0; index -= 1) {
        if (!notionMetaLinePattern.test(lines[index]) && !notionChromeLinePattern.test(lines[index])) {
          promptIndex = index;
          break;
        }
      }
    }
    if (promptIndex < 0) {
      promptIndex = lines.findIndex((line, index) => index < lines.length - 1 && notionLikelyPrompt(line));
    }
    if (promptIndex < 0 || promptIndex >= lines.length - 1) return null;
    const prompt = notionPromptFromIndex(lines, promptIndex);
    if (!prompt) return null;
    let answerStart = stepIndex >= 0 ? stepIndex + 1 : promptIndex + 1;
    while (answerStart < lines.length && (notionChromeLinePattern.test(lines[answerStart]) || notionMetaLinePattern.test(lines[answerStart]))) answerStart += 1;
    const assistant = usefulTurnText(lines.slice(answerStart).filter((line) => line !== lines[promptIndex] && line !== prompt.text && !prompt.parts.includes(line) && !notionChromeLinePattern.test(line)).join("\n"));
    return prompt.text.length >= 2 && assistant.length >= 20 ? { user: prompt.text, userParts: prompt.parts, assistant } : null;
  }
  function notionThoughtFallbackItems(config, root) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const thought = safeQsa("button,[role='button']", root).filter((button) => visible(button) && /^Thought(?:\s+for\s+.*)?$|^思考/i.test(cleanLine(rawText(button)))).sort(elementOrder)[0] || null;
    if (!thought) return [];
    const blocks = candidateTextBlocks(root, config, "article,section,div,p,[role='article'],[data-testid*='message'],[class*='message' i],[class*='response' i]", {
      reject: (element) => element.contains?.(thought) || containsComposerChrome(element),
      maxLength: 8e4
    });
    const beforeThought = blocks.filter((item) => elementOrder(item.element, thought) < 0);
    const afterThought = blocks.filter((item) => elementOrder(thought, item.element) < 0);
    const userCandidates = beforeThought.filter((item) => {
      const text = trimNotionPromptMeta(item.text);
      if (notionChromePollutedText(text)) return false;
      return text.length >= 8 && (notionLikelyPrompt(text) || /(?:任务|需求|要求|Task|Request|Requirement)/i.test(text));
    }).sort((a, b) => {
      const area = elementArea(a.element) - elementArea(b.element);
      return area || a.text.length - b.text.length || elementOrder(b.element, a.element);
    });
    const user = userCandidates[0] || null;
    const assistant = afterThought.find((item) => {
      const text = usefulTurnText(cloneText(item.element, cleanupSelectors), 8e4);
      return text.length >= 20 && !notionChromeLinePattern.test(cleanLine(text));
    });
    if (!user || !assistant) return [];
    return dedupeItems([
      {
        element: user.element,
        target: user.element,
        role: "user",
        text: compactText(trimNotionPromptMeta(user.text), config.summaryMaxChars)
      },
      {
        element: assistant.element,
        target: assistant.element,
        role: "assistant",
        text: compactText(assistant.text, config.summaryMaxChars)
      }
    ]);
  }
  function notionDomFallbackItems(config) {
    const root = pageRoot("#notion-app,main,[role='main']");
    const thoughtFallback = notionThoughtFallbackItems(config, root);
    if (conversationLooksUseful(thoughtFallback)) return thoughtFallback;
    const pair = notionPairFromLines(root);
    if (!pair) return [];
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const steps = safeQsa("button,[role='button']", root).filter((button) => visible(button) && /^\d+\s*steps?$/i.test(cleanLine(rawText(button)))).sort(elementOrder);
    const stepButton = steps[0] || null;
    const candidates = candidateTextBlocks(root, config, "article,section,div,p,[role='article'],[data-testid*='message']", {
      reject: (element) => stepButton && element.contains?.(stepButton),
      maxLength: 6e4
    });
    const beforeStep = stepButton ? candidates.filter((item) => elementOrder(item.element, stepButton) < 0) : candidates;
    const afterStep = stepButton ? candidates.filter((item) => elementOrder(stepButton, item.element) < 0) : candidates;
    const promptTarget = beforeStep.reverse().find((item) => {
      const text = trimNotionPromptMeta(item.text);
      return text && !notionChromePollutedText(text) && (text.includes(pair.user) || pair.user.includes(text) || notionLikelyPrompt(text));
    })?.element || targetForText(root, config, [pair.user, ...pair.userParts || []], {
      reject: (element) => stepButton && element.contains?.(stepButton) || notionChromePollutedText(cloneText(element, cleanupSelectors))
    });
    const assistantTarget = afterStep.find((item) => {
      const text = cleanLine(item.text);
      return text.length >= 20 && (pair.assistant.includes(text) || text.includes(pair.assistant.slice(0, 60)));
    })?.element || targetForText(root, config, pair.assistant.slice(0, 120), {
      reject: (element) => stepButton && element.contains?.(stepButton)
    });
    return dedupeItems([
      {
        element: promptTarget,
        target: promptTarget,
        role: "user",
        text: compactText(pair.user, config.summaryMaxChars)
      },
      {
        element: assistantTarget,
        target: assistantTarget,
        role: "assistant",
        text: compactText(pair.assistant, config.summaryMaxChars)
      }
    ]);
  }
  function createNotionAdapter() {
    const adapter = {
      role(element) {
        const meta = metaText(element);
        if (/\buser\b|human|prompt|query/.test(meta)) return "user";
        if (/\bassistant\b|answer|response|notion-ai/.test(meta)) return "assistant";
        return genericRole(element);
      },
      target(element) {
        return safeQsa(".markdown, [class*='message' i], [role='article']", element).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        if (context.role === "user") {
          return effectMatches(root || element, USER_EFFECT_BODY_SELECTOR, config) || context.target || root || element;
        }
        return effectMatches(
          root || element,
          ".markdown,[class*='message' i],[role='article']",
          config,
          { prefer: "largest" }
        ) || root || context.target || element;
      },
      collect(config) {
        const fallback = notionDomFallbackItems(config);
        if (conversationLooksUseful(fallback)) return fallback;
        const base = adapterBaseItems(config, this);
        return conversationLooksUseful(base) ? base : fallback;
      }
    };
    return Object.freeze(adapter);
  }

  // content-src/message-navigator/sites/standard.js
  function createStandardAdapters() {
    const adapters = /* @__PURE__ */ Object.create(null);
    adapters.generic = {
      collect: (config) => adapterBaseItems(config)
    };
    adapters.claude = {
      role(element) {
        const meta = metaText(element);
        if (/user-message|data-author=.user|human/.test(meta)) return "user";
        if (/assistant|claude|response|font-claude-response/.test(meta)) return "assistant";
        return genericRole(element);
      },
      target(element) {
        return safeQsa(".font-claude-response-body, .font-claude-response, [data-testid='user-message'], .standard-markdown", element).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        if (context.role === "user") {
          return closestEffectMatch(context.target || element, ".bg-bg-300,.group.relative.inline-flex,[data-testid='user-message']", config) || effectMatches(element, "[data-testid='user-message']", config) || context.target || element;
        }
        return closestEffectMatch(context.target || element, ".font-claude-response,.font-claude-response-body,[data-testid='assistant-message']", config, { allowBroad: true }) || effectMatches(element, ".font-claude-response,.font-claude-response-body,.standard-markdown", config, { prefer: "largest" }) || context.target || element;
      },
      collect(config) {
        return adapterBaseItems(config, this);
      }
    };
    adapters.deepseek = {
      role(element) {
        const meta = metaText(element);
        if (/\brole=.user\b|\buser\b|fbb737a4/.test(meta)) return "user";
        if (/\brole=.assistant\b|\bassistant\b|ds-markdown/.test(meta)) return "assistant";
        return genericRole(element);
      },
      target(element) {
        return safeQsa(".ds-markdown:not(.ds-think-content), .fbb737a4, [class*='markdown']", element).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        if (context.role === "user") {
          return effectMatches(root || element, ".fbb737a4", config, { prefer: "largest" }) || context.target || root || element;
        }
        return effectMatches(root || element, ".ds-markdown:not(.ds-think-content)", config, { prefer: "last" }) || effectMatches(root || element, ".ds-markdown,[class*='markdown']", config, { prefer: "largest" }) || context.target || root || element;
      },
      summaryElement(element) {
        return safeQsa(".ds-markdown:not(.ds-think-content), .fbb737a4", element).find(visible) || element;
      },
      collect(config) {
        return adapterBaseItems(config, this);
      }
    };
    adapters.poe = {
      role(element) {
        const meta = metaText(element);
        if (/rightside|right-side|human|user/.test(meta)) return "user";
        if (/leftside|left-side|assistant|bot|message/.test(meta)) return "assistant";
        return genericRole(element);
      },
      target(element) {
        return safeQsa("[class*='Message_messageTextContainer'], [class*='Message_leftSideMessageBubble'], [class*='Message_rightSideMessageBubble'], [class*='messageText']", element).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        if (context.role === "user") {
          return effectMatches(root || element, "[class*='Message_rightSideMessageBubble'],[class*='rightSideMessageBubble'],[class*='messageText']", config) || context.target || root || element;
        }
        return effectMatches(root || element, "[class*='Message_leftSideMessageBubble'],[class*='Message_messageTextContainer'],[class*='messageText']", config, { prefer: "largest" }) || root || context.target || element;
      },
      collect(config) {
        return adapterBaseItems(config, this);
      }
    };
    adapters.aiStudio = {
      role(element) {
        const role = element.getAttribute("data-turn-role") || element.getAttribute("role") || "";
        if (/user/i.test(role)) return "user";
        if (/assistant|model/i.test(role)) return "assistant";
        if (safeQsa("ms-thought-chunk, [class*='thought' i]", element).length) return "thinking";
        return genericRole(element);
      },
      target(element) {
        return safeQsa(".turn-content, [class*='turn-content'], .markdown, [class*='markdown']", element).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        return effectMatches(root || element, ".turn-content,[class*='turn-content'],.markdown,[class*='markdown']", config, { prefer: context.role === "user" ? "" : "largest" }) || root || context.target || element;
      },
      collect(config) {
        return adapterBaseItems(config, this);
      }
    };
    adapters.lechat = {
      role(element) {
        const role = element.getAttribute("data-message-author-role") || "";
        if (/user/i.test(role)) return "user";
        if (/assistant/i.test(role)) return "assistant";
        if (element.getAttribute("data-message-part-type") === "answer") return "assistant";
        return genericRole(element);
      },
      target(element) {
        return safeQsa("[data-message-part-type='answer'].markdown-container-style, .markdown-container-style, .rounded-3xl, .break-words", element).find(visible) || element;
      },
      effectTarget(element, config, context = {}) {
        const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
        if (context.role === "user") {
          return effectMatches(root || element, ".rounded-3xl,.break-words", config) || context.target || root || element;
        }
        return effectMatches(root || element, "[data-message-part-type='answer'].markdown-container-style,.markdown-container-style,.break-words", config, { prefer: "largest" }) || context.target || root || element;
      },
      collect(config) {
        return adapterBaseItems(config, this);
      }
    };
    return Object.freeze(adapters);
  }

  // content-src/message-navigator/adapters.js
  var REQUIRED_ADAPTER_IDS = Object.freeze([
    "aiStudio",
    "chatgpt",
    "claude",
    "deepseek",
    "gemini",
    "generic",
    "grok",
    "kagi",
    "lechat",
    "notion",
    "poe"
  ]);
  function validateAdapter(id, adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new TypeError(`Message Navigator adapter ${id} must be an object.`);
    }
    if (typeof adapter.collect !== "function") {
      throw new TypeError(`Message Navigator adapter ${id} requires collect().`);
    }
    for (const hook of ["role", "target", "effectTarget", "summaryElement", "text"]) {
      if (adapter[hook] != null && typeof adapter[hook] !== "function") {
        throw new TypeError(`Message Navigator adapter ${id} hook ${hook} must be a function.`);
      }
    }
    return adapter;
  }
  function createMessageNavigatorAdapters(dependencies = void 0) {
    if (dependencies !== void 0) {
      throw new TypeError("Message Navigator adapters own their site logic and do not accept injected callbacks.");
    }
    const adapters = Object.assign(/* @__PURE__ */ Object.create(null), createStandardAdapters(), {
      chatgpt: createChatGptAdapter(),
      gemini: createGeminiAdapter(),
      grok: createGrokAdapter(),
      kagi: createKagiAdapter(),
      notion: createNotionAdapter()
    });
    const actualIds = Object.keys(adapters).sort();
    const expectedIds = [...REQUIRED_ADAPTER_IDS].sort();
    if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
      throw new TypeError(`Message Navigator adapter registry mismatch: ${actualIds.join(", ")}.`);
    }
    for (const id of REQUIRED_ADAPTER_IDS) adapters[id] = Object.freeze(validateAdapter(id, adapters[id]));
    return Object.freeze(adapters);
  }

  // content-src/message-navigator/scroll.js
  function scrollParent(element) {
    for (let node = element?.parentElement; node && node !== document.body; node = node.parentElement) {
      try {
        const style = getComputedStyle(node);
        if (/(auto|scroll|overlay)/i.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 24) return node;
      } catch {
      }
    }
    return document.scrollingElement || document.documentElement;
  }
  function scrollerRect(scroller) {
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      return { top: 0, height: window.innerHeight };
    }
    try {
      const rect = scroller.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    } catch {
      return { top: 0, height: window.innerHeight };
    }
  }
  function scrollerTop(scroller) {
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    return scroller.scrollTop;
  }
  function scrollToTop(scroller, top) {
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
    try {
      scroller.scrollTo({ top, behavior: "smooth" });
    } catch {
      scroller.scrollTop = top;
    }
  }
  function rolePrefix(role) {
    if (role === "user") return "Q";
    if (role === "thinking") return "T";
    return "A";
  }

  // content-src/message-navigator/styles.js
  function messageNavigatorCss(rootId, primaryColor = "#1f7a5f") {
    return `
    :root {
      --cc-message-nav-accent: ${primaryColor};
    }
    #${rootId} {
      --cc-message-nav-accent: ${primaryColor};
      --cc-message-nav-bg: color-mix(in srgb, Canvas 92%, transparent);
      --cc-message-nav-text: CanvasText;
      --cc-message-nav-muted: color-mix(in srgb, CanvasText 54%, transparent);
      --cc-message-nav-border: color-mix(in srgb, CanvasText 16%, transparent);
      position: fixed;
      top: 50%;
      right: 14px;
      z-index: 2147483200;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--cc-message-nav-text);
      pointer-events: none;
    }
    #${rootId} * { box-sizing: border-box; }
    .chatclub-message-nav-indicator {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
      padding: 8px 2px;
      pointer-events: auto;
    }
    .chatclub-message-nav-line {
      width: 38px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      border: 0;
      background: transparent;
      cursor: pointer;
      transition: opacity 160ms ease;
      opacity: .72;
      padding: 0;
    }
    .chatclub-message-nav-line::before {
      content: "";
      width: 18px;
      height: 3px;
      border-radius: 999px;
      background: color-mix(in srgb, CanvasText 28%, transparent);
      transition: width 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }
    .chatclub-message-nav-line:hover {
      opacity: .92;
    }
    .chatclub-message-nav-line:hover::before {
      background: color-mix(in srgb, CanvasText 42%, transparent);
    }
    .chatclub-message-nav-line.active {
      opacity: 1;
    }
    .chatclub-message-nav-line.active::before {
      width: 34px;
      background: var(--cc-message-nav-accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--cc-message-nav-accent) 24%, transparent);
    }
    .chatclub-message-nav-menu {
      width: min(18rem, calc(100vw - 68px));
      max-height: min(72vh, 34rem);
      overflow: auto;
      padding: 6px;
      border: 1px solid var(--cc-message-nav-border);
      border-radius: 8px;
      background: var(--cc-message-nav-bg);
      color: var(--cc-message-nav-text);
      box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
      backdrop-filter: blur(18px);
      visibility: hidden;
      opacity: 0;
      transform: translateX(8px) scale(.98);
      pointer-events: none;
      transition: opacity 140ms ease, transform 140ms ease, visibility 0s linear 140ms;
    }
    #${rootId}.chatclub-message-nav-open .chatclub-message-nav-menu,
    #${rootId}:focus-within .chatclub-message-nav-menu {
      visibility: visible;
      opacity: 1;
      transform: translateX(0) scale(1);
      pointer-events: auto;
      transition-delay: 0s;
    }
    .chatclub-message-nav-item {
      width: 100%;
      display: grid;
      grid-template-columns: 26px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-height: 38px;
      padding: 8px 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font-size: 15px;
      line-height: 1.45;
      text-align: left;
      cursor: pointer;
    }
    .chatclub-message-nav-item:hover,
    .chatclub-message-nav-item.active {
      background: color-mix(in srgb, var(--cc-message-nav-accent) 13%, transparent);
    }
    .chatclub-message-nav-role {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: color-mix(in srgb, CanvasText 8%, transparent);
      color: var(--cc-message-nav-muted);
      font-size: 13px;
      font-weight: 700;
    }
    .chatclub-message-nav-item.active .chatclub-message-nav-role {
      background: var(--cc-message-nav-accent);
      color: white;
    }
    .chatclub-message-nav-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .chatclub-message-nav-empty {
      padding: 10px 12px;
      color: var(--cc-message-nav-muted);
    }
    .chatclub-message-nav-effect-border {
      outline: 2px solid var(--cc-message-nav-accent, ${primaryColor}) !important;
      outline-offset: 4px !important;
      border-radius: 8px !important;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 16%, transparent) !important;
    }
    .chatclub-message-nav-effect-pulse {
      animation: chatclub-message-nav-pulse 1.35s ease-out 1;
    }
    .chatclub-message-nav-effect-fade {
      animation: chatclub-message-nav-fade 1.35s ease-out 1;
    }
    .chatclub-message-nav-effect-jiggle {
      animation: chatclub-message-nav-jiggle .56s ease-in-out 1;
    }
    @keyframes chatclub-message-nav-pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 42%, transparent); }
      70% { box-shadow: 0 0 0 16px color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 0%, transparent); }
      100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 0%, transparent); }
    }
    @keyframes chatclub-message-nav-fade {
      0%, 100% { opacity: 1; }
      22% { opacity: .42; }
      44% { opacity: 1; }
      66% { opacity: .58; }
    }
    @keyframes chatclub-message-nav-jiggle {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-5px); }
      40% { transform: translateX(5px); }
      60% { transform: translateX(-3px); }
      80% { transform: translateX(3px); }
    }
    @media (prefers-color-scheme: dark) {
      #${rootId} {
        --cc-message-nav-bg: color-mix(in srgb, #1b1d20 88%, transparent);
        --cc-message-nav-text: #f2f4f5;
        --cc-message-nav-muted: rgba(242, 244, 245, .62);
        --cc-message-nav-border: rgba(255, 255, 255, .14);
      }
    }
  `;
  }

  // content-src/message-navigator/engine.js
  var EFFECT_MODES = new Set(MESSAGE_NAVIGATOR_EFFECT_MODES);
  var ROOT_ID = MESSAGE_NAVIGATOR_ROOT_ID;
  var STYLE_ID = MESSAGE_NAVIGATOR_STYLE_ID;
  var MessageNavigator = class {
    constructor({ version, adapters } = {}) {
      if (!String(version || "").trim()) throw new TypeError("Message Navigator engine requires version.");
      if (!adapters || typeof adapters !== "object" || typeof adapters.generic?.collect !== "function") {
        throw new TypeError("Message Navigator engine requires a generic adapter.");
      }
      this.version = String(version);
      this.adapters = adapters;
      this.enabled = false;
      this.config = null;
      this.options = {};
      this.messages = [];
      this.idToMessage = /* @__PURE__ */ new Map();
      this.root = null;
      this.indicator = null;
      this.menu = null;
      this.observer = null;
      this.buildTimer = 0;
      this.scrollTimer = 0;
      this.effectTimer = 0;
      this.menuCloseTimer = 0;
      this.menuFocusTimer = 0;
      this.menuPinnedOpen = false;
      this.jumpToken = 0;
      this.activeId = "";
      this.effectTarget = null;
      this.boundScroll = () => this.onScroll();
      this.boundResize = () => this.scheduleBuild(160);
      this.boundOpenMenu = () => this.openMenu();
      this.boundScheduleCloseMenu = () => this.scheduleCloseMenu();
      this.boundDocumentPointerDown = (event) => this.onDocumentPointerDown(event);
      this.boundDocumentKeydown = (event) => {
        if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) this.closeMenu();
      };
      this.boundRootFocusIn = () => this.openMenu();
      this.boundRootFocusOut = () => {
        clearTimeout(this.menuFocusTimer);
        this.menuFocusTimer = setTimeout(() => {
          if (!this.enabled) return;
          if (this.root?.contains?.(document.activeElement)) return;
          this.scheduleCloseMenu();
        }, 0);
      };
    }
    setEnabled(data = {}) {
      if (data.enabled === false) {
        this.destroy();
        return this.state();
      }
      return this.enable(data.config || {}, data.options || {}, { openMenu: data.openMenu === true });
    }
    enable(config = {}, options = {}, ui = {}) {
      this.destroy();
      this.enabled = true;
      this.config = {
        ...config,
        adapter: String(config.adapter || "generic").trim() || "generic",
        messageSelector: String(config.messageSelector || "").trim(),
        textCleanupSelectors: Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [],
        summaryMaxChars: Math.max(20, Math.min(180, Number(config.summaryMaxChars) || 60))
      };
      this.options = {
        effectMode: EFFECT_MODES.has(options.effectMode) ? options.effectMode : "border",
        primaryColor: /^#[0-9a-f]{6}$/i.test(String(options.primaryColor || "")) ? options.primaryColor : "#1f7a5f"
      };
      if (!this.config.messageSelector) throw new Error("Message navigator selector is empty");
      this.injectStyle();
      this.createRoot();
      this.observe();
      this.build();
      this.scheduleBuild(600);
      if (ui.openMenu) this.openMenu({ pinned: true });
      return this.state();
    }
    injectStyle() {
      document.getElementById(STYLE_ID)?.remove();
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = messageNavigatorCss(ROOT_ID, this.options.primaryColor);
      (document.head || document.documentElement).append(style);
    }
    createRoot() {
      document.getElementById(ROOT_ID)?.remove();
      this.root = document.createElement("aside");
      this.root.id = ROOT_ID;
      this.root.setAttribute("aria-label", "ChatClub message navigator");
      this.indicator = document.createElement("div");
      this.indicator.className = "chatclub-message-nav-indicator";
      this.menu = document.createElement("div");
      this.menu.className = "chatclub-message-nav-menu";
      this.menu.setAttribute("role", "menu");
      this.root.append(this.menu, this.indicator);
      document.documentElement.append(this.root);
      this.bindMenuHover();
    }
    bindMenuHover() {
      this.indicator?.addEventListener?.("pointerenter", this.boundOpenMenu);
      this.indicator?.addEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.menu?.addEventListener?.("pointerenter", this.boundOpenMenu);
      this.menu?.addEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.root?.addEventListener?.("focusin", this.boundRootFocusIn);
      this.root?.addEventListener?.("focusout", this.boundRootFocusOut);
    }
    openMenu(options = {}) {
      clearTimeout(this.menuCloseTimer);
      if (options.pinned) this.menuPinnedOpen = true;
      this.root?.classList?.add("chatclub-message-nav-open");
    }
    closeMenu() {
      clearTimeout(this.menuCloseTimer);
      this.menuPinnedOpen = false;
      this.root?.classList?.remove("chatclub-message-nav-open");
      return this.state();
    }
    scheduleCloseMenu(delay = 180) {
      if (this.menuPinnedOpen) return;
      clearTimeout(this.menuCloseTimer);
      this.menuCloseTimer = setTimeout(() => {
        if (this.root?.contains?.(document.activeElement)) return;
        this.closeMenu();
      }, delay);
    }
    eventInsideRoot(event) {
      if (!this.root) return false;
      try {
        const path = event.composedPath?.() || [];
        if (path.includes(this.root)) return true;
      } catch {
      }
      return Boolean(event.target && this.root.contains?.(event.target));
    }
    onDocumentPointerDown(event) {
      if (!this.enabled || !this.root?.classList?.contains("chatclub-message-nav-open")) return;
      if (this.eventInsideRoot(event)) return;
      this.closeMenu();
    }
    observe() {
      this.observer = new MutationObserver(() => this.scheduleBuild(360));
      try {
        this.observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch {
      }
      window.addEventListener("scroll", this.boundScroll, true);
      window.addEventListener("resize", this.boundResize, true);
      document.addEventListener("pointerdown", this.boundDocumentPointerDown, true);
      document.addEventListener("keydown", this.boundDocumentKeydown, true);
    }
    scheduleBuild(delay = 250) {
      if (!this.enabled) return;
      clearTimeout(this.buildTimer);
      this.buildTimer = setTimeout(() => this.build(), delay);
    }
    collect() {
      const adapter = this.adapters[this.config.adapter] || this.adapters.generic;
      const items = adapter.collect?.(this.config) || this.adapters.generic.collect(this.config);
      return dedupeItems(items).map((item) => {
        const role = item.role === "user" || item.role === "thinking" ? item.role : "assistant";
        const target = item.target || item.element;
        return {
          ...item,
          target,
          effectTarget: resolveEffectTarget({ ...item, target, role }, this.config, adapter),
          role
        };
      }).filter((item) => item.text && visible(item.target || item.element)).map((item, index) => ({
        ...item,
        id: `message-${index + 1}`,
        role: item.role
      }));
    }
    build() {
      if (!this.enabled || !this.root?.isConnected) return;
      this.messages = this.collect();
      this.idToMessage = new Map(this.messages.map((item) => [item.id, item]));
      this.render();
      this.updateActive();
    }
    render() {
      this.indicator.replaceChildren();
      this.menu.replaceChildren();
      if (!this.messages.length) {
        const empty = document.createElement("div");
        empty.className = "chatclub-message-nav-empty";
        empty.textContent = "No messages";
        this.menu.append(empty);
        return;
      }
      for (const message of this.messages) {
        const line = document.createElement("button");
        line.className = "chatclub-message-nav-line";
        line.type = "button";
        line.title = `${rolePrefix(message.role)} ${message.text}`;
        line.dataset.targetId = message.id;
        line.setAttribute("aria-label", message.text);
        line.addEventListener("click", () => this.jumpTo(message.id));
        this.indicator.append(line);
        const item = document.createElement("button");
        item.className = "chatclub-message-nav-item";
        item.type = "button";
        item.dataset.targetId = message.id;
        item.setAttribute("role", "menuitem");
        item.addEventListener("click", () => this.jumpTo(message.id));
        const role = document.createElement("span");
        role.className = "chatclub-message-nav-role";
        role.textContent = rolePrefix(message.role);
        const text = document.createElement("span");
        text.className = "chatclub-message-nav-text";
        text.textContent = message.text;
        item.append(role, text);
        this.menu.append(item);
      }
    }
    onScroll() {
      if (!this.enabled) return;
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => this.updateActive(), 80);
    }
    setActive(id) {
      const targetId = this.idToMessage.has(id) ? id : "";
      this.activeId = targetId;
      const elements = [
        ...Array.from(this.indicator?.querySelectorAll?.(".chatclub-message-nav-line") || []),
        ...Array.from(this.menu?.querySelectorAll?.(".chatclub-message-nav-item") || [])
      ];
      for (const element of elements) {
        element.classList.toggle("active", Boolean(targetId) && element.dataset.targetId === targetId);
      }
    }
    updateActive() {
      if (!this.messages.length) return;
      const viewportY = Math.max(80, Math.min(window.innerHeight - 80, window.innerHeight * 0.42));
      let active = this.messages[0];
      for (const message of this.messages) {
        try {
          const rect = (message.target || message.element).getBoundingClientRect();
          if (rect.top <= viewportY) active = message;
          if (rect.top > viewportY) break;
        } catch {
        }
      }
      this.setActive(active?.id || "");
    }
    async jumpTo(id) {
      const message = this.idToMessage.get(id);
      const target = message?.target || message?.element;
      if (!target) return;
      const effectRole = message.role === "user" ? "user" : "assistant";
      const effectTarget = message.effectTarget || fallbackEffectTarget(message.element, target, this.config, effectRole);
      const token = this.jumpToken + 1;
      this.jumpToken = token;
      this.setActive(id);
      const scroller = scrollParent(target);
      const rect = target.getBoundingClientRect();
      const base = scrollerRect(scroller);
      const offset = Math.max(30, Math.min(140, Number(this.config.scrollOffsetPx) || 64));
      const top = scrollerTop(scroller) + rect.top - base.top - offset;
      scrollToTop(scroller, Math.max(0, top));
      await this.waitForScrollIdle(scroller, token);
      if (this.jumpToken !== token) return;
      if (effectTarget) this.applyEffect(effectTarget);
      this.updateActive();
    }
    waitForScrollIdle(scroller, token) {
      return new Promise((resolve) => {
        const eventTarget = !scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body ? window : scroller;
        let done = false;
        let idleTimer = 0;
        let fallbackTimer = 0;
        const cleanup = () => {
          clearTimeout(idleTimer);
          clearTimeout(fallbackTimer);
          try {
            eventTarget?.removeEventListener?.("scroll", onScroll);
          } catch {
          }
        };
        const finish = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        };
        const onScroll = () => {
          if (this.jumpToken !== token) return finish();
          clearTimeout(idleTimer);
          idleTimer = setTimeout(finish, 150);
        };
        try {
          eventTarget?.addEventListener?.("scroll", onScroll, { passive: true });
        } catch {
        }
        idleTimer = setTimeout(finish, 260);
        fallbackTimer = setTimeout(finish, 900);
      });
    }
    clearEffect() {
      clearTimeout(this.effectTimer);
      if (!this.effectTarget) return;
      this.effectTarget.classList.remove(
        "chatclub-message-nav-effect-border",
        "chatclub-message-nav-effect-pulse",
        "chatclub-message-nav-effect-fade",
        "chatclub-message-nav-effect-jiggle"
      );
      this.effectTarget.style.removeProperty("--cc-message-nav-accent");
      this.effectTarget = null;
    }
    applyEffect(target) {
      this.clearEffect();
      const mode = EFFECT_MODES.has(this.options.effectMode) ? this.options.effectMode : "border";
      if (mode === "none" || !target?.classList) return;
      this.effectTarget = target;
      const effectClass = `chatclub-message-nav-effect-${mode}`;
      target.classList.remove(effectClass);
      target.style.setProperty("--cc-message-nav-accent", this.options.primaryColor);
      try {
        void target.offsetWidth;
      } catch {
      }
      target.classList.add(effectClass);
      this.effectTimer = setTimeout(() => this.clearEffect(), mode === "border" ? 1800 : 1500);
    }
    state() {
      return {
        ok: true,
        enabled: this.enabled,
        siteId: this.config?.id || "",
        adapter: this.config?.adapter || "",
        messageCount: this.messages.length,
        activeId: this.activeId,
        menuOpen: Boolean(this.root?.classList?.contains("chatclub-message-nav-open")),
        version: this.version
      };
    }
    destroy() {
      this.enabled = false;
      clearTimeout(this.buildTimer);
      clearTimeout(this.scrollTimer);
      clearTimeout(this.menuCloseTimer);
      clearTimeout(this.menuFocusTimer);
      this.clearEffect();
      try {
        this.observer?.disconnect?.();
      } catch {
      }
      this.observer = null;
      window.removeEventListener("scroll", this.boundScroll, true);
      window.removeEventListener("resize", this.boundResize, true);
      document.removeEventListener("pointerdown", this.boundDocumentPointerDown, true);
      document.removeEventListener("keydown", this.boundDocumentKeydown, true);
      this.indicator?.removeEventListener?.("pointerenter", this.boundOpenMenu);
      this.indicator?.removeEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.menu?.removeEventListener?.("pointerenter", this.boundOpenMenu);
      this.menu?.removeEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.root?.removeEventListener?.("focusin", this.boundRootFocusIn);
      this.root?.removeEventListener?.("focusout", this.boundRootFocusOut);
      this.closeMenu();
      this.root?.remove();
      this.root = null;
      this.indicator = null;
      this.menu = null;
      this.messages = [];
      this.jumpToken += 1;
      this.idToMessage.clear();
      document.getElementById(STYLE_ID)?.remove();
    }
  };

  // content-src/message-navigator.js
  var MESSAGE_NAVIGATOR_GLOBAL_NAME = "__CHATCLUB_MESSAGE_NAVIGATOR__";
  function installMessageNavigator() {
    const version = MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE.split(":").at(-1);
    const runtimes = runtimeRegistry(window);
    const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_MESSAGE_NAVIGATOR_BUNDLE_IDENTITY);
    runtimes.registerBundle(runtimeIdentity);
    const existing = runtimes.registration(MESSAGE_NAVIGATOR_RUNTIME_NAME);
    let navigatorRuntime = existing?.version === version ? existing.api : null;
    if (existing?.version === version) {
      if (runtimes.isActive) window[MESSAGE_NAVIGATOR_GLOBAL_NAME] = existing.api;
    } else {
      runtimes.invalidate(MESSAGE_NAVIGATOR_RUNTIME_NAME, `replaced by ${version}`);
      navigatorRuntime = new MessageNavigator({
        version,
        adapters: createMessageNavigatorAdapters()
      });
      runtimes.register(MESSAGE_NAVIGATOR_RUNTIME_NAME, {
        version,
        api: navigatorRuntime,
        activate() {
          const previous = window[MESSAGE_NAVIGATOR_GLOBAL_NAME];
          if (previous !== navigatorRuntime) {
            try {
              previous?.destroy?.();
            } catch {
            }
            window[MESSAGE_NAVIGATOR_GLOBAL_NAME] = navigatorRuntime;
          }
        },
        dispose() {
          navigatorRuntime.destroy();
          if (window[MESSAGE_NAVIGATOR_GLOBAL_NAME] === navigatorRuntime) {
            delete window[MESSAGE_NAVIGATOR_GLOBAL_NAME];
          }
        }
      });
    }
    const port = createMessageNavigatorPort(runtimes);
    installContentCapability(runtimes, {
      capability: "message-navigator",
      owner: "content-capability:message-navigator",
      version: runtimeIdentity.bundle.implementationVersion,
      routerVersion: runtimeIdentity.implementationVersion,
      handlers: {
        setMessageNavigator: (data) => port.setEnabled(data),
        hideMessageNavigatorMenu: () => port.hideMenu(),
        getMessageNavigatorState: () => port.state()
      }
    });
  }
  installMessageNavigator();
})();
