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
    syncSummaryPanel
  } = validateControllerContract(dependencies, "Appearance autosave", {
    state: "object",
    saveOptionsPatch: "function",
    applyTheme: "function",
    syncI18nLanguage: "function",
    syncTopbar: "function",
    syncWorkspaceDom: "function",
    syncSummaryPanel: "function"
  });
  let error = null;
  let running = false;
  let pending = null;
  let pendingRedraw = null;
  let colorTimer = 0;
  let pendingColor = "";

  function queue(patch, options = {}) {
    pending = { ...(pending || {}), ...patch };
    if (typeof options.redraw === "function") pendingRedraw = options.redraw;
    flush();
  }

  async function flush() {
    if (running) return;
    running = true;
    let settleRedraw = null;
    try {
      while (pending) {
        const patch = pending;
        const redraw = pendingRedraw;
        const frameToastPositionOnly = Object.keys(patch).every((key) => key === "frameToastPosition");
        settleRedraw = redraw;
        pending = null;
        pendingRedraw = null;
        state.options = await saveOptionsPatch(patch);
        error = null;
        syncI18nLanguage();
        applyTheme();
        if (!frameToastPositionOnly) {
          syncTopbar();
          syncWorkspaceDom();
          syncSummaryPanel();
        }
        redraw?.();
        settleRedraw = null;
      }
    } catch (cause) {
      error = cause;
      console.warn("[ChatClub] Failed to auto-save appearance settings", cause);
      settleRedraw?.();
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
    pendingRedraw = null;
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
