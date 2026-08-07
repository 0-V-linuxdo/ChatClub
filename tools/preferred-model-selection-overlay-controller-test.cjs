#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(String(name), String(value));
  }

  removeProperty(name) {
    const key = String(name);
    const value = this.values.get(key) || "";
    this.values.delete(key);
    return value;
  }

  getPropertyValue(name) {
    return this.values.get(String(name)) || "";
  }
}

class FakeNode {
  constructor(tagName = "div", rect = {}) {
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = new FakeStyle();
    this.hidden = false;
    this.textContent = "";
    this._connected = true;
    this._rect = {
      left: Number(rect.left) || 0,
      top: Number(rect.top) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0
    };
    this._classes = new Set();
    this.focusCalls = 0;
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }

  get isConnected() {
    return this._connected && (!this.parentElement || this.parentElement.isConnected);
  }

  get clientWidth() {
    return this._rect.width;
  }

  get clientHeight() {
    return this._rect.height;
  }

  get offsetWidth() {
    return this._rect.width;
  }

  get offsetHeight() {
    return this._rect.height;
  }

  append(...children) {
    for (const child of children.flat(Infinity)) {
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

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type, event = {}) {
    const value = { target: this, ...event, type };
    for (const listener of this.listeners.get(type) || []) listener(value);
  }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes.set(key, String(value));
    if (key === "class") this.className = value;
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  matches(selector) {
    const value = String(selector || "").trim();
    if (value.startsWith(".")) {
      return value.split(".").slice(1).filter(Boolean).every((name) => this.classList.contains(name));
    }
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
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains?.(candidate));
  }

  insertAdjacentElement(position, node) {
    assert.equal(position, "afterend");
    const siblings = this.parentElement?.children || [];
    const index = siblings.indexOf(this);
    node.parentElement = this.parentElement;
    siblings.splice(index + 1, 0, node);
    return node;
  }

  getBoundingClientRect() {
    const { left, top, width, height } = this._rect;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  focus() {
    this.focusCalls += 1;
    globalThis.document.activeElement = this;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
    this._connected = false;
  }
}

const previousGlobals = {
  Node: globalThis.Node,
  document: globalThis.document,
  window: globalThis.window,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  MutationObserver: globalThis.MutationObserver,
  ResizeObserver: globalThis.ResizeObserver
};

const appRoot = new FakeNode("main", { width: 1200, height: 800 });
const documentListeners = new Map();
const windowListeners = new Map();
globalThis.Node = FakeNode;
globalThis.document = {
  activeElement: null,
  body: appRoot,
  documentElement: appRoot,
  addEventListener(type, listener) {
    const listeners = documentListeners.get(type) || [];
    listeners.push(listener);
    documentListeners.set(type, listeners);
  },
  removeEventListener(type, listener) {
    const listeners = documentListeners.get(type) || [];
    documentListeners.set(type, listeners.filter((candidate) => candidate !== listener));
  },
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node.textContent = String(value);
    return node;
  },
  querySelectorAll: (selector) => appRoot.querySelectorAll(selector)
};
globalThis.window = {
  addEventListener(type, listener) {
    const listeners = windowListeners.get(type) || [];
    listeners.push(listener);
    windowListeners.set(type, listeners);
  },
  removeEventListener(type, listener) {
    const listeners = windowListeners.get(type) || [];
    windowListeners.set(type, listeners.filter((candidate) => candidate !== listener));
  },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: (id) => clearTimeout(id)
};
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
delete globalThis.MutationObserver;
delete globalThis.ResizeObserver;

function dispatchDocument(type, target) {
  for (const listener of documentListeners.get(type) || []) listener({ type, target });
}

function createFrame(instanceId, appId) {
  const frameWrap = new FakeNode("div", { left: 0, top: 0, width: 600, height: 400 });
  frameWrap.className = "chat-frame-wrap";
  const iframe = new FakeNode("iframe", { left: 0, top: 0, width: 600, height: 400 });
  iframe.className = "chat-frame active";
  iframe.contentWindow = {};
  iframe.dataset.instanceId = instanceId;
  iframe.dataset.preferredModelDocumentId = `document-${instanceId}`;
  iframe.dataset.preferredModelContentBridgeVersion = "bridge-test";
  iframe.dataset.contentRuntimeCapabilitiesDocumentId = `document-${instanceId}`;
  iframe.dataset.contentRuntimeCapabilities = "preferred-model";
  const overlay = new FakeNode("div", { left: 0, top: 0, width: 600, height: 400 });
  overlay.className = "preferred-model-selection-overlay";
  overlay.hidden = true;
  const indicator = new FakeNode("div", { left: 200, top: 160, width: 200, height: 80 });
  indicator.className = "preferred-model-selection-overlay-indicator";
  const text = new FakeNode("span");
  text.className = "preferred-model-selection-overlay-text";
  indicator.append(text);
  overlay.append(indicator);
  frameWrap.append(iframe, overlay);
  appRoot.append(frameWrap);
  return { app: { id: appId, name: appId }, frameWrap, iframe, overlay, indicator, text };
}

function createState(preferences, options = {}) {
  return {
    frameLoadingInstanceIds: [],
    modelPreferenceDraft: structuredClone(preferences),
    options: {
      modelPreferences: structuredClone(preferences),
      modelPreferenceSelectionOverlayEnabled: true,
      modelPreferenceSelectionOverlayOpacity: 70,
      frameToastPosition: { x: 100, y: 100 },
      ...options
    },
    preferredModelGateFailedAppIds: [],
    preferredModelGateFailedCount: 0,
    preferredModelGatePendingCount: 0,
    preferredModelGateReason: "",
    preferredModelGateState: "bootstrapping"
  };
}

function overlayLines(frame) {
  return frame.text.children.map((line) => ({
    className: line.className,
    kind: line.dataset.preferredModelSelectionLine,
    text: line.textContent
  }));
}

function createController(createPreferredModelController, state, frames, activeFrames = frames.map((item) => item.iframe)) {
  const active = { value: activeFrames };
  const controller = createPreferredModelController({
    state,
    workspace: {
      currentFrames: () => active.value,
      frameApp: (iframe) => frames.find((item) => item.iframe === iframe)?.app || null
    },
    framePort: {
      ensure: async () => null,
      request: async () => ({})
    },
    appRoot,
    verifiedCurrentContentFrameRegistration: async () => null,
    prepareContentFrameRuntime: async () => ({ ok: false }),
    recordFunctionalAnomaly() {}
  });
  controller.finishBootstrapping();
  return { active, controller };
}

(async () => {
  const { createPreferredModelController } = await import(moduleUrl("app/preferred-model/controller.js"));
  const {
    GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
    MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
    MODEL_PREFERENCE_SECONDARY_KEYS,
    NOTION_ALL_SOURCES_PREFERENCE_KEY,
    NOTION_EFFORT_PREFERENCE_KEY
  } = await import(moduleUrl("shared/constants.js"));
  const { setLanguage, t } = await import(moduleUrl("shared/i18n.js"));
  setLanguage("en");

  {
    const frame = createFrame("gemini-primary", "Gemini");
    const state = createState({
      Gemini: "pro",
      [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: "extended"
    });
    const { controller } = createController(createPreferredModelController, state, [frame]);
    const expected = [
      t("chat.preferredModelSelectingTargetAccessible", { target: "3.1 Pro" }),
      t("chat.preferredModelThinkingDetail", { level: "Extended" })
    ].join(t("chat.preferredModelAccessibleSeparator"));
    assert.deepEqual(overlayLines(frame), [
      {
        className: "preferred-model-selection-overlay-line preferred-model-selection-overlay-line-status",
        kind: "status",
        text: t("chat.preferredModelSelectingStatus")
      },
      {
        className: "preferred-model-selection-overlay-line preferred-model-selection-overlay-line-model",
        kind: "model",
        text: t("chat.preferredModelTargetDetail", { target: "3.1 Pro" })
      },
      {
        className: "preferred-model-selection-overlay-line preferred-model-selection-overlay-line-detail",
        kind: "thinking",
        text: t("chat.preferredModelThinkingDetail", { level: "Extended" })
      }
    ], "the selecting status, model, and thinking level must each render on their own row");
    assert.equal(frame.overlay.getAttribute("aria-label"), expected);
    assert.equal(frame.overlay.dataset.preferredModelSelectionOwner, frame.iframe.dataset.instanceId);
    assert.equal(frame.overlay.hidden, false);
    setLanguage("zh_CN");
    const localized = [
      t("chat.preferredModelSelectingTargetAccessible", { target: "3.1 Pro" }),
      t("chat.preferredModelThinkingDetail", { level: "扩展" })
    ].join(t("chat.preferredModelAccessibleSeparator"));
    controller.syncPreferredModelSelectionOverlays();
    assert.deepEqual(overlayLines(frame).map((line) => line.text), [
      t("chat.preferredModelSelectingStatus"),
      t("chat.preferredModelTargetDetail", { target: "3.1 Pro" }),
      t("chat.preferredModelThinkingDetail", { level: "扩展" })
    ], "each Gemini row must follow the active language");
    assert.equal(frame.overlay.getAttribute("aria-label"), localized);
    setLanguage("en");
  }

  {
    const frame = createFrame("notion-secondary", "NotionAI");
    const state = createState({
      NotionAI: "opus48",
      [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
      [MODEL_PREFERENCE_SECONDARY_KEYS.NotionAI]: "fable5",
      [NOTION_ALL_SOURCES_PREFERENCE_KEY]: "enabled",
      [NOTION_EFFORT_PREFERENCE_KEY]: { opus48: "high", fable5: "max" }
    });
    const { controller } = createController(createPreferredModelController, state, [frame]);
    assert.deepEqual(overlayLines(frame).map((line) => line.text), [
      t("chat.preferredModelSelectingStatus"),
      t("chat.preferredModelTargetDetail", { target: "Claude Opus 4.8" }),
      t("chat.preferredModelAllSourcesDetail", { state: "On" }),
      t("chat.preferredModelEffortDetail", { effort: "High" })
    ], "the selecting status, primary model, and each Notion add-on must initially own one line");
    const record = controller.schedulePreferredModelApplyToFrame(frame.iframe, { immediate: true });
    assert.ok(record, "the configured frame must own a current apply record");
    const statusToast = frame.frameWrap.querySelector(".frame-submit-toast");
    assert.equal(statusToast?.classList?.contains("frame-submit-toast-suppressed"), true);
    assert.equal(statusToast?.getAttribute("aria-hidden"), "true");
    record.stage = "secondary";
    record.payload = {
      appId: "NotionAI",
      modelId: "fable5",
      effortId: "max",
      allSourcesState: "enabled"
    };
    controller.syncPreferredModelSelectionOverlays();
    assert.deepEqual(overlayLines(frame).map((line) => [line.kind, line.text]), [
      ["status", t("chat.preferredModelSelectingStatus")],
      ["model", t("chat.preferredModelTargetDetail", { target: "Claude Fable 5" })],
      ["all-sources", t("chat.preferredModelAllSourcesDetail", { state: "On" })],
      ["effort", t("chat.preferredModelEffortDetail", { effort: "Max" })]
    ], "a current secondary record must atomically replace the primary model and every add-on row");
    assert.ok(
      overlayLines(frame).every((line) => !/Opus 4\.8|High/.test(line.text)),
      "secondary rows must not retain primary model or Effort copy"
    );
    assert.equal(
      frame.overlay.getAttribute("aria-label"),
      [
        t("chat.preferredModelSelectingTargetAccessible", { target: "Claude Fable 5" }),
        t("chat.preferredModelAllSourcesDetail", { state: "On" }),
        t("chat.preferredModelEffortDetail", { effort: "Max" })
      ].join(t("chat.preferredModelAccessibleSeparator")),
      "structured visual rows must retain one natural complete accessible label"
    );
    const secondaryLineNodes = [...frame.text.children];
    record.attempt += 1;
    controller.syncPreferredModelSelectionOverlays();
    assert.deepEqual(
      frame.text.children,
      secondaryLineNodes,
      "retrying the same attempt must preserve the current structured rows without flicker"
    );
    const before = { runId: record.runId, stage: record.stage, timer: record.timer };
    state.options.modelPreferenceSelectionOverlayEnabled = false;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(frame.overlay.hidden, true, "turning the option off must immediately hide the overlay");
    assert.equal(statusToast.classList.contains("frame-submit-toast-suppressed"), false);
    assert.equal(statusToast.getAttribute("aria-hidden"), null);
    assert.equal(frame.text.children.length, 0, "hiding must clear every structured row owned by the old target");
    assert.deepEqual(
      { runId: record.runId, stage: record.stage, timer: record.timer },
      before,
      "overlay synchronization must not restart, cancel, or replace the model task"
    );
    state.options.modelPreferenceSelectionOverlayEnabled = true;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(frame.overlay.hidden, false, "re-enabling must restore the current pending overlay");
    assert.equal(statusToast.classList.contains("frame-submit-toast-suppressed"), true);
    assert.equal(statusToast.getAttribute("aria-hidden"), "true");
    assert.deepEqual(overlayLines(frame).map((line) => line.kind), ["status", "model", "all-sources", "effort"]);
    assert.deepEqual(
      { runId: record.runId, stage: record.stage, timer: record.timer },
      before,
      "re-enabling must not issue or schedule an additional model attempt"
    );
    record.success = true;
    record.terminal = true;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(frame.overlay.hidden, true, "a terminal success must withdraw the overlay while the setting stays enabled");
    assert.equal(statusToast.classList.contains("frame-submit-toast-suppressed"), false);
    assert.equal(statusToast.getAttribute("aria-hidden"), null);
    record.statusToast.update("Model selection complete", "success");
    assert.equal(statusToast.textContent, "Model selection complete");
    assert.equal(statusToast.classList.contains("toast-success"), true);
    assert.equal(statusToast.classList.contains("frame-submit-toast-suppressed"), false);
    assert.equal(statusToast.textContent, "Model selection complete");
    assert.equal(statusToast.classList.contains("toast-success"), true);
    assert.equal(statusToast.getAttribute("role"), "status");
    statusToast.setAttribute("aria-hidden", "false");
    record.statusToast.setSuppressed(true);
    assert.equal(statusToast.getAttribute("aria-hidden"), "true");
    record.statusToast.setSuppressed(false);
    assert.equal(statusToast.getAttribute("aria-hidden"), "false", "suppression must restore an owned prior ARIA value");
    controller.invalidatePreferredModelFrame(frame.iframe, "test-cleanup");
  }

  {
    const frame = createFrame("notion-sources", "NotionAI");
    const state = createState({
      NotionAI: "",
      [NOTION_ALL_SOURCES_PREFERENCE_KEY]: "disabled"
    });
    createController(createPreferredModelController, state, [frame]);
    const expected = t("chat.preferredModelApplyingAllSources", {
      state: t("modelPreferences.allSourcesDisabled")
    });
    assert.deepEqual(overlayLines(frame), [{
      className: "preferred-model-selection-overlay-line preferred-model-selection-overlay-line-primary",
      kind: "all-sources",
      text: expected
    }], "All sources without a model must remain one dedicated settings primary row");
    assert.equal(frame.overlay.getAttribute("aria-label"), expected);
  }

  {
    const pending = createFrame("pending-frame", "Grok");
    const failed = createFrame("failed-frame", "DeepSeek");
    const state = createState({ Grok: "expert", DeepSeek: "vision" });
    const { controller } = createController(createPreferredModelController, state, [pending, failed]);
    const failedRecord = controller.schedulePreferredModelApplyToFrame(failed.iframe, { immediate: true });
    const failedToast = failed.frameWrap.querySelector(".frame-submit-toast");
    assert.equal(failedToast.classList.contains("frame-submit-toast-suppressed"), true);
    failedRecord.terminal = true;
    failedRecord.failureReason = "terminal failure";
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(pending.overlay.hidden, false, "a pending frame must remain independently covered");
    assert.equal(failed.overlay.hidden, true, "a failed frame must not retain the selection overlay");
    assert.equal(failedToast.classList.contains("frame-submit-toast-suppressed"), false);
    failedRecord.statusToast.update("Model selection failed", "error");
    assert.equal(failedToast.textContent, "Model selection failed");
    assert.equal(failedToast.getAttribute("role"), "alert");
    pending.iframe.dataset.preferredModelNavigationInvalidated = "1";
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(pending.overlay.hidden, true, "an invalidated navigation must hide a stale pending overlay");
    delete pending.iframe.dataset.preferredModelNavigationInvalidated;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(pending.overlay.hidden, false, "a newly registered document may show its pending overlay again");
    state.frameLoadingInstanceIds = [pending.iframe.dataset.instanceId];
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(pending.overlay.hidden, true, "loading must take precedence over pending overlay display");
    state.frameLoadingInstanceIds = [];
    const readyRecord = controller.schedulePreferredModelApplyToFrame(pending.iframe, { immediate: true });
    const readyToast = pending.frameWrap.querySelector(".frame-submit-toast");
    assert.equal(readyToast.classList.contains("frame-submit-toast-suppressed"), true);
    readyRecord.success = true;
    readyRecord.terminal = true;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(pending.overlay.hidden, true, "a successfully settled frame must not retain the overlay");
    assert.equal(readyToast.classList.contains("frame-submit-toast-suppressed"), false);
    controller.invalidatePreferredModelFrame(pending.iframe, "test-cleanup");
    controller.invalidatePreferredModelFrame(failed.iframe, "test-cleanup");
  }

  {
    const frame = createFrame("lifecycle-frame", "Grok");
    const preferences = { Grok: "fast" };
    const state = createState(preferences);
    const { controller } = createController(createPreferredModelController, state, [frame]);
    assert.equal(frame.overlay.hidden, false);
    state.modelPreferenceDraft.Grok = "";
    state.options.modelPreferences.Grok = "";
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(frame.overlay.hidden, true, "an unconfigured frame must hide its overlay");
    state.modelPreferenceDraft.Grok = "fast";
    state.options.modelPreferences.Grok = "fast";
    frame.iframe._connected = false;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(frame.overlay.hidden, true, "a detached iframe must not keep its panel covered");
  }

  {
    const first = createFrame("background-first", "Grok");
    const second = createFrame("background-second", "DeepSeek");
    const state = createState({ Grok: "expert", DeepSeek: "vision" });
    const { active, controller } = createController(
      createPreferredModelController,
      state,
      [first, second],
      [first.iframe]
    );
    const record = controller.schedulePreferredModelApplyToFrame(first.iframe, { immediate: true });
    const toast = first.frameWrap.querySelector(".frame-submit-toast");
    assert.equal(toast.classList.contains("frame-submit-toast-suppressed"), true);
    active.value = [second.iframe];
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(toast.classList.contains("frame-submit-toast-suppressed"), false, "an inactive tab must release suppression");
    record.success = true;
    record.terminal = true;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(toast.classList.contains("frame-submit-toast-suppressed"), false, "background settlement must not leave stale suppression");
    controller.invalidatePreferredModelFrame(first.iframe, "test-cleanup");
  }

  {
    const frame = createFrame("focus-frame", "Grok");
    const state = createState({ Grok: "fast" });
    const { active, controller } = createController(createPreferredModelController, state, [frame]);
    globalThis.document.activeElement = frame.iframe;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(globalThis.document.activeElement, frame.overlay, "showing over the focused iframe must move focus to the overlay");
    const overlayFocusCallsBeforeSteal = frame.overlay.focusCalls;
    globalThis.document.activeElement = frame.iframe;
    frame.iframe.dispatch("focus");
    await Promise.resolve();
    assert.equal(globalThis.document.activeElement, frame.overlay, "a later iframe focus steal must be recaptured by its visible overlay");
    assert.equal(frame.overlay.focusCalls, overlayFocusCallsBeforeSteal + 1);
    state.options.modelPreferenceSelectionOverlayEnabled = false;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(globalThis.document.activeElement, frame.iframe, "hiding must restore the still-active original iframe owner");

    state.options.modelPreferenceSelectionOverlayEnabled = true;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(globalThis.document.activeElement, frame.overlay);
    const topbarControl = new FakeNode("button");
    appRoot.append(topbarControl);
    globalThis.document.activeElement = topbarControl;
    dispatchDocument("focusin", topbarControl);
    globalThis.document.activeElement = frame.iframe;
    frame.iframe.dispatch("focusin");
    await Promise.resolve();
    assert.equal(globalThis.document.activeElement, frame.overlay, "the guard must still block iframe focus after the user visits the topbar");
    const focusCallsBeforeOwnerlessHide = frame.iframe.focusCalls;
    state.options.modelPreferenceSelectionOverlayEnabled = false;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(
      frame.iframe.focusCalls,
      focusCallsBeforeOwnerlessHide,
      "topbar focus must invalidate stale iframe restoration ownership"
    );
    const overlayFocusCallsAfterHide = frame.overlay.focusCalls;
    globalThis.document.activeElement = frame.iframe;
    frame.iframe.dispatch("focus");
    await Promise.resolve();
    assert.equal(frame.overlay.focusCalls, overlayFocusCallsAfterHide, "hiding must remove the iframe focus guard");

    state.options.modelPreferenceSelectionOverlayEnabled = true;
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(globalThis.document.activeElement, frame.overlay);
    const focusCallsBeforeInactiveHide = frame.iframe.focusCalls;
    active.value = [];
    controller.syncPreferredModelSelectionOverlays();
    assert.equal(
      frame.iframe.focusCalls,
      focusCallsBeforeInactiveHide,
      "hiding after a tab switch must not steal focus back to an inactive iframe"
    );
  }

  {
    const mutationObservers = [];
    const resizeObservers = [];
    globalThis.MutationObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.observations = [];
        mutationObservers.push(this);
      }

      observe(target, options) {
        this.observations.push({ target, options });
      }

      disconnect() {}
    };
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = new Set();
        resizeObservers.push(this);
      }

      observe(target) {
        this.targets.add(target);
      }

      unobserve(target) {
        this.targets.delete(target);
      }

      disconnect() {
        this.targets.clear();
      }
    };
    const frame = createFrame("collision-frame", "Grok");
    const toast = new FakeNode("div", { left: 240, top: 150, width: 120, height: 100 });
    toast.className = "frame-submit-toast";
    toast.dataset.frameInstanceId = frame.iframe.dataset.instanceId;
    frame.frameWrap.append(toast);
    const state = createState({ Grok: "expert" });
    const { controller } = createController(createPreferredModelController, state, [frame]);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal(
      frame.overlay.style.getPropertyValue("--preferred-model-selection-overlay-offset-y"),
      "-102px",
      "a centered non-model Toast collision must choose the nearest safe cardinal position"
    );
    const layoutResizeObserver = resizeObservers.find((observer) => observer.targets.has(frame.indicator));
    assert.ok(layoutResizeObserver, "the visible indicator must own a resize observer");
    frame.indicator._rect = { left: 160, top: 140, width: 280, height: 120 };
    layoutResizeObserver.callback([{ target: frame.indicator }]);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal(
      frame.overlay.style.getPropertyValue("--preferred-model-selection-overlay-offset-y"),
      "-122px",
      "indicator content or size changes must automatically recompute the nearest safe position"
    );
    const layoutMutationObserver = mutationObservers.find((observer) => observer.observations.some(({ target, options }) => (
      target === frame.frameWrap && options?.attributeFilter?.includes("style")
    )));
    assert.ok(layoutMutationObserver, "the panel must observe visible Toast position and DOM changes");
    toast._rect = { left: 470, top: 20, width: 100, height: 50 };
    layoutMutationObserver.callback([{ type: "attributes", target: toast }]);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal(
      frame.overlay.style.getPropertyValue("--preferred-model-selection-overlay-offset-y"),
      "",
      "a non-colliding Toast must clear the inline offset and restore center placement"
    );
    toast._rect = { left: 240, top: 150, width: 120, height: 100 };
    toast.dispatch("transitionend", { propertyName: "left" });
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal(
      frame.overlay.style.getPropertyValue("--preferred-model-selection-overlay-offset-y"),
      "-122px",
      "Toast transition completion must recompute avoidance from its final rendered position"
    );
    toast.classList.add("frame-submit-toast-suppressed");
    layoutMutationObserver.callback([{ type: "attributes", target: toast }]);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal(
      frame.overlay.style.getPropertyValue("--preferred-model-selection-overlay-offset-y"),
      "",
      "a consolidated model progress Toast must no longer displace the centered indicator"
    );
    toast.classList.remove("frame-submit-toast-suppressed");
    layoutMutationObserver.callback([{ type: "attributes", target: toast }]);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal(
      frame.overlay.style.getPropertyValue("--preferred-model-selection-overlay-offset-y"),
      "-122px",
      "a restored non-model Toast must participate in avoidance again"
    );
    state.options.modelPreferenceSelectionOverlayEnabled = false;
    controller.syncPreferredModelSelectionOverlays();
    delete globalThis.MutationObserver;
    delete globalThis.ResizeObserver;
  }

  console.log("Preferred-model selection overlay controller: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
}).finally(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});
