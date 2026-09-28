#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

class FakeNode {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.children = [];
    this.attributes = Object.create(null);
    this.className = "";
    this.dataset = Object.create(null);
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children.flat(Infinity).filter(Boolean));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (text) => {
    const node = new FakeNode("#text");
    node.textContent = String(text);
    return node;
  }
};

const token = (name) => {
  const node = new FakeNode("control");
  node.dataset.token = name;
  return node;
};
const descendants = (node) => [node, ...node.children.flatMap(descendants)];

(async () => {
  const { APPEARANCE_WORKSPACE_FIELD_IDS: ids, createAppearanceWorkspacePane } = await import(
    pathToFileURL(path.join(root, "app/settings/appearance-workspace.js")).href
  );
  const settingsBlock = (title, description, ...children) => {
    const block = new FakeNode("section");
    block.dataset.title = title;
    block.dataset.description = description;
    block.append(...children);
    return block;
  };
  const settingsFieldGrid = (...rows) => {
    const grid = new FakeNode("div");
    grid.dataset.grid = "true";
    grid.append(...rows);
    return grid;
  };
  const settingsFieldRow = (label, control, options = {}) => {
    const row = new FakeNode("div");
    row.dataset.label = label;
    row.dataset.for = options.htmlFor || "";
    row.dataset.help = options.help || "";
    row.dataset.helpId = options.helpId || "";
    row.info = options.info || null;
    row.append(options.info, control);
    return row;
  };
  const pane = createAppearanceWorkspacePane({
    colorControl: token("color"),
    columnCount: token("columns"),
    language: token("language"),
    overlayOpacityControl: token("loading-overlay"),
    overlayToggleControl: token("loading-overlay-toggle"),
    pocketIconControl: token("pocket-icon"),
    clickReorderControl: token("click-reorder"),
    selectionOverlayControls: {
      toggleControl: token("model-overlay-toggle"),
      opacityControl: token("model-overlay-opacity")
    },
    settingsBlock,
    settingsFieldGrid,
    settingsFieldRow,
    svgIcon: () => new FakeNode("svg"),
    themeMode: token("theme")
  });

  // Workspace is one page of two cards. The General / Color / Overlays row it
  // replaced was a third tab row under Appearance's own under the sidebar.
  assert.match(pane.className, /\bappearance-workspace-pane\b/);
  assert.ok(
    descendants(pane).every((node) => node.attributes.role !== "tablist" && node.attributes.role !== "tabpanel"),
    "Workspace must not nest a tab row under the Appearance tab row"
  );
  const [general, overlays] = pane.children;
  assert.equal(pane.children.length, 2);
  assert.deepEqual([general.dataset.title, overlays.dataset.title], ["General", "Overlays"]);
  assert.deepEqual(
    [general.dataset.description, overlays.dataset.description],
    ["", ""],
    "a card must not repeat a description that only lists the labels shown right under it"
  );

  const tokens = (node) => descendants(node).map((child) => child.dataset.token).filter(Boolean);
  assert.deepEqual(tokens(general), ["theme", "color", "language", "columns", "pocket-icon", "click-reorder"]);
  assert.deepEqual(tokens(overlays), [
    "loading-overlay-toggle", "loading-overlay", "model-overlay-toggle", "model-overlay-opacity"
  ]);

  // Every row names its control: a <label for> where the control is one field,
  // a help id that the control's aria-describedby points at otherwise.
  const rows = (block) => descendants(block).filter((node) => "label" in node.dataset);
  assert.deepEqual(rows(general).map((row) => [row.dataset.label, row.dataset.for]), [
    ["Theme Mode", ids.themeMode],
    ["Primary Color", ids.primaryColor],
    ["Language", ids.language],
    ["Maximum Columns", ids.columnCount],
    ["Pocket icon", ""],
    ["Show Move up / Move down", ids.clickReorder]
  ]);
  assert.deepEqual(
    rows(general).filter((row) => row.dataset.help).map((row) => row.dataset.helpId),
    [ids.primaryColorHelp, ids.pocketIconHelp, ids.clickReorderHelp]
  );
  assert.deepEqual(rows(overlays).map((row) => row.dataset.for), [ids.loadingOverlay, ids.modelSelectionOverlay]);
  assert.deepEqual(
    rows(overlays).map((row) => row.info?.attributes["data-tooltip-id"]),
    ["settings.appearance.loadingOverlay", "settings.appearance.modelSelectionOverlay"],
    "overlay help stays on the ghost (i) beside the row name"
  );

  // The ids are shared with the controls appearance.js builds.
  const appearance = read("app/settings/appearance.js");
  for (const key of ["themeMode", "language", "columnCount", "primaryColor", "clickReorder", "loadingOverlay"]) {
    assert.match(appearance, new RegExp(`id: fieldIds\\.${key},`), `${key} control must carry the id its row labels`);
  }
  assert.match(appearance, /"aria-describedby": fieldIds\.pocketIconHelp/);

  // No Appearance pane nests a second tab row, and the shared row is
  // single-line: descriptions under every label were clipped and then
  // repeated by the card the tab opened.
  const topbar = read("app/settings/appearance-topbar.js");
  const tabGroup = read("app/settings/appearance-tab-group.js");
  const kit = read("app/settings/kit.js");
  const css = read("styles/chatclub.css");
  for (const [name, source] of [["Top Bar", topbar], ["Tab Group", tabGroup]]) {
    assert.doesNotMatch(source, /settingsInnerTabs\(/, `${name} must stack its cards instead of nesting tabs`);
  }
  assert.doesNotMatch(kit, /description \? el\("span"/, "inner tabs must not render a clipped description line");
  assert.match(css, /\.settings-inner-tabs \{[^}]*display: inline-flex;[^}]*width: fit-content;/s);
  assert.doesNotMatch(css, /\.appearance-[\w-]+ > (?:\.settings-pane > )?\.settings-inner-tabs/, "no pane may restretch the tab row");
  assert.doesNotMatch(css, /\.appearance-workspace-subpane|\.appearance-general-col/, "the old Workspace subtabs stay deleted");
  assert.match(css, /\.settings-field-row \{[^}]*grid-template-columns: subgrid;/s);
  assert.match(css, /\.settings-field-control > \.select \{[^}]*width: 16rem;/s);

  // Stacking the boards puts two boards with the same row and zone classes on
  // one page, so every drag selector is scoped to its own board.
  for (const kind of ["contextMenu", "tabsSidebar"]) {
    assert.match(tabGroup, new RegExp(`if \\(kind === "${kind}"\\) \\{[\\s\\S]*?rowSelector: \`[^\`]*\\$\\{boardScope\\(kind\\)\\}\``));
  }
  assert.match(tabGroup, /rowSelector: `\.tab-group-button-placement-row\$\{boardScope\("tabGroup"\)\}`/);
  assert.match(tabGroup, /dataset: \{ buttonId: item\.id, dragKind: kind \}/);
  assert.match(tabGroup, /"data-drag-kind": kind/);

  const statePorts = read("app/settings/state-ports.js");
  const schema = read("app/state/schema.js");
  for (const key of ["settingsAppearanceWorkspaceTab", "settingsAppearanceTopbarTab", "settingsTabGroupTab"]) {
    assert.ok(!statePorts.includes(key) && !schema.includes(key), `${key} selected a nested tab that no longer exists`);
  }

  console.log("appearance workspace layout: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
