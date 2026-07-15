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
const workspace = read("app/workspace/controller.js");
const summary = read("app/summary/controller.js");
const background = [
  "background/service-worker.js",
  "background/runtime.js",
  "background/frame-relay.js",
  "background/content-registration.js"
].map(read).join("\n");
const content = read("content/content.js");
const summaryMain = read("content/summary-userscripts-main.js");

function functionSource(source, name, asyncFunction = false) {
  const prefix = `${asyncFunction ? "async " : ""}function ${name}(`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} signature must close`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

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
  const registration = {
    browserDocumentId: options.registration?.browserDocumentId ?? "browser-document-9",
    documentId: "doc-current",
    bridgeVersion: "bridge-current",
    ...(options.registration || {})
  };
  const confirmedRegistration = options.confirmedRegistration === undefined
    ? registration
    : (options.confirmedRegistration
      ? { browserDocumentId: "browser-document-9", ...options.confirmedRegistration }
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
    CORE_BRIDGE_FILE_NAMES: [
      "content/preload.js",
      "content/grok-cookie-bridge.js",
      "content/message-navigator.js",
      "content/content.js"
    ],
    SUMMARY_BRIDGE_FILE_NAMES: [
      "content/summary-userscripts-main.js",
      "content/summary-userscripts.js"
    ],
    CONTENT_BRIDGE_VERSION: "bridge-current",
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
  context.contentFrameHrefHints = () => ["https://example.com/chat/current"];
  context.contentFramePreparationError = (result) => (result?.errors || []).join("; ");
  context.runtimeRequest = async () => {
    calls.install += 1;
    return {
      errors: options.installErrors || [],
      injected: options.injected ?? 6,
      ...(options.omitInjectedFiles ? {} : {
        injectedFiles: options.injectedFiles ?? [
          "content/preload.js@9",
          "content/summary-userscripts-main.js@9",
          "content/summary-userscripts.js@9",
          "content/grok-cookie-bridge.js@9",
          "content/message-navigator.js@9",
          "content/content.js@9"
        ]
      }),
      bindingRelayed: options.bindingRelayed ?? true,
      ...(options.omitBrowserDocumentId ? {} : {
        browserDocumentId: options.installedBrowserDocumentId ?? "browser-document-9"
      })
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
  context.runtimePort = () => ({ request: async (_iframe, action) => {
    calls.probe += 1;
    assert.equal(action, "getSummaryRuntimeState");
    if (options.probeError) throw options.probeError;
    return options.summaryState || {
      ready: true,
      mainReady: true,
      isolatedReady: true,
      documentId: registration.documentId,
      bridgeVersion: "bridge-current"
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
      dataset: { browserFrameId: "" },
      bindingRelayed: false
    });
    const result = await fixture.prepare(fixture.iframe, { summary: true });
    assert.equal(result.ok, true, "Chromium must bind through the targeted parent WindowProxy challenge when runtime.getFrameId is unavailable");
    assert.equal(fixture.bindingRequests, 1);
  }

  for (const failedInstall of [
    { label: "reported partial injection error", installErrors: ["content/preload.js failed"] },
    { label: "short injection count", injected: 5 },
    { label: "missing injection inventory", injectedFiles: undefined, omitInjectedFiles: true },
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
  const stateSource = functionSource(content, "getSummaryRuntimeState", true);
  assert.match(stateSource, /documentId: contentDocumentId/);
  assert.match(stateSource, /bridgeVersion: CONTENT_BRIDGE_VERSION/);
  assert.match(stateSource, /isolatedVersion === CONTENT_BRIDGE_VERSION/);
  const targetSource = functionSource(content, "assertSummaryTargetCurrent");
  assert.match(targetSource, /expectedDocumentId !== contentDocumentId/);
  assert.match(targetSource, /expectedHref !== String\(location\.href \|\| ""\)/);
  const collectSource = functionSource(content, "collectSummary", true);
  assert.match(collectSource, /assertSummaryTargetCurrent\(data\)/);
  assert.match(collectSource, /finishSummaryCollection\(data,/);
  const pageStateSource = functionSource(content, "pageSummaryRuntimeState");
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
  assert.match(background, /SUMMARY_BRIDGE_FILES/);
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
