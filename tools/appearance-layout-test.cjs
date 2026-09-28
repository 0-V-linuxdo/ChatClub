#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "app/settings/appearance.js"), "utf8");
const workspaceSource = fs.readFileSync(path.join(root, "app/settings/appearance-workspace.js"), "utf8");
const settingsKitSource = fs.readFileSync(path.join(root, "app/settings/kit.js"), "utf8");
const stylesheetSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");
const i18nSource = fs.readFileSync(path.join(root, "shared/i18n.js"), "utf8");
const storageSource = fs.readFileSync(path.join(root, "shared/storage-schema.js"), "utf8");
const topbarSource = fs.readFileSync(path.join(root, "app/settings/appearance-topbar.js"), "utf8");

const { functionSource } = require("./function-source.cjs");

assert.doesNotMatch(controllerSource, /frameToastPositionPreset|frame-toast-position-preset/, "position preset DOM must be removed");
assert.doesNotMatch(controllerSource, /frameToast(?:Top|Middle|Bottom|Center)/, "position preset definitions must be removed");
assert.doesNotMatch(stylesheetSource, /frame-toast-position-preset/, "position preset CSS must be removed");
assert.doesNotMatch(i18nSource, /appearance\.frameToast(?:Presets|Top|Middle|Bottom|Center)/, "position preset translations must be removed");
// Workspace is one page of two cards on the shared settings row. It used to be
// a General / Color / Overlays tab row nested under the Appearance tab row,
// with General split into two 1fr columns that stretched every select.
assert.doesNotMatch(controllerSource, /APPEARANCE_WORKSPACE_TAB_IDS|settingsAppearanceWorkspaceTab/);
assert.doesNotMatch(workspaceSource, /settingsInnerTabs|role: "tabpanel"|role: "tablist"/, "Workspace must not nest a tab row");
assert.match(
  workspaceSource,
  /const generalBlock[\s\S]*appearance\.themeMode[\s\S]*appearance\.primaryColor[\s\S]*appearance\.language[\s\S]*appearance\.maxColumns[\s\S]*appearance\.pocketIcon[\s\S]*appearance\.clickReorderButtons[\s\S]*const overlaysBlock/,
  "General owns theme, accent colour, language, columns, Pocket icon and click-reorder, in reading order"
);
assert.match(
  workspaceSource,
  /const generalBlock = settingsBlock\(t\("appearance\.workspaceGeneral"\), "",/,
  "General drops the subtitle that only listed the labels shown under it"
);
assert.match(
  workspaceSource,
  /settingsFieldRow\(t\("appearance\.primaryColor"\), colorControl, \{[\s\S]*?help: t\("appearance\.primaryColorHelp"\)/,
  "Color help sits under the Primary Color name, not under the hex field"
);
assert.doesNotMatch(controllerSource, /appearance-color-preview/, "Color pane must not keep a duplicate far-right preview orb");
assert.doesNotMatch(stylesheetSource, /appearance-color-preview/, "Color preview orb CSS must be removed");
assert.match(
  stylesheetSource,
  /\.appearance-color-control \{[\s\S]*?grid-template-columns: var\(--settings-control-height\) minmax\(0, 220px\);[\s\S]*?width:\s*max-content;/,
  "Color cluster hugs picker + capped hex"
);
assert.match(
  workspaceSource,
  /const overlaysBlock[\s\S]*appearance\.loadingOverlay"\), \[overlayToggleControl, overlayOpacityControl\][\s\S]*appearance\.modelSelectionOverlay"\),\s*\[selectionOverlayControls\.toggleControl, selectionOverlayControls\.opacityControl\][\s\S]*className: "appearance-overlays-model"/,
  "each overlay row keeps its switch beside the opacity it enables"
);
assert.match(
  workspaceSource,
  /const overlaysBlock[\s\S]*createAppearanceOverlayInfoButton\([\s\S]*"settings\.appearance\.loadingOverlay"[\s\S]*createAppearanceOverlayInfoButton\([\s\S]*"settings\.appearance\.modelSelectionOverlay"/,
  "overlay help folds into the ghost (i) beside each row name"
);
assert.doesNotMatch(controllerSource, /appearance-workspace-(?:layout|main|aside)/);
assert.doesNotMatch(stylesheetSource, /\.appearance-workspace-(?:layout|main|aside|subpane)|\.appearance-general-col/);
assert.doesNotMatch(workspaceSource, /is-rail-break/, "General grouping must not use hairline rail-break rows");

// The shared row: one label column, one control edge, intrinsic control widths.
assert.match(settingsKitSource, /function settingsFieldGrid\(/);
assert.match(settingsKitSource, /function settingsFieldRow\(label, control, \{/);
assert.match(
  stylesheetSource,
  /\.settings-field-grid \{[^}]*grid-template-columns: minmax\(11rem, 16rem\) minmax\(0, 1fr\);/,
  "the label column is bounded so controls sit beside their names, not on a far-right rail"
);
assert.match(
  stylesheetSource,
  /\.settings-field-row \{[^}]*grid-template-columns: subgrid;[^}]*border-top: 1px solid/s,
  "rows share both columns and separate with one hairline"
);
assert.match(
  stylesheetSource,
  /\.settings-field-control > \.select \{[^}]*width: 16rem;[^}]*max-width: 100%;/,
  "selects keep one intrinsic width instead of stretching across the well"
);
assert.match(
  stylesheetSource,
  /@media \(max-width: 760px\) \{\s*\.settings-field-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/,
  "narrow wells stack each name above its control"
);
assert.match(
  stylesheetSource,
  /\.appearance-toggle-control \{[^}]*grid-template-columns: minmax\(0, 52ch\) auto;[^}]*width: fit-content;/,
  "a toggle that carries its own copy keeps the switch right of that copy and hugs it"
);
assert.match(controllerSource, /frameLoadingOverlayEnabled: nextEnabled/);
assert.match(storageSource, /frameLoadingOverlayEnabled: typeof raw\.frameLoadingOverlayEnabled === "boolean"/);
assert.match(
  stylesheetSource,
  /\.appearance-range-control \{[\s\S]*?grid-template-columns: minmax\(0, 220px\) 48px;[\s\S]*?width:\s*max-content;/,
  "settings range controls hug a compact track instead of filling the well"
);
assert.match(
  stylesheetSource,
  /\.model-preference-segmented-info,\s*\n\.appearance-overlay-info \{[\s\S]*?border:\s*0/,
  "overlay help uses the ghost info trigger, not a ringed icon-button"
);
assert.doesNotMatch(workspaceSource, /class: "appearance-range-help"/, "overlay help must not remain a visible range-help line");
assert.doesNotMatch(
  topbarSource,
  /class: "appearance-range-help"|field\(t\("topbar\.input\.fontSize"\)/,
  "topbar input font-size must not stack field() copy or a visible range-help line"
);
assert.match(
  topbarSource,
  /settingsFieldRow\(t\("topbar\.input\.fontSize"\),[\s\S]*?appearance-range-control[\s\S]*?createAppearanceOverlayInfoButton\([\s\S]*?"settings\.appearance\.topbarInputFontSize"/,
  "topbar input font-size is a settings row: name + ghost info | compact slider"
);
assert.match(
  topbarSource,
  /topbar-prompt-input-placement[\s\S]*queueAppearanceAutoSave\(\{ composerPlacement:/,
  "topbar input placement is a native select in the Input card"
);
assert.doesNotMatch(stylesheetSource, /\.topbar-prompt-input-settings|\.appearance-range-help|\.appearance-overlays-child/);
assert.match(controllerSource, /state\.settingsAppearancePrimaryColorDraft \|\| state\.options\.primaryColor/);
assert.match(controllerSource, /state\.settingsAppearancePrimaryColorDraft = primaryColorDraft = normalized/);
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
  /\.frame-toast-position-editor \{[\s\S]*?grid-template-areas:\s*"preview stay"\s*"preview details";/,
  "desktop Site Toast must keep the preview left of duration and position copy"
);
assert.match(
  stylesheetSource,
  /\.frame-toast-position-editor \{[\s\S]*?align-items: start;/,
  "desktop details must align toward the top of the preview"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.frame-toast-position-details \{[\s\S]*?padding-top: 40px;/,
  "desktop details must not keep the old 40px top offset"
);
assert.match(
  stylesheetSource,
  /\.frame-toast-position-details \{[\s\S]*?align-content: start;[\s\S]*?padding-top: var\(--space-3\);/,
  "details must top-align with a compact hairline gap"
);
assert.match(
  controllerSource,
  /return el\("div", \{ class: "appearance-frame-toast-pane" \},\s*settingsBlock\("", "",/,
  "Site Toast must use one untitled settingsBlock"
);
assert.doesNotMatch(
  controllerSource,
  /settingsBlock\(t\("appearance\.toastStay"\), t\("appearance\.toastStayDesc"\), toastStay\)/,
  "duration must not be a separate stretched settingsBlock"
);
assert.match(
  controllerSource,
  /class: "appearance-toast-stay-row"[\s\S]*t\("appearance\.toastStay"\)[\s\S]*t\("appearance\.toastStayDesc"\)[\s\S]*toastStay/,
  "duration hug row must keep title, help, and the native select"
);
assert.match(
  controllerSource,
  /class: "frame-toast-position-editor"[\s\S]*class: "appearance-toast-stay-row"[\s\S]*class: "frame-toast-position-preview-column"[\s\S]*class: "frame-toast-position-details"/,
  "duration, preview, and position copy must be siblings in the editor grid"
);
assert.match(
  controllerSource,
  /class: "frame-toast-position-copy"[\s\S]*t\("appearance\.frameToastPosition"\)[\s\S]*t\("appearance\.frameToastPositionDesc"\)[\s\S]*class: "frame-toast-position-readout"/,
  "the title and description must render above the coordinate help in the right column"
);
assert.match(
  stylesheetSource,
  /\.appearance-toast-stay-row > \.select \{[\s\S]*?width: max-content;[\s\S]*?max-width: 22ch;/,
  "duration select must hug instead of stretching 1fr"
);
assert.doesNotMatch(
  stylesheetSource.match(/\.appearance-toast-stay-row > \.select \{[\s\S]*?\n\}/)?.[0] || "",
  /width:\s*100%/,
  "duration select must not inherit the full-bleed select width"
);
assert.match(
  settingsKitSource,
  /title \|\| description\s*\? el\("div", \{ class: "ui-card-header settings-block-header" \}/,
  "settings blocks without title copy must not leave an empty header"
);
assert.match(
  stylesheetSource,
  /@media \(max-width: 900px\)[\s\S]*?\.frame-toast-position-editor \{\s*grid-template-columns: minmax\(0, 300px\);\s*grid-template-areas:\s*"stay"\s*"preview"\s*"details";/,
  "narrow layouts must paint duration first, then preview, then position copy"
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
