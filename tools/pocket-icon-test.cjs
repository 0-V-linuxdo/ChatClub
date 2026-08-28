#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const constants = await import(moduleUrl("shared/constants.js"));
  const storageSchema = await import(moduleUrl("shared/storage-schema.js"));
  const topbar = await import(moduleUrl("shared/topbar.js"));
  const i18n = await import(moduleUrl("shared/i18n.js"));
  const iconsSource = fs.readFileSync(path.join(root, "ui/icons.js"), "utf8");
  const appearanceSource = fs.readFileSync(path.join(root, "app/settings/appearance.js"), "utf8");
  const i18nSource = fs.readFileSync(path.join(root, "shared/i18n.js"), "utf8");

  assert.equal(constants.DEFAULT_POCKET_ICON, "star");
  assert.equal(constants.DEFAULT_OPTIONS.pocketIcon, "star");
  assert.equal(storageSchema.normalizePocketIcon(), "star");
  assert.equal(storageSchema.normalizePocketIcon("star"), "star");
  assert.equal(storageSchema.normalizePocketIcon("pocket"), "pocket");
  assert.equal(storageSchema.normalizePocketIcon("nope"), "star");
  assert.equal(storageSchema.normalizeOptions({}).pocketIcon, "star");
  assert.equal(storageSchema.normalizeOptions({ pocketIcon: "pocket" }).pocketIcon, "pocket");
  assert.equal(storageSchema.dehydrateOptions({ pocketIcon: "pocket" }).pocketIcon, "pocket");
  assert.equal(topbar.topbarItemIcon({ type: "item", id: "pocket" }), "star");
  assert.equal(topbar.topbarItemIcon({ type: "item", id: "pocket" }, { pocketIcon: "pocket" }), "pocket");
  assert.match(iconsSource, /\bstar:\s*\{/);
  assert.match(appearanceSource, /pocketIconControl/);
  assert.match(appearanceSource, /appearance-pocket-icon-options/);

  i18n.setLanguage("zh_CN");
  assert.equal(i18n.t("topbar.pocket"), "收藏");
  assert.equal(i18n.t("pocket.title"), "收藏");
  assert.equal(i18n.t("appearance.pocketIconStar"), "五角星");
  assert.equal(i18n.t("appearance.pocketIconPocket"), "Pocket");
  i18n.setLanguage("en");
  assert.equal(i18n.t("topbar.pocket"), "Pocket");
  assert.equal(i18n.t("appearance.pocketIconStar"), "Star");
  assert.ok(i18nSource.includes('"pocket.switchIcon": "Switch icon"'));
  assert.ok(i18nSource.includes('"pocket.switchIcon": "切换图标"'));

  console.log("pocket icon identity: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
