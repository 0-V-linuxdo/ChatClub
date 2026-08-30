import {
  TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX,
  TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX,
  TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC,
  TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC,
  TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT,
  TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  normalizeTopbarPromptInputFontSize,
  normalizeTopbarPromptPlaceholderConfig,
  normalizeTopbarPromptPlaceholderText
} from "../../shared/storage-schema.js";
import { button, el, field, input, select, toast } from "../../ui/dom.js";
import { validateControllerContract } from "../controller-contract.js";
import { cleanupSettingsDragRows, createSettingsKit } from "./kit.js";
import {
  moveTopbarPromptPlaceholderItems,
  topbarPromptPlaceholderPreview,
  topbarPromptPlaceholderRawText
} from "./appearance-model.js";

const TOPBAR_STATE_KEYS = Object.freeze([
  "options",
  "settingsAppearanceTopbarTab",
  "settingsTopbarPromptPlaceholderDraft",
  "settingsTopbarPromptPlaceholderDragIndex",
  "settingsTopbarPromptPlaceholderEditingIndex"
]);

function requireAppearanceTopbarState(state, controllerName) {
  if (TOPBAR_STATE_KEYS.some((key) => !(key in state))) {
    throw new TypeError(`${controllerName} requires the Appearance settings section state port.`);
  }
  return state;
}

export function createAppearanceTopbarController(dependencies = {}) {
  const controllerName = "Appearance topbar settings";
  const contract = validateControllerContract(dependencies, controllerName, {
    state: "object",
    svgIcon: "function",
    saveOptionsPatch: "function",
    queueAppearanceAutoSave: "function",
    syncTopbarPromptPlaceholder: "function",
    enterTopbarEditMode: "function",
    closeSettingsDialog: "function"
  });
  const state = requireAppearanceTopbarState(contract.state, controllerName);
  const {
    svgIcon,
    saveOptionsPatch,
    queueAppearanceAutoSave,
    syncTopbarPromptPlaceholder,
    enterTopbarEditMode,
    closeSettingsDialog
  } = contract;
  const {
    settingsBlock,
    settingsReorderHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });

  function topbarPromptPlaceholderConfigValue() {
    return normalizeTopbarPromptPlaceholderConfig(state.options.topbarPromptPlaceholderConfig);
  }

  async function saveTopbarPromptPlaceholderConfig(config, redraw, message = "") {
    state.options = await saveOptionsPatch({ topbarPromptPlaceholderConfig: config });
    syncTopbarPromptPlaceholder();
    redraw();
    if (message) toast(message, "success");
  }

  function validateTopbarPromptPlaceholderDraft(value, itemCount, editing) {
    const textValue = topbarPromptPlaceholderRawText(value);
    if (!textValue) return { ok: false, text: "", message: t("topbar.placeholder.empty") };
    if (textValue.length > TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN) {
      return { ok: false, text: "", message: t("topbar.placeholder.tooLong", { maxLen: TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN }) };
    }
    if (!editing && itemCount >= TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT) {
      return { ok: false, text: "", message: t("topbar.placeholder.maxCount", { maxCount: TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT }) };
    }
    return { ok: true, text: normalizeTopbarPromptPlaceholderText(textValue), message: "" };
  }

  function resetTopbarPromptPlaceholderEditor() {
    state.settingsTopbarPromptPlaceholderDraft = "";
    state.settingsTopbarPromptPlaceholderEditingIndex = -1;
  }

  async function saveTopbarPromptPlaceholderDraft(errorNode, redraw) {
    const config = topbarPromptPlaceholderConfigValue();
    const editingIndex = Number(state.settingsTopbarPromptPlaceholderEditingIndex);
    const editing = Number.isInteger(editingIndex) && editingIndex >= 0 && editingIndex < config.items.length;
    const validation = validateTopbarPromptPlaceholderDraft(
      state.settingsTopbarPromptPlaceholderDraft,
      config.items.length,
      editing
    );
    if (!validation.ok) {
      if (errorNode) {
        errorNode.hidden = false;
        errorNode.textContent = validation.message;
      }
      return;
    }
    const items = [...config.items];
    if (editing) items[editingIndex] = validation.text;
    else items.push(validation.text);
    resetTopbarPromptPlaceholderEditor();
    await saveTopbarPromptPlaceholderConfig(
      { ...config, items },
      redraw,
      editing ? t("toast.topbarPlaceholderUpdated") : t("toast.topbarPlaceholderAdded")
    );
  }

  function editTopbarPromptPlaceholderItem(index, redraw) {
    const config = topbarPromptPlaceholderConfigValue();
    if (index < 0 || index >= config.items.length) return;
    state.settingsTopbarPromptPlaceholderEditingIndex = index;
    state.settingsTopbarPromptPlaceholderDraft = config.items[index];
    redraw();
  }

  function deleteTopbarPromptPlaceholderItem(index, redraw) {
    const config = topbarPromptPlaceholderConfigValue();
    if (index < 0 || index >= config.items.length) return;
    const removed = config.items[index];
    const label = topbarPromptPlaceholderPreview(removed, 80) || t("topbar.placeholder.thisItem");
    resetTopbarPromptPlaceholderEditor();
    return saveTopbarPromptPlaceholderConfig(
      { ...config, items: config.items.filter((_, itemIndex) => itemIndex !== index) },
      redraw
    ).then(() => {
      toast(t("toast.topbarPlaceholderDeleted", { text: label }), "info", {
        actionLabel: t("common.undo"),
        onAction: () => {
          const current = topbarPromptPlaceholderConfigValue();
          const items = [...current.items];
          items.splice(Math.min(index, items.length), 0, removed);
          return saveTopbarPromptPlaceholderConfig({ ...current, items }, redraw, t("toast.topbarPlaceholderRestored"));
        }
      });
    }).catch((error) => {
      const reason = String(error?.message || error || "").trim();
      if (reason) toast(reason, "error");
    });
  }

  function startTopbarPromptPlaceholderDrag(event, index) {
    state.settingsTopbarPromptPlaceholderDragIndex = String(index);
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-topbar-placeholder", String(index));
    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupTopbarPromptPlaceholderDrag() {
    state.settingsTopbarPromptPlaceholderDragIndex = "";
    cleanupSettingsDragRows(".topbar-placeholder-row");
  }

  function previewTopbarPromptPlaceholderDrop(event, index) {
    const sourceIndex = state.settingsTopbarPromptPlaceholderDragIndex || event.dataTransfer?.getData("application/x-chatclub-topbar-placeholder") || "";
    if (!sourceIndex || sourceIndex === String(index)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropTopbarPromptPlaceholder(event, targetIndex, redraw) {
    const sourceIndex = state.settingsTopbarPromptPlaceholderDragIndex || event.dataTransfer?.getData("application/x-chatclub-topbar-placeholder") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceIndex || sourceIndex === String(targetIndex)) return;
    event.preventDefault();
    const config = topbarPromptPlaceholderConfigValue();
    const items = moveTopbarPromptPlaceholderItems(config.items, sourceIndex, targetIndex, settingsListDropPlacement(event));
    resetTopbarPromptPlaceholderEditor();
    cleanupTopbarPromptPlaceholderDrag();
    await saveTopbarPromptPlaceholderConfig({ ...config, items }, redraw, t("toast.topbarPlaceholderOrderSaved"));
  }

  function topbarPromptPlaceholderEditor(config, redraw) {
    const editingIndex = Number(state.settingsTopbarPromptPlaceholderEditingIndex);
    const editing = Number.isInteger(editingIndex) && editingIndex >= 0 && editingIndex < config.items.length;
    if (!editing && state.settingsTopbarPromptPlaceholderEditingIndex !== -1) {
      resetTopbarPromptPlaceholderEditor();
    }
    const draftValue = String(state.settingsTopbarPromptPlaceholderDraft || "");
    const error = el("div", { class: "settings-inline-error topbar-placeholder-error", hidden: true });
    const counter = el("span", { class: "topbar-placeholder-counter" }, `${draftValue.length}/${TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN}`);
    const draftInput = input(draftValue, {
      class: "input topbar-placeholder-input",
      maxlength: String(TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN),
      placeholder: t("topbar.placeholder.editorPlaceholder"),
      oninput: (event) => {
        state.settingsTopbarPromptPlaceholderDraft = event.target.value;
        counter.textContent = `${event.target.value.length}/${TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN}`;
        error.hidden = true;
        error.textContent = "";
      },
      onkeydown: (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        saveTopbarPromptPlaceholderDraft(error, redraw);
      }
    });
    return el("div", { class: "topbar-placeholder-editor" },
      field(editing ? t("topbar.placeholder.editLabel") : t("topbar.placeholder.newLabel"), draftInput),
      el("div", { class: "topbar-placeholder-editor-footer" },
        el("div", { class: "settings-actions" },
          settingsPrimaryAction(editing ? t("topbar.placeholder.saveEdit") : t("topbar.placeholder.add"), editing ? "edit" : "plus", () => saveTopbarPromptPlaceholderDraft(error, redraw)),
          editing ? button(t("common.cancel"), () => {
            resetTopbarPromptPlaceholderEditor();
            redraw();
          }) : null
        ),
        counter
      ),
      error
    );
  }

  function topbarPromptPlaceholderSettingsControls(config, redraw) {
    const modeSelect = select(config.mode, [
      { value: "refresh", label: t("topbar.placeholder.modeRefresh") },
      { value: "interval", label: t("topbar.placeholder.modeInterval") }
    ], {
      onchange: () => saveTopbarPromptPlaceholderConfig({ ...config, mode: modeSelect.value }, redraw)
    });
    const orderSelect = select(config.order, [
      { value: "sequential", label: t("topbar.placeholder.orderSequential") },
      { value: "random", label: t("topbar.placeholder.orderRandom") }
    ], {
      onchange: () => saveTopbarPromptPlaceholderConfig({ ...config, order: orderSelect.value }, redraw)
    });
    const intervalInput = input(String(config.intervalSec), {
      class: "input topbar-placeholder-interval-input",
      type: "number",
      min: String(TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC),
      max: String(TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC),
      step: "1",
      disabled: config.mode !== "interval",
      onchange: () => {
        const intervalSec = Math.max(
          TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC,
          Math.min(TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC, Math.round(Number(intervalInput.value) || config.intervalSec))
        );
        saveTopbarPromptPlaceholderConfig({ ...config, intervalSec }, redraw);
      },
      oninput: () => {
        const value = Number(intervalInput.value);
        if (!Number.isFinite(value)) return;
        const bounded = Math.max(
          TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC,
          Math.min(TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC, Math.round(value))
        );
        if (String(bounded) !== intervalInput.value && intervalInput.value !== "") intervalInput.value = String(bounded);
      }
    });
    return el("div", { class: "topbar-placeholder-controls" },
      field(t("topbar.placeholder.mode"), modeSelect),
      field(t("topbar.placeholder.order"), orderSelect),
      field(t("topbar.placeholder.interval"), intervalInput)
    );
  }

  function topbarPromptPlaceholderRow(textValue, index, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row topbar-placeholder-row",
      draggable: "true",
      dataset: { placeholderIndex: String(index) },
      ondragstart: (event) => startTopbarPromptPlaceholderDrag(event, index),
      ondragend: cleanupTopbarPromptPlaceholderDrag,
      ondragover: (event) => previewTopbarPromptPlaceholderDrop(event, index),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropTopbarPromptPlaceholder(event, index, redraw)
    },
      settingsReorderHandle(t("topbar.placeholder.drag"), {
        ids: topbarPromptPlaceholderConfigValue().items.map((_, itemIndex) => String(itemIndex)),
        id: String(index),
        onMove: (delta) => {
          const config = topbarPromptPlaceholderConfigValue();
          const targetIndex = index + delta;
          if (targetIndex < 0 || targetIndex >= config.items.length) return;
          const items = moveTopbarPromptPlaceholderItems(
            config.items,
            index,
            targetIndex,
            delta > 0 ? "after" : "before"
          );
          saveTopbarPromptPlaceholderConfig({ ...config, items }, redraw, t("toast.topbarPlaceholderOrderSaved"));
        }
      }),
      el("span", { class: "topbar-placeholder-row-text", title: textValue }, textValue),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("common.edit"), "edit", () => editTopbarPromptPlaceholderItem(index, redraw), "", false, "settings.action.edit"),
        settingsIconAction(t("common.delete"), "trash", () => deleteTopbarPromptPlaceholderItem(index, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function topbarPromptPlaceholderBlock(redraw) {
    const config = topbarPromptPlaceholderConfigValue();
    const rows = config.items.length
      ? config.items.map((textValue, index) => topbarPromptPlaceholderRow(textValue, index, redraw))
      : settingsEmptyRow(t("topbar.placeholder.noItems"));
    return settingsBlock(t("topbar.placeholder.title"), t("topbar.placeholder.desc"),
      settingsPaneToolbar(t("topbar.placeholder.help", { maxCount: TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT })),
      topbarPromptPlaceholderEditor(config, redraw),
      topbarPromptPlaceholderSettingsControls(config, redraw),
      settingsList(["", t("topbar.placeholder.text"), t("profiles.actions")], rows, "settings-manager-list topbar-placeholder-list")
    );
  }

  function topbarPromptInputBlock() {
    const initialFontSize = normalizeTopbarPromptInputFontSize(state.options.topbarPromptInputFontSize);
    const fontSizeValue = el("span", { class: "appearance-range-value" }, `${initialFontSize}px`);
    const fontSizeSlider = el("input", {
      class: "appearance-range-slider topbar-prompt-input-font-size-slider",
      type: "range",
      min: String(TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX),
      max: String(TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX),
      step: "1",
      value: String(initialFontSize),
      "aria-label": t("topbar.input.fontSize")
    });
    fontSizeSlider.addEventListener("input", () => {
      const nextFontSize = normalizeTopbarPromptInputFontSize(fontSizeSlider.value);
      fontSizeSlider.value = String(nextFontSize);
      fontSizeValue.textContent = `${nextFontSize}px`;
      queueAppearanceAutoSave({ topbarPromptInputFontSize: nextFontSize });
    });
    return settingsBlock(t("topbar.input.title"), t("topbar.input.desc"),
      el("div", { class: "appearance-field-list topbar-prompt-input-settings" },
        field(t("topbar.input.fontSize"),
          el("div", { class: "appearance-range-control topbar-prompt-input-font-size-control" },
            fontSizeSlider,
            fontSizeValue,
            el("small", { class: "appearance-range-help" }, t("topbar.input.fontSizeHelp"))
          )
        )
      )
    );
  }

  function pane(redraw) {
    const activeTab = ["input", "layout"].includes(state.settingsAppearanceTopbarTab)
      ? state.settingsAppearanceTopbarTab
      : "placeholder";
    state.settingsAppearanceTopbarTab = activeTab;
    const enterTopbarEditModeFromSettings = () => {
      closeSettingsDialog();
      requestAnimationFrame(() => enterTopbarEditMode());
    };
    return el("div", { class: "settings-pane topbar-settings-pane" },
      settingsInnerTabs([
        ["placeholder", t("topbar.placeholder.title"), t("topbar.placeholder.tabDesc")],
        ["input", t("topbar.input.title"), t("topbar.input.tabDesc")],
        ["layout", t("topbar.customize.title"), t("topbar.customize.tabDesc")]
      ], activeTab, (id) => {
        state.settingsAppearanceTopbarTab = id;
        redraw();
      }),
      activeTab === "layout"
        ? settingsBlock(t("topbar.customize.title"), t("topbar.customize.desc"),
          settingsPaneToolbar(t("topbar.customize.help"),
            settingsPrimaryAction(t("topbar.customize.enter"), "customizeTopbar", enterTopbarEditModeFromSettings)
          ),
          el("div", { class: "topbar-customizer topbar-customizer-launcher" },
            el("p", { class: "topbar-layout-hint" }, t("topbar.customize.dragHint"))
          )
        )
        : activeTab === "input"
          ? topbarPromptInputBlock()
          : topbarPromptPlaceholderBlock(redraw)
    );
  }

  return Object.freeze({ pane });
}
