#!/usr/bin/env node

const assert = require("node:assert/strict");

function jsonClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function memorySessionStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    value(key) { return values.has(key) ? values.get(key) : null; }
  };
}

function memoryLocalStorage(initial = {}) {
  const values = new Map(Object.entries(jsonClone(initial)));
  const calls = { get: [], set: [], remove: [] };
  return {
    calls,
    async get(key) {
      calls.get.push(key);
      return jsonClone(values.get(key));
    },
    async set(key, value) {
      calls.set.push({ key, value: jsonClone(value) });
      values.set(key, jsonClone(value));
    },
    async remove(key) {
      calls.remove.push(key);
      values.delete(key);
    },
    value(key) { return jsonClone(values.get(key)); }
  };
}

function pageContext(href = "chrome-extension://chatclub/chatClub.html") {
  const location = { href };
  const history = {
    state: null,
    calls: [],
    replaceState(state, title, nextHref) {
      this.state = state;
      this.calls.push({ state, title, href: String(nextHref) });
      location.href = String(nextHref);
    }
  };
  return { location, history };
}

function snapshot(marker, generation = "caller-generation") {
  return {
    schemaVersion: 1,
    generation,
    layout: { type: "preset", presetId: "default" },
    groups: [{ tabs: [{ appId: "ChatGPT", currentHref: `https://example.com/${marker}` }], activeIndex: 0 }],
    fullscreenGroupIndex: null,
    marker
  };
}

function pageEnvelope(generation, snapshotValue, workspaceId) {
  return JSON.stringify({
    generation,
    ...(workspaceId ? { workspaceId } : {}),
    snapshot: snapshotValue
  });
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

function manualTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    scheduleTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, delay });
      return id;
    },
    cancelTimeout(id) { pending.delete(id); },
    pendingCount() { return pending.size; },
    runNext() {
      const next = pending.entries().next().value;
      assert.ok(next, "a scheduled timer must be available");
      const [id, timer] = next;
      pending.delete(id);
      timer.callback();
      return timer.delay;
    }
  };
}

(async () => {
  const shared = await import("../shared/workspace-session.js");
  const { createWorkspaceSessionStore } = await import("../app/workspace/session-store.js");
  const {
    DEFAULT_WORKSPACE_SESSION_GENERATION,
    WORKSPACE_SESSION_GENERATION_KEY,
    WORKSPACE_SESSION_PAGE_KEY,
    WORKSPACE_SESSION_STORAGE_VERSION,
    workspaceSessionBindingKey,
    workspaceSessionIdFromUrl,
    workspaceSessionMirrorKey,
    workspaceSessionOpeningClaimIdFromUrl,
    workspaceSessionOpeningClaimUrl,
    workspaceSessionUrl,
    workspaceSessionWorkspaceKey
  } = shared;
  const generation = "generation-stable";

  // The options surface uses the workspace UI as a settings host, but it must
  // never claim, persist, or acquire an id for a recoverable workspace page.
  {
    const context = pageContext(`chrome-extension://chatclub/options.html#workspace=page-${"z".repeat(12)}`);
    const page = memorySessionStorage({ [WORKSPACE_SESSION_PAGE_KEY]: "untouched" });
    const calls = [];
    const store = createWorkspaceSessionStore({
      disabled: true,
      sessionStorage: page,
      location: context.location,
      history: context.history,
      currentTab: async () => { calls.push("tab"); return { id: 77 }; },
      claimWorkspaceSession: async () => { calls.push("claim"); throw new Error("must not claim"); },
      persistWorkspaceSession: async () => { calls.push("persist"); throw new Error("must not persist"); },
      storageGet: async () => { calls.push("get"); throw new Error("must not read"); },
      storageRemove: async () => { calls.push("remove"); throw new Error("must not remove"); }
    });
    assert.equal(await store.load(), null);
    assert.equal(await store.save(snapshot("options")), true);
    assert.equal(await store.clear(), true);
    assert.equal(await store.flush(), true);
    assert.equal(store.workspaceId(), "");
    assert.equal(store.adopt(`page-${"y".repeat(12)}`), "");
    assert.equal(store.generation(), DEFAULT_WORKSPACE_SESSION_GENERATION);
    assert.deepEqual(calls, []);
    assert.equal(context.history.calls.length, 0);
    assert.equal(page.value(WORKSPACE_SESSION_PAGE_KEY), "untouched");
  }

  function dependencies(local, page, context, options = {}) {
    const defaultPersist = async ({ workspaceId, snapshot: persistedSnapshot, clear = false }) => {
      let value = typeof options.currentTab === "function" ? await options.currentTab() : options.currentTab;
      if (!value) value = typeof options.currentTabId === "function" ? await options.currentTabId() : options.currentTabId;
      const tabId = Number(value?.id ?? value?.tabId ?? value);
      if (!Number.isSafeInteger(tabId) || tabId < 1) return { persisted: false, workspaceId, workspaceSessionGeneration: generation };
      if (clear) {
        await local.remove(workspaceSessionWorkspaceKey(workspaceId));
        await local.remove(workspaceSessionBindingKey(tabId));
        await local.remove(workspaceSessionMirrorKey(tabId));
        return { persisted: true, cleared: true, workspaceId, workspaceSessionGeneration: generation };
      }
      const owner = {
        tabId,
        windowId: Number.isInteger(value?.windowId) ? value.windowId : null,
        index: Number.isInteger(value?.index) ? value.index : null,
        pinned: value?.pinned === true
      };
      await local.set(workspaceSessionWorkspaceKey(workspaceId), {
        storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
        generation,
        workspaceId,
        snapshot: persistedSnapshot,
        owner,
        updatedAt: 1,
        detach: null,
        detachedAt: null,
        detachedKind: "",
        detachedRuntimeId: "",
        resolution: "",
        closedBy: ""
      });
      await local.set(workspaceSessionBindingKey(tabId), {
        storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
        generation,
        workspaceId,
        ...owner,
        updatedAt: 1,
        detachedAt: null
      });
      return { persisted: true, workspaceId, workspaceSessionGeneration: generation };
    };
    return {
      sessionStorage: page,
      location: context.location,
      history: context.history,
      storageGet: local.get,
      storageRemove: local.remove,
      persistWorkspaceSession: defaultPersist,
      ...options
    };
  }

  // A normal refresh restores from the page envelope and explicitly registers
  // the tokenized document with the background recovery coordinator.
  {
    const workspaceId = `page-${"a".repeat(12)}`;
    const context = pageContext();
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 101, windowId: 7, index: 3, pinned: false }),
      claimWorkspaceSession: async () => { claims += 1; return { success: true, claimed: false }; },
      createWorkspaceId: () => workspaceId,
      now: () => 1000
    }));
    assert.equal(await store.load(), null);
    assert.equal(claims, 1, "only the initially naked page may ask the recovery queue");
    assert.equal(workspaceSessionIdFromUrl(context.location.href), workspaceId);
    assert.equal(context.history.calls.length, 1, "the workspace id must enter the URL without a reload");
    await store.save(snapshot("refresh"));
    await store.flush();
    const pageRecord = JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY));
    assert.equal(pageRecord.workspaceId, workspaceId);
    assert.equal(pageRecord.snapshot.marker, "refresh");
    assert.deepEqual(local.value(workspaceSessionWorkspaceKey(workspaceId)).owner, {
      tabId: 101,
      windowId: 7,
      index: 3,
      pinned: false
    });

    const refreshed = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 101, windowId: 7, index: 3 }),
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        claims += 1;
        assert.equal(requestedWorkspaceId, workspaceId);
        return {
          success: true,
          claimed: true,
          forked: false,
          workspaceId,
          workspaceSessionGeneration: generation
        };
      }
    }));
    assert.equal((await refreshed.load()).marker, "refresh");
    assert.equal(claims, 2, "a tokenized ordinary refresh must register its workspace token");
  }

  // The URL token, not browser tab id, owns the durable mirror.
  {
    const workspaceId = `page-${"b".repeat(12)}`;
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const page = memorySessionStorage();
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [workspaceSessionWorkspaceKey(workspaceId)]: {
        storageVersion: 1,
        generation,
        workspaceId,
        snapshot: snapshot("changed-tab", generation),
        owner: { tabId: 111, windowId: 8, index: 1, pinned: false },
        updatedAt: 100,
        detachedAt: null
      }
    });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 222, windowId: 8, index: 2, pinned: false }),
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        claims += 1;
        assert.equal(requestedWorkspaceId, workspaceId);
        return {
          claimed: true,
          forked: false,
          workspaceId,
          workspaceSessionGeneration: generation
        };
      },
      now: () => 200
    }));
    const restored = await store.load();
    assert.equal(restored.marker, "changed-tab");
    assert.equal(claims, 1, "a tokenized page must register before using its durable mirror");
    await store.save(restored);
    await store.flush();
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).owner.tabId, 222);
    assert.equal(local.value(workspaceSessionBindingKey(222)).workspaceId, workspaceId);
  }

  // A tokenized page with no mirror registers itself but does not adopt another
  // page's pending update recovery.
  {
    const workspaceId = `page-${"c".repeat(12)}`;
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTabId: async () => 303,
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        claims += 1;
        assert.equal(requestedWorkspaceId, workspaceId);
        return {
          claimed: true,
          forked: false,
          workspaceId,
          workspaceSessionGeneration: generation
        };
      }
    }));
    assert.equal(await store.load(), null);
    assert.equal(store.workspaceId(), workspaceId);
    assert.equal(claims, 1);
  }

  // A fresh token must reject both same-origin sessionStorage cloned from
  // another workspace and a non-fork claim that returns a mismatched id.
  {
    const oldWorkspaceId = `page-${"m".repeat(12)}`;
    const freshWorkspaceId = `page-${"n".repeat(12)}`;
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", freshWorkspaceId));
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("cloned-old-page", generation), oldWorkspaceId)
    });
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [workspaceSessionWorkspaceKey(freshWorkspaceId)]: {
        storageVersion: 1,
        generation,
        workspaceId: freshWorkspaceId,
        snapshot: snapshot("fresh-stable", generation)
      }
    });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 304,
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        claims += 1;
        assert.equal(requestedWorkspaceId, freshWorkspaceId);
        return {
          claimed: true,
          forked: false,
          workspaceId: oldWorkspaceId,
          workspaceSessionGeneration: generation,
          snapshot: snapshot("wrong-claim-snapshot", generation)
        };
      }
    }));
    await assert.rejects(store.load(), /mismatched id/);
    assert.equal(claims, 1);
    assert.equal(store.workspaceId(), freshWorkspaceId);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), freshWorkspaceId);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).workspaceId, oldWorkspaceId);
    assert.equal(local.calls.get.includes(workspaceSessionWorkspaceKey(oldWorkspaceId)), false);
    assert.equal(local.calls.get.includes(workspaceSessionWorkspaceKey(freshWorkspaceId)), false);
  }

  // A tokenized page fails closed when ownership coordination is unavailable
  // or malformed, so it cannot overwrite a duplicate's stable record.
  for (const [label, claimWorkspaceSession, expected] of [
    ["throw", async () => { throw new Error("background unavailable"); }, /ownership could not be claimed/],
    ["rejected", async () => ({ claimed: false }), /claim was rejected/],
    ["malformed", async () => ({ claimed: true, workspaceId: "bad" }), /invalid id/]
  ]) {
    const workspaceId = `page-${label.padEnd(12, "x")}`;
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [stableKey]: { generation, workspaceId, snapshot: snapshot(label, generation) }
    });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      claimWorkspaceSession
    }));
    await assert.rejects(store.load(), expected);
    assert.equal(local.calls.get.includes(stableKey), false);
    assert.equal(local.calls.set.length, 0);
  }

  // Load-time ownership claims are bounded once and fail closed. A timed-out
  // claim is not automatically repeated because its lease outcome is unknown.
  for (const [label, context, page, currentTabId, expected] of [
    [
      "tokenized",
      pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", "page-claimtimeout1")),
      memorySessionStorage(),
      null,
      /ownership could not be claimed/
    ],
    ["naked", pageContext(), memorySessionStorage(), null, /recovery could not be claimed/],
    [
      "legacy",
      pageContext(),
      memorySessionStorage({
        [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("claim-timeout", generation))
      }),
      async () => 777,
      /legacy ownership could not be claimed/
    ]
  ]) {
    let claimCalls = 0;
    const store = createWorkspaceSessionStore(dependencies(
      memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation }),
      page,
      context,
      {
        currentTabId,
        requestTimeoutMs: 1,
        claimWorkspaceSession: async () => {
          claimCalls += 1;
          return new Promise(() => {});
        }
      }
    ));
    await assert.rejects(store.load(), expected, `${label} claim must time out into load failure`);
    assert.equal(claimCalls, 1, `${label} claim timeout must not be retried`);
  }

  // Both current-tab lookup capabilities receive their own deadline. If no
  // exact tab identity resolves, legacy migration fails instead of hanging.
  {
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("tab-timeout", generation))
    });
    let currentTabCalls = 0;
    let currentTabIdCalls = 0;
    let claimCalls = 0;
    const store = createWorkspaceSessionStore(dependencies(
      memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation }),
      page,
      pageContext(),
      {
        requestTimeoutMs: 1,
        currentTab: async () => {
          currentTabCalls += 1;
          return new Promise(() => {});
        },
        currentTabId: async () => {
          currentTabIdCalls += 1;
          return new Promise(() => {});
        },
        claimWorkspaceSession: async () => {
          claimCalls += 1;
          return { claimed: false };
        }
      }
    ));
    await assert.rejects(store.load(), /current browser tab could not be resolved/);
    assert.equal(currentTabCalls, 1);
    assert.equal(currentTabIdCalls, 1);
    assert.equal(claimCalls, 0, "legacy ownership must not be guessed after tab lookup timeout");
  }

  // A naked page asks the background first, then falls back to its exact tab-id
  // mirror under the same deterministic id. The mirror is removed only after
  // stable snapshot and binding writes succeed.
  {
    const workspaceId = "page-legacy-tab-404";
    const legacyKey = workspaceSessionMirrorKey(404);
    const context = pageContext();
    const page = memorySessionStorage();
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [legacyKey]: { generation, snapshot: snapshot("legacy", generation) }
    });
    let claims = 0;
    const events = [];
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 404,
      claimWorkspaceSession: async () => {
        claims += 1;
        events.push("claim");
        return { claimed: false };
      },
      storageGet: async (key) => {
        if (key === legacyKey) events.push("legacy-read");
        return local.get(key);
      },
      now: () => 400
    }));
    const restored = await store.load();
    assert.equal(restored.marker, "legacy");
    assert.equal(claims, 1, "the exact background claim must precede direct legacy fallback");
    assert.deepEqual(events.slice(0, 2), ["claim", "legacy-read"]);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), workspaceId);
    assert.equal(local.value(legacyKey), undefined);
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).snapshot.marker, "legacy");
    assert.equal(local.value(workspaceSessionBindingKey(404)).workspaceId, workspaceId);
    await store.save(restored);
    await store.flush();
  }

  // An old page envelope without a workspace id claims the shared deterministic
  // legacy id for its exact tab. Its page snapshot remains authoritative.
  {
    const workspaceId = "page-legacy-tab-505";
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("old-page", generation))
    });
    const context = pageContext();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let claims = 0;
    let commits = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 505,
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        claims += 1;
        assert.equal(requestedWorkspaceId, workspaceId);
        return {
          claimed: true,
          recovered: true,
          forked: false,
          claimId: "claim-legacy-page-505",
          workspaceId,
          workspaceSessionGeneration: generation,
          snapshot: snapshot("older-background-copy", generation)
        };
      },
      commitWorkspaceSession: async ({ workspaceId: committedWorkspaceId, claimId }) => {
        commits += 1;
        assert.equal(committedWorkspaceId, workspaceId);
        assert.equal(claimId, "claim-legacy-page-505");
        assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).snapshot.marker, "old-page");
        return { committed: true };
      }
    }));
    assert.equal((await store.load()).marker, "old-page");
    assert.equal(claims, 1);
    assert.equal(commits, 1);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).workspaceId, workspaceId);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), workspaceId);
    assert.equal(
      local.value(workspaceSessionWorkspaceKey(workspaceId)).snapshot.marker,
      "old-page",
      "a winning page-session snapshot must be durable before load resolves"
    );
  }

  // A naked page must not turn a failed or malformed coordinator response into
  // a fresh random workspace while its exact legacy mirror is still durable.
  for (const [label, claimWorkspaceSession, expected] of [
    ["throw", async () => { throw new Error("background unavailable"); }, /recovery could not be claimed/],
    ["missing", async () => null, /invalid response/],
    ["invalid-flag", async () => ({ claimed: "yes" }), /invalid response/],
    ["invalid-id", async () => ({ claimed: true, workspaceId: "bad" }), /invalid id/],
    ["missing-lease", async () => ({
      claimed: true,
      recovered: true,
      workspaceId: "page-nakedfailure1",
      workspaceSessionGeneration: generation,
      snapshot: snapshot("uncommitted", generation)
    }), /no lease id/]
  ]) {
    const legacyKey = workspaceSessionMirrorKey(506);
    const legacy = { generation, snapshot: snapshot(`naked-${label}`, generation) };
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [legacyKey]: legacy
    });
    const context = pageContext();
    let freshIds = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTabId: async () => 506,
      claimWorkspaceSession,
      createWorkspaceId: () => { freshIds += 1; return "page-should-not-win1"; }
    }));

    await assert.rejects(store.load(), expected);
    assert.deepEqual(local.value(legacyKey), legacy, `${label} must preserve the exact legacy source`);
    assert.equal(freshIds, 0, `${label} must not allocate a competing workspace id`);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), "");
  }

  // A legacy page envelope also fails closed if its exact deterministic claim
  // is rejected; generic same-window recovery must not replace its page data.
  {
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("legacy-page-fail", generation))
    });
    const context = pageContext();
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 507,
      claimWorkspaceSession: async ({ workspaceId }) => {
        assert.equal(workspaceId, "page-legacy-tab-507");
        return { claimed: false };
      }
    }));

    await assert.rejects(store.load(), /legacy ownership claim was rejected/);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).snapshot.marker, "legacy-page-fail");
    assert.equal(workspaceSessionIdFromUrl(context.location.href), "");
    assert.equal(local.calls.set.length, 0);
  }

  // Failure to read the direct legacy fallback is not equivalent to an absent
  // mirror and must not create an empty competing workspace.
  {
    const legacyKey = workspaceSessionMirrorKey(508);
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [legacyKey]: { generation, snapshot: snapshot("legacy-read-fail", generation) }
    });
    const context = pageContext();
    let legacyReadAttempts = 0;
    let freshIds = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTabId: async () => 508,
      claimWorkspaceSession: async () => ({ claimed: false }),
      storageGet: async (key) => {
        if (key === legacyKey) {
          legacyReadAttempts += 1;
          throw new Error("legacy read unavailable");
        }
        return local.get(key);
      },
      createWorkspaceId: () => { freshIds += 1; return "page-should-not-win2"; }
    }));

    await assert.rejects(store.load(), /legacy read unavailable/);
    assert.equal(legacyReadAttempts, 3);
    assert.equal(freshIds, 0);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), "");
    assert.equal(local.value(legacyKey).snapshot.marker, "legacy-read-fail");
  }

  // A page-session snapshot may not be returned as ready when its early
  // background persistence repeatedly fails.
  {
    const workspaceId = "page-earlypersist1";
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("early-persist", generation), workspaceId)
    });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let attempts = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      claimWorkspaceSession: async () => ({
        claimed: true,
        forked: false,
        workspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async () => {
        attempts += 1;
        throw new Error("early persistence unavailable");
      }
    }));
    await assert.rejects(store.load(), /page snapshot could not be persisted/);
    assert.equal(attempts, 3);
  }

  // Early page-envelope persistence participates in the same write chain, so
  // flush cannot report clean while load's durable mutation is still pending.
  {
    const workspaceId = "page-loadflush123";
    const loadedSnapshot = snapshot("load-flush", generation);
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, loadedSnapshot, workspaceId)
    });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const persistStarted = deferredPromise();
    const releasePersist = deferredPromise();
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      requestTimeoutMs: 20,
      claimWorkspaceSession: async () => ({
        claimed: true,
        forked: false,
        workspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async ({ workspaceId: persistedId }) => {
        persistStarted.resolve();
        await releasePersist.promise;
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      }
    }));

    const loadResult = store.load();
    await persistStarted.promise;
    let flushSettled = false;
    const flushResult = store.flush().then((clean) => {
      flushSettled = true;
      return clean;
    });
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    assert.equal(flushSettled, false);
    releasePersist.resolve();
    assert.equal((await loadResult).marker, "load-flush");
    assert.equal(await flushResult, true);
  }

  // A naked Arc/Favorite replacement claims once, adopts the returned token,
  // and persists plus commits before load exposes the recovered snapshot.
  {
    const workspaceId = `page-${"f".repeat(12)}`;
    const context = pageContext();
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const events = [];
    const recovered = snapshot("claimed", generation);
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 606, windowId: 12, index: 4, pinned: true }),
      claimWorkspaceSession: async () => {
        events.push("claim");
        return {
          success: true,
          claimed: true,
          recovered: true,
          claimId: "claim-606606606606",
          workspaceId,
          workspaceSessionGeneration: generation,
          snapshot: recovered
        };
      },
      commitWorkspaceSession: async ({ workspaceId: committedId, claimId }) => {
        events.push(`commit:${local.value(workspaceSessionWorkspaceKey(workspaceId))?.snapshot?.marker}:${local.value(workspaceSessionBindingKey(606))?.workspaceId}`);
        assert.equal(committedId, workspaceId);
        assert.equal(claimId, "claim-606606606606");
        return { success: true, committed: true };
      },
      now: () => 600
    }));
    assert.equal((await store.load()).marker, "claimed");
    assert.equal(workspaceSessionIdFromUrl(context.location.href), workspaceId);
    assert.deepEqual(events, ["claim", `commit:claimed:${workspaceId}`]);
    await store.save(recovered);
    await store.flush();
    assert.deepEqual(events, ["claim", `commit:claimed:${workspaceId}`]);
  }

  // A restore-opening lease is returned only from the exact URL that carries
  // it, and the one-time token is removed after ownership is accepted.
  {
    const workspaceId = "page-openingclaim12";
    const openingClaimId = "claim-openingclaim12";
    const recovered = snapshot("opening-claim", generation);
    const openingUrl = workspaceSessionOpeningClaimUrl(
      workspaceSessionUrl("chrome-extension://chatclub/chatClub.html#panel=workspace", workspaceId),
      openingClaimId
    );
    const context = pageContext(openingUrl);
    const store = createWorkspaceSessionStore(dependencies(
      memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation }),
      memorySessionStorage(),
      context,
      {
        claimWorkspaceSession: async (request) => {
          assert.deepEqual(request, { workspaceId, openingClaimId });
          return {
            claimed: true,
            recovered: true,
            forked: false,
            claimId: openingClaimId,
            workspaceId,
            workspaceSessionGeneration: generation,
            snapshot: recovered
          };
        }
      }
    ));
    assert.equal((await store.load()).marker, "opening-claim");
    assert.equal(workspaceSessionOpeningClaimIdFromUrl(context.location.href), "");
    assert.equal(workspaceSessionIdFromUrl(context.location.href), workspaceId);
    assert.equal(new URLSearchParams(new URL(context.location.href).hash.slice(1)).get("panel"), "workspace");
  }

  // A failed opening claim retains its URL token so the failure shell can
  // retry the same durable lease without guessing or opening another tab.
  {
    const workspaceId = "page-openingretry12";
    const openingClaimId = "claim-openingretry12";
    const openingUrl = workspaceSessionOpeningClaimUrl(
      workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId),
      openingClaimId
    );
    const context = pageContext(openingUrl);
    const store = createWorkspaceSessionStore(dependencies(
      memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation }),
      memorySessionStorage(),
      context,
      {
        openingClaimRequestTimeoutMs: 50,
        claimWorkspaceSession: async () => { throw new Error("synthetic opening claim failure"); }
      }
    ));
    await assert.rejects(store.load(), /ownership could not be claimed/);
    assert.equal(workspaceSessionOpeningClaimIdFromUrl(context.location.href), openingClaimId);
  }

  // A recovered tokenized claim without an exact lease cannot be hydrated.
  {
    const workspaceId = "page-token-nolease-1234";
    const recovered = snapshot("tokenized-no-lease", generation);
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const store = createWorkspaceSessionStore(dependencies(
      memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation }),
      memorySessionStorage(),
      context,
      {
        claimWorkspaceSession: async () => ({
          claimed: true,
          recovered: true,
          forked: false,
          claimId: "",
          workspaceId,
          workspaceSessionGeneration: generation,
          snapshot: recovered
        })
      }
    ));
    await assert.rejects(store.load(), /ownership claim returned no lease id/);
  }

  // A tokenized recovery claim is committed only after the recovered snapshot
  // and replacement-tab binding have both reached durable storage.
  {
    const workspaceId = "page-tokenclaim12";
    const claimId = "claim-tokenized-recovery";
    const recovered = snapshot("tokenized-recovery", generation);
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const events = [];
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 607, windowId: 12, index: 5, pinned: false }),
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        events.push("claim");
        assert.equal(requestedWorkspaceId, workspaceId);
        return {
          claimed: true,
          recovered: true,
          forked: false,
          claimId,
          workspaceId,
          workspaceSessionGeneration: generation,
          snapshot: recovered
        };
      },
      commitWorkspaceSession: async (request) => {
        events.push("commit");
        assert.deepEqual(request, { workspaceId, claimId });
        assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).snapshot.marker, "tokenized-recovery");
        assert.equal(local.value(workspaceSessionBindingKey(607)).workspaceId, workspaceId);
        return { committed: true };
      }
    }));

    assert.equal((await store.load()).marker, "tokenized-recovery");
    assert.deepEqual(events, ["claim"], "claim ownership must remain pending until a durable save");
    assert.equal(await store.save(recovered), true);
    await store.flush();
    assert.deepEqual(events, ["claim", "commit"]);
  }

  // A fork response adopts the background-assigned workspace id while copying
  // the source document's page snapshot rather than the coordinator fallback.
  {
    const sourceWorkspaceId = "page-forksource12";
    const forkWorkspaceId = "page-forktarget12";
    const claimId = "claim-tokenized-fork";
    const pageSnapshot = snapshot("fork-page-snapshot", generation);
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, pageSnapshot, sourceWorkspaceId)
    });
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", sourceWorkspaceId));
    let commits = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 608, windowId: 12, index: 6, pinned: false }),
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        assert.equal(requestedWorkspaceId, sourceWorkspaceId);
        return {
          claimed: true,
          forked: true,
          claimId,
          workspaceId: forkWorkspaceId,
          workspaceSessionGeneration: generation,
          snapshot: snapshot("background-fork-fallback", generation)
        };
      },
      commitWorkspaceSession: async (request) => {
        commits += 1;
        assert.deepEqual(request, { workspaceId: forkWorkspaceId, claimId });
        assert.equal(local.value(workspaceSessionWorkspaceKey(forkWorkspaceId)).snapshot.marker, "fork-page-snapshot");
        assert.equal(local.value(workspaceSessionBindingKey(608)).workspaceId, forkWorkspaceId);
        return { committed: true };
      }
    }));

    const restored = await store.load();
    assert.equal(restored.marker, "fork-page-snapshot");
    assert.equal(store.workspaceId(), forkWorkspaceId);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), forkWorkspaceId);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).workspaceId, forkWorkspaceId);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).snapshot.marker, "fork-page-snapshot");
    assert.equal(await store.save(restored), true);
    await store.flush();
    assert.equal(commits, 1);
    assert.equal(local.value(workspaceSessionWorkspaceKey(sourceWorkspaceId)), undefined);
  }

  // If an opening lease expires after the snapshot and binding are durable,
  // save reclaims that exact workspace once and commits the replacement lease.
  {
    const workspaceId = "page-reclaimlease12";
    const recovered = snapshot("reclaimed-lease", generation);
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const events = [];
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 610, windowId: 12, index: 8, pinned: false }),
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => {
        claims += 1;
        events.push(`claim:${claims}`);
        assert.equal(requestedWorkspaceId, workspaceId);
        return {
          claimed: true,
          recovered: true,
          forked: false,
          claimId: claims === 1 ? "claim-expired-lease" : "claim-rearmed-lease",
          workspaceId,
          workspaceSessionGeneration: generation,
          snapshot: recovered
        };
      },
      commitWorkspaceSession: async ({ claimId }) => {
        events.push(`commit:${claimId}`);
        if (claimId === "claim-expired-lease") throw new Error("recovery claim is stale");
        assert.equal(claimId, "claim-rearmed-lease");
        return { committed: true };
      }
    }));

    assert.equal((await store.load()).marker, "reclaimed-lease");
    assert.equal(await store.save(recovered), true);
    await store.flush();
    assert.deepEqual(events, [
      "claim:1",
      "commit:claim-expired-lease",
      "claim:2",
      "commit:claim-rearmed-lease"
    ]);
  }

  // A stale lease reclaim must not be accepted as resolved when the background
  // still reports recovery ownership but omits the replacement lease id.
  {
    const workspaceId = "page-reclaim-nolease-1234";
    const recovered = snapshot("reclaim-no-lease", generation);
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTab: async () => ({ id: 611, windowId: 12, index: 9, pinned: false }),
      claimWorkspaceSession: async () => {
        claims += 1;
        return {
          claimed: true,
          recovered: true,
          forked: false,
          claimId: claims === 1 ? "claim-expired-no-lease" : "",
          workspaceId,
          workspaceSessionGeneration: generation,
          snapshot: recovered
        };
      },
      commitWorkspaceSession: async () => ({ committed: false })
    }));
    assert.equal((await store.load()).marker, "reclaim-no-lease");
    assert.equal(await store.save(recovered), false);
    assert.equal(await store.flush(), false);
    assert.equal(claims, 3, "flush performs one bounded reclaim attempt and reports the still-dirty lease");
  }

  // Transient storage failures are retried up to the bounded attempt limit for
  // both reads and durable writes.
  {
    const workspaceId = "page-retrytest123";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const bindingKey = workspaceSessionBindingKey(609);
    const persisted = snapshot("retry-restored", generation);
    const page = memorySessionStorage();
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [stableKey]: {
        storageVersion: 1,
        generation,
        workspaceId,
        snapshot: persisted
      }
    });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const getAttempts = new Map();
    let persistAttempts = 0;
    const storageGet = async (key) => {
      const attempt = (getAttempts.get(key) || 0) + 1;
      getAttempts.set(key, attempt);
      if (attempt < 3) throw new Error(`transient get ${key}`);
      return local.get(key);
    };
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 609, windowId: 12, index: 7, pinned: false }),
      storageGet,
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot }) => {
        persistAttempts += 1;
        if (persistAttempts < 3) throw new Error("transient background persistence");
        await local.set(stableKey, {
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId: persistedId,
          snapshot: nextSnapshot,
          owner: { tabId: 609, windowId: 12, index: 7, pinned: false }
        });
        await local.set(bindingKey, { generation, workspaceId: persistedId, tabId: 609 });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      },
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId
      })
    }));

    assert.equal((await store.load()).marker, "retry-restored");
    assert.equal(getAttempts.get(WORKSPACE_SESSION_GENERATION_KEY), 3);
    assert.equal(getAttempts.get(stableKey), 3);
    assert.equal(await store.save(snapshot("retry-saved", generation)), true);
    await store.flush();
    assert.equal(persistAttempts, 3);
    assert.equal(local.value(stableKey).snapshot.marker, "retry-saved");
    assert.equal(local.value(bindingKey).workspaceId, workspaceId);
  }

  // Page saves have one durable writer: the background persistence request.
  // Even if a direct storageSet capability is accidentally supplied, save must
  // never use it to construct stable records or bindings itself.
  {
    const workspaceId = "page-singlewriter1";
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let persistCalls = 0;
    let directSetCalls = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 610, windowId: 12, index: 8, pinned: false }),
      storageSet: async () => { directSetCalls += 1; },
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot }) => {
        persistCalls += 1;
        assert.equal(persistedId, workspaceId);
        assert.equal(nextSnapshot.marker, "single-writer-save");
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      },
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId
      })
    }));

    await store.load();
    assert.equal(await store.save(snapshot("single-writer-save", generation)), true);
    await store.flush();
    assert.equal(persistCalls, 1);
    assert.equal(directSetCalls, 0, "page save must not bypass the background single writer");
    assert.equal(local.calls.set.length, 0, "page save must not write stable local-storage records directly");
  }

  // A background persistence failure is bounded to three attempts and remains
  // visible to bootstrap as a failed save before its deferred retry.
  {
    const workspaceId = "page-persistfail12";
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const timers = manualTimers();
    let persistAttempts = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 611, windowId: 12, index: 9, pinned: false }),
      persistWorkspaceSession: async () => {
        persistAttempts += 1;
        throw new Error("persistent background persistence failure");
      },
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
      retryDelaysMs: [60_000],
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId
      })
    }));

    await store.load();
    assert.equal(await store.save(snapshot("persist-failed", generation)), false);
    assert.equal(timers.pendingCount(), 1);
    assert.equal(await store.flush(), false, "a bounded flush must report that the latest state is still dirty");
    assert.equal(persistAttempts, 6, "save and forced flush must each keep a bounded immediate attempt budget");
    assert.equal(timers.pendingCount(), 1, "failed flush must leave the capped automatic retry armed");
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)), undefined);
    assert.equal(local.value(workspaceSessionBindingKey(611)), undefined);
  }

  // A timed-out-looking mutation remains the single writer until it actually
  // settles; only then may the coalesced latest snapshot become durable.
  {
    const workspaceId = "page-hungpersist12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const page = memorySessionStorage();
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const writes = [];
    const hungWriteStarted = deferredPromise();
    const releaseHungWrite = deferredPromise();
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTab: async () => ({ id: 612, windowId: 12, index: 10, pinned: false }),
      requestTimeoutMs: 20,
      retryDelaysMs: [60_000],
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot }) => {
        writes.push(nextSnapshot.marker);
        if (nextSnapshot.marker === "hung-old") {
          hungWriteStarted.resolve();
          await releaseHungWrite.promise;
        }
        await local.set(stableKey, {
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId: persistedId,
          snapshot: nextSnapshot,
          owner: { tabId: 612, windowId: 12, index: 10, pinned: false }
        });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      },
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId
      })
    }));

    await store.load();
    const oldSave = store.save(snapshot("hung-old", generation));
    await hungWriteStarted.promise;
    const latestSave = store.save(snapshot("after-hang", generation));
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    assert.deepEqual(writes, ["hung-old"], "the newer mutation must remain queued past the page request deadline");
    releaseHungWrite.resolve();
    assert.equal(await oldSave, false);
    assert.equal(await latestSave, true);
    assert.equal(await store.flush(), true);
    assert.deepEqual(writes, ["hung-old", "after-hang"]);
    assert.equal(local.value(stableKey).snapshot.marker, "after-hang");
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).snapshot.marker, "after-hang");
  }

  // A clear queued behind an uncertain save runs only after that save settles,
  // so the late save cannot resurrect the workspace after clear succeeds.
  {
    const workspaceId = "page-save-clear12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const page = memorySessionStorage();
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const saveStarted = deferredPromise();
    const releaseSave = deferredPromise();
    const writes = [];
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      requestTimeoutMs: 20,
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot, clear }) => {
        if (clear) {
          writes.push("clear");
          await local.remove(stableKey);
          return { persisted: true, cleared: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
        }
        writes.push(`save:${nextSnapshot.marker}`);
        saveStarted.resolve();
        await releaseSave.promise;
        await local.set(stableKey, { generation, workspaceId: persistedId, snapshot: nextSnapshot });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      }
    }));

    await store.load();
    const saveResult = store.save(snapshot("late-before-clear", generation));
    await saveStarted.promise;
    const clearResult = store.clear();
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    assert.deepEqual(writes, ["save:late-before-clear"]);
    assert.equal(page.value(WORKSPACE_SESSION_PAGE_KEY), null);
    releaseSave.resolve();
    assert.equal(await saveResult, false);
    assert.equal(await clearResult, true);
    assert.equal(await store.flush(), true);
    assert.deepEqual(writes, ["save:late-before-clear", "clear"]);
    assert.equal(local.value(stableKey), undefined);
  }

  // A save queued behind an uncertain clear similarly waits for the clear to
  // settle and then re-establishes the latest snapshot.
  {
    const workspaceId = "page-clear-save12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [stableKey]: { generation, workspaceId, snapshot: snapshot("before-clear", generation) }
    });
    const page = memorySessionStorage();
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const clearStarted = deferredPromise();
    const releaseClear = deferredPromise();
    const writes = [];
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      requestTimeoutMs: 20,
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot, clear }) => {
        if (clear) {
          writes.push("clear");
          clearStarted.resolve();
          await releaseClear.promise;
          await local.remove(stableKey);
          return { persisted: true, cleared: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
        }
        writes.push(`save:${nextSnapshot.marker}`);
        await local.set(stableKey, { generation, workspaceId: persistedId, snapshot: nextSnapshot });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      }
    }));

    assert.equal((await store.load()).marker, "before-clear");
    const clearResult = store.clear();
    await clearStarted.promise;
    const saveResult = store.save(snapshot("after-clear", generation));
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    assert.deepEqual(writes, ["clear"]);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).snapshot.marker, "after-clear");
    releaseClear.resolve();
    assert.equal(await clearResult, false);
    assert.equal(await saveResult, true);
    assert.equal(await store.flush(), true);
    assert.deepEqual(writes, ["clear", "save:after-clear"]);
    assert.equal(local.value(stableKey).snapshot.marker, "after-clear");
  }

  // Once the immediate attempt budget is exhausted, the latest dirty snapshot
  // retries automatically and succeeds without requiring another UI mutation.
  {
    const workspaceId = "page-dirtyretry12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    let attempts = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTab: async () => ({ id: 613, windowId: 12, index: 11, pinned: false }),
      requestTimeoutMs: 20,
      retryDelaysMs: [5],
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot }) => {
        attempts += 1;
        if (attempts <= 3) throw new Error("transient retry batch failure");
        await local.set(stableKey, {
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId: persistedId,
          snapshot: nextSnapshot,
          owner: { tabId: 613, windowId: 12, index: 11, pinned: false }
        });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      },
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId
      })
    }));

    await store.load();
    assert.equal(await store.save(snapshot("automatic-retry", generation)), false);
    const deadline = Date.now() + 500;
    while (local.value(stableKey)?.snapshot?.marker !== "automatic-retry" && Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    await store.flush();
    assert.equal(attempts, 4);
    assert.equal(local.value(stableKey).snapshot.marker, "automatic-retry");
  }

  // flush cancels a scheduled delay and performs exactly one additional
  // bounded dirty-state drain, reporting whether that drain made storage clean.
  {
    const workspaceId = "page-flushdirty12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const timers = manualTimers();
    let attempts = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
      retryDelaysMs: [20_000],
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot }) => {
        attempts += 1;
        if (attempts <= 3) throw new Error("initial flush batch unavailable");
        await local.set(stableKey, { generation, workspaceId: persistedId, snapshot: nextSnapshot });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      }
    }));

    await store.load();
    assert.equal(await store.save(snapshot("flush-now", generation)), false);
    assert.equal(timers.pendingCount(), 1);
    assert.equal(await store.flush(), true);
    assert.equal(attempts, 4, "flush must start immediately rather than wait for the 20-second timer");
    assert.equal(timers.pendingCount(), 0);
    assert.equal(local.value(stableKey).snapshot.marker, "flush-now");
  }

  // Clear accepts only an explicit cleared acknowledgement. A malformed
  // success remains dirty and retries automatically until clear is confirmed.
  {
    const workspaceId = "page-clearretry12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [stableKey]: { generation, workspaceId, snapshot: snapshot("clear-retry", generation) }
    });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const timers = manualTimers();
    let clearAttempts = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
      retryDelaysMs: [20_000],
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async ({ workspaceId: persistedId, clear }) => {
        assert.equal(clear, true);
        clearAttempts += 1;
        if (clearAttempts <= 3) {
          return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
        }
        await local.remove(stableKey);
        return { persisted: true, cleared: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      }
    }));

    assert.equal((await store.load()).marker, "clear-retry");
    assert.equal(await store.clear(), false);
    assert.equal(clearAttempts, 3);
    assert.equal(local.value(stableKey).snapshot.marker, "clear-retry");
    assert.equal(timers.pendingCount(), 1);
    assert.equal(timers.runNext(), 20_000);
    assert.equal(await store.flush(), true);
    assert.equal(clearAttempts, 4);
    assert.equal(local.value(stableKey), undefined);
    assert.equal(timers.pendingCount(), 0);
  }

  // A later save supersedes a failed clear retry and retains the pending
  // recovery claim until the replacement snapshot is durably committed.
  {
    const workspaceId = "page-clearsupersede1";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const recovered = snapshot("claimed-before-clear", generation);
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const timers = manualTimers();
    let clearAttempts = 0;
    let commits = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
      retryDelaysMs: [20_000],
      claimWorkspaceSession: async () => ({
        claimed: true,
        recovered: true,
        forked: false,
        claimId: "claim-clear-supersede",
        workspaceId,
        workspaceSessionGeneration: generation,
        snapshot: recovered
      }),
      commitWorkspaceSession: async ({ workspaceId: committedId, claimId }) => {
        commits += 1;
        assert.equal(committedId, workspaceId);
        assert.equal(claimId, "claim-clear-supersede");
        return { committed: true };
      },
      persistWorkspaceSession: async ({ workspaceId: persistedId, snapshot: nextSnapshot, clear }) => {
        if (clear) {
          clearAttempts += 1;
          throw new Error("clear temporarily unavailable");
        }
        await local.set(stableKey, { generation, workspaceId: persistedId, snapshot: nextSnapshot });
        return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
      }
    }));

    assert.equal((await store.load()).marker, "claimed-before-clear");
    assert.equal(await store.clear(), false);
    assert.equal(clearAttempts, 3);
    assert.equal(timers.pendingCount(), 1);
    assert.equal(await store.save(snapshot("save-supersedes-clear", generation)), true);
    assert.equal(timers.pendingCount(), 0, "superseding save must cancel the clear retry timer");
    assert.equal(commits, 1, "failed clear must not discard the pending recovery claim");
    assert.equal(local.value(stableKey).snapshot.marker, "save-supersedes-clear");
  }

  // If the synchronous page envelope cannot be removed, clear never claims
  // success or touches the durable mirror; both automatic retry and flush stay dirty.
  {
    const workspaceId = "page-clearpagefail1";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const storedSnapshot = snapshot("page-remove-failure", generation);
    const page = memorySessionStorage();
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [stableKey]: { generation, workspaceId, snapshot: storedSnapshot }
    });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const timers = manualTimers();
    let persistCalls = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
      retryDelaysMs: [20_000],
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId,
        workspaceSessionGeneration: generation
      }),
      persistWorkspaceSession: async () => {
        persistCalls += 1;
        throw new Error("durable clear must not run");
      }
    }));

    assert.equal((await store.load()).marker, "page-remove-failure");
    page.setItem(WORKSPACE_SESSION_PAGE_KEY, pageEnvelope(generation, storedSnapshot, workspaceId));
    page.removeItem = () => { throw new Error("page session is unavailable"); };
    assert.equal(await store.clear(), false);
    assert.equal(await store.flush(), false);
    assert.equal(persistCalls, 0);
    assert.equal(timers.pendingCount(), 1);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).snapshot.marker, "page-remove-failure");
    assert.equal(local.value(stableKey).snapshot.marker, "page-remove-failure");
  }

  // A persistent durable-record read failure rejects load and must not be
  // misclassified as an empty workspace that writes a default page snapshot.
  {
    const workspaceId = "page-readfailure12";
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    let stableReadAttempts = 0;
    let persistCalls = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      storageGet: async (key) => {
        if (key === WORKSPACE_SESSION_GENERATION_KEY) return generation;
        if (key === stableKey) {
          stableReadAttempts += 1;
          throw new Error("persistent workspace read failure");
        }
        return local.get(key);
      },
      persistWorkspaceSession: async () => {
        persistCalls += 1;
        return { persisted: false, workspaceId, workspaceSessionGeneration: generation };
      },
      claimWorkspaceSession: async ({ workspaceId: requestedWorkspaceId }) => ({
        claimed: true,
        forked: false,
        workspaceId: requestedWorkspaceId
      })
    }));

    await assert.rejects(store.load(), /persistent workspace read failure/);
    assert.equal(stableReadAttempts, 3);
    assert.equal(persistCalls, 0);
    assert.equal(page.value(WORKSPACE_SESSION_PAGE_KEY), null);
    assert.equal(local.value(stableKey), undefined);
  }

  // Separate naked pages get separate fresh ids and never share mirrors.
  {
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    const ids = [`page-${"g".repeat(12)}`, `page-${"h".repeat(12)}`];
    const stores = ids.map((workspaceId, index) => {
      const context = pageContext();
      const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
        currentTabId: async () => 700 + index,
        claimWorkspaceSession: async () => ({ success: true, claimed: false }),
        createWorkspaceId: () => workspaceId
      }));
      return { store, context };
    });
    await Promise.all(stores.map(({ store }) => store.load()));
    await Promise.all(stores.map(({ store }, index) => store.save(snapshot(`isolated-${index}`))));
    await Promise.all(stores.map(({ store }) => store.flush()));
    assert.equal(local.value(workspaceSessionWorkspaceKey(ids[0])).snapshot.marker, "isolated-0");
    assert.equal(local.value(workspaceSessionWorkspaceKey(ids[1])).snapshot.marker, "isolated-1");
    assert.notEqual(workspaceSessionIdFromUrl(stores[0].context.location.href), workspaceSessionIdFromUrl(stores[1].context.location.href));
  }

  // Superseded queued writes may not beat the final logical state.
  {
    const workspaceId = `page-${"i".repeat(12)}`;
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const page = memorySessionStorage();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let releaseFirst;
    let announceFirst;
    const firstStarted = new Promise((resolve) => { announceFirst = resolve; });
    const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
    const writes = [];
    const persistWorkspaceSession = async ({ workspaceId: persistedId, snapshot: nextSnapshot }) => {
      writes.push(nextSnapshot.marker);
      if (nextSnapshot.marker === "first") {
          announceFirst();
          await firstBlocked;
      }
      await local.set(workspaceSessionWorkspaceKey(persistedId), {
        generation,
        workspaceId: persistedId,
        snapshot: nextSnapshot,
        owner: { tabId: 808 }
      });
      await local.set(workspaceSessionBindingKey(808), { generation, workspaceId: persistedId, tabId: 808 });
      return { persisted: true, workspaceId: persistedId, workspaceSessionGeneration: generation };
    };
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 808,
      persistWorkspaceSession
    }));
    await store.load();
    store.save(snapshot("first"));
    await firstStarted;
    store.save(snapshot("second"));
    store.save(snapshot("last"));
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).snapshot.marker, "last");
    releaseFirst();
    await store.flush();
    assert.deepEqual(writes, ["first", "last"]);
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).snapshot.marker, "last");
  }

  // clear removes only this page's stable mirror, binding and legacy key.
  {
    const workspaceId = `page-${"j".repeat(12)}`;
    const otherId = `page-${"k".repeat(12)}`;
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [workspaceSessionWorkspaceKey(workspaceId)]: { generation, workspaceId, snapshot: snapshot("clear") },
      [workspaceSessionBindingKey(909)]: { workspaceId },
      [workspaceSessionMirrorKey(909)]: { generation, snapshot: snapshot("legacy-clear") },
      [workspaceSessionWorkspaceKey(otherId)]: { generation, workspaceId: otherId, snapshot: snapshot("keep") }
    });
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("clear"), workspaceId)
    });
    const store = createWorkspaceSessionStore(dependencies(local, page, context, { currentTabId: async () => 909 }));
    await store.clear();
    await store.flush();
    assert.equal(page.value(WORKSPACE_SESSION_PAGE_KEY), null);
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)), undefined);
    assert.equal(local.value(workspaceSessionBindingKey(909)), undefined);
    assert.equal(local.value(workspaceSessionMirrorKey(909)), undefined);
    assert.equal(local.value(workspaceSessionWorkspaceKey(otherId)).snapshot.marker, "keep");
    assert.equal(local.value(WORKSPACE_SESSION_GENERATION_KEY), generation);
  }

  // Pages never become an authoritative writer for the shared generation.
  {
    const workspaceId = `page-${"l".repeat(12)}`;
    const context = pageContext();
    const local = memoryLocalStorage();
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTabId: async () => 1001,
      claimWorkspaceSession: async () => ({ claimed: false }),
      createWorkspaceId: () => workspaceId
    }));
    await store.load();
    assert.equal(store.generation(), DEFAULT_WORKSPACE_SESSION_GENERATION);
    assert.equal(local.calls.set.some((call) => call.key === WORKSPACE_SESSION_GENERATION_KEY), false);
  }

  console.log("workspace session stable-id store: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
