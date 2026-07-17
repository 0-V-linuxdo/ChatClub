#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    activeCustomSummaryRuntimeReady,
    invokeActiveRuntimeMethod
  } = await import(pathToFileURL(path.join(root, "background/main-world-runtime.js")).href);

  const registryKey = "__CHATCLUB_TEST_RUNTIME_BROKER__";
  const executorKey = "__CHATCLUB_TEST_SUMMARY_EXECUTOR__";
  const abiVersion = 7;
  const generation = "generation-current";
  const expectedBundle = Object.freeze({
    outputPath: "content/summary-userscripts-main.js",
    entryPath: "content-src/summary-userscripts-main.js",
    sourceSha256: "a".repeat(64),
    implementationSha256: "b".repeat(64),
    implementationVersion: `${generation}+bundle.${"b".repeat(64)}`
  });
  let acquireCalls = 0;
  let preparedPayload = null;
  const facade = Object.freeze({
    isActive: true,
    require(name, version) {
      assert.equal(name, "navigation-focus-guard");
      assert.equal(version, "guard-v1");
      return Object.freeze({
        prepare(payload) {
          preparedPayload = payload;
          return { ok: true, payload };
        }
      });
    },
    bundleRegistration(outputPath) {
      return outputPath === expectedBundle.outputPath ? expectedBundle : null;
    }
  });
  const broker = {
    abiVersion,
    activeGenerationVersion: generation,
    acquireGeneration(requested) {
      acquireCalls += 1;
      assert.equal(requested, generation);
      return facade;
    }
  };

  globalThis[registryKey] = broker;
  globalThis[executorKey] = () => {};
  try {
    const payload = { guardToken: "guard-1" };
    assert.deepEqual(
      invokeActiveRuntimeMethod(
        registryKey,
        abiVersion,
        generation,
        "navigation-focus-guard",
        "guard-v1",
        "prepare",
        payload
      ),
      { ok: true, payload }
    );
    assert.equal(preparedPayload, payload);
    assert.equal(acquireCalls, 1);
    assert.equal(
      activeCustomSummaryRuntimeReady(executorKey, registryKey, abiVersion, generation, expectedBundle),
      true
    );
    assert.equal(acquireCalls, 2);

    broker.activeGenerationVersion = "generation-old";
    assert.throws(
      () => invokeActiveRuntimeMethod(
        registryKey,
        abiVersion,
        generation,
        "navigation-focus-guard",
        "guard-v1",
        "prepare",
        payload
      ),
      /broker is unavailable or stale/
    );
    assert.equal(
      activeCustomSummaryRuntimeReady(executorKey, registryKey, abiVersion, generation, expectedBundle),
      false
    );
    assert.equal(acquireCalls, 2, "a stale generation must not be acquired");

    broker.activeGenerationVersion = generation;
    delete globalThis[executorKey];
    assert.equal(
      activeCustomSummaryRuntimeReady(executorKey, registryKey, abiVersion, generation, expectedBundle),
      false
    );
    assert.equal(acquireCalls, 2, "a missing executor must fail before generation acquisition");
    globalThis[executorKey] = () => {};
    assert.equal(
      activeCustomSummaryRuntimeReady(
        executorKey,
        registryKey,
        abiVersion,
        generation,
        { ...expectedBundle, implementationSha256: "c".repeat(64) }
      ),
      false
    );
  } finally {
    delete globalThis[registryKey];
    delete globalThis[executorKey];
  }

  console.log("active MAIN-world runtime generation guard: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
