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
    modelPreferenceOrder: ["Gemini"],
    modelPreferences: { Gemini: "pro" },
    nested: { enabled: true },
    summarySiteConfigs: [{ id: "second" }, { id: "first" }],
    themeMode: "system"
  };
  rootState.customConfig = [{ id: "custom-b" }, { id: "custom-a" }];
  rootState.groups = [{ id: "group-1" }];
  rootState.functionalAnomalyRecords = [{ id: "anomaly-1", message: "failed" }];

  const composer = composerModule.createComposerStatePort(rootState);
  composer.promptText = "hello";
  assert.equal(rootState.promptText, "hello");
  assert.throws(() => { composer.groups; }, /composer cannot read/);
  assert.throws(() => { composer.options.nested.enabled = false; }, /read-only/);

  const preferredModel = preferredModelModule.createPreferredModelStatePort(rootState);
  preferredModel.preferredModelGateState = "ready";
  assert.equal(rootState.preferredModelGateState, "ready");
  assert.equal(preferredModel.groups[0].id, "group-1");
  assert.throws(() => { preferredModel.groups.push({ id: "group-2" }); }, /read-only/);
  preferredModel.promptText = "restored snapshot";
  preferredModel.promptImages = [{ id: "image-1" }];
  preferredModel.promptSelection = { start: 3, end: 3, direction: "none" };
  assert.equal(rootState.promptText, "restored snapshot");
  assert.throws(() => { preferredModel.options.nested.enabled = false; }, /read-only/);

  const topbar = topbarModule.createTopbarStatePort(rootState);
  assert.equal(topbar.promptText, "restored snapshot");
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
    "optimize", "prompts", "history", "shortcuts", "io", "functionalAnomalies", "about", "shell"
  ]);

  settingsSections.appearance.settingsAppearanceTab = "topbar";
  assert.equal(rootState.settingsAppearanceTab, "topbar");
  assert.throws(() => { settingsSections.appearance.customConfig; }, /settings\.appearance cannot read/);
  assert.throws(() => { settingsSections.appearance.options.modelPreferences; }, /settings\.appearance cannot read/);
  settingsSections.appearance.options.themeMode = "dark";
  assert.equal(rootState.options.themeMode, "dark");
  assert.throws(() => {
    settingsSections.appearance.options = {
      ...rootState.options,
      modelPreferences: { Gemini: "flash" }
    };
  }, /settings\.appearance cannot mutate app state\.options\.modelPreferences/);
  assert.throws(() => { settingsSections.apps.settingsAppearanceTab = "workspace"; }, /settings\.apps cannot mutate/);
  assert.throws(() => { settingsSections.summary.options.apiProfiles.push({ id: "profile-2" }); }, /read-only/);
  assert.throws(() => { settingsSections.about.options; }, /settings\.about cannot read/);
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
  assert.equal(allPorts.composer.promptText, "restored snapshot");
  assert.equal(allPorts.preferredModel.preferredModelGateState, "ready");
  assert.equal(allPorts.topbar.topbarEditMode, true);
  assert.equal(allPorts.favicon.faviconCache.example.url, "https://example.com/favicon.ico");

  console.log("feature and settings state ports: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
