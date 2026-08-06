#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { prepareBrowserSessionRestore } = await import("../app/workspace/browser-session-restore.js");

  const storageValues = new Map();
  const storage = {
    getItem(key) { return storageValues.has(key) ? storageValues.get(key) : null; },
    setItem(key, value) { storageValues.set(key, String(value)); },
    removeItem(key) { storageValues.delete(key); }
  };
  const documentObject = {
    documentElement: {
      style: { values: new Map(), setProperty(key, value) { this.values.set(key, value); } },
      attributes: new Map(),
      setAttribute(key, value) { this.attributes.set(key, value); }
    },
    querySelector(selector) {
      assert.match(selector, /\.app-shell/);
      return {};
    }
  };
  let reloads = 0;
  const restoredWindow = {
    location: { href: "chrome-extension://chatclub/chatClub.html#workspace=restore", reload() { reloads += 1; } },
    performance: { getEntriesByType() { return [{ type: "back_forward" }]; } },
    sessionStorage: storage
  };

  const first = prepareBrowserSessionRestore(restoredWindow, documentObject);
  assert.equal(first.restored, true);
  assert.equal(first.reloadRequested, true);
  assert.equal(reloads, 1);
  assert.equal(documentObject.documentElement.style.values.get("visibility"), "hidden");
  assert.equal(documentObject.documentElement.attributes.get("data-chatclub-browser-restore"), "reloading");

  const guarded = prepareBrowserSessionRestore(restoredWindow, documentObject);
  assert.equal(guarded.reloadRequested, false, "the restore guard must prevent a reload loop");
  assert.equal(guarded.guarded, true);
  assert.equal(reloads, 1);

  const normalWindow = {
    location: { href: restoredWindow.location.href },
    performance: { getEntriesByType() { return [{ type: "reload" }]; } },
    sessionStorage: storage
  };
  const normal = prepareBrowserSessionRestore(normalWindow, documentObject);
  assert.equal(normal.restored, false);
  assert.equal(storageValues.size, 0, "a successful reload must clear the one-shot guard");

  const emptyWindow = {
    location: { href: "chrome-extension://chatclub/chatClub.html#workspace=empty", reload() { throw new Error("must not reload"); } },
    performance: { getEntriesByType() { return [{ type: "back_forward" }]; } },
    sessionStorage: { ...storage }
  };
  const emptyDocument = { documentElement: documentObject.documentElement, querySelector() { return null; } };
  const empty = prepareBrowserSessionRestore(emptyWindow, emptyDocument);
  assert.equal(empty.restored, true);
  assert.equal(empty.reloadRequested, false, "an empty document can bootstrap without a second page reload");

  const failedReloadWindow = {
    location: { href: "chrome-extension://chatclub/chatClub.html#workspace=failed", reload() { throw new Error("reload unavailable"); } },
    performance: { getEntriesByType() { return [{ type: "back_forward" }]; } },
    sessionStorage: storage
  };
  const failedReloadDocument = { documentElement: documentObject.documentElement, querySelector() { return {}; } };
  const failedReload = prepareBrowserSessionRestore(failedReloadWindow, failedReloadDocument);
  assert.equal(failedReload.reloadRequested, false, "a failed page reload must not suppress bootstrap forever");

  console.log("browser session restore guard: ok");
})();
