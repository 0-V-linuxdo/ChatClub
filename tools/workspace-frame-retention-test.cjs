#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const { functionSource } = require("./function-source.cjs");

(async () => {
  const {
    diffEffectiveCustomAppCatalog,
    importedWorkspaceLayoutNeedsHydration,
    reconcileWorkspaceAppCatalog
  } = await import("../app/workspace/model.js");
  const { normalizeCustomConfig } = await import("../shared/storage-schema.js");

  const chatA = { appId: "A", instanceId: "frame-a" };
  const chatB = { appId: "B", instanceId: "frame-b" };
  const chatC = { appId: "C", instanceId: "frame-c" };
  const groupOne = { id: "group-one", chatApps: [chatA, chatB] };
  const groupTwo = { id: "group-two", chatApps: [chatC] };
  const groups = [groupOne, groupTwo];
  const activeTabs = { "group-one": "frame-b", "group-two": "frame-c" };
  let createdGroups = 0;
  let createdFrames = 0;
  const factories = {
    createGroupId: () => `created-group-${++createdGroups}`,
    createFrameId: () => `created-frame-${++createdFrames}`
  };

  const unchanged = reconcileWorkspaceAppCatalog({
    groups,
    activeTabs,
    validAppIds: new Set(["A", "B", "C", "NEW"]),
    fallbackAppId: "A",
    ...factories
  });
  assert.equal(unchanged.changed, false, "adding or editing an app must not mutate workspace identity");
  assert.equal(unchanged.groups, groups);
  assert.equal(unchanged.activeTabs, activeTabs);
  assert.equal(createdGroups, 0);
  assert.equal(createdFrames, 0);

  const oneRemoved = reconcileWorkspaceAppCatalog({
    groups,
    activeTabs,
    validAppIds: new Set(["A", "C"]),
    fallbackAppId: "A",
    ...factories
  });
  assert.equal(oneRemoved.changed, true);
  assert.equal(oneRemoved.groups[0], groupOne, "surviving group objects must keep event-handler identity");
  assert.equal(oneRemoved.groups[0].id, groupOne.id);
  assert.equal(oneRemoved.groups[0].chatApps[0], chatA, "surviving tab records must keep identity");
  assert.equal(oneRemoved.groups[1], groupTwo, "unaffected groups must keep identity");
  assert.equal(oneRemoved.activeTabs["group-one"], "frame-a");
  assert.equal(oneRemoved.activeTabs["group-two"], "frame-c");
  assert.equal(createdGroups, 0);
  assert.equal(createdFrames, 0, "removing one used app must not regenerate surviving frames");

  const customLast = { appId: "CUSTOM", instanceId: "frame-custom" };
  const neighborResult = reconcileWorkspaceAppCatalog({
    groups: [{ id: "neighbor-group", chatApps: [chatA, chatB, customLast] }],
    activeTabs: { "neighbor-group": "frame-custom" },
    validAppIds: new Set(["A", "B"]),
    fallbackAppId: "A",
    ...factories
  });
  assert.equal(
    neighborResult.activeTabs["neighbor-group"],
    "frame-b",
    "removing the active app must select its nearest surviving neighbor"
  );

  const groupRemovalChatA = { appId: "A", instanceId: "frame-a" };
  const groupRemovalChatB = { appId: "B", instanceId: "frame-b" };
  const groupRemovalChatC = { appId: "C", instanceId: "frame-c" };
  const groupRemovalOne = { id: "group-one", chatApps: [groupRemovalChatA, groupRemovalChatB] };
  const groupRemovalTwo = { id: "group-two", chatApps: [groupRemovalChatC] };
  const groupRemoved = reconcileWorkspaceAppCatalog({
    groups: [groupRemovalOne, groupRemovalTwo],
    activeTabs: { "group-one": "frame-b", "group-two": "frame-c" },
    validAppIds: new Set(["C"]),
    fallbackAppId: "C",
    ...factories
  });
  assert.deepEqual(groupRemoved.groups, [groupRemovalTwo]);
  assert.equal(groupRemoved.groups[0], groupRemovalTwo);
  assert.deepEqual(groupRemoved.activeTabs, { "group-two": "frame-c" });
  assert.equal(createdFrames, 0, "removing another group must not recreate an unaffected frame");

  const onlyGroup = {
    id: "last-group",
    temporary: true,
    pocketBatchId: "batch-one",
    chatApps: [{ appId: "REMOVED", instanceId: "removed-frame" }]
  };
  const fallback = reconcileWorkspaceAppCatalog({
    groups: [onlyGroup],
    activeTabs: { "last-group": "removed-frame" },
    validAppIds: new Set(["A"]),
    fallbackAppId: "A",
    ...factories
  });
  assert.equal(fallback.groups[0], onlyGroup, "the fallback card must keep its group object identity");
  assert.equal(fallback.groups[0].id, "last-group", "the last usable card should be reused");
  assert.equal(fallback.groups[0].temporary, true);
  assert.equal(fallback.groups[0].pocketBatchId, "batch-one");
  assert.deepEqual(fallback.groups[0].chatApps, [{ appId: "A", instanceId: "created-frame-1" }]);
  assert.deepEqual(fallback.activeTabs, { "last-group": "created-frame-1" });
  assert.equal(createdGroups, 0);
  assert.equal(createdFrames, 1, "only the required fallback iframe may receive a new identity");

  const duplicateShadowOnlyChanged = diffEffectiveCustomAppCatalog(
    [
      { id: "duplicate", url: "https://effective.example/" },
      { id: "duplicate", url: "https://shadow-old.example/" }
    ],
    [
      { id: "duplicate", url: "https://effective.example/" },
      { id: "duplicate", url: "https://shadow-new.example/" }
    ]
  );
  assert.deepEqual([...duplicateShadowOnlyChanged.affectedAppIds], [], "ineffective duplicate records must be ignored");
  const duplicateEffectiveChanged = diffEffectiveCustomAppCatalog(
    [
      { id: "duplicate", url: "https://effective-old.example/" },
      { id: "duplicate", url: "https://shadow.example/" }
    ],
    [
      { id: "duplicate", url: "https://effective-new.example/" },
      { id: "duplicate", url: "https://effective-old.example/" }
    ]
  );
  assert.deepEqual([...duplicateEffectiveChanged.affectedAppIds], ["duplicate"]);
  assert.deepEqual([...duplicateEffectiveChanged.sourceChangedAppIds], ["duplicate"]);
  const metadataOnlyChanged = diffEffectiveCustomAppCatalog(
    [{ id: "custom", name: "Before", url: "https://custom.example/" }],
    [{ id: "custom", name: "After", url: "https://custom.example/" }]
  );
  assert.deepEqual([...metadataOnlyChanged.affectedAppIds], ["custom"]);
  assert.deepEqual([...metadataOnlyChanged.sourceChangedAppIds], [], "metadata edits must retain the current iframe document");
  const sandboxMetadataChanged = diffEffectiveCustomAppCatalog(
    [{ id: "custom", url: "https://custom.example/", hosts: [] }],
    [{ id: "custom", url: "https://custom.example/", hosts: ["grok.com"] }]
  );
  assert.deepEqual([...sandboxMetadataChanged.affectedAppIds], ["custom"]);
  assert.deepEqual(
    [...sandboxMetadataChanged.sourceChangedAppIds],
    [],
    "host metadata must defer replacement to the actual sandbox-contract comparison"
  );
  const iframeConfigChanged = diffEffectiveCustomAppCatalog(
    [{ id: "custom", url: "https://custom.example/" }],
    [{ id: "custom", url: "https://custom.example/", iframeConfig: { referrerPolicy: { mode: "omit" } } }]
  );
  assert.deepEqual([...iframeConfigChanged.affectedAppIds], ["custom"]);
  assert.deepEqual(
    [...iframeConfigChanged.sourceChangedAppIds],
    [],
    "an iframe attribute override changes the contract without changing app identity or source"
  );
  const builtInShadowRemoved = diffEffectiveCustomAppCatalog(
    [{ id: "Grok", url: "https://custom-grok.example/" }],
    []
  );
  assert.deepEqual([...builtInShadowRemoved.sourceChangedAppIds], ["Grok"]);
  assert.deepEqual(
    normalizeCustomConfig([
      { id: "duplicate", name: "Effective", url: "https://effective.example/" },
      { id: "duplicate", name: "Shadow", url: "https://shadow.example/" }
    ]).map(({ id, name, url }) => ({ id, name, url })),
    [{ id: "duplicate", name: "Effective", url: "https://effective.example/" }],
    "stored custom app IDs must be unique with the runtime's first-wins semantics"
  );

  assert.equal(importedWorkspaceLayoutNeedsHydration({
    temporary: true,
    previousTargetGroups: [["A"]],
    nextTargetGroups: [["B"]],
    currentGroups: [["A"]]
  }), false, "options import must not hydrate a temporary workspace");
  assert.equal(importedWorkspaceLayoutNeedsHydration({
    previousTargetGroups: [["A"]],
    nextTargetGroups: [["A"]],
    currentGroups: [["SESSION-ONLY"]]
  }), false, "non-layout options import must retain a divergent recovered workspace");
  assert.equal(importedWorkspaceLayoutNeedsHydration({
    previousTargetGroups: [["A"]],
    nextTargetGroups: [["B"]],
    currentGroups: [["B"]]
  }), false, "an already matching live workspace must not hydrate");
  assert.equal(importedWorkspaceLayoutNeedsHydration({
    previousTargetGroups: [["A"]],
    nextTargetGroups: [["B"]],
    currentGroups: [["A"]]
  }), true, "a real active-layout import must hydrate");
  assert.equal(importedWorkspaceLayoutNeedsHydration({
    previousTargetGroups: [],
    nextTargetGroups: [["NEW-CUSTOM"]],
    currentGroups: [["A"]]
  }), true, "an app made valid by the same import must hydrate into its preset");

  const settingsApps = fs.readFileSync(path.join(root, "app/settings/apps.js"), "utf8");
  const saveCustomConfigList = functionSource(settingsApps, "saveCustomList");
  assert.match(saveCustomConfigList, /await reconcileAppCatalog\(previousCustomConfig\)/);
  assert.ok(
    saveCustomConfigList.indexOf("await notifyConfigReload()") < saveCustomConfigList.indexOf("await reconcileAppCatalog(previousCustomConfig)"),
    "background registrations must settle before an affected frame can be rebuilt"
  );
  assert.doesNotMatch(saveCustomConfigList, /hydrateGroups\(/, "custom app saves must not hydrate every frame");
  assert.doesNotMatch(saveCustomConfigList, /\brender\(/, "custom app saves must not redraw the workspace root");

  const imports = fs.readFileSync(path.join(root, "app/settings/import-export.js"), "utf8");
  const applyImportedConfig = functionSource(imports, "applyImportedConfig");
  assert.match(applyImportedConfig, /hydrateImportedLayoutIfNeeded\(previousOptions, previousCustomConfig\)/);
  assert.match(applyImportedConfig, /\("customConfig" in saved \|\| "options" in saved\) && !layoutHydrated/);
  assert.match(applyImportedConfig, /reconcileAppCatalog\(previousCustomConfig, previousOptions\)/);
  assert.doesNotMatch(applyImportedConfig, /hydrateGroups\(/, "imports must delegate scoped layout hydration");

  const workspace = fs.readFileSync(path.join(root, "app/workspace/layout-controller.js"), "utf8");
  const diffEffectiveIframeConfigs = functionSource(workspace, "diffEffectiveIframeConfigs");
  assert.match(diffEffectiveIframeConfigs, /resolveChatFrameAttributeContract\(/);
  assert.match(diffEffectiveIframeConfigs, /beforeContract\?\.signature/);
  assert.match(diffEffectiveIframeConfigs, /afterContract\?\.signature/);
  assert.match(diffEffectiveIframeConfigs, /chatAppSource \|\| before\?\.source/);
  const reconcileAppCatalog = functionSource(workspace, "reconcileAppCatalog");
  assert.doesNotMatch(reconcileAppCatalog, /hydrateGroups\(/);
  assert.doesNotMatch(reconcileAppCatalog, /\brender\(/);
  assert.match(reconcileAppCatalog, /previousOptions = state\.options/);
  assert.match(reconcileAppCatalog, /await persistLayout\(\)/, "removing a used custom app must persist the narrowed layout");
  assert.match(reconcileAppCatalog, /diffEffectiveCustomAppCatalog\(previousCustomConfig, state\.customConfig\)/);
  assert.match(reconcileAppCatalog, /diffEffectiveIframeConfigs\([\s\S]*previousOptions,[\s\S]*state\.options/);
  assert.match(reconcileAppCatalog, /rememberWorkspaceSession\(\)/, "targeted frame replacement must refresh the session snapshot");
  const hydrateImportedLayoutIfNeeded = functionSource(workspace, "hydrateImportedLayoutIfNeeded");
  assert.match(hydrateImportedLayoutIfNeeded, /temporary: temporaryLayoutIsActive\(\)/);
  assert.match(hydrateImportedLayoutIfNeeded, /previousTargetGroups: activeLayoutGroupsForOptions\(previousOptions, previousCustomConfig\)/);

  const view = fs.readFileSync(path.join(root, "app/workspace/view-controller.js"), "utf8");
  const frameAttributeContractMatches = functionSource(view, "frameAttributeContractMatches");
  assert.match(frameAttributeContractMatches, /dataset\?\.iframeAttributeContract/);
  assert.match(frameAttributeContractMatches, /contract\.signature/);
  const replaceChatFrame = functionSource(view, "replaceChatFrame");
  assert.match(replaceChatFrame, /if \(targetHref\) stageFrameInitialHref\(chat\.instanceId, targetHref\)/);
  assert.match(replaceChatFrame, /iframe\.replaceWith\(replacement\)/);
  const ensureFrameAttributeContract = functionSource(view, "ensureFrameAttributeContract");
  assert.match(ensureFrameAttributeContract, /frameAttributeContractMatches\(iframe, app, targetHref\)/);
  assert.match(ensureFrameAttributeContract, /replaceChatFrame\(group, chat, iframe, \{ preserveHref: true, href: targetHref \}\)/);
  const refreshChatTabPresentations = functionSource(view, "refreshChatTabPresentations");
  assert.match(refreshChatTabPresentations, /frameAttributeContractMatches\(iframe, appById\(chat\.appId\)\)/);
  assert.match(refreshChatTabPresentations, /replaceChatFrame\(group, chat, iframe, \{ preserveHref: true \}\)/);
  const renderChatFrame = functionSource(view, "renderChatFrame");
  assert.match(renderChatFrame, /iframeAttributeContract: String\(contract\.signature \|\| ""\)/);
  assert.match(renderChatFrame, /\.\.\.Object\.fromEntries\(\(contract\.entries \|\| \[\]\)/);
  assert.ok(
    renderChatFrame.indexOf("...Object.fromEntries") < renderChatFrame.indexOf("class:"),
    "ChatClub-owned class, dataset, binding name, and load handler must override advanced attributes"
  );

  const frameController = fs.readFileSync(path.join(root, "app/workspace/frame-controller.js"), "utf8");
  const chatFrameAttributes = functionSource(frameController, "chatFrameAttributes");
  assert.match(chatFrameAttributes, /resolveChatFrameAttributeContract\(/);
  assert.match(chatFrameAttributes, /source: app\?\.chatAppSource \|\| app\?\.source/);
  assert.match(chatFrameAttributes, /options: state\.options/);
  const rememberFrameLocation = functionSource(frameController, "rememberFrameLocation");
  assert.match(rememberFrameLocation, /ensureFrameAttributeContract\(iframe, href/);
  assert.ok(
    rememberFrameLocation.indexOf("iframe.dataset.currentHref = href") < rememberFrameLocation.indexOf("ensureFrameAttributeContract"),
    "site-driven navigation must remember the committed URL before re-evaluating its iframe contract"
  );
  const assignFrameSrc = functionSource(frameController, "assignFrameSrc");
  assert.ok(
    assignFrameSrc.indexOf("ensureFrameAttributeContract") < assignFrameSrc.indexOf("iframe.src = url"),
    "active navigation must apply the target URL contract before assigning src"
  );

  console.log("workspace custom-app iframe retention: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
