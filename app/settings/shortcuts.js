import { t } from "../../shared/i18n.js";
import {
  defaultShortcutConfig,
  formatShortcut,
  normalizeShortcutConfig,
  shortcutConflictActions,
  shortcutFromKeyboardEvent,
  shortcutUsesDigitPattern
} from "../../shared/shortcuts.js";
import { saveShortcutConfig } from "../../shared/storage.js";
import { button, el, field, select, toast } from "../../ui/dom.js";

const SHORTCUT_SETTING_GROUPS = [
  {
    titleKey: "shortcuts.globalTitle",
    descriptionKey: "shortcuts.globalDesc",
    actions: ["focusInput", "newChat", "deleteThread", "optimizePrompt", "openSummaryPanel", "openPocketPanel", "insertPrompt", "switchLayout", "switchPlatformTab"]
  },
  {
    titleKey: "shortcuts.chatTitle",
    descriptionKey: "shortcuts.chatDesc",
    actions: ["closeChat", "reloadChat", "enterFullscreen"]
  }
];

export function createShortcutSettings(ctx) {
  const { state, notifyConfigReload, settingsKit } = ctx;
  const {
    settingsActions,
    settingsBlock,
    settingsIconAction,
    settingsInnerTabs,
    settingsList
  } = settingsKit;
  let shortcutAutoSaveRunning = false;
  let shortcutAutoSavePending = null;
  let shortcutAutoSaveRedraw = null;

  function shortcutConfigKey(config) {
    return JSON.stringify(normalizeShortcutConfig(config));
  }

  function queueShortcutAutoSave(config, redraw = null) {
    const next = normalizeShortcutConfig(config);
    state.shortcutDraftConfig = next;
    const conflicts = shortcutConflictActions(next);
    if (conflicts.size) {
      toast(t("shortcuts.conflict"), "error");
      redraw?.();
      return;
    }
    shortcutAutoSavePending = next;
    if (typeof redraw === "function") shortcutAutoSaveRedraw = redraw;
    flushShortcutAutoSave();
  }

  async function flushShortcutAutoSave() {
    if (shortcutAutoSaveRunning) return;
    shortcutAutoSaveRunning = true;
    try {
      while (shortcutAutoSavePending) {
        const next = shortcutAutoSavePending;
        const redraw = shortcutAutoSaveRedraw;
        shortcutAutoSavePending = null;
        shortcutAutoSaveRedraw = null;
        state.shortcutConfig = await saveShortcutConfig(next);
        await notifyConfigReload();
        if (!shortcutAutoSavePending && shortcutConfigKey(state.shortcutDraftConfig) === shortcutConfigKey(next)) {
          state.shortcutDraftConfig = normalizeShortcutConfig(state.shortcutConfig);
          redraw?.();
        }
      }
    } catch (error) {
      console.warn("[ChatClub] Failed to auto-save shortcuts", error);
      toast(t("toast.shortcutsAutoSaveFailed"), "error");
    } finally {
      shortcutAutoSaveRunning = false;
      if (shortcutAutoSavePending) flushShortcutAutoSave();
    }
  }

  function shortcutActionLabel(action) {
    return t(`shortcut.${action}.label`);
  }

  function shortcutActionDescription(action) {
    return t(`shortcut.${action}.desc`);
  }

  function formatShortcutDisplay(action, shortcut, slot = "") {
    const label = formatShortcut(action, shortcut, slot);
    return label === "Disabled" ? t("common.disabled") : label;
  }

  function shortcutDraft() {
    if (!state.shortcutDraftConfig) state.shortcutDraftConfig = normalizeShortcutConfig(state.shortcutConfig);
    return state.shortcutDraftConfig;
  }

  function updateShortcutDraft(action, patch) {
    const draft = shortcutDraft();
    state.shortcutDraftConfig = normalizeShortcutConfig({
      ...draft,
      shortcuts: {
        ...draft.shortcuts,
        [action]: {
          ...draft.shortcuts[action],
          ...patch
        }
      }
    });
    return state.shortcutDraftConfig;
  }

  function setShortcutRecording(action, redraw) {
    state.shortcutRecordingAction = action;
    redraw();
    requestAnimationFrame(() => {
      document.querySelector(`[data-shortcut-action="${action}"] .shortcut-record-button`)?.focus();
    });
  }

  function recordShortcutAction(event, action, redraw) {
    if (state.shortcutRecordingAction !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      state.shortcutRecordingAction = "";
      redraw();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      const next = updateShortcutDraft(action, { disabled: true });
      state.shortcutRecordingAction = "";
      queueShortcutAutoSave(next, redraw);
      redraw();
      return;
    }
    const shortcut = shortcutFromKeyboardEvent(event, action);
    if (!shortcut) {
      toast(shortcutUsesDigitPattern(action, shortcutDraft().shortcuts[action])
        ? t("shortcuts.pressNumberKey")
        : t("shortcuts.pressNonModifierKey"), "error");
      return;
    }
    const next = updateShortcutDraft(action, shortcut);
    state.shortcutRecordingAction = "";
    queueShortcutAutoSave(next, redraw);
    redraw();
  }

  function shortcutRow(action, conflicts, redraw) {
    const draft = shortcutDraft();
    const shortcut = draft.shortcuts[action];
    const recording = state.shortcutRecordingAction === action;
    const conflict = conflicts.has(action);
    const disabled = Boolean(shortcut?.disabled);
    return el("div", {
      class: `ui-list-row settings-list-row shortcut-row ${conflict ? "shortcut-row-conflict" : ""}`.trim(),
      dataset: { shortcutAction: action }
    },
      el("div", { class: "shortcut-row-copy" },
        el("strong", {}, shortcutActionLabel(action)),
        el("span", {}, shortcutActionDescription(action))
      ),
      el("button", {
        class: `shortcut-record-button tooltip-trigger ${recording ? "recording" : ""}`.trim(),
        type: "button",
        "aria-label": recording ? t("shortcuts.pressKey") : t("shortcuts.record"),
        "data-tooltip": recording ? t("shortcuts.pressKey") : t("shortcuts.record"),
        "data-tooltip-id": "settings.shortcuts.record",
        onkeydown: (event) => recordShortcutAction(event, action, redraw),
        onclick: () => setShortcutRecording(action, redraw)
      }, recording ? t("shortcuts.pressKey") : formatShortcutDisplay(action, shortcut)),
      el("label", { class: "settings-check shortcut-toggle", title: disabled ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${shortcutActionLabel(action)} ${t("common.enabled")}`,
          checked: !disabled,
          onchange: (event) => {
            const next = updateShortcutDraft(action, { disabled: !event.target.checked });
            queueShortcutAutoSave(next, redraw);
            redraw();
          }
        })
      ),
      settingsIconAction(t("shortcuts.reset"), "reload", () => {
        const defaults = defaultShortcutConfig();
        const next = updateShortcutDraft(action, defaults.shortcuts[action]);
        queueShortcutAutoSave(next, redraw);
        redraw();
      }, "shortcut-reset", false, "settings.action.reset")
    );
  }

  function shortcutGroupBlock(group, conflicts, redraw) {
    return settingsBlock(t(group.titleKey), t(group.descriptionKey),
      settingsList([t("shortcuts.action"), t("shortcuts.shortcut"), t("common.enabled"), ""],
        group.actions.map((action) => shortcutRow(action, conflicts, redraw)),
        "shortcut-list"
      )
    );
  }

  function resetShortcutDraft(redraw) {
    state.shortcutDraftConfig = defaultShortcutConfig();
    state.shortcutRecordingAction = "";
    queueShortcutAutoSave(state.shortcutDraftConfig, redraw);
    redraw();
  }

  function shortcutSettingsActions(redraw) {
    return settingsActions(
      button(t("shortcuts.resetDefault"), () => resetShortcutDraft(redraw))
    );
  }

  function shortcutInputSettingsBlock() {
    const draft = shortcutDraft();
    const sendMode = select(draft.sendKeyMode || "enter", [
      { value: "enter", label: t("shortcuts.enterSends") },
      { value: "mod-enter", label: t("shortcuts.modEnterSends") }
    ]);
    sendMode.value = draft.sendKeyMode || "enter";
    sendMode.addEventListener("change", () => {
      queueShortcutAutoSave({ ...shortcutDraft(), sendKeyMode: sendMode.value });
    });
    return settingsBlock(t("shortcuts.sendMessage"), t("shortcuts.sendMessageDesc"),
      field(t("shortcuts.sendKey"), sendMode)
    );
  }

  function shortcutActionSettingsBlocks(group, conflicts, redraw) {
    return [
      conflicts.size
        ? el("div", { class: "shortcut-conflict-banner" }, t("shortcuts.conflict"))
        : el("p", { class: "shortcut-info" }, t("shortcuts.info")),
      shortcutGroupBlock(group, conflicts, redraw)
    ];
  }

  function shortcutsPane(redraw) {
    const active = ["global", "chat"].includes(state.shortcutSettingsTab) ? state.shortcutSettingsTab : "input";
    const draft = shortcutDraft();
    const conflicts = shortcutConflictActions(draft);
    const activeGroup = active === "chat" ? SHORTCUT_SETTING_GROUPS[1] : SHORTCUT_SETTING_GROUPS[0];
    return el("div", { class: "settings-pane" },
      settingsInnerTabs([
        ["input", t("shortcuts.inputTab"), t("shortcuts.inputTabDesc")],
        ["global", t("shortcuts.globalTab"), t("shortcuts.globalTabDesc")],
        ["chat", t("shortcuts.chatTab"), t("shortcuts.chatTabDesc")]
      ], active, (id) => {
        state.shortcutSettingsTab = id;
        state.shortcutRecordingAction = "";
        redraw();
      }),
      active === "input" ? shortcutInputSettingsBlock() : shortcutActionSettingsBlocks(activeGroup, conflicts, redraw),
      shortcutSettingsActions(redraw)
    );
  }

  return Object.freeze({
    shortcutsPane
  });
}
