#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const css = read("styles/chatclub.css");
  const kit = read("app/settings/kit.js");
  const apps = read("app/settings/apps.js");
  const iconEditor = read("app/settings/app-icon.js");
  const agents = read("AGENTS.md");

  assert.match(css, /--settings-site-mark:\s*calc\(var\(--target-min\) \+ var\(--space-1\)\)/);
  assert.match(
    css,
    /\.built-in-config-row \{[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+var\(--settings-site-mark\)/s
  );
  assert.match(
    css,
    /\.custom-config-row \{[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+var\(--settings-site-mark\)/s
  );
  assert.match(css, /\.settings-site-mark-cell \{/);
  assert.doesNotMatch(
    css,
    /html:not\(\[data-settings-click-reorder="always"\]\)[^{]*\.settings-reorder \.ui-reorder \{[^}]*position:\s*absolute/s,
    "compact chevrons must stay in-flow inside the cluster"
  );
  assert.doesNotMatch(css, /settings-list-row:focus-within \.settings-reorder \.ui-reorder/);
  assert.match(css, /html:not\(\[data-settings-click-reorder="always"\]\) \.settings-reorder \.ui-reorder \{[^}]*width:\s*0/s);
  assert.doesNotMatch(css, /settings-reorder:focus-within \.ui-reorder/);
  assert.doesNotMatch(css, /settings-reorder-click-path/);
  assert.doesNotMatch(css, /settings-list:has\(\.settings-reorder:focus-within\)/);

  assert.doesNotMatch(kit, /bindSettingsClickReorderPath/);
  assert.doesNotMatch(kit, /closest\?\.\("\.settings-list-row"\)/);

  assert.match(apps, /appIcons\.identityCells\(app, displayAppName\(app\), redraw\)/);
  assert.match(apps, /"", "", t\("apps\.platformName"\)/);
  assert.doesNotMatch(apps, /appIcons\.nameCell\(app, displayAppName\(app\), redraw\)/);

  assert.match(iconEditor, /function markCell/);
  assert.match(iconEditor, /class: "settings-site-mark-cell"/);
  assert.match(iconEditor, /class: "settings-site-icon-button"/);
  const nameCellSource = iconEditor.slice(iconEditor.indexOf("function nameCell"), iconEditor.indexOf("function editorField"));
  assert.match(nameCellSource, /settings-name-cell/);
  assert.doesNotMatch(nameCellSource, /settings-site-icon-button/, "name cell must not wrap the favicon button");

  assert.match(agents, /never on whole-row `:focus-within`/);
  assert.match(agents, /`--settings-site-mark`/);
  assert.match(agents, /three leading tracks/);
  assert.match(agents, /Hidden click-reorder is the default/);
  assert.match(agents, /App picker popover/);

  class FakeNode {
    constructor(tag = "div") {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.className = "";
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = Object.create(null);
      this.parent = null;
      this.classList = {
        add: (name) => {
          const parts = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
          parts.add(String(name || ""));
          this.className = [...parts].join(" ");
        },
        remove: (name) => {
          this.className = String(this.className || "").split(/\s+/).filter((part) => part && part !== name).join(" ");
        }
      };
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === "class") this.className = String(value);
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    append(...children) {
      for (const child of children.filter(Boolean)) {
        if (child && typeof child === "object") child.parent = this;
        this.children.push(child);
      }
    }

    addEventListener(name, listener) {
      const key = String(name || "");
      if (!this.listeners[key]) this.listeners[key] = [];
      this.listeners[key].push(listener);
    }
  }

  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (value) => {
      const node = new FakeNode("#text");
      node.textContent = String(value);
      return node;
    },
    addEventListener() {},
    querySelectorAll() { return []; }
  };

  try {
    const { createSettingsKit } = await import(moduleUrl("app/settings/kit.js"));
    const kitApi = createSettingsKit({
      svgIcon: () => {
        const icon = new FakeNode("span");
        icon.className = "svg-icon";
        return icon;
      }
    });
    const cluster = kitApi.settingsReorderHandle("Platform", {
      ids: ["a", "b"],
      id: "b",
      onMove() {}
    });
    assert.doesNotMatch(cluster.className, /settings-reorder-click-path/, "hidden mode must not arm a click-path");
    assert.equal(globalThis.document._pointerdown, undefined, "hidden mode must not bind a click-path pointer listener");
  } finally {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  console.log("compact reorder layout: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
