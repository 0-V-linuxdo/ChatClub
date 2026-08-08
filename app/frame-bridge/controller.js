import { currentExtensionTabId, extensionApi, runtimeRequest } from "../../shared/extension-api.js";
import { stripNotionFrameLoadNonce } from "../../shared/chat-frame-config.js";
import { verifyContentFrameRegistration } from "../../shared/frame-rpc.js";
import { CONTENT_RUNTIME_IDENTITY } from "../../shared/content-runtime-identity.js";
import {
  contentRuntimeIdentityForBundle,
  contentRuntimePackageBundleIdentityMatches
} from "../../shared/content-runtime-package-identity.js";
import { CONTENT_BUNDLES, contentInjectionPlan } from "../../shared/frame-commands.js";
import {
  CONTENT_BRIDGE_VERSION,
  EXTENSION_RUNTIME_RELAY_SOURCE,
  FRAME_BINDING_POST_MESSAGE_SOURCE
} from "../../shared/protocol.js";
import { validateControllerContract } from "../controller-contract.js";
import { createFrameBindingChallengeRegistry } from "./frame-binding.js";

const CONTENT_FRAME_REPAIR_RETRY_DELAYS = Object.freeze([350, 900, 1800, 3600, 7200]);
const GROK_COOKIE_RUNTIME_IDENTITY = contentRuntimeIdentityForBundle(CONTENT_BUNDLES.grokCookie.file);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });

function exactGrokCookieRuntimeHost(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && CONTENT_BUNDLES.grokCookie.hosts.includes(host) ? host : "";
  } catch {
    return "";
  }
}

function grokCookieRuntimeReady(registration = null) {
  if (!exactGrokCookieRuntimeHost(registration?.href)) return true;
  const attestation = registration?.grokCookieRuntime;
  return Boolean(
    attestation
    && String(attestation.version || "") === GROK_COOKIE_RUNTIME_IDENTITY.bundle.implementationVersion
    && contentRuntimePackageBundleIdentityMatches(
      attestation.runtimeIdentity,
      CONTENT_BUNDLES.grokCookie.file
    )
  );
}

function contentFrameRepairIsPoisoned(reason) {
  return /(?:content runtime generation\b[^\n]*(?:\bis aborted\b|\bis superseded\b|fail(?:ed)?[- ]closed)|content runtime broker is shut down|content runtime bundle\b[^\n]*(?:missing|wrong identity)|secure frame runtime identity does not match packaged bundle|secure frame binding relay was not accepted|iframe content bridge did not become ready|packaged userscript injection frame is not the verified direct child document)/i
    .test(String(reason?.reason || reason?.message || reason || ""));
}

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
  const capabilityPreparationQueues = new WeakMap();
  const repairTimers = new WeakMap();
  const repairGenerations = new WeakMap();
  const frameBindingChallenges = createFrameBindingChallengeRegistry();
  const frameBindingRelayRuns = new WeakMap();
  const frameBindingRelayErrors = new WeakMap();
  let runtimeEventBridgeRuntime = null;
  let runtimeEventBridgeListener = null;

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
    ].map((item) => String(stripNotionFrameLoadNonce(item) || "").trim()).filter(Boolean);
    return Array.from(new Set(values));
  }

  async function verifiedCurrentContentFrameRegistration(iframe) {
    const documentId = String(iframe?.dataset?.preferredModelDocumentId || "").trim();
    if (!documentId) return null;
    const expectedFrameId = String(iframe?.dataset?.browserFrameId || "").trim();
    const expectedBrowserDocumentId = String(iframe?.dataset?.injectedBrowserDocumentId || "").trim();
    const expectedBindingId = String(iframe?.dataset?.frameBindingId || "");
    const registration = await verifyContentFrameRegistration(documentId);
    const frameId = Number(registration?.frameId);
    const browserDocumentId = String(registration?.browserDocumentId || "").trim();
    if (
      iframe?.isConnected === false
      || documentId !== String(iframe?.dataset?.preferredModelDocumentId || "").trim()
      || expectedFrameId !== String(iframe?.dataset?.browserFrameId || "").trim()
      || expectedBrowserDocumentId !== String(iframe?.dataset?.injectedBrowserDocumentId || "").trim()
      || expectedBindingId !== String(iframe?.dataset?.frameBindingId || "")
      || !registration
      || String(registration.bridgeVersion || "") !== CONTENT_BRIDGE_VERSION
      || !contentRuntimePackageBundleIdentityMatches(registration.runtimeIdentity, "content/content.js")
      || !grokCookieRuntimeReady(registration)
      || !Number.isSafeInteger(frameId)
      || frameId <= 0
      || !browserDocumentId
      || (expectedFrameId && Number(expectedFrameId) !== frameId)
      || String(registration.frameBindingId || "") !== expectedBindingId
      || (expectedBrowserDocumentId && browserDocumentId !== expectedBrowserDocumentId)
    ) return null;
    iframe.dataset.browserFrameId = String(frameId);
    iframe.dataset.injectedBrowserDocumentId = browserDocumentId;
    delete iframe.dataset.poisonedContentRuntimeReloadHref;
    return { ...registration, documentId };
  }

  function reloadPoisonedContentFrame(iframe, reason) {
    if (!iframe?.isConnected) return false;
    try {
      const controller = workspaceController();
      if (typeof controller.reloadFrameDocument !== "function") {
        console.warn("[ChatClub] Cannot reload a poisoned content frame without a workspace reload method", reason);
        return false;
      }
      const href = contentFrameHrefHints(iframe, controller.frameApp(iframe) || {})[0] || "";
      if (!href || String(iframe.dataset.poisonedContentRuntimeReloadHref || "") === href) return false;
      invalidatePreferredModelFrame(iframe, "poisoned-content-runtime", { clearDocumentId: true });
      invalidateContentRuntimeCapabilityLedger(iframe);
      const reloaded = controller.reloadFrameDocument(iframe);
      if (!reloaded) return false;
      const instanceId = String(iframe.dataset.instanceId || "");
      const targetFrame = iframe.isConnected
        ? iframe
        : controller.currentFrames?.().find((frame) => String(frame?.dataset?.instanceId || "") === instanceId);
      if (!targetFrame?.dataset) return false;
      targetFrame.dataset.poisonedContentRuntimeReloadHref = href;
      console.warn("[ChatClub] Reloaded iframe after poisoned content runtime", { href, reason });
      return true;
    } catch (error) {
      console.warn("[ChatClub] Failed to reload iframe after poisoned content runtime", error);
      return false;
    }
  }

  function contentFramePreparationError(result = null) {
    const messages = [
      result?.error,
      ...(Array.isArray(result?.errors) ? result.errors : [])
    ].map((item) => String(item || "").trim()).filter(Boolean);
    return messages.join("; ");
  }

  function invalidateContentRuntimeCapabilityLedger(iframe) {
    if (!iframe?.dataset) return;
    iframe.dataset.contentRuntimeCapabilitiesEpoch = String(
      Math.max(0, Number(iframe.dataset.contentRuntimeCapabilitiesEpoch) || 0) + 1
    );
    delete iframe.dataset.summaryRuntimeDocumentId;
    delete iframe.dataset.summaryRuntimeBridgeVersion;
    delete iframe.dataset.summaryRuntimeImplementationVersion;
    delete iframe.dataset.contentRuntimeCapabilitiesDocumentId;
    delete iframe.dataset.contentRuntimeCapabilities;
  }

  function framePreparationGeneration(iframe) {
    return String(iframe?.dataset?.contentRuntimeCapabilitiesEpoch || "0");
  }

  function framePreparationIsCurrent(iframe, generation) {
    return Boolean(iframe?.isConnected && framePreparationGeneration(iframe) === generation);
  }

  function cancelledFramePreparation(summary = false) {
    return {
      ok: false,
      cancelled: true,
      reason: "iframe document changed during content bridge preparation",
      summary
    };
  }

  function mergedContentRuntimeCapabilities(
    iframe,
    documentId,
    installedCapabilities,
    features,
    capabilityEpochAtStart
  ) {
    const finalInstalledCapabilities = String(iframe?.dataset?.contentRuntimeCapabilitiesDocumentId || "") === documentId
      ? String(iframe.dataset.contentRuntimeCapabilities || "").split(",").filter(Boolean)
      : [];
    const capabilitySnapshotStillCurrent = String(
      iframe?.dataset?.contentRuntimeCapabilitiesEpoch || "0"
    ) === capabilityEpochAtStart;
    return [...new Set([
      ...finalInstalledCapabilities,
      ...(capabilitySnapshotStillCurrent ? installedCapabilities : []),
      ...features
    ])].sort();
  }

  async function waitForCurrentContentFrameRegistration(
    iframe,
    timeoutMs = 2600,
    ownerIsCurrent = () => true
  ) {
    const deadline = Date.now() + Math.max(250, Number(timeoutMs) || 0);
    let lastBindingProbeAt = 0;
    while (iframe?.isConnected && ownerIsCurrent() && Date.now() <= deadline) {
      const registration = await verifiedCurrentContentFrameRegistration(iframe);
      if (!ownerIsCurrent()) return null;
      if (registration) return registration;
      if (Date.now() - lastBindingProbeAt >= 350) {
        requestFrameBinding(iframe, { skipRegistered: false });
        lastBindingProbeAt = Date.now();
      }
      await sleep(100);
    }
    return null;
  }

  async function prepareContentFrameRuntimeUncached(
    iframe,
    options = {},
    preparationGeneration = framePreparationGeneration(iframe)
  ) {
    const features = [...new Set([
      ...(Array.isArray(options.features) ? options.features : []),
      ...(options.summary === true ? ["summary"] : [])
    ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))].sort();
    const summary = features.includes("summary");
    const preparationIsCurrent = () => framePreparationIsCurrent(iframe, preparationGeneration);
    const cancelled = () => cancelledFramePreparation(summary);
    if (!preparationIsCurrent()) return cancelled();
    let registration = await verifiedCurrentContentFrameRegistration(iframe);
    if (!preparationIsCurrent()) return cancelled();
    const registeredDocumentId = String(registration?.documentId || "");
    const capabilityEpochAtStart = preparationGeneration;
    const capabilityDocumentCurrent = String(iframe.dataset.contentRuntimeCapabilitiesDocumentId || "") === registeredDocumentId;
    const installedCapabilities = capabilityDocumentCurrent
      ? String(iframe.dataset.contentRuntimeCapabilities || "").split(",").filter(Boolean)
      : [];
    const capabilitiesCurrent = !features.length
      || (capabilityDocumentCurrent && features.every((feature) => installedCapabilities.includes(feature)));
    if (
      registration
      && grokCookieRuntimeReady(registration)
      && capabilitiesCurrent
      && (
        !summary
        || (
          String(iframe.dataset.summaryRuntimeDocumentId || "") === registeredDocumentId
          && String(iframe.dataset.summaryRuntimeBridgeVersion || "") === CONTENT_BRIDGE_VERSION
          && String(iframe.dataset.summaryRuntimeImplementationVersion || "") === CONTENT_RUNTIME_IDENTITY.implementationVersion
        )
      )
    ) {
      return { ok: true, registration, injected: false, summary };
    }

    const tabId = await currentExtensionTabId();
    if (!preparationIsCurrent()) return cancelled();
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
    let installed;
    try {
      const exactBindingRequest = exactFrameTarget.expectedFrameId
        ? {
            ...exactFrameTarget,
            expectedBindingId
          }
        : { expectedBindingId };
      installed = await runtimeRequest({
        source: "chatclub",
        action: "ensureContentBridge",
        tabId,
        hrefs,
        features,
        ...exactBindingRequest
      });
    } catch (error) {
      if (!preparationIsCurrent()) return cancelled();
      return { ok: false, reason: error?.message || String(error), summary };
    }
    if (!preparationIsCurrent()) return cancelled();
    const installationError = contentFramePreparationError(installed);
    const installedFeatures = Array.isArray(installed?.features) ? installed.features : [];
    const normalizedFeatureKey = (value) => [...new Set(value.map(String))].sort().join(",");
    const installedFeaturesAreValid = normalizedFeatureKey(installedFeatures) === normalizedFeatureKey(features);
    const expectedFileNames = Array.isArray(installed?.plannedFiles) ? installed.plannedFiles.map(String) : [];
    const validPlans = [
      contentInjectionPlan({ features }).map(({ file }) => file),
      ...CONTENT_BUNDLES.grokCookie.hosts.map((frameHost) => (
        contentInjectionPlan({ features, frameHost }).map(({ file }) => file)
      ))
    ];
    const plannedFilesAreValid = expectedFileNames.length > 0
      && new Set(expectedFileNames).size === expectedFileNames.length
      && validPlans.some((plan) => JSON.stringify(plan) === JSON.stringify(expectedFileNames));
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
    const injectionCountIsValid = injectedCount === expectedInjectionCount;
    const installedBrowserDocumentId = String(installed?.browserDocumentId || "").trim();
    const installationFailureReason = installationError
      || (!installedFeaturesAreValid ? "content bridge installed capabilities did not match the request" : "")
      || (!plannedFilesAreValid ? "content bridge injection plan was invalid" : "")
      || (!installedBrowserDocumentId ? "content bridge injection browser document is unavailable" : "")
      || (!injectionCountIsValid || !completeInjectionInventory ? "content bridge injection was incomplete" : "");
    if (installationFailureReason) {
      return {
        ok: false,
        reason: installationFailureReason,
        installed,
        summary
      };
    }
    if (!preparationIsCurrent()) return cancelled();
    iframe.dataset.injectedBrowserDocumentId = installedBrowserDocumentId;
    await requestFrameBinding(iframe, {
      rotate: true,
      skipRegistered: false
    });
    if (!preparationIsCurrent()) return cancelled();
    registration = await waitForCurrentContentFrameRegistration(
      iframe,
      2600,
      preparationIsCurrent
    );
    if (!preparationIsCurrent()) return cancelled();
    if (!registration || !grokCookieRuntimeReady(registration)) {
      const relayError = String(frameBindingRelayErrors.get(iframe) || "").trim();
      return {
        ok: false,
        reason: contentFramePreparationError(installed)
          || relayError
          || "iframe content bridge did not become ready",
        installed,
        summary
      };
    }
    frameBindingRelayErrors.delete(iframe);
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
        if (!preparationIsCurrent()) return cancelled();
        return {
          ok: false,
          reason: error?.message || "Summary runtime readiness probe failed",
          installed,
          registration,
          summary
        };
      }
      if (!preparationIsCurrent()) return cancelled();
      const confirmedRegistration = await verifiedCurrentContentFrameRegistration(iframe);
      if (!preparationIsCurrent()) return cancelled();
      const summaryRuntimeReady = Boolean(
        summaryState?.ready
        && summaryState.mainReady
        && summaryState.isolatedReady
        && summaryState.documentId === registration.documentId
        && summaryState.bridgeVersion === CONTENT_BRIDGE_VERSION
        && contentRuntimePackageBundleIdentityMatches(summaryState.runtimeIdentity, "content/summary-bridge.js")
        && contentRuntimePackageBundleIdentityMatches(summaryState.mainRuntimeIdentity, "content/summary-userscripts-main.js")
        && contentRuntimePackageBundleIdentityMatches(summaryState.isolatedRuntimeIdentity, "content/summary-userscripts.js")
        && confirmedRegistration?.documentId === registration.documentId
        && confirmedRegistration?.bridgeVersion === CONTENT_BRIDGE_VERSION
        && contentRuntimePackageBundleIdentityMatches(confirmedRegistration?.runtimeIdentity, "content/content.js")
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
      iframe.dataset.summaryRuntimeImplementationVersion = CONTENT_RUNTIME_IDENTITY.implementationVersion;
    }
    if (!preparationIsCurrent()) return cancelled();
    const mergedCapabilities = mergedContentRuntimeCapabilities(
      iframe,
      registration.documentId,
      installedCapabilities,
      features,
      capabilityEpochAtStart
    );
    iframe.dataset.contentRuntimeCapabilitiesDocumentId = registration.documentId;
    iframe.dataset.contentRuntimeCapabilities = mergedCapabilities.join(",");
    controller.rememberFrameLocation(iframe, registration);
    return { ok: true, registration, installed, injected: true, summary, features };
  }

  function prepareContentFrameRuntime(iframe, options = {}) {
    if (!iframe) return Promise.resolve({ ok: false, reason: "iframe is unavailable" });
    installRuntimeEventBridge();
    const signature = [...new Set([
      ...(Array.isArray(options.features) ? options.features : []),
      ...(options.summary === true ? ["summary"] : [])
    ])].map(String).sort().join(",");
    const generation = framePreparationGeneration(iframe);
    let queue = capabilityPreparationQueues.get(iframe);
    if (!queue || queue.generation !== generation) {
      queue = { generation, runs: new Map(), tail: Promise.resolve() };
      capabilityPreparationQueues.set(iframe, queue);
    }
    const existing = queue.runs.get(signature);
    if (existing) return existing;
    // New documents bypass stale app queues; background injection stays tab-serialized.
    const previous = queue.tail;
    const run = previous.catch(() => {}).then(
      async () => {
        if (!framePreparationIsCurrent(iframe, generation)) return cancelledFramePreparation();
        const result = await prepareContentFrameRuntimeUncached(iframe, options, generation);
        if (
          result?.ok === false
          && result?.cancelled !== true
          && contentFrameRepairIsPoisoned(result)
          && reloadPoisonedContentFrame(iframe, result)
        ) return cancelledFramePreparation();
        return framePreparationIsCurrent(iframe, generation) ? result : cancelledFramePreparation();
      }
    ).finally(() => {
      if (queue.runs.get(signature) === run) queue.runs.delete(signature);
      if (capabilityPreparationQueues.get(iframe) === queue && !queue.runs.size) {
        capabilityPreparationQueues.delete(iframe);
      }
    });
    queue.runs.set(signature, run);
    queue.tail = run;
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
        if (contentFrameRepairIsPoisoned(reason)) {
          if (reloadPoisonedContentFrame(iframe, reason)) return;
          console.warn("[ChatClub] Content frame bridge repair stopped at a poisoned runtime generation", reason);
          return;
        }
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
    installRuntimeEventBridge();
    if (
      skipRegistered
      && String(iframe.dataset.preferredModelDocumentId || "")
      && String(iframe.dataset.preferredModelContentBridgeVersion || "") === CONTENT_BRIDGE_VERSION
      && String(iframe.dataset.preferredModelContentRuntimeImplementation || "") === CONTENT_RUNTIME_IDENTITY.implementationVersion
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
        const relayed = result?.bindingRelayed === true;
        if (relayed) frameBindingRelayErrors.delete(iframe);
        else frameBindingRelayErrors.set(iframe, "secure frame binding relay was not accepted");
        return relayed;
      } catch (error) {
        frameBindingRelayErrors.set(
          iframe,
          String(error?.message || error || "secure frame binding relay failed")
        );
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
    const implementationVersion = String(registration.runtimeIdentity?.implementationVersion || "");
    const previousBridgeVersion = String(iframe.dataset.preferredModelContentBridgeVersion || "");
    const sameRuntimeDocument = Boolean(
      documentId
      && documentId === previousDocumentId
      && bridgeVersion
      && bridgeVersion === previousBridgeVersion
      && implementationVersion
      && implementationVersion === String(iframe.dataset.preferredModelContentRuntimeImplementation || "")
    );
    const bridgeChanged = Boolean(
      (documentId && previousDocumentId && documentId !== previousDocumentId)
      || (bridgeVersion && previousBridgeVersion && bridgeVersion !== previousBridgeVersion)
      || (
        implementationVersion
        && String(iframe.dataset.preferredModelContentRuntimeImplementation || "")
        && implementationVersion !== String(iframe.dataset.preferredModelContentRuntimeImplementation || "")
      )
    );
    if (bridgeChanged) invalidatePreferredModelFrame(iframe, "document-changed");
    const hasSummaryRuntimeState = Boolean(
      iframe.dataset.summaryRuntimeDocumentId
      || iframe.dataset.summaryRuntimeBridgeVersion
      || iframe.dataset.summaryRuntimeImplementationVersion
    );
    if (bridgeChanged || (hasSummaryRuntimeState && (
      String(iframe.dataset.summaryRuntimeDocumentId || "") !== documentId
      || String(iframe.dataset.summaryRuntimeBridgeVersion || "") !== bridgeVersion
      || String(iframe.dataset.summaryRuntimeImplementationVersion || "") !== implementationVersion
    ))) {
      invalidateContentRuntimeCapabilityLedger(iframe);
    }
    iframe.dataset.preferredModelDocumentId = documentId;
    iframe.dataset.preferredModelContentBridgeVersion = bridgeVersion;
    iframe.dataset.preferredModelContentRuntimeImplementation = implementationVersion;
    iframe.dataset.injectedBrowserDocumentId = String(registration.browserDocumentId || "");
    controller.rememberFrameLocation(iframe, {
      documentId,
      bridgeVersion,
      runtimeIdentity: registration.runtimeIdentity,
      href: String(registration.href || ""),
      title: String(registration.title || "")
    });
    controller.syncFrameFavicon(iframe).catch((error) => console.warn("[ChatClub] Failed to sync frame favicon", error));
    if (!sameRuntimeDocument) {
      schedulePreferredModelApply(iframe);
      controller.reapplyMessageNavigatorForFrame(iframe).catch((error) => console.warn("[ChatClub] Failed to restore message navigator", error));
    }
  }

  async function acceptAuthenticatedFrameBinding(message = {}, context = {}, tabId = null) {
    const documentId = String(context.bridgeDocumentId || "");
    const frameBindingId = String(context.frameBindingId || "");
    const announcedDocumentId = String(message.data?.documentId || "");
    const announcedFrameBindingId = String(message.data?.frameBindingId || "");
    const announcedBridgeVersion = String(message.data?.bridgeVersion || "");
    const announcedRuntimeIdentity = message.data?.runtimeIdentity;
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
      || !contentRuntimePackageBundleIdentityMatches(announcedRuntimeIdentity, "content/content.js")
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
        || !contentRuntimePackageBundleIdentityMatches(registration.runtimeIdentity, "content/content.js")
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
    const expectedFrameId = Number(context.frameId);
    const expectedBindingId = String(context.frameBindingId || "");
    const iframe = workspaceController().currentFrames().find((frame) => {
      if (bridgeDocumentId && String(frame.dataset.preferredModelDocumentId || "") === bridgeDocumentId) return true;
      return Number.isSafeInteger(expectedFrameId)
        && expectedFrameId > 0
        && Number(frame.dataset.browserFrameId) === expectedFrameId
        && expectedBindingId
        && String(frame.dataset.frameBindingId || "") === expectedBindingId;
    });
    return iframe || null;
  }

  function frameLifecycleBelongsToCurrentDocument(iframe, message = {}, context = {}) {
    const contextDocumentId = String(context.bridgeDocumentId || "");
    return Boolean(
      iframe
      && contextDocumentId
      && String(iframe.dataset?.preferredModelDocumentId || "") === contextDocumentId
      && String(message.data?.documentId || "") === contextDocumentId
    );
  }

  function handleAuthenticatedFrameLifecycle(message = {}, context = {}, sourceWindow = null) {
    const controller = workspaceController();
    const iframe = controller.iframeForWindow(sourceWindow);
    if (!frameLifecycleBelongsToCurrentDocument(iframe, message, context)) return false;
    if (message.lifecycleAction === "locationChanged") {
      controller.rememberFrameLocation(iframe, message.data || {});
      return true;
    }
    if (message.lifecycleAction === "contentUnloading") {
      frameBindingChallenges.invalidate(iframe);
      iframe.dataset.preferredModelNavigationInvalidated = "1";
      invalidateContentRuntimeCapabilityLedger(iframe);
      delete iframe.dataset.injectedBrowserDocumentId;
      invalidatePreferredModelFrame(iframe, "content-unloading", { clearDocumentId: true });
      return true;
    }
    return false;
  }

  function createRuntimeEventBridgeListener() {
    return (message, sender) => {
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
        if (message.action === "frameNavigationTarget") {
          const controller = workspaceController();
          const iframe = controller.iframeForWindow(sourceWindow);
          const href = String(message.data?.href || "");
          if (!iframe || !/^https?:\/\//i.test(href)) return;
          // webNavigation fires before the new document can register the
          // content bridge. Remember the authenticated target now so a
          // restart during a SPA navigation does not restore the stale
          // pre-navigation route. The workspace session owner applies the
          // built-in Notion restoration policy before persisting it.
          controller.rememberFrameLocation(iframe, { href });
          controller.ensureFrameAttributeContract(iframe, href, {
            phase: String(message.data?.phase || "navigation")
          });
          return;
        }
        if (message.action === "shortcutTriggered") {
          await handleShortcutAction(message.shortcutAction, message.matchObj || {}, sourceWindow);
          return;
        }
        if (message.action !== "frameLifecycle") return;
        handleAuthenticatedFrameLifecycle(message, context, sourceWindow);
      })().catch((error) => console.warn("[ChatClub] Runtime shortcut action failed", error));
      return false;
    };
  }

  function installRuntimeEventBridge() {
    const runtime = extensionApi()?.runtime || null;
    if (!runtime?.onMessage?.addListener) return false;
    if (runtimeEventBridgeRuntime === runtime && runtimeEventBridgeListener) return true;
    if (runtimeEventBridgeRuntime && runtimeEventBridgeListener) {
      try {
        runtimeEventBridgeRuntime.onMessage?.removeListener?.(runtimeEventBridgeListener);
      } catch {}
    }
    const listener = createRuntimeEventBridgeListener();
    try {
      runtime.onMessage.addListener(listener);
    } catch (error) {
      runtimeEventBridgeRuntime = null;
      runtimeEventBridgeListener = null;
      console.warn("[ChatClub] Runtime frame relay listener could not be installed", error);
      return false;
    }
    runtimeEventBridgeRuntime = runtime;
    runtimeEventBridgeListener = listener;
    return true;
  }

  function installPreferredModelIframeLoadHandler() {
    document.addEventListener("load", (event) => {
      const iframe = event.target;
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.classList.contains("chat-frame")) return;
      if (iframe.dataset.frameLoadPending === "1") {
        // A newly inserted iframe emits an about:blank load before
        // setFrameSrcAfterPrepare assigns its real URL. There is no content
        // bridge to repair in that placeholder document; waiting for the
        // real navigation also avoids reloading the frame from a premature
        // poisoned-runtime diagnosis.
        return;
      }
      const navigationAlreadyInvalidated = iframe.dataset.preferredModelNavigationInvalidated === "1";
      const preparationGenerationBeforeLoad = framePreparationGeneration(iframe);
      delete iframe.dataset.preferredModelNavigationInvalidated;
      if (!preferredModelFrameIsLoading(iframe) && !navigationAlreadyInvalidated) {
        invalidatePreferredModelFrame(iframe, "iframe-load", { clearDocumentId: true });
      }
      if (
        framePreparationGeneration(iframe) === preparationGenerationBeforeLoad
      ) {
        // Invalidate repairs that started between navigation-start and load.
        invalidateContentRuntimeCapabilityLedger(iframe);
      }
      frameBindingChallenges.invalidate(iframe);
      delete iframe.dataset.injectedBrowserDocumentId;
      scheduleContentFrameRepair(iframe, 120);
      schedulePreferredModelApply(iframe);
    }, true);
  }

  function installExtensionTabTracker() {
    const controller = workspaceController();
    const refresh = () => {
      installRuntimeEventBridge();
      controller.refreshCurrentExtensionTabInfo();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  function install() {
    installRuntimeEventBridge();
    installExtensionTabTracker();
    installPreferredModelIframeLoadHandler();
    queueMicrotask(() => {
      let frames = [];
      try { frames = workspaceController().currentFrames(); } catch {}
      for (const iframe of frames || []) scheduleContentFrameRepair(iframe, 0);
    });
  }

  return Object.freeze({
    install,
    prepareContentFrameRuntime,
    scheduleContentFrameRepair,
    verifiedCurrentContentFrameRegistration
  });
}
