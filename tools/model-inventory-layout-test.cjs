#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { functionSource } = require("./function-source.cjs");

const profilesSource = read("app/settings/profiles.js");
const stylesheetSource = read("styles/chatclub.css");
const inventoryBlock = functionSource(profilesSource, "inventoryBlock");

assert.match(inventoryBlock, /listModelInventory\(state\.options, \["outbound"\]\)/);
assert.match(
  inventoryBlock,
  /settingsBlock\(\s*t\("inventory\.title"\),\s*t\("inventory\.desc"\)/,
  "Current models keeps the card title and inventory.desc help"
);
assert.match(inventoryBlock, /class: "model-inventory-header"/);
assert.match(inventoryBlock, /t\("inventory\.feature"\)/);
assert.match(inventoryBlock, /t\("profiles\.provider"\)/);
assert.match(inventoryBlock, /t\("inventory\.model"\)/);
assert.doesNotMatch(inventoryBlock, /t\("inventory\.outbound"\)/);
assert.doesNotMatch(inventoryBlock, /t\("inventory\.profile"\)/);
assert.doesNotMatch(inventoryBlock, /settingsList\(/);
assert.doesNotMatch(inventoryBlock, /ui-list-row|settings-list-row/);
assert.doesNotMatch(inventoryBlock, /settings-muted-cell/);
assert.doesNotMatch(inventoryBlock, /row\.profileName/);
assert.doesNotMatch(inventoryBlock, /inventory\.host/);
assert.doesNotMatch(inventoryBlock, /modelInventoryWorld: "iframe"/);
assert.doesNotMatch(inventoryBlock, /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color/);
assert.doesNotMatch(inventoryBlock, /model-inventory-cluster/);
assert.doesNotMatch(inventoryBlock, /model-inventory-block/);

assert.match(inventoryBlock, /class: "model-inventory-group model-inventory-outbound"/);
assert.match(inventoryBlock, /class: "model-inventory-row"/);
assert.match(inventoryBlock, /class: "model-inventory-feature"/);
assert.match(inventoryBlock, /outboundField: "profile"/);
assert.match(inventoryBlock, /outboundField: "model"/);
assert.match(inventoryBlock, /saveOutboundProfile/);
assert.match(inventoryBlock, /saveOutboundModel/);
assert.match(inventoryBlock, /dataset: \{ modelInventoryId: row\.id, modelInventoryWorld: "outbound" \}/);

assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-outbound \.settings-list-header/,
  "inventory must not reuse the 4-col settings-list header tracks"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-outbound \.model-inventory-row \{[^}]*minmax\([^)]*,\s*\.7fr\)/,
  "4-col inventory fr tracks must stay gone"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-list/,
  "inventory must not keep the spreadsheet list chrome"
);
assert.doesNotMatch(stylesheetSource, /\.model-inventory-heading/);
assert.doesNotMatch(stylesheetSource, /\.model-inventory-cluster/);
assert.doesNotMatch(stylesheetSource, /\.model-inventory-block/);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-group \{[^}]*minmax\(0,\s*max-content\) max-content/,
  "feature title must not share a 2-col hugging cluster"
);

assert.match(
  stylesheetSource,
  /\.model-inventory-group \{[\s\S]*?grid-template-columns: minmax\(7\.5rem, max-content\) minmax\(12rem, 1fr\) minmax\(14rem, 1\.2fr\);[\s\S]*?width:\s*100%;/,
  "Feature hugs; Provider and Model fill the remaining header bar"
);
assert.match(
  stylesheetSource,
  /\.model-inventory-header \{[\s\S]*?min-height:\s*var\(--ui-header-height\);/,
  "column header uses the settings list header height"
);
assert.match(
  stylesheetSource,
  /\.model-inventory-header span \{[\s\S]*?border-left: 1px solid var\(--line\);/,
  "header labels keep vertical separators"
);
assert.match(
  stylesheetSource,
  /\.model-inventory-row \.select \{[\s\S]*?max-width:\s*28ch;/,
  "selects keep a ch cap instead of filling leftover well space"
);

const inventoryCss = stylesheetSource.match(/\.model-inventory-group \{[\s\S]*?\.model-inventory-row \.select \{[\s\S]*?\}/);
assert.ok(inventoryCss, "inventory layout CSS must be co-located");
assert.doesNotMatch(inventoryCss[0], /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color/);

console.log("model inventory layout: ok");
