import { currentExtensionTabId, extensionApi, runtimeRequest } from "../../shared/extension-api.js";
import { verifyContentFrameRegistration } from "../../shared/frame-rpc.js";
import {
  CONTENT_BRIDGE_VERSION,
  EXTENSION_RUNTIME_RELAY_SOURCE,
  FRAME_BINDING_POST_MESSAGE_SOURCE
} from "../../shared/protocol.js";
import { validateControllerContract } from "../controller-contract.js";
import { createFrameBindingChallengeRegistry } from "./frame-binding.js";

const CONTENT_FRAME_REPAIR_RETRY_DELAYS = Object.freeze([350, 900, 1800, 3600, 7200]);
const CORE_BRIDGE_FILE_NAMES = Object.freeze([
  "content/preload.js",
  "content/grok-cookie-bridge.js",
  "content/message-navigator.js",
  "content/content.js"
]);
const SUMMARY_BRIDGE_FILE_NAMES = Object.freeze([
  "content/summary-userscripts-main.js",
  "content/summary-userscripts.js"
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

export function createFrameBridgeController(dependencies = {}) {
  const {
    framePort,
    workspace,
    schedulePreferredModelApply,
    invalidatePreferredModelFrame,
    preferredModelFrameIsLoading,
    handleShortcutAction
  } = validateControllerContract(dependencies, "Frame bridge controller", {
    framePort: "function",
    workspace: "function",
    schedulePreferredModelApply: "function",
    invalidatePreferredModelFrame: "function",
    preferredModelFrameIsLoading: "function",
    handleShortcutAction: "function"
  });
  const corePreparationRuns = new WeakMap();
  const summaryPreparationRuns = new WeakMap();
  const repairTimers = new WeakMap();
  const repairGenerations = new WeakMap();
  const frameBindingChallenges = createFrameBindingChallengeRegistry();
  const frameBindingRelayRuns = new WeakMap();

  function workspaceController() {
    const controller = workspace();
    if (!controller || typeof controller !== "object") throw new Error("Frame bridge workspace is unavailable");
    return controller;
  }

  function runtimePort() {
    const port = framePort();
    if (!port || typeof port.request !== "function") throw new Error("Frame bridge runtime port is unavailable");
    return port;
  }

  function contentFrameHrefHints(iframe, app = {}) {
    const values = [
      iframe?.dataset?.currentHref,
      iframe?.dataset?.currentThreadHref,
      iframe?.src,
      iframe?.getAttribute?.("src"),
      app?.url
    ].map((item) => String(item || "").trim()).filter(Boolean);
    return Array.from(new Set(values));
  }

  async function verifiedCurrentContentFrameRegistration(iframe) {
    const documentId = String(iframe?.dataset?.preferredModelDocumentId || "").trim();
    if (!documentId) return null;
    const registration = await verifyContentFrameRegistration(documentId);
    const expectedFrameId = Number(iframe?.dataset?.browserFrameId);
    const expectedBrowserDocumentId = String(iframe?.dataset?.injectedBrowserDocumentId || "").trim();
    if (
      !registration
      || String(registration.bridgeVersion || "") !== CONTENT_BRIDGE_VERSION
      || !String(registration.browserDocumentId || "").trim()
      || (Number.isSafeInteger(expectedFrameId) && expectedFrameId > 0 && Number(registration.frameId) !== expectedFrameId)
      || String(registration.frameBindingId || "") !== String(iframe?.dataset?.frameBindingId || "")
      || (expectedBrowserDocumentId && String(registration.browserDocumentId || "") !== expectedBrowserDocumentId)
    ) return null;
    return { ...registration, documentId };
  }

  function contentFramePreparationError(result = null) {
    const messages = [
      result?.error,
      ...(Array.isArray(result?.errors) ? result.errors : [])
    ].map((item) => String(item || "").trim()).filter(Boolean);
    return messages.join("; ");
  }

  async function waitForCurrentContentFrameRegistration(iframe, timeoutMs = 2600) {
    const deadline = Date.now() + Math.max(250, Number(timeoutMs) || 0);
    let lastBindingProbeAt = 0;
    while (iframe?.isConnected && Date.now() <= deadline) {
      const registration = await verifiedCurrentContentFrameRegistration(iframe);
      if (registration) return registration;
      if (Date.now() - lastBindingProbeAt >= 350) {
        requestFrameBinding(iframe, { skipRegistered: false });
        lastBindingProbeAt = Date.now();
      }
      await sleep(100);
    }
    return null;
  }

  async function prepareContentFrameRuntimeUncached(iframe, options = {}) {
    if (!iframe?.isConnected) return { ok: false, cancelled: true, reason: "iframe is detached" };
    const summary = options.summary === true;
    let registration = await verifiedCurrentContentFrameRegistration(iframe);
    const registeredDocumentId = String(registration?.documentId || "");
    if (
      registration
      && (
        !summary
        || (
          String(iframe.dataset.summaryRuntimeDocumentId || "") === registeredDocumentId
          && String(iframe.dataset.summaryRuntimeBridgeVersion || "") === CONTENT_BRIDGE_VERSION
        )
      )
    ) {
      return { ok: true, registration, injected: false, summary };
    }

    const tabId = await currentExtensionTabId();
    if (!Number.isInteger(tabId)) return { ok: false, reason: "extension tab is unavailable", summary };
    const controller = workspaceController();
    const app = controller.frameApp(iframe) || {};
    const hrefs = contentFrameHrefHints(iframe, app);
    if (!hrefs.length) return { ok: false, reason: "iframe URL is unavailable", summary };
    const expectedFrameId = Number(iframe.dataset.browserFrameId);
    const expectedBindingId = String(iframe.dataset.frameBindingId || "");
    if (!/^[a-f0-9]{64}$/i.test(expectedBindingId)) {
      return { ok: false, reason: "secure browser frame identity is unavailable", summary };
    }
    const exactFrameTarget = Number.isSafeInteger(expectedFrameId) && expectedFrameId > 0
      ? { expectedFrameId }
      : {};
    let bindingEntry = null;
    try {
      bindingEntry = frameBindingChallenges.issue(iframe);
    } catch (error) {
      console.warn("[ChatClub] Could not create a secure frame binding challenge", error);
    }

    let installed;
    try {
      const exactBindingRequest = exactFrameTarget.expectedFrameId
        ? {
            ...exactFrameTarget,
            expectedBindingId,
            bindingChallenge: bindingEntry?.challenge || "",
            bindingGeneration: bindingEntry?.generation || 0
          }
        : { expectedBindingId };
      installed = await runtimeRequest({
        source: "chatclub",
        action: "ensureContentBridge",
        tabId,
        hrefs,
        features: summary ? ["summary"] : [],
        ...exactBindingRequest
      });
    } catch (error) {
      return { ok: false, reason: error?.message || String(error), summary };
    }
    const installationError = contentFramePreparationError(installed);
    const expectedFileNames = summary
      ? [...CORE_BRIDGE_FILE_NAMES, ...SUMMARY_BRIDGE_FILE_NAMES]
      : [...CORE_BRIDGE_FILE_NAMES];
    const expectedInjectionCount = expectedFileNames.length;
    const injectedFiles = Array.isArray(installed?.injectedFiles) ? installed.injectedFiles : [];
    const injectedCount = Number(installed?.injected);
    const injectedFileNames = injectedFiles.map((entry) => {
      const value = String(entry || "");
      const separator = value.lastIndexOf("@");
      return separator > 0 ? value.slice(0, separator) : "";
    });
    const completeInjectionInventory = Number.isInteger(injectedCount)
      && injectedFiles.length === injectedCount
      && new Set(injectedFiles).size === injectedCount
      && expectedFileNames.every((file) => injectedFileNames.includes(file))
      && injectedFileNames.every((file) => expectedFileNames.includes(file));
    const exactFrameRequested = Boolean(exactFrameTarget.expectedFrameId);
    const injectionCountIsValid = injectedCount === expectedInjectionCount;
    const installedBrowserDocumentId = String(installed?.browserDocumentId || "").trim();
    if (
      installationError
      || !injectionCountIsValid
      || !completeInjectionInventory
      || !installedBrowserDocumentId
      || (exactFrameRequested && installed?.bindingRelayed !== true)
    ) {
      return {
        ok: false,
        reason: installationError
          || (exactFrameRequested && installed?.bindingRelayed !== true
            ? "secure iframe binding was not relayed"
            : (!installedBrowserDocumentId
              ? "content bridge injection browser document is unavailable"
              : "content bridge injection was incomplete")),
        installed,
        summary
      };
    }
    iframe.dataset.injectedBrowserDocumentId = installedBrowserDocumentId;
    if (bindingEntry) bindingEntry.browserDocumentId = installedBrowserDocumentId;
    if (!exactFrameRequested) requestFrameBinding(iframe, { skipRegistered: false });
    registration = await waitForCurrentContentFrameRegistration(iframe);
    if (!registration) {
      return {
        ok: false,
        reason: contentFramePreparationError(installed) || "iframe content bridge did not become ready",
        installed,
        summary
      };
    }
    if (String(registration.browserDocumentId || "") !== installedBrowserDocumentId) {
      return {
        ok: false,
        reason: "iframe browser document changed during content bridge injection",
        installed,
        registration,
        summary
      };
    }
    if (summary) {
      let summaryState = null;
      try {
        summaryState = await runtimePort().request(iframe, "getSummaryRuntimeState", {}, { timeoutMs: 1800, skipEnsure: true });
      } catch (error) {
        return {
          ok: false,
          reason: error?.message || "Summary runtime readiness probe failed",
          installed,
          registration,
          summary
        };
      }
      const confirmedRegistration = await verifiedCurrentContentFrameRegistration(iframe);
      const summaryRuntimeReady = Boolean(
        summaryState?.ready
        && summaryState.mainReady
        && summaryState.isolatedReady
        && summaryState.documentId === registration.documentId
        && summaryState.bridgeVersion === CONTENT_BRIDGE_VERSION
        && confirmedRegistration?.documentId === registration.documentId
        && confirmedRegistration?.bridgeVersion === CONTENT_BRIDGE_VERSION
      );
      if (!summaryRuntimeReady) {
        return {
          ok: false,
          reason: "Summary runtime did not become ready in the current iframe document",
          installed,
          registration,
          summaryState,
          summary
        };
      }
      registration = confirmedRegistration;
      iframe.dataset.summaryRuntimeDocumentId = registration.documentId;
      iframe.dataset.summaryRuntimeBridgeVersion = CONTENT_BRIDGE_VERSION;
    }
    controller.rememberFrameLocation(iframe, registration);
    return { ok: true, registration, installed, injected: true, summary };
  }

  function prepareContentFrameRuntime(iframe, options = {}) {
    if (!iframe) return Promise.resolve({ ok: false, reason: "iframe is unavailable" });
    const summary = options.summary === true;
    const runs = summary ? summaryPreparationRuns : corePreparationRuns;
    const existing = runs.get(iframe);
    if (existing) return existing;
    const run = prepareContentFrameRuntimeUncached(iframe, options).finally(() => {
      if (runs.get(iframe) === run) runs.delete(iframe);
    });
    runs.set(iframe, run);
    return run;
  }

  function scheduleContentFrameRepair(iframe, delay = 0, retryIndex = 0, repairGeneration = null) {
    if (!iframe?.isConnected) return;
    if (repairGeneration == null) {
      repairGeneration = (repairGenerations.get(iframe) || 0) + 1;
      repairGenerations.set(iframe, repairGeneration);
    } else if (repairGenerations.get(iframe) !== repairGeneration) {
      return;
    }
    const existing = repairTimers.get(iframe);
    if (existing) clearTimeout(existing);
    const timer = window.setTimeout(() => {
      if (repairGenerations.get(iframe) !== repairGeneration) return;
      repairTimers.delete(iframe);
      const retryOrWarn = (reason) => {
        if (repairGenerations.get(iframe) !== repairGeneration) return;
        const nextDelay = CONTENT_FRAME_REPAIR_RETRY_DELAYS[retryIndex];
        if (iframe?.isConnected && Number.isFinite(nextDelay)) {
          scheduleContentFrameRepair(iframe, nextDelay, retryIndex + 1, repairGeneration);
          return;
        }
        console.warn("[ChatClub] Content frame bridge repair did not complete", reason);
      };
      prepareContentFrameRuntime(iframe).then((result) => {
        if (!result?.ok && !result?.cancelled) retryOrWarn(result?.reason || result);
      }).catch(retryOrWarn);
    }, Math.max(0, Number(delay) || 0));
    repairTimers.set(iframe, timer);
  }

  function requestFrameBinding(iframe, { rotate = false, skipRegistered = true } = {}) {
    if (!iframe?.isConnected) return Promise.resolve(false);
    if (
      skipRegistered
      && String(iframe.dataset.preferredModelDocumentId || "")
      && String(iframe.dataset.preferredModelContentBridgeVersion || "") === CONTENT_BRIDGE_VERSION
    ) return Promise.resolve(false);
    let entry;
    const expectedBrowserDocumentId = String(iframe.dataset.injectedBrowserDocumentId || "").trim();
    if (!expectedBrowserDocumentId) return Promise.resolve(false);
    try {
      entry = frameBindingChallenges.issue(iframe, { rotate });
    } catch (error) {
      console.warn("[ChatClub] Could not create a secure frame binding challenge", error);
      return Promise.resolve(false);
    }
    if (!entry || entry.claimed) return Promise.resolve(false);
    if (entry.browserDocumentId && entry.browserDocumentId !== expectedBrowserDocumentId) return Promise.resolve(false);
    entry.browserDocumentId = expectedBrowserDocumentId;
    const existing = frameBindingRelayRuns.get(iframe);
    if (existing?.entry === entry) return existing.run;
    const run = (async () => {
      const expectedFrameId = Number(iframe.dataset.browserFrameId);
      const expectedBindingId = String(iframe.dataset.frameBindingId || "");
      if (!/^[a-f0-9]{64}$/i.test(expectedBindingId)) return false;
      const exactFrameTarget = Number.isSafeInteger(expectedFrameId) && expectedFrameId > 0
        ? { expectedFrameId }
        : {};
      if (!exactFrameTarget.expectedFrameId) {
        try {
          iframe.contentWindow?.postMessage({
            source: FRAME_BINDING_POST_MESSAGE_SOURCE,
            type: "request",
            action: "bindFrame",
            challenge: entry.challenge,
            generation: entry.generation,
            expectedBindingId,
            browserDocumentId: expectedBrowserDocumentId
          }, "*");
          return true;
        } catch {
          return false;
        }
      }
      const tabId = await currentExtensionTabId();
      if (!Number.isInteger(tabId)) return false;
      const controller = workspaceController();
      const hrefs = contentFrameHrefHints(iframe, controller.frameApp(iframe) || {});
      if (!hrefs.length) return false;
      try {
        const result = await runtimeRequest({
          source: "chatclub",
          action: "requestFrameBinding",
          tabId,
          hrefs,
          ...exactFrameTarget,
          expectedBindingId,
          browserDocumentId: expectedBrowserDocumentId,
          bindingChallenge: entry.challenge,
          bindingGeneration: entry.generation
        });
        return result?.bindingRelayed === true;
      } catch {
        return false;
      }
    })().finally(() => {
      if (frameBindingRelayRuns.get(iframe)?.run === run) frameBindingRelayRuns.delete(iframe);
    });
    frameBindingRelayRuns.set(iframe, { entry, run });
    return run;
  }

  function rememberVerifiedContentFrameRegistration(iframe, documentId, registration = {}) {
    const controller = workspaceController();
    const previousDocumentId = String(iframe.dataset.preferredModelDocumentId || "");
    const bridgeVersion = String(registration.bridgeVersion || "");
    const previousBridgeVersion = String(iframe.dataset.preferredModelContentBridgeVersion || "");
    const bridgeChanged = Boolean(
      (documentId && previousDocumentId && documentId !== previousDocumentId)
      || (bridgeVersion && previousBridgeVersion && bridgeVersion !== previousBridgeVersion)
    );
    if (bridgeChanged) invalidatePreferredModelFrame(iframe, "document-changed");
    if (
      bridgeChanged
      || String(iframe.dataset.summaryRuntimeDocumentId || "") !== documentId
      || String(iframe.dataset.summaryRuntimeBridgeVersion || "") !== bridgeVersion
    ) {
      delete iframe.dataset.summaryRuntimeDocumentId;
      delete iframe.dataset.summaryRuntimeBridgeVersion;
    }
    iframe.dataset.preferredModelDocumentId = documentId;
    iframe.dataset.preferredModelContentBridgeVersion = bridgeVersion;
    iframe.dataset.injectedBrowserDocumentId = String(registration.browserDocumentId || "");
    controller.rememberFrameLocation(iframe, {
      documentId,
      bridgeVersion,
      href: String(registration.href || ""),
      title: String(registration.title || "")
    });
    controller.syncFrameFavicon(iframe).catch((error) => console.warn("[ChatClub] Failed to sync frame favicon", error));
    schedulePreferredModelApply(iframe);
    controller.reapplyMessageNavigatorForFrame(iframe).catch((error) => console.warn("[ChatClub] Failed to restore message navigator", error));
  }

  async function acceptAuthenticatedFrameBinding(message = {}, context = {}, tabId = null) {
    const documentId = String(context.bridgeDocumentId || "");
    const frameBindingId = String(context.frameBindingId || "");
    const announcedDocumentId = String(message.data?.documentId || "");
    const announcedFrameBindingId = String(message.data?.frameBindingId || "");
    const announcedBridgeVersion = String(message.data?.bridgeVersion || "");
    const announcedBrowserDocumentId = String(message.data?.browserDocumentId || "").trim();
    if (
      !Number.isInteger(tabId)
      || context.tabId !== tabId
      || !Number.isInteger(context.frameId)
      || context.frameId <= 0
      || !documentId
      || !frameBindingId
      || !announcedBrowserDocumentId
      || String(context.documentId || "") !== announcedBrowserDocumentId
      || frameBindingId !== String(message.data?.frameBindingId || "")
      || announcedDocumentId !== documentId
      || announcedBridgeVersion !== CONTENT_BRIDGE_VERSION
    ) return false;
    const entry = frameBindingChallenges.claim(message.challenge, message.generation);
    if (!entry) return false;
    let accepted = false;
    try {
      const expectedFrameId = Number(entry.iframe?.dataset?.browserFrameId);
      const expectedBindingId = String(entry.iframe?.dataset?.frameBindingId || "");
      const expectedBrowserDocumentId = String(
        entry.browserDocumentId || entry.iframe?.dataset?.injectedBrowserDocumentId || ""
      ).trim();
      if (
        (Number.isSafeInteger(expectedFrameId) && expectedFrameId > 0 && context.frameId !== expectedFrameId)
        || announcedFrameBindingId !== expectedBindingId
        || (expectedBrowserDocumentId && announcedBrowserDocumentId !== expectedBrowserDocumentId)
      ) return false;
      const registration = await verifyContentFrameRegistration(documentId);
      if (
        !registration
        || String(registration.bridgeVersion || "") !== CONTENT_BRIDGE_VERSION
        || (Number.isSafeInteger(expectedFrameId) && expectedFrameId > 0 && Number(registration.frameId) !== expectedFrameId)
        || String(registration.frameBindingId || "") !== expectedBindingId
        || String(registration.browserDocumentId || "") !== announcedBrowserDocumentId
        || !frameBindingChallenges.isCurrent(entry)
      ) return false;
      rememberVerifiedContentFrameRegistration(entry.iframe, documentId, registration);
      accepted = true;
      return true;
    } finally {
      const finished = frameBindingChallenges.finish(entry);
      if (!accepted && finished && entry.iframe?.isConnected) {
        window.setTimeout(() => requestFrameBinding(entry.iframe, { skipRegistered: false }), 100);
      }
    }
  }

  function shortcutRelaySourceWindow(context = {}) {
    const bridgeDocumentId = String(context.bridgeDocumentId || "");
    if (!bridgeDocumentId) return null;
    const iframe = workspaceController().currentFrames().find((frame) =>
      String(frame.dataset.preferredModelDocumentId || "") === bridgeDocumentId
    );
    return iframe || null;
  }

  function installRuntimeEventBridge() {
    const api = extensionApi();
    if (!api?.runtime?.onMessage?.addListener) return;
    api.runtime.onMessage.addListener((message, sender) => {
      if (message?.source !== EXTENSION_RUNTIME_RELAY_SOURCE || sender?.tab) return false;
      (async () => {
        const context = message.senderContext || {};
        const tabId = await currentExtensionTabId();
        if (!Number.isInteger(tabId) || context.tabId !== tabId) return;
        if (message.action === "frameBinding") {
          await acceptAuthenticatedFrameBinding(message, context, tabId);
          return;
        }
        const sourceWindow = shortcutRelaySourceWindow(context);
        if (!sourceWindow) return;
        if (message.action === "shortcutTriggered") {
          await handleShortcutAction(message.shortcutAction, message.matchObj || {}, sourceWindow);
          return;
        }
        if (message.action !== "frameLifecycle") return;
        const controller = workspaceController();
        const iframe = controller.iframeForWindow(sourceWindow);
        if (!iframe || message.data?.documentId !== context.bridgeDocumentId) return;
        if (message.lifecycleAction === "locationChanged") {
          controller.rememberFrameLocation(iframe, message.data || {});
          return;
        }
        if (message.lifecycleAction === "contentUnloading") {
          frameBindingChallenges.invalidate(iframe);
          iframe.dataset.preferredModelNavigationInvalidated = "1";
          delete iframe.dataset.summaryRuntimeDocumentId;
          delete iframe.dataset.summaryRuntimeBridgeVersion;
          delete iframe.dataset.injectedBrowserDocumentId;
          invalidatePreferredModelFrame(iframe, "content-unloading", { clearDocumentId: true });
        }
      })().catch((error) => console.warn("[ChatClub] Runtime shortcut action failed", error));
      return false;
    });
  }

  function installPreferredModelIframeLoadHandler() {
    document.addEventListener("load", (event) => {
      const iframe = event.target;
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.classList.contains("chat-frame")) return;
      const navigationAlreadyInvalidated = iframe.dataset.preferredModelNavigationInvalidated === "1";
      delete iframe.dataset.preferredModelNavigationInvalidated;
      if (!preferredModelFrameIsLoading(iframe) && !navigationAlreadyInvalidated) {
        invalidatePreferredModelFrame(iframe, "iframe-load", { clearDocumentId: true });
      }
      frameBindingChallenges.invalidate(iframe);
      delete iframe.dataset.injectedBrowserDocumentId;
      scheduleContentFrameRepair(iframe, 120);
      schedulePreferredModelApply(iframe);
    }, true);
  }

  function installExtensionTabTracker() {
    const controller = workspaceController();
    controller.refreshCurrentExtensionTabInfo();
    window.addEventListener("focus", controller.refreshCurrentExtensionTabInfo);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") controller.refreshCurrentExtensionTabInfo();
    });
  }

  function install() {
    installExtensionTabTracker();
    installRuntimeEventBridge();
    installPreferredModelIframeLoadHandler();
  }

  return Object.freeze({
    install,
    prepareContentFrameRuntime,
    scheduleContentFrameRepair,
    verifiedCurrentContentFrameRegistration
  });
}
