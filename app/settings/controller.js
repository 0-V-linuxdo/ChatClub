import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_MODEL_PREFERENCE_ORDER,
  DEFAULT_OPTIONS,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS,
  TAB_GROUP_HEADER_BUTTONS,
  TOOLTIP_TARGET_GROUPS
} from "../../shared/constants.js";
import { SUMMARY_SITE_CONFIGS } from "../../shared/summary-sites.js";
import {
  MESSAGE_NAVIGATOR_EFFECT_MODES,
  MESSAGE_NAVIGATOR_SITE_CONFIGS,
  normalizeMessageNavigatorEffectMode
} from "../../shared/message-navigator-sites.js";
import { TOPIC_DELETE_SITE_CONFIGS } from "../../shared/topic-delete-sites.js";
import { t } from "../../shared/i18n.js";
import {
  createId,
  normalizeTabGroupButtonPlacement,
  normalizeTabGroupButtonOrder,
  normalizeModelPreferenceOrder,
  normalizePrimaryColor,
  saveCustomConfig,
  saveOptions,
  savePromptLibrary,
  savePromptSendHistory
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const CONFIG_IO_AUTOSAVE_TIMEOUT_MS = 5000;

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
  let appearanceAutoSaveError = null;
  let appearanceAutoSaveRunning = false;
  let appearanceAutoSavePending = null;
  let appearanceAutoSaveRedraw = null;
  let appearanceColorSaveTimer = 0;
  let appearanceColorSavePending = "";
  let modelPreferenceAutoSaveError = null;
  let modelPreferenceAutoSaveRunning = false;
  let modelPreferenceAutoSavePending = null;
  let modelPreferenceAutoSaveRedraw = null;
  let modelPreferenceDragId = "";
  let messageNavigatorSiteDragId = "";
  let topicDeleteSiteDragId = "";

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
        appearanceAutoSaveError = null;
        syncI18nLanguage();
        applyTheme();
        syncTopbar();
        syncWorkspaceDom();
        syncSummaryPanel();
        redraw?.();
      }
    } catch (error) {
      appearanceAutoSaveError = error;
      console.warn("[ChatClub] Failed to auto-save appearance settings", error);
      toast(t("toast.appearanceAutoSaveFailed"), "error");
    } finally {
      appearanceAutoSaveRunning = false;
      if (appearanceAutoSavePending) flushAppearanceAutoSave();
    }
  }

  function queueAppearanceColorSave(primaryColor) {
    clearTimeout(appearanceColorSaveTimer);
    appearanceColorSavePending = primaryColor;
    appearanceColorSaveTimer = setTimeout(() => {
      const pendingColor = appearanceColorSavePending;
      appearanceColorSaveTimer = 0;
      appearanceColorSavePending = "";
      queueAppearanceAutoSave({
        primaryColor: pendingColor,
        primaryColorCustom: true
      });
    }, 250);
  }

  function flushAppearanceColorSave() {
    if (!appearanceColorSaveTimer) return;
    clearTimeout(appearanceColorSaveTimer);
    appearanceColorSaveTimer = 0;
    const pendingColor = appearanceColorSavePending;
    appearanceColorSavePending = "";
    if (!pendingColor) return;
    queueAppearanceAutoSave({
      primaryColor: pendingColor,
      primaryColorCustom: true
    });
  }

  function tabGroupButtonsModeForPlacement(placement) {
    return TAB_GROUP_HEADER_BUTTONS.some((item) => !item.requiredPinned && placement[item.id] === "menu") ? "hidden" : "pinned";
  }

  function tabGroupButtonPlacementValue(value) {
    return value === "menu" || value === "hidden" ? value : "pinned";
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
        modelPreferenceAutoSaveError = null;
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
      modelPreferenceAutoSaveError = error;
      console.warn("[ChatClub] Failed to auto-save model preferences", error);
      toast(t("toast.modelPreferencesAutoSaveFailed"), "error");
    } finally {
      modelPreferenceAutoSaveRunning = false;
      if (modelPreferenceAutoSavePending) flushModelPreferenceAutoSave();
    }
  }

  async function waitForConfigAutosaveDrain(isBusy, flush, messageKey = "toast.importAutosaveTimeout") {
    const startedAt = Date.now();
    while (isBusy()) {
      flush?.();
      if (Date.now() - startedAt > CONFIG_IO_AUTOSAVE_TIMEOUT_MS) {
        throw new Error(t(messageKey));
      }
      await sleep(20);
    }
  }

  async function drainOptionsAutoSave(messageKey = "toast.importAutosaveTimeout") {
    flushAppearanceColorSave();
    flushAppearanceAutoSave();
    flushModelPreferenceAutoSave();
    await waitForConfigAutosaveDrain(
      () => Boolean(
        appearanceColorSaveTimer
        || appearanceAutoSaveRunning
        || appearanceAutoSavePending
        || modelPreferenceAutoSaveRunning
        || modelPreferenceAutoSavePending
      ),
      () => {
        flushAppearanceColorSave();
        if (appearanceAutoSavePending && !appearanceAutoSaveRunning) flushAppearanceAutoSave();
        if (modelPreferenceAutoSavePending && !modelPreferenceAutoSaveRunning) flushModelPreferenceAutoSave();
      },
      messageKey
    );
    if (appearanceAutoSaveError || modelPreferenceAutoSaveError) {
      throw new Error(t("toast.importAutosaveFailed"));
    }
  }

  function clearOptionsImportAutoSaveState() {
    clearTimeout(appearanceColorSaveTimer);
    appearanceColorSaveTimer = 0;
    appearanceColorSavePending = "";
    appearanceAutoSaveError = null;
    appearanceAutoSavePending = null;
    appearanceAutoSaveRedraw = null;
    modelPreferenceAutoSaveError = null;
    modelPreferenceAutoSavePending = null;
    modelPreferenceAutoSaveRedraw = null;
  }

  async function prepareForConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (selected.has("options")) {
      await drainOptionsAutoSave();
    }
    if (selected.has("shortcutConfig")) {
      await prepareShortcutConfigImport(selected);
    }
  }

  async function prepareForConfigExport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (selected.has("options")) {
      await drainOptionsAutoSave();
    }
    if (selected.has("shortcutConfig")) {
      await prepareShortcutConfigExport(selected);
    }
  }

  function resetAfterConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (selected.has("options")) {
      clearOptionsImportAutoSaveState();
      state.modelPreferenceDraft = null;
      state.settingsTabGroupButtonPlacementDraft = null;
      state.settingsTabGroupButtonOrderDraft = null;
      state.settingsTabGroupButtonDragId = "";
      state.topbarEditLayoutDraft = null;
      modelPreferenceDragId = "";
      cleanupTabGroupButtonDrag();
    }
    if (selected.has("customConfig")) state.settingsCustomAppDragId = "";
    if (selected.has("promptLibrary")) state.settingsPromptLibraryDragId = "";
    if (selected.has("promptSendHistory")) {
      state.promptHistoryCursor = -1;
      state.promptHistoryDraft = "";
    }
    if (selected.has("shortcutConfig")) resetShortcutAfterConfigImport(selected);
  }

  function preventTabGroupButtonNativeDrag(event) {
    if (!activeTabGroupButtonDrag) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function tabGroupButtonDropTargetFromPoint(clientX, clientY) {
    const pointTarget = document.elementFromPoint(clientX, clientY);
    const targetFromZone = (zone) => {
      const placement = tabGroupButtonPlacementValue(zone?.dataset?.placement);
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
    if (zone?.dataset?.placement === "pinned" || zone?.dataset?.placement === "menu" || zone?.dataset?.placement === "hidden") {
      return targetFromZone(zone);
    }
    const zones = Array.from(document.querySelectorAll(".tab-group-button-placement-zone"))
      .filter((node) => node.dataset?.placement === "pinned" || node.dataset?.placement === "menu" || node.dataset?.placement === "hidden");
    if (!zones.length) {
      return {
        placement: activeTabGroupButtonDrag?.targetPlacement || "pinned",
        targetId: "",
        targetPosition: "end"
      };
    }
    const zoneRects = zones.map((node) => ({ node, rect: node.getBoundingClientRect() }));
    const zonesAreSideBySide = zoneRects.some((entry, index) => zoneRects.some((other, otherIndex) => (
      index !== otherIndex && Math.min(entry.rect.bottom, other.rect.bottom) > Math.max(entry.rect.top, other.rect.top)
    )));
    const distanceToRect = ({ rect }) => {
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      return zonesAreSideBySide ? dx * 4 + dy : dy * 4 + dx;
    };
    zoneRects.sort((a, b) => distanceToRect(a) - distanceToRect(b));
    return targetFromZone(zoneRects[0]?.node || zones[0]);
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
      state.messageNavigatorSiteExpandedId = "";
      state.messageNavigatorSettingsTab = "effects";
      messageNavigatorSiteDragId = "";
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
    if (active === "messageNavigation") return messageNavigationSettingsPane(redraw);
    if (active === "topicDeletion") return topicDeletionSettingsPane(redraw);
    if (active === "optimize") return optimizeSettingsPane(redraw, goToSection);
    if (active === "prompts") return promptLibraryPane(redraw);
    if (active === "promptHistory") return promptHistoryPane(redraw);
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
    const normalizePercent = (value, fallback = DEFAULT_OPTIONS.frameLoadingOverlayOpacity) => {
      const number = Number(value);
      return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : fallback)));
    };
    const overlayOpacityDraft = normalizePercent(state.options.frameLoadingOverlayOpacity);
    const overlayOpacityValue = el("span", { class: "appearance-range-value" }, `${overlayOpacityDraft}%`);
    const overlayOpacitySlider = el("input", {
      class: "appearance-range-slider",
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(overlayOpacityDraft),
      "aria-label": t("appearance.loadingOverlay")
    });
    const syncOverlayOpacity = () => {
      const nextOpacity = normalizePercent(overlayOpacitySlider.value, overlayOpacityDraft);
      overlayOpacitySlider.value = String(nextOpacity);
      overlayOpacityValue.textContent = `${nextOpacity}%`;
      document.documentElement.style.setProperty("--frame-loading-overlay-opacity", String(nextOpacity / 100));
      queueAppearanceAutoSave({ frameLoadingOverlayOpacity: nextOpacity });
    };
    overlayOpacitySlider.addEventListener("input", syncOverlayOpacity);
    overlayOpacitySlider.addEventListener("change", syncOverlayOpacity);
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
    const overlayOpacityControl = el("div", { class: "appearance-range-control" },
      overlayOpacitySlider,
      overlayOpacityValue,
      el("small", { class: "appearance-range-help" }, t("appearance.loadingOverlayHelp"))
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
      "topbar.deleteThread": "trash",
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
      "topbar.settings.messageNavigation": "navigator",
      "topbar.settings.topicDeletion": "trash",
      "topbar.settings.optimize": "sparkles",
      "topbar.settings.prompts": "library",
      "topbar.settings.shortcuts": "keyboard",
      "topbar.settings.io": "transfer",
      "topbar.customize.paletteItem": "grip",
      "topbar.customize.enter": "customizeTopbar",
      "topbar.customize.cancel": "x",
      "workspace.group.addApp": "plus",
      "workspace.group.newChat": "edit",
      "workspace.group.openInNewTab": "external",
      "workspace.group.copyLink": "copy",
      "workspace.group.goToUrl": "link",
      "workspace.group.refreshPage": "reload",
      "workspace.group.reload": "home",
      "workspace.group.messageNavigator": "navigator",
      "workspace.group.deleteThread": "trash",
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
      "settings.action.reset": "reset",
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
      el("div", { class: "appearance-workspace-layout" },
        el("div", { class: "appearance-field-list appearance-workspace-main" },
          appearanceRow(field(t("appearance.themeMode"), themeMode)),
          appearanceRow(field(t("appearance.language"), language)),
          appearanceRow(field(t("appearance.maxColumns"), columnCount))
        ),
        el("div", { class: "appearance-field-list appearance-workspace-aside" },
          appearanceRow(field(t("appearance.primaryColor"), colorControl)),
          appearanceRow(field(t("appearance.loadingOverlay"), overlayOpacityControl))
        )
      )
    );
    const tabGroupButtonLabel = (id) => ({
      addApp: t("chat.addApp"),
      newChat: t("topbar.newChat"),
      refreshPage: t("chat.refreshPage"),
      reload: t("chat.home"),
      messageNavigator: t("chat.messageNavigator"),
      deleteThread: t("chat.deleteThreadInGroup"),
      fullscreen: t("chat.fullscreen"),
      openInNewTab: t("common.openInNewTab"),
      copyLink: t("common.copyLink"),
      goToUrl: t("chat.goToUrl"),
      removeGroup: t("chat.removeGroup"),
      more: t("chat.more")
    })[id] || id;
    const tabGroupConfigurableButtons = () => TAB_GROUP_HEADER_BUTTONS.filter((item) => !item.requiredPinned);
    const tabGroupButtonById = new Map(tabGroupConfigurableButtons().map((item) => [item.id, item]));
    const orderedTabGroupConfigurableButtons = () => normalizeTabGroupButtonOrder(tabGroupButtonOrder)
      .map((id) => tabGroupButtonById.get(id))
      .filter(Boolean);
    const tabGroupButtonsForPlacement = (placement) => orderedTabGroupConfigurableButtons()
      .filter((item) => tabGroupButtonPlacementValue(tabGroupButtonPlacement[item.id] || item.defaultPlacement || "pinned") === placement);
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
    const tabGroupPlacementTitle = (placement) => placement === "menu"
      ? el("span", { class: "tab-group-button-placement-title" }, svgIcon("more"), el("span", {}, t("chat.more")))
      : placement === "hidden"
        ? el("span", { class: "tab-group-button-placement-title" }, svgIcon("x"), el("span", {}, t("appearance.tabGroupButtonsHidden")))
        : el("span", { class: "tab-group-button-placement-title" }, svgIcon("layout"), el("span", {}, t("appearance.tabGroupButtonsPinned")));
    const tabGroupPlacementZone = (placement, items, emptyText) => el("section", {
      class: `tab-group-button-placement-panel is-${placement}`,
      "aria-label": placement === "menu"
        ? t("chat.more")
        : placement === "hidden"
          ? t("appearance.tabGroupButtonsHidden")
          : t("appearance.tabGroupButtonsPinned")
    },
      tabGroupPlacementTitle(placement),
      el("div", {
        class: `tab-group-button-placement-zone is-${placement}`,
        "data-placement": placement,
        ondragover: preventTabGroupButtonNativeDrag,
        ondrop: preventTabGroupButtonNativeDrag
      },
        items.length
          ? items.map(renderTabGroupPlacementRow)
          : el("div", { class: "tab-group-button-placement-empty" }, emptyText)
      )
    );
    const tabGroupBlock = () => settingsBlock(t("appearance.tabGroup"), t("appearance.tabGroupDesc"),
      el("div", { class: "appearance-field-list" },
        el("p", { class: "settings-muted-help" }, t("appearance.tabGroupButtonsHelp")),
        el("div", { class: "tab-group-button-placement-list" },
          tabGroupPlacementZone("pinned", tabGroupButtonsForPlacement("pinned"), t("appearance.tabGroupDropPinned")),
          tabGroupPlacementZone("menu", tabGroupButtonsForPlacement("menu"), t("appearance.tabGroupDropMenu")),
          tabGroupPlacementZone("hidden", tabGroupButtonsForPlacement("hidden"), t("appearance.tabGroupDropHidden"))
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

  function modelPreferenceOrder() {
    return normalizeModelPreferenceOrder(state.options.modelPreferenceOrder || DEFAULT_MODEL_PREFERENCE_ORDER);
  }

  function cleanupModelPreferenceDrag() {
    modelPreferenceDragId = "";
    cleanupSettingsDragRows(".model-preference-row");
  }

  function startModelPreferenceDrag(event, appId) {
    modelPreferenceDragId = appId;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-model-preference", appId);
    event.dataTransfer?.setData("text/plain", appId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewModelPreferenceDrop(event, appId) {
    const sourceId = modelPreferenceDragId || event.dataTransfer?.getData("application/x-chatclub-model-preference") || "";
    if (!sourceId || sourceId === appId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropModelPreference(event, targetAppId, redraw) {
    const sourceId = modelPreferenceDragId || event.dataTransfer?.getData("application/x-chatclub-model-preference") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetAppId) return;
    event.preventDefault();
    const modelPreferenceOrderItems = modelPreferenceOrder().map((id) => ({ id }));
    const nextOrder = moveListItem(modelPreferenceOrderItems, sourceId, targetAppId, settingsListDropPlacement(event)).map((item) => item.id);
    cleanupModelPreferenceDrag();
    state.options = await saveOptions({ ...state.options, modelPreferenceOrder: nextOrder });
    redraw();
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

  function modelPreferenceRow(appId, redraw) {
    const draft = modelPreferenceDraft();
    const modelSelect = select(draft[appId] || "", modelPreferenceOptions(appId));
    modelSelect.value = draft[appId] || "";
    modelSelect.addEventListener("change", () => {
      queueModelPreferenceAutoSave({
        ...modelPreferenceDraft(),
        [appId]: modelSelect.value
      });
    });
    return el("div", {
      class: "ui-list-row settings-list-row model-preference-row",
      draggable: "true",
      dataset: { modelPreferenceAppId: appId },
      ondragstart: (event) => startModelPreferenceDrag(event, appId),
      ondragend: cleanupModelPreferenceDrag,
      ondragover: (event) => previewModelPreferenceDrop(event, appId),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropModelPreference(event, appId, redraw)
    },
      settingsDragHandle(t("modelPreferences.drag")),
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
        ["", t("modelPreferences.platform"), t("modelPreferences.preferredModel"), t("modelPreferences.thinkingLevel")],
        modelPreferenceOrder().map((appId) => modelPreferenceRow(appId, redraw)),
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
          ? settingsIconAction(t("promptTemplates.reset"), "reset", () => resetPromptTemplate(kind, template, redraw), "settings-reset-icon", false, "settings.action.reset")
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
      settingsPaneToolbar(t("summary.collectors.manage"),
        settingsPrimaryAction(t("summary.collector.add"), "plus", () => openSummaryCollectorEditor(null, redraw))
      ),
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
    return String(config?.customUserscript || config?.userscript || summaryBuiltInDefault(config)?.userscript || "").trim();
  }

  function summaryCollectorSourceMode(config) {
    return config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride)
      ? "custom"
      : "builtIn";
  }

  function summaryCollectorSourceLabel(config) {
    return summaryCollectorSourceMode(config) === "custom"
      ? t("summary.collector.customNoAutoUpdate")
      : t("summary.collector.builtInAutoUpdate");
  }

  function summaryCollectorRunModeLabel(mode) {
    return mode === "pageWorldFirst" ? t("summary.collector.pageWorldFirst") : t("summary.collector.serialBridge");
  }

  function createSummaryCollectorDraft() {
    return {
      id: createId("summary-collector"),
      name: "",
      enabled: true,
      builtIn: false,
      fallbackMode: "structuredOnly",
      hosts: [],
      pathPrefixes: [],
      userscriptRunMode: "serial",
      userscriptTimeoutMs: 24000,
      copyTimeoutMs: "",
      userscript: ""
    };
  }

  function openSummaryCollectorEditor(config, redraw) {
    const editing = Boolean(config);
    const builtIn = config ? summaryBuiltInDefault(config) : null;
    const builtInUserscript = String(builtIn?.userscript || "").trim();
    let sourceMode = builtIn
      ? summaryCollectorSourceMode(config || {})
      : "custom";
    const draft = structuredClone({
      ...createSummaryCollectorDraft(),
      ...(config || {}),
      builtIn: Boolean(builtIn),
      sourceMode,
      userscript: sourceMode === "custom" ? summaryCollectorUserscript(config || {}) : builtInUserscript
    });
    const nameInput = input(draft.name || "", { placeholder: t("summary.collector.namePlaceholder") });
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
    userscriptInput.readOnly = Boolean(builtIn && sourceMode !== "custom");
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
      if (sourceMode === "custom" && !userscript) return toast(t("summary.collector.userscriptRequired"), "error");
      const timeout = Math.max(5000, Math.min(45000, Number(timeoutInput.value) || 24000));
      const copyTimeout = copyTimeoutInput.value.trim() ? Math.max(300, Math.min(10000, Number(copyTimeoutInput.value) || 0)) : undefined;
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        builtIn: Boolean(builtIn),
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        fallbackMode: messagePullSelect.value,
        userscriptRunMode: runModeSelect.value,
        userscriptTimeoutMs: timeout,
        sourceMode,
        userscript: sourceMode === "custom" ? userscript : builtInUserscript,
        userscriptLength: (sourceMode === "custom" ? userscript : builtInUserscript).length,
        userscriptOverride: Boolean(builtIn && sourceMode === "custom")
      };
      if (sourceMode === "custom") nextConfig.customUserscript = userscript;
      else delete nextConfig.customUserscript;
      if (copyTimeout) nextConfig.copyTimeoutMs = copyTimeout;
      else delete nextConfig.copyTimeoutMs;
      if (!builtIn) {
        nextConfig.builtIn = false;
        delete nextConfig.userscriptFile;
        delete nextConfig.configVersion;
        delete nextConfig.userscriptOverride;
      }
      const configs = editing
        ? state.options.summarySiteConfigs.map((item) => item.id === config.id ? nextConfig : item)
        : [...state.options.summarySiteConfigs, nextConfig];
      state.summaryCollectorEditingId = "";
      await saveSummaryCollectors(configs, redraw);
      toast(t(editing ? "toast.summaryUserscriptSaved" : "toast.summaryCollectorAdded"), "success");
      close();
    };
    dialog = modal(t(editing ? "summary.collector.editTitle" : "summary.collector.addTitle"),
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
            el("p", {}, t("summary.collector.infoBody")),
            builtIn ? el("small", {}, summaryCollectorSourceLabel({ ...draft, sourceMode })) : null
          )
        ),
        field(t("summary.collector.userscript"), userscriptInput),
        el("div", { class: "settings-dialog-actions" },
          builtIn ? button(t("summary.collector.editCopy"), () => {
            sourceMode = "custom";
            userscriptInput.readOnly = false;
            userscriptInput.focus();
          }) : null,
          builtIn ? button(t("summary.collector.resetBuiltIn"), async () => {
            await resetSummaryCollector(config, redraw);
            close();
          }) : null,
          button(t("common.cancel"), close),
          button(editing ? t("common.save") : t("common.add"), save, "primary")
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
        builtIn
          ? settingsIconAction(t("common.reset"), "reset", async (event) => {
            event.stopPropagation();
            await resetSummaryCollector(config, redraw);
          }, "settings-reset-icon", !summaryBuiltInDefault(config) || summaryCollectorSourceMode(config) !== "custom", "settings.action.reset")
          : settingsIconAction(t("common.delete"), "trash", async (event) => {
            event.stopPropagation();
            await deleteSummaryCollector(config, redraw);
          }, "danger", false, "settings.action.delete")
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
          el("small", {}, summaryCollectorSourceLabel(config)),
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
    const configs = state.options.summarySiteConfigs.map((item) => {
      if (item.id !== config.id) return item;
      const next = {
        ...item,
        builtIn: true,
        configVersion: defaults.configVersion,
        userscriptFile: defaults.userscriptFile,
        scriptType: "summary",
        scriptId: defaults.scriptId || defaults.id,
        scriptVersion: defaults.configVersion,
        sourceMode: "builtIn",
        userscript: defaults.userscript,
        userscriptLength: String(defaults.userscript || "").trim().length,
        userscriptOverride: false
      };
      delete next.customUserscript;
      return next;
    });
    state.summaryCollectorEditingId = "";
    await saveSummaryCollectors(configs, redraw);
    toast(t("toast.collectorReset"), "success");
  }

  async function deleteSummaryCollector(config, redraw) {
    if (summaryBuiltInDefault(config)) return;
    if (!window.confirm(t("summary.collector.deleteConfirm", { name: config.name || config.id }))) return;
    const configs = state.options.summarySiteConfigs.filter((item) => item.id !== config.id);
    state.summaryCollectorEditingId = "";
    await saveSummaryCollectors(configs, redraw);
    toast(t("toast.summaryCollectorDeleted"), "success");
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

  function messageNavigationSettingsPane(redraw) {
    const activeTab = state.messageNavigatorSettingsTab === "sites" ? "sites" : "effects";
    state.messageNavigatorSettingsTab = activeTab;
    return el("div", { class: "settings-pane message-navigator-settings-pane" },
      settingsInnerTabs([
        ["effects", t("messageNavigator.effects.title"), t("messageNavigator.effects.tabDesc")],
        ["sites", t("messageNavigator.sites.title"), t("messageNavigator.sites.tabDesc")]
      ], activeTab, (id) => {
        state.messageNavigatorSettingsTab = id;
        redraw();
      }),
      activeTab === "sites" ? messageNavigatorSitesBlock(redraw) : messageNavigatorEffectsBlock(redraw)
    );
  }

  function messageNavigatorEffectsBlock(redraw) {
    const preview = messageNavigatorEffectPreview();
    return settingsBlock(t("messageNavigator.effects.title"), t("messageNavigator.effects.desc"),
      el("div", { class: "message-navigator-effect-layout" },
        el("div", { class: "message-navigator-effect-main" },
          field(t("messageNavigator.effectMode"), select(state.options.messageNavigatorEffectMode || "border", messageNavigatorEffectOptions(), {
            onchange: async (event) => {
              state.options = await saveOptions({
                ...state.options,
                messageNavigatorEffectMode: normalizeMessageNavigatorEffectMode(event.target.value)
              });
              toast(t("toast.messageNavigatorEffectSaved"), "success");
              redraw();
            }
          })),
          preview.action
        ),
        el("div", { class: "message-navigator-effect-aside" },
          preview.stage
        )
      )
    );
  }

  function messageNavigatorSitesBlock(redraw) {
    return settingsBlock(t("messageNavigator.sites.title"), t("messageNavigator.sites.desc"),
      settingsPaneToolbar(t("messageNavigator.sites.manage"),
        settingsPrimaryAction(t("messageNavigator.site.add"), "plus", () => openMessageNavigatorSiteEditor(null, redraw))
      ),
      settingsList([
        "",
        t("messageNavigator.site.name"),
        t("messageNavigator.site.scope"),
        t("messageNavigator.site.enabled"),
        t("messageNavigator.site.actions")
      ], messageNavigatorSiteRows(redraw), "message-navigator-list")
    );
  }

  function messageNavigatorEffectPreview() {
    const mode = normalizeMessageNavigatorEffectMode(state.options.messageNavigatorEffectMode || "border");
    const target = el("div", { class: "message-navigator-effect-preview-target", tabindex: "0" },
      el("span", { class: "message-navigator-effect-preview-role" }, "A"),
      el("span", { class: "message-navigator-effect-preview-text" }, t("messageNavigator.preview.message"))
    );
    return {
      stage: el("div", { class: "message-navigator-effect-preview" },
        el("div", { class: "message-navigator-effect-preview-stage" },
          target,
          el("div", { class: "message-navigator-effect-preview-lines", "aria-hidden": "true" },
            el("span", {}),
            el("span", { class: "active" }),
            el("span", {})
          )
        )
      ),
      action: el("button", {
        class: "button button-secondary message-navigator-effect-preview-action",
        type: "button",
        onclick: () => playMessageNavigatorEffectPreview(target, mode)
      },
        svgIcon("preview"),
        el("span", {}, t("messageNavigator.preview.play"))
      )
    };
  }

  function playMessageNavigatorEffectPreview(target, mode) {
    if (!target) return;
    const normalized = normalizeMessageNavigatorEffectMode(mode || state.options.messageNavigatorEffectMode || "border");
    const classes = MESSAGE_NAVIGATOR_EFFECT_MODES.map((item) => `chatclub-message-nav-effect-${item}`);
    clearTimeout(target.__chatclubMessageNavigatorPreviewTimer);
    target.classList.remove(...classes);
    if (normalized === "none") return;
    const effectClass = `chatclub-message-nav-effect-${normalized}`;
    try { void target.offsetWidth; } catch {}
    target.classList.add(effectClass);
    target.__chatclubMessageNavigatorPreviewTimer = setTimeout(() => {
      target.classList.remove(effectClass);
    }, normalized === "border" ? 1800 : 1500);
  }

  function messageNavigatorEffectOptions() {
    return MESSAGE_NAVIGATOR_EFFECT_MODES.map((mode) => ({
      value: mode,
      label: t(`messageNavigator.effect.${mode}`)
    }));
  }

  function messageNavigatorBuiltInDefault(config) {
    return MESSAGE_NAVIGATOR_SITE_CONFIGS.find((item) => item.id === config.id) || null;
  }

  function messageNavigatorScopeText(config) {
    const appIds = (config.appIds || []).filter(Boolean);
    if (appIds.length) return appIds.join(", ");
    const hosts = (config.hosts || []).filter(Boolean);
    return hosts.length ? hosts.join(", ") : t("messageNavigator.site.noScope");
  }

  function messageNavigatorAdapterLabel(adapter) {
    const id = String(adapter || "generic");
    const key = `messageNavigator.adapter.${id}`;
    const label = t(key);
    return label === key ? id : label;
  }

  async function saveMessageNavigatorSites(configs, redraw) {
    state.options = await saveOptions({ ...state.options, messageNavigatorSiteConfigs: configs });
    await notifyConfigReload();
    redraw();
  }

  function cleanupMessageNavigatorSiteDrag() {
    messageNavigatorSiteDragId = "";
    cleanupSettingsDragRows(".message-navigator-row");
  }

  function startMessageNavigatorSiteDrag(event, config) {
    messageNavigatorSiteDragId = config.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-message-navigator-site", config.id);
    event.dataTransfer?.setData("text/plain", config.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewMessageNavigatorSiteDrop(event, config) {
    const sourceId = messageNavigatorSiteDragId || event.dataTransfer?.getData("application/x-chatclub-message-navigator-site") || "";
    if (!sourceId || sourceId === config.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropMessageNavigatorSite(event, targetConfig, redraw) {
    const sourceId = messageNavigatorSiteDragId || event.dataTransfer?.getData("application/x-chatclub-message-navigator-site") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetConfig.id) return;
    event.preventDefault();
    const configs = moveListItem(state.options.messageNavigatorSiteConfigs || [], sourceId, targetConfig.id, settingsListDropPlacement(event));
    cleanupMessageNavigatorSiteDrag();
    await saveMessageNavigatorSites(configs, redraw);
  }

  function createMessageNavigatorSiteDraft() {
    return {
      id: createId("message-navigator"),
      name: "",
      enabled: true,
      builtIn: false,
      appIds: [],
      hosts: [],
      pathPrefixes: [],
      adapter: "generic",
      messageSelector: "",
      userSelector: "",
      assistantSelector: "",
      textCleanupSelectors: [],
      summaryMaxChars: 60
    };
  }

  function openMessageNavigatorSiteEditor(config, redraw) {
    const editing = Boolean(config);
    const builtIn = config ? messageNavigatorBuiltInDefault(config) : null;
    const draft = structuredClone({
      ...createMessageNavigatorSiteDraft(),
      ...(config || {}),
      builtIn: Boolean(builtIn)
    });
    const nameInput = input(draft.name || "", { placeholder: t("messageNavigator.site.namePlaceholder") });
    const enabledInput = el("input", { type: "checkbox", checked: draft.enabled !== false });
    const appIdsInput = textarea((draft.appIds || []).join("\n"), { placeholder: "ChatGPT\nKagi" });
    const hostsInput = textarea((draft.hosts || []).join("\n"), { placeholder: "example.com\n*.example.com" });
    const pathInput = textarea((draft.pathPrefixes || []).join("\n"), { placeholder: "/chat/" });
    const adapterSelect = select(draft.adapter || "generic", messageNavigatorAdapterOptions());
    const selectorInput = textarea(draft.messageSelector || "", { placeholder: "article[data-message-author-role], .message" });
    const userSelectorInput = textarea(draft.userSelector || "", { placeholder: t("common.optional") });
    const assistantSelectorInput = textarea(draft.assistantSelector || "", { placeholder: t("common.optional") });
    const cleanupInput = textarea((draft.textCleanupSelectors || []).join("\n"), { placeholder: "button\nsvg\n[role='toolbar']" });
    const summaryMaxInput = input(String(draft.summaryMaxChars || 60), { type: "number", min: "20", max: "180", step: "5" });
    for (const node of [appIdsInput, hostsInput, pathInput, userSelectorInput, assistantSelectorInput, cleanupInput]) {
      node.classList.add("settings-compact-textarea");
    }
    selectorInput.classList.add("settings-code-textarea");
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const appIds = linesFromText(appIdsInput.value);
      const hosts = linesFromText(hostsInput.value);
      const messageSelector = selectorInput.value.trim();
      if (!nameInput.value.trim()) return toast(t("messageNavigator.site.nameRequired"), "error");
      if (!appIds.length && !hosts.length) return toast(t("messageNavigator.site.matcherRequired"), "error");
      if (!messageSelector) return toast(t("messageNavigator.site.selectorRequired"), "error");
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        builtIn: Boolean(builtIn),
        appIds,
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        adapter: adapterSelect.value || "generic",
        messageSelector,
        userSelector: userSelectorInput.value.trim(),
        assistantSelector: assistantSelectorInput.value.trim(),
        textCleanupSelectors: linesFromText(cleanupInput.value),
        summaryMaxChars: Math.max(20, Math.min(180, Number(summaryMaxInput.value) || 60))
      };
      if (!builtIn) {
        nextConfig.builtIn = false;
        delete nextConfig.configVersion;
      }
      const configs = editing
        ? (state.options.messageNavigatorSiteConfigs || []).map((item) => item.id === config.id ? nextConfig : item)
        : [...(state.options.messageNavigatorSiteConfigs || []), nextConfig];
      state.messageNavigatorSiteExpandedId = "";
      await saveMessageNavigatorSites(configs, redraw);
      toast(t(editing ? "toast.messageNavigatorSiteSaved" : "toast.messageNavigatorSiteAdded"), "success");
      close();
    };
    dialog = modal(t(editing ? "messageNavigator.site.editTitle" : "messageNavigator.site.addTitle"),
      el("div", { class: "settings-editor-form message-navigator-editor" },
        el("div", { class: "settings-dialog-grid message-navigator-grid" },
          field(t("messageNavigator.site.name"), nameInput),
          el("label", { class: "settings-dialog-check" },
            enabledInput,
            el("span", {}, t("common.enabled"))
          ),
          field(t("messageNavigator.site.appIds"), el("div", { class: "settings-field-stack" },
            appIdsInput,
            el("small", {}, t("messageNavigator.site.appIdsHelp"))
          )),
          field(t("messageNavigator.site.hosts"), el("div", { class: "settings-field-stack" },
            hostsInput,
            el("small", {}, t("messageNavigator.site.hostHelp"))
          )),
          field(t("messageNavigator.site.pathPrefixes"), el("div", { class: "settings-field-stack" },
            pathInput,
            el("small", {}, t("messageNavigator.site.pathHelp"))
          )),
          field(t("messageNavigator.site.adapter"), adapterSelect),
          field(t("messageNavigator.site.summaryMaxChars"), summaryMaxInput)
        ),
        el("div", { class: "settings-info-callout" },
          svgIcon("navigator"),
          el("div", {},
            el("strong", {}, t("messageNavigator.site.infoTitle")),
            el("p", {}, t("messageNavigator.site.infoBody")),
            builtIn ? el("small", {}, t("messageNavigator.site.builtInAutoUpdate")) : null
          )
        ),
        field(t("messageNavigator.site.messageSelector"), selectorInput),
        el("div", { class: "settings-dialog-grid message-navigator-selector-grid" },
          field(t("messageNavigator.site.userSelector"), userSelectorInput),
          field(t("messageNavigator.site.assistantSelector"), assistantSelectorInput),
          field(t("messageNavigator.site.cleanupSelectors"), cleanupInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          builtIn ? button(t("messageNavigator.site.resetBuiltIn"), async () => {
            await resetMessageNavigatorSite(config, redraw);
            close();
          }) : null,
          button(t("common.cancel"), close),
          button(editing ? t("common.save") : t("common.add"), save, "primary")
        )
      ),
      close,
      true,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  function messageNavigatorAdapterOptions() {
    const ids = ["generic", ...MESSAGE_NAVIGATOR_SITE_CONFIGS.map((item) => item.adapter)].filter(Boolean);
    return Array.from(new Set(ids)).map((id) => ({ value: id, label: messageNavigatorAdapterLabel(id) }));
  }

  function messageNavigatorSiteRows(redraw) {
    return (state.options.messageNavigatorSiteConfigs || []).flatMap((config) => {
      const expanded = state.messageNavigatorSiteExpandedId === config.id;
      const row = messageNavigatorSiteRow(config, expanded, redraw);
      if (!expanded) return row;
      return [row, messageNavigatorSiteDetails(config)];
    });
  }

  function messageNavigatorSiteRow(config, expanded, redraw) {
    const builtIn = Boolean(messageNavigatorBuiltInDefault(config));
    return el("div", {
      class: `ui-list-row settings-list-row message-navigator-row ${expanded ? "message-navigator-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { messageNavigatorSiteId: config.id },
      onclick: (event) => {
        if (event.target instanceof Element && event.target.closest("button,input,select,a,.settings-drag-handle")) return;
        state.messageNavigatorSiteExpandedId = expanded ? "" : config.id;
        redraw();
      },
      ondragstart: (event) => startMessageNavigatorSiteDrag(event, config),
      ondragend: cleanupMessageNavigatorSiteDrag,
      ondragover: (event) => previewMessageNavigatorSiteDrop(event, config),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropMessageNavigatorSite(event, config, redraw)
    },
      settingsDragHandle(t("messageNavigator.site.drag")),
      el("div", { class: "message-navigator-name" },
        el("strong", {}, config.name || config.id),
        builtIn ? el("span", { class: "summary-collector-star", title: t("messageNavigator.site.builtIn"), "aria-label": t("messageNavigator.site.builtIn") }, "★") : null
      ),
      el("span", { class: "message-navigator-scope-badge" }, messageNavigatorScopeText(config)),
      el("label", { class: "settings-check", title: config.enabled === false ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${config.name || config.id} ${t("messageNavigator.site.enabled")}`,
          checked: config.enabled !== false,
          onchange: async (event) => {
            const configs = (state.options.messageNavigatorSiteConfigs || []).map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item);
            await saveMessageNavigatorSites(configs, redraw);
            toast(event.target.checked ? t("toast.messageNavigatorSiteEnabled") : t("toast.messageNavigatorSiteDisabled"), "success");
          }
        })
      ),
      el("div", { class: "settings-row-actions" },
        settingsIconAction(t("common.edit"), "edit", (event) => {
          event.stopPropagation();
          openMessageNavigatorSiteEditor(config, redraw);
        }, "", false, "settings.action.edit"),
        builtIn
          ? settingsIconAction(t("common.reset"), "reset", async (event) => {
            event.stopPropagation();
            await resetMessageNavigatorSite(config, redraw);
          }, "settings-reset-icon", !messageNavigatorCanReset(config), "settings.action.reset")
          : settingsIconAction(t("common.delete"), "trash", async (event) => {
            event.stopPropagation();
            await deleteMessageNavigatorSite(config, redraw);
          }, "danger", false, "settings.action.delete")
      )
    );
  }

  function messageNavigatorCanReset(config) {
    const defaults = messageNavigatorBuiltInDefault(config);
    if (!defaults) return false;
    const keys = ["name", "adapter", "messageSelector", "userSelector", "assistantSelector", "summaryMaxChars"];
    return keys.some((key) => JSON.stringify(config[key] ?? "") !== JSON.stringify(defaults[key] ?? ""))
      || JSON.stringify(config.hosts || []) !== JSON.stringify(defaults.hosts || [])
      || JSON.stringify(config.pathPrefixes || []) !== JSON.stringify(defaults.pathPrefixes || [])
      || JSON.stringify(config.appIds || []) !== JSON.stringify(defaults.appIds || [])
      || JSON.stringify(config.textCleanupSelectors || []) !== JSON.stringify(defaults.textCleanupSelectors || []);
  }

  function messageNavigatorSiteDetails(config) {
    const chips = (items, emptyKey) => {
      const values = (items || []).filter(Boolean);
      return el("div", { class: "summary-host-chips" },
        values.length
          ? values.map((item) => el("code", {}, item))
          : el("span", { class: "muted" }, t(emptyKey))
      );
    };
    return el("div", { class: "message-navigator-details summary-collector-details" },
      el("div", { class: "summary-collector-details-grid" },
        field(t("messageNavigator.site.appIds"), chips(config.appIds, "messageNavigator.site.noAppIds")),
        field(t("messageNavigator.site.hosts"), chips(config.hosts, "messageNavigator.site.noHosts")),
        field(t("messageNavigator.site.pathPrefixes"), chips(config.pathPrefixes, "messageNavigator.site.noPathPrefixes")),
        field(t("messageNavigator.site.adapter"), el("div", { class: "summary-script-meta" },
          el("strong", {}, messageNavigatorAdapterLabel(config.adapter)),
          el("small", {}, config.builtIn ? t("messageNavigator.site.builtInAutoUpdate") : t("messageNavigator.site.customConfig"))
        )),
        field(t("messageNavigator.site.messageSelector"), el("div", { class: "summary-script-meta" },
          el("code", {}, config.messageSelector || t("messageNavigator.site.noSelector")),
          el("small", {}, t("messageNavigator.site.summaryMaxCharsValue", { count: config.summaryMaxChars || 60 }))
        )),
        field(t("messageNavigator.site.status"), el("div", { class: "summary-script-meta" },
          el("span", {}, config.enabled === false ? t("common.disabled") : t("common.enabled")),
          el("small", {}, config.enabled === false ? t("messageNavigator.site.disabledHelp") : t("messageNavigator.site.enabledHelp"))
        ))
      )
    );
  }

  async function resetMessageNavigatorSite(config, redraw) {
    const defaults = messageNavigatorBuiltInDefault(config);
    if (!defaults) return;
    const configs = (state.options.messageNavigatorSiteConfigs || []).map((item) => {
      if (item.id !== config.id) return item;
      return {
        ...structuredClone(defaults),
        enabled: item.enabled !== false
      };
    });
    state.messageNavigatorSiteExpandedId = "";
    await saveMessageNavigatorSites(configs, redraw);
    toast(t("toast.messageNavigatorSiteReset"), "success");
  }

  async function deleteMessageNavigatorSite(config, redraw) {
    if (messageNavigatorBuiltInDefault(config)) return;
    if (!window.confirm(t("messageNavigator.site.deleteConfirm", { name: config.name || config.id }))) return;
    const configs = (state.options.messageNavigatorSiteConfigs || []).filter((item) => item.id !== config.id);
    state.messageNavigatorSiteExpandedId = "";
    await saveMessageNavigatorSites(configs, redraw);
    toast(t("toast.messageNavigatorSiteDeleted"), "success");
  }

  function topicDeletionSettingsPane(redraw) {
    return el("div", { class: "settings-pane" },
      settingsBlock(t("topicDeletion.sites.title"), t("topicDeletion.sites.desc"),
        settingsPaneToolbar(t("topicDeletion.sites.manage"),
          settingsPrimaryAction(t("topicDeletion.site.add"), "plus", () => openTopicDeleteSiteEditor(null, redraw))
        ),
        settingsList([
          "",
          t("topicDeletion.site.name"),
          t("topicDeletion.site.scope"),
          t("topicDeletion.site.enabled"),
          t("topicDeletion.site.actions")
        ], topicDeleteSiteRows(redraw), "topic-delete-list")
      )
    );
  }

  function topicDeleteBuiltInDefault(config) {
    return TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === config.id) || null;
  }

  function topicDeleteScopeText(config) {
    const appIds = (config.appIds || []).filter(Boolean);
    if (appIds.length) return appIds.join(", ");
    const hosts = (config.hosts || []).filter(Boolean);
    return hosts.length ? hosts.join(", ") : t("topicDeletion.site.noScope");
  }

  async function saveTopicDeleteSites(configs, redraw) {
    state.options = await saveOptions({ ...state.options, topicDeleteSiteConfigs: configs });
    await notifyConfigReload();
    redraw();
  }

  function cleanupTopicDeleteSiteDrag() {
    topicDeleteSiteDragId = "";
    cleanupSettingsDragRows(".topic-delete-row");
  }

  function startTopicDeleteSiteDrag(event, config) {
    topicDeleteSiteDragId = config.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-topic-delete-site", config.id);
    event.dataTransfer?.setData("text/plain", config.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewTopicDeleteSiteDrop(event, config) {
    const sourceId = topicDeleteSiteDragId || event.dataTransfer?.getData("application/x-chatclub-topic-delete-site") || "";
    if (!sourceId || sourceId === config.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropTopicDeleteSite(event, targetConfig, redraw) {
    const sourceId = topicDeleteSiteDragId || event.dataTransfer?.getData("application/x-chatclub-topic-delete-site") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetConfig.id) return;
    event.preventDefault();
    const configs = moveListItem(state.options.topicDeleteSiteConfigs || [], sourceId, targetConfig.id, settingsListDropPlacement(event));
    cleanupTopicDeleteSiteDrag();
    await saveTopicDeleteSites(configs, redraw);
  }

  function topicDeleteUserscript(config) {
    return String(config?.customUserscript || config?.userscript || topicDeleteBuiltInDefault(config || {})?.userscript || "").trim();
  }

  function topicDeleteSourceMode(config) {
    return config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride)
      ? "custom"
      : "builtIn";
  }

  function topicDeleteSourceLabel(config) {
    return topicDeleteSourceMode(config) === "custom"
      ? t("topicDeletion.site.customNoAutoUpdate")
      : t("topicDeletion.site.builtInAutoUpdate");
  }

  function topicDeleteUserscriptRuntimeLabel(config) {
    const source = topicDeleteUserscript(config);
    return /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)
      ? t("topicDeletion.site.standaloneRuntime")
      : t("topicDeletion.site.legacyRuntime");
  }

  async function copyTopicDeleteUserscript(source) {
    try {
      await navigator.clipboard.writeText(String(source || ""));
      toast(t("toast.topicDeleteUserscriptCopied"), "success");
    } catch (error) {
      console.warn("[ChatClub] Failed to copy Delete Site userscript", error);
      toast(t("toast.copyFailed"), "error");
    }
  }

  function createTopicDeleteSiteDraft() {
    return {
      id: createId("topic-delete"),
      name: "",
      enabled: true,
      builtIn: false,
      appIds: [],
      hosts: [],
      pathPrefixes: [],
      userscriptTimeoutMs: 15000,
      userscript: ""
    };
  }

  function openTopicDeleteSiteEditor(config, redraw) {
    const editing = Boolean(config);
    const builtIn = config ? topicDeleteBuiltInDefault(config) : null;
    const defaultUserscript = String(builtIn?.userscript || "").trim();
    let sourceMode = builtIn
      ? topicDeleteSourceMode(config || {})
      : "custom";
    const draft = structuredClone({
      ...createTopicDeleteSiteDraft(),
      ...(config || {}),
      builtIn: Boolean(builtIn),
      sourceMode
    });
    draft.userscript = config ? (sourceMode === "custom" ? topicDeleteUserscript(config) : defaultUserscript) : "";
    const nameInput = input(draft.name || "", { placeholder: t("topicDeletion.site.namePlaceholder") });
    const enabledInput = el("input", { type: "checkbox", checked: draft.enabled !== false });
    const appIdsInput = textarea((draft.appIds || []).join("\n"), { placeholder: "Kagi\nGrok" });
    const hostsInput = textarea((draft.hosts || []).join("\n"), { placeholder: "example.com\n*.example.com" });
    const pathInput = textarea((draft.pathPrefixes || []).join("\n"), { placeholder: "/chat/" });
    const timeoutInput = input(String(draft.userscriptTimeoutMs || 15000), { type: "number", min: "5000", max: "45000", step: "1000" });
    const userscriptInput = textarea(draft.userscript || "", { placeholder: "// ==UserScript==\n// @name Custom Delete Site\n// ==/UserScript==\n..." });
    userscriptInput.readOnly = Boolean(builtIn && sourceMode !== "custom");
    appIdsInput.classList.add("settings-compact-textarea");
    hostsInput.classList.add("settings-compact-textarea");
    pathInput.classList.add("settings-compact-textarea");
    userscriptInput.classList.add("settings-code-textarea");
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const appIds = linesFromText(appIdsInput.value);
      const hosts = linesFromText(hostsInput.value);
      const userscript = userscriptInput.value.trim();
      if (!nameInput.value.trim()) return toast(t("topicDeletion.site.nameRequired"), "error");
      if (!appIds.length && !hosts.length) return toast(t("topicDeletion.site.matcherRequired"), "error");
      if (sourceMode === "custom" && !userscript) return toast(t("topicDeletion.site.userscriptRequired"), "error");
      const timeout = Math.max(5000, Math.min(45000, Number(timeoutInput.value) || 15000));
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        builtIn: Boolean(builtIn),
        appIds,
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        userscriptTimeoutMs: timeout,
        sourceMode,
        userscript: sourceMode === "custom" ? userscript : defaultUserscript,
        userscriptLength: (sourceMode === "custom" ? userscript : defaultUserscript).length,
        userscriptOverride: Boolean(builtIn && sourceMode === "custom")
      };
      if (sourceMode === "custom") nextConfig.customUserscript = userscript;
      else delete nextConfig.customUserscript;
      if (!builtIn) {
        nextConfig.builtIn = false;
        delete nextConfig.userscriptFile;
        nextConfig.sourceMode = "custom";
        delete nextConfig.userscriptOverride;
      }
      const configs = editing
        ? (state.options.topicDeleteSiteConfigs || []).map((item) => item.id === config.id ? nextConfig : item)
        : [...(state.options.topicDeleteSiteConfigs || []), nextConfig];
      state.topicDeleteSiteExpandedId = "";
      await saveTopicDeleteSites(configs, redraw);
      toast(t(editing ? "toast.topicDeleteSiteSaved" : "toast.topicDeleteSiteAdded"), "success");
      close();
    };
    dialog = modal(t(editing ? "topicDeletion.site.editTitle" : "topicDeletion.site.addTitle"),
      el("div", { class: "settings-editor-form topic-delete-editor" },
        el("div", { class: "settings-dialog-grid topic-delete-grid" },
          field(t("topicDeletion.site.name"), nameInput),
          el("label", { class: "settings-dialog-check" },
            enabledInput,
            el("span", {}, t("common.enabled"))
          ),
          field(t("topicDeletion.site.appIds"), el("div", { class: "settings-field-stack" },
            appIdsInput,
            el("small", {}, t("topicDeletion.site.appIdsHelp"))
          )),
          field(t("topicDeletion.site.hosts"), el("div", { class: "settings-field-stack" },
            hostsInput,
            el("small", {}, t("topicDeletion.site.hostHelp"))
          )),
          field(t("topicDeletion.site.pathPrefixes"), el("div", { class: "settings-field-stack" },
            pathInput,
            el("small", {}, t("topicDeletion.site.pathHelp"))
          )),
          field(t("topicDeletion.site.timeout"), timeoutInput)
        ),
        el("div", { class: "settings-info-callout" },
          svgIcon("trash"),
          el("div", {},
            el("strong", {}, t("topicDeletion.site.infoTitle")),
            el("p", {}, t("topicDeletion.site.infoBody")),
            builtIn ? el("small", {}, topicDeleteSourceLabel({ ...draft, sourceMode })) : null
          )
        ),
        field(t("topicDeletion.site.userscript"), userscriptInput),
        el("div", { class: "settings-dialog-actions" },
          button(t("topicDeletion.site.copyUserscript"), () => copyTopicDeleteUserscript(userscriptInput.value)),
          builtIn ? button(t("topicDeletion.site.editCopy"), () => {
            sourceMode = "custom";
            userscriptInput.readOnly = false;
            userscriptInput.focus();
          }) : null,
          builtIn ? button(t("topicDeletion.site.resetBuiltIn"), async () => {
            await resetTopicDeleteSite(config, redraw);
            close();
          }) : null,
          button(t("common.cancel"), close),
          button(editing ? t("common.save") : t("common.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  function topicDeleteSiteRows(redraw) {
    return (state.options.topicDeleteSiteConfigs || []).flatMap((config) => {
      const expanded = state.topicDeleteSiteExpandedId === config.id;
      const row = topicDeleteSiteRow(config, expanded, redraw);
      if (!expanded) return row;
      return [row, topicDeleteSiteDetails(config)];
    });
  }

  function topicDeleteSiteRow(config, expanded, redraw) {
    const builtIn = Boolean(topicDeleteBuiltInDefault(config));
    return el("div", {
      class: `ui-list-row settings-list-row topic-delete-row ${expanded ? "topic-delete-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { topicDeleteSiteId: config.id },
      onclick: (event) => {
        if (event.target instanceof Element && event.target.closest("button,input,select,a,.settings-drag-handle")) return;
        state.topicDeleteSiteExpandedId = expanded ? "" : config.id;
        redraw();
      },
      ondragstart: (event) => startTopicDeleteSiteDrag(event, config),
      ondragend: cleanupTopicDeleteSiteDrag,
      ondragover: (event) => previewTopicDeleteSiteDrop(event, config),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropTopicDeleteSite(event, config, redraw)
    },
      settingsDragHandle(t("topicDeletion.site.drag")),
      el("div", { class: "topic-delete-name" },
        el("strong", {}, config.name || config.id),
        builtIn ? el("span", { class: "summary-collector-star", title: t("topicDeletion.site.builtIn"), "aria-label": t("topicDeletion.site.builtIn") }, "★") : null
      ),
      el("span", { class: "topic-delete-scope-badge" }, topicDeleteScopeText(config)),
      el("label", { class: "settings-check", title: config.enabled === false ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${config.name || config.id} ${t("topicDeletion.site.enabled")}`,
          checked: config.enabled !== false,
          onchange: async (event) => {
            const configs = (state.options.topicDeleteSiteConfigs || []).map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item);
            await saveTopicDeleteSites(configs, redraw);
            toast(event.target.checked ? t("toast.topicDeleteSiteEnabled") : t("toast.topicDeleteSiteDisabled"), "success");
          }
        })
      ),
      el("div", { class: "settings-row-actions" },
        settingsIconAction(t("common.edit"), "edit", (event) => {
          event.stopPropagation();
          openTopicDeleteSiteEditor(config, redraw);
        }, "", false, "settings.action.edit"),
        builtIn
          ? settingsIconAction(t("common.reset"), "reset", async (event) => {
            event.stopPropagation();
            await resetTopicDeleteSite(config, redraw);
          }, "settings-reset-icon", !topicDeleteCanReset(config), "settings.action.reset")
          : settingsIconAction(t("common.delete"), "trash", async (event) => {
            event.stopPropagation();
            await deleteTopicDeleteSite(config, redraw);
          }, "danger", false, "settings.action.delete")
      )
    );
  }

  function topicDeleteListEqual(a = [], b = []) {
    const normalize = (list) => (list || []).filter(Boolean).map(String).sort().join("\n");
    return normalize(a) === normalize(b);
  }

  function topicDeleteCanReset(config) {
    const defaults = topicDeleteBuiltInDefault(config);
    if (!defaults) return false;
    return topicDeleteSourceMode(config) === "custom";
  }

  function topicDeleteSiteDetails(config) {
    const chips = (items, emptyKey) => {
      const values = (items || []).filter(Boolean);
      return el("div", { class: "summary-host-chips" },
        values.length
          ? values.map((item) => el("code", {}, item))
          : el("span", { class: "muted" }, t(emptyKey))
      );
    };
    return el("div", { class: "topic-delete-details summary-collector-details" },
      el("div", { class: "summary-collector-details-grid" },
        field(t("topicDeletion.site.appIds"), chips(config.appIds, "topicDeletion.site.noAppIds")),
        field(t("topicDeletion.site.hosts"), chips(config.hosts, "topicDeletion.site.noHosts")),
        field(t("topicDeletion.site.pathPrefixes"), chips(config.pathPrefixes, "topicDeletion.site.noPathPrefixes")),
        field(t("topicDeletion.site.userscript"), el("div", { class: "summary-script-meta" },
          el("strong", {}, config.userscriptFile || t("topicDeletion.site.inlineRuntime")),
          el("small", {}, topicDeleteUserscriptRuntimeLabel(config)),
          el("small", {}, topicDeleteSourceLabel(config)),
          el("span", {}, topicDeleteUserscript(config).length ? t("topicDeletion.site.chars", { count: topicDeleteUserscript(config).length }) : t("topicDeletion.site.noUserscript")),
          topicDeleteSourceMode(config) === "custom" ? el("small", {}, t("topicDeletion.site.override")) : null
        )),
        field(t("topicDeletion.site.timeout"), el("div", { class: "summary-script-meta" },
          el("span", {}, t("topicDeletion.site.timeoutMs", { count: config.userscriptTimeoutMs || 15000 }))
        )),
        field(t("topicDeletion.site.status"), el("div", { class: "summary-script-meta" },
          el("span", {}, config.enabled === false ? t("common.disabled") : t("common.enabled")),
          el("small", {}, config.enabled === false ? t("topicDeletion.site.disabledHelp") : t("topicDeletion.site.enabledHelp"))
        ))
      )
    );
  }

  async function resetTopicDeleteSite(config, redraw) {
    const defaults = topicDeleteBuiltInDefault(config);
    if (!defaults) return;
    const configs = (state.options.topicDeleteSiteConfigs || []).map((item) => {
      if (item.id !== config.id) return item;
      const userscript = String(defaults.userscript || "").trim();
      const next = {
        ...item,
        userscriptFile: defaults.userscriptFile,
        scriptType: defaults.scriptType,
        scriptId: defaults.scriptId,
        scriptVersion: defaults.scriptVersion,
        builtIn: true,
        sourceMode: "builtIn",
        userscript,
        userscriptLength: userscript.length,
        userscriptOverride: false
      };
      delete next.customUserscript;
      return next;
    });
    state.topicDeleteSiteExpandedId = "";
    await saveTopicDeleteSites(configs, redraw);
    toast(t("toast.topicDeleteSiteReset"), "success");
  }

  async function deleteTopicDeleteSite(config, redraw) {
    if (topicDeleteBuiltInDefault(config)) return;
    if (!window.confirm(t("topicDeletion.site.deleteConfirm", { name: config.name || config.id }))) return;
    const configs = (state.options.topicDeleteSiteConfigs || []).filter((item) => item.id !== config.id);
    state.topicDeleteSiteExpandedId = "";
    await saveTopicDeleteSites(configs, redraw);
    toast(t("toast.topicDeleteSiteDeleted"), "success");
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

  function promptHistoryItems() {
    return Array.isArray(state.promptSendHistory) ? state.promptSendHistory : [];
  }

  function promptHistoryPreview(text, limit = 180) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
  }

  function promptHistoryDateLabel(createdAt) {
    const timestamp = Date.parse(createdAt);
    if (!Number.isFinite(timestamp)) return t("promptHistory.unknownTime");
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  }

  async function savePromptHistoryList(history, redraw, message) {
    state.promptSendHistory = await savePromptSendHistory(history);
    state.promptHistoryCursor = -1;
    state.promptHistoryDraft = "";
    redraw();
    if (message) toast(message, "success");
  }

  function insertPromptHistoryItem(item) {
    if (!item?.text) return;
    insertTextIntoPrompt(item.text);
    toast(t("toast.promptHistoryInserted"), "success");
  }

  async function deletePromptHistoryItem(item, redraw) {
    const label = promptHistoryPreview(item?.text, 80) || t("promptHistory.thisPrompt");
    if (!window.confirm(t("promptHistory.deleteConfirm", { prompt: label }))) return;
    await savePromptHistoryList(
      promptHistoryItems().filter((entry) => entry.id !== item.id),
      redraw,
      t("toast.promptHistoryDeleted")
    );
  }

  async function clearPromptHistory(redraw) {
    if (!promptHistoryItems().length) return;
    if (!window.confirm(t("promptHistory.clearConfirm"))) return;
    await savePromptHistoryList([], redraw, t("toast.promptHistoryCleared"));
  }

  function promptHistoryRow(item, redraw) {
    const preview = promptHistoryPreview(item.text, 420);
    return el("div", { class: "ui-list-row settings-list-row prompt-history-row" },
      el("time", { class: "prompt-history-time", datetime: item.createdAt || "" }, promptHistoryDateLabel(item.createdAt)),
      el("span", { class: "prompt-history-preview", title: item.text || "" }, preview || t("promptHistory.emptyPrompt")),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("promptHistory.insert"), "insert", () => insertPromptHistoryItem(item)),
        settingsIconAction(t("common.delete"), "trash", () => deletePromptHistoryItem(item, redraw), "danger")
      )
    );
  }

  function promptHistoryPane(redraw) {
    const history = promptHistoryItems();
    const rows = history.length
      ? history.map((item) => promptHistoryRow(item, redraw))
      : settingsEmptyRow(t("promptHistory.noHistory"));
    return el("div", { class: "settings-pane" },
      settingsBlock(t("promptHistory.title"), t("promptHistory.desc"),
        settingsPaneToolbar(
          t("promptHistory.manage"),
          ...(history.length ? [settingsPrimaryAction(t("promptHistory.clear"), "trash", () => clearPromptHistory(redraw))] : [])
        ),
        settingsList([t("promptHistory.time"), t("promptHistory.prompt"), t("profiles.actions")], rows, "prompt-history-list")
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

  const shortcutSettings = createShortcutSettings({
    state,
    svgIcon,
    notifyConfigReload,
    settingsKit
  });
  const {
    prepareForConfigImport: prepareShortcutConfigImport,
    prepareForConfigExport: prepareShortcutConfigExport,
    resetAfterConfigImport: resetShortcutAfterConfigImport,
    shortcutsPane
  } = shortcutSettings;

  const importExportSettings = createImportExportSettings({
    state,
    svgIcon,
    notifyConfigReload,
    hydrateGroups,
    syncI18nLanguage,
    render,
    prepareForConfigImport,
    prepareForConfigExport,
    resetAfterConfigImport
  });
  const { importConfigText, importExportPane } = importExportSettings;

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
