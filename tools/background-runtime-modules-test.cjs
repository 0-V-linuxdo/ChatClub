#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

(async () => {
  const content = await load("background/content-registration.js");
  const tabs = await load("background/tab-runtime.js");

  const target = { id: "example", name: "Example", url: "", hosts: ["example.com"] };
  const registrations = content.buildContentScriptRegistrations({
    coreTargets: [target],
    preloadTargets: [target],
    summaryTargets: [target],
    messageNavigatorTargets: [target]
  });
  assert.deepEqual(registrations.map((item) => item.id), [
    "chatclub-preload",
    "chatclub-grok-cookie-bridge",
    "chatclub-summary-userscripts-main",
    "chatclub-summary-userscripts",
    "chatclub-message-navigator",
    "chatclub-content"
  ]);
  assert.equal(registrations.find((item) => item.id === "chatclub-preload").world, "MAIN");
  assert.equal(registrations.find((item) => item.id === "chatclub-summary-userscripts-main").world, "MAIN");

  {
    const injected = [];
    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 0, parentFrameId: -1, url: "moz-extension://chatclub/chatClub.html" },
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" },
          { frameId: 8, parentFrameId: 7, url: "https://example.com/nested" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          injected.push(details);
          return [];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"], features: ["summary"] });
    assert.deepEqual(result.frameIds, [7]);
    assert.equal(result.injected, 6);
    assert.deepEqual(injected.map((item) => item.files[0]), [
      "content/preload.js",
      "content/summary-userscripts-main.js",
      "content/summary-userscripts.js",
      "content/grok-cookie-bridge.js",
      "content/message-navigator.js",
      "content/content.js"
    ]);
    assert.deepEqual(new Set(injected.map((item) => item.target.frameIds[0])), new Set([7]));
  }

  {
    const previous = {
      id: "chatclub-content",
      matches: ["https://old.example/*"],
      js: ["content/content.js"],
      allFrames: true,
      runAt: "document_idle"
    };
    const desired = {
      ...previous,
      matches: ["https://new.example/*"]
    };
    let registered = [previous];
    let rejectedCanonical = false;
    const api = {
      scripting: {
        getRegisteredContentScripts: async () => registered.map((item) => ({ ...item })),
        unregisterContentScripts: async ({ ids }) => {
          registered = registered.filter((item) => !ids.includes(item.id));
        },
        registerContentScripts: async ([item]) => {
          if (!rejectedCanonical && item.matches.includes("https://new.example/*")) {
            rejectedCanonical = true;
            throw new Error("simulated registration failure");
          }
          registered.push({ ...item });
        }
      }
    };
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await content.reconcileContentScripts(api, [desired]);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(rejectedCanonical, true);
    assert.equal(registered.length, 1);
    assert.deepEqual(registered[0].matches, previous.matches);
  }

  {
    let actionListener = null;
    const created = [];
    const updated = [];
    const api = {
      runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
      action: { onClicked: { addListener: (listener) => { actionListener = listener; } } },
      tabs: {
        get: async () => ({ id: 3, windowId: 5, index: 2 }),
        query: async () => [],
        create: async (details) => {
          created.push(details);
          return { id: 4, windowId: details.windowId || 5 };
        },
        update: async (tabId, details) => {
          updated.push({ tabId, details });
          return { id: tabId, ...details };
        },
        duplicate: async () => null
      },
      windows: { update: async () => {} }
    };
    tabs.registerActionListener(api);
    assert.equal(typeof actionListener, "function");
    actionListener();
    assert.deepEqual(created.shift(), { url: "chrome-extension://chatclub/chatClub.html" });
    assert.equal(tabs.openableTabUrl("javascript:alert(1)"), "");
    await tabs.openExternalTab(api, "https://example.com/", {}, { id: 3 });
    assert.deepEqual(created.shift(), {
      url: "https://example.com/",
      active: true,
      windowId: 5,
      index: 3,
      openerTabId: 3
    });
    assert.deepEqual(updated[0], { tabId: 4, details: { active: true } });
  }

  console.log("background static runtime modules: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
