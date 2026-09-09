#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const runtime = read("app/runtime.js");
const controller = read("app/workspace/tab-search-controller.js");
const tabSearch = read("app/workspace/tab-search.js");
const sidebar = read("app/workspace/tabs-sidebar-controller.js");
const css = read("styles/chatclub.css");
const i18n = read("shared/i18n.js");
const agents = read("AGENTS.md");
const budgets = JSON.parse(read("tools/native-entry-budgets.json"));

assert.match(runtime, /import\("\.\/workspace\/tab-search-controller\.js"\)/);
assert.match(runtime, /function ensureTabSearchController\(/);
assert.match(runtime, /openSearchPanel/);
assert.doesNotMatch(runtime, /workspaceTabsSidebarController\.openSearch/);
assert.doesNotMatch(runtime, /openWorkspaceHistory:/);
assert.match(controller, /viewerModal\(t\("workspace\.tabs\.searchTitle"\)/);
assert.match(controller, /createViewerWindowChrome/);
assert.match(controller, /workspace-tabs-search-window-button overlay-window-button/);
assert.match(controller, /classList\.add\("workspace-tabs-search-overlay"\)/);
assert.match(controller, /classList\.add\("workspace-tabs-search-modal"\)/);
assert.doesNotMatch(controller, /HTMLDialogElement|showModal\(|<dialog/);
assert.doesNotMatch(controller, /\bmodal\s*\(/);
assert.match(controller, /pocket-entry-cluster/);
assert.match(controller, /pocketPairsFromMessages/);
assert.match(controller, /pocketPagesFromWorkspaceFullText/);
assert.match(controller, /groupWorkspaceSearchRecords/);
assert.match(controller, /collectWorkspaceSearchRecords/);
assert.match(controller, /compositionstart/);
assert.match(controller, /keyCode === 229/);
assert.match(controller, /event\.key === "Escape" && searchQuery/);
assert.doesNotMatch(controller, /event\.key === "Escape" && query/);
assert.doesNotMatch(controller, /clear\(titlebar\)/);
assert.match(controller, /querySelector\("\.workspace-tabs-search-field"\)/);
assert.match(controller, /clearButton\.hidden/);
assert.match(controller, /event\.target\?\.isConnected === false/);
assert.match(controller, /addEventListener\("load", restoreSearchFieldAfterFrameLoad, true\)/);
assert.match(controller, /searchFocused \|\| String\(searchQuery/);
assert.match(controller, /classList\?\.contains\?\.\("chat-frame"\)/);
assert.match(controller, /workspace\.tabs\.searchOpenTab/);
assert.doesNotMatch(controller, /from "\.\.\/history\/model\.js"/);
assert.doesNotMatch(controller, /from "\.\.\/summary\/markdown\.js"/);
assert.match(tabSearch, /export function collectWorkspaceSearchRecords/);
assert.match(tabSearch, /export function groupWorkspaceSearchRecords/);
assert.match(tabSearch, /export function highlightQuery/);
assert.doesNotMatch(tabSearch, /leftoverWorkspaceTabFullTextHits/);
assert.doesNotMatch(tabSearch, /renderWorkspaceTabSearchHits/);
assert.doesNotMatch(sidebar, /previewSearchWorkspace/);
assert.doesNotMatch(sidebar, /renderWorkspaceTabSearchHits/);
assert.match(css, /width:\s*var\(--overlay-width-workspace\)/);
assert.match(css, /\.modal\.workspace-tabs-search-modal \{/);
assert.match(css, /\.workspace-tabs-search-window-button/);
assert.match(css, /\.workspace-tabs-search-mark/);
assert.match(css, /\.shortcut-search-clear\[hidden\]/);
assert.match(i18n, /"workspace\.tabs\.searchTitle": "Search"/);
assert.match(i18n, /"workspace\.tabs\.searchTitle": "搜索"/);
assert.match(i18n, /"workspace\.tabs\.searchPreviewEmpty"/);
assert.match(i18n, /"workspace\.tabs\.searchOpenTab"/);
assert.match(i18n, /"workspace\.tabs\.searchClear"/);
assert.match(i18n, /"workspace\.tabs\.searchSidebar"/);
assert.match(agents, /Topbar Search opens a lazy `viewerModal` Tabs search viewer/);
assert.match(agents, /titlebar search inputs stay mounted across query redraws/);
assert.match(agents, /iframe load and frame restore must not move focus back to `\.prompt-input`/);
assert.match(agents, /restore the titlebar field after a chat-frame load/);
assert.equal(budgets.lazyBoundaries["app/workspace/tab-search-controller.js"]?.owner, "app/runtime.js");

class FakeNode {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);
    this.style = { setProperty() {} };
    this.classList = {
      contains: (name) => String(this.className || "").split(/\s+/).includes(name)
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) { this.children.push(...nodes); }
}

const previousGlobals = { Node: globalThis.Node, document: globalThis.document };
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (text) => Object.assign(new FakeNode("#text"), { textContent: String(text) })
};

(async () => {
  try {
    const {
      collectWorkspaceSearchRecords,
      groupWorkspaceSearchRecords
    } = await import(pathToFileURL(path.join(root, "app/workspace/tab-search.js")).href);

    const now = Date.parse("2026-09-09T08:00:00.000Z");
    const items = [
      {
        workspaceId: "page-livexxxxxxxx",
        topicTitle: "Live Grok desk",
        live: true,
        current: true,
        appIds: ["Grok"],
        viewedAt: now,
        updatedAt: now
      },
      {
        workspaceId: "page-closedxxxxxxx",
        topicTitle: "Closed research",
        live: false,
        appIds: ["ChatGPT"],
        viewedAt: now - (2 * 24 * 60 * 60 * 1000),
        detachedAt: now - (2 * 24 * 60 * 60 * 1000)
      },
      {
        workspaceId: "page-livexxxxxxxx",
        topicTitle: "Duplicate id must collapse",
        live: true,
        viewedAt: now
      }
    ];
    const store = {
      "page-livexxxxxxxx": {
        workspaceId: "page-livexxxxxxxx",
        topicTitle: "Live Grok desk",
        updatedAt: new Date(now).toISOString(),
        frames: [{
          appId: "Grok",
          appName: "Grok",
          href: "https://grok.com/c/1",
          messages: [
            { role: "user", text: "Explain leftover needles" },
            { role: "assistant", text: "A leftover is unique-fulltext-hit." }
          ]
        }]
      },
      "page-forgottenxxx": {
        workspaceId: "page-forgottenxxx",
        topicTitle: "Forgotten thread",
        updatedAt: new Date(now - (10 * 24 * 60 * 60 * 1000)).toISOString(),
        frames: [{
          appId: "Claude",
          appName: "Claude",
          href: "https://claude.ai/chat/1",
          messages: [
            { role: "user", text: "unique-fulltext-hit please" },
            { role: "assistant", text: "done" }
          ]
        }]
      }
    };

    const recents = collectWorkspaceSearchRecords({ items, store, query: "", fullTextEnabled: true });
    assert.deepEqual(recents.map((record) => record.workspaceId), ["page-livexxxxxxxx", "page-closedxxxxxxx", "page-forgottenxxx"]);
    assert.equal(recents.filter((record) => record.workspaceId === "page-livexxxxxxxx").length, 1, "one row per workspaceId");
    assert.equal(recents.find((record) => record.workspaceId === "page-forgottenxxx")?.fromTab, false);

    const titleHits = collectWorkspaceSearchRecords({ items, store, query: "Closed", fullTextEnabled: true });
    assert.deepEqual(titleHits.map((record) => record.workspaceId), ["page-closedxxxxxxx"]);

    const fulltextHits = collectWorkspaceSearchRecords({ items, store, query: "unique-fulltext-hit", fullTextEnabled: true });
    assert.deepEqual(fulltextHits.map((record) => record.workspaceId).sort(), ["page-forgottenxxx", "page-livexxxxxxxx"]);

    const disabled = collectWorkspaceSearchRecords({ items, store, query: "unique-fulltext-hit", fullTextEnabled: false });
    assert.deepEqual(disabled, [], "full-text leftover must stay hidden while Record full text is off");

    const groups = groupWorkspaceSearchRecords(recents, now);
    assert.deepEqual(groups.map((group) => group.id), ["today", "pastWeek", "pastMonth"]);
    assert.equal(groups[0].items[0].workspaceId, "page-livexxxxxxxx");

    console.log("tab search popup tests passed");
  } finally {
    if (previousGlobals.Node === undefined) delete globalThis.Node;
    else globalThis.Node = previousGlobals.Node;
    if (previousGlobals.document === undefined) delete globalThis.document;
    else globalThis.document = previousGlobals.document;
  }
})().catch((error) => {
  if (previousGlobals.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previousGlobals.Node;
  if (previousGlobals.document === undefined) delete globalThis.document;
  else globalThis.document = previousGlobals.document;
  console.error(error);
  process.exit(1);
});
