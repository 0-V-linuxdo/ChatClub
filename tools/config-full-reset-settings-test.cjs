#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

class FakeNode {
  constructor(tagName = "div", ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.disabled = false;
    this.checked = false;
    this._text = "";
    this._classes = new Set();
    this.style = { setProperty() {} };
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      contains: (name) => this._classes.has(name)
    };
  }

  get className() { return [...this._classes].join(" "); }
  set className(value) { this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean)); }
  get textContent() {
    if (this.tagName === "#TEXT" || this._text) return this._text;
    return this.children.map((child) => child.textContent || "").join("");
  }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ""); }
  get isConnected() {
    for (let node = this; node; node = node.parentElement) {
      if (node === this.ownerDocument?.documentElement) return true;
    }
    return false;
  }

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.remove?.();
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = "";
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
  click() {
    if (this.disabled) return [];
    if (this.tagName === "INPUT" && this.getAttribute("type") === "checkbox") {
      this.checked = !this.checked;
      const changeEvent = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
      (this.listeners.get("change") || []).forEach((listener) => listener(changeEvent));
    }
    const event = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
    return (this.listeners.get("click") || []).map((listener) => listener(event));
  }
  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (name === "disabled") this.disabled = true;
  }
  getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
  toggleAttribute(name, force) {
    const enabled = force === undefined ? !this.attributes.has(name) : Boolean(force);
    if (enabled) this.setAttribute(name, "");
    else {
      this.attributes.delete(name);
      if (name === "disabled") this.disabled = false;
    }
    return enabled;
  }
  matches(selector) {
    const value = String(selector || "").trim().split(/\s+/).at(-1);
    if (value.startsWith(".")) return value.slice(1).split(".").every((name) => this.classList.contains(name));
    return this.tagName.toLowerCase() === value.toLowerCase();
  }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeNode("html", this);
    this.head = new FakeNode("head", this);
    this.body = new FakeNode("body", this);
    this.documentElement.append(this.head, this.body);
  }
  createElement(tagName) { return new FakeNode(tagName, this); }
  createTextNode(value) {
    const node = new FakeNode("#text", this);
    node._text = String(value);
    return node;
  }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

function findNode(rootNode, predicate) {
  if (predicate(rootNode)) return rootNode;
  for (const child of rootNode.children || []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

async function settle(values = []) {
  await Promise.all(values.map((value) => Promise.resolve(value)));
  await new Promise((resolve) => { setImmediate(resolve); });
}

(async () => {
  const previous = {
    Node: globalThis.Node,
    document: globalThis.document,
    navigator: globalThis.navigator,
    sessionStorage: globalThis.sessionStorage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  const document = new FakeDocument();
  globalThis.Node = FakeNode;
  globalThis.document = document;
  globalThis.navigator = { language: "en" };
  const sessionValues = new Map();
  globalThis.sessionStorage = {
    getItem(key) { return sessionValues.get(String(key)) ?? null; },
    setItem(key, value) { sessionValues.set(String(key), String(value)); },
    removeItem(key) { sessionValues.delete(String(key)); }
  };
  globalThis.setTimeout = (callback, delay = 0) => {
    if (delay < 1000) callback();
    return 1;
  };
  globalThis.clearTimeout = () => {};
  try {
    const { setLanguage } = await import(pathToFileURL(path.join(root, "shared/i18n.js")).href);
    setLanguage("en", "en");
    const { createImportExportSettings } = await import(
      `${pathToFileURL(path.join(root, "app/settings/import-export.js")).href}?full-reset=${Date.now()}`
    );
    const { consumeConfigResetCleanupWarning } = await import(
      pathToFileURL(path.join(root, "app/state/reset-cleanup-warning.js")).href
    );
    const CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY = "chatclubConfigResetCleanupWarningV1";
    const { createAppConfigService } = await import(
      `${pathToFileURL(path.join(root, "app/config-service.js")).href}?full-reset=${Date.now()}`
    );
    const {
      BACKGROUND_REQUEST_ACTIONS,
      BACKGROUND_REQUEST_SPECS,
      createBackgroundRequestClient
    } = await import(pathToFileURL(path.join(root, "shared/background-requests.js")).href);
    const { createBackgroundRequestDispatcher } = await import(
      pathToFileURL(path.join(root, "background/request-dispatcher.js")).href
    );
    let backgroundSnapshot = {
      revision: 4,
      activationRevision: 7,
      storedOptions: {},
      options: {},
      customConfig: []
    };
    const getAction = BACKGROUND_REQUEST_ACTIONS.GET_CONFIG_SNAPSHOT;
    const resetAction = BACKGROUND_REQUEST_ACTIONS.RESET_CONFIG;
    const resetDispatch = createBackgroundRequestDispatcher(
      {
        [getAction]: BACKGROUND_REQUEST_SPECS[getAction],
        [resetAction]: BACKGROUND_REQUEST_SPECS[resetAction]
      },
      [
        [getAction, () => ({ snapshot: structuredClone(backgroundSnapshot) })],
        [resetAction, (message) => {
          assert.equal(message.expectedRevision, backgroundSnapshot.revision);
          assert.equal(message.expectedActivationRevision, backgroundSnapshot.activationRevision);
          backgroundSnapshot = {
            ...backgroundSnapshot,
            revision: backgroundSnapshot.revision + 1,
            activationRevision: backgroundSnapshot.activationRevision + 1
          };
          return {
            snapshot: structuredClone(backgroundSnapshot),
            workspaceSessionGeneration: "workspace-reset-ui",
            committed: true,
            cleanupWarnings: [{ label: "alarm-clear", message: "will retry" }]
          };
        }]
      ],
      { verifyExtensionPage: () => ({ extensionPage: true }) }
    );
    const resetClient = createBackgroundRequestClient((message) => resetDispatch(message, { id: "extension-page" }));
    const configService = createAppConfigService({ request: resetClient });
    let resolveReset;
    let resetCalls = 0;
    let reloadCalls = 0;
    let warningVisibleAtReload = false;
    let prepareCalls = 0;
    const settings = createImportExportSettings({
      state: {
        storedOptions: { optionsSchemaVersion: 4 },
        options: {},
        customConfig: [],
        promptLibrary: [],
        promptSendHistory: [],
        shortcutConfig: {},
        pocketEntries: []
      },
      svgIcon: (name) => document.createTextNode(`[${name}]`),
      notifyConfigReload: async () => {},
      hydrateImportedLayoutIfNeeded: () => false,
      reconcileAppCatalog: async () => {},
      syncI18nLanguage() {},
      render() {},
      importConfigPatch: async () => ({}),
      resetConfig: async () => {
        resetCalls += 1;
        await new Promise((resolve) => { resolveReset = resolve; });
        return configService.resetConfig();
      },
      reloadAfterConfigReset: () => {
        reloadCalls += 1;
        warningVisibleAtReload = /1 cleanup step\(s\) will retry automatically/.test(document.body.textContent);
        assert.ok(
          globalThis.sessionStorage.getItem(CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY),
          "cleanup warning must persist before navigation starts"
        );
        globalThis.document = new Proxy({}, {
          get() { throw new Error("fixture page unloaded during reset reload"); }
        });
      },
      prepareForConfigImport: async (keys) => {
        prepareCalls += 1;
        assert.equal(keys.length, 7);
      }
    });
    const pane = settings.importExportPane(() => {});
    document.body.append(pane);
    assert.match(pane.textContent, /ChatClub Tabs/, "Manage Config must offer remembered Tabs export");
    const resetButton = findNode(pane, (node) => node.dataset?.configAction === "full-reset");
    assert.ok(resetButton, "full reset must be available from Manage Config");
    await settle(resetButton.click());

    const dialog = findNode(document.body, (node) => node.dataset?.modalType === "confirmation");
    assert.ok(dialog?.isConnected, "full reset must open a confirmation modal");
    assert.match(dialog.textContent, /official-rules cache, candidate, rollback pins/);
    assert.match(dialog.textContent, /anti-rollback sequence, revision, and hash watermarks are retained/);
    const confirm = findNode(dialog, (node) => node.tagName === "BUTTON" && node.textContent === "Reset Everything");
    const cancel = findNode(dialog, (node) => node.tagName === "BUTTON" && node.textContent === "Cancel");
    const close = findNode(dialog, (node) => node.classList?.contains("icon-button"));
    const acknowledge = findNode(dialog, (node) => node.tagName === "INPUT" && node.getAttribute("type") === "checkbox");
    assert.ok(acknowledge, "full reset must require an acknowledgement checkbox");
    assert.match(dialog.textContent, /I understand this will erase all local ChatClub data/);
    assert.equal(confirm.disabled, true, "full reset confirm must stay disabled until acknowledged");
    acknowledge.click();
    assert.equal(confirm.disabled, false, "checking acknowledgement must enable the danger action");
    const applying = confirm.click();
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(resetCalls, 1);
    assert.equal(prepareCalls, 1);
    assert.equal(confirm.disabled, true);
    assert.equal(cancel.disabled, true);
    assert.equal(close.disabled, true);
    close.click();
    cancel.click();
    assert.equal(dialog.isConnected, true, "an applying reset must not be dismissible");

    resolveReset();
    await settle(applying);
    assert.equal(dialog.isConnected, false);
    assert.equal(reloadCalls, 1);
    assert.equal(warningVisibleAtReload, true, "cleanup warning must be rendered before reload unloads the page");
    assert.match(document.body.textContent, /1 cleanup step\(s\) will retry automatically/);
    assert.equal(
      consumeConfigResetCleanupWarning(globalThis.sessionStorage),
      1,
      "the next page initialization must recover the cleanup warning count"
    );
    assert.equal(globalThis.sessionStorage.getItem(CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY), null);
    console.log("full config reset confirmation and reload flow: ok");
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
