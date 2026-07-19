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

const { functionSource } = require("./function-source.cjs");

function createApplyFixture(options = {}) {
  const calls = { verify: 0, prepare: 0, send: 0, cancel: 0 };
  let current = true;
  const registrations = [...(options.registrations || [])];
  const preparedResults = [...(options.preparedResults || [])];
  const context = vm.createContext({
    Error,
    String,
    calls,
    iframe: { isConnected: true, contentWindow: {} },
    record: {
      payload: { appId: "Gemini", modelId: "pro" },
      runId: "run-1",
      bridgeRecoveryAttempts: Math.max(0, Number(options.bridgeRecoveryAttempts) || 0),
      controller: { signal: { aborted: false } }
    }
  });
  context.verifiedCurrentContentFrameRegistration = async () => {
    calls.verify += 1;
    return registrations.length ? registrations.shift() : null;
  };
  context.prepareContentFrameRuntime = async () => {
    calls.prepare += 1;
    if (options.supersedeDuringPrepare) current = false;
    return preparedResults.length ? preparedResults.shift() : (options.prepared || { ok: true });
  };
  context.preferredModelRecordIsCurrent = () => current;
  context.sendToContentFrame = async () => {
    calls.send += 1;
    if (options.sendError) throw options.sendError;
    return { ok: true, runId: "run-1" };
  };
  context.requestPreferredModelCancellation = () => { calls.cancel += 1; };
  vm.runInContext(`
    const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;
    ${functionSource(preferredModel, "preferredModelResult")}
    ${functionSource(preferredModel, "applyPreferredModelToFrame", true)}
    globalThis.apply = applyPreferredModelToFrame;
  `, context);
  return context;
}

function createSummaryPrepareFixture(options = {}) {
  const calls = { verify: 0, wait: 0, install: 0, probe: 0, remember: 0 };
  const installResults = [...(options.installResults || [])];
  const registration = {
    browserDocumentId: options.registration?.browserDocumentId ?? "browser-document-9",
    documentId: "doc-current",
    bridgeVersion: "bridge-current",
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
    CONTENT_BRIDGE_VERSION: "bridge-current",
    CONTENT_RUNTIME_IDENTITY: { implementationVersion: "runtime-current" },
    calls,
    frameBindingChallenges: {
      issue: () => ({ challenge: "a".repeat(64), generation: 1 })
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
      bindingRelayed: options.bindingRelayed ?? true,
      ...(options.omitBrowserDocumentId ? {} : {
        browserDocumentId: options.installedBrowserDocumentId ?? "browser-document-9"
      }),
      ...attempt
    };
  };
  context.requestFrameBinding = () => {
    context.bindingRequests = (context.bindingRequests || 0) + 1;
    return Promise.resolve(true);
  };
  context.waitForCurrentContentFrameRegistration = async () => {
    calls.wait += 1;
    return registration;
  };
  context.contentRuntimePackageBundleIdentityMatches = (value, expectedOutputPath) => (
    value?.bundle?.outputPath === expectedOutputPath
  );
  context.contentInjectionPlan = ({ features = [], frameUrls = [], frameHost = "" } = {}) => {
    const grok = frameHost === "grok.com"
      || frameUrls.some((href) => String(href).startsWith("https://grok.com/"));
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

(async () => {
  {
    const fixture = createApplyFixture({ registrations: [{ bridgeVersion: "current" }] });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.ok, true);
    assert.deepEqual(fixture.calls, { verify: 1, prepare: 0, send: 1, cancel: 0 });
  }

  {
    const fixture = createApplyFixture({ registrations: [null, { bridgeVersion: "current" }] });
    const result = await fixture.apply(fixture.iframe, fixture.record);
    assert.equal(result.ok, true);
    assert.equal(fixture.record.bridgeRecoveryAttempts, 1);
    assert.deepEqual(fixture.calls, { verify: 2, prepare: 1, send: 1, cancel: 0 });
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
    const fixture = createSummaryPrepareFixture();
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true);
    assert.equal(fixture.iframe.dataset.summaryRuntimeDocumentId, "doc-current");
    assert.equal(fixture.iframe.dataset.summaryRuntimeBridgeVersion, "bridge-current");
    assert.deepEqual(fixture.calls, { verify: 2, wait: 1, install: 1, probe: 1, remember: 1 });
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
      bindingRelayed: false
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "Chromium must bind through the targeted parent WindowProxy challenge when runtime.getFrameId is unavailable");
    assert.equal(fixture.bindingRequests, 1);
  }

  for (const failedInstall of [
    { label: "reported partial injection error", installErrors: ["content/preload.js failed"] },
    { label: "short injection count", injected: 4 },
    { label: "missing injection inventory", injectedFiles: undefined, omitInjectedFiles: true },
    { label: "missing injection plan", plannedFiles: [] },
    { label: "mismatched installed capability", installedFeatures: ["delete"] },
    { label: "missing browser document identity", omitBrowserDocumentId: true },
    { label: "missing authenticated binding relay", bindingRelayed: false }
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
  assert.match(poisonedRepairSource, /is aborted/);
  assert.match(poisonedRepairSource, /is superseded/);
  assert.match(repairSource, /contentFrameRepairIsPoisoned\(reason\)/);
  assert.match(repairSource, /CONTENT_FRAME_REPAIR_RETRY_DELAYS\[retryIndex\]/);
  assert.match(repairSource, /repairGenerations\.get\(iframe\) !== repairGeneration/);
  assert.match(repairSource, /scheduleContentFrameRepair\(iframe, nextDelay, retryIndex \+ 1, repairGeneration\)/);
  const iframeLoadSource = functionSource(frameBridge, "installPreferredModelIframeLoadHandler");
  assert.match(iframeLoadSource, /scheduleContentFrameRepair\(iframe, 120\)/);
  assert.ok(
    iframeLoadSource.indexOf("frameBindingChallenges.invalidate(iframe)")
      < iframeLoadSource.indexOf("delete iframe.dataset.injectedBrowserDocumentId"),
    "iframe navigation must invalidate the old challenge before clearing its injected browser document"
  );
  const initialFrameSource = functionSource(workspace, "setFrameSrcAfterPrepare");
  const assignedStart = initialFrameSource.indexOf("assigned = true");
  const setSrcStart = initialFrameSource.indexOf("const setSrc", assignedStart);
  const realSrcAssignment = initialFrameSource.indexOf('iframe.setAttribute("src", url)', setSrcStart);
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
    initSource.indexOf('action: "reloadConfigs"') < initSource.indexOf("workspaceController.hydrateGroups(workspaceSessionSnapshot)"),
    "the app must reconcile persisted registrations before creating iframe documents"
  );
  assert.match(workspace, /await sendToContentFrame\(iframe, "getLocationHref"/);
  assert.match(workspace, /async function refreshCurrentPage/);
  assert.match(summary, /prepareContentFrameRuntime\(iframe, \{ summary: true \}\)/);
  assert.match(summary, /expectedDocumentId: summaryReady\.registration\.documentId/);
  assert.match(summary, /expectedHref: base\.href/);
  const prepareSource = functionSource(frameBridge, "prepareContentFrameRuntimeUncached", true);
  assert.match(prepareSource, /runtimePort\(\)\.request\(iframe, "getSummaryRuntimeState", \{\}, \{ timeoutMs: 1800, skipEnsure: true \}\)/);
  assert.match(prepareSource, /summaryState\.documentId === registration\.documentId/);
  assert.match(prepareSource, /summaryState\.bridgeVersion === CONTENT_BRIDGE_VERSION/);
  assert.match(prepareSource, /confirmedRegistration\?\.documentId === registration\.documentId/);
  assert.match(prepareSource, /summaryRuntimeBridgeVersion/);
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
