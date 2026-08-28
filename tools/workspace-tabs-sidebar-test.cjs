#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

class FakeNode {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);
    this.className = "";
    this.textContent = "";
    this.disabled = false;
    this.value = "";
    this.style = {
      setProperty(name, value) { this[name] = String(value); }
    };
    this.offsetTop = 0;
    this.isConnected = true;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.listeners = Object.create(null);
    this.classList = {
      contains: (name) => String(this.className || "").split(/\s+/).includes(name),
      add: (name) => {
        const values = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
        values.add(name);
        this.className = [...values].join(" ");
      },
      remove: (name) => {
        const values = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
        values.delete(name);
        this.className = [...values].join(" ");
      },
      toggle: (name, force) => {
        const values = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !values.has(name) : Boolean(force);
        if (enabled) values.add(name);
        else values.delete(name);
        this.className = [...values].join(" ");
        return enabled;
      }
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "value") this.value = String(value);
  }

  focus() {}

  select() {}

  addEventListener(name, listener) {
    const key = String(name || "");
    if (!this.listeners[key]) this.listeners[key] = [];
    this.listeners[key].push(listener);
  }

  dispatch(name, event = {}) {
    const payload = { preventDefault() {}, stopPropagation() {}, target: this, ...event };
    if (!payload.target) payload.target = this;
    for (const listener of this.listeners[String(name || "")] || []) listener(payload);
    return payload;
  }

  click(event = {}) {
    const payload = { preventDefault() {}, stopPropagation() {}, currentTarget: this, target: this, ...event };
    for (const listener of this.listeners.click || []) listener(payload);
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 36, left: 0, right: 240, height: 36, width: 240, x: 0, y: 0 };
  }

  append(...children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      const node = child instanceof FakeNode ? child : Object.assign(new FakeNode("#text"), { textContent: String(child) });
      node.parentNode = this;
      this.children.push(node);
    }
  }

  contains(node) {
    if (node === this) return true;
    return descendants(this).includes(node);
  }

  matches(selector) {
    const className = String(selector || "").startsWith(".") ? selector.slice(1) : "";
    return className ? this.classList.contains(className) : false;
  }

  closest(selector) {
    const className = String(selector || "").startsWith(".") ? selector.slice(1) : "";
    let node = this;
    while (node) {
      if (className && node.classList?.contains?.(className)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    return descendants(this).filter((node) => className && node.classList.contains(className));
  }

  replaceWith(next) {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings[siblings.indexOf(this)] = next;
    next.parentNode = this.parentNode;
    this.parentNode = null;
    this.isConnected = false;
  }

  before(next) {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 0, next);
    next.parentNode = this.parentNode;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    this.isConnected = false;
  }
}

function descendants(rootNode) {
  return rootNode.children.flatMap((child) => [child, ...descendants(child)]);
}

function nodeText(node) {
  return [node?.textContent || "", ...(node?.children || []).map(nodeText)].join("");
}

const previousGlobals = {
  Node: globalThis.Node,
  document: globalThis.document
};
globalThis.Node = FakeNode;
const documentBody = new FakeNode("body");
globalThis.document = {
  body: documentBody,
  documentElement: documentBody,
  createElement: (tagName) => new FakeNode(tagName),
  createElementNS: (_ns, tagName) => new FakeNode(tagName),
  createTextNode: (text) => Object.assign(new FakeNode("#text"), { textContent: String(text) }),
  addEventListener() {},
  removeEventListener() {},
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  },
  querySelectorAll(selector) {
    const className = String(selector || "").startsWith(".") ? selector.slice(1).split(/[\s.]+/)[0] : "";
    return descendants(documentBody).filter((node) => className && node.classList.contains(className));
  }
};

(async () => {
  const source = [
    fs.readFileSync(path.join(__dirname, "../app/workspace/tabs-sidebar-controller.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "../app/workspace/tabs-sidebar-item.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "../app/workspace/tabs-sidebar-sort.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "../app/workspace/tabs-sidebar-folders.js"), "utf8")
  ].join("\n");
  const tabSearch = fs.readFileSync(path.join(__dirname, "../app/workspace/tab-search.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../styles/chatclub.css"), "utf8");
  const icons = fs.readFileSync(path.join(__dirname, "../ui/icons.js"), "utf8");
  assert.match(source, /class: "workspace-tabs-sidebar"/);
  assert.match(source, /id: WORKSPACE_TABS_SIDEBAR_ID/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /isDismissalEscape/);
  assert.match(source, /workspaceSessionWorkspaceId/);
  assert.match(source, /syncPageTitle/);
  assert.match(source, /confirmationModal/);
  assert.match(source, /forgetRememberedWorkspaceTab/);
  assert.match(source, /closeOtherLiveWorkspaceTabs/);
  assert.match(source, /moveLiveWorkspaceTabs/);
  assert.match(source, /openWorkspaceTab/);
  assert.match(source, /is-closed/);
  assert.match(css, /\.workspace-tabs-sidebar\s*\{[^}]*position:\s*absolute/, "the sidebar must overlay the workspace instead of taking iframe space");
  assert.match(css, /\.workspace-tabs-sidebar\s*\{[^}]*top:\s*var\(--workspace-tabs-sidebar-top\)/, "the sidebar must start below the topbar instead of covering it");
  assert.match(css, /\.workspace-tabs-sidebar-header\s*\{[^}]*padding:\s*14px/, "the sidebar header must keep top whitespace");
  assert.match(css, /\.workspace-tabs-sidebar-count\s*\{[^}]*border-radius:\s*999px/, "the tab count must render as a pill");
  assert.match(css, /\.workspace-tabs-sidebar-count\s*\{[^}]*background:\s*var\(--primary\)/, "the tab count must use a solid primary fill");
  assert.match(css, /\.workspace-tabs-sidebar-count\s*\{[^}]*color:\s*var\(--bg\)/, "the tab count numeral must contrast against the primary fill");
  assert.match(css, /\.workspace-tabs-sidebar-cleanup/, "ChatClub Tabs must expose a close-others control");
  assert.match(css, /\.workspace-tabs-sidebar-cleanup[\s\S]{0,280}color:\s*var\(--text\)/, "the cleanup icon must use the primary text color");
  assert.match(css, /\.workspace-tabs-sidebar-item-index/, "each tab name must show a sequence number");
  assert.match(css, /\.workspace-tabs-sidebar-item-pin/, "each tab row must expose a pin control");
  assert.match(css, /\.workspace-tabs-sidebar-item-pin-mark/, "pinned tabs must keep a visible pin mark");
  assert.match(css, /\.workspace-tabs-sidebar-resize/, "the sidebar must be resizable by dragging");
  assert.match(css, /@media \(hover: hover\)/, "rename and delete controls must wait for hover");
  assert.match(css, /\.workspace-tabs-sidebar-item-actions:focus-within/, "keyboard focus on an action may reveal hover buttons");
  assert.doesNotMatch(
    css,
    /\.workspace-tabs-sidebar-item:focus-within \.workspace-tabs-sidebar-item-actions/,
    "focusing the title must not reveal hover buttons"
  );
  assert.match(css, /\.workspace-tabs-sidebar-item:has\(:focus-visible\)/, "keyboard focus may highlight a row without a stuck hover overlay");
  assert.match(css, /\.workspace-tabs-sidebar-item-more/, "folded hover buttons must use a more control");
  assert.match(css, /\.workspace-tabs-sidebar-item\.is-menu-open \.workspace-tabs-sidebar-item-actions/, "the more menu must keep hover buttons visible while open");
  assert.match(source, /openHoverMenu/, "folded buttons must open from the three-dot control");
  assert.match(source, /workspace-tabs-sidebar-hover-menu/, "folded buttons must land in a popover");
  assert.match(source, /getOptions/, "hover-button placement must read appearance options");
  assert.match(css, /\.workspace-tabs-sidebar-item-actions\s*\{[^}]*position:\s*absolute/, "rename and delete must overlay the row instead of shrinking the title");
  assert.match(css, /\.workspace-tabs-sidebar-divider/, "closed tabs must be separated by a divider");
  assert.match(css, /\.workspace-tabs-sidebar-item\.is-editing/, "rename must edit the title on the row");
  assert.match(css, /\.workspace-tabs-sidebar-item\.dragging/, "sidebar tabs must show a dragging state");
  assert.match(css, /\.workspace-tabs-sidebar-item\.drop-before::before/, "sidebar tabs must show a drop-before line");
  assert.match(css, /\.workspace-tabs-sidebar-item\.drop-after::after/, "sidebar tabs must show a drop-after line");
  assert.match(css, /\.workspace-tabs-sidebar-item\.is-closed/, "closed remembered tabs must have a distinct style");
  assert.match(css, /\.workspace-tabs-sidebar-item-delete:hover/, "the delete control must turn red on hover");
  assert.doesNotMatch(source, /editorModal/, "rename must not open a modal");
  assert.doesNotMatch(source, /workspace-tabs-sidebar-item-meta/);
  assert.doesNotMatch(source, /workspace-tabs-sidebar-item-closed/);
  assert.doesNotMatch(css, /\.workspace-tabs-sidebar-item-closed/, "closed tabs must not spend title space on a Closed badge");
  assert.doesNotMatch(css, /\.workspace-tabs-sidebar-item-current/, "current rows must not spend space on a Current badge");
  assert.doesNotMatch(source, /workspace-tabs-sidebar-item-current/);
  assert.doesNotMatch(css, /\.workspace-tabs-sidebar\s*\{[^}]*inset:\s*0/, "the sidebar must not stretch under the topbar");
  assert.doesNotMatch(css, /\.app-shell\.has-workspace-tabs-sidebar\s*\{[^}]*grid-template-columns/, "opening the sidebar must not split the app-shell grid");
  assert.doesNotMatch(css, /workspace-cleared-tabs-banner/, "the restore banner must not remain in the workspace chrome");
  assert.match(icons, /x: "3", y: "3", width: "18", height: "18", rx: "2"/);
  assert.match(icons, /d: "M9 3v18"/);
  assert.match(source, /createIcon\("copyMinus"\)/, "cleanup must use the stacked copy-minus glyph");
  assert.doesNotMatch(source, /createIcon\("broom"\)/, "cleanup must not keep the broom icon");
  assert.match(icons, /copyMinus:\s*\[/);
  assert.match(icons, /x: "8", y: "8", width: "14", height: "14"/);
  assert.match(icons, /d: "M12 15h6"/, "cleanup must use Lucide copy-minus (close extra copies)");
  assert.match(icons, /d: "M4 16c-1\.1 0-2-\.9-2-2V4c0-1\.1\.9-2 2-2h10c1\.1 0 2 \.9 2 2"/);
  assert.doesNotMatch(icons, /m19\.4 2\.6-9\.2 9\.2/, "cleanup must not keep the share-like broom paths");
  assert.doesNotMatch(icons, /d: "M12 2\.5v8\.5"/, "cleanup must not keep the broom handle");
  assert.doesNotMatch(icons, /broom:/, "the unused broom glyph must be removed");
  assert.match(icons, /pin:\s*\[/, "tabs must use the Lucide pin glyph");
  assert.match(icons, /d: "M12 17v5"/, "the pin glyph must include the Lucide pin needle");
  assert.match(source, /createIcon\("pin"\)/, "each tab row must expose a pin control");
  assert.match(source, /WORKSPACE_TABS_SIDEBAR_PINNED_KEY/, "pinned tabs must persist independently of live order");
  assert.match(source, /Boolean\(item\.pinned\) !== Boolean\(target\.pinned\)/, "pinned and unpinned tabs must not mix while dragging");
  assert.match(source, /workspace-tabs-sidebar-search/, "ChatClub Tabs must expose a search field");
  assert.match(source, /function openSearch\(/, "the topbar Search control must open and focus the sidebar search field");
  assert.match(source, /setSearchQuery/, "title search must filter the sidebar list");
  assert.match(source, /forgetWorkspaceTabFullText/, "deleting a tab must drop its recorded full text");
  assert.match(css, /\.workspace-tabs-sidebar-search-input/, "the search field must be styled in the sidebar");
  assert.match(css, /\.workspace-tabs-sidebar-search\s*\{[^}]*border:\s*1px solid/, "the search glyph must sit inside one bordered field");
  assert.match(css, /\.workspace-tabs-sidebar-search\s*\{[^}]*height:\s*36px/, "the search field height must match tab rows");
  assert.match(css, /\.workspace-tabs-sidebar-search\s*\{[^}]*margin:\s*10px 8px 4px/, "the search field must align with tab row width");
  assert.match(css, /\.workspace-tabs-sidebar-item\s*\{[^}]*min-height:\s*36px/);
  assert.match(css, /\.workspace-tabs-sidebar-list\s*\{[^}]*padding:\s*4px 8px 8px/);
  assert.match(css, /\.workspace-tabs-sidebar-search \.workspace-tabs-sidebar-search-input/, "sidebar search styles must beat the global .input width");
  assert.match(tabSearch, /el\("label", \{ class: "workspace-tabs-sidebar-search"/);
  assert.match(tabSearch, /compositionstart/, "the search field must keep IME composition attached to one input");
  assert.match(tabSearch, /compositionend/, "committed IME text must refresh search after composition ends");
  assert.match(tabSearch, /keyCode === 229/, "IME keydown must mark composition before the first composing input");
  assert.match(source, /searchComposing/, "sidebar rebuilds must wait until IME composition ends");
  assert.doesNotMatch(tabSearch, /class: "input workspace-tabs-sidebar-search-input"/);
  assert.match(css, /\.workspace-tabs-search-hit/, "full-text hits must reuse Pocket card chrome");
  assert.match(icons, /search:\s*\[/, "the sidebar search field must use the Lucide search glyph");
  const { createWorkspaceTabsSidebarController } = await import("../app/workspace/tabs-sidebar-controller.js");
  const memory = new Map();
  const widthMemory = new Map();
  const sessionStorage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); }
  };
  const localStorage = {
    getItem: (key) => widthMemory.get(key) || null,
    setItem: (key, value) => { widthMemory.set(key, String(value)); },
    removeItem: (key) => { widthMemory.delete(key); }
  };

  function controller(overrides = {}) {
    const calls = [];
    const toasts = [];
    let renders = 0;
    let dismissable = true;
    const api = createWorkspaceTabsSidebarController({
      requestBackground: async (action, payload = {}) => {
        calls.push({ action, payload });
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [
              {
                tabId: 11,
                windowId: 1,
                index: 0,
                workspaceId: "page-aaaaaaaaaaaa",
                current: true,
                live: true,
                layoutName: "Pocket batch",
                appIds: ["ChatGPT"],
                updatedAt: Date.now()
              },
              {
                tabId: 12,
                windowId: 1,
                index: 1,
                workspaceId: "page-bbbbbbbbbbbb",
                current: false,
                live: true,
                appIds: ["Claude"],
                updatedAt: Date.now() - (2 * 24 * 60 * 60 * 1000)
              },
              {
                workspaceId: "page-cccccccccccc",
                current: false,
                live: false,
                topicTitle: "Closed research",
                appIds: ["Grok"],
                detachedAt: Date.now() - (31 * 24 * 60 * 60 * 1000)
              }
            ]
          };
        }
        if (action === "focusWorkspaceTab") return { focused: true, tabId: payload.tabId, current: false };
        if (action === "openWorkspaceTab") return { tabId: 99 };
        if (action === "forgetRememberedWorkspaceTab") return { forgotten: true, workspaceId: payload.workspaceId, closed: false };
        if (action === "closeOtherLiveWorkspaceTabs") return { closed: 2, tabIds: [12] };
        if (action === "moveLiveWorkspaceTabs") return { moved: (payload.tabIds || []).length, tabIds: payload.tabIds || [], index: payload.index || 0 };
        if (action === "setWorkspaceTabTitle") {
          return { updated: true, workspaceId: payload.workspaceId, tabId: payload.tabId, title: payload.title, custom: payload.custom !== false };
        }
        return {};
      },
      toast: (message, kind) => { toasts.push({ message, kind }); },
      render: () => { renders += 1; },
      inferAppName: (app) => app?.name || app?.id || "",
      appById: (id) => ({ id, name: id }),
      sessionStorage,
      localStorage,
      canDismiss: () => dismissable,
      ...overrides
    });
    return {
      api,
      calls,
      toasts,
      widthMemory,
      get renders() { return renders; },
      setDismissable(value) { dismissable = value; }
    };
  }

  {
    const fixture = controller();
    assert.equal(fixture.api.isOpen(), false);
    fixture.api.toggle();
    assert.equal(fixture.api.isOpen(), true);
    assert.equal(memory.get("chatclubWorkspaceTabsSidebarOpenV1"), "1");
    await Promise.resolve();
    assert.equal(fixture.calls[0].action, "listLiveWorkspaceTabs");
    fixture.api.toggle();
    assert.equal(fixture.api.isOpen(), false);
    assert.equal(memory.has("chatclubWorkspaceTabsSidebarOpenV1"), false);
  }

  {
    const fixture = controller();
    const listed = await fixture.api.refresh();
    assert.equal(listed.length, 3);
    const current = await fixture.api.focusTab(11);
    assert.deepEqual(current, { focused: true, tabId: 11, current: true });
    assert.equal(fixture.calls.at(-1).action, "listLiveWorkspaceTabs");
    await fixture.api.focusTab(12);
    assert.equal(fixture.calls.at(-1).action, "focusWorkspaceTab");
    assert.deepEqual(fixture.calls.at(-1).payload, { tabId: 12 });
    const closed = listed[2];
    await fixture.api.activateTab(closed);
    assert.equal(fixture.calls.at(-1).action, "openWorkspaceTab");
    assert.deepEqual(fixture.calls.at(-1).payload, { workspaceId: "page-cccccccccccc" });
    await fixture.api.forgetTab(closed);
    assert.equal(fixture.calls.at(-1).action, "forgetRememberedWorkspaceTab");
    assert.deepEqual(fixture.calls.at(-1).payload, { workspaceId: "page-cccccccccccc" });
    assert.equal(fixture.api.currentItems().length, 2);
  }

  {
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listLiveWorkspaceTabs") return { tabs: [] };
        throw new Error("missing tab");
      }
    });
    fixture.api.setOpen(true);
    await fixture.api.refresh();
    const empty = fixture.api.renderSidebar();
    assert.equal(empty.className, "workspace-tabs-sidebar");
    assert.match(nodeText(empty), /No ChatClub tabs|没有 ChatClub 标签页/);
    await assert.rejects(() => fixture.api.focusTab(99));
    assert.equal(fixture.toasts[0].kind, "error");
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const current = descendants(sidebar).find((node) => node.classList.contains("is-current"));
    assert.ok(current, "the current ChatClub tab must be marked in the list");
    assert.match(nodeText(current), /Pocket batch/);
    assert.doesNotMatch(nodeText(current), /\bCurrent\b|当前/, "current rows must not show a Current badge");
    const count = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-count"));
    assert.equal(nodeText(count), "3");
    const header = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-header"));
    assert.ok(header, "the sidebar must render a header");
    assert.match(String(header.children[0]?.className || ""), /workspace-tabs-sidebar-count/, "tab count must sit to the left of ChatClub Tabs");
    assert.match(String(header.children[1]?.className || ""), /workspace-tabs-sidebar-title/);
    assert.match(String(header.children[2]?.className || ""), /workspace-tabs-sidebar-header-actions/, "sort, folder and close-others must sit to the right of ChatClub Tabs");
    const cleanup = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-cleanup"));
    assert.ok(cleanup, "the header must expose a close-others control");
    assert.ok(descendants(header).some((node) => String(node.className || "").includes("workspace-tabs-sidebar-sort")), "the header must expose a sort control");
    assert.ok(descendants(header).some((node) => String(node.className || "").includes("workspace-tabs-sidebar-new-folder")), "the header must expose a new-folder control");
    assert.equal(cleanup.disabled, false);
    cleanup.click();
    await Promise.resolve();
    assert.ok(
      fixture.calls.some((call) => call.action === "closeOtherLiveWorkspaceTabs"),
      "the cleanup control must close other live ChatClub tabs"
    );
    assert.ok(
      !fixture.calls.some((call) => call.action === "forgetRememberedWorkspaceTab"),
      "cleanup from the header must not delete Tabs memory"
    );
    const indexes = descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-index"));
    assert.deepEqual(indexes.map((node) => nodeText(node)), ["1", "2", "1"], "live and closed tabs must number separately");
    const pinButtons = descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-pin"));
    assert.equal(pinButtons.length, 3, "every ChatClub tab row must expose a pin control");
    assert.equal(
      descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-more")).length,
      0,
      "default hover buttons stay on the row without a More control"
    );
    const resize = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-resize"));
    assert.ok(resize, "the sidebar must expose a drag handle");
    assert.equal(fixture.api.itemLabel({ layoutName: "", appIds: ["Claude"] }, 0), "Claude");
    assert.equal(fixture.api.itemLabel({ layoutName: "", appIds: [] }, 3), "ChatClub 4");
    assert.equal(fixture.api.itemLabel({ layoutName: "Prompt", appIds: ["Claude"] }, 0), "Claude", "placeholder Prompt must yield to loaded apps");
    assert.equal(fixture.api.itemLabel({ layoutName: "Prompt", appIds: [] }, 0), "ChatClub 1");
    assert.equal(fixture.api.itemLabel({ layoutName: "Pocket batch", appIds: ["Claude"] }, 0), "Pocket batch");
    assert.equal(fixture.api.itemLabel({ layoutName: "", appIds: [], title: "Grok · Notion AI" }, 0), "Grok · Notion AI");
    assert.equal(fixture.api.itemLabel({ layoutName: "", appIds: [], title: "ChatClub" }, 2), "ChatClub 3");
    assert.equal(fixture.api.itemLabel({
      topicTitle: "Compare models",
      layoutName: "Pocket batch",
      appIds: ["Claude"]
    }, 0), "Compare models");
    assert.equal(fixture.api.itemLabel({ topicTitle: "Prompt", appIds: ["Claude"] }, 0), "Claude");
    const edit = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit"));
    assert.ok(edit, "each ChatClub tab row must expose an edit button");
    const remove = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-delete"));
    assert.ok(remove, "each ChatClub tab row must expose a delete button");
    const actions = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-item-actions"));
    assert.ok(actions, "rename and delete must live in an overlay that does not shrink the title");
    const closed = descendants(sidebar).find((node) => node.classList.contains("is-closed"));
    assert.ok(closed, "a remembered closed ChatClub tab must stay visible");
    assert.match(nodeText(closed), /Closed research/);
    assert.equal(
      descendants(closed).some((node) => node.classList.contains("workspace-tabs-sidebar-item-closed")),
      false,
      "closed rows must not keep a Closed badge on the title"
    );
    const divider = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-divider"));
    assert.ok(divider, "closed tabs must sit below a divider");
    assert.match(nodeText(divider), /Closed|已关闭/);
    const list = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-list"));
    const rowItems = (list?.children || []).filter((node) => node.classList.contains("workspace-tabs-sidebar-item"));
    assert.equal(rowItems.at(-1), closed, "closed tabs must render after live tabs");
    const dividerIndex = (list?.children || []).findIndex((node) => node.classList.contains("workspace-tabs-sidebar-divider"));
    assert.equal(dividerIndex, 2, "the closed-tab divider must sit between live and closed rows");
    const focus = descendants(current).find((node) => node.classList.contains("workspace-tabs-sidebar-item-focus"));
    assert.ok(focus, "the row label must stay a separate focus control");
  }

  {
    const ownerDocument = {
      title: "ChatClub",
      addEventListener() {},
      removeEventListener() {}
    };
    const fixture = controller({
      document: ownerDocument,
      currentWorkspace: () => ({ layoutName: "Prompt", appIds: ["Grok", "Notion AI"] })
    });
    const shell = Object.assign(new FakeNode("div"), { isConnected: true, className: "app-shell" });
    const grid = Object.assign(new FakeNode("div"), { className: "main-grid", offsetTop: 51 });
    shell.append(grid);
    fixture.api.setOpen(true);
    fixture.api.syncSidebar(shell);
    assert.equal(ownerDocument.title, "Grok · Notion AI", "the browser tab title must update after the workspace loads");
    const titled = controller({
      document: ownerDocument,
      currentWorkspace: () => ({ layoutName: "Prompt", appIds: ["Grok"], topicTitle: "Compare models" })
    });
    titled.api.syncSidebar(shell);
    assert.equal(ownerDocument.title, "Compare models");
    const sidebar = descendants(shell).find((node) => node.classList.contains("workspace-tabs-sidebar"));
    assert.equal(sidebar?.style?.top, "51px");
  }

  {
    const listeners = [];
    const ownerDocument = {
      addEventListener(name, listener, options) { listeners.push({ name, listener, options }); },
      removeEventListener(name, listener) {
        const index = listeners.findIndex((entry) => entry.name === name && entry.listener === listener);
        if (index >= 0) listeners.splice(index, 1);
      }
    };
    const fixture = controller({ document: ownerDocument });
    const shell = Object.assign(new FakeNode("div"), { isConnected: true, className: "app-shell" });
    shell.querySelector = (selector) => shell.querySelectorAll(selector)[0] || null;
    fixture.api.setOpen(true);
    fixture.api.syncSidebar(shell);
    const escape = listeners.find((entry) => entry.name === "keydown");
    assert.ok(escape, "an open sidebar must listen for Escape");
    fixture.setDismissable(false);
    escape.listener({ key: "Escape", isComposing: false, keyCode: 27, preventDefault() {}, stopPropagation() {} });
    assert.equal(fixture.api.isOpen(), true, "Escape must not close the sidebar while an overlay is in front");
    fixture.setDismissable(true);
    escape.listener({ key: "Escape", isComposing: false, keyCode: 27, preventDefault() {}, stopPropagation() {} });
    assert.equal(fixture.api.isOpen(), false);
  }

  {
    const currentTitles = [];
    const fixture = controller({
      setCurrentTabTitle: (title) => { currentTitles.push(title); }
    });
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const editButtons = descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit"));
    assert.equal(editButtons.length, 3);
    editButtons[0].click();
    const editor = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-item-editor"));
    assert.ok(editor, "rename must replace the row with an inline editor");
    assert.ok(descendants(sidebar).some((node) => node.classList.contains("is-editing")));
    assert.ok(
      descendants(sidebar).some((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit-cancel")),
      "inline rename must expose a cancel control"
    );
    assert.ok(
      descendants(sidebar).some((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit-save")),
      "inline rename must expose a save control"
    );
    assert.ok(!fixture.calls.some((call) => call.action === "focusWorkspaceTab"), "edit must not switch ChatClub tabs");
    editor.value = "My research";
    const saveButton = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit-save"));
    saveButton.click();
    await Promise.resolve();
    assert.deepEqual(currentTitles, ["My research"]);
    const other = fixture.api.currentItems()[1];
    const renamed = await fixture.api.saveTabTitle(other, "  Custom Claude thread  ");
    assert.equal(renamed.updated, true);
    assert.equal(fixture.calls.at(-1).action, "setWorkspaceTabTitle");
    assert.deepEqual(fixture.calls.at(-1).payload, {
      tabId: 12,
      workspaceId: "page-bbbbbbbbbbbb",
      title: "Custom Claude thread",
      custom: true
    });
  }

  {
    const confirmations = [];
    const fixture = controller({
      confirmationModal: (title, content, onClose) => {
        confirmations.push({ title, content, onClose });
        return {
          remove() {},
          querySelector() {
            return { toggleAttribute() {}, setAttribute() {} };
          }
        };
      }
    });
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const deleteButtons = descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-delete"));
    assert.equal(deleteButtons.length, 3);
    deleteButtons[2].click();
    assert.equal(confirmations.length, 1);
    assert.match(String(confirmations[0].title || ""), /Delete this ChatClub tab|删除此 ChatClub 标签页/);
    assert.ok(!fixture.calls.some((call) => call.action === "forgetRememberedWorkspaceTab"), "delete must wait for confirmation");
  }

  {
    const closedTabs = [];
    const fixture = controller({
      closeCurrentTab: async () => {
        closedTabs.push(true);
        return { closed: true, tabId: 11 };
      }
    });
    await fixture.api.refresh();
    const current = fixture.api.currentItems()[0];
    const forgotten = await fixture.api.forgetTab(current);
    assert.equal(forgotten.closed, true);
    assert.equal(closedTabs.length, 1, "deleting the current ChatClub tab must close this browser tab");
    assert.equal(fixture.api.currentItems().some((item) => item.current), false);
  }

  {
    const closedTabs = [];
    const forgetPayloads = [];
    const fixture = controller({
      closeCurrentTab: async () => {
        closedTabs.push(true);
        return { closed: true, tabId: 77 };
      },
      requestBackground: async (action, payload = {}) => {
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [{
              tabId: 77,
              windowId: 1,
              index: 0,
              workspaceId: "page-emptyemptyempty",
              current: true,
              live: true,
              appIds: ["Grok", "NotionAI", "Kagi"]
            }]
          };
        }
        if (action === "forgetRememberedWorkspaceTab") {
          forgetPayloads.push(payload);
          return { forgotten: true, workspaceId: payload.workspaceId, closed: true, tabId: payload.tabId };
        }
        return {};
      }
    });
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const count = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-count"));
    assert.equal(nodeText(count), "1");
    const cleanup = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-cleanup"));
    assert.equal(cleanup.disabled, true, "close-others must stay idle when this is the only live ChatClub tab");
    const emptyCurrent = fixture.api.currentItems()[0];
    const forgotten = await fixture.api.forgetTab(emptyCurrent);
    assert.equal(forgotten.closed, true);
    assert.equal(closedTabs.length, 1);
    assert.deepEqual(forgetPayloads.at(-1), {
      workspaceId: "page-emptyemptyempty",
      tabId: 77
    });
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const closed = await fixture.api.closeOtherLiveTabs();
    assert.deepEqual(closed, { closed: 2, tabIds: [12] });
    assert.equal(fixture.calls.at(-2).action, "closeOtherLiveWorkspaceTabs");
    assert.ok(
      !fixture.calls.some((call) => call.action === "forgetRememberedWorkspaceTab"),
      "cleanup must close ChatClub browser tabs without deleting Tabs memory"
    );
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const shell = Object.assign(new FakeNode("div"), { isConnected: true, className: "app-shell" });
    const grid = Object.assign(new FakeNode("div"), { className: "main-grid", offsetTop: 51 });
    shell.append(grid);
    const sidebar = fixture.api.syncSidebar(shell);
    const handle = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-resize"));
    assert.ok(handle, "sync must keep the drag handle");
    assert.equal(sidebar.style.width, "320px");
  }

  {
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [
              {
                workspaceId: "page-closedclosedc",
                current: false,
                live: false,
                topicTitle: "Archived notes",
                appIds: ["Grok"]
              },
              {
                tabId: 21,
                windowId: 1,
                index: 0,
                workspaceId: "page-livelivelivel",
                current: true,
                live: true,
                layoutName: "Live workspace",
                appIds: ["ChatGPT"]
              }
            ]
          };
        }
        return {};
      }
    });
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const list = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-list"));
    const children = list?.children || [];
    assert.equal(children[0]?.classList.contains("workspace-tabs-sidebar-item"), true);
    assert.equal(children[0]?.classList.contains("is-closed"), false, "live tabs must stay above the divider");
    assert.equal(children[1]?.classList.contains("workspace-tabs-sidebar-divider"), true);
    assert.equal(children[2]?.classList.contains("is-closed"), true, "closed tabs must move below the divider even when remembered first");
    assert.match(nodeText(children[2]), /Archived notes/);
    const indexes = descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-index"));
    assert.deepEqual(indexes.map((node) => nodeText(node)), ["1", "1"], "the closed section must restart at 1");
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    const listed = fixture.api.currentItems();
    const reordered = fixture.api.moveTab(listed[1], listed[0], "before");
    assert.equal(reordered[0].workspaceId, "page-bbbbbbbbbbbb");
    assert.equal(reordered[1].workspaceId, "page-aaaaaaaaaaaa");
    assert.equal(reordered[2].workspaceId, "page-cccccccccccc", "closed tabs must stay below live tabs after a live reorder");
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(
      fixture.calls.some((call) => call.action === "moveLiveWorkspaceTabs" && call.payload.tabIds[0] === 12),
      "reordering live ChatClub tabs must move the matching browser tabs"
    );
  }

  {
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [
              {
                workspaceId: "page-closed-one",
                current: false,
                live: false,
                topicTitle: "Old notes"
              },
              {
                workspaceId: "page-closed-two",
                current: false,
                live: false,
                topicTitle: "Older notes"
              },
              {
                tabId: 11,
                windowId: 1,
                index: 0,
                workspaceId: "page-live-one",
                current: true,
                live: true,
                layoutName: "Pocket batch"
              }
            ]
          };
        }
        if (action === "moveLiveWorkspaceTabs") {
          throw new Error("closed tabs must not move browser tabs");
        }
        return {};
      }
    });
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    fixture.api.setOpen(true);
    const listed = fixture.api.currentItems();
    const closedA = listed.find((item) => item.workspaceId === "page-closed-one");
    const closedB = listed.find((item) => item.workspaceId === "page-closed-two");
    const after = fixture.api.moveTab(closedB, closedA, "before");
    assert.deepEqual(after.filter((item) => !item.live).map((item) => item.workspaceId), [
      "page-closed-two",
      "page-closed-one"
    ]);
    assert.equal(after[0].live, true, "live tabs must stay above closed tabs");
    assert.equal(fixture.widthMemory.get("chatclubWorkspaceTabsClosedOrderV1"), JSON.stringify([
      "page-closed-two",
      "page-closed-one"
    ]));
    const again = controller({
      localStorage: {
        getItem: (key) => fixture.widthMemory.get(key) || null,
        setItem: (key, value) => { fixture.widthMemory.set(key, String(value)); },
        removeItem: (key) => { fixture.widthMemory.delete(key); }
      },
      requestBackground: async (action) => {
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [
              {
                workspaceId: "page-closed-one",
                current: false,
                live: false,
                topicTitle: "Old notes"
              },
              {
                workspaceId: "page-closed-two",
                current: false,
                live: false,
                topicTitle: "Older notes"
              }
            ]
          };
        }
        return {};
      }
    });
    await again.api.refresh();
    assert.deepEqual(again.api.currentItems().map((item) => item.workspaceId), [
      "page-closed-two",
      "page-closed-one"
    ], "closed tab order must survive a later list refresh");
  }

  {
    const listeners = [];
    const ownerDocument = {
      addEventListener(name, listener, options) { listeners.push({ name, listener, options }); },
      removeEventListener(name, listener) {
        const index = listeners.findIndex((entry) => entry.name === name && entry.listener === listener);
        if (index >= 0) listeners.splice(index, 1);
      }
    };
    const fixture = controller({ document: ownerDocument });
    const shell = Object.assign(new FakeNode("div"), { isConnected: true, className: "app-shell" });
    const grid = Object.assign(new FakeNode("div"), { className: "main-grid", offsetTop: 51 });
    shell.append(grid);
    shell.querySelector = (selector) => shell.querySelectorAll(selector)[0] || null;
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    fixture.api.syncSidebar(shell);
    const sidebar = descendants(shell).find((node) => node.classList.contains("workspace-tabs-sidebar"));
    const edit = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit"));
    edit.click();
    assert.ok(
      descendants(shell).some((node) => node.classList.contains("is-editing")),
      "rename must keep the editor on the tab row"
    );
    const escape = listeners.find((entry) => entry.name === "keydown");
    escape.listener({ key: "Escape", isComposing: false, keyCode: 27, preventDefault() {}, stopPropagation() {} });
    assert.equal(fixture.api.isOpen(), true, "Escape must cancel inline rename before closing the sidebar");
    assert.equal(
      descendants(shell).some((node) => node.classList.contains("is-editing")),
      false,
      "Escape must leave the tab row"
    );
  }

  {
    const fixture = controller();
    fixture.widthMemory.delete("chatclubWorkspaceTabsPinnedV1");
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    fixture.api.setOpen(true);
    const listed = fixture.api.currentItems();
    const liveSecond = listed.find((item) => item.workspaceId === "page-bbbbbbbbbbbb");
    const closed = listed.find((item) => item.workspaceId === "page-cccccccccccc");
    const pinned = fixture.api.togglePin(liveSecond);
    assert.equal(pinned[0].workspaceId, "page-bbbbbbbbbbbb", "pinning must move the tab to the top of its section");
    assert.equal(pinned[0].pinned, true);
    assert.equal(pinned[1].workspaceId, "page-aaaaaaaaaaaa");
    assert.equal(pinned[1].pinned, false);
    assert.equal(pinned[2].workspaceId, "page-cccccccccccc", "pinning a live tab must not jump the closed section");
    assert.equal(fixture.widthMemory.get("chatclubWorkspaceTabsPinnedV1"), JSON.stringify(["page-bbbbbbbbbbbb"]));
    const sidebar = fixture.api.renderSidebar();
    const rows = (descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-list"))?.children || [])
      .filter((node) => node.classList.contains("workspace-tabs-sidebar-item"));
    assert.equal(rows[0].classList.contains("is-pinned"), true);
    assert.equal(
      descendants(rows[0]).some((node) => node.classList.contains("workspace-tabs-sidebar-item-pin-mark")),
      true,
      "pinned rows must keep a visible pin mark"
    );
    const indexes = descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-index"));
    assert.deepEqual(indexes.map((node) => nodeText(node)), ["1", "2", "1"]);
    const pinnedClosed = fixture.api.togglePin(closed);
    assert.equal(pinnedClosed[2].workspaceId, "page-cccccccccccc");
    assert.equal(pinnedClosed[2].pinned, true);
    assert.deepEqual(JSON.parse(fixture.widthMemory.get("chatclubWorkspaceTabsPinnedV1")), [
      "page-cccccccccccc",
      "page-bbbbbbbbbbbb"
    ], "the newest pin must sit first in the pin list");
    const unpinned = fixture.api.togglePin(liveSecond);
    assert.equal(unpinned[0].workspaceId, "page-bbbbbbbbbbbb");
    assert.equal(unpinned[0].pinned, false, "unpinning must keep the tab in its section without a pin");
    assert.equal(unpinned.some((item) => item.workspaceId === "page-bbbbbbbbbbbb" && item.pinned), false);
    assert.deepEqual(JSON.parse(fixture.widthMemory.get("chatclubWorkspaceTabsPinnedV1")), ["page-cccccccccccc"]);
  }

  {
    const fixture = controller();
    fixture.widthMemory.delete("chatclubWorkspaceTabsPinnedV1");
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    const listed = fixture.api.currentItems();
    fixture.api.togglePin(listed[1]);
    const after = fixture.api.currentItems();
    const mixed = fixture.api.moveTab(after[1], after[0], "before");
    assert.equal(mixed[0].workspaceId, "page-bbbbbbbbbbbb", "unpinned tabs must not drop onto pinned tabs");
    assert.equal(mixed[0].pinned, true);
    await fixture.api.forgetTab(mixed[0]);
    assert.ok(
      !fixture.widthMemory.get("chatclubWorkspaceTabsPinnedV1"),
      "deleting a pinned tab must drop it from the pin list"
    );
  }

  {
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [
              {
                tabId: 31,
                windowId: 1,
                index: 0,
                workspaceId: "page-live-one",
                current: true,
                live: true,
                layoutName: "One"
              },
              {
                tabId: 32,
                windowId: 1,
                index: 1,
                workspaceId: "page-live-two",
                current: false,
                live: true,
                layoutName: "Two"
              },
              {
                workspaceId: "page-closed-one",
                current: false,
                live: false,
                topicTitle: "Old notes"
              },
              {
                workspaceId: "page-closed-two",
                current: false,
                live: false,
                topicTitle: "Older notes"
              }
            ]
          };
        }
        if (action === "moveLiveWorkspaceTabs") return { moved: 2, tabIds: [32, 31], index: 0 };
        return {};
      }
    });
    fixture.widthMemory.delete("chatclubWorkspaceTabsPinnedV1");
    await fixture.api.refresh();
    fixture.api.setSortMode("open");
    const listed = fixture.api.currentItems();
    fixture.api.togglePin(listed.find((item) => item.workspaceId === "page-live-two"));
    fixture.api.togglePin(listed.find((item) => item.workspaceId === "page-closed-two"));
    const again = controller({
      localStorage: {
        getItem: (key) => fixture.widthMemory.get(key) || null,
        setItem: (key, value) => { fixture.widthMemory.set(key, String(value)); },
        removeItem: (key) => { fixture.widthMemory.delete(key); }
      },
      requestBackground: async (action) => {
        if (action === "listLiveWorkspaceTabs") {
          return {
            tabs: [
              {
                tabId: 31,
                windowId: 1,
                index: 0,
                workspaceId: "page-live-one",
                current: true,
                live: true,
                layoutName: "One"
              },
              {
                tabId: 32,
                windowId: 1,
                index: 1,
                workspaceId: "page-live-two",
                current: false,
                live: true,
                layoutName: "Two"
              },
              {
                workspaceId: "page-closed-one",
                current: false,
                live: false,
                topicTitle: "Old notes"
              },
              {
                workspaceId: "page-closed-two",
                current: false,
                live: false,
                topicTitle: "Older notes"
              }
            ]
          };
        }
        return {};
      }
    });
    await again.api.refresh();
    again.api.setOpen(true);
    const restored = again.api.currentItems();
    assert.deepEqual(restored.map((item) => item.workspaceId), [
      "page-live-two",
      "page-live-one",
      "page-closed-two",
      "page-closed-one"
    ], "pinned tabs must stay at the top of their own section after a later list refresh");
    const sidebar = again.api.renderSidebar();
    const indexes = descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-index"));
    assert.deepEqual(indexes.map((node) => nodeText(node)), ["1", "2", "1", "2"]);
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    assert.ok(
      descendants(sidebar).some((node) => node.classList.contains("workspace-tabs-sidebar-search-input")),
      "the sidebar must keep a title search field"
    );
    fixture.api.setSearchQuery("Closed");
    const filtered = fixture.api.renderSidebar();
    const labels = descendants(filtered)
      .filter((node) => node.classList.contains("workspace-tabs-sidebar-item-label"))
      .map((node) => nodeText(node));
    assert.deepEqual(labels, ["Closed research"]);
    const indexes = descendants(filtered).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-index"));
    assert.deepEqual(indexes.map((node) => nodeText(node)), ["1"]);
    fixture.api.setSearchQuery("no-such-tab");
    const empty = fixture.api.renderSidebar();
    assert.match(nodeText(empty), /No matching tabs|没有匹配的标签页/);
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const shell = Object.assign(new FakeNode("div"), { isConnected: true, className: "app-shell" });
    const grid = Object.assign(new FakeNode("div"), { className: "main-grid" });
    shell.append(grid);
    fixture.api.syncSidebar(shell);
    const sidebar = descendants(shell).find((node) => node.classList.contains("workspace-tabs-sidebar"));
    const field = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-search-input"));
    assert.ok(field, "the connected sidebar must expose a live search input");
    field.dispatch("keydown", { key: "a", keyCode: 229, isComposing: false });
    field.value = "a";
    field.dispatch("input", { isComposing: true });
    const during = descendants(shell).find((node) => node.classList.contains("workspace-tabs-sidebar"));
    const duringField = descendants(during).find((node) => node.classList.contains("workspace-tabs-sidebar-search-input"));
    assert.equal(during, sidebar, "IME composition must not replace the sidebar");
    assert.equal(duringField, field, "IME composition must keep the same search input node");
    assert.equal(
      descendants(during).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-label")).length,
      3,
      "pinyin in composition must not filter tabs yet"
    );
    field.value = "阿";
    field.dispatch("compositionend", { data: "阿" });
    const committed = descendants(shell).find((node) => node.classList.contains("workspace-tabs-sidebar"));
    const committedField = descendants(committed).find((node) => node.classList.contains("workspace-tabs-sidebar-search-input"));
    assert.notEqual(committed, sidebar, "committed IME text may rebuild the filtered list");
    assert.equal(committedField?.value, "阿");
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setOpen(false);
    assert.equal(fixture.api.isOpen(), false);
    fixture.api.openSearch();
    assert.equal(fixture.api.isOpen(), true, "Search must open the ChatClub Tabs sidebar");
  }

  {
    const fixture = controller({
      getOptions: () => ({
        tabsSidebarButtonPlacement: { pin: "pinned", edit: "menu", delete: "menu", more: "pinned" },
        tabsSidebarButtonOrder: ["pin", "edit", "delete"]
      })
    });
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const pinButtons = descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-pin"));
    const editButtons = descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit"));
    const deleteButtons = descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-delete"));
    const moreButtons = descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-more"));
    assert.equal(pinButtons.length, 3, "fixed hover buttons stay on the row");
    assert.equal(editButtons.length, 0, "folded edit must leave the hover overlay");
    assert.equal(deleteButtons.length, 0, "folded delete must leave the hover overlay");
    assert.equal(moreButtons.length, 3, "folded buttons must expose a three-dot control on each row");
    documentBody.children = [];
    moreButtons[0].click({ currentTarget: moreButtons[0] });
    const menu = descendants(documentBody).find((node) => node.classList.contains("workspace-tabs-sidebar-hover-menu"));
    assert.ok(menu, "the three-dot control must open a popover");
    assert.match(nodeText(menu), /Edit title|编辑标题/);
    assert.match(nodeText(menu), /Delete tab|删除标签页/);
    assert.doesNotMatch(nodeText(menu), /Pin to top|置顶/, "fixed pin must not also appear in More");
  }

  {
    const fixture = controller({
      getOptions: () => ({
        tabsSidebarButtonPlacement: { pin: "hidden", edit: "hidden", delete: "hidden", more: "pinned" },
        tabsSidebarButtonOrder: ["pin", "edit", "delete"]
      })
    });
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    assert.equal(
      descendants(sidebar).filter((node) => node.classList.contains("workspace-tabs-sidebar-item-actions")).length,
      0,
      "hidden hover buttons must disappear from the row and More"
    );
  }

  {
    widthMemory.delete("chatclubWorkspaceTabsSidebarSortV1");
    const fixture = controller();
    await fixture.api.refresh();
    assert.equal(fixture.api.currentSortMode(), "viewed", "ChatClub Tabs must default to last-viewed sort");
    fixture.api.setOpen(true);
    const byTime = fixture.api.renderSidebar();
    assert.match(nodeText(byTime), /Today|今天/, "last-viewed sort must group recent tabs like prompt history");
    assert.match(nodeText(byTime), /Older|更早/, "last-viewed sort must group older tabs like prompt history");
    assert.ok(
      descendants(byTime).some((node) => node.classList.contains("workspace-tabs-sidebar-group")),
      "last-viewed sort must render date group headings"
    );
    assert.equal(
      descendants(byTime).some((node) => node.classList.contains("workspace-tabs-sidebar-divider")),
      false,
      "last-viewed sort must not use the open/closed divider"
    );
    fixture.api.setSortMode("edited");
    assert.equal(fixture.widthMemory.get("chatclubWorkspaceTabsSidebarSortV1"), "edited");
    assert.ok(descendants(fixture.api.renderSidebar()).some((node) => node.classList.contains("workspace-tabs-sidebar-group")));
    fixture.api.setSortMode("created");
    assert.equal(fixture.api.currentSortMode(), "created");
    fixture.api.setSortMode("open");
    assert.equal(fixture.widthMemory.get("chatclubWorkspaceTabsSidebarSortV1"), "open");
    const byOpen = fixture.api.renderSidebar();
    assert.ok(descendants(byOpen).some((node) => node.classList.contains("workspace-tabs-sidebar-divider")));
    fixture.api.setSortMode("name");
    const byName = fixture.api.renderSidebar();
    const nameLabels = descendants(byName)
      .filter((node) => node.classList.contains("workspace-tabs-sidebar-item-label"))
      .map((node) => nodeText(node));
    assert.deepEqual(nameLabels, [...nameLabels].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })));
  }

  {
    widthMemory.delete("chatclubWorkspaceTabsSidebarSortV1");
    widthMemory.delete("chatclubWorkspaceTabsSidebarFoldersV1");
    const fixture = controller();
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const created = fixture.api.addFolder("Research");
    assert.equal(created.at(-1).name, "Research");
    const folderId = created.at(-1).id;
    const listed = fixture.api.currentItems();
    fixture.api.moveTab(listed[0], { id: folderId }, "into");
    assert.equal(fixture.api.currentFolders()[0].workspaceIds[0], listed[0].workspaceId);
    const nested = fixture.api.renderSidebar();
    assert.ok(descendants(nested).some((node) => node.classList.contains("workspace-tabs-sidebar-folder")));
    assert.ok(descendants(nested).some((node) => node.classList.contains("is-nested")));
    fixture.api.moveTab(listed[0], { id: "root" }, "out");
    assert.deepEqual(fixture.api.currentFolders()[0].workspaceIds, []);
    const persisted = JSON.parse(fixture.widthMemory.get("chatclubWorkspaceTabsSidebarFoldersV1"));
    assert.equal(persisted[0].name, "Research");
  }

  console.log("workspace tabs sidebar: ok");
})().then(() => {
  if (previousGlobals.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previousGlobals.Node;
  if (previousGlobals.document === undefined) delete globalThis.document;
  else globalThis.document = previousGlobals.document;
}).catch((error) => {
  if (previousGlobals.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previousGlobals.Node;
  if (previousGlobals.document === undefined) delete globalThis.document;
  else globalThis.document = previousGlobals.document;
  console.error(error?.stack || error);
  process.exitCode = 1;
});
