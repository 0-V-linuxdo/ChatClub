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
  const api = {
    storage: { local: localArea.api, session: sessionArea.api },
    tabs: { query: async () => tabs.map((tab) => ({ ...tab })) }
  };
  return {
    api,
    local: localArea,
    session: sessionArea
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
    dismissClearedWorkspaceTabs,
    handleWorkspaceSessionAlarm,
    listClearedWorkspaceTabs,
    prepareWorkspaceSessionLifecycle,
    restoreClearedWorkspaceTabs,
    rotateWorkspaceSessionGeneration
  } = background;
  const {
    DEFAULT_WORKSPACE_SESSION_GENERATION,
    WORKSPACE_SESSION_GENERATION_KEY,
    WORKSPACE_SESSION_CLEARED_BY_BROWSER,
    WORKSPACE_SESSION_CLOSED_BY_USER,
    WORKSPACE_SESSION_RECOVERY_KEY,
    WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
    WORKSPACE_SESSION_STORAGE_VERSION,
    WORKSPACE_SESSION_USER_CLOSE_ALARM,
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
  const usedSnapshot = (marker) => ({
    schemaVersion: 1,
    generation,
    marker,
    groups: [{
      tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/c/remembered" }],
      activeIndex: 0
    }]
  });
  const stable = (workspaceId, marker, owner, updatedAt, detachedAt = null, extras = {}) => ({
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    snapshot: extras.snapshot || snapshot(marker),
    owner,
    updatedAt,
    detachedAt,
    ...(extras.closedBy ? { closedBy: extras.closedBy } : {})
  });
  {
    let listener = null;
    const created = [];
    tabRuntime.registerActionListener({
      runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
      action: { onClicked: { addListener: (value) => { listener = value; } } },
      tabs: {
        get: async (tabId) => ({ id: tabId, windowId: 7, index: 4 }),
        create: async (details) => {
          created.push(details);
          return { id: 956, windowId: details.windowId };
        },
        update: async () => {}
      },
      windows: { update: async () => {} }
    });
    await listener({ id: 955, windowId: 7, index: 4 });
    assert.equal(created.length, 1);
    assert.match(created[0].url, /^chrome-extension:\/\/chatclub\/chatClub\.html#workspace=page-/);
    assert.deepEqual({ ...created[0], url: "<workspace>" }, {
      url: "<workspace>",
      active: true,
      windowId: 7,
      index: 5
    });
    assert.ok(workspaceSessionIdFromUrl(created[0].url), "action-created pages must carry a stable workspace id");
  }

  {
    const store = fixture();
    assert.equal((await prepareWorkspaceSessionLifecycle(store.api, { now: 1000 })).generation, generation);
    assert.equal((await prepareWorkspaceSessionLifecycle(store.api, { now: 1001 })).generation, generation);
    assert.deepEqual(
      store.local.calls.set.filter((update) => Object.hasOwn(update, WORKSPACE_SESSION_GENERATION_KEY)),
      [{ [WORKSPACE_SESSION_GENERATION_KEY]: generation }],
      "generation initialization must be idempotent"
    );
    const rotated = await rotateWorkspaceSessionGeneration(store.api);
    assert.notEqual(rotated, generation);
    assert.equal((await prepareWorkspaceSessionLifecycle(store.api, { now: 1002 })).generation, rotated);
    assert.equal(store.local.values[WORKSPACE_SESSION_GENERATION_KEY], rotated, "prepare must preserve a rotated generation");
    const fixedResetGeneration = "workspace-fixed-reset-target";
    assert.equal(await rotateWorkspaceSessionGeneration(store.api, fixedResetGeneration), fixedResetGeneration);
    assert.equal(await rotateWorkspaceSessionGeneration(store.api, fixedResetGeneration), fixedResetGeneration);
    assert.equal(
      store.local.values[WORKSPACE_SESSION_GENERATION_KEY],
      fixedResetGeneration,
      "repeated reset cleanup must write the same predetermined generation"
    );
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
    assert.equal(prepared.recovery.candidates[0].clearedBy, "", "an empty vanished workspace stays on the silent recovery path");
  }

  {
    const now = 500000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "arc-kept",
          { tabId: 11, windowId: 1, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("arc-kept") }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "browser-cleared",
          { tabId: 12, windowId: 1, index: 1, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("browser-cleared") }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: {
          version: WORKSPACE_SESSION_STORAGE_VERSION,
          runtimeId: "runtime-cleared",
          startedAt: now - 100
        }
      },
      tabs: [{ id: 11, windowId: 1, index: 0, url: tokenUrl }]
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, {
      now,
      forceRecovery: true,
      reason: "update"
    });
    assert.deepEqual(prepared.recovery.candidates.map((item) => item.workspaceId), [workspaceB]);
    assert.equal(prepared.recovery.candidates[0].clearedBy, WORKSPACE_SESSION_CLEARED_BY_BROWSER);
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(listed.tabs.map((item) => item.workspaceId), [workspaceB]);
    const autoClaim = await claimWorkspaceSessionRecovery(store.api, {}, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 13, windowId: 1, index: 2, pinned: false }
    }, { now: now + 2 });
    assert.equal(autoClaim.claimed, false, "browser-cleared workspaces must not be auto-claimed");
  }

  {
    const now = 600000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "user-closed",
          { tabId: 21, windowId: 1, index: 0, pinned: false },
          now - 20_000,
          now - ((2 * 60 * 1000) + 1000),
          { snapshot: usedSnapshot("user-closed"), closedBy: WORKSPACE_SESSION_CLOSED_BY_USER }
        )
      },
      session: {},
      tabs: []
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, {
      now,
      forceRecovery: true,
      reason: "update"
    });
    assert.deepEqual(prepared.recovery.candidates, [], "a user-closed workspace older than the recent-detach window must not recover");
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(listed.tabs, []);
  }

  {
    const now = 700000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "recent-user-close",
          { tabId: 31, windowId: 1, index: 0, pinned: false },
          now - 20_000,
          now - 12_000,
          { snapshot: usedSnapshot("recent-user-close") }
        )
      },
      session: {},
      tabs: []
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, {
      now,
      forceRecovery: true,
      reason: "update"
    });
    assert.equal(prepared.recovery.candidates.length, 1);
    assert.equal(
      prepared.recovery.candidates[0].clearedBy,
      WORKSPACE_SESSION_CLEARED_BY_BROWSER,
      "an update must not reclassify a just-closed ChatClub tab as a user close"
    );
    assert.notEqual(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].closedBy,
      WORKSPACE_SESSION_CLOSED_BY_USER
    );
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(listed.tabs.map((item) => item.workspaceId), [workspaceA]);
  }

  {
    const now = 800000;
    let nextTabId = 80;
    const created = [];
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "restore-one",
          { tabId: 41, windowId: 3, index: 2, pinned: true },
          now - 1000,
          now - 200,
          { snapshot: usedSnapshot("restore-one") }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "restore-two",
          { tabId: 42, windowId: 3, index: 3, pinned: false },
          now - 1000,
          now - 200,
          { snapshot: usedSnapshot("restore-two") }
        )
      },
      session: {},
      tabs: []
    });
    store.api.tabs.create = async (details) => {
      created.push(details);
      nextTabId += 1;
      return { id: nextTabId, windowId: details.windowId, index: details.index, pinned: details.pinned === true };
    };
    store.api.tabs.update = async () => {};
    store.api.windows = { update: async () => {} };
    store.api.runtime = { getURL: (file) => `chrome-extension://chatclub/${file}` };
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const restored = await restoreClearedWorkspaceTabs(store.api, { absorbIntoCurrent: true }, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 90, windowId: 3, index: 4, pinned: false }
    }, { now: now + 5 });
    assert.equal(restored.restored, 2);
    assert.equal(restored.absorbed, null);
    assert.equal(restored.opened.length, 2);
    assert.deepEqual(restored.opened.map((item) => item.workspaceId), [workspaceA, workspaceB]);
    assert.equal(created.length, 2);
    assert.match(created[0].url, new RegExp(`#workspace=${workspaceA}`));
    assert.match(created[1].url, new RegExp(`#workspace=${workspaceB}`));
    assert.equal(created[0].windowId, 3);
    assert.equal(created[0].index, 2);
    assert.equal(created[1].windowId, 3);
    assert.equal(created[1].index, 3);
    const after = await listClearedWorkspaceTabs(store.api, { now: now + 6 });
    assert.deepEqual(after.tabs, []);
  }

  {
    const now = 850000;
    const workspaceC = "page-cccccccccccc";
    const created = [];
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "first-closed",
          { tabId: 71, windowId: 4, index: 0, pinned: false },
          now - 20_000,
          now - 12_000,
          { snapshot: usedSnapshot("first-closed") }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "still-bound",
          { tabId: 72, windowId: 4, index: 1, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("still-bound") }
        ),
        [workspaceSessionWorkspaceKey(workspaceC)]: stable(
          workspaceC,
          "also-bound",
          { tabId: 73, windowId: 4, index: 2, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("also-bound") }
        ),
        [workspaceSessionBindingKey(72)]: {
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId: workspaceB,
          tabId: 72,
          windowId: 4,
          index: 1,
          pinned: false,
          updatedAt: now - 1000,
          detachedAt: null
        },
        [workspaceSessionBindingKey(73)]: {
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId: workspaceC,
          tabId: 73,
          windowId: 4,
          index: 2,
          pinned: false,
          updatedAt: now - 1000,
          detachedAt: null
        }
      },
      session: {},
      tabs: []
    });
    store.api.tabs.create = async (details) => {
      created.push(details);
      return { id: 200 + created.length, windowId: 9, index: created.length, pinned: false };
    };
    store.api.tabs.update = async () => {};
    store.api.windows = {
      get: async () => { throw new Error("No window"); },
      update: async () => {}
    };
    store.api.runtime = { getURL: (file) => `chrome-extension://chatclub/${file}` };
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(
      listed.tabs.map((item) => item.workspaceId).sort(),
      [workspaceA, workspaceB, workspaceC],
      "a delayed service-worker restart after reload must list every missing non-empty ChatClub tab"
    );
    const restored = await restoreClearedWorkspaceTabs(store.api, {}, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 90, windowId: 9, index: 0, pinned: false }
    }, { now: now + 2 });
    assert.equal(restored.restored, 3);
    assert.equal(restored.absorbed, null);
    assert.equal(restored.opened.length, 3);
    assert.equal(created.length, 3);
    assert.equal(created[0].windowId, 9, "a vanished window must fall back to the current ChatClub window");
    assert.equal(created[1].windowId, 9);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].snapshot.marker,
      "first-closed",
      "restore must retain the durable conversation snapshot"
    );
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceB)].snapshot.marker, "still-bound");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceC)].snapshot.marker, "also-bound");
  }

  {
    const now = 900000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "dismiss",
          { tabId: 51, windowId: 1, index: 0, pinned: false },
          now - 1000,
          now - 100,
          { snapshot: usedSnapshot("dismiss") }
        )
      },
      session: {},
      tabs: []
    });
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const dismissed = await dismissClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.equal(dismissed.dismissed, 1);
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 2 });
    assert.deepEqual(listed.tabs, []);
    assert.equal(workspaceSessionWorkspaceKey(workspaceA) in store.local.values, true, "dismiss must keep the snapshot");
  }

  {
    const now = 1_000_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "alarm-close",
          { tabId: 61, windowId: 1, index: 0, pinned: false },
          now - 20_000,
          now - 12_000,
          { snapshot: usedSnapshot("alarm-close") }
        )
      },
      tabs: []
    });
    const confirmed = await handleWorkspaceSessionAlarm(store.api, { name: WORKSPACE_SESSION_USER_CLOSE_ALARM }, { now });
    assert.equal(confirmed.confirmed, 1);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].closedBy,
      WORKSPACE_SESSION_CLOSED_BY_USER
    );
    assert.equal(await handleWorkspaceSessionAlarm(store.api, { name: "other" }, { now }), null);
    const again = await handleWorkspaceSessionAlarm(store.api, { name: WORKSPACE_SESSION_USER_CLOSE_ALARM }, { now: now + 1 });
    assert.equal(again.confirmed, 0);
  }

  {
    const runtime = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
    assert.match(runtime, /detachWorkspaceSessionMirror\(chrome, tabId, removeInfo\)/);
    assert.match(runtime, /onInstalled\.addListener\(async \(details = \{\}\)/);
    assert.match(runtime, /forceRecovery: reason === "update"/);
    assert.match(runtime, /prepareWorkspaceSessionLifecycleSafely\("runtime start"/);
    assert.match(runtime, /REQUEST\.CLAIM_WORKSPACE_SESSION_RECOVERY/);
    assert.match(runtime, /REQUEST\.COMMIT_WORKSPACE_SESSION_RECOVERY/);
    assert.match(runtime, /REQUEST\.LIST_CLEARED_WORKSPACE_TABS/);
    assert.match(runtime, /REQUEST\.RESTORE_CLEARED_WORKSPACE_TABS/);
    assert.match(runtime, /REQUEST\.DISMISS_CLEARED_WORKSPACE_TABS/);
    assert.match(runtime, /handleWorkspaceSessionAlarm\(chrome, alarm\)/);
    assert.match(runtime, /createBackgroundRequestDispatcher\(/);
    assert.doesNotMatch(runtime, /removeWorkspaceSessionMirror\(chrome, tabId\)/);
  }

  console.log("workspace session background recovery lifecycle: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
