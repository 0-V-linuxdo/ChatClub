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

const { functionSource } = require("./function-source.cjs");

assert.doesNotMatch(controllerSource, /frameToastPositionPreset|frame-toast-position-preset/, "position preset DOM must be removed");
assert.doesNotMatch(controllerSource, /frameToast(?:Top|Middle|Bottom|Center)/, "position preset definitions must be removed");
assert.doesNotMatch(stylesheetSource, /frame-toast-position-preset/, "position preset CSS must be removed");
assert.doesNotMatch(i18nSource, /appearance\.frameToast(?:Presets|Top|Middle|Bottom|Center)/, "position preset translations must be removed");
assert.match(controllerSource, /APPEARANCE_WORKSPACE_TAB_IDS\.includes\(state\.settingsAppearanceWorkspaceTab\)/);
assert.match(controllerSource, /activeId: state\.settingsAppearanceWorkspaceTab/);
assert.match(controllerSource, /onSelect: \(id\) => \{\s*state\.settingsAppearanceWorkspaceTab = id;\s*redraw\(\);/);
assert.doesNotMatch(
  functionSource(controllerSource, "reset"),
  /settingsAppearanceWorkspaceTab/,
  "closing and reopening Settings must preserve the selected workspace subtab"
);
assert.match(workspaceSource, /Object\.freeze\(\["general", "color", "overlays"\]\)/);
assert.match(workspaceSource, /tabs\.setAttribute\("aria-label", t\("appearance\.workspaceTabsLabel"\)\)/);
assert.match(workspaceSource, /role: "tabpanel"/);
assert.match(
  workspaceSource,
  /const generalBlock[\s\S]*appearance\.themeMode[\s\S]*appearance\.language[\s\S]*appearance\.maxColumns/,
  "general workspace tab must own theme, language, and column controls"
);
assert.match(
  workspaceSource,
  /const colorBlock[\s\S]*appearance\.primaryColor[\s\S]*const overlaysBlock/,
  "color workspace tab must own the primary color control"
);
assert.match(
  workspaceSource,
  /const overlaysBlock[\s\S]*appearance\.loadingOverlay[\s\S]*selectionOverlayControls\.toggleControl[\s\S]*appearance\.modelSelectionOverlayOpacity/,
  "overlay workspace tab must own both loading and model-selection controls"
);
assert.doesNotMatch(controllerSource, /appearance-workspace-(?:layout|main|aside)/);
assert.doesNotMatch(stylesheetSource, /\.appearance-workspace-(?:layout|main|aside)/);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-pane > \.settings-inner-tabs \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  "workspace subtabs must have three stable tracks"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-pane > \.settings-inner-tabs \{[\s\S]*?width: fit-content;[\s\S]*?max-width: 100%;/,
  "workspace subtabs must size to their content"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-pane > \.settings-inner-tabs \{[\s\S]*?justify-self: start;/,
  "workspace subtabs must align to the left edge"
);
assert.match(
  stylesheetSource,
  /\.appearance-tab-group-pane > \.settings-inner-tabs \{[\s\S]*?width: fit-content;[\s\S]*?max-width: 100%;/,
  "Tab Group subtabs must size to their content"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-field-list \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/,
  "General fields must split into a left/right two-column track"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-general-col \{[\s\S]*?grid-template-rows:\s*subgrid;[\s\S]*?grid-row:\s*1\s*\/\s*span\s*3;/,
  "General columns must share Theme|Pocket, Language|click-reorder, Columns|_ rows"
);
assert.match(
  stylesheetSource,
  /\.appearance-toggle-control \{[^}]*grid-template-columns: minmax\(0, 52ch\) auto;[^}]*width: fit-content;/,
  "overlay click-reorder switch stays to the right of its copy and hugs that copy"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-toggle-control \{[\s\S]*?grid-template-rows:\s*auto var\(--settings-control-height\);[\s\S]*?row-gap:\s*6px;/,
  "General help and checkbox share the 36px control row used by Language"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-toggle-copy small \{[\s\S]*?height:\s*var\(--settings-control-height\);/,
  "General help text is the same height as the left select"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-toggle-control \{[\s\S]*?width:\s*max-content;/,
  "General click-reorder hugs the help and checkbox instead of filling the well"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-toggle-control \{[^}]*(?<![-\w])width:\s*100%/,
  "General click-reorder must not stretch the checkbox to the far edge of the well"
);
assert.match(
  workspaceSource,
  /class: "appearance-general-col"[\s\S]*generalCol\(\s*appearanceRow\(field\(t\("appearance\.themeMode"\)[\s\S]*appearance\.language[\s\S]*appearance\.maxColumns[\s\S]*generalCol\(\s*appearanceRow\(pocketIconControl\)[\s\S]*clickReorderControl/,
  "General left column owns theme/language/columns; right column owns Pocket and click-reorder"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-general \.appearance-field-list \{[\s\S]*?width: min\(100%, 32rem\)/,
  "General must not keep the rejected 32rem stacked column"
);
assert.doesNotMatch(
  stylesheetSource,
  /\.appearance-workspace-subpane[\s\S]{0,200}\.select \{[\s\S]*?max-width: 36ch/,
  "General selects must not use the rejected 36ch right-rail cap"
);
assert.doesNotMatch(
  workspaceSource,
  /is-rail-break/,
  "General grouping must not use hairline rail-break rows"
);
assert.match(
  stylesheetSource,
  /@container \(max-width: 560px\)[\s\S]*?\.appearance-workspace-subpane\.is-general \.appearance-field-list \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  "narrow General wells must stack the two columns"
);
assert.match(
  workspaceSource,
  /class: "appearance-overlays-model"[\s\S]*selectionOverlayControls\.toggleControl[\s\S]*appearance\.modelSelectionOverlayOpacity/,
  "model auto-selection groups the toggle with its child opacity row"
);
assert.match(
  workspaceSource,
  /appearance-overlay-row[\s\S]*appearance-overlay-copy[\s\S]*createAppearanceOverlayInfoButton/,
  "overlay range rows put title and a compact info trigger beside a compact slider"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-overlays \.appearance-overlay-row \{[\s\S]*?width:\s*max-content;/,
  "overlay rows hug copy instead of pinning controls to the far edge"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-overlays \.appearance-range-control \{[\s\S]*?grid-template-columns: minmax\(0, 220px\) 48px;[\s\S]*?width:\s*max-content;/,
  "overlay sliders hug a compact track instead of filling the well"
);
assert.match(
  stylesheetSource,
  /\.iframe-permission-help-trigger,\s*\n\.appearance-overlay-info \{[\s\S]*?border-radius:\s*var\(--ui-radius-pill\)/,
  "overlay help uses the circular info trigger, not a second line of copy"
);
assert.doesNotMatch(
  workspaceSource,
  /class: "appearance-range-help"/,
  "overlay help must not remain a visible range-help line"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-overlays \.appearance-overlays-model \{[\s\S]*?border-top:/,
  "Loading and Model groups share one hairline, not a second settingsBlock"
);
assert.match(
  stylesheetSource,
  /\.appearance-workspace-subpane\.is-overlays \.appearance-overlays-child \{[\s\S]*?padding-inline-start:/,
  "model opacity is a child of the auto-selection toggle"
);
assert.match(
  stylesheetSource,
  /@media \(max-width: 620px\)[\s\S]*?\.appearance-workspace-pane > \.settings-inner-tabs \{\s*grid-template-columns: 1fr;[\s\S]*?\.appearance-workspace-pane \.settings-inner-tab span \{[\s\S]*?white-space: normal;/,
  "narrow workspace tabs must stack without truncating their labels"
);
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
  controllerSource,
  /appearance\.toastStayShort[\s\S]*t\("appearance\.toastStay"\), t\("appearance\.toastStayDesc"\)/,
  "Site Toast pane must expose duration before the position editor"
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
