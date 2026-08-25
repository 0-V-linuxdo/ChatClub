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
const { functionSource } = require("./function-source.cjs");
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
  const functionalAnomaliesSource = read("app/settings/functional-anomalies.js");
  const stylesSource = read("styles/chatclub.css");
  const officialRulesPaneSource = functionSource(controllerSource, "officialRulesPane");

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
    ["createPromptHistorySettingsSection", "history"],
    ["createFunctionalAnomaliesSettingsSection", "functionalAnomalies"]
  ]) {
    assert.match(controllerSource, new RegExp(factory));
    assert.match(controllerSource, new RegExp(`state:\\s*settingsSections\\.${port}`));
  }
  assert.match(controllerSource, /const settingsSectionPanes = Object\.freeze\(\{/);
  assert.match(controllerSource, /rules:\s*\(redraw\)\s*=>\s*officialRulesPane\(redraw\)/);
  assert.match(controllerSource, /about:\s*\(\)\s*=>\s*aboutPane\(\)/);
  assert.doesNotMatch(controllerSource, /aboutPaneWithOfficialRules|pane\.prepend\(officialRulesSettings\.card\)/);
  assert.match(
    officialRulesPaneSource,
    /officialRulesSettings\.syncLanguage\(\)[\s\S]*pane\.append\(officialRulesSettings\.card\)/,
    "reattaching the cached rules card must synchronize language without recreating it"
  );
  assert.doesNotMatch(
    officialRulesPaneSource,
    /officialRulesSettings\.refresh\(/,
    "language synchronization must not reread the official-rules snapshot"
  );
  assert.doesNotMatch(controllerSource, /\bstate\./);
  assert.doesNotMatch(controllerSource, /function (?:appearancePane|summarySettingsPane|optimizeSettingsPane|openPromptTemplateEditor|openSummaryCollectorEditor|topbarPromptPlaceholderBlock)\b/);
  assert.match(runtimeSource, /const featureState = createFeatureStatePorts\(state\)/);
  assert.match(runtimeSource, /settingsSections:\s*featureState\.settingsSections/);
  assert.match(runtimeSource, /saveOptionsPatch/);
  assert.doesNotMatch(runtimeSource, /state:\s*featureState\.settings/);
  assert.doesNotMatch(`${runtimeSource}\n${stateSource}`, /createSettingsControllerStatePort|combinedSettingsAccess/);
  assert.match(controllerSource, /Object\.entries\(SETTINGS_OPTION_CAPABILITIES\)/);
  assert.doesNotMatch(controllerSource, /apps:\s*new Set\(/);
  assert.doesNotMatch(controllerSource, /builtinChatAppOrder/);
  assert.match(controllerSource, /dataset:\s*\{\s*settingsSectionId:\s*id\s*\}/, "Settings tabs need stable section selectors");

  assert.deepEqual(stateKeys(appearanceSource), [
    "options",
    "settingsAppearancePrimaryColorDraft",
    "settingsAppearanceTab",
    "settingsAppearanceTopbarTab",
    "settingsAppearanceWorkspaceTab",
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
  assert.match(summarySource, /function recordFullTextBlock\(/);
  assert.match(summarySource, /t\("summary\.recordFullText"\)/);
  assert.doesNotMatch(appearanceSource, /recordFullText/);
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
  assert.deepEqual(
    [...appsSource.matchAll(/\["(platforms|iframe)",\s*t\("apps\.tab/g)].map((match) => match[1]).slice(0, 2),
    ["platforms", "iframe"],
    "platform management and iframe permissions must be the two Apps tabs"
  );
  assert.match(appsSource, /dataset\.appsTabId\s*=\s*tabs\[index\]/);
  assert.match(appsSource, /apps-settings-tab-bar-row/);
  assert.match(stylesSource, /\.apps-settings-tab-bar-row\s*\{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap[\s\S]*gap:\s*28px/);
  assert.match(stylesSource, /\.apps-settings-tab-bar-row > \.settings-inner-tabs\s*\{[\s\S]*flex:\s*0 0 auto[\s\S]*width:\s*fit-content[\s\S]*grid-auto-columns:\s*minmax\(132px, auto\)/);
  assert.match(appsSource, /function iframePermissionsTabBar\(/);
  assert.match(appsSource, /function platformsPane\(/);
  assert.match(appsSource, /function iframePermissionsPane\(/);
  assert.match(appsSource, /iframe-permission-row/);
  assert.match(appsSource, /dataset\.iframeAction/);
  const platformsPane = functionSource(appsSource, "platformsPane");
  assert.match(platformsPane, /activeSource === "custom" \? customPane\(redraw\) : builtInPane\(redraw\)/);
  const iframePermissionsTabBar = functionSource(appsSource, "iframePermissionsTabBar");
  assert.match(iframePermissionsTabBar, /state\.options\?\.iframePermissionsSource === "custom"/);
  assert.match(iframePermissionsTabBar, /t\("apps\.tabBuiltIn"\), t\("apps\.tabBuiltInDesc"\)/);
  assert.match(iframePermissionsTabBar, /t\("apps\.tabCustom"\), t\("apps\.tabCustomDesc"\)/);
  assert.match(iframePermissionsTabBar, /dataset\.iframePermissionsTabId/);
  assert.match(iframePermissionsTabBar, /dataset\.platformSourceTabId/);
  const iframePermissionsPane = functionSource(appsSource, "iframePermissionsPane");
  assert.doesNotMatch(iframePermissionsPane, /iframe-permission-scope-callout|settings-info-callout/);
  assert.doesNotMatch(iframePermissionsPane, /settingsPaneToolbar/);
  assert.match(
    iframePermissionsPane,
    /activeSource === "custom"\s*\? iframePermissionGroup\("custom", state\.customConfig, redraw\)\s*: iframePermissionGroup\("builtIn", orderedBuiltInApps\(\), redraw\)/,
    "iframe permissions must render only the selected source"
  );
  const iframePermissionHelpTrigger = functionSource(appsSource, "iframePermissionHelpTrigger");
  assert.match(iframePermissionHelpTrigger, /tooltip-trigger/);
  assert.match(iframePermissionHelpTrigger, /data-tooltip-wrap": "true"/);
  assert.match(iframePermissionHelpTrigger, /t\("apps\.iframe\.scopeHelp"\)/);
  const iframePermissionRow = functionSource(appsSource, "iframePermissionRow");
  assert.match(iframePermissionRow, /draggable:\s*"true"/);
  assert.match(iframePermissionRow, /settingsDragHandle\(t\("apps\.platformName"\)\)/);
  assert.match(iframePermissionRow, /startBuiltInDrag\(event, app\)[\s\S]*startCustomDrag\(event, app\)/);
  assert.doesNotMatch(iframePermissionRow, /iframe-permission-source/);
  const iframePermissionGroup = functionSource(appsSource, "iframePermissionGroup");
  assert.match(iframePermissionGroup, /settingsList\(\[\s*"",\s*t\("apps\.platformName"\)/);
  assert.doesNotMatch(iframePermissionGroup, /t\("apps\.iframe\.source"\)/);
  const persistIframeConfig = functionSource(appsSource, "persistIframeConfig");
  assert.match(persistIframeConfig, /const previousOptions = state\.options/);
  assert.match(persistIframeConfig, /saveOptionsPatch\(\{ builtinChatAppIframeConfigs \}\)/);
  assert.match(persistIframeConfig, /reconcileAppCatalog\(state\.customConfig, previousOptions\)/);
  assert.match(persistIframeConfig, /saveCustomList\(customConfig, redraw, message\)/);
  const resetIframeConfig = functionSource(appsSource, "resetIframeConfig");
  assert.match(resetIframeConfig, /persistIframeConfig\(app, source, undefined/);
  const customEditor = functionSource(appsSource, "openCustomEditor");
  assert.match(customEditor, /suggestCustomAppDraft\(/);
  assert.match(customEditor, /normalizeHttpUrl\(rawUrl\)/);
  assert.match(customEditor, /applyUrlAutofill\(\{ rewriteUrl: true \}\)/);
  assert.match(customEditor, /dataset\.customAppField = "url"/);
  assert.match(customEditor, /t\("apps\.urlAutofillMatch"/);
  assert.doesNotMatch(customEditor, /https:\/\/www\.example\.com\//);
  const iframeEditor = functionSource(appsSource, "openIframePermissionEditor");
  assert.match(iframeEditor, /button\(t\("common\.cancel"\), \(\) => close\(\)\)/);
  assert.match(iframeEditor, /filter\(\(risk\) => !previousRisks\.has\(risk\)\)/);
  assert.match(iframeEditor, /openIframeRiskConfirmation\(addedRisks/);
  assert.match(iframeEditor, /iframe-permission-editor-modal/);
  assert.deepEqual(stateKeys(modelsSource), ["modelPreferenceDraft", "modelPreferenceSettingsTab", "options"]);
  const failurePolicySelect = functionSource(modelsSource, "failurePolicySelect");
  const failureOverrideSelect = functionSource(modelsSource, "failureOverrideSelect");
  const modelAutosave = functionSource(modelsSource, "flushAutosave", true);
  assert.match(failurePolicySelect, /queueOptionsAutoSave\(\{ modelPreferenceFailurePolicy:/);
  assert.match(failureOverrideSelect, /queueOptionsAutoSave\(\{ modelPreferenceFailureOverrides:/);
  assert.ok(
    failurePolicySelect.indexOf("state.options.modelPreferenceFailurePolicy = failurePolicyDraft")
      < failurePolicySelect.indexOf("queueOptionsAutoSave"),
    "a changed global failure policy must become visible to Composer before asynchronous persistence"
  );
  assert.ok(
    failureOverrideSelect.indexOf("state.options.modelPreferenceFailureOverrides = failureOverridesDraft")
      < failureOverrideSelect.indexOf("queueOptionsAutoSave"),
    "a changed per-site failure override must become visible to Composer before asynchronous persistence"
  );
  assert.doesNotMatch(failurePolicySelect, /applyPreferredModels/);
  assert.doesNotMatch(failureOverrideSelect, /applyPreferredModels/);
  assert.match(modelAutosave, /if \(applyModels\) await Promise\.resolve\(applyPreferredModels/);
  assert.match(
    modelAutosave,
    /const savedOptions = await saveOptionsPatch\(patch\)[\s\S]*modelPreferenceFailurePolicy: failurePolicyDraft[\s\S]*modelPreferenceFailureOverrides: failureOverridesDraft/,
    "an older in-flight save must not temporarily overwrite newer visible failure-policy drafts"
  );
  const modelPreferenceRow = functionSource(modelsSource, "row");
  const modelPreferencePane = functionSource(modelsSource, "pane");
  const modelFailurePolicyBlock = functionSource(modelsSource, "failurePolicyBlock");
  const modelPreferenceDrop = functionSource(modelsSource, "drop");
  const modelAdditionalPreferenceField = functionSource(modelsSource, "additionalPreferenceField");
  const modelPreferenceSegmentedControl = functionSource(modelsSource, "modelPreferenceSegmentedControl");
  const thinkingLevelSegmentedControl = functionSource(modelsSource, "thinkingLevelSegmentedControl");
  const notionAllSourcesSegmentedControl = functionSource(modelsSource, "notionAllSourcesSegmentedControl");
  assert.doesNotMatch(
    modelPreferenceRow,
    /failureOverrideSelect/,
    "failure overrides must not consume a fifth draggable model-list column"
  );
  assert.match(modelFailurePolicyBlock, /preferenceOrder\(\)\.map\(\(appId\) => failureOverrideField\(appId\)\)/);
  assert.match(modelPreferencePane, /settingsInnerTabs\(tabs, activeTab/);
  assert.match(modelPreferencePane, /\["preferred", t\("modelPreferences\.preferredTab"\)/);
  assert.match(modelPreferencePane, /\["failure", t\("modelPreferences\.failureTab"\)/);
  assert.match(modelPreferencePane, /state\.modelPreferenceSettingsTab = id[\s\S]*redraw\(\)/);
  assert.doesNotMatch(
    modelPreferencePane,
    /saveOptionsPatch|queueOptionsAutoSave|queueAutoSave|applyPreferredModels/,
    "switching model-preference tabs must remain UI-only"
  );
  assert.match(modelsSource, /t\("modelPreferences\.failureOverrides"\)/);
  assert.match(modelsSource, /t\("modelPreferences\.failureOverrideFor"/);
  assert.match(modelPreferenceDrop, /state\.options\.modelPreferenceOrder = modelPreferenceOrder/);
  assert.match(modelPreferenceDrop, /queueOptionsAutoSave\(\{ modelPreferenceOrder \}\)/);
  assert.doesNotMatch(modelPreferenceDrop, /await saveOptionsPatch/, "model-order saves must participate in the autosave drain");
  assert.match(
    modelAdditionalPreferenceField,
    /model-preference-thinking-placeholder-field[\s\S]*"aria-hidden": "true"/,
    "platforms without an additional preference must not expose a label without a control"
  );
  assert.match(modelPreferenceRow, /additionalPreferenceField\(appId\)/);
  assert.match(modelPreferenceSegmentedControl, /type: "radio"/);
  assert.match(modelPreferenceSegmentedControl, /role: "radiogroup"/);
  assert.match(modelPreferenceSegmentedControl, /class: "model-preference-segmented-info tooltip-trigger"/);
  assert.match(modelPreferenceSegmentedControl, /svgIcon\("info"\)/);
  assert.doesNotMatch(modelPreferenceSegmentedControl, /svgIcon\("library"\)|rotate\(-45deg\)/);
  assert.match(thinkingLevelSegmentedControl, /GEMINI_THINKING_LEVEL_PREFERENCE_KEY/);
  assert.match(thinkingLevelSegmentedControl, /queueAutoSave/);
  assert.match(thinkingLevelSegmentedControl, /modelPreferenceThinkingLevelAppId: "Gemini"/);
  assert.match(notionAllSourcesSegmentedControl, /NOTION_ALL_SOURCES_PREFERENCE_KEY/);
  assert.match(notionAllSourcesSegmentedControl, /queueAutoSave/);
  assert.match(notionAllSourcesSegmentedControl, /modelPreferenceAllSourcesAppId: "NotionAI"/);
  assert.match(notionAllSourcesSegmentedControl, /t\("modelPreferences\.allSourcesDesc"\)/);
  assert.deepEqual(stateKeys(historySource), [
    "promptHistoryCursor",
    "promptHistoryDraft",
    "promptSelection",
    "promptSendHistory",
    "promptText"
  ]);
  assert.deepEqual(stateKeys(functionalAnomaliesSource), ["functionalAnomalyRecords"]);
  assert.match(functionalAnomaliesSource, /sort\(\(left, right\) => timestamp\(right\) - timestamp\(left\)\)/);
  assert.match(functionalAnomaliesSource, /functionalAnomalyLog\.subscribe\(\(\) => renderLivePane\?\.\(\)\)/);
  assert.match(functionalAnomaliesSource, /functionalAnomalyLog\.exportText\(recordsToCopy\)/);
  assert.match(functionalAnomaliesSource, /functionalAnomalyLog\.exportText\(\[record\]\)/);
  assert.doesNotMatch(functionalAnomaliesSource, /JSON\.stringify\(record/);

  const stateModule = await import(moduleUrl("app/state.js"));
  const settingsStateModule = await import(moduleUrl("app/settings/state-ports.js"));
  const settingsSectionsModule = await import(moduleUrl("app/settings/sections.js"));
  const constantsModule = await import(moduleUrl("shared/constants.js"));
  const storageSchemaModule = await import(moduleUrl("shared/storage-schema.js"));
  const topbarModule = await import(moduleUrl("shared/topbar.js"));
  const appearanceModule = await import(moduleUrl("app/settings/appearance.js"));
  const summaryModule = await import(moduleUrl("app/settings/summary.js"));
  const optimizeModule = await import(moduleUrl("app/settings/optimize.js"));
  const messageModule = await import(moduleUrl("app/settings/message-navigation.js"));
  const topicModule = await import(moduleUrl("app/settings/topic-deletion.js"));
  const profilesModule = await import(moduleUrl("app/settings/profiles.js"));
  const appsModule = await import(moduleUrl("app/settings/apps.js"));
  const modelsModule = await import(moduleUrl("app/settings/models.js"));
  const historyModule = await import(moduleUrl("app/settings/history.js"));
  const functionalAnomaliesModule = await import(moduleUrl("app/settings/functional-anomalies.js"));
  const rootState = stateModule.createAppState();
  assert.equal(rootState.modelPreferenceSettingsTab, "preferred", "preferred models must be the default settings tab");
  rootState.options = {
    apiProfiles: [{ id: "api-1", name: "API", endpoint: "https://example.test", model: "model" }],
    builtinChatAppOrder: [],
    builtinChatAppIframeConfigs: {},
    colMaxCount: 4,
    frameLoadingOverlayOpacity: 0.5,
    frameToastPosition: { x: 50, y: 50 },
    iframePermissionsSource: "builtIn",
    language: "system",
    messageNavigatorEffectMode: "border",
    messageNavigatorSiteConfigs: [],
    modelPreferenceFailureOverrides: {},
    modelPreferenceFailurePolicy: "send-current",
    modelPreferenceOrder: [],
    modelPreferences: {},
    modelPreferenceSelectionOverlayEnabled: true,
    modelPreferenceSelectionOverlayOpacity: 70,
    optimizeApiProfileId: "api-1",
    optimizePromptTemplateId: "optimize-default",
    optimizePromptTemplates: [],
    primaryColor: "#6750a4",
    primaryColorCustom: false,
    recordFullText: false,
    summaryApiProfileId: "api-1",
    topicTitleApiProfileId: "api-1",
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
  rootState.functionalAnomalyRecords = [];
  rootState.messageNavigatorSettingsTab = "sites";
  rootState.messageNavigatorSiteExpandedId = "site-1";
  const ports = settingsStateModule.createSettingsSectionStatePorts(rootState);
  assert.deepEqual(
    settingsSectionsModule.SETTINGS_SECTIONS.slice(-3).map(([id]) => id),
    ["io", "functionalAnomalies", "about"],
    "Functional anomalies must appear between Import / Export and About"
  );
  assert.deepEqual(
    settingsSectionsModule.SETTINGS_SECTIONS.slice(6, 9).map(([id]) => id),
    ["topicDeletion", "rules", "optimize"],
    "Rules must appear directly after the three site-rule features"
  );
  const settingsSectionIds = settingsSectionsModule.SETTINGS_SECTIONS.map(([id]) => id);
  const settingsTopbarItemIds = settingsSectionIds.map((id) => topbarModule.topbarSettingsItemForSection(id));
  assert.equal(
    settingsTopbarItemIds.every(Boolean),
    true,
    "Every Settings section must have a topbar Settings-menu item"
  );
  assert.equal(
    new Set(settingsTopbarItemIds).size,
    settingsSectionIds.length,
    "Settings-menu item ids must be unique"
  );
  assert.equal(
    new Set(topbarModule.TOPBAR_BUILTIN_ITEMS).size,
    topbarModule.TOPBAR_BUILTIN_ITEMS.length,
    "Topbar built-in item ids must remain globally unique"
  );
  for (let index = 0; index < settingsSectionsModule.SETTINGS_SECTIONS.length; index += 1) {
    const [sectionId, labelKey, , icon] = settingsSectionsModule.SETTINGS_SECTIONS[index];
    const itemId = settingsTopbarItemIds[index];
    assert.equal(topbarModule.topbarSettingsSectionForItem(itemId), sectionId, `${sectionId} must round-trip through its topbar item`);
    assert.equal(topbarModule.TOPBAR_BUILTIN_ITEMS.includes(itemId), true, `${itemId} must be a recognized built-in item`);
    assert.equal(topbarModule.topbarItemLabelKey({ type: "item", id: itemId }), labelKey, `${itemId} must share the Settings label`);
    assert.equal(topbarModule.topbarItemIcon({ type: "item", id: itemId }), icon, `${itemId} must share the Settings icon`);
    assert.equal(
      constantsModule.TOOLTIP_TARGET_IDS.includes(`topbar.settings.${sectionId}`),
      true,
      `${sectionId} must remain configurable in tooltip settings`
    );
    assert.equal(
      topbarModule.DEFAULT_TOPBAR_LAYOUT.filter((entry) => entry.type === "item" && entry.id === itemId).length,
      1,
      `${itemId} must appear exactly once in the default layout`
    );
  }
  assert.deepEqual(
    topbarModule.DEFAULT_TOPBAR_LAYOUT
      .map((entry) => topbarModule.topbarSettingsSectionForItem(entry.id))
      .filter(Boolean),
    settingsSectionIds,
    "A new profile must show every Settings section in canonical order"
  );
  const newlyRegisteredItemIds = [
    "settingsMessageNavigation",
    "settingsRules",
    "settingsFunctionalAnomalies"
  ];
  const historicalLayout = topbarModule.DEFAULT_TOPBAR_LAYOUT
    .filter((entry) => !newlyRegisteredItemIds.includes(entry.id));
  const migratedLayout = topbarModule.normalizeTopbarLayout(historicalLayout);
  assert.deepEqual(
    migratedLayout.slice(0, historicalLayout.length),
    historicalLayout,
    "Normalizing an existing topbar must preserve every saved item position"
  );
  assert.deepEqual(
    migratedLayout.slice(historicalLayout.length).map((entry) => entry.id),
    newlyRegisteredItemIds,
    "New built-in Settings items must be appended after the saved user order"
  );
  assert.deepEqual(
    topbarModule.normalizeTopbarLayout(JSON.parse(JSON.stringify(migratedLayout))),
    migratedLayout,
    "The appended Settings-menu order must remain idempotent after JSON serialization"
  );
  const historicalMenuIndex = historicalLayout.findIndex((entry) => entry.id === "settingsJumpMenu");
  const shuffledHistoricalLayout = [
    ...historicalLayout.slice(0, historicalMenuIndex + 1).filter((entry) => entry.id !== "summary"),
    ...[...historicalLayout.slice(historicalMenuIndex + 1)].reverse(),
    { type: "item", id: "summary" }
  ];
  const normalizedShuffledLayout = topbarModule.normalizeTopbarLayout(shuffledHistoricalLayout);
  assert.deepEqual(
    normalizedShuffledLayout.slice(0, shuffledHistoricalLayout.length),
    shuffledHistoricalLayout,
    "A shuffled user menu, including a folded non-Settings item, must retain its exact saved order"
  );
  assert.deepEqual(
    normalizedShuffledLayout.slice(shuffledHistoricalLayout.length).map((entry) => entry.id),
    newlyRegisteredItemIds,
    "New Settings items must follow the complete shuffled user menu"
  );
  const storedOptions = storageSchemaModule.dehydrateOptions(
    storageSchemaModule.normalizeOptions({ topbarLayout: shuffledHistoricalLayout })
  );
  assert.deepEqual(
    storageSchemaModule.normalizeOptions(storedOptions).topbarLayout,
    normalizedShuffledLayout,
    "The shuffled and appended Settings-menu order must survive schema dehydration and rehydration"
  );
  const defaultItemIds = topbarModule.DEFAULT_TOPBAR_LAYOUT
    .filter((entry) => entry.type === "item")
    .map((entry) => entry.id);
  assert.equal(
    defaultItemIds[defaultItemIds.indexOf("composer") - 1],
    "search",
    "Search must sit immediately left of the prompt input in a new topbar"
  );
  assert.equal(topbarModule.TOPBAR_BUILTIN_ITEMS.includes("search"), true, "Search must be a recognized built-in item");
  assert.equal(topbarModule.topbarItemIcon({ type: "item", id: "search" }), "search");
  const historicalWithoutSearch = topbarModule.DEFAULT_TOPBAR_LAYOUT.filter((entry) => entry.id !== "search");
  const migratedSearchLayout = storageSchemaModule.normalizeOptions({
    topbarLayout: historicalWithoutSearch,
    topbarDeleteThreadMigrated: true
  }).topbarLayout;
  const migratedSearchIds = migratedSearchLayout
    .filter((entry) => entry.type === "item")
    .map((entry) => entry.id);
  assert.equal(
    migratedSearchIds[migratedSearchIds.indexOf("composer") - 1],
    "search",
    "existing topbars missing Search must receive it immediately left of the prompt input"
  );
  const hiddenSearchLayout = storageSchemaModule.normalizeOptions({
    topbarLayout: historicalWithoutSearch,
    topbarDeleteThreadMigrated: true,
    topbarSearchMigrated: true
  }).topbarLayout;
  assert.equal(
    hiddenSearchLayout.some((entry) => entry.id === "search"),
    false,
    "a user who hid Search must not get it reinserted"
  );
  assert.equal(topbarModule.TOPBAR_BUILTIN_ITEMS.includes("share"), true, "Share must be a recognized built-in item");
  assert.equal(topbarModule.topbarItemIcon({ type: "item", id: "share" }), "share");
  const defaultShareIds = topbarModule.DEFAULT_TOPBAR_LAYOUT
    .filter((entry) => entry.type === "item")
    .map((entry) => entry.id);
  assert.equal(
    defaultShareIds[defaultShareIds.indexOf("summary") + 1],
    "share",
    "Share must sit immediately after Summary in a new topbar"
  );
  const historicalWithoutShare = topbarModule.DEFAULT_TOPBAR_LAYOUT.filter((entry) => entry.id !== "share");
  const migratedShareLayout = storageSchemaModule.normalizeOptions({
    topbarLayout: historicalWithoutShare,
    topbarDeleteThreadMigrated: true,
    topbarSearchMigrated: true
  }).topbarLayout;
  const migratedShareIds = migratedShareLayout
    .filter((entry) => entry.type === "item")
    .map((entry) => entry.id);
  assert.equal(
    migratedShareIds[migratedShareIds.indexOf("summary") + 1],
    "share",
    "existing topbars missing Share must receive it immediately after Summary"
  );
  const hiddenShareLayout = storageSchemaModule.normalizeOptions({
    topbarLayout: historicalWithoutShare,
    topbarDeleteThreadMigrated: true,
    topbarSearchMigrated: true,
    topbarShareMigrated: true
  }).topbarLayout;
  assert.equal(
    hiddenShareLayout.some((entry) => entry.id === "share"),
    false,
    "a user who hid Share must not get it reinserted"
  );
  assert.deepEqual(
    settingsStateModule.SETTINGS_OPTION_CAPABILITIES.summary.write,
    ["recordFullText", "summaryApiProfileId", "summaryPromptTemplateId", "summaryPromptTemplates", "summarySiteConfigs"],
    "Summary settings must own full-text recording and collector/prompt config"
  );
  assert.deepEqual(
    settingsStateModule.SETTINGS_OPTION_CAPABILITIES.apps.write,
    ["builtinChatAppOrder", "builtinChatAppIframeConfigs", "iframePermissionsSource"],
    "Apps state and persistence enforcement must share one option capability"
  );
  assert.deepEqual(
    settingsStateModule.SETTINGS_OPTION_CAPABILITIES.models.write,
    ["modelPreferenceFailureOverrides", "modelPreferenceFailurePolicy", "modelPreferenceOrder", "modelPreferences"],
    "Model settings must own preferred-model selection and failure handling"
  );

  assert.equal(ports.messageNavigation.options.messageNavigatorEffectMode, "border");
  ports.models.modelPreferenceSettingsTab = "failure";
  assert.equal(rootState.modelPreferenceSettingsTab, "failure");
  assert.equal(ports.topicDeletion.options.topicDeleteSiteConfigs.length, 0);
  assert.deepEqual(ports.apps.options.builtinChatAppIframeConfigs, {});
  ports.apps.options.iframePermissionsSource = "custom";
  assert.equal(rootState.options.iframePermissionsSource, "custom");
  assert.throws(() => { ports.messageNavigation.options.themeMode; }, /settings\.messageNavigation cannot read/);
  assert.throws(() => { ports.topicDeletion.messageNavigatorSettingsTab; }, /settings\.topicDeletion cannot read/);
  assert.throws(() => { ports.models.options.builtinChatAppIframeConfigs; }, /settings\.models cannot read/);

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
      syncPreferredModelSelectionOverlays() {},
      enterTopbarEditMode() {},
      closeSettingsDialog() {}
    }],
    [profilesModule.createProfilesSettingsSection, ports.profiles, {
      ...sharedDependencies,
      openTabUrl() {}
    }],
    [appsModule.createAppsSettingsSection, ports.apps, {
      ...sharedDependencies,
      saveCustomConfig: async (customConfig) => {
        rootState.customConfig = structuredClone(customConfig);
        return rootState.customConfig;
      },
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
      syncPromptInputNode: () => null
    }],
    [functionalAnomaliesModule.createFunctionalAnomaliesSettingsSection, ports.functionalAnomalies, {
      svgIcon: sharedDependencies.svgIcon,
      functionalAnomalyLog: {
        refresh: async () => [],
        remove: async () => [],
        clear: async () => [],
        snapshot: () => [],
        subscribe: () => () => {},
        exportText: () => ""
      }
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
