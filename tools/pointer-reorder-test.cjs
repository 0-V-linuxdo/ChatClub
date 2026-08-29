#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const { moveOrderedIdsByDelta } = await import(moduleUrl("shared/app-picker-order.js"));
  const { moveListItemByDelta } = await import(moduleUrl("app/settings/kit.js"));
  const { TABS_SIDEBAR_HOVER_BUTTONS } = await import(moduleUrl("shared/constants.js"));

  assert.deepEqual(moveOrderedIdsByDelta(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(moveOrderedIdsByDelta(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual(
    moveListItemByDelta([{ id: "a" }, { id: "b" }, { id: "c" }], "a", 1).map((item) => item.id),
    ["b", "a", "c"]
  );

  assert.equal(TABS_SIDEBAR_HOVER_BUTTONS.some((item) => item.id === "moveUp"), false);

  const i18n = read("shared/i18n.js");
  assert.match(i18n, /"common\.moveUp": "Move up"/);
  assert.match(i18n, /"common\.moveDown": "Move down"/);
  assert.match(i18n, /"common\.moveUp": "上移"/);
  assert.match(i18n, /"common\.moveDown": "下移"/);

  const icons = read("ui/icons.js");
  assert.match(icons, /chevronUp:/);

  const components = read("ui/components.js");
  assert.match(components, /export function createReorderButtons/);
  assert.match(components, /class: `ui-reorder /);

  const kit = read("app/settings/kit.js");
  assert.match(kit, /function settingsReorderHandle/);
  assert.match(kit, /export function moveListItemByDelta/);

  const tabsItem = read("app/workspace/tabs-sidebar-item.js");
  assert.match(tabsItem, /workspace-tabs-sidebar-item-move-up/);
  assert.match(tabsItem, /workspace-tabs-sidebar-folder-move-up/);
  assert.doesNotMatch(read("shared/constants.js"), /id: "moveUp"/);

  const tabsController = read("app/workspace/tabs-sidebar-controller.js");
  assert.match(tabsController, /function moveByDelta/);
  assert.match(tabsController, /function canMoveByDelta/);
  assert.match(tabsController, /moveFolderRow,/);

  const picker = read("app/workspace/app-picker.js");
  assert.match(picker, /function persistCurrentOrder/);
  assert.match(picker, /function pickerReorder/);
  assert.match(picker, /class: "app-picker-item-row"/);
  assert.match(picker, /\.app-picker-item-row/);

  const layout = read("app/workspace/layout-controller.js");
  assert.match(layout, /async function moveLayoutPreset/);
  assert.match(read("app/workspace/view-controller.js"), /createReorderButtons/);
  assert.match(read("app/workspace/controller.js"), /"moveLayoutPreset"/);

  for (const file of [
    "app/settings/models.js",
    "app/settings/apps.js",
    "app/settings/profiles.js",
    "app/settings/summary.js",
    "app/settings/message-navigation.js",
    "app/settings/topic-deletion.js",
    "app/settings/prompt-templates.js",
    "app/settings/appearance-topbar.js",
    "app/prompt-library/controller.js"
  ]) {
    assert.match(read(file), /settingsReorderHandle/, `${file} must expose click reorder`);
  }

  const css = read("styles/chatclub.css");
  assert.match(css, /\.ui-reorder-button \{[^}]*min-width:\s*var\(--target-min\);/s);
  assert.match(css, /\.app-picker-item-row \{/);
  assert.match(css, /--ui-reorder-cluster:/);
  assert.match(css, /grid-template-columns:\s*var\(--ui-reorder-cluster\)/);

  const agents = read("AGENTS.md");
  assert.match(agents, /WCAG 2\.5\.7/);
  assert.match(agents, /Do not add those actions to `TABS_SIDEBAR_HOVER_BUTTONS`/);

  console.log("pointer reorder: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
