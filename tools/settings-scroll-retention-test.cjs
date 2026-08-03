#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "app/settings/controller.js"), "utf8");
const topbarViewSource = fs.readFileSync(path.join(root, "app/topbar/view.js"), "utf8");
const appearanceSource = fs.readFileSync(path.join(root, "app/settings/appearance.js"), "utf8");
const constantsSource = fs.readFileSync(path.join(root, "shared/constants.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");

const { functionSource } = require("./function-source.cjs");

const scrollContext = vm.createContext({});
vm.runInContext(
  `${functionSource(controllerSource, "settingsMainScrollTopForRedraw")}\n`+
  "globalThis.__settingsMainScrollTopForRedraw = settingsMainScrollTopForRedraw;",
  scrollContext,
  { filename: "app/settings/controller.js" }
);
const scrollTopForRedraw = scrollContext.__settingsMainScrollTopForRedraw;

assert.equal(scrollTopForRedraw("", "shortcuts", 411), 0, "the initial section must start at the top");
assert.equal(scrollTopForRedraw("shortcuts", "shortcuts", 411), 411, "same-section redraws must retain main scroll");
assert.equal(scrollTopForRedraw("shortcuts", "about", 411), 0, "a newly selected section must start at the top");
assert.equal(scrollTopForRedraw("about", "rules", 411), 0, "the new Rules section must start at the top");
assert.equal(scrollTopForRedraw("rules", "rules", 411), 411, "Rules redraws must retain main scroll");
assert.equal(scrollTopForRedraw("shortcuts", "shortcuts", -10), 0, "invalid negative offsets must be clamped");
assert.equal(scrollTopForRedraw("shortcuts", "shortcuts", Number.NaN), 0, "invalid offsets must not leak into the DOM");

const openSettingsSource = functionSource(controllerSource, "openSettings");
const redrawSource = functionSource(openSettingsSource, "redraw");
const renderSettingsMenuSource = functionSource(topbarViewSource, "renderSettingsMenu");

assert.doesNotMatch(redrawSource, /clear\(host\)/, "redraw must not replace the settings scroll containers");
assert.match(
  openSettingsSource,
  /host\.append\([\s\S]*?class: "settings-sidebar"[\s\S]*?settingsMain[\s\S]*?\);/,
  "sidebar and main must be mounted once for the settings dialog lifetime"
);
assert.match(
  redrawSource,
  /settingsMainScrollTopForRedraw\(renderedSection, active, settingsMain\.scrollTop\)[\s\S]*?settingsMain\.replaceChildren\([\s\S]*?settingsMain\.scrollTop = mainScrollTop;[\s\S]*?renderedSection = active;/,
  "redraw must restore same-section main scroll after replacing only the pane"
);
assert.match(
  redrawSource,
  /settingsNav\.setAttribute\("aria-label", t\("settings\.sections"\)\)[\s\S]*?entry\.label\.textContent = t\(entry\.labelKey\)[\s\S]*?entry\.description\.textContent = t\(entry\.descriptionKey\)/,
  "persistent navigation must still refresh translated labels"
);
assert.match(
  renderSettingsMenuSource,
  /foldedSettingsSectionIds[\s\S]*settingsSections[\s\S]*\.filter\(\(\[id\]\) => !foldedSettingsSectionIds\.has\(id\)\)/,
  "the Settings menu must fill individual missing sections instead of suppressing the complete fallback list"
);
assert.doesNotMatch(
  renderSettingsMenuSource,
  /foldedSettings(?:Item|Section)Ids\.size\s*>\s*0\s*\?\s*\[\]/,
  "one mapped Settings item must not hide every unmapped section"
);
assert.match(
  openSettingsSource,
  /data-tooltip-id": "settings\.modal\.fullscreen"[\s\S]*classList\.toggle\("settings-modal-fullscreen"\)[\s\S]*syncFullscreenButton\(\)/,
  "Settings must expose a fullscreen toggle that updates in place"
);
assert.match(
  openSettingsSource,
  /chat\.exitFullscreen[\s\S]*chat\.fullscreen[\s\S]*aria-label[\s\S]*data-tooltip[\s\S]*svgIcon\(fullscreen \? "minimize" : "maximize"\)/,
  "the Settings fullscreen action must synchronize its accessible action label, tooltip, and icon"
);
assert.doesNotMatch(openSettingsSource, /aria-pressed/, "a dynamically named fullscreen action must not also expose toggle-button pressed state");
assert.match(
  stylesSource,
  /\.modal\.settings-modal\.settings-modal-fullscreen\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*max-width:\s*none;[\s\S]*max-height:\s*none;[\s\S]*border-radius:\s*0;/,
  "fullscreen Settings must fill the viewport without window chrome"
);
assert.match(constantsSource, /id: "settings\.modal\.fullscreen", labelKey: "chat\.fullscreen"/);
assert.match(appearanceSource, /"settings\.modal\.fullscreen": "maximize"/);

console.log("settings scroll retention regression: ok");
