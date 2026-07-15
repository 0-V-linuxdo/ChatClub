#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
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
  Object.defineProperty(occupied, "__CHATCLUB_RUNTIME_REGISTRY_V1__", {
    configurable: false,
    value: Object.freeze({ abiVersion: 0 })
  });
  assert.throws(
    () => module.runtimeRegistry(occupied),
    /occupied by ABI 0.*new registry key/,
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
  assert.match(supersededReason, /superseded by runtime registry ABI 1/);

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

  const preloadSource = [
    "content-src/preload.js",
    "content-src/preload/deepseek-delete.js",
    "content-src/preload/grok-storage-access.js",
    "content-src/preload/native-copy.js",
    "content-src/preload/notion-send.js"
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  const navigatorSource = fs.readFileSync(path.join(root, "content-src/message-navigator.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(root, "content-src/content.js"), "utf8");
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
  assert.match(navigatorSource, /runtimes\.register\(RUNTIME_NAME/);
  assert.match(contentSource, /runtimes\.install\("parent-window-rpc", CONTENT_BRIDGE_VERSION/);
  assert.match(contentSource, /if \(!contentBridgeIsCurrent\(\)\) return;/);
  assert.match(contentSource, /removeEventListener\("message", onParentWindowMessage, true\)/);

  console.log("content runtime registry ABI: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
