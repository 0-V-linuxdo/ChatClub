import { createScopedStatePort, objectStateAccess, stateAccess } from "../state/port.js";

const APPEARANCE_OPTION_ACCESS = objectStateAccess([
  "colMaxCount", "frameLoadingOverlayOpacity", "frameToastPosition", "language", "primaryColor", "primaryColorCustom",
  "tabGroupButtonOrder", "tabGroupButtonPlacement", "tabGroupButtonsMode", "themeMode", "tooltipDisabledIds",
  "topbarPromptPlaceholderConfig"
], [
  "colMaxCount", "frameLoadingOverlayOpacity", "frameToastPosition", "language", "primaryColor", "primaryColorCustom",
  "tabGroupButtonOrder", "tabGroupButtonPlacement", "tabGroupButtonsMode", "themeMode", "tooltipDisabledIds",
  "topbarPromptPlaceholderConfig"
]);
const PROFILE_OPTION_ACCESS = objectStateAccess(
  ["apiProfiles", "optimizeApiProfileId", "summaryApiProfileId"],
  ["apiProfiles", "optimizeApiProfileId", "summaryApiProfileId"]
);
const APP_OPTION_ACCESS = objectStateAccess(["builtinChatAppOrder"], ["builtinChatAppOrder"]);
const MODEL_OPTION_ACCESS = objectStateAccess(
  ["modelPreferenceOrder", "modelPreferences"],
  ["modelPreferenceOrder", "modelPreferences"]
);
const SUMMARY_OPTION_ACCESS = objectStateAccess([
  "apiProfiles", "summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"
], ["summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"]);
const MESSAGE_NAVIGATION_OPTION_ACCESS = objectStateAccess(
  ["messageNavigatorEffectMode", "messageNavigatorSiteConfigs"],
  ["messageNavigatorEffectMode", "messageNavigatorSiteConfigs"]
);
const TOPIC_DELETION_OPTION_ACCESS = objectStateAccess(["topicDeleteSiteConfigs"], ["topicDeleteSiteConfigs"]);
const OPTIMIZE_OPTION_ACCESS = objectStateAccess([
  "apiProfiles", "optimizeApiProfileId", "optimizePromptTemplateId", "optimizePromptTemplates"
], ["optimizeApiProfileId", "optimizePromptTemplateId", "optimizePromptTemplates"]);

export const COMPOSER_STATE_ACCESS = stateAccess([
  "options", "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptLibrary", "promptSelection",
  "promptSendHistory", "promptSendInFlight", "promptText", "shortcutConfig"
], [
  "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptSelection", "promptSendHistory",
  "promptSendInFlight", "promptText"
]);

export const PREFERRED_MODEL_STATE_ACCESS = stateAccess([
  "activeTabs", "frameLoadingInstanceIds", "groups", "modelPreferenceDraft", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState", "promptImages", "promptSelection", "promptSendInFlight", "promptText"
], [
  "preferredModelGateFailedAppIds", "preferredModelGateFailedCount", "preferredModelGatePendingCount",
  "preferredModelGateReason", "preferredModelGateState", "promptImages", "promptSelection", "promptText"
]);

export const TOPBAR_STATE_ACCESS = stateAccess([
  "activeTabs", "fullscreenGroupId", "groups", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState", "promptImages", "promptSendInFlight", "promptText", "shortcutConfig", "summaryOpen",
  "promptLibrary", "temporaryLayoutPreset", "topbarEditDragId", "topbarEditLayoutDraft", "topbarEditMode"
], ["options", "topbarEditDragId", "topbarEditLayoutDraft", "topbarEditMode"]);

export const FAVICON_STATE_ACCESS = stateAccess(
  ["customConfig", "faviconCache", "options"],
  ["faviconCache"]
);

export const SETTINGS_STATE_SECTION_IDS = Object.freeze([
  "appearance",
  "profiles",
  "apps",
  "models",
  "summary",
  "messageNavigation",
  "topicDeletion",
  "optimize",
  "prompts",
  "history",
  "shortcuts",
  "io",
  "about",
  "shell"
]);

export const SETTINGS_UI_SECTION_STATE_PORT = Object.freeze({
  appearance: "appearance",
  profiles: "profiles",
  apps: "apps",
  models: "models",
  summary: "summary",
  messageNavigation: "messageNavigation",
  topicDeletion: "topicDeletion",
  optimize: "optimize",
  prompts: "prompts",
  promptHistory: "history",
  shortcuts: "shortcuts",
  io: "io",
  about: "about"
});

export const SETTINGS_SECTION_STATE_ACCESS = Object.freeze({
  appearance: stateAccess([
    "options", "settingsAppearanceTab", "settingsAppearanceTopbarTab", "settingsTabGroupButtonDragId",
    "settingsTabGroupButtonOrderDraft", "settingsTabGroupButtonPlacementDraft", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "topbarEditLayoutDraft"
  ], [
    "options", "settingsAppearanceTab", "settingsAppearanceTopbarTab", "settingsTabGroupButtonDragId",
    "settingsTabGroupButtonOrderDraft", "settingsTabGroupButtonPlacementDraft", "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex", "settingsTopbarPromptPlaceholderEditingIndex", "topbarEditLayoutDraft"
  ], { options: APPEARANCE_OPTION_ACCESS }),
  profiles: stateAccess(
    ["options", "settingsProfileDragId"],
    ["options", "settingsProfileDragId"],
    { options: PROFILE_OPTION_ACCESS }
  ),
  apps: stateAccess([
    "customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"
  ], ["customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"], {
    options: APP_OPTION_ACCESS
  }),
  models: stateAccess(
    ["modelPreferenceDraft", "options"],
    ["modelPreferenceDraft", "options"],
    { options: MODEL_OPTION_ACCESS }
  ),
  summary: stateAccess([
    "options", "settingsPromptTemplateDragId", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab"
  ], ["options", "settingsPromptTemplateDragId", "summaryCollectorDragId", "summaryCollectorEditingId", "summarySettingsTab"], {
    options: SUMMARY_OPTION_ACCESS
  }),
  messageNavigation: stateAccess([
    "messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"
  ], ["messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"], {
    options: MESSAGE_NAVIGATION_OPTION_ACCESS
  }),
  topicDeletion: stateAccess(
    ["options", "topicDeleteSiteExpandedId"],
    ["options", "topicDeleteSiteExpandedId"],
    { options: TOPIC_DELETION_OPTION_ACCESS }
  ),
  optimize: stateAccess(
    ["options", "settingsPromptTemplateDragId"],
    ["options", "settingsPromptTemplateDragId"],
    { options: OPTIMIZE_OPTION_ACCESS }
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
    "customConfig", "options", "pocketEntries", "promptLibrary", "promptSendHistory", "shortcutConfig"
  ], ["customConfig", "options", "pocketEntries", "promptLibrary", "promptSendHistory", "shortcutConfig"]),
  about: stateAccess(),
  shell: stateAccess()
});

export function createSettingsSectionStatePorts(rootState) {
  return Object.freeze(Object.fromEntries(SETTINGS_STATE_SECTION_IDS.map((section) => [
    section,
    createScopedStatePort(rootState, `settings.${section}`, SETTINGS_SECTION_STATE_ACCESS[section])
  ])));
}

export function settingsStatePortForUiSection(sectionPorts, sectionId) {
  const portId = SETTINGS_UI_SECTION_STATE_PORT[String(sectionId || "")];
  if (!portId || !sectionPorts?.[portId]) throw new TypeError(`Unknown settings section: ${sectionId}`);
  return sectionPorts[portId];
}
