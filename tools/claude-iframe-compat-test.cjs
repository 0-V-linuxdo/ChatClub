#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "content-src/preload/claude-iframe.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "content-src/preload.js"), "utf8");

assert.match(source, /isInIframe: true/, "Claude compat must target stores that report isInIframe");
assert.match(source, /isInIframe: false/, "Claude compat must force isInIframe false");
assert.match(source, /modulepreload/, "Claude compat must scan modulepreload exports for Zustand stores");
assert.doesNotMatch(source, /\bimport\s*\(/, "content runtime must not contain a dynamic import token");
assert.doesNotMatch(source, /parent\s*=\s*(?:window|target|self)/, "Claude compat must not overwrite window.parent");
assert.match(preload, /installClaudeIframeCompat\(runtimes\)/, "Claude preload must install iframe compat");
assert.doesNotMatch(preload, /window\.parent\s*=\s*(?:window|self)/, "ChatClub preload must keep the real parent for Frame RPC");

function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    getState() { return state; },
    setState(partial) {
      state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function deferredTimers() {
  const timers = new Map();
  let nextId = 1;
  return {
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay: Number(delay) || 0 });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fire(id) {
      const timer = timers.get(id);
      timers.delete(id);
      timer?.callback?.();
    },
    get size() { return timers.size; }
  };
}

function runtimesBag() {
  const registrations = [];
  return {
    registrations,
    runtimes: {
      registration() { return registrations.at(-1) || null; },
      invalidate() {},
      register(name, descriptor) { registrations.push({ name, ...descriptor }); }
    }
  };
}

(async () => {
  const { installClaudeIframeCompat } = await import(
    `${pathToFileURL(path.join(root, "content-src/preload/claude-iframe.js")).href}?test=${Date.now()}`
  );

  const parentWindow = { id: "parent" };
  const imported = [];
  const moduleStore = createStore({ isInIframe: true, id: "module", theme: "dark" });
  const liveStore = createStore({ isInIframe: true, id: "live" });
  const documentWithModules = {
    referrer: "https://evil.example/",
    querySelectorAll(selector) {
      if (selector.includes("modulepreload")) {
        return [{ href: "https://claude.ai/assets/store.js", getAttribute: () => "https://claude.ai/assets/store.js" }];
      }
      if (selector.includes('script[type="module"]')) {
        return [{ src: "https://evil.example/pwn.js", getAttribute: () => "https://evil.example/pwn.js" }];
      }
      return [];
    }
  };
  const locationLike = {
    href: "https://claude.ai/",
    pathname: "/",
    search: "?ref=1",
    hash: "#x",
    replace(next) {
      this.pathname = String(next).split("?")[0].split("#")[0];
      this.href = `https://claude.ai${next}`;
    }
  };
  const child = {
    parent: parentWindow,
    location: locationLike,
    document: documentWithModules
  };
  Object.defineProperty(child, "top", { configurable: true, value: parentWindow, writable: true });
  Object.defineProperty(child, "frameElement", { configurable: true, get() { return { tagName: "IFRAME" }; } });
  Object.defineProperty(locationLike, "ancestorOrigins", {
    configurable: true,
    get() { return { length: 1, item: () => "https://chatclub.example" }; }
  });

  const timers = deferredTimers();
  let observed = false;
  class FakeObserver {
    observe() { observed = true; }
    disconnect() { observed = false; }
  }
  const { runtimes, registrations } = runtimesBag();
  installClaudeIframeCompat(runtimes, {
    window: child,
    document: documentWithModules,
    location: locationLike,
    extraStores: [liveStore],
    importModule: async (href) => {
      imported.push(href);
      return { uiStore: moduleStore };
    },
    MutationObserver: FakeObserver,
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    now: () => 0
  });
  for (let i = 0; i < 50 && liveStore.getState().isInIframe !== false; i += 1) {
    await Promise.resolve();
  }

  assert.equal(registrations[0].name, "claude-iframe-compat");
  assert.match(locationLike.href, /\/new\?ref=1#x/, "Claude home must redirect to /new in an embed");
  assert.equal(documentWithModules.referrer, "", "embedded Claude must not expose the ChatClub referrer");
  assert.equal(child.parent, parentWindow, "install must not reassign parent");
  assert.equal(child.top, child, "window.top must be spoofed when configurable");
  assert.equal(child.frameElement, null);
  assert.equal(locationLike.ancestorOrigins.length, 0);
  assert.equal(liveStore.getState().isInIframe, false);
  assert.equal(moduleStore.getState().isInIframe, false);
  assert.equal(moduleStore.getState().theme, "dark", "iframe patch must be a partial Zustand update");
  assert.deepEqual(imported, ["https://claude.ai/assets/store.js"], "cross-origin module scripts must not be loaded");
  assert.equal(observed, true);

  liveStore.setState({ isInIframe: true });
  assert.equal(liveStore.getState().isInIframe, false, "subscribe must keep isInIframe false while the scan window is open");

  registrations[0].dispose();
  liveStore.setState({ isInIframe: true });
  assert.equal(liveStore.getState().isInIframe, true, "dispose must release store subscriptions");
  assert.equal(observed, false);
  assert.equal(timers.size, 0, "dispose must clear scan and deadline timers");

  const topLevel = {};
  topLevel.parent = topLevel;
  const skipped = runtimesBag();
  const untouched = createStore({ isInIframe: true });
  installClaudeIframeCompat(skipped.runtimes, { window: topLevel, extraStores: [untouched] });
  assert.equal(skipped.registrations[0].name, "claude-iframe-compat");
  assert.equal(untouched.getState().isInIframe, true, "top-level Claude tabs must not receive the iframe patch");

  console.log("Claude iframe compat: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
