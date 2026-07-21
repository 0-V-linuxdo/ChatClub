import { APP_NAME } from "../shared/constants.js";
import { buildDynamicDnrRules } from "../shared/dnr.js";
import { getAllChatApps } from "../shared/storage-schema.js";
import { loadCustomConfig, loadOptions, saveOptions } from "../shared/storage-adapter.js";
import { FRAME_COMMAND_SPECS } from "../shared/frame-commands.js";
import { ALL_SHORTCUT_ACTIONS } from "../shared/shortcuts.js";
import {
  normalizeContentRuntimeIdentity
} from "../shared/content-runtime-identity.js";
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
import { verifiedDirectChildFrameContext } from "./frame-injection.js";
import { createAuthenticatedFrameRelay } from "./frame-relay.js";
import { createSecureFrameContextRegistry } from "./secure-frame-contexts.js";
import { createGrokCookieRuntime } from "./grok-cookie-runtime.js";
import { createCustomUserscriptRuntime } from "./custom-userscript-runtime.js";
import { createFunctionalAnomalyStore } from "./functional-anomaly-store.js";
import {
  frameRouteError,
  normalizeFrameTransportError
} from "./frame-command-errors.js";
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
import { registerContentScripts } from "./content-script-registration.js";
import {
  openableTabUrl,
  openExternalTab,
  registerActionListener
} from "./tab-runtime.js";
import { claimWorkspaceSessionRecovery, commitWorkspaceSessionRecovery, detachWorkspaceSessionMirror, prepareWorkspaceSessionLifecycle, rotateWorkspaceSessionGeneration } from "./workspace-session.js";
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
  rememberContext: secureFrameContextRegistry.remember
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
  return tabId;
}

const grokCookieRuntime = createGrokCookieRuntime(chrome, { verifiedExtensionPageSender });
const customUserscriptRuntime = createCustomUserscriptRuntime(chrome);
const functionalAnomalyStore = createFunctionalAnomalyStore(chrome);
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
  relayRegisteredFrameNavigation(details, "before").catch(() => {});
});
chrome.webNavigation?.onCommitted?.addListener((details) => {
  relayRegisteredFrameNavigation(details, "committed").catch(() => {});
});

chrome.tabs?.onRemoved?.addListener((tabId, removeInfo) => {
  grokCookieRuntime.handleTabRemoved(tabId);
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
  context.registeredAt = Date.now();
  secureFrameContextRegistry.remember(frameContextToken(message.bridgeDocumentId), context);
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
  return {
    href: String(response.data.href || context.url || ""),
    title: String(response.data.title || ""),
    bridgeVersion: String(context.bridgeVersion || ""),
    runtimeIdentity: normalizeContentRuntimeIdentity(context.runtimeIdentity),
    frameId: context.frameId,
    frameBindingId: String(context.frameBindingId || ""),
    browserDocumentId: String(context.browserDocumentId || context.documentId || "")
  };
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

const REQUEST = BACKGROUND_REQUEST_ACTIONS;
const AUTHORIZE = BACKGROUND_REQUEST_AUTHORIZERS;

const backgroundRequestHandlers = [
  [REQUEST.CLAIM_WORKSPACE_SESSION_RECOVERY, (message, sender) => (
    claimWorkspaceSessionRecovery(chrome, message, sender)
  )],
  [REQUEST.COMMIT_WORKSPACE_SESSION_RECOVERY, (message, sender) => (
    commitWorkspaceSessionRecovery(chrome, message, sender)
  )],
  [REQUEST.REGISTER_FRAME_CONTEXT, async (message, sender) => {
    const context = await registerSecureFrameContext(message, sender);
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
  [REQUEST.RELOAD_CONFIGS, async () => {
    await reloadRuntimeConfig();
  }],
  ...grokCookieRuntime.requestHandlers(REQUEST, { updateDnrRules }),
  [REQUEST.GET_CONFIG_INFO, async () => ({
    options: await loadOptions(),
    customConfig: await loadCustomConfig(),
    contentScripts: await chrome.scripting.getRegisteredContentScripts()
  })],
  [REQUEST.RESET_CONFIG, async () => {
    await grokCookieRuntime.removeAllManagedPartitions();
    await chrome.storage.local.clear();
    const workspaceSessionGeneration = await rotateWorkspaceSessionGeneration(chrome);
    const options = await saveOptions({});
    await reloadRuntimeConfig();
    return { options, workspaceSessionGeneration };
  }],
  ...customUserscriptRuntime.requestHandlers(REQUEST),
  [REQUEST.ENSURE_CONTENT_BRIDGE, (message, sender) => ensureContentBridge(message, sender)],
  [REQUEST.REQUEST_FRAME_BINDING, (message, sender) => requestContentFrameBinding(message, sender)],
  [REQUEST.DISPATCH_TRUSTED_CLICK, (message, sender) => dispatchTrustedClick(message, sender)],
  [REQUEST.DISPATCH_TRUSTED_MOUSE_MOVE, (message, sender) => dispatchTrustedMouseMove(message, sender)],
  [REQUEST.DISPATCH_TRUSTED_KEY_SEQUENCE, (message, sender) => dispatchTrustedKeySequence(message, sender)],
  [REQUEST.RECORD_FUNCTIONAL_ANOMALIES, async (message) => functionalAnomalyStore.record(message)],
  [REQUEST.LIST_FUNCTIONAL_ANOMALIES, async () => ({ records: await functionalAnomalyStore.list() })],
  [REQUEST.REMOVE_FUNCTIONAL_ANOMALIES, async (message) => ({ records: await functionalAnomalyStore.remove(message.id) })],
  [REQUEST.CLEAR_FUNCTIONAL_ANOMALIES, async () => ({ records: await functionalAnomalyStore.clear() })],
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

reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] initial reload failed`, error));
