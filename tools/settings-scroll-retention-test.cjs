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
  redrawSource,
  /class: "settings-modal-section-tools"[\s\S]*active === "shortcuts"[\s\S]*shortcutsHeaderSearch\(redraw\)[\s\S]*active === "promptHistory"[\s\S]*promptHistorySection\.headerSearch\(redraw\)[\s\S]*modalSectionTitle\.append\(el\("h3", \{\}, section\.label\), el\("p", \{\}, section\.description\), sectionTools\)/,
  "Shortcuts and Prompt History must mount search in the settings titlebar tools slot"
);
assert.match(
  stylesSource,
  /\.settings-modal-section-title\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, max-content\) minmax\(0, 1fr\);[\s\S]*\.settings-modal-section-tools\s*\{/,
  "the Settings titlebar must keep section copy and tools on one row"
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
  /data-tooltip-id": "settings\.modal\.fullscreen"[\s\S]*classList\.toggle\("overlay-surface-fullscreen"\)[\s\S]*syncFullscreenButton\(\)/,
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
  /\.overlay-surface-fullscreen\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*max-width:\s*none;[\s\S]*max-height:\s*none;[\s\S]*border-radius:\s*0;/,
  "fullscreen Settings must fill the viewport without window chrome"
);
assert.doesNotMatch(openSettingsSource, /createViewerWindowChrome/, "Settings fullscreen must stay an editor special case without viewer-window restore");
assert.match(constantsSource, /id: "settings\.modal\.fullscreen", labelKey: "chat\.fullscreen"/);
assert.match(appearanceSource, /"settings\.modal\.fullscreen": "maximize"/);

// Table panes scroll their table, not .settings-main (2026-09-28 Arc report:
// the whole Functional Anomalies page scrolled away its header and toolbar).
const kitSource = fs.readFileSync(path.join(root, "app/settings/kit.js"), "utf8");
const fillContext = vm.createContext({});
vm.runInContext(
  `${functionSource(kitSource, "syncSettingsListFill")}\n` +
  `${functionSource(kitSource, "captureSettingsListScroll")}\n` +
  `${functionSource(kitSource, "restoreSettingsListScroll")}\n` +
  "globalThis.__fill = { syncSettingsListFill, captureSettingsListScroll, restoreSettingsListScroll };",
  fillContext,
  { filename: "app/settings/kit.js" }
);
const fill = fillContext.__fill;
const fakeList = (clientHeight, scrollHeight, childHeights) => ({
  clientHeight,
  scrollHeight,
  scrollTop: 0,
  scrollLeft: 0,
  children: childHeights.map((offsetHeight) => ({ offsetHeight }))
});
const fakeMain = (lists) => {
  const classes = new Set(["settings-list-fill-off"]);
  return {
    classList: {
      remove: (name) => classes.delete(name),
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    querySelectorAll: (selector) => (selector === ".settings-list-fill" ? lists : [])
  };
};
const roomy = fakeMain([fakeList(400, 1000, [36, 56, 56, 56, 56])]);
fill.syncSettingsListFill(roomy);
assert.equal(roomy.classList.contains("settings-list-fill-off"), false, "a table with room for its header and two rows fills");
const squeezed = fakeMain([fakeList(120, 1000, [36, 56, 56, 56])]);
fill.syncSettingsListFill(squeezed);
assert.equal(squeezed.classList.contains("settings-list-fill-off"), true, "below header plus two rows the pane scrolls whole again");
const shortSqueezed = fakeMain([fakeList(42, 92, [36, 56])]);
fill.syncSettingsListFill(shortSqueezed);
assert.equal(shortSqueezed.classList.contains("settings-list-fill-off"), true, "a short table is never squeezed below itself");
const shortWhole = fakeMain([fakeList(92, 92, [36, 56])]);
fill.syncSettingsListFill(shortWhole);
assert.equal(shortWhole.classList.contains("settings-list-fill-off"), false, "a short table that fits keeps fill mode");
const scrolled = fakeList(300, 1000, [36, 56]);
scrolled.scrollTop = 240;
scrolled.scrollLeft = 30;
const offsets = fill.captureSettingsListScroll(fakeMain([scrolled]));
const replacement = fakeList(300, 1000, [36, 56]);
fill.restoreSettingsListScroll(fakeMain([replacement]), offsets);
assert.deepEqual([replacement.scrollTop, replacement.scrollLeft], [240, 30], "a redraw carries the table offsets across the replaced pane");

assert.match(
  redrawSource,
  /const listScroll = renderedSection === active \? captureSettingsListScroll\(settingsMain\) : \[\];[\s\S]*?settingsMain\.replaceChildren\([\s\S]*?syncSettingsListFill\(settingsMain\);[\s\S]*?settingsMain\.scrollTop = mainScrollTop;[\s\S]*?restoreSettingsListScroll\(settingsMain, listScroll\);/,
  "same-section redraws must decide fill mode and then restore table offsets"
);
assert.match(openSettingsSource, /new ResizeObserver\(\(\) => syncSettingsListFill\(settingsMain\)\)[\s\S]*?listFillObserver\.observe\(settingsMain\)/);
assert.match(openSettingsSource, /const close = \(\) => \{\s*listFillObserver\?\.disconnect\(\);/);
for (const [file, list] of [
  ["app/settings/functional-anomalies.js", "functional-anomaly-list settings-list-fill"],
  ["app/settings/history.js", "prompt-history-list settings-list-fill"],
  ["app/settings/profiles.js", "api-profile-list settings-list-fill"],
  ["app/settings/apps.js", "built-in-config-list settings-list-fill"],
  ["app/settings/apps.js", "custom-config-list settings-list-fill"],
  ["app/settings/summary.js", "summary-collector-list settings-list-fill"],
  ["app/settings/prompt-templates.js", "prompt-template-list settings-list-fill"],
  ["app/settings/message-navigation.js", "message-navigator-list settings-list-fill"],
  ["app/settings/topic-deletion.js", "topic-delete-list settings-list-fill"],
  ["app/settings/shortcuts.js", "shortcut-list settings-list-fill"],
  ["app/settings/appearance-topbar.js", "topbar-placeholder-list settings-list-fill"],
  ["app/settings/controller.js", "prompt-library-list settings-list-fill"]
]) {
  assert.ok(fs.readFileSync(path.join(root, file), "utf8").includes(list), `${file} must let its table scroll instead of the page (${list})`);
}
const anomaliesSource = fs.readFileSync(path.join(root, "app/settings/functional-anomalies.js"), "utf8");
assert.match(
  anomaliesSource,
  /const listScroll = captureSettingsListScroll\(host\);\s*host\.replaceChildren\([\s\S]*?syncSettingsListFill\(host\.closest\?\.\("\.settings-main"\)\);\s*restoreSettingsListScroll\(host, listScroll\);/,
  "the live anomaly re-render must keep its table offsets and fill mode"
);
assert.match(stylesSource, /\.settings-main:not\(\.settings-list-fill-off\):has\(\.settings-list-fill\),\s*\n\.settings-main:not\(\.settings-list-fill-off\) :has\(\.settings-list-fill\) \{\s*display: flex;\s*flex-direction: column;/);
assert.match(stylesSource, /\.settings-main:not\(\.settings-list-fill-off\) :has\(\.settings-list-fill\),\s*\n\.settings-main:not\(\.settings-list-fill-off\) \.settings-list-fill \{\s*flex: 0 1 auto;\s*min-height: 0;/);
assert.match(stylesSource, /\.settings-main:not\(\.settings-list-fill-off\) :has\(\.settings-list-fill\) > :not\(:has\(\.settings-list-fill\), \.settings-list-fill\) \{\s*flex-shrink: 0;/);
assert.match(stylesSource, /\.settings-main \.settings-list-fill > \.settings-list-header \{\s*position: sticky;\s*top: 0;/);
for (const [, selector, body] of stylesSource.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  if (!selector.replace(/\/\*[\s\S]*?\*\//g, "").includes("settings-list-fill")) continue;
  assert.doesNotMatch(body, /min-height:(?!\s*0;)/, "a CSS floor would inflate a short table or push rows past a card border");
}

// The anomaly table fits the windowed dialog: the time is a two-line clock/day
// stack in a narrow fixed track, Feature hugs its content so no blank strip opens
// before Problem, and Problem lost the 300px floor and 1.2fr share that forced an
// 860px table and cut off the row actions.
assert.match(anomaliesSource, /dateTimeLines\(record\.updatedAt \|\| record\.createdAt\)\.map\(\(line\) => el\("span", \{\}, line\)\)/);
assert.match(anomaliesSource, /timeStyle: "short" \}\)\.format\(date\),\s*new Intl\.DateTimeFormat\(undefined, \{ dateStyle: "medium" \}\)\.format\(date\)/, "the clock sits above the day");
assert.match(anomaliesSource, /if \(key === "createdAt" \|\| key === "updatedAt"\) return dateLabel\(value\);/, "the details viewer keeps the one-line date");
assert.match(
  stylesSource,
  /\.functional-anomaly-list \.settings-list-header,\s*\n\.functional-anomaly-row \{\s*min-width: 620px;\s*grid-template-columns: 112px 176px minmax\(200px, 1fr\) 132px;/
);
assert.match(stylesSource, /\.functional-anomaly-time \{\s*display: grid;\s*gap: 2px;/);

console.log("settings scroll retention regression: ok");
