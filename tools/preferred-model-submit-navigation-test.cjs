#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const mainSource = ["app/main.js", "app/runtime.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const preferredModelSource = fs.readFileSync(path.join(root, "app/preferred-model/controller.js"), "utf8");
const frameBridgeSource = fs.readFileSync(path.join(root, "app/frame-bridge/controller.js"), "utf8");
const parentSource = `${mainSource}\n${frameBridgeSource}`;
const contentSource = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const contentEntrySource = fs.readFileSync(path.join(root, "content-src/content.js"), "utf8");
const sendEntrySource = fs.readFileSync(path.join(root, "content-src/capabilities/send-runtime.js"), "utf8");
const preferredCapabilitySource = [
  "content-src/shared/dom-runtime.js",
  "content-src/capabilities/preferred-common.js",
  "content-src/capabilities/preferred-gemini.js",
  "content-src/capabilities/preferred-grok.js",
  "content-src/capabilities/preferred-notion-deepseek.js"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const submissionNavigationSource = fs.readFileSync(path.join(root, "content-src/shared/submission-navigation.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "content/preload.js"), "utf8");
const preloadEntrySource = fs.readFileSync(path.join(root, "content-src/preload.js"), "utf8");
const notionSendSource = fs.readFileSync(path.join(root, "content-src/preload/notion-send.js"), "utf8");
const notionUtilsSource = fs.readFileSync(path.join(root, "content-src/preload/notion-utils.js"), "utf8");
const workspaceFrameSource = fs.readFileSync(path.join(root, "app/workspace/frame-controller.js"), "utf8");
const frameCommandsSource = fs.readFileSync(path.join(root, "shared/frame-commands.js"), "utf8");
const protocolSource = fs.readFileSync(path.join(root, "shared/protocol.js"), "utf8");
const contentBackgroundRequestsSource = fs.readFileSync(
  path.join(root, "shared/content-background-requests.js"),
  "utf8"
);
const modelPreferenceConsoleSource = fs.readFileSync(path.join(root, "tools/model-preference-console-probe.js"), "utf8");
const modelPreferenceBridgeProbeSource = fs.readFileSync(
  path.join(root, "tools/model-preference-plugin-bridge-probe.js"),
  "utf8"
);
const grokPostMessageConsoleSource = fs.readFileSync(path.join(root, "tools/grok-postmessage-console.js"), "utf8");

function protocolString(name) {
  const match = protocolSource.match(new RegExp(`(?:export\\s+)?const ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;`));
  assert.ok(match, `shared protocol must declare ${name}`);
  return JSON.parse(match[1]);
}

function assertProtocolBinding(source, name, label) {
  assert.match(
    source,
    new RegExp(`(?:const|var)\\s+${name}\\d*\\s*=\\s*(?:PROTOCOL|protocol)\\.${name}\\s*;`),
    `${label} must consume ${name} from the bundled shared protocol`
  );
}

const { functionSource } = require("./function-source.cjs");

const retryContext = vm.createContext({});
vm.runInContext(
  `${functionSource(preferredModelSource, "preferredModelRetryDelay")}; globalThis.retryDelay = preferredModelRetryDelay;`,
  retryContext
);
const retryRecord = { attempt: 0, delays: [0, 700, 1600] };
for (const reason of [
  "navigation changed",
  "content bridge superseded",
  "superseded by a newer preferred model run",
  "stale Gemini model picker run",
  "future cancellation reason"
]) {
  assert.equal(
    retryContext.retryDelay(retryRecord, { cancelled: true, interactionCount: 0, reason }),
    700,
    `${reason} must use the same bounded, reason-independent retry policy`
  );
}
assert.equal(
  retryContext.retryDelay(retryRecord, { cancelled: true, interactionCount: 1 }),
  null,
  "a cancelled preferred-model run must not replay after interacting with the site"
);
assert.equal(
  retryContext.retryDelay({ attempt: 2, delays: [0, 700, 1600] }, { cancelled: true, interactionCount: 0 }),
  null,
  "a cancelled preferred-model run must become terminal after exhausting its retry budget"
);
assert.equal(
  retryContext.retryDelay(retryRecord, { retryable: true, interactionCount: 1 }),
  null,
  "even a retryable result must not replay after a site interaction"
);

const preferredModelRunSource = functionSource(preferredModelSource, "runPreferredModelRecord");
assert.match(
  preferredModelRunSource,
  /preferredModelFrameIsLoading\(iframe\)[\s\S]*record\.pending = true;[\s\S]*return;/,
  "a preferred-model timer must not execute while its iframe is still loading"
);
assert.match(
  preferredModelRunSource,
  /const retryDelay = preferredModelRetryDelay\(record, result\);[\s\S]*record\.cancelled = false;[\s\S]*record\.attempt \+= 1;[\s\S]*schedulePreferredModelRecordRun\(iframe, record, retryDelay\)/,
  "current cancellations without interactions must consume the existing record's bounded retry budget"
);
assert.doesNotMatch(
  preferredModelRunSource,
  /content bridge superseded/,
  "preferred-model cancellation recovery must not depend on brittle reason matching"
);
assert.match(
  preferredModelRunSource,
  /record\.terminal = true;[\s\S]*record\.failureReason = record\.fallbackAttempted[\s\S]*compactPreferredModelFailureReason\(finalResult\);[\s\S]*record\.statusToast\?\.dismiss\?\.\(5000\)/,
  "non-retryable or exhausted cancellations must reach an error-toast terminal state"
);
const preferredModelScheduleSource = functionSource(preferredModelSource, "schedulePreferredModelApplyToFrame");
assert.match(
  preferredModelScheduleSource,
  /preferredModelFrameIsLoading\(iframe\)[\s\S]*stopPreferredModelRecord\(iframe, existing, "frame-loading"\)[\s\S]*return null;/,
  "workspace synchronization must not create or retain a preferred-model run for a loading iframe"
);
assert.match(
  preferredModelScheduleSource,
  /preferredModelFrameIsLoading\(iframe\)[\s\S]*existing\?\.key === key && existingIsSettled[\s\S]*return existing;[\s\S]*stopPreferredModelRecord/,
  "a stale loading marker must not erase a same-document settled run before readiness can wake queued sends"
);
assert.match(
  preferredModelScheduleSource,
  /existingIsSettled = Boolean\(existing\?\.success \|\| existing\?\.terminal\)[\s\S]*existing\?\.key === key && \(existingIsSettled \|\| existingIsRunning\)/,
  "same-key terminal cancellations must stay settled instead of silently resetting their retry budget"
);
const preferredModelApplySource = functionSource(preferredModelSource, "applyPreferredModelToFrame");
assert.match(
  preferredModelApplySource,
  /expectedDocumentId:\s*registration\.documentId/,
  "a preferred-model run must remain bound to the exact verified content document"
);

const routeContext = vm.createContext({ URL });
vm.runInContext(
  `${functionSource(preferredModelSource, "preferredModelSubmissionRouteState")}; globalThis.routeState = preferredModelSubmissionRouteState;`,
  routeContext
);
const routeState = (appId, href) => JSON.parse(JSON.stringify(routeContext.routeState(appId, href)));

assert.deepEqual(routeState("Gemini", "https://gemini.google.com/app"), { host: "gemini.google.com", phase: "start" });
assert.deepEqual(routeState("Gemini", "https://gemini.google.com/app/conversation-1"), { host: "gemini.google.com", phase: "terminal", threadId: "conversation-1" });
assert.equal(routeState("Gemini", "https://gemini.google.com/gems"), null);
assert.deepEqual(routeState("NotionAI", "https://app.notion.com/ai"), { host: "app.notion.com", phase: "start" });
assert.deepEqual(routeState("NotionAI", "https://app.notion.com/chat"), { host: "app.notion.com", phase: "intermediate" });
assert.deepEqual(routeState("NotionAI", "https://app.notion.com/chat?t=thread-1"), { host: "app.notion.com", phase: "terminal", threadId: "thread-1" });
assert.equal(routeState("NotionAI", "https://app.notion.com/page/other"), null);

const contentCorrelationContext = vm.createContext({
  URL,
  location: { href: "https://gemini.google.com/app/fallback-thread" }
});
vm.runInContext(`
  ${functionSource(sendEntrySource, "submissionNavigationBarrierState")}
  ${functionSource(sendEntrySource, "submissionNavigationCorrelation")}
  globalThis.correlation = submissionNavigationCorrelation;
`, contentCorrelationContext);
const exactStartCorrelation = JSON.parse(JSON.stringify(contentCorrelationContext.correlation(
  { sendId: "send-content" },
  "Gemini",
  { sendId: "send-content", initialHref: "https://gemini.google.com/app" },
  "button"
)));
assert.equal(exactStartCorrelation.barrierState, "required");
assert.equal(exactStartCorrelation.initialHref, "https://gemini.google.com/app");
const exactTerminalCorrelation = JSON.parse(JSON.stringify(contentCorrelationContext.correlation(
  { sendId: "send-content" },
  "Gemini",
  { sendId: "send-content", initialHref: "https://gemini.google.com/app/live-thread" },
  "enter"
)));
assert.equal(exactTerminalCorrelation.barrierState, "not-required");

const notionCorrelationContext = vm.createContext({ URL });
vm.runInContext(`
  ${functionSource(notionUtilsSource, "createNotionSubmissionNavigation")}
  globalThis.correlation = createNotionSubmissionNavigation;
`, notionCorrelationContext);
assert.equal(notionCorrelationContext.correlation("send-notion", "button", "https://app.notion.com/ai").barrierState, "required");
assert.equal(notionCorrelationContext.correlation("send-notion", "button", "https://app.notion.com/chat").barrierState, "required");
assert.equal(notionCorrelationContext.correlation("send-notion", "button", "https://app.notion.com/chat?t=live-thread").barrierState, "not-required");

let leaseNow = Date.now();
let leaseTimerId = 0;
const leaseTimers = new Map();
const leaseContext = vm.createContext({
  URL,
  Date: { now: () => leaseNow },
  clearTimeout(timerId) {
    leaseTimers.delete(timerId);
  },
  window: {
    setTimeout(callback, delay) {
      const timerId = ++leaseTimerId;
      leaseTimers.set(timerId, { callback, dueAt: leaseNow + Math.max(0, Number(delay) || 0) });
      return timerId;
    }
  }
});
vm.runInContext(`
  const MODEL_PREFERENCE_APP_ID_ALIASES = Object.freeze({ Gemini: "Gemini", NotionAI: "NotionAI" });
  const MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS = 15000;
  const preferredModelApplyRuns = new Map();
  const preferredModelSubmissionNavigations = new WeakMap();
  const preferredModelSubmissionNavigationFrames = new Set();
  const preferredModelSubmissionOutcomes = new WeakMap();
  const preferredModelSubmissionWaiters = new Set();
  var currentPreferredModelKey = "target:document-1";
  var currentPreferredModelAppId = "Gemini";
  function preferredModelFrameKey() { return currentPreferredModelKey; }
  function preferredModelAppId(app) { return String(app?.id || ""); }
  function preferredModelFrameReadinessIsCurrent() { return true; }
  function activeWorkspace() {
    return { frameApp: () => ({ id: currentPreferredModelAppId }) };
  }
  function preferredModelAbortError(reason) {
    const error = new Error(reason || "aborted");
    error.name = "AbortError";
    error.code = "ABORTED";
    error.delivered = false;
    return error;
  }
  ${functionSource(preferredModelSource, "preferredModelSubmissionRouteState")}
  ${functionSource(preferredModelSource, "preferredModelSubmissionRouteRequirement")}
  ${functionSource(preferredModelSource, "bindPreferredModelSubmissionInitialRoute")}
  ${functionSource(preferredModelSource, "preferredModelSubmissionCorrelation")}
  ${functionSource(preferredModelSource, "preferredModelSubmissionBarrierSnapshot")}
  ${functionSource(preferredModelSource, "preferredModelSubmissionBarrierError")}
  ${functionSource(preferredModelSource, "settlePreferredModelSubmissionWaiter")}
  ${functionSource(preferredModelSource, "notifyPreferredModelSubmissionWaiters")}
  ${functionSource(preferredModelSource, "waitForPreferredModelSubmissionBarrier")}
  ${functionSource(preferredModelSource, "clearPreferredModelSubmissionNavigation")}
  ${functionSource(preferredModelSource, "schedulePreferredModelSubmissionNavigationExpiry")}
  ${functionSource(preferredModelSource, "armPreferredModelSubmissionNavigation")}
  ${functionSource(preferredModelSource, "finishPreferredModelSubmissionNavigation")}
  ${functionSource(preferredModelSource, "preservePreferredModelForSubmissionNavigation")}
  globalThis.runs = preferredModelApplyRuns;
  globalThis.navigations = preferredModelSubmissionNavigations;
  globalThis.navigationFrames = preferredModelSubmissionNavigationFrames;
  globalThis.outcomes = preferredModelSubmissionOutcomes;
  globalThis.waiters = preferredModelSubmissionWaiters;
  globalThis.waitForBarrier = waitForPreferredModelSubmissionBarrier;
  globalThis.arm = (iframe, sendId, deadlineAt, readiness) => armPreferredModelSubmissionNavigation(iframe, sendId, deadlineAt, readiness);
  globalThis.setAppId = (appId) => { currentPreferredModelAppId = appId; };
  globalThis.clearLease = clearPreferredModelSubmissionNavigation;
  globalThis.scheduleExpiry = schedulePreferredModelSubmissionNavigationExpiry;
  globalThis.finish = finishPreferredModelSubmissionNavigation;
  globalThis.preserve = preservePreferredModelForSubmissionNavigation;
`, leaseContext);

function advanceLeaseClock(duration) {
  leaseNow += Math.max(0, Number(duration) || 0);
  for (const [timerId, timer] of [...leaseTimers.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)) {
    if (timer.dueAt > leaseNow) continue;
    leaseTimers.delete(timerId);
    timer.callback();
  }
}

function navigationFixture(appId, initialHref, lastPhase) {
  const iframe = { isConnected: true };
  const record = {
    success: true,
    cancelled: false,
    key: "target:document-1"
  };
  const lease = {
    sendId: "send-1",
    appId,
    initialHref,
    initialHost: new URL(initialHref).hostname,
    documentId: "document-1",
    bridgeVersion: "bridge-1",
    recordKey: "target:document-1",
    hardExpiresAt: leaseNow + 60000,
    expiresAt: leaseNow + 60000,
    terminalObserved: false,
    terminalThreadId: "",
    lastHref: initialHref,
    lastPhase,
    timer: 0
  };
  leaseContext.runs.set(iframe, record);
  leaseContext.navigations.set(iframe, lease);
  leaseContext.navigationFrames.add(iframe);
  leaseContext.outcomes.delete(iframe);
  return { iframe, record, lease };
}

function correlatedEvent(previousHref, href, overrides = {}) {
  const appId = overrides.appId || "Gemini";
  const initialHref = overrides.initialHref
    || (appId === "NotionAI" ? "https://app.notion.com/ai" : "https://gemini.google.com/app");
  return {
    previousHref,
    href,
    navigation: {
      kind: "pushState",
      documentId: "document-1",
      bridgeVersion: "bridge-1",
      submission: { sendId: "send-1", appId, initialHref },
      ...overrides
    }
  };
}

function observedBarrier(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({
      ok: false,
      name: error?.name,
      code: error?.code,
      delivered: error?.delivered,
      barrierState: error?.barrierState
    })
  );
}

async function runSubmissionLeaseTests() {
  {
    leaseContext.setAppId("Gemini");
    const cachedTerminal = "https://gemini.google.com/app/cached-thread";
    const actualStart = "https://gemini.google.com/app";
    const actualTerminal = "https://gemini.google.com/app/actual-thread";
    const iframe = {
      isConnected: true,
      src: cachedTerminal,
      dataset: {
        currentHref: cachedTerminal,
        preferredModelDocumentId: "document-1",
        preferredModelContentBridgeVersion: "bridge-1"
      }
    };
    const lease = leaseContext.arm(iframe, "send-1", leaseNow + 12000);
    assert.ok(lease, "Gemini must provisionally arm even when the parent cache still says terminal");
    leaseContext.finish(iframe, "send-1", true, {
      sendId: "send-1",
      appId: "Gemini",
      initialHref: actualStart,
      barrierState: "required",
      method: "button"
    });
    let released = false;
    const barrier = leaseContext.waitForBarrier(iframe, "send-1").then((snapshot) => {
      released = true;
      return snapshot;
    });
    await Promise.resolve();
    assert.equal(released, false, "the exact start route must hold S2 despite a cached terminal parent route");
    assert.equal(
      leaseContext.preserve(iframe, correlatedEvent(actualStart, actualTerminal, { appId: "Gemini", initialHref: actualStart })),
      true
    );
    assert.equal((await barrier).state, "complete");
  }

  {
    leaseContext.setAppId("NotionAI");
    const cachedStart = "https://app.notion.com/ai";
    const actualTerminal = "https://app.notion.com/chat?t=existing-thread";
    const iframe = {
      isConnected: true,
      src: cachedStart,
      dataset: {
        currentHref: cachedStart,
        preferredModelDocumentId: "document-1",
        preferredModelContentBridgeVersion: "bridge-1"
      }
    };
    leaseContext.arm(iframe, "send-1", leaseNow + 12000);
    leaseContext.finish(iframe, "send-1", true, {
      sendId: "send-1",
      appId: "NotionAI",
      initialHref: actualTerminal,
      barrierState: "not-required",
      method: "notion-button"
    });
    const snapshot = await leaseContext.waitForBarrier(iframe, "send-1");
    assert.equal(snapshot.state, "complete", "the exact terminal route must release immediately despite a cached start route");
    assert.equal(leaseContext.navigations.get(iframe), undefined);
  }

  {
    leaseContext.setAppId("Gemini");
    const iframe = {
      isConnected: true,
      dataset: {
        currentHref: "https://gemini.google.com/app",
        preferredModelDocumentId: "document-1"
      }
    };
    assert.throws(
      () => leaseContext.arm(iframe, "send-1", leaseNow + 12000),
      (error) => error?.code === "NOT_REGISTERED" && error?.delivered === false,
      "a Gemini/Notion provisional barrier must fail before delivery when bridge identity is missing"
    );
  }

  leaseContext.setAppId("Gemini");
  {
    const initial = "https://gemini.google.com/app";
    const terminal = "https://gemini.google.com/app/thread-a";
    const fixture = navigationFixture("Gemini", initial, "start");
    let nextSameFrameMessageAdvanced = false;
    const barrier = leaseContext.waitForBarrier(fixture.iframe, "send-1").then((snapshot) => {
      nextSameFrameMessageAdvanced = true;
      return snapshot;
    });
    leaseContext.finish(fixture.iframe, "send-1", true, {
      sendId: "send-1",
      appId: "Gemini",
      initialHref: initial,
      barrierState: "required",
      method: "button"
    });
    await Promise.resolve();
    assert.equal(
      nextSameFrameMessageAdvanced,
      false,
      "a successful send must not advance the next same-frame message before terminal navigation"
    );
    assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(initial, terminal, { appId: "Gemini" })), true);
    assert.equal(fixture.lease.terminalThreadId, "thread-a");
    assert.equal(leaseContext.runs.get(fixture.iframe), fixture.record, "Gemini submission routing must preserve the model run");
    assert.equal((await barrier).state, "complete", "terminal routing must resolve the submission barrier");
    assert.equal(nextSameFrameMessageAdvanced, true, "the next same-frame message may advance after the terminal route");
    const sameThread = "https://gemini.google.com/app/thread-a?hl=en";
    assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(terminal, sameThread, { kind: "replaceState", appId: "Gemini" })), true);
    const otherThread = "https://gemini.google.com/app/thread-b";
    assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(sameThread, otherThread, { appId: "Gemini" })), false);
    assert.equal(leaseContext.navigations.get(fixture.iframe), undefined, "a different Gemini thread must invalidate the lease");
  }

  {
    const initial = "https://app.notion.com/ai";
    const intermediate = "https://app.notion.com/chat";
    const terminal = "https://app.notion.com/chat?t=thread-a";
    const fixture = navigationFixture("NotionAI", initial, "start");
    let released = false;
    const barrier = leaseContext.waitForBarrier(fixture.iframe, "send-1").then((snapshot) => {
      released = true;
      return snapshot;
    });
    assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(initial, intermediate, { appId: "NotionAI" })), true);
    await Promise.resolve();
    assert.equal(fixture.lease.terminalObserved, false, "Notion intermediate route must retain the lease");
    assert.equal(released, false, "Notion intermediate routing must not release the next same-frame message");
    assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(intermediate, terminal, { kind: "replaceState", appId: "NotionAI" })), true);
    assert.equal(fixture.lease.terminalThreadId, "thread-a");
    assert.equal((await barrier).state, "complete", "Notion terminal routing must resolve the submission barrier");
  }

  for (const invalid of [
    { label: "wrong send id", overrides: { submission: { sendId: "send-2", appId: "Gemini" } } },
    { label: "wrong document", overrides: { documentId: "document-2", appId: "Gemini" } },
    { label: "wrong bridge", overrides: { bridgeVersion: "bridge-2", appId: "Gemini" } },
    { label: "wrong app", overrides: { appId: "NotionAI" } },
    { label: "manual popstate", overrides: { kind: "popstate", submission: undefined, appId: "Gemini" } },
    { label: "non-contiguous route", previousHref: "https://gemini.google.com/app/other", overrides: { appId: "Gemini" } }
  ]) {
    const initial = "https://gemini.google.com/app";
    const fixture = navigationFixture("Gemini", initial, "start");
    const barrier = observedBarrier(leaseContext.waitForBarrier(fixture.iframe, "send-1"));
    const event = correlatedEvent(
      invalid.previousHref || initial,
      "https://gemini.google.com/app/thread-a",
      invalid.overrides
    );
    assert.equal(leaseContext.preserve(fixture.iframe, event), false, invalid.label);
    assert.equal(leaseContext.navigations.get(fixture.iframe), undefined, `${invalid.label} must clear the exact lease`);
    assert.deepEqual(
      await barrier,
      {
        ok: false,
        name: "SubmissionNavigationError",
        code: "SUBMISSION_BARRIER_UNCERTAIN",
        delivered: true,
        barrierState: "invalidated"
      },
      `${invalid.label} must reject the barrier as an uncertain delivered state`
    );
  }

  {
    const fixture = navigationFixture("Gemini", "https://gemini.google.com/app", "start");
    fixture.iframe.isConnected = false;
    await assert.rejects(
      leaseContext.waitForBarrier(fixture.iframe, "send-1"),
      (error) => error?.code === "SUBMISSION_BARRIER_UNCERTAIN" && error?.barrierState === "detached",
      "a detached iframe must fail the submission barrier immediately instead of holding its queue"
    );
    leaseContext.clearLease(fixture.iframe, "detached", "iframe detached during submission navigation");
    assert.equal(leaseContext.navigationFrames.has(fixture.iframe), false);
  }

  {
    const fixture = navigationFixture("Gemini", "https://gemini.google.com/app", "start");
    fixture.lease.expiresAt = leaseNow + 25;
    fixture.lease.hardExpiresAt = fixture.lease.expiresAt;
    const barrier = observedBarrier(leaseContext.waitForBarrier(fixture.iframe, "send-1"));
    leaseContext.scheduleExpiry(fixture.iframe, fixture.lease);
    advanceLeaseClock(25);
    assert.deepEqual(
      await barrier,
      {
        ok: false,
        name: "SubmissionNavigationError",
        code: "SUBMISSION_BARRIER_UNCERTAIN",
        delivered: true,
        barrierState: "expired"
      },
      "an expired submission lease must reject the barrier as uncertain"
    );
    assert.equal(leaseContext.navigations.get(fixture.iframe), undefined, "expiry must remove the WeakMap lease");
  }

  assert.equal(leaseContext.waiters.size, 0, "terminal and failed barriers must release all waiters");
}

const locationReportSource = functionSource(contentEntrySource, "reportLocationChange");
assert.doesNotMatch(locationReportSource, /contentDocumentId\s*=/, "SPA navigation must not replace the real document id");
assert.match(locationReportSource, /postLocationChanged\(/, "SPA navigation must use the dedicated location message");
assert.match(locationReportSource, /previousHref/, "location messages must preserve the previous href");
assert.match(locationReportSource, /requireCurrentHref/, "stale queued history notifications must be ignored");

const frameKeySource = functionSource(preferredModelSource, "preferredModelFrameKey");
assert.doesNotMatch(frameKeySource, /currentHref|iframe\.src/, "preferred-model identity must not change for an SPA href");
const notionPreferenceContext = vm.createContext({});
vm.runInContext(`
  const NOTION_ALL_SOURCES_PREFERENCE_KEY = "NotionAIAllSources";
  const NOTION_ALL_SOURCES_PREFERENCE_VALUES = Object.freeze(["", "enabled", "disabled"]);
  const DEFAULT_GEMINI_THINKING_LEVEL = "standard";
  const GEMINI_THINKING_LEVEL_PREFERENCE_KEY = "GeminiThinkingLevel";
  const GEMINI_THINKING_LEVEL_TARGETS = Object.freeze([{ id: "standard" }]);
  const MODEL_PREFERENCE_SECONDARY_ENABLED_KEY = "SecondaryModelEnabled";
  const MODEL_PREFERENCE_SECONDARY_KEYS = Object.freeze({ NotionAI: "NotionAISecondary" });
  const MODEL_PREFERENCE_APP_ID_ALIASES = Object.freeze({ NotionAI: "NotionAI", "Notion AI": "NotionAI" });
  const MODEL_PREFERENCE_TARGETS = Object.freeze({
    NotionAI: Object.freeze([
      { id: "gpt54", label: "GPT-5.4" },
      { id: "fable5", label: "Fable 5" }
    ])
  });
  const preferredModelState = {
    options: { modelPreferences: {} },
    modelPreferenceDraft: null
  };
  const iframe = { dataset: { preferredModelDocumentId: "document-1" } };
  const workspace = { frameApp: () => ({ id: "NotionAI" }) };
  function activeWorkspace() { return workspace; }
  ${functionSource(preferredModelSource, "preferredModelAppId")}
  ${functionSource(preferredModelSource, "preferredModelForApp")}
  ${functionSource(preferredModelSource, "preferredSecondaryModelForApp")}
  ${functionSource(preferredModelSource, "preferredGeminiThinkingLevel")}
  ${functionSource(preferredModelSource, "preferredNotionAllSourcesState")}
  ${functionSource(preferredModelSource, "preferredModelPayloadForApp")}
  ${frameKeySource}
  globalThis.state = preferredModelState;
  globalThis.payload = () => preferredModelPayloadForApp({ id: "NotionAI" });
  globalThis.frameKey = () => preferredModelFrameKey(iframe);
`, notionPreferenceContext);
const notionPayload = () => {
  const value = notionPreferenceContext.payload();
  return value == null ? null : JSON.parse(JSON.stringify(value));
};
assert.equal(notionPayload(), null, "Notion remains unconfigured when neither a model nor All Sources is preferred");
notionPreferenceContext.state.options.modelPreferences.NotionAIAllSources = "enabled";
assert.deepEqual(
  notionPayload(),
  { appId: "NotionAI", modelId: "", allSourcesState: "enabled" },
  "All Sources must be applicable without forcing a model preference"
);
assert.equal(
  notionPreferenceContext.frameKey(),
  "NotionAI::sources=enabled:document-1",
  "the desired source state must participate in the per-document apply identity"
);
notionPreferenceContext.state.options.modelPreferences.NotionAI = "gpt54";
notionPreferenceContext.state.options.modelPreferences.NotionAIAllSources = "disabled";
assert.deepEqual(
  notionPayload(),
  { appId: "NotionAI", modelId: "gpt54", allSourcesState: "disabled" },
  "model and source preferences must travel in one controlled Notion run"
);
assert.equal(
  notionPreferenceContext.frameKey(),
  "NotionAI:gpt54:sources=disabled:document-1",
  "changing the source preference must invalidate a settled model-only frame key"
);
notionPreferenceContext.state.options.modelPreferences.SecondaryModelEnabled = true;
notionPreferenceContext.state.options.modelPreferences.NotionAISecondary = "fable5";
assert.deepEqual(
  notionPayload(),
  { appId: "NotionAI", modelId: "gpt54", secondaryModelId: "fable5", allSourcesState: "disabled" },
  "an enabled secondary model must remain part of the parent-only apply plan"
);
assert.equal(
  notionPreferenceContext.frameKey(),
  "NotionAI:gpt54:secondary=fable5:sources=disabled:document-1",
  "changing the secondary model must invalidate a settled per-document apply identity"
);
notionPreferenceContext.state.options.modelPreferences.NotionAI = "";
notionPreferenceContext.state.options.modelPreferences.NotionAIAllSources = "invalid";
assert.equal(notionPayload(), null, "unknown stored source states must fail normalization to no preference");
assert.match(
  preferredModelSource,
  /const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;/,
  "model-only runs must retain their existing bounded parent timeout"
);
assert.match(
  preferredModelSource,
  /const NOTION_ALL_SOURCES_APPLY_TIMEOUT_MS = 48000;/,
  "the opt-in source parent timeout must outlive the 44s Notion content run and cleanup margin"
);
assert.match(
  preferredModelSource,
  /timeoutMs:\s*preferredModelApplyTimeoutMs\(payload\)/,
  "only payloads carrying an All Sources preference may use the extended parent timeout"
);
assert.match(
  frameCommandsSource,
  /applyPreferredModel:\s*command\(\{\s*timeoutMs:\s*50000,/,
  "the Frame RPC command ceiling must outlive the preferred-model parent deadline"
);
assert.match(
  contentEntrySource,
  /requestBackground\(RELAY_FRAME_LIFECYCLE_REQUEST,/,
  "content must relay lifecycle events through the typed background request client"
);
assert.match(
  contentBackgroundRequestsSource,
  /RELAY_FRAME_LIFECYCLE_REQUEST\s*=\s*[\s\S]*?request\(\s*"relayFrameLifecycle",/,
  "the content request domain must bind lifecycle relays to the canonical background action"
);
assert.match(parentSource, /message\.action !== "frameLifecycle"/, "parent must handle authenticated lifecycle relays");
assert.match(parentSource, /EXTENSION_RUNTIME_RELAY_SOURCE/, "parent lifecycle handling must use the extension runtime relay source");
assert.match(workspaceFrameSource, /emitFrameLifecycleChange\(\{ type: "location"[^\n]+navigation \}\)/, "workspace must forward navigation correlation metadata");
assert.match(workspaceFrameSource, /hrefChanged \|\| navigation\?\.forced === true/, "forced same-href popstate must still emit a lifecycle event");
assert.match(workspaceFrameSource, /iframe\.dataset\.currentHref === href/, "stale favicon discovery must not roll frame location backward");

for (const [name, consumers] of [
  ["SEND_TEXT_POST_MESSAGE_SOURCE", [[contentSource, "isolated content"]]],
  ["MAIN_WORLD_LOCATION_SOURCE", [[contentSource, "isolated content"], [preloadSource, "MAIN preload"]]],
  ["NOTION_SEND_ACTIVATED_EVENT", [[contentSource, "isolated content"], [preloadSource, "MAIN preload"]]]
]) {
  const canonicalValue = protocolString(name);
  for (const [source, label] of consumers) {
    assert.ok(source.includes(JSON.stringify(canonicalValue)), `${label} must bundle canonical ${name}`);
    assertProtocolBinding(source, name, label);
  }
}
const preferredModelPostMessageSource = protocolString("PREFERRED_MODEL_POST_MESSAGE_SOURCE");
for (const [source, label] of [
  [modelPreferenceBridgeProbeSource, "preferred-model bridge probe"],
  [grokPostMessageConsoleSource, "Grok preferred-model console probe"]
]) {
  assert.ok(
    source.includes(JSON.stringify(preferredModelPostMessageSource)),
    `${label} must use the current versioned preferred-model protocol source`
  );
}
for (const [source, label] of [[contentEntrySource, "isolated content source"], [preloadEntrySource, "MAIN preload source"]]) {
  assert.match(
    source,
    /import\s*\{\s*CONTENT_PROTOCOL\s*\}\s*from "\.\.\/shared\/protocol\.js";/,
    `${label} must import the shared protocol`
  );
}
assert.match(frameCommandsSource, /sendText:\s*command\(\{[^}]*mutating:\s*true/, "sendText must use exactly-once Frame RPC semantics");
assert.match(frameCommandsSource, /applyPreferredModel:\s*command\(\{[^}]*mutating:\s*true/, "preferred model apply must use exactly-once Frame RPC semantics");
assert.match(preloadSource, /detail: JSON\.stringify\(/, "Notion cross-world activation detail must be Firefox-safe JSON");

const sendTextSource = functionSource(sendEntrySource, "sendTextUncached");
assert.ok(
  sendTextSource.indexOf('markSubmissionNavigation(data, "button")') < sendTextSource.indexOf("clickPromptSubmit(submit)"),
  "generic submit correlation must be armed before the button activation"
);
assert.ok(
  sendTextSource.indexOf('markSubmissionNavigation(data, "enter")') < sendTextSource.indexOf('input.dispatchEvent(new KeyboardEvent("keydown"'),
  "generic submit correlation must be armed before Enter"
);
assert.match(
  sendTextSource,
  /submissionNavigationCorrelation\(data, "Gemini", marked, "(?:button|enter)"\)/,
  "Gemini send results must describe the exact content route captured at activation"
);
assert.match(
  notionSendSource,
  /initialHref = String\(location\.href \|\| ""\)/,
  "Notion must capture its actual MAIN-world route immediately before activation"
);
assert.match(
  notionSendSource,
  /submissionNavigation: sent\.submissionNavigation/,
  "Notion must propagate exact-route correlation through its send result"
);

const armSubmissionSource = functionSource(preferredModelSource, "armPreferredModelSubmissionNavigation");
assert.doesNotMatch(
  armSubmissionSource,
  /currentHref|iframe\?\.src|initialRoute/,
  "parent provisional barrier arming must not guess eligibility from its cached iframe route"
);
assert.match(
  armSubmissionSource,
  /!documentId \|\| !bridgeVersion[\s\S]*error\.code = "NOT_REGISTERED"[\s\S]*error\.delivered = false/,
  "barrier targets with incomplete exact-document identity must fail before delivery"
);

const preserveSource = functionSource(preferredModelSource, "preservePreferredModelForSubmissionNavigation");
assert.match(preserveSource, /submission\.sendId[^\n]+lease\.sendId/, "parent must match the exact send id");
assert.match(preserveSource, /navigation\.documentId[^\n]+lease\.documentId/, "parent must match the exact document id");
assert.match(preserveSource, /navigation\.bridgeVersion[^\n]+lease\.bridgeVersion/, "parent must match the exact bridge version");
assert.match(preserveSource, /\["pushstate", "replacestate", "poll"\]/, "manual popstate/hashchange navigation must not inherit submission state");
assert.match(preserveSource, /event\.previousHref[^\n]+lease\.lastHref/, "submission navigation chains must be contiguous");
assert.match(preserveSource, /nextRoute\.threadId[^\n]+lease\.terminalThreadId/, "a settled submission lease must not follow a different thread");
assert.match(
  preserveSource,
  /preferredModelSubmissionOutcomes\.set\(iframe,[\s\S]*state: "complete"[\s\S]*notifyPreferredModelSubmissionWaiters\(iframe\)/,
  "a terminal route must publish completion and wake the per-frame submission barrier"
);

const finishSubmissionSource = functionSource(preferredModelSource, "finishPreferredModelSubmissionNavigation");
assert.match(
  finishSubmissionSource,
  /if \(lease\.terminalObserved\) \{[\s\S]*notifyPreferredModelSubmissionWaiters\(iframe\);[\s\S]*return;/,
  "a terminal observation may release waiters when the send operation settles"
);
assert.match(
  finishSubmissionSource,
  /Date\.now\(\) \+ \(sent \? MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS : 2000\)/,
  "send completion without a terminal route must retain a bounded barrier instead of releasing the next message"
);

assert.match(preferredCapabilitySource, /findNotionModelIndicator\(\)/, "Notion must expose a read-only model indicator lookup");
assert.match(preferredCapabilitySource, /findNotionModelControl\(\{ allowDisabled: true \}\)/, "disabled Notion model controls must remain readable");
assert.match(preferredCapabilitySource, /function findNotionModelTrigger\(\)[\s\S]*?findNotionModelControl\(\);/, "interactive Notion lookup must still reject disabled controls");
assert.match(submissionNavigationSource, /deadlineAt > activatedAt \? deadlineAt \+ 15000/, "content correlation must cover delayed final routing through the send deadline");
assert.match(submissionNavigationSource, /event\?\.isTrusted[^\n]+current\("trusted-intent"\)/, "trusted user navigation intent must cancel stale submission correlation");
assert.match(contentEntrySource, /window\.addEventListener\("pointerdown"[\s\S]{0,160}clearSubmissionNavigationForTrustedIntent/, "trusted pointer navigation must be observed before SPA routing");
assert.match(
  modelPreferenceConsoleSource,
  /dataState === "disabled"/,
  "the Notion DevTools adapter must reject data-state=disabled controls for interaction"
);

const expectedNotionConsoleModels = [
  ["auto", "Auto"],
  ["sonnet46", "Sonnet 4.6"],
  ["sonnet5", "Sonnet 5"],
  ["opus47", "Opus 4.7"],
  ["opus48", "Opus 4.8"],
  ["opus5", "Opus 5"],
  ["fable5", "Fable 5"],
  ["gemini31pro", "Gemini 3.1 Pro"],
  ["gemini35flash", "Gemini 3.5 Flash"],
  ["gpt56sol", "GPT-5.6 Sol"],
  ["gpt56terra", "GPT-5.6 Terra"],
  ["gpt52", "GPT-5.2"],
  ["gpt54", "GPT-5.4"],
  ["gpt55", "GPT-5.5"],
  ["grok43", "Grok 4.3"],
  ["grok45", "Grok 4.5"],
  ["grokBuild01", "Grok Build 0.1"],
  ["kimi26", "Kimi K2.6"],
  ["kimi27code", "Kimi K2.7 Code"],
  ["kimi3", "Kimi K3"],
  ["deepseekV4Pro", "DeepSeek V4 Pro"],
  ["glm52", "GLM 5.2"]
];
const consoleNotionTargetIds = JSON.parse(`[${
  modelPreferenceConsoleSource.match(/NotionAI: Object\.freeze\(\[([\s\S]*?)\]\)\n\s*\}\);/)?.[1] || ""
}]`);
const consoleNotionRuntimeBlock = modelPreferenceConsoleSource.match(
  /const NOTION_MODEL_TARGETS = Object\.freeze\(\{([\s\S]*?)\n  \}\);/
)?.[1] || "";
const parseNotionRuntimeTargets = (block) => [...block.matchAll(
  /^\s+(\w+): Object\.freeze\(\{ id: "([^"]+)", label: "([^"]+)", aliases: \[([^\]]*)\] \}\),?$/gm
)].map((match) => ({
  key: match[1],
  id: match[2],
  label: match[3],
  aliases: JSON.parse(`[${match[4]}]`)
}));
const consoleNotionRuntimeTargets = parseNotionRuntimeTargets(consoleNotionRuntimeBlock);
const packagedNotionRuntimeBlock = preferredCapabilitySource.match(
  /const NOTION_MODEL_TARGETS = Object\.freeze\(\{([\s\S]*?)\n  \}\);/
)?.[1] || "";
const packagedNotionRuntimeTargets = parseNotionRuntimeTargets(packagedNotionRuntimeBlock);
assert.deepEqual(
  consoleNotionTargetIds,
  expectedNotionConsoleModels.map(([id]) => id),
  "the Notion DevTools adapter must expose all 21 current models plus Auto"
);
assert.deepEqual(
  consoleNotionRuntimeTargets.map(({ id }) => id),
  packagedNotionRuntimeTargets.map(({ id }) => id),
  "the Notion DevTools adapter and packaged runtime must keep the same exact target ids"
);
for (const [id, menuLabel] of expectedNotionConsoleModels) {
  const target = consoleNotionRuntimeTargets.find((entry) => entry.id === id);
  assert.equal(target?.key, id, `Notion DevTools target ${id} must keep its stable key`);
  assert.ok(
    [target?.label, ...(target?.aliases || [])].includes(menuLabel),
    `Notion DevTools target ${id} must include the exact menu label ${menuLabel}`
  );
}

const notionConsoleExactContext = vm.createContext({});
vm.runInContext(`
  const NOTION_MODEL_TARGETS = Object.freeze({
    gpt54: Object.freeze({ id: "gpt54", label: "GPT-5.4", aliases: ["GPT 5.4"] }),
    gpt55: Object.freeze({ id: "gpt55", label: "GPT-5.5", aliases: ["GPT 5.5"] })
  });
  function normalize(value) { return String(value || "").replace(/\\s+/g, " ").trim(); }
  function elementText(element) {
    return [
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("data-testid"),
      element?.innerText || element?.textContent || ""
    ].filter(Boolean).join(" ");
  }
  ${functionSource(modelPreferenceConsoleSource, "notionText")}
  ${functionSource(modelPreferenceConsoleSource, "notionLabels")}
  ${functionSource(modelPreferenceConsoleSource, "notionTextEvidence")}
  ${functionSource(modelPreferenceConsoleSource, "notionTextLooksLikeTarget")}
  ${functionSource(modelPreferenceConsoleSource, "notionElementTextEvidence")}
  ${functionSource(modelPreferenceConsoleSource, "notionElementLooksLikeTarget")}
  globalThis.matchesText = (value, id) => notionTextLooksLikeTarget(value, NOTION_MODEL_TARGETS[id]);
  globalThis.matchesElement = (text, id, testId = "agent-chat-model-button") => notionElementLooksLikeTarget({
    innerText: text,
    textContent: text,
    getAttribute(name) { return name === "data-testid" ? testId : ""; },
    querySelectorAll() { return []; }
  }, NOTION_MODEL_TARGETS[id]);
`, notionConsoleExactContext);
assert.equal(notionConsoleExactContext.matchesText("GPT-5.4", "gpt54"), true);
assert.equal(notionConsoleExactContext.matchesText("GPT-5.4 Mini", "gpt54"), false, "Notion DevTools matching must reject longer model names");
assert.equal(notionConsoleExactContext.matchesText("GPT-5.4\nBeta", "gpt54"), true, "an exact independent text line may identify the model");
assert.equal(notionConsoleExactContext.matchesElement("GPT-5.4", "gpt54"), true, "data-testid metadata must not hide an exact model label");
assert.equal(notionConsoleExactContext.matchesElement("GPT-5.4 Mini", "gpt54"), false, "element matching must not restore substring selection");

const grokOpenSource = functionSource(preferredCapabilitySource, "openGrokModelMenu");
assert.match(
  grokOpenSource,
  /preferredModelPointerActivate\(context, trigger\)/,
  "Grok must use pointer-first activation for the model menu trigger"
);
const pointerDispatchSource = functionSource(preferredCapabilitySource, "dispatchPointerActivation");
for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
  assert.match(pointerDispatchSource, new RegExp(`type: "${eventName}"`), `Grok pointer activation must include ${eventName}`);
}

const preferredPointerContext = vm.createContext({});
vm.runInContext(`
  const calls = [];
  let pointerWorks = true;
  let shieldCount = 0;
  function assertPreferredModelRun() { calls.push("assert"); }
  function visible() { return true; }
  function isDisabledElement() { return false; }
  function armPreferredModelFocusShield() { shieldCount += 1; calls.push("shield"); }
  function modelCenterPoint() { return { x: 12, y: 18 }; }
  function dispatchPointerActivation() { calls.push("pointer"); return pointerWorks; }
  function nativeModelClick() { calls.push("native"); return true; }
  ${functionSource(preferredCapabilitySource, "modelDirectClick")}
  ${functionSource(preferredCapabilitySource, "preferredModelPointerActivate")}
  globalThis.runPreferredPointer = (nextPointerWorks) => {
    pointerWorks = nextPointerWorks;
    calls.length = 0;
    shieldCount = 0;
    const context = { interactionCount: 0 };
    const target = {
      scrollIntoView() { calls.push("scroll"); },
      focus() { calls.push("focus"); }
    };
    const clicked = preferredModelPointerActivate(context, target);
    return { clicked, calls: calls.slice(), interactionCount: context.interactionCount, shieldCount };
  };
`, preferredPointerContext);
const pointerSuccess = JSON.parse(JSON.stringify(preferredPointerContext.runPreferredPointer(true)));
assert.equal(pointerSuccess.clicked, true, "pointer-first activation must report a dispatched pointer sequence");
assert.equal(pointerSuccess.interactionCount, 1, "pointer-first activation must count one logical interaction");
assert.equal(pointerSuccess.shieldCount, 1, "pointer-first activation must arm the focus shield once");
assert.deepEqual(
  pointerSuccess.calls.filter((call) => call === "pointer" || call === "native"),
  ["pointer"],
  "a successful pointer sequence must not be followed by a native click"
);
const pointerFallback = JSON.parse(JSON.stringify(preferredPointerContext.runPreferredPointer(false)));
assert.equal(pointerFallback.interactionCount, 1, "native fallback must remain part of the same logical interaction");
assert.deepEqual(
  pointerFallback.calls.filter((call) => call === "pointer" || call === "native"),
  ["pointer", "native"],
  "native click must run only when pointer dispatch is unavailable"
);

const devtoolsGrokOpenSource = functionSource(modelPreferenceConsoleSource, "openGrokMenu");
assert.match(
  devtoolsGrokOpenSource,
  /pointerFirstClickElement\(trigger\)/,
  "the Grok DevTools adapter must mirror pointer-first trigger activation"
);
const devtoolsPointerContext = vm.createContext({});
vm.runInContext(`
  const calls = [];
  let pointerWorks = true;
  function visible() { return true; }
  function isDisabledElement() { return false; }
  function centerPoint() { return { x: 8, y: 10 }; }
  function dispatchPointerActivation() { calls.push("pointer"); return pointerWorks; }
  function nativeClick() { calls.push("native"); return true; }
  ${functionSource(modelPreferenceConsoleSource, "pointerFirstClickElement")}
  globalThis.runDevtoolsPointer = (nextPointerWorks) => {
    pointerWorks = nextPointerWorks;
    calls.length = 0;
    const target = { scrollIntoView() {}, focus() {} };
    return { clicked: pointerFirstClickElement(target), calls: calls.slice() };
  };
`, devtoolsPointerContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(devtoolsPointerContext.runDevtoolsPointer(true))).calls,
  ["pointer"],
  "the DevTools adapter must not native-click after successful pointer dispatch"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(devtoolsPointerContext.runDevtoolsPointer(false))).calls,
  ["pointer", "native"],
  "the DevTools adapter must native-click only as a fallback"
);

const notionIndicatorContext = vm.createContext({});
vm.runInContext(`
  const NOTION_MODEL_MENU_ROOT_SELECTORS = [];
  const NOTION_MODEL_TARGETS = { auto: {} };
  function visible() { return true; }
  function modelElementText(element) { return element.textValue || ""; }
  function isNotionModelTriggerNearMainComposer() { return true; }
  function notionModelIdFromElement() { return "gemini31pro"; }
  function notionText(value) { return String(value || "").toLowerCase(); }
  function notionTextLooksLikeTarget() { return false; }
  function notionElementLooksLikeTarget() { return false; }
  ${functionSource(preferredCapabilitySource, "isDisabledElement")}
  ${functionSource(preferredCapabilitySource, "scoreNotionModelTrigger")}
  globalThis.scoreNotion = scoreNotionModelTrigger;
`, notionIndicatorContext);
const disabledNotionIndicator = {
  disabled: false,
  textValue: "Response in progress Gemini 3.1 Pro",
  className: "",
  hasAttribute() { return false; },
  matches() { return false; },
  closest() { return null; },
  getAttribute(name) {
    if (name === "data-state") return "disabled";
    if (name === "data-testid") return "unified-chat-model-button";
    return "";
  }
};
assert.equal(notionIndicatorContext.scoreNotion(disabledNotionIndicator), -1, "disabled Notion controls must not be interactive triggers");
assert.ok(
  notionIndicatorContext.scoreNotion(disabledNotionIndicator, { allowDisabled: true }) > 0,
  "disabled Notion controls must remain readable as current-model indicators"
);

runSubmissionLeaseTests().then(
  () => console.log("preferred-model submit-navigation regression: ok"),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
