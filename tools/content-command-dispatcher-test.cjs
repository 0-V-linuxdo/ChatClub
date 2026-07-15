#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { createCommandDispatcher } = await import(
    pathToFileURL(path.join(root, "content-src/shared/command-dispatcher.js")).href
  );
  const calls = [];
  const dispatch = createCommandDispatcher(
    Object.freeze({ read: {}, mutate: {} }),
    Object.freeze({
      read: (data) => ({ value: data.value }),
      mutate: async (data) => {
        calls.push(data.value);
        return { ok: true };
      }
    })
  );
  assert.deepEqual(await dispatch("read", { value: 7 }), { value: 7 });
  assert.deepEqual(await dispatch("mutate", { value: "once" }), { ok: true });
  assert.deepEqual(calls, ["once"]);
  await assert.rejects(() => dispatch("missing"), /Unknown action: missing/);
  assert.throws(
    () => createCommandDispatcher({ read: {}, missing: {} }, { read: () => null }),
    /Missing content command handler: missing/
  );
  assert.throws(
    () => createCommandDispatcher({ read: {} }, { read: () => null, extra: () => null }),
    /Unknown content command handler: extra/
  );
  console.log("content command dispatcher: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
