#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function fixtureElement(role, text, order) {
  return {
    nodeType: 1,
    parentElement: null,
    className: `fixture-${role}`,
    innerText: text,
    textContent: text,
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    getAttribute(name) {
      return name === "data-message-author-role" ? role : name === "class" ? this.className : "";
    },
    getBoundingClientRect() {
      return { top: order * 40, bottom: order * 40 + 30, left: 0, right: 300, width: 300, height: 30 };
    },
    compareDocumentPosition(other) {
      return order < other.__order ? 4 : order > other.__order ? 2 : 0;
    },
    contains() { return false; },
    closest() { return null; },
    matches() { return false; },
    querySelectorAll() { return []; },
    cloneNode() {
      return {
        innerText: text,
        textContent: text,
        querySelectorAll() { return []; }
      };
    },
    __order: order
  };
}

(async () => {
  const previous = {
    Node: globalThis.Node,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    window: globalThis.window
  };
  const first = fixtureElement("user", "first prompt", 1);
  const second = fixtureElement("assistant", "second answer", 2);
  const scrollingElement = { scrollTop: 0 };
  globalThis.Node = { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible", overflow: "visible", overflowY: "visible" });
  globalThis.document = {
    body: null,
    documentElement: null,
    scrollingElement,
    querySelectorAll(selector) {
      return selector === ".message" ? [first, second, first] : [];
    }
  };
  globalThis.window = { innerHeight: 800, scrollY: 0 };

  try {
    const adapterModule = await import(moduleUrl("content-src/message-navigator/adapters.js"));
    const engineModule = await import(moduleUrl("content-src/message-navigator/engine.js"));
    const adapters = adapterModule.createMessageNavigatorAdapters();

    assert.deepEqual(Object.keys(adapters).sort(), [...adapterModule.REQUIRED_ADAPTER_IDS].sort());
    assert.equal(Object.isFrozen(adapters), true);
    for (const [id, adapter] of Object.entries(adapters)) {
      assert.equal(Object.isFrozen(adapter), true, `${id} adapter must be immutable`);
      assert.equal(typeof adapter.collect, "function", `${id} adapter must own collect()`);
    }
    assert.throws(
      () => adapterModule.createMessageNavigatorAdapters({ visible: () => true }),
      /do not accept injected callbacks/
    );
    assert.throws(() => adapterModule.validateAdapter("broken", {}), /requires collect/);
    assert.throws(
      () => adapterModule.validateAdapter("broken", { collect() {}, role: "user" }),
      /hook role must be a function/
    );

    const genericItems = adapters.generic.collect({ messageSelector: ".message", summaryMaxChars: 60 });
    assert.deepEqual(
      genericItems.map(({ role, text }) => ({ role, text })),
      [{ role: "user", text: "first prompt" }, { role: "assistant", text: "second answer" }]
    );

    assert.throws(() => new engineModule.MessageNavigator(), /requires version/);
    assert.throws(
      () => new engineModule.MessageNavigator({ version: "1", adapters: {} }),
      /requires a generic adapter/
    );
    const engine = new engineModule.MessageNavigator({ version: "1", adapters });
    assert.equal(engine.state().version, "1");

    const entrySource = read("content-src/message-navigator.js");
    const adapterSource = read("content-src/message-navigator/adapters.js");
    const engineSource = read("content-src/message-navigator/engine.js");
    assert.ok(entrySource.split(/\r?\n/).length < 80, "Message Navigator entry must stay an installation boundary");
    assert.doesNotMatch(adapterSource, /\bdependencies\s*=\s*\{\}/);
    assert.doesNotMatch(adapterSource, /safeQsa|resolveEffectTarget|grokDomItems/);
    assert.doesNotMatch(engineSource, /grokDomItems|notionDomFallbackItems|kagiDomFallbackItems/);
    assert.match(read("content-src/message-navigator/sites/grok.js"), /function grokDomItems/);
    assert.match(read("content-src/message-navigator/sites/notion.js"), /function notionDomFallbackItems/);
    assert.match(read("content-src/message-navigator/sites/kagi.js"), /function kagiDomFallbackItems/);
    assert.match(read("content-src/message-navigator/sites/chatgpt.js"), /function chatgptFallbackItems/);
    assert.match(read("content-src/message-navigator/sites/gemini.js"), /function cleanGeminiText/);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }

  console.log("message navigator module contracts and ownership: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
