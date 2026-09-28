#!/usr/bin/env node

// Settings explanatory copy lives on a ghost (i) beside the title it explains,
// not in a callout box. The 2026-09-28 report was the Functional Anomalies
// privacy callout; the same audit folded every other static notice box in the
// Settings panes and the editors they open.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

class FakeNode {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.value = "";
    this._text = "";
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get className() { return [...this._classes].join(" "); }
  set className(value) { this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean)); }
  get textContent() {
    if (this.tagName === "#TEXT" || this._text) return this._text;
    return this.children.map((child) => child.textContent || "").join("");
  }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ""); }

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    this.children = [];
    this._text = "";
    this.append(...children);
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ target: this, currentTarget: this });
  }
  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (name === "checked") this.checked = true;
    if (name === "disabled") this.disabled = true;
    if (name === "hidden") this.hidden = true;
  }
  getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  matches(selector) {
    const value = String(selector || "").trim();
    if (value.startsWith(".")) return value.slice(1).split(".").every((name) => this._classes.has(name));
    return this.tagName === value.toUpperCase();
  }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function findAll(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) findAll(child, predicate, found);
  return found;
}

const css = read("styles/chatclub.css");
const settingsSources = fs.readdirSync(path.join(root, "app/settings"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => [name, read(`app/settings/${name}`)]);

// The callout box skin is gone from every Settings module and the stylesheet.
for (const [name, source] of settingsSources) {
  assert.doesNotMatch(source, /settings-info-callout/, `${name} must fold explanatory copy into (i), not a callout box`);
}
assert.doesNotMatch(css, /\.settings-info-callout\b/, "the retired callout box skin must not come back");
assert.doesNotMatch(css, /\.iframe-permission-boundary-note\b|\.iframe-permission-editor-scope\b/);
assert.doesNotMatch(css, /\.functional-anomalies-settings-pane \.functional-anomaly-privacy/);

// One ghost trigger skin: .settings-info-button joins the existing (i) group.
assert.match(css, /\.settings-info-button,\s*\n\.model-preference-segmented-info,\s*\n\.appearance-overlay-info \{[\s\S]*?border:\s*0;/);
assert.match(css, /\.settings-info-button-warning \{\s*color: color-mix\(in srgb, var\(--warning\) 76%, var\(--text\)\);/);
// The (i) help renders as the tooltip's rich card, not the one-line label skin:
// body weight and leading, the backdrop-less surface edge, and a hoverable card.
assert.match(css, /\.global-tooltip\.is-rich \.global-tooltip-label \{[^}]*background: var\(--panel\);[^}]*border: 1px solid var\(--line-strong\);[^}]*font-size: var\(--font-size\);[^}]*font-weight: var\(--font-weight-normal\);[^}]*line-height: 1\.5;/);
assert.match(css, /\.global-tooltip\.is-rich\.is-visible \{\s*pointer-events: auto;\s*\}/);
assert.match(css, /\.global-tooltip\.is-rich::before \{[^}]*inset: calc\(var\(--space-2\) \* -1\);/);
assert.match(css, /\.global-tooltip\.is-warning \.global-tooltip-title \{\s*color: color-mix\(in srgb, var\(--warning\) 76%, var\(--text\)\);/);
assert.match(css, /\.global-tooltip\.is-wrapping \.global-tooltip-label \{[^}]*white-space: normal;/, "plain wrapped tooltips keep their skin");

const sourceOf = (name) => settingsSources.find(([file]) => file === name)[1];

const anomaliesPane = functionSource(sourceOf("functional-anomalies.js"), "pane");
assert.match(anomaliesPane, /settingsInfoTitle\(t\("functionalAnomalies\.title"\), t\("functionalAnomalies\.privacyNotice"\), \{\s*tooltipId: "settings\.functionalAnomalies\.privacy",\s*title: t\("functionalAnomalies\.privacyTitle"\)/);

// Every Settings (i) help trigger shares the rich card, including the ones that
// predate settingsInfoButton.
for (const [name, marker] of [
  ["appearance-model-selection-overlay.js", "appearance-overlay-info tooltip-trigger"],
  ["models.js", "model-preference-segmented-info tooltip-trigger"],
  ["shortcuts.js", "shortcut-help-trigger tooltip-trigger"],
  ["apps.js", "iframe-permission-help-trigger tooltip-trigger"]
]) {
  const source = sourceOf(name);
  const start = source.indexOf(marker);
  assert.ok(start > 0, `${name} lost its (i) help trigger`);
  assert.match(source.slice(start, start + 600), /"data-tooltip-rich": "text"/, `${name} (i) help must use the rich card`);
}
assert.doesNotMatch(anomaliesPane, /functional-anomaly-privacy/);

const exportPane = functionSource(sourceOf("import-export.js"), "importExportPane");
assert.doesNotMatch(exportPane, /io-sensitive-warning/, "the export warning card folds into the Manage Config (i)");
assert.match(exportPane, /exportWarningMessages\(selectedExportKeys\)\.join\("\\n"\)/);

for (const name of ["summary.js", "topic-deletion.js"]) {
  const source = sourceOf(name);
  assert.match(source, /settingsInfoTitle\(t\("userscripts\.permissionNoticeTitle"\), t\("userscripts\.permissionNoticeBody"\), \{\s*tooltipId: "settings\.userscripts\.permission",\s*tone: "warning"/);
  assert.doesNotMatch(source, /el\("p", \{\}, t\("userscripts\.permissionNoticeBody"\)\)/);
}
assert.match(sourceOf("summary.js"), /settingsInfoTitle\(t\("summary\.collector\.userscript"\), t\("summary\.collector\.infoBody"\)/);
assert.match(sourceOf("topic-deletion.js"), /settingsInfoTitle\(t\("topicDeletion\.site\.userscript"\), t\("topicDeletion\.site\.infoBody"\)/);
assert.match(sourceOf("message-navigation.js"), /settingsInfoTitle\(t\("messageNavigator\.site\.adapter"\), t\("messageNavigator\.site\.infoBody"\)/);

const iframeEditor = functionSource(sourceOf("apps.js"), "openIframePermissionEditor");
assert.match(iframeEditor, /editorScopeBody[\s\S]*?\\n\$\{t\("apps\.iframe\.permissionBoundary"\)\}/);
assert.match(iframeEditor, /settingsInfoTitle\(t\("apps\.iframe\.riskWarningTitle"\), t\("apps\.iframe\.riskWarningBody"\), \{\s*tooltipId: "settings\.apps\.iframe\.riskWarning", tone: "warning"/);
assert.doesNotMatch(iframeEditor, /el\("p", \{\}, t\("apps\.iframe\.riskWarningBody"\)\)|iframe-permission-boundary-note/);
// The save-time risk confirmation keeps its warning card: that is a confirmation body.
assert.match(functionSource(sourceOf("apps.js"), "openIframeRiskConfirmation"), /overlay-warning-card iframe-permission-risk-warning/);

(async () => {
  const previous = { Node: globalThis.Node, document: globalThis.document };
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tagName) => new FakeNode(tagName),
    createTextNode: (value) => {
      const node = new FakeNode("#text");
      node._text = String(value);
      return node;
    },
    querySelectorAll: () => []
  };
  try {
    const { setLanguage } = await import(moduleUrl("shared/i18n.js"));
    setLanguage("en", "en");
    const svgIcon = (name) => {
      const node = new FakeNode("svg");
      node.dataset.icon = name;
      return node;
    };

    const { createSettingsKit } = await import(moduleUrl("app/settings/kit.js"));
    const { settingsInfoButton, settingsInfoTitle } = createSettingsKit({ svgIcon });
    const info = settingsInfoButton("Line one\nLine two", {
      tooltipId: "settings.io.exportSensitive", id: "probe-help", tone: "warning", title: "Heading", list: true
    });
    assert.equal(info.tagName, "BUTTON");
    assert.equal(info.getAttribute("type"), "button");
    assert.equal(info.getAttribute("id"), "probe-help");
    assert.equal(info.getAttribute("aria-label"), "Heading", "a titled card names its (i) by the title");
    assert.equal(info.getAttribute("data-tooltip"), "Line one\nLine two");
    assert.equal(info.getAttribute("data-tooltip-id"), "settings.io.exportSensitive");
    assert.equal(info.getAttribute("data-tooltip-rich"), "list");
    assert.equal(info.getAttribute("data-tooltip-title"), "Heading");
    assert.equal(info.getAttribute("data-tooltip-tone"), "warning");
    assert.equal(info.getAttribute("data-tooltip-wrap"), null, "the rich card, not the wrapped label skin, carries (i) help");
    assert.equal(info.getAttribute("data-tooltip-placement"), null, "the rich card places itself beside the (i)");
    assert.ok(info.classList.contains("settings-info-button") && info.classList.contains("tooltip-trigger"));
    assert.ok(info.classList.contains("settings-info-button-warning"));
    assert.equal(info.children[0].dataset.icon, "info");
    const plain = settingsInfoButton("Help", { tooltipId: "settings.functionalAnomalies.privacy" });
    assert.equal(plain.getAttribute("id"), null, "an info trigger without an id must not stamp an empty id");
    assert.equal(plain.getAttribute("aria-label"), "Help", "an untitled (i) is named by its help");
    assert.equal(plain.getAttribute("data-tooltip-rich"), "text");
    assert.equal(plain.getAttribute("data-tooltip-title"), null);
    assert.equal(plain.getAttribute("data-tooltip-tone"), null);
    assert.equal(plain.classList.contains("settings-info-button-warning"), false);
    const title = settingsInfoTitle("Records", "Help", { tooltipId: "settings.functionalAnomalies.privacy" });
    assert.ok(title.classList.contains("settings-info-title"));
    assert.equal(title.children[0].textContent, "Records");
    assert.ok(title.children[1].classList.contains("settings-info-button"));

    const { createImportExportSettings } = await import(moduleUrl("app/settings/import-export.js"));
    const settings = createImportExportSettings({
      state: {
        storedOptions: {},
        options: {},
        customConfig: [],
        promptLibrary: [],
        promptSendHistory: [],
        shortcutConfig: {},
        pocketEntries: []
      },
      svgIcon,
      notifyConfigReload: async () => {},
      hydrateImportedLayoutIfNeeded: () => false,
      reconcileAppCatalog: async () => {},
      syncI18nLanguage() {},
      render() {},
      importConfigPatch: async () => ({}),
      resetConfig: async () => ({}),
      reloadAfterConfigReset() {}
    });
    const pane = settings.importExportPane(() => {});
    assert.equal(pane.querySelectorAll(".io-sensitive-warning").length, 0, "Manage Config must not render the warning card");
    const warning = findAll(pane, (node) => node.getAttribute?.("data-tooltip-id") === "settings.io.exportSensitive")[0];
    assert.ok(warning?.classList.contains("settings-info-button-warning"), "the sensitive-export (i) keeps warning ink");
    assert.ok(warning.parentElement.classList.contains("settings-info-title"));
    assert.match(warning.parentElement.textContent, /Manage Config/);
    assert.equal(warning.hidden, false);
    const lines = warning.getAttribute("data-tooltip").split("\n");
    assert.deepEqual(lines, [
      "Settings exports include API profile keys.",
      "Pocket exports include saved chat content.",
      "Tabs exports include conversation URLs from remembered ChatClub pages.",
      "Prompt exports include saved prompts or recent prompt history."
    ]);
    assert.equal(warning.getAttribute("aria-label"), "Sensitive export contents");
    assert.equal(warning.getAttribute("data-tooltip-title"), "Sensitive export contents");
    assert.equal(warning.getAttribute("data-tooltip-rich"), "list");

    const checkboxes = findAll(pane, (node) => node.tagName === "INPUT" && node.getAttribute("type") === "checkbox");
    assert.equal(checkboxes.length, 7);
    for (const checkbox of checkboxes) {
      checkbox.checked = false;
      checkbox.dispatch("change");
    }
    assert.equal(warning.hidden, true, "an export with no sensitive block must hide the (i)");
    assert.equal(warning.getAttribute("data-tooltip"), "");
    checkboxes[0].checked = true;
    checkboxes[0].dispatch("change");
    assert.equal(warning.hidden, false);
    assert.equal(warning.getAttribute("data-tooltip"), "Settings exports include API profile keys.");
    console.log("settings info fold tests passed");
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
