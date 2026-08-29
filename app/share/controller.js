import { t } from "../../shared/i18n.js";
import { storageGet, storageSet } from "../../shared/storage-adapter.js";
import { findSummarySiteConfig } from "../../shared/url-match.js";
import { summaryConfigHasCollector } from "../../shared/summary-sites.js";
import { createActionButton } from "../../ui/components.js";
import { el, iconButton, toast } from "../../ui/dom.js";
import { requireControllerContext, requireControllerFunction, validateControllerContract } from "../controller-contract.js";
import { createFrameRequest } from "../frame-request.js";
import {
  blobUrl,
  captureFrameImage,
  canvasToJpegBlob,
  composeCapturedImages,
  copyImageCanvas,
  copyText,
  downloadBlob,
  openBlobInTab,
  revokeShareUrl,
  sleep,
  throwIfAborted
} from "./capture.js";
import {
  SHARE_FORMAT_IMAGE,
  SHARE_FORMAT_TEXT,
  SHARE_IMAGE_LAYOUT_ROW,
  SHARE_IMAGE_LAYOUT_STACK,
  SHARE_PANEL_MIN_HEIGHT,
  SHARE_PANEL_MIN_WIDTH,
  SHARE_SCOPE_ALL,
  SHARE_SCOPE_CURRENT,
  SHARE_SCOPE_SELECTED,
  composeShareText,
  normalizeShareFormat,
  normalizeShareImageLayout,
  normalizeSharePanelSize,
  normalizeShareScope,
  resolveShareTargets,
  shareFilename
} from "./model.js";

const SHARE_PANEL_SIZE_KEY = "chatclub.sharePanelSize.v1";

export function createShareController(ctx) {
  const controllerName = "Share controller";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    currentFrames: "function",
    frameApp: "function",
    activateChatTab: "function",
    activeChatForGroup: "function",
    prepareContentFrameRuntime: "function",
    setFramePointerBlockedForOverlay: "function",
    inferAppName: "function",
    framePort: "object",
    recordFunctionalAnomaly: "function"
  });
  const state = requireControllerContext(ctx, controllerName, "state");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const currentFrames = requireControllerFunction(ctx, controllerName, "currentFrames");
  const frameApp = requireControllerFunction(ctx, controllerName, "frameApp");
  const activateChatTab = requireControllerFunction(ctx, controllerName, "activateChatTab");
  const activeChatForGroup = requireControllerFunction(ctx, controllerName, "activeChatForGroup");
  const prepareContentFrameRuntime = requireControllerFunction(ctx, controllerName, "prepareContentFrameRuntime");
  const setFramePointerBlockedForOverlay = requireControllerFunction(ctx, controllerName, "setFramePointerBlockedForOverlay");
  const inferAppName = requireControllerFunction(ctx, controllerName, "inferAppName");
  const recordFunctionalAnomaly = requireControllerFunction(ctx, controllerName, "recordFunctionalAnomaly");
  const sendToContentFrame = createFrameRequest(ctx.framePort, controllerName);
  let captureAbort = null;
  let previewCanvas = null;

  function recordShareFailure(operation, error, message = "") {
    void recordFunctionalAnomaly({
      feature: "share",
      operation,
      error,
      message: message || error?.message || t("sharePanel.captureFailed")
    });
  }

  function frameForInstance(instanceId) {
    const id = String(instanceId || "");
    if (!id) return null;
    return Array.from(document.querySelectorAll(".chat-frame"))
      .find((frame) => frame.dataset.instanceId === id) || null;
  }

  function listShareFrames() {
    const frames = [];
    (state.groups || []).forEach((group, groupIndex) => {
      (group.chatApps || []).forEach((chat, tabIndex) => {
        const iframe = frameForInstance(chat.instanceId);
        const app = iframe ? frameApp(iframe) : null;
        frames.push({
          key: chat.instanceId,
          instanceId: chat.instanceId,
          groupId: group.id,
          groupIndex,
          tabIndex,
          group,
          chat,
          iframe,
          app,
          name: inferAppName(app || { id: chat.appId, url: chat.url }) || chat.appId || t("sharePanel.untitled"),
          href: iframe?.dataset?.currentHref || iframe?.src || chat.url || "",
          visible: Boolean(iframe?.classList?.contains("active"))
        });
      });
    });
    return frames;
  }

  function currentShareKey() {
    if (state.fullscreenGroupId) {
      const group = (state.groups || []).find((item) => item.id === state.fullscreenGroupId);
      const chat = group ? activeChatForGroup(group) : null;
      if (chat?.instanceId) return chat.instanceId;
    }
    const active = document.activeElement;
    if (active?.classList?.contains("chat-frame") && active.dataset.instanceId) return active.dataset.instanceId;
    const visible = currentFrames()[0];
    return visible?.dataset?.instanceId || listShareFrames().find((frame) => frame.visible)?.instanceId || "";
  }

  function selectedTargets() {
    return resolveShareTargets({
      scope: state.shareScope,
      frames: listShareFrames(),
      selectedKeys: state.shareSelectedKeys,
      currentKey: currentShareKey()
    });
  }

  function clearPreview() {
    revokeShareUrl(state.sharePreviewUrl);
    state.sharePreviewUrl = "";
    state.sharePreviewText = "";
    previewCanvas = null;
  }

  function syncSharePanel() {
    const currentPanel = document.querySelector(".share-panel");
    if (currentPanel && state.shareOpen) captureSharePanelGeometry(currentPanel);
    currentPanel?.remove();
    if (state.shareOpen) document.body.append(renderSharePanel());
  }

  function openSharePanel() {
    state.shareOpen = true;
    state.shareFormat = normalizeShareFormat(state.shareFormat);
    state.shareScope = normalizeShareScope(state.shareScope);
    state.shareImageLayout = normalizeShareImageLayout(state.shareImageLayout);
    if (!Array.isArray(state.shareSelectedKeys) || !state.shareSelectedKeys.length) {
      state.shareSelectedKeys = listShareFrames().filter((frame) => frame.visible).map((frame) => frame.key);
    }
    syncSharePanel();
  }

  function closeSharePanel() {
    if (state.shareBusy) captureAbort?.abort();
    state.shareOpen = false;
    state.shareMaximized = false;
    syncSharePanel();
  }

  function toggleShareMaximized() {
    state.shareMaximized = !state.shareMaximized;
    syncSharePanel();
  }

  async function loadSharePanelSize() {
    try {
      const stored = await storageGet(SHARE_PANEL_SIZE_KEY);
      state.shareSize = normalizeSharePanelSize(stored?.[SHARE_PANEL_SIZE_KEY] || stored || {});
    } catch {
      state.shareSize = normalizeSharePanelSize({});
    }
    return state.shareSize;
  }

  function captureSharePanelGeometry(panel) {
    if (!panel || state.shareMaximized || panel.classList.contains("share-panel-maximized") || panel.classList.contains("maximized")) return;
    const rect = panel.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return;
    state.shareSize = normalizeSharePanelSize({
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
  }

  function rememberSharePanelGeometry(panel) {
    captureSharePanelGeometry(panel);
    if (state.shareSize) storageSet({ [SHARE_PANEL_SIZE_KEY]: state.shareSize }).catch(() => {});
  }

  function sharePanelMaxWidth() {
    return Math.max(SHARE_PANEL_MIN_WIDTH, window.innerWidth - 32);
  }

  function sharePanelMaxHeight() {
    return Math.max(SHARE_PANEL_MIN_HEIGHT, window.innerHeight - 24);
  }

  function sharePanelSizeStyle() {
    if (state.shareMaximized) return {};
    const size = normalizeSharePanelSize(state.shareSize || {});
    const width = Math.min(Math.max(SHARE_PANEL_MIN_WIDTH, size.width), sharePanelMaxWidth());
    const height = Math.min(Math.max(SHARE_PANEL_MIN_HEIGHT, size.height), sharePanelMaxHeight());
    const style = {
      width: "var(--share-panel-width)",
      height: "var(--share-panel-height)",
      "--share-panel-width": `${width}px`,
      "--share-panel-height": `${height}px`
    };
    if (Number.isFinite(size.left) && Number.isFinite(size.top)) {
      style.left = `${Math.min(Math.max(8, size.left), Math.max(8, window.innerWidth - width - 8))}px`;
      style.top = `${Math.min(Math.max(8, size.top), Math.max(8, window.innerHeight - height - 8))}px`;
      style.transform = "none";
    }
    return style;
  }

  function setIframePointerBlocked(blocked) {
    setFramePointerBlockedForOverlay(blocked, "share");
  }

  function shareActionButton(label, onClick, variant, disabled, iconName, tooltipId) {
    const button = createActionButton({
      label,
      icon: svgIcon(iconName),
      onClick,
      variant,
      tooltipId
    });
    if (disabled) button.disabled = true;
    return button;
  }

  function optionButton(label, selected, onClick) {
    return el("button", {
      type: "button",
      class: `share-option${selected ? " is-selected" : ""}`,
      "aria-pressed": selected ? "true" : "false",
      disabled: state.shareBusy,
      onclick: onClick
    }, label);
  }

  function renderSharePanel() {
    const format = normalizeShareFormat(state.shareFormat);
    const scope = normalizeShareScope(state.shareScope);
    const layout = normalizeShareImageLayout(state.shareImageLayout);
    const frames = listShareFrames();
    const hasPreview = format === SHARE_FORMAT_TEXT ? Boolean(state.sharePreviewText) : Boolean(state.sharePreviewUrl);
    const panel = el("section", {
      class: `share-panel overlay-surface${state.shareMaximized ? " share-panel-maximized maximized" : ""}`,
      style: sharePanelSizeStyle()
    },
      el("div", { class: "share-panel-surface" },
        el("header", { class: "share-panel-header" },
          el("div", { class: "share-panel-title" },
            svgIcon("share"),
            el("strong", {}, t("sharePanel.title"))
          ),
          el("div", { class: "share-panel-window-actions" },
            iconButton(
              state.shareMaximized ? t("sharePanel.restore") : t("sharePanel.maximize"),
              svgIcon(state.shareMaximized ? "minimize" : "maximize"),
              toggleShareMaximized,
              "share-window-button overlay-window-button",
              state.shareMaximized ? t("sharePanel.restore") : t("sharePanel.maximize"),
              "",
              "share.window.fullscreen"
            ),
            iconButton(t("common.close"), svgIcon("x"), closeSharePanel, "share-window-button overlay-window-button", t("common.close"), "", "share.window.close")
          )
        ),
        el("div", { class: "share-panel-controls" },
          el("div", { class: "share-panel-row" },
            el("span", { class: "share-panel-label" }, t("sharePanel.format")),
            el("div", { class: "share-option-group" },
              optionButton(t("sharePanel.formatImage"), format === SHARE_FORMAT_IMAGE, () => {
                state.shareFormat = SHARE_FORMAT_IMAGE;
                syncSharePanel();
              }),
              optionButton(t("sharePanel.formatText"), format === SHARE_FORMAT_TEXT, () => {
                state.shareFormat = SHARE_FORMAT_TEXT;
                syncSharePanel();
              })
            )
          ),
          el("div", { class: "share-panel-row" },
            el("span", { class: "share-panel-label" }, t("sharePanel.scope")),
            el("div", { class: "share-option-group" },
              optionButton(t("sharePanel.scopeCurrent"), scope === SHARE_SCOPE_CURRENT, () => {
                state.shareScope = SHARE_SCOPE_CURRENT;
                syncSharePanel();
              }),
              optionButton(t("sharePanel.scopeSelected"), scope === SHARE_SCOPE_SELECTED, () => {
                state.shareScope = SHARE_SCOPE_SELECTED;
                if (!state.shareSelectedKeys.length) {
                  state.shareSelectedKeys = frames.filter((frame) => frame.visible).map((frame) => frame.key);
                }
                syncSharePanel();
              }),
              optionButton(t("sharePanel.scopeAll"), scope === SHARE_SCOPE_ALL, () => {
                state.shareScope = SHARE_SCOPE_ALL;
                syncSharePanel();
              })
            )
          ),
          format === SHARE_FORMAT_IMAGE ? el("div", { class: "share-panel-row" },
            el("span", { class: "share-panel-label" }, t("sharePanel.layout")),
            el("div", { class: "share-option-group" },
              optionButton(t("sharePanel.layoutStack"), layout === SHARE_IMAGE_LAYOUT_STACK, () => {
                state.shareImageLayout = SHARE_IMAGE_LAYOUT_STACK;
                syncSharePanel();
              }),
              optionButton(t("sharePanel.layoutRow"), layout === SHARE_IMAGE_LAYOUT_ROW, () => {
                state.shareImageLayout = SHARE_IMAGE_LAYOUT_ROW;
                syncSharePanel();
              })
            )
          ) : null,
          scope === SHARE_SCOPE_SELECTED ? el("div", { class: "share-frame-list" },
            frames.length ? frames.map((frame) => el("label", { class: "share-frame-item" },
              el("input", {
                type: "checkbox",
                checked: state.shareSelectedKeys.includes(frame.key),
                disabled: state.shareBusy,
                onchange: (event) => {
                  const selected = new Set(state.shareSelectedKeys);
                  if (event.target.checked) selected.add(frame.key);
                  else selected.delete(frame.key);
                  state.shareSelectedKeys = Array.from(selected);
                  syncSharePanel();
                }
              }),
              el("span", { class: "share-frame-name" }, frame.name),
              el("span", { class: "share-frame-state" }, frame.visible ? t("sharePanel.visibleTab") : t("sharePanel.hiddenTab"))
            )) : el("p", { class: "share-panel-hint" }, t("sharePanel.noFrames"))
          ) : null,
          el("p", { class: "share-panel-hint" }, format === SHARE_FORMAT_IMAGE ? t("sharePanel.imageHint") : t("sharePanel.textHint"))
        ),
        el("div", { class: "share-panel-actions" },
          state.shareBusy
            ? shareActionButton(t("sharePanel.stop"), stopShare, "danger", false, "x", "share.action.stop")
            : shareActionButton(t("sharePanel.capture"), runShare, "primary", false, format === SHARE_FORMAT_IMAGE ? "preview" : "copy", "share.action.capture"),
          shareActionButton(t("sharePanel.copy"), copyShare, "secondary", state.shareBusy || !hasPreview, "copy", "share.action.copy"),
          shareActionButton(t("sharePanel.download"), downloadShare, "secondary", state.shareBusy || !hasPreview, "fileDown", "share.action.download"),
          format === SHARE_FORMAT_IMAGE
            ? shareActionButton(t("sharePanel.open"), openShare, "secondary", state.shareBusy || !hasPreview, "external", "share.action.open")
            : null
        ),
        state.shareStatus || state.shareError
          ? el("p", { class: `share-panel-status${state.shareError ? " is-error" : ""}` }, state.shareError || state.shareStatus)
          : null,
        el("main", { class: "share-panel-preview" }, renderPreview(format, hasPreview))
      ),
      !state.shareMaximized ? el("div", { class: "overlay-panel-resize-handle overlay-panel-resize-handle-left share-panel-resize-handle share-panel-resize-handle-left", dataset: { direction: "left" }, "aria-hidden": "true" }) : null,
      !state.shareMaximized ? el("div", { class: "overlay-panel-resize-handle overlay-panel-resize-handle-right share-panel-resize-handle share-panel-resize-handle-right", dataset: { direction: "right" }, "aria-hidden": "true" }) : null,
      !state.shareMaximized ? el("div", { class: "overlay-panel-resize-handle overlay-panel-resize-handle-bottom share-panel-resize-handle share-panel-resize-handle-bottom", dataset: { direction: "bottom" }, "aria-hidden": "true" }) : null
    );
    makeDraggable(panel, ".share-panel-header");
    makeShareResizable(panel);
    return panel;
  }

  function renderPreview(format, hasPreview) {
    if (format === SHARE_FORMAT_TEXT) {
      return el("textarea", {
        class: "textarea share-panel-text",
        readonly: true,
        placeholder: t("sharePanel.emptyText")
      }, state.sharePreviewText || "");
    }
    if (hasPreview) {
      return el("img", { class: "share-panel-image", src: state.sharePreviewUrl, alt: t("sharePanel.preview") });
    }
    return el("p", { class: "share-panel-empty" }, t("sharePanel.emptyImage"));
  }

  function makeDraggable(panel, handleSelector) {
    const handle = panel.querySelector(handleSelector);
    let drag = null;
    const finishDrag = () => {
      if (!drag) return;
      rememberSharePanelGeometry(panel);
      setIframePointerBlocked(false);
      drag = null;
    };
    handle.addEventListener("pointerdown", (event) => {
      if (state.shareMaximized || event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      panel.style.transform = "none";
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      setIframePointerBlocked(true);
      panel.setPointerCapture?.(event.pointerId);
    });
    panel.addEventListener("pointermove", (event) => {
      if (!drag || state.shareMaximized) return;
      const rect = panel.getBoundingClientRect();
      const nextLeft = Math.min(Math.max(8, drag.left + event.clientX - drag.x), Math.max(8, window.innerWidth - rect.width - 8));
      const nextTop = Math.min(Math.max(8, drag.top + event.clientY - drag.y), Math.max(8, window.innerHeight - rect.height - 8));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.transform = "none";
      captureSharePanelGeometry(panel);
    });
    panel.addEventListener("pointerup", finishDrag);
    panel.addEventListener("pointercancel", finishDrag);
  }

  function makeShareResizable(panel) {
    let resize = null;
    for (const handle of panel.querySelectorAll(".overlay-panel-resize-handle")) {
      handle.addEventListener("pointerdown", (event) => {
        if (state.shareMaximized) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        panel.style.transform = "none";
        resize = {
          direction: handle.dataset.direction,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
        panel.classList.add("share-panel-resizing");
        setIframePointerBlocked(true);
        handle.setPointerCapture?.(event.pointerId);
      });
    }
    const finishResize = () => {
      if (!resize) return;
      rememberSharePanelGeometry(panel);
      panel.classList.remove("share-panel-resizing");
      setIframePointerBlocked(false);
      resize = null;
    };
    panel.addEventListener("pointermove", (event) => {
      if (!resize || state.shareMaximized) return;
      const dx = event.clientX - resize.x;
      const dy = event.clientY - resize.y;
      let left = resize.left;
      let width = resize.width;
      let height = resize.height;
      if (resize.direction === "left") {
        width = Math.min(sharePanelMaxWidth(), Math.max(SHARE_PANEL_MIN_WIDTH, resize.width - dx));
        left = resize.left + (resize.width - width);
      } else if (resize.direction === "right") {
        width = Math.min(sharePanelMaxWidth(), Math.max(SHARE_PANEL_MIN_WIDTH, resize.width + dx));
      } else if (resize.direction === "bottom") {
        height = Math.min(sharePanelMaxHeight(), Math.max(SHARE_PANEL_MIN_HEIGHT, resize.height + dy));
      }
      panel.style.left = `${left}px`;
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      captureSharePanelGeometry(panel);
    });
    panel.addEventListener("pointerup", finishResize);
    panel.addEventListener("pointercancel", finishResize);
  }

  async function sendCommand(iframe, command, data = {}) {
    await prepareContentFrameRuntime(iframe);
    return sendToContentFrame(iframe, command, data);
  }

  async function waitForFrameVisible(iframe, signal) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      throwIfAborted(signal);
      const rect = iframe.getBoundingClientRect();
      if (iframe.classList.contains("active") && rect.width > 8 && rect.height > 8) {
        await sleep(80);
        return;
      }
      await sleep(50);
    }
  }

  async function withVisibleFrame(target, signal, task) {
    const iframe = target.iframe;
    if (!iframe) throw new Error(t("sharePanel.missingFrame", { name: target.name }));
    const group = target.group;
    const previousId = group ? activeChatForGroup(group)?.instanceId : "";
    const needsSwitch = !iframe.classList.contains("active");
    if (needsSwitch && group) activateChatTab(group, target.instanceId);
    try {
      await waitForFrameVisible(iframe, signal);
      iframe.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      return await task(iframe);
    } finally {
      if (needsSwitch && group && previousId && previousId !== target.instanceId) {
        try { activateChatTab(group, previousId); } catch {}
      }
    }
  }

  function stopShare() {
    captureAbort?.abort();
  }

  async function runShare() {
    if (state.shareBusy) return;
    const targets = selectedTargets();
    if (!targets.length) {
      state.shareError = t("sharePanel.noFrames");
      syncSharePanel();
      return;
    }
    captureAbort?.abort();
    const abort = new AbortController();
    captureAbort = abort;
    state.shareBusy = true;
    state.shareError = "";
    state.shareStatus = t("sharePanel.waitingPaint");
    syncSharePanel();
    document.body.classList.add("share-capturing");
    try {
      if (normalizeShareFormat(state.shareFormat) === SHARE_FORMAT_TEXT) await collectShareText(targets, abort.signal);
      else await collectShareImage(targets, abort.signal);
    } catch (error) {
      if (error?.name === "AbortError") {
        state.shareError = "";
        state.shareStatus = t("sharePanel.captureInterrupted");
      } else {
        state.shareError = error?.message || t("sharePanel.captureFailed");
        state.shareStatus = "";
        recordShareFailure(normalizeShareFormat(state.shareFormat) === SHARE_FORMAT_TEXT ? "collectText" : "captureImage", error, state.shareError);
      }
    } finally {
      document.body.classList.remove("share-capturing");
      state.shareBusy = false;
      if (captureAbort === abort) captureAbort = null;
      syncSharePanel();
    }
  }

  async function collectSharePageText(iframe) {
    const text = await sendToContentFrame(iframe, "getPageText", {}, 2500).catch(() => "");
    const value = String(text || "").trim();
    return value ? [{ role: "page", text: value }] : [];
  }

  async function collectShareMessages(iframe, href) {
    const config = findSummarySiteConfig(state.options?.summarySiteConfigs, href);
    if (!config) return collectSharePageText(iframe);
    const summaryReady = await prepareContentFrameRuntime(iframe, { summary: true });
    if (!summaryReady?.ok) return collectSharePageText(iframe);
    const hasSummaryRunner = summaryConfigHasCollector(config);
    if (hasSummaryRunner) {
      const runtimeConfig = { ...config };
      delete runtimeConfig.userscript;
      delete runtimeConfig.customUserscript;
      const result = await sendToContentFrame(iframe, "collectSummary", {
        config: runtimeConfig,
        expectedDocumentId: summaryReady.registration?.documentId,
        expectedHref: href
      }, config.userscriptTimeoutMs || 36000);
      const messages = Array.isArray(result?.messages) ? result.messages : [];
      if (messages.length) return messages;
    }
    return collectSharePageText(iframe);
  }

  async function collectShareText(targets, signal) {
    state.shareStatus = t("sharePanel.collectingText");
    syncSharePanel();
    const sections = [];
    for (const [index, target] of targets.entries()) {
      throwIfAborted(signal);
      state.shareStatus = t("sharePanel.capturing", { current: index + 1, total: targets.length });
      syncSharePanel();
      if (!target.iframe) {
        sections.push({ name: target.name, href: target.href, error: t("sharePanel.missingFrame", { name: target.name }) });
        continue;
      }
      try {
        await prepareContentFrameRuntime(target.iframe);
        const meta = await sendToContentFrame(target.iframe, "getPageMeta").catch(() => ({}));
        const href = meta?.href || target.href;
        sections.push({
          name: target.name,
          title: meta?.title || "",
          href,
          messages: await collectShareMessages(target.iframe, href)
        });
      } catch (error) {
        sections.push({
          name: target.name,
          href: target.href,
          error: error?.message || t("sharePanel.frameFailed", { name: target.name, error: t("sharePanel.captureFailed") })
        });
      }
    }
    const composed = composeShareText(sections);
    if (!composed) throw new Error(t("sharePanel.emptyText"));
    clearPreview();
    state.sharePreviewText = composed;
    state.shareStatus = t("sharePanel.collected", { count: targets.length });
  }

  async function collectShareImage(targets, signal) {
    const captured = [];
    for (const [index, target] of targets.entries()) {
      throwIfAborted(signal);
      state.shareStatus = t("sharePanel.capturing", { current: index + 1, total: targets.length });
      syncSharePanel();
      const canvas = await withVisibleFrame(target, signal, (iframe) => captureFrameImage({
        iframe,
        sendCommand,
        signal,
        onStatus: (slice) => {
          state.shareStatus = t("sharePanel.capturingFrame", { name: target.name, slice });
        }
      }));
      captured.push({ canvas, header: target.name });
    }
    throwIfAborted(signal);
    const composed = composeCapturedImages(captured, { layout: state.shareImageLayout });
    const blob = await canvasToJpegBlob(composed);
    clearPreview();
    previewCanvas = composed;
    state.sharePreviewUrl = blobUrl(blob);
    state.shareStatus = t("sharePanel.collected", { count: captured.length });
  }

  async function copyShare() {
    try {
      if (normalizeShareFormat(state.shareFormat) === SHARE_FORMAT_TEXT) {
        if (!state.sharePreviewText) throw new Error(t("sharePanel.emptyText"));
        await copyText(state.sharePreviewText);
      } else {
        if (!previewCanvas) throw new Error(t("sharePanel.emptyImage"));
        await copyImageCanvas(previewCanvas);
      }
      toast(t("sharePanel.copied"), "success");
    } catch (error) {
      const message = error?.message || t("sharePanel.copyFailed");
      toast(message, "error");
      recordShareFailure("copy", error, message);
    }
  }

  async function downloadShare() {
    try {
      const filename = shareFilename(state.shareFormat);
      if (normalizeShareFormat(state.shareFormat) === SHARE_FORMAT_TEXT) {
        if (!state.sharePreviewText) throw new Error(t("sharePanel.emptyText"));
        downloadBlob(filename, new Blob([state.sharePreviewText], { type: "text/plain;charset=utf-8" }));
        return;
      }
      if (!previewCanvas) throw new Error(t("sharePanel.emptyImage"));
      downloadBlob(filename, await canvasToJpegBlob(previewCanvas));
    } catch (error) {
      const message = error?.message || t("sharePanel.downloadFailed");
      toast(message, "error");
      recordShareFailure("download", error, message);
    }
  }

  async function openShare() {
    try {
      if (!previewCanvas) throw new Error(t("sharePanel.emptyImage"));
      await openBlobInTab(await canvasToJpegBlob(previewCanvas));
    } catch (error) {
      const message = error?.message || t("sharePanel.openFailed");
      toast(message, "error");
      recordShareFailure("open", error, message);
    }
  }

  return {
    sync: syncSharePanel,
    open: openSharePanel,
    close: closeSharePanel,
    toggleMaximized: toggleShareMaximized,
    loadPanelSize: loadSharePanelSize
  };
}
