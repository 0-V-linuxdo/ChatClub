#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { runtimeRegistry } = await import(
    pathToFileURL(path.join(root, "content-src/shared/runtime-registry.js")).href
  );
  const { installSecureFrameRpc } = await import(
    pathToFileURL(path.join(root, "content-src/shared/secure-frame-rpc.js")).href
  );
  const listeners = new Set();
  const extensionApi = {
    runtime: {
      id: "chatclub-test",
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener)
      }
    }
  };
  const runtimes = runtimeRegistry({});
  const install = (version, dispatch = async (action, data) => ({ action, data })) => installSecureFrameRpc({
    extensionApi,
    runtimes,
    version,
    source: "secure-source",
    bridgeDocumentId: "document-1",
    secureFrameToken: "secure-token",
    dispatch
  });
  const first = install("1");
  assert.equal(listeners.size, 1);
  assert.equal(install("1"), first);
  assert.equal(listeners.size, 1, "same-version injection must keep one listener");
  install("2");
  assert.equal(listeners.size, 1, "version replacement must remove the prior listener");
  const listener = [...listeners][0];
  assert.equal(listener({ source: "wrong" }, { id: "chatclub-test" }, () => {}), false);
  let response;
  assert.equal(listener({
    source: "secure-source",
    type: "request",
    bridgeDocumentId: "document-1",
    secureFrameToken: "secure-token",
    action: "probe",
    data: { value: 9 }
  }, { id: "chatclub-test" }, (value) => { response = value; }), true);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.deepEqual(response, { success: true, data: { action: "probe", data: { value: 9 } } });
  install("3", async () => {
    const error = new Error("Content capability is not installed: delete");
    error.code = "CAPABILITY_UNAVAILABLE";
    error.capability = "delete";
    throw error;
  });
  response = null;
  [...listeners][0]({
    source: "secure-source",
    type: "request",
    bridgeDocumentId: "document-1",
    secureFrameToken: "secure-token",
    action: "deleteThread",
    data: {}
  }, { id: "chatclub-test" }, (value) => { response = value; });
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.deepEqual(response, {
    success: false,
    error: "Content capability is not installed: delete",
    code: "CAPABILITY_UNAVAILABLE",
    capability: "delete",
    delivered: false
  });
  runtimes.dispose();
  assert.equal(listeners.size, 0);
  console.log("secure frame RPC installation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
