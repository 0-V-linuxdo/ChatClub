#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { runtimeRegistry } = await import(
    pathToFileURL(path.join(root, "content-src/shared/runtime-registry.js")).href
  );
  const { createMessageNavigatorPort } = await import(
    pathToFileURL(path.join(root, "content-src/shared/message-navigator-port.js")).href
  );
  const runtimes = runtimeRegistry({});
  const port = createMessageNavigatorPort(runtimes);
  assert.equal(port.state().ok, false);
  assert.throws(() => port.setEnabled({ enabled: true }), /unavailable/);
  assert.throws(() => port.conversationOpening({ config: {} }), /unavailable|cannot probe/);
  const calls = [];
  const openings = [];
  runtimes.register("message-navigator", {
    version: "1",
    api: {
      setEnabled: (data) => {
        calls.push(data);
        return { ok: true };
      },
      closeMenu: () => ({ closed: true }),
      state: () => ({ ok: true, enabled: true }),
      conversationOpening: (config) => {
        openings.push(config);
        return { ok: true, openingText: "first question" };
      }
    }
  });
  assert.deepEqual(port.setEnabled({ enabled: true }), { ok: true });
  assert.deepEqual(calls, [{ enabled: true }]);
  assert.deepEqual(port.hideMenu(), { closed: true });
  assert.deepEqual(port.state(), { ok: true, enabled: true });
  assert.deepEqual(
    port.conversationOpening({ config: { adapter: "generic", messageSelector: "article" } }),
    { ok: true, openingText: "first question" }
  );
  assert.deepEqual(port.conversationOpening({ config: "not-an-object" }), { ok: true, openingText: "first question" });
  assert.deepEqual(openings, [{ adapter: "generic", messageSelector: "article" }, {}], "the port forwards only an object config");
  console.log("message navigator runtime port: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
