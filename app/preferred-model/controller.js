import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import { el, toast } from "../../ui/dom.js";
import { createFrameToast } from "../../ui/frame-toast.js";
import { validateControllerContract } from "../controller-contract.js";
import { createFrameRequest } from "../frame-request.js";

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
const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;
const MODEL_PREFERENCE_CANCEL_TIMEOUT_MS = 1200;
const MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS = 15000;
const FRAME_SUBMIT_ERROR_MAX_CHARS = 160;

export function createPreferredModelController(dependencies = {}) {
  const controllerName = "Preferred Model controller";
  const {
    state: preferredModelState,
    workspace,
    framePort,
    appRoot,
    composer,
    verifiedCurrentContentFrameRegistration,
    prepareContentFrameRuntime,
    recordFunctionalAnomaly
  } = validateControllerContract(dependencies, controllerName, {
    state: "object",
    workspace: "object",
    framePort: "object",
    appRoot: "object",
    composer: "object",
    verifiedCurrentContentFrameRegistration: "function",
    prepareContentFrameRuntime: "function",
    recordFunctionalAnomaly: "function"
  });
  for (const method of [
    "normalizePromptImages",
    "rememberPromptSelection",
    "syncPromptCollapsedPreview",
    "restorePromptSelection",
    "closePromptActionsMenu",
    "promptHasContent",
    "collapsePromptInput"
  ]) {
    if (typeof composer[method] !== "function") {
      throw new TypeError(`Preferred Model composer port requires ${method}().`);
    }
  }
  for (const method of ["currentFrames", "frameApp"]) {
    if (typeof workspace[method] !== "function") {
      throw new TypeError(`Preferred Model workspace port requires ${method}().`);
    }
  }

  const {
    normalizePromptImages,
    rememberPromptSelection,
    syncPromptCollapsedPreview,
    restorePromptSelection,
    closePromptActionsMenu,
    promptHasContent,
    collapsePromptInput
  } = composer;

  const preferredModelApplyRuns = new Map();
  let preferredModelPromptComposing = false;
  let preferredModelComposingPromptInput = null;
  let preferredModelGateBootstrapping = true;
  let preferredModelLockedPromptSnapshot = null;
  let preferredModelGateBlockedToastAt = 0;
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

  function preferredGeminiThinkingLevel() {
    const preferences = preferredModelState.modelPreferenceDraft || preferredModelState.options?.modelPreferences || {};
    const value = String(preferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY] || DEFAULT_GEMINI_THINKING_LEVEL);
    return GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === value)
      ? value
      : DEFAULT_GEMINI_THINKING_LEVEL;
  }

  function preferredModelPayloadForApp(app) {
    const appId = preferredModelAppId(app);
    const modelId = preferredModelForApp(app);
    if (!modelId) return null;
    return {
      appId,
      modelId,
      ...(appId === "Gemini" && modelId === "pro" ? { thinkingLevel: preferredGeminiThinkingLevel() } : {})
    };
  }

  function preferredModelInputGateIsLocked() {
    return preferredModelState.preferredModelGateState !== "ready";
  }

  function preferredModelPromptSnapshotFromState() {
    return {
      text: String(preferredModelState.promptText || ""),
      images: normalizePromptImages(preferredModelState.promptImages),
      selection: { ...(preferredModelState.promptSelection || { start: 0, end: 0, direction: "none" }) }
    };
  }

  function rememberPreferredModelLockedPromptSnapshot() {
    preferredModelLockedPromptSnapshot = preferredModelPromptSnapshotFromState();
    return preferredModelLockedPromptSnapshot;
  }

  function capturePreferredModelLockedPromptSnapshot() {
    const inputNode = document.querySelector(".prompt-input");
    if (inputNode) {
      preferredModelState.promptText = inputNode.value;
      rememberPromptSelection(inputNode);
    }
    return rememberPreferredModelLockedPromptSnapshot();
  }

  function restorePreferredModelLockedPromptSnapshot() {
    const snapshot = preferredModelLockedPromptSnapshot;
    if (!snapshot) return;
    preferredModelState.promptText = snapshot.text;
    preferredModelState.promptImages = normalizePromptImages(snapshot.images);
    preferredModelState.promptSelection = { ...snapshot.selection };
    const inputNode = document.querySelector(".prompt-input");
    if (!inputNode) return;
    inputNode.value = snapshot.text;
    syncPromptCollapsedPreview(inputNode);
    restorePromptSelection(inputNode);
  }

  function notifyPreferredModelGateBlocked() {
    const now = Date.now();
    if (now - preferredModelGateBlockedToastAt < 1600) return;
    preferredModelGateBlockedToastAt = now;
    toast(t("toast.modelGateBlocked"), "info");
  }

  function ensurePreferredModelInputReady({ notify = true } = {}) {
    if (!preferredModelInputGateIsLocked()) return true;
    if (notify) notifyPreferredModelGateBlocked();
    return false;
  }

  function preferredModelTargetLabel(payload = {}) {
    const target = (MODEL_PREFERENCE_TARGETS[payload.appId] || [])
      .find((item) => item.id === payload.modelId);
    const baseLabel = String(target?.label || payload.modelId || payload.appId || "");
    if (payload.appId !== "Gemini" || payload.modelId !== "pro" || !payload.thinkingLevel) return baseLabel;
    const level = GEMINI_THINKING_LEVEL_TARGETS.find((item) => item.id === payload.thinkingLevel);
    return level?.label ? baseLabel + " · " + level.label : baseLabel;
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
    if (interactionCount > 0 || (result.retryable !== true && result.cancelled !== true)) return null;
    const nextAttempt = Math.max(0, Number(record.attempt) || 0) + 1;
    if (!Array.isArray(record.delays) || nextAttempt >= record.delays.length) return null;
    return Math.max(0, Number(record.delays[nextAttempt]) || 0);
  }

  function preferredModelFrameIsLoading(iframe) {
    const instanceId = String(iframe?.dataset?.instanceId || "");
    return Boolean(instanceId && (preferredModelState.frameLoadingInstanceIds || []).includes(instanceId));
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
      if (preferredModelFrameIsLoading(iframe)) {
        pendingCount += 1;
        continue;
      }
      const key = preferredModelFrameKey(iframe);
      const record = preferredModelApplyRuns.get(iframe);
      if (record?.key === key && record.success) continue;
      if (record?.key === key && record.terminal) {
        failures.push({
          appId: payload.appId,
          reason: record.failureReason || t("toast.frameModelSwitchFailureFallback")
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

  function syncPreferredModelInputGate() {
    const next = preferredModelGateStatus();
    const wasLocked = preferredModelInputGateIsLocked();
    const willBeLocked = next.state !== "ready";
    if (willBeLocked && (!wasLocked || !preferredModelLockedPromptSnapshot)) {
      capturePreferredModelLockedPromptSnapshot();
    } else if (!willBeLocked) {
      preferredModelLockedPromptSnapshot = null;
    }

    preferredModelState.preferredModelGateState = next.state;
    preferredModelState.preferredModelGateReason = next.reason;
    preferredModelState.preferredModelGatePendingCount = next.pendingCount;
    preferredModelState.preferredModelGateFailedCount = next.failedCount;
    preferredModelState.preferredModelGateFailedAppIds = next.failedAppIds;

    if (willBeLocked) closePromptActionsMenu();
    document.querySelectorAll(".prompt-shell").forEach((shell) => {
      const inputNode = shell.querySelector(".prompt-input");
      const composingHere = preferredModelPromptCompositionIsActive(inputNode);
      const applying = next.state === "bootstrapping" || next.state === "applying";
      const failed = next.state === "failed";
      shell.classList.toggle("prompt-shell-model-gate-applying", applying);
      shell.classList.toggle("prompt-shell-model-gate-failed", failed);
      shell.dataset.modelGateState = next.state;
      shell.dataset.modelGatePendingCount = String(next.pendingCount);
      shell.dataset.modelGateFailedCount = String(next.failedCount);
      shell.dataset.modelGateFailedAppIds = next.failedAppIds.join(",");
      shell.setAttribute("aria-busy", willBeLocked ? "true" : "false");

      if (inputNode) {
        inputNode.readOnly = willBeLocked && !composingHere;
        inputNode.dataset.modelGateState = next.state;
        inputNode.setAttribute("aria-busy", willBeLocked ? "true" : "false");
        if (willBeLocked) {
          inputNode.setAttribute(
            "aria-label",
            failed
              ? t("topbar.modelGateFailedAria", { reason: next.reason })
              : t("topbar.modelGateApplyingAria")
          );
        } else {
          inputNode.removeAttribute("aria-label");
        }
      }

      shell.querySelectorAll(".prompt-actions-button, .prompt-image-file-input, .prompt-clear-button, .prompt-image-remove")
        .forEach((node) => { node.disabled = willBeLocked; });
      const sendButton = shell.querySelector(".prompt-send-button");
      if (sendButton) {
        sendButton.disabled = willBeLocked
          || preferredModelState.promptSendInFlight
          || !promptHasContent(inputNode?.value ?? preferredModelState.promptText, preferredModelState.promptImages);
      }

      let statusNode = shell.querySelector(".prompt-model-gate-status");
      if (!statusNode) {
        statusNode = el("div", {
          class: "prompt-model-gate-status",
          "aria-live": "polite",
          "aria-atomic": "true"
        });
        shell.append(statusNode);
      }
      statusNode.hidden = !willBeLocked;
      if (willBeLocked) {
        const statusText = failed
          ? t("topbar.modelGateFailed", { reason: next.reason })
          : t("topbar.modelGateApplying");
        const announcementKey = (applying ? "applying:" : "failed:") + statusText;
        if (statusNode.dataset.modelGateAnnouncementKey !== announcementKey) {
          statusNode.dataset.modelGateAnnouncementKey = announcementKey;
          statusNode.replaceChildren(...[
            applying ? el("span", { class: "prompt-model-gate-spinner", "aria-hidden": "true" }) : null,
            el("span", { class: "prompt-model-gate-status-text" }, statusText)
          ].filter(Boolean));
        }
      } else {
        delete statusNode.dataset.modelGateAnnouncementKey;
        if (statusNode.childNodes.length) statusNode.replaceChildren();
      }
    });
    return next;
  }

  function preferredModelFrameKey(iframe) {
    if (!iframe) return "";
    const app = activeWorkspace().frameApp(iframe);
    const payload = preferredModelPayloadForApp(app);
    if (!payload) return "";
    const thinkingLevel = payload.thinkingLevel ? ":" + payload.thinkingLevel : "";
    const documentId = String(iframe.dataset.preferredModelDocumentId || "");
    return payload.appId + ":" + payload.modelId + thinkingLevel + ":" + documentId;
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
    return null;
  }

  function clearPreferredModelSubmissionNavigation(record) {
    const lease = record?.submissionNavigationLease;
    if (!lease) return;
    if (lease.timer) clearTimeout(lease.timer);
    lease.timer = 0;
    if (record.submissionNavigationLease === lease) record.submissionNavigationLease = null;
  }

  function schedulePreferredModelSubmissionNavigationExpiry(record) {
    const lease = record?.submissionNavigationLease;
    if (!lease) return;
    if (lease.timer) clearTimeout(lease.timer);
    const delay = Math.max(0, Math.min(0x7fffffff, lease.expiresAt - Date.now()));
    lease.timer = window.setTimeout(() => {
      if (record.submissionNavigationLease === lease) record.submissionNavigationLease = null;
    }, delay);
  }

  function armPreferredModelSubmissionNavigation(iframe, sendId, deadlineAt = 0) {
    const id = String(sendId || "").trim();
    const record = preferredModelApplyRuns.get(iframe);
    const key = preferredModelFrameKey(iframe);
    if (!id || !record?.success || record.cancelled || record.key !== key) return null;
    const appId = String(record.payload?.appId || "");
    const initialHref = String(iframe?.dataset?.currentHref || iframe?.src || "");
    const initialRoute = preferredModelSubmissionRouteState(appId, initialHref);
    const documentId = String(iframe?.dataset?.preferredModelDocumentId || "");
    const bridgeVersion = String(iframe?.dataset?.preferredModelContentBridgeVersion || "");
    const validInitialRoute = initialRoute && (
      initialRoute.phase === "start"
      || (appId === "NotionAI" && initialRoute.phase === "intermediate")
    );
    if (!validInitialRoute || !documentId || !bridgeVersion) return null;
    clearPreferredModelSubmissionNavigation(record);
    const now = Date.now();
    const expiresAt = Math.max(
      now + MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS,
      Math.max(0, Number(deadlineAt) || 0) + MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS
    );
    record.submissionNavigationLease = {
      sendId: id,
      appId,
      initialHref,
      initialHost: initialRoute.host,
      documentId,
      bridgeVersion,
      recordKey: key,
      armedAt: now,
      hardExpiresAt: expiresAt,
      expiresAt,
      observed: false,
      terminalObserved: false,
      terminalThreadId: "",
      lastHref: initialHref,
      lastPhase: initialRoute.phase,
      timer: 0
    };
    schedulePreferredModelSubmissionNavigationExpiry(record);
    return record.submissionNavigationLease;
  }

  function finishPreferredModelSubmissionNavigation(iframe, sendId, sent) {
    const record = preferredModelApplyRuns.get(iframe);
    const lease = record?.submissionNavigationLease;
    if (!lease || lease.sendId !== String(sendId || "")) return;
    lease.sendSettledAt = Date.now();
    lease.sent = Boolean(sent);
    if (sent || lease.terminalObserved) return;
    lease.expiresAt = Math.min(lease.hardExpiresAt, Date.now() + 2000);
    schedulePreferredModelSubmissionNavigationExpiry(record);
  }

  function preservePreferredModelForSubmissionNavigation(iframe, event = {}) {
    const record = preferredModelApplyRuns.get(iframe);
    const lease = record?.submissionNavigationLease;
    if (!lease) return false;
    const reject = () => {
      clearPreferredModelSubmissionNavigation(record);
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
    if (
      preferredModelApplyRuns.get(iframe) !== record
      || !record.success
      || record.cancelled
      || record.key !== lease.recordKey
      || preferredModelFrameKey(iframe) !== lease.recordKey
    ) return reject();
    const nextRoute = preferredModelSubmissionRouteState(lease.appId, event.href);
    if (!nextRoute || nextRoute.host !== lease.initialHost) return reject();
    if (String(event.previousHref || "") !== lease.lastHref) return reject();
    const allowedPhaseTransition = lease.appId === "Gemini"
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
    clearPreferredModelSubmissionNavigation(record);
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
    const record = {
      iframe,
      payload,
      key,
      delays,
      runId: createId("model-apply"),
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
      statusToast: null,
      submissionNavigationLease: null
    };
    record.statusToast = createFrameToast(
      iframe,
      t("toast.frameModelSwitchPending"),
      "info",
      preferredModelState.options?.frameToastPosition
    );
    return record;
  }

  function schedulePreferredModelRecordRun(iframe, record, delay = 0) {
    if (!preferredModelRecordIsCurrent(iframe, record) || record.success || record.terminal) return;
    if (record.timer) clearTimeout(record.timer);
    record.timer = 0;
    record.pending = true;
    record.statusToast?.update?.(t("toast.frameModelSwitchPending"), "info");
    syncPreferredModelInputGate();
    record.timer = window.setTimeout(() => {
      record.timer = 0;
      runPreferredModelRecord(iframe, record);
    }, Math.max(0, Number(delay) || 0));
  }

  function handlePreferredModelPromptCompositionStart(event) {
    if (preferredModelInputGateIsLocked()) {
      preferredModelPromptComposing = false;
      preferredModelComposingPromptInput = null;
      notifyPreferredModelGateBlocked();
      syncPreferredModelInputGate();
      return;
    }
    preferredModelPromptComposing = true;
    preferredModelComposingPromptInput = event.currentTarget || null;
  }

  function handlePreferredModelPromptCompositionEnd(event) {
    if (preferredModelInputGateIsLocked()) {
      preferredModelState.promptText = event.currentTarget?.value ?? preferredModelState.promptText;
      rememberPromptSelection(event.currentTarget);
      capturePreferredModelLockedPromptSnapshot();
    }
    preferredModelPromptComposing = false;
    preferredModelComposingPromptInput = null;
    syncPreferredModelInputGate();
  }

  function preferredModelPromptCompositionIsActive(inputNode) {
    return Boolean(
      preferredModelPromptComposing
      && preferredModelComposingPromptInput === inputNode
      && inputNode?.isConnected
      && document.activeElement === inputNode
    );
  }

  function handlePromptBlur(event) {
    const inputNode = event.currentTarget;
    collapsePromptInput(inputNode);
    queueMicrotask(() => {
      if (preferredModelComposingPromptInput !== inputNode || document.activeElement === inputNode) return;
      preferredModelPromptComposing = false;
      preferredModelComposingPromptInput = null;
      syncPreferredModelInputGate();
    });
  }

  function cleanupDetachedPreferredModelFrames() {
    let changed = false;
    for (const [iframe, record] of preferredModelApplyRuns) {
      if (iframe?.isConnected) continue;
      stopPreferredModelRecord(iframe, record, "frame-detached");
      preferredModelApplyRuns.delete(iframe);
      changed = true;
    }
    if (changed) syncPreferredModelInputGate();
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
      delete iframe.dataset.contentRuntimeCapabilitiesDocumentId;
      delete iframe.dataset.contentRuntimeCapabilities;
    }
    syncPreferredModelInputGate();
  }

  function handlePreferredModelFrameLifecycleChange(change = {}) {
    const isFrame = typeof HTMLIFrameElement !== "undefined" && change instanceof HTMLIFrameElement;
    const event = isFrame ? { type: "workspace-sync", iframe: change } : (change || {});
    const iframe = event.iframe || null;
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
    const payload = { ...record.payload, runId: record.runId };
    let registration = await verifiedCurrentContentFrameRegistration(iframe);
    if (!registration) {
      record.bridgeRecoveryAttempts = Math.max(0, Number(record.bridgeRecoveryAttempts) || 0) + 1;
      const prepared = await prepareContentFrameRuntime(iframe);
      if (!preferredModelRecordIsCurrent(iframe, record) || record.controller?.signal?.aborted) {
        return preferredModelResult(record.runId, {
          cancelled: true,
          reason: "preferred-model frame was superseded during bridge recovery"
        });
      }
      registration = prepared?.ok ? await verifiedCurrentContentFrameRegistration(iframe) : null;
      if (!registration) {
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
          timeoutMs: MODEL_PREFERENCE_APPLY_TIMEOUT_MS,
          signal: record.controller?.signal
        }
      );
      if (String(result?.runId || "") !== record.runId) {
        return preferredModelResult(record.runId, { reason: "preferred-model response runId mismatch" });
      }
      return preferredModelResult(record.runId, result || {});
    } catch (error) {
      const cancelled = error?.code === "ABORTED" || error?.name === "AbortError";
      const timedOut = error?.code === "TIMEOUT"
        || /timeout waiting for response/i.test(String(error?.message || ""));
      if (timedOut) requestPreferredModelCancellation(iframe, record, "parent-timeout");
      return preferredModelResult(record.runId, {
        cancelled,
        retryable: false,
        reason: error?.message || String(error || "preferred-model request failed")
      });
    }
  }

  async function runPreferredModelRecord(iframe, record) {
    if (!preferredModelRecordIsCurrent(iframe, record) || record.success || record.terminal) return;
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
    if (result.ok === true && result.unavailable !== true && result.unsupported !== true) {
      record.success = true;
      record.terminal = true;
      const model = preferredModelTargetLabel(record.payload);
      record.statusToast?.update?.(
        result.changed === true
          ? t("toast.frameModelSwitchChanged", { model })
          : t("toast.frameModelSwitchReady", { model }),
        "success"
      );
      record.statusToast?.dismiss?.(2000);
      syncPreferredModelInputGate();
      return;
    }
    const retryDelay = preferredModelRetryDelay(record, result);
    if (retryDelay !== null) {
      record.cancelled = false;
      record.attempt += 1;
      schedulePreferredModelRecordRun(iframe, record, retryDelay);
      return;
    }
    record.terminal = true;
    record.cancelled = result.cancelled === true;
    record.failureReason = compactPreferredModelFailureReason(result);
    record.statusToast?.update?.(
      t("toast.frameModelSwitchFailed", { reason: record.failureReason }),
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
        error: result,
        message: record.failureReason
      });
    }
    console.warn(
      "[ChatClub] Preferred model was not applied",
      record.payload.appId,
      record.payload.modelId,
      result.reason || result
    );
    syncPreferredModelInputGate();
  }

  function schedulePreferredModelApplyToFrame(iframe, options = {}) {
    if (!iframe) return null;
    const key = preferredModelFrameKey(iframe);
    const existing = preferredModelApplyRuns.get(iframe);
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
    const delays = options.immediate
      ? MODEL_PREFERENCE_APPLY_RETRY_DELAYS
      : MODEL_PREFERENCE_READY_APPLY_RETRY_DELAYS;
    const record = createPreferredModelRecord(iframe, payload, key, delays);
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
    capturePreferredModelLockedPromptSnapshot,
    ensurePreferredModelInputReady,
    finishBootstrapping,
    finishPreferredModelSubmissionNavigation,
    handlePreferredModelFrameLifecycleChange,
    handlePreferredModelPromptCompositionEnd,
    handlePreferredModelPromptCompositionStart,
    handlePromptBlur,
    installPreferredModelFrameCleanup,
    invalidatePreferredModelFrame,
    notifyPreferredModelGateBlocked,
    preferredModelFrameIsLoading,
    preferredModelInputGateIsLocked,
    preferredModelPromptCompositionIsActive,
    rememberPreferredModelLockedPromptSnapshot,
    restorePreferredModelLockedPromptSnapshot,
    schedulePreferredModelApplyToFrame,
    syncPreferredModelInputGate
  });
}
