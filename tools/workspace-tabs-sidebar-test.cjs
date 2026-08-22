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
    this.style = {
      setProperty(name, value) { this[name] = String(value); }
    };
    this.offsetTop = 0;
    this.isConnected = true;
    this.listeners = Object.create(null);
    this.classList = {
      contains: (name) => String(this.className || "").split(/\s+/).includes(name),
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
  }

  addEventListener(name, listener) {
    const key = String(name || "");
    if (!this.listeners[key]) this.listeners[key] = [];
    this.listeners[key].push(listener);
  }

  click(event = {}) {
    const payload = { preventDefault() {}, stopPropagation() {}, ...event };
    for (const listener of this.listeners.click || []) listener(payload);
  }

  setPointerCapture() {}

  append(...children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      const node = child instanceof FakeNode ? child : Object.assign(new FakeNode("#text"), { textContent: String(child) });
      node.parentNode = this;
      this.children.push(node);
    }
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
globalThis.document = {
  createElement: (tagName) => new FakeNode(tagName),
  createElementNS: (_ns, tagName) => new FakeNode(tagName),
  createTextNode: (text) => Object.assign(new FakeNode("#text"), { textContent: String(text) }),
  addEventListener() {},
  removeEventListener() {}
};

(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/workspace/tabs-sidebar-controller.js"), "utf8");
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
  assert.match(source, /openWorkspaceTab/);
  assert.match(source, /is-closed/);
  assert.match(css, /\.workspace-tabs-sidebar\s*\{[^}]*position:\s*absolute/, "the sidebar must overlay the workspace instead of taking iframe space");
  assert.match(css, /\.workspace-tabs-sidebar\s*\{[^}]*top:\s*var\(--workspace-tabs-sidebar-top\)/, "the sidebar must start below the topbar instead of covering it");
  assert.match(css, /\.workspace-tabs-sidebar-header\s*\{[^}]*padding:\s*14px/, "the sidebar header must keep top whitespace");
  assert.match(css, /\.workspace-tabs-sidebar-count/, "ChatClub Tabs must show the tab count");
  assert.match(css, /\.workspace-tabs-sidebar-cleanup/, "ChatClub Tabs must expose a close-others control");
  assert.match(css, /\.workspace-tabs-sidebar-item-index/, "each tab name must show a sequence number");
  assert.match(css, /\.workspace-tabs-sidebar-resize/, "the sidebar must be resizable by dragging");
  assert.match(css, /@media \(hover: hover\)/, "rename and delete controls must wait for hover");
  assert.match(css, /\.workspace-tabs-sidebar-item\.is-closed/, "closed remembered tabs must have a distinct style");
  assert.match(css, /\.workspace-tabs-sidebar-item-delete:hover/, "the delete control must turn red on hover");
  assert.doesNotMatch(css, /\.workspace-tabs-sidebar\s*\{[^}]*inset:\s*0/, "the sidebar must not stretch under the topbar");
  assert.doesNotMatch(css, /\.app-shell\.has-workspace-tabs-sidebar\s*\{[^}]*grid-template-columns/, "opening the sidebar must not split the app-shell grid");
  assert.doesNotMatch(css, /workspace-cleared-tabs-banner/, "the restore banner must not remain in the workspace chrome");
  assert.match(icons, /x: "3", y: "3", width: "18", height: "18", rx: "2"/);
  assert.match(icons, /d: "M9 3v18"/);
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
                appIds: ["ChatGPT"]
              },
              {
                tabId: 12,
                windowId: 1,
                index: 1,
                workspaceId: "page-bbbbbbbbbbbb",
                current: false,
                live: true,
                appIds: ["Claude"]
              },
              {
                workspaceId: "page-cccccccccccc",
                current: false,
                live: false,
                topicTitle: "Closed research",
                appIds: ["Grok"]
              }
            ]
          };
        }
        if (action === "focusWorkspaceTab") return { focused: true, tabId: payload.tabId, current: false };
        if (action === "openWorkspaceTab") return { tabId: 99 };
        if (action === "forgetRememberedWorkspaceTab") return { forgotten: true, workspaceId: payload.workspaceId, closed: false };
        if (action === "closeOtherLiveWorkspaceTabs") return { closed: 2, tabIds: [12] };
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
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const current = descendants(sidebar).find((node) => node.classList.contains("is-current"));
    assert.ok(current, "the current ChatClub tab must be marked in the list");
    assert.match(nodeText(current), /Pocket batch/);
    const count = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-count"));
    assert.equal(nodeText(count), "3");
    const header = descendants(sidebar).find((node) => node.classList.contains("workspace-tabs-sidebar-header"));
    assert.ok(header, "the sidebar must render a header");
    assert.match(String(header.children[0]?.className || ""), /workspace-tabs-sidebar-count/, "tab count must sit to the left of ChatClub Tabs");
    assert.match(String(header.children[1]?.className || ""), /workspace-tabs-sidebar-title/);
    assert.match(String(header.children[2]?.className || ""), /workspace-tabs-sidebar-cleanup/, "close-others must sit to the right of ChatClub Tabs");
    const cleanup = descendants(sidebar).find((node) => String(node.className || "").includes("workspace-tabs-sidebar-cleanup"));
    assert.ok(cleanup, "the header must expose a close-others control");
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
    assert.deepEqual(indexes.map((node) => nodeText(node)), ["1", "2", "3"]);
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
    const closed = descendants(sidebar).find((node) => node.classList.contains("is-closed"));
    assert.ok(closed, "a remembered closed ChatClub tab must stay visible");
    assert.match(nodeText(closed), /Closed research|已关闭/);
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
    const editors = [];
    const currentTitles = [];
    const fixture = controller({
      editorModal: (title, content, onClose) => {
        editors.push({ title, content, onClose });
        return { remove() {}, querySelector() { return null; } };
      },
      setCurrentTabTitle: (title) => { currentTitles.push(title); }
    });
    await fixture.api.refresh();
    fixture.api.setOpen(true);
    const sidebar = fixture.api.renderSidebar();
    const editButtons = descendants(sidebar).filter((node) => String(node.className || "").includes("workspace-tabs-sidebar-item-edit"));
    assert.equal(editButtons.length, 3);
    editButtons[0].click();
    assert.equal(editors.length, 1);
    assert.ok(!fixture.calls.some((call) => call.action === "focusWorkspaceTab"), "edit must not switch ChatClub tabs");
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
    const current = fixture.api.currentItems()[0];
    await fixture.api.saveTabTitle(current, "My research");
    assert.deepEqual(currentTitles, ["My research"]);
    assert.ok(!fixture.calls.some((call) => call.action === "setWorkspaceTabTitle" && call.payload.tabId === 11));
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
