import { APP_NAME } from "../shared/constants.js";
import { buildDynamicDnrRules } from "../shared/dnr.js";
import { getAllChatApps } from "../shared/storage-schema.js";
import { loadCustomConfig, loadOptions, saveOptions } from "../shared/storage-adapter.js";
import { TOPIC_DELETE_SITE_CONFIGS } from "../shared/topic-delete-sites.js";
import { customUserscriptSource, isCustomUserscriptConfig } from "../shared/userscript-config.js";
import { FRAME_COMMAND_SPECS } from "../shared/frame-commands.js";
import { ALL_SHORTCUT_ACTIONS } from "../shared/shortcuts.js";
import {
  CUSTOM_SUMMARY_EXECUTOR,
  EXTENSION_RUNTIME_RELAY_SOURCE,
  GROK_COOKIE_BRIDGE_VERSION,
  NAVIGATION_FOCUS_GUARD_RUNTIME,
  NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
  RUNTIME_REGISTRY_ABI_VERSION,
  RUNTIME_REGISTRY_KEY,
  SECURE_FRAME_COMMAND_SOURCE
} from "../shared/protocol.js";
import { configMatchesHref } from "../shared/url-match.js";
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
import {
  executeVerifiedPackagedFrameFile,
  verifiedCustomUserscriptTarget
} from "./frame-injection.js";
import { createAuthenticatedFrameRelay } from "./frame-relay.js";
import {
  injectContentBridge,
  relayContentFrameBinding,
  registerContentScripts
} from "./content-registration.js";
import {
  openableTabUrl,
  openExternalTab,
  registerActionListener
} from "./tab-runtime.js";
import { claimWorkspaceSessionRecovery, commitWorkspaceSessionRecovery, detachWorkspaceSessionMirror, prepareWorkspaceSessionLifecycle, rotateWorkspaceSessionGeneration } from "./workspace-session.js";
import * as trustedInput from "./trusted-input.js";

const chrome = globalThis.browser || globalThis.chrome;
if (!chrome) throw new Error("[ChatClub] Extension API namespace is unavailable");

const TOPIC_DELETE_USERSCRIPT_FILE_PATTERN = /^topic-delete-userscripts\/[a-z0-9-]+\.user\.js$/i;
const CUSTOM_SUMMARY_SOURCE_MAX_BYTES = 1024 * 1024;
const CUSTOM_SUMMARY_RESULT_MAX_BYTES = 2 * 1024 * 1024;
const customSummaryExecutionQueues = new Map();
const FRAME_CONTEXT_SESSION_KEY = "chatclubSecureFrameContexts";
const FRAME_CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;
const FRAME_CONTEXT_MAX_ENTRIES = 512;
const secureFrameContexts = new Map();
const secureFrameCommands = new Set(Object.keys(FRAME_COMMAND_SPECS));
const shortcutActions = new Set(ALL_SHORTCUT_ACTIONS);
const authenticatedFrameRelay = createAuthenticatedFrameRelay({
  registeredSenderContext,
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
  relaySource: EXTENSION_RUNTIME_RELAY_SOURCE,
  shortcutActions,
  rememberContext(token, context) {
    secureFrameContexts.set(token, context);
    persistSecureFrameContexts();
  }
});
let secureFrameContextsHydration = null;
let secureFrameContextsWriteChain = Promise.resolve();
let grokCookieBridgeChain = Promise.resolve();
const grokSourceChangeTimers = new Map();
const grokSourceChangedAuthNames = new Map();
const grokFramePreflights = new Map();
const grokFallbackReloadCounts = new Map();
const GROK_FRAME_PREFLIGHT_MAX_AGE_MS = 60 * 1000;
function frameContextToken(value) {
  const token = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._:-]{8,191}$/i.test(token) ? token : "";
}

function frameBindingToken(value) {
  const token = String(value || "").trim();
  return /^[a-f0-9]{64}$/i.test(token) ? token : "";
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
          secureFrameContexts.set(token, { ...context, browserDocumentId: String(context.browserDocumentId || context.documentId || ""), legacyDocumentId: String(context.legacyDocumentId || "") });
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
  const frameBindingId = frameBindingToken(message.frameBindingId);
  const secureToken = /^[a-f0-9]{32,128}$/i.test(String(message.secureFrameToken || ""))
    ? String(message.secureFrameToken)
    : "";
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const senderUrl = String(sender?.url || "").trim();
  if (!token || !secureToken || !frameBindingId || !Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0 || !/^https?:\/\//i.test(senderUrl)) {
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
  const legacyDocumentId = /^legacy:[a-f0-9]{64}$/i.test(String(message.browserDocumentId || "")) ? String(message.browserDocumentId) : "";
  if (senderDocumentId && navigationDocumentId && senderDocumentId !== navigationDocumentId) {
    throw new Error("Secure frame registration document changed");
  }
  const documentId = senderDocumentId || navigationDocumentId;
  const browserDocumentId = documentId || legacyDocumentId;
  if (!browserDocumentId) throw new Error("Secure frame registration browser document is unavailable");
  await hydrateSecureFrameContexts();
  for (const [existingToken, context] of secureFrameContexts) {
    if (context?.tabId === tabId && context?.frameId === frameId && existingToken !== token) {
      secureFrameContexts.delete(existingToken);
    }
  }
  const context = {
    tabId,
    frameId,
    documentId,
    browserDocumentId,
    legacyDocumentId,
    url: senderUrl,
    frameBindingId,
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

chrome.tabs?.onRemoved?.addListener((tabId, removeInfo) => {
  grokFallbackReloadCounts.delete(tabId);
  for (const [id, preflight] of grokFramePreflights) {
    if (preflight.tabId === tabId) grokFramePreflights.delete(id);
  }
  detachWorkspaceSessionMirror(chrome, tabId, removeInfo)
    .catch((error) => console.warn(`[${APP_NAME}] closed tab workspace session mirror could not be detached`, error));
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

async function executeMainWorldFrameCommand(context, command, data = {}) {
  if (!new Set(["prepareNavigationFocusGuard", "adoptNavigationFocusGuard"]).has(command)) {
    throw frameRouteError("REMOTE_ERROR", `Unknown MAIN-world frame command: ${command}`, false);
  }
  const target = context.documentId
    ? { tabId: context.tabId, documentIds: [context.documentId] }
    : { tabId: context.tabId, frameIds: [context.frameId] };
  const execute = (injectionTarget) => chrome.scripting.executeScript({
    target: injectionTarget,
    world: "MAIN",
    func: (registryKey, registryAbiVersion, runtimeName, runtimeVersion, payload) => {
      const registry = globalThis[registryKey];
      if (registry?.abiVersion !== registryAbiVersion || typeof registry.require !== "function") {
        throw new Error("ChatClub runtime registry is unavailable");
      }
      const runtime = registry.require(runtimeName, runtimeVersion);
      if (!runtime || typeof runtime.prepare !== "function") {
        throw new Error("Navigation focus guard runtime is unavailable");
      }
      return runtime.prepare(payload);
    },
    args: [
      RUNTIME_REGISTRY_KEY,
      RUNTIME_REGISTRY_ABI_VERSION,
      NAVIGATION_FOCUS_GUARD_RUNTIME,
      NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
      {
        ...data,
        phase: command === "adoptNavigationFocusGuard" ? "adopt" : "prepare"
      }
    ]
  });
  let results;
  try {
    results = await execute(target);
  } catch (error) {
    if (context.documentId && /documentIds|unexpected property|invalid value/i.test(error?.message || String(error))) {
      try {
        results = await execute({ tabId: context.tabId, frameIds: [context.frameId] });
      } catch (fallbackError) {
        throw frameRouteError("STALE_DOCUMENT", fallbackError?.message || String(fallbackError), false, fallbackError);
      }
    } else {
      throw frameRouteError("STALE_DOCUMENT", error?.message || String(error), false, error);
    }
  }
  const result = Array.isArray(results)
    ? results.find((entry) => !context.documentId || entry?.documentId === context.documentId) || results[0]
    : null;
  if (result?.error) {
    throw frameRouteError("REMOTE_ERROR", String(result.error?.message || result.error), true, result.error);
  }
  if (!result || result.result === undefined) {
    throw frameRouteError("REMOTE_ERROR", "Navigation focus guard returned no result", true);
  }
  return result.result;
}

function frameRouteError(code, message, delivered = false, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.delivered = delivered;
  if (cause) error.cause = cause;
  return error;
}

async function sendSecureFrameCommand(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId(message, sender);
  const context = await secureFrameContext(message.bridgeDocumentId);
  if (!context || context.tabId !== tabId) {
    throw frameRouteError("NOT_REGISTERED", "Secure frame document is not registered in this tab", false);
  }
  const command = String(message.command || "");
  if (!secureFrameCommands.has(command)) {
    throw frameRouteError("REMOTE_ERROR", `Secure frame command is not allowed: ${command}`, false);
  }
  const timeoutMs = Math.max(250, Math.min(60000, Number(message.timeoutMs) || 5000));
  let response;
  try {
    const request = FRAME_COMMAND_SPECS[command]?.transport === "main-world"
      ? executeMainWorldFrameCommand(context, command, message.data || {})
      : sendMessageToRegisteredFrame(context, {
          source: SECURE_FRAME_COMMAND_SOURCE,
          type: "request",
          bridgeDocumentId: frameContextToken(message.bridgeDocumentId),
          secureFrameToken: context.secureToken,
          action: command,
          data: message.data || {}
        });
    response = await timeoutPromise(
      request,
      timeoutMs,
      `[FrameRPC] Timeout waiting for response: ${command}`
    );
  } catch (error) {
    const messageText = error?.message || String(error);
    if (["NOT_REGISTERED", "STALE_DOCUMENT", "INJECTION_FAILED", "TIMEOUT", "ABORTED", "REMOTE_ERROR"].includes(error?.code)) {
      throw error;
    }
    if (/timeout/i.test(messageText)) throw frameRouteError("TIMEOUT", messageText, true, error);
    throw frameRouteError("STALE_DOCUMENT", messageText, false, error);
  }
  if (FRAME_COMMAND_SPECS[command]?.transport !== "main-world" && !response?.success) {
    throw frameRouteError("REMOTE_ERROR", response?.error || `Secure frame command failed: ${command}`, true);
  }
  context.registeredAt = Date.now();
  secureFrameContexts.set(frameContextToken(message.bridgeDocumentId), context);
  persistSecureFrameContexts();
  return FRAME_COMMAND_SPECS[command]?.transport === "main-world" ? response : response.data;
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
    bridgeVersion: String(context.bridgeVersion || ""),
    frameId: context.frameId,
    frameBindingId: String(context.frameBindingId || ""),
    browserDocumentId: String(context.browserDocumentId || context.documentId || "")
  };
}

async function registeredSenderContext(message = {}, sender = {}) {
  const token = frameContextToken(message.bridgeDocumentId);
  const frameBindingId = frameBindingToken(message.frameBindingId);
  const context = await secureFrameContext(token);
  if (!context || context.tabId !== sender?.tab?.id || context.frameId !== sender?.frameId) {
    throw new Error("Runtime relay sender is not the registered frame document");
  }
  const senderDocumentId = String(sender?.documentId || "").trim();
  const contextDocumentId = String(context.documentId || "").trim();
  const contextBrowserDocumentId = String(context.browserDocumentId || contextDocumentId).trim();
  const contextLegacyDocumentId = String(context.legacyDocumentId || "").trim();
  const claimedBrowserDocumentId = String(message.browserDocumentId || "").trim();
  if (contextDocumentId && senderDocumentId && contextDocumentId !== senderDocumentId) throw new Error("Runtime relay sender document changed");
  const browserDocumentMatches = senderDocumentId
    ? senderDocumentId === contextBrowserDocumentId
    : claimedBrowserDocumentId === contextBrowserDocumentId
      || (/^legacy:[a-f0-9]{64}$/i.test(claimedBrowserDocumentId) && claimedBrowserDocumentId === contextLegacyDocumentId);
  if (!contextBrowserDocumentId || !browserDocumentMatches) {
    throw new Error("Runtime relay browser document changed");
  }
  if (!frameBindingId || frameBindingId !== context.frameBindingId) {
    throw new Error("Runtime relay frame binding changed");
  }
  return { token, context };
}

function safeTopicDeleteUserscriptFile(file) {
  const value = String(file || "").trim();
  return TOPIC_DELETE_USERSCRIPT_FILE_PATTERN.test(value) ? value : "";
}

function canUsePackagedTopicDeleteUserscript(config = {}) {
  const builtIn = packagedTopicDeleteBuiltInConfig(config);
  if (!builtIn) return false;
  return config?.builtIn !== false
    && !isCustomUserscriptConfig(config)
    && safeTopicDeleteUserscriptFile(config.userscriptFile) === builtIn.userscriptFile;
}

function packagedTopicDeleteBuiltInConfig(config = {}) {
  const id = String(config.id || "").trim();
  const file = safeTopicDeleteUserscriptFile(config.userscriptFile);
  if (!file) return null;
  const builtIn = TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === id) || null;
  return builtIn?.userscriptFile === file ? builtIn : null;
}

async function executePackagedTopicDeleteUserscript(sender, file) {
  await executeVerifiedPackagedFrameFile(chrome, sender, file, { world: "MAIN" });
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
  return customUserscriptSource(config);
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
  return customUserscriptSource(config);
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
  if (!source && config.builtIn !== false) {
    return {
      scriptId: String(config.scriptId || config.id || ""),
      userscriptVersion: String(config.scriptVersion || ""),
      supportsVersionedRequest: true,
      supportsVersionedMenuCommand: true,
      supportsMenuCommand: true
    };
  }
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
  const target = await verifiedCustomUserscriptTarget(chrome, sender);
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
  const target = await verifiedCustomUserscriptTarget(chrome, sender);
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

async function dispatchTrustedClick(message = {}, sender = {}) {
  if (!("debugger" in chrome)) throw new Error("Trusted browser click is unavailable in this browser; complete the visible confirmation manually.");
  return trustedInput.dispatchTrustedClick(chrome, message, sender);
}

async function dispatchTrustedMouseMove(message = {}, sender = {}) {
  if (!("debugger" in chrome)) throw new Error("Trusted browser hover is unavailable in this browser; open the row menu manually and retry.");
  return trustedInput.dispatchTrustedMouseMove(chrome, message, sender);
}

async function dispatchTrustedKeySequence(message = {}, sender = {}) {
  if (!("debugger" in chrome)) throw new Error("Trusted browser key input is unavailable in this browser; finish the delete action manually.");
  return trustedInput.dispatchTrustedKeySequence(chrome, message, sender);
}

async function ensureContentBridge(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId({ appTabId: message.tabId }, sender);
  return injectContentBridge(chrome, tabId, message);
}

async function requestContentFrameBinding(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId({ appTabId: message.tabId }, sender);
  return relayContentFrameBinding(chrome, tabId, message);
}

async function installTopicDeleteUserscript(config = {}, sender = {}) {
  const storedConfig = await storedTopicDeleteConfig(config.id, sender);
  if (canUsePackagedTopicDeleteUserscript(storedConfig)) {
    const file = safeTopicDeleteUserscriptFile(storedConfig.userscriptFile);
    await executePackagedTopicDeleteUserscript(sender, file);
    return { mode: "packaged", file, runtimeConfig: topicDeleteUserscriptMetadata(storedConfig) };
  }
  const source = topicDeleteUserscriptSource(storedConfig);
  if (!/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)) {
    throw new Error("Legacy bridge snippets are unsupported under MV3 CSP; convert this Delete Site to a standalone userscript.");
  }
  const target = await verifiedCustomUserscriptTarget(chrome, sender);
  await executeUserTopicDeleteUserscript(target, source);
  return { mode: "userScripts", runtimeConfig: topicDeleteUserscriptMetadata(storedConfig, source) };
}

async function currentChatApps() {
  const customConfig = await loadCustomConfig();
  return getAllChatApps(customConfig);
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

let runtimeConfigReloadChain = Promise.resolve();

function reloadRuntimeConfig() {
  runtimeConfigReloadChain = runtimeConfigReloadChain
    .catch(() => {})
    .then(() => Promise.all([updateDnrRules(), registerContentScripts(chrome)]));
  return runtimeConfigReloadChain;
}

function prepareWorkspaceSessionLifecycleSafely(lifecycle, options = {}) {
  return prepareWorkspaceSessionLifecycle(chrome, options)
    .catch((error) => {
      console.warn(`[${APP_NAME}] ${lifecycle} workspace session lifecycle failed`, error);
      return null;
    });
}

chrome.runtime.onInstalled.addListener(async (details = {}) => {
  const reason = String(details.reason || "installed");
  const workspaceSessionReady = prepareWorkspaceSessionLifecycleSafely("install/update", { forceRecovery: reason === "update", reason, previousVersion: String(details.previousVersion || "") });
  await chrome.storage.local.remove(["clientId", "sessionData"]);
  await loadOptions();
  await reloadRuntimeConfig();
  await workspaceSessionReady;
});

chrome.runtime.onStartup?.addListener(() => {
  reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] startup reload failed`, error));
  prepareWorkspaceSessionLifecycleSafely("startup", { reason: "startup" });
});

registerActionListener(chrome);
prepareWorkspaceSessionLifecycleSafely("runtime start", { reason: "runtime-start" });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "chatclub") return false;
  (async () => {
    if (message.action === "claimWorkspaceSessionRecovery") {
      verifiedExtensionPageSender(sender);
      sendResponse({ success: true, ...await claimWorkspaceSessionRecovery(chrome, message, sender) });
      return;
    }
    if (message.action === "commitWorkspaceSessionRecovery") {
      verifiedExtensionPageSender(sender);
      sendResponse({ success: true, ...await commitWorkspaceSessionRecovery(chrome, message, sender) });
      return;
    }
    if (message.action === "registerFrameContext") {
      const context = await registerSecureFrameContext(message, sender);
      sendResponse({ success: true, documentId: context.documentId, browserDocumentId: context.browserDocumentId, frameId: context.frameId });
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
      await authenticatedFrameRelay.shortcutTriggered(message, sender);
      sendResponse({ success: true });
      return;
    }
    if (message.action === "relayFrameBinding") {
      await authenticatedFrameRelay.frameBinding(message, sender);
      sendResponse({ success: true });
      return;
    }
    if (message.action === "relayFrameLifecycle") {
      await authenticatedFrameRelay.frameLifecycle(message, sender);
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
      const workspaceSessionGeneration = await rotateWorkspaceSessionGeneration(chrome);
      const options = await saveOptions({});
      await reloadRuntimeConfig();
      sendResponse({ success: true, options, workspaceSessionGeneration });
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
    if (message.action === "requestFrameBinding") {
      const result = await requestContentFrameBinding(message, sender);
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
      await openExternalTab(chrome, url, sender, message.openerTab);
      sendResponse({ success: true });
      return;
    }
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  })().catch((error) => sendResponse({
    success: false,
    error: error.message || String(error),
    ...(error?.code ? { code: error.code } : {}),
    ...(typeof error?.delivered === "boolean" ? { delivered: error.delivered } : {})
  }));
  return true;
});

reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] initial reload failed`, error));
