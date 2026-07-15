import { currentExtensionTabId, extensionApi, runtimeRequest } from "../../shared/extension-api.js";
import { verifyContentFrameRegistration } from "../../shared/frame-rpc.js";
import { CONTENT_BRIDGE_VERSION, EXTENSION_RUNTIME_RELAY_SOURCE } from "../../shared/protocol.js";
import { validateControllerContract } from "../controller-contract.js";

const CONTENT_FRAME_REPAIR_RETRY_DELAYS = Object.freeze([350, 900, 1800, 3600, 7200]);
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
    if (!registration || String(registration.bridgeVersion || "") !== CONTENT_BRIDGE_VERSION) return null;
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
    while (iframe?.isConnected && Date.now() <= deadline) {
      const registration = await verifiedCurrentContentFrameRegistration(iframe);
      if (registration) return registration;
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

    let installed;
    try {
      installed = await runtimeRequest({
        source: "chatclub",
        action: "ensureContentBridge",
        tabId,
        hrefs,
        features: summary ? ["summary"] : []
      });
    } catch (error) {
      return { ok: false, reason: error?.message || String(error), summary };
    }
    registration = await waitForCurrentContentFrameRegistration(iframe);
    if (!registration) {
      return {
        ok: false,
        reason: contentFramePreparationError(installed) || "iframe content bridge did not become ready",
        installed,
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

  function installIframeEventBridge() {
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.source !== "chatclub" || message.type !== "request" || message.action !== "contentReady") return;
      const controller = workspaceController();
      const iframe = controller.iframeForWindow(event.source);
      if (!iframe) return;
      const documentId = String(message.data?.documentId || "");
      const announcedBridgeVersion = String(message.data?.bridgeVersion || "");
      if (!documentId) return;
      if (
        String(iframe.dataset.preferredModelDocumentId || "") === documentId
        && String(iframe.dataset.preferredModelContentBridgeVersion || "") === announcedBridgeVersion
        && announcedBridgeVersion === CONTENT_BRIDGE_VERSION
      ) {
        event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
        return;
      }
      verifyContentFrameRegistration(documentId).then((registration) => {
        if (!registration || controller.iframeForWindow(event.source) !== iframe) return;
        event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
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
        if (bridgeVersion) iframe.dataset.preferredModelContentBridgeVersion = bridgeVersion;
        controller.rememberFrameLocation(iframe, {
          documentId,
          bridgeVersion,
          href: String(registration.href || ""),
          title: String(registration.title || "")
        });
        controller.syncFrameFavicon(event.source).catch((error) => console.warn("[ChatClub] Failed to sync frame favicon", error));
        schedulePreferredModelApply(iframe);
        controller.reapplyMessageNavigatorForFrame(iframe).catch((error) => console.warn("[ChatClub] Failed to restore message navigator", error));
      }).catch((error) => console.warn("[ChatClub] Content frame registration verification failed", error));
    }, true);
  }

  function shortcutRelaySourceWindow(context = {}) {
    const bridgeDocumentId = String(context.bridgeDocumentId || "");
    if (!bridgeDocumentId) return null;
    const iframe = workspaceController().currentFrames().find((frame) =>
      String(frame.dataset.preferredModelDocumentId || "") === bridgeDocumentId
    );
    return iframe?.contentWindow || null;
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
          iframe.dataset.preferredModelNavigationInvalidated = "1";
          delete iframe.dataset.summaryRuntimeDocumentId;
          delete iframe.dataset.summaryRuntimeBridgeVersion;
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
    installIframeEventBridge();
    installPreferredModelIframeLoadHandler();
  }

  return Object.freeze({
    install,
    prepareContentFrameRuntime,
    scheduleContentFrameRepair,
    verifiedCurrentContentFrameRegistration
  });
}
