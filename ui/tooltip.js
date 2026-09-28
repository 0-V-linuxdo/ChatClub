import { el, isDismissalEscape } from "./dom.js";

const EDGE_GAP = 8;
const POINTER_GAP = 10;
const ARROW_MIN = 12;
// A rich card sits this far from its trigger, and its ::before hover bridge
// spans exactly that gap (--space-2), so the pointer can cross onto the card.
const RICH_GAP = 8;
// Card top edge to the centre of its first text line (--space-3 padding plus
// half a 13px/1.5 line): the arrow points there, so line one sits level with
// the trigger.
const RICH_ARROW_OFFSET = 22;
const GLOBAL_TOOLTIP_ID = "chatclub-global-tooltip";
const TOOLTIP_ID_ALIASES = Object.freeze({
  "pocket.collapseSidebar": "pocket.sidebar",
  "pocket.expandSidebar": "pocket.sidebar",
  "pocket.exitFocusMode": "pocket.focusMode",
  "pocket.fullscreen": "viewer.fullscreen",
  "workspace.tabs.unpin": "workspace.tabs.pin",
  "workspace.tabs.sortTime": "workspace.tabs.sortActivity",
  "workspace.tabs.sortViewed": "workspace.tabs.sortActivity",
  "workspace.tabs.sortEdited": "workspace.tabs.sortActivity"
});

let tooltipHost = null;
let tooltipLabel = null;
let activeTrigger = null;
let hoveredTrigger = null;
let focusedTrigger = null;
let pinnedTrigger = null;
let installed = false;
let tooltipConnectivityObserver = null;
let keyboardInteraction = false;
let disabledIdsProvider = () => [];

function ensureTooltipHost() {
  if (tooltipHost) return tooltipHost;
  tooltipLabel = el("div", { class: "global-tooltip-label" });
  tooltipHost = el("div", {
    class: "global-tooltip",
    id: GLOBAL_TOOLTIP_ID,
    role: "tooltip",
    "aria-hidden": "true"
  },
    tooltipLabel,
    el("div", { class: "global-tooltip-arrow", "aria-hidden": "true" })
  );
  document.body.append(tooltipHost);
  return tooltipHost;
}

function tooltipText(trigger) {
  return String(trigger?.getAttribute("data-tooltip") || "").trim();
}

// `data-tooltip-rich` ("text" | "list") opts an info (i) trigger into the rich
// card: optional `data-tooltip-title`, one paragraph or bullet per \n line,
// hoverable, and pinned by a click. Plain label tooltips are unchanged.
function richTooltipMode(trigger) {
  const mode = trigger?.getAttribute?.("data-tooltip-rich");
  return mode === "list" || mode === "text" ? mode : "";
}

// is-rich stays on the host through the fade-out, so a closing card keeps its
// skin instead of flashing the one-line label; only a visible card is live.
function isRichTooltipLive() {
  return Boolean(tooltipHost?.classList.contains("is-rich") && tooltipHost.classList.contains("is-visible"));
}

function isInsideRichTooltip(target) {
  return Boolean(target instanceof Node && isRichTooltipLive() && tooltipHost.contains(target));
}

function isRichTooltipHovered() {
  if (!isRichTooltipLive()) return false;
  try {
    return tooltipHost.matches(":hover");
  } catch {
    return false;
  }
}

function renderTooltipContent(host, trigger, text) {
  const mode = richTooltipMode(trigger);
  host.classList.toggle("is-rich", Boolean(mode));
  host.classList.toggle("is-warning", Boolean(mode) && trigger.getAttribute("data-tooltip-tone") === "warning");
  if (!mode) {
    tooltipLabel.textContent = text;
    return;
  }
  const title = String(trigger.getAttribute("data-tooltip-title") || "").trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const body = mode === "list"
    ? [el("ul", { class: "global-tooltip-list" }, lines.map((line) => el("li", {}, line)))]
    : lines.map((line) => el("p", { class: "global-tooltip-paragraph" }, line));
  tooltipLabel.replaceChildren(
    ...(title ? [el("strong", { class: "global-tooltip-title" }, title)] : []),
    ...body
  );
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

function canonicalTooltipId(id) {
  return TOOLTIP_ID_ALIASES[id] || id;
}

function isTooltipIdDisabled(id, disabled = disabledTooltipIds()) {
  const normalized = String(id || "").trim();
  return Boolean(normalized && (disabled.has(normalized) || disabled.has(canonicalTooltipId(normalized))));
}

function isTooltipSuppressed(trigger) {
  if (trigger?.classList?.contains("tooltip-suppressed")) return true;
  return isTooltipIdDisabled(trigger?.getAttribute("data-tooltip-id"));
}

function syncSuppressedTooltipTriggers() {
  const disabled = disabledTooltipIds();
  for (const trigger of document.querySelectorAll(".tooltip-trigger[data-tooltip-id]")) {
    trigger.classList.toggle("tooltip-suppressed", isTooltipIdDisabled(trigger.getAttribute("data-tooltip-id"), disabled));
  }
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
  if (!isUsableTooltipTrigger(pinnedTrigger)) pinnedTrigger = null;
}

// A card pinned by a click outlives hover and focus until an outside
// pointerdown, a second click, Escape, or its trigger going away.
function holdPinnedTooltip() {
  if (!isUsableTooltipTrigger(pinnedTrigger)) {
    pinnedTrigger = null;
    return false;
  }
  return activeTrigger === pinnedTrigger || showTooltip(pinnedTrigger);
}

function tokenList(value) {
  return String(value || "").split(/\s+/).filter(Boolean);
}

function syncTooltipDescribedby(trigger, host, text) {
  if (!trigger || !host?.id) return;
  const label = String(trigger.getAttribute("aria-label") || "").trim();
  if (!text || text === label) {
    clearTooltipDescribedby(trigger);
    return;
  }
  const current = tokenList(trigger.getAttribute("aria-describedby"));
  if (!trigger.dataset.tooltipDescribedbyOwned && current.length && !current.includes(host.id)) {
    trigger.dataset.tooltipDescribedbyPrev = current.join(" ");
  }
  trigger.dataset.tooltipDescribedbyOwned = "true";
  if (!current.includes(host.id)) current.push(host.id);
  trigger.setAttribute("aria-describedby", current.join(" "));
}

function clearTooltipDescribedby(trigger) {
  if (!trigger || trigger.dataset.tooltipDescribedbyOwned !== "true") return;
  const hostId = tooltipHost?.id;
  const current = tokenList(trigger.getAttribute("aria-describedby"));
  const prev = tokenList(trigger.dataset.tooltipDescribedbyPrev);
  delete trigger.dataset.tooltipDescribedbyOwned;
  delete trigger.dataset.tooltipDescribedbyPrev;
  const rest = current.filter((id) => id && id !== hostId);
  for (const id of prev) {
    if (id && !rest.includes(id)) rest.unshift(id);
  }
  if (rest.length) trigger.setAttribute("aria-describedby", rest.join(" "));
  else trigger.removeAttribute("aria-describedby");
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

  const rich = host.classList.contains("is-rich");
  // A rich card goes beside its (i) when there is room, so the title it
  // explains and the line under it stay readable instead of being sliced by
  // the card edge and arrow; otherwise it drops below, start-aligned.
  if (rich && triggerRect.right + RICH_GAP + tooltipRect.width + EDGE_GAP <= viewportWidth) {
    const centerY = triggerRect.top + (triggerRect.height / 2);
    const top = Math.min(
      Math.max(EDGE_GAP, centerY - RICH_ARROW_OFFSET),
      Math.max(EDGE_GAP, viewportHeight - tooltipRect.height - EDGE_GAP)
    );
    const arrowTop = Math.min(Math.max(ARROW_MIN, centerY - top), Math.max(ARROW_MIN, tooltipRect.height - ARROW_MIN));
    host.dataset.side = "right";
    host.style.left = `${Math.round(triggerRect.right + RICH_GAP)}px`;
    host.style.top = `${Math.round(top)}px`;
    host.style.setProperty("--tooltip-arrow-top", `${Math.round(arrowTop)}px`);
    return;
  }
  const gap = rich ? RICH_GAP : POINTER_GAP;

  let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
  if (placement === "left") left = triggerRect.right - tooltipRect.width;
  if (placement === "right" || rich) left = triggerRect.left;
  left = Math.min(Math.max(EDGE_GAP, left), Math.max(EDGE_GAP, viewportWidth - tooltipRect.width - EDGE_GAP));

  let side = "bottom";
  let top = triggerRect.bottom + gap;
  if (top + tooltipRect.height + EDGE_GAP > viewportHeight && triggerRect.top > tooltipRect.height + gap) {
    side = "top";
    top = triggerRect.top - tooltipRect.height - gap;
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
  if (activeTrigger !== trigger && activeTrigger) {
    if (activeTrigger.classList.contains("tooltip-open")) activeTrigger.classList.remove("tooltip-open");
    clearTooltipDescribedby(activeTrigger);
  }
  activeTrigger = trigger;
  const host = ensureTooltipHost();
  renderTooltipContent(host, trigger, text);
  host.classList.toggle("is-wrapping", trigger.getAttribute("data-tooltip-wrap") === "true");
  if (!host.classList.contains("is-visible")) host.classList.add("is-visible");
  if (host.getAttribute("aria-hidden") !== "false") host.setAttribute("aria-hidden", "false");
  if (!trigger.classList.contains("tooltip-open")) trigger.classList.add("tooltip-open");
  syncTooltipDescribedby(trigger, host, text);
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
  clearTooltipDescribedby(trigger);
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
  pinnedTrigger = null;
  hideTooltip();
}

function reconcileTooltipState() {
  cleanupTrackedTriggers();
  if (
    isUsableTooltipTrigger(activeTrigger)
    && (activeTrigger === hoveredTrigger || activeTrigger === focusedTrigger || activeTrigger === pinnedTrigger || isRichTooltipHovered())
  ) return true;
  if (focusedTrigger && showTooltip(focusedTrigger)) return true;
  if (hoveredTrigger && showTooltip(hoveredTrigger)) return true;
  if (holdPinnedTooltip()) return true;
  hideTooltip();
  return false;
}

function reconcileTooltipMutations(records = []) {
  if (
    records.length
    && records.every((record) => record.target === tooltipHost || tooltipHost?.contains?.(record.target))
  ) return;
  syncSuppressedTooltipTriggers();
  reconcileTooltipState();
}

function closestTrigger(target) {
  return target instanceof Element ? target.closest(".tooltip-trigger[data-tooltip]") : null;
}

function triggerContainsRelatedTarget(trigger, relatedTarget) {
  return relatedTarget instanceof Node && trigger.contains(relatedTarget);
}

function syncTooltipPosition() {
  if (!reconcileTooltipState()) return;
  positionTooltip(activeTrigger);
}

function notifyTooltipPreferencesChanged() {
  syncSuppressedTooltipTriggers();
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
    if (isInsideRichTooltip(event.target)) return;
    const trigger = closestTrigger(event.target);
    if (!trigger) {
      hoveredTrigger = null;
      cleanupTrackedTriggers();
      if (!focusedTrigger && !holdPinnedTooltip()) hideTooltip();
      return;
    }
    hoveredTrigger = isUsableTooltipTrigger(trigger) ? trigger : null;
    showTooltip(trigger);
  }, true);

  document.addEventListener("pointerdown", (event) => {
    keyboardInteraction = false;
    // Pressing a rich (i) or its card must not wipe the card: the click that
    // follows pins it (touch has no hover), and the card text stays selectable.
    if (isInsideRichTooltip(event.target) || richTooltipMode(closestTrigger(event.target))) return;
    resetTooltipInteractionState();
  }, true);

  document.addEventListener("click", (event) => {
    const trigger = closestTrigger(event.target);
    if (!richTooltipMode(trigger) || !isUsableTooltipTrigger(trigger)) return;
    if (pinnedTrigger === trigger) {
      resetTooltipInteractionState();
      return;
    }
    pinnedTrigger = trigger;
    showTooltip(trigger);
  }, true);

  document.addEventListener("pointerout", (event) => {
    const trigger = closestTrigger(event.target);
    if (!trigger || triggerContainsRelatedTarget(trigger, event.relatedTarget)) return;
    if (hoveredTrigger === trigger) hoveredTrigger = null;
    if (activeTrigger !== trigger) return;
    cleanupTrackedTriggers();
    if (focusedTrigger === trigger) return;
    if (focusedTrigger && showTooltip(focusedTrigger)) return;
    focusedTrigger = null;
    if (isInsideRichTooltip(event.relatedTarget) || holdPinnedTooltip()) return;
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
    if (!trigger || triggerContainsRelatedTarget(trigger, event.relatedTarget)) return;
    if (focusedTrigger === trigger) focusedTrigger = null;
    if (activeTrigger !== trigger) return;
    cleanupTrackedTriggers();
    if (hoveredTrigger === trigger) return;
    if (hoveredTrigger && showTooltip(hoveredTrigger)) return;
    hoveredTrigger = null;
    if (holdPinnedTooltip() || isRichTooltipHovered()) return;
    hideTooltip(trigger);
  }, true);

  document.addEventListener("keydown", (event) => {
    keyboardInteraction = true;
    if (isDismissalEscape(event)) resetTooltipInteractionState();
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
        "data-tooltip", "data-tooltip-id", "data-tooltip-title"
      ]
    });
  }
  syncSuppressedTooltipTriggers();
}
