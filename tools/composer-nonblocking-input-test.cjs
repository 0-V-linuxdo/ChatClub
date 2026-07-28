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
    this.style = { transition: "", setProperty() {} };
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
    this.naturalScrollHeight = 42;
    this.animatedScrollHeight = 0;
    this.scrollHeightMeasurements = [];
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

  get scrollHeight() {
    this.scrollHeightMeasurements.push({
      height: this.style.height || "",
      overflowY: this.style.overflowY || "",
      transition: this.style.transition || ""
    });
    const inlineHeight = Number.parseFloat(this.style.height);
    const animatedHeight = this.style.transition === "none" ? 0 : this.animatedScrollHeight;
    return Math.max(this.naturalScrollHeight, Number.isFinite(inlineHeight) ? inlineHeight : 0, animatedHeight);
  }

  get offsetHeight() {
    const inlineHeight = Number.parseFloat(this.style.height);
    return Number.isFinite(inlineHeight) ? inlineHeight : this.naturalScrollHeight;
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

function nodeText(node) {
  if (!node) return "";
  if (node.nodeType === 3) return String(node.textContent || "");
  return (node.children || []).map(nodeText).join("");
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
  const { createPreferredModelController } = await import(moduleUrl("app/preferred-model/controller.js"));

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
    const status = view.querySelector(".prompt-model-gate-status");
    const statusText = status?.querySelector(".prompt-model-gate-status-text");
    const modelLive = view.querySelector(".prompt-model-gate-live");
    assert.ok(input && shell && actions && fileInput && send && status && statusText && modelLive);
    assert.equal(view.querySelectorAll(".prompt-model-gate-status").length, 1, `${gateState}: visual status must be unique`);
    assert.equal(view.querySelectorAll(".prompt-model-gate-live").length, 1, `${gateState}: model live region must be unique`);
    assert.equal(status.parentElement, shell, `${gateState}: visual status must stay inside the prompt shell`);
    assert.equal(status.hidden, false, `${gateState}: visual status must be visible while unsettled`);
    assert.equal(status.getAttribute("aria-live"), null, `${gateState}: visual status must not duplicate announcements`);
    assert.equal(status.getAttribute("aria-atomic"), null, `${gateState}: visual status must not own live semantics`);
    assert.equal(status.getAttribute("role"), "note", `${gateState}: the focusable visual must expose non-live status semantics`);
    assert.equal(status.getAttribute("tabindex"), "0", `${gateState}: visual status must support keyboard focus`);
    assert.equal(status.getAttribute("aria-label"), nodeText(statusText), `${gateState}: visual status must expose its full label`);
    assert.equal(status.getAttribute("data-tooltip"), nodeText(statusText), `${gateState}: tooltip must retain the full status text`);
    assert.equal(status.getAttribute("data-tooltip-placement"), "left");
    assert.equal(status.getAttribute("data-tooltip-wrap"), "true");
    assert.equal(modelLive.hidden, false, `${gateState}: the live region must remain mounted and unhidden`);
    assert.equal(modelLive.getAttribute("aria-live"), "polite");
    assert.equal(modelLive.getAttribute("aria-atomic"), "true");
    assert.equal(nodeText(modelLive), "", `${gateState}: initial live text is populated after DOM insertion by gate sync`);
    assert.equal(
      Boolean(status.querySelector(".prompt-model-gate-spinner")),
      gateState === "applying",
      `${gateState}: applying must use only the progress icon`
    );
    assert.equal(
      Boolean(status.querySelector(".prompt-model-gate-failure-icon")),
      gateState === "failed",
      `${gateState}: failed must use only the alert icon`
    );
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

    input.value += "\n第二行";
    input.dispatch("input");
    assert.equal(shell.classList.contains("prompt-shell-expanded"), true, `${gateState}: multiline input must expand`);
    input.dispatch("blur", { relatedTarget: status });
    status.focus();
    assert.equal(
      shell.classList.contains("prompt-shell-expanded"),
      true,
      `${gateState}: focusing the status must not collapse multiline input`
    );
    const outside = new FakeNode("button");
    globalThis.document.body.append(outside);
    shell.dispatch("focusout", { target: status, relatedTarget: outside });
    assert.equal(
      shell.classList.contains("prompt-shell-expanded"),
      false,
      `${gateState}: leaving the prompt shell must collapse multiline input`
    );
    assert.equal(input.style.height, "38px", `${gateState}: collapsed input must retain its 38px height`);
    input.dispatch("focus");

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
    assert.equal(shell.classList.contains("prompt-shell-has-images"), true, `${gateState}: image layout must be active`);
    input.dispatch("blur", { relatedTarget: status });
    status.focus();
    assert.equal(
      shell.classList.contains("prompt-shell-expanded"),
      true,
      `${gateState}: focusing the status must keep the image layout expanded`
    );
    const statusPointerDown = status.dispatch("pointerdown");
    assert.equal(statusPointerDown.propagationStopped, true, `${gateState}: status pointer input must not reopen the textarea`);
    assert.equal(statusPointerDown.defaultPrevented, undefined, `${gateState}: status pointer input must remain focusable`);
    input.dispatch("focus");

    const firstImage = state.promptImages[0];
    controller.setImages([
      firstImage,
      {
        id: `second-${gateState}`,
        name: `second-${gateState}.png`,
        type: "image/png",
        size: 4,
        lastModified: 2,
        dataUrl: "data:image/png;base64,RUZHSA=="
      }
    ], { focus: true });
    assert.equal(state.promptImages.length, 2, `${gateState}: sizing fixture must contain two images`);
    assert.equal(input.style.height, "180px", `${gateState}: two images must keep the expanded image height`);
    view.querySelector(".prompt-image-remove").dispatch("click");
    assert.equal(state.promptImages.length, 1, `${gateState}: removing one of two images must preserve the other`);
    assert.equal(input.style.height, "180px", `${gateState}: one remaining image must keep the 180px image layout`);

    input.naturalScrollHeight = 96;
    input.animatedScrollHeight = 178;
    view.querySelector(".prompt-image-remove").dispatch("click");
    assert.equal(state.promptImages.length, 0, `${gateState}: removing the last image must clear image layout`);
    assert.equal(input.style.height, "96px", `${gateState}: removing the last image must restore the text's natural height`);
    assert.deepEqual(
      input.scrollHeightMeasurements.at(-1),
      { height: "0px", overflowY: "hidden", transition: "none" },
      `${gateState}: natural height must be measured from zero with the stale image-height transition disabled`
    );
    assert.equal(input.style.transition, "", `${gateState}: natural sizing must restore the authored height transition`);
    input.animatedScrollHeight = 0;

    input.value = "short";
    input.naturalScrollHeight = 42;
    input.dispatch("input");
    assert.equal(input.style.height, "42px", `${gateState}: deleting multiline text must shrink the input`);
    assert.equal(input.style.overflowY, "hidden", `${gateState}: short text must hide its scrollbar`);

    input.value = "line one\nline two\nline three";
    input.naturalScrollHeight = 96;
    input.dispatch("input");
    assert.equal(input.style.height, "96px", `${gateState}: adding text lines must grow to the natural multiline height`);
    assert.equal(input.style.overflowY, "hidden", `${gateState}: multiline text below the cap must hide its scrollbar`);

    input.value = "short after multiline";
    input.naturalScrollHeight = 42;
    input.dispatch("input");
    assert.equal(input.style.height, "42px", `${gateState}: deleting added lines must restore the short-text height`);

    input.value = Array.from({ length: 16 }, (_, index) => `line-${index}`).join("\n");
    input.naturalScrollHeight = 240;
    input.dispatch("input");
    assert.equal(input.style.height, "180px", `${gateState}: long text must remain capped at the viewport maximum`);
    assert.equal(input.style.overflowY, "auto", `${gateState}: capped long text must remain scrollable`);

    input.value = "short again";
    input.naturalScrollHeight = 42;
    input.dispatch("input");
    assert.equal(input.style.height, "42px", `${gateState}: shortening capped text must shrink the input again`);
    assert.equal(input.style.overflowY, "hidden", `${gateState}: shrinking capped text must hide its scrollbar`);

    state.promptSendHistory = [{ text: "history line one\nhistory line two\nhistory line three", images: [] }];
    input.value = "live draft";
    input.naturalScrollHeight = 42;
    input.selectionStart = input.selectionEnd = input.value.length;
    input.dispatch("input");
    input.naturalScrollHeight = 96;
    const historyUp = input.dispatch("keydown", { key: "ArrowUp" });
    assert.equal(historyUp.defaultPrevented, true, `${gateState}: history recall must handle ArrowUp`);
    assert.equal(input.value, state.promptSendHistory[0].text, `${gateState}: history recall must restore the saved text`);
    assert.equal(input.style.height, "96px", `${gateState}: multiline history recall must grow to its natural height`);
    input.naturalScrollHeight = 42;
    const historyDown = input.dispatch("keydown", { key: "ArrowDown" });
    assert.equal(historyDown.defaultPrevented, true, `${gateState}: history draft restore must handle ArrowDown`);
    assert.equal(input.value, "live draft", `${gateState}: history navigation must restore the live draft`);
    assert.equal(input.style.height, "42px", `${gateState}: short history draft restore must shrink to its natural height`);
    assert.equal(input.style.overflowY, "hidden", `${gateState}: short history draft restore must hide its scrollbar`);

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
    assert.equal(input.style.height, "42px", `${gateState}: clear must preserve the empty input's natural height`);
    assert.equal(input.style.overflowY, "hidden", `${gateState}: clear must hide the empty input's scrollbar`);
  }

  globalThis.document.body.replaceChildren();
  const syncState = createState();
  const syncComposer = createComposerController({
    state: syncState,
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
    openPromptLibrary() {},
    optimizePrompt() {},
    recordFunctionalAnomaly() {},
    savePromptSendHistory: async (next) => next,
    toast() {},
    createFrameToast: () => ({ dismiss() {}, remove() {}, update() {} })
  });
  const syncView = syncComposer.render({ placeholder: "Type", gate: { state: "bootstrapping" } });
  globalThis.document.body.append(syncView);
  const syncWorkspace = { currentFrames: () => [], frameApp: () => null };
  const preferredController = createPreferredModelController({
    state: syncState,
    workspace: syncWorkspace,
    framePort: { ensure: async () => null, request: async () => ({}) },
    appRoot: globalThis.document.body,
    verifiedCurrentContentFrameRegistration: () => null,
    prepareContentFrameRuntime: async () => null,
    recordFunctionalAnomaly() {}
  });
  preferredController.syncPreferredModelInputGate();
  const syncShell = syncView.querySelector(".prompt-shell");
  const syncedStatus = syncShell.querySelector(".prompt-model-gate-status");
  const syncedLive = syncShell.querySelector(".prompt-model-gate-live");
  assert.equal(syncedLive.textContent, syncedStatus.getAttribute("aria-label"), "dedicated live region must announce the inserted visual status");
  assert.equal(syncedStatus.getAttribute("aria-live"), null, "visual status must stay silent after Preferred Model sync");
  assert.equal(syncedLive.hidden, false, "live region must never use hidden while announcing");
  const initialAnnouncementKey = syncedLive.dataset.modelGateAnnouncementKey;
  const syncedInput = syncShell.querySelector(".prompt-input");
  syncedInput.classList.add("prompt-input-expanded");
  syncShell.classList.add("prompt-shell-expanded", "prompt-shell-has-images");
  syncedStatus.focus();
  preferredController.syncPreferredModelInputGate();
  assert.equal(syncShell.querySelector(".prompt-model-gate-status"), syncedStatus, "duplicate status sync must preserve the focused visual node");
  assert.equal(globalThis.document.activeElement, syncedStatus, "duplicate status sync must preserve visual focus");
  assert.equal(syncedLive.dataset.modelGateAnnouncementKey, initialAnnouncementKey, "duplicate status sync must not re-announce");

  const duplicateStatus = new FakeNode("div");
  duplicateStatus.className = "prompt-model-gate-status";
  const duplicateLive = new FakeNode("div");
  duplicateLive.className = "prompt-model-gate-live";
  syncShell.append(duplicateStatus, duplicateLive);
  preferredController.syncPreferredModelInputGate();
  assert.equal(syncShell.querySelectorAll(".prompt-model-gate-status").length, 1, "Preferred Model sync must remove duplicate visual badges");
  assert.equal(syncShell.querySelectorAll(".prompt-model-gate-live").length, 1, "Preferred Model sync must remove duplicate live regions");

  preferredController.finishBootstrapping();
  assert.equal(globalThis.document.activeElement, syncedInput, "ready state must return focused badge users to the prompt input");
  assert.equal(syncShell.classList.contains("prompt-shell-expanded"), true, "ready focus handoff must preserve expanded input");
  assert.equal(syncShell.classList.contains("prompt-shell-has-images"), true, "ready focus handoff must preserve image layout");
  assert.equal(syncedStatus.hidden, true, "ready state must hide the visual badge");
  assert.equal(syncedStatus.childNodes.length, 0, "ready state must clear stale visual content");
  assert.equal(syncedLive.hidden, false, "ready state must keep the live region mounted");
  assert.equal(syncedLive.textContent, "", "ready state must clear the live announcement");

  globalThis.document.body.replaceChildren();
  const fallbackState = createState();
  const fallbackShell = new FakeNode("div");
  fallbackShell.className = "prompt-shell";
  const fallbackInput = new FakeNode("textarea");
  fallbackInput.className = "prompt-input";
  fallbackShell.append(fallbackInput);
  globalThis.document.body.append(fallbackShell);
  const fallbackController = createPreferredModelController({
    state: fallbackState,
    workspace: { currentFrames: () => [], frameApp: () => null },
    framePort: { ensure: async () => null, request: async () => ({}) },
    appRoot: globalThis.document.body,
    verifiedCurrentContentFrameRegistration: () => null,
    prepareContentFrameRuntime: async () => null,
    recordFunctionalAnomaly() {}
  });
  fallbackController.syncPreferredModelInputGate();
  const fallbackStatus = fallbackShell.querySelector(".prompt-model-gate-status");
  const fallbackLive = fallbackShell.querySelector(".prompt-model-gate-live");
  assert.ok(fallbackStatus && fallbackLive, "Preferred Model must create both status nodes when Composer has not supplied them");
  assert.equal(fallbackShell.querySelectorAll(".prompt-model-gate-status").length, 1);
  assert.equal(fallbackShell.querySelectorAll(".prompt-model-gate-live").length, 1);
  assert.equal(fallbackStatus.hidden, false, "the fallback visual must expose bootstrapping state");
  assert.ok(fallbackStatus.querySelector(".prompt-model-gate-spinner"), "the fallback visual must use the applying icon");
  assert.equal(fallbackStatus.getAttribute("aria-live"), null, "the fallback visual must remain silent");
  assert.equal(fallbackStatus.getAttribute("role"), "note", "the fallback visual must expose the same non-live semantics");
  assert.equal(fallbackLive.hidden, false, "the fallback live region must stay mounted");
  assert.equal(fallbackLive.textContent, fallbackStatus.getAttribute("aria-label"));
  fallbackController.finishBootstrapping();
  assert.equal(fallbackStatus.hidden, true, "fallback ready state must hide the visual");
  assert.equal(fallbackStatus.getAttribute("tabindex"), null, "fallback ready state must remove focusability");
  assert.equal(fallbackLive.textContent, "", "fallback ready state must clear its announcement");

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
