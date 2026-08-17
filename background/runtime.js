import { APP_NAME } from "../shared/constants.js";
import { FRAME_COMMAND_SPECS } from "../shared/frame-commands.js";
import { ALL_SHORTCUT_ACTIONS } from "../shared/shortcuts.js";
import { normalizeContentRuntimeIdentity } from "../shared/content-runtime-identity.js";
import {
  contentRuntimeIdentityForBundle,
  contentRuntimePackageBundleIdentityMatches
} from "../shared/content-runtime-package-identity.js";
import {
  BACKGROUND_REQUEST_ACTIONS,
  BACKGROUND_REQUEST_AUTHORIZERS,
  BACKGROUND_REQUEST_SPECS
} from "../shared/background-requests.js";
import {
  EXTENSION_RUNTIME_RELAY_SOURCE,
  NAVIGATION_FOCUS_GUARD_RUNTIME,
  NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
  RUNTIME_REGISTRY_ABI_VERSION,
  SECURE_FRAME_COMMAND_SOURCE
} from "../shared/protocol.js";
import {
  CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
  CONTENT_RUNTIME_REGISTRY_KEY
} from "../shared/content-runtime-version.generated.js";

const CONTENT_BRIDGE_RUNTIME_IDENTITY = contentRuntimeIdentityForBundle("content/content.js");
const CONTENT_SCRIPT_REGISTRATION_MARKER_KEY = "chatclubContentScriptRegistrationVersionV1";
import { verifiedDirectChildFrameContext } from "./frame-injection.js";
import { createAuthenticatedFrameRelay } from "./frame-relay.js";
import { createSecureFrameContextRegistry } from "./secure-frame-contexts.js";
import { normalizeSecureFrameRuntimeAttestation } from "./secure-frame-contexts.js";
import { createGrokCookieRuntime } from "./grok-cookie-runtime.js";
import { createDebuggerSessionCoordinator } from "./debugger-session.js";
import { createNotionFramePreflightRuntime } from "./notion-frame-preflight.js";
import { createCustomUserscriptRuntime } from "./custom-userscript-runtime.js";
import { createOfficialRulesRuntime } from "./official-rules-runtime.js";
import { createStrictRuntimeConfigApplier } from "./runtime-config-application.js";
import { createFunctionalAnomalyStore } from "./functional-anomaly-store.js";
import { createWorkspacePromptHandoffRuntime } from "./workspace-prompt-handoff.js";
import { frameRouteError, normalizeFrameTransportError } from "./frame-command-errors.js";
import { invokeActiveRuntimeMethod } from "./main-world-runtime.js";
import {
  executeInRegisteredFrameWithDocumentFallback,
  sendMessageToRegisteredFrame as sendRegisteredFrameMessage,
  verifiedRegisteredFrameFallbackTarget as verifyRegisteredFrameFallbackTarget
} from "./registered-frame-transport.js";
import {
  injectContentBridge,
  relayContentFrameBinding
} from "./content-registration.js";
import {
  openableTabUrl,
  openExternalTab,
  openWorkspaceTab,
  registerActionListener
} from "./tab-runtime.js";
import { claimWorkspaceSessionRecovery, commitWorkspaceSessionRecovery, detachWorkspaceSessionMirror, dismissClearedWorkspaceTabs, focusWorkspaceTab, handleWorkspaceSessionAlarm, listClearedWorkspaceTabs, listLiveWorkspaceTabs, prepareWorkspaceSessionLifecycle, restoreClearedWorkspaceTabs, rotateWorkspaceSessionGeneration } from "./workspace-session.js";
import {
  createBackgroundRequestDispatcher,
  createBackgroundRequestListener
} from "./request-dispatcher.js";
import { withTimeout } from "./promise-timeout.js";
import * as trustedInput from "./trusted-input.js";
const chrome = globalThis.browser || globalThis.chrome;
if (!chrome) throw new Error("[ChatClub] Extension API namespace is unavailable");
const secureFrameCommands = new Set(Object.keys(FRAME_COMMAND_SPECS));
const shortcutActions = new Set(ALL_SHORTCUT_ACTIONS);
const secureFrameContextRegistry = createSecureFrameContextRegistry(chrome);
const {
  context: secureFrameContext,
  forgetFrame: forgetSecureFrameContext,
  forgetTab: forgetSecureTabContexts,
  frameContextToken,
  register: registerSecureFrameContext,
  registeredFrameContext,
  registeredSenderContext
} = secureFrameContextRegistry;
const authenticatedFrameRelay = createAuthenticatedFrameRelay({
  registeredSenderContext,
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
  relaySource: EXTENSION_RUNTIME_RELAY_SOURCE,
  shortcutActions,
  touchContext: secureFrameContextRegistry.touch,
  forgetContext: secureFrameContextRegistry.forgetContext
});
function extensionPageSender(sender = {}) {
  const extensionBase = chrome.runtime.getURL("");
  const senderUrl = String(sender?.url || "");
  return Boolean(extensionBase && senderUrl.startsWith(extensionBase));
}

function verifiedExtensionPageSender(sender = {}) {
  const tabId = sender?.tab?.id;
  const extensionBase = chrome.runtime.getURL("");
  if (
    (sender?.id && sender.id !== chrome.runtime.id)
    || !extensionPageSender(sender)
    || !Number.isInteger(tabId)
    || !String(sender?.tab?.url || "").startsWith(extensionBase)
  ) {
    throw new Error("Frame preparation requires the ChatClub extension page");
  }
  rememberKnownExtensionPageTab(tabId);
  return tabId;
}

const debuggerSessionCoordinator = createDebuggerSessionCoordinator(chrome);
const debuggerSessionDependencies = debuggerSessionCoordinator.available ? debuggerSessionCoordinator : undefined;
const notionFramePreflightRuntime = createNotionFramePreflightRuntime(chrome);
const grokCookieRuntime = createGrokCookieRuntime(chrome, {
  registeredFrameContext, verifiedExtensionPageSender, withTabDebugger: debuggerSessionDependencies?.withTabDebugger
});
const functionalAnomalyStore = createFunctionalAnomalyStore(chrome);
const workspacePromptHandoffRuntime = createWorkspacePromptHandoffRuntime(chrome, { openWorkspaceTab });
chrome.cookies?.onChanged?.addListener(grokCookieRuntime.handleCookieChange);

async function relayRegisteredFrameNavigation(details = {}, phase = "before") {
  const tabId = Number(details.tabId);
  const frameId = Number(details.frameId);
  if (
    !Number.isInteger(tabId)
    || !Number.isInteger(frameId)
    || frameId <= 0
    || Number(details.parentFrameId) !== 0
    || !/^https?:\/\//i.test(String(details.url || ""))
  ) return;
  const registered = await registeredFrameContext(tabId, frameId);
  if (!registered) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!String(tab?.url || "").startsWith(chrome.runtime.getURL(""))) return;
  await chrome.runtime.sendMessage({
    source: EXTENSION_RUNTIME_RELAY_SOURCE,
    action: "frameNavigationTarget",
    senderContext: {
      tabId,
      frameId,
      bridgeDocumentId: registered.token,
      frameBindingId: registered.context.frameBindingId,
      browserDocumentId: registered.context.browserDocumentId
    },
    data: {
      href: String(details.url || ""),
      phase,
      browserDocumentId: String(details.documentId || "")
    }
  }).catch(() => {});
}

chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
  notionFramePreflightRuntime.beginNavigation(details).catch(() => {});
  if (grokCookieRuntime.handleBeforeNavigate(details)) return;
  relayRegisteredFrameNavigation(details, "before").catch(() => {});
});
chrome.webNavigation?.onCommitted?.addListener((details) => {
  const committedAt = Date.now();
  (async () => {
    const grokNavigationClaimed = grokCookieRuntime.handleCommittedNavigation(details);
    if (Number(details?.frameId) === 0 && Number.isInteger(details?.tabId)) {
      await forgetSecureTabContexts(Number(details.tabId), { registeredBefore: committedAt });
      return;
    }
    if (!grokNavigationClaimed) await relayRegisteredFrameNavigation(details, "committed");
    if (
      Number(details?.parentFrameId) === 0
      && Number.isInteger(details?.tabId)
      && Number.isInteger(details?.frameId)
      && Number(details.frameId) > 0
    ) {
      await forgetSecureFrameContext(Number(details.tabId), Number(details.frameId), {
        documentId: String(details.documentId || ""),
        registeredBefore: committedAt
      });
    }
  })().catch(() => {});
});
chrome.webNavigation?.onErrorOccurred?.addListener((details) => { grokCookieRuntime.handleNavigationError(details); });

chrome.tabs?.onRemoved?.addListener((tabId, removeInfo) => {
  forgetKnownExtensionPageTab(tabId);
  notionFramePreflightRuntime.handleTabRemoved(tabId).catch(() => {});
  workspacePromptHandoffRuntime.handleTabRemoved(tabId).catch(() => {});
  grokCookieRuntime.handleTabRemoved(tabId);
  forgetSecureTabContexts(tabId)
    .catch((error) => console.warn(`[${APP_NAME}] closed tab secure frame contexts could not be removed`, error));
  detachWorkspaceSessionMirror(chrome, tabId, removeInfo)
    .catch((error) => console.warn(`[${APP_NAME}] closed tab workspace session mirror could not be detached`, error));
});
chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  const changedUrl = String(changeInfo?.url || "");
  const url = changedUrl || String(tab?.url || "");
  if (!url) return;
  if (changedUrl) workspacePromptHandoffRuntime.handleTabUpdated(tabId, changedUrl).catch(() => {});
  if (url.startsWith(chrome.runtime.getURL(""))) rememberKnownExtensionPageTab(tabId);
  else if (changedUrl || extensionPageTabTracked(tabId)) forgetKnownExtensionPageTab(tabId);
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
  rememberKnownExtensionPageTab(requested);
  return requested;
}

const verifiedRegisteredFrameFallbackTarget = (context) => verifyRegisteredFrameFallbackTarget(chrome, context);

const sendMessageToRegisteredFrame = (context, message) => sendRegisteredFrameMessage(
  chrome,
  context,
  message,
  verifiedRegisteredFrameFallbackTarget
);

async function executeMainWorldFrameCommand(context, command, data = {}) {
  if (!new Set(["prepareNavigationFocusGuard", "adoptNavigationFocusGuard"]).has(command)) {
    throw frameRouteError("REMOTE_ERROR", `Unknown MAIN-world frame command: ${command}`, false);
  }
  const execute = (injectionTarget) => chrome.scripting.executeScript({
    target: injectionTarget,
    world: "MAIN",
    func: invokeActiveRuntimeMethod,
    args: [
      CONTENT_RUNTIME_REGISTRY_KEY,
      RUNTIME_REGISTRY_ABI_VERSION,
      CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
      NAVIGATION_FOCUS_GUARD_RUNTIME,
      NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
      "prepare",
      {
        ...data,
        phase: command === "adoptNavigationFocusGuard" ? "adopt" : "prepare"
      }
    ]
  });
  let results;
  try {
    results = await executeInRegisteredFrameWithDocumentFallback(
      context,
      execute,
      verifiedRegisteredFrameFallbackTarget
    );
  } catch (error) {
    throw normalizeFrameTransportError(error);
  }
  const entries = Array.isArray(results) ? results : [];
  const exactDocumentResult = context.documentId
    ? entries.find((entry) => entry?.documentId === context.documentId) || null
    : null;
  if (context.documentId && entries.some((entry) => entry?.documentId) && !exactDocumentResult) {
    throw frameRouteError("STALE_DOCUMENT", "MAIN-world command returned from a different document", true);
  }
  const result = exactDocumentResult || entries[0] || null;
  if (result?.error) {
    throw frameRouteError("REMOTE_ERROR", String(result.error?.message || result.error), true, result.error);
  }
  if (!result || result.result === undefined) {
    throw frameRouteError("REMOTE_ERROR", "Navigation focus guard returned no result", true);
  }
  return result.result;
}

async function sendSecureFrameCommand(message = {}, sender = {}) {
  await officialRulesRuntime.configurationReady;
  const tabId = await verifiedExtensionTabId(message, sender);
  const context = await secureFrameContext(message.bridgeDocumentId);
  if (!context || context.tabId !== tabId) {
    throw frameRouteError("NOT_REGISTERED", "Secure frame document is not registered in this tab", false);
  }
  if (!contentRuntimePackageBundleIdentityMatches(context.runtimeIdentity, "content/content.js")) {
    throw frameRouteError("STALE_DOCUMENT", "Secure frame runtime generation is stale", false);
  }
  const command = String(message.command || "");
  if (!secureFrameCommands.has(command)) {
    throw frameRouteError("REMOTE_ERROR", `Secure frame command is not allowed: ${command}`, false);
  }
  if (command === "deleteThread") {
    try {
      await officialRulesRuntime.assertDestructiveOperationsAllowed();
    } catch (error) {
      throw frameRouteError("REMOTE_ERROR", error?.message || "Delete is disabled while configuration recovery is required", false);
    }
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
    response = await withTimeout(
      request,
      timeoutMs,
      `[FrameRPC] Timeout waiting for response: ${command}`
    );
  } catch (error) {
    throw normalizeFrameTransportError(error);
  }
  if (FRAME_COMMAND_SPECS[command]?.transport !== "main-world" && !response?.success) {
    if (response?.code === "CAPABILITY_UNAVAILABLE" && response?.delivered === false) {
      throw frameRouteError(
        "INJECTION_FAILED",
        response?.error || `Content capability is unavailable: ${String(response?.capability || "unknown")}`,
        false
      );
    }
    throw frameRouteError("REMOTE_ERROR", response?.error || `Secure frame command failed: ${command}`, true);
  }
  if (!secureFrameContextRegistry.touch(frameContextToken(message.bridgeDocumentId), context)) {
    throw frameRouteError("STALE_DOCUMENT", "Secure frame document changed while the command was in flight", true);
  }
  return FRAME_COMMAND_SPECS[command]?.transport === "main-world" ? response : response.data;
}

async function verifySecureFrameContext(message = {}, sender = {}) {
  const tabId = await verifiedExtensionTabId(message, sender);
  const token = frameContextToken(message.bridgeDocumentId);
  const context = await secureFrameContext(token);
  if (!context || context.tabId !== tabId) throw new Error("Secure frame document is not registered in this tab");
  if (!contentRuntimePackageBundleIdentityMatches(context.runtimeIdentity, "content/content.js")) {
    throw new Error("Secure frame runtime generation is stale");
  }
  const response = await withTimeout(
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
  if (!secureFrameContextRegistry.touch(token, context)) {
    throw new Error("Secure frame document changed during registration verification");
  }
  const grokCookieRuntime = normalizeSecureFrameRuntimeAttestation(response.data.grokCookieRuntime);
  return {
    href: String(response.data.href || context.url || ""),
    title: String(response.data.title || ""),
    bridgeVersion: String(context.bridgeVersion || ""),
    runtimeIdentity: normalizeContentRuntimeIdentity(context.runtimeIdentity),
    frameId: context.frameId,
    frameBindingId: String(context.frameBindingId || ""),
    browserDocumentId: String(context.browserDocumentId || context.documentId || ""),
    grokCookieRuntime
  };
}

async function dispatchTrustedClick(message = {}, sender = {}) {
  await officialRulesRuntime.configurationReady;
  await officialRulesRuntime.assertDestructiveOperationsAllowed();
  if (!("debugger" in chrome)) throw new Error("Trusted browser click is unavailable in this browser; complete the visible confirmation manually.");
  return trustedInput.dispatchTrustedClick(chrome, message, sender, debuggerSessionDependencies);
}

async function dispatchTrustedMouseMove(message = {}, sender = {}) {
  await officialRulesRuntime.configurationReady;
  await officialRulesRuntime.assertDestructiveOperationsAllowed();
  if (!("debugger" in chrome)) throw new Error("Trusted browser hover is unavailable in this browser; open the row menu manually and retry.");
  return trustedInput.dispatchTrustedMouseMove(chrome, message, sender, debuggerSessionDependencies);
}

async function dispatchTrustedKeySequence(message = {}, sender = {}) {
  await officialRulesRuntime.configurationReady;
  await officialRulesRuntime.assertDestructiveOperationsAllowed();
  if (!("debugger" in chrome)) throw new Error("Trusted browser key input is unavailable in this browser; finish the delete action manually.");
  return trustedInput.dispatchTrustedKeySequence(chrome, message, sender, debuggerSessionDependencies);
}

async function ensureContentBridge(message = {}, sender = {}) {
  await officialRulesRuntime.configurationReady;
  const tabId = await verifiedExtensionTabId({ appTabId: message.tabId }, sender);
  return injectContentBridge(chrome, tabId, message);
}

async function requestContentFrameBinding(message = {}, sender = {}) {
  await officialRulesRuntime.configurationReady;
  const tabId = await verifiedExtensionTabId({ appTabId: message.tabId }, sender);
  return relayContentFrameBinding(chrome, tabId, message);
}

const knownExtensionPageTabIds = new Set();
const candidateExtensionPageTabIds = new Set();
const revokedExtensionPageTabIds = new Set();
const extensionPageTabRevisions = new Map();

function advanceExtensionPageTabRevision(tabId) {
  extensionPageTabRevisions.set(tabId, (extensionPageTabRevisions.get(tabId) || 0) + 1);
}

function rememberKnownExtensionPageTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  advanceExtensionPageTabRevision(tabId);
  revokedExtensionPageTabIds.delete(tabId);
  candidateExtensionPageTabIds.add(tabId);
  knownExtensionPageTabIds.add(tabId);
}

function discoverExtensionPageTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0 || revokedExtensionPageTabIds.has(tabId)) return;
  candidateExtensionPageTabIds.add(tabId);
  knownExtensionPageTabIds.add(tabId);
}

function extensionPageTabTracked(tabId) {
  return candidateExtensionPageTabIds.has(tabId) || knownExtensionPageTabIds.has(tabId);
}

function normalizedPreferredTabIds(values) {
  return (Array.isArray(values) ? values : [values])
    .filter((value) => Number.isInteger(value) && value >= 0);
}

async function currentExtensionPageTabIds(preferredTabIds = []) {
  const extensionBase = chrome.runtime.getURL("");
  const preferred = normalizedPreferredTabIds(preferredTabIds);
  for (const tabId of preferred) {
    if (!revokedExtensionPageTabIds.has(tabId)) {
      candidateExtensionPageTabIds.add(tabId);
      knownExtensionPageTabIds.add(tabId);
    }
  }
  const queryRevisions = new Map(extensionPageTabRevisions);
  try {
    const tabs = await chrome.tabs.query({});
    const changedKnownTabIds = Array.from(knownExtensionPageTabIds).filter((tabId) => (
      (queryRevisions.get(tabId) || 0) !== (extensionPageTabRevisions.get(tabId) || 0)
    ));
    knownExtensionPageTabIds.clear();
    for (const tabId of changedKnownTabIds) knownExtensionPageTabIds.add(tabId);
    for (const tab of tabs || []) {
      if (!Number.isInteger(tab?.id)) continue;
      if ((queryRevisions.get(tab.id) || 0) !== (extensionPageTabRevisions.get(tab.id) || 0)) continue;
      if (String(tab?.url || "").startsWith(extensionBase)) discoverExtensionPageTab(tab.id);
      else if (candidateExtensionPageTabIds.has(tab.id) || preferred.includes(tab.id)) {
        candidateExtensionPageTabIds.delete(tab.id);
        revokedExtensionPageTabIds.add(tab.id);
      }
    }
    const observedTabIds = new Set((tabs || []).map((tab) => tab?.id).filter(Number.isInteger));
    for (const tabId of preferred) {
      if (!observedTabIds.has(tabId) && !revokedExtensionPageTabIds.has(tabId)) {
        candidateExtensionPageTabIds.add(tabId);
        knownExtensionPageTabIds.add(tabId);
      }
    }
  } catch (error) {
    console.warn(`[${APP_NAME}] Extension page tabs could not be listed for frame rules`, error);
  }
  for (const tabId of revokedExtensionPageTabIds) knownExtensionPageTabIds.delete(tabId);
  return Array.from(knownExtensionPageTabIds).sort((a, b) => a - b);
}

const runtimeConfigApplier = createStrictRuntimeConfigApplier(chrome, {
  notionFramePreflightRuntime,
  currentExtensionPageTabIds
});
const officialRulesRuntime = createOfficialRulesRuntime(chrome, {
  applyConfiguration: runtimeConfigApplier.apply,
  afterReset: (workspaceSessionGeneration) => (
    rotateWorkspaceSessionGeneration(chrome, workspaceSessionGeneration)
  )
});
const customUserscriptRuntime = createCustomUserscriptRuntime(chrome, {
  loadOptions: officialRulesRuntime.loadOptions,
  loadCustomConfig: officialRulesRuntime.loadCustomConfig
});
let runtimeContentScriptsReady = false;
const updateDnrRules = async (preferredTabIds = [], options = {}) => {
  const forceContentScriptRefresh = options.forceContentScriptRefresh === true;
  const applied = await officialRulesRuntime.reloadConfiguration({
    preferredTabIds,
    forceContentScriptRefresh
  });
  if (forceContentScriptRefresh) {
    await chrome.storage.local.set({
      [CONTENT_SCRIPT_REGISTRATION_MARKER_KEY]: CONTENT_RUNTIME_IMPLEMENTATION_VERSION
    }).catch((error) => {
      console.warn(`[${APP_NAME}] content script registration freshness marker could not be saved`, error);
    });
  }
  runtimeContentScriptsReady = true;
  return String(applied?.mode || applied || "");
};

function isStaleContentRuntimeRegistrationError(error) {
  return /secure frame runtime identity does not match packaged bundle content\/content\.js/i
    .test(String(error?.message || error || ""));
}

let runtimeStartupReconciliation = null;

function reconcileRuntimeAtStartup() {
  if (runtimeContentScriptsReady) return Promise.resolve("");
  if (!runtimeStartupReconciliation) {
    runtimeStartupReconciliation = (async () => {
      const stored = await chrome.storage.local.get(CONTENT_SCRIPT_REGISTRATION_MARKER_KEY);
      // App bootstrap may have completed while the browser-startup pass was
      // waiting on storage. Do not start a second registration replacement.
      if (runtimeContentScriptsReady) return "";
      return updateDnrRules([], {
        forceContentScriptRefresh: stored?.[CONTENT_SCRIPT_REGISTRATION_MARKER_KEY]
          !== CONTENT_RUNTIME_IMPLEMENTATION_VERSION
      });
    })()
      .catch((error) => {
        runtimeStartupReconciliation = null;
        console.error(`[${APP_NAME}] startup runtime reconciliation failed`, error);
        return "";
      });
  }
  return runtimeStartupReconciliation;
}

function forgetKnownExtensionPageTab(tabId) {
  if (!Number.isInteger(tabId)) return;
  const wasCandidate = candidateExtensionPageTabIds.delete(tabId);
  const wasKnown = knownExtensionPageTabIds.delete(tabId);
  advanceExtensionPageTabRevision(tabId);
  revokedExtensionPageTabIds.add(tabId);
  if (!wasCandidate && !wasKnown) return;
  updateDnrRules().catch((error) => {
    console.warn(`[${APP_NAME}] Inactive extension tab frame rules could not be refreshed`, error);
  });
}

function reloadRuntimeConfig(preferredTabId = null, options = {}) {
  return updateDnrRules(preferredTabId, options);
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
  await officialRulesRuntime.handleInstalled();
  await workspaceSessionReady;
  await updateDnrRules([], { forceContentScriptRefresh: true }).catch((error) => {
    console.error(`[${APP_NAME}] content runtime refresh after install/update failed`, error);
  });
});

chrome.runtime.onStartup?.addListener(() => {
  officialRulesRuntime.handleStartup()
    .then(() => reconcileRuntimeAtStartup())
    .catch((error) => console.error(`[${APP_NAME}] startup runtime setup failed`, error));
  prepareWorkspaceSessionLifecycleSafely("startup", { reason: "startup" });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  notionFramePreflightRuntime.handleAlarm(alarm).catch(() => {});
  workspacePromptHandoffRuntime.handleAlarm(alarm).catch(() => {});
  officialRulesRuntime.handleAlarm(alarm).catch((error) => console.error(`[${APP_NAME}] official-rules alarm failed`, error));
  handleWorkspaceSessionAlarm(chrome, alarm).catch((error) => console.warn(`[${APP_NAME}] workspace session user-close alarm failed`, error));
});

registerActionListener(chrome);
notionFramePreflightRuntime.initialize().catch(() => {});
workspacePromptHandoffRuntime.initialize().catch(() => {});
prepareWorkspaceSessionLifecycleSafely("runtime start", { reason: "runtime-start" });

const REQUEST = BACKGROUND_REQUEST_ACTIONS;
const AUTHORIZE = BACKGROUND_REQUEST_AUTHORIZERS;

const backgroundRequestHandlers = [
  [REQUEST.CLAIM_WORKSPACE_SESSION_RECOVERY, (message, sender) => claimWorkspaceSessionRecovery(chrome, message, sender)],
  [REQUEST.COMMIT_WORKSPACE_SESSION_RECOVERY, (message, sender) => commitWorkspaceSessionRecovery(chrome, message, sender)],
  [REQUEST.LIST_CLEARED_WORKSPACE_TABS, () => listClearedWorkspaceTabs(chrome)], [REQUEST.LIST_LIVE_WORKSPACE_TABS, (_message, sender) => listLiveWorkspaceTabs(chrome, {}, sender)],
  [REQUEST.FOCUS_WORKSPACE_TAB, (message, sender) => focusWorkspaceTab(chrome, message, sender)], [REQUEST.RESTORE_CLEARED_WORKSPACE_TABS, (message, sender) => restoreClearedWorkspaceTabs(chrome, message, sender)],
  [REQUEST.DISMISS_CLEARED_WORKSPACE_TABS, () => dismissClearedWorkspaceTabs(chrome)],
  ...workspacePromptHandoffRuntime.requestHandlers(REQUEST),
  [REQUEST.REGISTER_FRAME_CONTEXT, async (message, sender) => {
    let context;
    try {
      context = await registerSecureFrameContext(message, sender);
    } catch (error) {
      if (isStaleContentRuntimeRegistrationError(error)) {
        await updateDnrRules([], { forceContentScriptRefresh: true });
      }
      throw error;
    }
    await notionFramePreflightRuntime.settleRegisteredFrame(sender).catch(() => 0);
    return {
      documentId: context.documentId,
      browserDocumentId: context.browserDocumentId,
      frameId: context.frameId,
      runtimeIdentity: CONTENT_BRIDGE_RUNTIME_IDENTITY
    };
  }],
  [REQUEST.SEND_FRAME_COMMAND, async (message, sender) => ({
    data: await sendSecureFrameCommand(message, sender)
  })],
  [REQUEST.VERIFY_FRAME_CONTEXT, async (message, sender) => ({
    data: await verifySecureFrameContext(message, sender)
  })],
  [REQUEST.RELAY_SHORTCUT_TRIGGERED, async (message, sender) => {
    await authenticatedFrameRelay.shortcutTriggered(message, sender);
  }],
  [REQUEST.RELAY_FRAME_BINDING, async (message, sender) => {
    await authenticatedFrameRelay.frameBinding(message, sender);
  }],
  [REQUEST.RELAY_FRAME_LIFECYCLE, async (message, sender) => {
    await authenticatedFrameRelay.frameLifecycle(message, sender);
  }],
  [REQUEST.RELOAD_CONFIGS, async (message, _sender, tabId) => {
    const reason = String(message?.data?.reason || "").trim().toLowerCase();
    const forceContentScriptRefresh = reason === "app-init";
    // App bootstrap must own the first runtime reconciliation. The service
    // worker can be waking from a browser restore at the same time; waiting
    // for an unrelated best-effort startup pass used to let the extension
    // page hydrate restored iframes before the managed registrations were
    // replaced. That leaves the old content-runtime generation alive inside
    // the restored frame and every model bridge call then fails.
    const mode = await reloadRuntimeConfig(tabId, {
      // The extension page waits for this request before hydrating/restoring
      // frames. Rebuild managed registrations first so a browser restart never
      // opens a restored document with the previous content-runtime generation.
      forceContentScriptRefresh
    });
    return {
      mode,
      contentScriptsRefreshed: forceContentScriptRefresh
    };
  }],
  ...grokCookieRuntime.requestHandlers(REQUEST, { updateDnrRules: notionFramePreflightRuntime.dnrRuleUpdater(updateDnrRules) }),
  [REQUEST.CANCEL_NOTION_FRAME_LOAD, async (message, sender) => ({ cancelled: await notionFramePreflightRuntime.cancelFrameLoad(message, verifiedExtensionPageSender(sender)) })],
  [REQUEST.GET_CONFIG_INFO, async () => ({
    options: await officialRulesRuntime.loadOptions(),
    customConfig: await officialRulesRuntime.loadCustomConfig(),
    contentScripts: await chrome.scripting.getRegisteredContentScripts()
  })],
  ...officialRulesRuntime.requestHandlers(REQUEST, {
    beforeReset: (tabId) => grokCookieRuntime.removeAllManagedPartitions(tabId),
    afterReset: (_tabId, workspaceSessionGeneration) => (
      rotateWorkspaceSessionGeneration(chrome, workspaceSessionGeneration)
    )
  }),
  ...customUserscriptRuntime.requestHandlers(REQUEST, {
    assertDeleteAllowed: () => officialRulesRuntime.assertDestructiveOperationsAllowed()
  }),
  [REQUEST.ENSURE_CONTENT_BRIDGE, (message, sender) => ensureContentBridge(message, sender)],
  [REQUEST.REQUEST_FRAME_BINDING, (message, sender) => requestContentFrameBinding(message, sender)],
  [REQUEST.DISPATCH_TRUSTED_CLICK, (message, sender) => dispatchTrustedClick(message, sender)],
  [REQUEST.DISPATCH_TRUSTED_MOUSE_MOVE, (message, sender) => dispatchTrustedMouseMove(message, sender)],
  [REQUEST.DISPATCH_TRUSTED_KEY_SEQUENCE, (message, sender) => dispatchTrustedKeySequence(message, sender)],
  [REQUEST.RECORD_FUNCTIONAL_ANOMALIES, async (message) => functionalAnomalyStore.record(message)],
  [REQUEST.LIST_FUNCTIONAL_ANOMALIES, async () => ({ records: await functionalAnomalyStore.list() })],
  [REQUEST.REMOVE_FUNCTIONAL_ANOMALIES, async (message) => ({ records: await functionalAnomalyStore.remove(message.id) })],
  [REQUEST.CLEAR_FUNCTIONAL_ANOMALIES, async () => ({ records: await functionalAnomalyStore.clear() })],
  [REQUEST.OPEN_WORKSPACE_TAB, async (message, sender) => {
    const tab = await openWorkspaceTab(chrome, sender, null, { workspaceId: message.workspaceId });
    if (!Number.isInteger(tab?.id)) throw new Error("New workspace tab is unavailable");
    return { tabId: tab.id };
  }],
  [REQUEST.OPEN_TAB, async (message, sender) => {
    const url = openableTabUrl(message.url);
    if (!url) throw new Error("Invalid tab URL");
    await openExternalTab(chrome, url, sender, message.openerTab);
  }]
];

const dispatchBackgroundRequest = createBackgroundRequestDispatcher(
  BACKGROUND_REQUEST_SPECS,
  backgroundRequestHandlers,
  {
    [AUTHORIZE.EXTENSION_PAGE]: (_message, sender) => verifiedExtensionPageSender(sender),
    [AUTHORIZE.DIRECT_CHILD_FRAME]: (_message, sender) => verifiedDirectChildFrameContext(chrome, sender),
    [AUTHORIZE.REGISTERED_FRAME]: (message, sender) => registeredSenderContext(message, sender),
    [AUTHORIZE.GROK_FRAME]: (_message, sender) => grokCookieRuntime.verifiedFrameSender(sender)
  }
);

chrome.runtime.onMessage.addListener(createBackgroundRequestListener(dispatchBackgroundRequest));

officialRulesRuntime.configurationReady.catch((error) => console.error(`[${APP_NAME}] initial configuration failed`, error));
