#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const module = await import(pathToFileURL(path.join(root, "content-src/shared/runtime-registry.js")).href);
  const target = {};
  const registry = module.runtimeRegistry(target);
  let disposed = [];
  const first = Object.freeze({ value: 1 });
  const duplicate = Object.freeze({ value: "duplicate" });
  const second = Object.freeze({ value: 2 });

  assert.equal(registry.register("probe", {
    version: "1",
    api: first,
    dispose: (reason) => disposed.push(`1:${reason}`)
  }), first);
  assert.equal(registry.register("probe", { version: "1", api: duplicate }), first, "same-version registration must be idempotent");
  assert.deepEqual(disposed, []);
  assert.equal(registry.require("probe", "1"), first);
  assert.throws(() => registry.require("probe", "2"), /does not satisfy/);

  assert.equal(registry.register("probe", {
    version: "2",
    api: second,
    dispose: (reason) => disposed.push(`2:${reason}`)
  }), second);
  assert.deepEqual(disposed, ["1:replaced by 2"], "version replacement must dispose the prior runtime first");
  assert.equal(registry.require("probe", "2"), second);
  assert.equal(registry.invalidate("probe", "test complete"), true);
  assert.deepEqual(disposed, ["1:replaced by 2", "2:test complete"]);
  assert.throws(() => registry.require("probe"), /not registered/);
  assert.equal(module.runtimeRegistry(target), registry, "all content modules must share one registry ABI");
  assert.deepEqual(Object.keys(target), [], "registry storage must not add enumerable globals");

  console.log("content runtime registry ABI: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
