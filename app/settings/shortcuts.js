import { t } from "../../shared/i18n.js";
import {
  defaultShortcutProfile,
  detectKeyboardPlatform,
  formatShortcut,
  normalizeShortcutConfig,
  replaceShortcutProfile,
  shortcutConflictActions,
  shortcutFromKeyboardEvent,
  shortcutMatchesSearchQuery,
  shortcutProfile,
  shortcutSearchQueryFromKeyboardEvent,
  shortcutUsesDigitPattern
} from "../../shared/shortcuts.js";
import { saveShortcutConfig } from "../../shared/storage-adapter.js";
import { TOPBAR_SHORTCUT_ACTIONS } from "../../shared/topbar.js";
import { button, el, input, select, toast } from "../../ui/dom.js";

const SHORTCUT_SETTING_GROUPS = [
  {
    titleKey: "shortcuts.topbarTitle",
    descriptionKey: "shortcuts.topbarDesc",
    actions: [
      TOPBAR_SHORTCUT_ACTIONS.composer,
      TOPBAR_SHORTCUT_ACTIONS.brand,
      "toggleWorkspaceTabsSidebar",
      TOPBAR_SHORTCUT_ACTIONS.settings,
      TOPBAR_SHORTCUT_ACTIONS.newChat,
      TOPBAR_SHORTCUT_ACTIONS.deleteThread,
      TOPBAR_SHORTCUT_ACTIONS.summary,
      TOPBAR_SHORTCUT_ACTIONS.share,
      TOPBAR_SHORTCUT_ACTIONS.pocket,
      TOPBAR_SHORTCUT_ACTIONS.history,
      TOPBAR_SHORTCUT_ACTIONS.addGroup,
      TOPBAR_SHORTCUT_ACTIONS.settingsJumpMenu,
      "optimizePrompt",
      "insertPrompt",
      TOPBAR_SHORTCUT_ACTIONS.layout,
      "switchPlatformTab"
    ]
  },
  {
    titleKey: "shortcuts.chatTitle",
    descriptionKey: "shortcuts.chatDesc",
    actions: ["newChat", "toggleMessageNavigator", "closeChat", "refreshPage", "reloadChat", "enterFullscreen"]
  }
];

const SHORTCUT_PREVIEW_META = Object.freeze({
  sendMessage: { icon: "send", labelKey: "topbar.send", tooltipLabelKey: "topbar.sendTooltip", tooltipId: "topbar.send", showLabel: true, primary: true },
  focusInput: { icon: "keyboard", labelKey: "shortcut.focusInput.label" },
  openNewWorkspaceTab: { icon: "external", labelKey: "shortcut.openNewWorkspaceTab.label", showLabel: true },
  toggleWorkspaceTabsSidebar: { icon: "sidebarExpand", labelKey: "shortcut.toggleWorkspaceTabsSidebar.label", tooltipId: "topbar.workspaceTabs" },
  openSettings: { icon: "settings", labelKey: "shortcut.openSettings.label", showLabel: true },
  openAppPicker: { icon: "plus", labelKey: "shortcut.openAppPicker.label", showLabel: true },
  openSettingsMenu: { icon: "moreTools", labelKey: "shortcut.openSettingsMenu.label", showLabel: true },
  newChatAll: { icon: "edit", labelKey: "topbar.newChat", tooltipLabelKey: "topbar.newChatAllTooltip", tooltipId: "topbar.newChat", showLabel: true },
  deleteThread: { icon: "trash", labelKey: "topbar.deleteThread", tooltipId: "topbar.deleteThread" },
  optimizePrompt: { icon: "sparkles", labelKey: "topbar.optimizePrompt", tooltipId: "topbar.optimizePrompt" },
  openSummaryPanel: { icon: "summary", labelKey: "topbar.summary", tooltipId: "topbar.summary", showLabel: true },
  openSharePanel: { icon: "share", labelKey: "topbar.share", tooltipId: "topbar.share", showLabel: true },
  openPocketPanel: { icon: "pocket", labelKey: "topbar.pocket", tooltipId: "topbar.pocket", showLabel: true },
  openHistoryPanel: { icon: "history", labelKey: "topbar.history", tooltipId: "topbar.history", showLabel: true },
  insertPrompt: { icon: "insert", labelKey: "shortcut.insertPrompt.label", showSlot: true },
  switchLayout: { icon: "layout", labelKey: "topbar.switchLayout", tooltipId: "topbar.layout", showSlot: true },
  switchPlatformTab: { icon: "apps", labelKey: "shortcut.switchPlatformTab.label", showSlot: true },
  newChat: { icon: "edit", labelKey: "topbar.newChat", tooltipId: "workspace.group.newChat" },
  toggleMessageNavigator: { icon: "navigator", labelKey: "chat.messageNavigator", tooltipId: "workspace.group.messageNavigator" },
  closeChat: { icon: "x", labelKey: "common.close", tooltipId: "workspace.tab.close" },
  refreshPage: { icon: "reload", labelKey: "chat.refreshPage", tooltipId: "workspace.group.refreshPage" },
  reloadChat: { icon: "home", labelKey: "chat.home", tooltipId: "workspace.group.reload" },
  enterFullscreen: { icon: "maximize", labelKey: "chat.fullscreen", tooltipId: "workspace.group.fullscreen" }
});

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
const CONFIG_IO_AUTOSAVE_TIMEOUT_MS = 5000;

function normalizeShortcutSettingsTab(value) {
  return value === "chat" ? "chat" : "topbar";
}

export function createShortcutSettings(ctx) {
  const { state, svgIcon, notifyConfigReload, settingsKit } = ctx;
  const keyboardPlatform = detectKeyboardPlatform();
  const {
    settingsActions,
    settingsBlock,
    settingsEmptyRow,
    settingsIconAction,
    settingsInnerTabs,
    settingsList
  } = settingsKit;
  let shortcutAutoSaveError = null;
  let shortcutAutoSaveRunning = false;
  let shortcutAutoSavePending = null;
  let shortcutAutoSaveRedraw = null;
  let shortcutSearchQuery = "";
  let shortcutSearchFocused = false;
  let shortcutSearchComposing = false;
  let shortcutSearchSelection = { start: 0, end: 0 };

  function shortcutConfigKey(config) {
    return JSON.stringify(normalizeShortcutConfig(config));
  }

  function queueShortcutAutoSave(config, redraw = null) {
    const next = normalizeShortcutConfig(config);
    state.shortcutDraftConfig = next;
    const conflicts = shortcutConflictActions(next, keyboardPlatform);
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
        shortcutAutoSaveError = null;
        await notifyConfigReload();
        if (!shortcutAutoSavePending && shortcutConfigKey(state.shortcutDraftConfig) === shortcutConfigKey(next)) {
          state.shortcutDraftConfig = normalizeShortcutConfig(state.shortcutConfig);
          redraw?.();
        }
      }
    } catch (error) {
      shortcutAutoSaveError = error;
      console.warn("[ChatClub] Failed to auto-save shortcuts", error);
      toast(t("toast.shortcutsAutoSaveFailed"), "error");
    } finally {
      shortcutAutoSaveRunning = false;
      if (shortcutAutoSavePending) flushShortcutAutoSave();
    }
  }

  async function drainShortcutAutoSave() {
    const startedAt = Date.now();
    if (shortcutAutoSavePending && !shortcutAutoSaveRunning) flushShortcutAutoSave();
    while (shortcutAutoSaveRunning || shortcutAutoSavePending) {
      if (shortcutAutoSavePending && !shortcutAutoSaveRunning) flushShortcutAutoSave();
      if (Date.now() - startedAt > CONFIG_IO_AUTOSAVE_TIMEOUT_MS) {
        throw new Error(t("toast.importAutosaveTimeout"));
      }
      await sleep(20);
    }
    if (shortcutAutoSaveError) {
      throw new Error(t("toast.importAutosaveFailed"));
    }
  }

  async function prepareForConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (!selected.has("shortcutConfig")) return;
    state.shortcutRecordingAction = "";
    await drainShortcutAutoSave();
    shortcutAutoSaveRedraw = null;
    state.shortcutDraftConfig = null;
  }

  async function prepareForConfigExport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (!selected.has("shortcutConfig")) return;
    await drainShortcutAutoSave();
  }

  function resetAfterConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (!selected.has("shortcutConfig")) return;
    shortcutAutoSaveError = null;
    shortcutAutoSavePending = null;
    shortcutAutoSaveRedraw = null;
    state.shortcutDraftConfig = null;
    state.shortcutRecordingAction = "";
    shortcutSearchQuery = "";
    shortcutSearchFocused = false;
    shortcutSearchComposing = false;
    shortcutSearchSelection = { start: 0, end: 0 };
  }

  function shortcutActionLabel(action) {
    return t(`shortcut.${action}.label`);
  }

  function shortcutActionDescription(action) {
    return t(`shortcut.${action}.desc`);
  }

  function formatShortcutDisplay(action, shortcut, slot = "") {
    const label = formatShortcut(action, shortcut, slot, keyboardPlatform);
    return label === "Disabled" ? t("common.disabled") : label;
  }

  function shortcutSearchFields(action) {
    const shortcut = shortcutDraftProfile().shortcuts[action];
    const live = shortcut ? { ...shortcut, disabled: false } : shortcut;
    return {
      action,
      shortcut,
      label: shortcutActionLabel(action),
      description: shortcutActionDescription(action),
      formatted: formatShortcut(action, live, "", keyboardPlatform),
      extraTexts: shortcut?.disabled ? [t("common.disabled")] : [],
      platform: keyboardPlatform
    };
  }

  function shortcutActionMatchesSearch(action, query) {
    return shortcutMatchesSearchQuery(query, shortcutSearchFields(action));
  }

  function sendMessageMatchesSearch(query) {
    const profile = shortcutDraftProfile();
    const modifier = keyboardPlatform === "mac" ? "⌘" : "Ctrl";
    const formatted = profile.sendKeyMode === "mod-enter" ? `${modifier}+Enter` : "Enter";
    return shortcutMatchesSearchQuery(query, {
      action: "sendMessage",
      shortcut: null,
      label: t("shortcuts.sendMessage"),
      description: t("shortcuts.sendMessageDesc", { modifier }),
      formatted,
      extraTexts: [
        t("shortcuts.sendKey"),
        t("shortcuts.enterSends"),
        t("shortcuts.modEnterSends", { modifier }),
        "Enter",
        "Shift+Enter",
        `${modifier}+Enter`
      ],
      platform: keyboardPlatform
    });
  }

  function visibleShortcutGroups(query) {
    const needle = String(query || "").trim();
    if (!needle) {
      const active = normalizeShortcutSettingsTab(state.shortcutSettingsTab);
      return [active === "chat" ? SHORTCUT_SETTING_GROUPS[1] : SHORTCUT_SETTING_GROUPS[0]];
    }
    return SHORTCUT_SETTING_GROUPS.map((group) => ({
      titleKey: group.titleKey,
      descriptionKey: group.descriptionKey,
      actions: group.actions.filter((action) => shortcutActionMatchesSearch(action, needle))
    })).filter((group) => group.actions.length);
  }

  function restoreShortcutSearchField() {
    requestAnimationFrame(() => {
      if (state.shortcutRecordingAction) return;
      const field = document.querySelector(".shortcut-search-input");
      if (!field) return;
      if (shortcutSearchFocused) field.focus();
      try {
        const start = Number(shortcutSearchSelection.start);
        const end = Number(shortcutSearchSelection.end);
        field.setSelectionRange(
          Number.isFinite(start) ? start : field.value.length,
          Number.isFinite(end) ? end : field.value.length
        );
      } catch {
        /* selection restoration is best-effort after redraw */
      }
    });
  }

  function applyShortcutSearchQuery(value, { composing = false, redraw } = {}) {
    shortcutSearchQuery = String(value || "");
    const field = document.querySelector(".shortcut-search-input");
    shortcutSearchSelection = {
      start: Number(field?.selectionStart) || shortcutSearchQuery.length,
      end: Number(field?.selectionEnd) || shortcutSearchQuery.length
    };
    if (composing || shortcutSearchComposing) return;
    redraw();
  }

  function clearShortcutSearch(redraw) {
    shortcutSearchQuery = "";
    shortcutSearchSelection = { start: 0, end: 0 };
    shortcutSearchFocused = true;
    redraw();
  }

  function shortcutSearchField(redraw) {
    const placeholder = t("shortcuts.searchPlaceholder");
    const query = shortcutSearchQuery;
    const searching = Boolean(String(query || "").trim());
    const field = input(query, {
      class: "shortcut-search-input",
      type: "search",
      size: "1",
      placeholder,
      "aria-label": placeholder,
      autocomplete: "off",
      spellcheck: "false"
    });
    field.value = query;
    restoreShortcutSearchField();
    field.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        if (!query) return;
        event.preventDefault();
        clearShortcutSearch(redraw);
        return;
      }
      if (state.shortcutRecordingAction) return;
      const captured = shortcutSearchQueryFromKeyboardEvent(event, keyboardPlatform);
      if (!captured) return;
      event.preventDefault();
      event.stopPropagation();
      shortcutSearchQuery = captured;
      shortcutSearchSelection = { start: captured.length, end: captured.length };
      redraw();
    });
    field.addEventListener("compositionstart", () => { shortcutSearchComposing = true; });
    field.addEventListener("compositionend", (event) => {
      shortcutSearchComposing = false;
      applyShortcutSearchQuery(String(event?.target?.value || ""), { redraw });
    });
    field.addEventListener("input", (event) => {
      applyShortcutSearchQuery(String(event?.target?.value || ""), {
        composing: Boolean(event?.isComposing),
        redraw
      });
    });
    field.addEventListener("focus", () => { shortcutSearchFocused = true; });
    field.addEventListener("blur", () => { shortcutSearchFocused = false; });
    return el("div", {
      class: "shortcut-search",
      onclick: (event) => {
        if (event.target.closest(".shortcut-search-clear")) return;
        field.focus();
      }
    },
      svgIcon("search"),
      el("span", { class: "shortcut-search-sizer", "aria-hidden": "true" }, query || placeholder),
      field,
      searching
        ? el("button", {
          class: "shortcut-search-clear",
          type: "button",
          "aria-label": t("shortcuts.searchClear"),
          onpointerdown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearShortcutSearch(redraw);
          }
        }, svgIcon("x"))
        : null
    );
  }

  function shortcutPreviewButton(action, disabled) {
    const meta = SHORTCUT_PREVIEW_META[action] || { icon: "keyboard", labelKey: `shortcut.${action}.label` };
    const label = t(meta.labelKey);
    const tooltipLabel = t(meta.tooltipLabelKey || meta.labelKey);
    const slot = meta.showSlot ? "1-9" : "";
    const text = meta.showLabel ? label : slot;
    const sample = el("button", {
      class: `tooltip-preview-button shortcut-preview-button tooltip-trigger ${meta.primary ? "shortcut-preview-primary" : ""} ${disabled ? "tooltip-preview-disabled" : ""}`.trim(),
      type: "button",
      "aria-label": `${t("shortcuts.preview")}: ${label}`,
      "data-tooltip": tooltipLabel,
      "data-tooltip-id": meta.tooltipId || null,
      "data-tooltip-placement": "left",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
      }
    },
      svgIcon(meta.icon),
      text ? el("span", {}, text) : null
    );
    return el("span", { class: "tooltip-preview-cell shortcut-preview-cell" }, sample);
  }

  function shortcutDraft() {
    if (!state.shortcutDraftConfig) state.shortcutDraftConfig = normalizeShortcutConfig(state.shortcutConfig);
    return state.shortcutDraftConfig;
  }

  function shortcutDraftProfile() {
    return shortcutProfile(shortcutDraft(), keyboardPlatform);
  }

  function updateShortcutDraft(action, patch) {
    const draft = shortcutDraft();
    const profile = shortcutProfile(draft, keyboardPlatform);
    state.shortcutDraftConfig = replaceShortcutProfile(draft, keyboardPlatform, {
      ...profile,
      shortcuts: {
        ...profile.shortcuts,
        [action]: {
          ...profile.shortcuts[action],
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
    if (event.isComposing || event.keyCode === 229) return;
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
    if (keyboardPlatform === "windows" && event.metaKey) {
      toast(t("shortcuts.windowsKeyUnsupported"), "error");
      return;
    }
    const shortcut = shortcutFromKeyboardEvent(event, action, keyboardPlatform);
    if (!shortcut) {
      toast(shortcutUsesDigitPattern(action, shortcutDraftProfile().shortcuts[action])
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
    const shortcut = shortcutDraftProfile().shortcuts[action];
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
      shortcutPreviewButton(action, disabled),
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
      settingsIconAction(t("shortcuts.reset"), "reset", () => {
        const defaults = defaultShortcutProfile(keyboardPlatform);
        const next = updateShortcutDraft(action, defaults.shortcuts[action]);
        queueShortcutAutoSave(next, redraw);
        redraw();
      }, "shortcut-reset", false, "settings.action.reset")
    );
  }

  function shortcutHelpTrigger(label, placement = "center") {
    return el("button", {
      class: "icon-button compact-icon shortcut-help-trigger tooltip-trigger",
      type: "button",
      "aria-label": label,
      "data-tooltip": label,
      "data-tooltip-id": "settings.shortcuts.help",
      "data-tooltip-placement": placement,
      "data-tooltip-wrap": "true"
    }, svgIcon("info"));
  }

  function shortcutGroupBlock(group, conflicts, redraw) {
    return settingsBlock(
      el("span", { class: "shortcut-block-title" },
        el("span", {}, t(group.titleKey)),
        shortcutHelpTrigger(t("shortcuts.info"), "right")
      ),
      t(group.descriptionKey),
      settingsList([t("shortcuts.action"), t("shortcuts.preview"), t("shortcuts.shortcut"), t("common.enabled"), ""],
        group.actions.map((action) => shortcutRow(action, conflicts, redraw)),
        "shortcut-list"
      )
    );
  }

  function resetShortcutDraft(redraw) {
    state.shortcutDraftConfig = replaceShortcutProfile(
      shortcutDraft(),
      keyboardPlatform,
      defaultShortcutProfile(keyboardPlatform)
    );
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
    const profile = shortcutDraftProfile();
    const modifier = keyboardPlatform === "mac" ? "⌘" : "Ctrl";
    const sendMode = select(profile.sendKeyMode || "enter", [
      { value: "enter", label: t("shortcuts.enterSends") },
      { value: "mod-enter", label: t("shortcuts.modEnterSends", { modifier }) }
    ]);
    sendMode.value = profile.sendKeyMode || "enter";
    sendMode.setAttribute("aria-label", t("shortcuts.sendKey"));
    sendMode.addEventListener("change", () => {
      const draft = shortcutDraft();
      queueShortcutAutoSave(replaceShortcutProfile(draft, keyboardPlatform, {
        ...shortcutProfile(draft, keyboardPlatform),
        sendKeyMode: sendMode.value
      }));
    });
    return settingsBlock(t("shortcuts.sendMessage"), t("shortcuts.sendMessageDesc", { modifier }),
      settingsList([t("shortcuts.action"), t("shortcuts.preview"), t("shortcuts.sendKey")], [
        el("div", { class: "ui-list-row settings-list-row shortcut-input-row" },
          el("div", { class: "shortcut-row-copy" },
            el("strong", {}, t("shortcuts.sendMessage")),
            el("span", {}, t("shortcuts.sendMessageDesc", { modifier }))
          ),
          shortcutPreviewButton("sendMessage", false),
          sendMode
        )
      ], "shortcut-input-list")
    );
  }

  function shortcutActionSettingsBlocks(group, conflicts, redraw) {
    return [shortcutGroupBlock(group, conflicts, redraw)];
  }

  function shortcutsPane(redraw) {
    const active = normalizeShortcutSettingsTab(state.shortcutSettingsTab);
    state.shortcutSettingsTab = active;
    const draft = shortcutDraft();
    const conflicts = shortcutConflictActions(draft, keyboardPlatform);
    const query = shortcutSearchQuery;
    const searching = Boolean(String(query || "").trim());
    const groups = visibleShortcutGroups(query);
    const showSend = searching ? sendMessageMatchesSearch(query) : active === "topbar";
    const activeBlocks = [
      ...(conflicts.size ? [el("div", { class: "shortcut-conflict-banner" }, t("shortcuts.conflict"))] : []),
      ...(showSend ? [shortcutInputSettingsBlock()] : []),
      ...groups.flatMap((group) => shortcutActionSettingsBlocks(group, conflicts, redraw)),
      ...(searching && !showSend && !groups.length ? [settingsEmptyRow(t("shortcuts.searchEmpty"))] : [])
    ];
    const platformLabel = t(keyboardPlatform === "mac" ? "shortcuts.platformMac" : "shortcuts.platformWindows");
    const platformHelp = t("shortcuts.platformDetected", { platform: platformLabel });
    return el("div", { class: "settings-pane" },
      el("div", { class: "shortcut-tabs-row" },
        settingsInnerTabs([
          ["topbar", t("topbar.customize.title"), t("shortcuts.topbarTabDesc")],
          ["chat", t("shortcuts.chatTab"), t("shortcuts.chatTabDesc")]
        ], active, (id) => {
          state.shortcutSettingsTab = id;
          state.shortcutRecordingAction = "";
          redraw();
        }),
        shortcutHelpTrigger(platformHelp, "right")
      ),
      ...activeBlocks,
      shortcutSettingsActions(redraw)
    );
  }

  return Object.freeze({
    prepareForConfigImport,
    prepareForConfigExport,
    resetAfterConfigImport,
    shortcutsHeaderSearch: shortcutSearchField,
    shortcutsPane
  });
}
