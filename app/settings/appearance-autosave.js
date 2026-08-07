import { t } from "../../shared/i18n.js";
import { toast } from "../../ui/dom.js";
import { validateControllerContract } from "../controller-contract.js";

export function createAppearanceAutosave(dependencies = {}) {
  const {
    state,
    saveOptionsPatch,
    applyTheme,
    syncI18nLanguage,
    syncTopbar,
    syncWorkspaceDom,
    syncSummaryPanel,
    syncPreferredModelSelectionOverlays
  } = validateControllerContract(dependencies, "Appearance autosave", {
    state: "object",
    saveOptionsPatch: "function",
    applyTheme: "function",
    syncI18nLanguage: "function",
    syncTopbar: "function",
    syncWorkspaceDom: "function",
    syncSummaryPanel: "function",
    syncPreferredModelSelectionOverlays: "function"
  });
  let error = null;
  let running = false;
  let pending = null;
  let pendingOptimisticPatch = null;
  let pendingRedraw = null;
  let pendingRedrawOnError = null;
  let colorTimer = 0;
  let pendingColor = "";
  const overlayKeys = new Set([
    "modelPreferenceSelectionOverlayEnabled",
    "modelPreferenceSelectionOverlayOpacity"
  ]);

  function applyOptimisticPatch(patch = {}) {
    for (const [key, value] of Object.entries(patch)) state.options[key] = value;
  }

  function queue(patch, options = {}) {
    pending = { ...(pending || {}), ...patch };
    if (options.optimistic === true) {
      pendingOptimisticPatch = { ...(pendingOptimisticPatch || {}), ...patch };
      applyOptimisticPatch(patch);
      options.onPreview?.();
    }
    if (typeof options.redraw === "function") pendingRedraw = options.redraw;
    if (typeof options.redrawOnError === "function") pendingRedrawOnError = options.redrawOnError;
    flush();
  }

  async function flush() {
    if (running) return;
    running = true;
    let settleRedraw = null;
    let settleRedrawOnError = null;
    let settleOverlayTouched = false;
    try {
      while (pending) {
        const patch = pending;
        const redraw = pendingRedraw;
        const redrawOnError = pendingRedrawOnError;
        const patchKeys = Object.keys(patch);
        const frameToastPositionOnly = patchKeys.every((key) => key === "frameToastPosition");
        const overlayTouched = patchKeys.some((key) => overlayKeys.has(key));
        const overlayOnly = patchKeys.every((key) => overlayKeys.has(key));
        settleRedraw = redraw;
        settleRedrawOnError = redrawOnError;
        settleOverlayTouched = overlayTouched;
        pending = null;
        pendingOptimisticPatch = null;
        pendingRedraw = null;
        pendingRedrawOnError = null;
        state.options = await saveOptionsPatch(patch);
        if (pendingOptimisticPatch) applyOptimisticPatch(pendingOptimisticPatch);
        error = null;
        syncI18nLanguage();
        applyTheme();
        if (!frameToastPositionOnly && !overlayOnly) {
          syncTopbar();
          syncWorkspaceDom();
          syncSummaryPanel();
        }
        syncPreferredModelSelectionOverlays();
        redraw?.();
        settleRedraw = null;
        settleRedrawOnError = null;
        settleOverlayTouched = false;
      }
    } catch (cause) {
      error = cause;
      console.warn("[ChatClub] Failed to auto-save appearance settings", cause);
      if (pendingOptimisticPatch) applyOptimisticPatch(pendingOptimisticPatch);
      if (settleOverlayTouched) {
        applyTheme();
        syncPreferredModelSelectionOverlays();
      }
      (settleRedrawOnError || settleRedraw)?.();
      toast(t("toast.appearanceAutoSaveFailed"), "error");
    } finally {
      running = false;
      if (pending) flush();
    }
  }

  function queueColor(primaryColor) {
    clearTimeout(colorTimer);
    pendingColor = primaryColor;
    colorTimer = setTimeout(() => {
      const color = pendingColor;
      colorTimer = 0;
      pendingColor = "";
      queue({ primaryColor: color, primaryColorCustom: true });
    }, 250);
  }

  function flushColor() {
    if (!colorTimer) return;
    clearTimeout(colorTimer);
    colorTimer = 0;
    const color = pendingColor;
    pendingColor = "";
    if (color) queue({ primaryColor: color, primaryColorCustom: true });
  }

  function flushAll() {
    flushColor();
    flush();
  }

  function clear() {
    clearTimeout(colorTimer);
    colorTimer = 0;
    pendingColor = "";
    error = null;
    pending = null;
    pendingOptimisticPatch = null;
    pendingRedraw = null;
    pendingRedrawOnError = null;
  }

  return Object.freeze({
    busy: () => Boolean(colorTimer || running || pending),
    clear,
    failed: () => Boolean(error),
    flush: flushAll,
    queue,
    queueColor
  });
}
