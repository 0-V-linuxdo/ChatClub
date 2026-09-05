#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const stylesSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");

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

  get textContent() {
    if (this._textContent !== undefined) return this._textContent;
    return this.children.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this._textContent = String(value);
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

  dispatch(type, values = {}) {
    const event = {
      currentTarget: this,
      target: this,
      clientY: 0,
      preventDefault() { this.defaultPrevented = true; },
      ...values
    };
    event.results = (this.listeners.get(type) || []).map((listener) => listener(event));
    return event;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "value") this.value = String(value);
    if (name === "checked") this.checked = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect() {
    return { top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100 };
  }

  matches(selector) {
    const value = String(selector || "").trim();
    if (value.startsWith(".")) {
      return value.split(".").slice(1).filter(Boolean).every((name) => this.classList.contains(name));
    }
    return value.toUpperCase() === this.tagName;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
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

function findNodes(rootNode, predicate, matches = []) {
  if (predicate(rootNode)) matches.push(rootNode);
  for (const child of rootNode.children || []) findNodes(child, predicate, matches);
  return matches;
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
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
};

(async () => {
  const preferenceOrder = ["NotionAI", "DeepSeek", "Gemini", "Grok"];
  const stateModule = await import(moduleUrl("app/state.js"));
  const modelsModule = await import(moduleUrl("app/settings/models.js"));
  const {
    GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
    MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
    MODEL_PREFERENCE_SECONDARY_KEYS,
    MODEL_PREFERENCE_TARGETS,
    NOTION_ALL_SOURCES_PREFERENCE_KEY,
    NOTION_EFFORT_PREFERENCE_KEY
  } = await import(moduleUrl("shared/constants.js"));
  const { dehydrateOptions, normalizeOptions } = await import(moduleUrl("shared/storage-schema.js"));
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
    modelPreferenceOrder: preferenceOrder,
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

  let redrawCalls = 0;
  assert.equal(rootState.modelPreferenceSettingsTab, "preferred", "preferred models must be the default tab");
  const pane = section.pane(() => { redrawCalls += 1; });
  globalThis.document.body.append(pane);
  const preferredTab = findNode(pane, (node) => node.dataset?.modelPreferenceTabId === "preferred");
  const failureTab = findNode(pane, (node) => node.dataset?.modelPreferenceTabId === "failure");
  assert.ok(preferredTab && failureTab, "model preferences must expose preferred and failure tabs");
  assert.equal(preferredTab.getAttribute("aria-selected"), "true");
  assert.equal(failureTab.getAttribute("aria-selected"), "false");
  const modelRows = findNodes(pane, (node) => Boolean(node.dataset?.modelPreferenceAppId));
  const modelHeader = findNode(pane, (node) => node.classList?.contains("settings-list-header"));
  const modelSelects = findNodes(pane, (node) => Boolean(node.dataset?.modelPreferenceSelectAppId));
  const secondaryToggle = findNode(
    pane,
    (node) => node.dataset?.modelPreferenceSecondaryEnabled === "true"
  );
  const notionModelSelect = modelSelects.find(
    (node) => node.dataset.modelPreferenceSelectAppId === "NotionAI"
  );
  const allSourcesGroup = findNode(
    pane,
    (node) => node.dataset?.modelPreferenceAllSourcesAppId === "NotionAI"
  );
  const allSourcesRadios = findNodes(
    allSourcesGroup,
    (node) => node.tagName === "INPUT" && node.getAttribute("type") === "radio"
  );
  const thinkingLevelGroup = findNode(
    pane,
    (node) => node.dataset?.modelPreferenceThinkingLevelAppId === "Gemini"
  );
  const thinkingLevelRadios = findNodes(
    thinkingLevelGroup,
    (node) => node.tagName === "INPUT" && node.getAttribute("type") === "radio"
  );
  assert.equal(
    findNode(pane, (node) => node.dataset?.modelPreferenceFailurePolicy === "global"),
    null,
    "the preferred tab must not render failure controls"
  );
  assert.deepEqual(
    modelRows.map((node) => node.dataset.modelPreferenceAppId),
    preferenceOrder,
    "the draggable model list must follow the saved preference order"
  );
  assert.deepEqual(
    modelSelects.map((node) => node.dataset.modelPreferenceSelectAppId),
    preferenceOrder,
    "model controls must follow the saved preference order"
  );
  assert.ok(secondaryToggle, "the preferred tab must expose the secondary-model feature switch");
  assert.equal(secondaryToggle.checked, false, "secondary models must be disabled by default");
  assert.equal(secondaryToggle.getAttribute("role"), "switch");
  assert.equal(
    findNodes(pane, (node) => Boolean(node.dataset?.modelPreferenceSecondarySelectAppId)).length,
    0,
    "secondary-model controls must stay hidden until the user enables the feature"
  );
  const expectedNotionModels = [
    ["", ""],
    ["auto", "Auto"],
    ["sonnet46", "Claude Sonnet 4.6"],
    ["sonnet5", "Claude Sonnet 5"],
    ["opus47", "Claude Opus 4.7"],
    ["opus48", "Claude Opus 4.8"],
    ["opus5", "Claude Opus 5"],
    ["fable5", "Claude Fable 5"],
    ["fable51", "Claude Fable 5.1"],
    ["gemini31pro", "Gemini 3.1 Pro"],
    ["gemini35flash", "Gemini 3.5 Flash"],
    ["gpt56sol", "GPT-5.6 Sol"],
    ["gpt56terra", "GPT-5.6 Terra"],
    ["gpt52", "GPT-5.2"],
    ["gpt54", "GPT-5.4"],
    ["gpt55", "GPT-5.5"],
    ["gpt6astra", "GPT-6 Astra"],
    ["grok43", "Grok 4.3"],
    ["grok45", "Grok 4.5"],
    ["grokBuild01", "Grok Build 0.1"],
    ["kimi26", "Kimi K2.6"],
    ["kimi27code", "Kimi K2.7 Code"],
    ["kimi3", "Kimi K3"],
    ["deepseekV4Pro", "DeepSeek V4 Pro"],
    ["glm52", "GLM 5.2"]
  ];
  assert.deepEqual(
    MODEL_PREFERENCE_TARGETS.NotionAI.map(({ id, label }) => [id, label]),
    expectedNotionModels,
    "the canonical Notion settings catalog must include every current model"
  );
  assert.deepEqual(
    notionModelSelect.children.map((node, index) => [
      node.getAttribute("value"),
      index === 0 ? "" : node.textContent
    ]),
    [...expectedNotionModels, ["__custom__", "Custom name"]],
    "the rendered Notion model select must expose every current model plus a custom-name option"
  );
  assert.ok(
    modelRows.every((node) => node.children.length === 4),
    "the model list must keep drag, platform, model, and additional-option columns"
  );
  assert.ok(
    modelRows.every((node) => (
      node.children[0]?.classList?.contains("settings-reorder")
      && Boolean(node.querySelector(".settings-drag-handle"))
    )),
    "every configurable model row must keep a leading drag handle with click reorder"
  );
  assert.equal(modelHeader?.children.length, 4, "the model-list header must match the four row columns");
  assert.ok(
    modelRows.filter((node) => !["Gemini", "NotionAI"].includes(node.dataset.modelPreferenceAppId))
      .every((node) => node.children[3]?.getAttribute("aria-hidden") === "true"),
    "platforms without an additional preference must hide the complete placeholder field"
  );
  assert.ok(
    modelRows.filter((node) => !["Gemini", "NotionAI"].includes(node.dataset.modelPreferenceAppId))
      .every((node) => !findNode(
        node.children[3],
        (child) => child.classList?.contains("model-preference-segmented-control")
      )),
    "platforms without an additional preference must not render a segmented control"
  );
  assert.ok(thinkingLevelGroup, "Gemini must expose Thinking level in the fourth column");
  assert.equal(thinkingLevelGroup.getAttribute("role"), "radiogroup", "Thinking level must expose a radio group");
  assert.ok(
    Boolean(thinkingLevelGroup.getAttribute("aria-label")?.trim()),
    "Thinking level must have an explicit accessible name"
  );
  assert.deepEqual(
    thinkingLevelRadios.map((node) => node.value),
    ["standard", "extended"],
    "Thinking level must preserve the stable standard and extended values"
  );
  assert.deepEqual(
    thinkingLevelRadios.map((node) => node.parentElement?.children[1]?.textContent),
    ["Standard", "Extended"],
    "Thinking level must expose both localized segment labels"
  );
  assert.deepEqual(
    thinkingLevelRadios.map((node) => node.checked),
    [true, false],
    "Thinking level must default to Standard"
  );
  assert.ok(allSourcesGroup, "Notion AI must expose its All sources preference in the fourth column");
  assert.equal(allSourcesGroup.getAttribute("role"), "radiogroup", "All sources must expose a radio group");
  assert.ok(
    Boolean(allSourcesGroup.getAttribute("aria-label")?.trim()),
    "the All sources preference must have an explicit accessible name"
  );
  assert.deepEqual(
    allSourcesRadios.map((node) => node.value),
    ["", "enabled", "disabled"],
    "the All sources preference must expose only the normalized tri-state values"
  );
  assert.deepEqual(
    allSourcesRadios.map((node) => node.parentElement?.children[1]?.textContent),
    ["Do not change", "On", "Off"],
    "the All sources control must explain no-interference, enabled, and disabled states"
  );
  assert.deepEqual(
    allSourcesRadios.map((node) => node.checked),
    [true, false, false],
    "All sources must default to the no-interference segment"
  );
  assert.equal(
    new Set(allSourcesRadios.map((node) => node.getAttribute("name"))).size,
    1,
    "the three native radios must share one name for browser keyboard navigation"
  );
  assert.ok(
    allSourcesRadios[0]?.getAttribute("name"),
    "the All sources radio group must use a non-empty native name"
  );
  assert.ok(
    [...thinkingLevelRadios, ...allSourcesRadios].every(
      (node) => node.parentElement?.tagName === "LABEL"
        && node.parentElement?.classList?.contains("model-preference-segmented-option")
    ),
    "every additional-preference radio must use the shared native-label segment"
  );
  assert.equal(
    new Set(thinkingLevelRadios.map((node) => node.getAttribute("name"))).size,
    1,
    "the two Thinking level radios must share one name for browser keyboard navigation"
  );
  assert.ok(
    thinkingLevelRadios[0]?.getAttribute("name"),
    "the Thinking level radio group must use a non-empty native name"
  );
  assert.notEqual(
    thinkingLevelRadios[0]?.getAttribute("name"),
    allSourcesRadios[0]?.getAttribute("name"),
    "the two segmented controls must use independent native radio groups"
  );
  assert.equal(
    findNode(thinkingLevelGroup, (node) => node.classList?.contains("model-preference-segmented-title"))
      ?.textContent,
    "Thinking level",
    "the Thinking level title must remain visible in wide and compact layouts"
  );
  assert.equal(
    findNode(allSourcesGroup, (node) => node.classList?.contains("model-preference-segmented-title"))
      ?.textContent,
    "All sources",
    "the All sources title must remain visible in wide and compact layouts"
  );
  const allSourcesInfo = findNode(
    allSourcesGroup,
    (node) => node.classList?.contains("model-preference-segmented-info")
  );
  assert.ok(allSourcesInfo, "All sources must expose its explanation through a compact info button");
  assert.equal(allSourcesInfo.tagName, "BUTTON");
  assert.equal(allSourcesInfo.getAttribute("type"), "button", "the info control must not submit a surrounding form");
  assert.equal(
    allSourcesInfo.getAttribute("aria-label"),
    "Controls whether Notion AI uses all sources it can access.",
    "the info button must retain the full accessible explanation"
  );
  assert.equal(
    allSourcesInfo.getAttribute("data-tooltip"),
    allSourcesInfo.getAttribute("aria-label"),
    "the source icon tooltip and accessible explanation must stay aligned"
  );
  assert.equal(allSourcesInfo.getAttribute("data-tooltip-wrap"), "true");
  assert.equal(allSourcesInfo.getAttribute("data-tooltip-id"), "settings.models.allSources");
  assert.equal(
    findNode(allSourcesInfo, (node) => node.tagName === "SVG")?.tagName,
    "SVG",
    "the compact info button must reuse the existing SVG icon system"
  );
  assert.equal(
    findNode(thinkingLevelGroup, (node) => node.classList?.contains("model-preference-segmented-info")),
    null,
    "Thinking level must not render an irrelevant info button"
  );
  assert.ok(
    findNode(
      thinkingLevelGroup,
      (node) => node.classList?.contains("model-preference-segmented-options-two")
    ),
    "Thinking level must mount the two-segment layout modifier"
  );
  assert.ok(
    findNode(
      allSourcesGroup,
      (node) => node.classList?.contains("model-preference-segmented-options-three")
    ),
    "All sources must mount the three-segment layout modifier"
  );
  assert.ok(
    ["Gemini", "NotionAI"].every((appId) => modelRows.find(
      (node) => node.dataset.modelPreferenceAppId === appId
    )?.classList.contains("model-preference-row-has-additional")),
    "Gemini and Notion AI must expose their additional preference in compact layouts"
  );
  assert.ok(
    modelRows.every((node) => !findNode(node, (child) => Boolean(child.dataset?.modelPreferenceFailureOverrideAppId))),
    "failure overrides must render in the failure-policy block, not the draggable model rows"
  );
  const renderedSelects = findNodes(pane, (node) => node.tagName === "SELECT");
  assert.equal(renderedSelects.length, 5, "the preferred tab must keep four model dropdowns plus Notion Effort");
  assert.ok(
    renderedSelects.every((node) => Boolean(node.getAttribute("aria-label")?.trim())),
    "every preferred-model select must have an explicit accessible name"
  );
  const initialNotionEffort = findNode(
    pane,
    (node) => node.dataset?.modelPreferenceEffortSelectSlot === "primary"
  );
  assert.ok(initialNotionEffort, "Notion AI must expose a primary Effort selector");
  assert.equal(initialNotionEffort.getAttribute("disabled"), "", "Effort must stay disabled until a model is selected");
  assert.deepEqual(
    initialNotionEffort.children.map((node) => node.getAttribute("value")),
    [""],
    "a model without Effort configuration must expose only the no-preference option"
  );

  secondaryToggle.checked = true;
  secondaryToggle.dispatch("change");
  assert.equal(saves.length, 1, "enabling secondary models must start an autosave");
  assert.equal(
    saves[0].patch.modelPreferences[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY],
    true,
    "the feature switch must use a stable boolean storage key"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "secondary-model enable autosave did not settle");
  saves.splice(0);

  const enabledPane = section.pane(() => { redrawCalls += 1; });
  const secondarySelects = findNodes(
    enabledPane,
    (node) => Boolean(node.dataset?.modelPreferenceSecondarySelectAppId)
  );
  assert.deepEqual(
    secondarySelects.map((node) => node.dataset.modelPreferenceSecondarySelectAppId),
    preferenceOrder,
    "enabling the feature must render one ordered secondary selector per platform"
  );
  assert.ok(
    secondarySelects.every((node) => node.getAttribute("disabled") !== null),
    "a secondary selector must remain disabled until its platform has a preferred model"
  );
  assert.ok(
    secondarySelects.every((node) => Boolean(node.getAttribute("aria-label")?.trim())),
    "every secondary-model selector must have an explicit accessible name"
  );

  const enabledNotionPrimary = findNode(
    enabledPane,
    (node) => node.dataset?.modelPreferenceSelectAppId === "NotionAI"
  );
  enabledNotionPrimary.value = "opus47";
  enabledNotionPrimary.dispatch("change");
  assert.equal(saves.length, 1, "choosing a preferred model must persist before secondary configuration");
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "preferred-model prerequisite autosave did not settle");
  saves.splice(0);

  const configuredPrimaryPane = section.pane(() => { redrawCalls += 1; });
  const notionSecondary = findNode(
    configuredPrimaryPane,
    (node) => node.dataset?.modelPreferenceSecondarySelectAppId === "NotionAI"
  );
  assert.equal(notionSecondary.getAttribute("disabled"), null);
  assert.equal(
    notionSecondary.children.some((node) => node.getAttribute("value") === "opus47"),
    false,
    "a secondary selector must exclude its current preferred model"
  );
  notionSecondary.value = "fable5";
  notionSecondary.dispatch("change");
  assert.equal(saves.length, 1, "choosing a secondary model must start an autosave");
  assert.equal(
    saves[0].patch.modelPreferences[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI],
    "fable5"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "secondary-model selection autosave did not settle");
  assert.equal(
    ports.preferredModel.options.modelPreferences[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI],
    "fable5",
    "the saved secondary model must become visible to runtime readers"
  );
  const configuredPane = section.pane(() => { redrawCalls += 1; });
  assert.equal(
    findNode(
      configuredPane,
      (node) => node.dataset?.modelPreferenceSecondarySelectAppId === "NotionAI"
    )?.value,
    "fable5",
    "a Settings redraw must retain the saved secondary model"
  );
  saves.splice(0);
  const configuredPrimaryEffort = findNode(
    configuredPane,
    (node) => node.dataset?.modelPreferenceEffortSelectSlot === "primary"
  );
  const configuredSecondaryEffort = findNode(
    configuredPane,
    (node) => node.dataset?.modelPreferenceEffortSelectSlot === "secondary"
  );
  assert.deepEqual(
    configuredPrimaryEffort.children.map((node) => node.getAttribute("value")),
    ["", "none", "low", "medium", "high", "max"],
    "the selected primary model must expose its own Effort range"
  );
  assert.deepEqual(
    configuredSecondaryEffort.children.map((node) => node.getAttribute("value")),
    ["", "low", "medium", "high", "max"],
    "the selected secondary model must expose its own Effort range"
  );
  configuredPrimaryEffort.value = "high";
  configuredPrimaryEffort.dispatch("change");
  assert.equal(saves.length, 1, "choosing a Notion Effort must start an autosave");
  assert.equal(
    saves[0].patch.modelPreferences[NOTION_EFFORT_PREFERENCE_KEY].opus47,
    "high",
    "Notion Effort must persist by model id"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "Notion Effort autosave did not settle");
  saves.splice(0);

  thinkingLevelRadios.forEach((node) => { node.checked = node.value === "extended"; });
  thinkingLevelRadios.find((node) => node.value === "extended").dispatch("change");
  assert.equal(saves.length, 1, "changing Thinking level must start an autosave");
  assert.equal(
    saves[0].patch.modelPreferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY],
    "extended",
    "Thinking level must keep its stable persisted value"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "Thinking level autosave did not settle");
  assert.equal(
    ports.preferredModel.options.modelPreferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY],
    "extended",
    "the saved Thinking level must become visible to runtime readers"
  );
  saves.splice(0);

  allSourcesRadios.forEach((node) => { node.checked = node.value === "enabled"; });
  allSourcesRadios.find((node) => node.value === "enabled").dispatch("change");
  assert.equal(saves.length, 1, "changing All sources must start an autosave");
  assert.equal(
    saves[0].patch.modelPreferences[NOTION_ALL_SOURCES_PREFERENCE_KEY],
    "enabled",
    "the tri-state value must use the stable persisted key"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "All sources autosave did not settle");
  assert.equal(
    ports.preferredModel.options.modelPreferences[NOTION_ALL_SOURCES_PREFERENCE_KEY],
    "enabled",
    "the saved All sources preference must become visible to runtime readers"
  );
  saves.splice(0);

  const clearButton = findNode(pane, (node) => node.classList?.contains("button-secondary"));
  assert.ok(clearButton, "the preferred-model pane must expose its Clear action");
  clearButton.dispatch("click");
  assert.equal(saves.length, 1, "Clear must persist the default model-preference object");
  assert.equal(
    saves[0].patch.modelPreferences[NOTION_ALL_SOURCES_PREFERENCE_KEY],
    "",
    "Clear must reset All sources to no preference"
  );
  assert.equal(
    saves[0].patch.modelPreferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY],
    "standard",
    "Clear must reset Thinking level to Standard"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "clearing model preferences did not settle");
  const clearedPane = section.pane(() => { redrawCalls += 1; });
  const clearedThinkingLevelGroup = findNode(
    clearedPane,
    (node) => node.dataset?.modelPreferenceThinkingLevelAppId === "Gemini"
  );
  const clearedThinkingLevelRadios = findNodes(
    clearedThinkingLevelGroup,
    (node) => node.tagName === "INPUT" && node.getAttribute("type") === "radio"
  );
  const clearedAllSourcesGroup = findNode(
    clearedPane,
    (node) => node.dataset?.modelPreferenceAllSourcesAppId === "NotionAI"
  );
  const clearedAllSourcesRadios = findNodes(
    clearedAllSourcesGroup,
    (node) => node.tagName === "INPUT" && node.getAttribute("type") === "radio"
  );
  assert.deepEqual(
    clearedAllSourcesRadios.map((node) => node.checked),
    [true, false, false],
    "Clear must redraw All sources with no-interference selected"
  );
  assert.deepEqual(
    clearedThinkingLevelRadios.map((node) => node.checked),
    [true, false],
    "Clear must redraw Thinking level with Standard selected"
  );
  saves.splice(0);

  allSourcesRadios.forEach((node) => { node.checked = node.value === "disabled"; });
  allSourcesRadios.find((node) => node.value === "disabled").dispatch("change");
  assert.equal(saves.length, 1, "All sources Off must start an autosave");
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "All sources Off autosave did not settle");
  assert.equal(
    ports.preferredModel.options.modelPreferences[NOTION_ALL_SOURCES_PREFERENCE_KEY],
    "disabled"
  );
  saves.splice(0);

  thinkingLevelRadios.forEach((node) => { node.checked = node.value === "extended"; });
  thinkingLevelRadios.find((node) => node.value === "extended").dispatch("change");
  assert.equal(saves.length, 1, "restoring Extended Thinking level must start an autosave");
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "restoring Extended Thinking level did not settle");
  assert.equal(
    ports.preferredModel.options.modelPreferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY],
    "extended"
  );
  saves.splice(0);
  redrawCalls = 0;

  const savesBeforeTabSwitch = saves.length;
  const appliesBeforeTabSwitch = applyPreferredModelCalls;
  failureTab.dispatch("click");
  assert.equal(rootState.modelPreferenceSettingsTab, "failure", "the failure tab must update UI-only state");
  assert.equal(redrawCalls, 1, "switching tabs must request one redraw");
  assert.equal(saves.length, savesBeforeTabSwitch, "switching tabs must not persist options");
  assert.equal(applyPreferredModelCalls, appliesBeforeTabSwitch, "switching tabs must not apply models");
  const failurePane = section.pane(() => { redrawCalls += 1; });
  globalThis.document.body.append(failurePane);
  const globalPolicy = findNode(
    failurePane,
    (node) => node.dataset?.modelPreferenceFailurePolicy === "global"
  );
  const geminiOverride = findNode(
    failurePane,
    (node) => node.dataset?.modelPreferenceFailureOverrideAppId === "Gemini"
  );
  const failureFields = findNodes(
    failurePane,
    (node) => Boolean(node.dataset?.modelPreferenceFailureAppId)
  );
  const failureOverrides = findNodes(
    failurePane,
    (node) => Boolean(node.dataset?.modelPreferenceFailureOverrideAppId)
  );
  assert.ok(globalPolicy && geminiOverride, "the failure tab must render failure-policy controls");
  assert.equal(
    findNodes(failurePane, (node) => Boolean(node.dataset?.modelPreferenceAppId)).length,
    0,
    "the failure tab must not render the preferred-model list"
  );
  assert.deepEqual(
    failureFields.map((node) => node.dataset.modelPreferenceFailureAppId),
    preferenceOrder,
    "failure overrides must project the saved model preference order"
  );
  assert.deepEqual(
    failureOverrides.map((node) => node.dataset.modelPreferenceFailureOverrideAppId),
    preferenceOrder,
    "failure override controls must not maintain a second order"
  );
  assert.ok(
    failureFields.every((node) => !findNode(node, (child) => child.getAttribute?.("draggable") === "true")),
    "the failure-policy projection must not add a second draggable list"
  );
  const failureSelects = findNodes(failurePane, (node) => node.tagName === "SELECT");
  assert.equal(failureSelects.length, 5, "the failure tab must render the global and four per-site selects");
  assert.ok(
    failureSelects.every((node) => Boolean(node.getAttribute("aria-label")?.trim())),
    "every failure-policy select must have an explicit accessible name"
  );
  const failurePreferredTab = findNode(
    failurePane,
    (node) => node.dataset?.modelPreferenceTabId === "preferred"
  );
  failurePreferredTab.dispatch("click");
  assert.equal(rootState.modelPreferenceSettingsTab, "preferred");
  assert.equal(redrawCalls, 2, "switching back must request one redraw");
  assert.equal(saves.length, savesBeforeTabSwitch, "switching back must not persist options");
  assert.equal(applyPreferredModelCalls, appliesBeforeTabSwitch, "switching back must not apply models");

  const modelStylesStart = stylesSource.indexOf(".model-preferences-pane");
  const modelStylesEnd = stylesSource.indexOf(".prompt-template-list", modelStylesStart);
  const modelStyles = stylesSource.slice(modelStylesStart, modelStylesEnd);
  assert.match(modelStyles, /container-name:\s*model-preferences/);
  assert.match(modelStyles, /\.model-preference-secondary-toggle\s*\{[^}]*display:\s*flex/s);
  assert.match(modelStyles, /\.model-preference-row-models\s*\{[^}]*display:\s*grid/s);
  assert.match(modelStyles, /\.model-preference-failure-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(
    modelStyles,
    /\.model-preference-list \.settings-list-header,\s*\.model-preference-row\s*\{[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+minmax\(140px,\s*180px\)\s+repeat\(2,\s*minmax\(220px,\s*1fr\)\);/s,
    "the wide model list must give the model and additional-option columns equal flexible tracks"
  );
  assert.match(modelStyles, /@container model-preferences \(max-width:\s*700px\)/);
  assert.match(modelStyles, /@container[\s\S]*\.model-preference-failure-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(modelStyles, /@container[\s\S]*\.model-preference-list\s*\{[^}]*display:\s*grid[^}]*overflow:\s*visible/s);
  assert.match(modelStyles, /@container[\s\S]*\.model-preference-row\s*\{[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+minmax\(0,\s*1fr\)/);
  assert.match(
    modelStyles,
    /@container[\s\S]*\.model-preference-row-has-thinking,\s*\.model-preference-row-has-additional\s*\{[^}]*"drag thinking"/s,
    "compact Gemini and Notion rows must allocate the additional-option row"
  );
  assert.match(
    modelStyles,
    /@container[\s\S]*\.model-preference-thinking-field,\s*\.model-preference-additional-field\s*\{[^}]*grid-area:\s*thinking/s,
    "the additional preference must occupy its compact grid area"
  );
  assert.match(
    modelStyles,
    /\.model-preference-segmented-options-two\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    "Thinking level must render as two equal responsive segments"
  );
  assert.match(
    modelStyles,
    /\.model-preference-segmented-options-three\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    "All sources must preserve extra room for its longer no-interference label"
  );
  assert.match(modelStyles, /\.model-preference-segmented-option input:checked \+ \.model-preference-segmented-option-label/);
  assert.match(modelStyles, /\.model-preference-segmented-option input:focus-visible \+ \.model-preference-segmented-option-label/);
  assert.match(
    modelStyles,
    /\.model-preference-model-select,\s*\.model-preference-custom-wrap,\s*\.model-preference-segmented-control\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s,
    "the model select and additional preference must fill their equal desktop columns"
  );
  assert.match(
    modelStyles,
    /@container[\s\S]*\.model-preference-model-select,\s*\.model-preference-custom-wrap,\s*\.model-preference-segmented-control\s*\{[^}]*max-width:\s*none/s,
    "compact segmented controls must use the full available width"
  );
  assert.match(modelStyles, /\.model-preference-segmented-heading\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(modelStyles, /\.model-preference-segmented-info\s*\{[^}]*border-radius:\s*var\(--ui-radius\)/s);
  assert.match(modelStyles, /\.model-preference-segmented-info:focus-visible\s*\{[^}]*box-shadow:/s);
  assert.doesNotMatch(modelStyles, /model-thinking-toggle/);
  assert.doesNotMatch(modelStyles, /model-preference-all-sources-(?:control|heading|title|info|segments|option)/);
  assert.doesNotMatch(modelStyles, /transform:\s*rotate\(-45deg\)/);
  assert.match(modelStyles, /\.model-preference-list\s*\{[^}]*overflow:\s*visible/s);
  assert.doesNotMatch(modelStyles, /\.model-preference-list\s*\{[^}]*overflow:\s*(?:auto|hidden|clip)/s);
  assert.match(modelStyles, /\.model-preference-list \.settings-list-header,\s*\.model-preference-row\s*\{[^}]*min-width:\s*0/s);
  assert.doesNotMatch(modelStyles, /min-width:\s*(?:720|760)px/);
  assert.doesNotMatch(modelStyles, /@media\s*\(max-width:\s*700px\)/);

  const dragData = new Map();
  const dataTransfer = {
    effectAllowed: "",
    dropEffect: "",
    getData: (type) => dragData.get(type) || "",
    setData: (type, value) => dragData.set(type, String(value))
  };
  modelRows[0].dispatch("dragstart", { dataTransfer });
  assert.equal(modelRows[0].classList.contains("dragging"), true, "drag start must mark the source row");
  const beforePreview = modelRows.at(-1).dispatch("dragover", { clientY: 25, dataTransfer });
  assert.equal(beforePreview.defaultPrevented, true, "a valid dragover must accept the drop");
  assert.equal(modelRows.at(-1).classList.contains("drop-before"), true, "upper-half dragover must show drop-before feedback");
  modelRows.at(-1).dispatch("dragleave");
  assert.equal(modelRows.at(-1).classList.contains("drop-before"), false, "dragleave must clear drop feedback");
  modelRows.at(-1).dispatch("dragover", { clientY: 75, dataTransfer });
  assert.equal(modelRows.at(-1).classList.contains("drop-after"), true, "lower-half dragover must show drop-after feedback");
  const redrawsBeforeDrop = redrawCalls;
  modelRows.at(-1).dispatch("drop", { clientY: 75, dataTransfer });
  assert.equal(saves.length, 1, "dropping a model row must persist the new order");
  assert.equal(section.autosaveBusy(), true, "a pending model-order write must participate in config I/O draining");
  assert.equal(redrawCalls, redrawsBeforeDrop + 1, "a successful drop admission must redraw the model list immediately");
  assert.ok(
    modelRows.every((node) => !node.classList.contains("dragging")
      && !node.classList.contains("drop-before")
      && !node.classList.contains("drop-after")),
    "drop admission must clean source and target drag classes"
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "model-order autosave did not settle");
  assert.deepEqual(
    ports.preferredModel.options.modelPreferenceOrder,
    ["DeepSeek", "Gemini", "Grok", "NotionAI"],
    "dropping after the final row must move the first platform to the end"
  );
  saves.splice(0);
  const redrawnPane = section.pane(() => { redrawCalls += 1; });
  globalThis.document.body.append(redrawnPane);
  assert.deepEqual(
    findNodes(redrawnPane, (node) => Boolean(node.dataset?.modelPreferenceAppId))
      .map((node) => node.dataset.modelPreferenceAppId),
    ports.preferredModel.options.modelPreferenceOrder,
    "redraw must project the persisted model order"
  );
  const redrawnRows = findNodes(redrawnPane, (node) => Boolean(node.dataset?.modelPreferenceAppId));
  redrawnRows[0].dispatch("dragstart", { dataTransfer });
  redrawnRows[0].dispatch("dragend");
  assert.equal(redrawnRows[0].classList.contains("dragging"), false, "dragend must clean a cancelled reorder");

  const reorderedFailureTab = findNode(
    redrawnPane,
    (node) => node.dataset?.modelPreferenceTabId === "failure"
  );
  const savesBeforeReorderedTab = saves.length;
  const appliesBeforeReorderedTab = applyPreferredModelCalls;
  reorderedFailureTab.dispatch("click");
  assert.equal(saves.length, savesBeforeReorderedTab, "opening the reordered failure view must not save");
  assert.equal(applyPreferredModelCalls, appliesBeforeReorderedTab, "opening the reordered failure view must not apply models");
  const reorderedFailurePane = section.pane(() => { redrawCalls += 1; });
  globalThis.document.body.append(reorderedFailurePane);
  assert.deepEqual(
    findNodes(reorderedFailurePane, (node) => Boolean(node.dataset?.modelPreferenceFailureAppId))
      .map((node) => node.dataset.modelPreferenceFailureAppId),
    ports.preferredModel.options.modelPreferenceOrder,
    "the failure tab must follow a reordered model list after redraw"
  );

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
    appliesBeforeReorderedTab,
    "failure-strategy changes must not retrigger preferred-model selection"
  );

  saves.splice(0);
  findNode(
    reorderedFailurePane,
    (node) => node.dataset?.modelPreferenceTabId === "preferred"
  ).dispatch("click");
  const customPane = section.pane(() => { redrawCalls += 1; });
  const customSelect = findNode(
    customPane,
    (node) => node.dataset?.modelPreferenceSelectAppId === "NotionAI"
  );
  customSelect.value = "__custom__";
  customSelect.dispatch("change");
  assert.equal(saves.length, 0, "opening Custom name must not persist an empty model");
  const customNamedPane = section.pane(() => { redrawCalls += 1; });
  const customInput = findNode(
    customNamedPane,
    (node) => node.dataset?.modelPreferenceCustomLabelAppId === "NotionAI"
      && node.dataset?.modelPreferenceCustomLabelSlot === "primary"
  );
  assert.ok(customInput, "Custom name must expose an exact picker-name field");
  customInput.value = "GPT-7 Nova";
  customInput.dispatch("change");
  assert.equal(saves.length, 1, "an exact custom picker name must start an autosave");
  assert.deepEqual(
    saves[0].patch.modelPreferences.NotionAI,
    { kind: "label", label: "GPT-7 Nova" }
  );
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "custom-name autosave did not settle");
  assert.deepEqual(
    ports.preferredModel.options.modelPreferences.NotionAI,
    { kind: "label", label: "GPT-7 Nova" }
  );

  saves.splice(0);
  const coercePane = section.pane(() => { redrawCalls += 1; });
  const coerceInput = findNode(
    coercePane,
    (node) => node.dataset?.modelPreferenceCustomLabelAppId === "NotionAI"
      && node.dataset?.modelPreferenceCustomLabelSlot === "primary"
  );
  assert.equal(coerceInput.value, "GPT-7 Nova");
  coerceInput.value = "Fable 5.1 Beta";
  coerceInput.dispatch("change");
  assert.equal(saves.length, 1, "a custom name that matches a shipped alias must persist that id");
  assert.equal(saves[0].patch.modelPreferences.NotionAI, "fable51");
  saves[0].gate.resolve();
  await waitUntil(() => !section.autosaveBusy(), "custom-name coerce autosave did not settle");
  assert.equal(ports.preferredModel.options.modelPreferences.NotionAI, "fable51");
  const coercedPane = section.pane(() => { redrawCalls += 1; });
  assert.equal(
    findNode(
      coercedPane,
      (node) => node.dataset?.modelPreferenceSelectAppId === "NotionAI"
    )?.value,
    "fable51",
    "a coerced custom name must return to the shipped catalog option"
  );
  assert.equal(
    findNode(
      coercedPane,
      (node) => node.dataset?.modelPreferenceCustomLabelAppId === "NotionAI"
    ),
    null,
    "a coerced custom name must hide the exact-name field"
  );

  section.close();
  const storedOptions = JSON.parse(JSON.stringify(dehydrateOptions(persistedOptions)));
  const rehydratedOptions = normalizeOptions(storedOptions);
  assert.equal(
    rehydratedOptions.modelPreferences[NOTION_ALL_SOURCES_PREFERENCE_KEY],
    "disabled",
    "All sources must survive dehydration, serialization, and normalization"
  );
  assert.equal(
    rehydratedOptions.modelPreferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY],
    "extended",
    "Thinking level must survive dehydration, serialization, and normalization"
  );
  assert.equal(
    rehydratedOptions.modelPreferences[NOTION_EFFORT_PREFERENCE_KEY].opus47,
    "",
    "Clear must reset every stored Notion Effort preference"
  );
  assert.equal(
    normalizeOptions({
      ...storedOptions,
      modelPreferences: {
        ...storedOptions.modelPreferences,
        [NOTION_ALL_SOURCES_PREFERENCE_KEY]: "invalid"
      }
    }).modelPreferences[NOTION_ALL_SOURCES_PREFERENCE_KEY],
    "",
    "unknown All sources values must normalize to no preference"
  );
  assert.equal(
    normalizeOptions({
      ...storedOptions,
      modelPreferences: {
        ...storedOptions.modelPreferences,
        [NOTION_EFFORT_PREFERENCE_KEY]: { opus47: "xhigh" }
      }
    }).modelPreferences[NOTION_EFFORT_PREFERENCE_KEY].opus47,
    "",
    "an Effort outside the selected model range must normalize to no preference"
  );
  assert.equal(
    normalizeOptions({
      ...storedOptions,
      modelPreferences: {
        ...storedOptions.modelPreferences,
        [NOTION_EFFORT_PREFERENCE_KEY]: { opus47: "high" }
      }
    }).modelPreferences[NOTION_EFFORT_PREFERENCE_KEY].opus47,
    "high",
    "a valid Effort must survive normalization for its selected model"
  );
  const normalizedSecondary = normalizeOptions({
    ...storedOptions,
    modelPreferences: {
      NotionAI: "opus47",
      [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
      [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5"
    }
  }).modelPreferences;
  assert.equal(normalizedSecondary[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY], true);
  assert.equal(normalizedSecondary[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI], "fable5");
  assert.equal(
    normalizeOptions({
      ...storedOptions,
      modelPreferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: "true",
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "opus47"
      }
    }).modelPreferences[MODEL_PREFERENCE_SECONDARY_ENABLED_KEY],
    false,
    "only a stored boolean true may enable secondary-model fallback"
  );
  assert.equal(
    normalizeOptions({
      ...storedOptions,
      modelPreferences: {
        NotionAI: "opus47",
        [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
        [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "opus47"
      }
    }).modelPreferences[MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI],
    "",
    "normalization must reject a secondary model that duplicates the preferred model"
  );
  assert.deepEqual(
    rehydratedOptions.modelPreferenceOrder,
    ["DeepSeek", "Gemini", "Grok", "NotionAI"],
    "model order must survive dehydration, serialized storage, and normalization"
  );
  assert.deepEqual(
    normalizeOptions({
      ...storedOptions,
      modelPreferenceOrder: ["Grok", "unknown", "Grok"]
    }).modelPreferenceOrder,
    ["Grok", "Gemini", "DeepSeek", "NotionAI"],
    "normalization must discard duplicates and unknowns while appending missing built-ins"
  );
  const reloadedRootState = stateModule.createAppState();
  reloadedRootState.options = rehydratedOptions;
  const reloadedPorts = stateModule.createFeatureStatePorts(reloadedRootState);
  const reloadedSection = modelsModule.createModelsSettingsSection({
    state: reloadedPorts.settingsSections.models,
    svgIcon: () => new FakeNode("svg"),
    notifyConfigReload: async () => {},
    saveOptionsPatch: async () => { throw new Error("reloaded render must not save"); },
    applyPreferredModels: async () => {}
  });
  let reloadedRedrawCalls = 0;
  assert.equal(reloadedRootState.modelPreferenceSettingsTab, "preferred");
  const reloadedPane = reloadedSection.pane(() => { reloadedRedrawCalls += 1; });
  const reloadedAllSourcesGroup = findNode(
    reloadedPane,
    (node) => node.dataset?.modelPreferenceAllSourcesAppId === "NotionAI"
  );
  const reloadedThinkingLevelGroup = findNode(
    reloadedPane,
    (node) => node.dataset?.modelPreferenceThinkingLevelAppId === "Gemini"
  );
  assert.equal(
    findNodes(
      reloadedThinkingLevelGroup,
      (node) => node.tagName === "INPUT" && node.getAttribute("type") === "radio"
    ).find((node) => node.value === "extended")?.checked,
    true,
    "a fresh Settings controller must restore the stored Thinking level"
  );
  assert.equal(
    findNodes(
      reloadedAllSourcesGroup,
      (node) => node.tagName === "INPUT" && node.getAttribute("type") === "radio"
    ).find((node) => node.value === "disabled")?.checked,
    true,
    "a fresh Settings controller must restore the stored All sources preference"
  );
  assert.deepEqual(
    findNodes(reloadedPane, (node) => Boolean(node.dataset?.modelPreferenceAppId))
      .map((node) => node.dataset.modelPreferenceAppId),
    rehydratedOptions.modelPreferenceOrder,
    "a fresh Settings controller must restore the stored model order"
  );
  assert.equal(
    findNodes(reloadedPane, (node) => Boolean(node.dataset?.modelPreferenceFailureAppId)).length,
    0,
    "a fresh Settings controller must open on the preferred tab"
  );
  findNode(
    reloadedPane,
    (node) => node.dataset?.modelPreferenceTabId === "failure"
  ).dispatch("click");
  assert.equal(reloadedRedrawCalls, 1, "the restored failure tab must redraw without persistence");
  const reloadedFailurePane = reloadedSection.pane(() => { reloadedRedrawCalls += 1; });
  assert.deepEqual(
    findNodes(reloadedFailurePane, (node) => Boolean(node.dataset?.modelPreferenceFailureAppId))
      .map((node) => node.dataset.modelPreferenceFailureAppId),
    rehydratedOptions.modelPreferenceOrder,
    "a fresh failure-policy projection must follow the restored model order"
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
