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
const view = read("app/workspace/view-controller.js");
const composer = read("app/composer/controller.js");
const agents = read("AGENTS.md");

assert.match(dom, /export function claimOverlaySearchCaret/);
assert.match(dom, /export function pinOverlaySearchCaret/);
assert.match(dom, /export function releaseOverlaySearchCaret/);
assert.match(dom, /export function overlaySearchCaretMode/);
assert.match(dom, /export function overlaySearchCaretComposer/);
assert.match(dom, /shouldLeave: typeof options\.shouldLeave === "function"/);
assert.match(frame, /overlaySearchCaretComposer\(\)/);
assert.match(dom, /export function setOverlayCaretLeaseHandler/);
// The composer claim must not inert chat-frames or the workspace island: inert only blocks the
// user's clicks, scrolling, and hover, while a site-isolated child can still focus itself.
assert.doesNotMatch(dom, /syncComposerWorkspaceIslandInert|overlayCaretExemptComposerIsland/);
assert.doesNotMatch(frame, /syncComposerWorkspaceIslandInert/);
assert.doesNotMatch(view, /syncComposerWorkspaceIslandInert/);
assert.doesNotMatch(frame, /iframe\.inert = Boolean\([^\n]*overlaySearchCaretComposer/);
assert.match(dom, /export function armComposerLoadPin/);
assert.match(dom, /OVERLAY_CARET_LOAD_PIN_MS/);
assert.match(dom, /composerLoadPinOpen/);
assert.match(frame, /armComposerLoadPin\(\)/);
assert.match(dom, /scheduleOverlayCaretPinFollow/);
assert.match(dom, /function overlayCaretDeferFramePin/);
assert.match(dom, /const OVERLAY_CARET_FRAME_GRACE_MS = 100/);
assert.match(dom, /function scheduleOverlayCaretFrameGrace/);
assert.match(composer, /onLeave: \(\) => \{[\s\S]*collapseInput\(inputNode\)/);
assert.match(dom, /function overlayCaretFrameForSource/);
assert.match(dom, /function leaveOverlayCaretForFrame/);
assert.match(dom, /data\.action === "pointer"/);
assert.match(dom, /document\.addEventListener\("focusin", onOverlaySearchCaretFocusIn, true\)/);
assert.match(dom, /document\.addEventListener\("focusout", onOverlaySearchCaretFocusOut, true\)/);
assert.match(dom, /window\.addEventListener\("message", onOverlayPageCaretMessage\)/);
assert.match(dom, /window\.addEventListener\("blur", onOverlayCaretWindowBlur\)/);
assert.match(dom, /function overlayCaretFieldHasFrameFocus/);
assert.match(dom, /field\.matches\(":focus"\)/);
assert.match(dom, /overlayCaretReacquiring = true;\s*try \{ window\.focus\?\.\(\); \} catch \{\} finally \{ overlayCaretReacquiring = false; \}/);
assert.match(agents, /`:focus` stops matching/);
assert.match(agents, /`window\.focus\(\)`/);
assert.match(tabSearch, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(tabSearch, /pinOverlaySearchCaret\(\)/);
assert.match(history, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(history, /pinOverlaySearchCaret\(\)/);
assert.doesNotMatch(tabSearch, /restoreSearchFieldAfterFrameLoad|FRAME_LOAD_SEARCH_FOCUS|addEventListener\("load"/);
assert.doesNotMatch(history, /restoreSearchFieldAfterFrameLoad|FRAME_LOAD_SEARCH_FOCUS|addEventListener\("load"/);
assert.match(frame, /prepareFrameNavigationFocusGuard[\s\S]*document\.querySelector\("\.modal"\)/);
assert.match(composer, /claimOverlaySearchCaret/);
assert.match(composer, /composer: true/);
assert.match(composer, /mode: "overlay"/);
assert.doesNotMatch(composer, /mode: "page"/);
assert.match(composer, /claimPromptCaret\(e\.target\)/);
assert.match(composer, /oncompositionstart/);
assert.match(composer, /oncompositionend/);
assert.match(agents, /the titlebar search is the unique caret owner/);
assert.match(agents, /a focused `\.prompt-input` is the overlay-grade composer caret owner/);
assert.match(agents, /does not inert chat-frames or the workspace island/);
assert.match(agents, /action: "pointer"/);
assert.match(agents, /`\[autofocus\]`/);
assert.match(agents, /three-frame follow cap/);
assert.match(agents, /post-load pin settle/);
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
    // Chromium: `:focus` only matches while this frame is the browser's focused frame.
    matches(selector) {
      return selector === ":focus" && world.document.activeElement === this && world.frameFocused !== false;
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
    contentWindow: { name: "chat-frame-window" },
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
      if (selector === ".chat-card") return card;
      return null;
    }
  };
  const card = {
    className: "chat-card",
    nodeName: "DIV",
    classList: { contains(name) { return name === "chat-card"; } },
    inert: false,
    contains(node) { return node === iframe || node === wrap; },
    setAttribute(name) {
      if (name === "inert") this.inert = true;
    },
    removeAttribute(name) {
      if (name === "inert") this.inert = false;
    },
    closest(selector) {
      return selector === ".chat-card" ? this : null;
    }
  };
  const grid = {
    className: "main-grid",
    nodeName: "MAIN",
    classList: { contains(name) { return name === "main-grid"; } },
    inert: false,
    contains(node) { return node === card || node === iframe || node === wrap; },
    setAttribute(name) {
      if (name === "inert") this.inert = true;
    },
    removeAttribute(name) {
      if (name === "inert") this.inert = false;
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
      if (selector === ".chat-frame-wrap") return this;
      if (selector === ".chat-card") return card;
      return null;
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
    card,
    grid,
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
        const text = String(selector);
        if (text.includes("iframe.chat-frame")) return [iframe];
        if (text.includes(".main-grid") || text.includes(".chat-card")) return [grid, card];
        return [];
      }
    }
  };
  world.documentHasFocus = true;
  world.frameFocused = true;
  const windowTarget = {
    focusCalls: 0,
    // Chromium: window.focus() moves the focused frame back to this document; field.focus() alone
    // is a no-op while the field is already this document's focused element.
    focus() {
      this.focusCalls += 1;
      world.frameFocused = true;
    },
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
  // The chat-frame pointer grace is a setTimeout; tests flush it explicitly.
  const timers = new Map();
  let timerSeq = 0;
  world.timers = timers;
  world.pendingTimers = () => [...timers.values()].map((entry) => entry.delay);
  world.flushTimers = () => {
    const pending = [...timers.entries()];
    timers.clear();
    for (const [, entry] of pending) entry.callback();
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
    cancelAnimationFrame() {},
    setTimeout(callback, delay) {
      timerSeq += 1;
      timers.set(timerSeq, { callback, delay });
      return timerSeq;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  });
  vm.runInContext(
    `const openModals = [];
${caretSource}
globalThis.claimOverlaySearchCaret = claimOverlaySearchCaret;
globalThis.pinOverlaySearchCaret = pinOverlaySearchCaret;
globalThis.releaseOverlaySearchCaret = releaseOverlaySearchCaret;
globalThis.overlaySearchCaretMode = overlaySearchCaretMode;
globalThis.overlaySearchCaretComposer = overlaySearchCaretComposer;
globalThis.setOverlayCaretLeaseHandler = setOverlayCaretLeaseHandler;
globalThis.armComposerLoadPin = armComposerLoadPin;`,
    context
  );
  world.claim = context.claimOverlaySearchCaret;
  world.pin = context.pinOverlaySearchCaret;
  world.release = context.releaseOverlaySearchCaret;
  world.mode = context.overlaySearchCaretMode;
  world.composerClaimed = context.overlaySearchCaretComposer;
  world.setLeaseHandler = context.setOverlayCaretLeaseHandler;
  world.armLoadPin = context.armComposerLoadPin;
  world.childMessage = (action, source = world.iframe.contentWindow) => {
    const message = world.listeners.find((entry) => entry.type === "message");
    assert.ok(message, "claiming a caret owner must listen for child page-caret messages");
    message.handler({ data: { source: "chatclub-page-caret", action }, source });
  };
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
    contains(node) { return node === world.promptField || node === world.send; }
  };
  world.shell = shell;
  world.send = { nodeName: "BUTTON", className: "prompt-send-button" };
  world.topbarButton = { nodeName: "BUTTON", className: "icon-button", _inPanel: false };
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
    matches(selector) {
      return selector === ":focus" && world.document.activeElement === this && world.frameFocused !== false;
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
  assert.equal(world.pin(), false, "a topbar control must leave the page caret owner");
  assert.equal(left, true);
  assert.notEqual(world.document.activeElement, world.promptField);
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
  assert.equal(world.pin(), false);
  assert.equal(releases, 1, "leaving the page caret owner must release the child-document lease");
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
  world.document.activeElement = world.iframe;
  const before = world.field.focusCalls;
  world.childMessage("stolen");
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
  world.document.activeElement = world.iframe;
  focusout.handler({ target: world.promptField, relatedTarget: world.iframe });
  assert.equal(world.document.activeElement, world.promptField, "focusout onto an iframe must re-pin the prompt");
}

{
  const world = createPageWorld();
  claimPrompt(world);
  world.document.activeElement = world.iframe;
  world.childMessage("stolen");
  assert.equal(world.document.activeElement, world.promptField, "a child stolen message must re-pin the prompt");
  world.document.activeElement = world.iframe;
  world.childMessage("stolen", { name: "not-a-chat-frame" });
  assert.equal(world.document.activeElement, world.iframe, "a stolen message from a window that is no chat-frame must be ignored");
}

{
  const world = createPageWorld();
  let left = false;
  claimPrompt(world, { onLeave: () => { left = true; } });
  world.document.activeElement = world.iframe;
  world.childMessage("pointer");
  assert.equal(left, true, "a child trusted-pointer report must leave the page caret owner");
  assert.equal(world.mode(), "");
  assert.equal(world.iframe.inert, false);
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
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), false);
  assert.equal(world.iframe.inert, false, "leaving the page caret owner must un-inert chat-frames");
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

function claimComposer(world, extras = {}) {
  let left = false;
  world.claim(world.promptField, {
    panel: world.shell,
    mode: "overlay",
    composer: true,
    getSelection: () => ({ start: Number(world.promptField.selectionStart) || 0, end: Number(world.promptField.selectionEnd) || 0 }),
    composing: () => Boolean(extras.composing?.()),
    stolen(active, field) {
      if (typeof extras.stolen === "function") return extras.stolen(active, field);
      if (!active) return true;
      if (active === world.iframe || active === world.body || active === world.html || active === world.wrap || active === world.card) return true;
      return false;
    },
    shouldLeave(active, field) {
      if (typeof extras.shouldLeave === "function") return extras.shouldLeave(active, field);
      if (active === world.send) return false;
      if (active === world.topbarButton || active === world.panel) return true;
      return false;
    },
    onLeave: () => { left = true; extras.onLeave?.(); }
  });
  return { get left() { return left; } };
}

{
  const world = createPageWorld();
  claimComposer(world);
  assert.equal(world.mode(), "overlay", "composer claims overlay mode so it is not a leftover page caret owner");
  assert.equal(world.composerClaimed(), true);
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), true, "composer overlay must pin after an iframe steal");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.document.activeElement = world.body;
  assert.equal(world.pin(), true, "composer overlay must pin after a body steal");
}

{
  const world = createPageWorld();
  const claim = claimComposer(world);
  world.document.activeElement = world.send;
  assert.equal(world.pin(), false, "in-shell send must hold without pin");
  assert.equal(claim.left, false);
  assert.equal(world.composerClaimed(), true);
  assert.equal(world.iframe.inert, false, "a composer hold must not inert chat-frames");
}

{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), false, "a topbar control must leave the composer caret owner");
  assert.equal(left, true);
}

{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  const pointer = world.listeners.find((entry) => entry.type === "pointerdown" && entry.capture === true);
  pointer.handler({ isTrusted: true, target: world.wrap });
  assert.equal(left, true, "a trusted pointer on the frame wrap must leave composer overlay");
  assert.equal(world.composerClaimed(), false);
  assert.equal(world.iframe.inert, false);
}

{
  const world = createPageWorld();
  let adopts = 0;
  let releases = 0;
  world.setLeaseHandler({
    adopt() { adopts += 1; },
    release() { releases += 1; }
  });
  claimComposer(world);
  assert.equal(adopts, 1, "composer overlay must adopt the page caret lease");
  assert.equal(releases, 0);
  assert.equal(world.iframe.inert, false, "composer claim must leave chat-frames interactive without a typed modal");
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), false);
  assert.equal(releases, 1, "leaving the composer caret owner must release the child-document lease");
  assert.equal(world.composerClaimed(), false);
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.document.activeElement = world.iframe;
  world.childMessage("stolen");
  assert.equal(world.document.activeElement, world.promptField, "a child stolen message must re-pin the composer");
}

// The parent never sees a pointerdown routed into a site-isolated chat-frame; the child shield reports
// it as `action: "pointer"` and that report is the user's leave.
{
  const world = createPageWorld();
  let left = false;
  let releases = 0;
  world.setLeaseHandler({ adopt() {}, release() { releases += 1; } });
  claimComposer(world, { onLeave: () => { left = true; } });
  world.document.activeElement = world.iframe;
  const windowFocusBefore = world.window.focusCalls;
  const frameFocusBefore = world.iframe.focusCalls;
  world.childMessage("pointer");
  assert.equal(left, true, "a child trusted-pointer report must leave the composer caret owner");
  assert.equal(world.composerClaimed(), false);
  assert.equal(releases, 1, "leaving through a child pointer must release the child-document lease");
  assert.equal(world.document.activeElement, world.iframe, "the frame keeps the browsing context after the user's click");
  assert.equal(world.iframe.focusCalls, frameFocusBefore, "frame.focus() while the frame already holds would blur the child editor");
  const blur = findWindowBlur(world);
  blur.handler({});
  world.flushRaf();
  world.flushTimers();
  assert.equal(world.window.focusCalls, windowFocusBefore, "after the user's click nothing may reclaim the caret");
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  focusout.handler({ target: world.promptField, relatedTarget: world.iframe });
  world.flushRaf();
  world.flushTimers();
  assert.equal(world.document.activeElement, world.iframe);
}

// A fresh claim means the user came back from the frame; the old click is no longer a leave.
{
  const world = createPageWorld();
  claimComposer(world);
  world.document.activeElement = world.iframe;
  world.childMessage("pointer");
  assert.equal(world.composerClaimed(), false);
  world.document.activeElement = world.promptField;
  claimComposer(world);
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), true, "a steal right after re-claiming must be reclaimed, not read as the earlier click");
  assert.equal(world.document.activeElement, world.promptField);
  assert.equal(world.composerClaimed(), true);
}

{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  world.document.activeElement = world.iframe;
  world.childMessage("pointer", { name: "not-a-chat-frame" });
  assert.equal(left, false, "a pointer report from a window that is no chat-frame must be ignored");
  assert.equal(world.composerClaimed(), true);
  world.childMessage("pointer", null);
  assert.equal(world.composerClaimed(), true);
}

{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  world.document.querySelector = (selector) => {
    if (String(selector) === ".modal") return world.panel;
    if (String(selector).includes("prompt-input")) return world.promptField;
    return null;
  };
  world.childMessage("pointer");
  assert.equal(left, false, "frames are inert under a typed modal, so a pointer report there cannot be a click");
  assert.equal(world.composerClaimed(), true);
}

// Focus entering a chat-frame may be the user's click whose report is still in flight: the composer
// re-pins on the next frame instead of synchronously.
{
  const world = createPageWorld();
  claimComposer(world);
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  assert.ok(focusout, "composer overlay must install a capturing focusout listener");
  world.document.activeElement = world.iframe;
  const windowFocusBefore = world.window.focusCalls;
  focusout.handler({ target: world.promptField, relatedTarget: null });
  assert.equal(world.document.activeElement, world.iframe, "cross-origin iframe focusout must not reclaim synchronously");
  assert.equal(world.window.focusCalls, windowFocusBefore);
  assert.deepEqual(world.pendingTimers(), [100], "the composer waits a 100ms grace for the child pointer report");
  world.flushRaf();
  assert.equal(world.document.activeElement, world.iframe, "an animation frame is not enough for a cold cross-process report");
  // The composer blur settle asks the owner during the grace: it still holds, so the input stays expanded.
  assert.equal(world.pin(), true, "pin during the grace reports a hold for an ambiguous destination");
  assert.equal(world.window.focusCalls, windowFocusBefore, "pin during the grace must not window.focus()");
  world.flushTimers();
  assert.equal(world.document.activeElement, world.promptField, "with no pointer report the grace timer reclaims the composer");
  assert.ok(world.window.focusCalls > windowFocusBefore);
  assert.equal(world.pendingTimers().length, 0);
}

// A concrete destination during the grace decides now: a topbar control is a leave.
{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  world.document.activeElement = world.iframe;
  focusout.handler({ target: world.promptField, relatedTarget: null });
  assert.equal(world.pendingTimers().length, 1);
  const focusin = world.listeners.find((entry) => entry.type === "focusin" && entry.capture === true);
  world.document.activeElement = world.topbarButton;
  focusin.handler({ target: world.topbarButton });
  assert.equal(left, true, "focus landing on a topbar control during the grace leaves immediately");
  assert.equal(world.pendingTimers().length, 0, "the leave cancels the grace timer");
}

// A child stolen report proves the steal: reclaim now instead of waiting out the grace.
{
  const world = createPageWorld();
  claimComposer(world);
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  world.document.activeElement = world.iframe;
  focusout.handler({ target: world.promptField, relatedTarget: null });
  assert.equal(world.pendingTimers().length, 1);
  world.childMessage("stolen");
  assert.equal(world.document.activeElement, world.promptField, "a stolen report short-circuits the pointer grace");
  assert.equal(world.pendingTimers().length, 0);
}

{
  const world = createPageWorld();
  claimComposer(world);
  const focusin = world.listeners.find((entry) => entry.type === "focusin" && entry.capture === true);
  world.document.activeElement = world.iframe;
  focusin.handler({ target: world.iframe });
  assert.equal(world.document.activeElement, world.iframe, "focusin on a chat-frame must defer the composer re-pin");
  world.flushTimers();
  assert.equal(world.document.activeElement, world.promptField);
  world.document.activeElement = world.body;
  focusin.handler({ target: world.body });
  assert.equal(world.document.activeElement, world.promptField, "focusin on a non-frame steal target still reclaims synchronously");
}

{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  world.document.activeElement = world.iframe;
  focusout.handler({ target: world.promptField, relatedTarget: world.iframe });
  world.childMessage("pointer");
  world.flushTimers();
  assert.equal(left, true, "a pointer report landing before the deferred pin turns the frame focus into a leave");
  assert.equal(world.document.activeElement, world.iframe);
  assert.equal(world.composerClaimed(), false);
}

{
  const world = createPageWorld();
  let left = false;
  claimComposer(world, { onLeave: () => { left = true; } });
  const focusout = world.listeners.find((entry) => entry.type === "focusout" && entry.capture === true);
  world.document.activeElement = world.iframe;
  focusout.handler({ target: world.promptField, relatedTarget: world.iframe });
  world.flushTimers();
  assert.equal(world.document.activeElement, world.promptField, "the deferred pin ran before the report arrived");
  const frameFocusBefore = world.iframe.focusCalls;
  world.childMessage("pointer");
  assert.equal(left, true, "a late pointer report must still leave");
  assert.ok(world.iframe.focusCalls > frameFocusBefore, "a late pointer report hands the browsing context back to the frame");
  assert.equal(world.document.activeElement, world.iframe);
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.promptField.isConnected = false;
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), false, "a disconnected composer field must keep intent without pin");
  assert.equal(world.composerClaimed(), true);
  assert.equal(world.iframe.inert, false, "composer intent across a textarea remount must not inert chat-frames");
  world.promptField.isConnected = true;
  assert.equal(world.pin(), true, "composer pin rebinds the live .prompt-input");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimComposer(world);
  const stale = world.promptField;
  stale.isConnected = false;
  const next = {
    isConnected: true,
    value: "hello",
    nodeName: "TEXTAREA",
    className: "textarea prompt-input",
    focusCalls: 0,
    selectionStart: 5,
    selectionEnd: 5,
    closest(selector) {
      return selector === ".prompt-shell" ? world.shell : null;
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
  world.document.querySelector = (selector) => {
    if (String(selector).includes("prompt-input")) return next;
    return null;
  };
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), true, "composer pin must rebind a remounted .prompt-input");
  assert.equal(world.document.activeElement, next);
  assert.ok(next.focusCalls >= 1);
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.release(world.promptField);
  assert.equal(world.composerClaimed(), true, "release without leave keeps composer intent");
  assert.equal(world.iframe.inert, false, "composer intent after clear(false) must not inert chat-frames");
  assert.equal(world.card.inert, false, "composer intent must not inert the workspace island");
  world.document.activeElement = world.iframe;
  assert.equal(world.pin(), true, "intent-only pin rebinds the live .prompt-input");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimComposer(world);
  assert.equal(world.card.inert, false, "composer claim must not inert the workspace island .chat-card");
  assert.equal(world.grid.inert, false, "composer claim must not inert the workspace island .main-grid");
  assert.equal(world.iframe.inert, false, "composer claim must not inert chat-frames");
  world.iframe.dataset.frameLoadPending = "1";
  world.iframe.inert = true;
  world.document.activeElement = world.topbarButton;
  assert.equal(world.pin(), false);
  assert.equal(world.iframe.inert, true, "leaving the composer must not clear a loading frame's own inert");
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.document.activeElement = null;
  assert.equal(world.pin(), true, "composer overlay must pin after a null activeElement steal");
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createWorld();
  claimField(world);
  assert.equal(world.card.inert, false, "typed overlay search must not inert the workspace island (modal sibling inert owns that)");
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.documentHasFocus = false;
  world.iframe.dataset.frameLoadPending = "1";
  world.document.activeElement = world.iframe;
  const before = world.promptField.focusCalls;
  assert.equal(world.pin(), false, "composer load pin must not report success while the iframe owns hasFocus");
  assert.ok(world.promptField.focusCalls > before, "load pin must still call field.focus");
  assert.equal(world.composerClaimed(), true);
  for (let i = 0; i < 5; i += 1) world.flushRaf();
  assert.ok(
    world.promptField.focusCalls >= before + 6,
    "composer load pin retries past the three-frame follow cap"
  );
  assert.equal(world.composerClaimed(), true);
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.documentHasFocus = false;
  world.document.activeElement = world.iframe;
  assert.equal(world.armLoadPin(), true, "composer claim must arm the post-load pin settle");
  const before = world.promptField.focusCalls;
  world.pin();
  for (let i = 0; i < 4; i += 1) world.flushRaf();
  assert.ok(world.promptField.focusCalls > before + 3, "post-load settle pin retries past three frames");
  assert.equal(world.composerClaimed(), true);
}

{
  const world = createWorld();
  claimField(world);
  world.documentHasFocus = false;
  world.iframe.dataset.frameLoadPending = "1";
  world.document.activeElement = world.iframe;
  const before = world.field.focusCalls;
  world.pin();
  world.flushRaf();
  world.flushRaf();
  world.flushRaf();
  world.flushRaf();
  assert.equal(world.mode(), "overlay");
  assert.ok(world.field.focusCalls - before <= 4, "overlay search must not use the composer load-window pin");
}

// Phantom hold: a site-isolated chat-frame took the browser's focused frame while this document
// still reports the field as activeElement and hasFocus() stays true. Keystrokes go to the child.
function findWindowBlur(world) {
  const blur = world.listeners.find((entry) => entry.type === "blur" && entry.target === "window");
  assert.ok(blur, "claiming a caret owner must listen for the parent window blur");
  return blur;
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.frameFocused = false;
  assert.equal(world.document.activeElement, world.promptField);
  assert.equal(world.document.hasFocus(), true);
  const windowFocusBefore = world.window.focusCalls;
  assert.equal(world.pin(), true, "a phantom hold must re-acquire the focused frame instead of reporting success");
  assert.ok(world.window.focusCalls > windowFocusBefore, "re-acquiring the focused frame must go through window.focus()");
  assert.equal(world.frameFocused, true);
  assert.equal(world.document.activeElement, world.promptField);
  assert.equal(world.composerClaimed(), true);
}

{
  const world = createWorld();
  claimField(world);
  world.frameFocused = false;
  const windowFocusBefore = world.window.focusCalls;
  assert.equal(world.pin(), true, "the titlebar search owner must re-acquire the focused frame from a phantom hold");
  assert.ok(world.window.focusCalls > windowFocusBefore);
  assert.equal(world.frameFocused, true);
}

{
  const world = createPageWorld();
  claimComposer(world);
  const blur = findWindowBlur(world);
  world.frameFocused = false;
  const before = world.window.focusCalls;
  blur.handler({});
  assert.equal(world.window.focusCalls, before, "window blur must defer the re-pin until Chromium finished switching frames");
  world.flushRaf();
  assert.equal(world.window.focusCalls, before, "the composer window blur waits out the pointer grace, not one frame");
  world.flushTimers();
  assert.ok(world.window.focusCalls > before, "the deferred re-pin must call window.focus()");
  assert.equal(world.frameFocused, true);
  assert.equal(world.document.activeElement, world.promptField);
}

{
  const world = createPageWorld();
  claimComposer(world);
  const blur = findWindowBlur(world);
  world.documentHasFocus = false;
  world.frameFocused = false;
  const before = world.window.focusCalls;
  blur.handler({});
  world.flushRaf();
  world.flushTimers();
  assert.equal(world.window.focusCalls, before, "a browser-window blur (hasFocus false) must not fight the OS");
}

{
  const world = createPageWorld();
  claimComposer(world);
  world.frameFocused = false;
  let nested = 0;
  world.window.focus = function () {
    this.focusCalls += 1;
    nested += 1;
    if (nested > 3) throw new Error("window.focus() recursion");
    // Chromium re-dispatches `focus` on the field before the frame switch completes and the
    // composer onfocus handler re-claims the caret from inside that event.
    claimComposer(world);
    world.frameFocused = true;
  };
  assert.equal(world.pin(), true);
  assert.equal(nested, 1, "a re-claim from the re-dispatched focus event must not recurse into window.focus()");
}

{
  const world = createPageWorld();
  claimComposer(world);
  const blur = findWindowBlur(world);
  let pins = 0;
  for (let i = 0; i < 12; i += 1) {
    world.frameFocused = false;
    const before = world.window.focusCalls;
    blur.handler({});
    world.flushTimers();
    if (world.window.focusCalls > before) pins += 1;
  }
  assert.equal(pins, 8, "window-blur re-pins are capped so a self-refocusing site cannot ping-pong every frame");
}

console.log("overlay caret lock tests passed");

