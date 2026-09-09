#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const dom = read("ui/dom.js");
const tabSearch = read("app/workspace/tab-search-controller.js");
const history = read("app/history/controller.js");
const frame = read("app/workspace/frame-controller.js");
const composer = read("app/composer/controller.js");
const agents = read("AGENTS.md");

assert.match(dom, /export function claimOverlaySearchCaret/);
assert.match(dom, /export function pinOverlaySearchCaret/);
assert.match(dom, /export function releaseOverlaySearchCaret/);
assert.match(dom, /export function overlaySearchCaretMode/);
assert.match(dom, /export function pageCaretHoldActive/);
assert.match(dom, /export function setOverlayCaretLeaseHandler/);
assert.match(dom, /scheduleOverlayCaretPinFollow/);
assert.match(dom, /document\.addEventListener\("focusin", onOverlaySearchCaretFocusIn, true\)/);
assert.match(dom, /document\.addEventListener\("focusout", onOverlaySearchCaretFocusOut, true\)/);
assert.match(dom, /window\.addEventListener\("message", onOverlayPageCaretStolen\)/);
assert.match(tabSearch, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(tabSearch, /pinOverlaySearchCaret\(\)/);
assert.match(history, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(history, /pinOverlaySearchCaret\(\)/);
assert.doesNotMatch(tabSearch, /restoreSearchFieldAfterFrameLoad|FRAME_LOAD_SEARCH_FOCUS|addEventListener\("load"/);
assert.doesNotMatch(history, /restoreSearchFieldAfterFrameLoad|FRAME_LOAD_SEARCH_FOCUS|addEventListener\("load"/);
assert.match(frame, /prepareFrameNavigationFocusGuard[\s\S]*document\.querySelector\("\.modal"\)/);
assert.match(composer, /claimOverlaySearchCaret/);
assert.match(composer, /mode: "page"/);
assert.match(composer, /pageCaretHoldActive\(\)/);
assert.match(composer, /claimPromptCaret\(e\.target\)/);
assert.match(composer, /oncompositionstart/);
assert.match(composer, /oncompositionend/);
assert.match(agents, /the titlebar search is the unique caret owner/);
assert.match(agents, /a focused `\.prompt-input` is the page caret owner/);
assert.match(agents, /page input session hold/);
assert.match(frame, /function restorePromptInputFocus/);
assert.match(frame, /setOverlayCaretLeaseHandler/);
assert.match(frame, /adoptPageCaretLease/);
assert.match(frame, /overlaySearchCaretMode\(\) === "page"/);

const caretStart = dom.indexOf("let overlaySearchCaret = null;");
const caretEnd = dom.indexOf("function modalFocusables");
assert.ok(caretStart >= 0 && caretEnd > caretStart, "overlay caret owner must live in ui/dom.js");
const caretSource = dom.slice(caretStart, caretEnd).replace(/^export /gm, "");

function createWorld() {
  const listeners = [];
  const body = { nodeName: "BODY" };
  const html = { nodeName: "HTML" };
  const panel = {
    className: "modal workspace-tabs-search-modal",
    nodeName: "SECTION",
    contains(node) {
      return Boolean(node && node !== this && node._inPanel);
    }
  };
  const field = {
    isConnected: true,
    value: "rati",
    nodeName: "INPUT",
    className: "workspace-tabs-search-input",
    focusCalls: 0,
    selectionStart: 4,
    selectionEnd: 4,
    closest(selector) {
      return selector === ".modal" ? panel : null;
    },
    contains() {
      return false;
    },
    focus() {
      this.focusCalls += 1;
      world.document.activeElement = this;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
  const iframe = {
    classList: { contains(name) { return name === "chat-frame"; } },
    nodeName: "IFRAME",
    inert: false,
    dataset: {},
    blurCalls: 0,
    focusCalls: 0,
    blur() { this.blurCalls += 1; },
    focus() {
      this.focusCalls += 1;
      world.document.activeElement = this;
    },
    setAttribute(name) {
      if (name === "inert") this.inert = true;
    },
    removeAttribute(name) {
      if (name === "inert") this.inert = false;
    },
    closest(selector) {
      if (selector === ".chat-frame-wrap") return wrap;
      return null;
    }
  };
  const wrap = {
    className: "chat-frame-wrap",
    nodeName: "DIV",
    classList: { contains(name) { return name === "chat-frame-wrap"; } },
    contains(node) { return node === iframe; },
    querySelector(selector) {
      if (String(selector).includes("chat-frame")) return iframe;
      return null;
    },
    closest(selector) {
      return selector === ".chat-frame-wrap" ? this : null;
    }
  };
  const prompt = {
    classList: { contains(name) { return name === "prompt-input"; } },
    className: "textarea prompt-input",
    nodeName: "TEXTAREA",
    expandCalls: 0
  };
  const row = {
    _inPanel: true,
    nodeName: "BUTTON",
    className: "workspace-tabs-search-list-item"
  };
  const world = {
    field,
    iframe,
    wrap,
    prompt,
    panel,
    row,
    body,
    html,
    listeners,
    document: {
      body,
      documentElement: html,
      activeElement: field,
      hasFocus() {
        return world.documentHasFocus !== false;
      },
      addEventListener(type, handler, capture) {
        listeners.push({ type, handler, capture });
      },
      removeEventListener() {},
      querySelector(selector) {
        if (String(selector).includes(".modal")) return panel;
        if (String(selector).includes("prompt-input")) return prompt;
        return null;
      },
      querySelectorAll(selector) {
        if (String(selector).includes("iframe.chat-frame")) return [iframe];
        return [];
      }
    }
  };
  world.documentHasFocus = true;
  const windowTarget = {
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
    addEventListener(type, handler, capture) {
      listeners.push({ type, handler, capture, target: "window" });
    },
    removeEventListener() {}
  };
  world.window = windowTarget;
  const rafQueue = [];
  world.rafQueue = rafQueue;
  world.flushRaf = () => {
    const pending = rafQueue.splice(0);
    for (const callback of pending) callback();
  };
  const context = vm.createContext({
    document: world.document,
    window: windowTarget,
    Boolean,
    Number,
    String,
    Date,
    console,
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    cancelAnimationFrame() {}
  });
  vm.runInContext(
    `const openModals = [];
${caretSource}
globalThis.claimOverlaySearchCaret = claimOverlaySearchCaret;
globalThis.pinOverlaySearchCaret = pinOverlaySearchCaret;
globalThis.releaseOverlaySearchCaret = releaseOverlaySearchCaret;
globalThis.overlaySearchCaretMode = overlaySearchCaretMode;
globalThis.pageCaretHoldActive = pageCaretHoldActive;
globalThis.setOverlayCaretLeaseHandler = setOverlayCaretLeaseHandler;`,
    context
  );
  world.claim = context.claimOverlaySearchCaret;
  world.pin = context.pinOverlaySearchCaret;
  world.release = context.releaseOverlaySearchCaret;
  world.mode = context.overlaySearchCaretMode;
  world.hold = context.pageCaretHoldActive;
  world.setLeaseHandler = context.setOverlayCaretLeaseHandler;
  return world;
}

function claimField(world, extras = {}) {
  let left = false;
  world.claim(world.field, {
    getSelection: () => ({ start: Number(world.field.selectionStart) || 0, end: Number(world.field.selectionEnd) || 0 }),
    composing: () => Boolean(extras.composing?.()),
    onLeave: () => { left = true; extras.onLeave?.(); },
    panel: world.panel
  });
  return {
    get left() { return left; }
  };
}

{
  const world = createWorld();
  claimField(world);
  for (const delay of [0, 200, 1500, 5000]) {
    world.document.activeElement = world.iframe;
    const before = world.field.focusCalls;
    assert.equal(world.pin(), true, `iframe steal at ${delay}ms must pin the titlebar caret`);
    assert.equal(world.document.activeElement, world.field, `iframe steal at ${delay}ms must return focus to the field`);
    assert.ok(world.field.focusCalls > before, `iframe steal at ${delay}ms must call field.focus`);
    assert.ok(world.iframe.blurCalls >= 1, "stolen iframe focus must be blurred before pinning");
  }
}

{
  const world = createWorld();
  claimField(world);
  world.document.activeElement = world.prompt;
  assert.equal(world.pin(), true, "a .prompt-input steal must pin the titlebar caret");
  assert.equal(world.document.activeElement, world.field);
}

{
  const world = createWorld();
  claimField(world);
  world.document.activeElement = world.body;
  assert.equal(world.pin(), true, "a document.body steal must pin the titlebar caret");
  assert.equal(world.document.activeElement, world.field);
}

{
  const world = createWorld();
  claimField(world);
  world.document.activeElement = world.panel;
  assert.equal(world.pin(), true, "panel.focus() must count as a steal, not an in-modal leave");
  assert.equal(world.document.activeElement, world.field);
}

{
  const world = createWorld();
  world.field.value = "r";
  world.field.selectionStart = 1;
  world.field.selectionEnd = 1;
  claimField(world);
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), true, "first keystroke before the query commits must still pin");
  assert.equal(world.document.activeElement, world.field);
  assert.equal(world.field.selectionStart, 1);
  assert.equal(world.field.selectionEnd, 1);
}

{
  const world = createWorld();
  let composing = true;
  claimField(world, { composing: () => composing });
  world.document.activeElement = world.iframe;
  const before = world.field.focusCalls;
  assert.equal(world.pin(), false, "IME composition must not yank focus back into the field");
  assert.equal(world.field.focusCalls, before);
  composing = false;
  assert.equal(world.pin(), true, "compositionend must pin after IME settles");
  assert.equal(world.document.activeElement, world.field);
}

{
  const world = createWorld();
  let left = false;
  claimField(world, { onLeave: () => { left = true; } });
  world.document.activeElement = world.row;
  assert.equal(world.pin(), false, "a true in-modal row click must leave the caret owner");
  assert.equal(left, true);
  assert.notEqual(world.document.activeElement, world.field);
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), false, "after leave, iframe steal must not reclaim the field");
}

{
  const world = createWorld();
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), false, "without a claim, iframe load must not pin overlay search");
  assert.notEqual(world.document.activeElement, world.field);
}

{
  const world = createWorld();
  claimField(world);
  const focusin = world.listeners.find((entry) => entry.type === "focusin" && entry.capture === true);
  assert.ok(focusin, "claiming overlay search must install a capturing focusin listener");
  world.document.activeElement = world.iframe;
  focusin.handler({ target: world.iframe });
  assert.equal(world.document.activeElement, world.field, "capturing focusin on a steal target must pin");
}

{
  const world = createWorld();
  claimField(world);
  world.field.isConnected = false;
  assert.equal(world.pin(), false, "a disconnected field must drop the caret owner");
  world.field.isConnected = true;
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), false, "pin after disconnect must not resurrect the owner");
}

function createPageWorld() {
  const world = createWorld();
  world.document.querySelector = (selector) => {
    if (String(selector).includes("prompt-input")) return world.promptField;
    return null;
  };
  const shell = {
    className: "prompt-shell",
    classList: { contains(name) { return name === "prompt-shell"; } },
    contains(node) { return node === world.promptField || node === world.send; }
  };
  world.shell = shell;
  world.send = {
    nodeName: "BUTTON",
    className: "prompt-send-button",
    closest(selector) { return selector === ".prompt-shell" ? shell : null; }
  };
  world.topbarButton = {
    nodeName: "BUTTON",
    className: "icon-button",
    _inPanel: false,
    closest() { return null; }
  };
  world.promptField = {
    isConnected: true,
    value: "hello",
    nodeName: "TEXTAREA",
    className: "textarea prompt-input",
    focusCalls: 0,
    selectionStart: 5,
    selectionEnd: 5,
    closest(selector) {
      if (selector === ".prompt-shell") return shell;
      return null;
    },
    contains() { return false; },
    focus() {
      this.focusCalls += 1;
      world.document.activeElement = this;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
  world.document.activeElement = world.promptField;
  return world;
}

function claimPrompt(world, extras = {}) {
  let left = false;
  world.claim(world.promptField, {
    panel: world.shell,
    mode: "page",
    getSelection: () => ({ start: Number(world.promptField.selectionStart) || 0, end: Number(world.promptField.selectionEnd) || 0 }),
    composing: () => Boolean(extras.composing?.()),
    onLeave: () => { left = true; extras.onLeave?.(); }
  });
  return { get left() { return left; } };
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), true, "page mode must pin the prompt after an iframe steal");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.document.activeElement = world.body;
  assert.equal(world.pin(), true, "page mode must pin the prompt after a body steal");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  let left = false;
  claimPrompt(world, { onLeave: () => { left = true; } });
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), true, "load-driven focus on a topbar control must steal, not leave, while the page hold is on");
  assert.equal(left, false);
  assert.equal(world.document.activeElement, world.promptField);
  assert.equal(world.hold(), true, "a page hold must survive a load-driven chrome steal");
  assert.equal(world.iframe.inert, true, "a load-driven chrome steal must keep chat-frames inert");
}

{
  const world = createPageWorld();
  let left = false;
  claimPrompt(world, { onLeave: () => { left = true; } });
  const pointer = world.listeners.find((entry) => entry.type === "pointerdown" && entry.capture === true);
  assert.ok(pointer, "page claim must install a capturing pointerdown listener");
  pointer.handler({ isTrusted: true, target: world.iframe });
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), false, "a trusted pointer on the chat-frame must leave, not pin");
  assert.equal(left, true);
}

{
  const world = createPageWorld();
  let left = false;
  claimPrompt(world, { onLeave: () => { left = true; } });
  world.document.querySelector = (selector) => {
    if (String(selector) === ".modal") return world.panel;
    return null;
  };
  world.document.activeElement = world.panel;
  assert.equal(world.pin(), false, "an open typed modal must yield the page caret owner");
  assert.equal(left, true);
}

{
  const world = createPageWorld();
  claimPrompt(world);
  let composing = true;
  world.release();
  claimPrompt(world, { composing: () => composing });
  world.document.activeElement = world.iframe;
  const before = world.promptField.focusCalls;
  assert.equal(world.pin(), false, "page mode must skip pin during IME");
  assert.equal(world.promptField.focusCalls, before);
  composing = false;
  assert.equal(world.pin(), true, "page mode must pin after IME ends");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.document.activeElement = world.iframe;
  let focusCalls = 0;
  world.promptField.focus = function () {
    focusCalls += 1;
    this.focusCalls += 1;
    if (focusCalls >= 2) world.document.activeElement = this;
  };
  assert.equal(world.pin(), false, "pin must not report success when focus does not land");
  assert.equal(world.document.activeElement, world.iframe);
  assert.equal(world.mode(), "page", "a failed pin must keep the page caret owner claimed");
  world.flushRaf();
  assert.equal(world.document.activeElement, world.promptField, "pin follow-through must retry until the prompt holds focus");
  assert.ok(focusCalls >= 2);
}

{
  const world = createPageWorld();
  let adopts = 0;
  let releases = 0;
  world.setLeaseHandler({
    adopt() { adopts += 1; },
    release() { releases += 1; }
  });
  claimPrompt(world);
  assert.equal(adopts, 1, "a page claim must adopt the child-document caret lease");
  assert.equal(releases, 0);
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), true, "load-driven chrome focus must not release the page-caret lease");
  assert.equal(releases, 0);
  assert.equal(world.mode(), "page");
  const pointer = world.listeners.find((entry) => entry.type === "pointerdown" && entry.capture === true);
  pointer.handler({ isTrusted: true, target: world.wrap });
  assert.equal(releases, 1, "a trusted wrap pointer must release the child-document lease");
  assert.equal(world.mode(), "");
}

{
  const world = createWorld();
  let adopts = 0;
  world.setLeaseHandler({
    adopt() { adopts += 1; },
    release() {}
  });
  claimField(world);
  assert.equal(adopts, 0, "overlay search must not adopt the page caret lease");
  assert.equal(world.mode(), "overlay");
  const stolen = world.listeners.find((entry) => entry.type === "message");
  assert.ok(stolen, "overlay claim still installs the page-caret stolen listener");
  world.document.activeElement = world.iframe;
  const before = world.field.focusCalls;
  stolen.handler({ data: { source: "chatclub-page-caret", action: "stolen" } });
  assert.equal(world.field.focusCalls, before, "overlay mode must not re-pin from a page-caret stolen message");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.documentHasFocus = false;
  world.document.activeElement = world.promptField;
  const before = world.promptField.focusCalls;
  assert.equal(world.pin(), false, "pin must not report success when document.hasFocus() is false");
  assert.ok(world.promptField.focusCalls > before, "lost parent browsing context must still call field.focus");
  assert.equal(world.mode(), "page", "a hasFocus miss must keep the page caret owner claimed");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  assert.ok(focusout, "claiming must install a capturing focusout listener");
  world.document.activeElement = world.body;
  focusout.handler({ target: world.promptField, relatedTarget: world.body });
  assert.equal(world.document.activeElement, world.promptField, "focusout onto body must re-pin the prompt while the page hold is on");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  world.document.activeElement = world.iframe;
  focusout.handler({ target: world.promptField, relatedTarget: world.iframe });
  assert.equal(world.document.activeElement, world.promptField, "focusout onto an iframe must re-pin the prompt");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  const stolen = world.listeners.find((entry) => entry.type === "message");
  assert.ok(stolen, "page claim must listen for child page-caret stolen messages");
  world.document.activeElement = world.iframe;
  stolen.handler({ data: { source: "chatclub-page-caret", action: "stolen" } });
  assert.equal(world.document.activeElement, world.promptField, "a child stolen message must re-pin the prompt");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.document.activeElement = world.iframe;
  const before = world.window.focusCalls;
  assert.equal(world.pin(), true, "page pin must restore the parent browsing context");
  assert.ok(world.window.focusCalls > before, "pin uses window.focus");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimPrompt(world);
  assert.equal(world.iframe.inert, true, "a page claim must keep chat-frames inert");
  assert.equal(world.hold(), true, "a page claim must arm the page caret hold");
  world.release();
  assert.equal(world.mode(), "");
  assert.equal(world.hold(), true, "releasing the live claim must keep the page caret hold");
  assert.equal(world.iframe.inert, true, "releasing the live claim must keep chat-frames inert");
  world.document.activeElement = world.body;
  assert.equal(world.pin(), true, "pin must re-claim the live prompt while the page hold is on");
  assert.equal(world.document.activeElement, world.promptField);
  assert.equal(world.mode(), "page");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.promptField.isConnected = false;
  world.document.activeElement = world.body;
  const live = world.promptField;
  world.document.querySelector = (selector) => {
    if (String(selector).includes("prompt-input")) {
      live.isConnected = true;
      return live;
    }
    return null;
  };
  assert.equal(world.pin(), true, "a remounted prompt must be re-claimed while the page hold is on");
  assert.equal(world.document.activeElement, live);
  assert.equal(world.iframe.inert, true, "a remounted prompt must keep chat-frames inert");
}

{
  const world = createPageWorld();
  let left = false;
  claimPrompt(world, { onLeave: () => { left = true; } });
  assert.equal(world.iframe.inert, true, "a page claim must keep chat-frames inert");
  const pointer = world.listeners.find((entry) => entry.type === "pointerdown" && entry.capture === true);
  pointer.handler({ isTrusted: true, target: world.topbarButton });
  assert.equal(left, true, "a trusted pointer on other parent chrome must leave the page hold");
  assert.equal(world.hold(), false);
  assert.equal(world.iframe.inert, false, "a trusted pointer on other parent chrome must un-inert chat-frames");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  assert.equal(world.iframe.inert, true, "a page claim must keep chat-frames inert");
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), true);
  assert.equal(world.iframe.inert, true, "leaving the live claim without a trusted pointer must not un-inert chat-frames");
}

{
  const world = createPageWorld();
  let left = false;
  claimPrompt(world, { onLeave: () => { left = true; } });
  assert.equal(world.iframe.inert, true, "a page claim must keep chat-frames inert before a wrap click");
  const pointer = world.listeners.find((entry) => entry.type === "pointerdown" && entry.capture === true);
  pointer.handler({ isTrusted: true, target: world.wrap });
  assert.equal(left, true, "a trusted pointer on the frame wrap must leave");
  assert.equal(world.mode(), "");
  assert.equal(world.iframe.inert, false, "a trusted pointer on the frame wrap must leave and un-inert");
  assert.ok(world.iframe.focusCalls >= 1, "leaving through the wrap must focus the chat-frame so the click can enter");
}

{
  const world = createWorld();
  claimField(world);
  assert.equal(world.iframe.inert, true, "overlay search with a typed modal must keep chat-frames inert");
  world.document.activeElement = world.row;
  world.pin();
  assert.equal(world.iframe.inert, true, "leaving overlay search while a modal is open must keep chat-frames inert");
}

console.log("overlay caret lock tests passed");

