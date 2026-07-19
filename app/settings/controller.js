import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import { savePromptLibrary } from "../../shared/storage-adapter.js";
import { createPromptLibraryController } from "../prompt-library/controller.js";
import { clear, editorModal, el, toast } from "../../ui/dom.js";
import { createAboutSettingsPane } from "./about.js";
import { createAppearanceSettingsSection } from "./appearance.js";
import { createAppsSettingsSection } from "./apps.js";
import { createPromptHistorySettingsSection } from "./history.js";
import { createImportExportSettings } from "./import-export.js";
import {
  SETTINGS_SECTIONS,
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem,
  settingsSectionMeta
} from "./kit.js";
import { createMessageNavigationSettingsSection } from "./message-navigation.js";
import { createModelsSettingsSection } from "./models.js";
import { createOptimizeSettingsSection } from "./optimize.js";
import { createProfilesSettingsSection } from "./profiles.js";
import { createShortcutSettings } from "./shortcuts.js";
import { createSummarySettingsSection } from "./summary.js";
import { createTopicDeletionSettingsSection } from "./topic-deletion.js";
import { SETTINGS_OPTION_CAPABILITIES } from "./state-ports.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
const CONFIG_IO_AUTOSAVE_TIMEOUT_MS = 5000;

const SECTION_OPTION_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(SETTINGS_OPTION_CAPABILITIES).map(([section, capability]) => [
    section,
    new Set(capability.write)
  ])
));

function settingsMainScrollTopForRedraw(renderedSection, activeSection, scrollTop) {
  if (!renderedSection || renderedSection !== activeSection) return 0;
  const value = Number(scrollTop);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function createSettingsController(ctx) {
  const controllerName = "Settings controller";
  ctx = validateControllerContract(ctx, controllerName, {
    settingsSections: "object",
    saveOptionsPatch: "function",
    svgIcon: "function",
    syncPromptInputNode: "function",
    notifyConfigReload: "function",
    render: "function",
    applyTheme: "function",
    syncI18nLanguage: "function",
    hydrateImportedLayoutIfNeeded: "function",
    reconcileAppCatalog: "function",
    enterTopbarEditMode: "function",
    setPromptImages: "function",
    ensurePromptInputReady: "function",
    syncTopbar: "function",
    syncTopbarPromptPlaceholder: "function",
    syncSummaryPanel: "function",
    requestUserScriptsPermission: "function?",
    syncWorkspaceDom: "function",
    applyPreferredModels: "function",
    openTabUrl: "function"
  });
  const settingsSections = requireControllerContext(ctx, controllerName, "settingsSections");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const syncPromptInputNode = requireControllerFunction(ctx, controllerName, "syncPromptInputNode");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const render = requireControllerFunction(ctx, controllerName, "render");
  const applyTheme = requireControllerFunction(ctx, controllerName, "applyTheme");
  const syncI18nLanguage = requireControllerFunction(ctx, controllerName, "syncI18nLanguage");
  const hydrateImportedLayoutIfNeeded = requireControllerFunction(ctx, controllerName, "hydrateImportedLayoutIfNeeded");
  const reconcileAppCatalog = requireControllerFunction(ctx, controllerName, "reconcileAppCatalog");
  const enterTopbarEditMode = requireControllerFunction(ctx, controllerName, "enterTopbarEditMode");
  const setPromptImages = requireControllerFunction(ctx, controllerName, "setPromptImages");
  const ensurePromptInputReady = requireControllerFunction(ctx, controllerName, "ensurePromptInputReady");
  const syncTopbar = requireControllerFunction(ctx, controllerName, "syncTopbar");
  const syncTopbarPromptPlaceholder = requireControllerFunction(ctx, controllerName, "syncTopbarPromptPlaceholder");
  const syncSummaryPanel = requireControllerFunction(ctx, controllerName, "syncSummaryPanel");
  const syncWorkspaceDom = requireControllerFunction(ctx, controllerName, "syncWorkspaceDom");
  const applyPreferredModels = requireControllerFunction(ctx, controllerName, "applyPreferredModels");
  const openTabUrl = requireControllerFunction(ctx, controllerName, "openTabUrl");
  const requestUserScriptsPermission = typeof ctx.requestUserScriptsPermission === "function"
    ? ctx.requestUserScriptsPermission
    : async () => true;
  const settingsKit = createSettingsKit({ svgIcon });
  let closeActiveSettingsDialog = null;

  async function ensureUserScriptsPermission() {
    try {
      return await requestUserScriptsPermission();
    } catch (error) {
      toast(error?.message || String(error), "error");
      return false;
    }
  }

  function sectionOptionsPatch(sectionName, allowedKeys) {
    return async (patch = {}) => {
      const keys = Object.keys(patch);
      if (!keys.length || keys.some((key) => !allowedKeys.has(key))) {
        throw new TypeError(`${sectionName} received an invalid options patch: ${keys.join(", ")}`);
      }
      return saveOptionsPatch(patch);
    };
  }

  const appearanceSection = createAppearanceSettingsSection({
    state: settingsSections.appearance,
    svgIcon,
    saveOptionsPatch: sectionOptionsPatch("Appearance settings section", SECTION_OPTION_KEYS.appearance),
    applyTheme,
    syncI18nLanguage,
    syncTopbar,
    syncTopbarPromptPlaceholder,
    syncWorkspaceDom,
    syncSummaryPanel,
    enterTopbarEditMode,
    closeSettingsDialog: () => closeActiveSettingsDialog?.()
  });
  const profilesSection = createProfilesSettingsSection({
    state: settingsSections.profiles,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Profiles settings section", SECTION_OPTION_KEYS.profiles),
    openTabUrl
  });
  const appsSection = createAppsSettingsSection({
    state: settingsSections.apps,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Apps settings section", SECTION_OPTION_KEYS.apps),
    reconcileAppCatalog,
    syncSummaryPanel,
    syncWorkspaceDom
  });
  const modelsSection = createModelsSettingsSection({
    state: settingsSections.models,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Models settings section", SECTION_OPTION_KEYS.models),
    applyPreferredModels
  });
  const summarySection = createSummarySettingsSection({
    state: settingsSections.summary,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Summary settings section", SECTION_OPTION_KEYS.summary),
    ensureUserScriptsPermission
  });
  const messageNavigationSection = createMessageNavigationSettingsSection({
    state: settingsSections.messageNavigation,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Message navigation settings section", SECTION_OPTION_KEYS.messageNavigation)
  });
  const topicDeletionSection = createTopicDeletionSettingsSection({
    state: settingsSections.topicDeletion,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Topic deletion settings section", SECTION_OPTION_KEYS.topicDeletion),
    ensureUserScriptsPermission
  });
  const optimizeSection = createOptimizeSettingsSection({
    state: settingsSections.optimize,
    svgIcon,
    notifyConfigReload,
    saveOptionsPatch: sectionOptionsPatch("Optimize settings section", SECTION_OPTION_KEYS.optimize)
  });
  const promptHistorySection = createPromptHistorySettingsSection({
    state: settingsSections.history,
    svgIcon,
    setPromptImages,
    ensurePromptInputReady,
    syncPromptInputNode
  });
  const shortcutSettings = createShortcutSettings({
    state: settingsSections.shortcuts,
    svgIcon,
    notifyConfigReload,
    settingsKit
  });
  const promptLibraryController = createPromptLibraryController({
    state: settingsSections.prompts,
    createId,
    savePromptLibrary,
    syncPromptInputNode,
    ensurePromptInputReady,
    settingsActions: settingsKit.settingsActions,
    settingsDragHandle: settingsKit.settingsDragHandle,
    settingsEmptyRow: settingsKit.settingsEmptyRow,
    settingsIconAction: settingsKit.settingsIconAction,
    settingsList: settingsKit.settingsList,
    settingsListDropPlacement: settingsKit.settingsListDropPlacement,
    settingsPrimaryAction: settingsKit.settingsPrimaryAction,
    cleanupSettingsDragRows,
    moveListItem
  });
  const {
    prepareForConfigImport: prepareShortcutConfigImport,
    prepareForConfigExport: prepareShortcutConfigExport,
    resetAfterConfigImport: resetShortcutAfterConfigImport,
    shortcutsPane
  } = shortcutSettings;

  async function waitForConfigAutosaveDrain(isBusy, flush, messageKey = "toast.importAutosaveTimeout") {
    const startedAt = Date.now();
    while (isBusy()) {
      flush();
      if (Date.now() - startedAt > CONFIG_IO_AUTOSAVE_TIMEOUT_MS) throw new Error(t(messageKey));
      await sleep(20);
    }
  }

  async function drainOptionsAutoSave(messageKey = "toast.importAutosaveTimeout") {
    appearanceSection.flushAutosave();
    modelsSection.flushAutosave();
    await waitForConfigAutosaveDrain(
      () => appearanceSection.autosaveBusy() || modelsSection.autosaveBusy(),
      () => {
        appearanceSection.flushAutosave();
        modelsSection.flushAutosave();
      },
      messageKey
    );
    if (appearanceSection.autosaveFailed() || modelsSection.autosaveFailed()) {
      throw new Error(t("toast.importAutosaveFailed"));
    }
  }

  function clearOptionsImportAutoSaveState() {
    appearanceSection.clearAutosaveState();
    modelsSection.clearAutosaveState();
  }

  async function prepareForConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (selected.has("options")) await drainOptionsAutoSave();
    if (selected.has("shortcutConfig")) await prepareShortcutConfigImport(selected);
  }

  async function prepareForConfigExport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (selected.has("options")) await drainOptionsAutoSave();
    if (selected.has("shortcutConfig")) await prepareShortcutConfigExport(selected);
  }

  function resetAfterConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (selected.has("options")) {
      clearOptionsImportAutoSaveState();
      modelsSection.resetAfterImport();
      appearanceSection.reset();
      summarySection.reset();
      optimizeSection.reset();
    }
    if (selected.has("customConfig") || selected.has("options")) appsSection.reset();
    if (selected.has("promptLibrary")) promptLibraryController.reset();
    if (selected.has("promptSendHistory")) promptHistorySection.resetAfterImport();
    if (selected.has("shortcutConfig")) resetShortcutAfterConfigImport(selected);
  }

  async function afterConfigImport(selectedKeys = []) {
    const selected = new Set(selectedKeys || []);
    if (!selected.has("options")) return;
    await Promise.resolve(applyPreferredModels(null, { immediate: true }));
    appearanceSection.afterImport();
  }

  const importExportSettings = createImportExportSettings({
    state: settingsSections.io,
    svgIcon,
    notifyConfigReload,
    hydrateImportedLayoutIfNeeded,
    reconcileAppCatalog,
    syncI18nLanguage,
    render,
    prepareForConfigImport,
    prepareForConfigExport,
    afterConfigImport,
    resetAfterConfigImport
  });
  const aboutPane = createAboutSettingsPane({ openTabUrl, svgIcon });

  function promptLibraryPane(redraw) {
    return el("div", { class: "settings-pane" },
      settingsKit.settingsBlock(t("prompts.title"), t("prompts.desc"),
        promptLibraryController.promptLibraryManager(redraw)
      )
    );
  }

  const settingsSectionPanes = Object.freeze({
    appearance: (redraw) => appearanceSection.pane(redraw),
    profiles: (redraw) => profilesSection.pane(redraw),
    apps: (redraw) => appsSection.pane(redraw),
    models: (redraw) => modelsSection.pane(redraw),
    summary: (redraw, goToSection) => summarySection.pane(redraw, goToSection),
    messageNavigation: (redraw) => messageNavigationSection.pane(redraw),
    topicDeletion: (redraw) => topicDeletionSection.pane(redraw),
    optimize: (redraw, goToSection) => optimizeSection.pane(redraw, goToSection),
    prompts: (redraw) => promptLibraryPane(redraw),
    promptHistory: (redraw) => promptHistorySection.pane(redraw),
    shortcuts: (redraw) => shortcutsPane(redraw),
    io: (redraw) => importExportSettings.importExportPane(redraw),
    about: () => aboutPane()
  });

  function settingsPane(active, redraw, goToSection = () => {}) {
    const factory = settingsSectionPanes[active] || settingsSectionPanes.io;
    return factory(redraw, goToSection);
  }

  function resetDialogState() {
    resetShortcutAfterConfigImport(["shortcutConfig"]);
    messageNavigationSection.reset();
    summarySection.reset();
    optimizeSection.reset();
    promptLibraryController.reset();
    profilesSection.reset();
    appsSection.reset();
    modelsSection.close();
    appearanceSection.reset();
  }

  function openSettings(initialSection = "appearance") {
    const validSectionIds = new Set(SETTINGS_SECTIONS.map(([id]) => id));
    let active = validSectionIds.has(initialSection) ? initialSection : "appearance";
    const host = el("div", { class: "settings-shell" });
    let dialog;
    const close = () => {
      resetDialogState();
      closeActiveSettingsDialog = null;
      dialog.remove();
    };
    closeActiveSettingsDialog = close;
    dialog = editorModal(t("settings.title"), host, close, true, t("common.close"));
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
    let renderedSection = "";
    const settingsMain = el("main", { class: "settings-main" });
    const selectSection = (id) => {
      if (!validSectionIds.has(id) || id === active) return;
      active = id;
      redraw();
    };
    const settingsTabEntries = SETTINGS_SECTIONS.map(([id, labelKey, descriptionKey, icon]) => {
      const label = el("strong", {}, t(labelKey));
      const description = el("small", {}, t(descriptionKey));
      const tab = el("button", {
        class: `settings-tab ${id === active ? "active" : ""}`,
        dataset: { settingsSectionId: id },
        type: "button",
        onclick: () => selectSection(id)
      }, svgIcon(icon), el("span", { class: "settings-tab-copy" }, label, description));
      return { id, labelKey, descriptionKey, label, description, tab };
    });
    const settingsNav = el("nav", { class: "settings-tabs", "aria-label": t("settings.sections") },
      settingsTabEntries.map(({ tab }) => tab)
    );
    host.append(el("aside", { class: "settings-sidebar" }, settingsNav), settingsMain);

    function redraw() {
      const mainScrollTop = settingsMainScrollTopForRedraw(renderedSection, active, settingsMain.scrollTop);
      appearanceSection.cleanupPane();
      const section = settingsSectionMeta(active);
      clear(modalSectionTitle);
      modalSectionTitle.append(el("h3", {}, section.label), el("p", {}, section.description));
      settingsNav.setAttribute("aria-label", t("settings.sections"));
      settingsMain.dataset.settingsSectionId = active;
      for (const entry of settingsTabEntries) {
        entry.tab.classList.toggle("active", entry.id === active);
        entry.label.textContent = t(entry.labelKey);
        entry.description.textContent = t(entry.descriptionKey);
      }
      settingsMain.replaceChildren(settingsPane(active, redraw, selectSection));
      settingsMain.scrollTop = mainScrollTop;
      renderedSection = active;
    }
    redraw();
  }

  return Object.freeze({
    importConfigText: importExportSettings.importConfigText,
    insertTextIntoPrompt: promptLibraryController.insertTextIntoPrompt,
    openCustomAppEditor: appsSection.openCustomAppEditor,
    openPromptLibraryDialog: promptLibraryController.openPromptLibraryDialog,
    openSettings,
    promptLibraryManager: promptLibraryController.promptLibraryManager
  });
}
