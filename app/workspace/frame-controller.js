import { runtimeFrameId, runtimeRequest } from "../../shared/extension-api.js";
import { resolveChatFrameAttributeContract } from "../../shared/chat-frame-config.js";
import { t } from "../../shared/i18n.js";
import { findTopicDeleteSiteConfig, topicDeleteTimeoutMs } from "../../shared/topic-delete-sites.js";
import { button, editorModal, el, field, input } from "../../ui/dom.js";
import { removeChatFromGroup, removeGroupFromWorkspace } from "./model.js";
import { createControllerMethodValidator, validateControllerContract } from "../controller-contract.js";

const NAVIGATION_FOCUS_GUARD_TIMEOUT_MS = 1200;
const NAVIGATION_FOCUS_GUARD_POST_NAV_RETRY_MS = 150;
const NAVIGATION_FOCUS_GUARD_POST_NAV_SETTLE_MS = 10000;
const NAVIGATION_FOCUS_GUARD_POST_NAV_MAX_MS = 45000;
const NAVIGATION_FOCUS_GUARD_LEASE_MS = 180000;
const requireMethods = createControllerMethodValidator("Workspace frame", "port");

export function createWorkspaceFrameController(dependencies = {}) {
  const { state, services, registry, session, layout, view } = validateControllerContract(
    dependencies,
    "Workspace frame controller",
    {
      state: "object",
      services: "object",
      registry: "object",
      session: "object",
      layout: "object",
      view: "object"
    }
  );
  const {
    appById,
    discoverDeclaredFaviconUrl,
    effectiveFaviconUrl,
    executeTopicDelete,
    inferAppName,
    notify,
    onFrameLifecycleChange,
    openTabUrl,
    openableTabUrl,
    prepareContentFrameRuntime,
    recordFunctionalAnomaly,
    rememberFaviconUrl,
    requestTopicDeletePermission,
    sendToContentFrame,
    svgIcon
  } = services;
  requireMethods(registry, "registry", ["frameApp", "frameForInstance"]);
  requireMethods(session, "session", ["rememberWorkspaceSession"]);
  requireMethods(layout, "layout", ["persistLayout", "shortcutLabel"]);
  requireMethods(view, "view", [
    "closePopovers",
    "ensureFrameAttributeContract",
    "fullscreenButtonMeta",
    "syncGridColumnClass",
    "syncGridColumns",
    "syncHeaderForFrameInstance",
    "syncTabGroupHeaderControls"
  ]);
  const { frameApp, frameForInstance } = registry;
  const { rememberWorkspaceSession } = session;
  const { persistLayout, shortcutLabel } = layout;
  const {
    closePopovers,
    ensureFrameAttributeContract,
    fullscreenButtonMeta,
    syncGridColumnClass,
    syncGridColumns,
    syncHeaderForFrameInstance,
    syncTabGroupHeaderControls
  } = view;
  let workspaceLifecycleFrames = [];
  let frameLifecycleCallbackActive = false;
  const frameNavigationGenerations = new WeakMap();

  function emitFrameLifecycleChange(event) {
    if (frameLifecycleCallbackActive) return;
    frameLifecycleCallbackActive = true;
    try {
      const result = onFrameLifecycleChange(event);
      if (result && typeof result.catch === "function") {
        result.catch((error) => console.warn("[ChatClub] Frame lifecycle callback failed", error));
      }
    } catch (error) {
      console.warn("[ChatClub] Frame lifecycle callback failed", error);
    } finally {
      frameLifecycleCallbackActive = false;
    }
  }

  function consumeFrameInitialHref(instanceId) {
    const chat = state.groups
      .flatMap((group) => group.chatApps || [])
      .find((candidate) => candidate.instanceId === instanceId);
    const initialHref = openableTabUrl(chat?.initialHref);
    if (initialHref) delete chat.initialHref;
    return initialHref;
  }

  function stageFrameInitialHref(instanceId, href) {
    const initialHref = openableTabUrl(href);
    if (!initialHref) return false;
    const chat = state.groups
      .flatMap((group) => group.chatApps || [])
      .find((candidate) => candidate.instanceId === instanceId);
    if (!chat) return false;
    chat.initialHref = initialHref;
    return true;
  }

  function notifyWorkspaceFrameSync() {
    const frames = Array.from(document.querySelectorAll(".chat-frame"));
    const membershipChanged = frames.length !== workspaceLifecycleFrames.length
      || frames.some((frame, index) => frame !== workspaceLifecycleFrames[index]);
    workspaceLifecycleFrames = frames;
    emitFrameLifecycleChange({
      type: "workspace-sync",
      frames: Object.freeze([...frames]),
      activeFrames: Object.freeze(frames.filter((frame) => frame.classList.contains("active"))),
      membershipChanged
    });
  }

  function threadHrefFromLocation(value) {
    const href = openableTabUrl(value);
    if (!href) return "";
    try {
      const url = new URL(href);
      const host = url.hostname.toLowerCase();
      const path = url.pathname || "";
      if (/\/(?:a\/)?chat\/s\/[^/?#]+/i.test(path)) return href;
      if ((host === "gemini.google.com" || host.endsWith(".gemini.google.com")) && /^\/app\/[^/?#]+/i.test(path)) return href;
      if (host === "assistant.kagi.com" && /^\/chat\/[^/?#]+/i.test(path)) return href;
      if ((host === "app.notion.com" || host.endsWith(".notion.com")) && path === "/chat" && url.searchParams.get("t")) return href;
      if ((host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai") || host === "gk.dairoot.cn" || host.endsWith(".gk.dairoot.cn")) && /^\/(?:c|chat)\//i.test(path)) return href;
    } catch {}
    return "";
  }

  function sameHost(host, roots = []) {
    return roots.some((root) => host === root || host.endsWith(`.${root}`));
  }

  function normalizedPath(url) {
    return (url.pathname || "/").replace(/\/+$/, "") || "/";
  }

  function knownNoConversationPage(config = {}, payload = {}) {
    const href = openableTabUrl(payload.currentHref || payload.href || payload.url);
    if (!href) return false;
    try {
      const url = new URL(href);
      const host = url.hostname.toLowerCase();
      const path = normalizedPath(url);
      const identity = `${config.id || ""} ${config.name || ""} ${payload.appId || ""} ${payload.appName || ""}`.toLowerCase();
      if (/kagi/.test(identity) && host === "assistant.kagi.com" && path === "/") return true;
      if (/chatgpt|chat gpt/.test(identity) && sameHost(host, ["chatgpt.com", "chat.openai.com"]) && path === "/") return true;
      if (/deepseek/.test(identity) && sameHost(host, ["deepseek.com"]) && path === "/") return true;
      if (/grok/.test(identity) && sameHost(host, ["grok.com", "grok.x.ai", "gk.dairoot.cn"]) && path === "/") return true;
      if (/notion/.test(identity) && sameHost(host, ["app.notion.com", "notion.so"]) && (path === "/ai" || (path === "/chat" && !url.searchParams.get("t")))) return true;
      if (/claude/.test(identity) && sameHost(host, ["claude.ai"]) && path === "/new") return true;
      if (/gemini|bard/.test(identity) && sameHost(host, ["gemini.google.com", "bard.google.com"]) && path === "/app") return true;
    } catch {}
    return false;
  }

  function rememberFrameLocation(iframe, meta = {}) {
    if (!(iframe instanceof HTMLIFrameElement)) return;
    const href = openableTabUrl(meta.href || meta.url);
    const title = String(meta.title || "").trim();
    const previousHref = String(iframe.dataset.currentHref || "");
    let hrefChanged = false;
    let changed = false;
    if (href) {
      hrefChanged = previousHref !== href;
      changed = changed || hrefChanged;
      iframe.dataset.currentHref = href;
      const threadHref = threadHrefFromLocation(href);
      if (threadHref) {
        changed = changed || iframe.dataset.currentThreadHref !== threadHref;
        iframe.dataset.currentThreadHref = threadHref;
      } else if (iframe.dataset.currentThreadHref) {
        changed = true;
        delete iframe.dataset.currentThreadHref;
      }
    }
    if (title) {
      changed = changed || iframe.dataset.currentTitle !== title;
      iframe.dataset.currentTitle = title;
    }
    const instanceId = String(iframe.dataset.instanceId || "");
    if (changed) syncHeaderForFrameInstance(instanceId);
    if (hrefChanged) {
      rememberWorkspaceSession();
      if (ensureFrameAttributeContract(iframe, href, { phase: "location" })) return;
    }
    const navigation = meta?.navigation && typeof meta.navigation === "object"
      ? {
          ...meta.navigation,
          documentId: String(meta.documentId || ""),
          bridgeVersion: String(meta.bridgeVersion || "")
        }
      : null;
    if (hrefChanged || navigation?.forced === true) {
      emitFrameLifecycleChange({ type: "location", instanceId, iframe, previousHref, href, navigation });
    }
  }

  function frameDeleteThreadPayload(iframe, fallback = {}) {
    const app = iframe instanceof HTMLIFrameElement ? frameApp(iframe) : appById(fallback.appId);
    const currentHref = openableTabUrl(fallback.currentHref || fallback.href || fallback.url)
      || openableTabUrl(iframe?.dataset?.currentHref)
      || openableTabUrl(iframe?.src || iframe?.getAttribute?.("src"))
      || openableTabUrl(app?.url);
    return {
      appId: app?.id || fallback.appId || iframe?.dataset?.appId || "",
      appName: app ? inferAppName(app) : "",
      currentHref,
      currentThreadHref: openableTabUrl(fallback.currentThreadHref) || threadHrefFromLocation(currentHref),
      currentTitle: iframe?.dataset?.currentTitle || iframe?.title || ""
    };
  }

  function topicDeleteCapabilityForFrame(iframe, fallback = {}) {
    const app = iframe instanceof HTMLIFrameElement
      ? frameApp(iframe)
      : appById(fallback.appId || iframe?.dataset?.appId);
    const payload = frameDeleteThreadPayload(iframe, {
      ...fallback,
      appId: app?.id || fallback.appId || iframe?.dataset?.appId || ""
    });
    const config = findTopicDeleteSiteConfig(state.options?.topicDeleteSiteConfigs, payload);
    const customMode = config?.builtIn === false || config?.sourceMode === "custom";
    const missingCustomScript = Boolean(config && customMode && !String(config.customUserscript || "").trim());
    const noConversationPage = Boolean(config && knownNoConversationPage(config, payload));
    const skipped = !config || config.enabled === false || missingCustomScript || noConversationPage;
    return { iframe, payload, config, skipped, available: !skipped };
  }

  function chatFrameAttributes(app, url = app?.url) {
    return resolveChatFrameAttributeContract({
      app,
      url,
      source: app?.chatAppSource || app?.source,
      options: state.options
    });
  }

  function createFrameBindingId() {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function chatFrameName(app, frameBindingId = "") {
    const params = new URLSearchParams();
    params.set("chatclub_webview", "");
    params.set("ua", globalThis.navigator?.userAgent || "");
    params.set("ssc", "1");
    if (app?.id) params.set("app", app.id);
    if (frameBindingId) params.set("chatclub_frame_binding", frameBindingId);
    return params.toString();
  }

  async function prepareFrameLoad(url, preflightId = "") {
    try {
      return await runtimeRequest({ source: "chatclub", action: "prepareFrameLoad", url, preflightId });
    } catch (error) {
      return { success: false, error: error?.message || String(error || "prepareFrameLoad failed") };
    }
  }

  async function markGrokFramePreflightFallback(url, preflightId) {
    try {
      return await runtimeRequest({
        source: "chatclub",
        action: "markGrokFramePreflightFallback",
        url,
        preflightId
      });
    } catch {
      return null;
    }
  }

  function grokCookieBridgeUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "grok.com";
    } catch {
      return false;
    }
  }

  function grokFramePreflightId() {
    return globalThis.crypto?.randomUUID?.()
      || `grok-preflight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function frameLoadingSet() {
    return new Set(state.frameLoadingInstanceIds || []);
  }

  function setFrameLoading(iframeOrInstanceId, loading) {
    const instanceId = typeof iframeOrInstanceId === "string"
      ? iframeOrInstanceId
      : String(iframeOrInstanceId?.dataset?.instanceId || "");
    if (!instanceId) return;
    const set = frameLoadingSet();
    const had = set.has(instanceId);
    if (loading) set.add(instanceId);
    else set.delete(instanceId);
    if (had === set.has(instanceId)) return;
    state.frameLoadingInstanceIds = Array.from(set);
    syncHeaderForFrameInstance(instanceId);
    emitFrameLifecycleChange({
      type: "loading",
      instanceId,
      iframe: iframeOrInstanceId instanceof HTMLIFrameElement
        ? iframeOrInstanceId
        : frameForInstance(instanceId),
      loading: set.has(instanceId)
    });
  }

  function frameIsLoading(instanceId) {
    return frameLoadingSet().has(String(instanceId || ""));
  }

  function activeFrameIsLoading(group) {
    return frameIsLoading(activeChatForGroup(group)?.instanceId);
  }

  function beginFrameLoading(iframe, pending = false) {
    if (!(iframe instanceof HTMLIFrameElement)) return false;
    if (pending) iframe.dataset.frameLoadPending = "1";
    else delete iframe.dataset.frameLoadPending;
    setFrameLoading(iframe, true);
    return true;
  }

  function rememberBrowserFrameId(iframe) {
    if (!(iframe instanceof HTMLIFrameElement)) return null;
    const remembered = Number(iframe.dataset.browserFrameId);
    if (Number.isSafeInteger(remembered) && remembered > 0) return remembered;
    let targetWindow = null;
    try { targetWindow = iframe.contentWindow; } catch {}
    const frameId = runtimeFrameId(targetWindow);
    if (frameId) iframe.dataset.browserFrameId = String(frameId);
    return frameId;
  }

  function completeFrameLoading(iframe) {
    if (!(iframe instanceof HTMLIFrameElement)) return;
    rememberBrowserFrameId(iframe);
    if (iframe.dataset.frameLoadPending === "1") return;
    setFrameLoading(iframe, false);
  }

  function beginFrameNavigationGeneration(iframe) {
    const generation = (frameNavigationGenerations.get(iframe) || 0) + 1;
    frameNavigationGenerations.set(iframe, generation);
    return generation;
  }

  function frameNavigationIsCurrent(iframe, generation) {
    return iframe?.isConnected && frameNavigationGenerations.get(iframe) === generation;
  }

  function maintainFrameNavigationFocusGuard(iframe, generation, expiresAt, preflight = {}) {
    const startedAt = Date.now();
    const guardToken = String(preflight.guardToken || "");
    let loadObserved = false;
    let lastDocumentToken = "";
    let lastDocumentAckAt = 0;
    let stopped = false;
    let requestInFlight = false;
    let retryTimer = null;
    let timeoutTimer = null;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      if (retryTimer) clearInterval(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      iframe.removeEventListener("load", onLoad, true);
    };
    const onLoad = () => {
      loadObserved = true;
      lastDocumentToken = "";
      lastDocumentAckAt = 0;
      send();
    };
    const send = () => {
      if (
        !frameNavigationIsCurrent(iframe, generation)
        || Date.now() - startedAt > NAVIGATION_FOCUS_GUARD_POST_NAV_MAX_MS
      ) return false;
      if (loadObserved && lastDocumentAckAt && Date.now() - lastDocumentAckAt >= NAVIGATION_FOCUS_GUARD_POST_NAV_SETTLE_MS) {
        return false;
      }
      if (requestInFlight) return true;
      requestInFlight = true;
      sendToContentFrame(iframe, "adoptNavigationFocusGuard", { guardToken, expiresAt }, NAVIGATION_FOCUS_GUARD_TIMEOUT_MS)
        .then((result) => {
          if (!loadObserved || result?.guardToken !== guardToken) return;
          const documentToken = String(result.documentToken || "");
          if (documentToken && documentToken !== lastDocumentToken) {
            lastDocumentToken = documentToken;
            lastDocumentAckAt = Date.now();
          }
        })
        .catch(() => {})
        .finally(() => { requestInFlight = false; });
      return true;
    };
    iframe.addEventListener("load", onLoad, true);
    send();
    retryTimer = setInterval(() => {
      if (!send()) finish();
    }, NAVIGATION_FOCUS_GUARD_POST_NAV_RETRY_MS);
    timeoutTimer = setTimeout(finish, NAVIGATION_FOCUS_GUARD_POST_NAV_MAX_MS + NAVIGATION_FOCUS_GUARD_POST_NAV_RETRY_MS);
  }

  async function prepareFrameNavigationFocusGuard(iframe, generation) {
    const prompt = document.querySelector(".prompt-input");
    if (
      !(iframe instanceof HTMLIFrameElement)
      || !prompt?.isConnected
      || document.activeElement !== prompt
      || !iframe.contentWindow
    ) return null;

    const guardToken = globalThis.crypto?.randomUUID?.()
      || `focus-guard-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const expiresAt = Date.now() + NAVIGATION_FOCUS_GUARD_LEASE_MS;
    if (!frameNavigationIsCurrent(iframe, generation)) return { ok: false, guardToken, expiresAt };
    try {
      const result = await sendToContentFrame(
        iframe,
        "prepareNavigationFocusGuard",
        { guardToken, expiresAt },
        NAVIGATION_FOCUS_GUARD_TIMEOUT_MS
      );
      return {
        ok: result?.ok === true,
        guardToken,
        documentToken: String(result?.documentToken || ""),
        expiresAt
      };
    } catch {
      return { ok: false, guardToken, documentToken: "", expiresAt };
    }
  }

  function assignFrameSrc(iframe, url) {
    if (!(iframe instanceof HTMLIFrameElement) || !url) return false;
    if (iframe.isConnected && ensureFrameAttributeContract(iframe, url, { phase: "assign" })) return true;
    const generation = beginFrameNavigationGeneration(iframe);
    beginFrameLoading(iframe);
    const assign = (preflight = {}) => {
      if (!frameNavigationIsCurrent(iframe, generation)) return;
      const expiresAt = Date.now() + NAVIGATION_FOCUS_GUARD_LEASE_MS;
      if (guard && document.activeElement === document.querySelector(".prompt-input")) {
        maintainFrameNavigationFocusGuard(iframe, generation, expiresAt, preflight);
      }
      iframe.src = url;
    };
    const guard = prepareFrameNavigationFocusGuard(iframe, generation);
    if (guard) guard.then(assign, assign);
    else assign();
    return true;
  }

  function setFrameSrcAfterPrepare(iframe, url, options = {}) {
    if (iframe?.isConnected && ensureFrameAttributeContract(iframe, url, { phase: "prepare" })) return;
    const generation = beginFrameNavigationGeneration(iframe);
    beginFrameLoading(iframe, true);
    let assigned = false;
    const assign = () => {
      if (assigned || !frameNavigationIsCurrent(iframe, generation)) return;
      if (!options.replace && iframe.getAttribute("src")) {
        delete iframe.dataset.frameLoadPending;
        completeFrameLoading(iframe);
        return;
      }
      assigned = true;
      const setSrc = (preflight = {}) => {
        if (!frameNavigationIsCurrent(iframe, generation)) return;
        rememberBrowserFrameId(iframe);
        const expiresAt = Date.now() + NAVIGATION_FOCUS_GUARD_LEASE_MS;
        if (guard && document.activeElement === document.querySelector(".prompt-input")) {
          maintainFrameNavigationFocusGuard(iframe, generation, expiresAt, preflight);
        }
        // Keep the initial about:blank load suppressed until the real URL is
        // assigned. Otherwise a long Grok Cookie preflight can publish a false
        // loading=false edge before the direct child frame exists.
        delete iframe.dataset.frameLoadPending;
        iframe.setAttribute("src", url);
      };
      const guard = prepareFrameNavigationFocusGuard(iframe, generation);
      if (guard) guard.then(setSrc, setSrc);
      else setSrc();
    };
    const grokPreflight = grokCookieBridgeUrl(url);
    const preflightId = grokPreflight ? grokFramePreflightId() : "";
    const fallback = setTimeout(() => {
      if (!grokPreflight) {
        assign();
        return;
      }
      const guard = setTimeout(assign, 300);
      markGrokFramePreflightFallback(url, preflightId).finally(() => {
        clearTimeout(guard);
        assign();
      });
    }, grokPreflight ? 10000 : 1800);
    prepareFrameLoad(url, preflightId)
      .catch(() => null)
      .finally(() => {
        clearTimeout(fallback);
        assign();
      });
  }

  function currentFullscreenGroup() {
    if (!state.fullscreenGroupId) return null;
    const group = state.groups.find((item) => item.id === state.fullscreenGroupId);
    if (!group) {
      state.fullscreenGroupId = null;
      rememberWorkspaceSession();
    }
    return group || null;
  }

  function fullscreenShortcutLabel() {
    return shortcutLabel("enterFullscreen");
  }

  function iframeForWindow(sourceWindow) {
    if (!sourceWindow) return null;
    if (sourceWindow instanceof HTMLIFrameElement && sourceWindow.classList.contains("chat-frame")) return sourceWindow;
    for (const iframe of document.querySelectorAll(".chat-frame")) {
      try {
        if (iframe.contentWindow === sourceWindow) return iframe;
      } catch {}
    }
    return null;
  }

  function groupIdForFrameWindow(sourceWindow) {
    const iframe = iframeForWindow(sourceWindow);
    if (iframe) return iframe.closest(".chat-card")?.dataset.groupId || "";
    return "";
  }

  function activeShortcutGroupId(sourceWindow) {
    const sourceGroupId = groupIdForFrameWindow(sourceWindow);
    if (sourceGroupId) return sourceGroupId;
    if (state.fullscreenGroupId) return state.fullscreenGroupId;
    const focusedFrame = document.activeElement?.classList?.contains("chat-frame") ? document.activeElement : null;
    const focusedGroupId = focusedFrame?.closest(".chat-card")?.dataset.groupId;
    return focusedGroupId || state.groups[0]?.id || "";
  }

  function activeChatForGroup(group) {
    const active = state.activeTabs[group.id] || group.chatApps[0]?.instanceId;
    return group.chatApps.find((chat) => chat.instanceId === active) || group.chatApps[0];
  }

  function activateChatTab(group, instanceId, previousInstanceIdOverride = "") {
    if (!group?.chatApps.some((chat) => chat.instanceId === instanceId)) return;
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const previousInstanceId = previousInstanceIdOverride
      || card?.querySelector(".chat-frame.active")?.dataset.instanceId
      || state.activeTabs[group.id]
      || group.chatApps[0]?.instanceId
      || "";
    state.activeTabs[group.id] = instanceId;
    rememberWorkspaceSession();
    card?.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.instanceId === instanceId);
    });
    card?.querySelectorAll(".chat-frame").forEach((frame) => {
      frame.classList.toggle("active", frame.dataset.instanceId === instanceId);
    });
    if (card) syncTabGroupHeaderControls(card, group);
    if (previousInstanceId !== instanceId) {
      emitFrameLifecycleChange({
        type: "active-tab",
        groupId: group.id,
        instanceId,
        previousInstanceId,
        iframe: card?.querySelector(`.chat-frame[data-instance-id="${instanceId}"]`) || null
      });
    }
  }

  function syncGroupTabOrder(group) {
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const tabs = card?.querySelector(".chat-tabs");
    if (!tabs) return;
    const addButton = tabs.querySelector(".tab-add");
    for (const chat of group.chatApps) {
      const tab = tabs.querySelector(`.tab[data-instance-id="${chat.instanceId}"]`);
      if (tab) tabs.insertBefore(tab, addButton || null);
    }
  }

  function toggleFullscreen(groupId = activeShortcutGroupId()) {
    if (!groupId || !state.groups.some((group) => group.id === groupId)) return;
    state.fullscreenGroupId = state.fullscreenGroupId === groupId ? null : groupId;
    rememberWorkspaceSession();
    closePopovers();
    syncFullscreenLayout();
  }

  function syncFullscreenLayout() {
    const fullscreenGroup = currentFullscreenGroup();
    const shell = document.querySelector(".app-shell");
    const grid = document.querySelector(".main-grid");
    shell?.classList.toggle("fullscreen-mode", Boolean(fullscreenGroup));
    grid?.classList.toggle("fullscreen-grid", Boolean(fullscreenGroup));
    syncGridColumns();
    document.querySelectorAll(".chat-card").forEach((card) => {
      const isActive = Boolean(fullscreenGroup && card.dataset.groupId === fullscreenGroup.id);
      card.classList.toggle("fullscreen", isActive);
      card.classList.toggle("fullscreen-hidden", Boolean(fullscreenGroup && !isActive));
      const buttonNode = card.querySelector(".fullscreen-action");
      if (!buttonNode) return;
      const cardGroup = state.groups.find((item) => item.id === card.dataset.groupId);
      if (!cardGroup) return;
      const { fullscreenLabel: label, fullscreenTooltipLabel } = fullscreenButtonMeta(cardGroup);
      buttonNode.setAttribute("aria-label", label);
      buttonNode.setAttribute("data-tooltip", fullscreenTooltipLabel);
      buttonNode.setAttribute("data-tooltip-id", "workspace.group.fullscreen");
      buttonNode.replaceChildren(svgIcon(isActive ? "minimize" : "maximize"));
    });
  }

  async function syncFrameFavicon(frameOrWindow) {
    const iframe = iframeForWindow(frameOrWindow);
    if (!iframe) return;
    const instanceId = iframe.dataset.instanceId || "";
    if (!instanceId) return;
    const app = frameApp(iframe);
    let href = app.url;
    let logoUrl = "";
    try {
      const meta = await sendToContentFrame(iframe, "getPageMeta", {}, 1800);
      href = meta?.href || href;
      rememberFrameLocation(iframe, { href, title: meta?.title });
      logoUrl = effectiveFaviconUrl(href, meta?.logoUrl) || meta?.logoUrl || "";
    } catch {
      logoUrl = effectiveFaviconUrl(href);
    }
    const discoveredLogoUrl = await discoverDeclaredFaviconUrl(href);
    if (discoveredLogoUrl) logoUrl = discoveredLogoUrl;
    // Favicon discovery can outlive a same-document SPA navigation. Never let
    // its captured href roll the frame location back to the pre-navigation URL.
    if (iframe.isConnected && (!iframe.dataset.currentHref || iframe.dataset.currentHref === href)) {
      rememberFrameLocation(iframe, { href });
    }
    if (logoUrl) {
      rememberFaviconUrl(href, logoUrl);
      if (app.url && app.url !== href) rememberFaviconUrl(app.url, logoUrl);
    }
    const image = document.querySelector(`.tab[data-instance-id="${instanceId}"] .tab-favicon`);
    if (!image || !logoUrl) return;
    image.dataset.browserFallback = "0";
    image.dataset.fallback = "0";
    image.hidden = false;
    image.src = logoUrl;
  }

  async function closeTab(group, chat) {
    if (!group || !chat) return;
    const previousActiveInstanceId = state.activeTabs[group.id] || group.chatApps[0]?.instanceId || "";
    const result = removeChatFromGroup(state.groups, state.activeTabs, group, chat);
    if (result.removeGroup) {
      await removeChatGroup(group);
      return;
    }
    if (!result.removed) return;
    if (group.chatApps.length >= 1) {
      const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
      card?.querySelector(`.tab[data-instance-id="${chat.instanceId}"]`)?.remove();
      card?.querySelector(`.chat-frame[data-instance-id="${chat.instanceId}"]`)?.remove();
      if (result.nextActiveId) activateChatTab(group, result.nextActiveId, previousActiveInstanceId);
    }
    await persistLayout();
    syncGroupTabOrder(group);
    notifyWorkspaceFrameSync();
  }

  async function removeChatGroup(group) {
    if (!group || state.groups.length <= 1) return false;
    const result = removeGroupFromWorkspace(state.groups, state.activeTabs, group.id);
    if (!result.changed) return false;
    state.groups = result.groups;
    if (state.fullscreenGroupId === group.id) state.fullscreenGroupId = null;
    await persistLayout();
    document.querySelector(`.chat-card[data-group-id="${group.id}"]`)?.remove();
    syncGridColumnClass();
    syncFullscreenLayout();
    return true;
  }

  function activeIframe(chat) {
    if (!chat?.instanceId) return null;
    return document.querySelector(`iframe[data-instance-id="${chat.instanceId}"]`);
  }

  async function refreshCurrentPage(chat) {
    const iframe = activeIframe(chat);
    if (!iframe) return false;
    const liveHref = await activeHref(chat);
    const href = openableTabUrl(liveHref)
      || openableTabUrl(iframe.dataset.currentHref)
      || openableTabUrl(iframe.src || iframe.getAttribute?.("src"))
      || openableTabUrl(appById(chat?.appId).url);
    if (!href) return false;
    iframe.dataset.currentHref = href;
    rememberWorkspaceSession();
    return assignFrameSrc(iframe, href);
  }

  function reloadChat(chat) {
    const iframe = activeIframe(chat);
    const app = appById(chat?.appId);
    if (!iframe || !app?.url) return false;
    iframe.dataset.currentHref = app.url;
    delete iframe.dataset.currentThreadHref;
    delete iframe.dataset.currentTitle;
    rememberWorkspaceSession();
    return assignFrameSrc(iframe, app.url);
  }

  async function startNewChatInFrame(iframe, fallbackChat = null) {
    if (!(iframe instanceof HTMLIFrameElement)) return false;
    try {
      await sendToContentFrame(iframe, "newChatPreprocess", {}, 1500);
    } catch {}
    const app = frameApp(iframe) || appById(fallbackChat?.appId || iframe.dataset?.appId);
    if (!app?.url) return false;
    iframe.dataset.currentHref = app.url;
    delete iframe.dataset.currentThreadHref;
    delete iframe.dataset.currentTitle;
    rememberWorkspaceSession();
    return assignFrameSrc(iframe, app.url);
  }

  async function startNewChatInActiveTab(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    if (!chat || !iframe) return false;
    return startNewChatInFrame(iframe, chat);
  }

  function normalizeUserNavigationUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    let href = value;
    const scheme = href.match(/^([a-zA-Z][a-zA-Z\d+.-]*):(.*)$/);
    if (scheme) {
      const protocol = scheme[1].toLowerCase();
      const rest = scheme[2] || "";
      if (protocol !== "http" && protocol !== "https") {
        if (/^\d+(?:[/?#]|$)/.test(rest)) href = `https://${href}`;
        else return "";
      }
    } else if (href.startsWith("//")) {
      href = `https:${href}`;
    } else {
      href = `https://${href}`;
    }
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      if (!parsed.hostname) return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function navigateActiveChatToUrl(group, rawUrl) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    const href = normalizeUserNavigationUrl(rawUrl);
    if (!chat || !iframe || !href) return false;
    iframe.dataset.currentHref = href;
    delete iframe.dataset.currentThreadHref;
    delete iframe.dataset.currentTitle;
    rememberWorkspaceSession();
    setFrameSrcAfterPrepare(iframe, href, { replace: true });
    return true;
  }

  function openGoToUrlDialog(group) {
    closePopovers();
    const currentHref = cachedGroupHref(group);
    const urlInput = input(currentHref, {
      type: "url",
      inputmode: "url",
      autocomplete: "url",
      spellcheck: "false",
      placeholder: t("chat.goToUrlPlaceholder")
    });
    let dialog;
    const close = () => dialog?.remove();
    const submit = (event) => {
      event?.preventDefault?.();
      const href = normalizeUserNavigationUrl(urlInput.value);
      if (!href) {
        urlInput.setAttribute("aria-invalid", "true");
        notify(t("chat.goToUrlInvalid"), "error");
        urlInput.focus({ preventScroll: true });
        urlInput.select();
        return;
      }
      if (!navigateActiveChatToUrl(group, href)) {
        notify(t("chat.noActiveIframe"), "error");
        return;
      }
      close();
    };
    urlInput.addEventListener("input", () => urlInput.removeAttribute("aria-invalid"));
    const cancelButton = button(t("common.cancel"), (event) => {
      event.preventDefault();
      close();
    });
    cancelButton.type = "button";
    const submitButton = button(t("chat.goToUrlSubmit"), null, "primary");
    submitButton.type = "submit";
    const form = el("form", {
      class: "settings-editor-form go-to-url-form",
      novalidate: true,
      onsubmit: submit
    },
      field(t("chat.goToUrlField"), urlInput),
      el("div", { class: "settings-dialog-actions" }, cancelButton, submitButton)
    );
    dialog = editorModal(t("chat.goToUrl"), form, close, false, t("common.close"));
    dialog.querySelector(".modal")?.classList.add("go-to-url-modal");
    requestAnimationFrame(() => {
      urlInput.focus({ preventScroll: true });
      urlInput.select();
    });
    return dialog;
  }

  async function startNewChatForShortcut(sourceWindow = null) {
    const groupId = activeShortcutGroupId(sourceWindow);
    const group = state.groups.find((item) => item.id === groupId) || state.groups[0];
    if (!group) return false;
    return startNewChatInActiveTab(group);
  }

  async function activeHref(chat) {
    const iframe = activeIframe(chat);
    let href = openableTabUrl(iframe?.dataset.currentHref)
      || openableTabUrl(iframe?.src || iframe?.getAttribute?.("src"))
      || appById(chat?.appId).url;
    try {
      const prepared = await prepareContentFrameRuntime(iframe);
      if (prepared?.ok) href = await sendToContentFrame(iframe, "getLocationHref", {}, 1800) || href;
    } catch {}
    const currentHref = openableTabUrl(href);
    if (iframe && currentHref) rememberFrameLocation(iframe, { href: currentHref });
    return href;
  }

  function cachedChatHref(chat) {
    const iframe = activeIframe(chat);
    return openableTabUrl(iframe?.dataset.currentHref) || openableTabUrl(appById(chat?.appId).url);
  }

  function cachedGroupHref(group) {
    const chat = activeChatForGroup(group);
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const iframe = card?.querySelector(".chat-frame.active") || activeIframe(chat);
    return openableTabUrl(iframe?.dataset.currentHref)
      || openableTabUrl(iframe?.src || iframe?.getAttribute?.("src"))
      || cachedChatHref(chat);
  }

  function openChatInNewTab(group) {
    const chat = activeChatForGroup(group);
    if (!chat) return;
    const href = cachedGroupHref(group);
    if (!href) {
      closePopovers();
      notify(t("chat.unableToOpenTab"), "error");
      return;
    }
    const opened = openTabUrl(href);
    closePopovers();
    if (!opened) notify(t("chat.unableToOpenTab"), "error");
    activeHref(chat).catch(() => {});
  }

  async function copyActiveChatLink(group) {
    const chat = activeChatForGroup(group);
    if (!chat) return;
    await navigator.clipboard.writeText(await activeHref(chat));
    notify(t("chat.linkCopied"), "success");
    closePopovers();
  }

  async function deleteActiveThreadForGroup(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    if (!chat || !iframe) return;
    const app = frameApp(iframe) || appById(chat.appId);
    const initialCapability = topicDeleteCapabilityForFrame(iframe, {
      appId: app?.id || chat.appId || ""
    });
    const initialConfig = initialCapability.config;
    const initialNeedsPermission = Boolean(
      initialConfig
      && (initialConfig.sourceMode === "custom" || initialConfig.builtIn === false)
    );
    const permissionResult = (config) => {
      try {
        return Promise.resolve(requestTopicDeletePermission(config))
          .then(() => ({ granted: true, error: null }))
          .catch((error) => ({ granted: false, error }));
      } catch (error) {
        return Promise.resolve({ granted: false, error });
      }
    };
    const earlyPermission = initialNeedsPermission
      ? permissionResult(initialConfig)
      : Promise.resolve({ granted: true, error: null });
    const href = await activeHref(chat);
    const capability = topicDeleteCapabilityForFrame(iframe, {
      appId: app?.id || chat.appId || "",
      currentHref: href
    });
    const { payload, config: deleteSiteConfig } = capability;
    if (!capability.available) {
      notify(t("toast.deleteThreadSkipped", { count: 1, plural: "" }), "info");
      closePopovers();
      return;
    }
    if (!window.confirm(t("topbar.deleteThreadConfirm", { count: 1, plural: "" }))) return;
    const needsPermission = Boolean(
      deleteSiteConfig
      && (deleteSiteConfig.sourceMode === "custom" || deleteSiteConfig.builtIn === false)
    );
    if (needsPermission) {
      const permission = initialNeedsPermission ? await earlyPermission : await permissionResult(deleteSiteConfig);
      if (!permission.granted) {
        notify(permission.error?.message || String(permission.error || "User Scripts access was not granted."), "error");
        closePopovers();
        return;
      }
    }
    try {
      const timeoutMs = topicDeleteTimeoutMs(deleteSiteConfig, payload);
      await executeTopicDelete(iframe, payload, deleteSiteConfig, timeoutMs);
      notify(t("toast.deleteThreadTriggered", { count: 1, plural: "" }), "success");
    } catch (error) {
      void recordFunctionalAnomaly({
        feature: "topicDeletion",
        operation: "deleteTopic",
        appId: app?.id || chat.appId || deleteSiteConfig?.id || "",
        appName: inferAppName(app || {}),
        href,
        error,
        message: error?.message || t("toast.deleteThreadFailed", { count: 1, plural: "" })
      });
      console.warn("[ChatClub] Delete thread failed", error);
      const reason = String(error?.message || "").trim();
      const message = t("toast.deleteThreadFailed", { count: 1, plural: "" });
      notify(reason ? `${message}: ${reason}` : message, "error");
    } finally {
      closePopovers();
    }
  }

  return Object.freeze({
    activeChatForGroup,
    activeFrameIsLoading,
    activeHref,
    activeIframe,
    activeShortcutGroupId,
    activateChatTab,
    assignFrameSrc,
    chatFrameAttributes,
    chatFrameName,
    closeTab,
    completeFrameLoading,
    consumeFrameInitialHref,
    copyActiveChatLink,
    createFrameBindingId,
    deleteActiveThreadForGroup,
    fullscreenShortcutLabel,
    groupIdForFrameWindow,
    iframeForWindow,
    knownNoConversationPage,
    notifyWorkspaceFrameSync,
    openChatInNewTab,
    openGoToUrlDialog,
    refreshCurrentPage,
    reloadChat,
    removeChatGroup,
    rememberFrameLocation,
    setFrameSrcAfterPrepare,
    stageFrameInitialHref,
    startNewChatForShortcut,
    startNewChatInActiveTab,
    startNewChatInFrame,
    syncFrameFavicon,
    syncFullscreenLayout,
    syncGroupTabOrder,
    toggleFullscreen,
    topicDeleteCapabilityForFrame
  });
}
