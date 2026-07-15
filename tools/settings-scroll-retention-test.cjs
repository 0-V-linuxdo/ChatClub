#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "app/settings/controller.js"), "utf8");

function functionSource(source, name) {
  const signature = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`, "g");
  const match = signature.exec(source);
  assert.ok(match, `${name} must exist`);
  const start = match.index + match[0].indexOf("function");
  const bodyStart = source.indexOf(") {", signature.lastIndex);
  assert.ok(bodyStart >= 0, `${name} must have an inline function body`);
  const open = bodyStart + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

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
