import { APP_NAME } from "../shared/constants.js";
import { buildDynamicDnrRules, contentScriptMatches } from "../shared/dnr.js";
import { getAllChatApps } from "../shared/storage-schema.js";
import { loadCustomConfig, loadOptions, saveOptions } from "../shared/storage-adapter.js";
import { TOPIC_DELETE_SITE_CONFIGS, topicDeleteUserscriptLooksLikeBuiltIn } from "../shared/topic-delete-sites.js";
import { ALL_SHORTCUT_ACTIONS } from "../shared/shortcuts.js";
import {
  CUSTOM_SUMMARY_EXECUTOR,
  EXTENSION_RUNTIME_RELAY_SOURCE,
  GROK_COOKIE_BRIDGE_VERSION,
  SECURE_FRAME_COMMAND_SOURCE
} from "../shared/protocol.js";
import { configMatchesHref, normalizeHost } from "../shared/url-match.js";
import {
  chromiumExtensionPartitionKey,
  clearGrokTombstonesForStore,
  cookieStoreIdForTab,
  grokCookieChangeOwnedByBridge,
  isGrokSessionUrl,
  isPartitionedGrokTargetChange,
  isUnpartitionedGrokSourceChange,
  managedGrokPartitionKeys,
  releaseChangedGrokPartition,
  removeAllManagedGrokPartitions,
  removeManagedGrokPartitionsExcept,
  syncGrokSessionCookies
} from "./grok-cookie-bridge.js";

const chrome = globalThis.browser || globalThis.chrome;
if (!chrome) throw new Error("[ChatClub] Extension API namespace is unavailable");

const PRELOAD_SCRIPT_ID = "chatclub-preload";
const GROK_COOKIE_SCRIPT_ID = "chatclub-grok-cookie-bridge";
const SUMMARY_PAGE_SCRIPT_ID = "chatclub-summary-userscripts-main";
const SUMMARY_SCRIPT_ID = "chatclub-summary-userscripts";
const MESSAGE_NAVIGATOR_SCRIPT_ID = "chatclub-message-navigator";
const CONTENT_SCRIPT_ID = "chatclub-content";
const REGISTERED_CONTENT_SCRIPT_IDS = Object.freeze([
  PRELOAD_SCRIPT_ID,
  GROK_COOKIE_SCRIPT_ID,
  SUMMARY_PAGE_SCRIPT_ID,
  SUMMARY_SCRIPT_ID,
  MESSAGE_NAVIGATOR_SCRIPT_ID,
  CONTENT_SCRIPT_ID
]);
const REGISTERED_CONTENT_SCRIPT_ID_SET = new Set(REGISTERED_CONTENT_SCRIPT_IDS);
const CORE_CONTENT_SCRIPT_ID_SET = new Set([PRELOAD_SCRIPT_ID, GROK_COOKIE_SCRIPT_ID, CONTENT_SCRIPT_ID]);
const TOPIC_DELETE_USERSCRIPT_FILE_PATTERN = /^topic-delete-userscripts\/[a-z0-9-]+\.user\.js$/i;
const CUSTOM_SUMMARY_SOURCE_MAX_BYTES = 1024 * 1024;
const CUSTOM_SUMMARY_RESULT_MAX_BYTES = 2 * 1024 * 1024;
const customSummaryExecutionQueues = new Map();
const FRAME_CONTEXT_SESSION_KEY = "chatclubSecureFrameContexts";
const FRAME_CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;
const FRAME_CONTEXT_MAX_ENTRIES = 512;
const secureFrameContexts = new Map();
const secureFrameCommands = new Set([
  "getLocationHref",
  "getPageMeta",
  "getPageText",
  "getSummaryRuntimeState",
  "collectSummary",
  "deleteThread",
  "getDeleteConfirmState"
]);
const shortcutActions = new Set(ALL_SHORTCUT_ACTIONS);
let secureFrameContextsHydration = null;
let secureFrameContextsWriteChain = Promise.resolve();
let grokCookieBridgeChain = Promise.resolve();
const grokSourceChangeTimers = new Map();
const grokSourceChangedAuthNames = new Map();
const grokFramePreflights = new Map();
const grokFallbackReloadCounts = new Map();
const GROK_FRAME_PREFLIGHT_MAX_AGE_MS = 60 * 1000;
const CONTENT_BRIDGE_FILES = Object.freeze([
  Object.freeze({ file: "content/preload.js", world: "MAIN" }),
  Object.freeze({ file: "content/grok-cookie-bridge.js", world: "ISOLATED" }),
  Object.freeze({ file: "content/message-navigator.js", world: "ISOLATED" }),
  Object.freeze({ file: "content/content.js", world: "ISOLATED" })
]);
const SUMMARY_BRIDGE_FILES = Object.freeze([
  Object.freeze({ file: "content/summary-userscripts-main.js", world: "MAIN" }),
  Object.freeze({ file: "content/summary-userscripts.js", world: "ISOLATED" })
]);

function openableTabUrl(href) {
  try {
    const parsed = new URL(String(href || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function frameContextToken(value) {
  const token = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._:-]{8,191}$/i.test(token) ? token : "";
}

function pruneSecureFrameContexts(now = Date.now()) {
  for (const [token, context] of secureFrameContexts) {
    if (!context || now - Number(context.registeredAt || 0) > FRAME_CONTEXT_MAX_AGE_MS) {
      secureFrameContexts.delete(token);
    }
  }
  if (secureFrameContexts.size <= FRAME_CONTEXT_MAX_ENTRIES) return;
  const oldest = [...secureFrameContexts.entries()]
    .sort((a, b) => Number(a[1]?.registeredAt || 0) - Number(b[1]?.registeredAt || 0));
  for (const [token] of oldest.slice(0, secureFrameContexts.size - FRAME_CONTEXT_MAX_ENTRIES)) {
    secureFrameContexts.delete(token);
  }
}

function serializedSecureFrameContexts() {
  pruneSecureFrameContexts();
  return Object.fromEntries(secureFrameContexts);
}

function hydrateSecureFrameContexts() {
  if (secureFrameContextsHydration) return secureFrameContextsHydration;
  secureFrameContextsHydration = (async () => {
    try {
      const stored = await chrome.storage.session?.get?.(FRAME_CONTEXT_SESSION_KEY);
      const entries = stored?.[FRAME_CONTEXT_SESSION_KEY];
      if (entries && typeof entries === "object" && !Array.isArray(entries)) {
        for (const [rawToken, context] of Object.entries(entries)) {
          const token = frameContextToken(rawToken);
          if (!token || !context || typeof context !== "object") continue;
          secureFrameContexts.set(token, context);
        }
      }
    } catch (error) {
      console.warn(`[${APP_NAME}] secure frame registry could not be restored`, error);
    }
    pruneSecureFrameContexts();
  })();
  return secureFrameContextsHydration;
}

function persistSecureFrameContexts() {
  if (!chrome.storage.session?.set) return Promise.resolve();
  const value = serializedSecureFrameContexts();
  secureFrameContextsWriteChain = secureFrameContextsWriteChain
    .catch(() => {})
    .then(() => chrome.storage.session.set({ [FRAME_CONTEXT_SESSION_KEY]: value }))
    .catch((error) => console.warn(`[${APP_NAME}] secure frame registry could not be saved`, error));
  return secureFrameContextsWriteChain;
}

async function registerSecureFrameContext(message = {}, sender = {}) {
  const token = frameContextToken(message.bridgeDocumentId);
  const secureToken = /^[a-f0-9]{32,128}$/i.test(String(message.secureFrameToken || ""))
    ? String(message.secureFrameToken)
    : "";
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const senderUrl = String(sender?.url || "").trim();
  if (!token || !secureToken || !Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0 || !/^https?:\/\//i.test(senderUrl)) {
    throw new Error("Secure frame registration is invalid");
  }
  if (!String(sender?.tab?.url || "").startsWith(chrome.runtime.getURL(""))) {
    throw new Error("Secure frame registration requires a direct child of the ChatClub extension page");
  }
  const frame = await chrome.webNavigation.getFrame({ tabId, frameId });
  if (!frame || frame.parentFrameId !== 0 || String(frame.url || "") !== senderUrl) {
    throw new Error("Secure frame registration does not match a direct child document");
  }
  const senderDocumentId = String(sender?.documentId || "").trim();
  const navigationDocumentId = String(frame.documentId || "").trim();
  if (senderDocumentId && navigationDocumentId && senderDocumentId !== navigationDocumentId) {
    throw new Error("Secure frame registration document changed");
  }
  await hydrateSecureFrameContexts();
  for (const [existingToken, context] of secureFrameContexts) {
    if (context?.tabId === tabId && context?.frameId === frameId && existingToken !== token) {
      secureFrameContexts.delete(existingToken);
    }
  }
  const context = {
    tabId,
    frameId,
    documentId: senderDocumentId || navigationDocumentId,
    url: senderUrl,
    secureToken,
    bridgeVersion: String(message.bridgeVersion || ""),
    registeredAt: Date.now()
  };
  secureFrameContexts.set(token, context);
  pruneSecureFrameContexts();
  await persistSecureFrameContexts();
  return context;
}

async function secureFrameContext(token) {
  await hydrateSecureFrameContexts();
  pruneSecureFrameContexts();
  return secureFrameContexts.get(frameContextToken(token)) || null;
}

function extensionPageSender(sender = {}) {
  const extensionBase = chrome.runtime.getURL("");
  const senderUrl = String(sender?.url || "");
  return Boolean(extensionBase && senderUrl.startsWith(extensionBase));
}

function verifiedExtensionPageSender(sender = {}) {
  const tabId = sender?.tab?.id;
  const extensionBase = chrome.runtime.getURL("");
  if (
    !extensionPageSender(sender)
    || !Number.isInteger(tabId)
    || !String(sender?.tab?.url || "").startsWith(extensionBase)
  ) {
    throw new Error("Frame preparation requires the ChatClub extension page");
  }
  return tabId;
}

function grokFramePreflightId(value) {
  const id = String(value || "");
  return /^[a-z0-9][a-z0-9._:-]{15,191}$/i.test(id) ? id : "";
}

function pruneGrokFramePreflights(now = Date.now()) {
  for (const [id, preflight] of grokFramePreflights) {
    if (now - Number(preflight?.startedAt || 0) > GROK_FRAME_PREFLIGHT_MAX_AGE_MS) {
      grokFramePreflights.delete(id);
    }
  }
}

function registerGrokFramePreflight(message = {}, sender = {}) {
  if (!isGrokSessionUrl(message.url)) return "";
  const id = grokFramePreflightId(message.preflightId);
  if (!id) return "";
  const tabId = verifiedExtensionPageSender(sender);
  pruneGrokFramePreflights();
  grokFramePreflights.set(id, {
    tabId,
    url: String(message.url || ""),
    startedAt: Date.now(),
    fallbackMarked: false
  });
  return id;
}

function finishGrokFramePreflight(id) {
  if (id) grokFramePreflights.delete(id);
}

function markGrokFramePreflightFallback(message = {}, sender = {}) {
  const tabId = verifiedExtensionPageSender(sender);
  const id = grokFramePreflightId(message.preflightId);
  const preflight = id ? grokFramePreflights.get(id) : null;
  if (!preflight || preflight.tabId !== tabId || preflight.url !== String(message.url || "")) return false;
  if (!preflight.fallbackMarked) {
    preflight.fallbackMarked = true;
    grokFramePreflights.set(id, preflight);
    grokFallbackReloadCounts.set(tabId, Math.min(32, (grokFallbackReloadCounts.get(tabId) || 0) + 1));
  }
  return true;
}

function consumeGrokFallbackReload(tabId) {
  const count = grokFallbackReloadCounts.get(tabId) || 0;
  if (!count) return false;
  if (count === 1) grokFallbackReloadCounts.delete(tabId);
  else grokFallbackReloadCounts.set(tabId, count - 1);
  return true;
}

function queueGrokCookieBridge(task) {
  const run = grokCookieBridgeChain.catch(() => {}).then(task);
  grokCookieBridgeChain = run.catch(() => {});
  return run;
}

function publicGrokCookieBridgeResult(result = {}) {
  return {
    supported: result.supported === true,
    changed: result.changed === true,
    created: Math.max(0, Number(result.created) || 0),
    updated: Math.max(0, Number(result.updated) || 0),
    removed: Math.max(0, Number(result.removed) || 0),
    skipped: Math.max(0, Number(result.skipped) || 0)
  };
}

async function syncGrokCookiesAtPartition(storeId, partitionKey, options = {}) {
  const cleanup = options.authoritative
    ? await removeManagedGrokPartitionsExcept(chrome, { storeId, partitionKey })
    : { changed: false, removed: 0 };
  const synced = await syncGrokSessionCookies(chrome, { storeId, partitionKey });
  return publicGrokCookieBridgeResult({
    supported: true,
    changed: cleanup.changed || synced.changed,
    created: synced.created,
    updated: synced.updated,
    removed: Number(cleanup.removed || 0) + Number(synced.removed || 0),
    skipped: synced.skipped
  });
}

async function prepareGrokSessionCookies(url, sender = {}) {
  const tabId = verifiedExtensionPageSender(sender);
  if (!isGrokSessionUrl(url)) return publicGrokCookieBridgeResult();
  const partitionKey = chromiumExtensionPartitionKey(chrome.runtime);
  if (!partitionKey || !chrome.cookies?.get || !chrome.cookies?.set) return publicGrokCookieBridgeResult();
  const storeId = await cookieStoreIdForTab(chrome, tabId);
  return queueGrokCookieBridge(async () => {
    try {
      return await syncGrokCookiesAtPartition(storeId, partitionKey);
    } catch {
      try {
        return await syncGrokCookiesAtPartition(storeId, { topLevelSite: partitionKey.topLevelSite });
      } catch {
        return publicGrokCookieBridgeResult();
      }
    }
  });
}

async function verifiedGrokFrameSender(sender = {}) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const senderUrl = String(sender?.url || "");
  const extensionBase = chrome.runtime.getURL("");
  if (
    (sender?.id && sender.id !== chrome.runtime.id)
    || !Number.isInteger(tabId)
    || !Number.isInteger(frameId)
    || frameId <= 0
    || !isGrokSessionUrl(senderUrl)
    || !String(sender?.tab?.url || "").startsWith(extensionBase)
  ) {
    throw new Error("Grok Cookie bridge sender is invalid");
  }
  const frame = await chrome.webNavigation.getFrame({ tabId, frameId });
  if (!frame || frame.parentFrameId !== 0 || String(frame.url || "") !== senderUrl) {
    throw new Error("Grok Cookie bridge frame changed");
  }
  const senderDocumentId = String(sender?.documentId || "");
  const frameDocumentId = String(frame.documentId || "");
  if (senderDocumentId && frameDocumentId && senderDocumentId !== frameDocumentId) {
    throw new Error("Grok Cookie bridge document changed");
  }
  return { tabId, frameId, documentId: senderDocumentId || frameDocumentId };
}

async function syncGrokSessionCookiesForFrame(sender = {}) {
  const frame = await verifiedGrokFrameSender(sender);
  if (typeof chrome.cookies?.getPartitionKey !== "function") {
    return queueGrokCookieBridge(() => publicGrokCookieBridgeResult());
  }
  const partitionKey = await chrome.cookies.getPartitionKey({
    tabId: frame.tabId,
    frameId: frame.frameId,
    ...(frame.documentId ? { documentId: frame.documentId } : {})
  });
  const storeId = await cookieStoreIdForTab(chrome, frame.tabId);
  return queueGrokCookieBridge(() => syncGrokCookiesAtPartition(storeId, partitionKey, { authoritative: true }));
}

function scheduleGrokSourceCookieSync(changeInfo = {}) {
  const storeId = String(changeInfo.cookie?.storeId || "");
  const timerKey = storeId || "default";
  const changedAuthNames = grokSourceChangedAuthNames.get(timerKey) || new Set();
  if (!changeInfo.removed && (changeInfo.cookie?.name === "sso" || changeInfo.cookie?.name === "sso-rw")) {
    changedAuthNames.add(changeInfo.cookie.name);
  }
  grokSourceChangedAuthNames.set(timerKey, changedAuthNames);
  const previous = grokSourceChangeTimers.get(timerKey);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    grokSourceChangeTimers.delete(timerKey);
    grokSourceChangedAuthNames.delete(timerKey);
    queueGrokCookieBridge(async () => {
      await clearGrokTombstonesForStore(chrome, storeId, [...changedAuthNames]);
      const candidates = await managedGrokPartitionKeys(chrome, storeId);
      const seen = new Set();
      for (const partitionKey of candidates) {
        const id = JSON.stringify(partitionKey);
        if (seen.has(id)) continue;
        seen.add(id);
        try { await syncGrokCookiesAtPartition(storeId, partitionKey); } catch {}
      }
    }).catch(() => {});
  }, 220);
  grokSourceChangeTimers.set(timerKey, timer);
}

chrome.cookies?.onChanged?.addListener((changeInfo) => {
  if (isUnpartitionedGrokSourceChange(changeInfo)) {
    scheduleGrokSourceCookieSync(changeInfo);
    return;
  }
  if (!isPartitionedGrokTargetChange(changeInfo) || grokCookieChangeOwnedByBridge(changeInfo)) return;
  queueGrokCookieBridge(() => releaseChangedGrokPartition(chrome, changeInfo)).catch(() => {});
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  grokFallbackReloadCounts.delete(tabId);
  for (const [id, preflight] of grokFramePreflights) {
    if (preflight.tabId === tabId) grokFramePreflights.delete(id);
  }
});

async function verifiedExtensionTabId(message = {}, sender = {}) {
  if (!extensionPageSender(sender)) throw new Error("Secure frame commands require an extension page sender");
  const requested = Number(message.appTabId);
  if (!Number.isInteger(requested)) throw new Error("Secure frame command tab is unavailable");
  if (Number.isInteger(sender?.tab?.id) && sender.tab.id !== requested) {
    throw new Error("Secure frame command tab does not match the sender");
  }
  if (!Number.isInteger(sender?.tab?.id)) {
    const tab = await chrome.tabs.get(requested);
    if (!String(tab?.url || "").startsWith(chrome.runtime.getURL(""))) {
      throw new Error("Secure frame command tab is not an extension page");
    }
  }
  return requested;
}

async function sendMessageToRegisteredFrame(context, message) {
  const options = context.documentId
    ? { documentId: context.documentId }
    : { frameId: context.frameId };
  try {
    return await chrome.tabs.sendMessage(context.tabId, message, options);
  } catch (error) {
    if (!context.documentId || !/documentId|unexpected property|invalid value/i.test(error?.message || String(error))) throw error;
    return chrome.tabs.sendMessage(context.tabId, message, { frameId: context.frameId });
  }
}

async function sendSecureFrameCommand(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId(message, sender);
  const context = await secureFrameContext(message.bridgeDocumentId);
  if (!context || context.tabId !== tabId) throw new Error("Secure frame document is not registered in this tab");
  const command = String(message.command || "");
  if (!secureFrameCommands.has(command)) throw new Error(`Secure frame command is not allowed: ${command}`);
  const timeoutMs = Math.max(250, Math.min(60000, Number(message.timeoutMs) || 5000));
  const response = await timeoutPromise(
    sendMessageToRegisteredFrame(context, {
      source: SECURE_FRAME_COMMAND_SOURCE,
      type: "request",
      bridgeDocumentId: frameContextToken(message.bridgeDocumentId),
      secureFrameToken: context.secureToken,
      action: command,
      data: message.data || {}
    }),
    timeoutMs,
    `[FrameRPC] Timeout waiting for response: ${command}`
  );
  if (!response?.success) throw new Error(response?.error || `Secure frame command failed: ${command}`);
  context.registeredAt = Date.now();
  secureFrameContexts.set(frameContextToken(message.bridgeDocumentId), context);
  persistSecureFrameContexts();
  return response.data;
}

async function verifySecureFrameContext(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId(message, sender);
  const token = frameContextToken(message.bridgeDocumentId);
  const context = await secureFrameContext(token);
  if (!context || context.tabId !== tabId) throw new Error("Secure frame document is not registered in this tab");
  const response = await timeoutPromise(
    sendMessageToRegisteredFrame(context, {
      source: SECURE_FRAME_COMMAND_SOURCE,
      type: "request",
      bridgeDocumentId: token,
      secureFrameToken: context.secureToken,
      action: "getPageMeta",
      data: {}
    }),
    1800,
    "[FrameRPC] Content registration verification timed out"
  );
  if (!response?.success || !response.data || typeof response.data !== "object") {
    throw new Error(response?.error || "Secure frame document is no longer active");
  }
  return {
    href: String(response.data.href || context.url || ""),
    title: String(response.data.title || ""),
    bridgeVersion: String(context.bridgeVersion || "")
  };
}

async function registeredSenderContext(message = {}, sender = {}) {
  const token = frameContextToken(message.bridgeDocumentId);
  const context = await secureFrameContext(token);
  if (!context || context.tabId !== sender?.tab?.id || context.frameId !== sender?.frameId) {
    throw new Error("Runtime relay sender is not the registered frame document");
  }
  if (context.documentId && sender?.documentId && context.documentId !== sender.documentId) {
    throw new Error("Runtime relay sender document changed");
  }
  return { token, context };
}

async function relayShortcutTriggered(message = {}, sender = {}) {
  const action = String(message.shortcutAction || "");
  const { token, context } = await registeredSenderContext(message, sender);
  if (!shortcutActions.has(action)) throw new Error(`Unknown shortcut action: ${action}`);
  const digit = /^([1-9])$/.exec(String(message.matchObj?.digit || ""))?.[1];
  await chrome.runtime.sendMessage({
    source: EXTENSION_RUNTIME_RELAY_SOURCE,
    action: "shortcutTriggered",
    shortcutAction: action,
    matchObj: digit ? { digit } : {},
    senderContext: {
      tabId: context.tabId,
      frameId: context.frameId,
      documentId: context.documentId,
      bridgeDocumentId: token,
      url: context.url
    }
  });
}

async function relayFrameLifecycle(message = {}, sender = {}) {
  const action = String(message.lifecycleAction || "");
  if (!new Set(["locationChanged", "contentUnloading"]).has(action)) {
    throw new Error(`Unknown frame lifecycle action: ${action}`);
  }
  const { token, context } = await registeredSenderContext(message, sender);
  const data = message.data && typeof message.data === "object" ? message.data : {};
  if (action === "locationChanged" && /^https?:\/\//i.test(String(data.href || ""))) {
    context.url = String(data.href);
    context.registeredAt = Date.now();
    secureFrameContexts.set(token, context);
    persistSecureFrameContexts();
  }
  await chrome.runtime.sendMessage({
    source: EXTENSION_RUNTIME_RELAY_SOURCE,
    action: "frameLifecycle",
    lifecycleAction: action,
    senderContext: {
      tabId: context.tabId,
      frameId: context.frameId,
      documentId: context.documentId,
      bridgeDocumentId: token,
      url: context.url
    },
    data: {
      ...data,
      documentId: token,
      bridgeVersion: context.bridgeVersion
    }
  });
}

function normalizeOpenerTab(tab) {
  if (!tab || typeof tab.id !== "number") return null;
  return {
    id: tab.id,
    windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    index: typeof tab.index === "number" ? tab.index : undefined
  };
}

async function resolveExplicitTab(openerTab) {
  const info = normalizeOpenerTab(openerTab);
  if (!info) return null;
  try {
    return await chrome.tabs.get(info.id);
  } catch {
    return info;
  }
}

async function resolveTargetTab(sender, openerTab) {
  const explicitTab = await resolveExplicitTab(openerTab);
  if (explicitTab?.id) return explicitTab;
  if (sender?.tab?.id) return sender.tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] || null;
  } catch {
    return null;
  }
}

function openTabCreateOptions(url, targetTab) {
  const createOptions = { url, active: true };
  if (targetTab?.windowId) {
    createOptions.windowId = targetTab.windowId;
    if (typeof targetTab.index === "number") createOptions.index = targetTab.index + 1;
    if (typeof targetTab.id === "number") createOptions.openerTabId = targetTab.id;
  }
  return createOptions;
}

async function focusCreatedTab(tab) {
  if (tab?.id) {
    try { await chrome.tabs.update(tab.id, { active: true }); } catch {}
  }
  if (tab?.windowId && chrome.windows?.update) {
    try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
  }
}

async function openExternalTab(url, sender, openerTab) {
  const targetTab = await resolveTargetTab(sender, openerTab);
  try {
    const tab = await chrome.tabs.create(openTabCreateOptions(url, targetTab));
    await focusCreatedTab(tab);
    return tab;
  } catch {}
  if (targetTab?.id) {
    try {
      const duplicate = await chrome.tabs.duplicate(targetTab.id);
      if (duplicate?.id) {
        await chrome.tabs.update(duplicate.id, { url, active: true });
        await focusCreatedTab(duplicate);
        return duplicate;
      }
    } catch {}
  }
  const tab = await chrome.tabs.create({ url, active: true });
  await focusCreatedTab(tab);
  return tab;
}

function senderFrameTarget(sender, { requireDocumentId = false } = {}) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const documentId = String(sender?.documentId || "").trim();
  if (typeof tabId !== "number") throw new Error("Cannot inject userscript: sender tab is unavailable");
  if (documentId) return { tabId, documentIds: [documentId] };
  if (requireDocumentId) throw new Error("Cannot inject custom userscript: sender document id is unavailable");
  if (typeof frameId !== "number") throw new Error("Cannot inject userscript: sender frame is unavailable");
  return { tabId, frameIds: [frameId] };
}

function safeTopicDeleteUserscriptFile(file) {
  const value = String(file || "").trim();
  return TOPIC_DELETE_USERSCRIPT_FILE_PATTERN.test(value) ? value : "";
}

function canUsePackagedTopicDeleteUserscript(config = {}) {
  const builtIn = packagedTopicDeleteBuiltInConfig(config);
  if (!builtIn) return false;
  const source = String(config.customUserscript || config.userscript || "").trim();
  if (config?.sourceMode === "custom") return false;
  return config?.builtIn !== false
    && Boolean(safeTopicDeleteUserscriptFile(config.userscriptFile))
    && (config?.userscriptOverride !== true
      || !source
      || topicDeleteUserscriptLooksLikeBuiltIn(builtIn.id, source, builtIn.userscript, { allowSemantic: true }));
}

function packagedTopicDeleteBuiltInConfig(config = {}) {
  const id = String(config.id || "").trim();
  const file = safeTopicDeleteUserscriptFile(config.userscriptFile);
  if (!file) return null;
  return TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === id || item.userscriptFile === file) || null;
}

async function executePackagedTopicDeleteUserscript(target, file) {
  await chrome.scripting.executeScript({
    target,
    files: [file],
    world: "MAIN"
  });
}

function userScriptsUnavailableMessage(error) {
  const message = error?.message || String(error || "");
  const suffix = message ? ` (${message})` : "";
  return `Edited or custom standalone Delete Site userscripts require granted User Scripts access and userScripts.execute (Chrome/Arc 135+ or Firefox Nightly 153+). Chrome 135–137 also requires Developer Mode; Chrome 138+ requires Allow User Scripts. Older Zen builds can use Tampermonkey/Violentmonkey instead.${suffix}`;
}

async function executeUserTopicDeleteUserscript(target, source) {
  if (!chrome.userScripts?.execute) throw new Error(userScriptsUnavailableMessage());
  try {
    await chrome.userScripts.execute({
      target,
      js: [{ code: source }],
      world: "MAIN",
      injectImmediately: true
    });
  } catch (error) {
    const message = error?.message || String(error);
    if (/\bworld\b|unexpected property/i.test(message)) {
      try {
        await chrome.userScripts.execute({
          target,
          js: [{ code: source }],
          injectImmediately: true
        });
        return;
      } catch (retryError) {
        throw new Error(userScriptsUnavailableMessage(retryError));
      }
    }
    throw new Error(userScriptsUnavailableMessage(error));
  }
}

function customSummarySource(config = {}) {
  const customMode = config.sourceMode === "custom" || config.userscriptOverride === true || config.builtIn === false;
  return String(config.customUserscript || (customMode ? config.userscript : "") || "").trim();
}

async function storedCustomSummaryConfig(configId, sender = {}) {
  const id = String(configId || "").trim();
  const senderUrl = String(sender?.url || "").trim();
  if (!id) throw new Error("Custom Summary config id is unavailable");
  if (!senderUrl) throw new Error("Custom Summary sender URL is unavailable");
  const options = await loadOptions();
  const config = (options.summarySiteConfigs || []).find((item) => item?.id === id && item.enabled !== false);
  if (!config) throw new Error(`Custom Summary config is unavailable: ${id}`);
  if (!configMatchesHref(config, senderUrl)) throw new Error("Custom Summary config does not match the sender document");
  const userscript = customSummarySource(config);
  if (!userscript) throw new Error("Custom Summary userscript source is empty");
  const runtimeConfig = { ...config };
  delete runtimeConfig.userscript;
  delete runtimeConfig.customUserscript;
  return { runtimeConfig, userscript };
}

function topicDeleteUserscriptSource(config = {}) {
  const customMode = config.sourceMode === "custom" || config.userscriptOverride === true || config.builtIn === false;
  return String(config.customUserscript || (customMode ? config.userscript : "") || "").trim();
}

async function storedTopicDeleteConfig(configId, sender = {}) {
  const id = String(configId || "").trim();
  const senderUrl = String(sender?.url || "").trim();
  if (!id) throw new Error("Delete Site config id is unavailable");
  if (!senderUrl) throw new Error("Delete Site sender URL is unavailable");
  const options = await loadOptions();
  const config = (options.topicDeleteSiteConfigs || []).find((item) => item?.id === id && item.enabled !== false);
  if (!config) throw new Error(`Delete Site config is unavailable: ${id}`);
  let matchesSender = configMatchesHref(config, senderUrl);
  if (!matchesSender && Array.isArray(config.appIds) && config.appIds.length) {
    const wantedApps = new Set(config.appIds.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
    const appHosts = [];
    for (const app of await currentChatApps()) {
      const keys = [app?.id, app?.name].map((value) => String(value || "").trim().toLowerCase());
      if (!keys.some((key) => wantedApps.has(key))) continue;
      try { appHosts.push(new URL(String(app.url || "")).hostname); } catch {}
      appHosts.push(...(Array.isArray(app.hosts) ? app.hosts : []));
    }
    matchesSender = configMatchesHref({ ...config, hosts: [...(config.hosts || []), ...appHosts] }, senderUrl);
  }
  if (!matchesSender) throw new Error("Delete Site config does not match the sender document");
  return config;
}

function topicDeleteUserscriptMetadata(config = {}, source = "") {
  const version = String(source).match(/^\s*\/\/\s*@version\s+(.+?)\s*$/m)?.[1]?.trim() || "";
  return {
    scriptId: String(config.scriptId || config.id || ""),
    userscriptVersion: version,
    supportsVersionedRequest: source.includes("VERSIONED_REQUEST_EVENT") && /request:\s*[\"']|request:\s*\"\s*\+\s*VERSION/.test(source),
    supportsVersionedMenuCommand: source.includes("VERSIONED_MENU_COMMAND_EVENT") && /menu-command:\s*[\"']|menu-command:\s*\"\s*\+\s*VERSION/.test(source),
    supportsMenuCommand: source.includes("MENU_COMMAND_EVENT")
      || source.includes("chatclub:delete-site:menu-command")
      || /\bmenuCommand\b/.test(source)
  };
}

function injectionResultForTarget(results, target) {
  if (!Array.isArray(results)) return null;
  const documentId = target.documentIds?.[0];
  const frameId = target.frameIds?.[0];
  if (documentId) return results.find((item) => item?.documentId === documentId) || null;
  if (Number.isInteger(frameId)) return results.find((item) => item?.frameId === frameId) || null;
  return null;
}

async function ensureCustomSummaryRuntime(target) {
  const probeResults = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    func: (key) => typeof globalThis[key] === "function",
    args: [CUSTOM_SUMMARY_EXECUTOR]
  });
  const probe = injectionResultForTarget(probeResults, target);
  if (probe?.result === true) return;
  await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    files: ["content/summary-userscripts-main.js"]
  });
}

function customSummaryQueueKey(target) {
  return `${target.tabId}:${target.documentIds?.[0] || `frame-${target.frameIds?.[0] ?? "unknown"}`}`;
}

function queueCustomSummaryExecution(target, task) {
  const key = customSummaryQueueKey(target);
  if (customSummaryExecutionQueues.has(key)) {
    throw new Error("A custom userscript is already running in this document; reload the page if it no longer responds.");
  }
  const run = Promise.resolve().then(task);
  const tail = run.catch(() => {});
  customSummaryExecutionQueues.set(key, tail);
  tail.finally(() => {
    if (customSummaryExecutionQueues.get(key) === tail) customSummaryExecutionQueues.delete(key);
  });
  return run;
}

function timeoutPromise(promise, timeoutMs, message, onTimeout = null) {
  let timer = 0;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { onTimeout?.(); } catch {}
        reject(new Error(message));
      }, timeoutMs);
    })
  ]);
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

async function executeCustomSummaryUserscript(configId = "", sender = {}) {
  const target = senderFrameTarget(sender, { requireDocumentId: true });
  const { runtimeConfig, userscript } = await storedCustomSummaryConfig(configId, sender);
  if (utf8ByteLength(userscript) > CUSTOM_SUMMARY_SOURCE_MAX_BYTES) throw new Error("Custom Summary userscript exceeds the 1 MiB limit");
  if (!chrome.userScripts?.execute) {
    throw new Error("Custom Summary userscripts require userScripts.execute (Chrome/Arc 135+ or Firefox Nightly 153+) and granted User Scripts access. Chrome 135–137 also requires Developer Mode; Chrome 138+ requires Allow User Scripts.");
  }
  const code = `(() => {
    const execute = globalThis[${JSON.stringify(CUSTOM_SUMMARY_EXECUTOR)}];
    if (typeof execute !== "function") throw new Error("ChatClub Summary MAIN-world runtime is unavailable");
    return execute(${JSON.stringify(runtimeConfig)}, async function chatClubCustomSummaryUserscript(api) {
${userscript}
    }).then((result) => JSON.stringify(result));
  })()\n//# sourceURL=chatclub-custom-summary-${String(runtimeConfig.id || "userscript").replace(/[^a-z0-9_-]+/gi, "-")}.js`;
  const execution = queueCustomSummaryExecution(target, async () => {
    await ensureCustomSummaryRuntime(target);
    let results;
    try {
      results = await chrome.userScripts.execute({
        target,
        js: [{ code }],
        world: "MAIN",
        injectImmediately: true
      });
    } catch (error) {
      throw new Error(`Custom Summary userscript injection failed: ${error?.message || String(error)}`);
    }
    const entry = injectionResultForTarget(results, target);
    if (entry?.error) throw new Error(`Custom Summary userscript failed: ${entry.error?.message || String(entry.error)}`);
    const serialized = entry?.result;
    if (typeof serialized !== "string") throw new Error("Custom Summary userscript returned no serialized result");
    if (utf8ByteLength(serialized) > CUSTOM_SUMMARY_RESULT_MAX_BYTES) throw new Error("Custom Summary userscript result exceeds the 2 MiB limit");
    let result;
    try { result = JSON.parse(serialized); }
    catch { throw new Error("Custom Summary userscript returned invalid JSON"); }
    if (!result || typeof result !== "object" || !Array.isArray(result.messages)) {
      throw new Error("Custom Summary userscript returned no valid result");
    }
    return result;
  });
  const timeoutMs = Math.max(5000, Math.min(45000, Number(runtimeConfig.userscriptTimeoutMs) || 30000));
  return timeoutPromise(
    execution,
    Math.max(4000, timeoutMs - 1500),
    "Custom Summary userscript timed out; reload the affected page to stop an unresponsive script."
  );
}

function sanitizedTopicDeleteResult(value, config = {}) {
  const source = value && typeof value === "object" ? value : { ok: Boolean(value) };
  const result = { ...source };
  const requestedTrustedInput = Boolean(
    result.needsTrustedClick
    || result.needsTrustedHover
    || result.needsTrustedMenuClick
    || result.needsTrustedKeySequence
  );
  for (const key of [
    "needsTrustedClick",
    "trustedClick",
    "needsTrustedHover",
    "trustedHover",
    "needsTrustedMenuClick",
    "trustedMenuClick",
    "needsTrustedKeySequence",
    "trustedKeySequence"
  ]) delete result[key];
  if (requestedTrustedInput && !result.ok) {
    result.reason = result.reason || "Custom Delete Site userscript requires manual trusted input";
    result.requiresManualInteraction = true;
  }
  result.site = String(result.site || config.id || "topic-delete");
  result.ok = Boolean(result.ok);
  return result;
}

async function executeCustomTopicDeleteUserscript(configId = "", payload = {}, sender = {}) {
  const target = senderFrameTarget(sender, { requireDocumentId: true });
  const config = await storedTopicDeleteConfig(configId, sender);
  const source = topicDeleteUserscriptSource(config);
  if (!source) throw new Error("Custom Delete Site userscript source is empty");
  if (utf8ByteLength(source) > CUSTOM_SUMMARY_SOURCE_MAX_BYTES) throw new Error("Custom Delete Site userscript exceeds the 1 MiB limit");
  if (!chrome.userScripts?.execute) throw new Error(userScriptsUnavailableMessage());
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const serializedPayload = JSON.stringify(safePayload);
  if (utf8ByteLength(serializedPayload) > 256 * 1024) throw new Error("Custom Delete Site payload exceeds the 256 KiB limit");
  const code = `${source}\n;(() => {
    const compact = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const wanted = [${JSON.stringify(config.id || "")}, ${JSON.stringify(config.name || "")}, ${JSON.stringify(config.scriptId || "")}].map(compact).filter(Boolean);
    const registry = globalThis.ChatClubDeleteSites;
    if (!registry || typeof registry !== "object") throw new Error("Custom Delete Site registry is unavailable");
    const entry = Object.entries(registry).map(([key, value]) => ({ key, value })).find(({ key, value }) => {
      if (!value || typeof value.menuCommand !== "function") return false;
      return [key, value.id, value.site, value.siteId, value.scriptId, value.name].map(compact).some((token) => token && wanted.includes(token));
    })?.value;
    if (!entry) throw new Error("Custom Delete Site menuCommand is unavailable");
    return Promise.resolve(entry.menuCommand(${serializedPayload})).then((value) => {
      const raw = value && typeof value === "object" ? value : { ok: Boolean(value), reason: value ? "" : "userscript returned false" };
      const requiresManualInteraction = Boolean(raw.needsTrustedClick || raw.needsTrustedHover || raw.needsTrustedMenuClick || raw.needsTrustedKeySequence);
      return JSON.stringify({
        ok: Boolean(raw.ok),
        site: String(raw.site || ${JSON.stringify(config.id || "topic-delete")}).slice(0, 256),
        reason: String(raw.reason || (requiresManualInteraction ? "Custom Delete Site userscript requires manual trusted input" : "")).slice(0, 8192),
        requiresManualInteraction
      });
    });
  })()`;
  const execution = queueCustomSummaryExecution(target, async () => {
    let results;
    try {
      results = await chrome.userScripts.execute({
        target,
        js: [{ code }],
        world: "MAIN",
        injectImmediately: true
      });
    } catch (error) {
      const message = error?.message || String(error);
      if (!/\bworld\b|unexpected property/i.test(message)) throw new Error(userScriptsUnavailableMessage(error));
      results = await chrome.userScripts.execute({ target, js: [{ code }], injectImmediately: true });
    }
    const entry = injectionResultForTarget(results, target);
    if (entry?.error) throw new Error(entry.error?.message || String(entry.error));
    if (typeof entry?.result !== "string") throw new Error("Custom Delete Site userscript returned no serialized result");
    if (utf8ByteLength(entry.result) > CUSTOM_SUMMARY_RESULT_MAX_BYTES) throw new Error("Custom Delete Site result exceeds the 2 MiB limit");
    let value;
    try { value = JSON.parse(entry.result); }
    catch { throw new Error("Custom Delete Site userscript returned invalid JSON"); }
    return sanitizedTopicDeleteResult(value, config);
  });
  const timeoutMs = Math.max(5000, Math.min(45000, Number(config.userscriptTimeoutMs) || 15000));
  return timeoutPromise(
    execution,
    Math.max(4000, timeoutMs - 1500),
    "Custom Delete Site userscript timed out; reload the affected page to stop an unresponsive script."
  );
}

let trustedInputModulePromise = null;

async function trustedInputModule() {
  if (!("debugger" in chrome)) return null;
  if (!trustedInputModulePromise) trustedInputModulePromise = import("./trusted-input.js");
  return trustedInputModulePromise;
}

async function dispatchTrustedClick(message = {}, sender = {}) {
  const input = await trustedInputModule();
  if (!input) throw new Error("Trusted browser click is unavailable in this browser; complete the visible confirmation manually.");
  return input.dispatchTrustedClick(chrome, message, sender);
}

async function dispatchTrustedMouseMove(message = {}, sender = {}) {
  const input = await trustedInputModule();
  if (!input) throw new Error("Trusted browser hover is unavailable in this browser; open the row menu manually and retry.");
  return input.dispatchTrustedMouseMove(chrome, message, sender);
}

async function dispatchTrustedKeySequence(message = {}, sender = {}) {
  const input = await trustedInputModule();
  if (!input) throw new Error("Trusted browser key input is unavailable in this browser; finish the delete action manually.");
  return input.dispatchTrustedKeySequence(chrome, message, sender);
}

function urlHost(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return normalizeHost(value).replace(/^\*\./, "");
  }
}

function frameMatchesBridgeHints(frame = {}, hints = {}) {
  const url = String(frame.url || "");
  if (!/^https?:\/\//i.test(url)) return false;
  const frameHost = urlHost(url);
  if (!frameHost) return false;
  const hosts = new Set((hints.hosts || []).map(urlHost).filter(Boolean));
  for (const href of hints.hrefs || []) {
    const host = urlHost(href);
    if (host) hosts.add(host);
  }
  if (!hosts.size) return true;
  for (const host of hosts) {
    if (frameHost === host || frameHost.endsWith(`.${host}`) || host.endsWith(`.${frameHost}`)) return true;
  }
  return false;
}

async function executeContentBridgeFile(tabId, frameId, spec) {
  return chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [spec.file],
    world: spec.world
  });
}

async function ensureContentBridge(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId({ appTabId: message.tabId }, sender);
  const hints = {
    hrefs: Array.isArray(message.hrefs) ? message.hrefs : [],
    hosts: Array.isArray(message.hosts) ? message.hosts : []
  };
  const validHintHosts = new Set([
    ...hints.hrefs.map(urlHost),
    ...hints.hosts.map(urlHost)
  ].filter(Boolean));
  if (!validHintHosts.size) throw new Error("Content bridge injection failed: target URL hints are unavailable");
  const features = new Set(
    (Array.isArray(message.features) ? message.features : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value === "summary")
  );
  let frames = [];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
  } catch (error) {
    throw new Error(`Content bridge injection failed: ${error?.message || String(error)}`);
  }
  const frameIds = (frames || [])
    .filter((frame) => Number.isInteger(frame?.frameId) && frame.frameId > 0 && frame.parentFrameId === 0)
    .filter((frame) => frameMatchesBridgeHints(frame, hints))
    .map((frame) => frame.frameId);
  const uniqueFrameIds = Array.from(new Set(frameIds));
  const errors = [];
  const injectedFiles = [];
  let injected = 0;
  if (!uniqueFrameIds.length) errors.push("no matching direct child iframe found for the requested target");
  const specs = features.has("summary")
    ? [CONTENT_BRIDGE_FILES[0], ...SUMMARY_BRIDGE_FILES, ...CONTENT_BRIDGE_FILES.slice(1)]
    : CONTENT_BRIDGE_FILES;
  for (const frameId of uniqueFrameIds) {
    for (const spec of specs) {
      try {
        await executeContentBridgeFile(tabId, frameId, spec);
        injected += 1;
        injectedFiles.push(`${spec.file}@${frameId}`);
      } catch (error) {
        errors.push(`${spec.file}@${frameId}: ${error?.message || String(error)}`);
      }
    }
  }
  return { tabId, frameIds: uniqueFrameIds, injected, injectedFiles, features: [...features], errors };
}

async function installTopicDeleteUserscript(config = {}, sender = {}) {
  const storedConfig = await storedTopicDeleteConfig(config.id, sender);
  if (canUsePackagedTopicDeleteUserscript(storedConfig)) {
    const target = senderFrameTarget(sender, { requireDocumentId: true });
    const file = safeTopicDeleteUserscriptFile(storedConfig.userscriptFile);
    await executePackagedTopicDeleteUserscript(target, file);
    return { mode: "packaged", file, runtimeConfig: topicDeleteUserscriptMetadata(storedConfig, storedConfig.userscript || "") };
  }
  const source = topicDeleteUserscriptSource(storedConfig);
  if (!/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)) {
    throw new Error("Legacy bridge snippets are unsupported under MV3 CSP; convert this Delete Site to a standalone userscript.");
  }
  const target = senderFrameTarget(sender, { requireDocumentId: true });
  await executeUserTopicDeleteUserscript(target, source);
  return { mode: "userScripts", runtimeConfig: topicDeleteUserscriptMetadata(storedConfig, source) };
}

async function currentChatApps() {
  const customConfig = await loadCustomConfig();
  return getAllChatApps(customConfig);
}

function summaryCollectorContentTargets(options = {}) {
  return (options.summarySiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `summary-${config.id || config.name || "collector"}`,
      name: config.name || config.id || "Summary Collector",
      url: "",
      hosts: config.hosts
    }));
}

function topicDeleteContentTargets(options = {}) {
  return (options.topicDeleteSiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `topic-delete-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Topic Delete Site",
      url: "",
      hosts: config.hosts
    }));
}

function messageNavigatorContentTargets(options = {}) {
  return (options.messageNavigatorSiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `message-navigator-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Message Navigator Site",
      url: "",
      hosts: config.hosts
    }));
}

async function currentContentScriptTargetGroups() {
  const [customConfig, options] = await Promise.all([loadCustomConfig(), loadOptions()]);
  const chatTargets = getAllChatApps(customConfig);
  const summaryTargets = summaryCollectorContentTargets(options);
  const topicDeleteTargets = topicDeleteContentTargets(options);
  const messageNavigatorTargets = messageNavigatorContentTargets(options);
  return {
    // content.js owns the request bridge used by every optional feature.
    coreTargets: [
      ...chatTargets,
      ...summaryTargets,
      ...topicDeleteTargets,
      ...messageNavigatorTargets
    ],
    // preload.js supplies MAIN-world helpers used by normal chat control,
    // Summary native-copy extraction, and Delete Sites.
    preloadTargets: [
      ...chatTargets,
      ...summaryTargets,
      ...topicDeleteTargets
    ],
    summaryTargets,
    messageNavigatorTargets
  };
}

function matchesForContentTargets(targets) {
  return Array.isArray(targets) && targets.length ? contentScriptMatches(targets) : [];
}

function rollbackContentScript(previous = {}, canonical = {}) {
  const rollback = { ...canonical };
  for (const key of ["matches", "excludeMatches", "allFrames", "matchOriginAsFallback", "persistAcrossSessions"]) {
    if (previous[key] !== undefined) rollback[key] = previous[key];
  }
  return rollback;
}

async function updateDnrRules() {
  const chatApps = await currentChatApps();
  const extensionHost = new URL(chrome.runtime.getURL("")).hostname;
  const rules = buildDynamicDnrRules(chatApps, extensionHost);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  if (chrome.declarativeNetRequest.updateSessionRules) {
    try {
      const oldSessionRules = chrome.declarativeNetRequest.getSessionRules
        ? await chrome.declarativeNetRequest.getSessionRules()
        : [];
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: oldSessionRules.map((rule) => rule.id),
        addRules: rules
      });
      if (oldRules.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: oldRules.map((rule) => rule.id),
          addRules: []
        });
      }
      return;
    } catch (error) {
      console.warn(`[${APP_NAME}] Failed to update session DNR rules; falling back to dynamic rules`, error);
    }
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: rules
  });
}

function assertRegisteredContentScriptFiles(expected = [], actual = []) {
  const actualById = new Map(actual.map((script) => [script.id, script]));
  const sorted = (value) => [...(Array.isArray(value) ? value : [])].sort();
  const normalized = (script = {}) => ({
    js: Array.isArray(script.js) ? script.js : [],
    matches: sorted(script.matches),
    excludeMatches: sorted(script.excludeMatches),
    allFrames: Boolean(script.allFrames),
    matchOriginAsFallback: Boolean(script.matchOriginAsFallback),
    runAt: String(script.runAt || "document_idle"),
    world: String(script.world || "ISOLATED")
  });
  for (const registration of expected) {
    const registered = actualById.get(registration.id);
    if (!registered) throw new Error(`content script registration is missing: ${registration.id}`);
    const expectedValue = normalized(registration);
    const actualValue = normalized(registered);
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      throw new Error(
        `content script registration changed: ${registration.id} expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
      );
    }
  }
}

async function registerContentScriptsVerified(registrations = []) {
  if (!registrations.length) return;
  await chrome.scripting.registerContentScripts(registrations);
  const registered = await chrome.scripting.getRegisteredContentScripts();
  assertRegisteredContentScriptFiles(registrations, registered);
}

async function registerContentScripts() {
  const {
    coreTargets,
    preloadTargets,
    summaryTargets,
    messageNavigatorTargets
  } = await currentContentScriptTargetGroups();
  const coreMatches = matchesForContentTargets(coreTargets);
  const preloadMatches = matchesForContentTargets(preloadTargets);
  const summaryMatches = matchesForContentTargets(summaryTargets);
  const messageNavigatorMatches = matchesForContentTargets(messageNavigatorTargets);

  const registrations = [];
  if (preloadMatches.length) {
    registrations.push({
      id: PRELOAD_SCRIPT_ID,
      matches: preloadMatches,
      js: ["content/preload.js"],
      allFrames: true,
      runAt: "document_start",
      world: "MAIN"
    });
  }
  if (coreMatches.length) {
    registrations.push({
      id: GROK_COOKIE_SCRIPT_ID,
      matches: coreMatches,
      js: ["content/grok-cookie-bridge.js"],
      allFrames: true,
      runAt: "document_start"
    });
  }
  if (summaryMatches.length) {
    registrations.push({
      id: SUMMARY_PAGE_SCRIPT_ID,
      matches: summaryMatches,
      js: ["content/summary-userscripts-main.js"],
      allFrames: true,
      runAt: "document_idle",
      world: "MAIN"
    }, {
      id: SUMMARY_SCRIPT_ID,
      matches: summaryMatches,
      js: ["content/summary-userscripts.js"],
      allFrames: true,
      runAt: "document_idle"
    });
  }
  if (messageNavigatorMatches.length) {
    registrations.push({
      id: MESSAGE_NAVIGATOR_SCRIPT_ID,
      matches: messageNavigatorMatches,
      js: ["content/message-navigator.js"],
      allFrames: true,
      runAt: "document_idle"
    });
  }
  if (coreMatches.length) {
    registrations.push({
      id: CONTENT_SCRIPT_ID,
      matches: coreMatches,
      js: ["content/content.js"],
      allFrames: true,
      runAt: "document_idle"
    });
  }
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const previousById = new Map(
    registered
      .filter((script) => REGISTERED_CONTENT_SCRIPT_ID_SET.has(script.id))
      .map((script) => [script.id, script])
  );
  const desiredIds = new Set(registrations.map((registration) => registration.id));
  const staleIds = [...previousById.keys()].filter((id) => !desiredIds.has(id));
  if (staleIds.length) await chrome.scripting.unregisterContentScripts({ ids: staleIds });

  const failures = [];
  for (const registration of registrations) {
    const previous = previousById.get(registration.id) || null;
    if (previous) await chrome.scripting.unregisterContentScripts({ ids: [registration.id] });
    try {
      await registerContentScriptsVerified([registration]);
    } catch (error) {
      let recovered = false;
      try {
        const partial = await chrome.scripting.getRegisteredContentScripts();
        if (partial.some((script) => script.id === registration.id)) {
          await chrome.scripting.unregisterContentScripts({ ids: [registration.id] });
        }
        if (previous) {
          const rollback = rollbackContentScript(previous, registration);
          await registerContentScriptsVerified([rollback]);
          recovered = true;
        }
      } catch (rollbackError) {
        failures.push({ registration, error, rollbackError, recovered: false });
        continue;
      }
      failures.push({ registration, error, rollbackError: null, recovered });
    }
  }

  const fatal = failures.filter(({ registration, recovered }) =>
    CORE_CONTENT_SCRIPT_ID_SET.has(registration.id) && !recovered
  );
  if (failures.length) {
    console.warn(`[${APP_NAME}] ${failures.length} content script registration(s) failed`, failures);
  }
  if (fatal.length) {
    throw new Error(fatal.map(({ registration, error, rollbackError }) =>
      `${registration.id}: ${error?.message || String(error)}${rollbackError ? `; rollback: ${rollbackError?.message || String(rollbackError)}` : ""}`
    ).join(" | "));
  }
}

let runtimeConfigReloadChain = Promise.resolve();

function reloadRuntimeConfig() {
  runtimeConfigReloadChain = runtimeConfigReloadChain
    .catch(() => {})
    .then(() => Promise.all([updateDnrRules(), registerContentScripts()]));
  return runtimeConfigReloadChain;
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.remove(["clientId", "sessionData"]);
  await loadOptions();
  await reloadRuntimeConfig();
});

chrome.runtime.onStartup?.addListener(() => {
  reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] startup reload failed`, error));
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("chatClub.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "chatclub") return false;
  (async () => {
    if (message.action === "registerFrameContext") {
      const context = await registerSecureFrameContext(message, sender);
      sendResponse({ success: true, documentId: context.documentId, frameId: context.frameId });
      return;
    }
    if (message.action === "sendFrameCommand") {
      const data = await sendSecureFrameCommand(message, sender);
      sendResponse({ success: true, data });
      return;
    }
    if (message.action === "verifyFrameContext") {
      const data = await verifySecureFrameContext(message, sender);
      sendResponse({ success: true, data });
      return;
    }
    if (message.action === "relayShortcutTriggered") {
      await relayShortcutTriggered(message, sender);
      sendResponse({ success: true });
      return;
    }
    if (message.action === "relayFrameLifecycle") {
      await relayFrameLifecycle(message, sender);
      sendResponse({ success: true });
      return;
    }
    if (message.action === "reloadConfigs") {
      await reloadRuntimeConfig();
      sendResponse({ success: true });
      return;
    }
    if (message.action === "prepareFrameLoad") {
      const preflightId = registerGrokFramePreflight(message, sender);
      try {
        const cookieBridge = prepareGrokSessionCookies(message.url, sender)
          .catch(() => publicGrokCookieBridgeResult());
        await updateDnrRules();
        sendResponse({ success: true, grokCookieBridge: await cookieBridge });
      } finally {
        finishGrokFramePreflight(preflightId);
      }
      return;
    }
    if (message.action === "markGrokFramePreflightFallback") {
      sendResponse({ success: true, marked: markGrokFramePreflightFallback(message, sender) });
      return;
    }
    if (message.action === "syncGrokSessionCookies") {
      if (message.bridgeVersion !== GROK_COOKIE_BRIDGE_VERSION) {
        throw new Error("Grok Cookie bridge version is stale");
      }
      const result = await syncGrokSessionCookiesForFrame(sender);
      const fallbackReload = consumeGrokFallbackReload(sender?.tab?.id);
      sendResponse({
        success: true,
        ...publicGrokCookieBridgeResult(result),
        reloadRequired: result.changed === true || fallbackReload
      });
      return;
    }
    if (message.action === "getConfigInfo") {
      sendResponse({
        options: await loadOptions(),
        customConfig: await loadCustomConfig(),
        contentScripts: await chrome.scripting.getRegisteredContentScripts()
      });
      return;
    }
    if (message.action === "resetConfig") {
      await queueGrokCookieBridge(() => removeAllManagedGrokPartitions(chrome));
      await chrome.storage.local.clear();
      const options = await saveOptions({});
      await reloadRuntimeConfig();
      sendResponse({ success: true, options });
      return;
    }
    if (message.action === "installTopicDeleteUserscript") {
      const result = await installTopicDeleteUserscript(message.config || {}, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "executeSummaryUserscript") {
      const data = await executeCustomSummaryUserscript(message.configId, sender);
      sendResponse({ success: true, data });
      return;
    }
    if (message.action === "executeTopicDeleteUserscript") {
      const data = await executeCustomTopicDeleteUserscript(message.configId, message.payload, sender);
      sendResponse({ success: true, data });
      return;
    }
    if (message.action === "ensureContentBridge") {
      const result = await ensureContentBridge(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "dispatchTrustedClick") {
      const result = await dispatchTrustedClick(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "dispatchTrustedMouseMove") {
      const result = await dispatchTrustedMouseMove(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "dispatchTrustedKeySequence") {
      const result = await dispatchTrustedKeySequence(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "openTab") {
      const url = openableTabUrl(message.url);
      if (!url) {
        sendResponse({ success: false, error: "Invalid tab URL" });
        return;
      }
      await openExternalTab(url, sender, message.openerTab);
      sendResponse({ success: true });
      return;
    }
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  })().catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
  return true;
});

reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] initial reload failed`, error));
