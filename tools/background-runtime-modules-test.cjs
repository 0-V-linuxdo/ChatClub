#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);
const LEGACY_BROWSER_DOCUMENT_ID = `legacy:${"1".repeat(64)}`;
const isBrowserDocumentProbe = (details = {}) =>
  typeof details.func === "function"
  && String(details.func).includes("return { attestation:");
const browserDocumentProbeResult = (details = {}, options = {}) => [{
  frameId: details.target.frameIds[0],
  ...(options.officialDocumentId === "" ? {} : {
    documentId: options.officialDocumentId || "browser-document-7"
  }),
  result: {
    attestation: options.attestation === undefined
      ? LEGACY_BROWSER_DOCUMENT_ID
      : options.attestation,
    epoch: options.epoch || 1
  }
}];

(async () => {
  const content = await load("background/content-registration.js");
  const tabs = await load("background/tab-runtime.js");
  const workspaceSession = await load("shared/workspace-session.js");

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
    const listeners = new Map();
    let randomGeneration = 0;
    const probeContext = vm.createContext({
      addEventListener(type, listener) { listeners.set(type, listener); },
      crypto: {
        getRandomValues(bytes) {
          bytes.fill(++randomGeneration);
          return bytes;
        }
      }
    });
    const probeSource = `(${content.attestInjectedFrameDocument.toString()})()`;
    const before = vm.runInContext(probeSource, probeContext);
    const descriptor = vm.runInContext(
      'Object.getOwnPropertyDescriptor(globalThis, "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__")',
      probeContext
    );
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.writable, false);
    listeners.get("pagehide")();
    listeners.get("pageshow")();
    const restored = vm.runInContext(probeSource, probeContext);
    assert.notEqual(restored.attestation, before.attestation, "BFCache restore must rotate the document generation token");
    assert.equal(restored.epoch, before.epoch + 1);
    listeners.get("pagehide")();
    const probedWhileDirty = vm.runInContext(probeSource, probeContext);
    assert.notEqual(probedWhileDirty.attestation, restored.attestation, "the next probe must rotate a dirty document generation");
    assert.equal(probedWhileDirty.epoch, restored.epoch + 1);
  }

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
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          injected.push(details);
          return [{ frameId: details.target.frameIds[0], documentId: "browser-document-7" }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"], features: ["summary"] });
    assert.deepEqual(result.frameIds, [7]);
    assert.equal(result.injected, 6);
    assert.deepEqual(result.fallbackFiles, []);
    assert.equal(result.bindingRelayed, false);
    assert.equal(result.browserDocumentId, "browser-document-7");
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
    assert.throws(
      () => content.assertSuccessfulFrameInjection([], 7, "content/content.js"),
      /returned no result for the target frame/
    );
    assert.throws(
      () => content.assertSuccessfulFrameInjection([
        { documentId: "browser-document-7", result: true }
      ], 7, "content/content.js"),
      /returned no result for the target frame/
    );
    assert.throws(
      () => content.assertSuccessfulFrameInjection([
        { frameId: 7, documentId: "browser-document-7", error: "Unable to load script: moz-extension:\/\/chatclub\/content\/content.js" }
      ], 7, "content/content.js"),
      /Unable to load script/
    );
    assert.throws(
      () => content.assertSuccessfulFrameInjection([{ frameId: 7, result: true }], 7, "content/content.js"),
      /returned no browser document id/
    );

    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 0, parentFrameId: -1, url: "moz-extension://chatclub/chatClub.html" },
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => [{
          ...(isBrowserDocumentProbe(details)
            ? browserDocumentProbeResult(details)[0]
            : {
                frameId: details.target.frameIds[0],
                documentId: "browser-document-7",
                error: `Unable to load script: ${details.files[0]}`
              })
        }]
      }
    }, 31, { hrefs: ["https://example.com/thread"] });
    assert.equal(result.injected, 0);
    assert.deepEqual(result.injectedFiles, []);
    assert.deepEqual(result.fallbackFiles, []);
    assert.equal(result.bindingRelayed, false);
    assert.equal(result.errors.length, 4);
    assert.match(result.errors[0], /content\/preload\.js@7: Unable to load script/);
  }

  {
    let probeCalls = 0;
    let actualExecutions = 0;
    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) {
            probeCalls += 1;
            return browserDocumentProbeResult(details, {
              officialDocumentId: "",
              attestation: `legacy:${(probeCalls <= 2 ? "6" : "7").repeat(64)}`,
              epoch: probeCalls <= 2 ? 1 : 2
            });
          }
          actualExecutions += 1;
          return [{ frameId: 7 }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"] });
    assert.equal(result.injected, 1);
    assert.equal(actualExecutions, 1, "a pre-injection document mismatch must fail before writing into the new document");
    assert.match(result.errors.join(" | "), /browser document changed from legacy:6{64} to legacy:7{64}/);
  }

  {
    const fallbackKey = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";
    const bindingId = "9".repeat(64);
    const challenge = "8".repeat(64);
    const changedFile = content.CONTENT_BRIDGE_FILES[1].file;
    const fallback = function navigationMismatchFallbackMustNotRun() {};
    let fallbackCalls = 0;
    let relayCalls = 0;
    globalThis[fallbackKey] = { [changedFile]: fallback };
    try {
      const result = await content.injectContentBridge({
        webNavigation: {
          getAllFrames: async () => [
            { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
          ]
        },
        scripting: {
          executeScript: async (details) => {
            const frameId = details.target.frameIds[0];
            if (isBrowserDocumentProbe(details)) {
              return browserDocumentProbeResult(details, { officialDocumentId: "browser-document-old" });
            }
            if (details.func === fallback) {
              fallbackCalls += 1;
              return [{ frameId, documentId: "browser-document-new" }];
            }
            if (details.func) {
              if (Array.isArray(details.args) && details.args.length === 4) relayCalls += 1;
              return [{ frameId, documentId: "browser-document-old", result: { success: true } }];
            }
            const documentId = details.files[0] === changedFile
              ? "browser-document-new"
              : "browser-document-old";
            return [{ frameId, documentId }];
          }
        }
      }, 31, {
        hrefs: ["https://example.com/thread"],
        expectedFrameId: 7,
        expectedBindingId: bindingId,
        bindingChallenge: challenge,
        bindingGeneration: 1
      });
      assert.equal(result.injected, 1, "injection must stop at the first browser-document change");
      assert.equal(result.browserDocumentId, "browser-document-old");
      assert.equal(result.bindingRelayed, false, "a cross-document injection chain must never bind");
      assert.equal(fallbackCalls, 0, "a browser-document mismatch must not be retried through the Firefox function fallback");
      assert.equal(relayCalls, 0, "a browser-document mismatch must fail before the binding relay");
      assert.match(result.errors.join(" | "), /browser document changed from browser-document-old to browser-document-new/);
    } finally {
      delete globalThis[fallbackKey];
    }
  }

  {
    const fallbackKey = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";
    const files = content.CONTENT_BRIDGE_FILES.map((spec) => spec.file);
    const fallbacks = Object.fromEntries(files.map((file) => [file, function firefoxFallbackProbe() {}]));
    const executions = [];
    globalThis[fallbackKey] = fallbacks;
    try {
      const result = await content.injectContentBridge({
        webNavigation: {
          getAllFrames: async () => [
            { frameId: 0, parentFrameId: -1, url: "moz-extension://chatclub/chatClub.html" },
            { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
          ]
        },
        scripting: {
          executeScript: async (details) => {
            if (isBrowserDocumentProbe(details)) {
              return browserDocumentProbeResult(details, { officialDocumentId: "" });
            }
            executions.push(details);
            if (details.files) {
              return [{ frameId: 7, error: `Unable to load script: ${details.files[0]}` }];
            }
            return [{ frameId: 7 }];
          }
        }
      }, 31, { hrefs: ["https://example.com/thread"] });
      assert.equal(result.injected, files.length);
      assert.deepEqual(result.injectedFiles, files.map((file) => `${file}@7`));
      assert.deepEqual(result.fallbackFiles, result.injectedFiles);
      assert.deepEqual(result.errors, []);
      assert.equal(result.bindingRelayed, false);
      assert.equal(result.browserDocumentId, LEGACY_BROWSER_DOCUMENT_ID);
      assert.equal(executions.length, files.length * 2);
      for (let index = 0; index < executions.length; index += 2) {
        assert.deepEqual(executions[index].files, [files[index / 2]]);
        assert.equal(executions[index + 1].func, fallbacks[files[index / 2]]);
        assert.equal(executions[index + 1].world, content.CONTENT_BRIDGE_FILES[index / 2].world);
      }
    } finally {
      delete globalThis[fallbackKey];
    }
  }

  {
    const fallbackKey = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";
    const changedFile = content.CONTENT_BRIDGE_FILES[0].file;
    const fallback = function legacyNavigationFallbackMustNotRun() {};
    let probeCalls = 0;
    let fallbackCalls = 0;
    globalThis[fallbackKey] = { [changedFile]: fallback };
    try {
      const result = await content.injectContentBridge({
        webNavigation: {
          getAllFrames: async () => [
            { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
          ]
        },
        scripting: {
          executeScript: async (details) => {
            if (isBrowserDocumentProbe(details)) {
              probeCalls += 1;
              return browserDocumentProbeResult(details, {
                officialDocumentId: "",
                attestation: `legacy:${(probeCalls === 1 ? "2" : "3").repeat(64)}`
              });
            }
            if (details.func === fallback) fallbackCalls += 1;
            return [{ frameId: 7, error: "simulated Firefox packaged-file failure" }];
          }
        }
      }, 31, { hrefs: ["https://example.com/thread"] });
      assert.equal(result.injected, 0);
      assert.equal(fallbackCalls, 0, "a changed legacy document attestation must stop before fallback");
      assert.match(result.errors.join(" | "), /browser document changed from legacy:2{64} to legacy:3{64}/);
    } finally {
      delete globalThis[fallbackKey];
    }
  }

  {
    const fallbackKey = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";
    const changedFile = content.CONTENT_BRIDGE_FILES[0].file;
    const fallback = function officialBfcacheFallbackMustNotRun() {};
    let probeCalls = 0;
    let fallbackCalls = 0;
    globalThis[fallbackKey] = { [changedFile]: fallback };
    try {
      const result = await content.injectContentBridge({
        webNavigation: {
          getAllFrames: async () => [
            { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
          ]
        },
        scripting: {
          executeScript: async (details) => {
            if (isBrowserDocumentProbe(details)) {
              probeCalls += 1;
              return browserDocumentProbeResult(details, {
                officialDocumentId: "browser-document-7",
                attestation: `legacy:${(probeCalls === 1 ? "4" : "5").repeat(64)}`,
                epoch: probeCalls
              });
            }
            if (details.func === fallback) fallbackCalls += 1;
            return [{ frameId: 7, error: "simulated packaged-file failure without result documentId" }];
          }
        }
      }, 31, { hrefs: ["https://example.com/thread"] });
      assert.equal(result.injected, 0);
      assert.equal(fallbackCalls, 0, "changed attestation must fail even when the official pre/post documentId is unchanged");
      assert.match(result.errors.join(" | "), /browser document generation changed/);
    } finally {
      delete globalThis[fallbackKey];
    }
  }

  {
    let actualExecutions = 0;
    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) {
            return browserDocumentProbeResult(details, { officialDocumentId: "", attestation: "" });
          }
          actualExecutions += 1;
          return [{ frameId: 7 }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"] });
    assert.equal(result.injected, 0);
    assert.equal(actualExecutions, 0, "injection must not start without an official or attested browser document identity");
    assert.match(result.errors.join(" | "), /browser document attestation is unavailable/);
  }

  {
    let actualExecutions = 0;
    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          actualExecutions += 1;
          return [{ documentId: "browser-document-7" }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"] });
    assert.equal(result.injected, 0);
    assert.equal(actualExecutions, content.CONTENT_BRIDGE_FILES.length);
    assert.equal(result.errors.length, content.CONTENT_BRIDGE_FILES.length);
    assert.match(result.errors[0], /returned no result for the target frame/);
  }

  {
    const executions = [];
    const challenge = "a".repeat(64);
    const bindingId = "b".repeat(64);
    const frames = [
      { frameId: 0, parentFrameId: -1, url: "moz-extension://chatclub/chatClub.html" },
      { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" },
      { frameId: 8, parentFrameId: 0, url: "https://example.com/thread" }
    ];
    const api = {
      webNavigation: { getAllFrames: async () => frames },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          executions.push(details);
          if (details.files) return [{ frameId: details.target.frameIds[0], documentId: "browser-document-7" }];
          return [{
            frameId: details.target.frameIds[0],
            documentId: "browser-document-7",
            result: { success: true, bridgeDocumentId: "document-7" }
          }];
        }
      }
    };
    const result = await content.injectContentBridge({
      ...api
    }, 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 7,
      expectedBindingId: bindingId,
      bindingChallenge: challenge,
      bindingGeneration: 3
    });
    assert.equal(result.bindingRelayed, true, JSON.stringify(result));
    assert.equal(result.browserDocumentId, "browser-document-7");
    assert.deepEqual(result.frameIds, [7]);
    assert.deepEqual(result.errors, []);
    assert.equal(executions.length, content.CONTENT_BRIDGE_FILES.length + 3);
    assert.ok(executions.every((details) => details.target.frameIds[0] === 7));
    assert.deepEqual(executions[0].args, [bindingId]);
    assert.deepEqual(executions.at(-2).args, [bindingId]);
    const relay = executions.at(-1);
    assert.equal(typeof relay.func, "function");
    assert.equal(relay.world, "ISOLATED");
    assert.deepEqual(relay.args, [challenge, 3, bindingId, "browser-document-7"]);

    executions.length = 0;
    const retried = await content.relayContentFrameBinding(api, 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 7,
      expectedBindingId: bindingId,
      bindingChallenge: challenge,
      bindingGeneration: 4
    });
    assert.deepEqual(retried, { tabId: 31, frameId: 7, browserDocumentId: "browser-document-7", bindingRelayed: true });
    assert.equal(executions.length, 2);
    assert.deepEqual(executions[0].args, [bindingId]);
    assert.deepEqual(executions[1].args, [challenge, 4, bindingId, "browser-document-7"]);
  }

  {
    const bindingId = "7".repeat(64);
    let execution = 0;
    await assert.rejects(
      content.relayContentFrameBinding({
        webNavigation: {
          getAllFrames: async () => [
            { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
          ]
        },
        scripting: {
          executeScript: async (details) => {
            if (isBrowserDocumentProbe(details)) {
              return browserDocumentProbeResult(details, { officialDocumentId: "browser-document-old" });
            }
            execution += 1;
            return [{
              frameId: details.target.frameIds[0],
              documentId: execution === 1 ? "browser-document-old" : "browser-document-new",
              result: { success: true }
            }];
          }
        }
      }, 31, {
        hrefs: ["https://example.com/thread"],
        expectedFrameId: 7,
        expectedBindingId: bindingId,
        browserDocumentId: "browser-document-old",
        bindingChallenge: "6".repeat(64),
        bindingGeneration: 1
      }),
      /browser document changed from browser-document-old to browser-document-new/
    );
    assert.equal(execution, 2, "an exact relay must stop as soon as its browser document changes");
  }

  {
    const bindingId = "c".repeat(64);
    const baseApi = (frames) => ({
      webNavigation: { getAllFrames: async () => frames },
      scripting: {
        executeScript: async () => {
          throw new Error("exact-frame validation must fail before injection");
        }
      }
    });
    const missing = await content.injectContentBridge(baseApi([
      { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" },
      { frameId: 8, parentFrameId: 0, url: "https://example.com/thread" }
    ]), 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 9,
      expectedBindingId: bindingId
    });
    assert.equal(missing.injected, 0);
    assert.match(missing.errors.join(" | "), /not a matching direct child iframe/);

    const mismatched = await content.injectContentBridge(baseApi([
      { frameId: 7, parentFrameId: 0, url: "https://other.example/thread" },
      { frameId: 8, parentFrameId: 0, url: "https://example.com/thread" }
    ]), 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 7,
      expectedBindingId: bindingId
    });
    assert.equal(mismatched.injected, 0);
    assert.match(mismatched.errors.join(" | "), /not a matching direct child iframe/);

    const invalid = await content.injectContentBridge(baseApi([
      { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
    ]), 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 7,
      expectedBindingId: "not-secure"
    });
    assert.equal(invalid.injected, 0);
    assert.match(invalid.errors.join(" | "), /binding identity is invalid/);
  }

  {
    const bindingId = "d".repeat(64);
    const frames = [
      { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" },
      { frameId: 8, parentFrameId: 0, url: "https://example.com/thread" }
    ];
    const executions = [];
    const result = await content.injectContentBridge({
      webNavigation: { getAllFrames: async () => frames },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) {
            const frameId = details.target.frameIds[0];
            return browserDocumentProbeResult(details, { officialDocumentId: `browser-document-${frameId}` });
          }
          executions.push(details);
          const frameId = details.target.frameIds[0];
          const documentId = `browser-document-${frameId}`;
          if (details.files) return [{ frameId, documentId }];
          if (!details.args) {
            return [{ frameId, documentId, result: {
              count: 1,
              bindingId: frameId === 7 ? bindingId : "e".repeat(64)
            } }];
          }
          return [{ frameId, documentId, result: { success: true } }];
        }
      }
    }, 31, {
      hrefs: ["https://example.com/thread"],
      expectedBindingId: bindingId
    });
    assert.deepEqual(result.frameIds, [7]);
    assert.equal(result.injected, content.CONTENT_BRIDGE_FILES.length);
    assert.equal(result.bindingRelayed, false);
    assert.equal(result.browserDocumentId, "browser-document-7");
    assert.deepEqual(result.errors, []);
    assert.equal(executions.length, 2 + 1 + content.CONTENT_BRIDGE_FILES.length);
    assert.deepEqual(executions[2].args, [bindingId]);
    assert.ok(executions.slice(2).every((details) => details.target.frameIds[0] === 7));

    for (const mode of ["duplicate", "missing"]) {
      let calls = 0;
      const failed = await content.injectContentBridge({
        webNavigation: { getAllFrames: async () => frames },
        scripting: {
          executeScript: async (details) => {
            calls += 1;
            const frameId = details.target.frameIds[0];
            if (isBrowserDocumentProbe(details)) {
              calls -= 1;
              return browserDocumentProbeResult(details, { officialDocumentId: `browser-document-${frameId}` });
            }
            return [{ frameId, documentId: `browser-document-${frameId}`, result: {
              count: 1,
              bindingId: mode === "duplicate" ? bindingId : "f".repeat(64)
            } }];
          }
        }
      }, 31, {
        hrefs: ["https://example.com/thread"],
        expectedBindingId: bindingId
      });
      assert.equal(calls, 2);
      assert.equal(failed.injected, 0);
      assert.match(
        failed.errors.join(" | "),
        mode === "duplicate" ? /matched multiple direct child iframes/ : /No direct child iframe matched/
      );
    }
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
    const actionTab = created.shift();
    const actionUrl = new URL(actionTab.url);
    assert.equal(actionUrl.protocol, "chrome-extension:");
    assert.equal(actionUrl.host, "chatclub");
    assert.equal(actionUrl.pathname, "/chatClub.html");
    assert.match(workspaceSession.workspaceSessionIdFromUrl(actionTab.url), /^page-/);
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
