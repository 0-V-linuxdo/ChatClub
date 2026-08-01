#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => `${pathToFileURL(path.join(root, file)).href}?official-rules-settings=${Date.now()}`;
const moduleSource = fs.readFileSync(path.join(root, "app/settings/official-rules.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "app/settings/official-rules-styles.js"), "utf8");

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
    this._text = "";
    this._classes = new Set();
    this.style = { setProperty() {} };
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

  get id() {
    return this.getAttribute("id") || "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get textContent() {
    if (this.tagName === "#TEXT" || this._text) return this._text;
    return this.children.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this.replaceChildren();
    this._text = String(value ?? "");
  }

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
    const current = this.listeners.get(type) || [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  dispatch(type, values = {}) {
    const event = {
      type,
      currentTarget: this,
      target: this,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediatePropagationStopped = true; },
      ...values
    };
    event.results = (this.listeners.get(type) || []).map((listener) => listener(event));
    return event;
  }

  click() {
    if (this.disabled) return { results: [] };
    return this.dispatch("click");
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (name === "disabled") this.disabled = true;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

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
    const value = String(selector || "").trim();
    if (value.startsWith(".")) return value.slice(1).split(".").every((name) => this.classList.contains(name));
    if (value.startsWith("#")) return this.id === value.slice(1);
    return this.tagName.toLowerCase() === value.toLowerCase();
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeNode("html", this);
    this.head = new FakeNode("head", this);
    this.body = new FakeNode("body", this);
    this.documentElement.append(this.head, this.body);
  }

  createElement(tagName) {
    return new FakeNode(tagName, this);
  }

  createTextNode(value) {
    const node = new FakeNode("#text", this);
    node._text = String(value);
    return node;
  }

  getElementById(id) {
    return findNode(this.documentElement, (node) => node.id === id);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }
}

function findNode(rootNode, predicate) {
  if (predicate(rootNode)) return rootNode;
  for (const child of rootNode.children || []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

function findButton(rootNode, label) {
  return findNode(rootNode, (node) => node.tagName === "BUTTON" && node.textContent === label);
}

function findAction(rootNode, action) {
  return findNode(rootNode, (node) => node.tagName === "BUTTON" && node.dataset.officialRulesAction === action);
}

async function settleEvent(event) {
  await Promise.all((event?.results || []).map((result) => Promise.resolve(result)));
  await new Promise((resolve) => { setImmediate(resolve); });
}

async function settleAsyncWork() {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => { setImmediate(resolve); });
}

function activeConfirmation(document) {
  return findNode(document.body, (node) => node.dataset?.modalType === "confirmation");
}

assert.match(moduleSource, /confirmationModal\(/, "rule mutations must use the confirmation modal primitive");
assert.doesNotMatch(moduleSource, /\bmodal\(/, "the raw modal primitive must not be used");
assert.match(moduleSource, /if \(applying && force !== true\) return;/, "applying confirmations must guard close paths");
assert.match(moduleSource, /header\?\.querySelector\("\.icon-button"\)\?\.toggleAttribute\("disabled", value\)/);
assert.match(stylesSource, /\.official-rules-card/);
assert.match(stylesSource, /@media \(max-width: 820px\)/);

const previousGlobals = {
  Node: globalThis.Node,
  document: globalThis.document
};
const document = new FakeDocument();
globalThis.Node = FakeNode;
globalThis.document = document;

(async () => {
  try {
    const module = await import(moduleUrl("app/settings/official-rules.js"));
    const rawSnapshot = {
      mode: "manual",
      phase: "candidate",
      source: { label: "GitHub", url: "github.com/0-V-linuxdo/ChatClub-rules" },
      catalog: "stable",
      version: "2026.08.01.1",
      sequence: 12,
      keyId: "ed25519:primary",
      keyFingerprints: {
        current: "a".repeat(64),
        recovery: "b".repeat(64)
      },
      lastCheckedAt: "2026-08-01T08:00:00.000Z",
      lastAppliedAt: "2026-08-01T07:00:00.000Z",
      canRollbackLast: true,
      components: {
        "summary/chatgpt": {
          source: "official",
          overrideFields: ["hosts"],
          activeVersion: "74",
          packagedVersion: "73",
          candidateVersion: "75",
          canRollback: true
        },
        "delete/deepseek": {
          source: "rolled-back",
          activeVersion: "21",
          packagedVersion: "20",
          canRestore: true
        },
        "messageNavigator/chatgpt": {
          source: "release",
          activeVersion: "8",
          packagedVersion: "7"
        }
      },
      candidate: {
        available: true,
        version: "2026.08.01.2",
        sequence: 13,
        keyId: "ed25519:primary",
        releaseNotes: "更新 ChatGPT 消息选择器；Delete 仍保持安全失败。",
        changedComponents: [
          {
            componentKey: "summary/chatgpt",
            fieldDiffs: [{ field: "selectors.messageRoot", before: ["article.old"], after: ["article.new"] }]
          },
          { componentKey: "delete/deepseek", candidateVersion: "22" }
        ],
        deleteAliases: [
          { componentKey: "delete/deepseek", host: "chat.example.test", approved: true },
          { componentKey: "delete/deepseek", host: "new.example.test", approved: false }
        ]
      }
    };
    let snapshot = structuredClone(rawSnapshot);
    let subscriber = null;
    let unsubscribeCount = 0;
    let resolveApply = null;
    const calls = [];
    const notifications = [];
    const service = {
      async snapshot() { return structuredClone(snapshot); },
      subscribe(listener) {
        subscriber = listener;
        return () => { unsubscribeCount += 1; };
      },
      async setMode(mode) {
        calls.push(["setMode", mode]);
        snapshot.mode = mode;
        return structuredClone(snapshot);
      },
      async checkNow() {
        calls.push(["checkNow"]);
        snapshot.lastCheckedAt = "2026-08-01T09:00:00.000Z";
        return structuredClone(snapshot);
      },
      async clearOverride(componentKey) {
        calls.push(["clearOverride", componentKey]);
        snapshot.components[componentKey].overrideFields = [];
        snapshot.components[componentKey].source = "official";
        return structuredClone(snapshot);
      },
      async applyCandidate(payload) {
        calls.push(["applyCandidate", payload]);
        await new Promise((resolve) => { resolveApply = resolve; });
        return structuredClone(snapshot);
      },
      async rollbackLast() {
        calls.push(["rollbackLast"]);
        return structuredClone(snapshot);
      },
      async rollbackComponent(componentKey) {
        calls.push(["rollbackComponent", componentKey]);
        return structuredClone(snapshot);
      },
      async restoreComponent(componentKey) {
        calls.push(["restoreComponent", componentKey]);
        return structuredClone(snapshot);
      },
      async setDeleteAliasApproval(payload) {
        calls.push(["setDeleteAliasApproval", payload]);
        const alias = snapshot.candidate.deleteAliases.find((item) => item.componentKey === payload.componentKey && item.host === payload.host);
        if (alias) alias.approved = payload.approved;
        return structuredClone(snapshot);
      }
    };
    const undecidedService = {
      ...service,
      async snapshot() { return { mode: "undecided", consentDecided: false, phase: "idle" }; },
      subscribe() { return () => {}; }
    };
    const undecidedController = module.createOfficialRulesSettingsCard({
      officialRules: undecidedService,
      svgIcon: (name) => document.createTextNode(`[${name}]`)
    });
    document.body.append(undecidedController.card);
    await settleAsyncWork();
    assert.ok(findButton(undecidedController.card, "启用自动检查"));
    assert.ok(findButton(undecidedController.card, "保持内置规则／仅手动检查"));
    undecidedController.destroy();

    const updateRequiredController = module.createOfficialRulesSettingsCard({
      officialRules: {
        ...service,
        async snapshot() { return { mode: "manual", consentDecided: true, phase: "extension-update-required" }; },
        subscribe() { return () => {}; }
      },
      svgIcon: (name) => document.createTextNode(`[${name}]`)
    });
    document.body.append(updateRequiredController.card);
    await settleAsyncWork();
    assert.match(updateRequiredController.card.textContent, /需要更新插件/);
    updateRequiredController.destroy();

    const controller = module.createOfficialRulesSettingsCard({
      officialRules: service,
      svgIcon: (name) => document.createTextNode(`[${name}]`),
      notify: (message, kind) => notifications.push([message, kind])
    });
    const card = controller.card;
    assert.ok(card instanceof FakeNode, "the controller must expose its card as a DOM node property");
    document.body.append(card);
    await settleAsyncWork();

    assert.match(card.textContent, /官方增量规则/);
    assert.match(card.textContent, /github\.com\/0-V-linuxdo\/ChatClub-rules/);
    assert.match(card.textContent, /ed25519:primary/);
    assert.match(card.textContent, new RegExp("a{64}"));
    assert.match(card.textContent, new RegExp("b{64}"));
    assert.match(card.textContent, /更新 ChatGPT 消息选择器/);
    assert.match(card.textContent, /selectors\.messageRoot/);
    assert.match(card.textContent, /article\.old/);
    assert.match(card.textContent, /article\.new/);
    assert.match(card.textContent, /Delete Sites 新域名授权/);
    assert.match(card.textContent, /当前来源：用户覆盖/);
    assert.match(card.textContent, /当前来源：已回滚/);
    assert.match(card.textContent, /当前来源：跟随官方/);
    assert.match(card.textContent, /用户覆盖字段：hosts/);
    assert.match(findAction(card, "apply").textContent, /应用本次全部增量/);
    assert.ok(findButton(card, "自动检查"));
    assert.ok(findButton(card, "仅手动检查"));
    assert.equal(document.querySelectorAll("#chatclub-official-rules-settings-style").length, 1);

    const autoMode = findNode(card, (node) => node.dataset?.officialRulesMode === "auto");
    await settleEvent(autoMode.click());
    assert.deepEqual(calls.shift(), ["setMode", "auto"]);

    await settleEvent(findAction(card, "check").click());
    assert.deepEqual(calls.shift(), ["checkNow"]);

    await settleEvent(findAction(card, "clear-override:summary/chatgpt").click());
    assert.deepEqual(calls.shift(), ["clearOverride", "summary/chatgpt"]);
    assert.equal(findAction(card, "clear-override:summary/chatgpt").disabled, true);

    findAction(card, "apply").click();
    let dialog = activeConfirmation(document);
    assert.ok(dialog, "applying a candidate must open a confirmation modal");
    assert.equal(dialog.dataset.modalType, "confirmation");
    assert.match(dialog.textContent, /全部 changed components/);
    assert.match(dialog.textContent, /不能部分选择/);
    const applyConfirmation = findButton(dialog, "确认应用");
    const cancelConfirmation = findButton(dialog, "取消");
    const applyEvent = applyConfirmation.click();
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(applyConfirmation.disabled, true);
    assert.equal(cancelConfirmation.disabled, true);
    assert.equal(dialog.querySelector(".icon-button").disabled, true);
    dialog.dispatch("click", { target: dialog });
    assert.equal(activeConfirmation(document), dialog, "confirmation backdrops must not dismiss applying mutations");
    resolveApply();
    await settleEvent(applyEvent);
    assert.deepEqual(calls.shift(), ["applyCandidate", {
      approvedDeleteAliases: [{ componentKey: "delete/deepseek", host: "chat.example.test" }]
    }]);
    assert.equal(activeConfirmation(document), null, "successful mutations must force-close their confirmation");

    findAction(card, "rollback-last").click();
    dialog = activeConfirmation(document);
    await settleEvent(findButton(dialog, "确认回退").click());
    assert.deepEqual(calls.shift(), ["rollbackLast"]);

    findAction(card, "rollback:summary/chatgpt").click();
    dialog = activeConfirmation(document);
    await settleEvent(findButton(dialog, "确认回退").click());
    assert.deepEqual(calls.shift(), ["rollbackComponent", "summary/chatgpt"]);

    findAction(card, "restore:delete/deepseek").click();
    dialog = activeConfirmation(document);
    await settleEvent(findButton(dialog, "确认恢复").click());
    assert.deepEqual(calls.shift(), ["restoreComponent", "delete/deepseek"]);

    findAction(card, "alias:delete/deepseek:new.example.test").click();
    dialog = activeConfirmation(document);
    assert.match(dialog.textContent, /new\.example\.test/);
    await settleEvent(findButton(dialog, "允许此域名").click());
    assert.deepEqual(calls.shift(), ["setDeleteAliasApproval", {
      componentKey: "delete/deepseek",
      host: "new.example.test",
      approved: true
    }]);

    snapshot = { ...snapshot, phase: "ready", candidate: { available: false, changedComponents: [], deleteAliases: [] } };
    subscriber(structuredClone(snapshot));
    assert.match(card.textContent, /当前没有待应用的官方规则更新/);
    assert.equal(findAction(card, "apply").disabled, true);
    assert.ok(notifications.some(([message, kind]) => message === "官方规则已应用" && kind === "success"));

    controller.destroy();
    assert.equal(unsubscribeCount, 1);
    assert.equal(card.parentElement, null);
  } finally {
    globalThis.Node = previousGlobals.Node;
    globalThis.document = previousGlobals.document;
  }

  console.log("official rules settings regression: ok");
})().catch((error) => {
  globalThis.Node = previousGlobals.Node;
  globalThis.document = previousGlobals.document;
  console.error(error);
  process.exitCode = 1;
});
