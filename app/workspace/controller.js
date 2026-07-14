import { t } from "../../shared/i18n.js";
import { MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE, sendToIframe } from "../../shared/post-message.js";
import { sendToContentFrame } from "../../shared/frame-rpc.js";
import { currentExtensionTabId, runtimeRequest } from "../../shared/extension-api.js";
import { TAB_GROUP_HEADER_BUTTONS } from "../../shared/constants.js";
import { normalizeTabGroupButtonOrder, normalizeTabGroupButtonPlacement } from "../../shared/storage-schema.js";
import { findMessageNavigatorSiteConfig } from "../../shared/message-navigator-sites.js";
import { findTopicDeleteSiteConfig, topicDeleteTimeoutMs } from "../../shared/topic-delete-sites.js";
import { button, el, field, input, modal } from "../../ui/dom.js";
import {
  hydrateWorkspaceGroups,
  layoutGroupsFromWorkspace,
  moveDroppedGroupWithinWorkspace,
  moveGroupWithinWorkspace,
  moveTabWithinGroup,
  normalizeWorkspaceLayoutGroups,
  removeChatFromGroup,
  removeGroupFromWorkspace,
  workspaceGridColumnCount
} from "./model.js";
import { createWorkspaceFrameRegistry } from "./frame-registry.js";
import { createWorkspaceOpenTabs } from "./open-tab.js";
import { NAVIGATION_FOCUS_GUARD_SOURCE } from "../../shared/protocol.js";
import { executeTopicDelete } from "../topic-delete/runtime.js";
import { requireControllerContext, requireControllerFunction } from "../controller-context.js";

const DRAG_TAB_MIME = "application/x-chatclub-tab";
const DRAG_TAB_GROUP_MIME = "application/x-chatclub-tab-group";
const DRAG_GROUP_MIME = "application/x-chatclub-group";
const TAB_DRAG_START_DISTANCE = 6;
const GROUP_DRAG_START_DISTANCE = 6;
const LAYOUT_POPOVER_RIGHT_EXTENSION = 40;
const NAVIGATION_FOCUS_GUARD_TIMEOUT_MS = 1200;
const NAVIGATION_FOCUS_GUARD_RETRY_MS = 75;
const NAVIGATION_FOCUS_GUARD_POST_NAV_RETRY_MS = 150;
const NAVIGATION_FOCUS_GUARD_POST_NAV_SETTLE_MS = 10000;
const NAVIGATION_FOCUS_GUARD_POST_NAV_MAX_MS = 45000;
const NAVIGATION_FOCUS_GUARD_LEASE_MS = 180000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const CHAT_FRAME_ALLOW_FEATURES = Object.freeze([
  "microphone",
  "clipboard-write",
  "clipboard-read",
  "geolocation",
  "display-capture",
  "camera",
  "unload",
  "autoplay",
  "fullscreen",
  "shared-storage",
  "picture-in-picture",
  "storage-access",
  "web-share"
]);
const APP_PICKER_INTERNATIONAL_IDS = [
  "ChatGPT",
  "Claude",
  "Copilot",
  "CopilotGH",
  "Felo",
  "Gemini",
  "Genspark",
  "Grok",
  "Liner",
  "Meta",
  "Mistral",
  "Perplexity",
  "Poe",
  "QwenChat",
  "You",
  "Zai",
  "NotionAI",
  "Kagi",
  "TypingMind"
];
const APP_PICKER_INTERNATIONAL_ID_SET = new Set(APP_PICKER_INTERNATIONAL_IDS);
const APP_PICKER_FORCE_INTERNATIONAL_HOSTS = new Set(["assistant.kagi.com"]);
const APP_PICKER_CHINESE_IDS = [
  "ChatGLM",
  "DeepSeek",
  "DouBao",
  "YiYan",
  "Kimi",
  "LingGuang",
  "LongCat",
  "MetaSo",
  "HaiLuo",
  "NaMiSearch",
  "Qwen",
  "SenseChat",
  "YueWen",
  "HunYuan"
];
const APP_PICKER_CHINESE_ID_SET = new Set(APP_PICKER_CHINESE_IDS);

/**
 * @typedef {{ type: "loading", instanceId: string, iframe: HTMLIFrameElement | null, loading: boolean }
 *   | { type: "active-tab", groupId: string, instanceId: string, previousInstanceId: string, iframe: HTMLIFrameElement | null }
 *   | { type: "location", instanceId: string, iframe: HTMLIFrameElement, previousHref: string, href: string }
 *   | { type: "workspace-sync", frames: readonly HTMLIFrameElement[], activeFrames: readonly HTMLIFrameElement[], membershipChanged: boolean }} WorkspaceFrameLifecycleEvent
 */

/**
 * @typedef {object} WorkspaceControllerContext
 * @property {any} state
 * @property {() => string} createGroupId
 * @property {() => string} createFrameId
 * @property {() => string} createLayoutId
 * @property {() => any[]} allApps
 * @property {(id: string) => any} appById
 * @property {(app: any) => string} inferAppName
 * @property {(app: any) => string} appFaviconUrl
 * @property {(app: any) => string} fallbackFaviconUrl
 * @property {(href: string) => string} browserFaviconUrl
 * @property {(href: string, declaredLogoUrl?: string) => string} effectiveFaviconUrl
 * @property {(href: string) => Promise<string>} discoverDeclaredFaviconUrl
 * @property {(href: string, logoUrl: string) => void} rememberFaviconUrl
 * @property {(nextOptions: any) => Promise<any>} saveOptions
 * @property {(nextOptions: any) => any} normalizeOptions
 * @property {(message: string, type?: string) => void} toast
 * @property {() => void} render
 * @property {(name: string) => SVGElement} svgIcon
 * @property {(label: string, iconName: string, onClick: Function, extraClass?: string, tooltipLabel?: string, tooltipPlacement?: string, tooltipId?: string) => HTMLElement} compactIconButton
 * @property {(label: string, iconName: string, onClick: Function, variant?: string, disabled?: boolean, tooltipLabel?: string, tooltipPlacement?: string, tooltipId?: string) => HTMLElement} menuButton
 * @property {(action: string, slot?: string) => string} formatShortcut
 * @property {(config: any) => Promise<boolean>} [requestTopicDeletePermission]
 * @property {(iframe: HTMLIFrameElement, options?: object) => Promise<any>} [prepareContentFrameRuntime]
 * @property {() => void} [openCustomAppEditor]
 * @property {(event: WorkspaceFrameLifecycleEvent) => void} [onFrameLifecycleChange]
 */

const requireContext = (ctx, name) => requireControllerContext(ctx, "Workspace controller", name);
const requireFunction = (ctx, name) => requireControllerFunction(ctx, "Workspace controller", name);

/**
 * Workspace owns group/tab DOM orchestration and iframe lifecycle. It receives
 * app-level services explicitly so feature modules do not reach through main.ts
 * globals for workspace behavior.
 *
 * @param {WorkspaceControllerContext} ctx
 */
export function createWorkspaceController(ctx = {}) {
  const state = requireContext(ctx, "state");
  const createGroupId = requireFunction(ctx, "createGroupId");
  const createFrameId = requireFunction(ctx, "createFrameId");
  const createLayoutId = requireFunction(ctx, "createLayoutId");
  const allApps = requireFunction(ctx, "allApps");
  const appById = requireFunction(ctx, "appById");
  const inferAppName = requireFunction(ctx, "inferAppName");
  const appFaviconUrl = requireFunction(ctx, "appFaviconUrl");
  const fallbackFaviconUrl = requireFunction(ctx, "fallbackFaviconUrl");
  const browserFaviconUrl = requireFunction(ctx, "browserFaviconUrl");
  const effectiveFaviconUrl = requireFunction(ctx, "effectiveFaviconUrl");
  const discoverDeclaredFaviconUrl = requireFunction(ctx, "discoverDeclaredFaviconUrl");
  const rememberFaviconUrl = requireFunction(ctx, "rememberFaviconUrl");
  const saveOptions = requireFunction(ctx, "saveOptions");
  const normalizeOptions = requireFunction(ctx, "normalizeOptions");
  const notify = requireFunction(ctx, "toast");
  const render = requireFunction(ctx, "render");
  const svgIcon = requireFunction(ctx, "svgIcon");
  const compactIconButton = requireFunction(ctx, "compactIconButton");
  const menuButton = requireFunction(ctx, "menuButton");
  const formatShortcut = requireFunction(ctx, "formatShortcut");
  const requestTopicDeletePermission = typeof ctx.requestTopicDeletePermission === "function"
    ? ctx.requestTopicDeletePermission
    : async () => true;
  const prepareContentFrameRuntime = typeof ctx.prepareContentFrameRuntime === "function"
    ? ctx.prepareContentFrameRuntime
    : async () => ({ ok: true });
  const openCustomAppEditor = typeof ctx.openCustomAppEditor === "function" ? ctx.openCustomAppEditor : null;
  const onFrameLifecycleChange = typeof ctx.onFrameLifecycleChange === "function" ? ctx.onFrameLifecycleChange : () => {};
  let workspaceNode = null;
  let workspaceRenderSignature = "";
  let workspaceLifecycleFrames = [];
  let frameLifecycleCallbackActive = false;
  const frameNavigationGenerations = new WeakMap();
  let messageNavigatorMenuIframe = null;

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

  function frameForLifecycleInstance(instanceId) {
    return Array.from(document.querySelectorAll(".chat-frame"))
      .find((frame) => frame.dataset.instanceId === instanceId) || null;
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

  function workspaceSignature() {
    return JSON.stringify({
      colMaxCount: state.options?.colMaxCount,
      groups: (state.groups || []).map((group) => ({
        id: group.id,
        chats: (group.chatApps || []).map((chat) => ({
          appId: chat.appId,
          instanceId: chat.instanceId
        }))
      }))
    });
  }

  function workspaceDomMatchesState() {
    const grid = workspaceNode?.isConnected ? workspaceNode : document.querySelector(".main-grid");
    if (!grid) return false;
    const cards = Array.from(grid.querySelectorAll(":scope > .chat-card"));
    if (cards.length !== (state.groups || []).length) return false;
    return (state.groups || []).every((group) => {
      const card = cards.find((node) => node.dataset.groupId === group.id);
      if (!card) return false;
      const tabs = Array.from(card.querySelectorAll(".tab[data-instance-id]"));
      const frames = Array.from(card.querySelectorAll(".chat-frame[data-instance-id]"));
      const ids = (group.chatApps || []).map((chat) => chat.instanceId);
      return ids.length === tabs.length
        && ids.length === frames.length
        && ids.every((id) => tabs.some((tab) => tab.dataset.instanceId === id))
        && ids.every((id) => frames.some((frame) => frame.dataset.instanceId === id));
    });
  }

  let activeTabDrag = null;
  let activeTabPointerDrag = null;
  let activeGroupPointerDrag = null;
  let suppressTabClickInstanceId = "";
  const openTabs = createWorkspaceOpenTabs();
  const { openableTabUrl, openTabUrl, refreshCurrentExtensionTabInfo } = openTabs;
  const frameRegistry = createWorkspaceFrameRegistry({ appById, openableTabUrl });
  const {
    currentFrames,
    findFrameForSummarySource,
    frameApp,
    highlightFrameForSummarySource,
    setFramePointerBlockedForOverlay
  } = frameRegistry;

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
    const missingCustomScript = Boolean(config && config.builtIn === false && !String(config.userscript || "").trim());
    const noConversationPage = Boolean(config && knownNoConversationPage(config, payload));
    const skipped = !config || config.enabled === false || missingCustomScript || noConversationPage;
    return { iframe, payload, config, missingCustomScript, noConversationPage, skipped, available: !skipped };
  }

  function customAppIds() {
    return new Set((state.customConfig || []).map((app) => app?.id).filter(Boolean));
  }

  function normalizeAppPickerHost(host) {
    return String(host || "")
      .trim()
      .toLowerCase()
      .replace(/^\*\./, "")
      .replace(/^www\./, "");
  }

  function appPickerHostKeys(app) {
    const keys = new Set();
    for (const host of app?.hosts || []) {
      const normalized = normalizeAppPickerHost(host);
      if (normalized) keys.add(normalized);
    }
    try {
      const normalized = normalizeAppPickerHost(new URL(app.url).hostname);
      if (normalized) keys.add(normalized);
    } catch {}
    return keys;
  }

  function appHostMatches(app, roots) {
    for (const key of appPickerHostKeys(app)) {
      for (const root of roots) {
        if (key === root || key.endsWith(`.${root}`)) return true;
      }
    }
    return false;
  }

  function isGrokEmbedHost(app) {
    return appHostMatches(app, ["grok.com", "grok.x.ai"]);
  }

  function chatFrameNeedsSandbox(app) {
    return !(app?.noSandbox || isGrokEmbedHost(app));
  }

  function chatFrameSandbox(app) {
    const tokens = [
      "allow-scripts",
      "allow-same-origin",
      "allow-forms",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-top-navigation",
      "allow-modals",
      "allow-downloads",
      "allow-presentation",
      "allow-storage-access-by-user-activation"
    ];
    return tokens.join(" ");
  }

  function chatFrameAllow() {
    return CHAT_FRAME_ALLOW_FEATURES.map((feature) => `${feature} *`).join("; ");
  }

  function chatFrameName(app) {
    const params = new URLSearchParams();
    params.set("chatclub_webview", "");
    params.set("ua", globalThis.navigator?.userAgent || "");
    params.set("ssc", "1");
    if (app?.id) params.set("app", app.id);
    return params.toString();
  }

  async function prepareFrameLoad(url) {
    try {
      return await runtimeRequest({ source: "chatclub", action: "prepareFrameLoad", url });
    } catch (error) {
      return { success: false, error: error?.message || String(error || "prepareFrameLoad failed") };
    }
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
        : frameForLifecycleInstance(instanceId),
      loading: set.has(instanceId)
    });
  }

  function frameIsLoading(instanceId) {
    return frameLoadingSet().has(String(instanceId || ""));
  }

  function activeFrameIsLoading(group) {
    return frameIsLoading(activeChatForGroup(group)?.instanceId);
  }

  function syncHeaderForFrameInstance(instanceId) {
    const location = chatLocationForInstance(instanceId);
    const group = location?.group;
    if (!group) return;
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    if (card) syncTabGroupHeaderControls(card, group);
  }

  function beginFrameLoading(iframe, pending = false) {
    if (!(iframe instanceof HTMLIFrameElement)) return false;
    if (pending) iframe.dataset.frameLoadPending = "1";
    else delete iframe.dataset.frameLoadPending;
    setFrameLoading(iframe, true);
    return true;
  }

  function completeFrameLoading(iframe) {
    if (!(iframe instanceof HTMLIFrameElement)) return;
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
    const id = globalThis.crypto?.randomUUID?.()
      || `focus-guard-adopt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const guardToken = String(preflight.guardToken || "");
    let loadObserved = false;
    let lastDocumentToken = "";
    let lastDocumentAckAt = 0;
    let stopped = false;
    let retryTimer = null;
    let timeoutTimer = null;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      if (retryTimer) clearInterval(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      iframe.removeEventListener("load", onLoad, true);
      window.removeEventListener("message", onMessage, true);
    };
    const onLoad = () => {
      loadObserved = true;
      lastDocumentToken = "";
      lastDocumentAckAt = 0;
      send();
    };
    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (
        message?.source !== NAVIGATION_FOCUS_GUARD_SOURCE
        || message.type !== "response"
        || message.action !== "prepare"
        || message.id !== id
        || message.guardToken !== guardToken
        || !loadObserved
      ) return;
      const documentToken = String(message.documentToken || "");
      if (!documentToken) return;
      if (documentToken !== lastDocumentToken) {
        lastDocumentToken = documentToken;
        lastDocumentAckAt = Date.now();
      }
    };
    const send = () => {
      if (
        !frameNavigationIsCurrent(iframe, generation)
        || Date.now() - startedAt > NAVIGATION_FOCUS_GUARD_POST_NAV_MAX_MS
      ) return false;
      if (loadObserved && lastDocumentAckAt && Date.now() - lastDocumentAckAt >= NAVIGATION_FOCUS_GUARD_POST_NAV_SETTLE_MS) {
        return false;
      }
      try {
        iframe.contentWindow?.postMessage({
          source: NAVIGATION_FOCUS_GUARD_SOURCE,
          type: "request",
          action: "prepare",
          phase: "adopt",
          id,
          guardToken,
          expiresAt
        }, "*");
      } catch {}
      return true;
    };
    iframe.addEventListener("load", onLoad, true);
    window.addEventListener("message", onMessage, true);
    send();
    retryTimer = setInterval(() => {
      if (!send()) finish();
    }, NAVIGATION_FOCUS_GUARD_POST_NAV_RETRY_MS);
    timeoutTimer = setTimeout(finish, NAVIGATION_FOCUS_GUARD_POST_NAV_MAX_MS + NAVIGATION_FOCUS_GUARD_POST_NAV_RETRY_MS);
  }

  function prepareFrameNavigationFocusGuard(iframe, generation) {
    const prompt = document.querySelector(".prompt-input");
    if (
      !(iframe instanceof HTMLIFrameElement)
      || !prompt?.isConnected
      || document.activeElement !== prompt
      || !iframe.contentWindow
    ) return null;

    const id = globalThis.crypto?.randomUUID?.()
      || `focus-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const guardToken = globalThis.crypto?.randomUUID?.()
      || `focus-guard-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const expiresAt = Date.now() + NAVIGATION_FOCUS_GUARD_LEASE_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timeoutTimer = null;
      let retryTimer = null;
      const finish = (result = {}) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (retryTimer) clearInterval(retryTimer);
        window.removeEventListener("message", onMessage, true);
        resolve({
          ok: result.ok === true,
          guardToken,
          documentToken: String(result.documentToken || ""),
          expiresAt
        });
      };
      const onMessage = (event) => {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;
        if (
          message?.source !== NAVIGATION_FOCUS_GUARD_SOURCE
          || message.type !== "response"
          || message.action !== "prepare"
          || message.id !== id
        ) return;
        finish(message);
      };
      window.addEventListener("message", onMessage, true);
      const send = () => {
        if (!frameNavigationIsCurrent(iframe, generation)) {
          finish();
          return;
        }
        try {
          iframe.contentWindow?.postMessage({
            source: NAVIGATION_FOCUS_GUARD_SOURCE,
            type: "request",
            action: "prepare",
            phase: "prepare",
            id,
            guardToken,
            expiresAt
          }, "*");
        } catch {}
      };
      send();
      if (!settled) {
        retryTimer = setInterval(send, NAVIGATION_FOCUS_GUARD_RETRY_MS);
        timeoutTimer = setTimeout(() => finish(), NAVIGATION_FOCUS_GUARD_TIMEOUT_MS);
      }
    });
  }

  function assignFrameSrc(iframe, url) {
    if (!(iframe instanceof HTMLIFrameElement) || !url) return false;
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
      delete iframe.dataset.frameLoadPending;
      const setSrc = (preflight = {}) => {
        if (!frameNavigationIsCurrent(iframe, generation)) return;
        const expiresAt = Date.now() + NAVIGATION_FOCUS_GUARD_LEASE_MS;
        if (guard && document.activeElement === document.querySelector(".prompt-input")) {
          maintainFrameNavigationFocusGuard(iframe, generation, expiresAt, preflight);
        }
        iframe.setAttribute("src", url);
      };
      const guard = prepareFrameNavigationFocusGuard(iframe, generation);
      if (guard) guard.then(setSrc, setSrc);
      else setSrc();
    };
    const fallback = setTimeout(assign, 1800);
    prepareFrameLoad(url)
      .catch(() => null)
      .finally(() => {
        clearTimeout(fallback);
        assign();
      });
  }

  function hasCustomAppEquivalent(app, customHostKeys) {
    for (const key of appPickerHostKeys(app)) {
      if (customHostKeys.has(key)) return true;
    }
    return false;
  }

  function isForcedInternationalApp(app) {
    for (const key of appPickerHostKeys(app)) {
      if (APP_PICKER_FORCE_INTERNATIONAL_HOSTS.has(key)) return true;
    }
    return false;
  }

  function appPickerProvider(app) {
    const provider = String(app?.provider || "").trim();
    if (!provider || /^custom$/i.test(provider)) return "";
    return provider;
  }

  function appPickerFaviconUrl(app) {
    return appFaviconUrl(app) || fallbackFaviconUrl(app);
  }

  function renderAppPickerFavicon(app) {
    const image = el("img", {
      class: "app-picker-favicon",
      src: appPickerFaviconUrl(app),
      alt: "",
      draggable: "false",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      onerror: (event) => {
        const icon = event.currentTarget;
        if (icon.dataset.browserFallback !== "1") {
          const browserUrl = browserFaviconUrl(app.url);
          icon.dataset.browserFallback = "1";
          if (browserUrl && icon.src !== browserUrl) {
            icon.src = browserUrl;
            return;
          }
        }
        if (icon.dataset.fallback === "1") return;
        icon.dataset.fallback = "1";
        icon.src = fallbackFaviconUrl(app);
      }
    });
    image.title = inferAppName(app);
    return image;
  }

  function appPickerSections() {
    const apps = allApps();
    const customIds = customAppIds();
    const customApps = apps.filter((app) => !APP_PICKER_INTERNATIONAL_ID_SET.has(app.id)
      && !APP_PICKER_CHINESE_ID_SET.has(app.id)
      && !isForcedInternationalApp(app)
      && (customIds.has(app.id) || /^custom$/i.test(app.provider || "")));
    const customSet = new Set(customApps.map((app) => app.id));
    const customHostKeys = new Set(customApps.flatMap((app) => Array.from(appPickerHostKeys(app))));
    const byKnownOrder = (ids) => {
      const idSet = new Set(ids);
      return apps.filter((app) => idSet.has(app.id) && !customSet.has(app.id) && !hasCustomAppEquivalent(app, customHostKeys));
    };
    const internationalApps = byKnownOrder(APP_PICKER_INTERNATIONAL_IDS);
    const chineseApps = byKnownOrder(APP_PICKER_CHINESE_IDS);
    const assigned = new Set([...customSet, ...internationalApps.map((app) => app.id), ...chineseApps.map((app) => app.id)]);
    const extraInternationalApps = apps.filter((app) => !assigned.has(app.id)
      && !APP_PICKER_CHINESE_ID_SET.has(app.id)
      && !isForcedInternationalApp(app)
      && !hasCustomAppEquivalent(app, customHostKeys));
    return [
      { id: "custom", title: t("appPicker.custom"), apps: customApps, custom: true },
      { id: "international", title: t("appPicker.international"), apps: [...internationalApps, ...extraInternationalApps] },
      { id: "chinese", title: t("appPicker.chinese"), apps: chineseApps }
    ];
  }

  function activePreset() {
    const temporary = activeTemporaryLayoutPreset();
    if (temporary) return temporary;
    const presets = persistentLayoutPresets();
    return presets.find((preset) => preset.id === state.options.activeLayoutPresetId) || presets[0];
  }

  function activeTemporaryLayoutPreset() {
    const preset = state.temporaryLayoutPreset;
    return preset?.id && preset.temporary ? preset : null;
  }

  function temporaryLayoutIsActive() {
    return Boolean(activeTemporaryLayoutPreset());
  }

  function persistentLayoutPresets(options = state.options) {
    return (Array.isArray(options?.layoutPresets) ? options.layoutPresets : []).filter((preset) => !preset?.temporary);
  }

  function persistentLayoutOptions(options = state.options) {
    const layoutPresets = persistentLayoutPresets(options);
    const activeLayoutPresetId = layoutPresets.some((preset) => preset.id === options?.activeLayoutPresetId)
      ? options.activeLayoutPresetId
      : layoutPresets[0]?.id || "default";
    return { ...options, layoutPresets, activeLayoutPresetId };
  }

  function validChatAppIds() {
    return new Set(allApps().map((app) => app.id));
  }

  function normalizeLayoutGroups(groups) {
    return normalizeWorkspaceLayoutGroups(groups, validChatAppIds());
  }

  function currentLayoutGroups({ includeTemporary = false } = {}) {
    const groups = includeTemporary
      ? state.groups || []
      : (state.groups || []).filter((group) => !group.temporary);
    return layoutGroupsFromWorkspace(groups, validChatAppIds());
  }

  function preferredLayoutGroupsForLocale() {
    const language = state.options?.language && state.options.language !== "system"
      ? state.options.language
      : navigator.language || "";
    const preferred = /^zh/i.test(language)
      ? [["Kimi"], ["DouBao"], ["Qwen"]]
      : [["ChatGPT"], ["Gemini"], ["Grok"]];
    const normalized = normalizeLayoutGroups(preferred);
    if (normalized.length) return normalized;
    return normalizeLayoutGroups(allApps().slice(0, 3).map((app) => [app.id]));
  }

  function layoutPresetGroups(preset) {
    return normalizeLayoutGroups(preset?.chatAppIdGroups);
  }

  function layoutPresetSummary(preset) {
    const groups = layoutPresetGroups(preset);
    if (!groups.length) return preset?.name || t("layout.empty");
    return groups
      .map((group) => group.map((id) => inferAppName(appById(id))).join(", "))
      .join(" / ");
  }

  function layoutShortcutLabel(index) {
    if (index < 0 || index > 8) return "";
    const label = formatShortcut("switchLayout", String(index + 1));
    return label === "Disabled" || label === "Unassigned" ? "" : label;
  }

  function shortcutLabel(action, digitLabel = "") {
    const label = formatShortcut(action, digitLabel);
    return label === "Disabled" || label === "Unassigned" ? "" : label;
  }

  function shortcutTooltip(label, action, digitLabel = "") {
    const shortcut = shortcutLabel(action, digitLabel);
    return shortcut ? `${label} (${shortcut})` : label;
  }

  async function saveLayoutOptions(nextOptions) {
    state.options = await saveOptions(normalizeOptions(persistentLayoutOptions(nextOptions)));
  }

  async function switchLayoutPreset(presetId) {
    if (activeTemporaryLayoutPreset()?.id === presetId) {
      closePopovers();
      return;
    }
    const preset = persistentLayoutPresets().find((item) => item.id === presetId);
    if (!preset) {
      closePopovers();
      notify(t("toast.layoutNotFound"), "error");
      return;
    }
    if (!temporaryLayoutIsActive() && preset.id === state.options.activeLayoutPresetId) {
      closePopovers();
      return;
    }
    state.temporaryLayoutPreset = null;
    await saveLayoutOptions({ ...state.options, activeLayoutPresetId: preset.id });
    hydrateGroups();
    closePopovers();
    render();
  }

  async function addLayoutPreset() {
    const chatAppIdGroups = preferredLayoutGroupsForLocale();
    if (!chatAppIdGroups.length) {
      closePopovers();
      notify(t("layout.noApps"), "error");
      return;
    }
    const layoutPresets = persistentLayoutPresets();
    const preset = {
      id: createLayoutId(),
      name: `Layout ${layoutPresets.length + 1}`,
      chatAppIdGroups
    };
    state.temporaryLayoutPreset = null;
    await saveLayoutOptions({
      ...state.options,
      layoutPresets: [...layoutPresets, preset],
      activeLayoutPresetId: preset.id
    });
    hydrateGroups();
    closePopovers();
    render();
  }

  async function deleteLayoutPreset(presetId) {
    if (activeTemporaryLayoutPreset()?.id === presetId) {
      state.temporaryLayoutPreset = null;
      hydrateGroups();
      closePopovers();
      render();
      return;
    }
    const layoutPresets = persistentLayoutPresets();
    if (layoutPresets.length <= 1) return;
    const remaining = layoutPresets.filter((preset) => preset.id !== presetId);
    const wasActive = state.options.activeLayoutPresetId === presetId;
    const activeLayoutPresetId = wasActive ? remaining[0]?.id : state.options.activeLayoutPresetId;
    await saveLayoutOptions({ ...state.options, layoutPresets: remaining, activeLayoutPresetId });
    closePopovers();
    if (wasActive && !temporaryLayoutIsActive()) {
      hydrateGroups();
      render();
    }
  }

  function hydrateGroups() {
    const preset = activePreset();
    const apps = allApps();
    const workspace = hydrateWorkspaceGroups({
      presetGroups: preset?.chatAppIdGroups,
      apps,
      createGroupId,
      createFrameId,
      fallbackGroups: [["ChatGPT"], ["Gemini"], ["Grok"]]
    });
    if (temporaryLayoutIsActive()) {
      for (const group of workspace.groups) {
        group.temporary = true;
        group.pocketBatchId = preset.pocketBatchId || "";
      }
    }
    state.groups = workspace.groups;
    state.activeTabs = workspace.activeTabs;
  }

  async function persistLayout() {
    const temporary = activeTemporaryLayoutPreset();
    if (temporary) {
      state.temporaryLayoutPreset = {
        ...temporary,
        chatAppIdGroups: currentLayoutGroups({ includeTemporary: true })
      };
      return;
    }
    const preset = activePreset();
    if (!preset) return;
    const chatAppIdGroups = currentLayoutGroups();
    const next = {
      ...state.options,
      layoutPresets: persistentLayoutPresets().map((item) => item.id === preset.id
        ? { ...item, chatAppIdGroups }
        : item)
    };
    state.options = await saveOptions(next);
  }

  async function addGroup(appId = allApps()[0]?.id) {
    if (!appId) return;
    const temporary = activeTemporaryLayoutPreset();
    const group = {
      id: createGroupId(),
      ...(temporary ? { temporary: true, pocketBatchId: temporary.pocketBatchId || "" } : {}),
      chatApps: [{ appId, instanceId: createFrameId() }]
    };
    state.groups.push(group);
    state.activeTabs[group.id] = group.chatApps[0].instanceId;
    await persistLayout();
    appendChatGroup(group);
  }

  function workspaceVisibleColumnCount() {
    return workspaceGridColumnCount(state.groups.length, state.options.colMaxCount);
  }

  function workspaceColumnTemplate() {
    const count = state.groups.length || 1;
    const visibleCount = Math.max(1, workspaceVisibleColumnCount());
    const basis = `max(280px, calc(100% / ${visibleCount}))`;
    return `repeat(${count}, minmax(${basis}, ${basis}))`;
  }

  function syncGridColumns() {
    const grid = document.querySelector(".main-grid");
    if (!grid) return;
    if (grid.classList.contains("fullscreen-grid")) {
      grid.style.gridTemplateColumns = "minmax(0, 1fr)";
      return;
    }
    grid.style.gridTemplateColumns = workspaceColumnTemplate();
  }

  function renderWorkspace() {
    const cols = workspaceGridColumnCount(state.groups.length, state.options.colMaxCount);
    return el("main", {
      class: `main-grid grid-cols-${cols}`,
      style: { gridTemplateColumns: workspaceColumnTemplate() }
    },
      state.groups.map((group, index) => renderChatGroup(group, index))
    );
  }

  function syncWorkspaceIsland(shell) {
    if (!shell?.isConnected) return renderWorkspace();
    const signature = workspaceSignature();
    if (workspaceNode?.isConnected && workspaceRenderSignature === signature) {
      syncWorkspaceDom();
      syncFullscreenLayout();
      return workspaceNode;
    }
    if (workspaceDomMatchesState()) {
      workspaceNode = workspaceNode?.isConnected ? workspaceNode : document.querySelector(".main-grid");
      workspaceRenderSignature = signature;
      syncGridColumnClass();
      syncFullscreenLayout();
      return workspaceNode;
    }
    const nextWorkspace = renderWorkspace();
    if (workspaceNode?.isConnected) workspaceNode.replaceWith(nextWorkspace);
    else shell.append(nextWorkspace);
    workspaceNode = nextWorkspace;
    workspaceRenderSignature = signature;
    syncWorkspaceDom();
    syncFullscreenLayout();
    return workspaceNode;
  }

  function syncGridColumnClass() {
    const grid = document.querySelector(".main-grid");
    if (!grid) return;
    grid.classList.remove("grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4");
    grid.classList.add(`grid-cols-${workspaceVisibleColumnCount()}`);
    syncGridColumns();
    syncWorkspaceDom();
  }

  function tabGroupButtonPlacement() {
    return normalizeTabGroupButtonPlacement(
      state.options?.tabGroupButtonPlacement,
      state.options?.tabGroupButtonsMode
    );
  }

  function orderedTabGroupButtons() {
    const itemById = new Map(TAB_GROUP_HEADER_BUTTONS.map((item) => [item.id, item]));
    return normalizeTabGroupButtonOrder(state.options?.tabGroupButtonOrder)
      .map((id) => itemById.get(id))
      .filter(Boolean);
  }

  function tabGroupButtonIsPinned(id) {
    return tabGroupButtonPlacement()[id] === "pinned";
  }

  function tabGroupButtonIsFolded(id) {
    return tabGroupButtonPlacement()[id] === "menu";
  }

  function syncTabGroupHeaderControls(card, group) {
    card.classList.add("tab-group-buttons-custom");
    card.classList.remove("tab-group-buttons-hidden", "tab-group-buttons-pinned");
    card.classList.toggle("frame-loading", activeFrameIsLoading(group));
    for (const item of TAB_GROUP_HEADER_BUTTONS) {
      card.dataset[`button${item.id.charAt(0).toUpperCase()}${item.id.slice(1)}`] = tabGroupButtonPlacement()[item.id] || "pinned";
    }
    const tabs = card.querySelector(".chat-tabs");
    const addButton = tabs?.querySelector(".tab-add");
    if (tabs && tabGroupButtonIsPinned("addApp") && !addButton) {
      tabs.append(renderTabAddButton(group));
    } else if (addButton && !tabGroupButtonIsPinned("addApp")) {
      addButton.remove();
    }
    const actions = card.querySelector(".chat-actions");
    if (actions) actions.replaceChildren(...renderChatActionButtons(group));
  }

  function syncWorkspaceDom() {
    state.groups.forEach((group, index) => {
      const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
      if (card) {
        card.style.order = String(index + 1);
        syncTabGroupHeaderControls(card, group);
      }
    });
    notifyWorkspaceFrameSync();
  }

  function appendChatGroup(group) {
    const grid = document.querySelector(".main-grid");
    if (!grid) {
      render();
      return;
    }
    grid.append(renderChatGroup(group, state.groups.findIndex((item) => item.id === group.id)));
    syncGridColumnClass();
    syncFullscreenLayout();
  }

  function currentFullscreenGroup() {
    if (!state.fullscreenGroupId) return null;
    const group = state.groups.find((item) => item.id === state.fullscreenGroupId);
    if (!group) state.fullscreenGroupId = null;
    return group || null;
  }

  function fullscreenShortcutLabel() {
    return shortcutLabel("enterFullscreen");
  }

  function iframeForWindow(sourceWindow) {
    if (!sourceWindow) return null;
    for (const iframe of document.querySelectorAll(".chat-frame")) {
      if (iframe.contentWindow === sourceWindow) return iframe;
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

  function currentGroupIndex(group) {
    return state.groups.findIndex((item) => item.id === group.id);
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

  async function syncFrameFavicon(sourceWindow) {
    const iframe = iframeForWindow(sourceWindow);
    if (!iframe) return;
    const instanceId = iframe.dataset.instanceId || "";
    if (!instanceId) return;
    const app = frameApp(iframe);
    let href = app.url;
    let logoUrl = "";
    try {
      const meta = await sendToIframe(iframe, "getPageMeta", {}, 1800);
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

  function suspendIframePointerEventsForDrag() {
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (!Object.prototype.hasOwnProperty.call(iframe.dataset, "dragPointerEvents")) {
        iframe.dataset.dragPointerEvents = iframe.style.pointerEvents || "";
      }
      iframe.style.pointerEvents = "none";
    });
  }

  function restoreIframePointerEventsForDrag() {
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (!Object.prototype.hasOwnProperty.call(iframe.dataset, "dragPointerEvents")) return;
      iframe.style.pointerEvents = iframe.dataset.dragPointerEvents || "";
      delete iframe.dataset.dragPointerEvents;
    });
  }

  function cleanupGroupDragState() {
    removeTabPointerDragListeners();
    removeGroupPointerDragListeners();
    restoreIframePointerEventsForDrag();
    document.body.classList.remove("tab-dragging");
    document.body.classList.remove("tab-gesture-active");
    document.querySelectorAll(".chat-card.drag-over").forEach((node) => node.classList.remove("drag-over"));
    document.querySelectorAll(".chat-card.group-dragging, .chat-card.group-drop-before, .chat-card.group-drop-after").forEach((node) => {
      node.classList.remove("group-dragging", "group-drop-before", "group-drop-after");
    });
    document.querySelectorAll(".chat-tabs.tab-drop-target").forEach((node) => node.classList.remove("tab-drop-target"));
    document.querySelectorAll(".tab.dragging, .tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("dragging", "drop-before", "drop-after");
    });
    activeTabDrag = null;
    activeTabPointerDrag = null;
    activeGroupPointerDrag = null;
  }

  function draggedGroupId(event) {
    return event.dataTransfer?.getData(DRAG_GROUP_MIME) || "";
  }

  function draggedTabId(event) {
    return event.dataTransfer?.getData(DRAG_TAB_MIME) || activeTabDrag?.instanceId || "";
  }

  function draggedTabGroupId(event) {
    return event.dataTransfer?.getData(DRAG_TAB_GROUP_MIME) || activeTabDrag?.groupId || "";
  }

  function startTabDrag(event, group, chat) {
    activeTabDrag = { groupId: group.id, instanceId: chat.instanceId };
    globalThis.getSelection?.()?.removeAllRanges?.();
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    event.currentTarget.classList.add("dragging");
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_TAB_MIME, chat.instanceId);
    event.dataTransfer.setData(DRAG_TAB_GROUP_MIME, group.id);
    event.dataTransfer.setData("text/plain", chat.instanceId);
  }

  function tabDropIndexFromPoint(event, group) {
    return tabDropIndexFromClientX(event.clientX, group);
  }

  function tabDropIndexFromClientX(clientX, group) {
    const tabs = Array.from(document.querySelectorAll(`.chat-card[data-group-id="${group.id}"] .tab`));
    if (!tabs.length) return 0;
    for (const [index, tab] of tabs.entries()) {
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return index;
    }
    return tabs.length;
  }

  function tabDropTargetFromClientX(clientX, group) {
    const tabs = Array.from(document.querySelectorAll(`.chat-card[data-group-id="${group.id}"] .tab`));
    if (!tabs.length) return { tab: null, insertIndex: 0, after: false };
    for (const [index, tab] of tabs.entries()) {
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { tab, insertIndex: index, after: false };
      if (clientX < rect.right) return { tab, insertIndex: index + 1, after: true };
    }
    return { tab: tabs[tabs.length - 1], insertIndex: tabs.length, after: true };
  }

  function previewTabDrop(event, group, targetTab = null) {
    const tabId = draggedTabId(event);
    if (!tabId || draggedTabGroupId(event) !== group.id) return false;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("drop-before", "drop-after");
    });
    const tabs = event.currentTarget.closest?.(".chat-tabs") || event.currentTarget;
    tabs?.classList?.add("tab-drop-target");
    if (targetTab) {
      const rect = targetTab.getBoundingClientRect();
      targetTab.classList.add(event.clientX > rect.left + rect.width / 2 ? "drop-after" : "drop-before");
    }
    return true;
  }

  async function moveTabByDrop(event, group, targetChat = null) {
    const tabId = draggedTabId(event);
    if (!tabId || draggedTabGroupId(event) !== group.id) return false;
    let insertIndex = targetChat
      ? group.chatApps.findIndex((item) => item.instanceId === targetChat.instanceId)
      : tabDropIndexFromPoint(event, group);
    if (insertIndex < 0) return false;
    if (targetChat) {
      const targetTab = event.currentTarget.closest?.(".tab") || event.currentTarget;
      const rect = targetTab.getBoundingClientRect();
      if (event.clientX > rect.left + rect.width / 2) insertIndex += 1;
    }
    return moveTabToIndex(group, tabId, insertIndex);
  }

  async function moveTabToIndex(group, tabId, insertIndex) {
    const result = moveTabWithinGroup(group, tabId, insertIndex);
    if (!result.moved) return false;
    if (result.noop) {
      cleanupGroupDragState();
      return true;
    }
    state.activeTabs[group.id] = result.moved.instanceId;
    cleanupGroupDragState();
    await persistLayout();
    syncGroupTabOrder(group);
    activateChatTab(group, result.moved.instanceId);
    return true;
  }

  function removeTabPointerDragListeners() {
    document.removeEventListener("pointermove", handleTabPointerMove, true);
    document.removeEventListener("pointerup", handleTabPointerUp, true);
    document.removeEventListener("pointercancel", cancelTabPointerDrag, true);
    removeTabNativeSelectionGuards();
  }

  function addTabNativeSelectionGuards() {
    document.addEventListener("selectstart", preventTabNativeSelection, true);
    document.addEventListener("dragstart", preventTabNativeSelection, true);
  }

  function removeTabNativeSelectionGuards() {
    document.removeEventListener("selectstart", preventTabNativeSelection, true);
    document.removeEventListener("dragstart", preventTabNativeSelection, true);
  }

  function preventTabNativeSelection(event) {
    if (!document.body.classList.contains("tab-gesture-active") && !document.body.classList.contains("tab-dragging")) return;
    event.preventDefault();
  }

  function startTabPointerDrag(event, group, chat) {
    if (event.button !== 0 || event.target?.closest?.(".tab-close")) return;
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    removeTabPointerDragListeners();
    addTabNativeSelectionGuards();
    document.body.classList.add("tab-gesture-active");
    if (group.chatApps.length <= 1) {
      if (state.groups.length > 1) startGroupPointerDrag(event, group, event.currentTarget);
      else {
        removeTabNativeSelectionGuards();
        document.body.classList.remove("tab-gesture-active");
      }
      return;
    }
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    activeTabPointerDrag = {
      group,
      instanceId: chat.instanceId,
      startX: event.clientX,
      startY: event.clientY,
      insertIndex: group.chatApps.findIndex((item) => item.instanceId === chat.instanceId),
      tab: event.currentTarget,
      started: false
    };
    document.addEventListener("pointermove", handleTabPointerMove, true);
    document.addEventListener("pointerup", handleTabPointerUp, true);
    document.addEventListener("pointercancel", cancelTabPointerDrag, true);
  }

  function beginTabPointerDrag(drag) {
    if (drag.started) return;
    drag.started = true;
    activeTabDrag = { groupId: drag.group.id, instanceId: drag.instanceId };
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    drag.tab.classList.add("dragging");
  }

  function updateTabPointerDropPreview(drag, clientX) {
    document.querySelectorAll(".tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("drop-before", "drop-after");
    });
    const tabs = document.querySelector(`.chat-card[data-group-id="${drag.group.id}"] .chat-tabs`);
    tabs?.classList?.add("tab-drop-target");
    const target = tabDropTargetFromClientX(clientX, drag.group);
    drag.insertIndex = target.insertIndex;
    if (target.tab && target.tab !== drag.tab) {
      target.tab.classList.add(target.after ? "drop-after" : "drop-before");
    }
  }

  function handleTabPointerMove(event) {
    const drag = activeTabPointerDrag;
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < TAB_DRAG_START_DISTANCE) return;
    event.preventDefault();
    beginTabPointerDrag(drag);
    updateTabPointerDropPreview(drag, event.clientX);
  }

  function handleTabPointerUp(event) {
    const drag = activeTabPointerDrag;
    removeTabPointerDragListeners();
    if (!drag) return;
    if (!drag.started) {
      activeTabPointerDrag = null;
      document.body.classList.remove("tab-gesture-active");
      return;
    }
    event.preventDefault();
    suppressTabClickInstanceId = drag.instanceId;
    setTimeout(() => {
      if (suppressTabClickInstanceId === drag.instanceId) suppressTabClickInstanceId = "";
    }, 0);
    moveTabToIndex(drag.group, drag.instanceId, drag.insertIndex ?? tabDropIndexFromClientX(event.clientX, drag.group))
      .catch((error) => {
        cleanupGroupDragState();
        console.warn("[ChatClub] Failed to reorder tab", error);
      });
  }

  function cancelTabPointerDrag() {
    removeTabPointerDragListeners();
    cleanupGroupDragState();
  }

  function removeGroupPointerDragListeners() {
    document.removeEventListener("pointermove", handleGroupPointerMove, true);
    document.removeEventListener("pointerup", handleGroupPointerUp, true);
    document.removeEventListener("pointercancel", cancelGroupPointerDrag, true);
    removeTabNativeSelectionGuards();
  }

  function startGroupPointerDrag(event, group, tab) {
    const index = currentGroupIndex(group);
    if (index < 0) {
      removeTabNativeSelectionGuards();
      document.body.classList.remove("tab-gesture-active");
      return;
    }
    tab?.setPointerCapture?.(event.pointerId);
    activeGroupPointerDrag = {
      group,
      startX: event.clientX,
      startY: event.clientY,
      insertIndex: index,
      tab,
      started: false
    };
    removeGroupPointerDragListeners();
    addTabNativeSelectionGuards();
    document.addEventListener("pointermove", handleGroupPointerMove, true);
    document.addEventListener("pointerup", handleGroupPointerUp, true);
    document.addEventListener("pointercancel", cancelGroupPointerDrag, true);
  }

  function beginGroupPointerDrag(drag) {
    if (drag.started) return;
    drag.started = true;
    activeTabDrag = null;
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    drag.tab?.classList?.add("dragging");
    document.querySelector(`.chat-card[data-group-id="${drag.group.id}"]`)?.classList.add("group-dragging");
  }

  function groupDropTargetFromClientX(clientX) {
    const cards = state.groups
      .map((group) => document.querySelector(`.chat-card[data-group-id="${group.id}"]`))
      .filter(Boolean);
    if (!cards.length) return { card: null, insertIndex: 0, after: false };
    for (const [index, card] of cards.entries()) {
      const rect = card.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { card, insertIndex: index, after: false };
      if (clientX < rect.right) return { card, insertIndex: index + 1, after: true };
    }
    return { card: cards[cards.length - 1], insertIndex: cards.length, after: true };
  }

  function updateGroupPointerDropPreview(drag, clientX) {
    document.querySelectorAll(".chat-card.group-drop-before, .chat-card.group-drop-after").forEach((node) => {
      node.classList.remove("group-drop-before", "group-drop-after");
    });
    const target = groupDropTargetFromClientX(clientX);
    drag.insertIndex = target.insertIndex;
    if (target.card && target.card.dataset.groupId !== drag.group.id) {
      target.card.classList.add(target.after ? "group-drop-after" : "group-drop-before");
    }
  }

  function handleGroupPointerMove(event) {
    const drag = activeGroupPointerDrag;
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < GROUP_DRAG_START_DISTANCE) return;
    event.preventDefault();
    beginGroupPointerDrag(drag);
    updateGroupPointerDropPreview(drag, event.clientX);
  }

  function handleGroupPointerUp(event) {
    const drag = activeGroupPointerDrag;
    removeGroupPointerDragListeners();
    if (!drag) return;
    if (!drag.started) {
      activeGroupPointerDrag = null;
      document.body.classList.remove("tab-gesture-active");
      return;
    }
    event.preventDefault();
    suppressTabClickInstanceId = drag.group.chatApps[0]?.instanceId || "";
    setTimeout(() => {
      if (suppressTabClickInstanceId === drag.group.chatApps[0]?.instanceId) suppressTabClickInstanceId = "";
    }, 0);
    moveGroupToIndex(drag.group, drag.insertIndex ?? groupDropTargetFromClientX(event.clientX).insertIndex)
      .catch((error) => {
        cleanupGroupDragState();
        console.warn("[ChatClub] Failed to reorder group", error);
      });
  }

  function cancelGroupPointerDrag() {
    removeGroupPointerDragListeners();
    cleanupGroupDragState();
  }

  async function moveGroupToIndex(group, insertIndex) {
    const result = moveGroupWithinWorkspace(state.groups, group.id, insertIndex);
    if (!result.moved) return false;
    if (result.noop) {
      cleanupGroupDragState();
      return true;
    }
    cleanupGroupDragState();
    await persistLayout();
    syncWorkspaceDom();
    return true;
  }

  async function moveGroupByDrop(event, targetIndex) {
    const fromGroupId = draggedGroupId(event);
    const targetCard = event.currentTarget.closest?.(".chat-card") || event.currentTarget;
    const rect = targetCard.getBoundingClientRect();
    const insertAfterTarget = event.clientX > rect.left + rect.width / 2;
    const result = moveDroppedGroupWithinWorkspace(state.groups, fromGroupId, targetIndex, insertAfterTarget);
    if (!result.changed) return false;
    cleanupGroupDragState();
    await persistLayout();
    syncWorkspaceDom();
    return true;
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

  function renderChatTab(group, chat) {
    const app = appById(chat.appId);
    const name = inferAppName(app);
    const active = state.activeTabs[group.id] || group.chatApps[0]?.instanceId;
    return el("div", {
      class: `tab ${chat.instanceId === active ? "active" : ""}`,
      role: "button",
      tabindex: "0",
      draggable: "false",
      title: name,
      dataset: { instanceId: chat.instanceId },
      onselectstart: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onmousedown: (event) => {
        if (event.target?.closest?.(".tab-close")) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onpointerdown: (event) => startTabPointerDrag(event, group, chat),
      onclick: (event) => {
        if (suppressTabClickInstanceId === chat.instanceId) {
          event.preventDefault();
          suppressTabClickInstanceId = "";
          return;
        }
        activateChatTab(group, chat.instanceId);
      },
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateChatTab(group, chat.instanceId);
        }
      }
    },
      el("img", {
        class: "tab-favicon",
        src: appFaviconUrl(app) || fallbackFaviconUrl(app),
        alt: "",
        draggable: "false",
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
        onerror: (event) => {
          const image = event.currentTarget;
          if (image.dataset.browserFallback !== "1") {
            const browserUrl = browserFaviconUrl(app.url);
            image.dataset.browserFallback = "1";
            if (browserUrl && image.src !== browserUrl) {
              image.src = browserUrl;
              return;
            }
          }
          if (image.dataset.fallback === "1") return;
          image.dataset.fallback = "1";
          image.src = fallbackFaviconUrl(app);
        }
      }),
      el("span", { class: "tab-label" }, name),
      el("button", {
        class: "tab-close compact-icon tooltip-trigger",
        type: "button",
        "aria-label": `${t("common.close")} ${name}`,
        "data-tooltip": shortcutTooltip(`${t("common.close")} ${name}`, "closeChat"),
        "data-tooltip-placement": "left",
        "data-tooltip-id": "workspace.tab.close",
        draggable: "false",
        onclick: async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await closeTab(group, chat);
        },
        onpointerdown: (event) => event.stopPropagation(),
        onkeydown: (event) => event.stopPropagation()
      }, svgIcon("x"))
    );
  }

  function renderChatFrame(group, chat) {
    const app = appById(chat.appId);
    const initialHref = openableTabUrl(chat.initialHref || "");
    if (initialHref) delete chat.initialHref;
    const dataset = { instanceId: chat.instanceId, appId: app.id };
    if (initialHref) dataset.currentHref = initialHref;
    const attrs = {
      class: `chat-frame ${chat.instanceId === (state.activeTabs[group.id] || group.chatApps[0]?.instanceId) ? "active" : ""}`,
      dataset,
      allow: chatFrameAllow(),
      referrerpolicy: "no-referrer",
      name: chatFrameName(app),
      onload: (event) => completeFrameLoading(event.currentTarget)
    };
    if (chatFrameNeedsSandbox(app)) attrs.sandbox = chatFrameSandbox(app);
    const iframe = el("iframe", attrs);
    setFrameSrcAfterPrepare(iframe, initialHref || app.url);
    return iframe;
  }

  function fullscreenButtonMeta(group) {
    const isFullscreen = state.fullscreenGroupId === group.id;
    const shortcut = fullscreenShortcutLabel();
    const fullscreenLabel = isFullscreen ? t("chat.exitFullscreen") : t("chat.fullscreen");
    const fullscreenTooltipLabel = !isFullscreen && shortcut ? `${fullscreenLabel} (${shortcut})` : fullscreenLabel;
    return { isFullscreen, fullscreenLabel, fullscreenTooltipLabel, icon: isFullscreen ? "minimize" : "maximize" };
  }

  function renderTabAddButton(group) {
    return compactIconButton(t("chat.addApp"), "plus", (event) => openAppPicker(event.currentTarget, { group }), "tab-add", t("chat.addApp"), "", "workspace.group.addApp");
  }

  function renderOpenInNewTabButton(group) {
    return compactIconButton(t("common.openInNewTab"), "external", () => openChatInNewTab(group), "", t("common.openInNewTab"), "left", "workspace.group.openInNewTab");
  }

  function renderCopyLinkButton(group) {
    return compactIconButton(t("common.copyLink"), "copy", () => copyActiveChatLink(group), "", t("common.copyLink"), "left", "workspace.group.copyLink");
  }

  function renderGoToUrlButton(group) {
    return compactIconButton(t("chat.goToUrl"), "link", () => openGoToUrlDialog(group), "", t("chat.goToUrl"), "left", "workspace.group.goToUrl");
  }

  function renderNewChatButton(group) {
    return compactIconButton(t("topbar.newChat"), "edit", () => startNewChatInActiveTab(group), "", shortcutTooltip(t("topbar.newChat"), "newChat"), "left", "workspace.group.newChat");
  }

  function applyRefreshPageLoadingState(button, loading) {
    button.classList.toggle("refresh-page-loading", loading);
    button.toggleAttribute("aria-busy", loading);
    return button;
  }

  function renderRefreshPageButton(group) {
    const loading = activeFrameIsLoading(group);
    return applyRefreshPageLoadingState(
      compactIconButton(t("chat.refreshPage"), "reload", () => refreshCurrentPage(activeChatForGroup(group)), loading ? "refresh-page-loading" : "", shortcutTooltip(t("chat.refreshPage"), "refreshPage"), "left", "workspace.group.refreshPage"),
      loading
    );
  }

  function renderRefreshPageMenuButton(group) {
    const button = menuButton(t("chat.refreshPage"), "reload", () => {
      refreshCurrentPage(activeChatForGroup(group));
      closePopovers();
    }, "secondary", false, shortcutTooltip(t("chat.refreshPage"), "refreshPage"), "left", "workspace.group.refreshPage");
    return applyRefreshPageLoadingState(button, activeFrameIsLoading(group));
  }

  function renderHomeButton(group) {
    return compactIconButton(t("chat.home"), "home", () => reloadChat(activeChatForGroup(group)), "", shortcutTooltip(t("chat.home"), "reloadChat"), "left", "workspace.group.reload");
  }

  function renderRemoveGroupButton(group) {
    const button = compactIconButton(t("chat.removeGroup"), "x", async () => {
      await removeChatGroup(group);
      closePopovers();
    }, "danger-action", shortcutTooltip(t("chat.removeGroup"), "closeChat"), "left", "workspace.group.remove");
    button.disabled = state.groups.length <= 1;
    return button;
  }

  function renderMessageNavigatorButton(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    const active = messageNavigatorFrameEnabled(iframe);
    const button = compactIconButton(t("chat.messageNavigator"), "navigator", () => toggleMessageNavigator(group), active ? "message-navigator-active" : "", shortcutTooltip(t("chat.messageNavigator"), "toggleMessageNavigator"), "left", "workspace.group.messageNavigator");
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !active && !messageNavigatorPayloadForFrame(iframe, "", { appId: chat?.appId || "" });
    return button;
  }

  function renderDeleteThreadButton(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    const button = compactIconButton(t("chat.deleteThreadInGroup"), "trash", () => deleteActiveThreadForGroup(group), "danger-action", t("chat.deleteThreadInGroup"), "left", "workspace.group.deleteThread");
    button.disabled = !topicDeleteCapabilityForFrame(iframe, { appId: chat?.appId || "" }).available;
    return button;
  }

  function renderChatActionButtons(group) {
    const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
    const buttonById = {
      openInNewTab: () => renderOpenInNewTabButton(group),
      copyLink: () => renderCopyLinkButton(group),
      goToUrl: () => renderGoToUrlButton(group),
      newChat: () => renderNewChatButton(group),
      refreshPage: () => renderRefreshPageButton(group),
      reload: () => renderHomeButton(group),
      messageNavigator: () => renderMessageNavigatorButton(group),
      deleteThread: () => renderDeleteThreadButton(group),
      fullscreen: () => compactIconButton(fullscreenLabel, fullscreenIcon, () => toggleFullscreen(group.id), "fullscreen-action", fullscreenTooltipLabel, "left", "workspace.group.fullscreen"),
      removeGroup: () => renderRemoveGroupButton(group)
    };
    return [
      ...orderedTabGroupButtons()
        .filter((item) => item.id !== "addApp" && tabGroupButtonIsPinned(item.id))
        .map((item) => buttonById[item.id]?.())
        .filter(Boolean),
      compactIconButton(t("chat.more"), "more", (event) => openChatMenu(event.currentTarget, group), "", t("chat.more"), "left", "workspace.group.more")
    ];
  }

  function renderChatGroup(group, index) {
    const isFullscreen = state.fullscreenGroupId === group.id;
    const frames = group.chatApps.map((chat) => renderChatFrame(group, chat));
    const isFrameLoading = activeFrameIsLoading(group);
    return el("section", {
      class: `chat-card tab-group-buttons-custom ${isFullscreen ? "fullscreen" : ""} ${isFrameLoading ? "frame-loading" : ""}`.trim(),
      dataset: { groupId: group.id },
      style: { order: String(index + 1) },
      ondragover: (event) => {
        if (!draggedGroupId(event) || draggedGroupId(event) === group.id) return;
        event.preventDefault();
        event.currentTarget.classList.add("drag-over");
      },
      ondragleave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove("drag-over");
      },
      ondrop: async (event) => {
        if (!draggedGroupId(event) || draggedGroupId(event) === group.id) return;
        event.preventDefault();
        await moveGroupByDrop(event, currentGroupIndex(group));
      }
    },
      el("div", { class: "chat-header" },
        el("div", {
          class: "chat-tabs",
          ondragover: (event) => previewTabDrop(event, group),
          ondragleave: (event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) cleanupGroupDragState();
          },
          ondrop: async (event) => {
            if (!draggedTabId(event)) return;
            event.preventDefault();
            event.stopPropagation();
            await moveTabByDrop(event, group);
          }
        },
          group.chatApps.map((chat) => renderChatTab(group, chat)),
          tabGroupButtonIsPinned("addApp") ? renderTabAddButton(group) : null
        ),
        el("div", { class: "chat-actions" }, renderChatActionButtons(group))
      ),
      el("div", { class: "chat-frame-wrap" },
        frames
      )
    );
  }

  function activeIframe(chat) {
    if (!chat?.instanceId) return null;
    return document.querySelector(`iframe[data-instance-id="${chat.instanceId}"]`);
  }

  function pocketEntryHref(entry = {}) {
    return openableTabUrl(entry.chatUrl || entry.url || entry.href || "");
  }

  function pocketNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pocketHost(value) {
    const href = openableTabUrl(value);
    if (!href) return "";
    try {
      return normalizeAppPickerHost(new URL(href).hostname);
    } catch {
      return "";
    }
  }

  function appMatchesPocketHost(app, host) {
    if (!host) return false;
    for (const key of appPickerHostKeys(app)) {
      if (key === host || host.endsWith(`.${key}`)) return true;
    }
    return false;
  }

  function appForPocketEntry(entry = {}) {
    const directId = String(entry.appId || "");
    const direct = directId ? appById(directId) : null;
    if (direct?.id === directId) return direct;
    const host = pocketHost(pocketEntryHref(entry));
    return allApps().find((app) => appMatchesPocketHost(app, host)) || null;
  }

  function chatLocationForInstance(instanceId) {
    if (!instanceId) return null;
    for (const group of state.groups || []) {
      const tabIndex = (group.chatApps || []).findIndex((chat) => chat.instanceId === instanceId);
      if (tabIndex >= 0) return { group, chat: group.chatApps[tabIndex], tabIndex };
    }
    return null;
  }

  function pocketFrameRecord(iframe) {
    if (!iframe) return null;
    const location = chatLocationForInstance(iframe.dataset.instanceId || "");
    return { iframe, group: location?.group || null, chat: location?.chat || null };
  }

  function frameMatchesPocketHost(iframe, host) {
    if (!host) return false;
    const app = frameApp(iframe);
    if (appMatchesPocketHost(app, host)) return true;
    return [
      iframe.dataset.currentHref,
      iframe.src,
      iframe.getAttribute("src")
    ].some((value) => pocketHost(value) === host);
  }

  function findPocketFrame(entry = {}) {
    const instanceId = String(entry.instanceId || "");
    if (instanceId) {
      const iframe = document.querySelector(`iframe[data-instance-id="${instanceId}"]`);
      if (iframe) return pocketFrameRecord(iframe);
    }
    const app = appForPocketEntry(entry);
    const frames = Array.from(document.querySelectorAll(".chat-frame"));
    if (app?.id) {
      const iframe = frames.find((frame) => frame.classList.contains("active") && frame.dataset.appId === app.id)
        || frames.find((frame) => frame.dataset.appId === app.id);
      if (iframe) return pocketFrameRecord(iframe);
    }
    const host = pocketHost(pocketEntryHref(entry));
    const iframe = frames.find((frame) => frameMatchesPocketHost(frame, host));
    return iframe ? pocketFrameRecord(iframe) : null;
  }

  function loadPocketEntryInFrame(entry = {}) {
    const href = pocketEntryHref(entry);
    if (!href) return false;
    const record = findPocketFrame(entry);
    if (!record?.iframe) return false;
    const instanceId = record.iframe.dataset.instanceId || "";
    if (record.group && instanceId) activateChatTab(record.group, instanceId);
    record.iframe.dataset.currentHref = href;
    return assignFrameSrc(record.iframe, href);
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
    return assignFrameSrc(iframe, href);
  }

  function reloadChat(chat) {
    const iframe = activeIframe(chat);
    const app = appById(chat?.appId);
    if (!iframe || !app?.url) return false;
    delete iframe.dataset.currentHref;
    delete iframe.dataset.currentThreadHref;
    delete iframe.dataset.currentTitle;
    return assignFrameSrc(iframe, app.url);
  }

  async function startNewChatInFrame(iframe, fallbackChat = null) {
    if (!(iframe instanceof HTMLIFrameElement)) return false;
    try {
      await sendToIframe(iframe, "newChatPreprocess", {}, 1500);
    } catch {}
    const app = frameApp(iframe) || appById(fallbackChat?.appId || iframe.dataset?.appId);
    if (!app?.url) return false;
    delete iframe.dataset.currentHref;
    delete iframe.dataset.currentThreadHref;
    delete iframe.dataset.currentTitle;
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
      onsubmit: submit,
      onkeydown: (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        close();
      }
    },
      field(t("chat.goToUrlField"), urlInput),
      el("div", { class: "settings-dialog-actions" }, cancelButton, submitButton)
    );
    dialog = modal(t("chat.goToUrl"), form, close, false, t("common.close"));
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

  function messageNavigatorFrameEnabled(iframe) {
    return iframe?.dataset.messageNavigatorEnabled === "1";
  }

  function clearMessageNavigatorMenuOutsideClose() {
    messageNavigatorMenuIframe = null;
    document.removeEventListener("pointerdown", closeMessageNavigatorMenuOnParentPointerDown, true);
    document.removeEventListener("keydown", closeMessageNavigatorMenuOnParentKeydown, true);
  }

  function messageNavigatorActionTarget(target) {
    return target instanceof Element
      ? target.closest("[data-tooltip-id='workspace.group.messageNavigator']")
      : null;
  }

  function armMessageNavigatorMenuOutsideClose(iframe) {
    clearMessageNavigatorMenuOutsideClose();
    if (!iframe) return;
    messageNavigatorMenuIframe = iframe;
    requestAnimationFrame(() => {
      if (messageNavigatorMenuIframe !== iframe) return;
      document.addEventListener("pointerdown", closeMessageNavigatorMenuOnParentPointerDown, true);
      document.addEventListener("keydown", closeMessageNavigatorMenuOnParentKeydown, true);
    });
  }

  function hideMessageNavigatorMenuForFrame(iframe) {
    if (!iframe?.contentWindow) return Promise.resolve(null);
    return sendToIframe(iframe, "hideMessageNavigatorMenu", {}, 2000, {
      source: MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE
    }).catch((error) => {
      console.warn("[ChatClub] Failed to hide message navigator menu", error);
      return null;
    });
  }

  function closeTrackedMessageNavigatorMenu() {
    const iframe = messageNavigatorMenuIframe;
    clearMessageNavigatorMenuOutsideClose();
    if (iframe?.isConnected && messageNavigatorFrameEnabled(iframe)) hideMessageNavigatorMenuForFrame(iframe);
  }

  function closeMessageNavigatorMenuOnParentPointerDown(event) {
    if (messageNavigatorActionTarget(event.target)) return;
    closeTrackedMessageNavigatorMenu();
  }

  function closeMessageNavigatorMenuOnParentKeydown(event) {
    if (event.key === "Escape") closeTrackedMessageNavigatorMenu();
  }

  function messageNavigatorPayloadForFrame(iframe, href = "", fallback = {}) {
    const appId = iframe?.dataset.appId || fallback.appId || "";
    const app = appById(appId) || {};
    const currentHref = openableTabUrl(href)
      || openableTabUrl(fallback.currentHref || fallback.href || fallback.url)
      || openableTabUrl(iframe?.dataset.currentHref)
      || openableTabUrl(iframe?.src || iframe?.getAttribute?.("src"))
      || openableTabUrl(app.url);
    const payload = {
      appId,
      appName: app.name || appId,
      currentHref
    };
    const config = findMessageNavigatorSiteConfig(state.options?.messageNavigatorSiteConfigs, payload);
    if (!config || config.enabled === false || knownNoConversationPage(config, payload)) return null;
    return {
      enabled: true,
      config,
      currentHref,
      options: {
        effectMode: state.options?.messageNavigatorEffectMode || "border",
        primaryColor: state.options?.primaryColor || "#1f7a5f"
      }
    };
  }

  function messageNavigatorTimeoutError(error) {
    return String(error?.message || error || "").includes("[PostMessage] Timeout waiting for response: setMessageNavigator");
  }

  function messageNavigatorFrameHrefHints(iframe, payload = {}) {
    const values = [
      payload.currentHref,
      payload.href,
      iframe?.dataset?.currentHref,
      iframe?.dataset?.currentThreadHref,
      iframe?.src,
      iframe?.getAttribute?.("src")
    ].map((item) => String(item || "").trim()).filter(Boolean);
    return Array.from(new Set(values));
  }

  async function ensureMessageNavigatorContentBridge(iframe, payload = {}) {
    const tabId = await currentExtensionTabId();
    if (!tabId) return null;
    try {
      return await runtimeRequest({
        source: "chatclub",
        action: "ensureContentBridge",
        tabId,
        hrefs: messageNavigatorFrameHrefHints(iframe, payload),
        hosts: payload.config?.hosts || []
      });
    } catch (error) {
      console.warn("[ChatClub] Failed to ensure message navigator bridge", error);
      return { error: error?.message || String(error) };
    }
  }

  async function setMessageNavigatorForFrame(iframe, enabled, payload = null) {
    const data = enabled ? payload : { enabled: false };
    try {
      return await sendToIframe(iframe, "setMessageNavigator", data, 6000, {
        source: MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE
      });
    } catch (error) {
      if (!messageNavigatorTimeoutError(error)) throw error;
      await ensureMessageNavigatorContentBridge(iframe, payload || {});
      return sendToIframe(iframe, "setMessageNavigator", data, 6000, {
        source: MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE
      });
    }
  }

  async function toggleMessageNavigator(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    if (!iframe) {
      notify(t("messageNavigator.noIframe"), "error");
      closePopovers();
      return;
    }
    if (messageNavigatorFrameEnabled(iframe)) {
      clearMessageNavigatorMenuOutsideClose();
      iframe.dataset.messageNavigatorEnabled = "0";
      iframe.dataset.messageNavigatorSiteId = "";
      try { await setMessageNavigatorForFrame(iframe, false); } catch {}
      syncWorkspaceDom();
      closePopovers();
      return;
    }
    const href = await activeHref(chat);
    const payload = messageNavigatorPayloadForFrame(iframe, href);
    if (!payload) {
      notify(t("messageNavigator.unsupported"), "error");
      closePopovers();
      return;
    }
    try {
      const result = await setMessageNavigatorForFrame(iframe, true, { ...payload, openMenu: true });
      iframe.dataset.messageNavigatorEnabled = "1";
      iframe.dataset.messageNavigatorSiteId = payload.config.id || "";
      syncWorkspaceDom();
      closePopovers();
      armMessageNavigatorMenuOutsideClose(iframe);
      if (result?.messageCount === 0) notify(t("messageNavigator.noMessages"), "info");
    } catch (error) {
      clearMessageNavigatorMenuOutsideClose();
      iframe.dataset.messageNavigatorEnabled = "0";
      iframe.dataset.messageNavigatorSiteId = "";
      syncWorkspaceDom();
      closePopovers();
      console.warn("[ChatClub] Message navigator failed", error);
      notify(t("messageNavigator.failed"), "error");
    }
  }

  async function toggleMessageNavigatorForShortcut(sourceWindow = null) {
    const groupId = activeShortcutGroupId(sourceWindow);
    const group = state.groups.find((item) => item.id === groupId) || state.groups[0];
    if (!group) {
      notify(t("messageNavigator.noIframe"), "error");
      return;
    }
    await toggleMessageNavigator(group);
  }

  async function reapplyMessageNavigatorForFrame(iframe) {
    if (!messageNavigatorFrameEnabled(iframe)) return;
    const payload = messageNavigatorPayloadForFrame(iframe);
    if (!payload) {
      iframe.dataset.messageNavigatorEnabled = "0";
      iframe.dataset.messageNavigatorSiteId = "";
      syncWorkspaceDom();
      return;
    }
    try {
      await setMessageNavigatorForFrame(iframe, true, payload);
      iframe.dataset.messageNavigatorSiteId = payload.config.id || "";
      syncWorkspaceDom();
    } catch (error) {
      console.warn("[ChatClub] Failed to reapply message navigator", error);
    }
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
      && (initialConfig.sourceMode === "custom" || initialConfig.userscriptOverride === true || initialConfig.builtIn === false)
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
      && (deleteSiteConfig.sourceMode === "custom" || deleteSiteConfig.userscriptOverride === true || deleteSiteConfig.builtIn === false)
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
      console.warn("[ChatClub] Delete thread failed", error);
      const reason = String(error?.message || "").trim();
      const message = t("toast.deleteThreadFailed", { count: 1, plural: "" });
      notify(reason ? `${message}: ${reason}` : message, "error");
    } finally {
      closePopovers();
    }
  }

  function pocketRestoreSources(entries = []) {
    const seen = new Set();
    return (entries || []).map((entry, index) => {
      const href = pocketEntryHref(entry);
      const app = appForPocketEntry(entry);
      if (!href || !app?.id) return null;
      const sourceId = String(entry.sourceId || entry.instanceId || `${app.id}\n${href}`);
      if (seen.has(sourceId)) return null;
      seen.add(sourceId);
      return {
        entry,
        href,
        app,
        sourceId,
        groupId: String(entry.groupId || ""),
        groupIndex: pocketNumber(entry.groupIndex, 0),
        tabIndex: pocketNumber(entry.tabIndex, index),
        index
      };
    }).filter(Boolean).sort((a, b) =>
      a.groupIndex - b.groupIndex
      || a.groupId.localeCompare(b.groupId)
      || a.tabIndex - b.tabIndex
      || a.index - b.index
    );
  }

  function pocketRestoreGroups(entries = []) {
    const groups = [];
    const byKey = new Map();
    for (const source of pocketRestoreSources(entries)) {
      const key = `${source.groupIndex}:${source.groupId}`;
      let group = byKey.get(key);
      if (!group) {
        group = { key, groupIndex: source.groupIndex, sources: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.sources.push(source);
    }
    return groups.sort((a, b) => a.groupIndex - b.groupIndex);
  }

  function activatePocketTemporaryLayout(restoreGroups = [], batchId = "") {
    const activeTabs = {};
    const groups = restoreGroups.map((restoreGroup) => {
      const group = { id: createGroupId(), temporary: true, pocketBatchId: batchId, chatApps: [] };
      for (const source of restoreGroup.sources) {
        const instanceId = createFrameId();
        group.chatApps.push({ appId: source.app.id, instanceId, initialHref: source.href });
      }
      return group;
    }).filter((group) => group.chatApps.length);
    if (!groups.length) return false;
    for (const group of groups) activeTabs[group.id] = group.chatApps[0]?.instanceId || "";
    state.temporaryLayoutPreset = {
      id: createLayoutId(),
      name: t("pocket.restoreBatch"),
      temporary: true,
      pocketBatchId: batchId,
      chatAppIdGroups: layoutGroupsFromWorkspace(groups, validChatAppIds())
    };
    state.fullscreenGroupId = null;
    state.groups = groups;
    state.activeTabs = activeTabs;
    render();
    return true;
  }

  async function restorePocketBatch(entries = []) {
    const restoreGroups = pocketRestoreGroups(entries);
    if (!restoreGroups.length) return false;
    const batchId = String(entries[0]?.batchId || "");
    return activatePocketTemporaryLayout(restoreGroups, batchId);
  }

  async function addAppToExistingGroup(group, appId) {
    const instanceId = createFrameId();
    const chat = { appId, instanceId };
    group.chatApps.push(chat);
    state.activeTabs[group.id] = instanceId;
    await persistLayout();
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const tabs = card?.querySelector(".chat-tabs");
    const frameWrap = card?.querySelector(".chat-frame-wrap");
    if (!tabs || !frameWrap) {
      render();
      return;
    }
    tabs.insertBefore(renderChatTab(group, chat), tabs.querySelector(".tab-add"));
    frameWrap.append(renderChatFrame(group, chat));
    activateChatTab(group, instanceId);
    notifyWorkspaceFrameSync();
  }

  function positionAppPicker(anchor, picker) {
    const rect = anchor.getBoundingClientRect();
    const width = window.innerWidth < 760
      ? Math.max(320, window.innerWidth - 16)
      : Math.min(1460, Math.max(720, window.innerWidth - 32));
    const left = Math.max(8, Math.min(rect.left - 28, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 88));
    picker.style.width = `${width}px`;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    picker.style.maxHeight = `${Math.max(180, window.innerHeight - top - 12)}px`;
  }

  async function selectAppFromPicker(event, app, onSelect) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = event?.currentTarget;
    if (target?.dataset?.selecting === "true") return;
    if (target?.dataset) target.dataset.selecting = "true";
    await onSelect(app);
  }

  function renderAppPickerItem(app, custom, onSelect) {
    const provider = appPickerProvider(app);
    return el("button", {
      class: "app-picker-item",
      type: "button",
      title: inferAppName(app),
      onpointerdown: (event) => selectAppFromPicker(event, app, onSelect),
      onclick: (event) => selectAppFromPicker(event, app, onSelect),
      onkeydown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        selectAppFromPicker(event, app, onSelect);
      }
    },
      renderAppPickerFavicon(app),
      el("span", { class: "app-picker-name" }, inferAppName(app)),
      !custom && provider ? el("span", { class: "app-picker-provider" }, provider) : null
    );
  }

  function openCustomAppEditorFromPicker(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = event?.currentTarget;
    if (target?.dataset?.opening === "true") return;
    if (target?.dataset) target.dataset.opening = "true";
    closePopovers();
    openCustomAppEditor?.();
  }

  function renderAppPickerHeading(section) {
    const title = el("h3", { class: "app-picker-heading" }, section.title);
    if (!section.custom || !openCustomAppEditor) return title;
    return el("div", { class: "app-picker-heading-row" },
      title,
      el("button", {
        class: "app-picker-add-button tooltip-trigger",
        type: "button",
        "aria-label": t("appPicker.addCustom"),
        "data-tooltip": t("appPicker.addCustom"),
        "data-tooltip-id": "appPicker.addCustom",
        onpointerdown: openCustomAppEditorFromPicker,
        onclick: openCustomAppEditorFromPicker
      },
        svgIcon("plus")
      )
    );
  }

  function renderAppPickerColumn(section, onSelect) {
    return el("section", { class: `app-picker-column app-picker-${section.id}` },
      renderAppPickerHeading(section),
      el("div", { class: "app-picker-list" },
        section.apps.map((app) => renderAppPickerItem(app, section.custom, onSelect))
      )
    );
  }

  function openAppPicker(anchor, options = {}) {
    if (!anchor) return;
    if (anchor.classList.contains("popover-anchor") && document.querySelector(".app-picker-popover")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor");
    const { group, mode } = options;
    const onSelect = async (app) => {
      closePopovers();
      if (mode === "group") await addGroup(app.id);
      else if (group) await addAppToExistingGroup(group, app.id);
    };
    const backdrop = el("div", {
      class: "popover-backdrop app-picker-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closePopovers();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closePopovers();
      }
    });
    const picker = el("div", {
      class: "popover-menu app-picker-popover",
      role: "menu",
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      el("div", { class: "app-picker-columns" },
        appPickerSections().map((section) => renderAppPickerColumn(section, onSelect))
      )
    );
    document.body.append(backdrop, picker);
    positionAppPicker(anchor, picker);
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopovers, true);
  }

  function layoutPresetIsActive(preset) {
    const temporary = activeTemporaryLayoutPreset();
    return temporary ? preset?.id === temporary.id : preset?.id === state.options.activeLayoutPresetId;
  }

  function renderLayoutPresetItem(preset, index) {
    const temporary = Boolean(preset?.temporary);
    const active = layoutPresetIsActive(preset);
    const shortcut = temporary ? "" : layoutShortcutLabel(index);
    return el("div", {
      class: `layout-preset-item${active ? " active" : ""}${temporary ? " temporary" : ""}`.trim(),
      role: "menuitem",
      tabindex: "0",
      title: layoutPresetSummary(preset),
      onpointerdown: (event) => {
        if (event.button !== 0 || event.target?.closest?.(".layout-preset-delete")) return;
        event.preventDefault();
        event.stopPropagation();
        if (temporary) {
          closePopovers();
          return;
        }
        switchLayoutPreset(preset.id).catch((error) => {
          console.warn("[ChatClub] Failed to switch layout", error);
        });
      },
      onclick: (event) => {
        if (event.target?.closest?.(".layout-preset-delete")) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onkeydown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (temporary) {
          closePopovers();
          return;
        }
        switchLayoutPreset(preset.id).catch((error) => {
          console.warn("[ChatClub] Failed to switch layout", error);
        });
      }
    },
      el("span", { class: "layout-preset-summary" }, layoutPresetSummary(preset)),
      shortcut ? el("span", { class: "layout-preset-shortcut" }, shortcut) : null,
      el("button", {
        class: "icon-button layout-preset-delete compact-icon tooltip-trigger",
        type: "button",
        "aria-label": t("layout.delete"),
        "data-tooltip": t("layout.delete"),
        "data-tooltip-id": "workspace.layout.delete",
        disabled: !temporary && persistentLayoutPresets().length <= 1,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteLayoutPreset(preset.id).catch((error) => {
            console.warn("[ChatClub] Failed to delete layout", error);
          });
        },
        onpointerdown: (event) => event.stopPropagation()
      }, svgIcon("x"))
    );
  }

  function openLayoutMenu(anchor) {
    if (!anchor) return;
    if (anchor.classList.contains("popover-anchor") && document.querySelector(".layout-popover")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor");
    const rect = anchor.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right - LAYOUT_POPOVER_RIGHT_EXTENSION);
    const top = Math.min(rect.bottom + 7, window.innerHeight - 8);
    const backdrop = el("div", {
      class: "popover-backdrop layout-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closePopovers();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closePopovers();
      }
    });
    const menu = el("div", {
      class: "popover-menu layout-popover",
      role: "menu",
      style: { top: `${top}px`, right: `${right}px` },
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      activeTemporaryLayoutPreset() ? [
        renderLayoutPresetItem(activeTemporaryLayoutPreset(), -1),
        el("div", { class: "menu-separator" })
      ] : null,
      persistentLayoutPresets().map((preset, index) => renderLayoutPresetItem(preset, index)),
      el("div", { class: "menu-separator" }),
      menuButton(t("layout.add"), "plus", () => {
        addLayoutPreset().catch((error) => {
          console.warn("[ChatClub] Failed to add layout", error);
        });
      }, "secondary", false, t("layout.add"), "", "workspace.layout.add")
    );
    document.body.append(backdrop, menu);
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopovers, true);
  }

  function closePopoverOnKeydown(event) {
    if (event.key === "Escape") closePopovers();
  }

  function closePopoverOnOutsideInteraction(event) {
    const menu = document.querySelector(".popover-menu");
    const anchor = document.querySelector(".popover-anchor");
    const target = event.target;
    if (menu?.contains(target) || anchor?.contains(target)) return;
    closePopovers();
  }

  function closePopovers() {
    document.querySelectorAll(".popover-menu, .popover-backdrop").forEach((node) => node.remove());
    document.querySelectorAll(".popover-anchor").forEach((node) => node.classList.remove("popover-anchor"));
    document.removeEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
    document.removeEventListener("focusin", closePopoverOnOutsideInteraction, true);
    document.removeEventListener("keydown", closePopoverOnKeydown, true);
    window.removeEventListener("resize", closePopovers, true);
    window.removeEventListener("scroll", closePopovers, true);
    window.removeEventListener("blur", closePopovers, true);
  }

  function openChatMenu(anchor, group) {
    if (anchor.classList.contains("popover-anchor") && document.querySelector(".popover-menu")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor");
    const rect = anchor.getBoundingClientRect();
    const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
    const activeChat = activeChatForGroup(group);
    const activeFrame = activeIframe(activeChat);
    const activeFallback = { appId: activeChat?.appId || "" };
    const messageNavigatorDisabled = !messageNavigatorFrameEnabled(activeFrame) && !messageNavigatorPayloadForFrame(activeFrame, "", activeFallback);
    const deleteThreadDisabled = !topicDeleteCapabilityForFrame(activeFrame, activeFallback).available;
    const menuButtonById = {
      addApp: () => menuButton(t("chat.addApp"), "plus", () => openAppPicker(anchor, { group }), "secondary", false, t("chat.addApp"), "", "workspace.group.addApp"),
      openInNewTab: () => menuButton(t("common.openInNewTab"), "external", () => openChatInNewTab(group), "secondary", false, t("common.openInNewTab"), "", "workspace.group.openInNewTab"),
      copyLink: () => menuButton(t("common.copyLink"), "copy", () => copyActiveChatLink(group), "secondary", false, t("common.copyLink"), "", "workspace.group.copyLink"),
      goToUrl: () => menuButton(t("chat.goToUrl"), "link", () => openGoToUrlDialog(group), "secondary", false, t("chat.goToUrl"), "", "workspace.group.goToUrl"),
      newChat: () => menuButton(t("topbar.newChat"), "edit", async () => {
        await startNewChatInActiveTab(group);
        closePopovers();
      }, "secondary", false, shortcutTooltip(t("topbar.newChat"), "newChat"), "left", "workspace.group.newChat"),
      refreshPage: () => renderRefreshPageMenuButton(group),
      reload: () => menuButton(t("chat.home"), "home", () => {
        reloadChat(activeChatForGroup(group));
        closePopovers();
      }, "secondary", false, shortcutTooltip(t("chat.home"), "reloadChat"), "left", "workspace.group.reload"),
      messageNavigator: () => menuButton(t("chat.messageNavigator"), "navigator", () => {
        toggleMessageNavigator(group);
      }, "secondary", messageNavigatorDisabled, shortcutTooltip(t("chat.messageNavigator"), "toggleMessageNavigator"), "left", "workspace.group.messageNavigator"),
      deleteThread: () => menuButton(t("chat.deleteThreadInGroup"), "trash", () => {
        deleteActiveThreadForGroup(group);
      }, "danger", deleteThreadDisabled, t("chat.deleteThreadInGroup"), "left", "workspace.group.deleteThread"),
      fullscreen: () => menuButton(fullscreenLabel, fullscreenIcon, () => {
        toggleFullscreen(group.id);
        closePopovers();
      }, "secondary", false, fullscreenTooltipLabel, "left", "workspace.group.fullscreen"),
      removeGroup: () => menuButton(t("chat.removeGroup"), "x", async () => {
        await removeChatGroup(group);
        closePopovers();
      }, "danger", state.groups.length <= 1, shortcutTooltip(t("chat.removeGroup"), "closeChat"), "left", "workspace.group.remove")
    };
    const foldedMenuButtons = orderedTabGroupButtons()
      .filter((item) => tabGroupButtonIsFolded(item.id))
      .map((item) => ({ item, node: menuButtonById[item.id]?.() }))
      .filter((entry) => entry.node);
    const foldedHeaderButtons = foldedMenuButtons
      .filter((entry) => !entry.item.danger)
      .map((entry) => entry.node);
    const foldedDangerButtons = foldedMenuButtons
      .filter((entry) => entry.item.danger)
      .map((entry) => entry.node);
    const backdrop = el("div", {
      class: "popover-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closePopovers();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closePopovers();
      }
    });
    const menu = el("div", {
      class: "popover-menu",
      role: "menu",
      style: { top: `${rect.bottom + 5}px`, right: `${Math.max(8, window.innerWidth - rect.right)}px` },
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      foldedHeaderButtons,
      foldedHeaderButtons.length && foldedDangerButtons.length ? el("div", { class: "menu-separator" }) : null,
      foldedDangerButtons
    );
    document.body.append(backdrop, menu);
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopovers, true);
  }

  return Object.freeze({
    renderWorkspace,
    syncWorkspaceIsland,
    syncWorkspaceDom,
    syncGridColumnClass,
    addGroup,
    closeTab,
    toggleFullscreen,
    toggleMessageNavigatorForShortcut,
    openChatMenu,
    openAppPicker,
    openLayoutMenu,
    reapplyMessageNavigatorForFrame,
    syncFullscreenLayout,
    activeShortcutGroupId,
    activeChatForGroup,
    activateChatTab,
    startNewChatInFrame,
    startNewChatInActiveTab,
    startNewChatForShortcut,
    refreshCurrentPage,
    reloadChat,
    loadPocketEntryInFrame,
    restorePocketBatch,
    iframeForWindow,
    groupIdForFrameWindow,
    syncFrameFavicon,
    rememberFrameLocation,
    frameDeleteThreadPayload,
    topicDeleteCapabilityForFrame,
    openableTabUrl,
    openTabUrl,
    hydrateGroups,
    switchLayoutPreset,
    closePopovers,
    currentFrames,
    frameApp,
    setFramePointerBlockedForOverlay,
    findFrameForSummarySource,
    highlightFrameForSummarySource,
    refreshCurrentExtensionTabInfo
  });
}
