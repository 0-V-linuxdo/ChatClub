#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.fail(message);
}

class FakeNode {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.value = "";
    this.checked = false;
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

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.parentElement = this;
      this.children.push(child);
    }
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ currentTarget: this, target: this });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "value") this.value = String(value);
    if (name === "checked") this.checked = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function findNode(rootNode, predicate) {
  if (predicate(rootNode)) return rootNode;
  for (const child of rootNode.children || []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

const previousGlobals = {
  Node: globalThis.Node,
  document: globalThis.document
};
globalThis.Node = FakeNode;
globalThis.document = {
  body: new FakeNode("body"),
  addEventListener() {},
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node.textContent = String(value);
    return node;
  },
  querySelectorAll: () => []
};

(async () => {
  const stateModule = await import(moduleUrl("app/state.js"));
  const modelsModule = await import(moduleUrl("app/settings/models.js"));
  const rootState = stateModule.createAppState();
  rootState.options = {
    ...rootState.options,
    modelPreferenceFailurePolicy: "send-current",
    modelPreferenceFailureOverrides: {
      Gemini: "inherit",
      Grok: "inherit",
      DeepSeek: "inherit",
      NotionAI: "inherit"
    },
    modelPreferenceOrder: ["Gemini", "Grok", "DeepSeek", "NotionAI"],
    modelPreferences: {}
  };
  const ports = stateModule.createFeatureStatePorts(rootState);
  let persistedOptions = structuredClone(rootState.options);
  const saves = [];
  let applyPreferredModelCalls = 0;
  const section = modelsModule.createModelsSettingsSection({
    state: ports.settingsSections.models,
    svgIcon: () => new FakeNode("svg"),
    notifyConfigReload: async () => {},
    saveOptionsPatch: async (patch) => {
      const gate = deferred();
      const call = { gate, patch: structuredClone(patch) };
      saves.push(call);
      await gate.promise;
      persistedOptions = { ...persistedOptions, ...patch };
      return structuredClone(persistedOptions);
    },
    applyPreferredModels: async () => { applyPreferredModelCalls += 1; }
  });

  const pane = section.pane(() => {});
  const globalPolicy = findNode(pane, (node) => node.dataset?.modelPreferenceFailurePolicy === "global");
  const geminiOverride = findNode(
    pane,
    (node) => node.dataset?.modelPreferenceFailureOverrideAppId === "Gemini"
  );
  assert.ok(globalPolicy && geminiOverride, "failure-policy controls must be rendered");

  globalPolicy.value = "skip";
  globalPolicy.dispatch("change");
  assert.equal(saves.length, 1, "the first strategy change must start persistence");
  assert.equal(
    ports.preferredModel.options.modelPreferenceFailurePolicy,
    "skip",
    "Composer policy readers must see the global change before persistence resolves"
  );

  geminiOverride.value = "skip";
  geminiOverride.dispatch("change");
  assert.equal(saves.length, 1, "the second strategy change must queue behind the in-flight save");
  assert.equal(
    ports.preferredModel.options.modelPreferenceFailureOverrides.Gemini,
    "skip",
    "Composer policy readers must see the per-site override before persistence resolves"
  );

  saves[0].gate.resolve();
  await waitUntil(() => saves.length === 2, "the queued override save did not start");
  assert.equal(
    ports.preferredModel.options.modelPreferenceFailureOverrides.Gemini,
    "skip",
    "an older save result must not temporarily overwrite the newer visible override"
  );
  assert.deepEqual(saves[1].patch.modelPreferenceFailureOverrides, {
    Gemini: "skip",
    Grok: "inherit",
    DeepSeek: "inherit",
    NotionAI: "inherit"
  });
  saves[1].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "strategy autosave did not settle");
  assert.equal(ports.preferredModel.options.modelPreferenceFailurePolicy, "skip");
  assert.equal(ports.preferredModel.options.modelPreferenceFailureOverrides.Gemini, "skip");
  assert.equal(
    applyPreferredModelCalls,
    0,
    "failure-strategy changes must not retrigger preferred-model selection"
  );

  console.log("model-preference strategy autosave: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(() => {
  if (previousGlobals.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previousGlobals.Node;
  if (previousGlobals.document === undefined) delete globalThis.document;
  else globalThis.document = previousGlobals.document;
});
