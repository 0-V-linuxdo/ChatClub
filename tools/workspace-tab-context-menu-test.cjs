#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/workspace/view-controller.js"), "utf8");
const menuRendererSource = fs.readFileSync(path.join(root, "app/workspace/tab-context-menu.js"), "utf8");
const constantsSource = fs.readFileSync(path.join(root, "shared/constants.js"), "utf8");
const { functionSource } = require("./function-source.cjs");

const tabSource = functionSource(source, "renderChatTab", "  ");
assert.match(tabSource, /oncontextmenu:\s*openCurrentTabMenu/);
assert.match(tabSource, /showAllActions:\s*true/);
assert.match(tabSource, /targetChat:\s*location\.chat/);
assert.match(tabSource, /event\.button\s*!==\s*0/);

const menuSource = functionSource(source, "openChatMenu", "  ");
const itemSource = functionSource(menuRendererSource, "renderWorkspaceTabMenuItems");
assert.match(menuSource, /showAllActions\s*=\s*false/);
assert.match(menuSource, /renderWorkspaceTabMenuItems\(/);
assert.match(itemSource, /activateChatTab\(group,\s*menuTargetChat\.instanceId\)/);
assert.match(itemSource, /normalizeTabContextMenuOrder\(state\.options\?\.tabContextMenuOrder\)/);
assert.match(itemSource, /!showAllActions\s*\|\|\s*!hiddenContextMenuItems\.has\(item\.id\)/);
assert.match(itemSource, /entry\.node\s*&&\s*!entry\.node\.disabled/);
assert.match(itemSource, /TAB_CONTEXT_MENU_ITEMS/);
assert.match(constantsSource, /TAB_CONTEXT_MENU_ITEMS\s*=\s*Object\.freeze\(\[[\s\S]*?item\.id\s*!==\s*"removeGroup"/);
assert.match(menuSource, /tab-context-menu/);
assert.match(itemSource, /t\("chat\.closeTab"\)/);
assert.match(itemSource, /closeTab\(group,\s*menuTargetChat\)/);
for (const id of [
  "addApp", "refreshPage", "newChat", "messageNavigator", "deleteThread", "reload",
  "fullscreen", "copyLink", "openInNewTab", "goToUrl"
]) {
  assert.match(itemSource, new RegExp(`${id}:`), `context menu must retain the ${id} tab operation`);
}

const css = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");
assert.match(css, /\.popover-menu\.tab-context-menu\s*\{[\s\S]*?min-width:\s*214px/);

console.log("workspace iframe tab context menu: ok");
