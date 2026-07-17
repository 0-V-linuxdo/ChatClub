#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "app/settings/appearance.js"), "utf8");
const settingsKitSource = fs.readFileSync(path.join(root, "app/settings/kit.js"), "utf8");
const stylesheetSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");
const i18nSource = fs.readFileSync(path.join(root, "shared/i18n.js"), "utf8");
const storageSource = fs.readFileSync(path.join(root, "shared/storage-schema.js"), "utf8");

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
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, "");
  }
  throw new Error(`Unable to extract ${name}`);
}

assert.doesNotMatch(controllerSource, /frameToastPositionPreset|frame-toast-position-preset/, "position preset DOM must be removed");
assert.doesNotMatch(controllerSource, /frameToast(?:Top|Middle|Bottom|Center)/, "position preset definitions must be removed");
assert.doesNotMatch(stylesheetSource, /frame-toast-position-preset/, "position preset CSS must be removed");
assert.doesNotMatch(i18nSource, /appearance\.frameToast(?:Presets|Top|Middle|Bottom|Center)/, "position preset translations must be removed");
assert.match(
  controllerSource,
  /class: "frame-toast-position-readout"[\s\S]*t\("appearance\.frameToastDragHelp"\)[\s\S]*t\("appearance\.frameToastKeyboardHelp"\)/,
  "drag and keyboard help must remain in the right-side readout"
);
assert.match(
  controllerSource,
  /const step = event\.shiftKey \? 5 : 1;[\s\S]*keyboardDirty = setDraft/,
  "arrow keys must keep 1% and Shift+arrow 5% adjustments"
);
assert.match(controllerSource, /sample\.addEventListener\("keyup"[\s\S]*commitDraft\(\)/, "keyboard adjustments must still save");
assert.match(controllerSource, /if \(!cancelled\) commitDraft\(\)/, "pointer adjustments must still save on release");
assert.match(
  stylesheetSource,
  /\.frame-toast-position-editor \{[\s\S]*?grid-template-columns: minmax\(0, 300px\) minmax\(240px, 360px\);[\s\S]*?justify-content: center;/,
  "toast position editor must place its help to the right of the centered preview"
);
assert.match(
  stylesheetSource,
  /\.frame-toast-position-editor \{[\s\S]*?align-items: start;/,
  "desktop details must align toward the top of the preview"
);
assert.match(
  stylesheetSource,
  /\.frame-toast-position-details \{[\s\S]*?padding-top: 40px;/,
  "desktop details must keep a small top offset"
);
assert.match(
  controllerSource,
  /settingsBlock\("", "",[\s\S]*class: "frame-toast-position-preview-column" \},\s*preview\s*\),\s*el\("div", \{ class: "frame-toast-position-details" \}/,
  "the toast block must omit its top header and render all copy beside the preview"
);
assert.match(
  controllerSource,
  /class: "frame-toast-position-copy"[\s\S]*t\("appearance\.frameToastPosition"\)[\s\S]*t\("appearance\.frameToastPositionDesc"\)[\s\S]*class: "frame-toast-position-readout"/,
  "the title and description must render above the coordinate help in the right column"
);
assert.match(
  settingsKitSource,
  /title \|\| description\s*\? el\("div", \{ class: "ui-card-header settings-block-header" \}/,
  "settings blocks without title copy must not leave an empty header"
);
assert.match(
  stylesheetSource,
  /@media \(max-width: 900px\)[\s\S]*?\.frame-toast-position-editor \{\s*grid-template-columns: minmax\(0, 300px\);/,
  "narrow layouts must stack the help below the preview"
);
assert.match(
  stylesheetSource,
  /@media \(max-width: 900px\)[\s\S]*?\.frame-toast-position-details \{[\s\S]*?padding-top: 0;/,
  "stacked details must not retain the desktop top offset"
);

const storageContext = vm.createContext({ DEFAULT_FRAME_TOAST_POSITION: { x: 100, y: 100 } });
vm.runInContext(
  `${functionSource(storageSource, "plainObject")}\n${functionSource(storageSource, "boundedNumber")}\n${functionSource(storageSource, "normalizeFrameToastPosition")}\n`+
  "globalThis.__normalizeFrameToastPosition = normalizeFrameToastPosition;",
  storageContext,
  { filename: "shared/storage-schema.js" }
);
const normalize = (value) => JSON.parse(JSON.stringify(storageContext.__normalizeFrameToastPosition(value)));
for (const position of [
  { x: 0, y: 15 },
  { x: 50, y: 15 },
  { x: 50, y: 50 },
  { x: 100, y: 100 },
  { x: 37, y: 62 }
]) {
  assert.deepEqual(normalize(position), position, `stored position ${JSON.stringify(position)} must remain unchanged`);
}
assert.deepEqual(normalize({ x: -10, y: 140 }), { x: 0, y: 100 });
assert.deepEqual(normalize({}), { x: 100, y: 100 });

console.log("appearance layout regression: ok");
