#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

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
    this.children.push(...children);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.({ currentTarget: this, target: this, ...event });
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  click() {
    this.dispatch("click");
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
  const { createAppearanceWorkspacePane } = await import(
    pathToFileURL(path.join(root, "app/settings/appearance-workspace.js")).href
  );
  const controls = {
    colorControl: token("color"),
    columnCount: token("columns"),
    language: token("language"),
    overlayOpacityControl: token("loading-overlay"),
    selectionOverlayControls: {
      toggleControl: token("model-overlay-toggle"),
      opacityControl: token("model-overlay-opacity")
    },
    themeMode: token("theme")
  };
  const settingsBlock = (title, description, ...children) => {
    const block = new FakeNode("section");
    block.dataset.title = title;
    block.dataset.description = description;
    block.append(...children);
    return block;
  };
  const settingsInnerTabs = (tabs, activeId, onSelect) => {
    const tablist = new FakeNode("div");
    tablist.setAttribute("role", "tablist");
    for (const [id] of tabs) {
      const button = new FakeNode("button");
      button.dataset.id = id;
      button.setAttribute("aria-selected", String(id === activeId));
      button.addEventListener("click", () => onSelect(id));
      tablist.append(button);
    }
    return tablist;
  };
  const expectedTokens = {
    general: ["theme", "language", "columns"],
    color: ["color"],
    overlays: ["loading-overlay", "model-overlay-toggle", "model-overlay-opacity"]
  };

  for (const activeId of Object.keys(expectedTokens)) {
    const selected = [];
    const pane = createAppearanceWorkspacePane({
      activeId,
      ...controls,
      onSelect: (id) => selected.push(id),
      settingsBlock,
      settingsInnerTabs
    });
    const [tablist, panel] = pane.children;
    assert.equal(tablist.attributes.role, "tablist");
    assert.equal(tablist.attributes["aria-label"], "Workspace settings");
    assert.deepEqual(tablist.children.map((tab) => tab.dataset.appearanceWorkspaceTabId), [
      "general", "color", "overlays"
    ]);
    assert.deepEqual(tablist.children.map((tab) => tab.attributes.tabindex), [
      activeId === "general" ? "0" : "-1",
      activeId === "color" ? "0" : "-1",
      activeId === "overlays" ? "0" : "-1"
    ]);
    assert.ok(tablist.children.every((tab) => tab.attributes["aria-controls"] === "appearance-workspace-panel"));
    assert.equal(panel.attributes.role, "tabpanel");
    assert.equal(panel.attributes["aria-labelledby"], `appearance-workspace-tab-${activeId}`);
    assert.equal(panel.attributes.tabindex, "0");
    assert.match(panel.className, new RegExp(`\\bis-${activeId}\\b`));
    assert.deepEqual(
      descendants(panel).map((node) => node.dataset.token).filter(Boolean),
      expectedTokens[activeId]
    );
    const nextId = activeId === "general" ? "color" : "general";
    tablist.children.find((button) => button.dataset.id === nextId).click();
    assert.deepEqual(selected, [nextId]);
    selected.length = 0;
    let prevented = false;
    const activeIndex = ["general", "color", "overlays"].indexOf(activeId);
    tablist.children[activeIndex].dispatch("keydown", {
      key: "ArrowRight",
      preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.deepEqual(selected, [["color", "overlays", "general"][activeIndex]]);
  }

  console.log("appearance workspace subtabs: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
