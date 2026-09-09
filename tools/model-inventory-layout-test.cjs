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
  "Current models keeps the card title bar and inventory.desc help"
);
assert.doesNotMatch(inventoryBlock, /t\("inventory\.outbound"\)/);
assert.doesNotMatch(inventoryBlock, /t\("inventory\.feature"\)/);
assert.doesNotMatch(inventoryBlock, /t\("inventory\.profile"\)/);
assert.doesNotMatch(inventoryBlock, /settingsList\(/);
assert.doesNotMatch(inventoryBlock, /ui-list-row|settings-list-row/);
assert.doesNotMatch(inventoryBlock, /settings-muted-cell/);
assert.doesNotMatch(inventoryBlock, /row\.profileName/);
assert.doesNotMatch(inventoryBlock, /inventory\.host/);
assert.doesNotMatch(inventoryBlock, /modelInventoryWorld: "iframe"/);
assert.doesNotMatch(inventoryBlock, /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color/);

assert.match(inventoryBlock, /class: "model-inventory-group model-inventory-outbound"/);
assert.match(inventoryBlock, /class: "model-inventory-row"/);
assert.match(inventoryBlock, /class: "model-inventory-feature"/);
assert.match(inventoryBlock, /class: "model-inventory-cluster"/);
assert.doesNotMatch(inventoryBlock, /model-inventory-block/);
assert.match(inventoryBlock, /t\("profiles\.provider"\)/);
assert.match(inventoryBlock, /t\("inventory\.model"\)/);
assert.match(inventoryBlock, /outboundField: "profile"/);
assert.match(inventoryBlock, /outboundField: "model"/);
assert.match(inventoryBlock, /saveOutboundProfile/);
assert.match(inventoryBlock, /saveOutboundModel/);
assert.match(inventoryBlock, /dataset: \{ modelInventoryId: row\.id, modelInventoryWorld: "outbound" \}/);

assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-outbound \.settings-list-header/,
  "4-col inventory header tracks must be gone"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-outbound \.model-inventory-row \{[^}]*minmax\([^)]*,\s*\.7fr\)/,
  "4-col inventory fr tracks must be gone"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-list/,
  "inventory must not keep the spreadsheet list chrome"
);
assert.doesNotMatch(stylesheetSource, /\.model-inventory-heading/);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-cluster \{[^}]*1fr/,
  "Provider and Model selects must hug, not stretch as 1fr"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.model-inventory-group \{[^}]*1fr/,
  "assignment rows must not use a 1fr title track"
);

assert.match(
  stylesheetSource,
  /\.model-inventory-group \{[\s\S]*?grid-template-columns: minmax\(0, max-content\) max-content;[\s\S]*?width:\s*max-content;/,
  "feature title and cluster share left-aligned hugging columns"
);
assert.match(
  stylesheetSource,
  /\.model-inventory-cluster \{[\s\S]*?grid-template-columns: minmax\(11ch, 22ch\) minmax\(11ch, 22ch\);[\s\S]*?width:\s*max-content;/,
  "two native selects sit in a hugging cluster"
);
assert.match(
  stylesheetSource,
  /\.model-inventory-cluster \.select \{[\s\S]*?max-width:\s*28ch;/,
  "selects keep a ch cap instead of filling the well"
);
assert.doesNotMatch(stylesheetSource, /\.model-inventory-block/);

const inventoryCss = stylesheetSource.match(/\.model-inventory-group \{[\s\S]*?\.model-inventory-cluster \.select \{[\s\S]*?\}/);
assert.ok(inventoryCss, "inventory layout CSS must be co-located");
assert.doesNotMatch(inventoryCss[0], /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color/);

console.log("model inventory layout: ok");
