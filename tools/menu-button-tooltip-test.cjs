#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function sliceExport(source, name, nextName) {
  const start = source.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, `${name} must be exported`);
  const end = nextName ? source.indexOf(`export function ${nextName}(`, start + 1) : source.length;
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

const components = read("ui/components.js");
const menuButton = sliceExport(components, "createMenuButton", "createSettingsList");
const compactIconButton = sliceExport(components, "createCompactIconButton", "createMenuButton");
const iconButton = sliceExport(read("ui/dom.js"), "iconButton", "button");

assert.match(menuButton, /tooltipLabel/, "createMenuButton must keep the tooltipLabel argument");
assert.match(menuButton, /tooltipPlacement/, "createMenuButton must keep the tooltipPlacement argument");
assert.match(menuButton, /tooltipId/, "createMenuButton must keep the tooltipId argument");
assert.match(menuButton, /class: `button button-\$\{variant\} menu-button`/, "labeled menu rows must not attach tooltip-trigger");
assert.doesNotMatch(menuButton, /tooltip-trigger/, "labeled menu rows must not attach a hover tooltip");
assert.doesNotMatch(menuButton, /"data-tooltip"/, "labeled menu rows must not stamp data-tooltip");
assert.doesNotMatch(menuButton, /"data-tooltip-placement"/, "labeled menu rows must not stamp data-tooltip-placement");
assert.doesNotMatch(menuButton, /"data-tooltip-id"/, "labeled menu rows must not stamp data-tooltip-id");
assert.match(menuButton, /role: "menuitem"/);
assert.match(menuButton, /"aria-label": label/);

assert.match(compactIconButton, /tooltipLabel, tooltipPlacement, tooltipId/);
assert.match(iconButton, /tooltip-trigger/, "pinned compact icons must keep hover tooltips");
assert.match(iconButton, /"data-tooltip": tooltipLabel/);
assert.match(iconButton, /"data-tooltip-id": tooltipId \|\| null/);

const tabMenu = read("app/workspace/tab-context-menu.js");
assert.match(tabMenu, /menuButton\(\s*t\("chat\.home"\)/);
assert.match(tabMenu, /menuButton\(\s*t\("common\.copyLink"\)/);
assert.match(tabMenu, /menuButton\(\s*t\("common\.openInNewTab"\)/);
assert.match(tabMenu, /menuButton\(t\("chat\.goToUrl"\)/);
assert.match(tabMenu, /menuButton\(t\("chat\.removeGroup"\)/);
assert.match(tabMenu, /"workspace\.group\.reload"/);
assert.match(tabMenu, /"workspace\.group\.copyLink"/);
assert.match(tabMenu, /"workspace\.group\.openInNewTab"/);
assert.match(tabMenu, /"workspace\.group\.goToUrl"/);
assert.match(tabMenu, /"workspace\.group\.remove"/);

const view = read("app/workspace/view-controller.js");
assert.match(
  view,
  /function renderHomeButton\(group\) \{\s*return compactIconButton\(t\("chat\.home"\), "home",[\s\S]*?"workspace\.group\.reload"\)/,
  "pinned Home icon must keep data-tooltip + workspace.group.reload"
);
assert.match(view, /shortcutTooltip\(t\("chat\.home"\), "reloadChat"\)/);

console.log("menu button tooltip: ok");
