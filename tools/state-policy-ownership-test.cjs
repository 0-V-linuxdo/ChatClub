#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const compatibility = read("app/state.js");
  const engine = read("app/state/port.js");
  const schema = read("app/state/schema.js");
  const policies = [
    "app/composer/state-port.js",
    "app/preferred-model/state-port.js",
    "app/topbar/state-port.js",
    "app/favicon/state-port.js",
    "app/workspace/state-port.js",
    "app/summary/state-port.js",
    "app/pocket/state-port.js",
    "app/optimize/state-port.js",
    "app/functional-anomalies/state-port.js",
    "app/settings/state-ports.js"
  ];

  assert.ok(compatibility.split(/\r?\n/).length < 100, "compatibility state assembly must stay thin");
  assert.match(schema, /export function createAppState/);
  assert.doesNotMatch(schema, /STATE_ACCESS|createScopedStatePort/, "root schema must not own capability policy");
  assert.match(engine, /export function createScopedStatePort/);
  assert.match(engine, /readonlyStateValue/);
  assert.doesNotMatch(
    engine,
    /COMPOSER_STATE_ACCESS|WORKSPACE_STATE_ACCESS|SETTINGS_SECTION_STATE_ACCESS/,
    "generic state enforcement must not know feature policy names"
  );
  for (const file of policies) {
    const source = read(file);
    assert.match(source, /STATE_ACCESS|SETTINGS_SECTION_STATE_ACCESS/, `${file} must own a capability declaration`);
    assert.match(source, /createScopedStatePort|createSettingsSectionStatePorts/, `${file} must construct its own scoped port`);
  }

  const stateModule = await import(pathToFileURL(path.join(root, "app/state.js")).href);
  const workspaceModule = await import(pathToFileURL(path.join(root, "app/workspace/state-port.js")).href);
  const workspaceOwnerModule = await import(pathToFileURL(path.join(root, "app/workspace/state-ports.js")).href);
  const composerModule = await import(pathToFileURL(path.join(root, "app/composer/state-port.js")).href);
  const settingsModule = await import(pathToFileURL(path.join(root, "app/settings/state-ports.js")).href);
  const rootState = stateModule.createAppState();
  rootState.options = {
    themeMode: "dark",
    modelPreferences: { Gemini: "pro" },
    messageNavigatorEffectMode: "border",
    nested: { enabled: true }
  };
  rootState.groups = [{ id: "group-1", chatApps: [] }];

  const workspace = workspaceModule.createWorkspaceStatePort(rootState);
  const workspaceOwners = workspaceOwnerModule.createWorkspaceOwnerStatePorts(workspace);
  const composer = composerModule.createComposerStatePort(rootState);
  const settings = settingsModule.createSettingsSectionStatePorts(rootState);
  assert.throws(() => workspace.promptText, /workspace cannot read app state\.promptText/);
  assert.throws(() => { workspace.customConfig = []; }, /workspace cannot mutate app state\.customConfig/);
  assert.throws(
    () => { workspaceOwners.messageNavigator.options.themeMode = "light"; },
    /workspace\.messageNavigator cannot mutate read-only workspace state\.options\.themeMode/
  );
  assert.throws(
    () => workspaceOwners.messageNavigator.groups.push({ id: "group-2", chatApps: [] }),
    /workspace\.messageNavigator cannot mutate read-only workspace state\.groups/
  );
  assert.throws(
    () => workspaceOwners.render.frameLoadingInstanceIds.push("frame-1"),
    /workspace\.render cannot mutate read-only workspace state\.frameLoadingInstanceIds/
  );
  assert.throws(
    () => { workspaceOwners.frame.options.themeMode = "light"; },
    /workspace\.frame cannot mutate read-only workspace state\.options\.themeMode/
  );
  assert.throws(
    () => { workspaceOwners.pocket.options.themeMode = "light"; },
    /workspace\.pocket cannot mutate read-only workspace state\.options\.themeMode/
  );
  const workspaceDescriptor = Object.getOwnPropertyDescriptor(workspaceOwners.messageNavigator.options, "nested");
  assert.throws(
    () => { workspaceDescriptor.value.enabled = false; },
    /workspace\.messageNavigator cannot mutate read-only workspace state\.options\.nested\.enabled/
  );
  assert.throws(
    () => Object.preventExtensions(workspaceOwners.messageNavigator.groups),
    /workspace\.messageNavigator cannot mutate read-only workspace state\.groups/
  );
  workspaceOwners.layout.options.themeMode = "light";
  workspaceOwners.frame.groups.push({ id: "group-2", chatApps: [] });
  assert.equal(rootState.options.themeMode, "light", "write owners must retain intentional nested mutation access");
  assert.equal(rootState.groups.length, 2, "write owners must retain intentional collection mutation access");
  assert.throws(() => composer.groups, /composer cannot read app state\.groups/);
  assert.throws(() => { composer.options.themeMode = "light"; }, /read-only/);
  const composerDescriptor = Object.getOwnPropertyDescriptor(composer.options, "nested");
  assert.throws(() => { composerDescriptor.value.enabled = false; }, /read-only app state\.options\.nested\.enabled/);
  assert.throws(() => Object.preventExtensions(composer.options), /read-only app state\.options/);
  assert.equal(Object.isExtensible(rootState.options), true, "read-only meta operations must not affect root state");
  assert.throws(() => settings.appearance.options.modelPreferences, /settings\.appearance cannot read/);
  assert.throws(() => {
    settings.appearance.options = { ...rootState.options, modelPreferences: { Gemini: "flash" } };
  }, /cannot mutate app state\.options\.modelPreferences/);
  assert.throws(() => settings.models.settingsAppearanceTab, /settings\.models cannot read/);

  console.log("state policy ownership and negative capabilities: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
