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
    location: globalThis.location,
    window: globalThis.window
  };
  const first = fixtureElement("user", "first prompt", 1);
  const second = fixtureElement("assistant", "second answer", 2);
  const untypedFirst = fixtureElement("", "alpha payload", 3);
  const untypedSecond = fixtureElement("", "beta payload", 4);
  const composerFake = fixtureElement("user", "composer draft", 5);
  composerFake.closest = (selector) => selector.includes(".official-composer") ? composerFake : null;
  const scrollingElement = { scrollTop: 0 };
  globalThis.Node = { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible", overflow: "visible", overflowY: "visible" });
  globalThis.document = {
    body: null,
    documentElement: null,
    scrollingElement,
    querySelectorAll(selector) {
      if (selector === ".message") return [first, second, first];
      if (selector === ".message-untyped") return [untypedFirst, untypedSecond];
      if (selector === ".official-message") return [first, second, composerFake];
      return [];
    }
  };
  globalThis.window = { innerHeight: 800, scrollY: 0 };
  globalThis.location = { href: "https://chatgpt.com/new/thread" };

  try {
    const adapterModule = await import(moduleUrl("content-src/message-navigator/adapters.js"));
    const collectionModule = await import(moduleUrl("content-src/message-navigator/collection-kernel.js"));
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
    const strictConfig = {
      messageSelector: ".message-untyped",
      summaryMaxChars: 60,
      strictOfficialRoles: true,
      officialRuleRevision: 1
    };
    assert.deepEqual(adapters.generic.collect(strictConfig), [], "strict official fallback must not default messages to assistant");
    assert.deepEqual(adapters.chatgpt.collect(strictConfig), [], "strict official fallback must not use ChatGPT parity roles");
    assert.deepEqual(adapters.kagi.collect(strictConfig), [], "strict official fallback must not use Kagi parity roles");
    const officialConfig = {
      officialRuleHints: {
        conversationRoot: [],
        message: [".official-message"],
        userRole: ["[data-message-author-role='user']"],
        assistantRole: ["[data-message-author-role='assistant']"],
        content: [],
        effectTarget: [],
        exclude: [],
        composer: [".official-composer"]
      },
      summaryMaxChars: 60
    };
    first.matches = (selector) => selector.includes("data-message-author-role='user'");
    second.matches = (selector) => selector.includes("data-message-author-role='assistant'");
    composerFake.matches = (selector) => selector.includes("data-message-author-role='user'");
    assert.deepEqual(
      collectionModule.collectOfficialRuleItems(officialConfig).map(({ role, text }) => ({ role, text })),
      [{ role: "user", text: "first prompt" }, { role: "assistant", text: "second answer" }],
      "official collection must exclude composer descendants and require explicit remote roles"
    );
    assert.deepEqual(collectionModule.collectOfficialRuleItems({
      ...officialConfig,
      officialRuleHints: {
        ...officialConfig.officialRuleHints,
        userRole: [".remote-user-missing"],
        assistantRole: [".remote-assistant-missing"]
      }
    }, {
      role: (element) => element.getAttribute("data-message-author-role")
    }), [], "packaged adapter roles must never fill missing remote roles inside the official collector");

    assert.throws(() => new engineModule.MessageNavigator(), /requires version/);
    assert.throws(
      () => new engineModule.MessageNavigator({ version: "1", adapters: {} }),
      /requires a generic adapter/
    );
    const engine = new engineModule.MessageNavigator({ version: "1", adapters });
    assert.equal(engine.state().version, "1");
    const unknownRoleEngine = new engineModule.MessageNavigator({
      version: "1",
      adapters: {
        generic: {
          collect() {
            return [
              { element: untypedFirst, target: untypedFirst, role: "", text: "alpha payload" },
              { element: untypedSecond, target: untypedSecond, text: "beta payload" }
            ];
          }
        }
      }
    });
    unknownRoleEngine.config = {
      adapter: "generic",
      officialRuleRevision: 1,
      officialRuleHosts: ["chatgpt.com"],
      officialRulePathPrefixes: ["/new"],
      officialRuleHints: {
        message: [".official-message"],
        userRole: [".official-user"],
        assistantRole: [".official-assistant"],
        composer: [".official-composer"]
      },
      summaryMaxChars: 60
    };
    assert.deepEqual(
      unknownRoleEngine.collect(),
      [],
      "official-rule fallback must drop adapter items whose roles remain unknown"
    );
    unknownRoleEngine.config.officialRuleHints = {
      message: [],
      userRole: [],
      assistantRole: [],
      composer: []
    };
    assert.deepEqual(
      unknownRoleEngine.collect(),
      [],
      "an in-scope official revision with empty selectors must keep the packaged fallback in strict-role mode"
    );
    globalThis.location.href = "https://sibling.chatgpt.com/new/thread";
    assert.equal(
      unknownRoleEngine.collect().length,
      2,
      "an out-of-scope URL may retain the packaged adapter's legacy role fallback"
    );
    globalThis.location.href = "https://chatgpt.com/new/thread";

    const scopedEngine = new engineModule.MessageNavigator({ version: "1", adapters });
    scopedEngine.config = {
      adapter: "generic",
      messageSelector: ".message",
      officialRuleRevision: 1,
      officialRuleHosts: ["chatgpt.com"],
      officialRulePathPrefixes: ["/new"],
      officialRuleHints: officialConfig.officialRuleHints,
      summaryMaxChars: 60
    };
    globalThis.location.href = "https://sibling.chatgpt.com/new/thread";
    assert.equal(scopedEngine.collect()[0]?.officialStrict, undefined, "a wildcard sibling must use the packaged Message Navigator adapter only");
    globalThis.location.href = "https://chatgpt.com/old/thread";
    assert.equal(scopedEngine.collect()[0]?.officialStrict, undefined, "a packaged-only path must use the packaged Message Navigator adapter only");
    globalThis.location.href = "https://chatgpt.com/new/thread";
    assert.equal(scopedEngine.collect()[0]?.officialStrict, true, "the exact signed HTTPS host and path may use official Message Navigator hints");

    const entrySource = read("content-src/message-navigator.js");
    const adapterSource = read("content-src/message-navigator/adapters.js");
    const engineSource = read("content-src/message-navigator/engine.js");
    assert.ok(entrySource.split(/\r?\n/).length < 80, "Message Navigator entry must stay an installation boundary");
    assert.doesNotMatch(adapterSource, /\bdependencies\s*=\s*\{\}/);
    assert.doesNotMatch(adapterSource, /safeQsa|resolveEffectTarget|grokDomItems/);
    assert.doesNotMatch(engineSource, /grokDomItems|notionDomFallbackItems|kagiDomFallbackItems/);
    assert.match(
      engineSource,
      /officialStrictRoles\s*\?\s*""\s*:\s*"assistant"/,
      "official-rule fallback must reject unknown roles instead of defaulting them to assistant"
    );
    assert.match(engineSource, /this\.messagesSignature/);
    assert.match(engineSource, /record\.target === this\.root \|\| this\.root\.contains\(record\.target\)/);
    assert.match(engineSource, /signature === this\.messagesSignature && this\.messages\.length === messages\.length/);
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
