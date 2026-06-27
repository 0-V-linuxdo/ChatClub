import { el } from "./dom.js";

const EDGE_GAP = 8;
const POINTER_GAP = 10;
const ARROW_MIN = 12;

let tooltipHost = null;
let tooltipLabel = null;
let activeTrigger = null;
let installed = false;

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

function positionTooltip(trigger) {
  const host = ensureTooltipHost();
  const placement = trigger.getAttribute("data-tooltip-placement") || "center";
  const triggerRect = trigger.getBoundingClientRect();
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
  if (!text || isDisabledTrigger(trigger)) return;
  activeTrigger?.classList.remove("tooltip-open");
  activeTrigger = trigger;
  const host = ensureTooltipHost();
  tooltipLabel.textContent = text;
  host.classList.add("is-visible");
  host.setAttribute("aria-hidden", "false");
  trigger.classList.add("tooltip-open");
  requestAnimationFrame(() => {
    if (activeTrigger === trigger) positionTooltip(trigger);
  });
}

function hideTooltip(trigger = activeTrigger) {
  if (trigger) trigger.classList.remove("tooltip-open");
  if (trigger && trigger !== activeTrigger) return;
  activeTrigger = null;
  if (!tooltipHost) return;
  tooltipHost.classList.remove("is-visible");
  tooltipHost.setAttribute("aria-hidden", "true");
}

function closestTrigger(target) {
  return target instanceof Element ? target.closest(".tooltip-trigger[data-tooltip]") : null;
}

function syncTooltipPosition() {
  if (!activeTrigger || !document.documentElement.contains(activeTrigger)) {
    hideTooltip();
    return;
  }
  positionTooltip(activeTrigger);
}

export function installGlobalTooltips() {
  if (installed) return;
  installed = true;
  document.documentElement.classList.add("tooltip-layer-enabled");

  document.addEventListener("pointerover", (event) => {
    const trigger = closestTrigger(event.target);
    if (trigger) showTooltip(trigger);
  }, true);

  document.addEventListener("pointerout", (event) => {
    const trigger = closestTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) hideTooltip(trigger);
  }, true);

  document.addEventListener("focusin", (event) => {
    const trigger = closestTrigger(event.target);
    if (trigger) showTooltip(trigger);
  }, true);

  document.addEventListener("focusout", (event) => {
    const trigger = closestTrigger(event.target);
    if (trigger) hideTooltip(trigger);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTooltip();
  }, true);

  window.addEventListener("scroll", syncTooltipPosition, true);
  window.addEventListener("resize", syncTooltipPosition);
}
