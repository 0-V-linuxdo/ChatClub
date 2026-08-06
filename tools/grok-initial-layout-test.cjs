#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "content-src/preload/grok-initial-layout.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "content-src/preload.js"), "utf8");

assert.match(source, /pathname === "\/"/, "the initial layout guard must be limited to Grok home");
assert.match(source, /isTrusted !== true/, "synthetic events must not release the initial layout guard");
assert.match(source, /offset <= MAX_INITIAL_SCROLL_OFFSET/, "the guard must only repair a small bootstrap offset");
assert.match(source, /INITIAL_LAYOUT_WINDOW_MS/, "the guard must have a bounded lifetime");
assert.match(preload, /installGrokInitialLayoutGuard\(runtimes\)/, "Grok preload must install the layout guard");

const originalDocument = globalThis.document;
const originalLocation = globalThis.location;
const originalWindow = globalThis.window;
const originalMutationObserver = globalThis.MutationObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

(async () => {
try {
  const listeners = new Map();
  const rootElement = {
    isConnected: true,
    className: "flex w-full h-full overflow-hidden @container/mainview relative",
    clientHeight: 975,
    scrollHeight: 1039,
    scrollTop: 64
  };
  const document = {
    querySelectorAll() { return [rootElement]; }
  };
  const window = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    }
  };
  let scheduledFrame = null;
  globalThis.document = document;
  globalThis.location = { href: "https://grok.com/?chatclub_webview=1" };
  globalThis.window = window;
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrame = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => { scheduledFrame = null; };
  globalThis.setTimeout = (callback) => {
    if (!scheduledFrame) scheduledFrame = callback;
    return 1;
  };
  globalThis.clearTimeout = () => {};

  const { installGrokInitialLayoutGuard } = await import(`${pathToFileURL(path.join(root, "content-src/preload/grok-initial-layout.js")).href}?test=${Date.now()}`);
  let registration = null;
  const runtimes = {
    registration() { return null; },
    invalidate() {},
    register(name, descriptor) { registration = { name, descriptor }; }
  };
  installGrokInitialLayoutGuard(runtimes);
  assert.ok(scheduledFrame, "the guard must schedule a document-start layout pass");
  scheduledFrame();
  assert.equal(rootElement.scrollTop, 0, "the bootstrap 64px offset must be reset");
  assert.equal(listeners.has("pointerdown"), true, "trusted interaction listeners must be installed");
  listeners.get("pointerdown")({ isTrusted: true });
  rootElement.scrollTop = 32;
  assert.equal(listeners.has("pointerdown"), false, "trusted interaction must release the guard");
  registration.descriptor.dispose();

  scheduledFrame = null;
  globalThis.location.href = "https://grok.com/c/123";
  installGrokInitialLayoutGuard(runtimes);
  assert.ok(scheduledFrame, "the route guard still schedules a bounded check");
  scheduledFrame();
  assert.equal(rootElement.scrollTop, 32, "conversation routes must not be changed");
} finally {
  globalThis.document = originalDocument;
  globalThis.location = originalLocation;
  globalThis.window = originalWindow;
  globalThis.MutationObserver = originalMutationObserver;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}

console.log("Grok initial layout guard: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
