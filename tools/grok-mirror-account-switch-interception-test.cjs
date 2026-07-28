#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "content-src/grok-cookie-bridge.js"), "utf8");

async function flushMicrotasks(turns = 12) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fixture(options = {}) {
  const listeners = new Map();
  const requests = [];
  const assignments = [];
  const assignmentAttempts = [];
  const reloads = [];
  const storage = new Map();
  const localStorageValues = new Map([["modes-selected-id", "previous-mode"]]);
  const localStorageRemovals = [];
  const timers = new Map();
  let nextTimerId = 1;
  let armRequestCount = 0;
  let remainingAssignThrows = Math.max(0, Number(options.assignThrows) || 0);
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
        if (selector === "div#floatingBall" && current.id === "floatingBall" && current.tagName === "div") {
          return current;
        }
        if (selector === "button" && current.tagName === "button") return current;
        if (selector === "#randomAccountModal" && current.id === "randomAccountModal") return current;
      }
      return null;
    }

    matches(selector) {
      if (selector === "#floatingBall") return this.id === "floatingBall";
      if (selector === "div#floatingBall") return this.id === "floatingBall" && this.tagName === "div";
      return false;
    }

    querySelectorAll(selector) {
      return selector === ".modal-footer button.btn.btn-primary" ? [...this.primaryActions] : [];
    }
  }

  const floatingBallTags = Array.isArray(options.floatingBallTags)
    ? options.floatingBallTags
    : ["div"];
  const floatingBalls = floatingBallTags.map((tagName) => new FakeElement({
    id: "floatingBall",
    tagName,
    textContent: options.floatingBallText ?? "换号"
  }));
  const floatingBall = floatingBalls[0] || null;
  const floatingSvg = floatingBall ? new FakeElement({ tagName: "svg", parent: floatingBall }) : null;
  const floatingSpan = floatingBall ? new FakeElement({ tagName: "span", parent: floatingBall }) : null;
  const unrelated = new FakeElement({ id: "notFloatingBall" });
  const randomModal = new FakeElement({ id: "randomAccountModal" });
  const modalFooter = new FakeElement({ parent: randomModal });
  const confirmButton = new FakeElement({
    tagName: "button",
    parent: modalFooter,
    textContent: options.modalPrimaryText ?? "确定"
  });
  const confirmChild = new FakeElement({ parent: confirmButton });
  const cancelButton = new FakeElement({ tagName: "button", parent: modalFooter });
  randomModal.primaryActions = [confirmButton];

  const document = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    getElementById(id) {
      if (id === "floatingBall") return floatingBalls[0] || null;
      if (id === "randomAccountModal") return randomModal;
      return null;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      if (selector === "#floatingBall") return [...floatingBalls];
      if (selector === "div#floatingBall") {
        return floatingBalls.filter(({ tagName }) => tagName === "div");
      }
      return [];
    }
  };
  const window = { top: {} };
  const pageUrl = new URL(options.href || "https://gk.dairoot.cn/admin?a=3");
  const pageLocation = {
    protocol: pageUrl.protocol,
    hostname: pageUrl.hostname,
    origin: pageUrl.origin,
    pathname: pageUrl.pathname,
    href: pageUrl.href,
    assign(value) {
      assignmentAttempts.push(String(value));
      if (remainingAssignThrows > 0) {
        remainingAssignThrows -= 1;
        throw new Error("navigation unavailable");
      }
      assignments.push(String(value));
    },
    reload() { reloads.push(pageUrl.href); }
  };
  const context = vm.createContext({
    window,
    document,
    Element: FakeElement,
    location: pageLocation,
    localStorage: {
      removeItem(key) {
        localStorageRemovals.push(String(key));
        localStorageValues.delete(String(key));
      }
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(String(key), String(value)); },
      removeItem(key) { storage.delete(String(key)); }
    },
    GROK_COOKIE_BRIDGE_VERSION: "test-bridge-version",
    CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY: {},
    ARM_GROK_MIRROR_ACCOUNT_SWITCH_REQUEST: "arm-switch",
    SYNC_GROK_SESSION_COOKIES_REQUEST: "sync-cookies",
    createContentRuntimeBundleIdentity() {
      return { bundle: { implementationVersion: "test-runtime-version" } };
    },
    runtimeRegistry() {
      return {
        registerBundle() {},
        install(name, version, factory) {
          assert.equal(name, "grok-cookie-bridge-root");
          assert.equal(version, "test-runtime-version");
          descriptor = factory();
          descriptor.activate();
          return descriptor.api;
        }
      };
    },
    requestBackground(action, payload) {
      requests.push({ action, payload });
      if (action === "sync-cookies") {
        if (options.syncPromise) return options.syncPromise;
        return Promise.resolve(options.syncResponse || { reloadRequired: false });
      }
      if (action === "arm-switch") {
        armRequestCount += 1;
        if (typeof options.armRequest === "function") return options.armRequest(armRequestCount);
        if (options.armThrows === true) throw new Error("arm request unavailable");
        if (options.armPromise) return options.armPromise;
        if (options.armRejects === true) return Promise.reject(new Error("arm request failed"));
        return Promise.resolve(Object.hasOwn(options, "armResponse")
          ? options.armResponse
          : { success: true, armed: true, proceed: true });
      }
      return Promise.reject(new Error("unexpected request"));
    },
    chrome: {
      runtime: {
        getURL() {
          return options.extensionBase || "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";
        }
      }
    },
    console,
    URL,
    setTimeout(callback, delay = 0) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay: Number(delay) || 0 });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(`${functionSource(source, "installGrokCookieBridge")}\ninstallGrokCookieBridge();`, context);

  return {
    assignments,
    assignmentAttempts,
    reloads,
    requests,
    storage,
    localStorageValues,
    localStorageRemovals,
    timerCount: () => timers.size,
    runTimers(maxDelay = Number.POSITIVE_INFINITY) {
      const ready = [...timers.entries()].filter(([, timer]) => timer.delay <= maxDelay);
      for (const [id, timer] of ready) {
        if (!timers.delete(id)) continue;
        timer.callback();
      }
    },
    descriptor: () => descriptor,
    floatingBall,
    floatingSvg,
    floatingSpan,
    unrelated,
    confirmButton,
    confirmChild,
    cancelButton,
    setLocation(value) {
      const next = new URL(String(value));
      pageLocation.protocol = next.protocol;
      pageLocation.hostname = next.hostname;
      pageLocation.origin = next.origin;
      pageLocation.pathname = next.pathname;
      pageLocation.href = next.href;
    },
    replaceDocument() {
      context.document = { ...document };
    },
    emit(target, overrides = {}) {
      let prevented = 0;
      let stopped = 0;
      const event = {
        isTrusted: true,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target,
        preventDefault() { prevented += 1; },
        stopImmediatePropagation() { stopped += 1; },
        ...overrides
      };
      for (const listener of [...(listeners.get("click") || [])]) listener(event);
      return { prevented, stopped };
    }
  };
}

(async () => {
  {
    const runtime = fixture({
      href: "https://gk.dairoot.cn/",
      extensionBase: "moz-extension://01234567-89ab-cdef-0123-456789abcdef/"
    });
    await flushMicrotasks();
    const handled = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 0, stopped: 0 }, "Firefox 136 must retain the gateway's native account switch");
    assert.equal(
      runtime.requests.filter(({ action }) => action === "arm-switch").length,
      0,
      "a moz-extension frame without documentId support must never send the Chromium ARM request"
    );
    assert.deepEqual(runtime.assignments, [], "the content bridge must not replace native Firefox navigation");
    assert.deepEqual(runtime.localStorageRemovals, []);
    runtime.descriptor().dispose();
  }

  for (const [label, target] of [
    ["direct floating div", (runtime) => runtime.floatingBall],
    ["nested floating svg", (runtime) => runtime.floatingSvg],
    ["nested floating span", (runtime) => runtime.floatingSpan]
  ]) {
    const runtime = fixture({
      href: "https://gk.dairoot.cn/",
      floatingBallText: label === "nested floating svg" ? "  换号\n" : "换号"
    });
    await flushMicrotasks();
    const handled = runtime.emit(target(runtime));
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 1, stopped: 1 }, `${label} must be intercepted`);
    assert.deepEqual(runtime.assignments, ["/api/random-login"]);
    assert.deepEqual(runtime.localStorageRemovals, ["modes-selected-id"]);
    assert.equal(runtime.localStorageValues.has("modes-selected-id"), false);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    runtime.descriptor().dispose();
  }

  {
    const runtime = fixture({ href: "https://gk.dairoot.cn/" });
    await flushMicrotasks();
    const firstHandled = runtime.emit(runtime.floatingSpan);
    const secondHandled = runtime.emit(runtime.floatingSpan);
    assert.deepEqual(firstHandled, { prevented: 1, stopped: 1 }, "first rapid click must be intercepted");
    assert.deepEqual(secondHandled, { prevented: 1, stopped: 1 }, "second rapid click must be intercepted");
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    assert.deepEqual(runtime.assignments, [], "navigation must wait for the single ARM response");
    await flushMicrotasks();
    assert.deepEqual(runtime.assignments, ["/api/random-login"]);
    assert.deepEqual(runtime.assignmentAttempts, ["/api/random-login"]);
    assert.deepEqual(runtime.localStorageRemovals, ["modes-selected-id"]);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    runtime.descriptor().dispose();
  }

  for (const [label, armResponse, shouldNavigate] of [
    ["armed without proceed", { success: true, armed: true, proceed: false }, false],
    ["fully rejected", { success: true, armed: false, proceed: false }, false],
    ["proceed-only fallback", { success: true, armed: false, proceed: true }, true],
    ["empty response", {}, false],
    ["null response", null, false],
    ["malformed response", "not-an-arm-response", false],
    ["missing envelope", { armed: false, proceed: true }, false],
    ["failed envelope", { success: false, armed: false, proceed: true }, false],
    ["extra response field", { success: true, armed: false, proceed: true, extra: true }, false]
  ]) {
    const runtime = fixture({ href: "https://gk.dairoot.cn/", armResponse });
    await flushMicrotasks();
    const handled = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 1, stopped: 1 }, `${label} must remain intercepted`);
    assert.deepEqual(
      runtime.assignments,
      shouldNavigate ? ["/api/random-login"] : [],
      `${label} must navigate only through an exact successful proceed contract`
    );
    assert.deepEqual(runtime.localStorageRemovals, shouldNavigate ? ["modes-selected-id"] : []);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    runtime.descriptor().dispose();
  }

  for (const [label, options] of [
    ["asynchronous ARM rejection", { armRejects: true }],
    ["synchronous ARM failure", { armThrows: true }]
  ]) {
    const runtime = fixture({ href: "https://gk.dairoot.cn/", ...options });
    await flushMicrotasks();
    const handled = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 1, stopped: 1 }, `${label} must remain intercepted`);
    assert.deepEqual(runtime.assignments, [], `${label} must fail closed without navigation`);
    assert.deepEqual(runtime.assignmentAttempts, []);
    assert.deepEqual(runtime.localStorageRemovals, []);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    runtime.descriptor().dispose();
  }

  {
    const firstArm = deferred();
    const runtime = fixture({
      href: "https://gk.dairoot.cn/",
      armRequest(call) {
        return call === 1
          ? firstArm.promise
          : Promise.resolve({ success: true, armed: false, proceed: true });
      }
    });
    await flushMicrotasks();
    const firstHandled = runtime.emit(runtime.floatingSpan);
    const stillLocked = runtime.emit(runtime.floatingSpan);
    assert.deepEqual(firstHandled, { prevented: 1, stopped: 1 });
    assert.deepEqual(stillLocked, { prevented: 1, stopped: 1 });
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    assert.equal(runtime.timerCount(), 1);
    runtime.runTimers(8999);
    assert.equal(runtime.timerCount(), 1, "the ARM lock must remain before the bounded deadline");
    runtime.runTimers(9000);
    assert.equal(runtime.timerCount(), 0);
    assert.deepEqual(runtime.assignments, [], "a never-settling ARM request must time out without navigation");
    const retried = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(retried, { prevented: 1, stopped: 1 });
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 2);
    assert.deepEqual(runtime.assignments, ["/api/random-login"]);
    assert.equal(runtime.timerCount(), 0, "the successful retry must clear its ARM timer");
    firstArm.resolve({ success: true, armed: true, proceed: true });
    await flushMicrotasks();
    assert.deepEqual(
      runtime.assignments,
      ["/api/random-login"],
      "a late response from the timed-out attempt must never navigate again"
    );
    assert.deepEqual(runtime.localStorageRemovals, ["modes-selected-id"]);
    runtime.descriptor().dispose();
  }

  {
    const sync = deferred();
    const runtime = fixture({ href: "https://gk.dairoot.cn/", syncPromise: sync.promise });
    const handled = runtime.emit(runtime.floatingSpan);
    sync.resolve({ reloadRequired: true });
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 1, stopped: 1 });
    assert.deepEqual(runtime.reloads, [], "a stale initial sync must not reload during account switching");
    assert.deepEqual(runtime.assignments, ["/api/random-login"]);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    runtime.descriptor().dispose();
  }

  for (const [label, mutate, restore] of [
    [
      "start href",
      (runtime) => runtime.setLocation("https://gk.dairoot.cn/c/different-topic"),
      () => {}
    ],
    [
      "host",
      (runtime) => runtime.setLocation("https://example.com/"),
      (runtime) => runtime.setLocation("https://gk.dairoot.cn/c/restored-topic")
    ],
    ["document", (runtime) => runtime.replaceDocument(), () => {}]
  ]) {
    const arm = deferred();
    const runtime = fixture({
      href: "https://gk.dairoot.cn/c/original-topic",
      armPromise: arm.promise
    });
    await flushMicrotasks();
    const handled = runtime.emit(runtime.floatingSpan);
    mutate(runtime);
    arm.resolve({ success: true, armed: false, proceed: true });
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 1, stopped: 1 });
    assert.deepEqual(runtime.assignments, [], `a changed ${label} must reject delayed native navigation`);
    assert.deepEqual(runtime.assignmentAttempts, []);
    assert.deepEqual(runtime.localStorageRemovals, []);
    restore(runtime);
    const retried = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(retried, { prevented: 1, stopped: 1 });
    assert.deepEqual(runtime.assignments, ["/api/random-login"], `a changed ${label} must unlock a fresh click`);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 2);
    runtime.descriptor().dispose();
  }

  {
    const runtime = fixture({ href: "https://gk.dairoot.cn/", assignThrows: 1 });
    await flushMicrotasks();
    const firstHandled = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(firstHandled, { prevented: 1, stopped: 1 });
    assert.deepEqual(runtime.assignmentAttempts, ["/api/random-login"]);
    assert.deepEqual(runtime.assignments, []);
    const secondHandled = runtime.emit(runtime.floatingSpan);
    await flushMicrotasks();
    assert.deepEqual(secondHandled, { prevented: 1, stopped: 1 });
    assert.deepEqual(
      runtime.assignmentAttempts,
      ["/api/random-login", "/api/random-login"],
      "a thrown location.assign must release the switch lock for one clean retry"
    );
    assert.deepEqual(runtime.assignments, ["/api/random-login"]);
    assert.deepEqual(runtime.localStorageRemovals, ["modes-selected-id", "modes-selected-id"]);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 2);
    runtime.descriptor().dispose();
  }

  for (const [label, options, target, overrides] of [
    [
      "ambiguous duplicate floating divs",
      { href: "https://gk.dairoot.cn/", floatingBallTags: ["div", "div"] },
      (runtime) => runtime.floatingSpan,
      {}
    ],
    [
      "wrong floating element type",
      { href: "https://gk.dairoot.cn/", floatingBallTags: ["button"] },
      (runtime) => runtime.floatingSpan,
      {}
    ],
    [
      "wrong floating text",
      { href: "https://gk.dairoot.cn/", floatingBallText: "切换账号" },
      (runtime) => runtime.floatingSpan,
      {}
    ],
    ["wrong element", { href: "https://gk.dairoot.cn/" }, (runtime) => runtime.unrelated, {}],
    [
      "untrusted floating div",
      { href: "https://gk.dairoot.cn/" },
      (runtime) => runtime.floatingBall,
      { isTrusted: false }
    ],
    [
      "meta-modified floating div",
      { href: "https://gk.dairoot.cn/" },
      (runtime) => runtime.floatingBall,
      { metaKey: true }
    ],
    [
      "ctrl-modified floating div",
      { href: "https://gk.dairoot.cn/" },
      (runtime) => runtime.floatingBall,
      { ctrlKey: true }
    ],
    [
      "shift-modified floating div",
      { href: "https://gk.dairoot.cn/" },
      (runtime) => runtime.floatingBall,
      { shiftKey: true }
    ],
    [
      "alt-modified floating div",
      { href: "https://gk.dairoot.cn/" },
      (runtime) => runtime.floatingBall,
      { altKey: true }
    ]
  ]) {
    const runtime = fixture(options);
    await flushMicrotasks();
    const handled = runtime.emit(target(runtime), overrides);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 0, stopped: 0 }, `${label} must remain untouched`);
    assert.deepEqual(runtime.assignments, []);
    assert.deepEqual(runtime.assignmentAttempts, []);
    assert.deepEqual(runtime.localStorageRemovals, []);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 0);
    runtime.descriptor().dispose();
  }

  {
    const runtime = fixture({ modalPrimaryText: "\n 确定  " });
    await flushMicrotasks();
    const handled = runtime.emit(runtime.confirmChild);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 1, stopped: 1 });
    assert.deepEqual(runtime.assignments, ["/api/random-login"]);
    assert.deepEqual(runtime.localStorageRemovals, ["modes-selected-id"]);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 1);
    runtime.descriptor().dispose();
  }

  for (const [label, target, overrides] of [
    ["cancel", (runtime) => runtime.cancelButton, {}],
    ["untrusted", (runtime) => runtime.confirmButton, { isTrusted: false }],
    ["modified", (runtime) => runtime.confirmButton, { metaKey: true }]
  ]) {
    const runtime = fixture();
    await flushMicrotasks();
    const handled = runtime.emit(target(runtime), overrides);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 0, stopped: 0 }, `${label} action must remain untouched`);
    assert.deepEqual(runtime.assignments, []);
    assert.deepEqual(runtime.assignmentAttempts, []);
    assert.deepEqual(runtime.localStorageRemovals, []);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 0);
    runtime.descriptor().dispose();
  }

  {
    const runtime = fixture({ modalPrimaryText: "随机换号" });
    await flushMicrotasks();
    const handled = runtime.emit(runtime.confirmChild);
    await flushMicrotasks();
    assert.deepEqual(handled, { prevented: 0, stopped: 0 }, "wrong modal primary text must remain untouched");
    assert.deepEqual(runtime.assignments, []);
    assert.deepEqual(runtime.localStorageRemovals, []);
    assert.equal(runtime.requests.filter(({ action }) => action === "arm-switch").length, 0);
    runtime.descriptor().dispose();
  }

  {
    const sensitiveToken = `gt-${"a".repeat(32)}`;
    const runtime = fixture({
      href: `https://gk.dairoot.cn/api/not-login?user_gateway_token=${sensitiveToken}`,
      syncResponse: { reloadRequired: true }
    });
    await flushMicrotasks();
    assert.deepEqual(runtime.reloads.length, 1);
    assert.equal(
      [...runtime.storage.values()].some((value) => String(value).includes(sensitiveToken)),
      false,
      "reload markers must never persist a gateway token query"
    );
    assert.equal([...runtime.storage.values()].includes("https://gk.dairoot.cn/api/not-login"), true);
    runtime.descriptor().dispose();
  }

  console.log("Grok Mirror account-switch interception: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
