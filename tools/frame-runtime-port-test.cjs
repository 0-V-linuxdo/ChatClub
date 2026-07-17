#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { FrameCommandError, FrameRuntimePort } = await import("../shared/frame-rpc.js");
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
    (error) => error instanceof FrameCommandError && error.code === "TIMEOUT" && error.delivered === true
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
    assert.ok(error instanceof FrameCommandError, failure.label);
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
    sendRuntimeMessage: () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 25))
  });
  const abortFrame = { isConnected: true, dataset: runtimeDataset("doc-abort", ["preferred-model"]) };
  const aborted = abortPort.request(abortFrame, "applyPreferredModel", {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, (error) => error instanceof FrameCommandError && error.code === "ABORTED");

  await assert.rejects(
    port.request(iframe, "notACommand"),
    (error) => error instanceof FrameCommandError && error.code === "REMOTE_ERROR" && error.delivered === false
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
