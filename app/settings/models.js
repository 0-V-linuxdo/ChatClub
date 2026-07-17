import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_MODEL_PREFERENCE_ORDER,
  DEFAULT_OPTIONS,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { normalizeModelPreferenceOrder } from "../../shared/storage-schema.js";
import { button, el, select, toast } from "../../ui/dom.js";
import {
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem
} from "./kit.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

const APP_LABELS = Object.freeze({
  Gemini: "Gemini",
  Grok: "Grok",
  DeepSeek: "DeepSeek",
  NotionAI: "Notion AI"
});

export function createModelsSettingsSection(ctx) {
  const controllerName = "Models settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    applyPreferredModels: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["modelPreferenceDraft", "options"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const applyPreferredModels = requireControllerFunction(ctx, controllerName, "applyPreferredModels");
  const {
    settingsActions,
    settingsBlock,
    settingsDragHandle,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar
  } = createSettingsKit({ svgIcon });
  let autoSaveError = null;
  let autoSaveRunning = false;
  let autoSavePending = null;
  let autoSaveRedraw = null;
  let dragId = "";

  function preferenceKey(config) {
    return JSON.stringify({ ...DEFAULT_OPTIONS.modelPreferences, ...(config || {}) });
  }

  function draft() {
    if (!state.modelPreferenceDraft) {
      state.modelPreferenceDraft = {
        ...DEFAULT_OPTIONS.modelPreferences,
        ...(state.options.modelPreferences || {})
      };
    }
    return state.modelPreferenceDraft;
  }

  function queueAutoSave(config, options = {}) {
    const next = { ...DEFAULT_OPTIONS.modelPreferences, ...(config || {}) };
    state.modelPreferenceDraft = next;
    autoSavePending = next;
    if (typeof options.redraw === "function") autoSaveRedraw = options.redraw;
    Promise.resolve(applyPreferredModels(null, { immediate: true })).catch((error) => {
      console.warn("[ChatClub] Failed to apply pending model preferences", error);
    });
    flushAutosave();
  }

  async function flushAutosave() {
    if (autoSaveRunning) return;
    autoSaveRunning = true;
    try {
      while (autoSavePending) {
        const next = autoSavePending;
        const redraw = autoSaveRedraw;
        autoSavePending = null;
        autoSaveRedraw = null;
        state.options = await saveOptionsPatch({ modelPreferences: next });
        autoSaveError = null;
        await notifyConfigReload();
        await Promise.resolve(applyPreferredModels(null, { immediate: true }));
        if (!autoSavePending && preferenceKey(state.modelPreferenceDraft) === preferenceKey(next)) {
          state.modelPreferenceDraft = {
            ...DEFAULT_OPTIONS.modelPreferences,
            ...(state.options.modelPreferences || {})
          };
          redraw?.();
        }
      }
    } catch (error) {
      autoSaveError = error;
      console.warn("[ChatClub] Failed to auto-save model preferences", error);
      toast(t("toast.modelPreferencesAutoSaveFailed"), "error");
    } finally {
      autoSaveRunning = false;
      if (autoSavePending) flushAutosave();
    }
  }

  function autosaveBusy() {
    return Boolean(autoSaveRunning || autoSavePending);
  }

  function autosaveFailed() {
    return Boolean(autoSaveError);
  }

  function clearAutosaveState() {
    autoSaveError = null;
    autoSavePending = null;
    autoSaveRedraw = null;
  }

  function preferenceOptions(appId) {
    return (MODEL_PREFERENCE_TARGETS[appId] || []).map((target) => ({
      value: target.id,
      label: target.id ? target.label : t("modelPreferences.none")
    }));
  }

  function preferenceOrder() {
    return normalizeModelPreferenceOrder(state.options.modelPreferenceOrder || DEFAULT_MODEL_PREFERENCE_ORDER);
  }

  function cleanupDrag() {
    dragId = "";
    cleanupSettingsDragRows(".model-preference-row");
  }

  function startDrag(event, appId) {
    dragId = appId;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-model-preference", appId);
    event.dataTransfer?.setData("text/plain", appId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewDrop(event, appId) {
    const sourceId = dragId || event.dataTransfer?.getData("application/x-chatclub-model-preference") || "";
    if (!sourceId || sourceId === appId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const placement = settingsListDropPlacement(event);
    event.currentTarget.classList.toggle("drop-after", placement === "after");
    event.currentTarget.classList.toggle("drop-before", placement !== "after");
  }

  async function drop(event, targetAppId, redraw) {
    const sourceId = dragId
      || event.dataTransfer?.getData("application/x-chatclub-model-preference")
      || event.dataTransfer?.getData("text/plain")
      || "";
    if (!sourceId || sourceId === targetAppId) return;
    event.preventDefault();
    const items = preferenceOrder().map((id) => ({ id }));
    const modelPreferenceOrder = moveListItem(
      items,
      sourceId,
      targetAppId,
      settingsListDropPlacement(event)
    ).map((item) => item.id);
    cleanupDrag();
    state.options = await saveOptionsPatch({ modelPreferenceOrder });
    redraw();
  }

  function thinkingLevelLabel(value) {
    const normalized = GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === value)
      ? value
      : DEFAULT_GEMINI_THINKING_LEVEL;
    return normalized === "extended"
      ? t("modelPreferences.thinkingExtended")
      : t("modelPreferences.thinkingStandard");
  }

  function thinkingLevelSwitch() {
    const config = draft();
    const value = GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === config[GEMINI_THINKING_LEVEL_PREFERENCE_KEY])
      ? config[GEMINI_THINKING_LEVEL_PREFERENCE_KEY]
      : DEFAULT_GEMINI_THINKING_LEVEL;
    const checkbox = el("input", {
      type: "checkbox",
      role: "switch",
      "aria-label": t("modelPreferences.thinkingLevel"),
      checked: value === "extended"
    });
    const valueNode = el("span", { class: "model-thinking-toggle-value" }, thinkingLevelLabel(value));
    checkbox.addEventListener("change", () => {
      const next = checkbox.checked ? "extended" : "standard";
      valueNode.textContent = thinkingLevelLabel(next);
      queueAutoSave({ ...draft(), [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: next });
    });
    return el("label", { class: "model-thinking-toggle" },
      checkbox,
      el("span", { class: "model-thinking-toggle-track" },
        el("span", { class: "model-thinking-toggle-thumb" })
      ),
      el("span", { class: "model-thinking-toggle-copy" }, valueNode)
    );
  }

  function row(appId, redraw) {
    const config = draft();
    const modelSelect = select(config[appId] || "", preferenceOptions(appId));
    modelSelect.value = config[appId] || "";
    modelSelect.addEventListener("change", () => {
      queueAutoSave({ ...draft(), [appId]: modelSelect.value });
    });
    return el("div", {
      class: "ui-list-row settings-list-row model-preference-row",
      draggable: "true",
      dataset: { modelPreferenceAppId: appId },
      ondragstart: (event) => startDrag(event, appId),
      ondragend: cleanupDrag,
      ondragover: (event) => previewDrop(event, appId),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => drop(event, appId, redraw)
    },
      settingsDragHandle(t("modelPreferences.drag")),
      el("strong", { class: "settings-main-cell" }, APP_LABELS[appId] || appId),
      modelSelect,
      appId === "Gemini"
        ? thinkingLevelSwitch()
        : el("span", { class: "model-thinking-toggle-placeholder", "aria-hidden": "true" })
    );
  }

  function clearDraft(redraw) {
    state.modelPreferenceDraft = { ...DEFAULT_OPTIONS.modelPreferences };
    queueAutoSave(state.modelPreferenceDraft, { redraw });
    redraw();
  }

  function pane(redraw) {
    const block = settingsBlock(t("modelPreferences.title"), t("modelPreferences.desc"),
      settingsList(
        ["", t("modelPreferences.platform"), t("modelPreferences.preferredModel"), t("modelPreferences.thinkingLevel")],
        preferenceOrder().map((appId) => row(appId, redraw)),
        "settings-manager-list model-preference-list"
      ),
      settingsActions(button(t("modelPreferences.clear"), () => clearDraft(redraw)))
    );
    block.classList.add("model-preference-block");
    return el("div", { class: "settings-pane settings-manager-pane model-preferences-pane" },
      settingsPaneToolbar(t("modelPreferences.manage")),
      block
    );
  }

  function resetAfterImport() {
    clearAutosaveState();
    state.modelPreferenceDraft = null;
    cleanupDrag();
  }

  function close() {
    if (!autosaveBusy() && !autosaveFailed()) state.modelPreferenceDraft = null;
    cleanupDrag();
  }

  return Object.freeze({
    pane,
    close,
    resetAfterImport,
    flushAutosave,
    autosaveBusy,
    autosaveFailed,
    clearAutosaveState
  });
}
