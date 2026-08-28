import { el } from "./dom.js";

const OVERLAY_SURFACE_FULLSCREEN_CLASS = "overlay-surface-fullscreen";
const VIEWER_WINDOW_FULLSCREEN_TOOLTIP_ID = "viewer.fullscreen";

const VIEWER_WINDOW_EDGE = 8;

export function createViewerWindowChrome(options = {}) {
  const fullscreenClass = String(options.fullscreenClass || "");
  const focusClass = String(options.focusClass || "");
  const sizeKey = String(options.sizeKey || "");
  const minWidth = Number(options.minWidth) || 720;
  const minHeight = Number(options.minHeight) || 420;
  const widthVar = options.widthVar || "--overlay-viewer-width";
  const heightVar = options.heightVar || "--overlay-viewer-height";
  const buttonClass = options.buttonClass || "icon-button tooltip-trigger overlay-window-button";
  const t = options.t;
  const svgIcon = options.svgIcon;
  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  const onPointerBlock = typeof options.onPointerBlock === "function" ? options.onPointerBlock : () => {};

  function panelMaxWidth() {
    return Math.max(320, window.innerWidth - 32);
  }

  function panelMaxHeight() {
    return Math.max(280, window.innerHeight - 32);
  }

  function panelMinWidth() {
    return Math.min(minWidth, panelMaxWidth());
  }

  function panelMinHeight() {
    return Math.min(minHeight, panelMaxHeight());
  }

  function clampSize(value) {
    if (!value || typeof value !== "object") return null;
    const width = Number(value.width);
    const height = Number(value.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const next = {
      width: Math.round(Math.min(panelMaxWidth(), Math.max(panelMinWidth(), width))),
      height: Math.round(Math.min(panelMaxHeight(), Math.max(panelMinHeight(), height)))
    };
    const left = Number(value.left);
    const top = Number(value.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      next.left = Math.round(Math.min(Math.max(VIEWER_WINDOW_EDGE, left), Math.max(VIEWER_WINDOW_EDGE, window.innerWidth - next.width - VIEWER_WINDOW_EDGE)));
      next.top = Math.round(Math.min(Math.max(VIEWER_WINDOW_EDGE, top), Math.max(VIEWER_WINDOW_EDGE, window.innerHeight - next.height - VIEWER_WINDOW_EDGE)));
    }
    return next;
  }

  function readSize() {
    if (!sizeKey) return null;
    try {
      return clampSize(JSON.parse(localStorage.getItem(sizeKey) || "null"));
    } catch {
      return null;
    }
  }

  function isFullscreen(panel) {
    return Boolean(panel?.classList?.contains(fullscreenClass));
  }

  function isFocusMode(panel) {
    return Boolean(panel?.classList?.contains(focusClass));
  }

  function syncFillViewportClass(panel) {
    panel?.classList?.toggle(OVERLAY_SURFACE_FULLSCREEN_CLASS, isFullscreen(panel) || isFocusMode(panel));
  }

  function clearInlineGeometry(panel) {
    if (!panel) return;
    ["width", "height", "left", "top", "transform", widthVar, heightVar].forEach((property) => {
      panel.style.removeProperty(property);
    });
  }

  function applySize(panel) {
    const size = readSize();
    if (!panel || !size) return;
    panel.style.setProperty(widthVar, `${size.width}px`);
    panel.style.setProperty(heightVar, `${size.height}px`);
    panel.style.width = `var(${widthVar})`;
    panel.style.height = `var(${heightVar})`;
    if (Number.isFinite(size.left) && Number.isFinite(size.top)) {
      panel.style.left = `${size.left}px`;
      panel.style.top = `${size.top}px`;
      panel.style.transform = "none";
    }
  }

  function rememberGeometry(panel) {
    if (!panel || isFullscreen(panel) || !sizeKey) return;
    const rect = panel.getBoundingClientRect();
    const size = clampSize({
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
    if (!size) return;
    try { localStorage.setItem(sizeKey, JSON.stringify(size)); } catch {}
  }

  function syncFullscreenButton(button, panel) {
    if (!button || !panel || !t || !svgIcon) return;
    const fullscreen = isFullscreen(panel);
    const label = fullscreen ? t("chat.exitFullscreen") : t("chat.fullscreen");
    button.setAttribute("aria-label", label);
    button.setAttribute("data-tooltip", label);
    button.replaceChildren(svgIcon(fullscreen ? "minimize" : "maximize"));
  }

  function exitExpanded(panel) {
    panel.classList.remove(focusClass);
    panel.classList.remove(fullscreenClass);
    syncFillViewportClass(panel);
    applySize(panel);
  }

  function enterFullscreen(panel, { focus = false } = {}) {
    if (!isFullscreen(panel)) rememberGeometry(panel);
    panel.classList.add(fullscreenClass);
    panel.classList.toggle(focusClass, focus);
    if (!focus) panel.classList.remove(focusClass);
    syncFillViewportClass(panel);
    clearInlineGeometry(panel);
  }

  function toggleFullscreen(panel, button) {
    if (!panel) return;
    if (isFullscreen(panel)) exitExpanded(panel);
    else enterFullscreen(panel, { focus: false });
    syncFullscreenButton(button, panel);
    onChange();
  }

  function toggleFocusMode(panel) {
    if (!panel) return;
    const fullscreenButton = panel.querySelector(`[data-tooltip-id="${VIEWER_WINDOW_FULLSCREEN_TOOLTIP_ID}"]`);
    if (isFocusMode(panel)) exitExpanded(panel);
    else enterFullscreen(panel, { focus: true });
    syncFullscreenButton(fullscreenButton, panel);
    onChange();
  }

  function fullscreenButton(panel) {
    const button = el("button", {
      class: buttonClass,
      type: "button",
      "aria-label": t("chat.fullscreen"),
      "data-tooltip": t("chat.fullscreen"),
      "data-tooltip-id": "viewer.fullscreen",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFullscreen(panel, button);
      }
    }, svgIcon("maximize"));
    return button;
  }

  function resizeHandle(direction) {
    return el("div", {
      class: `overlay-viewer-resize-handle overlay-viewer-resize-handle-${direction} pocket-panel-resize-handle pocket-panel-resize-handle-${direction}`,
      dataset: { direction },
      "aria-hidden": "true"
    });
  }

  function attachResize(panel) {
    if (!panel) return;
    applySize(panel);
    panel.append(
      resizeHandle("left"),
      resizeHandle("right"),
      resizeHandle("top"),
      resizeHandle("bottom")
    );
    let resize = null;
    for (const handle of panel.querySelectorAll(".overlay-viewer-resize-handle")) {
      handle.addEventListener("pointerdown", (event) => {
        if (isFullscreen(panel)) return;
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
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
        panel.classList.add("overlay-viewer-resizing", "pocket-panel-resizing");
        onPointerBlock(true);
        handle.setPointerCapture?.(event.pointerId);
      });
    }
    const finishResize = () => {
      if (!resize) return;
      rememberGeometry(panel);
      panel.classList.remove("overlay-viewer-resizing", "pocket-panel-resizing");
      onPointerBlock(false);
      resize = null;
    };
    panel.addEventListener("pointermove", (event) => {
      if (!resize || isFullscreen(panel)) return;
      const dx = event.clientX - resize.x;
      const dy = event.clientY - resize.y;
      if (resize.direction === "left") {
        const maxWidth = Math.min(panelMaxWidth(), Math.max(panelMinWidth(), resize.right - VIEWER_WINDOW_EDGE));
        const width = Math.min(maxWidth, Math.max(panelMinWidth(), resize.width - dx));
        panel.style.left = `${Math.max(VIEWER_WINDOW_EDGE, resize.right - width)}px`;
        panel.style.width = `${width}px`;
      } else if (resize.direction === "right") {
        const maxWidth = Math.min(panelMaxWidth(), Math.max(panelMinWidth(), window.innerWidth - resize.left - VIEWER_WINDOW_EDGE));
        panel.style.width = `${Math.min(maxWidth, Math.max(panelMinWidth(), resize.width + dx))}px`;
      } else if (resize.direction === "top") {
        const maxHeight = Math.min(panelMaxHeight(), Math.max(panelMinHeight(), resize.bottom - VIEWER_WINDOW_EDGE));
        const height = Math.min(maxHeight, Math.max(panelMinHeight(), resize.height - dy));
        panel.style.top = `${Math.max(VIEWER_WINDOW_EDGE, resize.bottom - height)}px`;
        panel.style.height = `${height}px`;
      } else if (resize.direction === "bottom") {
        const maxHeight = Math.min(panelMaxHeight(), Math.max(panelMinHeight(), window.innerHeight - resize.top - VIEWER_WINDOW_EDGE));
        panel.style.height = `${Math.min(maxHeight, Math.max(panelMinHeight(), resize.height + dy))}px`;
      }
    });
    panel.addEventListener("pointerup", finishResize);
    panel.addEventListener("pointercancel", finishResize);
  }

  return {
    isFullscreen,
    isFocusMode,
    applySize,
    rememberGeometry,
    clearInlineGeometry,
    syncFullscreenButton,
    toggleFullscreen,
    toggleFocusMode,
    fullscreenButton,
    attachResize
  };
}
