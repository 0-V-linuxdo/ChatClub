#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { createFrameRequest } = await import("../app/frame-request.js");
  assert.throws(() => createFrameRequest({}, "Example"), /Example requires framePort\.request/);

  const calls = [];
  const request = createFrameRequest({
    request(...args) {
      calls.push(args);
      return Promise.resolve("ok");
    }
  }, "Example");
  const iframe = {};
  assert.equal(await request(iframe, "getLocationHref", {}, 1200), "ok");
  assert.deepEqual(calls.pop(), [iframe, "getLocationHref", {}, { timeoutMs: 1200 }]);

  const controller = new AbortController();
  const options = { timeoutMs: 2000, signal: controller.signal };
  await request(iframe, "applyPreferredModel", { model: "pro" }, options);
  assert.deepEqual(calls.pop(), [iframe, "applyPreferredModel", { model: "pro" }, options]);

  console.log("App frame request adapter: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
