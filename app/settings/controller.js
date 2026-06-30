import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_OPTIONS,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS,
  TAB_GROUP_HEADER_BUTTONS,
  TOOLTIP_TARGET_GROUPS
} from "../../shared/constants.js";
import { SUMMARY_SITE_CONFIGS } from "../../shared/summary-sites.js";
import { t } from "../../shared/i18n.js";
import {
  createId,
  normalizeTabGroupButtonPlacement,
  normalizeTabGroupButtonOrder,
  normalizePrimaryColor,
  saveCustomConfig,
  saveOptions,
  savePromptLibrary
} from "../../shared/storage.js";
import { createPromptLibraryController } from "../prompt-library/controller.js";
import {
  button,
  clear,
  el,
  field,
  input,
  modal,
  select,
  textarea,
  toast
} from "../../ui/dom.js";
import { createImportExportSettings } from "./import-export.js";
import {
  SETTINGS_SECTIONS,
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem,
  settingsSectionMeta
} from "./kit.js";
import { createShortcutSettings } from "./shortcuts.js";

export function createSettingsController(ctx) {
  const {
    state,
    svgIcon,
    syncPromptInputNode,
    notifyConfigReload,
    render,
    syncTopbar = () => {},
    syncSummaryPanel = () => {},
    syncWorkspaceDom = () => {},
    applyPreferredModels = () => {},
    applyTheme,
    syncI18nLanguage,
    hydrateGroups,
    enterTopbarEditMode
  } = ctx;
  let closeActiveSettingsDialog = null;

  const settingsKit = createSettingsKit({ svgIcon });
  const {
    settingsActions,
    settingsBlock,
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = settingsKit;
  let activeTabGroupButtonDrag = null;
  let appearanceAutoSaveRunning = false;
  let appearanceAutoSavePending = null;
  let appearanceAutoSaveRedraw = null;
  let appearanceColorSaveTimer = 0;
  let modelPreferenceAutoSaveRunning = false;
  let modelPreferenceAutoSavePending = null;
  let modelPreferenceAutoSaveRedraw = null;

  const queueAppearanceAutoSave = (patch, options = {}) => {
    appearanceAutoSavePending = {
      ...(appearanceAutoSavePending || {}),
      ...patch
    };
    if (typeof options.redraw === "function") appearanceAutoSaveRedraw = options.redraw;
    flushAppearanceAutoSave();
  };

  async function flushAppearanceAutoSave() {
    if (appearanceAutoSaveRunning) return;
    appearanceAutoSaveRunning = true;
    try {
      while (appearanceAutoSavePending) {
        const patch = appearanceAutoSavePending;
        const redraw = appearanceAutoSaveRedraw;
        appearanceAutoSavePending = null;
        appearanceAutoSaveRedraw = null;
        state.options = await saveOptions({
          ...state.options,
          ...patch
        });
        syncI18nLanguage();
        applyTheme();
        syncTopbar();
        syncWorkspaceDom();
        syncSummaryPanel();
        redraw?.();
      }
    } catch (error) {
      console.warn("[ChatClub] Failed to auto-save appearance settings", error);
      toast(t("toast.appearanceAutoSaveFailed"), "error");
    } finally {
      appearanceAutoSaveRunning = false;
      if (appearanceAutoSavePending) flushAppearanceAutoSave();
    }
  }

  function queueAppearanceColorSave(primaryColor) {
    clearTimeout(appearanceColorSaveTimer);
    appearanceColorSaveTimer = setTimeout(() => {
      queueAppearanceAutoSave({
        primaryColor,
        primaryColorCustom: true
      });
    }, 250);
  }

  function tabGroupButtonsModeForPlacement(placement) {
    return TAB_GROUP_HEADER_BUTTONS.some((item) => !item.requiredPinned && placement[item.id] === "menu") ? "hidden" : "pinned";
  }

  function modelPreferenceKey(config) {
    return JSON.stringify({
      ...DEFAULT_OPTIONS.modelPreferences,
      ...(config || {})
    });
  }

  function queueModelPreferenceAutoSave(config, options = {}) {
    const next = {
      ...DEFAULT_OPTIONS.modelPreferences,
      ...(config || {})
    };
    state.modelPreferenceDraft = next;
    modelPreferenceAutoSavePending = next;
    if (typeof options.redraw === "function") modelPreferenceAutoSaveRedraw = options.redraw;
    flushModelPreferenceAutoSave();
  }

  async function flushModelPreferenceAutoSave() {
    if (modelPreferenceAutoSaveRunning) return;
    modelPreferenceAutoSaveRunning = true;
    try {
      while (modelPreferenceAutoSavePending) {
        const next = modelPreferenceAutoSavePending;
        const redraw = modelPreferenceAutoSaveRedraw;
        modelPreferenceAutoSavePending = null;
        modelPreferenceAutoSaveRedraw = null;
        state.options = await saveOptions({
          ...state.options,
          modelPreferences: next
        });
        await notifyConfigReload();
        await Promise.resolve(applyPreferredModels(null, { immediate: true }));
        if (!modelPreferenceAutoSavePending && modelPreferenceKey(state.modelPreferenceDraft) === modelPreferenceKey(next)) {
          state.modelPreferenceDraft = {
            ...DEFAULT_OPTIONS.modelPreferences,
            ...(state.options.modelPreferences || {})
          };
          redraw?.();
        }
      }
    } catch (error) {
      console.warn("[ChatClub] Failed to auto-save model preferences", error);
      toast(t("toast.modelPreferencesAutoSaveFailed"), "error");
    } finally {
      modelPreferenceAutoSaveRunning = false;
      if (modelPreferenceAutoSavePending) flushModelPreferenceAutoSave();
    }
  }

  function preventTabGroupButtonNativeDrag(event) {
    if (!activeTabGroupButtonDrag) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function tabGroupButtonDropTargetFromPoint(clientX, clientY) {
    const pointTarget = document.elementFromPoint(clientX, clientY);
    const targetFromZone = (zone) => {
      const placement = zone?.dataset?.placement === "menu" ? "menu" : "pinned";
      const rows = Array.from(zone?.querySelectorAll?.(".tab-group-button-placement-row") || [])
        .filter((row) => row.dataset?.buttonId && row.dataset.buttonId !== activeTabGroupButtonDrag?.item?.id);
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          return {
            placement,
            targetId: row.dataset.buttonId,
            targetPosition: "before"
          };
        }
      }
      const lastRow = rows[rows.length - 1];
      return {
        placement,
        targetId: lastRow?.dataset?.buttonId || "",
        targetPosition: lastRow ? "after" : "end"
      };
    };
    const zone = pointTarget?.closest?.(".tab-group-button-placement-zone");
    if (zone?.dataset?.placement === "pinned" || zone?.dataset?.placement === "menu") {
      return targetFromZone(zone);
    }
    const zones = Array.from(document.querySelectorAll(".tab-group-button-placement-zone"));
    if (!zones.length) {
      return {
        placement: activeTabGroupButtonDrag?.targetPlacement || "pinned",
        targetId: "",
        targetPosition: "end"
      };
    }
    const pinnedZone = zones.find((node) => node.dataset?.placement === "pinned");
    const menuZone = zones.find((node) => node.dataset?.placement === "menu");
    if (!pinnedZone || !menuZone) {
      return {
        placement: activeTabGroupButtonDrag?.targetPlacement || "pinned",
        targetId: "",
        targetPosition: "end"
      };
    }
    const pinnedRect = pinnedZone.getBoundingClientRect();
    const menuRect = menuZone.getBoundingClientRect();
    return targetFromZone(clientY < (pinnedRect.bottom + menuRect.top) / 2 ? pinnedZone : menuZone);
  }

  function previewTabGroupButtonDrop(clientX, clientY) {
    if (!activeTabGroupButtonDrag) return;
    const { placement, targetId, targetPosition } = tabGroupButtonDropTargetFromPoint(clientX, clientY);
    activeTabGroupButtonDrag.targetPlacement = placement;
    activeTabGroupButtonDrag.targetId = targetId;
    activeTabGroupButtonDrag.targetPosition = targetPosition;
    document.querySelectorAll(".tab-group-button-placement-row").forEach((node) => {
      node.classList.toggle("drop-before", node.dataset?.buttonId === targetId && targetPosition === "before");
      node.classList.toggle("drop-after", node.dataset?.buttonId === targetId && targetPosition === "after");
    });
    document.querySelectorAll(".tab-group-button-placement-zone").forEach((node) => {
      node.classList.toggle("drop-target", node.dataset?.placement === placement);
    });
  }

  function cleanupTabGroupButtonDrag() {
    const drag = activeTabGroupButtonDrag;
    activeTabGroupButtonDrag = null;
    state.settingsTabGroupButtonDragId = "";
    document.body.classList.remove("settings-tab-group-button-dragging");
    cleanupSettingsDragRows(".tab-group-button-placement-row");
    document.querySelectorAll(".tab-group-button-placement-zone").forEach((node) => node.classList.remove("drop-target"));
    document.removeEventListener("pointermove", handleTabGroupButtonPointerMove, true);
    document.removeEventListener("pointerup", handleTabGroupButtonPointerUp, true);
    document.removeEventListener("pointercancel", handleTabGroupButtonPointerUp, true);
    document.removeEventListener("selectstart", preventTabGroupButtonNativeDrag, true);
    document.removeEventListener("dragstart", preventTabGroupButtonNativeDrag, true);
    document.removeEventListener("dragover", preventTabGroupButtonNativeDrag, true);
    document.removeEventListener("drop", preventTabGroupButtonNativeDrag, true);
    drag?.row?.releasePointerCapture?.(drag.pointerId);
  }

  function dropTabGroupButton() {
    const drag = activeTabGroupButtonDrag;
    if (!drag || !drag.started) {
      cleanupTabGroupButtonDrag();
      return;
    }
    const sourceId = drag.item.id;
    const nextPlacement = normalizeTabGroupButtonPlacement(
      {
        ...state.settingsTabGroupButtonPlacementDraft,
        [sourceId]: drag.targetPlacement
      },
      state.options.tabGroupButtonsMode
    );
    const currentOrder = normalizeTabGroupButtonOrder(state.settingsTabGroupButtonOrderDraft);
    const withoutSource = currentOrder.filter((id) => id !== sourceId);
    let insertIndex = withoutSource.length;
    if (drag.targetId && drag.targetId !== sourceId) {
      const targetIndex = withoutSource.indexOf(drag.targetId);
      if (targetIndex >= 0) insertIndex = targetIndex + (drag.targetPosition === "after" ? 1 : 0);
    } else {
      const samePlacementIds = withoutSource.filter((id) => nextPlacement[id] === drag.targetPlacement);
      if (samePlacementIds.length) {
        insertIndex = withoutSource.indexOf(samePlacementIds[samePlacementIds.length - 1]) + 1;
      } else if (drag.targetPlacement === "pinned") {
        insertIndex = 0;
      }
    }
    const nextOrder = [
      ...withoutSource.slice(0, insertIndex),
      sourceId,
      ...withoutSource.slice(insertIndex)
    ];
    state.settingsTabGroupButtonPlacementDraft = nextPlacement;
    state.settingsTabGroupButtonOrderDraft = normalizeTabGroupButtonOrder(nextOrder);
    queueAppearanceAutoSave({
      tabGroupButtonsMode: tabGroupButtonsModeForPlacement(nextPlacement),
      tabGroupButtonPlacement: nextPlacement,
      tabGroupButtonOrder: state.settingsTabGroupButtonOrderDraft
    });
    const redraw = drag.redraw;
    cleanupTabGroupButtonDrag();
    redraw?.();
  }

  function handleTabGroupButtonPointerMove(event) {
    const drag = activeTabGroupButtonDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < 4) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started) {
      drag.started = true;
      state.settingsTabGroupButtonDragId = drag.item.id;
      drag.row?.classList.add("dragging");
      document.body.classList.add("settings-tab-group-button-dragging");
    }
    previewTabGroupButtonDrop(event.clientX, event.clientY);
  }

  function handleTabGroupButtonPointerUp(event) {
    const drag = activeTabGroupButtonDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.remove("settings-tab-group-button-dragging");
    dropTabGroupButton();
  }

  function startTabGroupButtonDrag(event, item, redraw) {
    if (event.button !== 0) return;
    cleanupTabGroupButtonDrag();
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    const row = event.currentTarget?.closest?.(".tab-group-button-placement-row") || event.currentTarget;
    const currentPlacement = state.settingsTabGroupButtonPlacementDraft?.[item.id] || item.defaultPlacement || "pinned";
    activeTabGroupButtonDrag = {
      item,
      row,
      redraw,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetPlacement: currentPlacement === "menu" ? "menu" : "pinned",
      targetId: "",
      targetPosition: "end",
      started: false
    };
    row?.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handleTabGroupButtonPointerMove, true);
    document.addEventListener("pointerup", handleTabGroupButtonPointerUp, true);
    document.addEventListener("pointercancel", handleTabGroupButtonPointerUp, true);
    document.addEventListener("selectstart", preventTabGroupButtonNativeDrag, true);
    document.addEventListener("dragstart", preventTabGroupButtonNativeDrag, true);
    document.addEventListener("dragover", preventTabGroupButtonNativeDrag, true);
    document.addEventListener("drop", preventTabGroupButtonNativeDrag, true);
  }

  function openSettings(initialSection = "appearance") {
    const validSectionIds = new Set(SETTINGS_SECTIONS.map(([id]) => id));
    let active = validSectionIds.has(initialSection) ? initialSection : "appearance";
    const host = el("div", { class: "settings-shell" });
    const close = () => {
      state.shortcutDraftConfig = null;
      state.shortcutRecordingAction = "";
      state.summaryCollectorEditingId = "";
      state.summaryCollectorDragId = "";
      state.settingsPromptTemplateDragId = "";
      state.settingsPromptLibraryDragId = "";
      state.settingsProfileDragId = "";
      state.settingsCustomAppDragId = "";
      state.settingsAppearanceTab = "workspace";
      state.settingsTabGroupButtonPlacementDraft = null;
      state.settingsTabGroupButtonOrderDraft = null;
      state.settingsTabGroupButtonDragId = "";
      state.modelPreferenceDraft = null;
      cleanupTabGroupButtonDrag();
      closeActiveSettingsDialog = null;
      dialog.remove();
    };
    closeActiveSettingsDialog = close;
    const dialog = modal(t("settings.title"), host, close, true, t("common.close"));
    dialog.querySelector(".modal")?.classList.add("settings-modal");
    const modalTitle = dialog.querySelector(".modal-header h2");
    const modalSectionTitle = el("div", { class: "settings-modal-section-title" });
    const modalAppIcon = svgIcon("settings");
    modalAppIcon.classList.add("settings-modal-app-icon");
    modalTitle?.replaceWith(el("div", { class: "settings-modal-titlebar" },
      el("div", { class: "settings-modal-app-title" },
        modalAppIcon,
        el("span", {}, t("settings.appTitle"))
      ),
      modalSectionTitle
    ));
    const redraw = () => {
      clear(host);
      const section = settingsSectionMeta(active);
      clear(modalSectionTitle);
      modalSectionTitle.append(
        el("h3", {}, section.label),
        el("p", {}, section.description)
      );
      host.append(
        el("aside", { class: "settings-sidebar" },
          el("nav", { class: "settings-tabs", "aria-label": t("settings.sections") },
            SETTINGS_SECTIONS.map(([id, labelKey, descriptionKey, icon]) => el("button", {
              class: `settings-tab ${id === active ? "active" : ""}`,
              type: "button",
              onclick: () => { active = id; redraw(); }
            },
              svgIcon(icon),
              el("span", { class: "settings-tab-copy" },
                el("strong", {}, t(labelKey)),
                el("small", {}, t(descriptionKey))
              )
            ))
          )
        ),
        el("main", { class: "settings-main" }, settingsPane(active, redraw, (id) => {
          active = id;
          redraw();
        }))
      );
    };
    redraw();
  }

  function settingsPane(active, redraw, goToSection = () => {}) {
    if (active === "appearance") return appearancePane(redraw);
    if (active === "profiles") return profilesPane(redraw);
    if (active === "apps") return appsPane(redraw);
    if (active === "models") return modelPreferencesPane(redraw);
    if (active === "summary") return summarySettingsPane(redraw, goToSection);
    if (active === "optimize") return optimizeSettingsPane(redraw, goToSection);
    if (active === "prompts") return promptLibraryPane(redraw);
    if (active === "shortcuts") return shortcutsPane(redraw);
    return importExportPane(redraw);
  }

  function appearancePane(redraw = () => {}) {
    let primaryColorDraft = normalizePrimaryColor(state.options.primaryColor);
    const colorHexPattern = /^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
    const appearanceTabIds = new Set(["workspace", "topbar", "tabGroup", "tooltips"]);
    if (!appearanceTabIds.has(state.settingsAppearanceTab)) state.settingsAppearanceTab = "workspace";
    const themeMode = select(state.options.themeMode || "system", [
      { value: "system", label: t("appearance.followSystem") },
      { value: "light", label: t("appearance.light") },
      { value: "dark", label: t("appearance.dark") }
    ], {
      onchange: () => {
        const nextThemeMode = themeMode.value || "system";
        queueAppearanceAutoSave({ themeMode: nextThemeMode });
      }
    });
    const language = select(state.options.language || "system", [
      { value: "system", label: t("appearance.followBrowser") },
      { value: "en", label: t("appearance.english") },
      { value: "zh_CN", label: t("appearance.simplifiedChinese") }
    ], {
      onchange: () => {
        const nextLanguage = language.value || "system";
        queueAppearanceAutoSave({ language: nextLanguage }, { redraw });
      }
    });
    const columnCount = select(String(state.options.colMaxCount || 0), [
      { value: "0", label: t("appearance.autoColumns") },
      { value: "1", label: t("appearance.oneColumn") },
      { value: "2", label: t("appearance.columns", { count: 2 }) },
      { value: "3", label: t("appearance.columns", { count: 3 }) },
      { value: "4", label: t("appearance.columns", { count: 4 }) }
    ], {
      onchange: () => {
        const nextColumnCount = Number(columnCount.value) || 0;
        queueAppearanceAutoSave({ colMaxCount: nextColumnCount });
      }
    });
    if (!state.settingsTabGroupButtonPlacementDraft) {
      state.settingsTabGroupButtonPlacementDraft = normalizeTabGroupButtonPlacement(
        state.options.tabGroupButtonPlacement,
        state.options.tabGroupButtonsMode
      );
    }
    if (!state.settingsTabGroupButtonOrderDraft) {
      state.settingsTabGroupButtonOrderDraft = normalizeTabGroupButtonOrder(state.options.tabGroupButtonOrder);
    }
    const tabGroupButtonPlacement = state.settingsTabGroupButtonPlacementDraft;
    const tabGroupButtonOrder = state.settingsTabGroupButtonOrderDraft;
    const colorPicker = el("input", {
      class: "appearance-color-picker",
      type: "color",
      value: primaryColorDraft,
      title: t("appearance.primaryColor"),
      "aria-label": t("appearance.primaryColor")
    });
    const colorText = input(primaryColorDraft, {
      class: "input appearance-color-text",
      spellcheck: "false",
      inputmode: "text",
      maxlength: "7",
      "aria-label": t("appearance.primaryColor")
    });
    const colorPreview = el("span", {
      class: "appearance-color-preview",
      style: { "--appearance-color": primaryColorDraft },
      "aria-hidden": "true"
    });
    const syncColorDraft = (value, fromPicker = false) => {
      const raw = String(value || "").trim();
      const normalized = normalizePrimaryColor(raw, primaryColorDraft);
      if (fromPicker || colorHexPattern.test(raw)) {
        primaryColorDraft = normalized;
        colorPicker.value = normalized;
        colorText.value = normalized;
        colorPreview.style.setProperty("--appearance-color", normalized);
        queueAppearanceColorSave(normalized);
      } else {
        colorText.value = raw;
      }
    };
    const restoreColorDraft = () => {
      colorPicker.value = primaryColorDraft;
      colorText.value = primaryColorDraft;
      colorPreview.style.setProperty("--appearance-color", primaryColorDraft);
    };
    colorPicker.addEventListener("input", () => syncColorDraft(colorPicker.value, true));
    colorPicker.addEventListener("change", () => syncColorDraft(colorPicker.value, true));
    colorText.addEventListener("input", () => syncColorDraft(colorText.value));
    colorText.addEventListener("blur", () => {
      if (!colorHexPattern.test(String(colorText.value || "").trim())) restoreColorDraft();
    });
    const colorControl = el("div", { class: "appearance-color-control" },
      colorPicker,
      colorText,
      colorPreview,
      el("small", { class: "appearance-color-help" }, t("appearance.primaryColorHelp"))
    );
    const appearanceRow = (node) => el("div", { class: "appearance-field-row" }, node);
    const saveTooltipToggle = async (targetId, enabled, inputNode) => {
      const current = new Set(state.options.tooltipDisabledIds || []);
      if (enabled) current.delete(targetId);
      else current.add(targetId);
      state.options = await saveOptions({
        ...state.options,
        tooltipDisabledIds: [...current]
      });
      inputNode.checked = !(state.options.tooltipDisabledIds || []).includes(targetId);
      document.dispatchEvent(new CustomEvent("chatclub:tooltips-updated"));
    };
    const tooltipPreviewIcon = (targetId) => ({
      "topbar.brand": "brand",
      "topbar.settings": "settings",
      "topbar.promptLibrary": "library",
      "topbar.optimizePrompt": "sparkles",
      "topbar.send": "send",
      "topbar.newChat": "edit",
      "topbar.summary": "summary",
      "topbar.pocket": "pocket",
      "topbar.addGroup": "plus",
      "topbar.layout": "layout",
      "topbar.settingsJumpMenu": "moreTools",
      "topbar.settings.appearance": "palette",
      "topbar.settings.profiles": "key",
      "topbar.settings.apps": "apps",
      "topbar.settings.models": "model",
      "topbar.settings.summary": "summary",
      "topbar.settings.optimize": "sparkles",
      "topbar.settings.prompts": "library",
      "topbar.settings.shortcuts": "keyboard",
      "topbar.settings.io": "transfer",
      "topbar.customize.paletteItem": "grip",
      "topbar.customize.enter": "customizeTopbar",
      "topbar.customize.cancel": "x",
      "workspace.group.addApp": "plus",
      "workspace.group.openInNewTab": "external",
      "workspace.group.copyLink": "copy",
      "workspace.group.reload": "reload",
      "workspace.group.fullscreen": "maximize",
      "workspace.group.remove": "x",
      "workspace.group.more": "more",
      "workspace.tab.close": "x",
      "workspace.layout.add": "plus",
      "workspace.layout.delete": "trash",
      "summary.window.fullscreen": "maximize",
      "summary.window.close": "x",
      "summary.source.refresh": "reload",
      "summary.action.pocket": "pocket",
      "summary.action.preview": "preview",
      "summary.action.summarize": "summary",
      "summary.action.ask": "send",
      "pocket.fullscreen": "maximize",
      "pocket.copyUserMessage": "copy",
      "pocket.copyAssistantMessage": "copy",
      "pocket.openChat": "external",
      "pocket.actions": "more",
      "pocket.focusMode": "focusMode",
      "pocket.exitFocusMode": "insert",
      "pocket.collapseSidebar": "sidebarCollapse",
      "pocket.expandSidebar": "sidebarExpand",
      "pocket.deleteItem": "trash",
      "optimize.retry": "reload",
      "settings.modal.close": "x",
      "settings.profiles.promotion": "external",
      "settings.action.edit": "edit",
      "settings.action.duplicate": "copy",
      "settings.action.delete": "trash",
      "settings.action.reset": "reload",
      "settings.shortcuts.record": "keyboard"
    })[targetId] || "settings";
    const tooltipPreviewButton = (target, disabled) => {
      const label = t(target.labelKey);
      const iconName = tooltipPreviewIcon(target.id);
      const sample = el("button", {
        class: `tooltip-preview-button tooltip-trigger ${disabled ? "tooltip-preview-disabled" : ""} ${iconName === "brand" ? "tooltip-preview-brand" : ""}`.trim(),
        type: "button",
        "aria-label": `${t("appearance.tooltipPreview")}: ${label}`,
        "data-tooltip": label,
        "data-tooltip-id": target.id,
        "data-tooltip-placement": "left",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
        }
      },
        iconName === "brand"
          ? [el("img", { class: "tooltip-preview-brand-logo", src: "icons/logo.svg", alt: "", draggable: "false" }), el("span", {}, "ChatClub")]
          : svgIcon(iconName),
        ["topbar.send", "topbar.newChat", "topbar.summary", "topbar.pocket", "summary.action.summarize", "summary.action.ask"].includes(target.id)
          ? el("span", {}, label)
          : null
      );
      return el("span", { class: "tooltip-preview-cell" }, sample);
    };
    const tooltipToggleRow = (target) => {
      const disabled = (state.options.tooltipDisabledIds || []).includes(target.id);
      const checkbox = el("input", {
        type: "checkbox",
        role: "switch",
        checked: !disabled,
        "aria-label": `${t(target.labelKey)} ${disabled ? t("common.disabled") : t("common.enabled")}`,
        onchange: async (event) => {
          await saveTooltipToggle(target.id, event.target.checked, event.target);
          redraw();
        }
      });
      return el("div", { class: "tooltip-toggle-row" },
        el("span", { class: "tooltip-toggle-copy" },
          el("strong", {}, t(target.labelKey)),
          el("small", {}, target.id)
        ),
        tooltipPreviewButton(target, disabled),
        el("label", { class: "tooltip-toggle-switch" },
          checkbox,
          el("span", {}, t(target.labelKey))
        )
      );
    };
    const tooltipBlock = () => settingsBlock(t("appearance.buttonTooltips"), t("appearance.buttonTooltipsDesc"),
      el("div", { class: "tooltip-settings-list" },
        TOOLTIP_TARGET_GROUPS.map((group) => el("section", { class: "tooltip-settings-group" },
          el("h5", { class: "tooltip-settings-group-title" }, t(group.labelKey)),
          el("div", { class: "tooltip-settings-rows" },
            group.targets.map(tooltipToggleRow)
          )
        ))
      )
    );
    const workspaceBlock = () => settingsBlock(t("appearance.workspace"), t("appearance.workspaceDesc"),
        el("div", { class: "appearance-field-list" },
          appearanceRow(field(t("appearance.themeMode"), themeMode)),
          appearanceRow(field(t("appearance.language"), language)),
          appearanceRow(field(t("appearance.maxColumns"), columnCount)),
          appearanceRow(field(t("appearance.primaryColor"), colorControl))
        )
      );
    const tabGroupButtonLabel = (id) => ({
      addApp: t("chat.addApp"),
      reload: t("chat.reload"),
      fullscreen: t("chat.fullscreen"),
      openInNewTab: t("common.openInNewTab"),
      copyLink: t("common.copyLink"),
      removeGroup: t("chat.removeGroup"),
      more: t("chat.more")
    })[id] || id;
    const tabGroupConfigurableButtons = () => TAB_GROUP_HEADER_BUTTONS.filter((item) => !item.requiredPinned);
    const tabGroupButtonById = new Map(tabGroupConfigurableButtons().map((item) => [item.id, item]));
    const orderedTabGroupConfigurableButtons = () => normalizeTabGroupButtonOrder(tabGroupButtonOrder)
      .map((id) => tabGroupButtonById.get(id))
      .filter(Boolean);
    const tabGroupButtonsForPlacement = (placement) => orderedTabGroupConfigurableButtons()
      .filter((item) => (tabGroupButtonPlacement[item.id] || item.defaultPlacement || "pinned") === placement);
    const renderTabGroupPlacementRow = (item) => el("div", {
      class: `tab-group-button-placement-row ${item.danger ? "is-danger" : ""}`.trim(),
      dataset: { buttonId: item.id },
      draggable: "false",
      onpointerdown: (event) => startTabGroupButtonDrag(event, item, redraw),
      ondragstart: preventTabGroupButtonNativeDrag,
      ondragend: cleanupTabGroupButtonDrag
    },
      settingsDragHandle(tabGroupButtonLabel(item.id)),
      el("span", { class: "tab-group-button-placement-icon", "aria-hidden": "true" }, svgIcon(item.icon)),
      el("span", { class: "tab-group-button-placement-copy" },
        el("strong", {}, tabGroupButtonLabel(item.id))
      )
    );
    const tabGroupPlacementDivider = () => el("div", { class: "tab-group-button-placement-divider", role: "separator" },
      el("span", { class: "tab-group-button-placement-divider-line", "aria-hidden": "true" }),
      el("span", { class: "tab-group-button-placement-divider-label" },
        svgIcon("more"),
        el("span", {}, t("chat.more"))
      ),
      el("span", { class: "tab-group-button-placement-divider-line", "aria-hidden": "true" })
    );
    const tabGroupPlacementZone = (placement, items, emptyText) => el("div", {
      class: `tab-group-button-placement-zone is-${placement}`,
      "data-placement": placement,
      ondragover: preventTabGroupButtonNativeDrag,
      ondrop: preventTabGroupButtonNativeDrag
    },
      items.length
        ? items.map(renderTabGroupPlacementRow)
        : el("div", { class: "tab-group-button-placement-empty" }, emptyText)
    );
    const tabGroupBlock = () => settingsBlock(t("appearance.tabGroup"), t("appearance.tabGroupDesc"),
      el("div", { class: "appearance-field-list" },
        el("p", { class: "settings-muted-help" }, t("appearance.tabGroupButtonsHelp")),
        el("div", { class: "tab-group-button-placement-list" },
          tabGroupPlacementZone("pinned", tabGroupButtonsForPlacement("pinned"), t("appearance.tabGroupDropPinned")),
          tabGroupPlacementDivider(),
          tabGroupPlacementZone("menu", tabGroupButtonsForPlacement("menu"), t("appearance.tabGroupDropMenu"))
        )
      )
    );
    const activeAppearancePane = state.settingsAppearanceTab === "topbar"
      ? topbarLayoutBlock()
      : state.settingsAppearanceTab === "tabGroup"
        ? tabGroupBlock()
        : state.settingsAppearanceTab === "tooltips"
          ? tooltipBlock()
          : workspaceBlock();
    return el("div", { class: "settings-pane appearance-settings-pane" },
      settingsInnerTabs([
        ["workspace", t("appearance.workspace"), t("appearance.workspaceTabDesc")],
        ["topbar", t("topbar.customize.title"), t("topbar.customize.tabDesc")],
        ["tabGroup", t("appearance.tabGroup"), t("appearance.tabGroupTabDesc")],
        ["tooltips", t("appearance.buttonTooltips"), t("appearance.buttonTooltipsTabDesc")]
      ], state.settingsAppearanceTab, (id) => {
        state.settingsAppearanceTab = id;
        redraw();
      }),
      activeAppearancePane
    );
  }

  function topbarLayoutBlock() {
    const enterTopbarEditModeFromSettings = () => {
      const closeSettings = closeActiveSettingsDialog;
      closeSettings?.();
      requestAnimationFrame(() => enterTopbarEditMode?.());
    };
    return settingsBlock(t("topbar.customize.title"), t("topbar.customize.desc"),
      settingsPaneToolbar(t("topbar.customize.help"),
        settingsPrimaryAction(t("topbar.customize.enter"), "customizeTopbar", enterTopbarEditModeFromSettings)
      ),
      el("div", { class: "topbar-customizer topbar-customizer-launcher" },
        el("p", { class: "topbar-layout-hint" }, t("topbar.customize.dragHint"))
      )
    );
  }

  function profilesPane(redraw) {
    const rows = state.options.apiProfiles.length
      ? state.options.apiProfiles.map((profile) => profileRow(profile, redraw))
      : settingsEmptyRow(t("profiles.noProfiles"));
    return el("div", { class: "settings-pane settings-manager-pane" },
      settingsPaneToolbar(t("profiles.manage"),
        settingsPrimaryAction(t("profiles.add"), "plus", () => openApiProfileEditor(null, redraw))
      ),
      settingsList(["", t("profiles.provider"), t("profiles.model"), t("profiles.usage"), t("profiles.actions")], rows, "settings-manager-list api-profile-list")
    );
  }

  function apiProfileUsageChips(profile) {
    const usages = [];
    if (state.options.optimizeApiProfileId === profile.id) usages.push(t("profiles.optimizeSettings"));
    if (state.options.summaryApiProfileId === profile.id) usages.push(t("profiles.summarySettings"));
    if (!usages.length) usages.push(t("profiles.notAssigned"));
    return el("div", { class: "settings-usage-chips" },
      usages.map((usage) => el("span", { class: `settings-usage-chip ${usage === t("profiles.notAssigned") ? "muted" : ""}`.trim() }, usage))
    );
  }

  function profileRow(profile, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row api-profile-row",
      draggable: "true",
      dataset: { profileId: profile.id },
      ondragstart: (event) => startApiProfileDrag(event, profile),
      ondragend: cleanupApiProfileDrag,
      ondragover: (event) => previewApiProfileDrop(event, profile),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropApiProfile(event, profile, redraw)
    },
      settingsDragHandle(t("profiles.provider")),
      el("strong", { class: "settings-main-cell" }, profile.name || profile.id),
      el("span", { class: "settings-muted-cell" }, profile.model || t("profiles.noModel")),
      apiProfileUsageChips(profile),
      el("div", { class: "settings-row-action-group" },
        profile.registerUrl ? settingsIconAction(t("profiles.openPromotionChannel"), "external", () => openApiPromotionChannel(profile), "", false, "settings.profiles.promotion") : null,
        settingsIconAction(t("common.edit"), "edit", () => openApiProfileEditor(profile, redraw), "", false, "settings.action.edit"),
        settingsIconAction(t("profiles.duplicate"), "copy", () => duplicateApiProfile(profile, redraw), "", false, "settings.action.duplicate"),
        settingsIconAction(t("common.delete"), "trash", () => deleteApiProfile(profile, redraw), "danger", state.options.apiProfiles.length <= 1, "settings.action.delete")
      )
    );
  }

  function openApiPromotionChannel(profile) {
    if (!profile?.registerUrl) return;
    window.open(profile.registerUrl, "_blank", "noopener,noreferrer");
  }

  function startApiProfileDrag(event, profile) {
    state.settingsProfileDragId = profile.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-api-profile", profile.id);
    event.dataTransfer?.setData("text/plain", profile.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupApiProfileDrag() {
    state.settingsProfileDragId = "";
    cleanupSettingsDragRows(".api-profile-row");
  }

  function previewApiProfileDrop(event, profile) {
    const sourceId = state.settingsProfileDragId || event.dataTransfer?.getData("application/x-chatclub-api-profile") || "";
    if (!sourceId || sourceId === profile.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropApiProfile(event, targetProfile, redraw) {
    const sourceId = state.settingsProfileDragId || event.dataTransfer?.getData("application/x-chatclub-api-profile") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetProfile.id) return;
    event.preventDefault();
    const apiProfiles = moveListItem(state.options.apiProfiles, sourceId, targetProfile.id, settingsListDropPlacement(event));
    cleanupApiProfileDrag();
    await saveApiProfiles(apiProfiles, redraw, t("toast.apiProfileOrderSaved"), { reloadRuntime: false });
  }

  async function saveApiProfiles(apiProfiles, redraw, message = t("toast.apiProfilesSaved"), options = {}) {
    const fallbackId = apiProfiles[0]?.id || "";
    const profileIds = new Set(apiProfiles.map((profile) => profile.id));
    state.options = await saveOptions({
      ...state.options,
      apiProfiles,
      optimizeApiProfileId: profileIds.has(state.options.optimizeApiProfileId) ? state.options.optimizeApiProfileId : fallbackId,
      summaryApiProfileId: profileIds.has(state.options.summaryApiProfileId) ? state.options.summaryApiProfileId : fallbackId
    });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
    if (message) toast(message, "success");
  }

  function openApiProfileEditor(profile, redraw) {
    const editing = Boolean(profile);
    const draft = structuredClone(profile || {
      id: createId("api"),
      name: "New API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-3.5-turbo"
    });
    const nameInput = input(draft.name, { placeholder: t("profiles.providerName") });
    const endpointInput = input(draft.endpoint, { placeholder: "https://api.openai.com/v1/chat/completions" });
    const keyInput = input(draft.apiKey, { placeholder: t("profiles.apiKey"), type: "password" });
    const modelInput = input(draft.model, { placeholder: t("profiles.model") });
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const nextProfile = {
        ...draft,
        name: nameInput.value.trim() || "API Profile",
        endpoint: endpointInput.value.trim(),
        apiKey: keyInput.value,
        model: modelInput.value.trim()
      };
      if (!nextProfile.endpoint || !nextProfile.model) return toast(t("profiles.endpointModelRequired"), "error");
      const apiProfiles = editing
        ? state.options.apiProfiles.map((item) => item.id === draft.id ? nextProfile : item)
        : [...state.options.apiProfiles, nextProfile];
      await saveApiProfiles(apiProfiles, redraw, editing ? t("toast.apiProfileUpdated") : t("toast.apiProfileAdded"));
      close();
    };
    dialog = modal(editing ? t("profiles.edit") : t("profiles.addTitle"),
      el("div", { class: "settings-editor-form" },
        el("div", { class: "settings-dialog-grid" },
          field(t("profiles.provider"), nameInput),
          field(t("profiles.model"), modelInput),
          field(t("profiles.endpoint"), endpointInput),
          field(t("profiles.apiKey"), keyInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("profiles.save") : t("profiles.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function duplicateApiProfile(profile, redraw) {
    const index = state.options.apiProfiles.findIndex((item) => item.id === profile.id);
    const duplicate = {
      ...structuredClone(profile),
      id: createId("api"),
      name: `${profile.name || "API Profile"} Copy`
    };
    const apiProfiles = [...state.options.apiProfiles];
    apiProfiles.splice(index + 1, 0, duplicate);
    await saveApiProfiles(apiProfiles, redraw, t("toast.apiProfileDuplicated"));
  }

  async function deleteApiProfile(profile, redraw) {
    if (state.options.apiProfiles.length <= 1) return toast(t("profiles.keepOne"), "error");
    if (!window.confirm(t("profiles.deleteConfirm", { name: profile.name || "this API profile" }))) return;
    await saveApiProfiles(state.options.apiProfiles.filter((item) => item.id !== profile.id), redraw, t("toast.apiProfileDeleted"));
  }

  function appsPane(redraw) {
    const rows = state.customConfig.length
      ? state.customConfig.map((app) => customAppRow(app, redraw))
      : settingsEmptyRow(t("apps.noApps"));
    return el("div", { class: "settings-pane settings-manager-pane" },
      settingsPaneToolbar(t("apps.manage"),
        settingsPrimaryAction(t("apps.add"), "plus", () => openCustomAppEditor(null, redraw))
      ),
      settingsList(["", t("apps.platformName"), t("apps.platformUrl"), t("apps.inputSelector"), t("apps.sendButtonSelector"), t("apps.action")], rows, "settings-manager-list custom-config-list")
    );
  }

  function customAppRow(app, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row custom-config-row",
      draggable: "true",
      dataset: { customAppId: app.id },
      ondragstart: (event) => startCustomAppDrag(event, app),
      ondragend: cleanupCustomAppDrag,
      ondragover: (event) => previewCustomAppDrop(event, app),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropCustomApp(event, app, redraw)
    },
      settingsDragHandle(t("apps.platformName")),
      el("strong", { class: "settings-main-cell" }, app.name || app.id),
      el("a", { class: "settings-url-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url),
      el("code", { class: "settings-selector-cell" }, app.inputSelector || t("apps.default")),
      el("code", { class: "settings-selector-cell" }, app.sendButtonSelector || t("apps.default")),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("common.edit"), "edit", () => openCustomAppEditor(app, redraw), "", false, "settings.action.edit"),
        settingsIconAction(t("common.delete"), "trash", () => deleteCustomApp(app, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function startCustomAppDrag(event, app) {
    state.settingsCustomAppDragId = app.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-custom-app", app.id);
    event.dataTransfer?.setData("text/plain", app.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupCustomAppDrag() {
    state.settingsCustomAppDragId = "";
    cleanupSettingsDragRows(".custom-config-row");
  }

  function previewCustomAppDrop(event, app) {
    const sourceId = state.settingsCustomAppDragId || event.dataTransfer?.getData("application/x-chatclub-custom-app") || "";
    if (!sourceId || sourceId === app.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropCustomApp(event, targetApp, redraw) {
    const sourceId = state.settingsCustomAppDragId || event.dataTransfer?.getData("application/x-chatclub-custom-app") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetApp.id) return;
    event.preventDefault();
    const customConfig = moveListItem(state.customConfig, sourceId, targetApp.id, settingsListDropPlacement(event));
    cleanupCustomAppDrag();
    await saveCustomConfigList(customConfig, redraw, t("toast.customConfigOrderSaved"), { syncWorkspace: false, reloadRuntime: false });
  }

  async function saveCustomConfigList(customConfig, redraw, message = t("toast.customConfigSaved"), options = {}) {
    state.customConfig = await saveCustomConfig(customConfig);
    if (options.reloadRuntime !== false) await notifyConfigReload();
    if (options.syncWorkspace !== false) {
      hydrateGroups();
      render();
    }
    redraw?.();
    if (message) toast(message, "success");
  }

  function openCustomAppEditor(app, redraw) {
    const editing = Boolean(app);
    const draft = structuredClone(app || {
      id: createId("custom-app"),
      name: "Custom App",
      provider: "Custom",
      url: "https://www.example.com/",
      inputSelector: "",
      sendButtonSelector: ""
    });
    const nameInput = input(draft.name, { placeholder: t("apps.platformName") });
    const providerInput = input(draft.provider, { placeholder: t("apps.provider") });
    const urlInput = input(draft.url, { placeholder: "https://example.com/" });
    const inputSelectorInput = input(draft.inputSelector, { placeholder: t("apps.inputSelector") });
    const sendSelectorInput = input(draft.sendButtonSelector, { placeholder: t("apps.sendButtonSelector") });
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const nextApp = {
        ...draft,
        name: nameInput.value.trim(),
        provider: providerInput.value.trim() || "Custom",
        url: urlInput.value.trim(),
        inputSelector: inputSelectorInput.value.trim(),
        sendButtonSelector: sendSelectorInput.value.trim()
      };
      if (!nextApp.name || !nextApp.url) return toast(t("apps.nameUrlRequired"), "error");
      try {
        new URL(nextApp.url);
      } catch {
        return toast(t("apps.invalidUrl"), "error");
      }
      const customConfig = editing
        ? state.customConfig.map((item) => item.id === draft.id ? nextApp : item)
        : [...state.customConfig, nextApp];
      await saveCustomConfigList(customConfig, redraw, editing ? t("toast.customPlatformUpdated") : t("toast.customPlatformAdded"));
      close();
    };
    dialog = modal(editing ? t("apps.editTitle") : t("apps.addTitle"),
      el("div", { class: "settings-editor-form" },
        el("div", { class: "settings-dialog-grid" },
          field(t("apps.platformName"), nameInput),
          field(t("apps.provider"), providerInput),
          field(t("apps.platformUrl"), urlInput),
          field(t("apps.inputSelector"), inputSelectorInput),
          field(t("apps.sendButtonSelector"), sendSelectorInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("apps.save") : t("apps.addTitle"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function deleteCustomApp(app, redraw) {
    if (!window.confirm(t("apps.deleteConfirm", { name: app.name || "this custom platform" }))) return;
    await saveCustomConfigList(state.customConfig.filter((item) => item.id !== app.id), redraw, t("toast.customPlatformDeleted"));
  }

  const MODEL_PREFERENCE_APP_LABELS = Object.freeze({
    Gemini: "Gemini",
    Grok: "Grok",
    DeepSeek: "DeepSeek",
    NotionAI: "Notion AI"
  });

  function modelPreferenceDraft() {
    if (!state.modelPreferenceDraft) {
      state.modelPreferenceDraft = {
        ...DEFAULT_OPTIONS.modelPreferences,
        ...(state.options.modelPreferences || {})
      };
    }
    return state.modelPreferenceDraft;
  }

  function modelPreferenceOptions(appId) {
    return (MODEL_PREFERENCE_TARGETS[appId] || []).map((target) => ({
      value: target.id,
      label: target.id ? target.label : t("modelPreferences.none")
    }));
  }

  function geminiThinkingLevelLabel(value) {
    const normalized = GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === value)
      ? value
      : DEFAULT_GEMINI_THINKING_LEVEL;
    return normalized === "extended"
      ? t("modelPreferences.thinkingExtended")
      : t("modelPreferences.thinkingStandard");
  }

  function geminiThinkingLevelSwitch() {
    const draft = modelPreferenceDraft();
    const value = GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === draft[GEMINI_THINKING_LEVEL_PREFERENCE_KEY])
      ? draft[GEMINI_THINKING_LEVEL_PREFERENCE_KEY]
      : DEFAULT_GEMINI_THINKING_LEVEL;
    const checkbox = el("input", {
      type: "checkbox",
      role: "switch",
      "aria-label": t("modelPreferences.thinkingLevel"),
      checked: value === "extended"
    });
    const valueNode = el("span", { class: "model-thinking-toggle-value" }, geminiThinkingLevelLabel(value));
    checkbox.addEventListener("change", () => {
      const next = checkbox.checked ? "extended" : "standard";
      valueNode.textContent = geminiThinkingLevelLabel(next);
      queueModelPreferenceAutoSave({
        ...modelPreferenceDraft(),
        [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: next
      });
    });
    return el("label", { class: "model-thinking-toggle" },
      checkbox,
      el("span", { class: "model-thinking-toggle-track" },
        el("span", { class: "model-thinking-toggle-thumb" })
      ),
      el("span", { class: "model-thinking-toggle-copy" },
        valueNode
      )
    );
  }

  function modelPreferenceRow(appId) {
    const draft = modelPreferenceDraft();
    const modelSelect = select(draft[appId] || "", modelPreferenceOptions(appId));
    modelSelect.value = draft[appId] || "";
    modelSelect.addEventListener("change", () => {
      queueModelPreferenceAutoSave({
        ...modelPreferenceDraft(),
        [appId]: modelSelect.value
      });
    });
    return el("div", { class: "ui-list-row settings-list-row model-preference-row" },
      el("strong", { class: "settings-main-cell" }, MODEL_PREFERENCE_APP_LABELS[appId] || appId),
      modelSelect,
      appId === "Gemini"
        ? geminiThinkingLevelSwitch()
        : el("span", { class: "model-thinking-toggle-placeholder", "aria-hidden": "true" })
    );
  }

  function clearModelPreferenceDraft(redraw) {
    state.modelPreferenceDraft = { ...DEFAULT_OPTIONS.modelPreferences };
    queueModelPreferenceAutoSave(state.modelPreferenceDraft, { redraw });
    redraw();
  }

  function modelPreferencesPane(redraw) {
    const block = settingsBlock(t("modelPreferences.title"), t("modelPreferences.desc"),
      settingsList(
        [t("modelPreferences.platform"), t("modelPreferences.preferredModel"), t("modelPreferences.thinkingLevel")],
        Object.keys(MODEL_PREFERENCE_TARGETS).map((appId) => modelPreferenceRow(appId)),
        "settings-manager-list model-preference-list"
      ),
      settingsActions(
        button(t("modelPreferences.clear"), () => clearModelPreferenceDraft(redraw))
      )
    );
    block.classList.add("model-preference-block");
    return el("div", { class: "settings-pane settings-manager-pane model-preferences-pane" },
      settingsPaneToolbar(t("modelPreferences.manage")),
      block
    );
  }

  function profileOptions(selected) {
    return state.options.apiProfiles.map((profile) => ({ value: profile.id, label: profile.name || profile.id }));
  }

  const PROMPT_TEMPLATE_SETTINGS = {
    summary: {
      labelKey: "settings.summary.title",
      listKey: "summaryPromptTemplates",
      activeKey: "summaryPromptTemplateId",
      profileKey: "summaryApiProfileId",
      defaultId: DEFAULT_OPTIONS.summaryPromptTemplateId,
      defaults: DEFAULT_OPTIONS.summaryPromptTemplates,
      defaultPrompt: DEFAULT_OPTIONS.summaryPromptTemplates[0]?.prompt || "",
      profileToastKey: "toast.summaryProfileSaved",
      templateToastKey: "toast.summaryTemplateSaved",
      copyKey: "summary.templateCopy"
    },
    optimize: {
      labelKey: "settings.optimize.title",
      listKey: "optimizePromptTemplates",
      activeKey: "optimizePromptTemplateId",
      profileKey: "optimizeApiProfileId",
      defaultId: DEFAULT_OPTIONS.optimizePromptTemplateId,
      defaults: DEFAULT_OPTIONS.optimizePromptTemplates,
      defaultPrompt: DEFAULT_OPTIONS.optimizePromptTemplates[0]?.prompt || "",
      profileToastKey: "toast.optimizeProfileSaved",
      templateToastKey: "toast.optimizeTemplateSaved",
      copyKey: "optimize.templateCopy"
    }
  };

  function promptTemplateMeta(kind) {
    return PROMPT_TEMPLATE_SETTINGS[kind] || PROMPT_TEMPLATE_SETTINGS.summary;
  }

  function promptTemplateList(kind) {
    const meta = promptTemplateMeta(kind);
    return state.options[meta.listKey] || [];
  }

  function activePromptTemplate(kind) {
    const meta = promptTemplateMeta(kind);
    const templates = promptTemplateList(kind);
    return templates.find((item) => item.id === state.options[meta.activeKey]) || templates[0] || meta.defaults[0];
  }

  function promptTemplateBuiltInDefault(kind, template) {
    const meta = promptTemplateMeta(kind);
    return (meta.defaults || []).find((item) => item.id === template.id) || null;
  }

  function promptTemplatePreview(prompt) {
    return String(prompt || "").replace(/\s+/g, " ").trim() || t("promptTemplates.empty");
  }

  function promptTemplateLabel(kind, template) {
    if (template?.builtIn && template.id === DEFAULT_OPTIONS.summaryPromptTemplateId) return t("promptTemplates.defaultSummary");
    if (template?.builtIn && template.id === DEFAULT_OPTIONS.optimizePromptTemplateId) return t("promptTemplates.defaultOptimize");
    return template?.title || template?.id || "";
  }

  async function savePromptTemplateState(kind, templates, activeId, redraw, message, options = {}) {
    const meta = promptTemplateMeta(kind);
    state.options = await saveOptions({
      ...state.options,
      [meta.listKey]: templates,
      [meta.activeKey]: activeId || templates[0]?.id || meta.defaultId
    });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
    if (message) toast(message, "success");
  }

  function openPromptTemplateEditor(kind, template, redraw) {
    const meta = promptTemplateMeta(kind);
    const editing = Boolean(template);
    const draft = structuredClone(template || {
      id: createId(`${kind}-template`),
      title: `New ${t(meta.labelKey)} Template`,
      prompt: meta.defaultPrompt,
      builtIn: false
    });
    const titleInput = input(promptTemplateLabel(kind, draft), { placeholder: t("promptTemplates.name") });
    const promptInput = textarea(draft.prompt, { placeholder: t("promptTemplates.prompt") });
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const nextTemplate = {
        ...draft,
        title: titleInput.value.trim() || `${t(meta.labelKey)} Template`,
        prompt: promptInput.value.trim()
      };
      if (!nextTemplate.prompt) return toast(t("promptTemplates.required"), "error");
      const templates = editing
        ? promptTemplateList(kind).map((item) => item.id === draft.id ? nextTemplate : item)
        : [...promptTemplateList(kind), nextTemplate];
      await savePromptTemplateState(
        kind,
        templates,
        editing ? state.options[meta.activeKey] : nextTemplate.id,
        redraw,
        editing ? t(meta.templateToastKey) : t("toast.promptAdded")
      );
      close();
    };
    dialog = modal(editing ? t("promptTemplates.edit", { kind: t(meta.labelKey) }) : t("promptTemplates.addTitle", { kind: t(meta.labelKey) }),
      el("div", { class: "settings-editor-form prompt-template-editor" },
        el("div", { class: "settings-dialog-grid" },
          field(t("promptTemplates.name"), titleInput),
          field(t("promptTemplates.prompt"), promptInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("promptTemplates.save") : t("promptTemplates.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function resetPromptTemplate(kind, template, redraw) {
    const defaults = promptTemplateBuiltInDefault(kind, template);
    if (!defaults) return;
    const templates = promptTemplateList(kind).map((item) => item.id === template.id ? structuredClone(defaults) : item);
    await savePromptTemplateState(kind, templates, state.options[promptTemplateMeta(kind).activeKey], redraw, t("toast.promptTemplateReset"));
  }

  async function resetActivePromptTemplate(kind, redraw) {
    const meta = promptTemplateMeta(kind);
    const template = activePromptTemplate(kind);
    const defaults = promptTemplateBuiltInDefault(kind, template);
    if (defaults) {
      await resetPromptTemplate(kind, template, redraw);
      return;
    }
    const defaultTemplate = meta.defaults[0];
    const templates = promptTemplateList(kind).some((item) => item.id === defaultTemplate.id)
      ? promptTemplateList(kind).map((item) => item.id === defaultTemplate.id ? structuredClone(defaultTemplate) : item)
      : [structuredClone(defaultTemplate), ...promptTemplateList(kind)];
    await savePromptTemplateState(kind, templates, defaultTemplate.id, redraw, t("toast.promptTemplateReset"));
  }

  async function deletePromptTemplate(kind, template, redraw) {
    const meta = promptTemplateMeta(kind);
    if (template.builtIn) return;
    if (!window.confirm(t("promptTemplates.deleteConfirm", { name: promptTemplateLabel(kind, template) || t("promptTemplates.fallbackName") }))) return;
    const templates = promptTemplateList(kind).filter((item) => item.id !== template.id);
    const activeId = state.options[meta.activeKey] === template.id ? (templates[0]?.id || meta.defaultId) : state.options[meta.activeKey];
    await savePromptTemplateState(kind, templates, activeId, redraw, t("toast.promptTemplateDeleted"));
  }

  function promptTemplateRow(kind, template, redraw) {
    const meta = promptTemplateMeta(kind);
    const active = state.options[meta.activeKey] === template.id;
    const builtInDefault = promptTemplateBuiltInDefault(kind, template);
    return el("div", {
      class: `ui-list-row settings-list-row settings-manager-row prompt-template-row ${active ? "prompt-template-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { promptTemplateId: template.id, promptTemplateKind: kind },
      ondragstart: (event) => startPromptTemplateDrag(event, kind, template),
      ondragend: cleanupPromptTemplateDrag,
      ondragover: (event) => previewPromptTemplateDrop(event, kind, template),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropPromptTemplate(event, kind, template, redraw)
    },
      settingsDragHandle(t("promptTemplates.title")),
      el("div", { class: "prompt-template-name" },
        el("strong", {}, promptTemplateLabel(kind, template)),
        template.builtIn ? el("span", { class: "summary-collector-star", title: t("promptTemplates.builtIn"), "aria-label": t("promptTemplates.builtIn") }, "★") : null
      ),
      el("label", { class: "settings-check prompt-template-active", title: active ? t("promptTemplates.activeTemplate") : t("promptTemplates.setActive") },
        el("input", {
          type: "checkbox",
          "aria-label": `${promptTemplateLabel(kind, template)} ${t("promptTemplates.active")}`,
          checked: active,
          onchange: async (event) => {
            if (!event.target.checked) {
              event.target.checked = true;
              return;
            }
            await savePromptTemplateState(kind, promptTemplateList(kind), template.id, redraw, t("toast.activeTemplateSaved"));
          }
        })
      ),
      el("p", { class: "prompt-template-preview" }, promptTemplatePreview(template.prompt)),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("promptTemplates.edit", { kind: t(meta.labelKey) }), "edit", () => openPromptTemplateEditor(kind, template, redraw), "", false, "settings.action.edit"),
        builtInDefault
          ? settingsIconAction(t("promptTemplates.reset"), "reload", () => resetPromptTemplate(kind, template, redraw), "settings-reset-icon", false, "settings.action.reset")
          : settingsIconAction(t("promptTemplates.delete"), "trash", () => deletePromptTemplate(kind, template, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function promptTemplateListBlock(kind, redraw) {
    const meta = promptTemplateMeta(kind);
    const rows = promptTemplateList(kind).length
      ? promptTemplateList(kind).map((template) => promptTemplateRow(kind, template, redraw))
      : settingsEmptyRow(t("promptTemplates.noTemplates"));
    return settingsBlock(t("promptTemplates.title"), "",
      settingsPaneToolbar(t(meta.copyKey),
        settingsPrimaryAction(t("promptTemplates.add"), "plus", () => openPromptTemplateEditor(kind, null, redraw))
      ),
      settingsList(["", t("promptTemplates.name"), t("promptTemplates.active"), t("promptTemplates.preview"), t("profiles.actions")], rows, "settings-manager-list prompt-template-list")
    );
  }

  function promptApiSettingsBlock(kind, redraw, goToSection) {
    const meta = promptTemplateMeta(kind);
    const profileSelect = select(state.options[meta.profileKey], profileOptions(), {
      onchange: async (event) => {
        state.options = await saveOptions({ ...state.options, [meta.profileKey]: event.target.value });
        await notifyConfigReload();
        toast(t(meta.profileToastKey), "success");
      }
    });
    return settingsBlock(`${t(meta.labelKey)} AI`, "",
      settingsPaneToolbar(t("summary.configureAi", { kind: t(meta.labelKey) }),
        button(t("summary.resetPrompt"), () => resetActivePromptTemplate(kind, redraw)),
        button(t("summary.manageProfiles"), () => goToSection("profiles"), "primary")
      ),
      field(t("summary.apiProfile"), profileSelect)
    );
  }

  function startPromptTemplateDrag(event, kind, template) {
    state.settingsPromptTemplateDragId = template.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-prompt-template", template.id);
    event.dataTransfer?.setData("application/x-chatclub-prompt-template-kind", kind);
    event.dataTransfer?.setData("text/plain", template.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupPromptTemplateDrag() {
    state.settingsPromptTemplateDragId = "";
    cleanupSettingsDragRows(".prompt-template-row");
  }

  function previewPromptTemplateDrop(event, kind, template) {
    const sourceId = state.settingsPromptTemplateDragId || event.dataTransfer?.getData("application/x-chatclub-prompt-template") || "";
    const sourceKind = event.dataTransfer?.getData("application/x-chatclub-prompt-template-kind") || kind;
    if (!sourceId || sourceId === template.id || sourceKind !== kind) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropPromptTemplate(event, kind, targetTemplate, redraw) {
    const sourceId = state.settingsPromptTemplateDragId || event.dataTransfer?.getData("application/x-chatclub-prompt-template") || event.dataTransfer?.getData("text/plain") || "";
    const sourceKind = event.dataTransfer?.getData("application/x-chatclub-prompt-template-kind") || kind;
    if (!sourceId || sourceId === targetTemplate.id || sourceKind !== kind) return;
    event.preventDefault();
    const templates = moveListItem(promptTemplateList(kind), sourceId, targetTemplate.id, settingsListDropPlacement(event));
    cleanupPromptTemplateDrag();
    await savePromptTemplateState(kind, templates, state.options[promptTemplateMeta(kind).activeKey], redraw, t("toast.promptTemplateOrderSaved"), { reloadRuntime: false });
  }

  function summaryPromptSettingsBlock() {
    const redraw = arguments[0] || (() => {});
    const goToSection = arguments[1] || (() => {});
    return el("div", { class: "settings-template-pane" },
      promptApiSettingsBlock("summary", redraw, goToSection),
      promptTemplateListBlock("summary", redraw)
    );
  }

  function summaryScriptsSettingsBlock(redraw) {
    return settingsBlock(t("summary.collectors.title"), t("summary.collectors.desc"),
      settingsList(["", t("summary.collector.name"), t("summary.collector.fallback"), t("summary.collector.enabled"), t("summary.collector.actions")], summaryCollectorRows(redraw), "summary-collector-list")
    );
  }

  function summarySettingsPane(redraw, goToSection = () => {}) {
    const active = state.summarySettingsTab === "scripts" ? "scripts" : "ai";
    return el("div", { class: "settings-pane" },
      settingsInnerTabs([
        ["ai", t("summary.aiTab"), t("summary.aiTabDesc")],
        ["scripts", t("summary.scriptsTab"), t("summary.scriptsTabDesc")]
      ], active, (id) => {
        state.summarySettingsTab = id;
        if (id !== "scripts") state.summaryCollectorEditingId = "";
        redraw();
      }),
      active === "scripts" ? summaryScriptsSettingsBlock(redraw) : summaryPromptSettingsBlock(redraw, goToSection)
    );
  }

  function summaryFallbackLabel(mode) {
    return mode === "allowPageText" ? t("summary.collector.pageText") : t("summary.collector.structured");
  }

  function summaryHostsText(config) {
    return (config.hosts || []).join(", ") || t("summary.collector.noHosts");
  }

  function summaryBuiltInDefault(config) {
    return SUMMARY_SITE_CONFIGS.find((item) => item.id === config.id) || null;
  }

  async function saveSummaryCollectors(configs, redraw, options = {}) {
    state.options = await saveOptions({ ...state.options, summarySiteConfigs: configs });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
  }

  function linesFromText(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function summaryCollectorUserscript(config) {
    return config.userscript || summaryBuiltInDefault(config)?.userscript || "";
  }

  function summaryCollectorRunModeLabel(mode) {
    return mode === "pageWorldFirst" ? t("summary.collector.pageWorldFirst") : t("summary.collector.serialBridge");
  }

  function openSummaryCollectorEditor(config, redraw) {
    const builtIn = summaryBuiltInDefault(config);
    const draft = structuredClone({
      enabled: true,
      fallbackMode: "structuredOnly",
      hosts: [],
      pathPrefixes: [],
      userscriptRunMode: "serial",
      userscriptTimeoutMs: 24000,
      copyTimeoutMs: "",
      ...config,
      userscript: summaryCollectorUserscript(config)
    });
    const nameInput = input(draft.name || draft.id, { placeholder: "ChatGPT" });
    const enabledInput = el("input", { type: "checkbox", checked: draft.enabled !== false });
    const hostsInput = textarea((draft.hosts || []).join("\n"), { placeholder: "chatgpt.com\n*.chatgpt.com" });
    const pathInput = textarea((draft.pathPrefixes || []).join("\n"), { placeholder: "/assistant" });
    const messagePullSelect = select(draft.fallbackMode || "structuredOnly", [
      { value: "structuredOnly", label: t("summary.collector.userscriptOnly") },
      { value: "allowPageText", label: t("summary.collector.withPageFallback") }
    ]);
    const runModeSelect = select(draft.userscriptRunMode || "serial", [
      { value: "serial", label: t("summary.collector.serialBridge") },
      { value: "pageWorldFirst", label: t("summary.collector.pageWorldFirst") }
    ]);
    const timeoutInput = input(String(draft.userscriptTimeoutMs || 24000), { type: "number", min: "5000", max: "45000", step: "1000" });
    const copyTimeoutInput = input(draft.copyTimeoutMs ? String(draft.copyTimeoutMs) : "", { type: "number", min: "300", max: "10000", step: "100", placeholder: t("common.optional") });
    const userscriptInput = textarea(draft.userscript || "", { placeholder: "return api.extractTurns(...)" });
    userscriptInput.classList.add("settings-code-textarea");
    hostsInput.classList.add("settings-compact-textarea");
    pathInput.classList.add("settings-compact-textarea");
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const hosts = linesFromText(hostsInput.value);
      const userscript = userscriptInput.value.trim();
      if (!nameInput.value.trim()) return toast(t("summary.collector.nameRequired"), "error");
      if (!hosts.length) return toast(t("summary.collector.hostsRequired"), "error");
      if (!userscript) return toast(t("summary.collector.userscriptRequired"), "error");
      const timeout = Math.max(5000, Math.min(45000, Number(timeoutInput.value) || 24000));
      const copyTimeout = copyTimeoutInput.value.trim() ? Math.max(300, Math.min(10000, Number(copyTimeoutInput.value) || 0)) : undefined;
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        fallbackMode: messagePullSelect.value,
        userscriptRunMode: runModeSelect.value,
        userscriptTimeoutMs: timeout,
        userscript,
        userscriptLength: userscript.length
      };
      if (copyTimeout) nextConfig.copyTimeoutMs = copyTimeout;
      else delete nextConfig.copyTimeoutMs;
      const configs = state.options.summarySiteConfigs.map((item) => item.id === config.id ? nextConfig : item);
      state.summaryCollectorEditingId = "";
      await saveSummaryCollectors(configs, redraw);
      toast(t("toast.summaryUserscriptSaved"), "success");
      close();
    };
    dialog = modal(t("summary.collector.editTitle"),
      el("div", { class: "settings-editor-form summary-userscript-editor" },
        el("div", { class: "settings-dialog-grid summary-userscript-grid" },
          field(t("summary.collector.name"), nameInput),
          el("label", { class: "settings-dialog-check" },
            enabledInput,
            el("span", {}, t("common.enabled"))
          ),
          field(t("summary.collector.hosts"), el("div", { class: "settings-field-stack" },
            hostsInput,
            el("small", {}, t("summary.collector.hostHelp"))
          )),
          field(t("summary.collector.pathPrefixes"), el("div", { class: "settings-field-stack" },
            pathInput,
            el("small", {}, t("summary.collector.pathHelp"))
          )),
          field(t("summary.collector.messagePull"), messagePullSelect),
          field(t("summary.collector.runMode"), runModeSelect),
          field(t("summary.collector.timeout"), timeoutInput),
          field(t("summary.collector.copyTimeout"), copyTimeoutInput)
        ),
        el("div", { class: "settings-info-callout" },
          svgIcon("summary"),
          el("div", {},
            el("strong", {}, t("summary.collector.infoTitle")),
            el("p", {}, t("summary.collector.infoBody"))
          )
        ),
        field(t("summary.collector.userscript"), userscriptInput),
        el("div", { class: "settings-dialog-actions" },
          builtIn ? button(t("summary.collector.resetBuiltIn"), async () => {
            await resetSummaryCollector(config, redraw);
            close();
          }) : null,
          button(t("common.cancel"), close),
          button(t("common.ok"), save, "primary")
        )
      ),
      close,
      true,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal", "settings-userscript-modal");
  }

  function summaryCollectorRows(redraw) {
    return state.options.summarySiteConfigs.flatMap((config) => {
      const expanded = state.summaryCollectorEditingId === config.id;
      const row = summaryCollectorRow(config, expanded, redraw);
      if (!expanded) return row;
      return [row, summaryCollectorDetails(config, redraw)];
    });
  }

  function summaryCollectorRow(config, expanded, redraw) {
    const builtIn = Boolean(config.builtIn);
    return el("div", {
      class: `ui-list-row settings-list-row summary-collector-row ${expanded ? "summary-collector-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { collectorId: config.id },
      onclick: (event) => {
        if (event.target instanceof Element && event.target.closest("button,input,select,a")) return;
        state.summaryCollectorEditingId = expanded ? "" : config.id;
        redraw();
      },
      ondragstart: (event) => startSummaryCollectorDrag(event, config),
      ondragend: cleanupSummaryCollectorDrag,
      ondragover: (event) => previewSummaryCollectorDrop(event, config),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropSummaryCollector(event, config, redraw)
    },
      settingsDragHandle(t("summary.collector.drag")),
      el("div", { class: "summary-collector-name" },
        el("strong", {}, config.name || config.id),
        builtIn ? el("span", { class: "summary-collector-star", title: t("summary.collector.builtIn"), "aria-label": t("summary.collector.builtIn") }, "★") : null
      ),
      el("span", { class: "summary-fallback-badge" }, summaryFallbackLabel(config.fallbackMode)),
      el("label", { class: "settings-check", title: config.enabled === false ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${config.name || config.id} ${t("summary.collector.enabled")}`,
          checked: config.enabled !== false,
          onchange: async (event) => {
            const configs = state.options.summarySiteConfigs.map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item);
            await saveSummaryCollectors(configs, redraw);
          }
        })
      ),
      el("div", { class: "settings-row-actions" },
        settingsIconAction(expanded ? t("common.close") : t("common.edit"), "edit", (event) => {
          event.stopPropagation();
          openSummaryCollectorEditor(config, redraw);
        }, "", false, "settings.action.edit"),
        settingsIconAction(t("common.reset"), "reload", async (event) => {
          event.stopPropagation();
          await resetSummaryCollector(config, redraw);
        }, "settings-reset-icon", !summaryBuiltInDefault(config), "settings.action.reset")
      )
    );
  }

  function summaryCollectorDetails(config, redraw) {
    const fallback = select(config.fallbackMode || "structuredOnly", [
      { value: "structuredOnly", label: t("summary.collector.structuredOnly") },
      { value: "allowPageText", label: t("summary.collector.allowPageText") }
    ], {
      onchange: async (event) => {
        const configs = state.options.summarySiteConfigs.map((item) => item.id === config.id ? { ...item, fallbackMode: event.target.value } : item);
        await saveSummaryCollectors(configs, redraw);
        toast(t("toast.collectorFallbackSaved"), "success");
      }
    });
    return el("div", { class: "summary-collector-details" },
      el("div", { class: "summary-collector-details-grid" },
        field(t("summary.collector.hosts"), el("div", { class: "summary-host-chips" },
          (config.hosts || []).length
            ? (config.hosts || []).map((host) => el("code", {}, host))
            : el("span", { class: "muted" }, t("summary.collector.noHosts"))
        )),
        field(t("summary.collector.fallback"), fallback),
        field(t("summary.collector.userscript"), el("div", { class: "summary-script-meta" },
          el("strong", {}, config.userscriptFile || t("summary.collector.inlineRuntime")),
          el("span", {}, summaryCollectorUserscript(config).length ? t("summary.collector.chars", { count: summaryCollectorUserscript(config).length }) : t("summary.collector.customCollector"))
        )),
        field(t("summary.collector.matcher"), el("div", { class: "summary-script-meta" },
          el("span", {}, summaryHostsText(config)),
          (config.pathPrefixes || []).length ? el("small", {}, (config.pathPrefixes || []).join(", ")) : null
        )),
        field(t("summary.collector.runMode"), el("div", { class: "summary-script-meta" },
          el("span", {}, summaryCollectorRunModeLabel(config.userscriptRunMode)),
          el("small", {}, t("summary.collector.timeoutMs", { count: config.userscriptTimeoutMs || 24000 }))
        ))
      )
    );
  }

  async function resetSummaryCollector(config, redraw) {
    const defaults = summaryBuiltInDefault(config);
    if (!defaults) return;
    const configs = state.options.summarySiteConfigs.map((item) => item.id === config.id ? { ...defaults, enabled: true } : item);
    state.summaryCollectorEditingId = "";
    await saveSummaryCollectors(configs, redraw);
    toast(t("toast.collectorReset"), "success");
  }

  function startSummaryCollectorDrag(event, config) {
    state.summaryCollectorDragId = config.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("text/plain", config.id);
    event.dataTransfer?.setData("application/x-chatclub-summary-collector", config.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupSummaryCollectorDrag() {
    state.summaryCollectorDragId = "";
    document.querySelectorAll(".summary-collector-row").forEach((row) => {
      row.classList.remove("dragging", "drop-before", "drop-after");
    });
  }

  function summaryCollectorDropPlacement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function previewSummaryCollectorDrop(event, config) {
    const sourceId = state.summaryCollectorDragId || event.dataTransfer?.getData("application/x-chatclub-summary-collector") || "";
    if (!sourceId || sourceId === config.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", summaryCollectorDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", summaryCollectorDropPlacement(event) !== "after");
  }

  async function dropSummaryCollector(event, targetConfig, redraw) {
    const sourceId = state.summaryCollectorDragId || event.dataTransfer?.getData("application/x-chatclub-summary-collector") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetConfig.id) return;
    event.preventDefault();
    const placement = summaryCollectorDropPlacement(event);
    const source = state.options.summarySiteConfigs.find((item) => item.id === sourceId);
    if (!source) return cleanupSummaryCollectorDrag();
    const withoutSource = state.options.summarySiteConfigs.filter((item) => item.id !== sourceId);
    const targetIndex = withoutSource.findIndex((item) => item.id === targetConfig.id);
    if (targetIndex < 0) return cleanupSummaryCollectorDrag();
    const insertIndex = targetIndex + (placement === "after" ? 1 : 0);
    const configs = [...withoutSource.slice(0, insertIndex), source, ...withoutSource.slice(insertIndex)];
    cleanupSummaryCollectorDrag();
    await saveSummaryCollectors(configs, redraw, { reloadRuntime: false });
  }

  function optimizeSettingsPane() {
    const redraw = arguments[0] || (() => {});
    const goToSection = arguments[1] || (() => {});
    return el("div", { class: "settings-pane" },
      promptApiSettingsBlock("optimize", redraw, goToSection),
      promptTemplateListBlock("optimize", redraw)
    );
  }

  function promptLibraryPane(redraw) {
    return el("div", { class: "settings-pane" },
      settingsBlock(t("prompts.title"), t("prompts.desc"),
        promptLibraryManager(redraw)
      )
    );
  }

  function promptLibraryManager(redraw, options = {}) {
    return promptLibraryController.promptLibraryManager(redraw, options);
  }

  function openPromptLibraryDialog() {
    return promptLibraryController.openPromptLibraryDialog();
  }

  function insertTextIntoPrompt(text) {
    return promptLibraryController.insertTextIntoPrompt(text);
  }

  const importExportSettings = createImportExportSettings({
    state,
    svgIcon,
    notifyConfigReload,
    hydrateGroups,
    syncI18nLanguage,
    render
  });
  const { importConfigText, importExportPane } = importExportSettings;

  const shortcutSettings = createShortcutSettings({
    state,
    notifyConfigReload,
    settingsKit
  });
  const { shortcutsPane } = shortcutSettings;

  const promptLibraryController = createPromptLibraryController({
    state,
    createId,
    savePromptLibrary,
    syncPromptInputNode,
    settingsActions,
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsListDropPlacement,
    settingsPrimaryAction,
    cleanupSettingsDragRows,
    moveListItem
  });

  return Object.freeze({
    importConfigText,
    insertTextIntoPrompt,
    openPromptLibraryDialog,
    openSettings,
    promptLibraryManager,
    settingsPane
  });
}
