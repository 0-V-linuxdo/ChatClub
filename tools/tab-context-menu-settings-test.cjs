#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const appearanceSource = read("app/settings/appearance.js");
  const tabGroupSource = read("app/settings/appearance-tab-group.js");
  const statePortsSource = read("app/settings/state-ports.js");
  const constantsSource = read("shared/constants.js");
  const stylesheetSource = read("styles/chatclub.css");

  assert.match(appearanceSource, /createAppearanceTabGroupController/);
  assert.match(appearanceSource, /appearanceTabGroup\.pane\(redraw\)/);
  assert.doesNotMatch(appearanceSource, /\["contextMenu",\s*t\("appearance\.tabContextMenu"\)/);
  assert.match(tabGroupSource, /settingsInnerTabs\(\[/);
  assert.match(tabGroupSource, /\["contextMenu",\s*t\("appearance\.tabContextMenu"/);
  assert.match(tabGroupSource, /state\.settingsTabGroupTab/);
  assert.match(tabGroupSource, /tabContextMenuOrder:/);
  assert.match(tabGroupSource, /tabContextMenuHiddenIds:/);
  assert.match(tabGroupSource, /tab-context-menu-placement-list/);
  assert.match(tabGroupSource, /tab-context-menu-placement-row/);
  assert.match(statePortsSource, /"tabContextMenuHiddenIds",\s*"tabContextMenuOrder"/);
  assert.match(constantsSource, /TAB_CONTEXT_MENU_ITEMS[\s\S]*?item\.id\s*!==\s*"removeGroup"/);
  assert.match(constantsSource, /\{ id: "closeTab", icon: "x", section: "context", danger: true \}/);
  assert.match(stylesheetSource, /\.tab-context-menu-placement-list\s*\{/);
  assert.match(stylesheetSource, /\.tab-context-menu-placement-row\s*\{/);

  const {
    normalizeOptions,
    normalizeTabContextMenuHiddenIds,
    normalizeTabContextMenuOrder
  } = await import(moduleUrl("shared/storage-schema.js"));
  const inherited = normalizeTabContextMenuOrder(undefined, ["copyLink", "removeGroup", "refreshPage"]);
  assert.deepEqual(inherited.slice(0, 2), ["copyLink", "refreshPage"]);
  assert.ok(!inherited.includes("removeGroup"));
  assert.ok(inherited.includes("closeTab"));
  assert.deepEqual(
    normalizeTabContextMenuHiddenIds(["messageNavigator", "removeGroup", "messageNavigator"]),
    ["messageNavigator"]
  );
  const normalized = normalizeOptions({
    tabContextMenuOrder: ["goToUrl", "closeTab", "goToUrl", "removeGroup"],
    tabContextMenuHiddenIds: ["deleteThread", "removeGroup", "deleteThread"]
  });
  assert.deepEqual(normalized.tabContextMenuOrder.slice(0, 2), ["goToUrl", "closeTab"]);
  assert.ok(!normalized.tabContextMenuOrder.includes("removeGroup"));
  assert.deepEqual(normalized.tabContextMenuHiddenIds, ["deleteThread"]);

  console.log("tab context menu settings: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
