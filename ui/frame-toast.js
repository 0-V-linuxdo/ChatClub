import { FRAME_TOAST_POSITION_EVENT } from "../shared/protocol.js";
import { el } from "./dom.js";

export { FRAME_TOAST_POSITION_EVENT };

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
      remove() {}
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

  return Object.freeze({ update, dismiss, remove });
}
