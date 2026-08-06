#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function flush() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  assert.fail(message);
}

function fakeClassList(...initial) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    contains: (name) => values.has(name),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      if (force === undefined ? !values.has(name) : force) values.add(name);
      else values.delete(name);
      return values.has(name);
    }
  };
}

function fakeInput(value = "") {
  return {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    selectionDirection: "none",
    scrollHeight: 40,
    scrollTop: 0,
    style: {},
    classList: fakeClassList("prompt-input"),
    closest: () => null,
    focus() {},
    setSelectionRange(start, end, direction = "none") {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    }
  };
}

let currentInput = null;
globalThis.document = {
  body: { append() {} },
  documentElement: null,
  addEventListener() {},
  removeEventListener() {},
  querySelector(selector) {
    return selector === ".prompt-input" ? currentInput : null;
  },
  querySelectorAll() {
    return [];
  }
};
globalThis.window = {
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

function baseState(overrides = {}) {
  return {
    options: { frameToastPosition: { x: 100, y: 100 } },
    promptHistoryCursor: -1,
    promptHistoryDraft: "",
    promptImages: [],
    promptLibrary: [],
    promptQueuedTargetCount: 0,
    promptSelection: { start: 0, end: 0, direction: "none" },
    promptSendHistory: [],
    promptSendingTargetCount: 0,
    promptText: "",
    shortcutConfig: {},
    ...overrides
  };
}

function image(name, body) {
  return {
    id: `image-${name}`,
    name,
    type: "image/png",
    size: body.length,
    lastModified: 123,
    dataUrl: `data:image/png;base64,${body}`
  };
}

function preferredModelHarness(frame, initialReadiness, { failurePolicy = "send-current" } = {}) {
  const readiness = new Map([[frame, initialReadiness]]);
  const readinessWaiters = new Map();
  const firstBarrier = deferred();
  const armed = [];
  const barrierWaits = [];

  function waiterFor(target) {
    let waiter = readinessWaiters.get(target);
    if (!waiter) {
      waiter = deferred();
      readinessWaiters.set(target, waiter);
    }
    return waiter;
  }

  const port = {
    armPreferredModelSubmissionNavigation(target, sendId) {
      armed.push({ target, sendId });
    },
    finishPreferredModelSubmissionNavigation() {},
    preferredModelFailurePolicyForApp: () => failurePolicy,
    preferredModelFrameReadiness: (target) => readiness.get(target) || { state: "detached" },
    preferredModelFrameReadinessIsCurrent(target, candidate) {
      const current = readiness.get(target);
      return Boolean(current)
        && current.frameKey === candidate.frameKey
        && current.runId === candidate.runId
        && current.documentId === candidate.documentId
        && current.bridgeVersion === candidate.bridgeVersion
        && current.appId === candidate.appId
        && current.state === candidate.state;
    },
    waitForPreferredModelFrame(target) {
      const current = readiness.get(target) || { state: "detached" };
      return ["loading", "pending"].includes(current.state)
        ? waiterFor(target).promise
        : Promise.resolve(current);
    },
    waitForPreferredModelSubmissionBarrier(target, sendId) {
      barrierWaits.push({ target, sendId });
      const current = readiness.get(target) || {};
      const needsNavigationBarrier = current.appId === "Gemini" || current.appId === "NotionAI";
      return needsNavigationBarrier && sendId === armed[0]?.sendId
        ? firstBarrier.promise
        : Promise.resolve({ state: "complete", sendId });
    }
  };

  return {
    armed,
    barrierWaits,
    firstBarrier,
    port,
    setReadiness(target, nextReadiness) {
      readiness.set(target, nextReadiness);
      readinessWaiters.get(target)?.resolve(nextReadiness);
      readinessWaiters.delete(target);
    }
  };
}

function frameToastStub() {
  return Object.freeze({ dismiss() {}, remove() {}, update() {} });
}

function controllerDependencies({
  state,
  frames,
  appByFrame,
  preferredModel,
  framePort,
  frameSendPrepareTimeoutMs,
  savePromptSendHistory,
  toastCalls
}) {
  return {
    state,
    workspace: {
      closePopovers() {},
      currentFrames: () => frames,
      frameApp: (frame) => appByFrame.get(frame) || null
    },
    preferredModel,
    topbar: { closeSettingsMenu() {} },
    framePort,
    keyboardPlatform: "mac",
    activeShortcutProfile: () => ({ sendKeyMode: "enter" }),
    inferAppName: (app) => app?.name || app?.id || "",
    openPromptLibrary() {},
    optimizePrompt() {},
    recordFunctionalAnomaly() {},
    ...(frameSendPrepareTimeoutMs === undefined ? {} : { frameSendPrepareTimeoutMs }),
    savePromptSendHistory,
    toast: (message, kind) => toastCalls.push({ message, kind }),
    createFrameToast: frameToastStub
  };
}

(async () => {
  const { createComposerController } = await import(pathToFileURL(
    path.join(root, "app/composer/controller.js")
  ).href);

  {
    const frame = { isConnected: true };
    const app = { id: "Gemini", name: "Gemini", imagePasteStrategy: "sequential" };
    const appByFrame = new Map([[frame, app]]);
    const frames = [frame];
    const state = baseState();
    const model = preferredModelHarness(frame, {
      state: "pending",
      appId: "Gemini",
      frameKey: "frame-key-1",
      runId: "run-1",
      documentId: "",
      bridgeVersion: ""
    });
    const ensureCalls = [];
    const requestCalls = [];
    const framePort = {
      async ensure(target, options) {
        ensureCalls.push({ target, options });
        return { documentId: "document-1" };
      },
      async request(target, command, payload, options) {
        requestCalls.push({ target, command, payload, options });
        return { sent: true, deliveryState: "sent" };
      }
    };
    const firstHistoryWrite = deferred();
    const historyWrites = [];
    const secondHistorySaved = deferred();
    const savePromptSendHistory = async (next) => {
      historyWrites.push(next.map((entry) => entry.text));
      if (historyWrites.length === 1) await firstHistoryWrite.promise;
      if (historyWrites.length === 2) secondHistorySaved.resolve();
      return next;
    };
    const toastCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames,
      appByFrame,
      preferredModel: model.port,
      framePort,
      savePromptSendHistory,
      toastCalls
    }));

    const input = fakeInput("S1");
    currentInput = input;
    const firstImage = image("first.png", "QUFBQQ==");
    state.promptImages = [firstImage];
    const s1 = controller.submit(input);
    assert.equal(state.promptText, "", "an admitted S1 must clear its state snapshot immediately");
    assert.deepEqual(state.promptImages, [], "an admitted S1 must clear its image snapshot immediately");
    assert.equal(input.value, "", "an admitted S1 must clear the visible input immediately");

    input.value = "S2";
    input.selectionStart = input.selectionEnd = input.value.length;
    const s2 = controller.submit(input);
    assert.equal(state.promptText, "", "an admitted S2 must clear independently of pending S1");
    assert.equal(input.value, "", "S2 must also clear before any iframe send completes");

    input.value = "S3 still editing";
    input.selectionStart = input.selectionEnd = input.value.length;
    state.promptText = input.value;
    state.promptImages = [image("third.png", "Q0NDQw==")];
    firstImage.name = "mutated-after-submit.png";
    firstImage.dataUrl = "data:image/png;base64,TVVUQVRFRA==";

    await waitUntil(() => historyWrites.length === 1, "S1 history persistence did not start");
    assert.deepEqual(historyWrites, [["S1"]], "S2 history must wait for the earlier S1 write");
    state.promptHistoryCursor = 3;
    state.promptHistoryDraft = "S3 history draft";
    firstHistoryWrite.resolve();
    await secondHistorySaved.promise;
    await flush();
    assert.deepEqual(historyWrites, [["S1"], ["S2", "S1"]], "history writes must preserve submission order");
    assert.deepEqual(state.promptSendHistory.map((entry) => entry.text), ["S2", "S1"]);
    assert.equal(state.promptHistoryCursor, 3, "delayed history persistence must not reset the live history cursor");
    assert.equal(state.promptHistoryDraft, "S3 history draft", "delayed history persistence must not erase a newer history draft");

    const realDateNow = Date.now;
    let dequeuedAt = 1_000_000;
    Date.now = () => dequeuedAt;
    model.setReadiness(frame, {
      state: "ready",
      appId: "Gemini",
      frameKey: "frame-key-1",
      runId: "run-1",
      documentId: "document-1",
      bridgeVersion: "bridge-1"
    });
    await waitUntil(() => requestCalls.length === 1, "S1 did not leave the pending-model queue");
    assert.equal(requestCalls[0].payload.text, "S1");
    assert.equal(requestCalls[0].payload.images.length, 1);
    assert.equal(requestCalls[0].payload.images[0].name, "first.png", "S1 must use its immutable image snapshot");
    assert.equal(requestCalls[0].payload.images[0].dataUrl, "data:image/png;base64,QUFBQQ==");
    assert.equal(requestCalls[0].options.expectedDocumentId, "document-1");
    assert.equal(requestCalls[0].options.skipEnsure, true, "delivery must not perform a hidden second ensure");
    assert.deepEqual(ensureCalls[0], {
      target: frame,
      options: { features: ["send"], force: true }
    }, "S1 must explicitly prepare the send capability before delivery");
    assert.equal(requestCalls[0].payload.deadlineAt, 1_060_000, "S1 image timeout must begin at actual dequeue");
    await flush();
    assert.equal(requestCalls.length, 1, "same-frame S2 must not send before the S1 navigation barrier");

    dequeuedAt = 2_000_000;
    model.firstBarrier.resolve({ state: "complete" });
    await waitUntil(() => requestCalls.length === 2, "S2 did not run after the S1 barrier");
    assert.equal(requestCalls[1].payload.text, "S2");
    assert.equal(requestCalls[1].payload.deadlineAt, 2_012_000, "S2 timeout must be recomputed after its queue wait");
    assert.equal(requestCalls[1].options.skipEnsure, true);
    assert.equal(ensureCalls.length, 2, "each queued job must run its own explicit preparation");
    assert.ok(ensureCalls.every((call) => call.target === frame));
    assert.ok(ensureCalls.every((call) => call.options.force === true));
    Date.now = realDateNow;
    await Promise.all([s1, s2]);
    assert.equal(state.promptText, "S3 still editing", "async completion must not clear or restore an in-progress S3 draft");
    assert.equal(input.value, "S3 still editing", "async completion must leave the visible S3 draft untouched");
    assert.equal(state.promptImages[0].name, "third.png", "async completion must leave S3 attachments untouched");
    assert.equal(state.promptQueuedTargetCount, 0);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "Gemini", name: "Gemini" };
    const state = baseState({ promptText: "force exact identity" });
    const model = preferredModelHarness(frame, {
      state: "ready",
      appId: "Gemini",
      frameKey: "frame-key-force",
      runId: "run-force",
      documentId: "document-force",
      bridgeVersion: ""
    });
    const ensureCalls = [];
    const requestCalls = [];
    const framePort = {
      async ensure(target, options) {
        ensureCalls.push({ target, options });
        model.setReadiness(frame, {
          state: "ready",
          appId: "Gemini",
          frameKey: "frame-key-force",
          runId: "run-force",
          documentId: "document-force",
          bridgeVersion: "bridge-force"
        });
        return { documentId: "document-force" };
      },
      async request(target, command, payload, options) {
        requestCalls.push({ target, command, payload, options });
        return {
          sent: true,
          deliveryState: "sent",
          submissionNavigation: {
            sendId: payload.sendId,
            appId: "Gemini",
            initialHref: "https://gemini.google.com/app/thread-existing",
            barrierState: "not-required",
            method: "button"
          }
        };
      }
    };
    model.firstBarrier.resolve({ state: "complete" });
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort,
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const result = await controller.submit(input);
    assert.equal(result[0].status, "fulfilled");
    assert.equal(ensureCalls.length, 1, "a missing barrier bridge identity must trigger one explicit preparation");
    assert.deepEqual(ensureCalls[0].options, { features: ["send"], force: true });
    assert.equal(model.armed.length, 1, "the barrier must arm only after exact identity preparation");
    assert.equal(requestCalls.length, 1, "identity preparation must not replay the mutating send");
    assert.equal(requestCalls[0].options.expectedDocumentId, "document-force");
    assert.equal(requestCalls[0].options.skipEnsure, true);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "ChatGPT", name: "ChatGPT" };
    const state = baseState({ promptText: "wait for fresh preparation" });
    const documentId = "document-fresh-preparation";
    const model = preferredModelHarness(frame, {
      state: "unconfigured",
      appId: "ChatGPT",
      frameKey: "",
      runId: "",
      documentId,
      bridgeVersion: "bridge-fresh-preparation"
    });
    const preparation = deferred();
    const ensureCalls = [];
    const requestCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        ensure(target, options) {
          ensureCalls.push({ target, options });
          return preparation.promise;
        },
        async request(target, command, payload, options) {
          requestCalls.push({ target, command, payload, options });
          return { sent: true, deliveryState: "sent" };
        }
      },
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const submission = controller.submit(input);
    await waitUntil(() => ensureCalls.length === 1, "fresh frame preparation did not start");
    assert.equal(requestCalls.length, 0, "a fresh frame must not receive a mutating request before preparation resolves");
    assert.equal(state.promptQueuedTargetCount, 1, "the queue badge must include a job blocked in preparation");
    assert.deepEqual(ensureCalls[0], {
      target: frame,
      options: { features: ["send"], force: true }
    });
    preparation.resolve({ documentId });
    const result = await submission;
    assert.equal(result[0].status, "fulfilled");
    assert.equal(requestCalls.length, 1);
    assert.equal(requestCalls[0].options.expectedDocumentId, documentId);
    assert.equal(requestCalls[0].options.skipEnsure, true);
    assert.equal(state.promptQueuedTargetCount, 0);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "ChatGPT", name: "ChatGPT" };
    const state = baseState({ promptText: "document changes during preparation" });
    const model = preferredModelHarness(frame, {
      state: "unconfigured",
      appId: "ChatGPT",
      frameKey: "",
      runId: "",
      documentId: "document-before-preparation",
      bridgeVersion: "bridge-document-change"
    });
    const ensureCalls = [];
    const requestCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        async ensure(target, options) {
          ensureCalls.push({ target, options });
          if (ensureCalls.length === 1) {
            model.setReadiness(frame, {
              state: "unconfigured",
              appId: "ChatGPT",
              frameKey: "",
              runId: "",
              documentId: "document-after-preparation",
              bridgeVersion: "bridge-document-change"
            });
            return { documentId: "document-before-preparation" };
          }
          return { documentId: "document-after-preparation" };
        },
        async request(target, command, payload, options) {
          requestCalls.push({ target, command, payload, options });
          return { sent: true, deliveryState: "sent" };
        }
      },
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const result = await controller.submit(input);
    assert.equal(result[0].status, "fulfilled");
    assert.equal(ensureCalls.length, 2, "a document change during preparation must stabilize before delivery");
    assert.ok(ensureCalls.every((call) => call.options.force === true));
    assert.equal(requestCalls.length, 1, "the old document must receive no mutating request");
    assert.equal(requestCalls[0].options.expectedDocumentId, "document-after-preparation");
    assert.equal(requestCalls[0].options.skipEnsure, true);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "ChatGPT", name: "ChatGPT" };
    const state = baseState({ promptText: "retry explicit preparation failure" });
    const documentId = "document-after-preparation-retry";
    const model = preferredModelHarness(frame, {
      state: "unconfigured",
      appId: "ChatGPT",
      frameKey: "",
      runId: "",
      documentId,
      bridgeVersion: "bridge-preparation-retry"
    });
    const ensureCalls = [];
    const invalidateCalls = [];
    const requestCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        async ensure(target, options) {
          ensureCalls.push({ target, options });
          if (ensureCalls.length === 1) {
            throw Object.assign(new Error("content runtime was not registered"), {
              code: "INJECTION_FAILED",
              delivered: false
            });
          }
          return { documentId };
        },
        invalidate(...args) {
          invalidateCalls.push(args);
        },
        async request(target, command, payload, options) {
          requestCalls.push({ target, command, payload, options });
          return { sent: true, deliveryState: "sent" };
        }
      },
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const result = await controller.submit(input);
    assert.equal(result[0].status, "fulfilled");
    assert.equal(ensureCalls.length, 2, "an explicit pre-delivery preparation failure may retry once");
    assert.deepEqual(invalidateCalls, [[frame, "sendText:INJECTION_FAILED", {
      preserveDocument: true,
      clearCapabilities: true
    }]]);
    assert.equal(requestCalls.length, 1, "preparation retry must still lead to at most one mutating request");
    assert.equal(requestCalls[0].options.expectedDocumentId, documentId);
    assert.equal(requestCalls[0].options.skipEnsure, true);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "ChatGPT", name: "ChatGPT" };
    const state = baseState({ promptText: "bounded preparation timeout" });
    const model = preferredModelHarness(frame, {
      state: "unconfigured",
      appId: "ChatGPT",
      frameKey: "",
      runId: "",
      documentId: "document-preparation-timeout",
      bridgeVersion: "bridge-preparation-timeout"
    });
    const ensureCalls = [];
    const requestCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        ensure(target, options) {
          ensureCalls.push({ target, options });
          return new Promise(() => {});
        },
        async request(...args) {
          requestCalls.push(args);
          return { sent: true, deliveryState: "sent" };
        }
      },
      frameSendPrepareTimeoutMs: 250,
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const result = await controller.submit(input);
    assert.equal(result[0].status, "rejected");
    assert.equal(result[0].reason.code, "FRAME_SEND_PREPARE_TIMEOUT");
    assert.equal(ensureCalls.length, 1);
    assert.deepEqual(ensureCalls[0].options, { features: ["send"], force: true });
    assert.equal(requestCalls.length, 0, "timed-out preparation must never reach the mutating request");
    assert.equal(state.promptQueuedTargetCount, 0, "the queue badge must clear after a bounded preparation failure");
    assert.equal(state.promptSendingTargetCount, 0);
  }

  for (const deliveryCase of [
    {
      label: "known not-sent",
      firstResult: { sent: false, deliveryState: "not-sent", reason: "input was unavailable" },
      firstCode: "SEND_REJECTED",
      secondStatus: "fulfilled",
      expectedRequests: 2
    },
    {
      label: "stale before delivery",
      firstError: { code: "STALE_DOCUMENT", delivered: false },
      firstCode: "STALE_DOCUMENT",
      secondStatus: "fulfilled",
      expectedRequests: 2
    },
    {
      label: "stale after possible delivery",
      firstError: { code: "STALE_DOCUMENT", delivered: true },
      firstCode: "STALE_DOCUMENT",
      secondStatus: "rejected",
      secondCode: "FRAME_SEND_QUEUE_PURGED_UNCERTAIN",
      expectedRequests: 1
    },
    {
      label: "timeout despite contradictory not-delivered marker",
      firstError: { code: "TIMEOUT", delivered: false },
      firstCode: "TIMEOUT",
      secondStatus: "rejected",
      secondCode: "FRAME_SEND_QUEUE_PURGED_UNCERTAIN",
      expectedRequests: 1
    },
    {
      label: "unknown delivery",
      firstResult: { sent: false, deliveryState: "unknown", reason: "response was lost" },
      firstCode: "SEND_DELIVERY_UNKNOWN",
      secondStatus: "rejected",
      secondCode: "FRAME_SEND_QUEUE_PURGED_UNCERTAIN",
      expectedRequests: 1
    },
    {
      label: "truthy malformed delivery",
      firstResult: { ok: true },
      firstCode: "SEND_DELIVERY_UNKNOWN",
      secondStatus: "rejected",
      secondCode: "FRAME_SEND_QUEUE_PURGED_UNCERTAIN",
      expectedRequests: 1
    },
    {
      label: "legacy incomplete delivery",
      firstResult: { sent: true },
      firstCode: "SEND_DELIVERY_UNKNOWN",
      secondStatus: "rejected",
      secondCode: "FRAME_SEND_QUEUE_PURGED_UNCERTAIN",
      expectedRequests: 1
    }
  ]) {
    const frame = { isConnected: true };
    const app = { id: "ChatGPT", name: "ChatGPT" };
    const state = baseState({ promptText: `${deliveryCase.label} S1` });
    const documentId = `document-${deliveryCase.label}`;
    const model = preferredModelHarness(frame, {
      state: "unconfigured",
      appId: "ChatGPT",
      frameKey: "",
      runId: "",
      documentId,
      bridgeVersion: "bridge-delivery"
    });
    const ensureCalls = [];
    const invalidateCalls = [];
    const requestCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        async ensure(target, options) {
          ensureCalls.push({ target, options });
          return { documentId };
        },
        invalidate(...args) {
          invalidateCalls.push(args);
        },
        request: async (target, command, payload, options) => {
          requestCalls.push({ target, command, payload, options });
          if (requestCalls.length === 1 && deliveryCase.firstError) {
            throw Object.assign(new Error(`${deliveryCase.label} transport failure`), deliveryCase.firstError);
          }
          return requestCalls.length === 1 ? deliveryCase.firstResult : { sent: true, deliveryState: "sent" };
        }
      },
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const first = controller.submit(input);
    input.value = `${deliveryCase.label} S2`;
    input.selectionStart = input.selectionEnd = input.value.length;
    const second = controller.submit(input);
    const [firstSettlement, secondSettlement] = await Promise.all([first, second]);
    assert.equal(firstSettlement[0].status, "rejected", `${deliveryCase.label}: S1 must reject`);
    assert.equal(firstSettlement[0].reason.code, deliveryCase.firstCode);
    assert.equal(secondSettlement[0].status, deliveryCase.secondStatus);
    if (deliveryCase.secondCode) assert.equal(secondSettlement[0].reason.code, deliveryCase.secondCode);
    assert.equal(
      requestCalls.length,
      deliveryCase.expectedRequests,
      `${deliveryCase.label}: the lane must continue only when delivery is known not to have happened`
    );
    assert.deepEqual(
      requestCalls.map((call) => call.payload.text),
      deliveryCase.expectedRequests === 2
        ? [`${deliveryCase.label} S1`, `${deliveryCase.label} S2`]
        : [`${deliveryCase.label} S1`],
      `${deliveryCase.label}: S1 must never be replayed after the mutating request begins`
    );
    assert.ok(
      requestCalls.every((call) => call.options.skipEnsure === true),
      `${deliveryCase.label}: all mutating requests must skip hidden preparation`
    );
    assert.ok(
      requestCalls.every((call) => call.options.expectedDocumentId === documentId),
      `${deliveryCase.label}: delivery must remain bound to the prepared document`
    );
    assert.equal(ensureCalls.length, deliveryCase.expectedRequests);
    assert.ok(ensureCalls.every((call) => call.target === frame));
    assert.ok(ensureCalls.every((call) => call.options.force === true));
    if (deliveryCase.label === "stale before delivery") {
      assert.equal(invalidateCalls.length, 1, "a stale pre-delivery S1 must invalidate before S2 prepares");
      assert.deepEqual(invalidateCalls[0], [frame, "sendText:STALE_DOCUMENT", {
        preserveDocument: false,
        clearCapabilities: false
      }]);
    }
    assert.equal(state.promptQueuedTargetCount, 0);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "NotionAI", name: "Notion AI" };
    const state = baseState({ promptText: "skip after pending model failure" });
    const model = preferredModelHarness(frame, {
      state: "pending",
      appId: "NotionAI",
      frameKey: "frame-key-pending-skip",
      runId: "run-pending-skip",
      documentId: "",
      bridgeVersion: ""
    }, { failurePolicy: "skip" });
    const ensureCalls = [];
    const requestCalls = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        ensure: async (...args) => ensureCalls.push(args),
        request: async (...args) => requestCalls.push(args)
      },
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const submission = controller.submit(input);
    assert.equal(input.value, "", "an admitted pending-model submission must clear immediately");
    model.setReadiness(frame, {
      state: "failed",
      appId: "NotionAI",
      frameKey: "frame-key-pending-skip",
      runId: "run-pending-skip",
      documentId: "",
      bridgeVersion: "",
      reason: "content bridge recovery failed"
    });
    const result = await submission;
    assert.equal(result[0].status, "rejected");
    assert.equal(result[0].reason.code, "MODEL_PREFERENCE_SKIPPED");
    assert.equal(ensureCalls.length, 0, "terminal skip must not attempt content bridge recovery");
    assert.equal(requestCalls.length, 0, "terminal skip must not attempt mutating delivery");
    assert.equal(state.promptQueuedTargetCount, 0);
  }

  {
    const state = baseState({
      promptText: "draft without targets",
      promptImages: [image("no-target.png", "Tk9ORQ==")]
    });
    const historyWrites = [];
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [],
      appByFrame: new Map(),
      preferredModel: preferredModelHarness({}, { state: "unconfigured" }).port,
      framePort: { ensure: async () => {}, request: async () => ({ sent: true }) },
      savePromptSendHistory: async (next) => {
        historyWrites.push(next);
        return next;
      },
      toastCalls: []
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    assert.equal(controller.submit(input), undefined);
    assert.equal(state.promptText, "draft without targets", "no-target submission must preserve the draft");
    assert.equal(input.value, "draft without targets");
    assert.equal(state.promptImages[0].name, "no-target.png");
    assert.equal(historyWrites.length, 0);
  }

  {
    const frame = { isConnected: true };
    const app = { id: "Gemini", name: "Gemini" };
    const state = baseState({
      promptText: "draft skipped everywhere",
      promptImages: [image("skipped.png", "U0tJUA==")]
    });
    const historyWrites = [];
    const requestCalls = [];
    const toastCalls = [];
    const model = preferredModelHarness(frame, {
      state: "failed",
      appId: "Gemini",
      frameKey: "frame-key-skip",
      runId: "run-skip",
      documentId: "document-skip",
      bridgeVersion: "bridge-skip",
      reason: "model picker unavailable"
    }, { failurePolicy: "skip" });
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [frame],
      appByFrame: new Map([[frame, app]]),
      preferredModel: model.port,
      framePort: {
        ensure: async () => {},
        request: async (...args) => {
          requestCalls.push(args);
          return { sent: true };
        }
      },
      savePromptSendHistory: async (next) => {
        historyWrites.push(next);
        return next;
      },
      toastCalls
    }));
    const input = fakeInput(state.promptText);
    currentInput = input;
    const result = await controller.submit(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "rejected");
    assert.equal(result[0].reason.code, "MODEL_PREFERENCE_SKIPPED");
    assert.equal(state.promptText, "draft skipped everywhere", "all-immediate-skip submission must preserve the draft");
    assert.equal(input.value, "draft skipped everywhere");
    assert.equal(state.promptImages[0].name, "skipped.png");
    assert.equal(historyWrites.length, 0);
    assert.equal(requestCalls.length, 0);
    assert.equal(state.promptQueuedTargetCount, 0);
  }

  {
    const state = baseState();
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [],
      appByFrame: new Map(),
      preferredModel: preferredModelHarness({}, { state: "unconfigured" }).port,
      framePort: { ensure: async () => {}, request: async () => ({ sent: true, deliveryState: "sent" }) },
      savePromptSendHistory: async (next) => next,
      toastCalls: []
    }));
    currentInput = fakeInput("");
    const changes = [];
    const unsubscribe = controller.subscribeDraftChanges((status) => changes.push(status));
    const initial = controller.captureDraftSnapshot();
    assert.equal(controller.hasDraft(), false);
    assert.deepEqual(initial, { text: "", images: [], revision: 0 });
    assert.equal(Object.isFrozen(initial), true, "draft snapshots must be immutable");
    assert.equal(Object.isFrozen(initial.images), true, "draft image arrays must be immutable");

    const sourceImage = image("handoff.png", "SEFORFJGRg==");
    const adopted = controller.adoptDraftSnapshot({
      text: "  staged prompt  ",
      images: [sourceImage],
      revision: 99
    });
    assert.equal(adopted.revision, 1, "adopting remote content must advance the target Composer's local revision");
    assert.equal(controller.hasDraft(), true);
    assert.equal(Object.isFrozen(adopted.images[0]), true, "each snapshotted image must be immutable");
    sourceImage.name = "mutated-source.png";
    assert.equal(state.promptImages[0].name, "handoff.png", "adoption must detach the target draft from the handoff object");
    assert.deepEqual(changes, [{ hasDraft: true, revision: 1 }]);

    controller.setImages([
      ...state.promptImages,
      image("second.png", "U0VDT05E")
    ]);
    const withSecondImage = controller.captureDraftSnapshot();
    assert.equal(withSecondImage.revision, 2, "an image change must advance the draft revision");
    assert.equal(controller.clearDraftIfSnapshotCurrent(adopted), false, "an older snapshot must not clear a newer image draft");

    state.promptText = "newer typed draft";
    controller.syncInputNode();
    const newer = controller.captureDraftSnapshot();
    assert.equal(newer.revision, 3, "an externally synchronized text change must advance the draft revision");
    assert.equal(controller.clearDraftIfSnapshotCurrent(withSecondImage), false, "an older snapshot must not clear newer text");
    assert.equal(controller.clearDraftIfSnapshotCurrent(newer), true, "the exact current snapshot may clear the draft");
    assert.equal(controller.hasDraft(), false);
    assert.equal(controller.captureDraftSnapshot().revision, 4, "clearing content must advance the draft revision");
    assert.deepEqual(changes, [
      { hasDraft: true, revision: 1 },
      { hasDraft: true, revision: 2 },
      { hasDraft: true, revision: 3 },
      { hasDraft: false, revision: 4 }
    ]);
    unsubscribe();
    controller.adoptDraftSnapshot({ text: "unobserved", images: [], revision: 100 });
    assert.equal(changes.length, 4, "an unsubscribed content observer must receive no later revisions");
  }

  {
    const activeFrame = { isConnected: true };
    const targetFrameA = { isConnected: true };
    const targetFrameB = { isConnected: true };
    const app = { id: "ChatGPT", name: "ChatGPT" };
    const appByFrame = new Map([
      [activeFrame, app],
      [targetFrameA, app],
      [targetFrameB, app]
    ]);
    const ready = (suffix) => ({
      state: "unconfigured",
      appId: "ChatGPT",
      frameKey: "",
      runId: "",
      documentId: `document-${suffix}`,
      bridgeVersion: `bridge-${suffix}`
    });
    const model = preferredModelHarness(targetFrameA, ready("a"));
    model.setReadiness(targetFrameB, ready("b"));
    model.setReadiness(activeFrame, ready("active"));
    const documentIds = new Map([
      [targetFrameA, "document-a"],
      [targetFrameB, "document-b"],
      [activeFrame, "document-active"]
    ]);
    const requestCalls = [];
    const historyWrites = [];
    const state = baseState();
    const controller = createComposerController(controllerDependencies({
      state,
      frames: [activeFrame],
      appByFrame,
      preferredModel: model.port,
      framePort: {
        async ensure(target) {
          return { documentId: documentIds.get(target) };
        },
        async request(target, command, payload, options) {
          requestCalls.push({ target, command, payload, options });
          return { sent: true, deliveryState: "sent" };
        }
      },
      savePromptSendHistory: async (next) => {
        historyWrites.push(next);
        return next;
      },
      toastCalls: []
    }));
    currentInput = fakeInput("");
    const adopted = controller.adoptDraftSnapshot({
      text: "  send after target load  ",
      images: [image("target.png", "VEFSR0VU")],
      revision: 42
    });
    const admission = controller.admitSnapshot(adopted, { frames: [targetFrameA, targetFrameB] });
    assert.equal(Object.isFrozen(admission), true, "snapshot admission metadata must be immutable");
    assert.equal(admission.admittedCount, 2, "target admission count must be available before settlement");
    assert.equal(admission.targetCount, 2);
    assert.equal(controller.clearDraftIfSnapshotCurrent(adopted), true, "an adopted handoff may clear after successful admission");
    const settlement = await admission.settlement;
    assert.ok(settlement.every((result) => result.status === "fulfilled"));
    assert.deepEqual(
      requestCalls.map((call) => call.target),
      [targetFrameA, targetFrameB],
      "explicit target frames must be used instead of the workspace's current frame list"
    );
    assert.ok(requestCalls.every((call) => call.payload.text === "send after target load"));
    assert.equal(new Set(requestCalls.map((call) => call.payload.sendId)).size, 1, "one snapshot admission must share one send id");
    await waitUntil(() => historyWrites.length === 1, "targeted snapshot admission did not record history");
    assert.equal(historyWrites.length, 1, "one snapshot admission must record history only once across frames");
    assert.equal(historyWrites[0][0].text, "send after target load");
  }

  console.log("Composer queued-send behavior tests passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
