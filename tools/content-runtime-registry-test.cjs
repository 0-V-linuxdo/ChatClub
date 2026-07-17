#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const [module, runtimeVersion, protocol] = await Promise.all([
    import(pathToFileURL(path.join(root, "content-src/shared/runtime-registry.js")).href),
    import(pathToFileURL(path.join(root, "shared/content-runtime-version.generated.js")).href),
    import(pathToFileURL(path.join(root, "shared/protocol.js")).href)
  ]);
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

  let installDisposed = [];
  const installed = registry.install("installed", "1", () => ({
    api: Object.freeze({ value: "first" }),
    dispose: (reason) => installDisposed.push(`first:${reason}`)
  }));
  assert.equal(registry.install("installed", "1", () => {
    throw new Error("same-version installer must not run");
  }), installed);
  const replacement = registry.install("installed", "2", () => ({
    api: Object.freeze({ value: "second" }),
    dispose: (reason) => installDisposed.push(`second:${reason}`)
  }));
  assert.equal(replacement.value, "second");
  assert.deepEqual(installDisposed, ["first:replaced by 2"]);
  registry.dispose("test shutdown");
  assert.deepEqual(installDisposed, ["first:replaced by 2", "second:test shutdown"]);

  const occupied = {};
  Object.defineProperty(occupied, protocol.RUNTIME_REGISTRY_KEY, {
    configurable: false,
    value: Object.freeze({ abiVersion: 0 })
  });
  assert.throws(
    () => module.runtimeRegistry(occupied),
    /occupied by ABI 0.*new broker key/,
    "ABI mismatch must fail clearly instead of attempting to redefine a non-configurable global"
  );

  const superseded = {};
  let supersededReason = "";
  Object.defineProperty(superseded, "__CHATCLUB_RUNTIME_REGISTRY_V0__", {
    configurable: false,
    value: Object.freeze({
      abiVersion: 0,
      dispose(reason) { supersededReason = reason; }
    })
  });
  const upgraded = module.runtimeRegistry(superseded);
  assert.equal(upgraded.abiVersion, 1);
  assert.match(supersededReason, /migrated to content runtime generation/);

  const staleSourceRegistry = {};
  let staleSourceDisposed = "";
  Object.defineProperty(staleSourceRegistry, `__CHATCLUB_RUNTIME_REGISTRY_V1_SOURCE_${"0".repeat(64)}__`, {
    configurable: false,
    value: Object.freeze({
      abiVersion: 1,
      dispose(reason) { staleSourceDisposed = reason; }
    })
  });
  module.runtimeRegistry(staleSourceRegistry);
  assert.match(
    staleSourceDisposed,
    /migrated to content runtime generation/,
    "the one-time migration must dispose a legacy source-key registry"
  );

  const stagedMigrationTarget = {};
  let stagedLegacyDisposed = "";
  Object.defineProperty(stagedMigrationTarget, `__CHATCLUB_RUNTIME_REGISTRY_V1_SOURCE_${"1".repeat(64)}__`, {
    configurable: false,
    value: Object.freeze({
      abiVersion: 1,
      dispose(reason) { stagedLegacyDisposed = reason; }
    })
  });
  Object.defineProperty(stagedMigrationTarget, protocol.RUNTIME_MIGRATION_STAGE_KEY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      registryKey: protocol.RUNTIME_REGISTRY_KEY,
      generation: runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION
    })
  });
  const stagedGeneration = module.runtimeRegistry(stagedMigrationTarget);
  const stagedBroker = stagedMigrationTarget[protocol.RUNTIME_REGISTRY_KEY];
  assert.equal(stagedGeneration.state, "pending");
  assert.equal(stagedBroker.activeGenerationVersion, "");
  assert.equal(stagedLegacyDisposed, "", "staging B must leave the legacy A generation active");
  stagedBroker.abortGeneration(runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION, "partial B injection");
  assert.equal(stagedLegacyDisposed, "", "aborting staged B must not dispose legacy A");

  const committedMigrationTarget = {};
  let committedLegacyDisposed = "";
  Object.defineProperty(committedMigrationTarget, `__CHATCLUB_RUNTIME_REGISTRY_V1_SOURCE_${"2".repeat(64)}__`, {
    configurable: false,
    value: Object.freeze({
      abiVersion: 1,
      dispose(reason) { committedLegacyDisposed = reason; }
    })
  });
  Object.defineProperty(committedMigrationTarget, protocol.RUNTIME_MIGRATION_STAGE_KEY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      registryKey: protocol.RUNTIME_REGISTRY_KEY,
      generation: runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION
    })
  });
  const committedMigration = module.runtimeRegistry(committedMigrationTarget);
  const committedMigrationBroker = committedMigrationTarget[protocol.RUNTIME_REGISTRY_KEY];
  committedMigration.register("migration-probe", { version: "B", api: Object.freeze({ generation: "B" }) });
  committedMigrationBroker.prepareGeneration(runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.equal(committedLegacyDisposed, "");
  committedMigrationBroker.commitGeneration(runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.match(committedLegacyDisposed, /migrated to content runtime generation/);
  assert.equal(committedMigration.isActive, true);

  const failedMigrationTarget = {};
  let failedLegacyDisposed = "";
  Object.defineProperty(failedMigrationTarget, `__CHATCLUB_RUNTIME_REGISTRY_V1_SOURCE_${"3".repeat(64)}__`, {
    configurable: false,
    value: Object.freeze({ dispose(reason) { failedLegacyDisposed = reason; } })
  });
  Object.defineProperty(failedMigrationTarget, protocol.RUNTIME_MIGRATION_STAGE_KEY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      registryKey: protocol.RUNTIME_REGISTRY_KEY,
      generation: runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION
    })
  });
  const failedMigration = module.runtimeRegistry(failedMigrationTarget);
  const failedMigrationBroker = failedMigrationTarget[protocol.RUNTIME_REGISTRY_KEY];
  failedMigration.register("migration-failure", {
    version: "B",
    api: {},
    activate() { throw new Error("legacy migration activation failed"); }
  });
  failedMigrationBroker.prepareGeneration(runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.throws(
    () => failedMigrationBroker.commitGeneration(runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION),
    /legacy migration activation failed/
  );
  assert.match(failedLegacyDisposed, /activation failed closed/);
  assert.equal(failedMigrationBroker.activeGenerationVersion, "");

  const listeners = new Set();
  const installListenerRuntime = (version) => registry.install("listener-runtime", version, () => {
    const listener = () => version;
    listeners.add(listener);
    return {
      api: Object.freeze({ version }),
      dispose: () => listeners.delete(listener)
    };
  });
  assert.equal(installListenerRuntime("1").version, "1");
  assert.equal(installListenerRuntime("1").version, "1");
  assert.equal(listeners.size, 1, "same-version reinjection must not duplicate listeners");
  assert.equal(installListenerRuntime("2").version, "2");
  assert.equal(listeners.size, 1, "version replacement must tear down the previous listener first");
  registry.invalidate("listener-runtime", "test complete");
  assert.equal(listeners.size, 0);

  const broker = target[protocol.RUNTIME_REGISTRY_KEY];
  assert.equal(broker.kind, "ChatClubContentRuntimeBroker");
  assert.equal(broker.activeGenerationVersion, runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.equal(registry.generationVersion, runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.equal(registry.isActive, true);

  const atomicDisposals = [];
  const activeA = Object.freeze({ generation: "A" });
  registry.register("atomic-probe", {
    version: "A",
    api: activeA,
    dispose: (reason) => atomicDisposals.push(`A:${reason}`)
  });

  let partialActivations = 0;
  const pendingPartial = broker.beginGeneration("generation-B-partial");
  assert.equal(pendingPartial.state, "pending");
  assert.equal(broker.beginGeneration("generation-B-partial"), pendingPartial, "begin must be idempotent");
  pendingPartial.register("atomic-probe", {
    version: "B-partial",
    api: Object.freeze({ generation: "B-partial" }),
    activate: () => { partialActivations += 1; },
    dispose: (reason) => atomicDisposals.push(`B-partial:${reason}`)
  });
  assert.equal(partialActivations, 0, "pending activation hooks must not run during partial installation");
  assert.equal(broker.activeGenerationVersion, runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.equal(registry.require("atomic-probe", "A"), activeA, "the old generation must remain active");
  assert.equal(pendingPartial.require("atomic-probe", "B-partial").generation, "B-partial");
  assert.equal(broker.abortGeneration("generation-B-partial", "injection failed after one file"), true);
  assert.equal(broker.activeGenerationVersion, runtimeVersion.CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
  assert.equal(registry.require("atomic-probe", "A"), activeA, "aborting a partial generation must retain A");
  assert.equal(partialActivations, 0);
  assert.match(atomicDisposals.at(-1), /^B-partial:injection failed after one file$/);
  assert.throws(() => pendingPartial.require("atomic-probe"), /generation-B-partial is aborted/);
  assert.throws(
    () => broker.beginGeneration("generation-B-partial"),
    /generation-B-partial is aborted/,
    "a partially installed generation must not be silently retried in the same document"
  );

  const activationOrder = [];
  const pendingB = broker.beginGeneration("generation-B");
  const activeB = Object.freeze({ generation: "B" });
  const bundleB = Object.freeze({
    implementationVersion: "generation-B",
    bundle: Object.freeze({
      outputPath: "content/content.js",
      entryPath: "content-src/content.js",
      sourceSha256: "a".repeat(64),
      implementationSha256: "b".repeat(64),
      implementationVersion: `bridge-v1+bundle.${"b".repeat(64)}`
    })
  });
  assert.deepEqual(pendingB.registerBundle(bundleB), bundleB.bundle);
  assert.deepEqual(pendingB.registerBundle(bundleB), bundleB.bundle, "same bundle identity must be idempotent");
  assert.throws(
    () => broker.prepareGeneration("generation-B", [{ ...bundleB.bundle, implementationSha256: "c".repeat(64) }]),
    /missing or has the wrong identity/,
    "prepare must reject a generation whose injected bundle digest differs from the package plan"
  );
  pendingB.register("atomic-probe", {
    version: "B",
    api: activeB,
    activate: () => activationOrder.push("B:activate"),
    dispose: (reason) => atomicDisposals.push(`B:${reason}`)
  });
  pendingB.register("second-probe", {
    version: "B",
    api: Object.freeze({ generation: "B" }),
    activate: () => activationOrder.push("B:second:activate"),
    dispose: (reason) => atomicDisposals.push(`B:second:${reason}`)
  });
  assert.deepEqual(activationOrder, []);
  assert.equal(registry.require("atomic-probe", "A"), activeA);
  assert.equal(broker.prepareGeneration("generation-B", [bundleB.bundle]), pendingB);
  assert.equal(pendingB.state, "prepared");
  assert.deepEqual(
    activationOrder,
    [],
    "prepare must validate the candidate generation without exposing its side effects"
  );
  assert.equal(broker.commitGeneration("generation-B"), pendingB);
  assert.deepEqual(activationOrder, ["B:activate", "B:second:activate"]);
  assert.equal(broker.activeGenerationVersion, "generation-B");
  assert.equal(pendingB.isActive, true);
  assert.equal(pendingB.require("atomic-probe", "B"), activeB);
  assert.match(
    atomicDisposals.find((value) => value.startsWith("A:")) || "",
    /superseded by content runtime generation generation-B/,
    "A must be disposed only after every B activation hook succeeds"
  );
  assert.throws(() => registry.require("atomic-probe"), /generation .* is superseded/);

  const failingB = broker.beginGeneration("generation-B-broken");
  let rolledBack = 0;
  failingB.register("first", {
    version: "1",
    api: {},
    activate: () => { activationOrder.push("broken:first"); },
    dispose: () => { rolledBack += 1; }
  });
  failingB.register("second", {
    version: "1",
    api: {},
    activate: () => { throw new Error("activation probe failed"); },
    dispose: () => { rolledBack += 1; }
  });
  assert.throws(() => broker.activateGeneration("generation-B-broken"), /activation probe failed/);
  assert.equal(rolledBack, 2, "a failed activation must dispose the entire pending generation");
  assert.equal(broker.activeGenerationVersion, "");
  assert.throws(
    () => pendingB.require("atomic-probe", "B"),
    /generation-B is aborted/,
    "an activation hook failure must fail the realm closed because side effects cannot be proven rollback-safe"
  );

  let active = pendingB;
  for (const generation of ["generation-C", "generation-D", "generation-E"]) {
    const next = broker.beginGeneration(generation);
    next.register("atomic-probe", { version: generation, api: Object.freeze({ generation }) });
    broker.activateGeneration(generation);
    active = next;
  }
  assert.equal(active.require("atomic-probe").generation, "generation-E");
  assert.deepEqual(
    Object.getOwnPropertyNames(target).filter((key) => /^__CHATCLUB_RUNTIME_(?:REGISTRY|BROKER)_V\d+/.test(key)),
    [protocol.RUNTIME_REGISTRY_KEY],
    "continuous source generations must share one stable, non-enumerable broker global"
  );
  assert.equal(broker.shutdown("cross-world activation failed closed"), 1);
  assert.equal(broker.activeGenerationVersion, "");
  assert.throws(() => active.require("atomic-probe"), /generation-E is aborted/);

  const preloadSource = [
    "content-src/preload.js",
    "content-src/preload/deepseek-delete.js",
    "content-src/preload/grok-storage-access.js",
    "content-src/preload/native-copy.js",
    "content-src/preload/notion-send.js"
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  const navigatorSource = fs.readFileSync(path.join(root, "content-src/message-navigator.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(root, "content-src/content.js"), "utf8");
  const entrySources = Object.values(require("./generated-artifacts.cjs").CONTENT_ENTRIES)
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  assert.match(preloadSource, /runtimeName = "deepseek-delete-bridge"/);
  assert.match(preloadSource, /runtimeName = "native-copy-bridge"/);
  assert.match(preloadSource, /runtimeName = "grok-storage-access-bridge"/);
  assert.match(preloadSource, /runtimeName = "notion-send-bridge"/);
  assert.match(preloadSource, /runtimes\.register\(runtimeName/);
  assert.match(preloadSource, /removeEventListener\("message", messageListener, true\)/);
  assert.match(preloadSource, /removeEventListener\("copy", copyEventCapture, true\)/);
  assert.match(preloadSource, /restoreReplacements\(\)/);
  assert.match(preloadSource, /const notionSendRequestTimers = new Set\(\)/);
  assert.match(preloadSource, /for \(const timer of notionSendRequestTimers\) clearTimeout\(timer\)/);
  assert.match(preloadSource, /notionSendRequestCache\.clear\(\)/);
  assert.match(navigatorSource, /runtimeRegistry\(window\)/);
  assert.match(navigatorSource, /runtimes\.register\(MESSAGE_NAVIGATOR_RUNTIME_NAME/);
  assert.match(contentSource, /runtimes\.install\("parent-window-rpc", CONTENT_BRIDGE_VERSION/);
  assert.match(contentSource, /__CHATCLUB_CONTENT_BRIDGE_VERSION__ === CONTENT_RUNTIME_VERSION/);
  assert.match(contentSource, /if \(!contentBridgeIsCurrent\(\)\) return;/);
  assert.match(contentSource, /removeEventListener\("message", onParentWindowMessage, true\)/);
  for (const source of entrySources) {
    assert.match(source, /registerBundle\(/, "every generated entry must claim its source-closure identity");
  }
  assert.match(
    fs.readFileSync(path.join(root, "content-src/grok-cookie-bridge.js"), "utf8"),
    /runtimes\.install\("grok-cookie-bridge-root"/,
    "the Cookie bridge must defer side effects until its generation commits"
  );

  console.log("content runtime registry ABI: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
