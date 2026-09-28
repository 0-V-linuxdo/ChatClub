#!/usr/bin/env node

// Record Full Text storage layout: one record per desk plus a small index,
// with the legacy aggregate folded in and removed by the next page write.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function fakeChromeStorage(initial = {}) {
  const values = { ...initial };
  const log = [];
  let quotaBytes = Infinity;
  const size = (object) => JSON.stringify(object).length;
  const local = {
    get: (keys, callback) => {
      log.push(["get", keys]);
      let result = {};
      if (keys === null || keys === undefined) result = { ...values };
      else {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
        }
      }
      callback(JSON.parse(JSON.stringify(result)));
    },
    set: (items, callback) => {
      log.push(["set", Object.keys(items)]);
      const next = { ...values, ...items };
      if (size(next) > quotaBytes) {
        globalThis.chrome.runtime.lastError = { message: "QUOTA_BYTES quota exceeded" };
        callback();
        globalThis.chrome.runtime.lastError = null;
        return;
      }
      Object.assign(values, JSON.parse(JSON.stringify(items)));
      callback();
    },
    remove: (keys, callback) => {
      log.push(["remove", keys]);
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      callback();
    }
  };
  globalThis.chrome = { storage: { local }, runtime: { lastError: null } };
  return {
    values,
    log,
    setQuota: (bytes) => { quotaBytes = bytes; }
  };
}

function record(workspaceId, updatedAt, text = "answer") {
  return {
    workspaceId,
    topicTitle: `title ${workspaceId}`,
    updatedAt,
    frames: [{
      appName: "ChatGPT",
      href: `https://chatgpt.com/c/${workspaceId}`,
      messages: [
        { role: "user", text: `question ${workspaceId}` },
        { role: "assistant", text }
      ]
    }]
  };
}

(async () => {
  const storage = await import(pathToFileURL(path.join(root, "shared/workspace-tab-fulltext-storage.js")).href);
  const {
    WORKSPACE_TAB_FULLTEXT_INDEX_KEY,
    WORKSPACE_TAB_FULLTEXT_LEGACY_KEY,
    evictOldestFromWorkspaceTabFullTextPlan,
    planWorkspaceTabFullTextForget,
    planWorkspaceTabFullTextRecordWrite,
    workspaceIdFromFullTextRecordKey,
    workspaceTabFullTextRecordFromSnapshot,
    workspaceTabFullTextRecordKey,
    workspaceTabFullTextRecordKeysFromIndex,
    workspaceTabFullTextRecordReadKeys,
    workspaceTabFullTextStoreFromSnapshot
  } = storage;

  const a = "page-aaaaaaaaaaaa";
  const b = "page-bbbbbbbbbbbb";
  const c = "page-cccccccccccc";
  const keyA = workspaceTabFullTextRecordKey(a);

  // Keys round-trip and reject anything that is not a workspace id.
  assert.equal(keyA, `workspaceTabFullText.${a}`);
  assert.equal(workspaceIdFromFullTextRecordKey(keyA), a);
  assert.equal(workspaceIdFromFullTextRecordKey("workspaceTabFullText"), "");
  assert.equal(workspaceIdFromFullTextRecordKey("workspaceTabFullText.nope"), "");
  assert.equal(workspaceTabFullTextRecordKey("nope"), "");
  assert.deepEqual(workspaceTabFullTextRecordReadKeys(a), [keyA, WORKSPACE_TAB_FULLTEXT_INDEX_KEY, WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]);
  assert.deepEqual(workspaceTabFullTextRecordKeysFromIndex({ [a]: "1", bogus: "2" }), [keyA]);

  // Snapshot assembly: per-record keys and the legacy aggregate merge; the
  // newer copy of the same desk wins in either direction.
  {
    const snapshot = {
      [WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]: {
        [a]: record(a, "2026-09-01T00:00:00.000Z", "legacy a"),
        [b]: record(b, "2026-09-05T00:00:00.000Z", "legacy b newer")
      },
      [keyA]: record(a, "2026-09-02T00:00:00.000Z", "record a newer"),
      [workspaceTabFullTextRecordKey(b)]: record(b, "2026-09-03T00:00:00.000Z", "record b"),
      [workspaceTabFullTextRecordKey(c)]: record(c, "2026-09-04T00:00:00.000Z", "record c"),
      unrelated: { frames: [] }
    };
    const store = workspaceTabFullTextStoreFromSnapshot(snapshot);
    assert.deepEqual(Object.keys(store).sort(), [a, b, c]);
    assert.equal(store[a].frames[0].messages[1].text, "record a newer");
    assert.equal(store[b].frames[0].messages[1].text, "legacy b newer");
    assert.equal(workspaceTabFullTextRecordFromSnapshot(snapshot, c).frames[0].messages[1].text, "record c");
    assert.equal(workspaceTabFullTextRecordFromSnapshot(snapshot, "page-zzzzzzzzzzzz"), null);
  }

  // Record write: writes only that record plus the index when there is no
  // legacy aggregate, and prunes the oldest desks beyond the cap.
  {
    const snapshot = { [WORKSPACE_TAB_FULLTEXT_INDEX_KEY]: { [a]: "2026-09-01T00:00:00.000Z", [b]: "2026-09-02T00:00:00.000Z" } };
    const plan = planWorkspaceTabFullTextRecordWrite(snapshot, record(c, "2026-09-03T00:00:00.000Z"));
    assert.deepEqual(Object.keys(plan.set).sort(), [WORKSPACE_TAB_FULLTEXT_INDEX_KEY, workspaceTabFullTextRecordKey(c)].sort());
    assert.deepEqual(plan.remove, []);
    assert.equal(plan.migratedLegacy, false);
    assert.deepEqual(Object.keys(plan.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]).sort(), [a, b, c]);

    const pruned = planWorkspaceTabFullTextRecordWrite(snapshot, record(c, "2026-09-03T00:00:00.000Z"), { maxWorkspaces: 2 });
    assert.deepEqual(pruned.remove, [keyA], "the oldest desk beyond the cap is removed by key");
    assert.deepEqual(Object.keys(pruned.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]).sort(), [b, c]);

    // The desk being written is never the one pruned, even when it is oldest.
    const keepSelf = planWorkspaceTabFullTextRecordWrite(snapshot, record(c, "2020-01-01T00:00:00.000Z"), { maxWorkspaces: 1 });
    assert.ok(keepSelf.set[workspaceTabFullTextRecordKey(c)]);
    assert.ok(keepSelf.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY][c]);

    assert.equal(planWorkspaceTabFullTextRecordWrite(snapshot, { workspaceId: "nope", frames: [] }), null);
    assert.equal(planWorkspaceTabFullTextRecordWrite(snapshot, { workspaceId: c, frames: [{ messages: [] }] }), null, "a record without messages is not stored");
  }

  // Legacy migration: every legacy desk without a per-record copy lands under
  // its own key in the same write, the aggregate is removed, and a desk that
  // already has a record is not overwritten by its stale legacy copy.
  {
    const snapshot = {
      [WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]: {
        [a]: record(a, "2026-09-01T00:00:00.000Z", "legacy a"),
        [b]: record(b, "2026-09-02T00:00:00.000Z", "legacy b")
      },
      [WORKSPACE_TAB_FULLTEXT_INDEX_KEY]: { [b]: "2026-09-06T00:00:00.000Z" }
    };
    const plan = planWorkspaceTabFullTextRecordWrite(snapshot, record(c, "2026-09-03T00:00:00.000Z"));
    assert.equal(plan.migratedLegacy, true);
    assert.deepEqual(plan.remove, [WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]);
    assert.equal(plan.set[keyA].frames[0].messages[1].text, "legacy a");
    assert.equal(plan.set[workspaceTabFullTextRecordKey(b)], undefined, "an indexed desk keeps its per-record copy");
    assert.deepEqual(plan.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY], {
      [a]: "2026-09-01T00:00:00.000Z",
      [b]: "2026-09-06T00:00:00.000Z",
      [c]: "2026-09-03T00:00:00.000Z"
    });
  }

  // Quota fallback evicts the oldest other desk from the plan.
  {
    const snapshot = { [WORKSPACE_TAB_FULLTEXT_INDEX_KEY]: { [a]: "2026-09-01T00:00:00.000Z", [b]: "2026-09-02T00:00:00.000Z" } };
    const plan = planWorkspaceTabFullTextRecordWrite(snapshot, record(c, "2026-09-03T00:00:00.000Z"));
    const smaller = evictOldestFromWorkspaceTabFullTextPlan(plan, c);
    assert.equal(smaller.evicted, a);
    assert.deepEqual(smaller.remove, [keyA]);
    assert.deepEqual(Object.keys(smaller.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]).sort(), [b, c]);
    const smallest = evictOldestFromWorkspaceTabFullTextPlan(smaller, c);
    assert.equal(smallest.evicted, b);
    assert.equal(evictOldestFromWorkspaceTabFullTextPlan(smallest, c), null, "the desk being written is never evicted");
  }

  // Forget: drops the record key, the index entry, and the legacy entry.
  {
    const snapshot = {
      [keyA]: record(a, "2026-09-01T00:00:00.000Z"),
      [WORKSPACE_TAB_FULLTEXT_INDEX_KEY]: { [a]: "2026-09-01T00:00:00.000Z", [b]: "2026-09-02T00:00:00.000Z" },
      [WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]: { [a]: record(a, "2026-08-01T00:00:00.000Z"), [b]: record(b, "2026-08-02T00:00:00.000Z") }
    };
    const plan = planWorkspaceTabFullTextForget(snapshot, a);
    assert.equal(plan.changed, true);
    assert.deepEqual(plan.remove, [keyA]);
    assert.deepEqual(plan.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY], { [b]: "2026-09-02T00:00:00.000Z" });
    assert.deepEqual(Object.keys(plan.set[WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]), [b]);
    assert.equal(planWorkspaceTabFullTextForget(snapshot, c).changed, false);
    assert.equal(planWorkspaceTabFullTextForget({}, a).changed, false);
  }

  // Page store end to end against a callback chrome.storage.local: the first
  // persist migrates the legacy aggregate, later persists touch one record,
  // whole-store reads never call get(null), and forget removes one key.
  {
    const fake = fakeChromeStorage({
      [WORKSPACE_TAB_FULLTEXT_LEGACY_KEY]: {
        [a]: record(a, "2026-09-01T00:00:00.000Z", "legacy a"),
        [b]: record(b, "2026-09-02T00:00:00.000Z", "legacy b")
      }
    });
    const {
      forgetWorkspaceTabFullText,
      loadWorkspaceTabFullTextRecord,
      loadWorkspaceTabFullTextStore,
      persistWorkspaceTabFullTextFromPreview
    } = await import(pathToFileURL(path.join(root, "app/workspace/tab-search.js")).href);

    const before = await loadWorkspaceTabFullTextStore();
    assert.deepEqual(Object.keys(before).sort(), [a, b], "a pre-migration store still reads through the legacy aggregate");
    assert.equal((await loadWorkspaceTabFullTextRecord(b)).frames[0].messages[1].text, "legacy b");

    const items = [{
      status: "ok",
      siteId: "ChatGPT",
      siteName: "ChatGPT",
      instanceId: "one",
      page: { href: `https://chatgpt.com/c/${c}`, messages: [{ role: "user", text: "q c" }, { role: "assistant", text: "a c" }] }
    }];
    const first = await persistWorkspaceTabFullTextFromPreview({ workspaceId: c, topicTitle: "desk c", items });
    assert.equal(first.saved, true);
    assert.equal(first.migratedLegacy, true);
    assert.equal(fake.values[WORKSPACE_TAB_FULLTEXT_LEGACY_KEY], undefined, "the first write removes the legacy aggregate");
    assert.ok(fake.values[keyA], "legacy desks land under their own keys");
    assert.ok(fake.values[workspaceTabFullTextRecordKey(b)]);
    assert.ok(fake.values[workspaceTabFullTextRecordKey(c)]);
    assert.deepEqual(Object.keys(fake.values[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]).sort(), [a, b, c]);

    fake.log.length = 0;
    const again = await persistWorkspaceTabFullTextFromPreview({ workspaceId: c, topicTitle: "desk c", items });
    assert.equal(again.unchanged, true, "an identical persist is a no-op");
    assert.ok(fake.log.every(([op]) => op === "get"), "an unchanged persist must not write");
    assert.ok(
      fake.log.every(([op, keys]) => op !== "get" || (Array.isArray(keys) && !keys.includes(keyA))),
      "persisting one desk must not read the other desks' records"
    );

    fake.log.length = 0;
    const grown = await persistWorkspaceTabFullTextFromPreview({
      workspaceId: c,
      topicTitle: "desk c",
      items: [{
        ...items[0],
        page: { ...items[0].page, messages: [...items[0].page.messages, { role: "user", text: "q2" }, { role: "assistant", text: "a2" }] }
      }]
    });
    assert.equal(grown.saved, true);
    const writes = fake.log.filter(([op]) => op === "set");
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0][1].sort(), [WORKSPACE_TAB_FULLTEXT_INDEX_KEY, workspaceTabFullTextRecordKey(c)].sort(), "a grown desk writes its record and the index only");
    assert.equal(fake.values[workspaceTabFullTextRecordKey(c)].frames[0].messages.length, 4);

    fake.log.length = 0;
    const store = await loadWorkspaceTabFullTextStore();
    assert.deepEqual(Object.keys(store).sort(), [a, b, c]);
    assert.ok(fake.log.every(([, keys]) => keys !== null && keys !== undefined), "whole-store reads must not call get(null)");

    const forgotten = await forgetWorkspaceTabFullText(a);
    assert.equal(forgotten.forgotten, true);
    assert.equal(fake.values[keyA], undefined);
    assert.deepEqual(Object.keys(fake.values[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]).sort(), [b, c]);
    assert.equal((await forgetWorkspaceTabFullText(a)).forgotten, false);
    assert.equal(await loadWorkspaceTabFullTextRecord(a), null);

    // Quota: the oldest other desk is evicted and the write retried.
    fake.setQuota(JSON.stringify(fake.values).length + 40);
    const squeezed = await persistWorkspaceTabFullTextFromPreview({
      workspaceId: c,
      topicTitle: "desk c",
      items: [{
        ...items[0],
        page: { ...items[0].page, messages: [...items[0].page.messages, { role: "user", text: "q3 ".repeat(40) }, { role: "assistant", text: "a3 ".repeat(40) }] }
      }]
    });
    assert.equal(squeezed.saved, true);
    assert.equal(fake.values[workspaceTabFullTextRecordKey(b)], undefined, "quota pressure evicts the oldest other desk");
    assert.deepEqual(Object.keys(fake.values[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]), [c]);
  }

  // Wiring: the background forget goes through the same plan, the idle
  // capture hydrates from the one-desk read, and nothing still writes the
  // aggregate key from the page.
  const directory = read("background/workspace-tab-directory.js");
  assert.match(directory, /planWorkspaceTabFullTextForget\(stored, resolvedWorkspaceId\)/);
  assert.doesNotMatch(directory, /STORAGE_KEYS\.workspaceTabFullText/);
  const tabSearch = read("app/workspace/tab-search.js");
  assert.doesNotMatch(tabSearch, /storageSet\(STORAGE_KEYS\.workspaceTabFullText/);
  assert.match(tabSearch, /export async function loadWorkspaceTabFullTextRecord/);
  const runtime = read("app/runtime.js");
  assert.match(runtime, /loadWorkspaceTabFullText:\s*loadWorkspaceTabFullTextRecord/);

  console.log("workspace-tab-fulltext-storage-test passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
