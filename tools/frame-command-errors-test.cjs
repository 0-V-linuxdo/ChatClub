#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { frameRouteError, normalizeFrameTransportError } = await import(
    pathToFileURL(path.join(root, "background/frame-command-errors.js")).href
  );

  const unspecified = frameRouteError("REMOTE_ERROR", "delivery state is unknown");
  assert.equal(Object.hasOwn(unspecified, "delivered"), false);

  const explicitPreDelivery = frameRouteError("STALE_DOCUMENT", "verified document changed", false);
  assert.equal(normalizeFrameTransportError(explicitPreDelivery), explicitPreDelivery);

  const portClosed = normalizeFrameTransportError(
    new Error("The message port closed before a response was received")
  );
  assert.equal(portClosed.code, "REMOTE_ERROR");
  assert.equal(portClosed.delivered, true, "a closed response port may have delivered the mutating command");

  const unclassifiedFalse = new Error("unclassified transport failure");
  unclassifiedFalse.delivered = false;
  const conservative = normalizeFrameTransportError(unclassifiedFalse);
  assert.equal(conservative.code, "REMOTE_ERROR");
  assert.equal(conservative.delivered, true, "unclassified delivered=false must not be trusted as pre-delivery proof");

  const timeout = normalizeFrameTransportError(new Error("Timeout waiting for response"));
  assert.equal(timeout.code, "TIMEOUT");
  assert.equal(timeout.delivered, true);

  console.log("background frame command delivery classification: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
