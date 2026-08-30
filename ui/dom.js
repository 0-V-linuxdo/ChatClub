import { createSvgIcon } from "./icons.js";

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
  if (!host) {
    host = el("div", { class: "toast-host" });
    document.body.append(host);
  }
  host.removeAttribute?.("aria-live");
  ensureToastLive(host, "info");
  ensureToastLive(host, "error");
  return host;
}

function ensureToastLive(host, kind) {
  const isError = kind === "error";
  const selector = isError ? ".toast-live-assertive" : ".toast-live-polite";
  let live = host.querySelector?.(selector);
  if (live) return live;
  live = el("div", {
    class: isError ? "toast-live toast-live-assertive" : "toast-live toast-live-polite",
    role: isError ? "alert" : "status",
    "aria-live": isError ? "assertive" : "polite",
    "aria-atomic": "true"
  });
  host.append(live);
  return live;
}

function announceToast(message, kind) {
  const live = ensureToastLive(ensureToastHost(), kind);
  const text = String(message ?? "");
  live.textContent = "";
  const write = () => {
    live.textContent = text;
  };
  if (typeof queueMicrotask === "function") queueMicrotask(write);
  else write();
}

const TOAST_STAY_MS = Object.freeze({ short: 1600, default: 3200, long: 32000 });
let currentToastStay = "default";

export function setToastStay(value) {
  currentToastStay = value === "short" || value === "long" ? value : "default";
  return currentToastStay;
}

export function toastDurationMs(kind = "info") {
  const base = TOAST_STAY_MS[currentToastStay] || TOAST_STAY_MS.default;
  return kind === "error" ? base * 2 : base;
}

export function toast(message, kind = "info", options = {}) {
  const actionLabel = String(options?.actionLabel || "").trim();
  const onAction = typeof options?.onAction === "function" ? options.onAction : null;
  const actionable = Boolean(actionLabel && onAction);
  const host = ensureToastHost();
  announceToast(message, kind);
  const actionButton = actionable
    ? el("button", { class: "toast-action", type: "button" }, actionLabel)
    : null;
  const item = el(
    "div",
    { class: `toast toast-${kind}${actionable ? " toast-actionable" : ""}` },
    actionable ? el("span", { class: "toast-message" }, message) : message,
    actionButton
  );
  host.append(item);
  const duration = toastDurationMs(kind === "error" || actionable ? "error" : kind);
  let hideTimer = 0;
  let acted = false;
  const hide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
    item.classList.remove("show");
    setTimeout(() => item.remove(), 240);
  };
  const scheduleHide = (delay) => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      hide();
    }, delay);
  };
  item.addEventListener("mouseenter", () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
  });
  item.addEventListener("mouseleave", () => scheduleHide(duration));
  if (actionButton) {
    actionButton.addEventListener("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (acted) return;
      acted = true;
      hide();
      try { onAction(); } catch (error) {
        const reason = String(error?.message || error || "").trim();
        if (reason) {
          try { toast(reason, "error"); } catch { /* page may already be unloading */ }
        }
      }
    });
  }
  setTimeout(() => item.classList.add("show"), 20);
  scheduleHide(duration);
}

const MODAL_TYPE_CONFIG = Object.freeze({
  viewer: Object.freeze({ dismissOnBackdrop: true }),
  editor: Object.freeze({ dismissOnBackdrop: false }),
  task: Object.freeze({ dismissOnBackdrop: false }),
  confirmation: Object.freeze({ dismissOnBackdrop: false })
});

const CONFIRMATION_TONES = Object.freeze(["danger", "warning", "neutral"]);

function confirmationTone(value) {
  return CONFIRMATION_TONES.includes(value) ? value : "danger";
}

function confirmationIcon(tone) {
  if (tone === "neutral" || typeof document.createElementNS !== "function") return null;
  return createSvgIcon("alert");
}

function stampClass(node, className, on) {
  if (!node) return;
  const current = String(node.className || "").split(/\s+/).filter(Boolean);
  const next = on
    ? current.includes(className) ? current : [...current, className]
    : current.filter((name) => name !== className);
  node.className = next.join(" ");
}

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

function setNodeInert(node, value) {
  if (!node) return;
  try { node.inert = Boolean(value); } catch {}
  if (value) {
    node.setAttribute?.("inert", "");
    return;
  }
  if (typeof node.removeAttribute === "function") node.removeAttribute("inert");
  else node.attributes?.delete?.("inert");
}

function isModalInertExempt(node, liveBackdrop) {
  if (!node || node === liveBackdrop) return true;
  const className = String(node.className || "");
  if (/\btoast-host\b/.test(className) || /\bglobal-tooltip\b/.test(className)) return true;
  return node.id === "chatclub-global-tooltip" || node.getAttribute?.("id") === "chatclub-global-tooltip";
}

function syncModalBackgroundInert() {
  const body = document.body;
  const children = body?.children;
  if (!children) return;
  const liveBackdrop = openModals[openModals.length - 1]?.backdrop;
  const active = openModals.length > 0;
  for (const child of children) {
    setNodeInert(child, active && !isModalInertExempt(child, liveBackdrop));
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
  syncModalBackgroundInert();
  const removeBackdrop = typeof backdrop.remove === "function" ? backdrop.remove.bind(backdrop) : () => {};
  backdrop.remove = (...args) => {
    const index = openModals.indexOf(record);
    if (index >= 0) openModals.splice(index, 1);
    try {
      if (!openModals.length) document.removeEventListener?.("keydown", trapOpenModalKeydown, true);
      syncModalScrollLock();
    } catch {
      /* page may already be unloading */
    }
    removeBackdrop(...args);
    try {
      syncModalBackgroundInert();
      const next = openModals[openModals.length - 1];
      const active = document.activeElement;
      const activeGone = !active || active === document.body || (typeof document.body?.contains === "function" && !document.body.contains(active));
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
  const description = body.querySelector("[data-overlay-description]")
    || body.querySelector(".overlay-confirmation")
    || body.querySelector("p");
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
  const tone = modalType === "confirmation" ? confirmationTone(options.tone) : "";
  const titleId = `overlay-modal-title-${++modalTitleSeq}`;
  const backdrop = el("div", { class: "modal-backdrop", dataset: { modalType }, onclick: (event) => {
    if (dismissOnBackdrop && event.target === backdrop) onClose();
  }});
  const body = el("div", { class: "modal-body" }, content);
  const panel = el("section", {
    class: `modal overlay-surface ${wide ? "modal-wide" : ""} ${modalType === "confirmation" ? "modal-alertdialog" : ""}`.trim(),
    role: modalType === "confirmation" && tone !== "neutral" ? "alertdialog" : "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId,
    tabindex: "-1",
    dataset: tone ? { overlayTone: tone } : undefined
  },
    el("header", { class: "modal-header" },
      el("h2", { id: titleId },
        modalType === "confirmation"
          ? confirmationIcon(tone)
          : null,
        title
      ),
      iconButton(closeLabel, "×", onClose, "overlay-window-button", closeLabel, "", "settings.modal.close")
    ),
    body
  );
  if (tone) {
    panel.setAttribute("data-overlay-tone", tone);
    panel.className = `${panel.className} modal-tone-${tone}`.trim();
  }
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

export function confirmationModal(title, content, onClose, wide = false, closeLabel = "Close", options = {}) {
  return modal(title, content, onClose, wide, closeLabel, { type: "confirmation", tone: options.tone });
}

export function openConfirmationAction({
  title,
  body,
  confirmLabel,
  cancelLabel,
  closeLabel,
  variant = "danger",
  tone = "danger",
  className = "",
  acknowledge = "",
  busyLabel = "",
  onConfirm
} = {}) {
  let dialog;
  let applying = false;
  const close = (force = false) => {
    if (applying && force !== true) return;
    dialog?.remove?.();
  };
  const acknowledgeLabel = String(acknowledge || "").trim();
  const acknowledgeInput = acknowledgeLabel ? el("input", { type: "checkbox" }) : null;
  const cancelButton = button(cancelLabel, () => close());
  const confirmButton = button(confirmLabel, apply, variant);
  if (acknowledgeInput) {
    confirmButton.disabled = true;
    acknowledgeInput.addEventListener("change", () => {
      if (!applying) confirmButton.disabled = !acknowledgeInput.checked;
    });
  }
  const setApplying = (value) => {
    applying = value;
    cancelButton.disabled = value;
    confirmButton.disabled = value || Boolean(acknowledgeInput && !acknowledgeInput.checked);
    if (acknowledgeInput) acknowledgeInput.disabled = value;
    const header = dialog?.querySelector?.(".modal-header");
    header?.querySelector?.(".icon-button")?.toggleAttribute?.("disabled", value);
    const panel = dialog?.querySelector?.(".modal");
    panel?.setAttribute?.("aria-busy", String(value));
    stampClass(confirmButton, "is-applying", value);
    if (busyLabel) confirmButton.textContent = value ? busyLabel : confirmLabel;
  };
  async function apply() {
    if (applying || (acknowledgeInput && !acknowledgeInput.checked)) return;
    setApplying(true);
    try {
      await onConfirm?.();
    } catch (error) {
      setApplying(false);
      const reason = String(error?.message || error || "").trim();
      if (reason) {
        try { toast(reason, "error"); } catch { /* page may already be unloading */ }
      }
      return;
    }
    try {
      close(true);
    } catch {
      /* caller may have already navigated away */
    }
  }
  const bodyNode = typeof body === "string" || body == null ? el("p", {}, body || "") : body;
  dialog = confirmationModal(
    title,
    el("div", { class: `overlay-confirmation ${className || ""}`.trim(), "data-overlay-description": true },
      bodyNode,
      acknowledgeInput
        ? el("label", { class: "overlay-confirm-ack" },
          el("span", { class: "overlay-confirm-ack-box" }, acknowledgeInput),
          el("span", {}, acknowledgeLabel)
        )
        : null,
      el("div", { class: "modal-footer" }, cancelButton, confirmButton)
    ),
    close,
    false,
    closeLabel,
    { tone }
  );
  return dialog;
}

export function bindLinearMenuKeyboard(menu, options = {}) {
  if (!menu?.addEventListener) return menu;
  const items = () => [...(menu.querySelectorAll?.('[role="menuitem"]') || [])]
    .filter((node) => node.getAttribute?.("disabled") == null && node.getAttribute?.("aria-disabled") !== "true");
  const setCurrent = (index, { focus = true } = {}) => {
    const nodes = items();
    if (!nodes.length) return;
    const next = ((index % nodes.length) + nodes.length) % nodes.length;
    nodes.forEach((node, i) => {
      node.tabIndex = i === next ? 0 : -1;
    });
    if (focus) {
      try { nodes[next].focus?.(); } catch {}
    }
  };
  setCurrent(0);
  menu.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Tab" && typeof options.dismiss === "function") {
      event.preventDefault();
      event.stopPropagation();
      const trigger = options.trigger;
      options.dismiss();
      focusAdjacentTabStop(trigger, event.shiftKey ? -1 : 1);
      return;
    }
    const nodes = items();
    if (!nodes.length) return;
    const active = event.target;
    const current = nodes.findIndex((node) => node === active || node.contains?.(active));
    const index = current < 0 ? 0 : current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      setCurrent(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      setCurrent(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setCurrent(0);
    } else if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      setCurrent(nodes.length - 1);
    }
  });
  return menu;
}

function focusAdjacentTabStop(from, direction) {
  if (!from || typeof document.querySelectorAll !== "function") return;
  let nodes = [];
  try {
    nodes = [...document.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
      .filter((node) => node.getAttribute?.("disabled") == null
        && node.getAttribute?.("aria-hidden") !== "true"
        && !node.inert
        && node.getAttribute?.("inert") == null);
  } catch {
    return;
  }
  if (!nodes.length) return;
  const index = nodes.indexOf(from);
  const start = index >= 0 ? index : 0;
  const next = nodes[(start + direction + nodes.length) % nodes.length];
  try { next?.focus?.(); } catch {}
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
