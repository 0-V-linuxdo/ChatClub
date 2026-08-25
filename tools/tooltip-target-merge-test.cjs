#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const {
    TOOLTIP_TARGET_IDS
  } = await import(moduleUrl("shared/constants.js"));
  const {
    dehydrateOptions,
    normalizeOptions,
    TOOLTIP_DISABLED_ID_ALIASES
  } = await import(moduleUrl("shared/storage-schema.js"));

  const retiredIds = [
    "pocket.collapseSidebar",
    "pocket.expandSidebar",
    "pocket.exitFocusMode",
    "workspace.tabs.unpin"
  ];
  const mergedIds = ["pocket.sidebar", "pocket.focusMode", "workspace.tabs.pin"];
  for (const id of retiredIds) {
    assert.equal(TOOLTIP_TARGET_IDS.includes(id), false, `${id} must not remain a settings tooltip target`);
  }
  for (const id of mergedIds) {
    assert.equal(TOOLTIP_TARGET_IDS.includes(id), true, `${id} must remain a settings tooltip target`);
  }

  assert.deepEqual(TOOLTIP_DISABLED_ID_ALIASES, {
    "pocket.collapseSidebar": "pocket.sidebar",
    "pocket.expandSidebar": "pocket.sidebar",
    "pocket.exitFocusMode": "pocket.focusMode",
    "workspace.tabs.unpin": "workspace.tabs.pin"
  });

  assert.deepEqual(
    normalizeOptions({
      tooltipDisabledIds: [
        "pocket.collapseSidebar",
        "pocket.expandSidebar",
        "pocket.exitFocusMode",
        "workspace.tabs.unpin",
        "pocket.actions"
      ]
    }).tooltipDisabledIds,
    ["pocket.sidebar", "pocket.focusMode", "workspace.tabs.pin", "pocket.actions"],
    "retired two-state tooltip ids must collapse onto the surviving control ids"
  );
  assert.deepEqual(
    normalizeOptions({
      tooltipDisabledIds: ["pocket.expandSidebar", "pocket.expandSidebar", "unknown.tooltip"]
    }).tooltipDisabledIds,
    ["pocket.sidebar"],
    "duplicate aliases and unknown ids must not reappear after merge"
  );

  const persisted = dehydrateOptions(normalizeOptions({
    tooltipDisabledIds: ["pocket.collapseSidebar", "pocket.exitFocusMode"]
  }));
  assert.deepEqual(persisted.tooltipDisabledIds, ["pocket.sidebar", "pocket.focusMode"]);
  assert.deepEqual(
    normalizeOptions(persisted).tooltipDisabledIds,
    ["pocket.sidebar", "pocket.focusMode"],
    "merged tooltip ids must round-trip through dehydration"
  );

  const pocketSource = read("app/pocket/controller.js");
  assert.match(pocketSource, /"data-tooltip-id": "pocket\.sidebar"/);
  assert.match(pocketSource, /"data-tooltip-id": "pocket\.focusMode"/);
  assert.doesNotMatch(pocketSource, /"data-tooltip-id": collapsed \? "pocket\.expandSidebar"/);
  assert.doesNotMatch(pocketSource, /"data-tooltip-id": "pocket\.exitFocusMode"/);
  assert.doesNotMatch(pocketSource, /tooltipId = focusMode \? "pocket\.exitFocusMode"/);

  const appearanceSource = read("app/settings/appearance.js");
  assert.match(appearanceSource, /"pocket\.sidebar": "sidebarCollapse"/);
  assert.match(
    appearanceSource,
    /disabled \? "tooltip-preview-disabled" : "tooltip-trigger"/,
    "disabled Button Tips previews must not remain tooltip triggers"
  );
  assert.match(
    appearanceSource,
    /"data-tooltip": disabled \? null : label/,
    "disabled Button Tips previews must not keep hover text"
  );
  assert.match(
    appearanceSource,
    /"data-tooltip-id": disabled \? null : target\.id/,
    "disabled Button Tips previews must drop the live tooltip id"
  );
  assert.doesNotMatch(appearanceSource, /"pocket\.collapseSidebar"/);
  assert.doesNotMatch(appearanceSource, /"pocket\.expandSidebar"/);
  assert.doesNotMatch(appearanceSource, /"pocket\.exitFocusMode"/);

  const pinSource = read("app/workspace/tabs-sidebar-item.js");
  assert.match(pinSource, /tooltipId: "workspace\.tabs\.pin"/);
  assert.doesNotMatch(pinSource, /"workspace\.tabs\.unpin" : "workspace\.tabs\.pin"/);

  assert.equal(
    TOOLTIP_TARGET_IDS.includes("topbar.workspaceTabs"),
    true,
    "the ChatClub Tabs sidebar toggle must be a settings tooltip target"
  );
  assert.deepEqual(
    normalizeOptions({ tooltipDisabledIds: ["topbar.workspaceTabs"] }).tooltipDisabledIds,
    ["topbar.workspaceTabs"],
    "disabling the ChatClub Tabs sidebar toggle must survive option normalization"
  );
  const topbarViewSource = read("app/topbar/view.js");
  assert.match(
    topbarViewSource,
    /tooltipId:\s*"topbar\.workspaceTabs"/,
    "the live sidebar toggle must keep the settings-controlled tooltip id"
  );
  assert.match(
    appearanceSource,
    /"topbar\.workspaceTabs": "sidebarCollapse"/,
    "Button Tips must preview the ChatClub Tabs sidebar toggle"
  );
  const shortcutSource = read("app/settings/shortcuts.js");
  assert.match(
    shortcutSource,
    /toggleWorkspaceTabsSidebar:[\s\S]*tooltipId:\s*"topbar\.workspaceTabs"/,
    "the shortcut preview for ChatClub Tabs must share the live sidebar tooltip id"
  );

  const i18nSource = read("shared/i18n.js");
  assert.match(i18nSource, /"pocket\.sidebar": "Toggle sidebar"/);
  assert.match(i18nSource, /"pocket\.sidebar": "切换侧边栏"/);
  assert.equal(
    TOOLTIP_TARGET_IDS.includes("topbar.customize.cancel"),
    false,
    "the unused customize-cancel tooltip must not remain a settings target"
  );
  assert.doesNotMatch(appearanceSource, /"topbar\.customize\.cancel"/);

  const { verifyTooltipTargets } = require("./verify-tooltip-targets.cjs");
  const catalog = await verifyTooltipTargets();
  assert.ok(catalog.liveCount > 0, "the catalog verifier must observe live tooltip ids");
  assert.equal(catalog.catalogCount, TOOLTIP_TARGET_IDS.length);

  const composerSource = read("app/composer/controller.js");
  assert.match(composerSource, /"data-tooltip-id": "topbar\.promptActions"/);
  assert.match(
    composerSource,
    /actionsMenuItem\(t\("topbar\.addPhotos"\), "paperclip", openImagePicker, "topbar\.addPhotos"\)/
  );
  assert.match(shortcutSource, /"data-tooltip-id": "settings\.shortcuts\.help"/);

  const tooltipSource = read("ui/tooltip.js");
  assert.match(tooltipSource, /"pocket\.collapseSidebar": "pocket\.sidebar"/);
  assert.match(tooltipSource, /"pocket\.expandSidebar": "pocket\.sidebar"/);
  assert.match(
    tooltipSource,
    /disabled\.has\(normalized\) \|\| disabled\.has\(canonicalTooltipId\(normalized\)\)/,
    "live hover must honor both the saved id and retired two-state aliases"
  );
  assert.match(tooltipSource, /classList\.toggle\("tooltip-suppressed"/);
  assert.match(tooltipSource, /syncSuppressedTooltipTriggers\(\);\s*reconcileTooltipState\(\)/);

  const stylesheetSource = read("styles/chatclub.css");
  assert.match(
    stylesheetSource,
    /\.tooltip-trigger\.tooltip-suppressed::before,\s*\.tooltip-trigger\.tooltip-suppressed::after \{/,
    "suppressed triggers must not keep CSS hover fallbacks"
  );

  console.log("tooltip target merge: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
