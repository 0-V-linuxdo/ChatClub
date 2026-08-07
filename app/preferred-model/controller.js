import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
  MODEL_PREFERENCE_SECONDARY_KEYS,
  MODEL_PREFERENCE_TARGETS,
  NOTION_ALL_SOURCES_PREFERENCE_KEY,
  NOTION_ALL_SOURCES_PREFERENCE_VALUES,
  NOTION_EFFORT_PREFERENCE_KEY,
  notionEffortTargetsForModel
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import { el } from "../../ui/dom.js";
import { createFrameToast } from "../../ui/frame-toast.js";
import { createSvgIcon } from "../../ui/icons.js";
import { validateControllerContract } from "../controller-contract.js";
import { createFrameRequest } from "../frame-request.js";
import { waitForPreferredModelBridgePreparation } from "./bridge-preparation.js";
import { createPreferredModelSelectionOverlayController, preferredModelTargetLabel } from "./selection-overlay-controller.js";

const MODEL_PREFERENCE_APP_ID_ALIASES = Object.freeze({
  Gemini: "Gemini",
  Grok: "Grok",
  GrokMirror: "Grok",
  "Grok Mirror": "Grok",
  DeepSeek: "DeepSeek",
  "DeepSeek AI": "DeepSeek",
  NotionAI: "NotionAI",
  "Notion AI": "NotionAI"
});
const MODEL_PREFERENCE_APPLY_RETRY_DELAYS = Object.freeze([0, 700, 1600, 3200, 5200, 8000, 12000]);
const MODEL_PREFERENCE_READY_APPLY_RETRY_DELAYS = Object.freeze([1600, 3200, 5200, 8000, 12000, 16000]);
const NOTION_ALL_SOURCES_APPLY_RETRY_DELAYS = Object.freeze([0, 800, 2000, 4200]);
const NOTION_ALL_SOURCES_READY_APPLY_RETRY_DELAYS = Object.freeze([1000, 2400, 5000]);
const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;
const NOTION_ALL_SOURCES_APPLY_TIMEOUT_MS = 48000;
const MODEL_PREFERENCE_CANCEL_TIMEOUT_MS = 1200;
const MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS = 15000;
const PREFERRED_MODEL_FALLBACK_MEMORY_MS = 5 * 60 * 1000;
const PREFERRED_MODEL_FALLBACK_MEMORY_STORAGE_KEY = "chatclub.preferred-model-fallback-memory";
const FRAME_SUBMIT_ERROR_MAX_CHARS = 160;
const PREFERRED_MODEL_PRE_DELIVERY_RETRY_CODES = Object.freeze([
  "NOT_REGISTERED",
  "STALE_DOCUMENT",
  "INJECTION_FAILED"
]);

export function createPreferredModelController(dependencies = {}) {
  const controllerName = "Preferred Model controller";
  const {
    state: preferredModelState,
    workspace,
    framePort,
    appRoot,
    verifiedCurrentContentFrameRegistration,
    prepareContentFrameRuntime,
    recordFunctionalAnomaly
  } = validateControllerContract(dependencies, controllerName, {
    state: "object",
    workspace: "object",
    framePort: "object",
    appRoot: "object",
    verifiedCurrentContentFrameRegistration: "function",
    prepareContentFrameRuntime: "function",
    recordFunctionalAnomaly: "function"
  });
  for (const method of ["currentFrames", "frameApp"]) {
    if (typeof workspace[method] !== "function") {
      throw new TypeError(`Preferred Model workspace port requires ${method}().`);
    }
  }

  const preferredModelApplyRuns = new Map();
  const preferredModelFrameWaiters = new Set();
  const preferredModelSubmissionWaiters = new Set();
  const preferredModelSubmissionNavigations = new WeakMap();
  const preferredModelSubmissionNavigationFrames = new Set();
  const preferredModelSubmissionOutcomes = new WeakMap();
  const preferredModelFallbackMemory = new Map();
  function loadPreferredModelFallbackMemory() {
    try {
      const stored = JSON.parse(globalThis.sessionStorage?.getItem(PREFERRED_MODEL_FALLBACK_MEMORY_STORAGE_KEY) || "{}");
      for (const [key, value] of Object.entries(stored || {})) {
        const expiresAt = Number(value);
        if (key && expiresAt > Date.now()) preferredModelFallbackMemory.set(key, { expiresAt });
      }
    } catch {}
  }
  function persistPreferredModelFallbackMemory() {
    try {
      globalThis.sessionStorage?.setItem(
        PREFERRED_MODEL_FALLBACK_MEMORY_STORAGE_KEY,
        JSON.stringify(Object.fromEntries([...preferredModelFallbackMemory].map(([key, value]) => [key, value.expiresAt])))
      );
    } catch {}
  }
  loadPreferredModelFallbackMemory();
  let preferredModelGateBootstrapping = true;
  let preferredModelFrameCleanupObserver = null;

  function activeWorkspace() {
    return workspace;
  }

  const sendToContentFrame = createFrameRequest(framePort, controllerName);

  function preferredModelAppId(app) {
    return MODEL_PREFERENCE_APP_ID_ALIASES[String(app?.id || "")]
      || MODEL_PREFERENCE_APP_ID_ALIASES[String(app?.name || "")]
      || String(app?.id || "");
  }

  function preferredModelForApp(app) {
    const appId = preferredModelAppId(app);
    const preferences = preferredModelState.modelPreferenceDraft || preferredModelState.options?.modelPreferences || {};
    const modelId = String(preferences[appId] || "");
    if (!modelId) return "";
    return (MODEL_PREFERENCE_TARGETS[appId] || []).some((target) => target.id === modelId) ? modelId : "";
  }

  function preferredSecondaryModelForApp(app, primaryModelId = preferredModelForApp(app)) {
    const appId = preferredModelAppId(app);
    const preferences = preferredModelState.modelPreferenceDraft || preferredModelState.options?.modelPreferences || {};
    if (preferences[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY] !== true) return "";
    const preferenceKey = MODEL_PREFERENCE_SECONDARY_KEYS[appId];
    const modelId = String(preferenceKey ? preferences[preferenceKey] || "" : "");
    if (!modelId || modelId === primaryModelId) return "";
    return (MODEL_PREFERENCE_TARGETS[appId] || []).some((target) => target.id === modelId) ? modelId : "";
  }

  function preferredGeminiThinkingLevel() {
    const preferences = preferredModelState.modelPreferenceDraft || preferredModelState.options?.modelPreferences || {};
    const value = String(preferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY] || DEFAULT_GEMINI_THINKING_LEVEL);
    return GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === value)
      ? value
      : DEFAULT_GEMINI_THINKING_LEVEL;
  }

  function preferredNotionAllSourcesState() {
    const preferences = preferredModelState.modelPreferenceDraft || preferredModelState.options?.modelPreferences || {};
    const value = String(preferences[NOTION_ALL_SOURCES_PREFERENCE_KEY] || "");
    return NOTION_ALL_SOURCES_PREFERENCE_VALUES.includes(value) ? value : "";
  }

  function preferredNotionEffortForModel(modelId) {
    const preferences = preferredModelState.modelPreferenceDraft || preferredModelState.options?.modelPreferences || {};
    const effortPreferences = preferences[NOTION_EFFORT_PREFERENCE_KEY];
    const value = effortPreferences && typeof effortPreferences === "object" && !Array.isArray(effortPreferences)
      ? String(effortPreferences[modelId] || "")
      : "";
    return notionEffortTargetsForModel(modelId).includes(value) ? value : "";
  }

  function preferredModelApplyTimeoutMs(payload = {}) {
    return payload.appId === "NotionAI" && payload.allSourcesState
      ? NOTION_ALL_SOURCES_APPLY_TIMEOUT_MS
      : MODEL_PREFERENCE_APPLY_TIMEOUT_MS;
  }

  function preferredModelPayloadForApp(app) {
    const appId = preferredModelAppId(app);
    const modelId = preferredModelForApp(app);
    const secondaryModelId = modelId ? preferredSecondaryModelForApp(app, modelId) : "";
    const allSourcesState = appId === "NotionAI" ? preferredNotionAllSourcesState() : "";
    const effortId = appId === "NotionAI" && modelId ? preferredNotionEffortForModel(modelId) : "";
    const secondaryEffortId = appId === "NotionAI" && secondaryModelId
      ? preferredNotionEffortForModel(secondaryModelId)
      : "";
    if (!modelId && !allSourcesState) return null;
    return {
      appId,
      modelId,
      ...(secondaryModelId ? { secondaryModelId } : {}),
      ...(effortId ? { effortId } : {}),
      ...(secondaryEffortId ? { secondaryEffortId } : {}),
      ...(appId === "Gemini" && (modelId === "pro" || secondaryModelId === "pro")
        ? { thinkingLevel: preferredGeminiThinkingLevel() }
        : {}),
      ...(allSourcesState ? { allSourcesState } : {})
    };
  }

  const preferredModelFallbackMemoryKey = (payload = {}) =>
    `${payload.appId || ""}:${payload.modelId || ""}:${payload.secondaryModelId || ""}`;

  function rememberPreferredModelFallback(record, secondaryResult = {}) {
    if (
      !record
      || !record.primaryResult
      || record.fallbackMemoryUsed === true
      || !preferredModelAttemptSucceeded(secondaryResult)
    ) return;
    preferredModelFallbackMemory.set(preferredModelFallbackMemoryKey(record.requestedPayload), {
      expiresAt: Date.now() + PREFERRED_MODEL_FALLBACK_MEMORY_MS
    });
    persistPreferredModelFallbackMemory();
  }

  function preferredModelRememberedFallback(payload = {}) {
    const key = preferredModelFallbackMemoryKey(payload);
    const entry = preferredModelFallbackMemory.get(key);
    if (entry?.expiresAt > Date.now()) return entry;
    preferredModelFallbackMemory.delete(key);
    return null;
  }

  function preferredModelAttemptPayload(payload = {}, modelId = payload.modelId, runId = "") {
    const attempt = {
      ...payload,
      modelId: String(modelId || ""),
      ...(runId ? { runId: String(runId) } : {})
    };
    delete attempt.secondaryModelId;
    const requestedEffortId = attempt.appId === "NotionAI"
      ? modelId === payload.modelId
        ? payload.effortId
        : modelId === payload.secondaryModelId
          ? payload.secondaryEffortId
          : ""
      : "";
    delete attempt.secondaryEffortId;
    if (attempt.appId === "NotionAI" && attempt.modelId && requestedEffortId) {
      attempt.effortId = requestedEffortId;
    } else {
      delete attempt.effortId;
    }
    if (attempt.appId !== "Gemini" || attempt.modelId !== "pro") delete attempt.thinkingLevel;
    return attempt;
  }

  function preferredModelFailurePolicyForApp(app) {
    const appId = preferredModelAppId(app);
    const options = preferredModelState.options || {};
    const override = String(options.modelPreferenceFailureOverrides?.[appId] || "inherit");
    if (override === "send-current" || override === "skip") return override;
    return options.modelPreferenceFailurePolicy === "skip" ? "skip" : "send-current";
  }

  function compactPreferredModelFailureReason(result = {}) {
    const fallback = t("toast.frameModelSwitchFailureFallback");
    const raw = String(
      result.reason
        || (result.unavailable ? "unavailable" : "")
        || (result.unsupported ? "unsupported" : "")
        || fallback
    ).replace(/\s+/g, " ").trim();
    const chars = Array.from(raw || fallback);
    return chars.length > FRAME_SUBMIT_ERROR_MAX_CHARS
      ? chars.slice(0, FRAME_SUBMIT_ERROR_MAX_CHARS - 1).join("") + "…"
      : chars.join("");
  }

  function preferredModelRetryDelay(record = {}, result = {}) {
    const interactionCount = Math.max(0, Number(result.interactionCount) || 0);
    const safePreselectionRetry = result.retryable === true
      && result.retryableBeforeSelection === true
      && result.selectionActivated !== true
      && result.menuClosed === true;
    if (
      (interactionCount > 0 && !safePreselectionRetry)
      || (result.retryable !== true && result.cancelled !== true)
    ) return null;
    const nextAttempt = Math.max(0, Number(record.attempt) || 0) + 1;
    if (!Array.isArray(record.delays) || nextAttempt >= record.delays.length) return null;
    return Math.max(0, Number(record.delays[nextAttempt]) || 0);
  }

  function preferredModelFrameIsLoading(iframe) {
    const instanceId = String(iframe?.dataset?.instanceId || "");
    return Boolean(instanceId && (preferredModelState.frameLoadingInstanceIds || []).includes(instanceId));
  }

  function preferredModelContentRuntimeReady(iframe, registration) {
    const documentId = String(registration?.documentId || "");
    if (
      !documentId
      || String(iframe?.dataset?.contentRuntimeCapabilitiesDocumentId || "") !== documentId
    ) return false;
    return String(iframe.dataset.contentRuntimeCapabilities || "")
      .split(",")
      .includes("preferred-model");
  }

  function preferredModelFrameReadiness(iframe) {
    const app = iframe ? activeWorkspace().frameApp(iframe) || {} : {};
    const payload = preferredModelPayloadForApp(app);
    const appId = preferredModelAppId(app);
    const instanceId = String(iframe?.dataset?.instanceId || "");
    const documentId = String(iframe?.dataset?.preferredModelDocumentId || "");
    const bridgeVersion = String(iframe?.dataset?.preferredModelContentBridgeVersion || "");
    const frameKey = preferredModelFrameKey(iframe);
    const record = iframe ? preferredModelApplyRuns.get(iframe) : null;
    const result = record?.result || {};
    const base = {
      iframe: iframe || null,
      instanceId,
      appId,
      frameKey,
      runId: String(record?.runId || ""),
      documentId,
      bridgeVersion,
      requestedModelId: String(result.requestedModelId || record?.requestedModelId || ""),
      appliedModelId: String(result.appliedModelId || ""),
      fallbackAttempted: result.fallbackAttempted === true,
      fallbackUsed: result.fallbackUsed === true,
      reason: ""
    };
    if (!iframe?.isConnected) return { ...base, state: "detached", reason: "iframe is detached" };
    if (record?.key === frameKey && record.success && !record.cancelled) {
      return { ...base, state: "ready" };
    }
    if (record?.key === frameKey && record.terminal) {
      return {
        ...base,
        state: "failed",
        reason: record.failureReason || t("toast.frameModelSwitchFailureFallback")
      };
    }
    if (preferredModelFrameIsLoading(iframe)) return { ...base, state: "loading" };
    if (!payload) return { ...base, state: "unconfigured" };
    if (!frameKey || !documentId) return { ...base, state: "pending" };
    return { ...base, state: "pending" };
  }

  function preferredModelFrameReadinessIsCurrent(iframe, lease = {}) {
    if (!iframe || lease?.iframe !== iframe) return false;
    const current = preferredModelFrameReadiness(iframe);
    if (current.state !== lease.state) return false;
    if (String(current.instanceId || "") !== String(lease.instanceId || "")) return false;
    if (String(current.appId || "") !== String(lease.appId || "")) return false;
    if (lease.documentId && String(current.documentId || "") !== String(lease.documentId)) return false;
    if (lease.bridgeVersion && String(current.bridgeVersion || "") !== String(lease.bridgeVersion)) return false;
    if (["ready", "failed"].includes(lease.state)) {
      return String(current.frameKey || "") === String(lease.frameKey || "")
        && String(current.runId || "") === String(lease.runId || "");
    }
    return lease.state === "unconfigured";
  }

  function preferredModelReadinessIsSettled(snapshot = {}) {
    return ["unconfigured", "ready", "failed", "detached"].includes(snapshot.state);
  }

  function preferredModelAbortError(message = "preferred-model wait aborted") {
    const error = new Error(message);
    error.name = "AbortError";
    error.code = "ABORTED";
    return error;
  }

  function settlePreferredModelFrameWaiter(waiter, outcome, error = null) {
    if (!preferredModelFrameWaiters.delete(waiter)) return;
    waiter.signal?.removeEventListener?.("abort", waiter.abort);
    if (error) waiter.reject(error);
    else waiter.resolve(outcome);
  }

  function notifyPreferredModelFrameWaiters() {
    for (const waiter of [...preferredModelFrameWaiters]) {
      if (waiter.signal?.aborted) {
        settlePreferredModelFrameWaiter(waiter, null, preferredModelAbortError());
        continue;
      }
      const snapshot = preferredModelFrameReadiness(waiter.iframe);
      if (preferredModelReadinessIsSettled(snapshot)) settlePreferredModelFrameWaiter(waiter, snapshot);
    }
  }

  function waitForPreferredModelFrame(iframe, options = {}) {
    let current = preferredModelFrameReadiness(iframe);
    if (current.state === "pending") {
      schedulePreferredModelApplyToFrame(iframe);
      current = preferredModelFrameReadiness(iframe);
    }
    if (preferredModelReadinessIsSettled(current)) return Promise.resolve(current);
    const signal = options?.signal || null;
    if (signal?.aborted) return Promise.reject(preferredModelAbortError());
    return new Promise((resolve, reject) => {
      const waiter = { iframe, signal, resolve, reject, abort: null };
      waiter.abort = () => settlePreferredModelFrameWaiter(waiter, null, preferredModelAbortError());
      preferredModelFrameWaiters.add(waiter);
      signal?.addEventListener?.("abort", waiter.abort, { once: true });
      notifyPreferredModelFrameWaiters();
    });
  }

  function preferredModelConfiguredActiveFrames() {
    const controller = activeWorkspace();
    return controller.currentFrames()
      .map((iframe) => {
        const app = controller.frameApp(iframe) || {};
        return { iframe, app, payload: preferredModelPayloadForApp(app) };
      })
      .filter((item) => item.iframe?.isConnected && item.payload);
  }

  function preferredModelGateStatus() {
    const configuredFrames = preferredModelConfiguredActiveFrames();
    if (preferredModelGateBootstrapping) {
      return {
        state: "bootstrapping",
        reason: "",
        pendingCount: configuredFrames.length,
        failedCount: 0,
        failedAppIds: []
      };
    }

    let pendingCount = 0;
    const failures = [];
    for (const { iframe, payload } of configuredFrames) {
      const readiness = preferredModelFrameReadiness(iframe);
      if (readiness.state === "ready") continue;
      if (readiness.state === "failed") {
        failures.push({
          appId: payload.appId,
          reason: readiness.reason || t("toast.frameModelSwitchFailureFallback")
        });
        continue;
      }
      pendingCount += 1;
    }

    if (failures.length) {
      return {
        state: "failed",
        reason: failures[0].reason,
        pendingCount,
        failedCount: failures.length,
        failedAppIds: Array.from(new Set(failures.map((item) => item.appId).filter(Boolean)))
      };
    }
    if (pendingCount > 0) {
      return { state: "applying", reason: "", pendingCount, failedCount: 0, failedAppIds: [] };
    }
    return { state: "ready", reason: "", pendingCount: 0, failedCount: 0, failedAppIds: [] };
  }

  function preferredModelGateStatusIcon(applying) {
    if (applying) return el("span", { class: "prompt-model-gate-spinner", "aria-hidden": "true" });
    const icon = createSvgIcon("alert");
    icon.classList.add("prompt-model-gate-failure-icon");
    return icon;
  }

  function syncPreferredModelGateVisual(statusNode, { applying, failed, statusText }) {
    const visible = applying || failed;
    statusNode.classList.add("tooltip-trigger");
    statusNode.setAttribute("role", "note");
    statusNode.removeAttribute("aria-live");
    statusNode.removeAttribute("aria-atomic");
    if (!visible && document.activeElement === statusNode) {
      statusNode.closest?.(".prompt-shell")?.querySelector?.(".prompt-input")?.focus?.({ preventScroll: true });
    }
    statusNode.hidden = !visible;

    if (!visible) {
      for (const attribute of [
        "aria-label",
        "data-tooltip",
        "data-tooltip-id",
        "data-tooltip-placement",
        "data-tooltip-wrap",
        "tabindex"
      ]) statusNode.removeAttribute(attribute);
      delete statusNode.dataset.modelGateVisualKey;
      if (statusNode.childNodes.length) statusNode.replaceChildren();
      return;
    }

    statusNode.setAttribute("tabindex", "0");
    statusNode.setAttribute("aria-label", statusText);
    statusNode.setAttribute("data-tooltip", statusText);
    statusNode.setAttribute("data-tooltip-id", "topbar.modelGateStatus");
    statusNode.setAttribute("data-tooltip-placement", "left");
    statusNode.setAttribute("data-tooltip-wrap", "true");
    const visualKey = (applying ? "applying:" : "failed:") + statusText;
    if (statusNode.dataset.modelGateVisualKey === visualKey) return;
    statusNode.dataset.modelGateVisualKey = visualKey;
    statusNode.replaceChildren(
      preferredModelGateStatusIcon(applying),
      el("span", { class: "prompt-model-gate-status-text" }, statusText)
    );
  }

  function syncPreferredModelGateLive(liveNode, { applying, failed, statusText }) {
    liveNode.hidden = false;
    liveNode.setAttribute("aria-live", "polite");
    liveNode.setAttribute("aria-atomic", "true");
    if (!(applying || failed)) {
      delete liveNode.dataset.modelGateAnnouncementKey;
      if (liveNode.textContent) liveNode.textContent = "";
      return;
    }
    const announcementKey = (applying ? "applying:" : "failed:") + statusText;
    if (liveNode.dataset.modelGateAnnouncementKey === announcementKey) return;
    liveNode.dataset.modelGateAnnouncementKey = announcementKey;
    liveNode.textContent = statusText;
  }

  const preferredModelSelectionOverlayController = createPreferredModelSelectionOverlayController({
    state: preferredModelState,
    workspace,
    appRoot,
    frameReadiness: preferredModelFrameReadiness,
    payloadForFrame: (iframe, readiness) => {
      const record = preferredModelApplyRuns.get(iframe);
      if (record?.key === readiness.frameKey) return record.payload;
      const payload = preferredModelPayloadForApp(activeWorkspace().frameApp(iframe) || {});
      const rememberedFallback = preferredModelRememberedFallback(payload);
      return rememberedFallback ? preferredModelAttemptPayload(payload, payload.secondaryModelId) : payload;
    }
  });

  function syncPreferredModelSelectionOverlays() {
    const visibleFrames = preferredModelSelectionOverlayController.sync();
    for (const [iframe, record] of preferredModelApplyRuns) record.statusToast?.setSuppressed?.(visibleFrames.has(iframe));
    return visibleFrames;
  }

  function syncPreferredModelInputGate() {
    const next = preferredModelGateStatus();
    preferredModelState.preferredModelGateState = next.state;
    preferredModelState.preferredModelGateReason = next.reason;
    preferredModelState.preferredModelGatePendingCount = next.pendingCount;
    preferredModelState.preferredModelGateFailedCount = next.failedCount;
    preferredModelState.preferredModelGateFailedAppIds = next.failedAppIds;

    for (const iframe of activeWorkspace().currentFrames()) {
      const readiness = preferredModelFrameReadiness(iframe);
      iframe.dataset.preferredModelGateState = readiness.state;
      iframe.dataset.preferredModelConfigured = readiness.state === "unconfigured" ? "false" : "true";
      iframe.dataset.preferredModelTarget = readiness.frameKey;
    }
    syncPreferredModelSelectionOverlays();

    document.querySelectorAll(".prompt-shell").forEach((shell) => {
      const inputNode = shell.querySelector(".prompt-input");
      const applying = next.state === "bootstrapping" || next.state === "applying";
      const failed = next.state === "failed";
      shell.classList.toggle("prompt-shell-model-gate-applying", applying);
      shell.classList.toggle("prompt-shell-model-gate-failed", failed);
      shell.dataset.modelGateState = next.state;
      shell.dataset.modelGatePendingCount = String(next.pendingCount);
      shell.dataset.modelGateFailedCount = String(next.failedCount);
      shell.dataset.modelGateFailedAppIds = next.failedAppIds.join(",");
      shell.removeAttribute("aria-busy");

      if (inputNode) {
        inputNode.readOnly = false;
        inputNode.dataset.modelGateState = next.state;
        inputNode.removeAttribute("aria-busy");
        inputNode.removeAttribute("aria-label");
      }

      const statusNodes = Array.from(shell.querySelectorAll(".prompt-model-gate-status"));
      let statusNode = statusNodes.shift() || null;
      statusNodes.forEach((node) => node.remove());
      if (!statusNode) {
        statusNode = el("div", {
          class: "prompt-model-gate-status tooltip-trigger",
          role: "note",
          onpointerdown: (event) => event.stopPropagation(),
          onclick: (event) => event.stopPropagation(),
          onkeydown: (event) => event.stopPropagation()
        });
        shell.append(statusNode);
      }
      const liveNodes = Array.from(shell.querySelectorAll(".prompt-model-gate-live"));
      let liveNode = liveNodes.shift() || null;
      liveNodes.forEach((node) => node.remove());
      if (!liveNode) {
        liveNode = el("div", {
          class: "prompt-model-gate-live",
          "aria-live": "polite",
          "aria-atomic": "true"
        });
        shell.append(liveNode);
      }
      const statusText = failed
        ? t("topbar.modelGateFailed", { reason: next.reason })
        : t("topbar.modelGateApplying");
      syncPreferredModelGateVisual(statusNode, { applying, failed, statusText });
      syncPreferredModelGateLive(liveNode, { applying, failed, statusText });
    });
    notifyPreferredModelFrameWaiters();
    return next;
  }

  function preferredModelFrameKey(iframe) {
    if (!iframe) return "";
    const app = activeWorkspace().frameApp(iframe);
    const payload = preferredModelPayloadForApp(app);
    if (!payload) return "";
    const thinkingLevel = payload.thinkingLevel ? ":" + payload.thinkingLevel : "";
    const secondaryModel = payload.secondaryModelId ? ":secondary=" + payload.secondaryModelId : "";
    const effortId = payload.effortId ? ":effort=" + payload.effortId : "";
    const secondaryEffortId = payload.secondaryEffortId ? ":secondary-effort=" + payload.secondaryEffortId : "";
    const allSourcesState = payload.allSourcesState ? ":sources=" + payload.allSourcesState : "";
    const documentId = String(iframe.dataset.preferredModelDocumentId || "");
    return payload.appId + ":" + payload.modelId + thinkingLevel + secondaryModel + effortId + secondaryEffortId + allSourcesState + ":" + documentId;
  }

  function preferredModelConversationIdentity(appId, value) {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch {
      return "";
    }
    const host = url.hostname.toLowerCase();
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    if (appId === "NotionAI") {
      const notionHost = host === "app.notion.com"
        || host === "notion.so"
        || host === "www.notion.so"
        || host.endsWith(".notion.so");
      if (!notionHost || path !== "/chat" || url.searchParams.getAll("t").length !== 1) return "";
      const threadId = String(url.searchParams.get("t") || "");
      return threadId ? `${host}${path}?t=${encodeURIComponent(threadId)}` : "";
    }
    if (appId !== "Grok") return "";
    if (
      host !== "grok.com"
      && !host.endsWith(".grok.com")
      && host !== "grok.x.ai"
      && !host.endsWith(".grok.x.ai")
      && host !== "gk.dairoot.cn"
      && !host.endsWith(".gk.dairoot.cn")
    ) return "";
    if (!/^\/(?:c|chat)\/[^/?#]+/i.test(path)) return "";
    return host + path;
  }

  function preferredModelLocationIsSameConversation(appId, previousHref, href) {
    const previousIdentity = preferredModelConversationIdentity(appId, previousHref);
    const nextIdentity = preferredModelConversationIdentity(appId, href);
    return Boolean(previousIdentity && nextIdentity && previousIdentity === nextIdentity);
  }

  function preferredModelSubmissionRouteState(appId, value) {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    if (appId === "Gemini") {
      if (host !== "gemini.google.com" && !host.endsWith(".gemini.google.com") && host !== "bard.google.com") return null;
      if (path === "/app") return { host, phase: "start" };
      const threadMatch = /^\/app\/([^/?#]+)/i.exec(path);
      if (threadMatch) return { host, phase: "terminal", threadId: threadMatch[1] };
      return null;
    }
    if (appId === "NotionAI") {
      const notionHost = host === "app.notion.com"
        || host === "notion.so"
        || host === "www.notion.so"
        || host.endsWith(".notion.so");
      if (!notionHost) return null;
      if (path === "/ai") return { host, phase: "start" };
      if (path === "/chat") {
        const threadId = String(url.searchParams.get("t") || "");
        return threadId ? { host, phase: "terminal", threadId } : { host, phase: "intermediate" };
      }
    }
    if (appId === "Grok") {
      const grokHost = host === "grok.com"
        || host.endsWith(".grok.com")
        || host === "grok.x.ai"
        || host.endsWith(".grok.x.ai")
        || host === "gk.dairoot.cn"
        || host.endsWith(".gk.dairoot.cn");
      if (!grokHost) return null;
      if (path === "/") return { host, phase: "start" };
      const threadMatch = /^\/(?:c|chat)\/([^/?#]+)/i.exec(path);
      if (threadMatch) return { host, phase: "terminal", threadId: threadMatch[1] };
    }
    return null;
  }

  function preferredModelSubmissionRouteRequirement(appId, value) {
    const route = preferredModelSubmissionRouteState(appId, value);
    if (!route) return { state: "unknown", route: null };
    const required = route.phase === "start"
      || (appId === "NotionAI" && route.phase === "intermediate");
    return { state: required ? "required" : "not-required", route };
  }

  function bindPreferredModelSubmissionInitialRoute(lease, initialHref) {
    const href = String(initialHref || "");
    const requirement = preferredModelSubmissionRouteRequirement(lease?.appId, href);
    if (!lease || requirement.state !== "required" || !requirement.route) return false;
    if (lease.routeConfirmed) {
      return lease.initialHref === href
        && lease.initialHost === requirement.route.host
        && lease.lastHref !== "";
    }
    lease.routeConfirmed = true;
    lease.initialHref = href;
    lease.initialHost = requirement.route.host;
    lease.lastHref = href;
    lease.lastPhase = requirement.route.phase;
    return true;
  }

  function preferredModelSubmissionCorrelation(lease, value = {}) {
    const sendId = String(value?.sendId || "");
    const observedAppId = MODEL_PREFERENCE_APP_ID_ALIASES[String(value?.appId || "")]
      || String(value?.appId || "");
    const initialHref = String(value?.initialHref || "");
    const barrierState = String(value?.barrierState || "");
    if (
      !lease
      || sendId !== lease.sendId
      || observedAppId !== lease.appId
      || !initialHref
      || !["required", "not-required", "unknown"].includes(barrierState)
    ) return null;
    const requirement = preferredModelSubmissionRouteRequirement(lease.appId, initialHref);
    if (requirement.state !== barrierState) return null;
    return { sendId, appId: observedAppId, initialHref, barrierState, requirement };
  }

  function preferredModelSubmissionBarrierSnapshot(iframe, sendId) {
    const id = String(sendId || "");
    const lease = preferredModelSubmissionNavigations.get(iframe);
    if (lease?.sendId === id) {
      if (!iframe?.isConnected) return { state: "detached", sendId: id, reason: "iframe detached during submission navigation" };
      if (lease.terminalObserved) return { state: "complete", sendId: id, reason: "terminal route observed" };
      if (Date.now() > lease.expiresAt) return { state: "expired", sendId: id, reason: "submission navigation expired" };
      return { state: "pending", sendId: id, reason: "" };
    }
    const outcome = preferredModelSubmissionOutcomes.get(iframe);
    if (outcome?.sendId === id) return outcome;
    return { state: "none", sendId: id, reason: "" };
  }

  function preferredModelSubmissionBarrierError(snapshot = {}) {
    const error = new Error(snapshot.reason || "submission navigation could not be verified");
    error.name = "SubmissionNavigationError";
    error.code = "SUBMISSION_BARRIER_UNCERTAIN";
    error.delivered = true;
    error.barrierState = snapshot.state || "unknown";
    return error;
  }

  function settlePreferredModelSubmissionWaiter(waiter, snapshot, error = null) {
    if (!preferredModelSubmissionWaiters.delete(waiter)) return;
    waiter.signal?.removeEventListener?.("abort", waiter.abort);
    if (error) waiter.reject(error);
    else waiter.resolve(snapshot);
  }

  function notifyPreferredModelSubmissionWaiters(iframe = null) {
    for (const waiter of [...preferredModelSubmissionWaiters]) {
      if (iframe && waiter.iframe !== iframe) continue;
      if (waiter.signal?.aborted) {
        settlePreferredModelSubmissionWaiter(waiter, null, preferredModelAbortError("submission barrier wait aborted"));
        continue;
      }
      const snapshot = preferredModelSubmissionBarrierSnapshot(waiter.iframe, waiter.sendId);
      if (snapshot.state === "pending") continue;
      if (snapshot.state === "none" || snapshot.state === "complete") {
        settlePreferredModelSubmissionWaiter(waiter, snapshot);
      } else {
        settlePreferredModelSubmissionWaiter(waiter, null, preferredModelSubmissionBarrierError(snapshot));
      }
    }
  }

  function waitForPreferredModelSubmissionBarrier(iframe, sendId, options = {}) {
    const snapshot = preferredModelSubmissionBarrierSnapshot(iframe, sendId);
    if (snapshot.state === "none" || snapshot.state === "complete") return Promise.resolve(snapshot);
    if (snapshot.state !== "pending") return Promise.reject(preferredModelSubmissionBarrierError(snapshot));
    const signal = options?.signal || null;
    if (signal?.aborted) return Promise.reject(preferredModelAbortError("submission barrier wait aborted"));
    return new Promise((resolve, reject) => {
      const waiter = { iframe, sendId: String(sendId || ""), signal, resolve, reject, abort: null };
      waiter.abort = () => settlePreferredModelSubmissionWaiter(
        waiter,
        null,
        preferredModelAbortError("submission barrier wait aborted")
      );
      preferredModelSubmissionWaiters.add(waiter);
      signal?.addEventListener?.("abort", waiter.abort, { once: true });
      notifyPreferredModelSubmissionWaiters(iframe);
    });
  }

  function clearPreferredModelSubmissionNavigation(iframe, state = "invalidated", reason = "") {
    const lease = preferredModelSubmissionNavigations.get(iframe);
    if (!lease) return;
    if (lease.timer) clearTimeout(lease.timer);
    lease.timer = 0;
    preferredModelSubmissionNavigations.delete(iframe);
    preferredModelSubmissionNavigationFrames.delete(iframe);
    preferredModelSubmissionOutcomes.set(iframe, {
      state,
      sendId: lease.sendId,
      reason: String(reason || state || "submission navigation ended")
    });
    notifyPreferredModelSubmissionWaiters(iframe);
  }

  function schedulePreferredModelSubmissionNavigationExpiry(iframe, lease) {
    if (!lease || preferredModelSubmissionNavigations.get(iframe) !== lease) return;
    if (lease.timer) clearTimeout(lease.timer);
    const delay = Math.max(0, Math.min(0x7fffffff, lease.expiresAt - Date.now()));
    lease.timer = window.setTimeout(() => {
      if (preferredModelSubmissionNavigations.get(iframe) !== lease) return;
      clearPreferredModelSubmissionNavigation(
        iframe,
        lease.terminalObserved ? "complete" : "expired",
        lease.terminalObserved ? "terminal route observed" : "submission navigation expired"
      );
    }, delay);
  }

  function armPreferredModelSubmissionNavigation(iframe, sendId, deadlineAt = 0, readinessLease = null) {
    const id = String(sendId || "").trim();
    const key = preferredModelFrameKey(iframe);
    if (!id || !iframe?.isConnected) return null;
    if (readinessLease && !preferredModelFrameReadinessIsCurrent(iframe, readinessLease)) {
      const error = new Error("preferred-model readiness changed before submission");
      error.code = "STALE_DOCUMENT";
      error.delivered = false;
      throw error;
    }
    const app = activeWorkspace().frameApp(iframe) || {};
    const appId = preferredModelAppId(app);
    if (appId !== "Gemini" && appId !== "NotionAI" && appId !== "Grok") return null;
    const documentId = String(iframe?.dataset?.preferredModelDocumentId || "");
    const bridgeVersion = String(iframe?.dataset?.preferredModelContentBridgeVersion || "");
    if (!documentId || !bridgeVersion) {
      const error = new Error("submission navigation requires an exact content document");
      error.code = "NOT_REGISTERED";
      error.delivered = false;
      throw error;
    }
    clearPreferredModelSubmissionNavigation(iframe, "superseded", "submission navigation was superseded");
    preferredModelSubmissionOutcomes.delete(iframe);
    const now = Date.now();
    const expiresAt = Math.max(
      now + MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS,
      Math.max(0, Number(deadlineAt) || 0) + MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS
    );
    const lease = {
      sendId: id,
      appId,
      initialHref: "",
      initialHost: "",
      documentId,
      bridgeVersion,
      recordKey: key,
      armedAt: now,
      hardExpiresAt: expiresAt,
      expiresAt,
      observed: false,
      routeConfirmed: false,
      terminalObserved: false,
      terminalThreadId: "",
      lastHref: "",
      lastPhase: "",
      timer: 0
    };
    preferredModelSubmissionNavigations.set(iframe, lease);
    preferredModelSubmissionNavigationFrames.add(iframe);
    schedulePreferredModelSubmissionNavigationExpiry(iframe, lease);
    return lease;
  }

  function finishPreferredModelSubmissionNavigation(iframe, sendId, sent, correlation = null) {
    const lease = preferredModelSubmissionNavigations.get(iframe);
    if (!lease || lease.sendId !== String(sendId || "")) return;
    lease.sendSettledAt = Date.now();
    lease.sent = Boolean(sent);
    if (sent) {
      const confirmed = preferredModelSubmissionCorrelation(lease, correlation);
      if (!confirmed || confirmed.barrierState === "unknown") {
        clearPreferredModelSubmissionNavigation(
          iframe,
          "invalidated",
          "submission navigation correlation was not confirmed by the exact content document"
        );
        return;
      }
      if (confirmed.barrierState === "not-required") {
        clearPreferredModelSubmissionNavigation(
          iframe,
          "complete",
          "the exact content route does not require a submission navigation barrier"
        );
        return;
      }
      if (!bindPreferredModelSubmissionInitialRoute(lease, confirmed.initialHref)) {
        clearPreferredModelSubmissionNavigation(
          iframe,
          "invalidated",
          "submission navigation initial route did not match the exact content result"
        );
        return;
      }
    }
    if (lease.terminalObserved) {
      notifyPreferredModelSubmissionWaiters(iframe);
      return;
    }
    lease.expiresAt = Math.min(
      lease.hardExpiresAt,
      Date.now() + (sent ? MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS : 2000)
    );
    schedulePreferredModelSubmissionNavigationExpiry(iframe, lease);
    notifyPreferredModelSubmissionWaiters(iframe);
  }

  function preservePreferredModelForSubmissionNavigation(iframe, event = {}) {
    const lease = preferredModelSubmissionNavigations.get(iframe);
    if (!lease) return false;
    const reject = () => {
      clearPreferredModelSubmissionNavigation(iframe, "invalidated", "submission navigation correlation was invalidated");
      return false;
    };
    if (Date.now() > lease.expiresAt) return reject();
    const navigation = event.navigation;
    const submission = navigation?.submission;
    const kind = String(navigation?.kind || "").toLowerCase();
    if (!submission || !["pushstate", "replacestate", "poll"].includes(kind)) return reject();
    if (String(submission.sendId || "") !== lease.sendId) return reject();
    const observedAppId = MODEL_PREFERENCE_APP_ID_ALIASES[String(submission.appId || "")]
      || String(submission.appId || "");
    if (observedAppId && observedAppId !== lease.appId) return reject();
    if (String(navigation.documentId || "") !== lease.documentId) return reject();
    if (String(navigation.bridgeVersion || "") !== lease.bridgeVersion) return reject();
    if (!iframe?.isConnected) return reject();
    if (lease.recordKey && preferredModelFrameKey(iframe) !== lease.recordKey) return reject();
    if (!bindPreferredModelSubmissionInitialRoute(lease, submission.initialHref)) return reject();
    const nextRoute = preferredModelSubmissionRouteState(lease.appId, event.href);
    if (!nextRoute || nextRoute.host !== lease.initialHost) return reject();
    if (String(event.previousHref || "") !== lease.lastHref) return reject();
    const allowedPhaseTransition = lease.appId === "Gemini" || lease.appId === "Grok"
      ? (
          (lease.lastPhase === "start" && (nextRoute.phase === "start" || nextRoute.phase === "terminal"))
          || (lease.lastPhase === "terminal" && nextRoute.phase === "terminal")
        )
      : (
          (lease.lastPhase === "start" && ["start", "intermediate", "terminal"].includes(nextRoute.phase))
          || (lease.lastPhase === "intermediate" && ["intermediate", "terminal"].includes(nextRoute.phase))
          || (lease.lastPhase === "terminal" && nextRoute.phase === "terminal")
        );
    if (!allowedPhaseTransition) return reject();
    if (
      lease.terminalThreadId
      && (nextRoute.phase !== "terminal" || nextRoute.threadId !== lease.terminalThreadId)
    ) return reject();
    lease.observed = true;
    lease.lastHref = String(event.href || "");
    lease.lastPhase = nextRoute.phase;
    if (nextRoute.phase === "terminal") {
      lease.terminalObserved = true;
      lease.terminalThreadId = lease.terminalThreadId || String(nextRoute.threadId || "");
      preferredModelSubmissionOutcomes.set(iframe, {
        state: "complete",
        sendId: lease.sendId,
        reason: "terminal route observed"
      });
      notifyPreferredModelSubmissionWaiters(iframe);
    }
    return true;
  }

  function preferredModelRecordIsCurrent(iframe, record) {
    return Boolean(
      iframe?.isConnected
      && preferredModelApplyRuns.get(iframe) === record
      && record?.key
      && record.key === preferredModelFrameKey(iframe)
    );
  }

  function preferredModelResult(runId, values = {}) {
    return {
      ok: false,
      skipped: false,
      changed: false,
      cancelled: false,
      retryable: false,
      reason: "",
      runId,
      ...values
    };
  }

  function preferredModelAttemptSucceeded(result = {}) {
    return result.ok === true && result.unavailable !== true && result.unsupported !== true;
  }

  function preferredModelSecondaryEligible(record, result = {}) {
    const explicitlyUnavailable = result.unavailable === true
      && result.selectionActivated === false;
    const selectionDidNotSettle = result.ok === false
      && result.selectionUnsettled === true
      && result.selectionActivated === true;
    return Boolean(
      record?.stage === "primary"
      && record.secondaryModelId
      && result.fallbackEligible === true
      && result.menuClosed === true
      && result.cancelled !== true
      && (explicitlyUnavailable || selectionDidNotSettle)
    );
  }

  function preferredModelAttemptFailureReason(result = {}) {
    return compactPreferredModelFailureReason(result);
  }

  function preferredModelRecordResult(record, attemptResult = {}) {
    const success = preferredModelAttemptSucceeded(attemptResult);
    const fallbackAttempted = record?.fallbackAttempted === true;
    const requestedModelId = String(record?.requestedModelId || attemptResult.modelId || "");
    const appliedModelId = success ? String(attemptResult.modelId || record?.payload?.modelId || "") : "";
    const base = {
      ...attemptResult,
      requestedModelId,
      appliedModelId,
      fallbackAttempted,
      fallbackUsed: fallbackAttempted && success
    };
    if (!fallbackAttempted) return base;

    const primaryResult = record?.primaryResult || {};
    const primaryReason = preferredModelAttemptFailureReason(primaryResult);
    const secondaryReason = success ? "" : preferredModelAttemptFailureReason(attemptResult);
    const interactionCount = Math.max(0, Number(primaryResult.interactionCount) || 0)
      + Math.max(0, Number(attemptResult.interactionCount) || 0);
    return {
      ...base,
      interactionCount,
      primaryRunId: String(record?.primaryRunId || ""),
      secondaryRunId: String(record?.runId || attemptResult.runId || ""),
      ...(success
        ? {
            unavailable: false,
            unsupported: false,
            fallbackEligible: false,
            reason: ""
          }
        : {
            primaryReason,
            secondaryReason,
            reason: [primaryReason, secondaryReason].filter(Boolean).join(" → ")
          })
    };
  }

  function requestPreferredModelCancellation(iframe, record, reason) {
    if (!iframe?.contentWindow || !record?.runId) return;
    const payload = {
      ...record.payload,
      runId: record.runId,
      reason: String(reason || "cancelled")
    };
    sendToContentFrame(
      iframe,
      "cancelPreferredModelApply",
      payload,
      { timeoutMs: MODEL_PREFERENCE_CANCEL_TIMEOUT_MS }
    ).catch(() => {});
  }

  function stopPreferredModelRecord(iframe, record, reason, options = {}) {
    if (!record) return;
    clearPreferredModelSubmissionNavigation(iframe, "invalidated", String(reason || "preferred-model record stopped"));
    if (record.timer) clearTimeout(record.timer);
    record.timer = 0;
    const wasInFlight = record.inFlight;
    record.controller?.abort?.();
    record.controller = null;
    record.pending = false;
    record.inFlight = false;
    record.cancelled = true;
    record.statusToast?.remove?.();
    record.statusToast = null;
    if (options.notify !== false && wasInFlight) {
      requestPreferredModelCancellation(iframe, record, reason);
    }
  }

  function createPreferredModelRecord(iframe, payload, key, delays, options = {}) {
    const runId = createId("model-apply");
    const requestedPayload = { ...payload };
    const requestedModelId = String(requestedPayload.modelId || "");
    const secondaryModelId = String(requestedPayload.secondaryModelId || "");
    const rememberedFallback = options.rememberedFallback;
    const startWithSecondary = Boolean(rememberedFallback);
    const initialModelId = startWithSecondary ? secondaryModelId : requestedModelId;
    const record = {
      iframe,
      payload: preferredModelAttemptPayload(requestedPayload, initialModelId, runId),
      requestedPayload,
      requestedModelId,
      secondaryModelId,
      key,
      delays,
      runId,
      primaryRunId: startWithSecondary ? "" : runId,
      stage: startWithSecondary ? "secondary" : "primary",
      fallbackAttempted: startWithSecondary,
      fallbackMemoryUsed: startWithSecondary,
      primaryResult: null,
      attempt: Math.max(0, Number(options.attempt) || 0),
      timer: 0,
      controller: null,
      pending: true,
      inFlight: false,
      success: false,
      terminal: false,
      cancelled: false,
      result: null,
      failureReason: "",
      bridgeRecoveryAttempts: 0,
      statusToast: null
    };
    record.statusToast = createFrameToast(
      iframe,
      t("toast.frameModelSwitchPending"),
      "info",
      preferredModelState.options?.frameToastPosition
    );
    return record;
  }

  function startPreferredModelSecondary(iframe, record, primaryResult) {
    if (!preferredModelRecordIsCurrent(iframe, record)) return false;
    record.primaryResult = primaryResult;
    record.fallbackAttempted = true;
    record.stage = "secondary";
    record.payload = preferredModelAttemptPayload(record.requestedPayload, record.secondaryModelId);
    record.runId = createId("model-apply");
    record.attempt = 0;
    record.bridgeRecoveryAttempts = 0;
    record.controller = null;
    record.pending = true;
    record.inFlight = false;
    record.success = false;
    record.terminal = false;
    record.cancelled = false;
    record.failureReason = "";
    record.result = {
      ...primaryResult,
      requestedModelId: record.requestedModelId,
      appliedModelId: "",
      fallbackAttempted: true,
      fallbackUsed: false
    };
    schedulePreferredModelRecordRun(iframe, record, 0);
    return true;
  }

  function schedulePreferredModelRecordRun(iframe, record, delay = 0) {
    if (!preferredModelRecordIsCurrent(iframe, record) || record.success || record.terminal) return;
    if (record.timer) clearTimeout(record.timer);
    record.timer = 0;
    record.pending = true;
    const pendingMessage = record.stage === "secondary"
      ? t("toast.frameSecondaryModelSwitchPending", {
          model: preferredModelTargetLabel(record.payload)
        })
      : t("toast.frameModelSwitchPending");
    record.statusToast?.update?.(pendingMessage, "info");
    syncPreferredModelInputGate();
    record.timer = window.setTimeout(() => {
      record.timer = 0;
      runPreferredModelRecord(iframe, record);
    }, Math.max(0, Number(delay) || 0));
  }

  function cleanupDetachedPreferredModelFrames() {
    let changed = false;
    for (const [iframe, record] of preferredModelApplyRuns) {
      if (iframe?.isConnected) continue;
      stopPreferredModelRecord(iframe, record, "frame-detached");
      preferredModelApplyRuns.delete(iframe);
      changed = true;
    }
    for (const iframe of [...preferredModelSubmissionNavigationFrames]) {
      if (iframe?.isConnected) continue;
      clearPreferredModelSubmissionNavigation(iframe, "detached", "iframe detached during submission navigation");
    }
    if (changed) syncPreferredModelInputGate();
    else notifyPreferredModelFrameWaiters();
    return changed;
  }

  function invalidatePreferredModelFrame(iframe, reason = "frame-invalidated", { clearDocumentId = false } = {}) {
    if (!iframe) return;
    const record = preferredModelApplyRuns.get(iframe);
    if (record) stopPreferredModelRecord(iframe, record, reason);
    preferredModelApplyRuns.delete(iframe);
    if (clearDocumentId) {
      delete iframe.dataset.preferredModelDocumentId;
      delete iframe.dataset.preferredModelContentBridgeVersion;
      delete iframe.dataset.preferredModelContentRuntimeImplementation;
      delete iframe.dataset.summaryRuntimeDocumentId;
      delete iframe.dataset.summaryRuntimeBridgeVersion;
      delete iframe.dataset.summaryRuntimeImplementationVersion;
      iframe.dataset.contentRuntimeCapabilitiesEpoch = String(
        Math.max(0, Number(iframe.dataset.contentRuntimeCapabilitiesEpoch) || 0) + 1
      );
      delete iframe.dataset.contentRuntimeCapabilitiesDocumentId;
      delete iframe.dataset.contentRuntimeCapabilities;
    }
    syncPreferredModelInputGate();
  }

  function handlePreferredModelFrameLifecycleChange(change = {}) {
    const isFrame = typeof HTMLIFrameElement !== "undefined" && change instanceof HTMLIFrameElement;
    const event = isFrame ? { type: "workspace-sync", iframe: change } : (change || {});
    const iframe = event.iframe || null;
    if (preferredModelGateBootstrapping && !(event.type === "loading" && event.loading)) {
      syncPreferredModelInputGate();
      return;
    }
    if (event.type === "loading") {
      if (event.loading) {
        if (iframe) iframe.dataset.preferredModelNavigationInvalidated = "1";
        invalidatePreferredModelFrame(iframe, "navigation-start", { clearDocumentId: true });
      } else if (iframe?.isConnected) {
        schedulePreferredModelApplyToFrame(iframe);
      }
      syncPreferredModelInputGate();
      return;
    }
    if (event.type === "active-tab") {
      if (iframe?.isConnected) schedulePreferredModelApplyToFrame(iframe);
      syncPreferredModelInputGate();
      return;
    }
    if (event.type === "location") {
      if (iframe?.isConnected) {
        const app = activeWorkspace().frameApp(iframe) || {};
        const sameConversation = preferredModelLocationIsSameConversation(
          preferredModelAppId(app),
          event.previousHref,
          event.href
        );
        if (sameConversation) {
          const currentKey = preferredModelFrameKey(iframe);
          const existing = preferredModelApplyRuns.get(iframe);
          const existingIsUsable = Boolean(
            existing?.key === currentKey
            && existing.cancelled !== true
            && (existing.success || existing.terminal || existing.inFlight || existing.timer)
          );
          if (existingIsUsable) {
            syncPreferredModelInputGate();
            return;
          }
        }
        if (!preservePreferredModelForSubmissionNavigation(iframe, event)) {
          invalidatePreferredModelFrame(iframe, "location-changed");
          schedulePreferredModelApplyToFrame(iframe);
        }
      }
      syncPreferredModelInputGate();
      return;
    }
    if (event.type === "workspace-sync") {
      cleanupDetachedPreferredModelFrames();
      const activeFrames = Array.from(event.activeFrames || activeWorkspace().currentFrames()).filter(Boolean);
      for (const activeFrame of activeFrames) schedulePreferredModelApplyToFrame(activeFrame);
      syncPreferredModelInputGate();
    }
  }

  function installPreferredModelFrameCleanup() {
    if (preferredModelFrameCleanupObserver) return;
    preferredModelFrameCleanupObserver = new MutationObserver(cleanupDetachedPreferredModelFrames);
    preferredModelFrameCleanupObserver.observe(appRoot, { childList: true, subtree: true });
  }

  async function applyPreferredModelToFrame(iframe, record) {
    const payload = preferredModelAttemptPayload(record.payload, record.payload.modelId, record.runId);
    let registration = await verifiedCurrentContentFrameRegistration(iframe);
    if (!registration || !preferredModelContentRuntimeReady(iframe, registration)) {
      record.bridgeRecoveryAttempts = Math.max(0, Number(record.bridgeRecoveryAttempts) || 0) + 1;
      const preparationSignal = record.controller?.signal || null;
      const prepared = await waitForPreferredModelBridgePreparation(
        () => prepareContentFrameRuntime(iframe, { features: ["preferred-model"] }),
        {
          signal: preparationSignal,
          ownerIsCurrent: () => preferredModelRecordIsCurrent(iframe, record)
        }
      );
      if (
        prepared?.cancelled
        || !preferredModelRecordIsCurrent(iframe, record)
        || preparationSignal?.aborted
      ) {
        return preferredModelResult(record.runId, {
          cancelled: true,
          reason: prepared?.reason || "preferred-model frame was superseded during bridge recovery"
        });
      }
      if (prepared?.ok === true) {
        registration = await verifiedCurrentContentFrameRegistration(iframe);
      }
      if (!registration || !preferredModelContentRuntimeReady(iframe, registration)) {
        return preferredModelResult(record.runId, {
          retryable: true,
          reason: prepared?.reason || "iframe content bridge recovery failed"
        });
      }
    }
    if (!preferredModelRecordIsCurrent(iframe, record) || record.controller?.signal?.aborted) {
      return preferredModelResult(record.runId, {
        cancelled: true,
        reason: "preferred-model frame changed before apply"
      });
    }
    try {
      const result = await sendToContentFrame(
        iframe,
        "applyPreferredModel",
        payload,
        {
          timeoutMs: preferredModelApplyTimeoutMs(payload),
          signal: record.controller?.signal,
          expectedDocumentId: registration.documentId,
          skipEnsure: true
        }
      );
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        return preferredModelResult(record.runId, { reason: "preferred-model response was malformed" });
      }
      if (String(result?.runId || "") !== record.runId) {
        return preferredModelResult(record.runId, { reason: "preferred-model response runId mismatch" });
      }
      if (
        String(result.appId || "") !== String(payload.appId || "")
        || String(result.modelId || "") !== String(payload.modelId || "")
      ) {
        return preferredModelResult(record.runId, { reason: "preferred-model response target mismatch" });
      }
      return preferredModelResult(record.runId, result || {});
    } catch (error) {
      const cancelled = error?.code === "ABORTED" || error?.name === "AbortError";
      const timedOut = error?.code === "TIMEOUT"
        || /timeout waiting for response/i.test(String(error?.message || ""));
      const retryable = error?.delivered === false
        && PREFERRED_MODEL_PRE_DELIVERY_RETRY_CODES.includes(String(error?.code || ""));
      if (timedOut) requestPreferredModelCancellation(iframe, record, "parent-timeout");
      return preferredModelResult(record.runId, {
        cancelled,
        retryable,
        reason: error?.message || String(error || "preferred-model request failed")
      });
    }
  }

  async function runPreferredModelRecord(iframe, record) {
    if (!preferredModelRecordIsCurrent(iframe, record) || record.success || record.terminal) return;
    if (preferredModelFrameIsLoading(iframe)) {
      record.pending = true;
      record.inFlight = false;
      syncPreferredModelInputGate();
      return;
    }
    const runId = record.runId;
    const key = record.key;
    record.pending = false;
    record.inFlight = true;
    record.cancelled = false;
    record.controller = new AbortController();
    const result = await applyPreferredModelToFrame(iframe, record);
    if (!preferredModelRecordIsCurrent(iframe, record) || record.runId !== runId || record.key !== key) return;
    record.controller = null;
    record.inFlight = false;
    record.result = result;
    if (preferredModelSecondaryEligible(record, result)) {
      if (startPreferredModelSecondary(iframe, record, result)) return;
    }
    if (preferredModelAttemptSucceeded(result)) {
      rememberPreferredModelFallback(record, result);
      const finalResult = preferredModelRecordResult(record, result);
      record.result = finalResult;
      record.success = true;
      record.terminal = true;
      const model = preferredModelTargetLabel(
        preferredModelAttemptPayload(record.requestedPayload, finalResult.appliedModelId)
      );
      const changedKey = record.fallbackAttempted
        ? "toast.frameSecondaryModelSwitchChanged"
        : "toast.frameModelSwitchChanged";
      const readyKey = record.fallbackAttempted
        ? "toast.frameSecondaryModelSwitchReady"
        : "toast.frameModelSwitchReady";
      syncPreferredModelInputGate();
      record.statusToast?.update?.(
        finalResult.changed === true
          ? t(changedKey, { model })
          : t(readyKey, { model }),
        "success"
      );
      record.statusToast?.dismiss?.(2000);
      return;
    }
    const retryDelay = preferredModelRetryDelay(record, result);
    if (retryDelay !== null) {
      record.cancelled = false;
      record.attempt += 1;
      schedulePreferredModelRecordRun(iframe, record, retryDelay);
      return;
    }
    const finalResult = preferredModelRecordResult(record, result);
    record.result = finalResult;
    record.terminal = true;
    record.cancelled = finalResult.cancelled === true;
    record.failureReason = record.fallbackAttempted
      ? compactPreferredModelFailureReason({
          reason: t("toast.frameSecondaryModelSwitchFailed", {
            primaryReason: finalResult.primaryReason,
            reason: finalResult.secondaryReason
          })
        })
      : compactPreferredModelFailureReason(finalResult);
    syncPreferredModelInputGate();
    record.statusToast?.update?.(
      record.fallbackAttempted
        ? record.failureReason
        : t("toast.frameModelSwitchFailed", { reason: record.failureReason }),
      "error"
    );
    record.statusToast?.dismiss?.(5000);
    if (!record.cancelled) {
      const app = workspace.frameApp(iframe) || {};
      void recordFunctionalAnomaly({
        feature: "preferredModel",
        operation: "applyPreferredModel",
        appId: record.payload.appId || app.id || "",
        appName: app.name || record.payload.appId || "",
        href: iframe?.dataset?.currentHref || app.url || "",
        error: finalResult,
        message: record.failureReason
      });
    }
    console.warn(
      "[ChatClub] Preferred model was not applied",
      record.payload.appId,
      record.payload.modelId,
      finalResult.reason || finalResult
    );
  }

  function schedulePreferredModelApplyToFrame(iframe, options = {}) {
    if (!iframe) return null;
    const existing = preferredModelApplyRuns.get(iframe);
    const key = preferredModelFrameKey(iframe);
    if (preferredModelFrameIsLoading(iframe)) {
      const existingIsSettled = Boolean(existing?.success || existing?.terminal);
      if (existing?.key === key && existingIsSettled) {
        syncPreferredModelInputGate();
        return existing;
      }
      if (existing) {
        stopPreferredModelRecord(iframe, existing, "frame-loading");
        preferredModelApplyRuns.delete(iframe);
      }
      syncPreferredModelInputGate();
      return null;
    }
    if (!key) {
      if (existing) {
        stopPreferredModelRecord(iframe, existing, "preference-cleared");
        preferredModelApplyRuns.delete(iframe);
      }
      syncPreferredModelInputGate();
      return null;
    }
    const existingIsSettled = Boolean(existing?.success || existing?.terminal);
    const existingIsRunning = Boolean(
      existing?.cancelled !== true
      && (existing?.inFlight || existing?.timer)
    );
    if (existing?.key === key && (existingIsSettled || existingIsRunning)) {
      return existing;
    }
    if (existing) stopPreferredModelRecord(iframe, existing, "superseded");
    const app = activeWorkspace().frameApp(iframe);
    const payload = preferredModelPayloadForApp(app);
    if (!payload) {
      preferredModelApplyRuns.delete(iframe);
      syncPreferredModelInputGate();
      return null;
    }
    const notionAllSources = payload.appId === "NotionAI" && Boolean(payload.allSourcesState);
    const delays = notionAllSources
      ? (options.immediate
          ? NOTION_ALL_SOURCES_APPLY_RETRY_DELAYS
          : NOTION_ALL_SOURCES_READY_APPLY_RETRY_DELAYS)
      : (options.immediate
          ? MODEL_PREFERENCE_APPLY_RETRY_DELAYS
          : MODEL_PREFERENCE_READY_APPLY_RETRY_DELAYS);
    const rememberedFallback = preferredModelRememberedFallback(payload);
    const record = createPreferredModelRecord(iframe, payload, key, delays, { rememberedFallback });
    preferredModelApplyRuns.set(iframe, record);
    schedulePreferredModelRecordRun(iframe, record, delays[0]);
    return record;
  }

  async function applyPreferredModelsToFrames(frames = null, options = {}) {
    const frameList = frames
      ? Array.from(frames).filter(Boolean)
      : Array.from(document.querySelectorAll(".chat-frame"));
    const immediate = options.immediate !== false;
    for (const iframe of frameList) schedulePreferredModelApplyToFrame(iframe, { immediate });
    syncPreferredModelInputGate();
  }

  function finishBootstrapping() {
    preferredModelGateBootstrapping = false;
    return syncPreferredModelInputGate();
  }

  return Object.freeze({
    applyPreferredModelsToFrames,
    armPreferredModelSubmissionNavigation,
    finishBootstrapping,
    finishPreferredModelSubmissionNavigation,
    handlePreferredModelFrameLifecycleChange,
    installPreferredModelFrameCleanup,
    invalidatePreferredModelFrame,
    preferredModelFailurePolicyForApp,
    preferredModelFrameReadiness,
    preferredModelFrameReadinessIsCurrent,
    preferredModelFrameIsLoading,
    schedulePreferredModelApplyToFrame,
    syncPreferredModelSelectionOverlays,
    syncPreferredModelInputGate,
    waitForPreferredModelFrame,
    waitForPreferredModelSubmissionBarrier
  });
}
