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
assert.doesNotMatch(sidebar, /function openSearch\(/);
assert.doesNotMatch(sidebar, /setSearchQuery/);
assert.doesNotMatch(tabSearch, /renderWorkspaceTabSearchField/);
assert.doesNotMatch(runtime, /openWorkspaceHistory:/);
assert.match(controller, /function openSearchPanel\(options = \{\}\)/);
assert.match(controller, /seed\.query/);
assert.match(controller, /seed\.workspaceId/);
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
assert.match(controller, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(controller, /pinOverlaySearchCaret\(\)/);
assert.match(controller, /releaseOverlaySearchCaret/);
assert.doesNotMatch(controller, /restoreSearchFieldAfterFrameLoad/);
assert.doesNotMatch(controller, /FRAME_LOAD_SEARCH_FOCUS/);
assert.doesNotMatch(controller, /addEventListener\("load"/);
assert.match(controller, /searchComposing/);
assert.match(controller, /workspace\.tabs\.searchOpenTab/);
assert.doesNotMatch(controller, /from "\.\.\/history\/model\.js"/);
assert.doesNotMatch(controller, /from "\.\.\/summary\/markdown\.js"/);
assert.match(tabSearch, /export function collectWorkspaceSearchRecords/);
assert.match(tabSearch, /export function groupWorkspaceSearchRecords/);
assert.match(tabSearch, /export function highlightQuery/);
assert.match(tabSearch, /searchWorkspaceTabFullTextHits/);
assert.match(tabSearch, /findFullTextQueryRanges/);
assert.match(tabSearch, /matchKind/);
assert.match(tabSearch, /prompt-search-option-snippet|clipSearchSnippet|bodySnippetFromHits/);
assert.doesNotMatch(tabSearch, /workspaceIdsMatchingFullText/);
assert.match(tabSearch, /export function formatWorkspaceSearchTime/);
assert.match(tabSearch, /export function workspaceSearchCopy/);
assert.match(tabSearch, /month: "short", day: "numeric"/);
assert.doesNotMatch(tabSearch, /export function workspaceSearchRecordTime/);
assert.match(controller, /formatWorkspaceSearchTime/);
assert.match(controller, /workspaceSearchCopy\(\{[\s\S]*voice:\s*"viewer"/);
assert.doesNotMatch(controller, /workspaceSearchRecordTime/);
assert.match(runtime, /formatTime:\s*formatWorkspaceSearchTime/);
assert.match(runtime, /workspaceSearchCopy\(\{[\s\S]*voice:\s*"composer"/);
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
assert.match(i18n, /"composer\.search\.placeholderFullText": "Search chats or full text"/);
assert.match(i18n, /"composer\.search\.placeholderFullText": "搜索对话或全文"/);
assert.match(i18n, /"composer\.search\.results": "Search results"/);
assert.match(i18n, /"composer\.search\.results": "搜索结果"/);
assert.match(agents, /workspaceSearchCopy/);
assert.match(agents, /formatWorkspaceSearchTime/);
assert.match(agents, /composer\.search\.placeholderFullText/);
assert.match(agents, /Topbar Search enters composer search mode/);
assert.match(agents, /lazy `viewerModal` Tabs search viewer remains the deep-link preview/);
assert.match(agents, /titlebar search inputs stay mounted across query redraws/);
assert.match(agents, /iframe load and frame restore must not move focus back to `\.prompt-input`/);
assert.match(agents, /the titlebar search is the unique caret owner/);
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
      formatWorkspaceSearchTime,
      groupWorkspaceSearchRecords,
      highlightQuery,
      workspaceSearchCopy
    } = await import(pathToFileURL(path.join(root, "app/workspace/tab-search.js")).href);
    const { setLanguage } = await import(pathToFileURL(path.join(root, "shared/i18n.js")).href);
    setLanguage("en");

    const composerCopy = workspaceSearchCopy({ fullTextEnabled: false, voice: "composer" });
    assert.equal(composerCopy.placeholder, "Search chats");
    assert.equal(composerCopy.empty, "No matching chats");
    assert.equal(composerCopy.results, "Search results");
    assert.equal(
      workspaceSearchCopy({ fullTextEnabled: true, voice: "composer" }).placeholder,
      "Search chats or full text"
    );
    const viewerCopy = workspaceSearchCopy({ fullTextEnabled: false, voice: "viewer" });
    assert.equal(viewerCopy.placeholder, "Search titles");
    assert.equal(viewerCopy.empty, "No matching tabs");
    assert.equal(viewerCopy.results, "Search results");
    assert.equal(
      workspaceSearchCopy({ fullTextEnabled: true, voice: "viewer" }).placeholder,
      "Search titles or full text"
    );
    const recencyLabel = formatWorkspaceSearchTime({ viewedAt: Date.UTC(2026, 8, 10) });
    assert.equal(recencyLabel, formatWorkspaceSearchTime(Date.UTC(2026, 8, 10)));
    assert.ok(String(recencyLabel || "").trim(), "recency time must render a short month-day label");

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
    assert.equal(recents.every((record) => record.matchKind == null && record.snippet == null), true, "empty query must not set matchKind or snippet");

    const titleHits = collectWorkspaceSearchRecords({ items, store, query: "Closed", fullTextEnabled: true });
    assert.deepEqual(titleHits.map((record) => record.workspaceId), ["page-closedxxxxxxx"]);
    assert.equal(titleHits[0].matchKind, "title");
    assert.equal(titleHits[0].snippet, undefined);

    const appHits = collectWorkspaceSearchRecords({ items, store, query: "ChatGPT", fullTextEnabled: false });
    assert.deepEqual(appHits.map((record) => record.workspaceId), ["page-closedxxxxxxx"]);
    assert.equal(appHits[0].matchKind, "app");
    assert.equal(appHits[0].snippet, undefined);

    const fulltextHits = collectWorkspaceSearchRecords({ items, store, query: "unique-fulltext-hit", fullTextEnabled: true });
    assert.deepEqual(fulltextHits.map((record) => record.workspaceId).sort(), ["page-forgottenxxx", "page-livexxxxxxxx"]);
    const liveBody = fulltextHits.find((record) => record.workspaceId === "page-livexxxxxxxx");
    const forgottenBody = fulltextHits.find((record) => record.workspaceId === "page-forgottenxxx");
    assert.equal(liveBody.matchKind, "body");
    assert.match(String(liveBody.snippet || ""), /unique-fulltext-hit/);
    assert.equal(forgottenBody.matchKind, "body");
    assert.match(String(forgottenBody.snippet || ""), /unique-fulltext-hit/);
    assert.ok(String(liveBody.snippet || "").length <= 98, "body snippet must stay a single clipped line");

    const longBody = collectWorkspaceSearchRecords({
      items,
      store: {
        ...store,
        "page-livexxxxxxxx": {
          ...store["page-livexxxxxxxx"],
          frames: [{
            ...store["page-livexxxxxxxx"].frames[0],
            messages: [
              { role: "user", text: `${"padding ".repeat(40)}unique-fulltext-hit sits far from the start ${"tail ".repeat(40)}` },
              { role: "assistant", text: "done" }
            ]
          }]
        }
      },
      query: "unique-fulltext-hit",
      fullTextEnabled: true
    }).find((record) => record.workspaceId === "page-livexxxxxxxx");
    assert.equal(longBody.matchKind, "body");
    assert.match(String(longBody.snippet || ""), /unique-fulltext-hit/);
    assert.match(String(longBody.snippet || ""), /…/);
    assert.ok(String(longBody.snippet || "").length <= 98, "long body hits clip to one ellipsis line");

    const disabled = collectWorkspaceSearchRecords({ items, store, query: "unique-fulltext-hit", fullTextEnabled: false });
    assert.deepEqual(disabled, [], "full-text leftover must stay hidden while Record full text is off");
    assert.equal(disabled.every((record) => record.matchKind !== "body"), true);

    const marked = highlightQuery("Closed research ＡＢＣ", "abc");
    const mark = marked.find((node) => node?.className === "workspace-tabs-search-mark");
    assert.equal(Boolean(mark), true, "highlightQuery must mark NFKC-folded fullwidth hits");
    assert.equal(mark.children[0]?.textContent, "ＡＢＣ");

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
