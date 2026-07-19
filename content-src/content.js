import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { DEFAULT_SHORTCUT_CONFIG } from "../shared/default-shortcuts.js";
import {
  REGISTER_FRAME_CONTEXT_REQUEST,
  RELAY_FRAME_BINDING_REQUEST,
  RELAY_FRAME_LIFECYCLE_REQUEST,
  RELAY_SHORTCUT_TRIGGERED_REQUEST
} from "../shared/content-background-requests.js";
import { CONTENT_RUNTIME_CONTENT_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import {
  KEYBOARD_PLATFORM_MAC,
  detectKeyboardPlatform,
  matchShortcut,
  normalizeKeyboardPlatform,
  normalizeShortcutConfig
} from "../shared/shortcuts.js";
import { normalize, pageMeta } from "./shared/summary-runtime.js";
import { createContentDocumentIdentity } from "./shared/content-document-identity.js";
import { createSubmissionNavigationTracker } from "./shared/submission-navigation.js";
import { runtimeRegistry } from "./shared/runtime-registry.js";
import { contentCommandRouter, installContentCapability } from "./shared/command-router.js";
import { installSecureFrameRpc } from "./shared/secure-frame-rpc.js";
import { requestBackground } from "./shared/extension-runtime.js";

function installContentBridge() {
  const PROTOCOL = CONTENT_PROTOCOL;
  const runtimes = runtimeRegistry(window);
  const CONTENT_RUNTIME_IDENTITY = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_CONTENT_BUNDLE_IDENTITY);
  runtimes.registerBundle(CONTENT_RUNTIME_IDENTITY);
  const commandRouter = contentCommandRouter(runtimes, CONTENT_RUNTIME_IDENTITY.implementationVersion);
  const EXTENSION_API = globalThis.browser || globalThis.chrome;
  const EXTENSION_ORIGIN = (() => {
    try {
      return String(EXTENSION_API?.runtime?.getURL?.("") || "").match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i)?.[0] || "";
    } catch {
      return "";
    }
  })();
  const SOURCE = PROTOCOL.GENERIC_POST_MESSAGE_SOURCE;
  const MAIN_WORLD_LOCATION_SOURCE = PROTOCOL.MAIN_WORLD_LOCATION_SOURCE;
  const NOTION_SEND_ACTIVATED_EVENT = PROTOCOL.NOTION_SEND_ACTIVATED_EVENT;
  const GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE = "data-chatclub-gemini-model-picker-run";
  const CONTENT_BRIDGE_VERSION = PROTOCOL.CONTENT_BRIDGE_VERSION;
  const CONTENT_RUNTIME_VERSION = CONTENT_RUNTIME_IDENTITY.implementationVersion;
  const FRAME_BINDING_POST_MESSAGE_SOURCE = PROTOCOL.FRAME_BINDING_POST_MESSAGE_SOURCE;
  const SEND_TEXT_POST_MESSAGE_SOURCE = PROTOCOL.SEND_TEXT_POST_MESSAGE_SOURCE;
  const DELETE_THREAD_POST_MESSAGE_SOURCE = PROTOCOL.DELETE_THREAD_POST_MESSAGE_SOURCE;
  const PREFERRED_MODEL_POST_MESSAGE_SOURCE = PROTOCOL.PREFERRED_MODEL_POST_MESSAGE_SOURCE;
  const SECURE_FRAME_COMMAND_SOURCE = PROTOCOL.SECURE_FRAME_COMMAND_SOURCE;
  const MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = PROTOCOL.MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE;
  const SUMMARY_POST_MESSAGE_SOURCE = PROTOCOL.SUMMARY_POST_MESSAGE_SOURCE;
  const { contentDocumentId, secureFrameToken, currentBrowserDocumentAttestationId, currentFrameBindingId } = createContentDocumentIdentity(window);
  let contentLocationRevision = Math.max(0, Number(window.__CHATCLUB_CONTENT_LOCATION_REVISION__) || 0);
  const submissionNavigation = createSubmissionNavigationTracker(window);
  const markSubmissionNavigation = submissionNavigation.mark;
  const clearSubmissionNavigation = submissionNavigation.clear;
  const currentSubmissionNavigation = submissionNavigation.current;
  const clearSubmissionNavigationForTrustedIntent = submissionNavigation.clearForTrustedIntent;
  function abortActivePreferredModelRun(reason = "preferred model apply cancelled", runId = "") {
    commandRouter.dispatch("cancelPreferredModelApply", { reason, runId }).catch(() => {});
    return true;
  }

  function contentLifecycleData() {
    return {
      documentId: contentDocumentId,
      frameBindingId: currentFrameBindingId(),
      bridgeVersion: CONTENT_BRIDGE_VERSION,
      runtimeIdentity: CONTENT_RUNTIME_IDENTITY,
      href: location.href,
      title: String(document.title || "").replace(/\s+/g, " ").trim()
    };
  }

  function announceContentRegistration() {
    return requestBackground(REGISTER_FRAME_CONTEXT_REQUEST, {
      bridgeDocumentId: contentDocumentId,
      browserDocumentId: currentBrowserDocumentAttestationId(),
      secureFrameToken,
      frameBindingId: currentFrameBindingId(),
      bridgeVersion: CONTENT_BRIDGE_VERSION,
      runtimeIdentity: CONTENT_RUNTIME_IDENTITY
    }).catch((error) => {
      console.warn("[ChatClub] Secure frame registration failed", error);
    });
  }

  async function relayFrameBindingChallenge(message = {}) {
    const challenge = String(message.challenge || "");
    const generation = Number(message.generation);
    const expectedBindingId = String(message.expectedBindingId || "");
    const browserDocumentId = String(message.browserDocumentId || "").trim();
    if (
      !/^[a-f0-9]{64}$/i.test(challenge)
      || !Number.isSafeInteger(generation)
      || generation <= 0
      || !/^[a-f0-9]{64}$/i.test(expectedBindingId)
      || !browserDocumentId
      || (/^legacy:/i.test(browserDocumentId) && browserDocumentId !== currentBrowserDocumentAttestationId())
    ) return false;
    const bootstrap = String(globalThis.__CHATCLUB_FRAME_BINDING_ID__ || "");
    if (bootstrap && bootstrap !== expectedBindingId) return false;
    if (!bootstrap) {
      Object.defineProperty(globalThis, "__CHATCLUB_FRAME_BINDING_ID__", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: expectedBindingId
      });
    }
    const registration = await requestBackground(REGISTER_FRAME_CONTEXT_REQUEST, {
      bridgeDocumentId: contentDocumentId,
      browserDocumentId: currentBrowserDocumentAttestationId(),
      secureFrameToken,
      frameBindingId: expectedBindingId,
      bridgeVersion: CONTENT_BRIDGE_VERSION,
      runtimeIdentity: CONTENT_RUNTIME_IDENTITY
    });
    if (!registration?.success) throw new Error(registration?.error || "Secure frame registration failed");
    const relayed = await requestBackground(RELAY_FRAME_BINDING_REQUEST, {
      bridgeDocumentId: contentDocumentId,
      browserDocumentId,
      frameBindingId: expectedBindingId,
      challenge,
      generation
    });
    if (!relayed?.success) throw new Error(relayed?.error || "Secure frame binding relay failed");
    return true;
  }

  function postContentUnloading() {
    requestBackground(RELAY_FRAME_LIFECYCLE_REQUEST, {
      lifecycleAction: "contentUnloading",
      bridgeDocumentId: contentDocumentId,
      browserDocumentId: currentBrowserDocumentAttestationId({ allowDirty: true }),
      frameBindingId: currentFrameBindingId(),
      data: contentLifecycleData()
    }).catch(() => {});
  }

  function postLocationChanged(data = {}) {
    requestBackground(RELAY_FRAME_LIFECYCLE_REQUEST, {
      lifecycleAction: "locationChanged",
      bridgeDocumentId: contentDocumentId,
      browserDocumentId: currentBrowserDocumentAttestationId(),
      frameBindingId: currentFrameBindingId(),
      data
    }).catch((error) => console.warn("[ChatClub] Frame lifecycle relay failed", error));
  }

  const hadContentBridge = Boolean(window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__);
  if (
    runtimes.isActive
    && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_RUNTIME_VERSION
  ) {
    announceContentRegistration();
    return;
  }
  const previousLocationReportCleanup = window.__CHATCLUB_LOCATION_REPORT_CLEANUP__;
  const previousShortcutBridgeCleanup = window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__;
  let locationReportCleanup = null;
  let shortcutBridgeCleanup = null;
  let contentGenerationActivated = false;

  function contentBridgeIsCurrent() {
    return Boolean(
      contentGenerationActivated
      && runtimes.isActive
      && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_RUNTIME_VERSION
    );
  }

  function activateContentGeneration() {
    if (contentGenerationActivated) return;
    try { previousLocationReportCleanup?.(); } catch {}
    try { previousShortcutBridgeCleanup?.(); } catch {}
    try { document.documentElement?.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE); } catch {}
    installLocationReportResources();
    installShortcutBridgeResources();
    window.__CHATCLUB_CONTENT_PROTOCOL_VERSION__ = CONTENT_BRIDGE_VERSION;
    window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ = CONTENT_RUNTIME_VERSION;
    window.__CHATCLUB_CONTENT_RUNTIME_IDENTITY__ = CONTENT_RUNTIME_IDENTITY;
    window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__ = true;
    if (locationReportCleanup) window.__CHATCLUB_LOCATION_REPORT_CLEANUP__ = locationReportCleanup;
    if (shortcutBridgeCleanup) window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__ = shortcutBridgeCleanup;
    contentGenerationActivated = true;
  }

  let lastReportedHref = String(location.href || "");
  function reportLocationChange(reportedHref = "", force = false, metadata = {}) {
    if (!contentBridgeIsCurrent()) return;
    const href = String(reportedHref || location.href || "");
    if (metadata?.requireCurrentHref && href !== String(location.href || "")) return;
    if (!href || (!force && href === lastReportedHref)) return;
    const previousHref = lastReportedHref;
    lastReportedHref = href;
    abortActivePreferredModelRun("navigation changed");
    contentLocationRevision += 1;
    window.__CHATCLUB_CONTENT_LOCATION_REVISION__ = contentLocationRevision;
    const kind = String(metadata?.kind || "navigation");
    const submission = currentSubmissionNavigation(kind);
    postLocationChanged({
      ...contentLifecycleData(),
      href,
      previousHref,
      navigation: {
        kind,
        forced: Boolean(force),
        revision: contentLocationRevision,
        at: Math.max(0, Number(metadata?.at) || Date.now()),
        ...(submission ? {
          submission: {
            sendId: submission.sendId,
            appId: submission.appId,
            initialHref: submission.initialHref,
            activatedAt: submission.activatedAt,
            method: submission.method
          }
        } : {})
      }
    });
  }
  function installLocationReportResources() {
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    let timer = null;
    locationReportCleanup = () => {
      if (timer !== null) clearInterval(timer);
      controller.abort();
    };
    window.addEventListener("pointerdown", (event) => {
      if (contentBridgeIsCurrent()) clearSubmissionNavigationForTrustedIntent(event);
    }, options);
    window.addEventListener("keydown", (event) => {
      if (contentBridgeIsCurrent()) clearSubmissionNavigationForTrustedIntent(event);
    }, options);
    window.addEventListener(NOTION_SEND_ACTIVATED_EVENT, (event) => {
      if (!contentBridgeIsCurrent()) return;
      let detail = event?.detail;
      try {
        if (typeof detail === "string") detail = JSON.parse(detail);
      } catch {
        detail = null;
      }
      if (!detail || typeof detail !== "object") return;
      markSubmissionNavigation(detail, detail.method || "notion-submit");
    }, options);
    window.addEventListener("message", (event) => {
      if (!contentBridgeIsCurrent()) return;
      const message = event.data;
      if (message?.source !== MAIN_WORLD_LOCATION_SOURCE || message.type !== "notification" || message.action !== "locationChanged") return;
      reportLocationChange(message.href, message.force === true, {
        kind: message.kind,
        at: message.at,
        requireCurrentHref: true
      });
    }, options);
    window.addEventListener("pagehide", () => {
      if (!contentBridgeIsCurrent()) return;
      abortActivePreferredModelRun("navigation changed");
      clearSubmissionNavigation();
      postContentUnloading();
    }, options);
    window.addEventListener("pageshow", () => {
      if (!contentBridgeIsCurrent()) return;
      currentBrowserDocumentAttestationId();
      announceContentRegistration();
    }, options);
    timer = setInterval(() => {
      reportLocationChange("", false, { kind: "poll", at: Date.now() });
    }, 800);
  }

  function respond(source, id, action, data, error, responseSource = SOURCE) {
    if (!EXTENSION_ORIGIN) return;
    source?.postMessage({ source: responseSource, type: "response", id, action, data, error }, EXTENSION_ORIGIN);
  }

  const ACTIVE_KEYBOARD_PLATFORM = detectKeyboardPlatform();
  let activeShortcutConfig = normalizeShortcutConfig(DEFAULT_SHORTCUT_CONFIG);

  function eventMatchesKagiNativeDeleteShortcut(event, platform = ACTIVE_KEYBOARD_PLATFORM) {
    if (event.code !== "Backspace" || event.altKey || !event.shiftKey) return false;
    return normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC
      ? Boolean(event.metaKey) && !event.ctrlKey
      : Boolean(event.ctrlKey) && !event.metaKey;
  }

  async function loadShortcutConfig() {
    try {
      const stored = await EXTENSION_API?.storage?.local?.get("shortcutConfig");
      activeShortcutConfig = normalizeShortcutConfig(stored.shortcutConfig);
    } catch {}
  }

  function postShortcutTriggered(match) {
    requestBackground(RELAY_SHORTCUT_TRIGGERED_REQUEST, {
      bridgeDocumentId: contentDocumentId,
      browserDocumentId: currentBrowserDocumentAttestationId(),
      frameBindingId: currentFrameBindingId(),
      shortcutAction: String(match?.action || ""),
      matchObj: match?.matchObj || {}
    }).catch((error) => console.warn("[ChatClub] Shortcut relay failed", error));
  }

  function shouldBridgeShortcut(match, event) {
    const action = String(match?.action || "");
    const host = String(location.hostname || "").toLowerCase();
    if (action === "deleteThread" && host === "assistant.kagi.com" && eventMatchesKagiNativeDeleteShortcut(event)) {
      return false;
    }
    return true;
  }

  installContentCapability(runtimes, {
    capability: "base",
    owner: "content-capability:base",
    version: CONTENT_RUNTIME_IDENTITY.bundle.implementationVersion,
    routerVersion: CONTENT_RUNTIME_IDENTITY.implementationVersion,
    handlers: {
      getLocationHref: () => location.href,
      getPageMeta: () => pageMeta(),
      getPageText: () => normalize(document.body?.innerText || "")
    }
  });
  const handleContentAction = commandRouter.dispatch;
  installSecureFrameRpc({
    extensionApi: EXTENSION_API,
    runtimes,
    version: CONTENT_BRIDGE_VERSION,
    source: SECURE_FRAME_COMMAND_SOURCE,
    bridgeDocumentId: contentDocumentId,
    secureFrameToken,
    dispatch: handleContentAction
  });

  const onParentWindowMessage = async (event) => {
    if (!EXTENSION_ORIGIN || event.source !== window.parent || event.origin !== EXTENSION_ORIGIN) return;
    if (!contentBridgeIsCurrent()) return;
    const message = event.data;
    if (message?.source === FRAME_BINDING_POST_MESSAGE_SOURCE) {
      if (!event.isTrusted || message.type !== "request" || message.action !== "bindFrame") return;
      try {
        await relayFrameBindingChallenge(message);
      } catch (error) {
        console.warn("[ChatClub] Secure frame binding relay failed", error);
      }
      return;
    }
    const versionedDeleteRequest = message?.source === DELETE_THREAD_POST_MESSAGE_SOURCE;
    const versionedSendTextRequest = message?.source === SEND_TEXT_POST_MESSAGE_SOURCE;
    const versionedPreferredModelRequest = message?.source === PREFERRED_MODEL_POST_MESSAGE_SOURCE;
    const versionedNavigatorRequest = message?.source === MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE;
    const versionedSummaryRequest = message?.source === SUMMARY_POST_MESSAGE_SOURCE;
    const genericRequest = message?.source === SOURCE;
    if ((!versionedDeleteRequest && !versionedSendTextRequest && !versionedPreferredModelRequest && !versionedNavigatorRequest && !versionedSummaryRequest && !genericRequest) || message.type !== "request") return;
    if (genericRequest && hadContentBridge) return;
    if (genericRequest && ["applyPreferredModel", "cancelPreferredModelApply"].includes(message.action)) return;
    if (versionedDeleteRequest && message.action !== "deleteThread" && message.action !== "getDeleteConfirmState") return;
    if (versionedSendTextRequest && message.action !== "sendText") return;
    if (versionedPreferredModelRequest && !["applyPreferredModel", "cancelPreferredModelApply"].includes(message.action)) return;
    if (versionedNavigatorRequest && !["setMessageNavigator", "hideMessageNavigatorMenu", "getMessageNavigatorState"].includes(message.action)) return;
    if (versionedSummaryRequest && !["getLocationHref", "getPageMeta", "getPageText", "collectSummary"].includes(message.action)) return;
    const responseSource = versionedDeleteRequest
      ? DELETE_THREAD_POST_MESSAGE_SOURCE
      : versionedSendTextRequest
        ? SEND_TEXT_POST_MESSAGE_SOURCE
        : versionedPreferredModelRequest
          ? PREFERRED_MODEL_POST_MESSAGE_SOURCE
          : versionedNavigatorRequest
            ? MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE
            : versionedSummaryRequest
              ? SUMMARY_POST_MESSAGE_SOURCE
              : SOURCE;
    try {
      const data = await handleContentAction(message.action, message.data || {});
      respond(event.source, message.id, message.action, data, null, responseSource);
    } catch (error) {
      respond(event.source, message.id, message.action, null, error.message || String(error), responseSource);
    }
  };
  runtimes.install("parent-window-rpc", CONTENT_BRIDGE_VERSION, () => {
    return {
      api: Object.freeze({ source: SOURCE, bridgeVersion: CONTENT_BRIDGE_VERSION }),
      activate() {
        window.addEventListener("message", onParentWindowMessage, true);
      },
      dispose() {
        window.removeEventListener("message", onParentWindowMessage, true);
      }
    };
  });

  const shortcutStorageChanged = (changes, areaName) => {
    if (!contentBridgeIsCurrent()) return;
    if (areaName === "local" && changes.shortcutConfig) {
      activeShortcutConfig = normalizeShortcutConfig(changes.shortcutConfig.newValue);
    }
  };

  function installShortcutBridgeResources() {
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    shortcutBridgeCleanup = () => {
      controller.abort();
      try { EXTENSION_API?.storage?.onChanged?.removeListener(shortcutStorageChanged); } catch {}
    };
    window.addEventListener("keydown", (event) => {
      if (!contentBridgeIsCurrent()) return;
      if (!event.isTrusted) return;
      const matched = matchShortcut(event, activeShortcutConfig, ACTIVE_KEYBOARD_PLATFORM);
      if (!matched) return;
      if (!shouldBridgeShortcut(matched, event)) return;
      event.preventDefault();
      event.stopPropagation();
      postShortcutTriggered(matched);
    }, options);
    try {
      EXTENSION_API?.storage?.onChanged?.addListener(shortcutStorageChanged);
    } catch {}
    loadShortcutConfig();
  }

  runtimes.register("content-bridge-generation", {
    version: CONTENT_RUNTIME_VERSION,
    api: CONTENT_RUNTIME_IDENTITY,
    activate() {
      activateContentGeneration();
      queueMicrotask(() => {
        if (contentBridgeIsCurrent()) announceContentRegistration();
      });
    },
    dispose() {
      contentGenerationActivated = false;
      locationReportCleanup?.();
      shortcutBridgeCleanup?.();
      if (window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ !== CONTENT_RUNTIME_VERSION) return;
      delete window.__CHATCLUB_CONTENT_BRIDGE_INSTALLED__;
      delete window.__CHATCLUB_CONTENT_BRIDGE_VERSION__;
      delete window.__CHATCLUB_CONTENT_PROTOCOL_VERSION__;
      delete window.__CHATCLUB_CONTENT_RUNTIME_IDENTITY__;
      if (window.__CHATCLUB_LOCATION_REPORT_CLEANUP__ === locationReportCleanup) {
        delete window.__CHATCLUB_LOCATION_REPORT_CLEANUP__;
      }
      if (window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__ === shortcutBridgeCleanup) {
        delete window.__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__;
      }
    }
  });
}

installContentBridge();
