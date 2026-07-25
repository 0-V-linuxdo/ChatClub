#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.fail(message);
}

function selectorClasses(selector) {
  return String(selector || "")
    .trim()
    .split(".")
    .slice(1)
    .filter(Boolean);
}

class FakeNode {
  constructor(tagName = "div") {
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.selectionDirection = "none";
    this.scrollHeight = 42;
    this.scrollTop = 0;
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      contains: (name) => this._classes.has(name),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get childNodes() {
    return this.children;
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, values = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      button: 0,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediatePropagationStopped = true; },
      ...values
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }

  click() {
    this.dispatch("click");
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  setSelectionRange(start, end, direction = "none") {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes.set(key, String(value));
    if (key === "class") this.className = value;
    if (key === "value") this.value = String(value);
    if (key === "hidden") this.hidden = true;
    if (key === "disabled") this.disabled = true;
    if (key === "readonly") this.readOnly = true;
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  removeAttribute(name) {
    const key = String(name);
    this.attributes.delete(key);
    if (key === "hidden") this.hidden = false;
    if (key === "disabled") this.disabled = false;
    if (key === "readonly") this.readOnly = false;
  }

  matches(selector) {
    const value = String(selector || "").trim();
    if (!value) return false;
    if (value.startsWith(".")) return selectorClasses(value).every((name) => this.classList.contains(name));
    return value.toUpperCase() === this.tagName;
  }

  querySelectorAll(selector) {
    const selectors = String(selector || "").split(",").map((item) => item.trim()).filter(Boolean);
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (selectors.some((item) => child.matches(item))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }

  getBoundingClientRect() {
    return { top: 10, bottom: 40, left: 10, right: 50, width: 40, height: 30 };
  }
}

const previousGlobals = {
  FileReader: globalThis.FileReader,
  Node: globalThis.Node,
  document: globalThis.document,
  window: globalThis.window,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame
};

globalThis.Node = FakeNode;
globalThis.document = {
  activeElement: null,
  body: new FakeNode("body"),
  documentElement: new FakeNode("html"),
  createElement: (tagName) => new FakeNode(tagName),
  createElementNS: (_namespace, tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node.textContent = String(value);
    return node;
  },
  addEventListener() {},
  removeEventListener() {},
  querySelector(selector) { return this.body.querySelector(selector); },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
};
globalThis.window = {
  innerHeight: 900,
  innerWidth: 1400,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.FileReader = class {
  readAsDataURL(file) {
    this.result = file.dataUrl;
    queueMicrotask(() => this.onload?.());
  }
};

function createState() {
  return {
    options: { frameToastPosition: { x: 50, y: 50 } },
    promptHistoryCursor: -1,
    promptHistoryDraft: "",
    promptImages: [],
    promptLibrary: [],
    promptQueuedTargetCount: 0,
    promptSelection: { start: 0, end: 0, direction: "none" },
    promptSendHistory: [],
    promptSendingTargetCount: 0,
    promptText: "",
    shortcutConfig: {}
  };
}

function preferredModelStub() {
  return {
    armPreferredModelSubmissionNavigation() {},
    finishPreferredModelSubmissionNavigation() {},
    preferredModelFailurePolicyForApp: () => "send-current",
    preferredModelFrameReadiness: () => ({ state: "detached" }),
    preferredModelFrameReadinessIsCurrent: () => true,
    waitForPreferredModelFrame: async () => ({ state: "detached" }),
    waitForPreferredModelSubmissionBarrier: async () => ({ state: "none" })
  };
}

(async () => {
  const { createComposerController } = await import(moduleUrl("app/composer/controller.js"));

  for (const gateState of ["applying", "failed"]) {
    globalThis.document.body.replaceChildren();
    globalThis.document.activeElement = null;
    const state = createState();
    let promptLibraryOpens = 0;
    let optimizeRuns = 0;
    const controller = createComposerController({
      state,
      workspace: {
        closePopovers() {},
        currentFrames: () => [],
        frameApp: () => null
      },
      preferredModel: preferredModelStub(),
      topbar: { closeSettingsMenu() {} },
      framePort: { ensure: async () => null, request: async () => ({ sent: true }) },
      keyboardPlatform: "mac",
      activeShortcutProfile: () => ({ sendKeyMode: "enter" }),
      inferAppName: () => "",
      openPromptLibrary: () => { promptLibraryOpens += 1; },
      optimizePrompt: () => { optimizeRuns += 1; },
      recordFunctionalAnomaly() {},
      savePromptSendHistory: async (next) => next,
      toast() {},
      createFrameToast: () => ({ dismiss() {}, remove() {}, update() {} })
    });
    const view = controller.render({
      placeholder: "Type",
      gate: { state: gateState, reason: gateState === "failed" ? "picker failed" : "" }
    });
    globalThis.document.body.append(view);
    const input = view.querySelector(".prompt-input");
    const shell = view.querySelector(".prompt-shell");
    const actions = view.querySelector(".prompt-actions-button");
    const fileInput = view.querySelector(".prompt-image-file-input");
    const send = view.querySelector(".prompt-send-button");
    assert.ok(input && shell && actions && fileInput && send);
    assert.equal(input.readOnly, false, `${gateState}: textarea must remain editable`);
    assert.equal(input.disabled, false, `${gateState}: textarea must remain enabled`);
    assert.equal(input.getAttribute("aria-busy"), null, `${gateState}: model state must not claim textarea busy`);
    assert.equal(actions.disabled, false, `${gateState}: actions menu must remain enabled`);
    assert.equal(fileInput.disabled, false, `${gateState}: image picker must remain enabled`);

    input.value = `中文输入-${gateState}`;
    input.selectionStart = 2;
    input.selectionEnd = 4;
    input.selectionDirection = "forward";
    input.dispatch("input", { isComposing: true });
    assert.equal(state.promptText, `中文输入-${gateState}`, `${gateState}: IME input must update the draft`);
    input.dispatch("select");
    assert.deepEqual(
      state.promptSelection,
      { start: 2, end: 4, direction: "forward" },
      `${gateState}: selection must remain writable`
    );
    const composingEnter = input.dispatch("keydown", { key: "Enter", keyCode: 229, isComposing: true });
    assert.equal(composingEnter.defaultPrevented, undefined, `${gateState}: composing Enter must not be intercepted`);

    const paste = input.dispatch("paste", {
      clipboardData: {
        files: [{
          name: `${gateState}.png`,
          type: "image/png",
          size: 4,
          lastModified: 1,
          dataUrl: "data:image/png;base64,QUJDRA=="
        }]
      }
    });
    assert.equal(paste.defaultPrevented, true, `${gateState}: image paste must be accepted`);
    await waitUntil(() => state.promptImages.length === 1, `${gateState}: pasted image was not added`);
    assert.equal(state.promptImages[0].name, `${gateState}.png`);
    assert.ok(view.querySelector(".prompt-image-remove"), `${gateState}: pasted image must expose removal`);

    actions.dispatch("click");
    let menu = globalThis.document.querySelector(".prompt-actions-popover");
    assert.ok(menu, `${gateState}: prompt actions menu must open`);
    menu.children[1].dispatch("click");
    assert.equal(promptLibraryOpens, 1, `${gateState}: prompt library action must run`);
    actions.dispatch("click");
    menu = globalThis.document.querySelector(".prompt-actions-popover");
    assert.ok(menu, `${gateState}: prompt actions menu must reopen`);
    menu.children[2].dispatch("click");
    assert.equal(optimizeRuns, 1, `${gateState}: optimize action must run`);

    const clear = view.querySelector(".prompt-clear-button");
    assert.equal(clear.disabled, false, `${gateState}: clear must remain enabled`);
    clear.dispatch("click");
    assert.equal(state.promptText, "", `${gateState}: clear must reset text`);
    assert.deepEqual(state.promptImages, [], `${gateState}: clear must reset images`);
    assert.equal(input.value, "", `${gateState}: clear must synchronize the textarea`);
  }

  console.log("Composer model-state non-blocking input behavior: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});
