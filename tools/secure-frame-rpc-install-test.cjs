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
  const createExtensionApi = (label) => {
    const listeners = new Set();
    const calls = { add: 0, remove: 0 };
    return {
      label,
      listeners,
      calls,
      api: {
        runtime: {
          id: "chatclub-test",
          onMessage: {
            addListener(listener) {
              calls.add += 1;
              listeners.add(listener);
            },
            removeListener(listener) {
              calls.remove += 1;
              listeners.delete(listener);
            }
          }
        }
      }
    };
  };
  const runtimeA = createExtensionApi("A");
  const runtimeB = createExtensionApi("B");
  let extensionApi = runtimeA.api;
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
  assert.equal(runtimeA.listeners.size, 1);
  assert.equal(runtimeA.calls.add, 1);
  assert.equal(install("1"), first);
  assert.equal(runtimeA.listeners.size, 1, "same-version injection must keep one listener");
  assert.equal(runtimeA.calls.add, 1, "same-runtime reinjection must not add another listener");

  extensionApi = runtimeB.api;
  const rebound = install("1");
  assert.notEqual(rebound, first, "the same content generation must replace an RPC owned by an obsolete extension runtime");
  assert.equal(runtimeA.listeners.size, 0, "runtime A must release its obsolete listener");
  assert.equal(runtimeA.calls.remove, 1, "runtime A listener teardown must run exactly once");
  assert.equal(runtimeB.listeners.size, 1, "runtime B must receive exactly one listener");
  assert.equal(runtimeB.calls.add, 1, "runtime B listener activation must run exactly once");
  assert.equal(runtimes.registration("frame-rpc").api.extensionRuntime, runtimeB.api.runtime);
  assert.equal(install("1"), rebound, "same-version reinjection on runtime B must be idempotent");
  assert.equal(runtimeB.listeners.size, 1);
  assert.equal(runtimeB.calls.add, 1);

  install("2");
  assert.equal(runtimeB.listeners.size, 1, "version replacement must remove the prior listener");
  assert.equal(runtimeB.calls.remove, 1, "version replacement must dispose the runtime B predecessor once");
  assert.equal(runtimeB.calls.add, 2, "version replacement must activate one successor listener");
  const listener = [...runtimeB.listeners][0];
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
  [...runtimeB.listeners][0]({
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
  assert.equal(runtimeA.listeners.size, 0);
  assert.equal(runtimeB.listeners.size, 0);
  console.log("secure frame RPC installation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
