export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "class") node.className = value || "";
    else if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value || {})) node.dataset[dataKey] = dataValue;
    } else if (key === "style" && value && typeof value === "object") {
      for (const [styleKey, styleValue] of Object.entries(value)) {
        if (styleValue == null) continue;
        if (styleKey.startsWith("--")) node.style.setProperty(styleKey, String(styleValue));
        else node.style[styleKey] = styleValue;
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else if (value !== false && value != null) {
      node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function iconButton(label, icon, onClick, extraClass = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return el("button", {
    class: `icon-button tooltip-trigger ${extraClass}`.trim(),
    "aria-label": label,
    "data-tooltip": tooltipLabel,
    "data-tooltip-placement": tooltipPlacement || null,
    "data-tooltip-id": tooltipId || null,
    onclick: onClick
  }, icon);
}

export function button(label, onClick, variant = "secondary") {
  return el("button", { class: `button button-${variant}`, onclick: onClick }, label);
}

export function field(label, input) {
  return el("label", { class: "field" }, el("span", {}, label), input);
}

export function input(value = "", attrs = {}) {
  return el("input", { class: "input", value, ...attrs });
}

export function textarea(value = "", attrs = {}) {
  const node = el("textarea", { class: "textarea", ...attrs });
  node.value = value || "";
  return node;
}

export function select(value, options, attrs = {}) {
  const node = el("select", { class: "select", ...attrs });
  for (const option of options) {
    node.append(el("option", { value: option.value, selected: option.value === value }, option.label));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function toast(message, kind = "info") {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = el("div", { class: "toast-host" });
    document.body.append(host);
  }
  const item = el("div", { class: `toast toast-${kind}` }, message);
  host.append(item);
  setTimeout(() => item.classList.add("show"), 20);
  setTimeout(() => {
    item.classList.remove("show");
    setTimeout(() => item.remove(), 240);
  }, 3200);
}

export { FRAME_TOAST_POSITION_EVENT } from "../shared/protocol.js";
import { FRAME_TOAST_POSITION_EVENT } from "../shared/protocol.js";

const FRAME_TOAST_SAFE_INSET = 12;
const liveFrameToastPositionSetters = new Set();
const liveFrameToastConnectivityChecks = new Set();
let currentFrameToastPosition = Object.freeze({ x: 100, y: 100 });
let frameToastConnectivityObserver = null;

function syncFrameToastConnectivityObserver() {
  if (liveFrameToastConnectivityChecks.size) {
    if (frameToastConnectivityObserver || typeof MutationObserver !== "function" || !document.documentElement) return;
    frameToastConnectivityObserver = new MutationObserver(() => {
      for (const checkConnectivity of liveFrameToastConnectivityChecks) checkConnectivity();
    });
    frameToastConnectivityObserver.observe(document.documentElement, { childList: true, subtree: true });
    return;
  }
  frameToastConnectivityObserver?.disconnect?.();
  frameToastConnectivityObserver = null;
}

function normalizedFrameToastPosition(value = {}) {
  const coordinate = (input, fallback) => {
    if (input === "" || input === null || input === undefined || typeof input === "boolean") return fallback;
    const number = Number(input);
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : fallback)));
  };
  return {
    x: coordinate(value?.x, 100),
    y: coordinate(value?.y, 100)
  };
}

function frameToastAxisOffset(containerSize, itemSize, percent) {
  const available = Math.max(0, containerSize - itemSize);
  const safeInset = Math.min(FRAME_TOAST_SAFE_INSET, available / 2);
  const target = (containerSize * percent / 100) - (itemSize / 2);
  return Math.max(safeInset, Math.min(available - safeInset, target));
}

document.addEventListener(FRAME_TOAST_POSITION_EVENT, (event) => {
  currentFrameToastPosition = Object.freeze(normalizedFrameToastPosition(event?.detail || {}));
  for (const setPosition of liveFrameToastPositionSetters) setPosition(currentFrameToastPosition);
});

export function createFrameToast(iframe, message, kind = "info", position = null) {
  const frameWrap = iframe?.closest?.(".chat-frame-wrap");
  if (!frameWrap || !iframe?.isConnected) {
    return Object.freeze({
      update() {},
      dismiss() {},
      remove() {},
      setPosition() {}
    });
  }

  const instanceId = String(iframe.dataset?.instanceId || "");
  for (const existing of frameWrap.querySelectorAll(".frame-submit-toast")) {
    if (String(existing.dataset?.frameInstanceId || "") === instanceId) existing.remove();
  }

  let dismissTimer = 0;
  let removeTimer = 0;
  let showTimer = 0;
  let layoutFrame = 0;
  let observer = null;
  let resizeObserver = null;
  let targetPosition = normalizedFrameToastPosition(position || currentFrameToastPosition);
  const item = el("div", {
    class: `toast frame-submit-toast toast-${kind}`,
    dataset: {
      frameInstanceId: instanceId,
      frameToastX: String(targetPosition.x),
      frameToastY: String(targetPosition.y),
      frameToastBottomRight: targetPosition.x >= 67 && targetPosition.y >= 67 ? "true" : "false"
    },
    role: kind === "error" ? "alert" : "status",
    "aria-live": kind === "error" ? "assertive" : "polite",
    "aria-atomic": "true"
  }, message);

  function clearTimers() {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (removeTimer) clearTimeout(removeTimer);
    if (showTimer) clearTimeout(showTimer);
    dismissTimer = 0;
    removeTimer = 0;
    showTimer = 0;
  }

  function layout() {
    layoutFrame = 0;
    if (!frameWrap.isConnected || !iframe.isConnected || !item.isConnected) {
      remove();
      return;
    }
    const wrapWidth = frameWrap.clientWidth;
    const wrapHeight = frameWrap.clientHeight;
    const itemWidth = item.offsetWidth;
    const itemHeight = item.offsetHeight;
    if (wrapWidth <= 0 || wrapHeight <= 0 || itemWidth <= 0 || itemHeight <= 0) return;
    item.style.left = `${frameToastAxisOffset(wrapWidth, itemWidth, targetPosition.x)}px`;
    item.style.top = `${frameToastAxisOffset(wrapHeight, itemHeight, targetPosition.y)}px`;
    item.style.right = "auto";
    item.style.bottom = "auto";
  }

  function scheduleLayout() {
    if (!frameWrap.isConnected || !iframe.isConnected || !item.isConnected) {
      remove();
      return;
    }
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(layout);
  }

  function setPosition(nextPosition = {}) {
    targetPosition = normalizedFrameToastPosition(nextPosition);
    item.dataset.frameToastX = String(targetPosition.x);
    item.dataset.frameToastY = String(targetPosition.y);
    item.dataset.frameToastBottomRight = targetPosition.x >= 67 && targetPosition.y >= 67 ? "true" : "false";
    scheduleLayout();
  }

  function remove() {
    clearTimers();
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    observer?.disconnect?.();
    observer = null;
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    liveFrameToastPositionSetters.delete(setPosition);
    liveFrameToastConnectivityChecks.delete(checkConnectivity);
    syncFrameToastConnectivityObserver();
    item.remove();
  }

  function checkConnectivity() {
    if (!frameWrap.isConnected || !iframe.isConnected || !item.isConnected) remove();
  }

  function update(nextMessage, nextKind = "info") {
    clearTimers();
    if (!frameWrap.isConnected || !iframe.isConnected || !item.isConnected) {
      remove();
      return;
    }
    item.textContent = String(nextMessage || "");
    item.classList.remove("toast-info", "toast-success", "toast-error");
    item.classList.add(`toast-${nextKind}`);
    item.setAttribute("role", nextKind === "error" ? "alert" : "status");
    item.setAttribute("aria-live", nextKind === "error" ? "assertive" : "polite");
    item.classList.add("show");
    scheduleLayout();
  }

  function dismiss(delayMs = 0) {
    if (!item.isConnected) {
      remove();
      return;
    }
    if (dismissTimer) clearTimeout(dismissTimer);
    if (removeTimer) clearTimeout(removeTimer);
    dismissTimer = setTimeout(() => {
      dismissTimer = 0;
      item.classList.remove("show");
      removeTimer = setTimeout(remove, 240);
    }, Math.max(0, Number(delayMs) || 0));
  }

  iframe.insertAdjacentElement("afterend", item);
  liveFrameToastPositionSetters.add(setPosition);
  liveFrameToastConnectivityChecks.add(checkConnectivity);
  syncFrameToastConnectivityObserver();
  layout();
  showTimer = setTimeout(() => {
    showTimer = 0;
    if (item.isConnected) {
      item.classList.add("show");
      scheduleLayout();
    }
  }, 20);

  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(() => {
      if (!iframe.isConnected || !item.isConnected) remove();
      else scheduleLayout();
    });
    observer.observe(frameWrap, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(frameWrap);
    resizeObserver.observe(item);
  }

  return Object.freeze({ update, dismiss, remove, setPosition });
}

const MODAL_TYPE_CONFIG = Object.freeze({
  viewer: Object.freeze({ dismissOnBackdrop: true }),
  editor: Object.freeze({ dismissOnBackdrop: false }),
  task: Object.freeze({ dismissOnBackdrop: false }),
  confirmation: Object.freeze({ dismissOnBackdrop: false })
});

export function modal(title, content, onClose, wide = false, closeLabel = "Close", options = {}) {
  const modalType = Object.hasOwn(MODAL_TYPE_CONFIG, options.type) ? options.type : "legacy";
  const dismissOnBackdrop = typeof options.dismissOnBackdrop === "boolean"
    ? options.dismissOnBackdrop
    : modalType === "legacy" || MODAL_TYPE_CONFIG[modalType].dismissOnBackdrop;
  const backdrop = el("div", { class: "modal-backdrop", dataset: { modalType }, onclick: (event) => {
    if (dismissOnBackdrop && event.target === backdrop) onClose();
  }});
  const panel = el("section", { class: `modal ${wide ? "modal-wide" : ""}` },
    el("header", { class: "modal-header" },
      el("h2", {}, title),
      iconButton(closeLabel, "×", onClose, "", closeLabel, "", "settings.modal.close")
    ),
    el("div", { class: "modal-body" }, content)
  );
  backdrop.append(panel);
  document.body.append(backdrop);
  return backdrop;
}

function typedModal(type, title, content, onClose, wide = false, closeLabel = "Close") {
  return modal(title, content, onClose, wide, closeLabel, { type });
}

export function viewerModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("viewer", title, content, onClose, wide, closeLabel);
}

export function editorModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("editor", title, content, onClose, wide, closeLabel);
}

export function taskModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("task", title, content, onClose, wide, closeLabel);
}

export function confirmationModal(title, content, onClose, wide = false, closeLabel = "Close") {
  return typedModal("confirmation", title, content, onClose, wide, closeLabel);
}

export function isDismissalEscape(event) {
  return event?.key === "Escape" && !event.isComposing && event.keyCode !== 229;
}

export function claimTopmostPopoverEscape(event, ownerSelector) {
  if (!isDismissalEscape(event)) return false;
  const popovers = document.querySelectorAll(".popover-menu");
  const topmost = popovers[popovers.length - 1];
  if (!topmost?.matches?.(ownerSelector)) return false;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  return true;
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
