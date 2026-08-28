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

function append(node, children) {
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

export function field(label, inputNode) {
  return el("label", { class: "field" }, el("span", {}, label), inputNode);
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

export function ensureToastHost() {
  let host = document.querySelector(".toast-host");
  if (host) return host;
  host = el("div", { class: "toast-host" });
  document.body.append(host);
  return host;
}

export function toast(message, kind = "info") {
  const host = ensureToastHost();
  const isError = kind === "error";
  const item = el("div", {
    class: `toast toast-${kind}`,
    role: isError ? "alert" : "status",
    "aria-live": isError ? "assertive" : "polite",
    "aria-atomic": "true"
  }, message);
  host.append(item);
  const duration = isError ? 6400 : 3200;
  let hideTimer = 0;
  const scheduleHide = (delay) => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      item.classList.remove("show");
      setTimeout(() => item.remove(), 240);
    }, delay);
  };
  item.addEventListener("mouseenter", () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
  });
  item.addEventListener("mouseleave", () => scheduleHide(duration));
  setTimeout(() => item.classList.add("show"), 20);
  scheduleHide(duration);
}

const MODAL_TYPE_CONFIG = Object.freeze({
  viewer: Object.freeze({ dismissOnBackdrop: true }),
  editor: Object.freeze({ dismissOnBackdrop: false }),
  task: Object.freeze({ dismissOnBackdrop: false }),
  confirmation: Object.freeze({ dismissOnBackdrop: false })
});

let modalTitleSeq = 0;
let modalDescSeq = 0;
const openModals = [];

function modalFocusables(root) {
  if (!root?.querySelectorAll) return [];
  try {
    return [...root.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
      .filter((node) => node.getAttribute?.("disabled") == null && node.getAttribute?.("aria-hidden") !== "true");
  } catch {
    return [];
  }
}

function syncModalScrollLock() {
  const body = document.body;
  if (!body?.style) return;
  if (openModals.length) {
    if (body.dataset.overlayScrollLock == null) {
      body.dataset.overlayScrollLock = body.style.overflow || "";
      body.style.overflow = "hidden";
    }
  } else if (body.dataset.overlayScrollLock != null) {
    body.style.overflow = body.dataset.overlayScrollLock;
    delete body.dataset.overlayScrollLock;
  }
}

function trapOpenModalKeydown(event) {
  const top = openModals[openModals.length - 1];
  if (!top || event?.key !== "Tab") return;
  const nodes = modalFocusables(top.panel);
  if (!nodes.length) {
    event.preventDefault?.();
    top.panel.focus?.();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  const inside = typeof top.panel.contains === "function" ? top.panel.contains(active) : true;
  if (event.shiftKey && (active === first || !inside)) {
    event.preventDefault?.();
    last.focus?.();
  } else if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault?.();
    first.focus?.();
  }
}

function registerOpenModal(backdrop, panel, focusNode = panel) {
  const restoreFocusTo = document.activeElement;
  const record = { backdrop, panel, restoreFocusTo };
  openModals.push(record);
  if (openModals.length === 1 && typeof document.addEventListener === "function") {
    document.addEventListener("keydown", trapOpenModalKeydown, true);
  }
  syncModalScrollLock();
  const removeBackdrop = typeof backdrop.remove === "function" ? backdrop.remove.bind(backdrop) : () => {};
  backdrop.remove = (...args) => {
    const index = openModals.indexOf(record);
    if (index >= 0) openModals.splice(index, 1);
    if (!openModals.length) document.removeEventListener?.("keydown", trapOpenModalKeydown, true);
    syncModalScrollLock();
    removeBackdrop(...args);
    const next = openModals[openModals.length - 1];
    const active = document.activeElement;
    const activeGone = !active || active === document.body || (typeof document.body?.contains === "function" && !document.body.contains(active));
    try {
      if (next?.panel?.focus && (activeGone || (typeof record.panel.contains === "function" && record.panel.contains(active)))) {
        next.panel.focus();
      } else if (restoreFocusTo?.focus && activeGone) {
        restoreFocusTo.focus();
      }
    } catch {}
  };
  const focusTarget = focusNode || panel;
  const focusPanel = () => {
    try {
      focusTarget.focus?.();
    } catch {}
  };
  if (typeof queueMicrotask === "function") queueMicrotask(focusPanel);
  else focusPanel();
}

function hasClass(node, className) {
  return Boolean(node?.className && String(node.className).split(/\s+/).includes(className));
}

function hoistModalFooter(panel, body) {
  if (!body?.querySelector || !panel?.append) return null;
  const footer = body.querySelector(".modal-footer") || body.querySelector(".settings-dialog-actions");
  if (!footer || footer.parentNode === panel) return footer || null;
  if (!hasClass(footer, "modal-footer")) {
    footer.className = `${footer.className || ""} modal-footer`.trim();
  }
  panel.append(footer);
  return footer;
}

function bindModalDescription(panel, body, modalType) {
  if (modalType !== "confirmation" || !body?.querySelector || !panel?.setAttribute) return;
  const description = body.querySelector("[data-overlay-description]") || body.querySelector("p");
  if (!description) return;
  if (!description.getAttribute?.("id")) description.setAttribute("id", `overlay-modal-desc-${++modalDescSeq}`);
  panel.setAttribute("aria-describedby", description.getAttribute("id"));
}

function confirmationFocusTarget(panel) {
  const footer = panel?.querySelector?.(".modal-footer");
  const nodes = modalFocusables(footer || null);
  const safe = nodes.find((node) => {
    const className = String(node.className || "");
    return !/\bbutton-primary\b/.test(className) && !/\bbutton-danger\b/.test(className);
  });
  return safe || nodes[0] || panel;
}

export function modal(title, content, onClose, wide = false, closeLabel = "Close", options = {}) {
  const modalType = Object.hasOwn(MODAL_TYPE_CONFIG, options.type) ? options.type : "legacy";
  const dismissOnBackdrop = typeof options.dismissOnBackdrop === "boolean"
    ? options.dismissOnBackdrop
    : modalType === "legacy" || MODAL_TYPE_CONFIG[modalType].dismissOnBackdrop;
  const titleId = `overlay-modal-title-${++modalTitleSeq}`;
  const backdrop = el("div", { class: "modal-backdrop", dataset: { modalType }, onclick: (event) => {
    if (dismissOnBackdrop && event.target === backdrop) onClose();
  }});
  const body = el("div", { class: "modal-body" }, content);
  const panel = el("section", {
    class: `modal overlay-surface ${wide ? "modal-wide" : ""} ${modalType === "confirmation" ? "modal-alertdialog" : ""}`.trim(),
    role: modalType === "confirmation" ? "alertdialog" : "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId,
    tabindex: "-1"
  },
    el("header", { class: "modal-header" },
      el("h2", { id: titleId }, title),
      iconButton(closeLabel, "×", onClose, "overlay-window-button", closeLabel, "", "settings.modal.close")
    ),
    body
  );
  hoistModalFooter(panel, body);
  bindModalDescription(panel, body, modalType);
  backdrop.append(panel);
  document.body.append(backdrop);
  registerOpenModal(
    backdrop,
    panel,
    modalType === "confirmation" ? confirmationFocusTarget(panel) : panel
  );
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

export function isChatFrameNode(node) {
  if (!node || node === document) return false;
  if (typeof window !== "undefined" && node === window) return false;
  return Boolean(node.classList?.contains?.("chat-frame") || node.closest?.(".chat-frame, .chat-frame-wrap"));
}

function frameOwnedWindowStillFocused() {
  if (typeof document.hasFocus === "function" && document.hasFocus()) return true;
  return isChatFrameNode(document.activeElement);
}

export function scheduleFrameOwnedBlurDismissal(isOpen, dismiss) {
  const settle = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
  settle(() => {
    if (!isOpen() || frameOwnedWindowStillFocused()) return;
    dismiss();
  });
}
