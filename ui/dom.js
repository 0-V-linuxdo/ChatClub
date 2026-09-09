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
let overlaySearchCaret = null;
let overlaySearchCaretListening = false;
let overlayCaretFramePointerAt = 0;
let overlayCaretLeaseHandler = null;
let overlayCaretPinFollow = 0;
let composerCaretIntent = false;
let composerCaretClaimOptions = null;
let overlayCaretLoadPinUntil = 0;
let overlayCaretFrameBlurPins = [];
let overlayCaretReacquiring = false;
const OVERLAY_CARET_FRAME_POINTER_MS = 1000;
const OVERLAY_CARET_PIN_FOLLOW_MAX = 3;
const OVERLAY_CARET_LOAD_PIN_MS = 2500;
const OVERLAY_CARET_FRAME_BLUR_WINDOW_MS = 1000;
const OVERLAY_CARET_FRAME_BLUR_MAX = 8;
const PAGE_CARET_MESSAGE_SOURCE = "chatclub-page-caret";

function overlaySearchCaretPanel(field) {
  return field?.closest?.(".modal") || openModals[openModals.length - 1]?.panel || null;
}

function overlaySearchCaretInsidePanel(active, field, panel) {
  return Boolean(panel && active && active !== field && active !== panel && panel.contains?.(active));
}

function overlayCaretIsFrame(node) {
  return Boolean(node?.classList?.contains?.("chat-frame") || node?.nodeName === "IFRAME");
}

function overlayCaretIsFrameWrap(node) {
  return Boolean(node?.classList?.contains?.("chat-frame-wrap"));
}

function overlayCaretFrameFromTarget(node) {
  if (!node) return null;
  if (overlayCaretIsFrame(node)) return node;
  try {
    if (node.closest?.(".preferred-model-selection-overlay") || node.closest?.(".frame-toast")) return null;
  } catch {}
  const wrap = overlayCaretIsFrameWrap(node) ? node : node.closest?.(".chat-frame-wrap");
  if (!wrap) return null;
  try {
    return wrap.querySelector?.("iframe.chat-frame.active")
      || wrap.querySelector?.("iframe.chat-frame")
      || wrap.querySelector?.(".chat-frame");
  } catch {
    return null;
  }
}

function overlayCaretFrameIsLoading(frame) {
  return frame?.dataset?.frameLoadPending === "1"
    || Boolean(frame?.closest?.(".chat-card")?.classList?.contains?.("frame-loading"));
}

function setOverlayCaretFrameInert(frame, value) {
  if (!frame) return;
  const inert = Boolean(value);
  try { frame.inert = inert; } catch {}
  if (inert) {
    frame.setAttribute?.("inert", "");
    return;
  }
  if (typeof frame.removeAttribute === "function") frame.removeAttribute("inert");
}

function overlayCaretExemptComposerIsland(node) {
  if (!node) return true;
  try {
    if (node.id === "composer-center-host" || node.getAttribute?.("id") === "composer-center-host") return true;
    if (
      node.classList?.contains?.("app-shell")
      || node.classList?.contains?.("prompt-shell")
      || node.classList?.contains?.("topbar")
    ) return true;
  } catch {}
  return false;
}

export function syncComposerWorkspaceIslandInert() {
  const modalOpen = Boolean(typeof document.querySelector === "function" && document.querySelector(".modal"));
  const islandInert = Boolean(overlaySearchCaretComposer() && !modalOpen);
  let nodes = [];
  try { nodes = [...(document.querySelectorAll?.(".main-grid, .chat-card") || [])]; } catch {}
  for (const node of nodes) {
    if (overlayCaretExemptComposerIsland(node)) continue;
    setOverlayCaretFrameInert(node, islandInert);
  }
}

function syncOverlayCaretFrameInert() {
  const modalOpen = Boolean(typeof document.querySelector === "function" && document.querySelector(".modal"));
  const pageClaimed = overlaySearchCaret?.mode === "page";
  const composerClaimed = overlaySearchCaretComposer();
  let frames = [];
  try { frames = [...(document.querySelectorAll?.("iframe.chat-frame") || [])]; } catch {}
  for (const frame of frames) {
    if (!modalOpen && !pageClaimed && !composerClaimed && overlayCaretFrameIsLoading(frame)) continue;
    setOverlayCaretFrameInert(frame, modalOpen || pageClaimed || composerClaimed);
  }
  syncComposerWorkspaceIslandInert();
}


function overlayCaretRecentFramePointer() {
  return Boolean(overlayCaretFramePointerAt && Date.now() - overlayCaretFramePointerAt < OVERLAY_CARET_FRAME_POINTER_MS);
}

function overlaySearchCaretPageStolen(active) {
  if (!active) return true;
  if (active === document.body || active === document.documentElement) return true;
  if (overlayCaretIsFrame(active)) return !overlayCaretRecentFramePointer();
  return false;
}

function overlaySearchCaretStolen(active, field, panel, owner) {
  if (active === field) return false;
  if (typeof owner?.stolen === "function") return owner.stolen(active, field);
  if (owner?.mode === "page") return overlaySearchCaretPageStolen(active);
  if (overlaySearchCaretInsidePanel(active, field, panel)) return false;
  return true;
}

function overlaySearchCaretShouldLeave(active, field, panel, owner) {
  if (!active || active === field) return false;
  if (typeof owner?.shouldLeave === "function") return owner.shouldLeave(active, field);
  if (overlaySearchCaretInsidePanel(active, field, panel)) return true;
  if (typeof owner?.stolen === "function" || owner?.mode === "page") {
    return !overlaySearchCaretStolen(active, field, panel, owner);
  }
  return false;
}

function composerLoadPinOpen() {
  if (!overlaySearchCaretComposer()) return false;
  if (overlayCaretLoadPinUntil && Date.now() < overlayCaretLoadPinUntil) return true;
  try {
    for (const frame of document.querySelectorAll?.("iframe.chat-frame") || []) {
      if (overlayCaretFrameIsLoading(frame)) return true;
    }
  } catch {}
  return false;
}

export function armComposerLoadPin(durationMs = OVERLAY_CARET_LOAD_PIN_MS) {
  if (!overlaySearchCaretComposer()) return false;
  const duration = Number(durationMs);
  const ms = Number.isFinite(duration) && duration > 0 ? duration : OVERLAY_CARET_LOAD_PIN_MS;
  overlayCaretLoadPinUntil = Math.max(overlayCaretLoadPinUntil, Date.now() + ms);
  return true;
}

function cancelOverlayCaretPinFollow() {
  if (!overlayCaretPinFollow) return;
  try {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(overlayCaretPinFollow);
  } catch {}
  overlayCaretPinFollow = 0;
}

function scheduleOverlayCaretPinFollow(remaining) {
  if (remaining <= 0 && !composerLoadPinOpen()) return;
  const schedule = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (typeof setTimeout === "function" ? (callback) => setTimeout(callback, 0) : null);
  if (typeof schedule !== "function") return;
  overlayCaretPinFollow = schedule(() => {
    overlayCaretPinFollow = 0;
    if (!overlaySearchCaret && !composerCaretIntent) return;
    pinOverlaySearchCaret(composerLoadPinOpen() ? OVERLAY_CARET_PIN_FOLLOW_MAX : remaining);
  });
}

function notifyOverlayCaretLease(kind, iframe) {
  const handler = overlayCaretLeaseHandler;
  if (!handler) return;
  try {
    if (kind === "adopt") handler.adopt?.(iframe);
    else handler.release?.();
  } catch {
    /* lease RPC is best-effort against a still-loading frame */
  }
}

function rememberComposerCaretOptions(owner) {
  if (!owner?.composer) return;
  composerCaretClaimOptions = {
    getSelection: owner.getSelection,
    composing: owner.composing,
    onLeave: owner.onLeave,
    stolen: owner.stolen,
    shouldLeave: owner.shouldLeave
  };
}

function bindComposerCaretOwner() {
  if (overlaySearchCaret) {
    const field = overlaySearchCaret.field;
    if (field?.isConnected) return overlaySearchCaret;
    if (!(overlaySearchCaret.composer || composerCaretIntent)) return overlaySearchCaret;
    composerCaretIntent = true;
    let next = null;
    try { next = document.querySelector?.(".prompt-input"); } catch {}
    if (next?.isConnected && next !== field) {
      overlaySearchCaret.field = next;
      try { overlaySearchCaret.panel = next.closest?.(".prompt-shell") || overlaySearchCaret.panel; } catch {}
    }
    return overlaySearchCaret;
  }
  if (!composerCaretIntent) return null;
  let field = null;
  try { field = document.querySelector?.(".prompt-input"); } catch {}
  if (!field?.isConnected) return null;
  overlaySearchCaret = {
    field,
    panel: field.closest?.(".prompt-shell") || null,
    mode: "overlay",
    composer: true,
    getSelection: composerCaretClaimOptions?.getSelection || null,
    composing: composerCaretClaimOptions?.composing || null,
    onLeave: composerCaretClaimOptions?.onLeave || null,
    stolen: composerCaretClaimOptions?.stolen || null,
    shouldLeave: composerCaretClaimOptions?.shouldLeave || null
  };
  ensureOverlaySearchCaretListeners();
  return overlaySearchCaret;
}

function clearOverlaySearchCaret(invokeLeave = true) {
  cancelOverlayCaretPinFollow();
  const owner = overlaySearchCaret;
  if (!owner && !composerCaretIntent) return;
  const wasLease = owner?.mode === "page" || owner?.composer === true || composerCaretIntent;
  if (invokeLeave) {
    overlaySearchCaret = null;
    composerCaretClaimOptions = null;
    overlayCaretLoadPinUntil = 0;
    try { owner?.onLeave?.(); } catch {}
    composerCaretIntent = false;
    if (wasLease) notifyOverlayCaretLease("release");
  } else if (owner?.composer || composerCaretIntent) {
    composerCaretIntent = true;
    if (owner?.composer) rememberComposerCaretOptions(owner);
    else overlaySearchCaret = null;
  } else {
    overlaySearchCaret = null;
    composerCaretIntent = false;
  }
  syncOverlayCaretFrameInert();
}

function restoreOverlaySearchCaretSelection(field, owner) {
  try {
    const selection = owner.getSelection?.() || {};
    const start = Number(selection.start);
    const end = Number(selection.end);
    field.setSelectionRange(
      Number.isFinite(start) ? start : field.value.length,
      Number.isFinite(end) ? end : field.value.length
    );
  } catch {
    /* selection restoration is best-effort after a stolen caret */
  }
}

function overlayCaretDocumentHasFocus() {
  return typeof document.hasFocus !== "function" || document.hasFocus();
}

// A site-isolated child frame can own the browser's focused frame while this document still reports
// the field as activeElement and hasFocus() stays true; `:focus` stops matching in that phantom hold,
// field.focus() is then a no-op, and only window.focus() moves the focused frame back.
function overlayCaretFieldHasFrameFocus(field) {
  if (typeof field?.matches !== "function") return true;
  try { return field.matches(":focus"); } catch { return true; }
}

function overlayCaretPinHolds(field) {
  if (document.activeElement !== field) return false;
  return overlayCaretDocumentHasFocus() && overlayCaretFieldHasFrameFocus(field);
}

export function overlaySearchCaretMode() {
  return overlaySearchCaret?.mode || "";
}

export function overlaySearchCaretComposer() {
  return overlaySearchCaret?.composer === true || composerCaretIntent;
}

export function setOverlayCaretLeaseHandler(handler) {
  overlayCaretLeaseHandler = handler && typeof handler === "object" ? handler : null;
}

export function pinOverlaySearchCaret(followRemaining = OVERLAY_CARET_PIN_FOLLOW_MAX) {
  // window.focus() re-dispatches `focus` on the field before Chromium finishes moving the focused
  // frame back; a field focus handler that re-claims must not recurse into another window.focus().
  if (overlayCaretReacquiring) return true;
  const owner = bindComposerCaretOwner() || overlaySearchCaret;
  if (!owner) return false;
  let field = owner.field;
  if (!field?.isConnected) {
    if (owner.composer || composerCaretIntent) {
      composerCaretIntent = true;
      return false;
    }
    clearOverlaySearchCaret(false);
    return false;
  }
  const modal = typeof document.querySelector === "function" ? document.querySelector(".modal") : null;
  if (modal && field.closest?.(".modal") !== modal && !modal.contains?.(field)) {
    clearOverlaySearchCaret(true);
    return false;
  }
  const active = document.activeElement;
  if (overlayCaretPinHolds(field)) return true;
  if (owner.composing?.()) return false;
  const panel = owner.panel || overlaySearchCaretPanel(field);
  if (overlaySearchCaretShouldLeave(active, field, panel, owner)) {
    clearOverlaySearchCaret(true);
    return false;
  }
  if (active !== field && !overlaySearchCaretStolen(active, field, panel, owner)) return false;
  overlayCaretReacquiring = true;
  try { window.focus?.(); } catch {} finally { overlayCaretReacquiring = false; }
  try {
    for (const frame of document.querySelectorAll("iframe.chat-frame")) {
      try { frame.blur?.(); } catch {}
    }
  } catch {}
  if (overlayCaretIsFrame(active)) {
    try { active.blur?.(); } catch {}
  }
  try { field.focus({ preventScroll: true }); } catch {
    try { field.focus(); } catch {}
  }
  restoreOverlaySearchCaretSelection(field, owner);
  if (overlayCaretPinHolds(field)) return true;
  const nextFollow = composerLoadPinOpen()
    ? OVERLAY_CARET_PIN_FOLLOW_MAX
    : (Number(followRemaining) > 0 ? Number(followRemaining) - 1 : 0);
  scheduleOverlayCaretPinFollow(nextFollow);
  return false;
}

function onOverlaySearchCaretFocusIn(event) {
  if (!overlaySearchCaret && !composerCaretIntent) return;
  const field = (bindComposerCaretOwner() || overlaySearchCaret)?.field;
  const target = event?.target;
  if (target === field || field?.contains?.(target)) return;
  pinOverlaySearchCaret();
}

function onOverlaySearchCaretFocusOut(event) {
  if (!overlaySearchCaret && !composerCaretIntent) return;
  const field = (bindComposerCaretOwner() || overlaySearchCaret)?.field;
  if (!field) {
    pinOverlaySearchCaret();
    return;
  }
  if (event?.target !== field && !field?.contains?.(event?.target)) return;
  if (!event?.relatedTarget || overlayCaretIsFrame(event.relatedTarget)) pinOverlaySearchCaret();
}

function onOverlayPageCaretStolen(event) {
  const data = event?.data;
  if (!data || data.source !== PAGE_CARET_MESSAGE_SOURCE || data.action !== "stolen") return;
  if (overlaySearchCaretMode() !== "page" && !overlaySearchCaretComposer()) return;
  if (overlaySearchCaretComposer()) armComposerLoadPin();
  pinOverlaySearchCaret();
}

function onOverlayCaretPointerDown(event) {
  if (event?.isTrusted !== true) return;
  const frame = overlayCaretFrameFromTarget(event.target);
  if (!frame) return;
  overlayCaretFramePointerAt = Date.now();
  if (overlaySearchCaretMode() !== "page" && !overlaySearchCaretComposer()) return;
  clearOverlaySearchCaret(true);
  try { frame.focus?.(); } catch {}
}

// The parent window blurs when a child frame becomes the focused frame. hasFocus() false means the
// browser window lost focus (do not fight the OS); true means a chat-frame took the caret, so re-pin
// on the next frame: Chromium is still switching frames inside this event and ignores window.focus().
function onOverlayCaretWindowBlur() {
  if (!overlaySearchCaret && !composerCaretIntent) return;
  if (!overlayCaretDocumentHasFocus()) return;
  if (overlayCaretRecentFramePointer()) return;
  const now = Date.now();
  overlayCaretFrameBlurPins = overlayCaretFrameBlurPins.filter((at) => now - at < OVERLAY_CARET_FRAME_BLUR_WINDOW_MS);
  // A site that refocuses itself on every blur would otherwise ping-pong with the owner each frame.
  if (overlayCaretFrameBlurPins.length >= OVERLAY_CARET_FRAME_BLUR_MAX) return;
  overlayCaretFrameBlurPins.push(now);
  if (overlaySearchCaretComposer()) armComposerLoadPin();
  cancelOverlayCaretPinFollow();
  scheduleOverlayCaretPinFollow(OVERLAY_CARET_PIN_FOLLOW_MAX);
}

function ensureOverlaySearchCaretListeners() {
  if (overlaySearchCaretListening || typeof document.addEventListener !== "function") return;
  overlaySearchCaretListening = true;
  document.addEventListener("focusin", onOverlaySearchCaretFocusIn, true);
  document.addEventListener("focusout", onOverlaySearchCaretFocusOut, true);
  document.addEventListener("pointerdown", onOverlayCaretPointerDown, true);
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("message", onOverlayPageCaretStolen);
    window.addEventListener("blur", onOverlayCaretWindowBlur);
  }
}

export function claimOverlaySearchCaret(field, options = {}) {
  if (!field) return;
  const previous = overlaySearchCaret;
  const previousLease = previous?.mode === "page" || previous?.composer === true || composerCaretIntent;
  cancelOverlayCaretPinFollow();
  overlaySearchCaret = {
    field,
    panel: options.panel || overlaySearchCaretPanel(field),
    mode: options.mode === "page" ? "page" : "overlay",
    composer: options.composer === true,
    getSelection: typeof options.getSelection === "function" ? options.getSelection : null,
    composing: typeof options.composing === "function" ? options.composing : null,
    onLeave: typeof options.onLeave === "function" ? options.onLeave : null,
    stolen: typeof options.stolen === "function" ? options.stolen : null,
    shouldLeave: typeof options.shouldLeave === "function" ? options.shouldLeave : null
  };
  composerCaretIntent = overlaySearchCaret.composer === true;
  if (overlaySearchCaret.composer) rememberComposerCaretOptions(overlaySearchCaret);
  ensureOverlaySearchCaretListeners();
  const nextLease = overlaySearchCaret.mode === "page" || overlaySearchCaret.composer;
  if (nextLease) notifyOverlayCaretLease("adopt");
  else if (previousLease) notifyOverlayCaretLease("release");
  pinOverlaySearchCaret();
  syncOverlayCaretFrameInert();
}

export function releaseOverlaySearchCaret(field) {
  if (field && overlaySearchCaret?.field !== field) return;
  clearOverlaySearchCaret(false);
}

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

function syncChatFrameModalInert(active) {
  const frames = document.querySelectorAll?.("iframe.chat-frame");
  if (!frames?.length) return;
  const pageClaimed = overlaySearchCaretMode() === "page";
  const composerClaimed = overlaySearchCaretComposer();
  for (const frame of frames) {
    if (active) delete frame.dataset?.promptFocusRestoreGeneration;
    if (
      !active
      && !pageClaimed
      && !composerClaimed
      && (
        frame.dataset?.frameLoadPending === "1"
        || frame.closest?.(".chat-card")?.classList?.contains?.("frame-loading")
      )
    ) continue;
    setNodeInert(frame, active || pageClaimed || composerClaimed);
  }
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
  syncChatFrameModalInert(active);
  syncComposerWorkspaceIslandInert();
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
      if (!openModals.length) {
        document.removeEventListener?.("keydown", trapOpenModalKeydown, true);
        clearOverlaySearchCaret(false);
      }
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
