import { t } from "../../shared/i18n.js";
import { matchesSendShortcut } from "../../shared/shortcuts.js";
import {
  createId,
  normalizePromptImagePasteStrategy,
  normalizePromptSendHistory
} from "../../shared/storage-schema.js";
import { savePromptSendHistory } from "../../shared/storage-adapter.js";
import {
  claimTopmostPopoverEscape,
  el,
  textarea,
  toast
} from "../../ui/dom.js";
import { createFrameToast } from "../../ui/frame-toast.js";
import { createSvgIcon } from "../../ui/icons.js";
import { validateControllerContract } from "../controller-contract.js";
import {
  PROMPT_HISTORY_LIVE_CURSOR,
  promptHistoryNavigate,
  shouldNavigatePromptHistory,
  shouldOpenPromptLibraryFromSlash
} from "./history.js";
import { createPromptImageModel } from "./images.js";
import { promptCollapsedPreview, promptInputHeight } from "./model.js";

const PROMPT_IMAGE_RETRY_COUNT = 3;
const FRAME_SUBMIT_ERROR_MAX_CHARS = 160;

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
    recordFunctionalAnomaly
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
    recordFunctionalAnomaly: "function"
  });
  requirePort(workspace, "workspace", ["currentFrames", "frameApp", "closePopovers"]);
  requirePort(topbar, "topbar", ["closeSettingsMenu"]);
  requirePort(preferredModel, "Preferred Model", [
    "armPreferredModelSubmissionNavigation",
    "capturePreferredModelLockedPromptSnapshot",
    "ensurePreferredModelInputReady",
    "finishPreferredModelSubmissionNavigation",
    "handlePreferredModelPromptCompositionEnd",
    "handlePreferredModelPromptCompositionStart",
    "handlePromptBlur",
    "notifyPreferredModelGateBlocked",
    "preferredModelInputGateIsLocked",
    "preferredModelPromptCompositionIsActive",
    "rememberPreferredModelLockedPromptSnapshot",
    "restorePreferredModelLockedPromptSnapshot"
  ]);
  if (typeof framePort.request !== "function") throw new TypeError("Composer frame port requires request().");

  const imageModel = createPromptImageModel({ createId });
  let currentPlaceholder = "";

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
        disabled: preferredModel.preferredModelInputGateIsLocked(),
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

  function setImages(images, { focus = false, bypassModelGate = false } = {}) {
    if (!bypassModelGate && !preferredModel.ensurePreferredModelInputReady()) {
      preferredModel.restorePreferredModelLockedPromptSnapshot();
      return state.promptImages;
    }
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
    if (!preferredModel.ensurePreferredModelInputReady()) return [];
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
    if (!preferredModel.ensurePreferredModelInputReady()) return;
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
    if (!preferredModel.ensurePreferredModelInputReady()) return;
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
    if (!preferredModel.ensurePreferredModelInputReady()) {
      try { inputNode.value = ""; } catch {}
      return;
    }
    addImageFiles(inputNode.files, { focus: true }).finally(() => {
      try { inputNode.value = ""; } catch {}
    });
  }

  function handlePaste(event) {
    if (preferredModel.preferredModelInputGateIsLocked()) {
      event.preventDefault();
      event.stopPropagation();
      preferredModel.notifyPreferredModelGateBlocked();
      return;
    }
    const files = imageModel.filesFromTransfer(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    addImageFiles(files, { focus: true });
  }

  function handleDragEnter(event) {
    if (preferredModel.preferredModelInputGateIsLocked()) {
      event.preventDefault();
      event.currentTarget.classList.remove("prompt-shell-drag-over");
      return;
    }
    if (!transferHasImages(event.dataTransfer)) return;
    event.preventDefault();
    event.currentTarget.classList.add("prompt-shell-drag-over");
  }

  function handleDragOver(event) {
    if (preferredModel.preferredModelInputGateIsLocked()) {
      event.preventDefault();
      event.currentTarget.classList.remove("prompt-shell-drag-over");
      try { event.dataTransfer.dropEffect = "none"; } catch {}
      return;
    }
    if (!transferHasImages(event.dataTransfer)) return;
    event.preventDefault();
    event.currentTarget.classList.add("prompt-shell-drag-over");
    try { event.dataTransfer.dropEffect = "copy"; } catch {}
  }

  function handleDrop(event) {
    if (preferredModel.preferredModelInputGateIsLocked()) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.remove("prompt-shell-drag-over");
      preferredModel.notifyPreferredModelGateBlocked();
      return;
    }
    const files = imageModel.filesFromTransfer(event.dataTransfer);
    event.currentTarget.classList.remove("prompt-shell-drag-over");
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    addImageFiles(files, { focus: true });
  }

  async function recordSendHistory(text, images = []) {
    const value = String(text || "").trim();
    const promptImages = normalizeImages(images);
    if (!value && !promptImages.length) return;
    const next = normalizePromptSendHistory([
      { id: createId("prompt-history"), text: value, images: promptImages, createdAt: new Date().toISOString() },
      ...state.promptSendHistory
    ]);
    state.promptSendHistory = await savePromptSendHistory(next);
    resetHistoryNavigation();
  }

  function appIsNotion(app = {}) {
    const id = String(app?.id || "").trim().toLowerCase();
    const name = String(app?.name || "").trim().toLowerCase();
    const url = String(app?.url || "");
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch {}
    return id === "notionai"
      || /\bnotion\b/.test(name)
      || host === "app.notion.com"
      || host === "notion.so"
      || host === "www.notion.so"
      || host.endsWith(".notion.so");
  }

  async function sendTextToFrame(iframe, app = {}, text = "", images = [], sendId = "", deadlineAt = 0) {
    const promptImages = normalizeImages(images);
    const timeout = promptImages.length ? imageSendTimeoutMs(promptImages) : (appIsNotion(app) ? 12000 : 10000);
    const sendDeadlineAt = Number(deadlineAt) > Date.now() ? Number(deadlineAt) : Date.now() + timeout;
    const payload = {
      sendId,
      deadlineAt: sendDeadlineAt,
      text,
      images: promptImages,
      imageRetryCount: PROMPT_IMAGE_RETRY_COUNT,
      imagePasteStrategy: normalizePromptImagePasteStrategy(app?.imagePasteStrategy),
      appId: app.id,
      appName: app.name,
      inputSelector: app.inputSelector,
      sendButtonSelector: app.sendButtonSelector,
      sendKeyMode: activeShortcutProfile()?.sendKeyMode || "enter"
    };
    const remainingMs = Math.max(1000, sendDeadlineAt - Date.now());
    preferredModel.armPreferredModelSubmissionNavigation(iframe, sendId, sendDeadlineAt);
    let result;
    try {
      result = await framePort.request(iframe, "sendText", payload, { timeoutMs: remainingMs });
    } catch (error) {
      preferredModel.finishPreferredModelSubmissionNavigation(iframe, sendId, false);
      throw error;
    }
    if (result?.sent === false && /bridge timed out/i.test(String(result?.reason || ""))) {
      preferredModel.finishPreferredModelSubmissionNavigation(iframe, sendId, false);
      throw new Error(result?.reason || "Send failed");
    }
    if (!result || result.sent === false) {
      preferredModel.finishPreferredModelSubmissionNavigation(iframe, sendId, false);
      throw new Error(result?.reason || "Send failed");
    }
    preferredModel.finishPreferredModelSubmissionNavigation(iframe, sendId, true);
    return result;
  }

  async function sendPromptToFrames() {
    if (state.promptSendInFlight || !preferredModel.ensurePreferredModelInputReady()) return;
    const text = state.promptText.trim();
    const images = normalizeImages(state.promptImages);
    if (!hasContent(text, images)) return;
    const frames = workspace.currentFrames();
    if (!frames.length) return;
    const targets = frames.map((iframe) => ({ iframe, app: workspace.frameApp(iframe) || {} }));
    const sendId = createId("prompt-send");
    const timeoutMs = images.length ? imageSendTimeoutMs(images) : 12000;
    const deadlineAt = Date.now() + timeoutMs;
    state.promptSendInFlight = true;
    syncSendButton();
    try {
      const sendTasks = targets.map(async ({ iframe, app }) => {
        const statusToast = createFrameToast(iframe, t("toast.frameSubmitPending"), "info", state.options?.frameToastPosition);
        try {
          const result = await sendTextToFrame(iframe, app, text, images, sendId, deadlineAt);
          statusToast.update(t("toast.frameSubmitSuccess"), "success");
          statusToast.dismiss(2000);
          return result;
        } catch (error) {
          const rawReason = String(error?.message || error || "").replace(/\s+/g, " ").trim();
          const reasonChars = Array.from(rawReason || t("toast.frameSubmitFailureFallback"));
          const reason = reasonChars.length > FRAME_SUBMIT_ERROR_MAX_CHARS
            ? `${reasonChars.slice(0, FRAME_SUBMIT_ERROR_MAX_CHARS - 1).join("")}…`
            : reasonChars.join("");
          statusToast.update(t("toast.frameSubmitFailed", { reason }), "error");
          statusToast.dismiss(5000);
          throw error;
        }
      });
      const results = await Promise.allSettled(sendTasks);
      const failures = results
        .map((result, index) => ({ result, app: targets[index].app }))
        .filter((item) => item.result.status === "rejected");
      const successCount = results.length - failures.length;
      await recordSendHistory(text, images);
      if (!failures.length) {
        clearInput(null, { bypassModelGate: true });
        toast(t("toast.sentToChats", { count: successCount, plural: successCount === 1 ? "" : "s" }), "success");
        return;
      }
      for (const { result, app } of failures) {
        void recordFunctionalAnomaly({
          feature: "composer",
          operation: "sendPrompt",
          appId: app?.id || "",
          appName: inferAppName(app),
          href: app?.url || "",
          error: result.reason,
          message: result.reason?.message || t("toast.frameSubmitFailureFallback")
        });
      }
      const names = failures.map((item) => inferAppName(item.app)).filter(Boolean).slice(0, 4).join(", ") || t("common.failed");
      if (successCount > 0) {
        toast(t("toast.sentToSomeChats", {
          sentCount: successCount,
          sentPlural: successCount === 1 ? "" : "s",
          names
        }), "error");
        return;
      }
      toast(t("toast.sendFailedToChats", { names }), "error");
    } finally {
      state.promptSendInFlight = false;
      syncSendButton();
    }
  }

  function submit(source = null) {
    if (!preferredModel.ensurePreferredModelInputReady()) return;
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
    const sizing = promptInputHeight(inputNode.scrollHeight, window.innerHeight, expanded, {
      hasImages: state.promptImages.length > 0
    });
    inputNode.style.height = `${sizing.height}px`;
    inputNode.style.overflowY = sizing.overflowY;
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
    sendButton.disabled = preferredModel.preferredModelInputGateIsLocked()
      || state.promptSendInFlight
      || !hasContent(inputNode?.value ?? state.promptText, state.promptImages);
  }

  function syncCollapsedPreview(inputNode = document.querySelector(".prompt-input")) {
    const shell = inputNode?.closest?.(".prompt-shell");
    const preview = shell?.querySelector?.(".prompt-collapsed-preview");
    const value = inputNode?.value ?? state.promptText;
    syncClearButton(inputNode);
    syncSendButton(inputNode);
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

  function clearInput(event, { bypassModelGate = false } = {}) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!bypassModelGate && !preferredModel.ensurePreferredModelInputReady()) return;
    state.promptText = "";
    state.promptImages = [];
    state.promptSelection = { start: 0, end: 0, direction: "none" };
    resetHistoryNavigation();
    const inputNode = syncInputNode({ focus: true, bypassModelGate }) || document.querySelector(".prompt-input");
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
    if (preferredModel.preferredModelInputGateIsLocked()) {
      const key = String(event.key || "");
      if (key === "Enter" || key === "Backspace" || key === "Delete" || key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        preferredModel.notifyPreferredModelGateBlocked();
      }
      return;
    }
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

  function handleBeforeInput(event) {
    if (!preferredModel.preferredModelInputGateIsLocked()
      || preferredModel.preferredModelPromptCompositionIsActive(event.currentTarget)) return;
    event.preventDefault();
    event.stopPropagation();
    preferredModel.restorePreferredModelLockedPromptSnapshot();
    preferredModel.notifyPreferredModelGateBlocked();
  }

  function handleInput(event) {
    if (preferredModel.preferredModelInputGateIsLocked()
      && !preferredModel.preferredModelPromptCompositionIsActive(event.currentTarget)) {
      preferredModel.restorePreferredModelLockedPromptSnapshot();
      return;
    }
    state.promptText = event.target.value;
    resetHistoryNavigation();
    rememberSelection(event.target);
    syncCollapsedPreview(event.target);
    expandInput(event.target);
    if (preferredModel.preferredModelInputGateIsLocked()) {
      preferredModel.capturePreferredModelLockedPromptSnapshot();
    }
  }

  function syncInputNode({ focus = false, bypassModelGate = false } = {}) {
    const inputNode = document.querySelector(".prompt-input");
    if (!inputNode) return null;
    if (!bypassModelGate && preferredModel.preferredModelInputGateIsLocked()) {
      preferredModel.restorePreferredModelLockedPromptSnapshot();
      return inputNode;
    }
    if (bypassModelGate && preferredModel.preferredModelInputGateIsLocked()) {
      preferredModel.rememberPreferredModelLockedPromptSnapshot();
    }
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

  function render({ placeholder = "", gate = {} } = {}) {
    currentPlaceholder = String(placeholder || "");
    const gateLocked = preferredModel.preferredModelInputGateIsLocked();
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
      readonly: gateLocked,
      "aria-busy": gateLocked ? "true" : "false",
      dataset: { modelGateState: gateState },
      onpointerdown: handlePointerDown,
      onfocus: (event) => expandInput(event.target),
      onblur: preferredModel.handlePromptBlur,
      onclick: handleClick,
      onbeforeinput: handleBeforeInput,
      onpaste: handlePaste,
      oncompositionstart: preferredModel.handlePreferredModelPromptCompositionStart,
      oncompositionend: preferredModel.handlePreferredModelPromptCompositionEnd,
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
          modelGateFailedAppIds: (gate.failedAppIds || []).join(",")
        },
        "aria-busy": gateLocked ? "true" : "false",
        onpointerdown: handlePointerDown,
        ondragenter: handleDragEnter,
        ondragover: handleDragOver,
        ondragleave: (event) => event.currentTarget.classList.remove("prompt-shell-drag-over"),
        ondrop: handleDrop,
        onpaste: handlePaste
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
          disabled: gateLocked,
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
          disabled: gateLocked,
          accept: "image/*",
          multiple: true,
          tabindex: "-1",
          onchange: handleImageFileChange
        }),
        el("button", {
          class: "prompt-clear-button compact-icon tooltip-trigger",
          type: "button",
          disabled: gateLocked,
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
          disabled: gateLocked || state.promptSendInFlight || !hasContent(state.promptText, state.promptImages),
          "aria-label": t("topbar.send"),
          "data-tooltip": t("topbar.sendTooltip"),
          "data-tooltip-id": "topbar.send",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (state.promptSendInFlight || !preferredModel.ensurePreferredModelInputReady()) return;
            submit(event);
          },
          onpointerdown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onkeydown: (event) => event.stopPropagation()
        }, createSvgIcon("send")),
        el("div", {
          class: "prompt-model-gate-status",
          hidden: !gateLocked,
          "aria-live": "polite",
          "aria-atomic": "true"
        },
          gateApplying ? el("span", { class: "prompt-model-gate-spinner", "aria-hidden": "true" }) : null,
          gateLocked ? el("span", { class: "prompt-model-gate-status-text" }, gateStatusText) : null
        )
      )
    );
  }

  const preferredModelPort = Object.freeze({
    normalizePromptImages: normalizeImages,
    rememberPromptSelection: rememberSelection,
    syncPromptCollapsedPreview: syncCollapsedPreview,
    restorePromptSelection: restoreSelection,
    closePromptActionsMenu: closeActionsMenu,
    promptHasContent: hasContent,
    collapsePromptInput: collapseInput
  });

  return Object.freeze({
    render,
    syncInputNode,
    focusInput,
    setImages,
    closeActionsMenu,
    preferredModelPort
  });
}
