import {
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS,
  NOTION_EFFORT_TARGETS
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";

const PREFERRED_MODEL_SELECTION_OVERLAY_SAFE_INSET = 12;

function preferredModelBaseTargetLabel(payload = {}) {
  if (payload.modelLabel) return String(payload.modelLabel);
  const target = (MODEL_PREFERENCE_TARGETS[payload.appId] || [])
    .find((item) => item.id === payload.modelId);
  return String(target?.label || payload.modelId || payload.appId || "");
}

function preferredModelThinkingLevelLabel(payload = {}) {
  if (payload.appId !== "Gemini" || payload.modelId !== "pro" || !payload.thinkingLevel) return "";
  const level = GEMINI_THINKING_LEVEL_TARGETS.find((item) => item.id === payload.thinkingLevel);
  if (!level) return "";
  return t(
    level.id === "extended"
      ? "modelPreferences.thinkingExtended"
      : "modelPreferences.thinkingStandard"
  );
}

function preferredModelAllSourcesStateLabel(payload = {}) {
  if (payload.appId !== "NotionAI" || !payload.allSourcesState) return "";
  return t(
    payload.allSourcesState === "enabled"
      ? "modelPreferences.allSourcesEnabled"
      : "modelPreferences.allSourcesDisabled"
  );
}

function preferredModelEffortLabel(payload = {}) {
  if (payload.appId !== "NotionAI" || !payload.effortId) return "";
  return String(NOTION_EFFORT_TARGETS[payload.effortId]?.label || "");
}

export function preferredModelTargetLabel(payload = {}) {
  let label = preferredModelBaseTargetLabel(payload);
  const thinkingLevel = preferredModelThinkingLevelLabel(payload);
  if (thinkingLevel) label += " · " + thinkingLevel;
  const allSourcesState = preferredModelAllSourcesStateLabel(payload);
  if (allSourcesState) {
    const sourceLabel = t("modelPreferences.allSources") + " · " + allSourcesState;
    label = payload.modelId ? label + " · " + sourceLabel : sourceLabel;
  }
  const effort = preferredModelEffortLabel(payload);
  if (effort) label += " · Effort: " + effort;
  return label;
}

function preferredModelSelectionRect(value = {}) {
  const left = Number(value.left) || 0;
  const top = Number(value.top) || 0;
  const width = Math.max(0, Number(value.width) || ((Number(value.right) || 0) - left));
  const height = Math.max(0, Number(value.height) || ((Number(value.bottom) || 0) - top));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

function preferredModelSelectionRectsIntersect(first, second) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function preferredModelSelectionOverlayOffset(
  frameValue,
  indicatorValue,
  toastValue,
  safeInset = PREFERRED_MODEL_SELECTION_OVERLAY_SAFE_INSET
) {
  const frame = preferredModelSelectionRect(frameValue);
  const indicator = preferredModelSelectionRect(indicatorValue);
  const toast = preferredModelSelectionRect(toastValue);
  if (
    frame.width <= 0
    || frame.height <= 0
    || indicator.width <= 0
    || indicator.height <= 0
    || toast.width <= 0
    || toast.height <= 0
  ) return { x: 0, y: 0 };

  const inset = Math.max(0, Number(safeInset) || 0);
  const centerLeft = frame.left + ((frame.width - indicator.width) / 2);
  const centerTop = frame.top + ((frame.height - indicator.height) / 2);
  const centered = {
    left: centerLeft,
    top: centerTop,
    right: centerLeft + indicator.width,
    bottom: centerTop + indicator.height
  };
  if (!preferredModelSelectionRectsIntersect(centered, toast)) return { x: 0, y: 0 };

  const availableWidth = Math.max(0, frame.width - indicator.width);
  const availableHeight = Math.max(0, frame.height - indicator.height);
  const inlineInset = Math.min(inset, availableWidth / 2);
  const blockInset = Math.min(inset, availableHeight / 2);
  const minLeft = frame.left + inlineInset;
  const maxLeft = frame.right - inlineInset - indicator.width;
  const minTop = frame.top + blockInset;
  const maxTop = frame.bottom - blockInset - indicator.height;
  const clampLeft = (value) => Math.max(minLeft, Math.min(maxLeft, value));
  const clampTop = (value) => Math.max(minTop, Math.min(maxTop, value));
  const candidates = [
    { left: centerLeft, top: toast.top - inset - indicator.height },
    { left: centerLeft, top: toast.bottom + inset },
    { left: toast.left - inset - indicator.width, top: centerTop },
    { left: toast.right + inset, top: centerTop }
  ]
    .map((candidate) => {
      const left = clampLeft(candidate.left);
      const top = clampTop(candidate.top);
      return {
        left,
        top,
        right: left + indicator.width,
        bottom: top + indicator.height,
        distance: Math.hypot(left - centerLeft, top - centerTop)
      };
    })
    .filter((candidate) => !preferredModelSelectionRectsIntersect(candidate, toast))
    .sort((first, second) => first.distance - second.distance);
  const closest = candidates[0];
  return closest
    ? { x: closest.left - centerLeft, y: closest.top - centerTop }
    : { x: 0, y: 0 };
}

export function createPreferredModelSelectionOverlayController(dependencies = {}) {
  const {
    state,
    workspace,
    appRoot,
    frameReadiness,
    payloadForFrame
  } = dependencies;
  const focusOwners = new WeakMap();
  const focusGuards = new Map();
  const layouts = new Map();

  function messageForPayload(payload = {}) {
    if (payload.appId === "NotionAI" && payload.allSourcesState) {
      const stateLabel = preferredModelAllSourcesStateLabel(payload);
      return t("chat.preferredModelApplyingAllSources", { state: stateLabel });
    }
    return t("topbar.modelGateApplying");
  }

  function presentationForPayload(payload = {}) {
    if (!payload.modelId) {
      const ariaLabel = messageForPayload(payload);
      return {
        ariaLabel,
        lines: [{ kind: payload.allSourcesState ? "all-sources" : "status", text: ariaLabel }]
      };
    }

    const lines = [
      {
        kind: "status",
        text: t("chat.preferredModelSelectingStatus")
      },
      {
        kind: "model",
        text: t("chat.preferredModelTargetDetail", {
          target: preferredModelBaseTargetLabel(payload)
        })
      }
    ];
    const thinkingLevel = preferredModelThinkingLevelLabel(payload);
    if (thinkingLevel) {
      lines.push({
        kind: "thinking",
        text: t("chat.preferredModelThinkingDetail", { level: thinkingLevel })
      });
    }
    const allSourcesState = preferredModelAllSourcesStateLabel(payload);
    if (allSourcesState) {
      lines.push({
        kind: "all-sources",
        text: t("chat.preferredModelAllSourcesDetail", { state: allSourcesState })
      });
    }
    const effort = preferredModelEffortLabel(payload);
    if (effort) {
      lines.push({
        kind: "effort",
        text: t("chat.preferredModelEffortDetail", { effort })
      });
    }
    const accessibleLines = [
      t("chat.preferredModelSelectingTargetAccessible", {
        target: preferredModelBaseTargetLabel(payload)
      }),
      ...lines.slice(2).map((line) => line.text)
    ];
    return {
      ariaLabel: accessibleLines.join(t("chat.preferredModelAccessibleSeparator")),
      lines
    };
  }

  function syncVisibleLines(textNode, lines) {
    if (!textNode) return;
    const contentKey = JSON.stringify(lines);
    if (textNode.dataset?.preferredModelSelectionContent === contentKey) return;
    const lineNodes = lines.map((line, index) => {
      const node = document.createElement("span");
      const styleClass = line.kind === "status"
        ? "preferred-model-selection-overlay-line-status"
        : line.kind === "model"
          ? "preferred-model-selection-overlay-line-model"
          : index === 0
            ? "preferred-model-selection-overlay-line-primary"
            : "preferred-model-selection-overlay-line-detail";
      node.className = [
        "preferred-model-selection-overlay-line",
        styleClass
      ].join(" ");
      node.dataset.preferredModelSelectionLine = line.kind;
      node.textContent = line.text;
      return node;
    });
    textNode.replaceChildren(...lineNodes);
    textNode.dataset.preferredModelSelectionContent = contentKey;
  }

  function clearOffset(overlay) {
    overlay?.style?.removeProperty?.("--preferred-model-selection-overlay-offset-x");
    overlay?.style?.removeProperty?.("--preferred-model-selection-overlay-offset-y");
  }

  function currentToast(frameWrap, iframe) {
    const instanceId = String(iframe?.dataset?.instanceId || "");
    return Array.from(frameWrap?.querySelectorAll?.(".frame-submit-toast") || [])
      .find((toast) => (
        String(toast?.dataset?.frameInstanceId || "") === instanceId
        && !toast.classList?.contains?.("frame-submit-toast-suppressed")
      )) || null;
  }

  function cancelLayoutFrame(layout) {
    if (!layout?.frame) return;
    const cancel = globalThis.cancelAnimationFrame || globalThis.window?.cancelAnimationFrame;
    if (typeof cancel === "function") cancel.call(globalThis.window || globalThis, layout.frame);
    else clearTimeout(layout.frame);
    layout.frame = 0;
  }

  function focusGuardIsCurrent(guard) {
    return Boolean(
      guard
      && focusGuards.get(guard.overlay) === guard
      && guard.overlay?.hidden === false
      && guard.overlay?.isConnected !== false
      && guard.iframe?.isConnected
      && String(guard.overlay.dataset?.preferredModelSelectionOwner || "") === guard.ownerId
    );
  }

  function scheduleFocusGuard(guard) {
    if (!focusGuardIsCurrent(guard) || guard.scheduled) return;
    guard.scheduled = true;
    const apply = () => {
      guard.scheduled = false;
      if (!focusGuardIsCurrent(guard) || document.activeElement !== guard.iframe) return;
      guard.overlay.focus?.({ preventScroll: true });
    };
    if (typeof queueMicrotask === "function") queueMicrotask(apply);
    else Promise.resolve().then(apply);
  }

  function stopFocusGuard(overlay) {
    const guard = focusGuards.get(overlay);
    if (!guard) return;
    guard.iframe?.removeEventListener?.("focus", guard.capture, true);
    guard.iframe?.removeEventListener?.("focusin", guard.capture, true);
    document.removeEventListener?.("focusin", guard.parentFocusIn, true);
    globalThis.window?.removeEventListener?.("blur", guard.capture, true);
    focusGuards.delete(overlay);
  }

  function ensureFocusGuard(overlay, iframe) {
    const current = focusGuards.get(overlay);
    if (current?.iframe === iframe) return;
    if (current) stopFocusGuard(overlay);
    const guard = {
      overlay,
      iframe,
      ownerId: String(iframe?.dataset?.instanceId || ""),
      scheduled: false,
      capture: null,
      parentFocusIn: null
    };
    guard.capture = () => scheduleFocusGuard(guard);
    guard.parentFocusIn = (event) => {
      const target = event?.target;
      if (target === iframe || target === overlay || overlay.contains?.(target)) return;
      focusOwners.delete(overlay);
    };
    focusGuards.set(overlay, guard);
    iframe?.addEventListener?.("focus", guard.capture, true);
    iframe?.addEventListener?.("focusin", guard.capture, true);
    document.addEventListener?.("focusin", guard.parentFocusIn, true);
    globalThis.window?.addEventListener?.("blur", guard.capture, true);
  }

  function stopLayout(overlay) {
    const layout = layouts.get(overlay);
    if (layout) {
      cancelLayoutFrame(layout);
      layout.toast?.removeEventListener?.("transitionend", layout.toastTransitionEnd);
      layout.toast?.removeEventListener?.("transitioncancel", layout.toastTransitionEnd);
      layout.observer?.disconnect?.();
      layout.resizeObserver?.disconnect?.();
      layouts.delete(overlay);
    }
    stopFocusGuard(overlay);
    clearOffset(overlay);
  }

  function layoutIsCurrent(layout) {
    return Boolean(
      layout
      && layouts.get(layout.overlay) === layout
      && layout.overlay?.hidden === false
      && layout.overlay?.isConnected !== false
      && layout.iframe?.isConnected
      && String(layout.overlay.dataset?.preferredModelSelectionOwner || "") === layout.ownerId
    );
  }

  function layoutOverlay(layout) {
    layout.frame = 0;
    if (!layoutIsCurrent(layout)) {
      stopLayout(layout?.overlay);
      return;
    }
    const { frameWrap, iframe, indicator, overlay } = layout;
    const toast = currentToast(frameWrap, iframe);
    if (toast !== layout.toast) {
      if (layout.toast) {
        layout.resizeObserver?.unobserve?.(layout.toast);
        layout.toast.removeEventListener?.("transitionend", layout.toastTransitionEnd);
        layout.toast.removeEventListener?.("transitioncancel", layout.toastTransitionEnd);
      }
      layout.toast = toast;
      if (toast) {
        layout.resizeObserver?.observe?.(toast);
        toast.addEventListener?.("transitionend", layout.toastTransitionEnd);
        toast.addEventListener?.("transitioncancel", layout.toastTransitionEnd);
      }
    }
    clearOffset(overlay);
    if (!indicator || !toast) return;
    const offset = preferredModelSelectionOverlayOffset(
      frameWrap.getBoundingClientRect?.() || {},
      indicator.getBoundingClientRect?.() || {},
      toast.getBoundingClientRect?.() || {}
    );
    if (offset.x) {
      overlay.style?.setProperty?.("--preferred-model-selection-overlay-offset-x", `${offset.x}px`);
    }
    if (offset.y) {
      overlay.style?.setProperty?.("--preferred-model-selection-overlay-offset-y", `${offset.y}px`);
    }
  }

  function scheduleLayout(layout) {
    if (!layoutIsCurrent(layout) || layout.frame) return;
    const request = globalThis.requestAnimationFrame || globalThis.window?.requestAnimationFrame;
    layout.frame = typeof request === "function"
      ? request.call(globalThis.window || globalThis, () => layoutOverlay(layout))
      : setTimeout(() => layoutOverlay(layout), 0);
  }

  function ensureLayout(overlay, iframe, frameWrap) {
    const ownerId = String(iframe?.dataset?.instanceId || "");
    const current = layouts.get(overlay);
    if (current && current.iframe === iframe && current.frameWrap === frameWrap) {
      scheduleLayout(current);
      return;
    }
    if (current) stopLayout(overlay);
    const layout = {
      overlay,
      iframe,
      frameWrap,
      ownerId,
      indicator: overlay.querySelector?.(".preferred-model-selection-overlay-indicator") || null,
      toast: null,
      frame: 0,
      observer: null,
      resizeObserver: null,
      toastTransitionEnd: null
    };
    layout.toastTransitionEnd = (event) => {
      if (event?.target === layout.toast) scheduleLayout(layout);
    };
    layouts.set(overlay, layout);
    if (typeof MutationObserver === "function") {
      layout.observer = new MutationObserver((records = []) => {
        const externalMutation = records.some((record) => (
          record.type === "childList"
          || (record.target !== overlay && !overlay.contains?.(record.target))
        ));
        if (externalMutation) scheduleLayout(layout);
      });
      layout.observer.observe(frameWrap, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    }
    if (typeof ResizeObserver === "function") {
      layout.resizeObserver = new ResizeObserver(() => scheduleLayout(layout));
      layout.resizeObserver.observe(frameWrap);
      if (layout.indicator) layout.resizeObserver.observe(layout.indicator);
    }
    scheduleLayout(layout);
  }

  function hide(overlay, activeFrames) {
    if (!overlay) return;
    const focusOwner = focusOwners.get(overlay);
    const restoreFocus = Boolean(
      focusOwner
      && document.activeElement === overlay
      && focusOwner.isConnected
      && activeFrames.has(focusOwner)
    );
    stopLayout(overlay);
    focusOwners.delete(overlay);
    overlay.hidden = true;
    overlay.removeAttribute?.("aria-label");
    delete overlay.dataset.preferredModelSelectionOwner;
    const textNode = overlay.querySelector?.(".preferred-model-selection-overlay-text");
    textNode?.replaceChildren?.();
    if (textNode?.dataset) delete textNode.dataset.preferredModelSelectionContent;
    if (restoreFocus) focusOwner.focus?.({ preventScroll: true });
  }

  function show(overlay, iframe, frameWrap, payload) {
    const ownerId = String(iframe?.dataset?.instanceId || "");
    const presentation = presentationForPayload(payload);
    const previousFocusOwner = focusOwners.get(overlay);
    if (previousFocusOwner && previousFocusOwner !== iframe) focusOwners.delete(overlay);
    overlay.dataset.preferredModelSelectionOwner = ownerId;
    overlay.setAttribute?.("aria-label", presentation.ariaLabel);
    const textNode = overlay.querySelector?.(".preferred-model-selection-overlay-text");
    syncVisibleLines(textNode, presentation.lines);
    overlay.hidden = false;
    ensureLayout(overlay, iframe, frameWrap);
    ensureFocusGuard(overlay, iframe);
    if (document.activeElement === iframe) {
      focusOwners.set(overlay, iframe);
      overlay.focus?.({ preventScroll: true });
    }
  }

  function sync() {
    const activeFrames = new Set(workspace.currentFrames().filter(Boolean));
    const claimedOverlays = new Set();
    const visibleFrames = new Set();
    const enabled = state.options?.modelPreferenceSelectionOverlayEnabled === true;
    for (const iframe of activeFrames) {
      const frameWrap = iframe?.closest?.(".chat-frame-wrap");
      const overlay = frameWrap?.querySelector?.(".preferred-model-selection-overlay");
      if (!overlay) continue;
      claimedOverlays.add(overlay);
      const readiness = frameReadiness(iframe);
      if (
        !enabled
        || readiness.state !== "pending"
        || iframe.dataset?.preferredModelNavigationInvalidated === "1"
      ) {
        hide(overlay, activeFrames);
        continue;
      }
      const payload = payloadForFrame(iframe, readiness);
      if (!payload) {
        hide(overlay, activeFrames);
        continue;
      }
      show(overlay, iframe, frameWrap, payload);
      visibleFrames.add(iframe);
    }

    const overlayRoot = typeof appRoot.querySelectorAll === "function" ? appRoot : document;
    for (const overlay of overlayRoot.querySelectorAll?.(".preferred-model-selection-overlay") || []) {
      if (!claimedOverlays.has(overlay)) hide(overlay, activeFrames);
    }
    for (const [overlay] of layouts) {
      if (!claimedOverlays.has(overlay) || overlay?.isConnected === false) stopLayout(overlay);
    }
    for (const [overlay] of focusGuards) {
      if (!claimedOverlays.has(overlay) || overlay?.isConnected === false) stopFocusGuard(overlay);
    }
    return visibleFrames;
  }

  return Object.freeze({ sync });
}
