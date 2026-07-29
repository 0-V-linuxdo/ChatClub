import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_MODEL_PREFERENCE_ORDER,
  DEFAULT_OPTIONS,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES,
  MODEL_PREFERENCE_FAILURE_POLICIES,
  MODEL_PREFERENCE_TARGETS,
  NOTION_ALL_SOURCES_PREFERENCE_KEY,
  NOTION_ALL_SOURCES_PREFERENCE_VALUES
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  normalizeModelPreferenceFailureOverrides,
  normalizeModelPreferenceFailurePolicy,
  normalizeModelPreferenceOrder
} from "../../shared/storage-schema.js";
import { button, el, field, select, toast } from "../../ui/dom.js";
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
    ["modelPreferenceDraft", "modelPreferenceSettingsTab", "options"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const applyPreferredModels = requireControllerFunction(ctx, controllerName, "applyPreferredModels");
  const {
    settingsActions,
    settingsBlock,
    settingsDragHandle,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar
  } = createSettingsKit({ svgIcon });
  let autoSaveError = null;
  let autoSaveRunning = false;
  let autoSavePending = null;
  let autoSaveRedraw = null;
  let failurePolicyDraft = "";
  let failureOverridesDraft = null;
  let preferenceOrderDraft = null;
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

  function queueOptionsAutoSave(patch, options = {}) {
    autoSavePending = {
      patch: { ...(autoSavePending?.patch || {}), ...patch },
      applyModels: Boolean(autoSavePending?.applyModels || options.applyModels)
    };
    if (typeof options.redraw === "function") autoSaveRedraw = options.redraw;
    flushAutosave();
  }

  function queueAutoSave(config, options = {}) {
    const next = { ...DEFAULT_OPTIONS.modelPreferences, ...(config || {}) };
    state.modelPreferenceDraft = next;
    Promise.resolve(applyPreferredModels(null, { immediate: true })).catch((error) => {
      console.warn("[ChatClub] Failed to apply pending model preferences", error);
    });
    queueOptionsAutoSave({ modelPreferences: next }, { ...options, applyModels: true });
  }

  async function flushAutosave() {
    if (autoSaveRunning) return;
    autoSaveRunning = true;
    try {
      while (autoSavePending) {
        const pending = autoSavePending;
        const { patch, applyModels } = pending;
        const redraw = autoSaveRedraw;
        autoSavePending = null;
        autoSaveRedraw = null;
        const savedOptions = await saveOptionsPatch(patch);
        state.options = {
          ...savedOptions,
          ...(failurePolicyDraft
            ? { modelPreferenceFailurePolicy: failurePolicyDraft }
            : {}),
          ...(failureOverridesDraft
            ? { modelPreferenceFailureOverrides: failureOverridesDraft }
            : {}),
          ...(preferenceOrderDraft
            ? { modelPreferenceOrder: preferenceOrderDraft }
            : {})
        };
        autoSaveError = null;
        await notifyConfigReload();
        if (applyModels) await Promise.resolve(applyPreferredModels(null, { immediate: true }));
        const savedPreferences = patch.modelPreferences;
        const pendingPreferences = autoSavePending?.patch?.modelPreferences;
        if (savedPreferences && !pendingPreferences && preferenceKey(state.modelPreferenceDraft) === preferenceKey(savedPreferences)) {
          state.modelPreferenceDraft = {
            ...DEFAULT_OPTIONS.modelPreferences,
            ...(state.options.modelPreferences || {})
          };
          redraw?.();
        }
        const savedOrder = patch.modelPreferenceOrder;
        const pendingOrder = autoSavePending?.patch?.modelPreferenceOrder;
        if (savedOrder && !pendingOrder
          && normalizeModelPreferenceOrder(preferenceOrderDraft).join("\n") === normalizeModelPreferenceOrder(savedOrder).join("\n")) {
          preferenceOrderDraft = null;
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

  function failurePolicyValue() {
    return normalizeModelPreferenceFailurePolicy(
      failurePolicyDraft || state.options.modelPreferenceFailurePolicy
    );
  }

  function failureOverridesValue() {
    if (!failureOverridesDraft) {
      failureOverridesDraft = normalizeModelPreferenceFailureOverrides(
        state.options.modelPreferenceFailureOverrides
      );
    }
    return failureOverridesDraft;
  }

  function failurePolicyLabel(value) {
    if (value === "send-current") return t("modelPreferences.failureSendCurrent");
    if (value === "skip") return t("modelPreferences.failureSkip");
    return t("modelPreferences.failureInherit");
  }

  function failurePolicyOptions(values) {
    return values.map((value) => ({ value, label: failurePolicyLabel(value) }));
  }

  function failurePolicySelect() {
    const value = failurePolicyValue();
    const control = select(value, failurePolicyOptions(MODEL_PREFERENCE_FAILURE_POLICIES), {
      class: "select model-preference-failure-select",
      "aria-label": t("modelPreferences.failurePolicyDefault"),
      dataset: { modelPreferenceFailurePolicy: "global" }
    });
    control.value = value;
    control.addEventListener("change", () => {
      failurePolicyDraft = normalizeModelPreferenceFailurePolicy(control.value);
      state.options.modelPreferenceFailurePolicy = failurePolicyDraft;
      queueOptionsAutoSave({ modelPreferenceFailurePolicy: failurePolicyDraft });
    });
    return control;
  }

  function failureOverrideSelect(appId) {
    const overrides = failureOverridesValue();
    const value = overrides[appId];
    const control = select(value, failurePolicyOptions(MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES), {
      class: "select model-preference-failure-select",
      "aria-label": t("modelPreferences.failureOverrideFor", { platform: APP_LABELS[appId] || appId }),
      dataset: { modelPreferenceFailureOverrideAppId: appId }
    });
    control.value = value;
    control.addEventListener("change", () => {
      failureOverridesDraft = normalizeModelPreferenceFailureOverrides({
        ...failureOverridesValue(),
        [appId]: control.value
      });
      state.options.modelPreferenceFailureOverrides = failureOverridesDraft;
      queueOptionsAutoSave({ modelPreferenceFailureOverrides: failureOverridesDraft });
    });
    return control;
  }

  function failureOverrideField(appId) {
    const item = field(APP_LABELS[appId] || appId, failureOverrideSelect(appId));
    item.classList.add("model-preference-failure-field");
    item.dataset.modelPreferenceFailureAppId = appId;
    return item;
  }

  function preferenceOrder() {
    return normalizeModelPreferenceOrder(
      preferenceOrderDraft || state.options.modelPreferenceOrder || DEFAULT_MODEL_PREFERENCE_ORDER
    );
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

  function drop(event, targetAppId, redraw) {
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
    preferenceOrderDraft = modelPreferenceOrder;
    state.options.modelPreferenceOrder = modelPreferenceOrder;
    queueOptionsAutoSave({ modelPreferenceOrder });
    redraw();
  }

  function modelPreferenceSegmentedControl({
    name,
    title,
    ariaLabel,
    value,
    options,
    onChange,
    dataset = {},
    optionDataset,
    info = ""
  }) {
    const sizeClass = options.length === 2 ? "two" : "three";
    const controls = options.map((option) => {
      const control = el("input", {
        type: "radio",
        name,
        value: option.value,
        checked: option.value === value,
        dataset: optionDataset?.(option) || {}
      });
      control.value = option.value;
      control.checked = option.value === value;
      control.addEventListener("change", () => {
        if (control.checked) onChange(control.value);
      });
      return el("label", { class: "model-preference-segmented-option" },
        control,
        el("span", { class: "model-preference-segmented-option-label" }, option.label)
      );
    });
    return el("div", {
      class: "model-preference-segmented-control",
      role: "radiogroup",
      "aria-label": ariaLabel,
      dataset
    },
      el("span", { class: "model-preference-segmented-heading" },
        el("span", { class: "model-preference-segmented-title" }, title),
        info ? el("button", {
          class: "model-preference-segmented-info tooltip-trigger",
          type: "button",
          "aria-label": info,
          "data-tooltip": info,
          "data-tooltip-id": "settings.models.allSources",
          "data-tooltip-placement": "left",
          "data-tooltip-wrap": "true"
        }, svgIcon("info")) : null
      ),
      el("div", {
        class: `model-preference-segmented-options model-preference-segmented-options-${sizeClass}`
      }, controls)
    );
  }

  function thinkingLevelSegmentedControl() {
    const config = draft();
    const value = GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === config[GEMINI_THINKING_LEVEL_PREFERENCE_KEY])
      ? config[GEMINI_THINKING_LEVEL_PREFERENCE_KEY]
      : DEFAULT_GEMINI_THINKING_LEVEL;
    const options = GEMINI_THINKING_LEVEL_TARGETS.map((target) => ({
      value: target.id,
      label: target.id === "extended"
        ? t("modelPreferences.thinkingExtended")
        : t("modelPreferences.thinkingStandard")
    }));
    return modelPreferenceSegmentedControl({
      name: "model-preference-thinking-level-gemini",
      title: t("modelPreferences.thinkingLevel"),
      ariaLabel: t("modelPreferences.thinkingLevel"),
      value,
      options,
      dataset: { modelPreferenceThinkingLevelAppId: "Gemini" },
      optionDataset: (option) => ({ modelPreferenceThinkingLevelValue: option.value }),
      onChange: (nextValue) => {
        const next = GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === nextValue)
          ? nextValue
          : DEFAULT_GEMINI_THINKING_LEVEL;
        queueAutoSave({ ...draft(), [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: next });
      }
    });
  }

  function allSourcesPreferenceOptions() {
    return NOTION_ALL_SOURCES_PREFERENCE_VALUES.map((value) => ({
      value,
      label: value === "enabled"
        ? t("modelPreferences.allSourcesEnabled")
        : value === "disabled"
          ? t("modelPreferences.allSourcesDisabled")
          : t("modelPreferences.allSourcesUnchanged")
    }));
  }

  function notionAllSourcesSegmentedControl() {
    const config = draft();
    const value = NOTION_ALL_SOURCES_PREFERENCE_VALUES.includes(config[NOTION_ALL_SOURCES_PREFERENCE_KEY])
      ? config[NOTION_ALL_SOURCES_PREFERENCE_KEY]
      : "";
    const options = allSourcesPreferenceOptions();
    return modelPreferenceSegmentedControl({
      name: "model-preference-all-sources-notion-ai",
      title: t("modelPreferences.allSources"),
      ariaLabel: t("modelPreferences.allSourcesFor", { platform: APP_LABELS.NotionAI }),
      value,
      options,
      dataset: { modelPreferenceAllSourcesAppId: "NotionAI" },
      optionDataset: (option) => ({ modelPreferenceAllSourcesValue: option.value }),
      info: t("modelPreferences.allSourcesDesc"),
      onChange: (nextValue) => {
        const next = NOTION_ALL_SOURCES_PREFERENCE_VALUES.includes(nextValue) ? nextValue : "";
        queueAutoSave({ ...draft(), [NOTION_ALL_SOURCES_PREFERENCE_KEY]: next });
      }
    });
  }

  function additionalPreferenceField(appId) {
    if (appId === "Gemini") {
      return el("div", {
        class: "model-preference-row-field model-preference-additional-field model-preference-thinking-field"
      }, thinkingLevelSegmentedControl());
    }
    if (appId === "NotionAI") {
      return el("div", {
        class: "model-preference-row-field model-preference-additional-field model-preference-all-sources-field"
      }, notionAllSourcesSegmentedControl());
    }
    return el("div", {
      class: "model-preference-row-field model-preference-additional-field model-preference-thinking-field model-preference-additional-placeholder-field model-preference-thinking-placeholder-field",
      "aria-hidden": "true"
    }, el("span", { class: "model-preference-additional-placeholder" }));
  }

  function modelPreferenceRowField(label, control, className) {
    return el("div", { class: `model-preference-row-field ${className}`.trim() },
      el("span", { class: "model-preference-row-field-label" }, label),
      control
    );
  }

  function row(appId, redraw) {
    const config = draft();
    const platform = APP_LABELS[appId] || appId;
    const hasAdditionalPreference = appId === "Gemini" || appId === "NotionAI";
    const rowClasses = [
      "ui-list-row settings-list-row model-preference-row",
      appId === "Gemini" ? "model-preference-row-has-thinking" : "",
      hasAdditionalPreference ? "model-preference-row-has-additional" : ""
    ].filter(Boolean).join(" ");
    const modelSelect = select(config[appId] || "", preferenceOptions(appId), {
      class: "select model-preference-model-select",
      "aria-label": t("modelPreferences.preferredModelFor", { platform }),
      dataset: { modelPreferenceSelectAppId: appId }
    });
    modelSelect.value = config[appId] || "";
    modelSelect.addEventListener("change", () => {
      queueAutoSave({ ...draft(), [appId]: modelSelect.value });
    });
    return el("div", {
      class: rowClasses,
      draggable: "true",
      dataset: { modelPreferenceAppId: appId },
      ondragstart: (event) => startDrag(event, appId),
      ondragend: cleanupDrag,
      ondragover: (event) => previewDrop(event, appId),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => drop(event, appId, redraw)
    },
      settingsDragHandle(t("modelPreferences.drag")),
      el("strong", { class: "settings-main-cell" }, platform),
      modelPreferenceRowField(
        t("modelPreferences.preferredModel"),
        modelSelect,
        "model-preference-model-field"
      ),
      additionalPreferenceField(appId)
    );
  }

  function clearDraft(redraw) {
    state.modelPreferenceDraft = { ...DEFAULT_OPTIONS.modelPreferences };
    queueAutoSave(state.modelPreferenceDraft, { redraw });
    redraw();
  }

  function failurePolicyBlock() {
    const defaultFailureField = field(
      t("modelPreferences.failurePolicyDefault"),
      failurePolicySelect()
    );
    defaultFailureField.classList.add("model-preference-failure-default");
    const failureBlock = settingsBlock(
      t("modelPreferences.failurePolicyTitle"),
      t("modelPreferences.failurePolicyDesc"),
      defaultFailureField,
      el("div", { class: "model-preference-failure-overrides" },
        el("strong", { class: "model-preference-failure-overrides-title" },
          t("modelPreferences.failureOverrides")
        ),
        el("div", {
          class: "model-preference-failure-grid",
          role: "group",
          "aria-label": t("modelPreferences.failureOverrides")
        }, preferenceOrder().map((appId) => failureOverrideField(appId)))
      )
    );
    failureBlock.classList.add("model-preference-failure-block");
    return failureBlock;
  }

  function preferredModelsBlock(redraw) {
    const block = settingsBlock(t("modelPreferences.title"), t("modelPreferences.desc"),
      settingsList(
        [
          "",
          t("modelPreferences.platform"),
          t("modelPreferences.preferredModel"),
          t("modelPreferences.additionalOption")
        ],
        preferenceOrder().map((appId) => row(appId, redraw)),
        "settings-manager-list model-preference-list"
      ),
      settingsActions(button(t("modelPreferences.clear"), () => clearDraft(redraw)))
    );
    block.classList.add("model-preference-block");
    return block;
  }

  function pane(redraw) {
    const activeTab = state.modelPreferenceSettingsTab === "failure" ? "failure" : "preferred";
    state.modelPreferenceSettingsTab = activeTab;
    const tabs = [
      ["preferred", t("modelPreferences.preferredTab"), t("modelPreferences.preferredTabDesc")],
      ["failure", t("modelPreferences.failureTab"), t("modelPreferences.failureTabDesc")]
    ];
    const tabBar = settingsInnerTabs(tabs, activeTab, (id) => {
      state.modelPreferenceSettingsTab = id;
      cleanupDrag();
      redraw();
    });
    Array.from(tabBar.children).forEach((tab, index) => {
      tab.dataset.modelPreferenceTabId = tabs[index]?.[0] || "";
    });
    return el("div", { class: "settings-pane settings-manager-pane model-preferences-pane" },
      tabBar,
      activeTab === "failure"
        ? failurePolicyBlock()
        : [
          settingsPaneToolbar(t("modelPreferences.manage")),
          preferredModelsBlock(redraw)
        ]
    );
  }

  function resetAfterImport() {
    clearAutosaveState();
    state.modelPreferenceDraft = null;
    failurePolicyDraft = "";
    failureOverridesDraft = null;
    preferenceOrderDraft = null;
    cleanupDrag();
  }

  function close() {
    if (!autosaveBusy() && !autosaveFailed()) {
      state.modelPreferenceDraft = null;
      failurePolicyDraft = "";
      failureOverridesDraft = null;
      preferenceOrderDraft = null;
    }
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
