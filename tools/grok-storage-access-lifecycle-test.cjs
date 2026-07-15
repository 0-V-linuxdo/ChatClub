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

function fixture({ hasStorageAccess, permissionQuery, requestStorageAccess }) {
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let reloads = 0;
  let descriptor = null;
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
      requestStorageAccess
    },
    navigator: { permissions: { query: permissionQuery } },
    location: {
      href: "https://grok.com/",
      hostname: "grok.com",
      origin: "https://grok.com",
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
    reloadCount: () => reloads
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

  console.log("Grok storage access runtime teardown: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
