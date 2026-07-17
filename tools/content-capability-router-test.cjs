#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

(async () => {
  const [registryModule, routerModule] = await Promise.all([
    load("content-src/shared/runtime-registry.js"),
    load("content-src/shared/command-router.js")
  ]);
  const runtimes = registryModule.runtimeRegistry({});
  const router = routerModule.contentCommandRouter(runtimes, runtimes.generationVersion);
  let calls = 0;
  routerModule.installContentCapability(runtimes, {
    capability: "base",
    owner: "base-test",
    version: "1",
    routerVersion: runtimes.generationVersion,
    handlers: {
      getLocationHref: () => {
        calls += 1;
        return "https://example.test/thread";
      },
      getPageMeta: () => ({}),
      getPageText: () => ""
    }
  });
  assert.equal(await router.dispatch("getLocationHref"), "https://example.test/thread");
  assert.equal(calls, 1);
  await assert.rejects(
    router.dispatch("deleteThread", {}),
    (error) => error?.code === "CAPABILITY_UNAVAILABLE" && error.capability === "delete"
  );
  assert.throws(
    () => router.register("summary", "bad-owner", { deleteThread() {} }),
    /belongs to delete, not summary/
  );
  runtimes.invalidate("base-test", "test teardown");
  await assert.rejects(
    router.dispatch("getLocationHref"),
    (error) => error?.code === "CAPABILITY_UNAVAILABLE" && error.capability === "base"
  );
  console.log("content capability router fail-closed dispatch: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
