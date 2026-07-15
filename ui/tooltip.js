import { el } from "./dom.js";

const EDGE_GAP = 8;
const POINTER_GAP = 10;
const ARROW_MIN = 12;

let tooltipHost = null;
let tooltipLabel = null;
let activeTrigger = null;
let hoveredTrigger = null;
let focusedTrigger = null;
let installed = false;
let tooltipConnectivityObserver = null;
let keyboardInteraction = false;
let disabledIdsProvider = () => [];

function ensureTooltipHost() {
  if (tooltipHost) return tooltipHost;
  tooltipLabel = el("div", { class: "global-tooltip-label" });
  tooltipHost = el("div", { class: "global-tooltip", role: "tooltip", "aria-hidden": "true" },
    tooltipLabel,
    el("div", { class: "global-tooltip-arrow", "aria-hidden": "true" })
  );
  document.body.append(tooltipHost);
  return tooltipHost;
}

function tooltipText(trigger) {
  return String(trigger?.getAttribute("data-tooltip") || "").trim();
}

function isDisabledTrigger(trigger) {
  return trigger.disabled || trigger.getAttribute("aria-disabled") === "true";
}

function disabledTooltipIds() {
  try {
    return new Set((disabledIdsProvider?.() || []).map((id) => String(id || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function isTooltipSuppressed(trigger) {
  const id = String(trigger?.getAttribute("data-tooltip-id") || "").trim();
  return Boolean(id && disabledTooltipIds().has(id));
}

function isUsableTooltipTrigger(trigger) {
  const clientRects = trigger?.getClientRects?.();
  return Boolean(
    trigger
    && document.documentElement.contains(trigger)
    && (!clientRects || clientRects.length > 0)
    && tooltipText(trigger)
    && !isDisabledTrigger(trigger)
    && !isTooltipSuppressed(trigger)
  );
}

function isHoveredTooltipTrigger(trigger) {
  if (!isUsableTooltipTrigger(trigger)) return false;
  try {
    return trigger.matches(":hover");
  } catch {
    return hoveredTrigger === trigger;
  }
}

function isKeyboardFocusedTooltipTrigger(trigger) {
  if (!isUsableTooltipTrigger(trigger)) return false;
  try {
    return trigger.matches(":focus-visible");
  } catch {
    return keyboardInteraction && document.activeElement === trigger;
  }
}

function cleanupTrackedTriggers() {
  if (!isHoveredTooltipTrigger(hoveredTrigger)) hoveredTrigger = null;
  if (!isKeyboardFocusedTooltipTrigger(focusedTrigger)) focusedTrigger = null;
}

function positionTooltip(trigger) {
  const host = ensureTooltipHost();
  const placement = trigger.getAttribute("data-tooltip-placement") || "center";
  const triggerRect = trigger.getBoundingClientRect();
  host.style.left = "0px";
  host.style.top = "0px";
  const tooltipRect = host.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
  if (placement === "left") left = triggerRect.right - tooltipRect.width;
  if (placement === "right") left = triggerRect.left;
  left = Math.min(Math.max(EDGE_GAP, left), Math.max(EDGE_GAP, viewportWidth - tooltipRect.width - EDGE_GAP));

  let side = "bottom";
  let top = triggerRect.bottom + POINTER_GAP;
  if (top + tooltipRect.height + EDGE_GAP > viewportHeight && triggerRect.top > tooltipRect.height + POINTER_GAP) {
    side = "top";
    top = triggerRect.top - tooltipRect.height - POINTER_GAP;
  }
  top = Math.min(Math.max(EDGE_GAP, top), Math.max(EDGE_GAP, viewportHeight - tooltipRect.height - EDGE_GAP));

  const triggerCenter = triggerRect.left + (triggerRect.width / 2);
  const arrowLeft = Math.min(Math.max(ARROW_MIN, triggerCenter - left), Math.max(ARROW_MIN, tooltipRect.width - ARROW_MIN));
  host.dataset.side = side;
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
  host.style.setProperty("--tooltip-arrow-left", `${Math.round(arrowLeft)}px`);
}

function showTooltip(trigger) {
  const text = tooltipText(trigger);
  if (!isUsableTooltipTrigger(trigger)) {
    if (activeTrigger === trigger) hideTooltip(trigger);
    return false;
  }
  if (activeTrigger !== trigger && activeTrigger?.classList.contains("tooltip-open")) {
    activeTrigger.classList.remove("tooltip-open");
  }
  activeTrigger = trigger;
  const host = ensureTooltipHost();
  tooltipLabel.textContent = text;
  host.classList.toggle("is-wrapping", trigger.getAttribute("data-tooltip-wrap") === "true");
  if (!host.classList.contains("is-visible")) host.classList.add("is-visible");
  if (host.getAttribute("aria-hidden") !== "false") host.setAttribute("aria-hidden", "false");
  if (!trigger.classList.contains("tooltip-open")) trigger.classList.add("tooltip-open");
  requestAnimationFrame(() => {
    if (activeTrigger !== trigger) return;
    if (!isUsableTooltipTrigger(trigger)) {
      reconcileTooltipState();
      return;
    }
    positionTooltip(trigger);
  });
  return true;
}

function hideTooltip(trigger = activeTrigger) {
  if (trigger?.classList.contains("tooltip-open")) trigger.classList.remove("tooltip-open");
  if (trigger && trigger !== activeTrigger) return;
  activeTrigger = null;
  if (!tooltipHost) return;
  if (tooltipHost.classList.contains("is-visible") || tooltipHost.classList.contains("is-wrapping")) {
    tooltipHost.classList.remove("is-visible", "is-wrapping");
  }
  if (tooltipHost.getAttribute("aria-hidden") !== "true") tooltipHost.setAttribute("aria-hidden", "true");
}

function resetTooltipInteractionState() {
  hoveredTrigger = null;
  focusedTrigger = null;
  hideTooltip();
}

function reconcileTooltipState() {
  cleanupTrackedTriggers();
  if (
    isUsableTooltipTrigger(activeTrigger)
    && (activeTrigger === hoveredTrigger || activeTrigger === focusedTrigger)
  ) return true;
  if (focusedTrigger && showTooltip(focusedTrigger)) return true;
  if (hoveredTrigger && showTooltip(hoveredTrigger)) return true;
  hideTooltip();
  return false;
}

function reconcileTooltipMutations(records = []) {
  if (
    records.length
    && records.every((record) => record.target === tooltipHost || tooltipHost?.contains?.(record.target))
  ) return;
  reconcileTooltipState();
}

function closestTrigger(target) {
  return target instanceof Element ? target.closest(".tooltip-trigger[data-tooltip]") : null;
}

function syncTooltipPosition() {
  if (!reconcileTooltipState()) return;
  positionTooltip(activeTrigger);
}

export function notifyTooltipPreferencesChanged() {
  reconcileTooltipState();
}

export function installGlobalTooltips(options = {}) {
  if (typeof options.getDisabledTooltipIds === "function") {
    disabledIdsProvider = options.getDisabledTooltipIds;
  }
  if (installed) return;
  installed = true;
  document.documentElement.classList.add("tooltip-layer-enabled");

  document.addEventListener("chatclub:tooltips-updated", notifyTooltipPreferencesChanged, true);

  document.addEventListener("pointerover", (event) => {
    const trigger = closestTrigger(event.target);
    if (!trigger) {
      hoveredTrigger = null;
      cleanupTrackedTriggers();
      if (!focusedTrigger) hideTooltip();
      return;
    }
    hoveredTrigger = isUsableTooltipTrigger(trigger) ? trigger : null;
    showTooltip(trigger);
  }, true);

  document.addEventListener("pointerdown", () => {
    keyboardInteraction = false;
    resetTooltipInteractionState();
  }, true);

  document.addEventListener("pointerout", (event) => {
    const trigger = closestTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    if (hoveredTrigger === trigger) hoveredTrigger = null;
    if (activeTrigger !== trigger) return;
    cleanupTrackedTriggers();
    if (focusedTrigger === trigger) return;
    if (focusedTrigger && showTooltip(focusedTrigger)) return;
    focusedTrigger = null;
    hideTooltip(trigger);
  }, true);

  document.addEventListener("focusin", (event) => {
    const trigger = closestTrigger(event.target);
    if (!trigger) return;
    focusedTrigger = isKeyboardFocusedTooltipTrigger(trigger) ? trigger : null;
    if (focusedTrigger) showTooltip(trigger);
  }, true);

  document.addEventListener("focusout", (event) => {
    const trigger = closestTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    if (focusedTrigger === trigger) focusedTrigger = null;
    if (activeTrigger !== trigger) return;
    cleanupTrackedTriggers();
    if (hoveredTrigger === trigger) return;
    if (hoveredTrigger && showTooltip(hoveredTrigger)) return;
    hoveredTrigger = null;
    hideTooltip(trigger);
  }, true);

  document.addEventListener("keydown", (event) => {
    keyboardInteraction = true;
    if (event.key === "Escape") resetTooltipInteractionState();
  }, true);

  document.addEventListener("visibilitychange", resetTooltipInteractionState, true);

  window.addEventListener("scroll", syncTooltipPosition, true);
  window.addEventListener("resize", syncTooltipPosition);
  window.addEventListener("blur", resetTooltipInteractionState);
  window.addEventListener("focus", resetTooltipInteractionState);
  window.addEventListener("pagehide", resetTooltipInteractionState);

  if (typeof MutationObserver === "function") {
    tooltipConnectivityObserver = new MutationObserver(reconcileTooltipMutations);
    tooltipConnectivityObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class", "style", "hidden", "inert", "aria-hidden", "disabled", "aria-disabled",
        "data-tooltip", "data-tooltip-id"
      ]
    });
  }
}
