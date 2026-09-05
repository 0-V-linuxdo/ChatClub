#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

function storageArea(initial = {}) {
  const values = structuredClone(initial);
  const calls = { get: [], remove: [], set: [] };
  return {
    values,
    calls,
    api: {
      async get(key) {
        calls.get.push(structuredClone(key));
        if (key === null) return structuredClone(values);
        if (Array.isArray(key)) {
          return structuredClone(
            Object.fromEntries(key.filter((item) => item in values).map((item) => [item, values[item]]))
          );
        }
        return key in values ? { [key]: structuredClone(values[key]) } : {};
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        calls.remove.push(structuredClone(list));
        for (const key of list) delete values[key];
      },
      async set(update) {
        calls.set.push(structuredClone(update));
        Object.assign(values, structuredClone(update));
      }
    }
  };
}

function fixture({ local = {}, session = {}, tabs = [] } = {}) {
  const localArea = storageArea(local);
  const sessionArea = storageArea(session);
  const liveTabs = tabs.map((tab) => ({ ...tab }));
  const alarms = [];
  const tabUpdates = [];
  const tabMoves = [];
  const windowUpdates = [];
  const api = {
    runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
    storage: { local: localArea.api, session: sessionArea.api },
    alarms: {
      create: async (name, options) => { alarms.push({ name, options }); }
    },
    tabs: {
      query: async () => liveTabs.map((tab) => ({ ...tab })),
      get: async (tabId) => liveTabs.find((tab) => tab.id === tabId) || Promise.reject(new Error("missing tab")),
      update: async (tabId, options) => {
        tabUpdates.push({ tabId, options });
        return { id: tabId, ...options };
      },
      move: async (tabIdOrIds, options) => {
        const tabIds = Array.isArray(tabIdOrIds) ? tabIdOrIds : [tabIdOrIds];
        tabMoves.push({ tabIds, options: { ...options } });
        return tabIds.map((tabId) => {
          const tab = liveTabs.find((item) => item.id === tabId);
          if (!tab) return null;
          if (Number.isInteger(options?.windowId)) tab.windowId = options.windowId;
          if (Number.isInteger(options?.index) && options.index >= 0) tab.index = options.index;
          return { ...tab };
        }).filter(Boolean);
      },
      remove: async (tabId) => {
        const index = liveTabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) throw new Error("missing tab");
        liveTabs.splice(index, 1);
      }
    },
    windows: {
      update: async (windowId, options) => {
        windowUpdates.push({ windowId, options });
      }
    }
  };
  return {
    api,
    alarms,
    liveTabs,
    local: localArea,
    session: sessionArea,
    tabUpdates,
    tabMoves,
    windowUpdates
  };
}

function recordCreatedTab(store, details, id, overrides = {}) {
  const tab = {
    id,
    windowId: details.windowId,
    index: details.index,
    pinned: details.pinned === true,
    url: details.url,
    ...overrides
  };
  store.liveTabs.push({ ...tab });
  return tab;
}

function deferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    exportRememberedWorkspaceTabs,
    forgetRememberedWorkspaceTab,
    handleWorkspaceSessionAlarm,
    importRememberedWorkspaceTabs,
    listClearedWorkspaceTabs,
    listLiveWorkspaceTabs,
    focusWorkspaceTab,
    closeOtherLiveWorkspaceTabs,
    moveLiveWorkspaceTabs,
    persistWorkspaceSessionSnapshot,
    registerWorkspaceSessionTab,
    setWorkspaceTabTitle,
    prepareWorkspaceSessionLifecycle,
    restoreClearedWorkspaceTabs,
    rotateWorkspaceSessionGeneration
  } = background;
  const {
    DEFAULT_WORKSPACE_SESSION_GENERATION,
    WORKSPACE_SESSION_GENERATION_KEY,
    WORKSPACE_SESSION_CLEARED_BY_BROWSER,
    WORKSPACE_SESSION_CLOSED_BY_USER,
    WORKSPACE_SESSION_DETACH_BROWSER,
    WORKSPACE_SESSION_DETACH_TAB,
    WORKSPACE_SESSION_DETACH_WINDOW,
    WORKSPACE_SESSION_DISMISSED,
    WORKSPACE_SESSION_OPENING_LEASE_MS,
    WORKSPACE_SESSION_RECOVERY_ALARM,
    WORKSPACE_SESSION_RECOVERY_KEY,
    WORKSPACE_SESSION_RECOVERY_VERSION,
    WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
    WORKSPACE_SESSION_STORAGE_VERSION,
    normalizeWorkspaceSessionId,
    workspaceSessionBindingKey,
    workspaceSessionIdFromUrl,
    workspaceSessionLegacyWorkspaceId,
    workspaceSessionMirrorKey,
    workspaceSessionOpeningClaimIdFromUrl,
    workspaceSessionOpeningClaimUrl,
    workspaceSessionWorkspaceKey
  } = shared;

  const generation = DEFAULT_WORKSPACE_SESSION_GENERATION;
  const LEGACY_USER_CLOSE_ALARM = "chatclub-workspace-session-user-close";
  const LEGACY_STARTUP_SETTLE_MS = 60 * 1000;
  const LEGACY_USER_CLOSE_CONFIRM_MS = 8 * 1000;
  const workspaceA = "page-aaaaaaaaaaaa";
  const workspaceB = "page-bbbbbbbbbbbb";
  const workspaceC = "page-cccccccccccc";
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
  const recoveryRequest = (tabs) => ({
    candidates: (Array.isArray(tabs) ? tabs : []).map(({ workspaceId, eventId }) => ({ workspaceId, eventId }))
  });
  const stable = (workspaceId, marker, owner, updatedAt, detachedAt = null, extras = {}) => {
    const detach = Object.hasOwn(extras, "detach")
      ? extras.detach
      : detachedAt === null
        ? null
        : {
            at: detachedAt,
            kind: extras.detachedKind || WORKSPACE_SESSION_DETACH_BROWSER,
            runtimeId: extras.detachedRuntimeId || ""
          };
    return {
      storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
      generation,
      workspaceId,
      snapshot: Object.hasOwn(extras, "snapshot") ? extras.snapshot : snapshot(marker),
      owner,
      updatedAt,
      detach,
      detachedAt: detach?.at ?? null,
      detachedKind: detach?.kind || "",
      detachedRuntimeId: detach?.runtimeId || "",
      resolution: extras.resolution || "",
      closedBy: extras.resolution === WORKSPACE_SESSION_CLOSED_BY_USER ? WORKSPACE_SESSION_CLOSED_BY_USER : ""
    };
  };
  const stableV1 = (workspaceId, marker, owner, updatedAt, detachedAt = null, extras = {}) => ({
    storageVersion: 1,
    generation,
    workspaceId,
    snapshot: Object.hasOwn(extras, "snapshot") ? extras.snapshot : snapshot(marker),
    owner,
    updatedAt,
    detachedAt,
    ...(extras.closedBy ? { closedBy: extras.closedBy } : {})
  });
  const binding = (workspaceId, tabId, updatedAt, owner = {}) => ({
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    tabId,
    windowId: Number.isInteger(owner.windowId) ? owner.windowId : null,
    index: Number.isInteger(owner.index) ? owner.index : null,
    pinned: owner.pinned === true,
    updatedAt,
    detachedAt: null
  });
  const runtimeMarker = (runtimeId, startedAt, atRiskWorkspaceIds = []) => ({
    version: WORKSPACE_SESSION_STORAGE_VERSION,
    runtimeId,
    startedAt,
    atRiskWorkspaceIds
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
          now - 500,
          {
            detachedKind: WORKSPACE_SESSION_DETACH_TAB,
            detachedRuntimeId: "runtime-still-alive"
          }
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

    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const sender = {
      url: tokenUrl,
      tab: { id: 955, windowId: 7, index: 4, pinned: false, url: tokenUrl }
    };
    const registered = await registerWorkspaceSessionTab(store.api, sender.tab, { now: now + 5 });
    assert.deepEqual(registered, { registered: true, workspaceId: workspaceA, duplicate: false });
    store.liveTabs.push({ ...sender.tab });
    const claim = await claimWorkspaceSessionRecovery(store.api, { workspaceId: workspaceA }, sender, { now: now + 10 });
    assert.equal(claim.claimed, true);
    assert.equal(claim.recovered, true);
    assert.equal(claim.workspaceId, workspaceA);
    assert.match(claim.claimId, /^claim-/);
    assert.equal(claim.snapshot.marker, "arc-before-reload");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].owner.tabId, 955);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].owner.index, 4, "index drift must not block unique same-window recovery");
    assert.equal(store.local.values[workspaceSessionBindingKey(955)].workspaceId, workspaceA);

    const persisted = await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: workspaceA,
      snapshot: snapshot("arc-after-save")
    }, sender, { now: now + 15 });
    assert.equal(persisted.persisted, true);
    const committed = await commitWorkspaceSessionRecovery(store.api, {
      workspaceId: workspaceA,
      claimId: claim.claimId
    }, sender, { now: now + 20 });
    assert.equal(committed.committed, true);
    assert.equal(committed.claimId, claim.claimId);
    assert.equal(
      WORKSPACE_SESSION_RECOVERY_KEY in store.local.values,
      false,
      "commit must delete the candidate instead of retaining a committed tombstone"
    );
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
    const migratedUrl = `chrome-extension://chatclub/chatClub.html#workspace=${migratedId}`;
    const claimed = await claimWorkspaceSessionRecovery(store.api, { workspaceId: migratedId }, {
      url: migratedUrl,
      tab: { id: 778, windowId: 99, index: 1, pinned: false, url: migratedUrl }
    }, { now: now + 1 });
    assert.equal(claimed.claimed, true, "a tokenized page may claim the migrated legacy workspace");
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
    assert.equal(
      prepared.recovery.candidates[0].clearedBy,
      WORKSPACE_SESSION_CLEARED_BY_BROWSER,
      "home-only workspaces must use the explicit recovery path"
    );

    const ordinaryClaim = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceA },
      { url: tokenUrl, tab: store.liveTabs[0] },
      { now: now + 1 }
    );
    assert.equal(ordinaryClaim.claimed, true);
    assert.equal(ordinaryClaim.recovered, false, "reading a stable snapshot is not a recovery lease");
    assert.equal(ordinaryClaim.claimId, "", "an ordinary reload must not invent a recovery lease id");
    assert.equal(ordinaryClaim.snapshot.marker, "live-token");
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
    const now = 20_000_000;
    const legacyDetachedAt = now - (3 * 60 * 60 * 1000);
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stableV1(
          workspaceA,
          "user-closed",
          { tabId: 21, windowId: 1, index: 0, pinned: false },
          now - 20_000,
          legacyDetachedAt,
          { snapshot: usedSnapshot("user-closed"), closedBy: WORKSPACE_SESSION_CLOSED_BY_USER }
        )
      },
      session: {},
      tabs: []
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, {
      now,
      reason: "runtime-start"
    });
    assert.deepEqual(
      prepared.recovery.candidates.map((candidate) => candidate.workspaceId),
      [workspaceA],
      "V1 closedBy:user is an unreliable inference and must migrate after hours of downtime"
    );
    assert.equal(prepared.recovery.candidates[0].clearedBy, WORKSPACE_SESSION_CLEARED_BY_BROWSER);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].storageVersion, WORKSPACE_SESSION_STORAGE_VERSION);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedAt, legacyDetachedAt);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].resolution, "");
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(listed.tabs.map((item) => item.workspaceId), [workspaceA]);
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
      return recordCreatedTab(store, details, nextTabId);
    };
    store.api.runtime = { getURL: (file) => `chrome-extension://chatclub/${file}` };
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const restoreRequest = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now: now + 4 })).tabs);
    const restored = await restoreClearedWorkspaceTabs(store.api, { ...restoreRequest, absorbIntoCurrent: true }, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 90, windowId: 3, index: 4, pinned: false }
    }, { now: now + 5 });
    assert.equal(restored.restored, 2);
    assert.equal(restored.absorbed, null);
    assert.equal(restored.opened.length, 2);
    assert.deepEqual(restored.tabs, []);
    assert.deepEqual(restored.opened.map((item) => item.workspaceId), [workspaceA, workspaceB]);
    assert.equal(created.length, 2);
    assert.equal(
      created.every((details) => details.active === false),
      true,
      "restored workspace tabs must open in the background without stealing focus"
    );
    assert.match(created[0].url, new RegExp(`#workspace=${workspaceA}`));
    assert.match(created[1].url, new RegExp(`#workspace=${workspaceB}`));
    assert.equal(created[0].windowId, 3);
    assert.equal(created[0].index, 2);
    assert.equal(created[1].windowId, 3);
    assert.equal(created[1].index, 3);
    assert.deepEqual(store.tabUpdates, [], "restoring tabs must not activate them after creation");
    assert.deepEqual(store.windowUpdates, [], "restoring tabs must not focus their window after creation");
    const after = await listClearedWorkspaceTabs(store.api, { now: now + 6 });
    assert.deepEqual(after.tabs, []);
  }

  {
    const now = 850000;
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
      return recordCreatedTab(store, details, 200 + created.length, {
        windowId: 9,
        index: created.length,
        pinned: false
      });
    };
    store.api.windows.get = async () => { throw new Error("No window"); };
    store.api.runtime = { getURL: (file) => `chrome-extension://chatclub/${file}` };
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(
      listed.tabs.map((item) => item.workspaceId).sort(),
      [workspaceA, workspaceB, workspaceC],
      "a delayed service-worker restart after reload must list every missing non-empty ChatClub tab"
    );
    const restored = await restoreClearedWorkspaceTabs(store.api, recoveryRequest(listed.tabs), {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 90, windowId: 9, index: 0, pinned: false }
    }, { now: now + 2 });
    assert.equal(restored.restored, 3);
    assert.equal(restored.absorbed, null);
    assert.equal(restored.opened.length, 3);
    assert.equal(created.length, 3);
    assert.equal(created.every((details) => details.active === false), true,
      "window-placement fallback must still create every restored tab in the background");
    assert.equal(created[0].windowId, 9, "a vanished window must fall back to the current ChatClub window");
    assert.equal(created[1].windowId, 9);
    assert.deepEqual(store.tabUpdates, [], "window-placement fallback must not activate restored tabs");
    assert.deepEqual(store.windowUpdates, [], "window-placement fallback must not focus a window");
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].snapshot.marker,
      "first-closed",
      "restore must retain the durable conversation snapshot"
    );
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceB)].snapshot.marker, "still-bound");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceC)].snapshot.marker, "also-bound");
  }

  {
    const now = 875000;
    const created = [];
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "restore-visible-a",
          { tabId: 74, windowId: 4, index: 0, pinned: false },
          now - 1000,
          now - 100,
          { snapshot: usedSnapshot("restore-visible-a") }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "restore-concurrent-b",
          { tabId: 75, windowId: 4, index: 1, pinned: false },
          now - 1000,
          now - 100,
          { snapshot: usedSnapshot("restore-concurrent-b") }
        )
      },
      session: {},
      tabs: []
    });
    store.api.tabs.create = async (details) => {
      created.push(details);
      return recordCreatedTab(store, details, 250 + created.length, { windowId: 4, pinned: false });
    };
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const listed = (await listClearedWorkspaceTabs(store.api, { now: now + 1 })).tabs;
    const first = listed.find((item) => item.workspaceId === workspaceA);
    const restored = await restoreClearedWorkspaceTabs(store.api, {
      candidates: [{ workspaceId: first.workspaceId, eventId: first.eventId }]
    }, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 250, windowId: 4, index: 2, pinned: false }
    }, { now: now + 2 });
    assert.equal(restored.restored, 1);
    assert.deepEqual(restored.opened.map((item) => item.workspaceId), [workspaceA]);
    assert.deepEqual(restored.tabs.map((item) => item.workspaceId), [workspaceB],
      "a candidate arriving outside the visible request must remain pending instead of opening");
    assert.equal(created.length, 1);
  }

  {
    const now = 1_700_000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const canonicalTab = { id: 111, windowId: 12, index: 0, pinned: false, url: tokenUrl };
    const duplicateTab = { id: 112, windowId: 12, index: 1, pinned: false, url: tokenUrl };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "duplicate-source",
          { tabId: canonicalTab.id, windowId: 12, index: 0, pinned: false },
          now,
          null,
          { snapshot: usedSnapshot("duplicate-source") }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-duplicate", now - 1000, [workspaceA])
      },
      tabs: [canonicalTab, duplicateTab]
    });
    assert.deepEqual(
      await registerWorkspaceSessionTab(store.api, duplicateTab, { now: now + 1 }),
      { registered: false, workspaceId: workspaceA, duplicate: true },
      "inventory registration must not let a duplicate token steal the canonical owner"
    );
    const forked = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceA },
      { url: tokenUrl, tab: duplicateTab },
      { now: now + 2 }
    );
    assert.equal(forked.claimed, true);
    assert.equal(forked.forked, true);
    assert.notEqual(forked.workspaceId, workspaceA);
    assert.ok(normalizeWorkspaceSessionId(forked.workspaceId));
    assert.equal(forked.snapshot.marker, "duplicate-source");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].owner.tabId, canonicalTab.id);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(forked.workspaceId)].owner.tabId, duplicateTab.id);
    assert.deepEqual(
      new Set(store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds),
      new Set([workspaceA, forked.workspaceId]),
      "a duplicate fork must inherit the source page's ambiguous-cleanup protection"
    );
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
    const dismissRequest = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now })).tabs);
    const dismissed = await dismissClearedWorkspaceTabs(store.api, dismissRequest, { now: now + 1 });
    assert.equal(dismissed.dismissed, 1);
    const listed = await listClearedWorkspaceTabs(store.api, { now: now + 2 });
    assert.deepEqual(listed.tabs, []);
    assert.equal(workspaceSessionWorkspaceKey(workspaceA) in store.local.values, true, "dismiss must keep the snapshot");
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].resolution,
      WORKSPACE_SESSION_DISMISSED,
      "dismiss must persist an explicit resolution"
    );
    const restarted = fixture({ local: { ...store.local.values }, session: {}, tabs: [] });
    const preparedAgain = await prepareWorkspaceSessionLifecycle(restarted.api, {
      now: now + 60_000,
      reason: "runtime-start"
    });
    assert.equal(preparedAgain.recovery, null, "a dismissed V2 workspace must not be re-enqueued on restart");
    assert.deepEqual((await listClearedWorkspaceTabs(restarted.api, { now: now + 60_001 })).tabs, []);
  }

  {
    const now = 950000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const pageTab = { id: 59, windowId: 1, index: 0, pinned: false, url: tokenUrl };
    const store = fixture({
      local: { [WORKSPACE_SESSION_GENERATION_KEY]: generation },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-brand-new-page",
          now - LEGACY_STARTUP_SETTLE_MS - 1000
        )
      },
      tabs: [pageTab]
    });
    await registerWorkspaceSessionTab(store.api, pageTab, { now });
    assert.deepEqual(store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds, [workspaceA]);
    await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: workspaceA,
      snapshot: usedSnapshot("brand-new-page")
    }, { url: tokenUrl, tab: pageTab }, { now: now + 1 });
    store.liveTabs.splice(0);
    await detachWorkspaceSessionMirror(store.api, pageTab.id, {
      windowId: pageTab.windowId,
      isWindowClosing: false
    }, { now: now + (6 * 60 * 60 * 1000) });
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind, WORKSPACE_SESSION_DETACH_BROWSER);
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + (6 * 60 * 60 * 1000) + 1 })).tabs
        .map((item) => item.workspaceId),
      [workspaceA],
      "even a brand-new page removed long after startup must remain recoverable until explicit dismiss"
    );
  }

  {
    const now = 975000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const pageTab = { id: 60, windowId: 1, index: 0, pinned: false, url: tokenUrl };
    const store = fixture({
      local: { [WORKSPACE_SESSION_GENERATION_KEY]: generation },
      session: {},
      tabs: [pageTab]
    });
    store.session.api.set = async () => { throw new Error("synthetic session marker failure"); };
    await assert.rejects(
      () => registerWorkspaceSessionTab(store.api, pageTab, { now }),
      /synthetic session marker failure/
    );
    store.liveTabs.splice(0);
    await detachWorkspaceSessionMirror(store.api, pageTab.id, {
      windowId: pageTab.windowId,
      isWindowClosing: false
    }, { now: now + (6 * 60 * 60 * 1000) });
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind, WORKSPACE_SESSION_DETACH_BROWSER);
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + (6 * 60 * 60 * 1000) + 1 })).tabs
        .map((item) => item.workspaceId),
      [workspaceA],
      "a failed session marker write must not make a later ambiguous removal lossy"
    );
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
          {
            snapshot: usedSnapshot("alarm-close"),
            detachedKind: WORKSPACE_SESSION_DETACH_TAB,
            detachedRuntimeId: "runtime-alarm"
          }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-alarm", now - 20_000)
      },
      tabs: []
    });
    assert.equal(await handleWorkspaceSessionAlarm(
      store.api,
      { name: LEGACY_USER_CLOSE_ALARM },
      { now }
    ), null);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].resolution, "",
      "legacy user-close alarms must no longer guess that an ambiguous removal was intentional");
    assert.equal(await handleWorkspaceSessionAlarm(store.api, { name: "other" }, { now }), null);
  }

  {
    const now = 1_050_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "dismiss-visible-a",
          { tabId: 62, windowId: 1, index: 0, pinned: false },
          now - 1000,
          now - 100
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "dismiss-concurrent-b",
          { tabId: 63, windowId: 1, index: 1, pinned: false },
          now - 1000,
          now - 100
        )
      },
      session: {},
      tabs: []
    });
    await prepareWorkspaceSessionLifecycle(store.api, { now, forceRecovery: true, reason: "update" });
    const listed = (await listClearedWorkspaceTabs(store.api, { now: now + 1 })).tabs;
    const first = listed.find((item) => item.workspaceId === workspaceA);
    const second = listed.find((item) => item.workspaceId === workspaceB);
    const dismissed = await dismissClearedWorkspaceTabs(store.api, {
      candidates: [{ workspaceId: first.workspaceId, eventId: first.eventId }]
    }, { now: now + 2 });
    assert.equal(dismissed.dismissed, 1);
    assert.deepEqual(dismissed.tabs.map((item) => item.workspaceId), [workspaceB],
      "a concurrently added candidate must remain visible after scoped dismiss");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceB)].resolution, "");

    const staleDismiss = await dismissClearedWorkspaceTabs(store.api, {
      candidates: [{ workspaceId: second.workspaceId, eventId: `${second.eventId}-stale` }]
    }, { now: now + 3 });
    assert.equal(staleDismiss.dismissed, 0, "a stale click must not dismiss a newer event for the same workspace");
    assert.deepEqual(staleDismiss.tabs.map((item) => item.workspaceId), [workspaceB]);
  }

  {
    const now = 1_100_000;
    const exactUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "exact-live",
          { tabId: 11, windowId: 2, index: 0, pinned: false },
          now - 1000
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "reused-tab-id",
          { tabId: 71, windowId: 2, index: 1, pinned: false },
          now - 1000
        ),
        [workspaceSessionBindingKey(71)]: binding(
          workspaceB,
          71,
          now - 1000,
          { windowId: 2, index: 1 }
        ),
        [workspaceSessionWorkspaceKey(workspaceC)]: stable(
          workspaceC,
          "foreign-workspace-param",
          { tabId: 81, windowId: 2, index: 2, pinned: false },
          now - 1000
        )
      },
      session: {},
      tabs: [
        { id: 11, windowId: 2, index: 0, url: "about:blank", pendingUrl: exactUrl },
        { id: 71, windowId: 2, index: 1, url: `https://example.com/#workspace=${workspaceB}` },
        { id: 81, windowId: 2, index: 2, url: `https://example.com/#workspace=${workspaceC}` }
      ]
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    assert.deepEqual(
      prepared.recovery.candidates.map((candidate) => candidate.workspaceId).sort(),
      [workspaceB, workspaceC],
      "only an exact ChatClub page URL may prove workspace liveness"
    );
    assert.equal(
      workspaceSessionBindingKey(71) in store.local.values,
      false,
      "a regular page reusing the old browser tab id must not preserve the stale binding"
    );
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedAt, null);
  }

  {
    const now = 1_200_000;
    const homeOnlySnapshot = {
      schemaVersion: 1,
      generation,
      groups: [{
        tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }],
        activeIndex: 0
      }]
    };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "home-only",
          { tabId: 21, windowId: 3, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: homeOnlySnapshot }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "null-snapshot",
          { tabId: 22, windowId: 3, index: 1, pinned: false },
          now - 1000,
          null,
          { snapshot: null }
        )
      },
      session: {},
      tabs: []
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    assert.deepEqual(
      prepared.recovery.candidates.map((candidate) => candidate.workspaceId),
      [workspaceA, workspaceB],
      "home-only and null snapshots still represent cleared ChatClub pages"
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + 1 })).tabs.map((item) => item.workspaceId),
      [workspaceA, workspaceB]
    );
  }

  {
    const now = 1_250_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "cold-worker-navigation",
          { tabId: 26, windowId: 3, index: 2, pinned: false },
          now - 10_000
        ),
        [workspaceSessionBindingKey(26)]: binding(
          workspaceA,
          26,
          now - 10_000,
          { windowId: 3, index: 2 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-cold-navigation",
          now - LEGACY_STARTUP_SETTLE_MS - 1
        )
      },
      tabs: [{ id: 26, windowId: 3, index: 2, url: "about:blank" }]
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "worker-wake" });
    assert.equal(prepared.lifecycleRestart, false);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind,
      WORKSPACE_SESSION_DETACH_BROWSER,
      "a cold worker cannot infer user intent from the post-navigation URL"
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + 1 })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "durable binding mismatch must remain recoverable when the in-memory tab tracker is empty"
    );
  }

  {
    const now = 1_300_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "startup-delayed-removal",
          { tabId: 31, windowId: 4, index: 0, pinned: false },
          now - 1000
        ),
        [workspaceSessionBindingKey(31)]: binding(
          workspaceA,
          31,
          now - 1000,
          { windowId: 4, index: 0 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-startup-settle",
          now - Math.floor(LEGACY_STARTUP_SETTLE_MS / 2)
        )
      },
      tabs: []
    });
    const detached = await detachWorkspaceSessionMirror(
      store.api,
      31,
      { windowId: 4, isWindowClosing: false },
      { now }
    );
    assert.equal(detached.detached, true);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind,
      WORKSPACE_SESSION_DETACH_BROWSER,
      "a delayed startup cleanup must be classified as browser loss"
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + 1 })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "startup-settle removals must enter the explicit recovery queue immediately"
    );
    assert.equal(store.alarms.length, 0, "browser-loss cleanup must not schedule user-close confirmation");
  }

  {
    const now = 1_400_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "window-close",
          { tabId: 41, windowId: 5, index: 0, pinned: false },
          now - 1000
        ),
        [workspaceSessionBindingKey(41)]: binding(
          workspaceA,
          41,
          now - 1000,
          { windowId: 5, index: 0 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-window-close",
          now - LEGACY_STARTUP_SETTLE_MS - 1
        )
      },
      tabs: []
    });
    await detachWorkspaceSessionMirror(
      store.api,
      41,
      { windowId: 5, isWindowClosing: true },
      { now }
    );
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind,
      WORKSPACE_SESSION_DETACH_WINDOW
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + 1 })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "isWindowClosing must enqueue recovery instead of inferring a user tab close"
    );
    assert.equal(store.alarms.length, 0);
  }

  {
    const now = 1_500_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "ordinary-tab-close",
          { tabId: 51, windowId: 6, index: 0, pinned: false },
          now - 1000
        ),
        [workspaceSessionBindingKey(51)]: binding(
          workspaceA,
          51,
          now - 1000,
          { windowId: 6, index: 0 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-ordinary-close",
          now - LEGACY_STARTUP_SETTLE_MS - 1
        )
      },
      tabs: []
    });
    await detachWorkspaceSessionMirror(
      store.api,
      51,
      { windowId: 6, isWindowClosing: false },
      { now }
    );
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind, WORKSPACE_SESSION_DETACH_BROWSER);
    assert.equal(WORKSPACE_SESSION_RECOVERY_KEY in store.local.values, true);
    assert.deepEqual(store.alarms, []);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].resolution, "");
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + LEGACY_USER_CLOSE_CONFIRM_MS + 1 })).tabs
        .map((item) => item.workspaceId),
      [workspaceA],
      "an ordinary close remains recoverable until the user explicitly dismisses it"
    );
  }

  {
    const now = 1_600_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "cross-runtime-close",
          { tabId: 61, windowId: 7, index: 0, pinned: false },
          now - 1000
        ),
        [workspaceSessionBindingKey(61)]: binding(
          workspaceA,
          61,
          now - 1000,
          { windowId: 7, index: 0 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-before-restart",
          now - LEGACY_STARTUP_SETTLE_MS - 1
        )
      },
      tabs: []
    });
    await detachWorkspaceSessionMirror(
      store.api,
      61,
      { windowId: 7, isWindowClosing: false },
      { now }
    );
    store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY] = runtimeMarker(
      "runtime-after-restart",
      now + LEGACY_USER_CLOSE_CONFIRM_MS
    );
    const confirmed = await handleWorkspaceSessionAlarm(
      store.api,
      { name: LEGACY_USER_CLOSE_ALARM },
      { now: now + LEGACY_USER_CLOSE_CONFIRM_MS + 1 }
    );
    assert.equal(confirmed, null, "obsolete user-close alarms must never resolve an ambiguous removal");
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].resolution, "");
  }

  {
    const now = 1_700_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "opening-removed",
          { tabId: 71, windowId: 8, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("opening-removed") }
        )
      },
      session: {},
      tabs: []
    });
    store.api.tabs.create = async (details) => recordCreatedTab(store, details, 701);
    await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    const restoreRequest = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now })).tabs);
    const restored = await restoreClearedWorkspaceTabs(store.api, restoreRequest, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 700, windowId: 8, index: 1, pinned: false }
    }, { now: now + 1 });
    assert.equal(restored.restored, 1);
    assert.deepEqual(restored.tabs, []);
    const opening = store.local.values[WORKSPACE_SESSION_RECOVERY_KEY];
    assert.equal(opening.version, WORKSPACE_SESSION_RECOVERY_VERSION);
    assert.equal(opening.candidates[0].claimedTabId, 701);
    assert.equal(opening.candidates[0].committedAt, 0);
    assert.equal(opening.candidates[0].claimExpiresAt, now + 1 + WORKSPACE_SESSION_OPENING_LEASE_MS);
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    assert.deepEqual(
      await registerWorkspaceSessionTab(store.api, {
        id: 701,
        windowId: 8,
        index: 0,
        pinned: false,
        url: tokenUrl
      }, { now: now + 2 }),
      { registered: true, workspaceId: workspaceA, duplicate: false }
    );
    assert.deepEqual((await listClearedWorkspaceTabs(store.api, { now: now + 3 })).tabs, []);
    store.liveTabs.splice(0);
    await detachWorkspaceSessionMirror(
      store.api,
      701,
      { windowId: 8, isWindowClosing: false },
      { now: now + 4 }
    );
    assert.equal(store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates[0].claimedAt, 0);
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + 5 })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "an opening tab removed before commit must be re-armed for recovery"
    );
  }

  {
    const now = 1_800_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "opening-committed",
          { tabId: 81, windowId: 9, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("opening-committed") }
        )
      },
      session: {},
      tabs: []
    });
    store.api.tabs.create = async (details) => recordCreatedTab(store, details, 801);
    await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    const restoreRequest = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now })).tabs);
    await restoreClearedWorkspaceTabs(store.api, restoreRequest, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 800, windowId: 9, index: 1, pinned: false }
    }, { now: now + 1 });
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceB}`;
    const pageTab = { id: 801, windowId: 9, index: 0, pinned: false, url: tokenUrl };
    Object.assign(store.liveTabs.find((tab) => tab.id === pageTab.id), pageTab);
    await registerWorkspaceSessionTab(store.api, pageTab, { now: now + 2 });
    const claim = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceB },
      { url: tokenUrl, tab: pageTab },
      { now: now + 3 }
    );
    assert.equal(claim.claimed, true);
    assert.equal(claim.workspaceId, workspaceB);
    assert.match(claim.claimId, /^claim-/);
    await commitWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceB, claimId: claim.claimId },
      { url: tokenUrl, tab: pageTab },
      { now: now + 4 }
    );
    assert.equal(
      WORKSPACE_SESSION_RECOVERY_KEY in store.local.values,
      false,
      "a page commit must truly delete its recovery candidate"
    );
    assert.deepEqual((await listClearedWorkspaceTabs(store.api, { now: now + 5 })).tabs, []);
  }

  {
    const now = 1_900_000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "claim-before-create-settles",
          { tabId: 85, windowId: 9, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("claim-before-create-settles") }
        )
      },
      session: {},
      tabs: []
    });
    await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    const request = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now })).tabs);
    const createGate = deferredPromise();
    let createdTab = null;
    let pageClaimRun = null;
    let createSettled = false;
    store.api.tabs.create = (details) => {
      createdTab = recordCreatedTab(store, details, 851);
      const openingClaimId = workspaceSessionOpeningClaimIdFromUrl(details.url);
      assert.match(openingClaimId, /^claim-/);
      pageClaimRun = claimWorkspaceSessionRecovery(
        store.api,
        { workspaceId: workspaceA, openingClaimId },
        { url: details.url, tab: createdTab },
        { now: now + 2 }
      );
      return createGate.promise.then(() => {
        createSettled = true;
        return createdTab;
      });
    };
    const restoreRun = restoreClearedWorkspaceTabs(store.api, request, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 850, windowId: 9, index: 1, pinned: false }
    }, { now: now + 1, tabOpenTimeoutMs: 5000 });
    while (!pageClaimRun) await new Promise((resolve) => { setImmediate(resolve); });
    const claim = await Promise.race([
      pageClaimRun,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("opening claim remained blocked by tabs.create")), 1000);
      })
    ]);
    assert.equal(createSettled, false, "the page must claim while tabs.create is still unresolved");
    assert.equal(claim.recovered, true);
    assert.equal(claim.snapshot.marker, "claim-before-create-settles");
    await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: workspaceA,
      snapshot: usedSnapshot("claim-before-create-settles")
    }, { url: createdTab.url, tab: createdTab }, { now: now + 3 });
    await commitWorkspaceSessionRecovery(store.api, {
      workspaceId: workspaceA,
      claimId: claim.claimId
    }, { url: createdTab.url, tab: createdTab }, { now: now + 4 });
    createGate.resolve();
    const restored = await restoreRun;
    assert.equal(restored.restored, 1);
    assert.deepEqual(restored.tabs, []);
    assert.equal(WORKSPACE_SESSION_RECOVERY_KEY in store.local.values, false,
      "post-create finalization must not resurrect a page-committed candidate");
    assert.equal(store.local.values[workspaceSessionBindingKey(createdTab.id)].workspaceId, workspaceA);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].owner.tabId, createdTab.id);
  }

  {
    const now = 1_915_000;
    const claimId = "claim-exactopening12";
    const runtimeId = "runtime-exact-opening";
    const eventId = "event-exact-opening";
    const tokenUrl = workspaceSessionOpeningClaimUrl(
      `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`,
      claimId
    );
    const pageTab = { id: 860, windowId: 9, index: 0, pinned: false, url: tokenUrl };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "exact-opening-token",
          { tabId: 859, windowId: 9, index: 0, pinned: false },
          now - 100,
          null,
          { snapshot: usedSnapshot("exact-opening-token") }
        ),
        [WORKSPACE_SESSION_RECOVERY_KEY]: {
          version: WORKSPACE_SESSION_RECOVERY_VERSION,
          id: "recovery-exact-opening",
          runtimeId,
          generation,
          reason: "restore",
          createdAt: now - 10,
          expiresAt: 0,
          candidates: [{
            workspaceId: workspaceA,
            eventId,
            windowId: 9,
            index: 0,
            pinned: false,
            source: "stable",
            clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
            claimedAt: now,
            claimedTabId: null,
            claimId,
            claimRuntimeId: runtimeId,
            claimExpiresAt: now + WORKSPACE_SESSION_OPENING_LEASE_MS,
            committedAt: 0
          }]
        }
      },
      session: { [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(runtimeId, now - 20) },
      tabs: [pageTab]
    });
    const before = structuredClone(store.local.values[WORKSPACE_SESSION_RECOVERY_KEY]);
    await assert.rejects(
      () => claimWorkspaceSessionRecovery(store.api, {
        workspaceId: workspaceA,
        openingClaimId: "claim-wrongopening12"
      }, { url: tokenUrl, tab: pageTab }, { now: now + 1 }),
      /does not match the page URL/
    );
    await assert.rejects(
      () => claimWorkspaceSessionRecovery(
        store.api,
        { workspaceId: workspaceA },
        { url: tokenUrl, tab: pageTab },
        { now: now + 2 }
      ),
      /does not match the page URL/
    );
    assert.deepEqual(store.local.values[WORKSPACE_SESSION_RECOVERY_KEY], before,
      "a missing or mismatched URL lease must not mutate the opening candidate");
    const claimed = await claimWorkspaceSessionRecovery(store.api, {
      workspaceId: workspaceA,
      openingClaimId: claimId
    }, { url: tokenUrl, tab: pageTab }, { now: now + 3 });
    assert.equal(claimed.recovered, true);
    assert.equal(claimed.claimId, claimId);
  }

  {
    const now = 1_925_000;
    const local = { [WORKSPACE_SESSION_GENERATION_KEY]: generation };
    const workspaceIds = Array.from({ length: 25 }, (_, index) => `page-stress-${String(index).padStart(5, "0")}`);
    for (const [index, workspaceId] of workspaceIds.entries()) {
      local[workspaceSessionWorkspaceKey(workspaceId)] = stable(
        workspaceId,
        `stress-${index}`,
        { tabId: 1000 + index, windowId: 10, index, pinned: false },
        now - 1000,
        null,
        { snapshot: usedSnapshot(`stress-${index}`) }
      );
    }
    const store = fixture({ local, session: {}, tabs: [] });
    await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    const request = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now })).tabs);
    let creates = 0;
    let claimsCompleted = 0;
    const claims = [];
    store.api.tabs.create = async (details) => {
      assert.equal(claimsCompleted, creates,
        "each earlier restored page must claim before the next candidate is opened");
      assert.equal(details.active, false,
        "bulk recovery must keep every newly restored workspace tab inactive");
      const tab = recordCreatedTab(store, details, 2000 + creates);
      const workspaceId = workspaceSessionIdFromUrl(details.url);
      const openingClaimId = workspaceSessionOpeningClaimIdFromUrl(details.url);
      creates += 1;
      const claimRun = claimWorkspaceSessionRecovery(
        store.api,
        { workspaceId, openingClaimId },
        { url: details.url, tab },
        { now: now + creates + 1 }
      ).then((value) => {
        claimsCompleted += 1;
        return value;
      });
      claims.push(claimRun);
      return tab;
    };
    const restored = await restoreClearedWorkspaceTabs(store.api, request, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 1999, windowId: 10, index: 25, pinned: false }
    }, { now: () => now + creates + 1 });
    const claimResults = await Promise.all(claims);
    assert.equal(creates, 25);
    assert.equal(claimsCompleted, 25);
    assert.equal(restored.restored, 25);
    assert.equal(restored.opened.length, 25);
    assert.deepEqual(restored.tabs, []);
    assert.equal(claimResults.every((claim) => claim.recovered === true), true);
  }

  {
    const now = 1_950_000;
    let creates = 0;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "partial-a",
          { tabId: 91, windowId: 10, index: 0, pinned: false },
          now - 1000
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "partial-b",
          { tabId: 92, windowId: 10, index: 1, pinned: false },
          now - 1000
        )
      },
      session: {},
      tabs: []
    });
    store.api.tabs.create = async (details) => {
      creates += 1;
      if (creates >= 2) throw new Error("synthetic create failure");
      return recordCreatedTab(store, details, 901, { pinned: false });
    };
    await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    const restoreRequest = recoveryRequest((await listClearedWorkspaceTabs(store.api, { now })).tabs);
    const restored = await restoreClearedWorkspaceTabs(store.api, restoreRequest, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 900, windowId: 10, index: 2, pinned: false }
    }, { now: now + 1 });
    assert.equal(restored.restored, 1);
    assert.deepEqual(restored.opened.map((item) => item.workspaceId), [workspaceA]);
    assert.deepEqual(
      restored.tabs.map((item) => item.workspaceId),
      [workspaceB],
      "a partial restore response must return every still-pending tab"
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: now + 2 })).tabs.map((item) => item.workspaceId),
      [workspaceB]
    );
  }

  {
    const now = 1_950_000;
    const eventId = "event-restore-failure-matrix";
    const sender = {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 950, windowId: 22, index: 1, pinned: false }
    };
    const request = { candidates: [{ workspaceId: workspaceA, eventId }] };
    const pendingCandidate = {
      workspaceId: workspaceA,
      eventId,
      windowId: 22,
      index: 0,
      pinned: false,
      source: "stable",
      clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
      claimedAt: 0,
      claimedTabId: null,
      claimId: "",
      claimRuntimeId: "",
      claimExpiresAt: 0,
      committedAt: 0
    };
    const pendingRecovery = {
      version: WORKSPACE_SESSION_RECOVERY_VERSION,
      id: "recovery-restore-failure-matrix",
      runtimeId: "runtime-restore-failure-matrix",
      generation,
      reason: "runtime-restart",
      createdAt: now - 50,
      expiresAt: 0,
      candidates: [pendingCandidate]
    };
    const createStore = () => fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "restore-failure-matrix",
          { tabId: 941, windowId: 22, index: 0, pinned: false },
          now - 100,
          now - 50,
          { snapshot: usedSnapshot("restore-failure-matrix") }
        ),
        [WORKSPACE_SESSION_RECOVERY_KEY]: pendingRecovery
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker(
          "runtime-restore-failure-matrix",
          now - 100
        )
      },
      tabs: []
    });
    const runRestore = (store, at = now) => restoreClearedWorkspaceTabs(
      store.api,
      request,
      sender,
      { now: at }
    );
    const observeTabs = (store, tabId, removeFailure = false) => {
      const calls = { create: [], remove: [] };
      store.api.tabs.create = async (details) => {
        calls.create.push(structuredClone(details));
        return recordCreatedTab(store, details, tabId);
      };
      store.api.tabs.remove = async (removedTabId) => {
        calls.remove.push(removedTabId);
        if (removeFailure) throw new Error("synthetic restored tab removal failure");
        const at = store.liveTabs.findIndex((tab) => tab.id === removedTabId);
        if (at >= 0) store.liveTabs.splice(at, 1);
      };
      return calls;
    };
    const claimState = (store) => {
      const candidate = store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates[0];
      return {
        claimedAt: candidate.claimedAt,
        claimedTabId: candidate.claimedTabId,
        claimId: candidate.claimId,
        claimRuntimeId: candidate.claimRuntimeId,
        claimExpiresAt: candidate.claimExpiresAt,
        committedAt: candidate.committedAt
      };
    };
    const rearmedClaimState = {
      claimedAt: 0,
      claimedTabId: null,
      claimId: "",
      claimRuntimeId: "",
      claimExpiresAt: 0,
      committedAt: 0
    };
    const assertRetryBlockedByDurableLease = async (store, message) => {
      const restarted = fixture({
        local: store.local.values,
        session: store.session.values,
        tabs: []
      });
      let retryCreates = 0;
      restarted.api.tabs.create = async () => {
        retryCreates += 1;
        return { id: 999, windowId: 22, index: 0, pinned: false };
      };
      const repeated = await runRestore(restarted, now + 1);
      assert.equal(repeated.restored, 0, message);
      assert.equal(retryCreates, 0, `${message}; no duplicate tab may be created`);
    };

    {
      const store = createStore();
      const tabCalls = observeTabs(store, 951);
      const persist = store.local.api.set;
      let localSetCalls = 0;
      store.local.api.set = async (update) => {
        localSetCalls += 1;
        if (localSetCalls === 1) throw new Error("synthetic prelease storage failure");
        return persist(update);
      };
      await assert.rejects(() => runRestore(store), /synthetic prelease storage failure/);
      assert.equal(localSetCalls, 1);
      assert.equal(tabCalls.create.length, 0, "a failed durable prelease must prevent tab creation");
      assert.equal(tabCalls.remove.length, 0);
      assert.deepEqual(claimState(store), rearmedClaimState);
    }

    {
      const store = createStore();
      const tabCalls = observeTabs(store, 952);
      const persist = store.local.api.set;
      let localSetCalls = 0;
      store.local.api.set = async (update) => {
        localSetCalls += 1;
        return persist(update);
      };
      let sessionSetCalls = 0;
      store.session.api.set = async () => {
        sessionSetCalls += 1;
        throw new Error("synthetic runtime marker failure");
      };
      await assert.rejects(() => runRestore(store), /synthetic runtime marker failure/);
      assert.equal(localSetCalls, 2, "session failure must durably roll back its prelease");
      assert.equal(sessionSetCalls, 1);
      assert.equal(tabCalls.create.length, 0, "a failed runtime marker write must prevent tab creation");
      assert.equal(tabCalls.remove.length, 0);
      assert.deepEqual(claimState(store), rearmedClaimState, "session failure must re-arm the candidate");
    }

    {
      const store = createStore();
      const tabCalls = observeTabs(store, 953);
      const persist = store.local.api.set;
      let localSetCalls = 0;
      store.local.api.set = async (update) => {
        localSetCalls += 1;
        if (localSetCalls === 2) throw new Error("synthetic session rollback failure");
        return persist(update);
      };
      store.session.api.set = async () => {
        throw new Error("synthetic runtime marker failure before rollback");
      };
      await assert.rejects(() => runRestore(store), /synthetic runtime marker failure before rollback/);
      assert.equal(localSetCalls, 2);
      assert.equal(tabCalls.create.length, 0);
      assert.equal(tabCalls.remove.length, 0);
      assert.equal(claimState(store).claimedAt, now, "a failed rollback must retain the durable prelease");
      await assertRetryBlockedByDurableLease(
        store,
        "a session rollback failure must remain duplicate-protected until its lease is re-armed"
      );
    }

    {
      const store = createStore();
      const tabCalls = observeTabs(store, 954);
      const persist = store.local.api.set;
      let localSetCalls = 0;
      store.local.api.set = async (update) => {
        localSetCalls += 1;
        if (localSetCalls === 2) throw new Error("synthetic concrete binding failure");
        return persist(update);
      };
      await assert.rejects(() => runRestore(store), /synthetic concrete binding failure/);
      assert.equal(localSetCalls, 3, "successful tab compensation must be followed by a durable re-arm");
      assert.equal(tabCalls.create.length, 1);
      assert.deepEqual(tabCalls.remove, [954]);
      assert.deepEqual(claimState(store), rearmedClaimState);
      assert.equal(workspaceSessionBindingKey(954) in store.local.values, false);
    }

    {
      const store = createStore();
      const tabCalls = observeTabs(store, 955, true);
      const persist = store.local.api.set;
      let localSetCalls = 0;
      store.local.api.set = async (update) => {
        localSetCalls += 1;
        if (localSetCalls === 2) throw new Error("synthetic concrete binding failure before removal failure");
        return persist(update);
      };
      await assert.rejects(
        () => runRestore(store),
        /opened but its durable binding could not be confirmed/
      );
      assert.equal(localSetCalls, 2);
      assert.equal(tabCalls.create.length, 1);
      assert.deepEqual(tabCalls.remove, [955]);
      assert.equal(claimState(store).claimedAt, now);
      assert.equal(claimState(store).claimedTabId, null);
      assert.match(claimState(store).claimId, /^claim-/);
      assert.equal(workspaceSessionBindingKey(955) in store.local.values, false);
      await assertRetryBlockedByDurableLease(
        store,
        "an unremovable unbound tab must retain its prelease across a worker restart"
      );
    }

    {
      const store = createStore();
      const tabCalls = observeTabs(store, 956);
      const persist = store.local.api.set;
      let localSetCalls = 0;
      store.local.api.set = async (update) => {
        localSetCalls += 1;
        if (localSetCalls === 2) throw new Error("synthetic concrete failure before rollback failure");
        if (localSetCalls === 3) throw new Error("synthetic concrete rollback failure");
        return persist(update);
      };
      await assert.rejects(() => runRestore(store), /synthetic concrete failure before rollback failure/);
      assert.equal(localSetCalls, 3);
      assert.equal(tabCalls.create.length, 1);
      assert.deepEqual(tabCalls.remove, [956]);
      assert.equal(claimState(store).claimedAt, now, "a failed re-arm must leave the prelease durable");
      await assertRetryBlockedByDurableLease(
        store,
        "a compensated tab with a failed re-arm must remain duplicate-protected"
      );
    }
  }

  {
    const now = 1_975_000;
    const eventId = "event-restore-toctou";
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const exactTab = { id: 975, windowId: 23, index: 0, pinned: false, url: tokenUrl };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "restore-toctou",
          { tabId: 974, windowId: 23, index: 0, pinned: false },
          now - 100,
          now - 50,
          { snapshot: usedSnapshot("restore-toctou") }
        ),
        [WORKSPACE_SESSION_RECOVERY_KEY]: {
          version: WORKSPACE_SESSION_RECOVERY_VERSION,
          id: "recovery-restore-toctou",
          runtimeId: "runtime-restore-toctou",
          generation,
          reason: "runtime-restart",
          createdAt: now - 50,
          expiresAt: 0,
          candidates: [{
            workspaceId: workspaceA,
            eventId,
            windowId: exactTab.windowId,
            index: exactTab.index,
            pinned: false,
            source: "stable",
            clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
            claimedAt: 0,
            claimedTabId: null,
            claimId: "",
            claimRuntimeId: "",
            claimExpiresAt: 0,
            committedAt: 0
          }]
        }
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-restore-toctou", now - 100)
      },
      tabs: []
    });
    let queryCalls = 0;
    store.api.tabs.query = async () => {
      queryCalls += 1;
      return queryCalls === 1 ? [] : [structuredClone(exactTab)];
    };
    const created = [];
    const removed = [];
    store.api.tabs.create = async (details) => {
      created.push(structuredClone(details));
      return { id: 976, windowId: 23, index: 1, pinned: false, url: details.url };
    };
    store.api.tabs.remove = async (tabId) => { removed.push(tabId); };
    const restored = await restoreClearedWorkspaceTabs(store.api, {
      candidates: [{ workspaceId: workspaceA, eventId }]
    }, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 977, windowId: 23, index: 1, pinned: false }
    }, { now });
    assert.equal(queryCalls, 3, "restore must refresh before creation and return a fresh final inventory");
    assert.equal(created.length, 0, "a concurrently appeared exact workspace tab must be reused");
    assert.equal(removed.length, 0);
    assert.equal(restored.restored, 1);
    assert.deepEqual(restored.opened, [{ workspaceId: workspaceA, tabId: exactTab.id, reused: true }]);
    const opening = store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates[0];
    assert.equal(opening.claimedAt, 0, "the reused live page must not retain the speculative prelease");
    assert.equal(opening.claimedTabId, null);
    assert.equal(opening.claimId, "");
    assert.equal(workspaceSessionBindingKey(exactTab.id) in store.local.values, false);
  }

  {
    const now = 2_000_000;
    const first = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "durable-candidate",
          { tabId: 101, windowId: 11, index: 0, pinned: false },
          now - 1000
        )
      },
      session: {},
      tabs: []
    });
    await prepareWorkspaceSessionLifecycle(first.api, { now, reason: "runtime-start" });
    const afterTenMinutes = now + (11 * 60 * 1000);
    assert.deepEqual(
      (await listClearedWorkspaceTabs(first.api, { now: afterTenMinutes })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "pending recovery must not expire after ten minutes"
    );
    assert.equal(first.local.values[WORKSPACE_SESSION_RECOVERY_KEY].expiresAt, 0);

    const second = fixture({
      local: JSON.parse(JSON.stringify(first.local.values)),
      session: {},
      tabs: []
    });
    await prepareWorkspaceSessionLifecycle(second.api, { now: afterTenMinutes + 1, reason: "runtime-start" });
    assert.deepEqual(
      (await listClearedWorkspaceTabs(second.api, { now: afterTenMinutes + 2 })).tabs.map((item) => item.workspaceId),
      [workspaceA]
    );

    const third = fixture({
      local: JSON.parse(JSON.stringify(second.local.values)),
      session: {},
      tabs: []
    });
    await prepareWorkspaceSessionLifecycle(third.api, { now: afterTenMinutes + 3, reason: "runtime-start" });
    assert.deepEqual(
      (await listClearedWorkspaceTabs(third.api, { now: afterTenMinutes + 4 })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "a pending candidate must survive consecutive runtime ids"
    );
  }

  {
    const now = 3_000_000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const originalTab = { id: 301, windowId: 15, index: 0, pinned: false, url: tokenUrl };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "restart-live-at-risk",
          { tabId: originalTab.id, windowId: originalTab.windowId, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("restart-live-at-risk") }
        ),
        [workspaceSessionBindingKey(originalTab.id)]: binding(
          workspaceA,
          originalTab.id,
          now - 1000,
          { windowId: originalTab.windowId, index: 0 }
        )
      },
      session: {},
      tabs: [originalTab]
    });
    const prepared = await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    assert.equal(prepared.lifecycleRestart, true);
    assert.deepEqual(
      store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds,
      [workspaceA],
      "exact live pages inherited across a restart must remain at risk until their document explicitly claims"
    );

    const delayedRemovalAt = now + (2 * 60 * 1000) + 1;
    store.liveTabs.splice(0);
    await detachWorkspaceSessionMirror(
      store.api,
      originalTab.id,
      { windowId: originalTab.windowId, isWindowClosing: false },
      { now: delayedRemovalAt }
    );
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind,
      WORKSPACE_SESSION_DETACH_BROWSER,
      "a browser may lazily clear an inherited page after the startup settle window"
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: delayedRemovalAt + 1 })).tabs.map((item) => item.workspaceId),
      [workspaceA]
    );

    const claimedTab = { id: 302, windowId: 15, index: 0, pinned: false, url: tokenUrl };
    store.liveTabs.push(claimedTab);
    const claim = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceA },
      { url: tokenUrl, tab: claimedTab },
      { now: delayedRemovalAt + 2 }
    );
    assert.equal(claim.claimed, true);
    assert.match(claim.claimId, /^claim-/);
    assert.deepEqual(
      store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds,
      [workspaceA],
      "claiming a tokenized inherited page must not acknowledge it before its snapshot is durable"
    );
    await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: workspaceA,
      snapshot: usedSnapshot("restart-live-ready")
    }, { url: tokenUrl, tab: claimedTab }, { now: delayedRemovalAt + 2.5 });
    const durablePersist = store.local.calls.set.findLast((update) => (
      update[workspaceSessionWorkspaceKey(workspaceA)]?.snapshot?.marker === "restart-live-ready"
    ));
    assert.ok(durablePersist, "persist must write the ready snapshot");
    assert.equal(
      durablePersist[workspaceSessionBindingKey(claimedTab.id)]?.workspaceId,
      workspaceA,
      "persist must atomically write the snapshot and its live tab binding"
    );
    assert.deepEqual(
      store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds,
      [workspaceA],
      "durable persistence must not guess that a later removal is user-initiated"
    );
    await commitWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceA, claimId: claim.claimId },
      { url: tokenUrl, tab: claimedTab },
      { now: delayedRemovalAt + 3 }
    );

    store.liveTabs.splice(0);
    const ordinaryCloseAt = delayedRemovalAt + (6 * 60 * 60 * 1000);
    await detachWorkspaceSessionMirror(
      store.api,
      claimedTab.id,
      { windowId: claimedTab.windowId, isWindowClosing: false },
      { now: ordinaryCloseAt }
    );
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind,
      WORKSPACE_SESSION_DETACH_BROWSER,
      "an inherited page remains protected without an arbitrary quiet-window cutoff"
    );
    const dismissItems = (await listClearedWorkspaceTabs(store.api, { now: ordinaryCloseAt + 1 })).tabs;
    assert.deepEqual(dismissItems.map((item) => item.workspaceId), [workspaceA]);
    await dismissClearedWorkspaceTabs(store.api, recoveryRequest(dismissItems), { now: ordinaryCloseAt + 2 });
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].resolution,
      WORKSPACE_SESSION_DISMISSED,
      "only an explicit dismiss may resolve an ambiguous inherited-page removal"
    );
    assert.deepEqual(store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds, []);
  }

  {
    const now = 3_500_000;
    const claimId = "claim-expired-opening";
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const pageTab = { id: 401, windowId: 16, index: 0, pinned: false, url: tokenUrl };
    const expiresAt = now + WORKSPACE_SESSION_OPENING_LEASE_MS;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "expired-opening-live-url",
          { tabId: pageTab.id, windowId: pageTab.windowId, index: 0, pinned: false },
          now,
          null,
          { snapshot: usedSnapshot("expired-opening-live-url") }
        ),
        [workspaceSessionBindingKey(pageTab.id)]: binding(
          workspaceA,
          pageTab.id,
          now,
          { windowId: pageTab.windowId, index: 0 }
        ),
        [WORKSPACE_SESSION_RECOVERY_KEY]: {
          version: WORKSPACE_SESSION_RECOVERY_VERSION,
          id: "recovery-expired-opening",
          runtimeId: "runtime-opening-lease",
          generation,
          reason: "restore",
          createdAt: now,
          expiresAt: 0,
          candidates: [{
            workspaceId: workspaceA,
            windowId: pageTab.windowId,
            index: 0,
            pinned: false,
            source: "stable",
            clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
            claimedAt: now,
            claimedTabId: pageTab.id,
            claimId,
            claimRuntimeId: "runtime-opening-lease",
            claimExpiresAt: expiresAt,
            committedAt: 0
          }]
        }
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-opening-lease", now)
      },
      tabs: [pageTab]
    });
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: expiresAt + 1 })).tabs.map((item) => item.workspaceId),
      [],
      "an exact live workspace page must stay hidden even after its opening lease expires"
    );
    const handled = await handleWorkspaceSessionAlarm(
      store.api,
      { name: WORKSPACE_SESSION_RECOVERY_ALARM },
      { now: expiresAt + 1 }
    );
    assert.notEqual(handled, null, "the recovery lease alarm must be handled separately from user-close alarms");
    const persisted = store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates[0];
    assert.equal(persisted.claimedAt, 0, "the alarm must durably re-arm an expired opening candidate");
    assert.equal(persisted.claimedTabId, null);
    assert.equal(persisted.claimId, "");
    assert.equal(persisted.claimRuntimeId, "");
    assert.equal(persisted.claimExpiresAt, 0);
    let creates = 0;
    store.api.tabs.create = async () => {
      creates += 1;
      return { id: 402, windowId: pageTab.windowId, index: 1, pinned: false };
    };
    const hiddenRestore = await restoreClearedWorkspaceTabs(store.api, {
      candidates: [{ workspaceId: workspaceA, eventId: persisted.eventId }]
    }, {
      url: "chrome-extension://chatclub/chatClub.html",
      tab: { id: 403, windowId: pageTab.windowId, index: 1, pinned: false }
    }, { now: expiresAt + 2 });
    assert.equal(hiddenRestore.restored, 0);
    assert.equal(creates, 0, "restore must not reload or duplicate an exact live workspace page");
    store.liveTabs.splice(0);
    assert.deepEqual(
      (await listClearedWorkspaceTabs(store.api, { now: expiresAt + 3 })).tabs.map((item) => item.workspaceId),
      [workspaceA],
      "the re-armed candidate must become visible after its exact live page disappears"
    );
  }

  {
    const now = 4_000_000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const pageTab = { id: 501, windowId: 17, index: 0, pinned: false, url: tokenUrl };
    const brokenQueries = [
      {
        name: "missing",
        install(api) { delete api.tabs.query; },
        error: /inventory|query|not a function/i
      },
      {
        name: "rejected",
        install(api) { api.tabs.query = async () => { throw new Error("synthetic tabs query failure"); }; },
        error: /synthetic tabs query failure/
      },
      {
        name: "non-array",
        install(api) { api.tabs.query = async () => ({ 0: pageTab }); },
        error: /invalid result/i
      }
    ];
    for (const queryCase of brokenQueries) {
      const registerStore = fixture({
        local: { [WORKSPACE_SESSION_GENERATION_KEY]: generation },
        session: { [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-register-query", now) },
        tabs: [pageTab]
      });
      queryCase.install(registerStore.api);
      const registerBefore = JSON.parse(JSON.stringify(registerStore.local.values));
      await assert.rejects(
        () => registerWorkspaceSessionTab(registerStore.api, pageTab, { now }),
        queryCase.error,
        `register must fail closed when tabs.query is ${queryCase.name}`
      );
      assert.deepEqual(registerStore.local.values, registerBefore, "failed inventory must not register an owner");

      const claimStore = fixture({
        local: { [WORKSPACE_SESSION_GENERATION_KEY]: generation },
        session: { [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-claim-query", now) },
        tabs: [pageTab]
      });
      queryCase.install(claimStore.api);
      const claimBefore = JSON.parse(JSON.stringify(claimStore.local.values));
      await assert.rejects(
        () => claimWorkspaceSessionRecovery(
          claimStore.api,
          { workspaceId: workspaceA },
          { url: tokenUrl, tab: pageTab },
          { now }
        ),
        queryCase.error,
        `claim must fail closed when tabs.query is ${queryCase.name}`
      );
      assert.deepEqual(claimStore.local.values, claimBefore, "failed inventory must not claim or create a workspace");
    }
  }

  {
    const now = 4_250_000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const detachedStable = stable(
      workspaceA,
      "alarm-create-failure",
      { tabId: 550, windowId: 21, index: 0, pinned: false },
      now - 100,
      now - 50,
      {
        detachedKind: WORKSPACE_SESSION_DETACH_BROWSER,
        detachedRuntimeId: "runtime-alarm-failure",
        snapshot: usedSnapshot("alarm-create-failure")
      }
    );
    const unclaimedCandidate = {
      workspaceId: workspaceA,
      windowId: 21,
      index: 0,
      pinned: false,
      source: "stable",
      clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
      claimedAt: 0,
      claimedTabId: null,
      claimId: "",
      claimRuntimeId: "",
      claimExpiresAt: 0,
      committedAt: 0
    };
    const recovery = {
      version: WORKSPACE_SESSION_RECOVERY_VERSION,
      id: "recovery-alarm-create-failure",
      runtimeId: "runtime-alarm-failure",
      generation,
      reason: "runtime-restart",
      createdAt: now - 50,
      expiresAt: 0,
      candidates: [unclaimedCandidate]
    };
    const createFailureStore = ({ tabs = [] } = {}) => {
      const store = fixture({
        local: {
          [WORKSPACE_SESSION_GENERATION_KEY]: generation,
          [workspaceSessionWorkspaceKey(workspaceA)]: detachedStable,
          [WORKSPACE_SESSION_RECOVERY_KEY]: recovery
        },
        session: {
          [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-alarm-failure", now - 100)
        },
        tabs
      });
      store.api.alarms.create = async () => { throw new Error("synthetic recovery alarm creation failure"); };
      return store;
    };

    const claimTab = { id: 551, windowId: 21, index: 0, pinned: false, url: tokenUrl };
    const claimStore = createFailureStore({ tabs: [claimTab] });
    const claimRecoveryBefore = JSON.parse(JSON.stringify(claimStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY]));
    await assert.rejects(
      () => claimWorkspaceSessionRecovery(
        claimStore.api,
        { workspaceId: workspaceA },
        { url: tokenUrl, tab: claimTab },
        { now }
      ),
      /synthetic recovery alarm creation failure/
    );
    assert.deepEqual(
      claimStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY],
      claimRecoveryBefore,
      "a claim must not persist an opening-hidden candidate when its durable wake-up cannot be armed"
    );
    assert.equal(workspaceSessionBindingKey(claimTab.id) in claimStore.local.values, false);

    const restoreStore = createFailureStore();
    restoreStore.api.tabs.create = async (details) => ({
      id: 552,
      windowId: details.windowId,
      index: details.index,
      pinned: details.pinned === true,
      url: details.url
    });
    const restoreRequest = recoveryRequest((await listClearedWorkspaceTabs(restoreStore.api, { now })).tabs);
    const restoreRecoveryBefore = JSON.parse(JSON.stringify(restoreStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY]));
    await assert.rejects(
      () => restoreClearedWorkspaceTabs(restoreStore.api, restoreRequest, {
        url: "chrome-extension://chatclub/chatClub.html",
        tab: { id: 553, windowId: 21, index: 1, pinned: false }
      }, { now }),
      /synthetic recovery alarm creation failure/
    );
    assert.deepEqual(
      restoreStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY],
      restoreRecoveryBefore,
      "restore must leave its original candidate unclaimed when the opening lease alarm cannot be armed"
    );
    assert.equal(workspaceSessionBindingKey(552) in restoreStore.local.values, false);

    const openingCandidate = {
      ...unclaimedCandidate,
      claimedAt: now,
      claimedTabId: claimTab.id,
      claimId: "claim-alarm-create-failure",
      claimRuntimeId: "runtime-alarm-failure",
      claimExpiresAt: now + WORKSPACE_SESSION_OPENING_LEASE_MS
    };
    const openingRecovery = { ...recovery, candidates: [openingCandidate] };
    const createOpeningFailureStore = () => {
      const store = fixture({
        local: {
          [WORKSPACE_SESSION_GENERATION_KEY]: generation,
          [workspaceSessionWorkspaceKey(workspaceA)]: detachedStable,
          [WORKSPACE_SESSION_RECOVERY_KEY]: openingRecovery
        },
        session: {
          [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-alarm-failure", now - 100)
        },
        tabs: []
      });
      store.api.alarms.create = async () => { throw new Error("synthetic recovery alarm creation failure"); };
      return store;
    };

    const prepareStore = createOpeningFailureStore();
    await prepareWorkspaceSessionLifecycle(prepareStore.api, { now: now + 1, reason: "worker-wake" });
    assert.equal(
      prepareStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates[0].claimedAt,
      0,
      "prepare must re-arm an opening candidate if it cannot maintain the recovery alarm"
    );

    const alarmStore = createOpeningFailureStore();
    await handleWorkspaceSessionAlarm(
      alarmStore.api,
      { name: WORKSPACE_SESSION_RECOVERY_ALARM },
      { now: now + 1 }
    );
    assert.equal(
      alarmStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates[0].claimedAt,
      0,
      "the alarm handler must re-arm an opening candidate when scheduling its next wake-up fails"
    );
  }

  {
    const now = 4_500_000;
    const tokenUrlB = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceB}`;
    const pageTab = { id: 601, windowId: 18, index: 0, pinned: false, url: tokenUrlB };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "binding-before-navigation",
          { tabId: pageTab.id, windowId: pageTab.windowId, index: 0, pinned: false },
          now - 1000,
          null,
          { snapshot: usedSnapshot("binding-before-navigation") }
        ),
        [workspaceSessionBindingKey(pageTab.id)]: binding(
          workspaceA,
          pageTab.id,
          now - 1000,
          { windowId: pageTab.windowId, index: 0 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-binding-switch", now - 1000, [workspaceA])
      },
      tabs: [pageTab]
    });
    const claimed = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: workspaceB },
      { url: tokenUrlB, tab: pageTab },
      { now }
    );
    assert.equal(claimed.workspaceId, workspaceB);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(workspaceA)].detachedKind, WORKSPACE_SESSION_DETACH_BROWSER);
    assert.equal(
      WORKSPACE_SESSION_RECOVERY_KEY in store.local.values,
      false,
      "reusing a tab binding for B must keep A's conversation as a remembered tab instead of crash recovery"
    );
    const ownershipWrite = store.local.calls.set.findLast((update) => (
      update[workspaceSessionBindingKey(pageTab.id)]?.workspaceId === workspaceB
    ));
    assert.ok(ownershipWrite, "the B ownership update must be persisted");
    assert.ok(
      ownershipWrite[workspaceSessionWorkspaceKey(workspaceA)],
      "A's detach record must share the ownership-switch transaction"
    );
    assert.equal(
      Object.hasOwn(ownershipWrite, WORKSPACE_SESSION_RECOVERY_KEY),
      false,
      "a displaced conversation workspace must not enqueue browser-cleared recovery"
    );
    assert.deepEqual(
      new Set(store.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds),
      new Set([workspaceA, workspaceB]),
      "the replacement identity must inherit the bound page's ambiguous-cleanup protection"
    );
  }

  {
    const now = 5_000_000;
    const legacyTabId = 701;
    const legacyKey = workspaceSessionMirrorKey(legacyTabId);
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [legacyKey]: { generation, snapshot: usedSnapshot("legacy-remove-retry") }
      },
      session: {},
      tabs: []
    });
    const remove = store.local.api.remove.bind(store.local.api);
    let failedRemoval = false;
    store.local.api.remove = async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      if (!failedRemoval && list.includes(legacyKey)) {
        failedRemoval = true;
        throw new Error("synthetic legacy remove failure");
      }
      return remove(keys);
    };
    await assert.rejects(
      () => prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" }),
      /synthetic legacy remove failure/
    );
    const firstWorkspaceIds = Object.values(store.local.values)
      .map((value) => normalizeWorkspaceSessionId(value?.workspaceId))
      .filter(Boolean);
    assert.equal(firstWorkspaceIds.length, 1, "the failed removal attempt must still have one durable migration target");
    await prepareWorkspaceSessionLifecycle(store.api, { now: now + 1, reason: "runtime-start" });
    const secondWorkspaceIds = Object.values(store.local.values)
      .map((value) => normalizeWorkspaceSessionId(value?.workspaceId))
      .filter(Boolean);
    assert.deepEqual(
      [...new Set(secondWorkspaceIds)],
      firstWorkspaceIds,
      "retrying a partially completed legacy migration must reuse the same workspace id"
    );
    assert.equal(legacyKey in store.local.values, false);
    assert.deepEqual(
      store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates.map((item) => item.workspaceId),
      firstWorkspaceIds,
      "migration retry must not duplicate its recovery candidate"
    );

    const liveLegacyTabId = 702;
    const liveLegacyKey = workspaceSessionMirrorKey(liveLegacyTabId);
    const liveUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceC}`;
    const liveStore = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [liveLegacyKey]: { generation, snapshot: usedSnapshot("legacy-still-live") }
      },
      session: {},
      tabs: [{ id: liveLegacyTabId, windowId: 19, index: 0, pinned: false, url: liveUrl }]
    });
    const livePrepared = await prepareWorkspaceSessionLifecycle(liveStore.api, { now, reason: "runtime-start" });
    assert.equal(liveLegacyKey in liveStore.local.values, false);
    assert.equal(liveStore.local.values[workspaceSessionWorkspaceKey(workspaceC)].snapshot.marker, "legacy-still-live");
    assert.equal(livePrepared.recovery, null, "a live legacy tab must migrate in place without a false recovery prompt");
    assert.deepEqual((await listClearedWorkspaceTabs(liveStore.api, { now: now + 1 })).tabs, []);
  }

  {
    const now = 5_200_000;
    const legacyTabId = 704;
    const legacyWorkspaceId = workspaceSessionLegacyWorkspaceId(legacyTabId);
    const legacyKey = workspaceSessionMirrorKey(legacyTabId);
    const legacyTab = {
      id: legacyTabId,
      windowId: 19,
      index: 0,
      pinned: false,
      url: "chrome-extension://chatclub/chatClub.html"
    };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [legacyKey]: { generation, snapshot: usedSnapshot("raw-legacy-claim") }
      },
      session: {},
      tabs: [legacyTab]
    });
    const first = await claimWorkspaceSessionRecovery(store.api, {
      workspaceId: legacyWorkspaceId
    }, { url: legacyTab.url, tab: legacyTab }, { now });
    assert.equal(first.workspaceId, legacyWorkspaceId);
    assert.equal(first.recovered, true);
    assert.match(first.claimId, /^claim-/);
    assert.equal(first.snapshot.marker, "raw-legacy-claim");
    assert.equal(legacyKey in store.local.values, false);
    const repeated = await claimWorkspaceSessionRecovery(store.api, {
      workspaceId: legacyWorkspaceId
    }, { url: legacyTab.url, tab: legacyTab }, { now: now + 1 });
    assert.equal(repeated.claimId, first.claimId, "repeating an exact raw-legacy claim must reuse its opening lease");
  }

  {
    const now = 5_225_000;
    const legacyTabId = 705;
    const legacyKey = workspaceSessionMirrorKey(legacyTabId);
    const legacyTab = {
      id: legacyTabId,
      windowId: 19,
      index: 0,
      pinned: false,
      url: "chrome-extension://chatclub/chatClub.html"
    };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [legacyKey]: { generation, snapshot: usedSnapshot("prepared-legacy-claim") }
      },
      session: {},
      tabs: [legacyTab]
    });
    await prepareWorkspaceSessionLifecycle(store.api, { now, reason: "runtime-start" });
    const claimed = await claimWorkspaceSessionRecovery(
      store.api,
      {},
      { url: legacyTab.url, tab: legacyTab },
      { now: now + 1 }
    );
    assert.equal(claimed.workspaceId, workspaceSessionLegacyWorkspaceId(legacyTabId));
    assert.equal(claimed.snapshot.marker, "prepared-legacy-claim");
    assert.match(claimed.claimId, /^claim-/);
  }

  {
    const now = 5_240_000;
    const oldTabId = 706;
    const newTabId = 707;
    const oldWorkspaceId = workspaceSessionLegacyWorkspaceId(oldTabId);
    const newWorkspaceId = workspaceSessionLegacyWorkspaceId(newTabId);
    const newUrl = `chrome-extension://chatclub/chatClub.html#workspace=${newWorkspaceId}`;
    const pageTab = { id: newTabId, windowId: 20, index: 0, pinned: false, url: newUrl };
    const oldStable = stable(
      oldWorkspaceId,
      "cross-tab-legacy-adoption",
      { tabId: oldTabId, windowId: 20, index: 0, pinned: false },
      now - 100,
      now - 50,
      { snapshot: usedSnapshot("cross-tab-legacy-adoption") }
    );
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(oldWorkspaceId)]: oldStable,
        [workspaceSessionBindingKey(oldTabId)]: binding(oldWorkspaceId, oldTabId, now - 100, { windowId: 20, index: 0 }),
        [WORKSPACE_SESSION_RECOVERY_KEY]: {
          version: WORKSPACE_SESSION_RECOVERY_VERSION,
          id: "recovery-cross-tab-legacy",
          runtimeId: "runtime-cross-tab-legacy",
          generation,
          reason: "runtime-restart",
          createdAt: now - 50,
          expiresAt: 0,
          candidates: [{
            workspaceId: oldWorkspaceId,
            eventId: "event-cross-tab-legacy",
            windowId: 20,
            index: 0,
            pinned: false,
            source: "legacy",
            clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
            claimedAt: 0,
            claimedTabId: null,
            claimId: "",
            claimRuntimeId: "",
            claimExpiresAt: 0,
            committedAt: 0
          }]
        }
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-cross-tab-legacy", now - 100, [oldWorkspaceId])
      },
      tabs: [pageTab]
    });
    store.local.api.remove = async () => { throw new Error("synthetic adoption cleanup failure"); };
    await assert.rejects(() => persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newWorkspaceId,
      snapshot: usedSnapshot("cross-tab-legacy-adoption")
    }, { url: newUrl, tab: pageTab }, { now }), /synthetic adoption cleanup failure/);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(oldWorkspaceId)].resolution,
      WORKSPACE_SESSION_DISMISSED,
      "legacy adoption must tombstone its old identity before fallible physical cleanup"
    );
    assert.deepEqual(store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates, []);
    const restarted = fixture({ local: { ...store.local.values }, session: {}, tabs: [pageTab] });
    await prepareWorkspaceSessionLifecycle(restarted.api, { now: now + 1, reason: "runtime-start" });
    assert.deepEqual((await listClearedWorkspaceTabs(restarted.api, { now: now + 2 })).tabs, [],
      "a failed cleanup after adoption must not re-enqueue the tombstoned legacy identity");
  }

  {
    const now = 5_250_000;
    const legacyTabId = 703;
    const legacyKey = workspaceSessionMirrorKey(legacyTabId);
    const migrationWorkspaceId = `page-legacy-tab-${legacyTabId}`;
    const tokenlessUrl = "chrome-extension://chatclub/chatClub.html";
    const legacyTab = {
      id: legacyTabId,
      windowId: 19,
      index: 1,
      pinned: false,
      url: tokenlessUrl
    };
    const createLiveLegacyStore = () => fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [legacyKey]: { generation, snapshot: usedSnapshot("legacy-tokenless") }
      },
      session: {},
      tabs: [legacyTab]
    });

    const cleanedStore = createLiveLegacyStore();
    const cleanedPrepared = await prepareWorkspaceSessionLifecycle(cleanedStore.api, {
      now,
      reason: "runtime-start"
    });
    assert.equal(normalizeWorkspaceSessionId(migrationWorkspaceId), migrationWorkspaceId);
    assert.equal(legacyKey in cleanedStore.local.values, false);
    assert.equal(
      cleanedStore.local.values[workspaceSessionWorkspaceKey(migrationWorkspaceId)].snapshot.marker,
      "legacy-tokenless",
      "a live tokenless legacy mirror must migrate to its deterministic stable id"
    );
    assert.equal(
      cleanedStore.local.values[workspaceSessionBindingKey(legacyTabId)].workspaceId,
      migrationWorkspaceId,
      "the migration must retain the live tab binding"
    );
    assert.deepEqual(
      cleanedStore.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds,
      [migrationWorkspaceId]
    );
    assert.deepEqual(
      cleanedPrepared.recovery.candidates.map(({ workspaceId, source, clearedBy }) => ({ workspaceId, source, clearedBy })),
      [{ workspaceId: migrationWorkspaceId, source: "legacy", clearedBy: "" }],
      "the migration candidate must remain hidden while its inherited tab is still alive"
    );
    assert.deepEqual((await listClearedWorkspaceTabs(cleanedStore.api, { now: now + 1 })).tabs, []);

    cleanedStore.liveTabs.splice(0);
    await detachWorkspaceSessionMirror(
      cleanedStore.api,
      legacyTabId,
      { windowId: legacyTab.windowId, isWindowClosing: false },
      { now: now + LEGACY_STARTUP_SETTLE_MS + 1 }
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(cleanedStore.api, {
        now: now + LEGACY_STARTUP_SETTLE_MS + 2
      })).tabs.map((item) => item.workspaceId),
      [migrationWorkspaceId],
      "cleanup before the legacy document persists must promote it to browser-visible recovery"
    );

    const readyStore = createLiveLegacyStore();
    await prepareWorkspaceSessionLifecycle(readyStore.api, { now, reason: "runtime-start" });
    const sender = { url: tokenlessUrl, tab: { ...legacyTab } };
    const claim = await claimWorkspaceSessionRecovery(readyStore.api, {}, sender, { now: now + 1 });
    assert.equal(claim.claimed, true);
    assert.equal(claim.workspaceId, migrationWorkspaceId);
    assert.equal(claim.snapshot.marker, "legacy-tokenless");
    assert.deepEqual(
      readyStore.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds,
      [migrationWorkspaceId],
      "a naked legacy claim is not an acknowledgement until its snapshot persists"
    );
    const repeatedClaim = await claimWorkspaceSessionRecovery(readyStore.api, {}, sender, { now: now + 1.5 });
    assert.equal(repeatedClaim.workspaceId, migrationWorkspaceId);
    assert.equal(repeatedClaim.claimId, claim.claimId,
      "a same-tab retry after an uncertain response must recover its existing lease");
    const migratedUrl = `chrome-extension://chatclub/chatClub.html#workspace=${migrationWorkspaceId}`;
    sender.url = migratedUrl;
    sender.tab.url = migratedUrl;
    readyStore.liveTabs[0].url = migratedUrl;
    await persistWorkspaceSessionSnapshot(readyStore.api, {
      workspaceId: migrationWorkspaceId,
      snapshot: usedSnapshot("legacy-tokenless-ready")
    }, sender, { now: now + 2 });
    await commitWorkspaceSessionRecovery(readyStore.api, {
      workspaceId: migrationWorkspaceId,
      claimId: claim.claimId
    }, sender, { now: now + 3 });
    assert.deepEqual(
      readyStore.session.values[WORKSPACE_SESSION_RUNTIME_MARKER_KEY].atRiskWorkspaceIds,
      [migrationWorkspaceId],
      "a migrated inherited page remains protected after its snapshot is durable"
    );
    assert.deepEqual(
      (await listClearedWorkspaceTabs(readyStore.api, { now: now + 4 })).tabs,
      [],
      "a naked legacy page that claims, persists and commits must never raise a recovery prompt"
    );
  }

  {
    const now = 5_250_000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const pageTab = { id: 751, windowId: 22, index: 0, pinned: false, url: tokenUrl };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "stale-persist",
          { tabId: pageTab.id, windowId: pageTab.windowId, index: 0, pinned: false },
          now - 100
        ),
        [workspaceSessionBindingKey(pageTab.id)]: binding(
          workspaceA,
          pageTab.id,
          now - 100,
          { windowId: pageTab.windowId, index: 0 }
        )
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-stale-persist", now - 100)
      },
      tabs: []
    });
    const before = JSON.parse(JSON.stringify(store.local.values));
    await assert.rejects(
      () => persistWorkspaceSessionSnapshot(store.api, {
        workspaceId: workspaceA,
        snapshot: usedSnapshot("must-not-reattach")
      }, { url: tokenUrl, tab: pageTab }, { now }),
      /exact live workspace tab/
    );
    assert.deepEqual(store.local.values, before, "a vanished sender must not reattach or overwrite its stable snapshot");
  }

  {
    const now = 5_500_000;
    const tokenUrl = `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}`;
    const pageTab = { id: 801, windowId: 20, index: 0, pinned: false, url: tokenUrl };
    const claimId = "claim-commit-guard";
    const commitCases = [
      {
        name: "unclaimed",
        candidate: { claimedAt: 0, claimedTabId: null, claimId: "", claimRuntimeId: "", claimExpiresAt: 0 }
      },
      {
        name: "expired",
        candidate: {
          claimedAt: now - WORKSPACE_SESSION_OPENING_LEASE_MS - 1,
          claimedTabId: pageTab.id,
          claimId,
          claimRuntimeId: "runtime-commit",
          claimExpiresAt: now - 1
        }
      },
      {
        name: "wrong-runtime",
        candidate: {
          claimedAt: now - 1,
          claimedTabId: pageTab.id,
          claimId,
          claimRuntimeId: "runtime-other",
          claimExpiresAt: now + WORKSPACE_SESSION_OPENING_LEASE_MS
        }
      }
    ];
    for (const commitCase of commitCases) {
      const store = fixture({
        local: {
          [WORKSPACE_SESSION_GENERATION_KEY]: generation,
          [workspaceSessionWorkspaceKey(workspaceA)]: stable(
            workspaceA,
            `commit-${commitCase.name}`,
            { tabId: pageTab.id, windowId: pageTab.windowId, index: 0, pinned: false },
            now,
            null,
            { snapshot: usedSnapshot(`commit-${commitCase.name}`) }
          ),
          [workspaceSessionBindingKey(pageTab.id)]: binding(
            workspaceA,
            pageTab.id,
            now,
            { windowId: pageTab.windowId, index: 0 }
          ),
          [WORKSPACE_SESSION_RECOVERY_KEY]: {
            version: WORKSPACE_SESSION_RECOVERY_VERSION,
            id: `recovery-commit-${commitCase.name}`,
            runtimeId: "runtime-commit",
            generation,
            reason: "restore",
            createdAt: now - 100,
            expiresAt: 0,
            candidates: [{
              workspaceId: workspaceA,
              windowId: pageTab.windowId,
              index: 0,
              pinned: false,
              source: "stable",
              clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
              committedAt: 0,
              ...commitCase.candidate
            }]
          }
        },
        session: {
          [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-commit", now - 100)
        },
        tabs: [pageTab]
      });
      await assert.rejects(
        () => commitWorkspaceSessionRecovery(
          store.api,
          { workspaceId: workspaceA, claimId },
          { url: tokenUrl, tab: pageTab },
          { now }
        ),
        /active claim|stale|runtime/i,
        `${commitCase.name} recovery commit must be rejected`
      );
      assert.equal(
        store.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates.length,
        1,
        `a rejected ${commitCase.name} commit must preserve the recovery candidate`
      );
    }

    const validClaim = {
      workspaceId: workspaceA,
      windowId: pageTab.windowId,
      index: 0,
      pinned: false,
      source: "stable",
      clearedBy: WORKSPACE_SESSION_CLEARED_BY_BROWSER,
      claimedAt: now - 1,
      claimedTabId: pageTab.id,
      claimId,
      claimRuntimeId: "runtime-commit",
      claimExpiresAt: now + WORKSPACE_SESSION_OPENING_LEASE_MS,
      committedAt: 0
    };
    const vanishedStore = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "commit-vanished",
          { tabId: pageTab.id, windowId: pageTab.windowId, index: 0, pinned: false },
          now,
          null,
          { snapshot: usedSnapshot("commit-vanished") }
        ),
        [workspaceSessionBindingKey(pageTab.id)]: binding(
          workspaceA,
          pageTab.id,
          now,
          { windowId: pageTab.windowId, index: 0 }
        ),
        [WORKSPACE_SESSION_RECOVERY_KEY]: {
          version: WORKSPACE_SESSION_RECOVERY_VERSION,
          id: "recovery-commit-vanished",
          runtimeId: "runtime-commit",
          generation,
          reason: "restore",
          createdAt: now - 100,
          expiresAt: 0,
          candidates: [validClaim]
        }
      },
      session: {
        [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: runtimeMarker("runtime-commit", now - 100, [workspaceA])
      },
      tabs: []
    });
    await assert.rejects(
      () => commitWorkspaceSessionRecovery(
        vanishedStore.api,
        { workspaceId: workspaceA, claimId },
        { url: tokenUrl, tab: pageTab },
        { now }
      ),
      /exact live workspace tab/
    );
    assert.equal(
      vanishedStore.local.values[WORKSPACE_SESSION_RECOVERY_KEY].candidates.length,
      1,
      "a vanished sender must not consume its durable recovery candidate"
    );
  }

  {
    const now = 900000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "live-a",
          { tabId: 11, windowId: 2, index: 3, pinned: false },
          now,
          null,
          {
            snapshot: {
              schemaVersion: 1,
              generation,
              layout: { type: "temporary", name: "Pocket batch", presetId: "default" },
              groups: [{
                tabs: [
                  { appId: "ChatGPT", currentHref: "https://chatgpt.com/c/remembered" },
                  { appId: "Claude", currentHref: "https://claude.ai/chat/abc" }
                ],
                activeIndex: 0
              }]
            }
          }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "closed-b",
          { tabId: 12, windowId: 2, index: 1, pinned: false },
          now - 50,
          now - 40,
          { snapshot: usedSnapshot("closed-b") }
        ),
        [workspaceSessionWorkspaceKey(workspaceC)]: stable(
          workspaceC,
          "empty-c",
          { tabId: 14, windowId: 2, index: 2, pinned: false },
          now,
          null,
          {
            snapshot: {
              schemaVersion: 1,
              generation,
              groups: [{ tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }], activeIndex: 0 }]
            }
          }
        ),
        workspaceTabFullText: {
          [workspaceB]: {
            workspaceId: workspaceB,
            topicTitle: "closed-b",
            frames: [{
              appName: "Grok",
              messages: [
                { role: "user", text: "What is RAG?" },
                { role: "assistant", text: "Retrieval-augmented generation." }
              ]
            }]
          },
          [workspaceA]: {
            workspaceId: workspaceA,
            topicTitle: "live-a",
            frames: [{
              appName: "ChatGPT",
              messages: [
                { role: "user", text: "Keep this" },
                { role: "assistant", text: "Still here." }
              ]
            }]
          }
        }
      },
      tabs: [
        { id: 21, windowId: 3, index: 1, title: "ChatClub", url: "chrome-extension://chatclub/options.html" },
        { id: 12, windowId: 2, index: 1, title: "ChatClub", url: "chrome-extension://chatclub/chatClub.html#workspace=page-dddddddddddd" },
        { id: 11, windowId: 2, index: 0, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` },
        { id: 31, windowId: 1, index: 0, title: "Example", url: "https://example.com/" },
        { id: 13, windowId: 4, index: 0, title: "ChatClub", pendingUrl: "chrome-extension://chatclub/chatClub.html" },
        { id: 14, windowId: 2, index: 2, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceC}` }
      ]
    });
    const listed = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 11, url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` }
    });
    assert.deepEqual(listed.tabs.map((item) => item.workspaceId), [
      workspaceA,
      "page-dddddddddddd",
      workspaceC,
      workspaceB
    ]);
    assert.equal(listed.tabs[0].tabId, 11);
    assert.equal(listed.tabs[0].current, true);
    assert.equal(listed.tabs[0].live, true);
    assert.equal(listed.tabs[0].layoutName, "Pocket batch");
    assert.equal(listed.tabs[0].topicTitle, "");
    assert.deepEqual(listed.tabs[0].appIds, ["ChatGPT", "Claude"]);
    assert.equal(listed.tabs[1].live, true);
    assert.equal(listed.tabs[1].workspaceId, "page-dddddddddddd");
    assert.equal(listed.tabs[2].live, true);
    assert.equal(listed.tabs[2].workspaceId, workspaceC);
    assert.equal(listed.tabs[3].current, false);
    assert.equal(listed.tabs[3].live, false);
    assert.equal(listed.tabs[3].tabId, null);
    assert.equal(listed.tabs[3].workspaceId, workspaceB);
    const focused = await focusWorkspaceTab(store.api, { tabId: 12 }, { tab: { id: 11 } });
    assert.deepEqual(focused, { focused: true, tabId: 12, current: false });
    assert.deepEqual(store.tabUpdates, [{ tabId: 12, options: { active: true } }]);
    assert.deepEqual(store.windowUpdates, [{ windowId: 2, options: { focused: true } }]);
    const current = await focusWorkspaceTab(store.api, { tabId: 11 }, { tab: { id: 11 } });
    assert.deepEqual(current, { focused: true, tabId: 11, current: true });
    assert.equal(store.tabUpdates.length, 1, "focusing the current ChatClub tab must be a no-op");
    assert.ok(
      store.local.values[workspaceSessionWorkspaceKey(workspaceA)].viewedAt >= now,
      "focusing a ChatClub tab must stamp last-viewed time"
    );
    await assert.rejects(
      () => focusWorkspaceTab(store.api, { tabId: 21 }, { tab: { id: 11 } }),
      /not a live ChatClub page/
    );
    await assert.rejects(
      () => focusWorkspaceTab(store.api, { tabId: 31 }, { tab: { id: 11 } }),
      /not a live ChatClub page/
    );
    const renamed = await setWorkspaceTabTitle(store.api, { tabId: 11, title: "Compare models", custom: true });
    assert.deepEqual(renamed, {
      updated: true,
      workspaceId: workspaceA,
      tabId: 11,
      title: "Compare models",
      custom: true
    });
    const listedAgain = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 11, url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` }
    });
    assert.equal(listedAgain.tabs[0].topicTitle, "Compare models");
    assert.equal(listedAgain.tabs[0].topicTitleCustom, true);
    assert.ok(
      listedAgain.tabs[0].editedAt >= now,
      "renaming a ChatClub tab must stamp last-edited time"
    );
    const forgottenClosed = await forgetRememberedWorkspaceTab(store.api, { workspaceId: workspaceB }, { now: now + 1 });
    assert.deepEqual(forgottenClosed, { forgotten: true, workspaceId: workspaceB, closed: false });
    assert.equal(
      store.local.values.workspaceTabFullText[workspaceB],
      undefined,
      "deleting a remembered tab must drop its recorded full text"
    );
    assert.equal(store.local.values.workspaceTabFullText[workspaceA].topicTitle, "live-a");
    const afterForget = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 11, url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` }
    });
    assert.deepEqual(afterForget.tabs.map((item) => item.workspaceId), [
      workspaceA,
      "page-dddddddddddd",
      workspaceC
    ]);
    const forgottenLive = await forgetRememberedWorkspaceTab(store.api, { workspaceId: workspaceA }, { now: now + 2 });
    assert.deepEqual(forgottenLive, { forgotten: true, workspaceId: workspaceA, closed: true, tabId: 11 });
    assert.equal(store.liveTabs.some((tab) => tab.id === 11), false);
    const forgottenEmpty = await forgetRememberedWorkspaceTab(
      store.api,
      { workspaceId: workspaceC, tabId: 14 },
      { now: now + 3 }
    );
    assert.equal(forgottenEmpty.forgotten, true);
    assert.equal(forgottenEmpty.closed, true);
    assert.equal(forgottenEmpty.tabId, 14);
    assert.equal(store.liveTabs.some((tab) => tab.id === 14), false);
    const forgottenCurrent = await forgetRememberedWorkspaceTab(
      store.api,
      { workspaceId: "page-dddddddddddd" },
      { now: now + 4, sender: { tab: { id: 12 } } }
    );
    assert.equal(forgottenCurrent.closed, true);
    await Promise.resolve();
    assert.equal(store.liveTabs.some((tab) => tab.id === 12), false);
    const afterLiveForget = await listLiveWorkspaceTabs(store.api, {}, { tab: { id: 12 } });
    assert.deepEqual(afterLiveForget.tabs, []);
  }

  {
    const now = 9_050_500;
    const otherWindowTab = {
      id: 52,
      windowId: 9,
      index: 0,
      title: "ChatClub",
      url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceB}`
    };
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "fun-desk",
          { tabId: 51, windowId: 2, index: 0, pinned: false },
          now
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "little-arc-desk",
          { tabId: 52, windowId: 9, index: 0, pinned: false },
          now,
          null,
          { snapshot: usedSnapshot("little-arc-desk") }
        )
      },
      tabs: [
        { id: 51, windowId: 2, index: 0, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` },
        otherWindowTab
      ]
    });
    const focused = await focusWorkspaceTab(
      store.api,
      { tabId: 52 },
      { tab: { id: 51, windowId: 2, index: 0 } }
    );
    assert.deepEqual(focused, { focused: true, tabId: 52, current: false });
    assert.deepEqual(store.tabMoves, [{ tabIds: [52], options: { windowId: 2, index: 1 } }]);
    assert.equal(store.liveTabs.find((tab) => tab.id === 52).windowId, 2);
    assert.deepEqual(store.tabUpdates, [{ tabId: 52, options: { active: true } }]);
    assert.deepEqual(store.windowUpdates, [{ windowId: 2, options: { focused: true } }]);
  }

  {
    const now = 905000;
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "keep-current",
          { tabId: 11, windowId: 2, index: 0, pinned: false },
          now
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "close-live",
          { tabId: 12, windowId: 2, index: 1, pinned: false },
          now
        ),
        [workspaceSessionWorkspaceKey(workspaceC)]: stable(
          workspaceC,
          "already-closed",
          { tabId: 13, windowId: 2, index: 2, pinned: false },
          now - 50,
          now - 40,
          { snapshot: usedSnapshot("already-closed") }
        )
      },
      tabs: [
        { id: 11, windowId: 2, index: 0, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` },
        { id: 12, windowId: 2, index: 1, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceB}` },
        { id: 21, windowId: 3, index: 0, title: "ChatClub", url: "chrome-extension://chatclub/options.html" },
        { id: 31, windowId: 1, index: 0, title: "Example", url: "https://example.com/" }
      ]
    });
    const closed = await closeOtherLiveWorkspaceTabs(store.api, {}, { tab: { id: 11 } });
    assert.deepEqual(closed.tabIds, [12]);
    assert.equal(closed.closed, 1);
    assert.equal(store.liveTabs.some((tab) => tab.id === 11), true, "the current ChatClub tab must stay open");
    assert.equal(store.liveTabs.some((tab) => tab.id === 12), false, "other live ChatClub tabs must close");
    assert.equal(store.liveTabs.some((tab) => tab.id === 21), true, "the options page must not close");
    assert.equal(store.liveTabs.some((tab) => tab.id === 31), true, "unrelated browser tabs must not close");
    assert.ok(
      store.local.values[workspaceSessionWorkspaceKey(workspaceB)],
      "closing other ChatClub tabs must leave Tabs memory in place"
    );
    await assert.rejects(
      () => closeOtherLiveWorkspaceTabs(store.api, {}, {}),
      /Workspace tab id is invalid/
    );
  }

  {
    const store = fixture({
      tabs: [
        { id: 11, windowId: 2, index: 0, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` },
        { id: 12, windowId: 2, index: 2, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceB}` },
        { id: 31, windowId: 2, index: 1, title: "Example", url: "https://example.com/" }
      ]
    });
    const moved = await moveLiveWorkspaceTabs(store.api, { tabIds: [12, 11], index: 0, windowId: 2 });
    assert.deepEqual(moved, { moved: 2, tabIds: [12, 11], index: 0 });
    assert.deepEqual(store.tabMoves, [{ tabIds: [12, 11], options: { index: 0, windowId: 2 } }]);
    await assert.rejects(
      () => moveLiveWorkspaceTabs(store.api, { tabIds: [31], index: 0 }),
      /not a live ChatClub page/
    );
    await assert.rejects(
      () => moveLiveWorkspaceTabs(store.api, { tabIds: [12], index: -1 }),
      /Workspace tab move index is invalid/
    );
  }

  {
    const now = 910000;
    const conversation = (href, title = "") => ({
      schemaVersion: 1,
      generation,
      layout: { type: "preset", presetId: "default" },
      groups: [{ tabs: [{ appId: "ChatGPT", currentHref: href }], activeIndex: 0 }],
      topicTitle: title,
      topicTitleCustom: Boolean(title)
    });
    const store = fixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(workspaceA)]: stable(
          workspaceA,
          "export-live",
          { tabId: 41, windowId: 2, index: 0, pinned: false },
          now,
          null,
          { snapshot: conversation("https://chatgpt.com/c/live-a", "Live A") }
        ),
        [workspaceSessionWorkspaceKey(workspaceB)]: stable(
          workspaceB,
          "export-closed",
          { tabId: 42, windowId: 2, index: 1, pinned: false },
          now - 20,
          now - 10,
          { snapshot: conversation("https://chatgpt.com/c/closed-b", "Closed B") }
        ),
        [workspaceSessionWorkspaceKey(workspaceC)]: stable(
          workspaceC,
          "export-empty",
          { tabId: 43, windowId: 2, index: 2, pinned: false },
          now,
          null,
          {
            snapshot: {
              schemaVersion: 1,
              generation,
              groups: [{ tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }], activeIndex: 0 }]
            }
          }
        )
      },
      tabs: [
        { id: 41, windowId: 2, index: 0, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceA}` },
        { id: 43, windowId: 2, index: 2, title: "ChatClub", url: `chrome-extension://chatclub/chatClub.html#workspace=${workspaceC}` }
      ]
    });
    const exported = await exportRememberedWorkspaceTabs(store.api);
    assert.deepEqual(exported.tabs.map((item) => item.title).sort(), ["Closed B", "Live A"]);
    assert.equal(exported.tabs.every((item) => !Object.hasOwn(item, "workspaceId")), true);
    assert.equal(exported.tabs.every((item) => !Object.hasOwn(item.snapshot, "generation")), true);
    const duplicate = exported.tabs.find((item) => item.title === "Live A");
    const incoming = {
      title: "Imported E",
      snapshot: conversation("https://chatgpt.com/c/imported-e", "Imported E")
    };
    const merged = await importRememberedWorkspaceTabs(store.api, {
      tabs: [duplicate, incoming, { snapshot: { schemaVersion: 1, groups: [] } }]
    }, { now: now + 1 });
    assert.equal(merged.imported, 1);
    assert.equal(merged.forgotten, 0);
    assert.ok(merged.skipped >= 2);
    const afterMerge = await listLiveWorkspaceTabs(store.api, {}, { tab: { id: 41 } });
    assert.equal(afterMerge.tabs.length, 4);
    assert.ok(afterMerge.tabs.some((item) => item.topicTitle === "Imported E" && item.live === false));
    const replaced = await importRememberedWorkspaceTabs(store.api, {
      tabs: [{
        title: "Imported F",
        snapshot: conversation("https://chatgpt.com/c/imported-f", "Imported F")
      }],
      replace: true
    }, { now: now + 2 });
    assert.equal(replaced.imported, 1);
    assert.equal(replaced.forgotten, 2);
    const afterReplace = await listLiveWorkspaceTabs(store.api, {}, { tab: { id: 41 } });
    assert.deepEqual(afterReplace.tabs.map((item) => item.topicTitle).sort(), ["", "Imported F", "Live A"]);
    assert.equal(afterReplace.tabs.find((item) => item.topicTitle === "Live A").live, true);
    assert.equal(afterReplace.tabs.find((item) => item.topicTitle === "Imported F").live, false);
  }

  {
    const runtime = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
    assert.match(runtime, /detachWorkspaceSessionMirror\(chrome, tabId, removeInfo\)/);
    assert.match(
      runtime,
      /changedUrl && !isChatClubWorkspaceTab\(chrome, \{ id: tabId, url: changedUrl \}\)[\s\S]*?detachWorkspaceSessionMirror\(chrome, tabId/,
      "cold-worker navigation cleanup must use durable bindings instead of an in-memory previous-page tracker"
    );
    assert.match(runtime, /registerWorkspaceSessionTab\(chrome, tab\)/);
    assert.match(runtime, /registerWorkspaceSessionTab\(chrome, \{ \.\.\.tab, id: tabId, url \}\)/);
    assert.match(runtime, /onInstalled\.addListener\(async \(details = \{\}\)/);
    assert.match(runtime, /forceRecovery: reason === "update"/);
    assert.match(runtime, /prepareWorkspaceSessionLifecycleSafely\("runtime start"/);
    assert.match(runtime, /REQUEST\.CLAIM_WORKSPACE_SESSION_RECOVERY/);
    assert.match(runtime, /REQUEST\.COMMIT_WORKSPACE_SESSION_RECOVERY/);
    assert.match(runtime, /REQUEST\.LIST_CLEARED_WORKSPACE_TABS/);
    assert.match(
      runtime,
      /async function listClearedWorkspaceTabsAfterLifecycle\(\)[\s\S]*?await prepareWorkspaceSessionLifecycle\(chrome,[\s\S]*?return listClearedWorkspaceTabs\(chrome\)/,
      "every inventory request must await lifecycle reconciliation and propagate its failure"
    );
    assert.match(runtime, /REQUEST\.LIST_LIVE_WORKSPACE_TABS/);
    assert.match(
      runtime,
      /LIST_LIVE_WORKSPACE_TABS[\s\S]*?await prepareWorkspaceSessionLifecycle\(chrome,[\s\S]*?return listLiveWorkspaceTabs\(chrome/,
      "remembered tab inventory must await lifecycle reconciliation"
    );
    assert.match(runtime, /REQUEST\.EXPORT_REMEMBERED_WORKSPACE_TABS/);
    assert.match(
      runtime,
      /EXPORT_REMEMBERED_WORKSPACE_TABS[\s\S]*?await prepareWorkspaceSessionLifecycle\(chrome,[\s\S]*?return exportRememberedWorkspaceTabs\(chrome/,
      "remembered tab export must await lifecycle reconciliation"
    );
    assert.match(runtime, /REQUEST\.IMPORT_REMEMBERED_WORKSPACE_TABS/);
    assert.match(
      runtime,
      /IMPORT_REMEMBERED_WORKSPACE_TABS[\s\S]*?await prepareWorkspaceSessionLifecycle\(chrome,[\s\S]*?return importRememberedWorkspaceTabs\(chrome/,
      "remembered tab import must await lifecycle reconciliation"
    );
    assert.match(runtime, /REQUEST\.FORGET_REMEMBERED_WORKSPACE_TAB/);
    assert.match(runtime, /REQUEST\.FOCUS_WORKSPACE_TAB/);
    assert.match(runtime, /REQUEST\.CLOSE_OTHER_LIVE_WORKSPACE_TABS/);
    assert.match(runtime, /REQUEST\.MOVE_LIVE_WORKSPACE_TABS/);
    assert.match(runtime, /REQUEST\.SET_WORKSPACE_TAB_TITLE/);
    assert.match(runtime, /REQUEST\.RESTORE_CLEARED_WORKSPACE_TABS/);
    assert.match(runtime, /REQUEST\.DISMISS_CLEARED_WORKSPACE_TABS/);
    assert.match(runtime, /REQUEST\.DISMISS_CLEARED_WORKSPACE_TABS, \(message\) => dismissClearedWorkspaceTabs\(chrome, message\)/);
    assert.match(runtime, /handleWorkspaceSessionAlarm\(chrome, alarm\)/);
    assert.match(runtime, /createBackgroundRequestDispatcher\(/);
    assert.doesNotMatch(runtime, /removeWorkspaceSessionMirror\(chrome, tabId\)/);
  }

  console.log("workspace session background recovery lifecycle: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
