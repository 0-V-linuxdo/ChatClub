#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

const { functionSource } = require("./function-source.cjs");
const panelSource = read("app/composer/search-panel.js");
const composer = read("app/composer/controller.js");
const runtime = read("app/runtime.js");
const css = read("styles/chatclub.css");
const agents = read("AGENTS.md");
const i18n = read("shared/i18n.js");

assert.doesNotMatch(panelSource, /from "\.\.\/workspace\//, "composer search must not import workspace-domain modules");
assert.doesNotMatch(panelSource, /viewerModal|editorModal|confirmationModal|taskModal/);
assert.doesNotMatch(panelSource, /class: ["'`]modal/);
assert.doesNotMatch(panelSource, /transform:/);
assert.match(panelSource, /overlay-surface/);
assert.match(panelSource, /prompt-shell-search/);
assert.match(panelSource, /setAttribute\("role", "combobox"\)/);
assert.match(panelSource, /role: "listbox"/);
assert.match(panelSource, /event\.key === "Escape"/);
assert.match(panelSource, /event\.key === "Enter"/);
assert.match(composer, /searchPanel\.handleInput/);
assert.match(composer, /searchPanel\.handleKeydown/);
assert.match(composer, /searchPanel\.handleTab/);
assert.match(composer, /searchPanel\.exit\(\{ restoreField: true \}\)/);
assert.match(runtime, /composerController\.enterSearchMode\(\)/);
assert.match(runtime, /listComposerSearchRecords/);
assert.match(css, /\.prompt-search-results \{[\s\S]*?overlay-surface|z-index:\s*var\(--overlay-z-popover\)/);
assert.match(css, /\.prompt-send-button \{[\s\S]*?border-radius:\s*var\(--ui-radius-pill\)/);
assert.match(css, /\.prompt-input-row\s*\{[\s\S]*?height:\s*var\(--prompt-collapsed-height\);/);
assert.match(css, /--prompt-collapsed-height:\s*56px;/);
assert.match(css, /--prompt-search-radius:\s*var\(--ui-compact-height\)/);
assert.match(css, /\.prompt-input-row\s*\{[\s\S]*?display:\s*grid/);
assert.match(css, /\.prompt-shell:not\(\.prompt-shell-search\):not\(\.prompt-shell-expanded\)\s*\{[\s\S]*?border-radius:\s*var\(--ui-radius-pill\)/);
assert.match(css, /line-height:\s*var\(--prompt-collapsed-line\)/);
assert.match(css, /:focus \+ \.prompt-collapsed-preview/);
assert.match(css, /\.prompt-mode-switch/);
assert.match(css, /\.prompt-mode-chip\[aria-pressed="true"\]\s*\{[\s\S]*?background:\s*var\(--panel-2\)/);
assert.match(css, /\.prompt-mode-switch\s*\{[\s\S]*?position:\s*static/);
assert.doesNotMatch(css, /\.prompt-mode-chip[^{]*\{[^}]*transform:/);
assert.match(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-mode-switch/);
assert.match(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.textarea\.prompt-input/);
assert.match(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\)/);
assert.match(css, /\.prompt-search-results \{[\s\S]*?position:\s*static/);
assert.doesNotMatch(css, /\.prompt-search-results \{[\s\S]*?border-bottom-left-radius:\s*var\(--ui-radius-pill\)/);
assert.match(css, /\.prompt-search-option \{[\s\S]*?display:\s*flex/);
assert.match(css, /\.prompt-search-option \{[\s\S]*?min-height:\s*var\(--prompt-search-row\)/);
assert.match(css, /\.prompt-input:not\(\.prompt-input-expanded\):focus::placeholder/);
assert.match(css, /\.prompt-send-button:disabled \{[\s\S]*?background:\s*transparent/);
assert.match(css, /\.prompt-shell\.prompt-shell-search[\s\S]{0,280}box-shadow:\s*var\(--overlay-shadow\)/);
assert.match(css, /\.prompt-input \{[\s\S]*?position:\s*relative;/);
assert.doesNotMatch(css, /\.prompt-input \{[^}]*position:\s*absolute;/);
assert.match(panelSource, /prompt-mode-switch/);
assert.match(panelSource, /prompt-mode-chip-compose/);
assert.match(panelSource, /prompt-mode-chip-search/);
assert.match(panelSource, /tabindex: "-1"/);
assert.match(panelSource, /function handleTab\(/);
assert.doesNotMatch(panelSource, /prompt-search-toggle/);
assert.doesNotMatch(panelSource, /createSvgIcon/);
assert.doesNotMatch(panelSource, /data-tooltip-id/);
assert.doesNotMatch(panelSource, /tooltip-trigger/);
assert.doesNotMatch(functionSource(composer, "enterSearchMode"), /expandInput\(/);
assert.doesNotMatch(functionSource(composer, "collapseInput"), /searchPanel\.exit/);
assert.match(functionSource(composer, "enterSearchMode"), /collapseInput\(/);
assert.match(functionSource(composer, "handleInputKeydown"), /searchPanel\.handleTab/);
assert.match(agents, /Search mode stays single-line/);
assert.match(agents, /visible `\.prompt-mode-switch`/);
assert.match(agents, /Tab while `\.prompt-input` owns the caret toggles compose and search/);
assert.doesNotMatch(css, /\.prompt-search-results \{[^}]*transform:/);
assert.match(agents, /Do not wrap `\.prompt-shell` in `viewerModal`/);
assert.match(agents, /Topbar Search enters composer search mode/);
assert.match(i18n, /"composer\.mode\.tabToSearch": "Press Tab to search chats"/);
assert.match(i18n, /"composer\.mode\.tabToCompose": "Press Tab to compose"/);
assert.match(i18n, /"composer\.mode\.tabToSearch": "按下 Tab 搜索对话"/);
assert.match(i18n, /"composer\.mode\.tabToCompose": "按下 Tab 返回发送"/);

class FakeNode {
  constructor(tagName = "div") {
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      contains: (name) => this._classes.has(name),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }

  get isConnected() {
    return Boolean(this.parentElement);
  }

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }

  before(node) {
    const parent = this.parentElement;
    if (!parent || !node) return;
    const index = parent.children.indexOf(this);
    node.parentElement = parent;
    parent.children.splice(Math.max(0, index), 0, node);
  }

  after(node) {
    const parent = this.parentElement;
    if (!parent || !node) return;
    const index = parent.children.indexOf(this);
    node.parentElement = parent;
    parent.children.splice(index + 1, 0, node);
  }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes.set(key, String(value));
    if (key === "class") this.className = value;
    if (key === "hidden") this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
    if (name === "hidden") this.hidden = false;
  }

  matches(selector) {
    const value = String(selector || "").trim();
    if (value.startsWith(".")) {
      return value.slice(1).split(".").filter(Boolean).every((name) => this.classList.contains(name));
    }
    return value.toUpperCase() === this.tagName;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
}

function nodeText(node) {
  if (!node) return "";
  if (node.nodeType === 3) return String(node.textContent || "");
  return (node.children || []).map(nodeText).join("");
}

const previous = {
  Node: globalThis.Node,
  document: globalThis.document
};

globalThis.Node = FakeNode;
globalThis.document = {
  body: new FakeNode("body"),
  createElement: (tagName) => new FakeNode(tagName),
  createElementNS: (_ns, tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node.textContent = String(value);
    return node;
  },
  querySelector(selector) { return this.body.querySelector(selector); },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
};

(async () => {
  try {
    const { createComposerSearchPanel } = await import(moduleUrl("app/composer/search-panel.js"));
    const records = [
      { workspaceId: "live-1", title: "Live desk", live: true, current: false, appIds: ["Grok"] },
      { workspaceId: "closed-1", title: "Closed desk", live: false, current: false, appIds: ["Claude"] }
    ];
    const opened = [];
    const viewers = [];
    let panel;
    panel = createComposerSearchPanel({
      onEnter() { panel.enter(); },
      workspaceSearch: {
        listRecords: async (query) => {
          const needle = String(query || "").trim().toLowerCase();
          if (!needle) return records;
          return records.filter((record) => record.title.toLowerCase().includes(needle));
        },
        openRecord: async (record) => { opened.push(record.workspaceId); },
        openViewer: (opts) => { viewers.push(opts); }
      }
    });
    const shell = new FakeNode("div");
    shell.className = "prompt-shell";
    const row = new FakeNode("div");
    row.className = "prompt-input-row";
    const field = new FakeNode("textarea");
    field.className = "prompt-input";
    field.placeholder = "Message all active chats";
    const send = new FakeNode("button");
    send.className = "prompt-send-button";
    const clear = new FakeNode("button");
    clear.className = "prompt-clear-button";
    row.append(field, clear, send);
    shell.append(row);
    globalThis.document.body.append(shell);
    panel.attach(shell);
    assert.equal(panel.isActive(), false);
    const modeSwitch = shell.querySelector(".prompt-mode-switch");
    const composeChip = shell.querySelector(".prompt-mode-chip-compose");
    const searchChip = shell.querySelector(".prompt-mode-chip-search");
    assert.equal(Boolean(modeSwitch), true, "mode switch is visible at rest");
    assert.equal(Boolean(composeChip && searchChip), true, "compose and search chips are labeled controls");
    assert.equal(composeChip.getAttribute("tabindex"), "-1");
    assert.equal(searchChip.getAttribute("tabindex"), "-1");
    assert.equal(composeChip.getAttribute("data-tooltip-id"), null);
    assert.equal(searchChip.getAttribute("data-tooltip-id"), null);
    assert.equal(composeChip.getAttribute("aria-pressed"), "true");
    assert.equal(searchChip.getAttribute("aria-pressed"), "false");
    assert.equal(field.placeholder, "Press Tab to search chats");
    assert.equal(field.getAttribute("aria-label"), "Message all active chats");
    const tabEvent = () => ({
      key: "Tab",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
      keyCode: 9,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }
    });
    const tab = tabEvent();
    assert.equal(panel.handleTab(tab), true);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(panel.isActive(), true);
    assert.equal(shell.classList.contains("prompt-shell-search"), true);
    assert.equal(searchChip.getAttribute("aria-pressed"), "true");
    assert.equal(composeChip.getAttribute("aria-pressed"), "false");
    assert.equal(field.placeholder, "Press Tab to compose");
    assert.equal(field.getAttribute("aria-label"), "Search chats");
    const shiftTab = tabEvent();
    shiftTab.shiftKey = true;
    assert.equal(panel.handleTab(shiftTab), true);
    assert.equal(panel.isActive(), false, "Shift+Tab leaves search");
    assert.equal(panel.handleTab({
      key: "Tab",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: true,
      keyCode: 229,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}
    }), false, "IME Tab must not toggle");
    assert.equal(panel.isActive(), false);
    assert.equal(panel.handleTab({
      key: "Tab",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      isComposing: false,
      preventDefault() {},
      stopPropagation() {}
    }), false, "modified Tab must not toggle");
    searchChip.listeners.get("click")[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(panel.isActive(), true, "search chip click enters search");
    composeChip.listeners.get("click")[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(panel.isActive(), false, "compose chip click exits search");
    panel.enter();
    assert.equal(panel.isActive(), true);
    assert.equal(shell.classList.contains("prompt-shell-search"), true);
    assert.equal(searchChip.getAttribute("aria-pressed"), "true");
    await new Promise((resolve) => { setImmediate(resolve); });
    const options = shell.querySelectorAll(".prompt-search-option");
    assert.equal(options.length, 2, "empty query lists recency rows");
    field.value = "Closed";
    panel.handleInput({ target: field });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(panel.query(), "Closed");
    const filtered = shell.querySelectorAll(".prompt-search-option");
    assert.equal(filtered.length, 1, "query filters title hits");
    assert.match(nodeText(filtered[0]), /Closed desk/);
    const enter = {
      key: "Enter",
      shiftKey: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}
    };
    assert.equal(panel.handleKeydown(enter), true);
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(opened, ["closed-1"]);
    assert.equal(panel.isActive(), false, "activating a row exits search");
    panel.enter();
    field.value = "no-such-desk";
    panel.handleInput({ target: field });
    const escape = {
      key: "Escape",
      preventDefault() {},
      stopPropagation() {}
    };
    panel.handleKeydown(escape);
    assert.equal(panel.query(), "");
    panel.handleKeydown(escape);
    assert.equal(panel.isActive(), false, "empty Escape leaves search");
    assert.equal(field.placeholder, "Press Tab to search chats", "leaving search restores the Tab compose hint");
    panel.enter();
    const footer = shell.querySelector(".prompt-search-viewer-button");
    footer.listeners.get("click")[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(viewers.length, 1);
    assert.equal(typeof viewers[0].query, "string");

    const customField = new FakeNode("textarea");
    customField.className = "prompt-input";
    customField.placeholder = "Type";
    const customRow = new FakeNode("div");
    customRow.className = "prompt-input-row";
    customRow.append(customField);
    const customShell = new FakeNode("div");
    customShell.className = "prompt-shell";
    customShell.append(customRow);
    globalThis.document.body.append(customShell);
    const customPanel = createComposerSearchPanel({
      composePlaceholder: () => "Type"
    });
    customPanel.attach(customShell);
    assert.equal(customField.placeholder, "Type", "custom placeholders must not be replaced by the Tab hint");
    assert.equal(customField.getAttribute("aria-label"), "Type");
    customPanel.enter();
    assert.equal(customField.placeholder, "Press Tab to compose");
    assert.equal(customField.getAttribute("aria-label"), "Search chats");
    customPanel.exit({ restoreField: false });
    assert.equal(customField.placeholder, "Type", "exiting search must restore a custom compose placeholder");
  } finally {
    globalThis.Node = previous.Node;
    globalThis.document = previous.document;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
