#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lineCount = (source) => source.trimEnd().split(/\r?\n/).length;
const stateKeys = (source) => [...new Set(
  [...source.matchAll(/\bstate\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1])
)].sort();

const appearanceSource = read("app/settings/appearance.js");
const topbarSource = read("app/settings/appearance-topbar.js");

assert.ok(lineCount(appearanceSource) < 950, `Appearance section must remain below 950 lines; found ${lineCount(appearanceSource)}`);
assert.ok(lineCount(topbarSource) > 250 && lineCount(topbarSource) < 400, "Topbar settings must remain a substantive bounded controller");
assert.match(appearanceSource, /import \{ createAppearanceTopbarController \} from "\.\/appearance-topbar\.js";/);
assert.match(appearanceSource, /const appearanceTopbar = createAppearanceTopbarController\(\{[\s\S]*?closeSettingsDialog\s*\}\);/);
assert.match(appearanceSource, /appearanceTopbar\.pane\(redraw\)/);
assert.doesNotMatch(
  appearanceSource,
  /function (?:topbarPromptPlaceholderConfigValue|saveTopbarPromptPlaceholderConfig|topbarPromptPlaceholderBlock|topbarLayoutBlock)\b/,
  "Topbar placeholder and layout behavior must stay out of the Appearance section assembly"
);
assert.deepEqual(stateKeys(topbarSource), [
  "options",
  "settingsAppearanceTopbarTab",
  "settingsTopbarPromptPlaceholderDraft",
  "settingsTopbarPromptPlaceholderDragIndex",
  "settingsTopbarPromptPlaceholderEditingIndex"
]);
assert.match(
  topbarSource,
  /state\.options = await saveOptionsPatch\(\{ topbarPromptPlaceholderConfig: config \}\);\s*syncTopbarPromptPlaceholder\(\);\s*redraw\(\);/,
  "Placeholder saves must settle storage before synchronizing and redrawing"
);
assert.match(topbarSource, /setData\("application\/x-chatclub-topbar-placeholder", String\(index\)\)/);
assert.match(topbarSource, /moveTopbarPromptPlaceholderItems\(config\.items, sourceIndex, targetIndex, settingsListDropPlacement\(event\)\)/);
assert.match(topbarSource, /cleanupTopbarPromptPlaceholderDrag\(\);\s*await saveTopbarPromptPlaceholderConfig/);

class FakeNode {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);
    this.style = { setProperty() {} };
    this.className = "";
    this.listeners = new Map();
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.classList = {
      add: (...names) => this.#updateClasses((values) => names.forEach((name) => values.add(name))),
      remove: (...names) => this.#updateClasses((values) => names.forEach((name) => values.delete(name))),
      contains: (name) => this.#classes().has(name),
      toggle: (name, force) => {
        let enabled = force;
        this.#updateClasses((values) => {
          enabled = force === undefined ? !values.has(name) : Boolean(force);
          if (enabled) values.add(name);
          else values.delete(name);
        });
        return enabled;
      }
    };
  }

  #classes() {
    return new Set(String(this.className || "").split(/\s+/).filter(Boolean));
  }

  #updateClasses(update) {
    const values = this.#classes();
    update(values);
    this.className = [...values].join(" ");
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "value") this.value = String(value);
    if (name === "hidden") this.hidden = true;
    if (name === "disabled") this.disabled = true;
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  getBoundingClientRect() {
    return { top: 0, height: 100 };
  }

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    return descendants(this).filter((node) => className && node.classList.contains(className));
  }
}

function descendants(rootNode) {
  return rootNode.children.flatMap((child) => [child, ...descendants(child)]);
}

function findByTag(rootNode, tagName) {
  return descendants(rootNode).filter((node) => node.tagName === tagName);
}

function firstByClass(rootNode, className) {
  return descendants(rootNode).find((node) => node.classList.contains(className));
}

const previousGlobals = {
  Node: globalThis.Node,
  document: globalThis.document,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  setTimeout: globalThis.setTimeout,
  window: globalThis.window
};
const body = new FakeNode("body");
globalThis.Node = FakeNode;
globalThis.document = {
  body,
  addEventListener() {},
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (text) => {
    const node = new FakeNode("#text");
    node.textContent = String(text);
    return node;
  },
  querySelector: (selector) => body.querySelectorAll(selector)[0] || null,
  querySelectorAll: (selector) => body.querySelectorAll(selector)
};
globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};
globalThis.setTimeout = () => 1;
globalThis.window = { confirm: () => true };

(async () => {
  const { createAppearanceTopbarController } = await import(
    pathToFileURL(path.join(root, "app/settings/appearance-topbar.js")).href
  );
  const state = {
    options: {
      topbarPromptPlaceholderConfig: {
        enabled: true,
        intervalSec: 10,
        items: ["One", "Two"],
        mode: "refresh",
        order: "sequential"
      }
    },
    settingsAppearanceTopbarTab: "placeholder",
    settingsTopbarPromptPlaceholderDraft: "",
    settingsTopbarPromptPlaceholderDragIndex: "",
    settingsTopbarPromptPlaceholderEditingIndex: -1
  };
  const savedPatches = [];
  let closeCount = 0;
  let editCount = 0;
  let redrawCount = 0;
  let syncCount = 0;
  const dependencies = {
    state,
    svgIcon: () => new FakeNode("svg"),
    saveOptionsPatch: async (patch) => {
      savedPatches.push(patch);
      return { ...state.options, ...patch };
    },
    syncTopbarPromptPlaceholder: () => { syncCount += 1; },
    enterTopbarEditMode: () => { editCount += 1; },
    closeSettingsDialog: () => { closeCount += 1; }
  };
  const controller = createAppearanceTopbarController(dependencies);
  assert.ok(Object.isFrozen(controller));
  assert.deepEqual(Object.keys(controller), ["pane"]);
  assert.throws(
    () => createAppearanceTopbarController({ ...dependencies, unknown: true }),
    /received extra dependencies field unknown/
  );
  assert.throws(
    () => {
      const incompleteState = { ...state };
      delete incompleteState.settingsTopbarPromptPlaceholderDragIndex;
      createAppearanceTopbarController({ ...dependencies, state: incompleteState });
    },
    /Appearance settings section state port/
  );

  const placeholderPane = controller.pane(() => { redrawCount += 1; });
  body.append(placeholderPane);
  const rows = placeholderPane.querySelectorAll(".topbar-placeholder-row");
  assert.equal(rows.length, 2);
  const transferred = new Map();
  const dataTransfer = {
    effectAllowed: "",
    dropEffect: "",
    getData: (type) => transferred.get(type) || "",
    setData: (type, value) => transferred.set(type, value)
  };
  rows[0].listeners.get("dragstart")[0]({ currentTarget: rows[0], dataTransfer });
  assert.equal(state.settingsTopbarPromptPlaceholderDragIndex, "0");
  assert.equal(transferred.get("application/x-chatclub-topbar-placeholder"), "0");
  assert.equal(dataTransfer.effectAllowed, "move");
  let prevented = false;
  rows[1].listeners.get("dragover")[0]({
    clientY: 75,
    currentTarget: rows[1],
    dataTransfer,
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(dataTransfer.dropEffect, "move");
  assert.equal(rows[1].classList.contains("drop-after"), true);
  rows[0].listeners.get("dragend")[0]();
  assert.equal(state.settingsTopbarPromptPlaceholderDragIndex, "");
  assert.equal(rows[1].classList.contains("drop-after"), false);

  const [modeSelect] = findByTag(placeholderPane, "select");
  modeSelect.value = "interval";
  await modeSelect.listeners.get("change")[0]();
  assert.equal(savedPatches.length, 1);
  assert.equal(savedPatches[0].topbarPromptPlaceholderConfig.mode, "interval");
  assert.equal(syncCount, 1);
  assert.equal(redrawCount, 1);

  rows[0].listeners.get("dragstart")[0]({ currentTarget: rows[0], dataTransfer });
  let dropPrevented = false;
  await rows[1].listeners.get("drop")[0]({
    clientY: 75,
    currentTarget: rows[1],
    dataTransfer,
    preventDefault: () => { dropPrevented = true; }
  });
  assert.equal(dropPrevented, true);
  assert.deepEqual(savedPatches[1].topbarPromptPlaceholderConfig.items, ["Two", "One"]);
  assert.deepEqual(state.options.topbarPromptPlaceholderConfig.items, ["Two", "One"]);
  assert.equal(state.settingsTopbarPromptPlaceholderDragIndex, "");
  assert.equal(syncCount, 2);
  assert.equal(redrawCount, 2);

  state.settingsAppearanceTopbarTab = "layout";
  const layoutPane = controller.pane(() => {});
  const customizeButton = firstByClass(layoutPane, "settings-primary-action");
  customizeButton.listeners.get("click")[0]();
  assert.equal(closeCount, 1);
  assert.equal(editCount, 1);

  console.log(`appearance topbar boundaries: ok (${lineCount(appearanceSource)} facade lines)`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(() => {
  for (const [name, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
});
