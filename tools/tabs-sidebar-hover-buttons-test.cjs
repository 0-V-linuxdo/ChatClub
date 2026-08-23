#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const i18nSource = read("shared/i18n.js");
  assert.match(i18nSource, /"appearance\.tabsSidebar": "ChatClub Tabs"/);
  assert.match(i18nSource, /"appearance\.tabsSidebar": "ChatClub 标签页"/);
  assert.match(i18nSource, /"workspace\.tabs\.more": "More"/);
  assert.match(i18nSource, /"workspace\.tabs\.more": "更多"/);
  const appearanceSource = read("app/settings/appearance.js");
  const tabGroupSource = read("app/settings/appearance-tab-group.js");
  const statePortsSource = read("app/settings/state-ports.js");
  const constantsSource = read("shared/constants.js");
  const stylesheetSource = read("styles/chatclub.css");
  const sidebarSource = [
    read("app/workspace/tabs-sidebar-controller.js"),
    read("app/workspace/tabs-sidebar-item.js")
  ].join("\n");
  const runtimeSource = read("app/runtime.js");

  assert.match(constantsSource, /TABS_SIDEBAR_HOVER_BUTTONS/);
  assert.match(constantsSource, /id: "pin"/);
  assert.match(constantsSource, /id: "edit"/);
  assert.match(constantsSource, /id: "delete"/);
  assert.match(constantsSource, /id: "more"[\s\S]*requiredPinned: true/);
  assert.match(tabGroupSource, /\["tabsSidebar",\s*t\("appearance\.tabsSidebar"/);
  assert.match(tabGroupSource, /kind === "tabsSidebar"/);
  assert.match(tabGroupSource, /tabsSidebarButtonPlacement:/);
  assert.match(tabGroupSource, /tabsSidebarButtonOrder:/);
  assert.match(statePortsSource, /"tabsSidebarButtonOrder",\s*"tabsSidebarButtonPlacement"/);
  assert.match(appearanceSource, /settingsTabsSidebarButtonPlacementDraft/);
  assert.match(stylesheetSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(sidebarSource, /openHoverMenu/);
  assert.match(sidebarSource, /workspace-tabs-sidebar-hover-menu/);
  assert.match(sidebarSource, /workspace-tabs-sidebar-item-more/);
  assert.match(runtimeSource, /getOptions: \(\) => state\.options/);
  assert.match(
    stylesheetSource,
    /\.workspace-tabs-sidebar-item-actions:focus-within/,
    "hover buttons may appear when an action itself is focused"
  );
  assert.doesNotMatch(
    stylesheetSource,
    /\.workspace-tabs-sidebar-item:focus-within \.workspace-tabs-sidebar-item-actions/,
    "title focus must not keep hover buttons visible"
  );
  assert.match(
    stylesheetSource,
    /\.workspace-tabs-sidebar-item:has\(:focus-visible\)/,
    "keyboard focus may highlight a row without leaving hover buttons stuck after a click"
  );

  const {
    normalizeOptions,
    normalizeTabsSidebarButtonOrder,
    normalizeTabsSidebarButtonPlacement
  } = await import(moduleUrl("shared/storage-schema.js"));
  const {
    DEFAULT_TABS_SIDEBAR_BUTTON_ORDER,
    DEFAULT_TABS_SIDEBAR_BUTTON_PLACEMENT
  } = await import(moduleUrl("shared/constants.js"));

  assert.deepEqual(normalizeTabsSidebarButtonOrder(), [...DEFAULT_TABS_SIDEBAR_BUTTON_ORDER]);
  assert.deepEqual(normalizeTabsSidebarButtonOrder(["delete", "pin", "edit", "pin", "more"]), ["delete", "pin", "edit"]);
  assert.deepEqual(
    normalizeTabsSidebarButtonPlacement({ pin: "menu", edit: "hidden", delete: "nope", more: "hidden" }),
    { pin: "menu", edit: "hidden", delete: "pinned", more: "pinned" }
  );
  const normalized = normalizeOptions({
    tabsSidebarButtonPlacement: { pin: "menu", edit: "menu" },
    tabsSidebarButtonOrder: ["edit"]
  });
  assert.deepEqual(normalized.tabsSidebarButtonPlacement.pin, "menu");
  assert.deepEqual(normalized.tabsSidebarButtonPlacement.more, "pinned");
  assert.deepEqual(normalized.tabsSidebarButtonOrder[0], "edit");
  assert.deepEqual(normalized.tabsSidebarButtonOrder.slice().sort(), [...DEFAULT_TABS_SIDEBAR_BUTTON_ORDER].sort());
  assert.deepEqual(normalizeOptions({}).tabsSidebarButtonPlacement, { ...DEFAULT_TABS_SIDEBAR_BUTTON_PLACEMENT });

  console.log("tabs sidebar hover buttons: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
