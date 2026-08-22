import { createScopedStatePort, objectStateAccess, stateAccess } from "../state/port.js";

function optionCapability(read = [], write = read) {
  return Object.freeze({
    read: Object.freeze([...read]),
    write: Object.freeze([...write])
  });
}

export const SETTINGS_OPTION_CAPABILITIES = Object.freeze({
  appearance: optionCapability([
    "colMaxCount", "frameLoadingOverlayOpacity", "frameToastPosition", "language",
    "modelPreferenceSelectionOverlayEnabled", "modelPreferenceSelectionOverlayOpacity", "primaryColor", "primaryColorCustom",
    "tabContextMenuHiddenIds", "tabContextMenuOrder", "tabGroupButtonOrder", "tabGroupButtonPlacement", "tabGroupButtonsMode",
    "themeMode", "tooltipDisabledIds",
    "topbarPromptInputFontSize", "topbarPromptPlaceholderConfig"
  ]),
  profiles: optionCapability(["apiProfiles", "optimizeApiProfileId", "summaryApiProfileId", "topicTitleApiProfileId"]),
  apps: optionCapability(["builtinChatAppOrder", "builtinChatAppIframeConfigs", "iframePermissionsSource"]),
  models: optionCapability([
    "modelPreferenceFailureOverrides", "modelPreferenceFailurePolicy", "modelPreferenceOrder", "modelPreferences"
  ]),
  summary: optionCapability(
    ["apiProfiles", "summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"],
    ["summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"]
  ),
  messageNavigation: optionCapability(["messageNavigatorEffectMode", "messageNavigatorSiteConfigs"]),
  topicDeletion: optionCapability(["topicDeleteSiteConfigs"]),
  optimize: optionCapability(
    ["apiProfiles", "optimizeApiProfileId", "optimizePromptTemplateId", "optimizePromptTemplates"],
    ["optimizeApiProfileId", "optimizePromptTemplateId", "optimizePromptTemplates"]
  )
});

function settingsOptionAccess(section) {
  const capability = SETTINGS_OPTION_CAPABILITIES[section];
  if (!capability) throw new TypeError(`Unknown settings option capability: ${section}`);
  return objectStateAccess(capability.read, capability.write);
}

const SETTINGS_STATE_SECTION_IDS = Object.freeze([
  "appearance",
  "profiles",
  "apps",
  "models",
  "summary",
  "messageNavigation",
  "topicDeletion",
  "rules",
  "optimize",
  "prompts",
  "history",
  "shortcuts",
  "io",
  "functionalAnomalies",
  "about",
  "shell"
]);

const SETTINGS_SECTION_STATE_ACCESS = Object.freeze({
  appearance: stateAccess([
    "options", "settingsAppearancePrimaryColorDraft", "settingsAppearanceTab", "settingsAppearanceTopbarTab",
    "settingsAppearanceWorkspaceTab", "settingsTabContextMenuDragId", "settingsTabContextMenuHiddenIdsDraft",
    "settingsTabContextMenuOrderDraft", "settingsTabGroupButtonDragId", "settingsTabGroupButtonOrderDraft",
    "settingsTabGroupButtonPlacementDraft", "settingsTabGroupTab", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "topbarEditLayoutDraft"
  ], [
    "options", "settingsAppearancePrimaryColorDraft", "settingsAppearanceTab", "settingsAppearanceTopbarTab",
    "settingsAppearanceWorkspaceTab", "settingsTabContextMenuDragId", "settingsTabContextMenuHiddenIdsDraft",
    "settingsTabContextMenuOrderDraft", "settingsTabGroupButtonDragId", "settingsTabGroupButtonOrderDraft",
    "settingsTabGroupButtonPlacementDraft", "settingsTabGroupTab", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "topbarEditLayoutDraft"
  ], { options: settingsOptionAccess("appearance") }),
  profiles: stateAccess(
    ["options", "settingsProfileDragId"],
    ["options", "settingsProfileDragId"],
    { options: settingsOptionAccess("profiles") }
  ),
  apps: stateAccess([
    "customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"
  ], ["customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"], {
    options: settingsOptionAccess("apps")
  }),
  models: stateAccess(
    ["modelPreferenceDraft", "modelPreferenceSettingsTab", "options"],
    ["modelPreferenceDraft", "modelPreferenceSettingsTab", "options"],
    { options: settingsOptionAccess("models") }
  ),
  summary: stateAccess([
    "options", "settingsPromptTemplateDragId", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab"
  ], ["options", "settingsPromptTemplateDragId", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab"], {
    options: settingsOptionAccess("summary")
  }),
  messageNavigation: stateAccess([
    "messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"
  ], ["messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"], {
    options: settingsOptionAccess("messageNavigation")
  }),
  topicDeletion: stateAccess(
    ["options", "topicDeleteSiteExpandedId"],
    ["options", "topicDeleteSiteExpandedId"],
    { options: settingsOptionAccess("topicDeletion") }
  ),
  rules: stateAccess(),
  optimize: stateAccess(
    ["options", "settingsPromptTemplateDragId"],
    ["options", "settingsPromptTemplateDragId"],
    { options: settingsOptionAccess("optimize") }
  ),
  prompts: stateAccess([
    "promptHistoryCursor", "promptHistoryDraft", "promptLibrary", "promptSelection", "promptText",
    "settingsPromptLibraryDragId"
  ], [
    "promptHistoryCursor", "promptHistoryDraft", "promptLibrary", "promptSelection", "promptText",
    "settingsPromptLibraryDragId"
  ]),
  history: stateAccess([
    "promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"
  ], ["promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"]),
  shortcuts: stateAccess([
    "shortcutConfig", "shortcutDraftConfig", "shortcutRecordingAction", "shortcutSettingsTab"
  ], ["shortcutConfig", "shortcutDraftConfig", "shortcutRecordingAction", "shortcutSettingsTab"]),
  io: stateAccess([
    "customConfig", "options", "pocketEntries", "promptLibrary", "promptSendHistory", "shortcutConfig", "storedOptions"
  ], ["customConfig", "options", "pocketEntries", "promptLibrary", "promptSendHistory", "shortcutConfig"]),
  functionalAnomalies: stateAccess(["functionalAnomalyRecords"]),
  about: stateAccess(),
  shell: stateAccess()
});

export function createSettingsSectionStatePorts(rootState) {
  return Object.freeze(Object.fromEntries(SETTINGS_STATE_SECTION_IDS.map((section) => [
    section,
    createScopedStatePort(rootState, `settings.${section}`, SETTINGS_SECTION_STATE_ACCESS[section])
  ])));
}
