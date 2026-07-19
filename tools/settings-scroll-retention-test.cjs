#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "app/settings/controller.js"), "utf8");

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
assert.equal(scrollTopForRedraw("shortcuts", "shortcuts", -10), 0, "invalid negative offsets must be clamped");
assert.equal(scrollTopForRedraw("shortcuts", "shortcuts", Number.NaN), 0, "invalid offsets must not leak into the DOM");

const openSettingsSource = functionSource(controllerSource, "openSettings");
const redrawSource = functionSource(openSettingsSource, "redraw");

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

console.log("settings scroll retention regression: ok");
