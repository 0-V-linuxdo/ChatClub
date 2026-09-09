#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const iconEditor = read("app/settings/app-icon.js");
const stylesheet = read("styles/chatclub.css");
const openEditor = functionSource(iconEditor, "openEditor");

assert.match(iconEditor, /from "\.\.\/\.\.\/ui\/dom\.js"/);
assert.doesNotMatch(
  iconEditor,
  /import \{[^}]*\bfield\b[^}]*\} from "\.\.\/\.\.\/ui\/dom\.js"/,
  "site icon editor must stop using the stacked field() helper"
);
assert.match(openEditor, /editorModal\(\s*t\("apps\.iconEditorTitle"/);
assert.match(openEditor, /class: "settings-editor-form settings-icon-editor"/);
assert.match(openEditor, /settings-editor-modal", "settings-icon-editor-modal"/);
assert.match(openEditor, /class: "settings-icon-editor-layout"/);
assert.match(openEditor, /class: "settings-icon-editor-preview"/);
assert.match(openEditor, /class: "settings-icon-editor-sources"/);
assert.match(openEditor, /class: "settings-icon-editor-url-head"/);
assert.match(openEditor, /class: "settings-icon-editor-help tooltip-trigger"/);
assert.match(openEditor, /"data-tooltip-wrap": "true"/);
assert.match(openEditor, /createSvgIcon\("help"\)/);
assert.match(openEditor, /t\("apps\.iconHelp"\)/);
assert.match(openEditor, /class: "settings-icon-editor-url"/);
assert.match(openEditor, /t\("apps\.iconPreview"\)/);
assert.match(openEditor, /t\("apps\.iconUrl"\)/);
assert.match(openEditor, /class: "settings-icon-editor-actions"/);
assert.match(openEditor, /class: "settings-icon-editor-upload"/);
assert.match(openEditor, /class: "settings-icon-editor-tools"/);
assert.match(openEditor, /createSvgIcon\("upload"\)/);
assert.match(openEditor, /t\("apps\.iconUpload"\)/);
assert.match(openEditor, /createSvgIcon\("refreshCw"\)/);
assert.match(openEditor, /t\("apps\.iconRefresh"\)/);
assert.match(openEditor, /createSvgIcon\("undo2"\)/);
assert.match(openEditor, /t\("apps\.iconRestore"\)/);
assert.doesNotMatch(openEditor, /iconButton\(/);
assert.doesNotMatch(openEditor, /createSvgIcon\("reload"\)/);
assert.doesNotMatch(openEditor, /createSvgIcon\("reset"\)/);
assert.doesNotMatch(openEditor, /button\(\s*t\("apps\.iconUpload"/);
assert.doesNotMatch(openEditor, /button\(\s*t\("apps\.iconRefresh"/);
assert.doesNotMatch(openEditor, /button\(\s*t\("apps\.iconRestore"/);
assert.match(openEditor, /t\("common\.cancel"\)/);
assert.match(openEditor, /t\("common\.save"\)/);

assert.doesNotMatch(
  openEditor,
  /field\(\s*t\("apps\.iconPreview"/,
  "Preview must not be a stacked field() row"
);
assert.doesNotMatch(
  openEditor,
  /field\(\s*t\("apps\.iconUrl"/,
  "Image URL must not be a stacked field() row"
);
assert.doesNotMatch(
  openEditor,
  /field\(\s*t\("apps\.iconUpload"/,
  "Upload must not be a stacked field() row"
);
assert.doesNotMatch(openEditor, /class: "field"/);
assert.doesNotMatch(openEditor, /el\("p", \{\s*class: "settings-icon-editor-help"/);
assert.doesNotMatch(openEditor, /appearance-overlay-info/);
assert.doesNotMatch(openEditor, /settings-icon-help"/);
assert.doesNotMatch(openEditor, /settings-icon-advanced-body/);
assert.doesNotMatch(openEditor, /settings-icon-source-row/);
assert.doesNotMatch(openEditor, /settings-icon-field-actions/);
assert.doesNotMatch(openEditor, /api-profile-icon-editor/);
assert.doesNotMatch(openEditor, /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color|appearance-toast-stay-row|appearance-color-row/);
assert.doesNotMatch(openEditor, /<dialog|dialog\(/);
assert.doesNotMatch(openEditor, /dropzone|cropper/i);

assert.match(
  openEditor,
  /class: "settings-file-input"/,
  "native file input stays in the DOM behind a compact button"
);
assert.match(
  openEditor,
  /accept: "image\/png,image\/jpeg,image\/webp,image\/svg\+xml,image\/x-icon,\.ico"/
);
assert.match(openEditor, /fileInput\.click\(\)/);
assert.doesNotMatch(
  openEditor,
  /el\("input", \{ class: "input", type: "file"/,
  "file input must not use the stretched .input field skin"
);

const footer = openEditor.match(/class: "modal-footer"[\s\S]*?\n\s*\)\s*,\s*\n\s*close,/);
assert.ok(footer, "openEditor must still hoist a modal-footer");
assert.match(footer[0], /t\("common\.cancel"\)/);
assert.match(footer[0], /t\("common\.save"\)/);
assert.doesNotMatch(footer[0], /apps\.iconRefresh/);
assert.doesNotMatch(footer[0], /apps\.iconRestore/);
assert.match(
  openEditor,
  /class: "settings-icon-editor-tools"[\s\S]*apps\.iconRefresh[\s\S]*apps\.iconRestore/,
  "Refresh and Restore live in the source stack, not the dialog footer"
);

assert.match(openEditor, /fileInput\.files\?\.\[0\][\s\S]*saveUpload[\s\S]*saveUrl/);
assert.match(openEditor, /faviconPort\.refresh/);
assert.match(openEditor, /faviconPort\.encodeFile/);
assert.match(openEditor, /srcType: "data"/);
assert.doesNotMatch(
  openEditor,
  /urlInput\.addEventListener\("input"/,
  "this turn must not add live URL preview"
);

assert.match(
  stylesheet,
  /\.settings-editor-modal\.settings-icon-editor-modal \{[^}]*width:\s*min\(480px/,
  "site icon modal uses a compact width override"
);
assert.doesNotMatch(
  stylesheet,
  /\.settings-editor-modal\.settings-icon-editor-modal \{[^}]*min\(680px/,
  "site icon modal must not inherit the 680px editor width"
);
assert.match(
  stylesheet,
  /\.settings-icon-editor-layout \{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/s
);
assert.match(
  stylesheet,
  /@media \(max-width: 480px\) \{[^}]*\.settings-icon-editor-layout \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
);
assert.match(stylesheet, /\.settings-icon-editor \.settings-icon-preview \{[^}]*width:\s*72px/s);
assert.match(stylesheet, /\.settings-icon-editor-url \.input \{[^}]*max-width:\s*100%/s);
assert.match(stylesheet, /\.settings-icon-editor-url-head \{[^}]*display:\s*flex/s);
assert.match(stylesheet, /\.settings-icon-editor-help \{[^}]*cursor:\s*help/s);
assert.match(stylesheet, /\.settings-icon-editor-actions \{[^}]*display:\s*flex/s);
assert.match(stylesheet, /\.settings-icon-editor-tools \{[^}]*display:\s*flex/s);
assert.doesNotMatch(stylesheet, /\.settings-icon-editor-tools \{[^}]*justify-content:\s*flex-end/);
assert.doesNotMatch(stylesheet, /\.settings-icon-editor-tool \{/);
assert.match(stylesheet, /\.settings-icon-editor-action \{[^}]*display:\s*inline-flex/s);
assert.match(stylesheet, /\.settings-file-input \{[^}]*width:\s*1px !important/s);
assert.doesNotMatch(
  stylesheet,
  /\.settings-icon-editor-upload input\[type="file"\] \{[^}]*width:\s*100%/
);

const editorCss = stylesheet.match(
  /\.settings-icon-editor-layout \{[\s\S]*?@media \(max-width: 480px\) \{[\s\S]*?\.settings-icon-editor-layout \{[\s\S]*?\}\s*\}/
);
assert.ok(editorCss, "site icon editor layout CSS must be co-located");
assert.doesNotMatch(editorCss[0], /preference-row|model-preference-row|appearance-overlay-row|appearance-general-col|is-color|appearance-toast-stay-row|appearance-color-row|appearance-overlay-info|settings-icon-advanced-body|settings-icon-source-row/);

const icons = read("ui/icons.js");
assert.match(icons, /help:\s*\[/);
assert.match(icons, /help:[\s\S]*cx: "12", cy: "12", r: "10"/);
assert.match(icons, /refreshCw:\s*\[/);
assert.match(icons, /undo2:\s*\[/);
assert.match(icons, /upload:\s*\[/);
assert.match(icons, /reload:\s*\{/);
assert.match(icons, /reset:\s*\{/);
assert.match(iconEditor, /from "\.\.\/\.\.\/ui\/icons\.js"/);
assert.doesNotMatch(iconEditor, /iconButton/);

console.log("app icon editor layout: ok");
