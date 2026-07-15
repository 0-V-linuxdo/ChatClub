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

(async () => {
  const shared = await import("../shared/workspace-session.js");
  const { createWorkspaceSessionStore } = await import("../app/workspace/session-store.js");
  const {
    DEFAULT_WORKSPACE_SESSION_GENERATION,
    WORKSPACE_SESSION_GENERATION_KEY,
    WORKSPACE_SESSION_PAGE_KEY,
    workspaceSessionBindingKey,
    workspaceSessionIdFromUrl,
    workspaceSessionMirrorKey,
    workspaceSessionUrl,
    workspaceSessionWorkspaceKey
  } = shared;
  const generation = "generation-stable";

  function dependencies(local, page, context, options = {}) {
    return {
      sessionStorage: page,
      location: context.location,
      history: context.history,
      storageGet: local.get,
      storageSet: local.set,
      storageRemove: local.remove,
      ...options
    };
  }

  // A normal refresh restores from the page envelope and never asks the
  // background recovery queue once the URL has a stable token.
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
      claimWorkspaceSession: async () => { claims += 1; return { success: true, claimed: false }; }
    }));
    assert.equal((await refreshed.load()).marker, "refresh");
    assert.equal(claims, 1, "a tokenized ordinary refresh must never claim recovery");
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
      claimWorkspaceSession: async () => { claims += 1; return { claimed: true }; },
      now: () => 200
    }));
    const restored = await store.load();
    assert.equal(restored.marker, "changed-tab");
    assert.equal(claims, 0, "a token URL must never consume a pending recovery candidate");
    await store.save(restored);
    await store.flush();
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).owner.tabId, 222);
    assert.equal(local.value(workspaceSessionBindingKey(222)).workspaceId, workspaceId);
  }

  // A tokenized page with no mirror defaults in place and never claims another
  // page's pending update recovery.
  {
    const workspaceId = `page-${"c".repeat(12)}`;
    const context = pageContext(workspaceSessionUrl("chrome-extension://chatclub/chatClub.html", workspaceId));
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, memorySessionStorage(), context, {
      currentTabId: async () => 303,
      claimWorkspaceSession: async () => { claims += 1; return { claimed: true }; }
    }));
    assert.equal(await store.load(), null);
    assert.equal(store.workspaceId(), workspaceId);
    assert.equal(claims, 0);
  }

  // The first stable build migrates a tab-id mirror, then removes only that
  // legacy source after stable mirror and binding writes succeed.
  {
    const workspaceId = `page-${"d".repeat(12)}`;
    const legacyKey = workspaceSessionMirrorKey(404);
    const context = pageContext();
    const page = memorySessionStorage();
    const local = memoryLocalStorage({
      [WORKSPACE_SESSION_GENERATION_KEY]: generation,
      [legacyKey]: { generation, snapshot: snapshot("legacy", generation) }
    });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 404,
      claimWorkspaceSession: async () => { claims += 1; return { claimed: false }; },
      createWorkspaceId: () => workspaceId,
      now: () => 400
    }));
    const restored = await store.load();
    assert.equal(restored.marker, "legacy");
    assert.equal(claims, 0, "legacy migration precedes naked-page recovery claim");
    await store.save(restored);
    await store.flush();
    assert.equal(local.value(legacyKey), undefined);
    assert.equal(local.value(workspaceSessionWorkspaceKey(workspaceId)).snapshot.marker, "legacy");
    assert.equal(local.value(workspaceSessionBindingKey(404)).workspaceId, workspaceId);
  }

  // Old page envelopes without a workspace id migrate locally and also bypass
  // background claim.
  {
    const workspaceId = `page-${"e".repeat(12)}`;
    const page = memorySessionStorage({
      [WORKSPACE_SESSION_PAGE_KEY]: pageEnvelope(generation, snapshot("old-page", generation))
    });
    const context = pageContext();
    const local = memoryLocalStorage({ [WORKSPACE_SESSION_GENERATION_KEY]: generation });
    let claims = 0;
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 505,
      claimWorkspaceSession: async () => { claims += 1; return { claimed: false }; },
      createWorkspaceId: () => workspaceId
    }));
    assert.equal((await store.load()).marker, "old-page");
    assert.equal(claims, 0);
    assert.equal(JSON.parse(page.value(WORKSPACE_SESSION_PAGE_KEY)).workspaceId, workspaceId);
    assert.equal(workspaceSessionIdFromUrl(context.location.href), workspaceId);
  }

  // A naked Arc/Favorite replacement claims once, adopts the returned token,
  // and commits only after stable mirror plus binding are durable.
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
    assert.deepEqual(events, ["claim"]);
    await store.save(recovered);
    await store.flush();
    assert.deepEqual(events, ["claim", `commit:claimed:${workspaceId}`]);
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
    const storageSet = async (key, value) => {
      if (key === workspaceSessionWorkspaceKey(workspaceId)) {
        writes.push(value.snapshot.marker);
        if (value.snapshot.marker === "first") {
          announceFirst();
          await firstBlocked;
        }
      }
      await local.set(key, value);
    };
    const store = createWorkspaceSessionStore(dependencies(local, page, context, {
      currentTabId: async () => 808,
      storageSet
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
