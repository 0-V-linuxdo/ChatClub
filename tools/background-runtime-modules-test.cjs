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
const isContentRuntimeGenerationTransition = (details = {}) =>
  typeof details.func === "function"
  && Array.isArray(details.args)
  && /^__CHATCLUB_RUNTIME_REGISTRY_V\d+(?:_SOURCE_[a-f0-9]{64})?__$/i.test(String(details.args[0] || ""))
  && ["begin", "prepare", "commit", "abort", "failClosed"].includes(details.args[3]);

(async () => {
  const content = await load("background/content-registration.js");
  const registrationsRuntime = await load("background/content-script-registration.js");
  const tabs = await load("background/tab-runtime.js");
  const workspaceSession = await load("shared/workspace-session.js");
  const frameCommands = await load("shared/frame-commands.js");
  const contentBridgeFiles = frameCommands.contentInjectionPlan();

  const target = { id: "example", name: "Example", url: "", hosts: ["example.com", "grok.com"] };
  const registrations = registrationsRuntime.buildContentScriptRegistrations({
    coreTargets: [target],
    preloadTargets: [target],
    summaryTargets: [target],
    sendTargets: [target],
    preferredModelTargets: [target],
    deleteTargets: [target],
    messageNavigatorTargets: [target]
  });
  assert.deepEqual(registrations.map((item) => item.id), [
    "chatclub-preload",
    "chatclub-grok-cookie-bridge",
    "chatclub-content",
    "chatclub-summary-userscripts-main",
    "chatclub-summary-userscripts",
    "chatclub-summary-bridge",
    "chatclub-send",
    "chatclub-preferred-model",
    "chatclub-delete",
    "chatclub-message-navigator"
  ]);
  assert.equal(registrations.find((item) => item.id === "chatclub-preload").world, "MAIN");
  assert.equal(registrations.find((item) => item.id === "chatclub-summary-userscripts-main").world, "MAIN");
  const messageOnlyTarget = { id: "message-only", name: "Message Only", url: "", hosts: ["messages.example"] };
  const messageOnlyRegistrations = registrationsRuntime.buildContentScriptRegistrations({
    coreTargets: [messageOnlyTarget],
    preloadTargets: [messageOnlyTarget],
    messageNavigatorTargets: [messageOnlyTarget]
  });
  assert.deepEqual(messageOnlyRegistrations.map((item) => item.id), [
    "chatclub-preload",
    "chatclub-content",
    "chatclub-message-navigator"
  ], "message-navigator-only hosts must receive the same declared base graph as dynamic repair");
  const wildcardGrokTarget = { id: "grok-wildcard", name: "Grok", url: "", hosts: ["*.grok.com"] };
  const wildcardGrokRegistrations = registrationsRuntime.buildContentScriptRegistrations({
    coreTargets: [wildcardGrokTarget],
    preloadTargets: [wildcardGrokTarget]
  });
  assert.deepEqual(
    wildcardGrokRegistrations.find((item) => item.id === "chatclub-grok-cookie-bridge")?.matches,
    ["http://grok.com/*", "https://grok.com/*"],
    "the static Grok ancillary must not inject into wildcard subdomains"
  );

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
    const brokerKey = "__CHATCLUB_RUNTIME_REGISTRY_V1__";
    const migrationKey = "__CHATCLUB_RUNTIME_MIGRATION_STAGE_V1__";
    const generation = "generation-B";
    const transitionSource = content.transitionInjectedContentRuntimeGeneration.toString();
    const transition = (context, action) => vm.runInContext(
      `(${transitionSource})(${JSON.stringify(brokerKey)}, ${JSON.stringify(migrationKey)}, ${JSON.stringify(generation)}, ${JSON.stringify(action)})`,
      context
    );
    const context = vm.createContext({});
    vm.runInContext(`globalThis[${JSON.stringify(`__CHATCLUB_RUNTIME_REGISTRY_V1_SOURCE_${"a".repeat(64)}__`)}] = ({ shutdown() {} })`, context);
    assert.deepEqual(
      { ...transition(context, "begin") },
      { supported: true, state: "legacy-staged" }
    );
    const descriptor = vm.runInContext(
      `Object.getOwnPropertyDescriptor(globalThis, ${JSON.stringify(migrationKey)})`,
      context
    );
    assert.equal(descriptor.configurable, true, "an aborted injection must be able to clear the migration stage");
    assert.equal(descriptor.writable, false);
    assert.equal(vm.runInContext(`globalThis[${JSON.stringify(migrationKey)}].generation`, context), generation);
    assert.deepEqual(
      { ...transition(context, "abort") },
      { supported: true, state: "legacy-aborted" }
    );
    assert.equal(vm.runInContext(`${JSON.stringify(migrationKey)} in globalThis`, context), false);
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
          if (isContentRuntimeGenerationTransition(details)) {
            const action = details.args[3];
            injected.push(details);
            return [{
              frameId: details.target.frameIds[0],
              documentId: "browser-document-7",
              result: { supported: true, state: action === "commit" ? "active" : action }
            }];
          }
          injected.push(details);
          return [{ frameId: details.target.frameIds[0], documentId: "browser-document-7" }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"], features: ["summary"] });
    assert.deepEqual(result.frameIds, [7]);
    assert.equal(result.injected, 5);
    assert.deepEqual(result.fallbackFiles, []);
    assert.equal(result.bindingRelayed, false);
    assert.equal(result.browserDocumentId, "browser-document-7");
    assert.deepEqual(injected.filter((item) => item.files).map((item) => item.files[0]), [
      "content/preload.js",
      "content/content.js",
      "content/summary-userscripts-main.js",
      "content/summary-userscripts.js",
      "content/summary-bridge.js"
    ]);
    assert.deepEqual(injected.filter(isContentRuntimeGenerationTransition).map((item) => `${item.world}:${item.args[3]}`), [
      "MAIN:begin",
      "ISOLATED:begin",
      "MAIN:prepare",
      "ISOLATED:prepare",
      "MAIN:commit",
      "ISOLATED:commit"
    ], "a uniquely matched repair without an explicit selector must still commit atomically");
    assert.deepEqual(new Set(injected.map((item) => item.target.frameIds[0])), new Set([7]));
  }

  {
    const injected = [];
    const api = {
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 7, parentFrameId: 0, url: "https://grok.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          if (isContentRuntimeGenerationTransition(details)) {
            const action = details.args[3];
            return [{
              frameId: 7,
              documentId: "browser-document-7",
              result: { supported: true, state: action === "commit" ? "active" : action }
            }];
          }
          injected.push(details);
          return [{ frameId: 7, documentId: "browser-document-7" }];
        }
      }
    };
    const result = await content.injectContentBridge(api, 31, { hrefs: ["https://grok.com/thread"] });
    assert.equal(result.injected, 3);
    assert.deepEqual(result.plannedFiles, [
      "content/preload.js",
      "content/grok-cookie-bridge.js",
      "content/content.js"
    ]);
    assert.deepEqual(injected.map((item) => item.files[0]), [
      "content/preload.js",
      "content/grok-cookie-bridge.js",
      "content/content.js"
    ]);
    await assert.rejects(
      content.injectContentBridge(api, 31, { hrefs: ["https://grok.com/thread"], features: ["unknown"] }),
      /unsupported (?:content )?capabilities:?\s*unknown/i
    );
  }

  {
    let frameSnapshot = 0;
    const injectedFiles = [];
    const redirectedApi = {
      webNavigation: {
        getAllFrames: async () => {
          frameSnapshot += 1;
          return frameSnapshot === 1
            ? [{ frameId: 7, parentFrameId: 0, url: "https://grok.com/thread", documentId: "browser-document-old" }]
            : [{ frameId: 7, parentFrameId: 0, url: "https://example.com/thread", documentId: "browser-document-new" }];
        }
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) {
            return browserDocumentProbeResult(details, { officialDocumentId: "browser-document-new" });
          }
          if (isContentRuntimeGenerationTransition(details)) {
            const action = details.args[3];
            return [{
              frameId: 7,
              documentId: "browser-document-new",
              result: { supported: true, state: action === "commit" ? "active" : action }
            }];
          }
          injectedFiles.push(details.files[0]);
          return [{ frameId: 7, documentId: "browser-document-new" }];
        }
      }
    };
    const redirected = await content.injectContentBridge(redirectedApi, 31, {
      hrefs: ["https://grok.com/thread", "https://example.com/thread"]
    });
    assert.deepEqual(redirected.errors, []);
    assert.equal(redirected.browserDocumentId, "browser-document-new");
    assert.deepEqual(redirected.plannedFiles, ["content/preload.js", "content/content.js"]);
    assert.deepEqual(injectedFiles, redirected.plannedFiles, "repair plan must use the revalidated current frame URL");

    frameSnapshot = 0;
    injectedFiles.length = 0;
    const staleHint = await content.injectContentBridge(redirectedApi, 31, {
      hrefs: ["https://grok.com/thread"]
    });
    assert.equal(staleHint.injected, 0);
    assert.match(staleHint.errors.join(" | "), /no longer matches the requested target/);
    assert.deepEqual(injectedFiles, [], "a redirected frame must fail before any runtime bundle is injected");
  }

  {
    let getAllFramesCalls = 0;
    let releaseFirstFile;
    let reportFirstFile;
    let firstFileBlocked = false;
    const firstFileStarted = new Promise((resolve) => { reportFirstFile = resolve; });
    const firstFileRelease = new Promise((resolve) => { releaseFirstFile = resolve; });
    const injectedFiles = [];
    const api = {
      webNavigation: {
        getAllFrames: async () => {
          getAllFramesCalls += 1;
          return [{ frameId: 7, parentFrameId: 0, url: "https://example.com/thread", documentId: "browser-document-7" }];
        }
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) {
            return browserDocumentProbeResult(details, { officialDocumentId: "browser-document-7" });
          }
          if (isContentRuntimeGenerationTransition(details)) {
            const action = details.args[3];
            return [{
              frameId: 7,
              documentId: "browser-document-7",
              result: { supported: true, state: action === "commit" ? "active" : action }
            }];
          }
          injectedFiles.push(details.files[0]);
          if (!firstFileBlocked) {
            firstFileBlocked = true;
            reportFirstFile();
            await firstFileRelease;
          }
          return [{ frameId: 7, documentId: "browser-document-7" }];
        }
      }
    };
    const sendRun = content.injectContentBridge(api, 31, {
      hrefs: ["https://example.com/thread"],
      features: ["send"]
    });
    await firstFileStarted;
    const summaryRun = content.injectContentBridge(api, 31, {
      hrefs: ["https://example.com/thread"],
      features: ["summary"]
    });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    assert.equal(getAllFramesCalls, 2, "a second feature signature must wait behind the active tab transaction");
    releaseFirstFile();
    const [sendResult, summaryResult] = await Promise.all([sendRun, summaryRun]);
    assert.deepEqual(sendResult.errors, []);
    assert.deepEqual(summaryResult.errors, []);
    assert.deepEqual(injectedFiles, [
      "content/preload.js",
      "content/content.js",
      "content/send.js",
      "content/preload.js",
      "content/content.js",
      "content/summary-userscripts-main.js",
      "content/summary-userscripts.js",
      "content/summary-bridge.js"
    ], "different capability transactions must never interleave generation entries");
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
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          if (isContentRuntimeGenerationTransition(details)) {
            const action = details.args[3];
            return [{
              frameId: details.target.frameIds[0],
              documentId: "browser-document-7",
              result: { supported: true, state: action === "commit" ? "active" : action }
            }];
          }
          return [{
            frameId: details.target.frameIds[0],
            documentId: "browser-document-7",
            error: `Unable to load script: ${details.files[0]}`
          }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"] });
    assert.equal(result.injected, 0);
    assert.deepEqual(result.injectedFiles, []);
    assert.deepEqual(result.fallbackFiles, []);
    assert.equal(result.bindingRelayed, false);
    assert.equal(result.errors.length, 1, "a failed file must stop the generation before later files run");
    assert.match(result.errors[0], /content\/preload\.js@7: Unable to load script/);
  }

  {
    let probeCalls = 0;
    let transitionExecutions = 0;
    let fileExecutions = 0;
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
          if (isContentRuntimeGenerationTransition(details)) {
            transitionExecutions += 1;
            const action = details.args[3];
            return [{
              frameId: 7,
              result: { supported: true, state: action === "commit" ? "active" : action }
            }];
          }
          fileExecutions += 1;
          return [{ frameId: 7 }];
        }
      }
    }, 31, { hrefs: ["https://example.com/thread"] });
    assert.equal(result.injected, 0);
    assert.equal(transitionExecutions, 1);
    assert.equal(fileExecutions, 0, "a generation-begin document mismatch must fail before injecting any bundle");
    assert.match(result.errors.join(" | "), /browser document changed from legacy:6{64} to legacy:7{64}/);
  }

  {
    const fallbackKey = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";
    const bindingId = "9".repeat(64);
    const challenge = "8".repeat(64);
    const changedFile = contentBridgeFiles[1].file;
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
              if (!isContentRuntimeGenerationTransition(details) && Array.isArray(details.args) && details.args.length === 4) {
                relayCalls += 1;
              }
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
    const files = contentBridgeFiles.map((spec) => spec.file);
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
            if (isContentRuntimeGenerationTransition(details)) {
              const action = details.args[3];
              return [{
                frameId: 7,
                result: { supported: true, state: action === "commit" ? "active" : action }
              }];
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
        assert.equal(executions[index + 1].world, contentBridgeFiles[index / 2].world);
      }
    } finally {
      delete globalThis[fallbackKey];
    }
  }

  {
    const fallbackKey = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";
    const changedFile = contentBridgeFiles[0].file;
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
    const changedFile = contentBridgeFiles[0].file;
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
    assert.equal(actualExecutions, 1, "a malformed injection result must stop the generation immediately");
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /returned no result for the target frame/);
  }

  {
    const bindingId = "4".repeat(64);
    const transitionActions = [];
    const realmState = new Map([
      ["MAIN", { active: "generation-A", pending: "" }],
      ["ISOLATED", { active: "generation-A", pending: "" }]
    ]);
    let fileExecutions = 0;
    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          const frameId = details.target.frameIds[0];
          const documentId = "browser-document-7";
          if (isContentRuntimeGenerationTransition(details)) {
            const generation = details.args[2];
            const action = details.args[3];
            const state = realmState.get(details.world);
            transitionActions.push(`${details.world}:${action}`);
            if (action === "begin") state.pending = generation;
            if (action === "prepare") assert.equal(state.pending, generation);
            if (action === "commit") {
              assert.equal(state.pending, generation);
              state.active = generation;
              state.pending = "";
            }
            if (action === "abort") state.pending = "";
            return [{ frameId, documentId, result: { supported: true, state: action } }];
          }
          if (details.files) {
            fileExecutions += 1;
            return [{
              frameId,
              documentId,
              ...(fileExecutions === 2 ? { error: "simulated partial generation injection failure" } : {})
            }];
          }
          return [{ frameId, documentId, result: { success: true } }];
        }
      }
    }, 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 7,
      expectedBindingId: bindingId
    });
    assert.equal(result.injected, 1);
    assert.equal(fileExecutions, 2, "later generation files must not run after the first failed file");
    assert.deepEqual(transitionActions, [
      "MAIN:begin",
      "ISOLATED:begin",
      "MAIN:abort",
      "ISOLATED:abort"
    ]);
    assert.deepEqual(
      [...realmState.values()].map(({ active, pending }) => ({ active, pending })),
      [
        { active: "generation-A", pending: "" },
        { active: "generation-A", pending: "" }
      ],
      "a partial B injection into a preserved iframe must abort B without replacing active A in either world"
    );
    assert.match(result.errors.join(" | "), /simulated partial generation injection failure/);
  }

  {
    const bindingId = "5".repeat(64);
    const transitionActions = [];
    const realmState = new Map([
      ["MAIN", { active: "generation-A", pending: "" }],
      ["ISOLATED", { active: "generation-A", pending: "" }]
    ]);
    const result = await content.injectContentBridge({
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 7, parentFrameId: 0, url: "https://example.com/thread" }
        ]
      },
      scripting: {
        executeScript: async (details) => {
          if (isBrowserDocumentProbe(details)) return browserDocumentProbeResult(details);
          const frameId = details.target.frameIds[0];
          const documentId = "browser-document-7";
          if (isContentRuntimeGenerationTransition(details)) {
            const generation = details.args[2];
            const action = details.args[3];
            const state = realmState.get(details.world);
            transitionActions.push(`${details.world}:${action}`);
            if (action === "begin") state.pending = generation;
            if (action === "prepare") assert.equal(state.pending, generation);
            if (action === "commit" && details.world === "ISOLATED") {
              throw new Error("simulated isolated-world activation failure");
            }
            if (action === "commit") {
              state.active = generation;
              state.pending = "";
              return [{ frameId, documentId, result: { supported: true, state: "active" } }];
            }
            if (action === "failClosed") {
              state.active = "";
              state.pending = "";
            }
            return [{ frameId, documentId, result: { supported: true, state: action } }];
          }
          if (details.files) return [{ frameId, documentId }];
          return [{ frameId, documentId, result: { success: true } }];
        }
      }
    }, 31, {
      hrefs: ["https://example.com/thread"],
      expectedFrameId: 7,
      expectedBindingId: bindingId
    });
    assert.equal(result.injected, contentBridgeFiles.length);
    assert.deepEqual(transitionActions, [
      "MAIN:begin",
      "ISOLATED:begin",
      "MAIN:prepare",
      "ISOLATED:prepare",
      "MAIN:commit",
      "ISOLATED:commit",
      "MAIN:failClosed",
      "ISOLATED:failClosed"
    ]);
    assert.deepEqual(
      [...realmState.values()].map(({ active, pending }) => ({ active, pending })),
      [
        { active: "", pending: "" },
        { active: "", pending: "" }
      ],
      "if the second world cannot commit, both worlds must fail closed instead of retaining a mixed A/B runtime"
    );
    assert.match(result.errors.join(" | "), /simulated isolated-world activation failure/);
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
    const bridgeExecutions = executions.filter((details) => !isContentRuntimeGenerationTransition(details));
    assert.equal(bridgeExecutions.length, contentBridgeFiles.length + 3);
    assert.ok(executions.every((details) => details.target.frameIds[0] === 7));
    assert.deepEqual(bridgeExecutions[0].args, [bindingId]);
    assert.deepEqual(bridgeExecutions.at(-2).args, [bindingId]);
    const relay = bridgeExecutions.at(-1);
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
    assert.equal(result.injected, contentBridgeFiles.length);
    assert.equal(result.bindingRelayed, false);
    assert.equal(result.browserDocumentId, "browser-document-7");
    assert.deepEqual(result.errors, []);
    const bridgeExecutions = executions.filter((details) => !isContentRuntimeGenerationTransition(details));
    assert.equal(bridgeExecutions.length, 2 + 1 + contentBridgeFiles.length);
    assert.deepEqual(bridgeExecutions[2].args, [bindingId]);
    assert.ok(bridgeExecutions.slice(2).every((details) => details.target.frameIds[0] === 7));

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
      await registrationsRuntime.reconcileContentScripts(api, [desired]);
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
