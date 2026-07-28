#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "content-src/preload/grok-storage-access.js"), "utf8")
  .replace("export function installGrokStorageAccessBridge", "function installGrokStorageAccessBridge");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(turns = 8) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

function fixture({
  hasStorageAccess,
  permissionQuery,
  requestStorageAccess,
  hostname = "grok.com",
  floatingBallTags = ["div"],
  floatingBallText = "换号",
  modalPrimaryTexts = ["确定"]
}) {
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let reloads = 0;
  let descriptor = null;
  class FakeElement {
    constructor({ id = "", tagName = "div", parent = null, textContent = "" } = {}) {
      this.id = id;
      this.tagName = tagName.toLowerCase();
      this.parent = parent;
      this.textContent = textContent;
      this.primaryActions = [];
    }

    closest(selector) {
      for (let current = this; current; current = current.parent) {
        if (selector === "#floatingBall" && current.id === "floatingBall") return current;
        if (selector === "button" && current.tagName === "button") return current;
        if (selector === "#randomAccountModal" && current.id === "randomAccountModal") return current;
      }
      return null;
    }

    matches(selector) {
      return selector === "div#floatingBall"
        && this.id === "floatingBall"
        && this.tagName === "div";
    }

    querySelectorAll(selector) {
      return selector === ".modal-footer button.btn.btn-primary"
        ? [...this.primaryActions]
        : [];
    }
  }
  const floatingBalls = floatingBallTags.map((tagName) => new FakeElement({
    id: "floatingBall",
    tagName,
    textContent: floatingBallText
  }));
  const floatingBall = floatingBalls[0] || null;
  const floatingBallChild = floatingBall ? new FakeElement({ tagName: "span", parent: floatingBall }) : null;
  const randomAccountModal = new FakeElement({ id: "randomAccountModal" });
  const modalFooter = new FakeElement({ parent: randomAccountModal });
  const modalPrimaryButtons = modalPrimaryTexts.map((textContent) => new FakeElement({
    tagName: "button",
    parent: modalFooter,
    textContent
  }));
  randomAccountModal.primaryActions = modalPrimaryButtons;
  const modalPrimaryButton = modalPrimaryButtons[0] || null;
  const modalPrimaryChild = modalPrimaryButton
    ? new FakeElement({ tagName: "span", parent: modalPrimaryButton })
    : null;
  const modalCancelButton = new FakeElement({ tagName: "button", parent: modalFooter, textContent: "取消" });
  const unrelatedButton = new FakeElement({ tagName: "button", textContent: "确定" });
  const window = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    }
  };
  const storage = new Map();
  const context = vm.createContext({
    window,
    document: {
      referrer: "",
      hasStorageAccess,
      requestStorageAccess,
      getElementById(id) {
        if (id === "floatingBall") return floatingBall;
        if (id === "randomAccountModal") return randomAccountModal;
        return null;
      },
      querySelectorAll(selector) {
        return selector === "#floatingBall" ? [...floatingBalls] : [];
      }
    },
    Element: FakeElement,
    navigator: { permissions: { query: permissionQuery } },
    location: {
      href: `https://${hostname}/`,
      hostname,
      origin: `https://${hostname}`,
      pathname: "/",
      ancestorOrigins: [],
      reload() { reloads += 1; }
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    setTimeout(callback) {
      const id = nextTimer;
      nextTimer += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    Date,
    console
  });
  vm.runInContext(`${source}\nglobalThis.installGrokStorageAccessBridge = installGrokStorageAccessBridge;`, context);
  const runtimes = {
    registration() { return null; },
    invalidate() {},
    register(name, value) {
      assert.equal(name, "grok-storage-access-bridge");
      descriptor = value;
      return value.api;
    }
  };
  context.installGrokStorageAccessBridge(runtimes);
  return {
    window,
    descriptor: () => descriptor,
    listenerCount: () => [...listeners.values()].reduce((total, group) => total + group.size, 0),
    timerCount: () => timers.size,
    reloadCount: () => reloads,
    floatingBall,
    floatingBallChild,
    modalPrimaryButton,
    modalPrimaryChild,
    modalCancelButton,
    unrelatedButton,
    otherElement: new FakeElement({ id: "other" }),
    emit(type, event = {}) {
      for (const listener of [...(listeners.get(type) || [])]) listener({ type, ...event });
    }
  };
}

async function runTrustedGesture({
  fixtureOptions = {},
  type = "click",
  key,
  targetName
}) {
  let accessRequests = 0;
  const runtime = fixture({
    hostname: "gk.dairoot.cn",
    hasStorageAccess: async () => false,
    permissionQuery: async () => ({ state: "prompt", onchange: null }),
    requestStorageAccess: async () => { accessRequests += 1; },
    ...fixtureOptions
  });
  await flushMicrotasks();
  runtime.emit(type, {
    isTrusted: true,
    button: 0,
    key,
    target: runtime[targetName]
  });
  await flushMicrotasks();
  return {
    accessRequests,
    listenerCount: runtime.listenerCount(),
    dispose() { runtime.descriptor().dispose(); }
  };
}

(async () => {
  {
    const hasAccess = deferred();
    let permissionQueries = 0;
    let accessRequests = 0;
    const runtime = fixture({
      hasStorageAccess: () => hasAccess.promise,
      permissionQuery: async () => {
        permissionQueries += 1;
        return { state: "prompt", onchange: null };
      },
      requestStorageAccess: async () => { accessRequests += 1; }
    });
    const descriptor = runtime.descriptor();
    assert.ok(descriptor, "runtime must register before its async capability probe settles");
    descriptor.dispose();
    hasAccess.resolve(false);
    await flushMicrotasks();
    assert.equal(permissionQueries, 0, "disposed capability probes must not continue to permissions");
    assert.equal(await descriptor.api.requestAccess("after-dispose"), false);
    assert.equal(accessRequests, 0, "disposed APIs must not request storage access");
    assert.equal(runtime.listenerCount(), 0);
    assert.equal(runtime.timerCount(), 0);
    assert.equal(runtime.reloadCount(), 0);
    assert.equal(runtime.window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__, undefined);
  }

  {
    const permission = deferred();
    let permissionQueries = 0;
    let accessRequests = 0;
    const permissionRecord = { state: "granted", onchange: null };
    const runtime = fixture({
      hasStorageAccess: async () => false,
      permissionQuery: () => {
        permissionQueries += 1;
        return permission.promise;
      },
      requestStorageAccess: async () => { accessRequests += 1; }
    });
    await flushMicrotasks();
    assert.equal(permissionQueries, 1);
    runtime.descriptor().dispose();
    permission.resolve(permissionRecord);
    await flushMicrotasks();
    assert.equal(permissionRecord.onchange, null, "a late permission result must not attach onchange");
    assert.equal(accessRequests, 0, "a late granted permission must not revive requestStorageAccess");
    assert.equal(runtime.listenerCount(), 0);
    assert.equal(runtime.timerCount(), 0);
  }

  {
    const access = deferred();
    let accessRequests = 0;
    const runtime = fixture({
      hasStorageAccess: async () => false,
      permissionQuery: async () => ({ state: "granted", onchange: null }),
      requestStorageAccess: () => {
        accessRequests += 1;
        return access.promise;
      }
    });
    await flushMicrotasks();
    assert.equal(accessRequests, 1);
    runtime.descriptor().dispose();
    access.resolve();
    await flushMicrotasks();
    assert.equal(runtime.timerCount(), 0, "a late storage-access grant must not schedule reload");
    assert.equal(runtime.reloadCount(), 0);
    assert.equal(runtime.listenerCount(), 0);
  }

  for (const testCase of [
    { label: "floating action click", type: "click", targetName: "floatingBallChild" },
    { label: "floating action Enter", type: "keydown", key: "Enter", targetName: "floatingBall" },
    { label: "floating action Space", type: "keydown", key: " ", targetName: "floatingBall" },
    { label: "modal primary click", type: "click", targetName: "modalPrimaryChild" },
    { label: "modal primary Enter", type: "keydown", key: "Enter", targetName: "modalPrimaryButton" },
    { label: "modal primary Space", type: "keydown", key: " ", targetName: "modalPrimaryButton" }
  ]) {
    const outcome = await runTrustedGesture(testCase);
    assert.equal(
      outcome.accessRequests,
      0,
      `the exact unique Mirror ${testCase.label} must not trigger Storage Access`
    );
    assert.ok(
      outcome.listenerCount > 0,
      `the Storage Access gesture listener must stay armed after the Mirror ${testCase.label}`
    );
    outcome.dispose();
  }

  for (const testCase of [
    {
      label: "wrong floating text",
      fixtureOptions: { floatingBallText: "切换账号" },
      targetName: "floatingBall"
    },
    {
      label: "duplicate floating actions",
      fixtureOptions: { floatingBallTags: ["div", "div"] },
      targetName: "floatingBall"
    },
    {
      label: "non-div floating action",
      fixtureOptions: { floatingBallTags: ["button"] },
      targetName: "floatingBall"
    },
    {
      label: "wrong modal primary text",
      fixtureOptions: { modalPrimaryTexts: ["确认"] },
      targetName: "modalPrimaryButton"
    },
    {
      label: "duplicate modal primary actions",
      fixtureOptions: { modalPrimaryTexts: ["确定", "确定"] },
      targetName: "modalPrimaryButton"
    },
    { label: "modal cancel action", targetName: "modalCancelButton" },
    { label: "unrelated same-text button", targetName: "unrelatedButton" },
    { label: "unrelated element", targetName: "otherElement" },
    {
      label: "same floating markup on the official host",
      fixtureOptions: { hostname: "grok.com" },
      targetName: "floatingBall"
    }
  ]) {
    const outcome = await runTrustedGesture(testCase);
    assert.equal(
      outcome.accessRequests,
      1,
      `${testCase.label} must remain eligible to request Storage Access`
    );
    outcome.dispose();
  }

  console.log("Grok storage access runtime teardown: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
