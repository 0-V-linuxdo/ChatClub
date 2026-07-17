export function createDeleteRuntimeCapability(deps = {}) {
  const {
    TOPIC_DELETE_FALLBACK_CONFIGS,
    PROTOCOL,
    deleteCompactToken,
    requestBackground,
    EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST,
    INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
    deleteResult,
    deleteChatGptThread,
    deleteGeminiThread,
    deleteKagiThread,
    deleteGrokThread,
    deleteNotionThread,
    deleteDeepSeekThread,
    sleep,
    waitForModel,
    normalize,
    text,
    qsa,
    qs,
    closest,
    visible,
    reveal,
    buttonText,
    modelElementText,
    modelRect,
    modelCenterPoint,
    modelElementFromPoint,
    modelClick,
    modelDirectClick,
    nativeModelClick,
    dispatchPointerActivation,
    isDisabledElement,
    activateElement,
    deleteElementText,
    deleteTextToken,
    deleteLabelMatches,
    deleteLabelMatchesExactish,
    visibleDeleteCandidates,
    layoutDeleteCandidates,
    deleteClickableElement,
    deleteClick,
    deleteClickLayout,
    deleteDialogRoots,
    findDeleteConfirmButton,
    clickDeleteConfirmIfPresent,
    clickDeleteConfirmButton,
    dispatchDeleteKeyboardShortcut,
    menuRootsWithDelete,
    findDeleteMenuItem,
    openTriggerAndClickDelete,
    topRightMenuTrigger,
    findNotionDeleteMenuTrigger,
    requestDeepSeekDeleteBridge,
    ensureDeepSeekSidebarOpen,
    deepSeekSidebarRoot,
    deepSeekDeleteHints,
    findDeepSeekCurrentTopicRow,
    deepSeekTopicMoreButton,
    normalizeDeleteFrameHref,
    deleteConversationIdentityFromHref,
    sameDeleteConversationIdentity,
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
    else if (id === "gemini" || /gemini/.test(app) || host === "gemini.google.com" || host.endsWith(".gemini.google.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.gemini;
    else if (id === "kagi" || /kagi/.test(app) || host === "assistant.kagi.com") fallback = TOPIC_DELETE_FALLBACK_CONFIGS.kagi;
    else if (id === "grokmirror" || /grokmirror|grok mirror/.test(app) || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.grokMirror;
    else if (id === "grok" || /grok/.test(app) || host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.grok;
    else if (id === "notion" || /notion/.test(app) || host === "app.notion.com" || host === "notion.so" || host === "www.notion.so" || host.endsWith(".notion.so")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.notion;
    else if (id === "deepseek" || /deepseek/.test(app) || host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) fallback = TOPIC_DELETE_FALLBACK_CONFIGS.deepseek;
    if (!fallback) return null;
    const sourceMode = config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride)
      ? "custom"
      : "builtIn";
    const userscript = String(sourceMode === "custom"
      ? config?.customUserscript || config?.userscript || ""
      : fallback.userscript || config?.userscript || "").trim();
    return {
      ...fallback,
      ...config,
      id: config?.id || fallback.id,
      name: config?.name || fallback.name,
      builtIn: config?.builtIn !== false,
      enabled: config?.enabled !== false,
      sourceMode,
      userscript,
      ...(sourceMode === "custom" ? { customUserscript: userscript } : {}),
      userscriptLength: userscript.length,
      userscriptTimeoutMs: Number(config?.userscriptTimeoutMs) || fallback.userscriptTimeoutMs || 15000
    };
  }

  const TOPIC_DELETE_REQUEST_EVENT = PROTOCOL.TOPIC_DELETE_REQUEST_EVENT;
  const TOPIC_DELETE_MENU_COMMAND_EVENT = PROTOCOL.TOPIC_DELETE_MENU_COMMAND_EVENT;
  const TOPIC_DELETE_RESULT_EVENT = PROTOCOL.TOPIC_DELETE_RESULT_EVENT;
  const TOPIC_DELETE_PING_EVENT = PROTOCOL.TOPIC_DELETE_PING_EVENT;
  const TOPIC_DELETE_READY_EVENT = PROTOCOL.TOPIC_DELETE_READY_EVENT;
  const TOPIC_DELETE_BRIDGE_SOURCE = PROTOCOL.TOPIC_DELETE_BRIDGE_SOURCE;
  const TOPIC_DELETE_MENU_COMMAND_UNSUPPORTED_REASON = "userscript does not expose menu command trigger";

  function topicDeleteSiteName(config = {}, payload = {}) {
    return String(config.id || config.name || payload.appId || payload.appName || location.hostname || "topic-delete").trim() || "topic-delete";
  }

  function isStandaloneTopicDeleteUserscript(source = "") {
    return /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(String(source || ""));
  }

  function topicDeleteSiteKeys(config = {}, payload = {}) {
    return [config.id, config.name, payload.appId, payload.appName]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
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
    return source.includes("MENU_COMMAND_EVENT")
      || source.includes("chatclub:delete-site:menu-command")
      || /\bmenuCommand\b/.test(source);
  }

  function topicDeleteReadyVersion(config = {}) {
    return topicDeleteSupportsVersionedMenuCommand(config) || topicDeleteSupportsVersionedRequest(config)
      ? topicDeleteStandaloneVersion(config)
      : "";
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
      if (!entry || (typeof entry.menuCommand !== "function" && typeof entry.run !== "function")) continue;
      const candidates = [entryKey, entry.scriptId, entry.site, entry.siteId, entry.name, entry.id]
        .map(deleteCompactToken)
        .filter(Boolean);
      if (wanted.length && !candidates.some((candidate) => wanted.includes(candidate))) continue;
      if (expectedScriptId && !candidates.includes(expectedScriptId)) continue;
      if (acceptMatchingVersion && topicDeleteVersionMatches(entry.version, expectedVersion)) return entry;
      try { entry.dispose?.(); } catch {}
      try { delete registry[entryKey]; } catch {}
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
        window.removeEventListener(TOPIC_DELETE_READY_EVENT, onReady);
        window.removeEventListener("message", onMessage);
      };
      const handleReadyDetail = (detail = {}) => {
        if (detail.id !== id || !topicDeleteReadyMatches(detail, keys, expectedVersion, scriptId)) return;
        cleanup();
        resolve(detail);
      };
      const onReady = (event) => {
        handleReadyDetail(event?.detail || {});
      };
      const onMessage = (event) => {
        const message = event?.data || {};
        if (message.source !== TOPIC_DELETE_BRIDGE_SOURCE || message.type !== "ready") return;
        handleReadyDetail(message.detail || {});
      };
      window.addEventListener(TOPIC_DELETE_READY_EVENT, onReady);
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
      window.dispatchEvent(new CustomEvent(TOPIC_DELETE_PING_EVENT, { detail }));
      window.postMessage({ source: TOPIC_DELETE_BRIDGE_SOURCE, type: "ping", detail }, "*");
    });
  }

  async function installStandaloneTopicDeleteUserscript(config = {}) {
    const installConfig = {
      id: config.id || ""
    };
    const response = await requestBackground(INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST, {
      config: installConfig
    });
    if (response.runtimeConfig && typeof response.runtimeConfig === "object") {
      Object.assign(config, response.runtimeConfig);
    }
    return response;
  }

  async function ensureStandaloneTopicDeleteUserscript(config = {}, payload = {}, timeoutMs = 15000) {
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
    const installedReady = await waitForTopicDeleteUserscriptReady(config, payload, Math.min(1600, Math.max(600, Number(timeoutMs) || 15000)));
    if (installedReady) return { mode: "event", ready: installedReady, installed };
    return { mode: "event", ready: null, installed };
  }

  async function runStandaloneTopicDeleteUserscript(config = {}, payload = {}, timeoutMs = 15000) {
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
        window.removeEventListener(TOPIC_DELETE_RESULT_EVENT, onResult);
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
        if (message.source !== TOPIC_DELETE_BRIDGE_SOURCE || message.type !== "result") return;
        handleResultDetail(message.detail || {});
      };
      window.addEventListener(TOPIC_DELETE_RESULT_EVENT, onResult);
      window.addEventListener("message", onMessage);
      timer = setTimeout(() => {
        cleanup();
        resolve(deleteResult(false, site, "userscript menu command timed out"));
      }, Math.max(5000, Math.min(45000, Number(timeoutMs) || 15000)));
      try {
        const expectedVersion = topicDeleteStandaloneVersion(config);
        const useVersionedMenuCommand = topicDeleteSupportsVersionedMenuCommand(config) && expectedVersion;
        const commandEvent = useVersionedMenuCommand ? `${TOPIC_DELETE_MENU_COMMAND_EVENT}:${expectedVersion}` : TOPIC_DELETE_MENU_COMMAND_EVENT;
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
        window.postMessage({ source: TOPIC_DELETE_BRIDGE_SOURCE, type: commandType, detail }, "*");
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
    return async () => {
      if (siteId === "chatgpt") return deleteChatGptThread(payload);
      if (siteId === "gemini") return deleteGeminiThread(payload);
      if (siteId === "kagi") return deleteKagiThread(payload);
      if (siteId === "grokMirror") {
        const result = await deleteGrokThread(payload);
        return { ...result, site: "grokMirror" };
      }
      if (siteId === "grok") return deleteGrokThread(payload);
      if (siteId === "notion") return deleteNotionThread(payload);
      if (siteId === "deepseek") return deleteDeepSeekThread(payload);
      return deleteResult(false, siteId || "topic-delete", "unsupported site");
    };
  }

  function createTopicDeleteApi(config = {}, payload = {}) {
    const api = {
      config,
      data: payload,
      window,
      document,
      location,
      result: deleteResult,
      deleteResult,
      sleep,
      waitFor: waitForModel,
      waitForModel,
      normalize,
      text,
      qsa,
      qs,
      closest,
      visible,
      reveal,
      buttonText,
      modelElementText,
      modelRect,
      modelCenterPoint,
      modelElementFromPoint,
      modelClick,
      modelDirectClick,
      nativeModelClick,
      dispatchPointerActivation,
      isDisabledElement,
      activateElement,
      deleteElementText,
      deleteTextToken,
      deleteCompactToken,
      deleteLabelMatches,
      deleteLabelMatchesExactish,
      visibleDeleteCandidates,
      layoutDeleteCandidates,
      deleteClickableElement,
      deleteClick,
      deleteClickLayout,
      deleteDialogRoots,
      findDeleteConfirmButton,
      clickDeleteConfirmIfPresent,
      clickDeleteConfirmButton,
      dispatchDeleteKeyboardShortcut,
      menuRootsWithDelete,
      findDeleteMenuItem,
      openTriggerAndClickDelete,
      topRightMenuTrigger,
      findNotionDeleteMenuTrigger,
      requestDeepSeekDeleteBridge,
      ensureDeepSeekSidebarOpen,
      deepSeekSidebarRoot,
      deepSeekDeleteHints,
      findDeepSeekCurrentTopicRow,
      deepSeekTopicMoreButton,
      deleteChatGptThread,
      deleteGeminiThread,
      deleteKagiThread,
      deleteGrokThread,
      deleteNotionThread,
      deleteDeepSeekThread
    };
    return Object.freeze(api);
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
    const response = await requestBackground(EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST, {
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
    const requestedTimeoutMs = Math.max(5000, Math.min(45000, Number(config.userscriptTimeoutMs) || 15000));
    const timeoutMs = nativeSiteId === "deepseek" ? Math.max(requestedTimeoutMs, 36000) : requestedTimeoutMs;
    let timer = null;
    try {
      const timeoutResult = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, site, reason: "userscript timed out" }), timeoutMs);
      });
      const value = await Promise.race([
        customMode
          ? executeCustomTopicDeleteUserscript(config, payload)
          : standalone
          ? runStandaloneTopicDeleteUserscript(config, payload, timeoutMs)
          : nativeRunner
            ? nativeRunner()
            : deleteResult(false, site, "userscript missing"),
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
    const attemptId = normalize(data?.deleteAttemptId);
    if (!attemptId || attemptId.length > 256) {
      return { ok: false, reason: "delete attempt identity is missing or malformed" };
    }
    const currentHref = normalizeDeleteFrameHref(location.href);
    const expectedIdentity = data?.expectedDeleteIdentity;
    if (!expectedIdentity) return { ok: false, reason: "delete target identity is missing" };
    const currentIdentity = deleteConversationIdentityFromHref(currentHref);
    return sameDeleteConversationIdentity(expectedIdentity, currentIdentity)
      ? { ok: true, attemptId, currentHref, expectedIdentity }
      : { ok: false, reason: "current conversation changed before delete handler execution" };
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
      value?.needsTrustedClick
      || value?.needsTrustedHover
      || value?.needsTrustedMenuClick
      || value?.needsTrustedKeySequence
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
    if (incomingConfig?.enabled === false) {
      return deleteResult(false, topicDeleteSiteName(incomingConfig, payload), "site disabled");
    }
    const config = incomingConfig
      ? incomingConfig
      : topicDeleteFallbackConfig({}, payload);
    if (!topicDeleteUsesCustomUserscript(config) && config?.standaloneUserscript !== true && !String(config?.userscript || "").trim() && !topicDeleteNativeRunner(config, payload)) {
      return deleteResult(false, topicDeleteSiteName(config || {}, payload), "unsupported site or userscript missing");
    }
    let value = await runTopicDeleteUserscript(config, payload);
    if (hasDeleteTrustedInstructions(value)) {
      const postRunInvocation = validateTopicDeleteInvocation(data);
      if (!postRunInvocation.ok) {
        return deleteResult(false, topicDeleteSiteName(config, payload), postRunInvocation.reason);
      }
    }
    const siteId = topicDeleteNativeSiteId(config, payload);
    if (siteId === "deepseek") {
      const validation = validateDeepSeekTrustedCoordinates(value);
      if (!validation.ok) return deleteResult(false, "deepseek", validation.reason);
      value = sanitizeDeepSeekTrustedResult(value, validation);
    }
    return bindDeleteTrustedInstructions(value, invocation.attemptId);
  }
  return Object.freeze({
    deleteThread
  });
}
