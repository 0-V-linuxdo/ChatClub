#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function constSource(source, name) {
  const start = source.search(new RegExp(`const ${name} = (?:async )?\\(\\) => \\{`));
  if (start < 0) throw new Error(`${name} must exist`);
  let braces = 0;
  let quote = "";
  let escaped = false;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") braces += 1;
    else if (character === "}" && --braces === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} body did not close`);
}

const profiles = read("app/settings/profiles.js");
const stylesheet = read("styles/chatclub.css");
const openEditor = functionSource(profiles, "openEditor");
const openIconEditor = constSource(openEditor, "openIconEditor");

assert.match(openIconEditor, /editorModal\(\s*\n\s*t\("apps\.icon"/);
assert.match(openIconEditor, /class: "settings-editor-form settings-icon-editor api-profile-icon-editor"/);
assert.match(openIconEditor, /settings-editor-modal", "api-profile-icon-editor-modal"/);
assert.match(openIconEditor, /class: "settings-icon-editor-layout"/);
assert.match(openIconEditor, /class: "settings-icon-editor-preview"/);
assert.match(openIconEditor, /class: "settings-icon-editor-sources"/);
assert.match(openIconEditor, /class: "settings-icon-editor-help"/);
assert.match(openIconEditor, /t\("apps\.iconHelp"\)/);
assert.match(openIconEditor, /t\("apps\.iconPreview"\)/);
assert.match(openIconEditor, /class: "settings-icon-editor-url"/);
assert.match(openIconEditor, /t\("apps\.iconUrl"\)/);
assert.match(openIconEditor, /class: "settings-icon-editor-upload"/);
assert.match(openIconEditor, /t\("apps\.iconUpload"\)/);
assert.match(openIconEditor, /class: "settings-icon-editor-tools"/);
assert.match(openIconEditor, /t\("apps\.iconRefresh"\)/);
assert.match(openIconEditor, /t\("apps\.iconRestore"\)/);
assert.match(openIconEditor, /iconPreview/);
assert.match(openIconEditor, /logoInput/);
assert.match(openIconEditor, /fileInput/);

assert.doesNotMatch(openIconEditor, /settings-icon-advanced-body/);
assert.doesNotMatch(openIconEditor, /settings-icon-source-row/);
assert.doesNotMatch(openIconEditor, /settings-icon-field-actions/);
assert.doesNotMatch(openIconEditor, /settings-icon-help"/);
assert.doesNotMatch(openIconEditor, /class: "field"/);
assert.doesNotMatch(openIconEditor, /field\(/);
assert.doesNotMatch(openIconEditor, /settings-icon-editor-modal/);
assert.doesNotMatch(openIconEditor, /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color|appearance-toast-stay-row|appearance-color-row/);
assert.doesNotMatch(openIconEditor, /<dialog|dropzone|cropper/i);

assert.match(openEditor, /class: "settings-file-input"/);
assert.match(
  openEditor,
  /accept: "image\/png,image\/jpeg,image\/webp,image\/svg\+xml,image\/x-icon,\.ico"/
);
assert.match(openIconEditor, /fileInput\.click\(\)/);
assert.doesNotMatch(
  openEditor,
  /el\("input", \{ class: "input", type: "file"/,
  "file input must not use the stretched .input field skin"
);

const footer = openIconEditor.match(/class: "modal-footer"[\s\S]*?\n\s*\)\s*,\s*\n\s*closeNested,/);
assert.ok(footer, "provider icon editor must still hoist a modal-footer");
assert.match(footer[0], /t\("common\.close"\)/);
assert.doesNotMatch(footer[0], /common\.save/);
assert.doesNotMatch(footer[0], /common\.cancel/);
assert.doesNotMatch(footer[0], /apps\.iconRefresh/);
assert.doesNotMatch(footer[0], /apps\.iconRestore/);
assert.match(
  openIconEditor,
  /class: "settings-icon-editor-tools"[\s\S]*apps\.iconRefresh[\s\S]*apps\.iconRestore/,
  "Refresh and Restore live in the source stack, not the dialog footer"
);

assert.match(openEditor, /logoInput\.addEventListener\("input"/);
assert.match(openEditor, /fileInput\.addEventListener\("change"/);
assert.match(openEditor, /faviconPort\?\.encodeFile/);
assert.match(openEditor, /faviconPort\?\.refresh/);
assert.match(openEditor, /iconPreview\.replaceChildren\(profileMark/);
assert.match(openEditor, /identityMark\.replaceChildren\(profileMark/);
assert.match(openEditor, /syncSave\(\)/);

assert.match(
  stylesheet,
  /\.settings-editor-modal\.api-profile-icon-editor-modal \{[^}]*width:\s*min\(480px/,
  "provider icon modal uses a compact width override"
);
assert.doesNotMatch(
  stylesheet,
  /\.settings-editor-modal\.api-profile-icon-editor-modal \{[^}]*overlay-width(?!-)/,
  "provider icon modal must not inherit the 720px overlay width"
);
assert.match(
  stylesheet,
  /\.settings-icon-editor \.settings-icon-preview \.settings-site-icon \{[^}]*width:\s*48px/s
);
assert.doesNotMatch(stylesheet, /\.settings-icon-advanced-body \{/);
assert.doesNotMatch(stylesheet, /\.settings-icon-source-row \{/);
assert.doesNotMatch(stylesheet, /\.settings-icon-field-actions \{/);

console.log("api profile icon editor layout: ok");
