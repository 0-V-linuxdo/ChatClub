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
assert.match(dom, /document\.addEventListener\("focusin", onOverlaySearchCaretFocusIn, true\)/);
assert.match(tabSearch, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(tabSearch, /pinOverlaySearchCaret\(\)/);
assert.match(history, /claimOverlaySearchCaret\(field, searchCaretOptions\(\)\)/);
assert.match(history, /pinOverlaySearchCaret\(\)/);
assert.doesNotMatch(tabSearch, /restoreSearchFieldAfterFrameLoad|FRAME_LOAD_SEARCH_FOCUS|addEventListener\("load"/);
assert.doesNotMatch(history, /restoreSearchFieldAfterFrameLoad|FRAME_LOAD_SEARCH_FOCUS|addEventListener\("load"/);
assert.match(frame, /prepareFrameNavigationFocusGuard[\s\S]*document\.querySelector\("\.modal"\)/);
assert.match(composer, /claimOverlaySearchCaret/);
assert.match(composer, /mode: "page"/);
assert.match(composer, /claimPromptCaret\(e\.target\)/);
assert.match(composer, /oncompositionstart/);
assert.match(composer, /oncompositionend/);
assert.match(agents, /the titlebar search is the unique caret owner/);
assert.match(agents, /a focused `\.prompt-input` is the page caret owner/);
assert.match(frame, /function restorePromptInputFocus/);

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
    blurCalls: 0,
    blur() { this.blurCalls += 1; }
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
      addEventListener(type, handler, capture) {
        listeners.push({ type, handler, capture });
      },
      removeEventListener() {},
      querySelector(selector) {
        if (String(selector).includes(".modal")) return panel;
        if (String(selector).includes("prompt-input")) return prompt;
        return null;
      }
    }
  };
  const context = vm.createContext({
    document: world.document,
    Boolean,
    Number,
    String,
    Date,
    console
  });
  vm.runInContext(
    `const openModals = [];
${caretSource}
globalThis.claimOverlaySearchCaret = claimOverlaySearchCaret;
globalThis.pinOverlaySearchCaret = pinOverlaySearchCaret;
globalThis.releaseOverlaySearchCaret = releaseOverlaySearchCaret;`,
    context
  );
  world.claim = context.claimOverlaySearchCaret;
  world.pin = context.pinOverlaySearchCaret;
  world.release = context.releaseOverlaySearchCaret;
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

console.log("overlay caret lock tests passed");
