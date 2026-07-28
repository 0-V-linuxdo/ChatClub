import { t } from "../../shared/i18n.js";
import { matchesSendShortcut } from "../../shared/shortcuts.js";
import {
  createId,
  normalizePromptImagePasteStrategy,
  normalizePromptSendHistory
} from "../../shared/storage-schema.js";
import { savePromptSendHistory as defaultSavePromptSendHistory } from "../../shared/storage-adapter.js";
import {
  claimTopmostPopoverEscape,
  el,
  textarea,
  toast as defaultToast
} from "../../ui/dom.js";
import { createFrameToast as defaultCreateFrameToast } from "../../ui/frame-toast.js";
import { createSvgIcon } from "../../ui/icons.js";
import { validateControllerContract } from "../controller-contract.js";
import {
  PROMPT_HISTORY_LIVE_CURSOR,
  promptHistoryNavigate,
  shouldNavigatePromptHistory,
  shouldOpenPromptLibraryFromSlash
} from "./history.js";
import { createFrameSendQueue } from "./frame-send-queue.js";
import { createPromptImageModel } from "./images.js";
import { promptCollapsedPreview, promptInputHeight } from "./model.js";

const PROMPT_IMAGE_RETRY_COUNT = 3;
const FRAME_SUBMIT_ERROR_MAX_CHARS = 160;
const FRAME_SEND_PREPARE_TIMEOUT_MS = 8000;
const FRAME_SEND_PREPARE_RETRY_LIMIT = 1;
const FRAME_SEND_IDENTITY_STABILIZE_LIMIT = 3;
const FRAME_SEND_PREDELIVERY_ERROR_CODES = new Set([
  "INJECTION_FAILED",
  "NOT_REGISTERED",
  "STALE_DOCUMENT"
]);

function requirePort(port, label, methodNames) {
  if (!port || typeof port !== "object" || Array.isArray(port)) {
    throw new TypeError(`Composer requires ${label} port.`);
  }
  for (const method of methodNames) {
    if (typeof port[method] !== "function") {
      throw new TypeError(`Composer ${label} port requires ${method}().`);
    }
  }
  return port;
}

export function createComposerController(dependencies = {}) {
  const {
    state,
    workspace,
    preferredModel,
    topbar,
    framePort,
    keyboardPlatform,
    activeShortcutProfile,
    inferAppName,
    openPromptLibrary,
    optimizePrompt,
    recordFunctionalAnomaly,
    frameSendPrepareTimeoutMs = FRAME_SEND_PREPARE_TIMEOUT_MS,
    savePromptSendHistory = defaultSavePromptSendHistory,
    toast = defaultToast,
    createFrameToast = defaultCreateFrameToast
  } = validateControllerContract(dependencies, "Composer controller", {
    state: "object",
    workspace: "object",
    preferredModel: "object",
    topbar: "object",
    framePort: "object",
    keyboardPlatform: "string",
    activeShortcutProfile: "function",
    inferAppName: "function",
    openPromptLibrary: "function",
    optimizePrompt: "function",
    recordFunctionalAnomaly: "function",
    frameSendPrepareTimeoutMs: "number?",
    savePromptSendHistory: "function?",
    toast: "function?",
    createFrameToast: "function?"
  });
  requirePort(workspace, "workspace", ["currentFrames", "frameApp", "closePopovers"]);
  requirePort(topbar, "topbar", ["closeSettingsMenu"]);
  requirePort(preferredModel, "Preferred Model", [
    "armPreferredModelSubmissionNavigation",
    "finishPreferredModelSubmissionNavigation",
    "preferredModelFailurePolicyForApp",
    "preferredModelFrameReadiness",
    "preferredModelFrameReadinessIsCurrent",
    "waitForPreferredModelFrame",
    "waitForPreferredModelSubmissionBarrier"
  ]);
  requirePort(framePort, "frame", ["ensure", "request"]);

  const imageModel = createPromptImageModel({ createId });
  let currentPlaceholder = "";
  let promptHistoryWriteTail = Promise.resolve();
  const frameSendQueue = createFrameSendQueue({
    execute: executeQueuedFrameSend,
    isUncertainError: frameSendDeliveryIsUncertain,
    onStateChange: syncFrameSendQueueState
  });

  function normalizeImages(images) {
    return imageModel.normalize(images);
  }

  function resetHistoryNavigation() {
    state.promptHistoryCursor = PROMPT_HISTORY_LIVE_CURSOR;
    state.promptHistoryDraft = "";
  }

  function hasContent(text = state.promptText, images = state.promptImages) {
    return imageModel.hasContent(text, images);
  }

  function imageSendTimeoutMs(images = []) {
    return imageModel.timeoutMs(images);
  }

  function transferHasImages(dataTransfer) {
    return imageModel.filesFromTransfer(dataTransfer).length > 0;
  }

  function renderImagePreview(image) {
    return el("div", { class: "prompt-image-chip", title: image.name || t("topbar.imageAttachment") },
      el("img", {
        src: image.dataUrl,
        alt: image.name || t("topbar.imageAttachment"),
        loading: "lazy"
      }),
      el("button", {
        class: "prompt-image-remove prompt-image-remove-visible compact-icon tooltip-trigger",
        type: "button",
        "aria-label": t("topbar.removeImage"),
        "data-tooltip": t("topbar.removeImage"),
        "data-tooltip-id": "topbar.removeImage",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeImage(image.id);
        },
        onpointerdown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onkeydown: (event) => event.stopPropagation()
      }, createSvgIcon("x"))
    );
  }

  function renderCollapsedImages(images = state.promptImages) {
    const promptImages = normalizeImages(images);
    if (!promptImages.length) return null;
    const visibleImages = promptImages.slice(0, 3);
    return el("span", { class: "prompt-collapsed-preview-images", "aria-hidden": "true" },
      visibleImages.map((image) => el("img", {
        class: "prompt-collapsed-preview-thumb",
        src: image.dataUrl,
        alt: "",
        loading: "lazy",
        draggable: "false"
      })),
      promptImages.length > visibleImages.length
        ? el("span", { class: "prompt-collapsed-preview-more" }, `+${promptImages.length - visibleImages.length}`)
        : null
    );
  }

  function renderCollapsedContent(collapsed, images = state.promptImages) {
    return [
      renderCollapsedImages(images),
      el("span", { class: "prompt-collapsed-preview-text" }, collapsed.text)
    ].filter(Boolean);
  }

  function syncImagesPreview() {
    const images = normalizeImages(state.promptImages);
    const hasImages = images.length > 0;
    document.querySelectorAll(".prompt-shell").forEach((shell) => {
      shell.classList.toggle("prompt-shell-has-images", hasImages);
      const list = shell.querySelector(".prompt-image-preview-list");
      if (!list) return;
      list.replaceChildren(...images.map((image) => renderImagePreview(image)));
      list.hidden = !hasImages;
    });
  }

  function setImages(images, { focus = false } = {}) {
    state.promptImages = normalizeImages(images);
    resetHistoryNavigation();
    syncImagesPreview();
    const inputNode = syncInputNode({ focus });
    if (focus && inputNode) expandInput(inputNode);
    return state.promptImages;
  }

  function removeImage(id) {
    setImages(state.promptImages.filter((image) => image.id !== id), { focus: true });
  }

  async function addImageFiles(fileList, { focus = true } = {}) {
    const files = Array.from(fileList || []).filter((file) => String(file?.type || "").startsWith("image/"));
    if (!files.length) {
      toast(t("toast.promptNoImages"), "error");
      return [];
    }
    const entries = [];
    for (const file of files) {
      try {
        const entry = await imageModel.fromFile(file, state.promptImages.length + entries.length);
        if (entry) entries.push(entry);
      } catch (error) {
        console.warn("[ChatClub] Failed to load prompt image", error);
      }
    }
    if (!entries.length) {
      toast(t("toast.promptImageLoadFailed"), "error");
      return [];
    }
    const nextImages = setImages([...state.promptImages, ...entries], { focus });
    toast(t("toast.promptImagesAdded", { count: entries.length, total: nextImages.length }), "success");
    return entries;
  }

  function openImagePicker(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const inputNode = event?.currentTarget?.closest?.(".prompt-shell")?.querySelector?.(".prompt-image-file-input")
      || document.querySelector(".prompt-image-file-input");
    try { inputNode?.click?.(); } catch {}
  }

  function closeActionsMenu() {
    document.querySelectorAll(".prompt-actions-backdrop, .prompt-actions-popover").forEach((node) => node.remove());
    document.querySelectorAll(".prompt-actions-button-active").forEach((node) => node.classList.remove("prompt-actions-button-active"));
    document.removeEventListener("keydown", closeActionsMenuOnKeydown, true);
    window.removeEventListener("resize", closeActionsMenu, true);
    window.removeEventListener("scroll", closeActionsMenu, true);
    window.removeEventListener("blur", closeActionsMenu, true);
  }

  function closeActionsMenuOnKeydown(event) {
    if (claimTopmostPopoverEscape(event, ".prompt-actions-popover")) closeActionsMenu();
  }

  function actionsMenuItem(label, iconName, onClick) {
    return el("button", {
      class: "button button-secondary menu-button prompt-actions-menu-button",
      type: "button",
      role: "menuitem",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeActionsMenu();
        onClick?.(event);
      },
      onpointerdown: (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
      }
    }, createSvgIcon(iconName), el("span", {}, label));
  }

  function openActionsMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const anchor = event?.currentTarget;
    if (!anchor) return;
    if (anchor.classList.contains("prompt-actions-button-active") && document.querySelector(".prompt-actions-popover")) {
      closeActionsMenu();
      return;
    }
    closeActionsMenu();
    topbar.closeSettingsMenu();
    workspace.closePopovers();
    anchor.classList.add("prompt-actions-button-active");
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 236;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 8);
    const backdrop = el("div", {
      class: "popover-backdrop prompt-actions-backdrop",
      onpointerdown: (backdropEvent) => {
        backdropEvent.preventDefault();
        closeActionsMenu();
      },
      oncontextmenu: (backdropEvent) => {
        backdropEvent.preventDefault();
        closeActionsMenu();
      }
    });
    const menu = el("div", {
      class: "popover-menu prompt-actions-popover",
      role: "menu",
      style: { top: `${top}px`, left: `${left}px` },
      onpointerdown: (menuEvent) => menuEvent.stopPropagation(),
      onclick: (menuEvent) => menuEvent.stopPropagation()
    },
      actionsMenuItem(t("topbar.addPhotos"), "paperclip", openImagePicker),
      actionsMenuItem(t("topbar.promptLibrary"), "library", openPromptLibrary),
      actionsMenuItem(t("topbar.optimizePrompt"), "sparkles", optimizePrompt)
    );
    document.body.append(backdrop, menu);
    document.addEventListener("keydown", closeActionsMenuOnKeydown, true);
    window.addEventListener("resize", closeActionsMenu, true);
    window.addEventListener("scroll", closeActionsMenu, true);
    window.addEventListener("blur", closeActionsMenu, true);
  }

  function handleImageFileChange(event) {
    const inputNode = event.currentTarget;
    addImageFiles(inputNode.files, { focus: true }).finally(() => {
      try { inputNode.value = ""; } catch {}
    });
  }

  function handlePaste(event) {
    const files = imageModel.filesFromTransfer(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    addImageFiles(files, { focus: true });
  }

  function handleDragEnter(event) {
    if (!transferHasImages(event.dataTransfer)) return;
    event.preventDefault();
    event.currentTarget.classList.add("prompt-shell-drag-over");
  }

  function handleDragOver(event) {
    if (!transferHasImages(event.dataTransfer)) return;
    event.preventDefault();
    event.currentTarget.classList.add("prompt-shell-drag-over");
    try { event.dataTransfer.dropEffect = "copy"; } catch {}
  }

  function handleDrop(event) {
    const files = imageModel.filesFromTransfer(event.dataTransfer);
    event.currentTarget.classList.remove("prompt-shell-drag-over");
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    addImageFiles(files, { focus: true });
  }

  function recordSendHistory(text, images = []) {
    const value = String(text || "").trim();
    const promptImages = normalizeImages(images);
    if (!value && !promptImages.length) return Promise.resolve(state.promptSendHistory);
    const entry = {
      id: createId("prompt-history"),
      text: value,
      images: promptImages,
      createdAt: new Date().toISOString()
    };
    const write = async () => {
      const next = normalizePromptSendHistory([entry, ...state.promptSendHistory]);
      state.promptSendHistory = await savePromptSendHistory(next);
      return state.promptSendHistory;
    };
    const queued = promptHistoryWriteTail.catch(() => {}).then(write);
    promptHistoryWriteTail = queued.then(() => undefined, () => undefined);
    return queued;
  }

  function frameSubmitError(reason, values = {}) {
    const error = reason instanceof Error ? reason : new Error(String(reason || "Send failed"));
    Object.assign(error, values);
    return error;
  }

  function compactFrameSubmitReason(error) {
    const rawReason = String(error?.message || error || "").replace(/\s+/g, " ").trim();
    const reasonChars = Array.from(rawReason || t("toast.frameSubmitFailureFallback"));
    return reasonChars.length > FRAME_SUBMIT_ERROR_MAX_CHARS
      ? `${reasonChars.slice(0, FRAME_SUBMIT_ERROR_MAX_CHARS - 1).join("")}…`
      : reasonChars.join("");
  }

  function modelPreferenceSkipError(readiness = {}) {
    return frameSubmitError(
      readiness.reason || t("toast.frameModelFailureSkipped"),
      { code: "MODEL_PREFERENCE_SKIPPED", delivered: false, skipped: true }
    );
  }

  function frameSendDeliveryIsUncertain(error) {
    if (error?.code === "FRAME_SEND_QUEUE_CANCELLED") return false;
    if (error?.code === "TIMEOUT") return true;
    if (error?.delivered === false) return false;
    return true;
  }

  function frameSendKnownPreDeliveryFailure(error) {
    return error?.delivered === false && FRAME_SEND_PREDELIVERY_ERROR_CODES.has(String(error?.code || ""));
  }

  function frameSendAbortError(signal, fallback = "Frame send queue was cancelled.") {
    if (signal?.reason instanceof Error) return signal.reason;
    return frameSubmitError(fallback, {
      code: "FRAME_SEND_QUEUE_CANCELLED",
      delivered: false
    });
  }

  function waitForFrameSendPreparation(promise, signal) {
    const timeoutMs = Math.max(250, Number(frameSendPrepareTimeoutMs) || FRAME_SEND_PREPARE_TIMEOUT_MS);
    if (signal?.aborted) {
      promise.catch(() => {});
      return Promise.reject(frameSendAbortError(signal));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", abort);
        callback(value);
      };
      const abort = () => finish(reject, frameSendAbortError(signal));
      const timer = setTimeout(() => finish(reject, frameSubmitError(
        "iframe send runtime preparation timed out",
        { code: "FRAME_SEND_PREPARE_TIMEOUT", delivered: false }
      )), timeoutMs);
      signal?.addEventListener?.("abort", abort, { once: true });
      promise.then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      );
    });
  }

  function invalidateFrameAfterKnownPreDeliveryFailure(iframe, error) {
    if (!frameSendKnownPreDeliveryFailure(error) || typeof framePort.invalidate !== "function") return;
    framePort.invalidate(iframe, `sendText:${error.code}`, {
      preserveDocument: error.code !== "STALE_DOCUMENT",
      clearCapabilities: error.code === "INJECTION_FAILED"
    });
  }

  async function prepareFrameSendRuntime(iframe, signal) {
    let attempt = 0;
    while (true) {
      if (signal?.aborted) throw frameSendAbortError(signal);
      try {
        return await waitForFrameSendPreparation(
          Promise.resolve().then(() => framePort.ensure(iframe, {
            features: ["send"],
            force: true
          })),
          signal
        );
      } catch (error) {
        const retry = attempt < FRAME_SEND_PREPARE_RETRY_LIMIT && frameSendKnownPreDeliveryFailure(error);
        if (!retry) throw error;
        attempt += 1;
        invalidateFrameAfterKnownPreDeliveryFailure(iframe, error);
      }
    }
  }

  function syncFrameSendQueueState(snapshot = frameSendQueue.snapshot()) {
    state.promptQueuedTargetCount = Math.max(0, Number(snapshot.pendingCount) || 0);
    state.promptSendingTargetCount = Math.max(0, Number(snapshot.runningCount) || 0);
    syncPromptQueueStatus();
    syncSendButton();
  }

  async function settledPreferredModelReadiness(iframe, signal) {
    while (true) {
      const readiness = await preferredModel.waitForPreferredModelFrame(iframe, { signal });
      if (readiness.state === "detached") {
        throw frameSubmitError(readiness.reason || "iframe is detached", {
          code: "FRAME_DETACHED",
          delivered: false
        });
      }
      if (preferredModel.preferredModelFrameReadinessIsCurrent(iframe, readiness)) return readiness;
    }
  }

  async function sendTextToFrame(iframe, job = {}, readiness = {}, signal = null) {
    const app = job.app || {};
    const promptImages = normalizeImages(job.images);
    const timeout = promptImages.length ? imageSendTimeoutMs(promptImages) : 12000;
    const sendDeadlineAt = Date.now() + timeout;
    const payload = {
      sendId: job.sendId,
      deadlineAt: sendDeadlineAt,
      text: job.text,
      images: promptImages,
      imageRetryCount: PROMPT_IMAGE_RETRY_COUNT,
      imagePasteStrategy: normalizePromptImagePasteStrategy(app?.imagePasteStrategy),
      appId: app.id,
      appName: app.name,
      inputSelector: app.inputSelector,
      sendButtonSelector: app.sendButtonSelector,
      sendKeyMode: job.sendKeyMode || "enter"
    };
    const remainingMs = Math.max(1000, sendDeadlineAt - Date.now());
    preferredModel.armPreferredModelSubmissionNavigation(iframe, job.sendId, sendDeadlineAt, readiness);
    let result;
    try {
      result = await framePort.request(iframe, "sendText", payload, {
        timeoutMs: remainingMs,
        signal,
        skipEnsure: true,
        ...(readiness.documentId ? { expectedDocumentId: readiness.documentId } : {})
      });
    } catch (error) {
      preferredModel.finishPreferredModelSubmissionNavigation(iframe, job.sendId, false);
      throw error;
    }
    const deliveryConfirmed = result?.sent === true && result?.deliveryState === "sent";
    if (!deliveryConfirmed) {
      preferredModel.finishPreferredModelSubmissionNavigation(
        iframe,
        job.sendId,
        false,
        result?.submissionNavigation
      );
      const knownNotSent = result?.sent === false && result?.deliveryState === "not-sent";
      throw frameSubmitError(result?.reason || "Send failed", knownNotSent
        ? { code: "SEND_REJECTED", delivered: false }
        : { code: "SEND_DELIVERY_UNKNOWN", delivered: true });
    }
    preferredModel.finishPreferredModelSubmissionNavigation(
      iframe,
      job.sendId,
      true,
      result.submissionNavigation
    );
    return result;
  }

  async function executeQueuedFrameSend(iframe, job, { signal } = {}) {
    let readiness = await settledPreferredModelReadiness(iframe, signal);
    const rejectSkippedModelFailure = () => {
      if (readiness.state !== "failed" || job.failurePolicy !== "skip") return;
      const skippedToast = createFrameToast(
        iframe,
        t("toast.frameModelFailureSkipped"),
        "error",
        state.options?.frameToastPosition
      );
      skippedToast.dismiss(5000);
      throw modelPreferenceSkipError(readiness);
    };
    rejectSkippedModelFailure();
    let preparedRegistration = null;
    let identityStable = false;
    for (let pass = 0; pass < FRAME_SEND_IDENTITY_STABILIZE_LIMIT; pass += 1) {
      preparedRegistration = await prepareFrameSendRuntime(iframe, signal);
      readiness = await settledPreferredModelReadiness(iframe, signal);
      rejectSkippedModelFailure();
      const barrierTarget = readiness.appId === "Gemini" || readiness.appId === "NotionAI";
      const preparedDocumentId = String(preparedRegistration?.documentId || "");
      const readinessDocumentId = String(readiness.documentId || "");
      const barrierIdentityIncomplete = barrierTarget && !readiness.bridgeVersion;
      if (preparedDocumentId && readinessDocumentId === preparedDocumentId && !barrierIdentityIncomplete) {
        identityStable = true;
        break;
      }
    }
    if (!identityStable) {
      throw frameSubmitError("Content document identity changed while preparing to send", {
        code: "STALE_DOCUMENT",
        delivered: false
      });
    }
    const usingCurrentModel = readiness.state === "failed";
    const statusToast = createFrameToast(
      iframe,
      usingCurrentModel ? t("toast.frameModelFailureSubmittingCurrent") : t("toast.frameSubmitPending"),
      usingCurrentModel ? "error" : "info",
      state.options?.frameToastPosition
    );
    try {
      const result = await sendTextToFrame(iframe, job, readiness, signal);
      await preferredModel.waitForPreferredModelSubmissionBarrier(iframe, job.sendId, { signal });
      statusToast.update(
        usingCurrentModel ? t("toast.frameModelFailureSubmittedCurrent") : t("toast.frameSubmitSuccess"),
        "success"
      );
      statusToast.dismiss(2000);
      return { ...result, usedCurrentModel: usingCurrentModel };
    } catch (error) {
      invalidateFrameAfterKnownPreDeliveryFailure(iframe, error);
      statusToast.update(t("toast.frameSubmitFailed", { reason: compactFrameSubmitReason(error) }), "error");
      statusToast.dismiss(5000);
      throw error;
    }
  }

  async function settlePromptSubmission(entries, settlement) {
    const results = await settlement;
    const failures = results
      .map((result, index) => ({ result, target: entries[index].target }))
      .filter((item) => item.result.status === "rejected");
    const skipped = failures.filter((item) => item.result.reason?.skipped === true);
    const reportableFailures = failures.filter((item) => item.result.reason?.skipped !== true);
    const successCount = results.length - failures.length;
    if (!reportableFailures.length && !skipped.length) {
      toast(t("toast.sentToChats", { count: successCount, plural: successCount === 1 ? "" : "s" }), "success");
      return results;
    }
    for (const { result, target } of reportableFailures) {
      void recordFunctionalAnomaly({
        feature: "composer",
        operation: "sendPrompt",
        appId: target.app?.id || "",
        appName: inferAppName(target.app),
        href: target.app?.url || "",
        error: result.reason,
        message: result.reason?.message || t("toast.frameSubmitFailureFallback")
      });
    }
    const failedNames = reportableFailures
      .map((item) => inferAppName(item.target.app))
      .filter(Boolean)
      .slice(0, 4)
      .join(", ") || t("common.failed");
    if (!reportableFailures.length) {
      toast(
        successCount > 0
          ? t("toast.sentToChatsWithSkips", { sentCount: successCount, skippedCount: skipped.length })
          : t("toast.promptAllTargetsSkipped"),
        successCount > 0 ? "success" : "error"
      );
      return results;
    }
    if (successCount > 0) {
      toast(t("toast.sentToSomeChats", {
        sentCount: successCount,
        sentPlural: successCount === 1 ? "" : "s",
        names: failedNames
      }), "error");
      return results;
    }
    toast(t("toast.sendFailedToChats", { names: failedNames }), "error");
    return results;
  }

  function sendPromptToFrames() {
    const text = state.promptText.trim();
    const images = normalizeImages(state.promptImages);
    if (!hasContent(text, images)) return;
    const frames = workspace.currentFrames();
    if (!frames.length) return;
    const sendId = createId("prompt-send");
    const sendKeyMode = activeShortcutProfile()?.sendKeyMode || "enter";
    const entries = frames.map((iframe) => {
      const app = workspace.frameApp(iframe) || {};
      const target = { iframe, app };
      const readiness = preferredModel.preferredModelFrameReadiness(iframe);
      const failurePolicy = preferredModel.preferredModelFailurePolicyForApp(app);
      if (readiness.state === "detached") {
        return {
          target,
          admitted: false,
          promise: Promise.reject(frameSubmitError(readiness.reason, { code: "FRAME_DETACHED", delivered: false }))
        };
      }
      if (readiness.state === "failed" && failurePolicy === "skip") {
        const skippedToast = createFrameToast(
          iframe,
          t("toast.frameModelFailureSkipped"),
          "error",
          state.options?.frameToastPosition
        );
        skippedToast.dismiss(5000);
        return { target, admitted: false, promise: Promise.reject(modelPreferenceSkipError(readiness)) };
      }
      return {
        target,
        admitted: true,
        promise: frameSendQueue.enqueue(iframe, {
          app,
          failurePolicy,
          images,
          sendId,
          sendKeyMode,
          text
        })
      };
    });
    const settlement = Promise.allSettled(entries.map((entry) => entry.promise));
    if (!entries.some((entry) => entry.admitted)) {
      return settlePromptSubmission(entries, settlement);
    }
    void recordSendHistory(text, images).catch((error) => {
      console.warn("[ChatClub] Failed to save prompt send history", error);
    });
    clearInput();
    return settlePromptSubmission(entries, settlement);
  }

  function submit(source = null) {
    const inputNode = source?.classList?.contains?.("prompt-input")
      ? source
      : source?.currentTarget?.closest?.(".prompt-shell")?.querySelector?.(".prompt-input")
        || document.querySelector(".prompt-input");
    if (inputNode) {
      state.promptText = inputNode.value;
      rememberSelection(inputNode);
      syncCollapsedPreview(inputNode);
    }
    return sendPromptToFrames();
  }

  function resizeInput(inputNode, expanded = inputNode.classList.contains("prompt-input-expanded")) {
    const hasImages = state.promptImages.length > 0;
    let restoreTransition = null;
    if (expanded && !hasImages) {
      restoreTransition = inputNode.style.transition;
      inputNode.style.transition = "none";
      inputNode.style.height = "0px";
      inputNode.style.overflowY = "hidden";
    }
    const sizing = promptInputHeight(inputNode.scrollHeight, window.innerHeight, expanded, { hasImages });
    inputNode.style.height = `${sizing.height}px`;
    inputNode.style.overflowY = sizing.overflowY;
    if (restoreTransition !== null) {
      void inputNode.offsetHeight;
      inputNode.style.transition = restoreTransition;
    }
    if (expanded) return;
    inputNode.scrollTop = 0;
    requestAnimationFrame(() => { inputNode.scrollTop = 0; });
  }

  function rememberSelection(inputNode) {
    if (!inputNode || typeof inputNode.selectionStart !== "number") return;
    state.promptSelection = {
      start: inputNode.selectionStart,
      end: inputNode.selectionEnd,
      direction: inputNode.selectionDirection || "none"
    };
  }

  function restoreSelection(inputNode) {
    const selection = state.promptSelection || {};
    if (!inputNode || typeof inputNode.setSelectionRange !== "function") return;
    const max = inputNode.value.length;
    const start = Math.max(0, Math.min(selection.start ?? max, max));
    const end = Math.max(start, Math.min(selection.end ?? start, max));
    try { inputNode.setSelectionRange(start, end, selection.direction || "none"); } catch {}
  }

  function restoreSelectionSoon(inputNode) {
    restoreSelection(inputNode);
    requestAnimationFrame(() => {
      restoreSelection(inputNode);
      requestAnimationFrame(() => restoreSelection(inputNode));
    });
  }

  function syncClearButton(inputNode = document.querySelector(".prompt-input")) {
    const shell = inputNode?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
    const clearButton = shell?.querySelector?.(".prompt-clear-button");
    if (clearButton) clearButton.hidden = !hasContent(inputNode?.value ?? state.promptText, state.promptImages);
  }

  function syncSendButton(inputNode = document.querySelector(".prompt-input")) {
    const shell = inputNode?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
    const sendButton = shell?.querySelector?.(".prompt-send-button");
    if (!sendButton) return;
    sendButton.disabled = !hasContent(inputNode?.value ?? state.promptText, state.promptImages);
  }

  function syncPromptQueueStatus() {
    const count = Math.max(0, Number(state.promptQueuedTargetCount) || 0);
    document.querySelectorAll(".prompt-shell").forEach((shell) => {
      shell.dataset.promptQueuePendingCount = String(count);
      const badge = shell.querySelector(".prompt-send-queue-badge");
      if (badge) {
        badge.hidden = count <= 0;
        badge.textContent = count > 99 ? "99+" : String(count);
      }
      const liveRegion = shell.querySelector(".prompt-send-queue-status");
      if (!liveRegion) return;
      liveRegion.hidden = count <= 0;
      const announcementKey = String(count);
      if (liveRegion.dataset.queueAnnouncementKey === announcementKey) return;
      liveRegion.dataset.queueAnnouncementKey = announcementKey;
      liveRegion.textContent = count > 0 ? t("topbar.promptQueuedTargets", { count }) : "";
    });
  }

  function syncCollapsedPreview(inputNode = document.querySelector(".prompt-input")) {
    const shell = inputNode?.closest?.(".prompt-shell");
    const preview = shell?.querySelector?.(".prompt-collapsed-preview");
    const value = inputNode?.value ?? state.promptText;
    syncClearButton(inputNode);
    syncSendButton(inputNode);
    syncPromptQueueStatus();
    syncImagesPreview();
    if (!preview) return;
    const collapsed = promptCollapsedPreview(value, inputNode?.placeholder || currentPlaceholder);
    preview.replaceChildren(...renderCollapsedContent(collapsed, state.promptImages));
    preview.title = collapsed.title;
    preview.classList.toggle("prompt-collapsed-preview-empty", collapsed.empty);
  }

  function expandInput(inputNode) {
    syncCollapsedPreview(inputNode);
    inputNode.closest?.(".prompt-shell")?.classList.add("prompt-shell-expanded");
    inputNode.classList.add("prompt-input-expanded");
    resizeInput(inputNode, true);
    restoreSelectionSoon(inputNode);
  }

  function collapseInput(inputNode) {
    rememberSelection(inputNode);
    syncCollapsedPreview(inputNode);
    inputNode.closest?.(".prompt-shell")?.classList.remove("prompt-shell-expanded");
    inputNode.classList.remove("prompt-input-expanded");
    resizeInput(inputNode, false);
  }

  function focusRemainsInPromptShell(shell, nextTarget) {
    return Boolean(shell && nextTarget?.closest?.(".prompt-shell") === shell);
  }

  function handleInputBlur(event) {
    const inputNode = event.currentTarget;
    const shell = inputNode?.closest?.(".prompt-shell");
    if (focusRemainsInPromptShell(shell, event.relatedTarget)) return;
    collapseInput(inputNode);
  }

  function handlePromptShellFocusOut(event) {
    const shell = event.currentTarget;
    if (focusRemainsInPromptShell(shell, event.relatedTarget)) return;
    const inputNode = shell?.querySelector?.(".prompt-input");
    if (inputNode?.classList?.contains("prompt-input-expanded")) collapseInput(inputNode);
  }

  function inputFromEvent(event) {
    const target = event.currentTarget;
    if (target?.classList?.contains("prompt-input")) return target;
    return target?.querySelector?.(".prompt-input") || document.querySelector(".prompt-input");
  }

  function handlePointerDown(event) {
    const inputNode = inputFromEvent(event);
    if (!inputNode || inputNode.classList.contains("prompt-input-expanded")) return;
    event.preventDefault();
    event.stopPropagation();
    inputNode.dataset.openedFromCollapsed = "1";
    inputNode.focus({ preventScroll: true });
    expandInput(inputNode);
  }

  function handleOverlayClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const inputNode = inputFromEvent(event);
    delete inputNode?.dataset.openedFromCollapsed;
    if (inputNode) restoreSelectionSoon(inputNode);
  }

  function handleClick(event) {
    const inputNode = event.currentTarget;
    if (inputNode.dataset.openedFromCollapsed === "1") {
      event.preventDefault();
      event.stopPropagation();
      delete inputNode.dataset.openedFromCollapsed;
      restoreSelectionSoon(inputNode);
      return;
    }
    rememberSelection(inputNode);
  }

  function clearInput(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    state.promptText = "";
    state.promptImages = [];
    state.promptSelection = { start: 0, end: 0, direction: "none" };
    resetHistoryNavigation();
    const inputNode = syncInputNode({ focus: true }) || document.querySelector(".prompt-input");
    try { inputNode?.setSelectionRange(0, 0, "none"); } catch {}
  }

  function applyHistoryNavigation(inputNode, result) {
    state.promptText = result.text;
    state.promptImages = normalizeImages(result.images);
    state.promptHistoryCursor = result.cursor;
    state.promptHistoryDraft = result.draft;
    const cursor = state.promptText.length;
    state.promptSelection = { start: cursor, end: cursor, direction: "none" };
    const syncedInput = syncInputNode({ focus: true }) || inputNode;
    try { syncedInput?.setSelectionRange(cursor, cursor, "none"); } catch {}
  }

  function handleInputKeydown(event) {
    const inputNode = event.currentTarget;
    if (event.isComposing || event.keyCode === 229) return;
    if (shouldOpenPromptLibraryFromSlash(event, inputNode.value, inputNode.selectionStart, inputNode.selectionEnd)) {
      event.preventDefault();
      event.stopPropagation();
      openPromptLibrary();
      return;
    }
    if (shouldNavigatePromptHistory(event, inputNode.value, inputNode.selectionStart, inputNode.selectionEnd)) {
      const result = promptHistoryNavigate({
        history: state.promptSendHistory,
        cursor: state.promptHistoryCursor,
        draft: state.promptHistoryDraft,
        currentText: inputNode.value,
        currentImages: state.promptImages,
        direction: event.key === "ArrowUp" ? "up" : "down"
      });
      if (result.handled) {
        event.preventDefault();
        event.stopPropagation();
        applyHistoryNavigation(inputNode, result);
        return;
      }
    }
    if (matchesSendShortcut(event, activeShortcutProfile()?.sendKeyMode || "enter", keyboardPlatform)) {
      event.preventDefault();
      event.stopPropagation();
      submit(inputNode);
    }
  }

  function handleInput(event) {
    state.promptText = event.target.value;
    resetHistoryNavigation();
    rememberSelection(event.target);
    syncCollapsedPreview(event.target);
    expandInput(event.target);
  }

  function syncInputNode({ focus = false } = {}) {
    const inputNode = document.querySelector(".prompt-input");
    if (!inputNode) return null;
    inputNode.value = state.promptText;
    syncCollapsedPreview(inputNode);
    if (focus) {
      inputNode.focus({ preventScroll: true });
      expandInput(inputNode);
      restoreSelectionSoon(inputNode);
    }
    return inputNode;
  }

  function focusInput() {
    syncInputNode({ focus: true });
  }

  function modelGateStatusIcon(applying) {
    if (applying) return el("span", { class: "prompt-model-gate-spinner", "aria-hidden": "true" });
    const icon = createSvgIcon("alert");
    icon.classList.add("prompt-model-gate-failure-icon");
    return icon;
  }

  function render({ placeholder = "", gate = {} } = {}) {
    currentPlaceholder = String(placeholder || "");
    const gateState = String(gate.state || "");
    const gateApplying = ["bootstrapping", "applying"].includes(gateState);
    const gateFailed = gateState === "failed";
    const gateStatusText = gateFailed
      ? t("topbar.modelGateFailed", { reason: gate.reason || "" })
      : t("topbar.modelGateApplying");
    const prompt = textarea(state.promptText, {
      class: "textarea prompt-input",
      rows: 1,
      placeholder: currentPlaceholder,
      dataset: { modelGateState: gateState },
      onpointerdown: handlePointerDown,
      onfocus: (event) => expandInput(event.target),
      onblur: handleInputBlur,
      onclick: handleClick,
      onpaste: handlePaste,
      onkeyup: (event) => rememberSelection(event.target),
      onselect: (event) => rememberSelection(event.target),
      oninput: handleInput,
      onkeydown: handleInputKeydown
    });
    const collapsed = promptCollapsedPreview(state.promptText, currentPlaceholder);
    return el("div", { class: "composer topbar-item topbar-item-composer" },
      el("div", {
        class: `prompt-shell ${state.promptImages.length ? "prompt-shell-has-images" : ""} ${gateApplying ? "prompt-shell-model-gate-applying" : ""} ${gateFailed ? "prompt-shell-model-gate-failed" : ""}`.trim(),
        dataset: {
          modelGateState: gateState,
          modelGatePendingCount: String(gate.pendingCount || 0),
          modelGateFailedCount: String(gate.failedCount || 0),
          modelGateFailedAppIds: (gate.failedAppIds || []).join(","),
          promptQueuePendingCount: String(Math.max(0, Number(state.promptQueuedTargetCount) || 0))
        },
        onpointerdown: handlePointerDown,
        ondragenter: handleDragEnter,
        ondragover: handleDragOver,
        ondragleave: (event) => event.currentTarget.classList.remove("prompt-shell-drag-over"),
        ondrop: handleDrop,
        onpaste: handlePaste,
        onfocusout: handlePromptShellFocusOut
      },
        prompt,
        el("div", {
          class: `prompt-collapsed-preview ${collapsed.empty ? "prompt-collapsed-preview-empty" : ""}`.trim(),
          title: collapsed.title,
          onclick: handleOverlayClick
        }, renderCollapsedContent(collapsed, state.promptImages)),
        el("div", { class: "prompt-image-preview-list", hidden: state.promptImages.length <= 0 },
          state.promptImages.map((image) => renderImagePreview(image))
        ),
        el("button", {
          class: "prompt-actions-button compact-icon tooltip-trigger",
          type: "button",
          "aria-label": t("topbar.promptActions"),
          "data-tooltip": t("topbar.promptActions"),
          "data-tooltip-id": "topbar.promptActions",
          onclick: openActionsMenu,
          onpointerdown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onkeydown: (event) => event.stopPropagation()
        }, createSvgIcon("plus")),
        el("input", {
          class: "prompt-image-file-input",
          type: "file",
          accept: "image/*",
          multiple: true,
          tabindex: "-1",
          onchange: handleImageFileChange
        }),
        el("button", {
          class: "prompt-clear-button compact-icon tooltip-trigger",
          type: "button",
          hidden: !hasContent(state.promptText, state.promptImages),
          "aria-label": t("topbar.clearPrompt"),
          "data-tooltip": t("topbar.clearPrompt"),
          "data-tooltip-id": "topbar.clearPrompt",
          onclick: clearInput,
          onpointerdown: (event) => event.stopPropagation(),
          onkeydown: (event) => event.stopPropagation()
        }, createSvgIcon("x")),
        el("button", {
          class: "prompt-send-button tooltip-trigger",
          type: "button",
          disabled: !hasContent(state.promptText, state.promptImages),
          "aria-label": t("topbar.send"),
          "data-tooltip": t("topbar.sendTooltip"),
          "data-tooltip-id": "topbar.send",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            submit(event);
          },
          onpointerdown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onkeydown: (event) => event.stopPropagation()
        },
          createSvgIcon("send"),
          el("span", {
            class: "prompt-send-queue-badge",
            hidden: !(Number(state.promptQueuedTargetCount) > 0),
            "aria-hidden": "true"
          }, Number(state.promptQueuedTargetCount) > 99 ? "99+" : String(Math.max(0, Number(state.promptQueuedTargetCount) || 0)))
        ),
        el("div", {
          class: "prompt-send-queue-status",
          hidden: !(Number(state.promptQueuedTargetCount) > 0),
          "aria-live": "polite",
          "aria-atomic": "true"
        }, Number(state.promptQueuedTargetCount) > 0
          ? t("topbar.promptQueuedTargets", { count: Number(state.promptQueuedTargetCount) })
          : ""),
        el("div", {
          class: "prompt-model-gate-status tooltip-trigger",
          hidden: !(gateApplying || gateFailed),
          role: "note",
          tabindex: (gateApplying || gateFailed) ? "0" : null,
          "aria-label": (gateApplying || gateFailed) ? gateStatusText : null,
          "data-tooltip": (gateApplying || gateFailed) ? gateStatusText : null,
          "data-tooltip-id": "topbar.modelGateStatus",
          "data-tooltip-placement": "left",
          "data-tooltip-wrap": "true",
          dataset: {
            modelGateVisualKey: (gateApplying || gateFailed)
              ? (gateApplying ? "applying:" : "failed:") + gateStatusText
              : ""
          },
          onpointerdown: (event) => event.stopPropagation(),
          onclick: (event) => event.stopPropagation(),
          onkeydown: (event) => event.stopPropagation()
        },
          (gateApplying || gateFailed) ? modelGateStatusIcon(gateApplying) : null,
          (gateApplying || gateFailed) ? el("span", { class: "prompt-model-gate-status-text" }, gateStatusText) : null
        ),
        el("div", {
          class: "prompt-model-gate-live",
          "aria-live": "polite",
          "aria-atomic": "true"
        })
      )
    );
  }

  return Object.freeze({
    render,
    syncInputNode,
    focusInput,
    setImages,
    closeActionsMenu,
    submit
  });
}
