#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const main = `${read("app/main.js")}\n${read("app/runtime.js")}`;
const frameBridge = read("app/frame-bridge/controller.js");
const preferredModel = read("app/preferred-model/controller.js");
const preferredModelBridgePreparation = read("app/preferred-model/bridge-preparation.js");
const workspace = [
  "app/workspace/controller.js",
  "app/workspace/frame-controller.js"
].map(read).join("\n");
const summary = read("app/summary/controller.js");
const background = [
  "background/service-worker.js",
  "background/runtime.js",
  "background/frame-relay.js",
  "background/content-script-registration.js",
  "background/content-registration.js"
].map(read).join("\n");
const content = read("content-src/content.js");
const summaryCapability = read("content-src/capabilities/summary-runtime.js");
const summaryRuntime = read("content-src/shared/summary-runtime.js");
const summaryMain = read("content-src/summary-userscripts-main.js");

const runtimeIdentity = (outputPath) => ({
  implementationVersion: "runtime-current",
  bundle: { outputPath }
});
const grokCookieRuntimeAttestation = (version = "grok-cookie-current", outputPath = "content/grok-cookie-bridge.js") => ({
  version,
  runtimeIdentity: runtimeIdentity(outputPath)
});

const { functionSource } = require("./function-source.cjs");

function createVerifiedRegistrationFixture(options = {}) {
  const frameBindingId = "f".repeat(64);
  const iframe = {
    isConnected: options.isConnected ?? true,
    dataset: {
      preferredModelDocumentId: "bridge-document-current",
      frameBindingId,
      ...(options.dataset || {})
    }
  };
  const registration = options.registration === null
    ? null
    : {
        bridgeVersion: "bridge-current",
        frameId: 80,
        frameBindingId,
        browserDocumentId: "browser-document-current",
        href: "https://example.com/chat/current",
        runtimeIdentity: runtimeIdentity("content/content.js"),
        ...(options.registration || {})
      };
  const context = vm.createContext({
    CONTENT_BRIDGE_VERSION: "bridge-current",
    CONTENT_BUNDLES: {
      grokCookie: {
        file: "content/grok-cookie-bridge.js",
        hosts: ["grok.com", "gk.dairoot.cn"]
      }
    },
    GROK_COOKIE_RUNTIME_IDENTITY: {
      bundle: { implementationVersion: "grok-cookie-current" }
    },
    Number,
    String,
    URL,
    contentRuntimePackageBundleIdentityMatches: (value, expectedOutputPath) => (
      value?.bundle?.outputPath === expectedOutputPath
    ),
    iframe,
    verifyContentFrameRegistration: options.verifyContentFrameRegistration || (async () => registration)
  });
  vm.runInContext(`
    ${functionSource(frameBridge, "exactGrokCookieRuntimeHost")}
    ${functionSource(frameBridge, "grokCookieRuntimeReady")}
    ${functionSource(frameBridge, "verifiedCurrentContentFrameRegistration")}
    globalThis.verifyCurrent = verifiedCurrentContentFrameRegistration;
  `, context);
  return { context, iframe, registration };
}

function createApplyFixture(options = {}) {
  const calls = { verify: 0, prepare: 0, send: 0, cancel: 0 };
  let current = true;
  const registrations = [...(options.registrations || [])];
  const preparedResults = [...(options.preparedResults || [])];
  let resolvePreparation = null;
  let rejectPreparation = null;
  const sharedPreparation = options.hangingPreparation
    ? new Promise((resolve, reject) => {
        resolvePreparation = resolve;
        rejectPreparation = reject;
      })
    : null;
  const controller = new AbortController();
  const context = vm.createContext({
    Error,
    String,
    clearTimeout,
    setTimeout,
    calls,
    iframe: { isConnected: true, contentWindow: {} },
    record: {
      payload: { appId: "Gemini", modelId: "pro" },
      runId: "run-1",
      bridgeRecoveryAttempts: Math.max(0, Number(options.bridgeRecoveryAttempts) || 0),
      controller
    }
  });
  context.verifiedCurrentContentFrameRegistration = async () => {
    calls.verify += 1;
    return registrations.length ? registrations.shift() : null;
  };
  context.prepareContentFrameRuntime = async (_iframe, prepareOptions) => {
    calls.prepare += 1;
    context.preparationOptions = prepareOptions;
    if (options.supersedeDuringPrepare) current = false;
    if (sharedPreparation) return sharedPreparation;
    return preparedResults.length ? preparedResults.shift() : (options.prepared || { ok: true });
  };
  context.preferredModelRecordIsCurrent = () => current;
  context.preferredModelContentRuntimeReady = options.runtimeReady || (() => true);
  context.sendToContentFrame = async (_iframe, _command, data, requestOptions) => {
    calls.send += 1;
    context.lastSendOptions = { ...requestOptions };
    if (options.sendError) throw options.sendError;
    return {
      ok: true,
      appId: data.appId,
      modelId: data.modelId,
      runId: data.runId
    };
  };
  context.requestPreferredModelCancellation = () => { calls.cancel += 1; };
  vm.runInContext(`
    const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;
    const NOTION_ALL_SOURCES_APPLY_TIMEOUT_MS = 48000;
    const PREFERRED_MODEL_PRE_DELIVERY_RETRY_CODES = Object.freeze([
      "NOT_REGISTERED",
      "STALE_DOCUMENT",
      "INJECTION_FAILED"
    ]);
    const PREFERRED_MODEL_BRIDGE_PREPARATION_TIMEOUT_MS = ${Math.max(
      1,
      Number(options.bridgePreparationTimeoutMs) || 50
    )};
    ${functionSource(preferredModel, "preferredModelResult")}
    ${functionSource(preferredModel, "preferredModelApplyTimeoutMs")}
    ${functionSource(preferredModel, "preferredModelAttemptPayload")}
    ${functionSource(preferredModel, "preferredModelRetryDelay")}
    ${functionSource(preferredModelBridgePreparation, "waitForPreferredModelBridgePreparation")}
    ${functionSource(preferredModel, "applyPreferredModelToFrame", true)}
    globalThis.apply = applyPreferredModelToFrame;
    globalThis.retryDelay = preferredModelRetryDelay;
  `, context);
  context.abort = (reason = "test abort") => controller.abort(reason);
  context.resolvePreparation = (result = { ok: true }) => resolvePreparation?.(result);
  context.rejectPreparation = (error = new Error("late preparation rejection")) => rejectPreparation?.(error);
  return context;
}

function createSummaryPrepareFixture(options = {}) {
  const calls = { verify: 0, wait: 0, install: 0, probe: 0, remember: 0 };
  const installResults = [...(options.installResults || [])];
  const registration = {
    browserDocumentId: options.registration?.browserDocumentId ?? "browser-document-9",
    documentId: "doc-current",
    bridgeVersion: "bridge-current",
    href: options.registration?.href ?? "https://example.com/chat/current",
    runtimeIdentity: runtimeIdentity("content/content.js"),
    ...(options.registration || {})
  };
  const confirmedRegistration = options.confirmedRegistration === undefined
    ? registration
    : (options.confirmedRegistration
      ? { ...registration, ...options.confirmedRegistration }
      : options.confirmedRegistration);
  const iframe = {
    isConnected: true,
    dataset: {
      browserFrameId: "9",
      frameBindingId: "f".repeat(64),
      ...(options.dataset || {})
    }
  };
  const context = vm.createContext({
    Boolean,
    Error,
    Number,
    Set,
    String,
    URL,
    CONTENT_BRIDGE_VERSION: "bridge-current",
    CONTENT_RUNTIME_IDENTITY: { implementationVersion: "runtime-current" },
    GROK_COOKIE_RUNTIME_IDENTITY: {
      bundle: { implementationVersion: "grok-cookie-current" }
    },
    frameBindingRelayErrors: new WeakMap(),
    calls,
    injectionClock: 0,
    challengeIssues: [],
    frameBindingChallenges: {
      issue: (_iframe, issueOptions = {}) => {
        const entry = {
          challenge: "a".repeat(64),
          generation: context.challengeIssues.length + 1,
          issuedAt: context.injectionClock,
          expiresAt: context.injectionClock + 8000,
          options: { ...issueOptions }
        };
        context.challengeIssues.push(entry);
        return entry;
      }
    },
    iframe
  });
  context.verifiedCurrentContentFrameRegistration = async () => {
    calls.verify += 1;
    return calls.verify === 1 ? (options.initialRegistration || null) : confirmedRegistration;
  };
  context.currentExtensionTabId = async () => 7;
  context.contentFrameHrefHints = () => options.hrefs || ["https://example.com/chat/current"];
  context.contentFramePreparationError = (result) => (result?.errors || []).join("; ");
  context.runtimeRequest = async (request) => {
    calls.install += 1;
    context.lastRuntimeRequest = request;
    if (options.installBarrier) await options.installBarrier;
    context.injectionStartedAt = context.injectionClock;
    context.injectionClock += Math.max(0, Number(options.injectionDelayMs) || 0);
    context.injectionFinishedAt = context.injectionClock;
    const attempt = installResults.length ? installResults.shift() : {};
    return {
      errors: options.installErrors || [],
      injected: options.injected ?? 5,
      ...(options.omitInjectedFiles ? {} : {
        injectedFiles: options.injectedFiles ?? [
          "content/preload.js@9",
          "content/content.js@9",
          "content/summary-userscripts-main.js@9",
          "content/summary-userscripts.js@9",
          "content/summary-bridge.js@9"
        ]
      }),
      features: options.installedFeatures ?? request.features,
      plannedFiles: options.plannedFiles ?? [
        "content/preload.js",
        "content/content.js",
        "content/summary-userscripts-main.js",
        "content/summary-userscripts.js",
        "content/summary-bridge.js"
      ],
      ...(options.omitBrowserDocumentId ? {} : {
        browserDocumentId: options.installedBrowserDocumentId ?? "browser-document-9"
      }),
      ...attempt
    };
  };
  context.requestFrameBinding = (target, bindingOptions = {}) => {
    context.bindingRequests = (context.bindingRequests || 0) + 1;
    context.lastBindingTarget = target;
    context.lastBindingRequestOptions = { ...bindingOptions };
    context.frameBindingChallenges.issue(target, { rotate: bindingOptions.rotate === true });
    const result = Object.hasOwn(options, "bindingRequestResult")
      ? options.bindingRequestResult
      : true;
    if (result === true) context.frameBindingRelayErrors.delete(target);
    else context.frameBindingRelayErrors.set(target, "secure frame binding relay was not accepted");
    return Promise.resolve(result);
  };
  context.waitForCurrentContentFrameRegistration = async () => {
    calls.wait += 1;
    return Object.hasOwn(options, "waitRegistration")
      ? options.waitRegistration
      : registration;
  };
  context.contentRuntimePackageBundleIdentityMatches = (value, expectedOutputPath) => (
    value?.bundle?.outputPath === expectedOutputPath
  );
  context.CONTENT_BUNDLES = {
    grokCookie: {
      file: "content/grok-cookie-bridge.js",
      hosts: ["grok.com", "gk.dairoot.cn"]
    }
  };
  context.contentInjectionPlan = ({ features = [], frameUrls = [], frameHost = "" } = {}) => {
    const grok = ["grok.com", "gk.dairoot.cn"].includes(frameHost)
      || frameUrls.some((href) => (
        String(href).startsWith("https://grok.com/")
        || String(href).startsWith("https://gk.dairoot.cn/")
      ));
    const files = [
      "content/preload.js",
      ...(grok ? ["content/grok-cookie-bridge.js"] : []),
      "content/content.js",
      ...(features.includes("summary") ? [
        "content/summary-userscripts-main.js",
        "content/summary-userscripts.js",
        "content/summary-bridge.js"
      ] : [])
    ];
    return files.map((file) => ({ file }));
  };
  context.runtimePort = () => ({ request: async (_iframe, action) => {
    calls.probe += 1;
    assert.equal(action, "getSummaryRuntimeState");
    if (options.probeError) throw options.probeError;
    return {
      ready: true,
      mainReady: true,
      isolatedReady: true,
      documentId: registration.documentId,
      bridgeVersion: "bridge-current",
      runtimeIdentity: runtimeIdentity("content/summary-bridge.js"),
      mainRuntimeIdentity: runtimeIdentity("content/summary-userscripts-main.js"),
      isolatedRuntimeIdentity: runtimeIdentity("content/summary-userscripts.js"),
      ...(options.summaryState || {})
    };
  }});
  context.workspaceController = () => ({
    frameApp: () => ({ url: "https://example.com/" }),
    rememberFrameLocation: (_iframe, currentRegistration) => {
      calls.remember += 1;
      context.rememberedRegistration = currentRegistration;
    }
  });
  vm.runInContext(`
    ${functionSource(frameBridge, "exactGrokCookieRuntimeHost")}
    ${functionSource(frameBridge, "grokCookieRuntimeReady")}
    ${functionSource(frameBridge, "mergedContentRuntimeCapabilities")}
    ${functionSource(frameBridge, "framePreparationGeneration")}
    ${functionSource(frameBridge, "framePreparationIsCurrent")}
    ${functionSource(frameBridge, "cancelledFramePreparation")}
    ${functionSource(frameBridge, "prepareContentFrameRuntimeUncached", true)}
    globalThis.prepare = prepareContentFrameRuntimeUncached;
  `, context);
  return context;
}

function createSummaryMainInstallFixture() {
  const entries = new Map();
  const listeners = new Set();
  const window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    },
    postMessage() {}
  };
  const runtimes = {
    registerBundle(identity) { return identity; },
    register(name, descriptor) {
      const previous = entries.get(name);
      if (previous?.version === descriptor.version) return previous.api;
      const entry = { ...descriptor };
      entries.set(name, entry);
      entry.activate?.();
      return entry.api;
    },
    require(name, version) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`${name} is unavailable`);
      if (version != null && entry.version !== version) throw new Error(`${name} has the wrong version`);
      return entry.api;
    },
    registration(name) {
      const entry = entries.get(name);
      return entry ? { version: entry.version, api: entry.api } : null;
    }
  };
  const context = vm.createContext({
    CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY: runtimeIdentity("content/summary-userscripts-main.js"),
    CONTENT_PROTOCOL: {
      CONTENT_BRIDGE_VERSION: "bridge-current",
      CUSTOM_SUMMARY_EXECUTOR: "__fixtureSummaryExecutor__",
      PAGE_SUMMARY_SOURCE: "fixture-summary-page"
    },
    createContentRuntimeBundleIdentity: () => runtimeIdentity("content/summary-userscripts-main.js"),
    createSummaryRunnerRegistry: () => Object.freeze({ fixture: () => [] }),
    runtimeRegistry: () => runtimes,
    summaryRuntime: {},
    window
  });
  vm.runInContext(`
    ${functionSource(summaryMain, "installSummaryMainRuntime")}
    globalThis.install = installSummaryMainRuntime;
  `, context);
  return { context, entries, listeners, window };
}

async function createPreservedRuntimeReloadFixture() {
  const [
    { createFrameBridgeController },
    { FrameRuntimePort },
    { contentInjectionPlan },
    { contentRuntimeIdentityForBundle },
    { CONTENT_BRIDGE_VERSION, EXTENSION_RUNTIME_RELAY_SOURCE }
  ] = await Promise.all([
    import("../app/frame-bridge/controller.js"),
    import("../shared/frame-rpc.js"),
    import("../shared/frame-commands.js"),
    import("../shared/content-runtime-package-identity.js"),
    import("../shared/protocol.js")
  ]);
  const tabId = 31;
  const frameId = 7;
  const frameBindingId = "b".repeat(64);
  const browserDocumentId = "browser-document-preserved";
  const bridgeDocumentId = "bridge-document-preserved";
  const href = "https://claude.ai/chat/preserved-thread";
  const contentRuntimeIdentity = contentRuntimeIdentityForBundle("content/content.js");
  const summaryRuntimeIdentity = contentRuntimeIdentityForBundle("content/summary-bridge.js");
  const summaryMainRuntimeIdentity = contentRuntimeIdentityForBundle("content/summary-userscripts-main.js");
  const summaryIsolatedRuntimeIdentity = contentRuntimeIdentityForBundle("content/summary-userscripts.js");
  const relayRequests = [];
  const ensureRequests = [];
  const frameCommands = [];
  let registeredInCurrentBackground = false;
  let src = href;
  let srcAssignments = 0;
  const contentWindow = Object.freeze({ preserved: true });
  const iframe = {
    isConnected: true,
    contentWindow,
    dataset: {
      browserFrameId: String(frameId),
      frameBindingId,
      currentHref: href,
      preferredModelDocumentId: bridgeDocumentId,
      preferredModelContentBridgeVersion: CONTENT_BRIDGE_VERSION,
      preferredModelContentRuntimeImplementation: contentRuntimeIdentity.implementationVersion,
      injectedBrowserDocumentId: browserDocumentId
    },
    getAttribute(name) {
      return name === "src" ? src : null;
    }
  };
  Object.defineProperty(iframe, "src", {
    configurable: false,
    enumerable: true,
    get: () => src,
    set(value) {
      srcAssignments += 1;
      src = String(value || "");
    }
  });
  const registration = () => ({
    href,
    title: "Preserved thread",
    bridgeVersion: CONTENT_BRIDGE_VERSION,
    runtimeIdentity: contentRuntimeIdentity,
    frameId,
    frameBindingId,
    browserDocumentId
  });

  let activeGeneration = null;
  function createRuntimeGeneration(label) {
    const listeners = new Set();
    const runtime = {
      id: "chatclub-runtime-reload-test",
      lastError: null,
      getURL(pathname = "") {
        return `chrome-extension://chatclub-runtime-reload-test/${String(pathname).replace(/^\/+/, "")}`;
      },
      onMessage: {
        addListener(listener) { listeners.add(listener); },
        removeListener(listener) { listeners.delete(listener); }
      },
      sendMessage(message, callback) {
        Promise.resolve()
          .then(() => backgroundRequest(message, generation))
          .then(
            (response) => callback(response),
            (error) => {
              runtime.lastError = { message: error?.message || String(error) };
              try { callback(undefined); }
              finally { runtime.lastError = null; }
            }
          );
      }
    };
    const generation = {
      label,
      listeners,
      api: {
        runtime,
        tabs: {
          getCurrent(callback) { callback({ id: tabId }); }
        }
      }
    };
    return generation;
  }

  async function dispatchFrameBinding(generation, request) {
    if (!generation.listeners.size) {
      throw new Error(`Extension page listener is unavailable in runtime ${generation.label}`);
    }
    const message = {
      source: EXTENSION_RUNTIME_RELAY_SOURCE,
      action: "frameBinding",
      challenge: request.bindingChallenge,
      generation: request.bindingGeneration,
      senderContext: {
        tabId,
        frameId,
        documentId: browserDocumentId,
        bridgeDocumentId,
        frameBindingId,
        url: href
      },
      data: {
        documentId: bridgeDocumentId,
        browserDocumentId,
        frameBindingId,
        bridgeVersion: CONTENT_BRIDGE_VERSION,
        runtimeIdentity: contentRuntimeIdentity
      }
    };
    for (const listener of generation.listeners) listener(message, {});
    await new Promise((resolve) => { setImmediate(resolve); });
  }

  async function backgroundRequest(message, generation) {
    assert.equal(generation, activeGeneration, "preserved page requests must use the current extension runtime");
    if (message.action === "ensureContentBridge") {
      ensureRequests.push({ ...message });
      const plannedFiles = contentInjectionPlan({ features: message.features }).map(({ file }) => file);
      return {
        success: true,
        tabId,
        frameIds: [frameId],
        injected: plannedFiles.length,
        injectedFiles: plannedFiles.map((file) => `${file}@${frameId}`),
        fallbackFiles: [],
        plannedFiles,
        browserDocumentId,
        bindingRelayed: false,
        features: [...message.features],
        errors: []
      };
    }
    if (message.action === "requestFrameBinding") {
      relayRequests.push({ ...message });
      registeredInCurrentBackground = true;
      await dispatchFrameBinding(generation, message);
      return { success: true, tabId, frameId, browserDocumentId, bindingRelayed: true };
    }
    if (message.action === "verifyFrameContext") {
      return registeredInCurrentBackground
        ? { success: true, data: registration() }
        : { success: false, error: "preserved iframe is not registered in the reloaded background" };
    }
    if (message.action === "sendFrameCommand") {
      frameCommands.push({ command: message.command, bridgeDocumentId: message.bridgeDocumentId });
      if (message.command === "getSummaryRuntimeState") {
        return {
          success: true,
          data: {
            ready: true,
            mainReady: true,
            isolatedReady: true,
            documentId: bridgeDocumentId,
            bridgeVersion: CONTENT_BRIDGE_VERSION,
            runtimeIdentity: summaryRuntimeIdentity,
            mainRuntimeIdentity: summaryMainRuntimeIdentity,
            isolatedRuntimeIdentity: summaryIsolatedRuntimeIdentity
          }
        };
      }
      return { success: true, data: { ok: true, command: message.command } };
    }
    throw new Error(`Unexpected background request: ${message.action}`);
  }

  const runtimeA = createRuntimeGeneration("A");
  const runtimeB = createRuntimeGeneration("B");
  activeGeneration = runtimeA;
  const workspace = {
    currentFrames: () => [iframe],
    ensureFrameAttributeContract: () => false,
    frameApp: () => ({ id: "Claude", url: href }),
    iframeForWindow: (value) => value === contentWindow ? iframe : null,
    reapplyMessageNavigatorForFrame: async () => {},
    refreshCurrentExtensionTabInfo: () => {},
    rememberFrameLocation: () => {},
    syncFrameFavicon: async () => {}
  };
  let port = null;
  const controller = createFrameBridgeController({
    framePort: () => port,
    workspace: () => workspace,
    schedulePreferredModelApply: () => {},
    invalidatePreferredModelFrame: () => {},
    preferredModelFrameIsLoading: () => false,
    handleShortcutAction: async () => {}
  });
  port = new FrameRuntimePort({
    ensureRuntime: (target, options = {}) => controller.prepareContentFrameRuntime(target, {
      features: options.features || [],
      summary: (options.features || []).includes("summary")
    })
  });
  return {
    controller,
    iframe,
    contentWindow,
    port,
    runtimeA,
    runtimeB,
    relayRequests,
    ensureRequests,
    frameCommands,
    activate(generation) {
      activeGeneration = generation;
      globalThis.chrome = generation.api;
    },
    srcAssignments: () => srcAssignments
  };
}

(async () => {
  {
    const match = preferredModelBridgePreparation.match(
      /const PREFERRED_MODEL_BRIDGE_PREPARATION_TIMEOUT_MS = ([\d_]+);/
    );
    const timeoutMs = Number(String(match?.[1] || "0").replaceAll("_", ""));
    assert.ok(
      timeoutMs >= 13000,
      "the preferred-model waiter must cover the accepted 8s injection queue, registration, and readiness budgets"
    );
  }

  {
    const readinessContext = vm.createContext({ String });
    vm.runInContext(`
      ${functionSource(preferredModel, "preferredModelContentRuntimeReady")}
      globalThis.ready = preferredModelContentRuntimeReady;
    `, readinessContext);
    const iframe = {
      dataset: {
        contentRuntimeCapabilitiesDocumentId: "document-current",
        contentRuntimeCapabilities: "send,preferred-model"
      }
    };
    assert.equal(readinessContext.ready(iframe, { documentId: "document-current" }), true);
    assert.equal(readinessContext.ready(iframe, { documentId: "document-old" }), false);
    iframe.dataset.contentRuntimeCapabilities = "send";
    assert.equal(readinessContext.ready(iframe, { documentId: "document-current" }), false);
  }

  {
    const [{ FrameRuntimePort }, { CONTENT_RUNTIME_IDENTITY }] = await Promise.all([
      import("../shared/frame-rpc.js"),
      import("../shared/content-runtime-identity.js")
    ]);
    let ensureCalls = 0;
    const iframe = {
      isConnected: true,
      dataset: {
        preferredModelDocumentId: "document-current",
        preferredModelContentRuntimeImplementation: CONTENT_RUNTIME_IDENTITY.implementationVersion,
        contentRuntimeCapabilitiesDocumentId: "document-current",
        contentRuntimeCapabilities: "preferred-model"
      }
    };
    const port = new FrameRuntimePort({
      ensureRuntime: () => {
        ensureCalls += 1;
        return new Promise(() => {});
      },
      currentTabId: async () => 7,
      requestBackground: async () => ({ success: true, data: { ok: true } })
    });
    assert.deepEqual(
      await port.request(
        iframe,
        "applyPreferredModel",
        { appId: "NotionAI", modelId: "fable5", runId: "run-current" },
        { expectedDocumentId: "document-current", skipEnsure: true, timeoutMs: 50 }
      ),
      { ok: true }
    );
    assert.equal(ensureCalls, 0, "a ledger-verified preferred-model command must not re-enter a hanging ensure queue");
    iframe.dataset.contentRuntimeCapabilities = "";
    await assert.rejects(
      port.request(
        iframe,
        "applyPreferredModel",
        { appId: "NotionAI", modelId: "fable5", runId: "run-current" },
        { expectedDocumentId: "document-current", skipEnsure: true, timeoutMs: 50 }
      ),
      (error) => error?.code === "INJECTION_FAILED" && error?.delivered === false
    );
    assert.equal(ensureCalls, 0, "missing readiness must fail closed without joining the unresolved ensure queue");
  }

  {
    const previousGlobals = Object.fromEntries(["browser", "chrome", "document", "window"].map((key) => [
      key,
      { owned: Object.hasOwn(globalThis, key), value: globalThis[key] }
    ]));
    const restoreGlobal = (key) => {
      if (previousGlobals[key].owned) globalThis[key] = previousGlobals[key].value;
      else delete globalThis[key];
    };
    try {
      delete globalThis.browser;
      globalThis.window = {
        addEventListener() {},
        setTimeout
      };
      globalThis.document = {
        addEventListener() {},
        visibilityState: "visible"
      };
      const fixture = await createPreservedRuntimeReloadFixture();
      fixture.activate(fixture.runtimeA);
      fixture.controller.install();
      assert.equal(fixture.runtimeA.listeners.size, 1, "the preserved page must begin on runtime A");
      const preservedIframe = fixture.iframe;
      const preservedWindow = fixture.contentWindow;

      // Dia keeps the extension page and its already-loaded third-party iframes
      // alive while an unpacked extension reload replaces the extension API.
      // Outgoing calls therefore use B, while a one-shot runtime listener can
      // remain stranded on A unless the page bridge explicitly rebinds it.
      fixture.activate(fixture.runtimeB);
      const operations = [
        { command: "deleteThread", data: { payload: { appId: "Claude" } } },
        { command: "collectSummary", data: { config: { id: "claude" } } },
        { command: "sendText", data: { text: "preserved-runtime-send" } }
      ];
      const outcomes = [];
      for (const operation of operations) {
        try {
          outcomes.push({
            command: operation.command,
            status: "fulfilled",
            value: await fixture.port.request(fixture.iframe, operation.command, operation.data)
          });
        } catch (error) {
          outcomes.push({
            command: operation.command,
            status: "rejected",
            reason: error?.message || String(error)
          });
        }
      }

      assert.deepEqual(
        outcomes.map(({ command, status }) => ({ command, status })),
        operations.map(({ command }) => ({ command, status: "fulfilled" })),
        `a preserved Dia page must recover every public Frame RPC after runtime A -> B: ${JSON.stringify(outcomes)}`
      );
      assert.equal(fixture.runtimeB.listeners.size, 1, "runtime B must own exactly one authenticated relay listener");
      assert.equal(fixture.iframe, preservedIframe, "runtime recovery must not replace the preserved iframe");
      assert.equal(fixture.iframe.contentWindow, preservedWindow, "runtime recovery must retain the existing WindowProxy");
      assert.equal(fixture.srcAssignments(), 0, "runtime recovery must not navigate or reload the third-party page");
      assert.equal(fixture.iframe.dataset.browserFrameId, "7");
      assert.equal(fixture.iframe.dataset.frameBindingId, "b".repeat(64));
      assert.equal(fixture.iframe.dataset.injectedBrowserDocumentId, "browser-document-preserved");
      assert.equal(fixture.iframe.dataset.preferredModelDocumentId, "bridge-document-preserved");
      assert.equal(fixture.ensureRequests.length, 3, "Delete, Summary, and Send must each install only their missing capability");
      assert.deepEqual(
        fixture.ensureRequests.map((request) => request.features.join(",")),
        ["delete", "summary", "send"]
      );
      assert.equal(fixture.relayRequests.length, 3, "each post-reload capability install must bind exactly once");
      assert.ok(fixture.relayRequests.every((request) => (
        request.expectedFrameId === 7
        && request.expectedBindingId === "b".repeat(64)
        && request.browserDocumentId === "browser-document-preserved"
      )), "every recovery relay must stay bound to the exact preserved browser frame and document");
      assert.deepEqual(
        fixture.frameCommands.map(({ command }) => command),
        ["deleteThread", "getSummaryRuntimeState", "collectSummary", "sendText"],
        "commands must run only after the current runtime accepts the authenticated binding"
      );
      assert.ok(fixture.frameCommands.every(({ bridgeDocumentId }) => bridgeDocumentId === "bridge-document-preserved"));
      assert.equal(fixture.iframe.dataset.contentRuntimeCapabilities, "delete,send,summary");
    } finally {
      for (const key of ["browser", "chrome", "document", "window"]) restoreGlobal(key);
    }
  }

  {
    const fixture = createVerifiedRegistrationFixture({
      dataset: { injectedBrowserDocumentId: "browser-document-current" }
    });
    const result = await fixture.context.verifyCurrent(fixture.iframe);
    assert.equal(result.frameId, 80);
    assert.equal(result.browserDocumentId, "browser-document-current");
    assert.equal(
      fixture.iframe.dataset.browserFrameId,
      "80",
      "an authenticated registration must restore frameId when runtime.getFrameId is unavailable"
    );
  }

  {
    const fixture = createVerifiedRegistrationFixture();
    const result = await fixture.context.verifyCurrent(fixture.iframe);
    assert.equal(result.frameId, 80);
    assert.equal(
      fixture.iframe.dataset.injectedBrowserDocumentId,
      "browser-document-current",
      "the same live registration may restore its missing browser-document identity"
    );
  }

  {
    let finishVerification;
    const fixture = createVerifiedRegistrationFixture({
      verifyContentFrameRegistration: () => new Promise((resolve) => { finishVerification = resolve; })
    });
    const pending = fixture.context.verifyCurrent(fixture.iframe);
    fixture.iframe.dataset.preferredModelDocumentId = "bridge-document-navigated";
    finishVerification(fixture.registration);
    assert.equal(await pending, null);
    assert.equal(
      fixture.iframe.dataset.browserFrameId,
      undefined,
      "a registration for a document that navigated during verification must not restore stale identity"
    );
  }

  for (const invalid of [
    {
      label: "conflicting remembered frame id",
      dataset: { browserFrameId: "81" }
    },
    {
      label: "malformed remembered frame id",
      dataset: { browserFrameId: "not-a-frame" }
    },
    {
      label: "conflicting browser document",
      dataset: { injectedBrowserDocumentId: "browser-document-old" }
    },
    {
      label: "invalid authenticated frame id",
      registration: { frameId: 0 }
    },
    {
      label: "detached iframe",
      isConnected: false
    },
    {
      label: "mismatched authenticated binding",
      registration: { frameBindingId: "e".repeat(64) }
    }
  ]) {
    const fixture = createVerifiedRegistrationFixture(invalid);
    const before = { ...fixture.iframe.dataset };
    assert.equal(await fixture.context.verifyCurrent(fixture.iframe), null, invalid.label);
    assert.deepEqual(
      { ...fixture.iframe.dataset },
      before,
      `${invalid.label} must fail closed without overwriting iframe identity`
    );
  }

  for (const href of ["https://grok.com/", "https://gk.dairoot.cn/c/current"]) {
    const fixture = createVerifiedRegistrationFixture({
      registration: {
        href,
        grokCookieRuntime: grokCookieRuntimeAttestation()
      }
    });
    assert.ok(
      await fixture.context.verifyCurrent(fixture.iframe),
      `${href}: the exact current Grok ancillary attestation must be accepted`
    );
  }

  for (const invalid of [
    {
      label: "missing Grok ancillary runtime",
      registration: { href: "https://gk.dairoot.cn/", grokCookieRuntime: null }
    },
    {
      label: "stale Grok ancillary version",
      registration: {
        href: "https://gk.dairoot.cn/",
        grokCookieRuntime: grokCookieRuntimeAttestation("grok-cookie-old")
      }
    },
    {
      label: "wrong Grok ancillary bundle",
      registration: {
        href: "https://grok.com/",
        grokCookieRuntime: grokCookieRuntimeAttestation(
          "grok-cookie-current",
          "content/content.js"
        )
      }
    },
    {
      label: "Grok ancillary browser document changed",
      dataset: { injectedBrowserDocumentId: "browser-document-old" },
      registration: {
        href: "https://gk.dairoot.cn/",
        grokCookieRuntime: grokCookieRuntimeAttestation()
      }
    }
  ]) {
    const fixture = createVerifiedRegistrationFixture(invalid);
    assert.equal(await fixture.context.verifyCurrent(fixture.iframe), null, invalid.label);
  }

  {
    const fixture = createVerifiedRegistrationFixture({
      registration: {
        href: "https://sub.gk.dairoot.cn/",
        grokCookieRuntime: null
      }
    });
    assert.ok(
      await fixture.context.verifyCurrent(fixture.iframe),
      "the exact-host ancillary contract must not expand to Mirror subdomains"
    );
  }

  {
    const fixture = createApplyFixture({ registrations: [{ bridgeVersion: "current" }] });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.ok, true);
    assert.deepEqual(fixture.calls, { verify: 1, prepare: 0, send: 1, cancel: 0 });
    assert.equal(fixture.lastSendOptions.skipEnsure, true);
  }

  {
    const fixture = createApplyFixture({ registrations: [null, { bridgeVersion: "current" }] });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.ok, true);
    assert.equal(fixture.record.bridgeRecoveryAttempts, 1);
    assert.deepEqual(fixture.calls, { verify: 2, prepare: 1, send: 1, cancel: 0 });
    assert.deepEqual(
      Array.from(fixture.preparationOptions.features || []),
      ["preferred-model"]
    );
    assert.deepEqual(Object.keys(fixture.preparationOptions), ["features"]);
  }

  {
    const fixture = createApplyFixture({
      bridgeRecoveryAttempts: 1,
      registrations: [null, { bridgeVersion: "current" }]
    });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.ok, true, "a navigation-gap recovery miss must not suppress the next safe bridge repair");
    assert.equal(fixture.record.bridgeRecoveryAttempts, 2);
    assert.deepEqual(fixture.calls, { verify: 2, prepare: 1, send: 1, cancel: 0 });
  }

  {
    const fixture = createApplyFixture({
      registrations: [null, null, { bridgeVersion: "current" }],
      preparedResults: [
        { ok: false, reason: "frame is still navigating" },
        { ok: true }
      ]
    });
    const first = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(first.retryable, true);
    assert.equal(fixture.calls.send, 0, "a bridge miss must not deliver the mutating model command");
    const second = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(second.ok, true, "the same record must recover after the direct child frame appears");
    assert.equal(fixture.record.bridgeRecoveryAttempts, 2);
    assert.deepEqual(fixture.calls, { verify: 3, prepare: 2, send: 1, cancel: 0 });
  }

  {
    const fixture = createApplyFixture({ registrations: [null], prepared: { ok: false, reason: "injection failed" } });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.retryable, true);
    assert.match(result.reason, /injection failed/);
    assert.equal(fixture.calls.send, 0);
  }

  {
    const fixture = createApplyFixture({
      registrations: [null, { bridgeVersion: "core-only", documentId: "partial-document" }],
      prepared: { ok: false, reason: "preferred-model capability injection failed" }
    });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.retryable, true);
    assert.match(result.reason, /capability injection failed/);
    assert.deepEqual(
      fixture.calls,
      { verify: 1, prepare: 1, send: 0, cancel: 0 },
      "an explicit preparation failure must not promote a core-only registration into a mutating command"
    );
  }

  {
    const error = Object.assign(new Error("preferred-model capability is not registered"), {
      code: "INJECTION_FAILED",
      delivered: false
    });
    const fixture = createApplyFixture({
      registrations: [{ bridgeVersion: "current", documentId: "current-document" }],
      sendError: error
    });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.retryable, true, "an explicit pre-delivery injection failure must remain safely retryable");
    assert.equal(result.cancelled, false);
    assert.equal(fixture.calls.send, 1);
  }

  {
    const fixture = createApplyFixture({
      registrations: [null, { bridgeVersion: "current", documentId: "boundary-document" }],
      prepared: {
        ok: false,
        timedOut: true,
        reason: "iframe content bridge recovery timed out"
      }
    });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.retryable, true);
    assert.match(result.reason, /content bridge recovery timed out/i);
    assert.deepEqual(
      fixture.calls,
      { verify: 1, prepare: 1, send: 0, cancel: 0 },
      "a preparation deadline must remain a zero-interaction retry even when core registration appears"
    );
  }

  {
    const fixture = createApplyFixture({
      registrations: [null, null, { bridgeVersion: "current", documentId: "recovered-document" }],
      hangingPreparation: true,
      bridgePreparationTimeoutMs: 30
    });
    const startedAt = Date.now();
    const first = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(first.retryable, true, "a bridge preparation deadline must remain a safe zero-interaction retry");
    assert.equal(first.cancelled, false);
    assert.match(first.reason, /content bridge recovery timed out/i);
    assert.ok(Date.now() - startedAt < 500, "an unresolved bridge preparation must not hold the applying gate indefinitely");
    assert.equal(fixture.calls.send, 0, "a timed-out bridge preparation must not deliver a mutating model command");
    assert.equal(
      fixture.retryDelay({ attempt: 0, delays: [0, 800, 2000, 4200] }, first),
      800,
      "the bounded Notion retry schedule must accept a bridge preparation timeout"
    );

    const second = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(second.retryable, true, "a dedicated retry must not become stuck on the shared unresolved preparation");
    assert.equal(fixture.calls.prepare, 2, "each preferred-model attempt must acquire its own bounded waiter");
    assert.equal(fixture.calls.send, 0);

    fixture.rejectPreparation(new Error("late shared preparation rejection"));
    await new Promise((resolve) => { setImmediate(resolve); });
    const recovered = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(recovered.ok, true, "a later retry may use a newly verified frame after the abandoned preparation settles");
    assert.equal(fixture.calls.send, 1, "late preparation settlement must never itself deliver the model command");
  }

  {
    const fixture = createApplyFixture({
      registrations: [null],
      hangingPreparation: true,
      bridgePreparationTimeoutMs: 500
    });
    const pending = fixture.apply(fixture.iframe, fixture.record);
    await new Promise((resolve) => { setImmediate(resolve); });
    fixture.abort();
    const result = await pending;
    assert.equal(result.cancelled, true, "the current run AbortSignal must immediately release its bridge-preparation waiter");
    assert.equal(result.retryable, false);
    assert.equal(fixture.calls.send, 0);
    fixture.rejectPreparation(new Error("late rejection after abort"));
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(fixture.calls.send, 0, "late completion after abort must remain owner-scoped and inert");
  }

  {
    const readyRegistration = {
      documentId: "doc-current",
      browserDocumentId: "browser-document-9",
      bridgeVersion: "bridge-current",
      href: "https://gk.dairoot.cn/",
      runtimeIdentity: runtimeIdentity("content/content.js"),
      grokCookieRuntime: grokCookieRuntimeAttestation()
    };
    const fixture = createSummaryPrepareFixture({
      initialRegistration: readyRegistration,
      registration: readyRegistration
    });
    const result = await fixture.prepare(fixture.iframe);
    assert.equal(result.ok, true);
    assert.equal(result.injected, false);
    assert.equal(
      fixture.calls.install,
      0,
      "an exact-document current Grok ancillary attestation must not trigger duplicate injection"
    );
  }

  {
    const fixture = createSummaryPrepareFixture({
      initialRegistration: {
        documentId: "doc-current",
        browserDocumentId: "browser-document-9",
        bridgeVersion: "bridge-current",
        href: "https://example.com/chat/current",
        runtimeIdentity: runtimeIdentity("content/content.js"),
        grokCookieRuntime: null
      }
    });
    const result = await fixture.prepare(fixture.iframe);
    assert.equal(result.ok, true);
    assert.equal(result.injected, false);
    assert.equal(
      fixture.calls.install,
      0,
      "a non-Grok host must not require the Grok ancillary runtime"
    );
  }

  for (const { label, initialRuntime } of [
    { label: "missing", initialRuntime: null },
    { label: "stale-version", initialRuntime: grokCookieRuntimeAttestation("grok-cookie-old") }
  ]) {
    const fixture = createSummaryPrepareFixture({
      initialRegistration: {
        documentId: "doc-current",
        browserDocumentId: "browser-document-9",
        bridgeVersion: "bridge-current",
        href: "https://gk.dairoot.cn/",
        runtimeIdentity: runtimeIdentity("content/content.js"),
        grokCookieRuntime: initialRuntime
      },
      registration: {
        href: "https://gk.dairoot.cn/",
        grokCookieRuntime: grokCookieRuntimeAttestation()
      },
      hrefs: ["https://gk.dairoot.cn/"],
      injected: 3,
      injectedFiles: [
        "content/preload.js@9",
        "content/grok-cookie-bridge.js@9",
        "content/content.js@9"
      ],
      plannedFiles: [
        "content/preload.js",
        "content/grok-cookie-bridge.js",
        "content/content.js"
      ]
    });
    const result = await fixture.prepare(fixture.iframe);
    assert.equal(result.ok, true, `${label}: the missing ancillary must be repairable`);
    assert.equal(result.injected, true, `${label}: repair must use the full locked-frame plan`);
    assert.equal(fixture.calls.install, 1, `${label}: repair must run exactly once`);
    assert.deepEqual(
      [...fixture.lastRuntimeRequest.features],
      [],
      `${label}: ancillary repair must not invent a public capability`
    );
  }

  {
    const fixture = createApplyFixture({
      registrations: [{ bridgeVersion: "current" }],
      sendError: new Error("[PostMessage] Timeout waiting for response: applyPreferredModel")
    });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.retryable, false, "a timed-out UI action must not be blindly retried");
    assert.equal(fixture.calls.send, 1);
    assert.equal(fixture.calls.prepare, 0);
    assert.equal(fixture.calls.cancel, 1);
  }

  {
    const fixture = createApplyFixture({
      registrations: [null, { bridgeVersion: "current" }],
      supersedeDuringPrepare: true
    });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.cancelled, true);
    assert.equal(fixture.calls.send, 0, "a superseded record must never reach the model UI");
  }

  {
    let releaseStaleInstall;
    const installBarrier = new Promise((resolve) => { releaseStaleInstall = resolve; });
    const fixture = createSummaryPrepareFixture({
      dataset: { contentRuntimeCapabilitiesEpoch: "20" },
      installBarrier
    });
    const pending = fixture.prepare(fixture.iframe, { summary: true });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(fixture.calls.install, 1, "the stale-document fixture must reach the injection boundary");
    fixture.iframe.dataset.contentRuntimeCapabilitiesEpoch = "21";
    releaseStaleInstall();
    const result = await pending;
    assert.equal(result.cancelled, true, "a preparation superseded during injection must cancel");
    assert.equal(fixture.bindingRequests, undefined, "a stale injection result must not issue a binding challenge");
    assert.equal(
      fixture.iframe.dataset.injectedBrowserDocumentId,
      undefined,
      "a stale injection result must not overwrite the refreshed browser-document identity"
    );
    assert.deepEqual(fixture.calls, { verify: 1, wait: 0, install: 1, probe: 0, remember: 0 });
  }

  {
    const fixture = createSummaryPrepareFixture();
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true);
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, "doc-current");
    assert.equal(fixture.iframe.dataset.summaryRuntimeBridgeVersion, "bridge-current");
    assert.equal(fixture.bindingRequests, 1);
    assert.equal(fixture.challengeIssues.length, 1);
    assert.equal(fixture.lastBindingTarget, fixture.iframe);
    assert.equal(fixture.lastBindingRequestOptions.rotate, true);
    assert.equal(fixture.lastBindingRequestOptions.skipRegistered, false);
    assert.equal(Object.hasOwn(fixture.lastRuntimeRequest, "bindingChallenge"), false);
    assert.equal(Object.hasOwn(fixture.lastRuntimeRequest, "bindingGeneration"), false);
    assert.deepEqual(fixture.calls, { verify: 2, wait: 1, install: 1, probe: 1, remember: 1 });
  }

  {
    const fixture = createSummaryPrepareFixture({ injectionDelayMs: 8001 });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "an injection queue delay longer than the challenge TTL must not age the binding challenge");
    assert.equal(fixture.injectionFinishedAt - fixture.injectionStartedAt, 8001);
    assert.equal(fixture.challengeIssues.length, 1);
    assert.equal(
      fixture.challengeIssues[0].issuedAt,
      fixture.injectionFinishedAt,
      "the authenticated binding challenge must be issued only after queued injection completes"
    );
    assert.ok(fixture.challengeIssues[0].expiresAt > fixture.injectionFinishedAt);
    assert.equal(Object.hasOwn(fixture.lastRuntimeRequest, "bindingChallenge"), false);
    assert.equal(Object.hasOwn(fixture.lastRuntimeRequest, "bindingGeneration"), false);
  }

  {
    const starts = [];
    const releases = [];
    const queueContext = vm.createContext({
      Boolean,
      Map,
      Promise,
      Set,
      String,
      WeakMap,
      capabilityPreparationQueues: new WeakMap(),
      installRuntimeEventBridge: () => true,
      prepareContentFrameRuntimeUncached: (iframe, options, generation) => new Promise((resolve) => {
        starts.push({
          iframe,
          generation,
          signature: [...(options.features || [])].sort().join(",")
        });
        releases.push(resolve);
      })
    });
    vm.runInContext(`
      ${functionSource(frameBridge, "framePreparationGeneration")}
      ${functionSource(frameBridge, "framePreparationIsCurrent")}
      ${functionSource(frameBridge, "cancelledFramePreparation")}
      ${functionSource(frameBridge, "prepareContentFrameRuntime")}
      globalThis.prepareQueued = prepareContentFrameRuntime;
    `, queueContext);
    const sameFrame = {
      isConnected: true,
      dataset: { contentRuntimeCapabilitiesEpoch: "1" }
    };
    const first = queueContext.prepareQueued(sameFrame, { features: ["delete"] });
    const duplicate = queueContext.prepareQueued(sameFrame, { features: ["delete"] });
    const second = queueContext.prepareQueued(sameFrame, { features: ["message-navigator"] });
    assert.equal(first, duplicate, "same-frame same-capability preparation must share one run");
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(starts.map((entry) => entry.signature), ["delete"]);
    releases.shift()({ ok: true });
    await first;
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(
      starts.map((entry) => entry.signature),
      ["delete", "message-navigator"],
      "different capabilities for one iframe must serialize to avoid challenge rotation and ledger loss"
    );
    releases.shift()({ ok: true });
    await second;

    starts.length = 0;
    const refreshedFrame = {
      isConnected: true,
      dataset: { contentRuntimeCapabilitiesEpoch: "10" }
    };
    const staleDocumentRun = queueContext.prepareQueued(refreshedFrame, { features: ["delete"] });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(starts.length, 1);
    refreshedFrame.dataset.contentRuntimeCapabilitiesEpoch = "11";
    const currentDocumentRun = queueContext.prepareQueued(refreshedFrame, { features: ["delete"] });
    assert.notEqual(
      staleDocumentRun,
      currentDocumentRun,
      "a refreshed iframe document must not reuse the prior document's capability run"
    );
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(
      starts.map((entry) => entry.generation),
      ["10", "11"],
      "the refreshed document must bypass the stale app-level tail"
    );
    const [releaseStaleDocument, releaseCurrentDocument] = releases.splice(0, 2);
    releaseStaleDocument({ ok: true, documentId: "stale-document" });
    const staleResult = await staleDocumentRun;
    assert.equal(staleResult.cancelled, true, "a late stale-document result must be owner-scoped and inert");
    const duplicateCurrentDocumentRun = queueContext.prepareQueued(
      refreshedFrame,
      { features: ["delete"] }
    );
    assert.equal(
      duplicateCurrentDocumentRun,
      currentDocumentRun,
      "stale cleanup must not discard the current document's cached run"
    );
    releaseCurrentDocument({ ok: true, documentId: "current-document" });
    assert.equal((await currentDocumentRun).ok, true);

    starts.length = 0;
    const threeFrames = [1, 2, 3].map((id) => ({
      id,
      isConnected: true,
      dataset: { contentRuntimeCapabilitiesEpoch: "1" }
    }));
    const threeRuns = threeFrames.map((frame) => queueContext.prepareQueued(frame, { features: ["delete"] }));
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(starts.length, 3, "three independent iframes must remain concurrently recoverable");
    assert.deepEqual(starts.map((entry) => entry.iframe.id).sort(), [1, 2, 3]);
    while (releases.length) releases.shift()({ ok: true });
    await Promise.all(threeRuns);
  }

  {
    const fixture = createSummaryPrepareFixture({
      installResults: [{
        injected: 4,
        injectedFiles: [
          "content/preload.js@9",
          "content/content.js@9",
          "content/summary-userscripts-main.js@9",
          "content/summary-userscripts.js@9"
        ]
      }, {}]
    });
    const partial = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(partial.ok, false, "a same-generation partial Summary install must fail closed");
    assert.equal(fixture.calls.probe, 0, "partial inventory must not reach Summary readiness or command execution");
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, undefined);
    assert.equal(fixture.iframe.dataset.contentRuntimeCapabilities, undefined);

    const retried = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(retried.ok, true, "the complete same-generation Summary inventory must be safely retryable");
    assert.equal(fixture.calls.install, 2);
    assert.equal(fixture.calls.probe, 1, "only the complete retry may run the exact readiness probe");
    assert.equal(fixture.calls.remember, 1);
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, "doc-current");
    assert.equal(fixture.iframe.dataset.contentRuntimeCapabilities, "summary");
  }

  {
    const fixture = createSummaryMainInstallFixture();
    fixture.context.install();
    const firstListener = [...fixture.listeners][0];
    const firstExecutor = fixture.window.__fixtureSummaryExecutor__;
    assert.equal(fixture.listeners.size, 1);
    assert.equal(typeof firstExecutor, "function");

    fixture.context.install();
    assert.equal(fixture.listeners.size, 1, "same-generation Summary MAIN retry must not duplicate its message listener");
    assert.equal([...fixture.listeners][0], firstListener, "retry must retain the active listener owner");
    assert.equal(fixture.window.__fixtureSummaryExecutor__, firstExecutor, "retry must retain the active custom executor owner");
    assert.equal(fixture.entries.size, 2, "retry must reuse the exact runners and page runtime registrations");
  }

  {
    const fixture = createSummaryPrepareFixture({
      dataset: { browserFrameId: "" },
      installResults: [{ bindingRelayed: false }]
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "Chromium must bind through the targeted parent WindowProxy challenge when runtime.getFrameId is unavailable");
    assert.equal(fixture.bindingRequests, 1);
  }

  for (const bindingRequestResult of [undefined, false]) {
    const fixture = createSummaryPrepareFixture({ bindingRequestResult });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "a missing or false first binding relay must enter bounded registration recovery");
    assert.equal(fixture.bindingRequests, 1);
    assert.equal(fixture.calls.wait, 1, "the first relay result must not bypass bounded registration readiness");
    assert.equal(fixture.calls.probe, 1, "frame commands may run only after bounded recovery authenticates the registration");
  }

  for (const bindingRequestResult of [undefined, false]) {
    const fixture = createSummaryPrepareFixture({ bindingRequestResult, waitRegistration: null });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, false, "an unaccepted relay must still fail closed when bounded recovery finds no registration");
    assert.match(result.reason, /secure frame binding relay was not accepted/);
    assert.equal(fixture.bindingRequests, 1);
    assert.equal(fixture.calls.wait, 1, "the failed first relay must receive exactly one bounded readiness attempt");
    assert.equal(fixture.calls.probe, 0, "frame commands must not run without an authenticated registration");
  }

  for (const failedInstall of [
    { label: "reported partial injection error", installErrors: ["content/preload.js failed"] },
    { label: "short injection count", injected: 4 },
    { label: "missing injection inventory", injectedFiles: undefined, omitInjectedFiles: true },
    { label: "missing injection plan", plannedFiles: [] },
    { label: "mismatched installed capability", installedFeatures: ["delete"] },
    { label: "missing browser document identity", omitBrowserDocumentId: true }
  ]) {
    const fixture = createSummaryPrepareFixture(failedInstall);
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, false, failedInstall.label);
    assert.equal(fixture.calls.wait, 0, `${failedInstall.label} must fail before trusting content registration`);
    assert.equal(fixture.calls.probe, 0, failedInstall.label);
  }

  {
    const fixture = createSummaryPrepareFixture({
      hrefs: ["https://grok.com/chat/old", "https://example.com/chat/current"]
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "background plannedFiles from the locked frame must override stale Grok href hints");
  }

  {
    const fixture = createSummaryPrepareFixture({
      hrefs: ["https://gk.dairoot.cn/chat/old", "https://example.com/chat/current"]
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "background plannedFiles from the locked frame must override stale Mirror href hints");
  }

  {
    const fixture = createSummaryPrepareFixture({
      registration: { browserDocumentId: "browser-document-new" },
      installedBrowserDocumentId: "browser-document-old"
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, false, "registration from another browser document must be rejected");
    assert.match(result.reason, /browser document changed/);
    assert.equal(fixture.calls.probe, 0, "browser-document mismatch must fail before issuing frame commands");
  }

  for (const { label, state } of [
    {
      label: "stale document",
      state: {
        ready: true,
        mainReady: true,
        isolatedReady: true,
        documentId: "doc-old",
        bridgeVersion: "bridge-current"
      }
    },
    {
      label: "stale bridge version",
      state: {
        ready: true,
        mainReady: true,
        isolatedReady: true,
        documentId: "doc-current",
        bridgeVersion: "bridge-old"
      }
    },
    {
      label: "missing MAIN runtime",
      state: {
        ready: false,
        mainReady: false,
        isolatedReady: true,
        documentId: "doc-current",
        bridgeVersion: "bridge-current"
      }
    },
    {
      label: "missing ISOLATED runtime",
      state: {
        ready: false,
        mainReady: true,
        isolatedReady: false,
        documentId: "doc-current",
        bridgeVersion: "bridge-current"
      }
    },
    {
      label: "wrong Summary bridge identity",
      state: {
        runtimeIdentity: runtimeIdentity("content/content.js")
      }
    },
    {
      label: "wrong Summary MAIN identity",
      state: {
        mainRuntimeIdentity: runtimeIdentity("content/summary-userscripts.js")
      }
    },
    {
      label: "wrong Summary ISOLATED identity",
      state: {
        isolatedRuntimeIdentity: runtimeIdentity("content/summary-userscripts-main.js")
      }
    }
  ]) {
    const fixture = createSummaryPrepareFixture({ summaryState: state });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, false, label);
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, undefined, `${label}: must not mark stale runtime ready`);
    assert.equal(fixture.iframe.dataset.summaryRuntimeBridgeVersion, undefined, `${label}: must not mark stale runtime version ready`);
    assert.equal(fixture.calls.remember, 0, label);
  }

  {
    const fixture = createSummaryPrepareFixture({
      confirmedRegistration: { documentId: "doc-new", bridgeVersion: "bridge-current" }
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, false, "navigation after the runtime probe must invalidate readiness");
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, undefined);
    assert.equal(fixture.calls.remember, 0);
  }

  {
    const fixture = createSummaryPrepareFixture({
      confirmedRegistration: { documentId: "doc-current", bridgeVersion: "bridge-old" }
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, false, "a stale bridge version after the probe must invalidate readiness");
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, undefined);
    assert.equal(fixture.calls.remember, 0);
  }

  {
    const fixture = createSummaryPrepareFixture({
      registration: {
        documentId: "doc-current",
        bridgeVersion: "bridge-current",
        href: "https://example.com/chat/old"
      },
      confirmedRegistration: {
        documentId: "doc-current",
        bridgeVersion: "bridge-current",
        href: "https://example.com/chat/new"
      }
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true);
    assert.equal(result.registration.href, "https://example.com/chat/new");
    assert.equal(fixture.rememberedRegistration.href, "https://example.com/chat/new");
  }

  {
    const fixture = createSummaryPrepareFixture({
      initialRegistration: { documentId: "doc-current", bridgeVersion: "bridge-current" },
      dataset: {
        summaryRuntimeDocumentId: "doc-current",
        summaryRuntimeBridgeVersion: "bridge-old"
      }
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "a stale Summary marker version must force reinjection");
    assert.equal(fixture.calls.install, 1);
    assert.equal(fixture.iframe.dataset.summaryRuntimeBridgeVersion, "bridge-current");
  }

  assert.doesNotMatch(frameBridge, /function installIframeEventBridge|contentReady/);
  const bindingRequestSource = functionSource(frameBridge, "requestFrameBinding");
  assert.match(bindingRequestSource, /action: "requestFrameBinding"/);
  assert.match(bindingRequestSource, /expectedFrameId/);
  assert.match(bindingRequestSource, /expectedBindingId/);
  assert.match(bindingRequestSource, /if \(!exactFrameTarget\.expectedFrameId\)/);
  assert.match(bindingRequestSource, /contentWindow\?\.postMessage/);
  assert.match(bindingRequestSource, /action: "requestFrameBinding"/);
  const authenticatedBindingSource = functionSource(frameBridge, "acceptAuthenticatedFrameBinding", true);
  assert.match(authenticatedBindingSource, /context\.tabId !== tabId/);
  assert.match(authenticatedBindingSource, /frameBindingChallenges\.claim\(message\.challenge, message\.generation\)/);
  assert.match(authenticatedBindingSource, /verifyContentFrameRegistration\(documentId\)/);
  assert.match(authenticatedBindingSource, /frameBindingChallenges\.isCurrent\(entry\)/);
  assert.match(authenticatedBindingSource, /context\.frameId !== expectedFrameId/);
  assert.match(frameBridge, /scheduleContentFrameRepair\(iframe, 120\)/);
  const repairSource = functionSource(frameBridge, "scheduleContentFrameRepair");
  const poisonedRepairSource = functionSource(frameBridge, "contentFrameRepairIsPoisoned");
  const reloadPoisonedFrameSource = functionSource(frameBridge, "reloadPoisonedContentFrame");
  assert.match(poisonedRepairSource, /is aborted/);
  assert.match(poisonedRepairSource, /is superseded/);
  assert.match(poisonedRepairSource, /wrong identity/);
  assert.match(poisonedRepairSource, /secure frame runtime identity/);
  assert.match(poisonedRepairSource, /secure frame binding relay was not accepted/);
  assert.match(poisonedRepairSource, /iframe content bridge did not become ready/);
  assert.match(poisonedRepairSource, /packaged userscript injection frame is not the verified direct child document/);
  assert.match(reloadPoisonedFrameSource, /reloadFrameDocument/);
  assert.match(reloadPoisonedFrameSource, /poisonedContentRuntimeReloadHref/);
  assert.match(reloadPoisonedFrameSource, /currentFrames\?\.\(\)/);
  assert.match(repairSource, /contentFrameRepairIsPoisoned\(reason\)/);
  assert.match(repairSource, /reloadPoisonedContentFrame\(iframe, reason\)/);
  assert.match(frameBridge, /contentFrameRepairIsPoisoned\(result\)[\s\S]*?reloadPoisonedContentFrame\(iframe, result\)/);
  assert.match(repairSource, /CONTENT_FRAME_REPAIR_RETRY_DELAYS\[retryIndex\]/);
  assert.match(repairSource, /repairGenerations\.get\(iframe\) !== repairGeneration/);
  assert.match(repairSource, /scheduleContentFrameRepair\(iframe, nextDelay, retryIndex \+ 1, repairGeneration\)/);
  {
    class TestIframe {}
    const calls = { invalidations: [], challenge: 0, repair: 0, apply: 0, sync: 0 };
    let loadHandler = null;
    const iframe = new TestIframe();
    iframe.isConnected = true;
    iframe.dataset = { contentRuntimeCapabilitiesEpoch: "5" };
    iframe.classList = { contains: (value) => value === "chat-frame" };
    const context = vm.createContext({
      HTMLIFrameElement: TestIframe,
      document: {
        addEventListener(type, handler, capture) {
          assert.equal(type, "load");
          assert.equal(capture, true);
          loadHandler = handler;
        }
      },
      frameBindingChallenges: {
        invalidate(target) {
          assert.equal(target, iframe);
          calls.challenge += 1;
        }
      },
      calls,
      iframe
    });
    context.preferredModelFrameIsLoading = () => false;
    context.preferredModelGateBootstrapping = false;
    context.invalidatePreferredModelFrame = (target, reason, options) => {
      calls.invalidations.push({ target, reason, options });
      context.invalidateLedger(target);
    };
    context.scheduleContentFrameRepair = (target, delay) => {
      assert.equal(target, iframe);
      assert.equal(delay, 120);
      calls.repair += 1;
    };
    context.schedulePreferredModelApply = (target) => {
      assert.equal(target, iframe);
      calls.apply += 1;
    };
    context.schedulePreferredModelApplyToFrame = () => {
      throw new Error("navigation start must not schedule a model apply before load");
    };
    context.syncPreferredModelInputGate = () => { calls.sync += 1; };
    vm.runInContext(`
      ${functionSource(frameBridge, "framePreparationGeneration")}
      ${functionSource(frameBridge, "invalidateContentRuntimeCapabilityLedger")}
      ${functionSource(preferredModel, "handlePreferredModelFrameLifecycleChange")}
      ${functionSource(frameBridge, "installPreferredModelIframeLoadHandler")}
      globalThis.invalidateLedger = invalidateContentRuntimeCapabilityLedger;
      globalThis.lifecycle = handlePreferredModelFrameLifecycleChange;
      installPreferredModelIframeLoadHandler();
    `, context);
    context.lifecycle({ type: "loading", loading: true, iframe });
    assert.equal(iframe.dataset.preferredModelNavigationInvalidated, "1");
    assert.equal(iframe.dataset.contentRuntimeCapabilitiesEpoch, "6");
    assert.equal(calls.invalidations.length, 1);
    assert.equal(calls.invalidations[0].reason, "navigation-start");
    assert.equal(calls.invalidations[0].options.clearDocumentId, true);
    assert.deepEqual(Object.keys(calls.invalidations[0].options), ["clearDocumentId"]);
    loadHandler({ target: iframe });
    assert.equal(iframe.dataset.preferredModelNavigationInvalidated, undefined);
    assert.equal(
      iframe.dataset.contentRuntimeCapabilitiesEpoch,
      "7",
      "the iframe load must supersede repairs that began after navigation-start invalidation"
    );
    assert.equal(calls.invalidations.length, 1, "the load must not stop the already-invalidated record twice");
    assert.deepEqual(
      { challenge: calls.challenge, repair: calls.repair, apply: calls.apply },
      { challenge: 1, repair: 1, apply: 1 },
      "the refreshed document must receive exactly one new repair and preferred-model apply schedule"
    );
    context.preferredModelGateBootstrapping = true;
    context.lifecycle({ type: "loading", loading: false, iframe });
    assert.equal(calls.apply, 1, "initial bootstrapping must suppress a loading completion model apply");
    context.lifecycle({ type: "workspace-sync", frames: [iframe], activeFrames: [iframe] });
    assert.equal(calls.apply, 1, "initial bootstrapping must suppress workspace-sync model applies");
    context.preferredModelGateBootstrapping = false;
  }
  const iframeLoadSource = functionSource(frameBridge, "installPreferredModelIframeLoadHandler");
  assert.match(iframeLoadSource, /scheduleContentFrameRepair\(iframe, 120\)/);
  assert.match(
    iframeLoadSource,
    /preparationGenerationBeforeLoad[\s\S]*?invalidateContentRuntimeCapabilityLedger\(iframe\)/,
    "every iframe load must advance the preparation generation even when navigation was already invalidated"
  );
  assert.ok(
    iframeLoadSource.indexOf("frameBindingChallenges.invalidate(iframe)")
      < iframeLoadSource.indexOf("delete iframe.dataset.injectedBrowserDocumentId"),
    "iframe navigation must invalidate the old challenge before clearing its injected browser document"
  );
  const initialFrameSource = functionSource(workspace, "setFrameSrcAfterPrepare");
  assert.match(
    initialFrameSource,
    /const fallback = plan\.grokPreflight \? setTimeout/,
    "only the Grok Cookie preflight may retain a bounded fallback assignment"
  );
  assert.doesNotMatch(
    initialFrameSource,
    /plan\.grokPreflight \? 10000 : 1800|if \(!plan\.grokPreflight\)[\s\S]{0,120}?assign\(\)/,
    "ordinary frames must not race their real URL ahead of DNR preparation"
  );
  const assignedStart = initialFrameSource.indexOf("assigned = true");
  const setSrcStart = initialFrameSource.indexOf("const setSrc", assignedStart);
  const realSrcAssignment = initialFrameSource.indexOf('iframe.setAttribute("src", navigationUrl)', setSrcStart);
  const browserFrameIdCapture = initialFrameSource.indexOf("rememberBrowserFrameId(iframe)", setSrcStart);
  assert.ok(
    assignedStart >= 0 && setSrcStart > assignedStart && realSrcAssignment > setSrcStart,
    "setFrameSrcAfterPrepare must retain the guarded real-URL assignment"
  );
  assert.ok(
    browserFrameIdCapture > setSrcStart && browserFrameIdCapture < realSrcAssignment,
    "the stable browser frame id must be captured from about:blank before cross-origin navigation"
  );
  const completeLoadingSource = functionSource(workspace, "completeFrameLoading");
  assert.ok(
    completeLoadingSource.indexOf("rememberBrowserFrameId(iframe)") < completeLoadingSource.indexOf("frameLoadPending"),
    "the about:blank load must retry frame-id capture before its pending edge is suppressed"
  );
  assert.doesNotMatch(
    initialFrameSource.slice(assignedStart, setSrcStart),
    /delete iframe\.dataset\.frameLoadPending/,
    "the about:blank load must remain suppressed until the real iframe URL is assigned"
  );
  const pendingRelease = initialFrameSource.indexOf("delete iframe.dataset.frameLoadPending", setSrcStart);
  assert.ok(
    pendingRelease > setSrcStart && pendingRelease < realSrcAssignment,
    "the pending marker must be released immediately before assigning the real iframe URL"
  );
  const initSource = functionSource(main, "init", true);
  assert.ok(
    initSource.indexOf('action: "reloadConfigs"') < initSource.indexOf("workspaceController.hydrateGroups(promptHandoffLaunch.snapshot || workspaceSessionSnapshot)"),
    "the app must reconcile persisted registrations before creating iframe documents"
  );
  assert.match(workspace, /await sendToContentFrame\(iframe, "getLocationHref"/);
  assert.match(workspace, /async function refreshCurrentPage/);
  assert.match(workspace, /function reloadFrameDocument\(iframe\)/);
  assert.match(workspace, /reloadFrameDocument: frameController\.reloadFrameDocument/);
  assert.match(summary, /prepareContentFrameRuntime\(iframe, \{ summary: true \}\)/);
  assert.match(summary, /expectedDocumentId: summaryReady\.registration\.documentId/);
  assert.match(summary, /expectedHref: base\.href/);
  const prepareSource = functionSource(frameBridge, "prepareContentFrameRuntimeUncached", true);
  assert.doesNotMatch(prepareSource, /\bbindingChallenge\b|\bbindingGeneration\b/);
  assert.match(
    prepareSource,
    /requestFrameBinding\(iframe, \{\s*rotate: true,\s*skipRegistered: false\s*\}\)/
  );
  assert.ok(
    prepareSource.indexOf("installed = await runtimeRequest")
      < prepareSource.indexOf("await requestFrameBinding"),
    "app preparation must finish queued injection before issuing its authenticated binding challenge"
  );
  assert.match(prepareSource, /runtimePort\(\)\.request\(iframe, "getSummaryRuntimeState", \{\}, \{ timeoutMs: 1800, skipEnsure: true \}\)/);
  assert.match(prepareSource, /summaryState\.documentId === registration\.documentId/);
  assert.match(prepareSource, /summaryState\.bridgeVersion === CONTENT_BRIDGE_VERSION/);
  assert.match(prepareSource, /confirmedRegistration\?\.documentId === registration\.documentId/);
  assert.match(prepareSource, /summaryRuntimeBridgeVersion/);
  assert.match(prepareSource, /grokCookieRuntimeReady\(registration\)/);
  assert.match(content, /function grokCookieRuntimeAttestation\(\)/);
  assert.match(content, /grokCookieRuntime: grokCookieRuntimeAttestation\(\)/);
  const verifySecureFrameSource = functionSource(background, "verifySecureFrameContext", true);
  assert.match(verifySecureFrameSource, /response\.data\.grokCookieRuntime/);
  assert.match(verifySecureFrameSource, /runtimeIdentity: normalizeContentRuntimeIdentity/);
  assert.match(verifySecureFrameSource, /grokCookieRuntime/);
  {
    const mergeContext = vm.createContext({ Set, String });
    vm.runInContext(`
      ${functionSource(frameBridge, "mergedContentRuntimeCapabilities")}
      globalThis.mergeCapabilities = mergedContentRuntimeCapabilities;
    `, mergeContext);
    const capabilityFrame = {
      dataset: {
        contentRuntimeCapabilitiesDocumentId: "doc-current",
        contentRuntimeCapabilities: "",
        contentRuntimeCapabilitiesEpoch: "2"
      }
    };
    const mergedAfterInvalidation = [...mergeContext.mergeCapabilities(
      capabilityFrame,
      "doc-current",
      ["delete"],
      ["message-navigator"],
      "1"
    )];
    assert.deepEqual(
      mergedAfterInvalidation,
      ["message-navigator"],
      "an in-flight preparation must not restore capabilities invalidated after its snapshot"
    );
    capabilityFrame.dataset.contentRuntimeCapabilities = mergedAfterInvalidation.join(",");
    assert.equal(
      capabilityFrame.dataset.contentRuntimeCapabilities.includes("delete"),
      false,
      "the queued forced Delete preparation must still observe Delete as missing"
    );
  }
  const queuedPrepareSource = functionSource(frameBridge, "prepareContentFrameRuntime");
  assert.match(queuedPrepareSource, /capabilityPreparationQueues\.get\(iframe\)/);
  assert.match(queuedPrepareSource, /previous\.catch\(\(\) => \{\}\)\.then/);
  assert.match(queuedPrepareSource, /framePreparationGeneration\(iframe\)/);
  const stateSource = functionSource(summaryCapability, "getSummaryRuntimeState", true);
  assert.match(stateSource, /documentId: contentDocumentId/);
  assert.match(stateSource, /bridgeVersion: CONTENT_BRIDGE_VERSION/);
  assert.match(stateSource, /isolatedVersion === CONTENT_BRIDGE_VERSION/);
  const targetSource = functionSource(summaryCapability, "assertSummaryTargetCurrent");
  assert.match(targetSource, /expectedDocumentId !== contentDocumentId/);
  assert.match(targetSource, /expectedHref !== String\(location\.href \|\| ""\)/);
  const collectSource = functionSource(summaryCapability, "collectSummary", true);
  assert.match(collectSource, /assertSummaryTargetCurrent\(data\)/);
  assert.match(collectSource, /finishSummaryCollection\(data,/);
  const pageStateSource = functionSource(summaryRuntime, "pageSummaryRuntimeState");
  assert.match(pageStateSource, /event\.source !== window/);
  assert.match(pageStateSource, /message\.type !== "response"/);
  assert.match(pageStateSource, /message\.action !== "runtimeState"/);
  assert.match(pageStateSource, /message\.id !== id/);
  assert.match(pageStateSource, /window\.removeEventListener\("message", onMessage, true\)/);
  assert.match(summaryMain, /runtimeRegistry\d*\(window\)/);
  assert.match(summaryMain, /\.register\("summary-page"/);
  assert.match(summaryMain, /message\.action === "runtimeState"/);
  assert.match(summaryMain, /bridgeVersion: PROTOCOL\.CONTENT_BRIDGE_VERSION/);
  assert.doesNotMatch(summaryMain, /if \(!window\.__CHATCLUB_SUMMARY_PAGE_RUNTIME__\)/);
  assert.match(background, /verifiedExtensionTabId\(\{ appTabId: message\.tabId \}, sender\)/);
  assert.match(background, /frame\.parentFrameId === 0/);
  assert.doesNotMatch(functionSource(background, "ensureContentBridge", true), /allFrames/);
  assert.match(background, /contentInjectionPlan\(\{[\s\S]*?features/);
  assert.doesNotMatch(background, /SUMMARY_BRIDGE_FILES/);
  assert.match(background, /createAuthenticatedFrameRelay\(\{[\s\S]*?registeredSenderContext/);
  assert.match(background, /async function frameBinding[\s\S]*?authenticate\(message, sender\)/);
  assert.match(content, /FRAME_BINDING_POST_MESSAGE_SOURCE/);
  assert.match(content, /expectedBindingId/);
  assert.match(content, /event\.source !== window\.parent/);
  assert.match(background, /no matching direct child iframe found for the requested target/);

  console.log("content bridge recovery: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
