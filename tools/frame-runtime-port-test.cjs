#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { FrameCommandError, FrameRuntimePort } = await import("../shared/frame-rpc.js");

  const iframe = { isConnected: true, dataset: { preferredModelDocumentId: "doc-old" } };
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
  const mutatingFrame = { isConnected: true, dataset: { preferredModelDocumentId: "doc-send" } };
  await assert.rejects(
    mutatingPort.request(mutatingFrame, "sendText", { text: "once" }),
    (error) => error instanceof FrameCommandError && error.code === "TIMEOUT" && error.delivered === true
  );
  assert.equal(mutatingCalls, 1, "a delivered mutating command must never be retried");

  const controller = new AbortController();
  const abortPort = new FrameRuntimePort({
    currentTabId: async () => 7,
    sendRuntimeMessage: () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 25))
  });
  const abortFrame = { isConnected: true, dataset: { preferredModelDocumentId: "doc-abort" } };
  const aborted = abortPort.request(abortFrame, "applyPreferredModel", {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, (error) => error instanceof FrameCommandError && error.code === "ABORTED");

  await assert.rejects(
    port.request(iframe, "notACommand"),
    (error) => error instanceof FrameCommandError && error.code === "REMOTE_ERROR" && error.delivered === false
  );

  console.log("frame runtime port: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
