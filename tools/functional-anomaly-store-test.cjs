#!/usr/bin/env node

const assert = require("node:assert/strict");

function memoryStorage(options = {}) {
  const values = Object.create(null);
  const calls = [];
  return {
    calls,
    async get(key) {
      calls.push(["get", key]);
      await Promise.resolve();
      return { [key]: values[key] };
    },
    async set(update) {
      calls.push(["set", update]);
      const records = update.functionalAnomalies;
      if (options.maxRecords && Array.isArray(records) && records.length > options.maxRecords) {
        throw new Error("QUOTA_BYTES quota exceeded");
      }
      Object.assign(values, structuredClone(update));
    },
    async remove(key) {
      calls.push(["remove", key]);
      delete values[key];
    }
  };
}

(async () => {
  const { createFunctionalAnomalyStore } = await import("../background/functional-anomaly-store.js");
  let clock = 1000;
  let id = 0;
  const storage = memoryStorage();
  const store = createFunctionalAnomalyStore(storage, {
    now: () => ++clock,
    createId: () => `store-${++id}`
  });
  assert.equal(Object.isFrozen(store), true);

  await Promise.all(Array.from({ length: 20 }, (_value, index) => store.record({
    feature: "concurrency",
    operation: `write-${index}`,
    message: `failure-${index}`
  })));
  const listed = await store.list();
  assert.equal(listed.length, 20, "serialized concurrent writes must not lose records");
  assert.deepEqual(new Set(listed.map((record) => record.operation)).size, 20);

  const removedId = listed[5].id;
  const afterRemove = await store.remove(removedId);
  assert.equal(afterRemove.some((record) => record.id === removedId), false);
  assert.equal((await store.list()).length, 19);
  assert.deepEqual(await store.clear(), []);
  assert.deepEqual(await store.list(), []);

  const quotaStorage = memoryStorage({ maxRecords: 2 });
  const quotaStore = createFunctionalAnomalyStore(quotaStorage, {
    now: () => ++clock,
    createId: () => `quota-${++id}`
  });
  await quotaStore.record({ feature: "quota", operation: "oldest" });
  await quotaStore.record({ feature: "quota", operation: "middle" });
  const newest = await quotaStore.record({ feature: "quota", operation: "newest" });
  assert.equal(newest.records.length, 2);
  assert.deepEqual(newest.records.map((record) => record.operation), ["newest", "middle"]);
  assert.ok(quotaStorage.calls.filter(([name]) => name === "set").length >= 4, "quota writes must retry after pruning");

  console.log("functional anomaly background store serialization and quota pruning: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
