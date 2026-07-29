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
  const workspaceModelModule = await import(pathToFileURL(path.join(root, "app/workspace/model.js")).href);
  const composerModule = await import(pathToFileURL(path.join(root, "app/composer/state-port.js")).href);
  const settingsModule = await import(pathToFileURL(path.join(root, "app/settings/state-ports.js")).href);
  const rootState = stateModule.createAppState();
  rootState.options = {
    themeMode: "dark",
    modelPreferenceFailureOverrides: { Gemini: "inherit" },
    modelPreferenceFailurePolicy: "send-current",
    modelPreferences: { Gemini: "pro" },
    messageNavigatorEffectMode: "border",
    nested: { enabled: true }
  };
  rootState.groups = [{
    id: "group-1",
    chatApps: [{ instanceId: "tab-1" }, { instanceId: "tab-2" }]
  }];
  rootState.activeTabs = { "group-1": "tab-1" };

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
  const renderGroup = workspaceOwners.render.groups[0];
  const renderChat = renderGroup.chatApps[0];
  const closeResult = workspaceModelModule.removeChatFromGroup(
    workspaceOwners.frame.groups,
    workspaceOwners.frame.activeTabs,
    renderGroup,
    renderChat
  );
  assert.deepEqual(closeResult, { removed: true, removeGroup: false, nextActiveId: "tab-2" });
  assert.deepEqual(
    rootState.groups[0].chatApps.map((chat) => chat.instanceId),
    ["tab-2"],
    "the frame owner must resolve a canonical writable group from a render-owned read-only proxy"
  );
  assert.equal(rootState.activeTabs["group-1"], "tab-2");
  const staleCloseResult = workspaceModelModule.removeChatFromGroup(
    workspaceOwners.frame.groups,
    workspaceOwners.frame.activeTabs,
    { id: "missing-group" },
    { instanceId: "tab-2" }
  );
  assert.deepEqual(staleCloseResult, { removed: false, removeGroup: false });
  assert.deepEqual(rootState.groups[0].chatApps.map((chat) => chat.instanceId), ["tab-2"]);

  const withinTabOne = { appId: "duplicate", instanceId: "within-tab-1" };
  const withinTabTwo = { appId: "duplicate", instanceId: "within-tab-2" };
  const withinTabThree = { appId: "duplicate", instanceId: "within-tab-3" };
  const withinRootState = stateModule.createAppState();
  withinRootState.groups = [{
    id: "within-group",
    chatApps: [withinTabOne, withinTabTwo, withinTabThree]
  }];
  withinRootState.activeTabs = { "within-group": "within-tab-2" };
  const withinWorkspace = workspaceModule.createWorkspaceStatePort(withinRootState);
  const withinOwners = workspaceOwnerModule.createWorkspaceOwnerStatePorts(withinWorkspace);
  const readonlyWithinGroup = withinOwners.render.groups[0];
  const readonlyWithinTab = readonlyWithinGroup.chatApps[0];
  const withinMove = workspaceModelModule.moveTabWithinGroup(
    withinOwners.drag.groups,
    readonlyWithinGroup.id,
    readonlyWithinTab.instanceId,
    3
  );
  assert.equal(withinMove.changed, true);
  assert.equal(withinMove.moved, withinTabOne, "ID-based reordering must return the canonical tab record");
  assert.deepEqual(
    withinRootState.groups[0].chatApps,
    [withinTabTwo, withinTabThree, withinTabOne],
    "render-owned read-only IDs must let the drag owner mutate canonical state without splicing the proxy"
  );

  const sourceLeft = { appId: "duplicate", instanceId: "source-left" };
  const sourceMoved = { appId: "duplicate", instanceId: "source-moved" };
  const sourceRight = { appId: "duplicate", instanceId: "source-right" };
  const targetLeft = { appId: "duplicate", instanceId: "target-left" };
  const targetRight = { appId: "duplicate", instanceId: "target-right" };
  const sourceGroup = { id: "source-group", chatApps: [sourceLeft, sourceMoved, sourceRight] };
  const targetGroup = { id: "target-group", chatApps: [targetLeft, targetRight] };
  const betweenRootState = stateModule.createAppState();
  betweenRootState.groups = [sourceGroup, targetGroup];
  betweenRootState.activeTabs = {
    "source-group": sourceMoved.instanceId,
    "target-group": targetLeft.instanceId
  };
  const betweenWorkspace = workspaceModule.createWorkspaceStatePort(betweenRootState);
  const betweenOwners = workspaceOwnerModule.createWorkspaceOwnerStatePorts(betweenWorkspace);
  const readonlySourceGroup = betweenOwners.render.groups[0];
  const readonlyTargetGroup = betweenOwners.render.groups[1];
  const betweenMove = workspaceModelModule.moveTabBetweenGroups(
    betweenOwners.drag.groups,
    betweenOwners.drag.activeTabs,
    readonlySourceGroup.id,
    readonlyTargetGroup.id,
    readonlySourceGroup.chatApps[1].instanceId,
    1
  );
  assert.equal(betweenMove.changed, true);
  assert.equal(betweenMove.moved, sourceMoved, "cross-group moves must preserve canonical tab identity");
  assert.equal(betweenMove.sourceGroup, sourceGroup);
  assert.equal(betweenMove.targetGroup, targetGroup);
  assert.deepEqual(sourceGroup.chatApps, [sourceLeft, sourceRight]);
  assert.deepEqual(targetGroup.chatApps, [targetLeft, sourceMoved, targetRight]);
  assert.equal(
    betweenRootState.activeTabs[sourceGroup.id],
    sourceRight.instanceId,
    "moving the active tab must select its nearest surviving source neighbor"
  );
  assert.equal(betweenRootState.activeTabs[targetGroup.id], sourceMoved.instanceId);
  assert.equal(betweenMove.previousTargetActiveId, targetLeft.instanceId);

  const inactiveMove = workspaceModelModule.moveTabBetweenGroups(
    betweenOwners.drag.groups,
    betweenOwners.drag.activeTabs,
    sourceGroup.id,
    targetGroup.id,
    sourceLeft.instanceId,
    Number.POSITIVE_INFINITY
  );
  assert.equal(inactiveMove.changed, true);
  assert.deepEqual(sourceGroup.chatApps, [sourceRight]);
  assert.deepEqual(targetGroup.chatApps, [targetLeft, sourceMoved, targetRight, sourceLeft]);
  assert.equal(
    betweenRootState.activeTabs[sourceGroup.id],
    sourceRight.instanceId,
    "moving an inactive tab must preserve the source group's active tab"
  );
  assert.equal(betweenRootState.activeTabs[targetGroup.id], sourceLeft.instanceId);

  const soleMoved = { appId: "duplicate", instanceId: "sole-moved" };
  const soleTargetTab = { appId: "duplicate", instanceId: "sole-target" };
  const soleSourceGroup = { id: "sole-source", chatApps: [soleMoved] };
  const soleTargetGroup = { id: "sole-target-group", chatApps: [soleTargetTab] };
  const soleRootState = stateModule.createAppState();
  soleRootState.groups = [soleSourceGroup, soleTargetGroup];
  soleRootState.activeTabs = {
    "sole-source": soleMoved.instanceId,
    "sole-target-group": soleTargetTab.instanceId
  };
  const soleWorkspace = workspaceModule.createWorkspaceStatePort(soleRootState);
  const soleOwners = workspaceOwnerModule.createWorkspaceOwnerStatePorts(soleWorkspace);
  const soleMove = workspaceModelModule.moveTabBetweenGroups(
    soleOwners.drag.groups,
    soleOwners.drag.activeTabs,
    soleOwners.render.groups[0].id,
    soleOwners.render.groups[1].id,
    soleOwners.render.groups[0].chatApps[0].instanceId,
    1
  );
  assert.equal(soleMove.changed, true);
  assert.equal(soleMove.moved, soleMoved);
  assert.equal(soleMove.sourceGroupRemoved, true);
  assert.deepEqual(soleRootState.groups, [soleTargetGroup]);
  assert.equal(soleRootState.groups[0], soleTargetGroup, "empty-source removal must retain the target group object");
  assert.deepEqual(soleTargetGroup.chatApps, [soleTargetTab, soleMoved]);
  assert.equal(Object.hasOwn(soleRootState.activeTabs, soleSourceGroup.id), false);
  assert.deepEqual(soleRootState.activeTabs, { "sole-target-group": soleMoved.instanceId });

  const invalidSourceTab = { appId: "duplicate", instanceId: "invalid-source-tab" };
  const invalidTargetTab = { appId: "duplicate", instanceId: "invalid-target-tab" };
  const invalidSourceGroup = { id: "invalid-source", chatApps: [invalidSourceTab] };
  const invalidTargetGroup = { id: "invalid-target", chatApps: [invalidTargetTab] };
  const invalidGroups = [invalidSourceGroup, invalidTargetGroup];
  const invalidActiveTabs = {
    "invalid-source": invalidSourceTab.instanceId,
    "invalid-target": invalidTargetTab.instanceId
  };
  const invalidSnapshot = JSON.stringify({ groups: invalidGroups, activeTabs: invalidActiveTabs });
  for (const [sourceGroupId, targetGroupId, instanceId] of [
    ["missing-source", invalidTargetGroup.id, invalidSourceTab.instanceId],
    [invalidSourceGroup.id, "missing-target", invalidSourceTab.instanceId],
    [invalidSourceGroup.id, invalidTargetGroup.id, "missing-tab"],
    [invalidSourceGroup.id, invalidSourceGroup.id, invalidSourceTab.instanceId]
  ]) {
    const invalidMove = workspaceModelModule.moveTabBetweenGroups(
      invalidGroups,
      invalidActiveTabs,
      sourceGroupId,
      targetGroupId,
      instanceId,
      0
    );
    assert.equal(invalidMove.changed, false);
    assert.equal(invalidMove.moved, null);
    assert.equal(JSON.stringify({ groups: invalidGroups, activeTabs: invalidActiveTabs }), invalidSnapshot);
    assert.equal(invalidGroups[0], invalidSourceGroup);
    assert.equal(invalidGroups[1], invalidTargetGroup);
    assert.equal(invalidSourceGroup.chatApps[0], invalidSourceTab);
    assert.equal(invalidTargetGroup.chatApps[0], invalidTargetTab);
  }

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
  assert.throws(() => settings.appearance.options.modelPreferenceFailurePolicy, /settings\.appearance cannot read/);
  assert.throws(() => {
    settings.appearance.options = { ...rootState.options, modelPreferences: { Gemini: "flash" } };
  }, /cannot mutate app state\.options\.modelPreferences/);
  assert.throws(() => settings.models.settingsAppearanceTab, /settings\.models cannot read/);

  console.log("state policy ownership and negative capabilities: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
