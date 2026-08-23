#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const stateModule = await import(moduleUrl("app/state.js"));
  const composerModule = await import(moduleUrl("app/composer/state-port.js"));
  const preferredModelModule = await import(moduleUrl("app/preferred-model/state-port.js"));
  const topbarModule = await import(moduleUrl("app/topbar/state-port.js"));
  const faviconModule = await import(moduleUrl("app/favicon/state-port.js"));
  const settingsModule = await import(moduleUrl("app/settings/state-ports.js"));

  const rootState = stateModule.createAppState();
  assert.equal(Object.isFrozen(settingsModule.SETTINGS_OPTION_CAPABILITIES.appearance.write), true);
  rootState.options = {
    apiProfiles: [{ id: "profile-1" }],
    modelPreferenceFailureOverrides: { Gemini: "inherit" },
    modelPreferenceFailurePolicy: "send-current",
    modelPreferenceOrder: ["Gemini"],
    modelPreferences: { Gemini: "pro" },
    nested: { enabled: true },
    recordFullText: false,
    summarySiteConfigs: [{ id: "second" }, { id: "first" }],
    themeMode: "system"
  };
  rootState.customConfig = [{ id: "custom-b" }, { id: "custom-a" }];
  rootState.groups = [{ id: "group-1" }];
  rootState.functionalAnomalyRecords = [{ id: "anomaly-1", message: "failed" }];

  const composer = composerModule.createComposerStatePort(rootState);
  composer.promptText = "hello";
  composer.promptQueuedTargetCount = 3;
  composer.promptSendingTargetCount = 1;
  assert.equal(rootState.promptText, "hello");
  assert.equal(rootState.promptQueuedTargetCount, 3);
  assert.throws(() => { composer.groups; }, /composer cannot read/);
  assert.throws(() => { composer.options.nested.enabled = false; }, /read-only/);

  const preferredModel = preferredModelModule.createPreferredModelStatePort(rootState);
  preferredModel.preferredModelGateState = "ready";
  assert.equal(rootState.preferredModelGateState, "ready");
  assert.throws(() => { preferredModel.groups; }, /preferredModel cannot read/);
  assert.throws(() => { preferredModel.promptText; }, /preferredModel cannot read/);
  assert.throws(() => { preferredModel.promptImages = []; }, /preferredModel cannot mutate/);
  assert.throws(() => { preferredModel.options.nested.enabled = false; }, /read-only/);

  const topbar = topbarModule.createTopbarStatePort(rootState);
  assert.equal(topbar.promptText, "hello");
  assert.equal(topbar.promptQueuedTargetCount, 3);
  assert.equal(topbar.promptSendingTargetCount, 1);
  topbar.topbarEditMode = true;
  assert.equal(rootState.topbarEditMode, true);
  assert.throws(() => { topbar.promptText = "cross-feature write"; }, /topbar cannot mutate/);

  const favicon = faviconModule.createFaviconStatePort(rootState);
  favicon.faviconCache.example = { url: "https://example.com/favicon.ico" };
  assert.equal(rootState.faviconCache.example.url, "https://example.com/favicon.ico");
  assert.throws(() => { favicon.options.nested.enabled = false; }, /read-only/);
  assert.throws(() => { favicon.groups; }, /favicon cannot read/);

  const settingsSections = settingsModule.createSettingsSectionStatePorts(rootState);
  assert.deepEqual(Object.keys(settingsSections), [
    "appearance", "profiles", "apps", "models", "summary", "messageNavigation", "topicDeletion",
    "rules", "optimize", "prompts", "history", "shortcuts", "io", "functionalAnomalies", "about", "shell"
  ]);

  assert.equal(settingsSections.appearance.settingsAppearancePrimaryColorDraft, "");
  assert.equal(settingsSections.appearance.settingsAppearanceWorkspaceTab, "general");
  settingsSections.appearance.settingsAppearancePrimaryColorDraft = "#123456";
  assert.equal(rootState.settingsAppearancePrimaryColorDraft, "#123456");
  settingsSections.appearance.settingsAppearanceTab = "topbar";
  assert.equal(rootState.settingsAppearanceTab, "topbar");
  settingsSections.appearance.settingsAppearanceWorkspaceTab = "overlays";
  assert.equal(rootState.settingsAppearanceWorkspaceTab, "overlays");
  assert.throws(() => { settingsSections.appearance.customConfig; }, /settings\.appearance cannot read/);
  assert.throws(() => { settingsSections.appearance.options.modelPreferences; }, /settings\.appearance cannot read/);
  assert.throws(() => { settingsSections.appearance.options.modelPreferenceFailurePolicy; }, /settings\.appearance cannot read/);
  settingsSections.appearance.options.themeMode = "dark";
  assert.equal(rootState.options.themeMode, "dark");
  assert.equal(settingsSections.appearance.options.recordFullText, false);
  settingsSections.appearance.options.recordFullText = true;
  assert.equal(rootState.options.recordFullText, true);
  assert.throws(() => {
    settingsSections.appearance.options = {
      ...rootState.options,
      modelPreferences: { Gemini: "flash" }
    };
  }, /settings\.appearance cannot mutate app state\.options\.modelPreferences/);
  assert.throws(() => { settingsSections.apps.settingsAppearanceTab = "workspace"; }, /settings\.apps cannot mutate/);
  assert.throws(() => { settingsSections.apps.settingsAppearanceWorkspaceTab = "color"; }, /settings\.apps cannot mutate/);
  assert.throws(() => { settingsSections.apps.settingsAppearancePrimaryColorDraft = "#ffffff"; }, /settings\.apps cannot mutate/);
  assert.throws(() => { settingsSections.summary.options.apiProfiles.push({ id: "profile-2" }); }, /read-only/);
  assert.throws(() => { settingsSections.about.options; }, /settings\.about cannot read/);
  assert.throws(() => { settingsSections.rules.options; }, /settings\.rules cannot read/);
  assert.equal(settingsSections.functionalAnomalies.functionalAnomalyRecords[0].id, "anomaly-1");
  assert.throws(
    () => { settingsSections.functionalAnomalies.functionalAnomalyRecords.push({ id: "anomaly-2" }); },
    /read-only/
  );
  assert.throws(
    () => { settingsSections.functionalAnomalies.functionalAnomalyRecords = []; },
    /settings\.functionalAnomalies cannot mutate/
  );
  assert.throws(() => { settingsSections.shell.options; }, /settings\.shell cannot read/);

  settingsSections.apps.customConfig = [...rootState.customConfig].reverse();
  settingsSections.summary.options = {
    ...rootState.options,
    summarySiteConfigs: [...rootState.options.summarySiteConfigs].reverse()
  };
  const reopened = settingsModule.createSettingsSectionStatePorts(rootState);
  assert.deepEqual(reopened.apps.customConfig.map(({ id }) => id), ["custom-a", "custom-b"]);
  assert.deepEqual(reopened.summary.options.summarySiteConfigs.map(({ id }) => id), ["first", "second"]);

  assert.equal(settingsModule.createSettingsControllerStatePort, undefined);

  const allPorts = stateModule.createFeatureStatePorts(rootState);
  assert.equal("settings" in allPorts, false);
  assert.equal(allPorts.settingsSections.models.options.modelPreferences.Gemini, "pro");
  assert.equal(allPorts.settingsSections.models.options.modelPreferenceFailurePolicy, "send-current");
  assert.equal(allPorts.settingsSections.models.options.modelPreferenceFailureOverrides.Gemini, "inherit");
  allPorts.settingsSections.models.options.modelPreferenceFailurePolicy = "skip";
  allPorts.settingsSections.models.options.modelPreferenceFailureOverrides = {
    ...allPorts.settingsSections.models.options.modelPreferenceFailureOverrides,
    Gemini: "send-current"
  };
  assert.equal(allPorts.preferredModel.options.modelPreferenceFailurePolicy, "skip");
  assert.equal(allPorts.preferredModel.options.modelPreferenceFailureOverrides.Gemini, "send-current");
  assert.equal(allPorts.composer.promptText, "hello");
  assert.equal(allPorts.composer.promptQueuedTargetCount, 3);
  assert.equal(allPorts.preferredModel.preferredModelGateState, "ready");
  assert.equal(allPorts.topbar.topbarEditMode, true);
  assert.equal(allPorts.favicon.faviconCache.example.url, "https://example.com/favicon.ico");

  console.log("feature and settings state ports: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
