#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

function storageArea(initial = {}) {
  const values = { ...initial };
  const calls = { get: [], remove: [], set: [] };
  return {
    values,
    calls,
    api: {
      async get(key) {
        calls.get.push(key);
        if (key === null) return { ...values };
        if (Array.isArray(key)) {
          return Object.fromEntries(key.filter((item) => item in values).map((item) => [item, values[item]]));
        }
        return key in values ? { [key]: values[key] } : {};
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        calls.remove.push([...list]);
        for (const key of list) delete values[key];
      },
      async set(update) {
        calls.set.push({ ...update });
        Object.assign(values, update);
      }
    }
  };
}

function fixture({ local = {}, session = {}, tabs = [] } = {}) {
  const localArea = storageArea(local);
  const sessionArea = storageArea(session);
  let currentTabs = tabs;
  const api = {
    storage: { local: localArea.api, session: sessionArea.api },
    tabs: { query: async () => currentTabs.map((tab) => ({ ...tab })) }
  };
  return {
    api,
    local: localArea,
    session: sessionArea,
    setTabs(value) { currentTabs = value; }
  };
}

(async () => {
  const background = await load("background/workspace-session.js");
  const tabRuntime = await load("background/tab-runtime.js");
  const shared = await load("shared/workspace-session.js");
  const {
    claimWorkspaceSessionRecovery,
    commitWorkspaceSessionRecovery,
    detachWorkspaceSessionMirror,
    ensureWorkspaceSessionGeneration,
    prepareWorkspaceSessionLifecycle,
    rotateWorkspaceSessionGeneration
  } = background;
  const {
    DEFAULT_WORKSPACE_SESSION_GENERATION,
    WORKSPACE_SESSION_GENERATION_KEY,
    WORKSPACE_SESSION_RECOVERY_KEY,
    WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
    WORKSPACE_SESSION_STORAGE_VERSION,
    normalizeWorkspaceSessionId,
    workspaceSessionBindingKey,
    workspaceSessionIdFromUrl,
    workspaceSessionMirrorKey,
    workspaceSessionWorkspaceKey
  } = shared;

  const generation = DEFAULT_WORKSPACE_SESSION_GENERATION;
  const workspaceA = "page-aaaaaaaaaaaa";
  const workspaceB = "page-bbbbbbbbbbbb";
  const snapshot = (marker) => ({ schemaVersion: 1, generation, marker });
  const stable = (workspaceId, marker, owner, updatedAt, detachedAt = null) => ({
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    snapshot: snapshot(marker),
    owner,
    updatedAt,
    detachedAt
  });
  const binding = (workspaceId, tabId, windowId, index, updatedAt) => ({
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    tabId,
    windowId,
    index,
    pinned: false,
    updatedAt,
    detachedAt: null
  });

  {
    let listener = null;
    const created = [];
    tabRuntime.registerActionListener({
      runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
      action: { onClicked: { addListener: (value) => { listener = value; } } },
      tabs: { create: (details) => { created.push(details); } }
    });
    listener();
    assert.equal(created.length, 1);
    assert.match(created[0].url, /^chrome-extension:\/\/chatclub\/chatClub\.html#workspace=page-/);
    assert.ok(workspaceSessionIdFromUrl(created[0].url), "action-created pages must carry a stable workspace id");
  }

  {
    const store = fixture();
    assert.equal(await ensureWorkspaceSessionGeneration(store.api), generation);
    assert.equal(await ensureWorkspaceSessionGeneration(store.api), generation);
    assert.deepEqual(store.local.calls.set, [{ [WORKSPACE_SESSION_GENERATION_KEY]: generation }]);
    const rotated = await rotateWorkspaceSessionGeneration(store.api);
    assert.notEqual(rotated, generation);
    assert.equal(await ensureWorkspaceSessionGeneration(store.api), rotated);
  }

  {
    const now = 100000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "ordinary-close",
          { tabId: 101, windowId: 7, index: 3, pinned: false },
          now - 1000,
          now - 500
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: {
          version: WORKSPACE_SESSION_STORAGE_VERSION,
          runtimeId: "runtime-still-alive",
          startedAt: now - 5000
        }
      },
      tabs: []
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "worker-wake" });
    assert.equal(prepared.lifecycleRestart, false, "a normal service-worker wake must not create recovery eligibility");
    assert.equal(prepared.recovery, null);
    const claim = await claimWorkspaceSessionRecovery(store.api, {}, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 102, windowId: 7, index: 4, pinned: false }
    }, { now: now + 1 });
    assert.equal(claim.claimed, false, "ordinary close followed by ordinary open must never inherit state");
  }

  {
    const now = 200000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "arc-before-reload",
          { tabId: 419583953, windowId: 7, index: 3, pinned: false },
          now - 1000,
          now - 250
        )
      },
      session: {},
      tabs: [{ id: 5, windowId: 9, index: 0, url: "https://example.com/" }]
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    assert.equal(prepared.lifecycleRestart, true);
    assert.equal(prepared.recovery.candidates.length, 1);
    assert.equal(prepared.recovery.candidates[0].workspaceId, workspaceA);

    const sender = {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 955, windowId: 7, index: 4, pinned: false, url: "chrome-extension://chatclub/chatClub.html" }
    };
    const claim = await claimWorkspaceSessionRecovery(store.api, {}, sender, { now: now + 10 });
    assert.equal(claim.claimed, true);
    assert.equal(claim.recovered, true);
    assert.equal(claim.workspaceId, workspaceA);
    assert.match(claim.claimId, /^claim-/);
    assert.equal(claim.snapshot.marker, "arc-before-reload");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].owner.tabId, 955);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].owner.index, 4, "index drift must not block unique same-window recovery");
    assert.equal(store.local.values[workspaceSessionBindingKey(955)].workspaceId, workspaceA);

    // Simulate the page's durable save before committing the one-time claim.
    store.local.values[workspaceSessionWorkspaceKey(workspaceA)].snapshot = snapshot("arc-after-save");
    const committed = await commitWorkspaceSessionRecovery(store.api, {
      workspaceId: workspaceA,
      claimId: claim.claimId
    }, sender, { now: now + 20 });
    assert.equal(committed.committed, true);
    assert.equal(committed.claimId, claim.claimId);
    const recovery = store.local.values[WORKSPACE_SESSION_RECOVERY_KEY];
    assert.equal(recovery.candidates[0].committedAt, now + 20);

    const detached = await detachWorkspaceSessionMirror(store.api, 955, { windowId: 7 }, { now: now + 30 });
    assert.deepEqual(detached, { detached: true, workspaceId: workspaceA, legacy: false });
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedAt, now + 30);
    assert.equal(workspaceSessionBindingKey(955) in store.local.values, false);
    assert.equal(workspaceSessionWorkspaceKey(workspaceA) in store.local.values, true, "tab removal must retain the stable mirror");

    const ordinaryReopen = await claimWorkspaceSessionRecovery(store.api, {}, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 956, windowId: 7, index: 5, pinned: false }
    }, { now: now + 40 });
    assert.equal(ordinaryReopen.claimed, false, "a committed recovery candidate is single-use");
  }

  {
    const now = 300000;
    const legacyTabId = 777;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionMirrorKey(legacyTabId)]: { generation, snapshot: snapshot("legacy") }
      },
      session: {},
      tabs: []
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    assert.equal(prepared.recovery.candidates.length, 1);
    assert.equal(prepared.recovery.candidates[0].source, "legacy");
    assert.equal(workspaceSessionMirrorKey(legacyTabId) in store.local.values, false, "legacy mirror must migrate atomically into stable storage");
    const migratedId = prepared.recovery.candidates[0].workspaceId;
    assert.ok(normalizeWorkspaceSessionId(migratedId));
    const claimed = await claimWorkspaceSessionRecovery(store.api, {}, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 778, windowId: 99, index: 1, pinned: false }
    }, { now: now + 1 });
    assert.equal(claimed.claimed, true, "one global metadata-free legacy candidate may recover");
    assert.equal(claimed.workspaceId, migratedId);
    assert.equal(claimed.snapshot.marker, "legacy");
  }

  {
    const now = 400000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "live-token",
          { tabId: 1, windowId: 1, index: 0, pinned: false },
          now - 1000,
          null
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "forced-update",
          { tabId: 2, windowId: 2, index: 0, pinned: false },
          now - 1000,
          null
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: {
          version: WORKSPACE_SESSION_STORAGE_VERSION,
          runtimeId: "runtime-update",
          startedAt: now - 100
        }
      },
      tabs: [{ id: 1, windowId: 1, index: 0, url: tokenUrl }]
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, {
      now,
      forceRecovery: true,
      reason: "update"
    });
    assert.equal(prepared.forced, true);
    assert.deepEqual(prepared.recovery.candidates.map((item) => item.workspaceId), [workspaceB], "a live tokenized page must be excluded from update recovery");
  }

  {
    const runtime = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
    assert.match(runtime, /detachWorkspaceSessionMirror\(chrome, tabId, removeInfo\)/);
    assert.match(runtime, /onInstalled\.addListener\(async \(details = \{\}\)/);
    assert.match(runtime, /forceRecovery: reason === "update"/);
    assert.match(runtime, /prepareWorkspaceSessionLifecycleSafely\("runtime start"/);
    assert.match(runtime, /message\.action === "claimWorkspaceSessionRecovery"/);
    assert.match(runtime, /message\.action === "commitWorkspaceSessionRecovery"/);
    assert.doesNotMatch(runtime, /removeWorkspaceSessionMirror\(chrome, tabId\)/);
  }

  console.log("workspace session background recovery lifecycle: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
