#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const main = read("app/main.js");
const workspace = read("app/workspace/controller.js");
const summary = read("app/summary/controller.js");
const background = read("background/service-worker.js");
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
  const context = vm.createContext({
    Error,
    String,
    calls,
    iframe: { isConnected: true, contentWindow: {} },
    record: {
      payload: { appId: "Gemini", modelId: "pro" },
      runId: "run-1",
      bridgeRecoveryAttempted: false,
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
    return options.prepared || { ok: true };
  };
  context.preferredModelRecordIsCurrent = () => current;
  context.sendToIframe = async () => {
    calls.send += 1;
    if (options.sendError) throw options.sendError;
    return { ok: true, runId: "run-1" };
  };
  context.requestPreferredModelCancellation = () => { calls.cancel += 1; };
  vm.runInContext(`
    const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;
    const PREFERRED_MODEL_POST_MESSAGE_SOURCE = "preferred-model";
    ${functionSource(main, "preferredModelResult")}
    ${functionSource(main, "applyPreferredModelToFrame", true)}
    globalThis.apply = applyPreferredModelToFrame;
  `, context);
  return context;
}

function createSummaryPrepareFixture(options = {}) {
  const calls = { verify: 0, wait: 0, install: 0, probe: 0, remember: 0 };
  const registration = options.registration || {
    documentId: "doc-current",
    bridgeVersion: "bridge-current"
  };
  const confirmedRegistration = options.confirmedRegistration === undefined
    ? registration
    : options.confirmedRegistration;
  const iframe = {
    isConnected: true,
    dataset: { ...(options.dataset || {}) }
  };
  const context = vm.createContext({
    Boolean,
    Error,
    Number,
    String,
    CONTENT_BRIDGE_VERSION: "bridge-current",
    calls,
    iframe
  });
  context.verifiedCurrentContentFrameRegistration = async () => {
    calls.verify += 1;
    return calls.verify === 1 ? (options.initialRegistration || null) : confirmedRegistration;
  };
  context.currentExtensionTabId = async () => 7;
  context.contentFrameHrefHints = () => ["https://example.com/chat/current"];
  context.contentFramePreparationError = () => "";
  context.runtimeRequest = async () => {
    calls.install += 1;
    return { errors: options.installErrors || [] };
  };
  context.waitForCurrentContentFrameRegistration = async () => {
    calls.wait += 1;
    return registration;
  };
  context.sendToContentFrame = async (_iframe, action) => {
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
  };
  context.workspaceController = {
    frameApp: () => ({ url: "https://example.com/" }),
    rememberFrameLocation: (_iframe, currentRegistration) => {
      calls.remember += 1;
      context.rememberedRegistration = currentRegistration;
    }
  };
  vm.runInContext(`
    ${functionSource(main, "prepareContentFrameRuntimeUncached", true)}
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
    assert.equal(fixture.record.bridgeRecoveryAttempted, true);
    assert.deepEqual(fixture.calls, { verify: 2, prepare: 1, send: 1, cancel: 0 });
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

  assert.match(main, /announcedBridgeVersion === CONTENT_BRIDGE_VERSION/);
  assert.match(main, /scheduleContentFrameRepair\(event\.iframe, 120\)/);
  const initSource = functionSource(main, "init", true);
  assert.ok(
    initSource.indexOf('action: "reloadConfigs"') < initSource.indexOf("workspaceController.hydrateGroups()"),
    "the app must reconcile persisted registrations before creating iframe documents"
  );
  assert.match(workspace, /await sendToContentFrame\(iframe, "getLocationHref"/);
  assert.match(workspace, /async function refreshCurrentPage/);
  assert.match(summary, /prepareContentFrameRuntime\(iframe, \{ summary: true \}\)/);
  assert.match(summary, /expectedDocumentId: summaryReady\.registration\.documentId/);
  assert.match(summary, /expectedHref: base\.href/);
  const prepareSource = functionSource(main, "prepareContentFrameRuntimeUncached", true);
  assert.match(prepareSource, /sendToContentFrame\(iframe, "getSummaryRuntimeState", \{\}, 1800\)/);
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
  assert.match(summaryMain, /const SUMMARY_PAGE_RUNTIME_KEY = "__CHATCLUB_SUMMARY_PAGE_RUNTIME_V2__"/);
  assert.match(summaryMain, /previousSummaryPageRuntime\.dispose\?\.\(\)/);
  assert.match(summaryMain, /message\.action === "runtimeState"/);
  assert.match(summaryMain, /bridgeVersion: PROTOCOL\.CONTENT_BRIDGE_VERSION/);
  assert.doesNotMatch(summaryMain, /if \(!window\.__CHATCLUB_SUMMARY_PAGE_RUNTIME__\)/);
  assert.match(background, /verifiedExtensionTabId\(\{ appTabId: message\.tabId \}, sender\)/);
  assert.match(background, /frame\.parentFrameId === 0/);
  assert.doesNotMatch(functionSource(background, "ensureContentBridge", true), /allFrames/);
  assert.match(background, /SUMMARY_BRIDGE_FILES/);
  assert.match(background, /no matching direct child iframe found for the requested target/);

  console.log("content bridge recovery: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
