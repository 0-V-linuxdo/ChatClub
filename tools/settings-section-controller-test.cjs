#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const stateKeys = (source) => [...new Set(
  [...source.matchAll(/\bstate\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1])
)].sort();
const previousDocument = globalThis.document;
globalThis.document = { addEventListener() {} };

(async () => {
  const controllerSource = read("app/settings/controller.js");
  const runtimeSource = read("app/runtime.js");
  const stateSource = read("app/state.js");
  const appearanceSource = read("app/settings/appearance.js");
  const summarySource = read("app/settings/summary.js");
  const optimizeSource = read("app/settings/optimize.js");
  const promptTemplatesSource = read("app/settings/prompt-templates.js");
  const messageSource = read("app/settings/message-navigation.js");
  const topicSource = read("app/settings/topic-deletion.js");
  const profilesSource = read("app/settings/profiles.js");
  const appsSource = read("app/settings/apps.js");
  const modelsSource = read("app/settings/models.js");
  const historySource = read("app/settings/history.js");

  const controllerLines = controllerSource.trim().split(/\r?\n/).length;
  assert.ok(controllerLines <= 700, `Settings shell must remain at or below 700 lines; found ${controllerLines}`);
  for (const [factory, port] of [
    ["createAppearanceSettingsSection", "appearance"],
    ["createProfilesSettingsSection", "profiles"],
    ["createAppsSettingsSection", "apps"],
    ["createModelsSettingsSection", "models"],
    ["createSummarySettingsSection", "summary"],
    ["createMessageNavigationSettingsSection", "messageNavigation"],
    ["createTopicDeletionSettingsSection", "topicDeletion"],
    ["createOptimizeSettingsSection", "optimize"],
    ["createPromptHistorySettingsSection", "history"]
  ]) {
    assert.match(controllerSource, new RegExp(factory));
    assert.match(controllerSource, new RegExp(`state:\\s*settingsSections\\.${port}`));
  }
  assert.match(controllerSource, /const settingsSectionPanes = Object\.freeze\(\{/);
  assert.doesNotMatch(controllerSource, /\bstate\./);
  assert.doesNotMatch(controllerSource, /function (?:appearancePane|summarySettingsPane|optimizeSettingsPane|openPromptTemplateEditor|openSummaryCollectorEditor|topbarPromptPlaceholderBlock)\b/);
  assert.match(runtimeSource, /createSettingsSectionStatePorts\(state\)/);
  assert.match(runtimeSource, /settingsSections:\s*featureState\.settingsSections/);
  assert.match(runtimeSource, /saveOptionsPatch/);
  assert.doesNotMatch(runtimeSource, /state:\s*featureState\.settings/);
  assert.doesNotMatch(`${runtimeSource}\n${stateSource}`, /createSettingsControllerStatePort|combinedSettingsAccess/);

  assert.deepEqual(stateKeys(appearanceSource), [
    "options",
    "settingsAppearanceTab",
    "settingsAppearanceTopbarTab",
    "settingsTabGroupButtonDragId",
    "settingsTabGroupButtonOrderDraft",
    "settingsTabGroupButtonPlacementDraft",
    "settingsTopbarPromptPlaceholderDraft",
    "settingsTopbarPromptPlaceholderDragIndex",
    "settingsTopbarPromptPlaceholderEditingIndex",
    "topbarEditLayoutDraft"
  ]);
  assert.deepEqual(stateKeys(summarySource), [
    "options",
    "summaryCollectorDragId",
    "summaryCollectorEditingId",
    "summarySettingsTab"
  ]);
  assert.deepEqual(stateKeys(optimizeSource), []);
  assert.deepEqual(stateKeys(promptTemplatesSource), ["options", "settingsPromptTemplateDragId"]);
  assert.match(optimizeSource, /\["options", "settingsPromptTemplateDragId"\]/);
  assert.match(summarySource, /createPromptTemplateSettings\(\{/);
  assert.match(optimizeSource, /createPromptTemplateSettings\(\{/);
  assert.deepEqual(stateKeys(messageSource), [
    "messageNavigatorSettingsTab",
    "messageNavigatorSiteExpandedId",
    "options"
  ]);
  assert.deepEqual(stateKeys(topicSource), ["options", "topicDeleteSiteExpandedId"]);
  assert.deepEqual(stateKeys(profilesSource), ["options", "settingsProfileDragId"]);
  assert.deepEqual(stateKeys(appsSource), [
    "customConfig",
    "options",
    "settingsAppsTab",
    "settingsBuiltinAppDragId",
    "settingsCustomAppDragId"
  ]);
  assert.deepEqual(stateKeys(modelsSource), ["modelPreferenceDraft", "options"]);
  assert.deepEqual(stateKeys(historySource), [
    "promptHistoryCursor",
    "promptHistoryDraft",
    "promptSelection",
    "promptSendHistory",
    "promptText"
  ]);

  const stateModule = await import(moduleUrl("app/state.js"));
  const appearanceModule = await import(moduleUrl("app/settings/appearance.js"));
  const summaryModule = await import(moduleUrl("app/settings/summary.js"));
  const optimizeModule = await import(moduleUrl("app/settings/optimize.js"));
  const messageModule = await import(moduleUrl("app/settings/message-navigation.js"));
  const topicModule = await import(moduleUrl("app/settings/topic-deletion.js"));
  const profilesModule = await import(moduleUrl("app/settings/profiles.js"));
  const appsModule = await import(moduleUrl("app/settings/apps.js"));
  const modelsModule = await import(moduleUrl("app/settings/models.js"));
  const historyModule = await import(moduleUrl("app/settings/history.js"));
  const rootState = stateModule.createAppState();
  rootState.options = {
    apiProfiles: [{ id: "api-1", name: "API", endpoint: "https://example.test", model: "model" }],
    builtinChatAppOrder: [],
    colMaxCount: 4,
    frameLoadingOverlayOpacity: 0.5,
    frameToastPosition: { x: 50, y: 50 },
    language: "system",
    messageNavigatorEffectMode: "border",
    messageNavigatorSiteConfigs: [],
    modelPreferenceOrder: [],
    modelPreferences: {},
    optimizeApiProfileId: "api-1",
    optimizePromptTemplateId: "optimize-default",
    optimizePromptTemplates: [],
    primaryColor: "#6750a4",
    primaryColorCustom: false,
    summaryApiProfileId: "api-1",
    summaryPromptTemplateId: "summary-default",
    summaryPromptTemplates: [],
    summarySiteConfigs: [],
    tabGroupButtonOrder: [],
    tabGroupButtonPlacement: {},
    tabGroupButtonsMode: "pinned",
    themeMode: "dark",
    tooltipDisabledIds: [],
    topbarPromptPlaceholderConfig: { enabled: true, intervalSec: 5, items: [] },
    topicDeleteSiteConfigs: []
  };
  rootState.customConfig = [];
  rootState.messageNavigatorSettingsTab = "sites";
  rootState.messageNavigatorSiteExpandedId = "site-1";
  const ports = stateModule.createSettingsSectionStatePorts(rootState);

  assert.equal(ports.messageNavigation.options.messageNavigatorEffectMode, "border");
  assert.equal(ports.topicDeletion.options.topicDeleteSiteConfigs.length, 0);
  assert.throws(() => { ports.messageNavigation.options.themeMode; }, /settings\.messageNavigation cannot read/);
  assert.throws(() => { ports.topicDeletion.messageNavigatorSettingsTab; }, /settings\.topicDeletion cannot read/);

  const sharedDependencies = {
    svgIcon: () => ({}),
    notifyConfigReload: async () => {},
    saveOptionsPatch: async (patch) => {
      rootState.options = { ...rootState.options, ...patch };
      return rootState.options;
    }
  };
  const sectionConstructors = [
    [appearanceModule.createAppearanceSettingsSection, ports.appearance, {
      svgIcon: sharedDependencies.svgIcon,
      saveOptionsPatch: sharedDependencies.saveOptionsPatch,
      applyTheme() {},
      syncI18nLanguage() {},
      syncTopbar() {},
      syncTopbarPromptPlaceholder() {},
      syncWorkspaceDom() {},
      syncSummaryPanel() {},
      enterTopbarEditMode() {},
      closeSettingsDialog() {}
    }],
    [profilesModule.createProfilesSettingsSection, ports.profiles, {
      ...sharedDependencies,
      openTabUrl() {}
    }],
    [appsModule.createAppsSettingsSection, ports.apps, {
      ...sharedDependencies,
      reconcileAppCatalog: async () => {},
      syncSummaryPanel() {},
      syncWorkspaceDom() {}
    }],
    [modelsModule.createModelsSettingsSection, ports.models, {
      ...sharedDependencies,
      applyPreferredModels: async () => {}
    }],
    [summaryModule.createSummarySettingsSection, ports.summary, {
      ...sharedDependencies,
      ensureUserScriptsPermission: async () => true
    }],
    [messageModule.createMessageNavigationSettingsSection, ports.messageNavigation, sharedDependencies],
    [topicModule.createTopicDeletionSettingsSection, ports.topicDeletion, {
      ...sharedDependencies,
      ensureUserScriptsPermission: async () => true
    }],
    [optimizeModule.createOptimizeSettingsSection, ports.optimize, sharedDependencies],
    [historyModule.createPromptHistorySettingsSection, ports.history, {
      svgIcon: sharedDependencies.svgIcon,
      setPromptImages() {},
      ensurePromptInputReady: () => true,
      syncPromptInputNode: () => null
    }]
  ];
  for (const [createSection, port, dependencies] of sectionConstructors) {
    assert.doesNotThrow(() => createSection({ state: port, ...dependencies }));
    assert.throws(
      () => createSection({ state: ports.shell, ...dependencies }),
      /requires its dedicated settings section state port/
    );
  }

  const messageSection = messageModule.createMessageNavigationSettingsSection({
    state: ports.messageNavigation,
    ...sharedDependencies
  });
  messageSection.reset();
  assert.equal(rootState.messageNavigatorSettingsTab, "effects");
  assert.equal(rootState.messageNavigatorSiteExpandedId, "");
  assert.throws(
    () => messageModule.createMessageNavigationSettingsSection({
      state: ports.messageNavigation,
      ...sharedDependencies,
      combinedState: rootState
    }),
    /received extra dependencies field combinedState/
  );

  console.log("settings section controllers and state-port wiring: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});
