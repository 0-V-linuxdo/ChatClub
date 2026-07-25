#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { FrameRuntimePort } = await import("../shared/frame-rpc.js");
  const isFrameCommandError = (error, code) => error?.name === "FrameCommandError" && error.code === code;
  const { CONTENT_RUNTIME_IDENTITY } = await import("../shared/content-runtime-identity.js");
  const runtimeDataset = (documentId, capabilities = []) => ({
    preferredModelDocumentId: documentId,
    preferredModelContentRuntimeImplementation: CONTENT_RUNTIME_IDENTITY.implementationVersion,
    ...(capabilities.length ? {
      contentRuntimeCapabilitiesDocumentId: documentId,
      contentRuntimeCapabilities: capabilities.join(",")
    } : {})
  });

  const iframe = { isConnected: true, dataset: runtimeDataset("doc-old") };
  const messages = [];
  let ensured = 0;
  const responses = [
    { success: false, code: "STALE_DOCUMENT", delivered: false, error: "old document" },
    { success: true, data: { href: "https://example.com/new" } }
  ];
  const port = new FrameRuntimePort({
    currentTabId: async () => 7,
    sendRuntimeMessage: async (message) => {
      messages.push(message);
      return responses.shift();
    },
    invalidateRuntime(target) { delete target.dataset.preferredModelDocumentId; },
    async ensureRuntime(target) {
      ensured += 1;
      target.dataset.preferredModelDocumentId = "doc-new";
      return { ok: true, registration: { documentId: "doc-new", bridgeVersion: "v3" } };
    }
  });
  const readResult = await port.request(iframe, "getLocationHref");
  assert.deepEqual(readResult, { href: "https://example.com/new" });
  assert.equal(messages.length, 2, "a read-only command may retry once when delivery explicitly failed");
  assert.equal(ensured, 1);
  assert.equal(messages[0].bridgeDocumentId, "doc-old");
  assert.equal(messages[1].bridgeDocumentId, "doc-new");
  assert.equal(port.registration(iframe).documentId, "doc-new");

  {
    const changingFrame = { isConnected: true, dataset: runtimeDataset("doc-before-ensure") };
    let changingEnsures = 0;
    let changingCalls = 0;
    const changingPort = new FrameRuntimePort({
      currentTabId: async () => 7,
      async ensureRuntime(target, options) {
        changingEnsures += 1;
        assert.deepEqual(options.features, ["message-navigator"]);
        target.dataset = runtimeDataset("doc-after-ensure", ["message-navigator"]);
        return { ok: true, registration: { documentId: "doc-after-ensure" } };
      },
      sendRuntimeMessage: async () => {
        changingCalls += 1;
        return { success: true, data: { enabled: true } };
      }
    });
    await assert.rejects(
      changingPort.request(changingFrame, "getMessageNavigatorState", {}, {
        expectedDocumentId: "doc-before-ensure"
      }),
      (error) => isFrameCommandError(error, "STALE_DOCUMENT") && error.delivered === false
    );
    assert.equal(changingEnsures, 1, "an expected document change during ensure must not trigger repair or replay");
    assert.equal(changingCalls, 0, "a stale expected document must fail before delivery");
  }

  {
    const boundFrame = { isConnected: true, dataset: runtimeDataset("doc-bound") };
    const routes = [];
    const boundPort = new FrameRuntimePort({
      currentTabId: async () => 7,
      requestBackground: async (action, payload) => {
        routes.push({ action, payload });
        return { success: true, data: { href: "https://example.com/bound" } };
      }
    });
    assert.deepEqual(
      await boundPort.request(boundFrame, "getLocationHref", {}, { expectedDocumentId: "doc-bound" }),
      { href: "https://example.com/bound" }
    );
    assert.equal(routes.length, 1);
    assert.equal(routes[0].payload.bridgeDocumentId, "doc-bound", "the command must route through the exact expected token");
  }

  {
    const compatibleFrame = { isConnected: true, dataset: runtimeDataset("doc-compatible-old", ["send"]) };
    const compatibleRoutes = [];
    const compatiblePort = new FrameRuntimePort({
      currentTabId: async () => 7,
      async ensureRuntime(target) {
        target.dataset = runtimeDataset("doc-compatible-new", ["send"]);
        return { ok: true, registration: { documentId: "doc-compatible-new" } };
      },
      requestBackground: async (action, payload) => {
        compatibleRoutes.push({ action, payload });
        return { success: true, data: { sent: true } };
      }
    });
    assert.deepEqual(
      await compatiblePort.request(compatibleFrame, "sendText", { text: "compatible" }),
      { sent: true }
    );
    assert.equal(compatibleRoutes.length, 1);
    assert.equal(
      compatibleRoutes[0].payload.bridgeDocumentId,
      "doc-compatible-new",
      "requests without expectedDocumentId must retain current-document routing"
    );
  }

  {
    const abortFrame = { isConnected: true, dataset: runtimeDataset("doc-abort-before") };
    const abortController = new AbortController();
    let releaseEnsure;
    let markEnsureStarted;
    let backgroundCalls = 0;
    const ensureStarted = new Promise((resolve) => { markEnsureStarted = resolve; });
    const ensureRelease = new Promise((resolve) => { releaseEnsure = resolve; });
    const abortPort = new FrameRuntimePort({
      currentTabId: async () => 7,
      async ensureRuntime(target) {
        markEnsureStarted();
        await ensureRelease;
        target.dataset = runtimeDataset("doc-abort-after", ["preferred-model"]);
        return { ok: true, registration: { documentId: "doc-abort-after" } };
      },
      requestBackground: async () => {
        backgroundCalls += 1;
        return { success: true, data: { success: true } };
      }
    });
    const request = abortPort.request(abortFrame, "applyPreferredModel", { runId: "old-run" }, {
      signal: abortController.signal
    });
    await ensureStarted;
    abortController.abort();
    releaseEnsure();
    await assert.rejects(
      request,
      (error) => isFrameCommandError(error, "ABORTED") && error.delivered === false
    );
    assert.equal(backgroundCalls, 0, "an abort during runtime ensure must stop a mutating command before delivery");
  }

  {
    const detachedFrame = { isConnected: true, dataset: runtimeDataset("doc-detach-before") };
    let releaseEnsure;
    let markEnsureStarted;
    let backgroundCalls = 0;
    const ensureStarted = new Promise((resolve) => { markEnsureStarted = resolve; });
    const ensureRelease = new Promise((resolve) => { releaseEnsure = resolve; });
    const detachedPort = new FrameRuntimePort({
      currentTabId: async () => 7,
      async ensureRuntime(target) {
        markEnsureStarted();
        await ensureRelease;
        target.dataset = runtimeDataset("doc-detach-after", ["send"]);
        return { ok: true, registration: { documentId: "doc-detach-after" } };
      },
      requestBackground: async () => {
        backgroundCalls += 1;
        return { success: true, data: { sent: true } };
      }
    });
    const request = detachedPort.request(detachedFrame, "sendText", { text: "must not send" });
    await ensureStarted;
    detachedFrame.isConnected = false;
    releaseEnsure();
    await assert.rejects(
      request,
      (error) => isFrameCommandError(error, "STALE_DOCUMENT") && error.delivered === false
    );
    assert.equal(backgroundCalls, 0, "a frame detached during runtime ensure must stop before delivery");
  }

  {
    const liveFrame = {
      isConnected: true,
      dataset: {
        ...runtimeDataset("doc-live"),
        preferredModelContentBridgeVersion: "bridge-current",
        injectedBrowserDocumentId: "browser-document-live"
      }
    };
    const liveResponses = [
      { success: false, code: "NOT_REGISTERED", delivered: false, error: "background registry restarted" },
      { success: true, data: { href: "https://example.com/live" } }
    ];
    let liveEnsures = 0;
    let invalidation = null;
    const livePort = new FrameRuntimePort({
      currentTabId: async () => 7,
      sendRuntimeMessage: async () => liveResponses.shift(),
      invalidateRuntime(target, reason, options) {
        invalidation = { reason, options };
        if (!options?.preserveDocument) delete target.dataset.preferredModelDocumentId;
      },
      async ensureRuntime(target, options) {
        liveEnsures += 1;
        assert.deepEqual(options.features, [], "base-command recovery must revalidate without unrelated capabilities");
        assert.equal(target.dataset.preferredModelDocumentId, "doc-live");
        return { ok: true, registration: { documentId: "doc-live", bridgeVersion: "bridge-current" } };
      }
    });
    assert.deepEqual(await livePort.request(liveFrame, "getLocationHref"), { href: "https://example.com/live" });
    assert.equal(liveEnsures, 1);
    assert.equal(invalidation.reason, "getLocationHref:NOT_REGISTERED");
    assert.deepEqual(invalidation.options, { preserveDocument: true, clearCapabilities: false });
    assert.equal(liveFrame.dataset.preferredModelDocumentId, "doc-live", "a background cache miss must not churn the live model document identity");
    assert.equal(liveFrame.dataset.injectedBrowserDocumentId, "browser-document-live");
  }

  {
    const capabilityFrame = {
      isConnected: true,
      dataset: {
        ...runtimeDataset("doc-capability", ["message-navigator"]),
        preferredModelContentBridgeVersion: "bridge-current"
      }
    };
    const capabilityResponses = [
      { success: false, code: "INJECTION_FAILED", delivered: false, error: "message navigator capability unavailable" },
      { success: true, data: { enabled: true } }
    ];
    let capabilityInvalidation = null;
    let capabilityEnsures = 0;
    const capabilityPort = new FrameRuntimePort({
      currentTabId: async () => 7,
      sendRuntimeMessage: async () => capabilityResponses.shift(),
      invalidateRuntime(target, reason, options) {
        capabilityInvalidation = { reason, options };
        if (options.clearCapabilities) {
          delete target.dataset.contentRuntimeCapabilitiesDocumentId;
          delete target.dataset.contentRuntimeCapabilities;
        }
      },
      async ensureRuntime(target, options) {
        capabilityEnsures += 1;
        assert.deepEqual(options.features, ["message-navigator"]);
        assert.equal(target.dataset.preferredModelDocumentId, "doc-capability");
        assert.equal(target.dataset.contentRuntimeCapabilities, undefined);
        target.dataset.contentRuntimeCapabilitiesDocumentId = "doc-capability";
        target.dataset.contentRuntimeCapabilities = "message-navigator";
        return { ok: true, registration: { documentId: "doc-capability", bridgeVersion: "bridge-current" } };
      }
    });
    assert.deepEqual(
      await capabilityPort.request(capabilityFrame, "getMessageNavigatorState"),
      { enabled: true }
    );
    assert.equal(capabilityEnsures, 1);
    assert.deepEqual(capabilityInvalidation, {
      reason: "getMessageNavigatorState:INJECTION_FAILED",
      options: { preserveDocument: true, clearCapabilities: true }
    });
    assert.equal(
      capabilityFrame.dataset.preferredModelDocumentId,
      "doc-capability",
      "capability-only repair must preserve same-document model identity"
    );
  }

  let mutatingCalls = 0;
  const mutatingPort = new FrameRuntimePort({
    currentTabId: async () => 7,
    sendRuntimeMessage: async () => {
      mutatingCalls += 1;
      return { success: false, code: "TIMEOUT", delivered: true, error: "response timed out" };
    }
  });
  const mutatingFrame = { isConnected: true, dataset: runtimeDataset("doc-send", ["send"]) };
  await assert.rejects(
    mutatingPort.request(mutatingFrame, "sendText", { text: "once" }),
    (error) => isFrameCommandError(error, "TIMEOUT") && error.delivered === true
  );
  assert.equal(mutatingCalls, 1, "a delivered mutating command must never be retried");

  for (const failure of [
    {
      label: "not-registered text after transport start",
      transport: async () => { throw new Error("Frame not registered after listener started"); },
      expectedCode: "NOT_REGISTERED"
    },
    {
      label: "transport port closed",
      transport: async () => { throw new Error("The message port closed before a response was received"); },
      expectedCode: "REMOTE_ERROR"
    },
    {
      label: "malformed successful response",
      transport: async () => ({ success: true }),
      expectedCode: "REMOTE_ERROR"
    }
  ]) {
    let calls = 0;
    const uncertainPort = new FrameRuntimePort({
      currentTabId: async () => 7,
      sendRuntimeMessage: async (...args) => {
        calls += 1;
        return failure.transport(...args);
      }
    });
    const uncertainFrame = { isConnected: true, dataset: runtimeDataset(`doc-${calls}`, ["delete"]) };
    const error = await uncertainPort.request(uncertainFrame, "deleteThread", {
      deleteAttemptId: "attempt-1"
    }).then(() => null, (reason) => reason);
    assert.equal(error?.name, "FrameCommandError", failure.label);
    assert.equal(error.code, failure.expectedCode, failure.label);
    assert.equal(Object.hasOwn(error, "delivered"), false, `${failure.label}: unknown delivery must stay unknown`);
    assert.equal(calls, 1, `${failure.label}: Delete must never be replayed`);
  }

  let uncertainReadCalls = 0;
  let uncertainReadEnsures = 0;
  const uncertainReadPort = new FrameRuntimePort({
    currentTabId: async () => 7,
    sendRuntimeMessage: async () => {
      uncertainReadCalls += 1;
      throw new Error("Frame not registered after listener started");
    },
    async ensureRuntime() {
      uncertainReadEnsures += 1;
      return { ok: true, registration: { documentId: "should-not-repair" } };
    }
  });
  const uncertainReadFrame = { isConnected: true, dataset: runtimeDataset("doc-uncertain-read") };
  const uncertainReadError = await uncertainReadPort.request(uncertainReadFrame, "getLocationHref")
    .then(() => null, (reason) => reason);
  assert.equal(uncertainReadError.code, "NOT_REGISTERED");
  assert.equal(Object.hasOwn(uncertainReadError, "delivered"), false);
  assert.equal(uncertainReadCalls, 1, "unknown delivery must not be retried even when text resembles a pre-delivery error");
  assert.equal(uncertainReadEnsures, 0, "unknown delivery must not start bridge repair");

  const controller = new AbortController();
  const abortPort = new FrameRuntimePort({
    currentTabId: async () => 7,
    sendRuntimeMessage: () => new Promise((resolve) => {
      setTimeout(() => resolve({ success: true }), 25);
    })
  });
  const abortFrame = { isConnected: true, dataset: runtimeDataset("doc-abort", ["preferred-model"]) };
  const aborted = abortPort.request(abortFrame, "applyPreferredModel", {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, (error) => isFrameCommandError(error, "ABORTED"));

  await assert.rejects(
    port.request(iframe, "notACommand"),
    (error) => isFrameCommandError(error, "REMOTE_ERROR") && error.delivered === false
  );

  let featureEnsures = 0;
  let featureCalls = 0;
  const featureFrame = { isConnected: true, dataset: runtimeDataset("doc-feature") };
  const featurePort = new FrameRuntimePort({
    currentTabId: async () => 7,
    async ensureRuntime(target, options) {
      featureEnsures += 1;
      assert.deepEqual(options.features, ["delete"]);
      target.dataset.contentRuntimeCapabilitiesDocumentId = "doc-feature";
      target.dataset.contentRuntimeCapabilities = "delete";
      return { ok: true, registration: { documentId: "doc-feature" } };
    },
    sendRuntimeMessage: async () => {
      featureCalls += 1;
      return { success: true, data: { visible: false } };
    }
  });
  assert.deepEqual(await featurePort.request(featureFrame, "getDeleteConfirmState"), { visible: false });
  assert.equal(featureEnsures, 1, "the first non-mutating feature command must install its missing capability");
  assert.equal(featureCalls, 1);

  console.log("frame runtime port: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
