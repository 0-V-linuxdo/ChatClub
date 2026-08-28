#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { createWorkspaceSessionController } = await import(
    pathToFileURL(path.join(root, "app/workspace/session-controller.js")).href
  );
  const {
    persistWorkspaceSessionSnapshot,
    listLiveWorkspaceTabs,
    listClearedWorkspaceTabs
  } = await import(pathToFileURL(path.join(root, "background/workspace-session.js")).href);
  const shared = await import(pathToFileURL(path.join(root, "shared/workspace-session.js")).href);
  const {
    DEFAULT_WORKSPACE_SESSION_GENERATION,
    WORKSPACE_SESSION_GENERATION_KEY,
    WORKSPACE_SESSION_RECOVERY_KEY,
    WORKSPACE_SESSION_STORAGE_VERSION,
    workspaceSessionBindingKey,
    workspaceSessionWorkspaceKey
  } = shared;

  const previousDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => [] };

  function createStore(initialId) {
    let workspaceId = initialId;
    const saved = [];
    const adopted = [];
    return {
      saved,
      adopted,
      generation: () => "g1",
      workspaceId: () => workspaceId,
      save: async (snapshot) => {
        saved.push(structuredClone(snapshot));
        return true;
      },
      flush: async () => true,
      adopt: (nextId) => {
        adopted.push(nextId);
        workspaceId = nextId;
        return nextId;
      }
    };
  }

  function createController(store, stateOverrides = {}) {
    const state = {
      groups: [{
        id: "g1",
        chatApps: [{ instanceId: "i1", appId: "ChatGPT", initialHref: "https://chatgpt.com/c/thread-1" }]
      }],
      activeTabs: { g1: "i1" },
      options: {},
      topicTitle: "the rational male 系列",
      topicTitleCustom: true,
      fullscreenGroupId: null,
      temporaryLayoutPreset: null,
      ...stateOverrides
    };
    const controller = createWorkspaceSessionController({
      state,
      services: {
        appById: () => ({ id: "ChatGPT", url: "https://chatgpt.com/" }),
        createFrameId: () => "frame-1",
        createGroupId: () => "group-1",
        createLayoutId: () => "layout-1",
        openableTabUrl: (value) => String(value || ""),
        workspaceSessionStore: store
      },
      registry: { frameForInstance: () => null },
      layout: {
        persistentLayoutPresets: () => [{ id: "default" }],
        validChatAppIds: () => ["ChatGPT"]
      }
    });
    return { controller, state };
  }

  {
    const store = createStore("page-oldworkspace1");
    const { controller, state } = createController(store);
    const skipped = await controller.preserveCurrentWorkspaceForNewChat(["https://chatgpt.com/"]);
    assert.deepEqual(skipped, { preserved: false, workspaceId: "page-oldworkspace1" });
    assert.equal(store.adopted.length, 0);
    assert.equal(state.topicTitle, "the rational male 系列");
    assert.equal(state.topicTitleCustom, true);
  }

  {
    const store = createStore("page-oldworkspace1");
    const { controller, state } = createController(store);
    const preserved = await controller.preserveCurrentWorkspaceForNewChat(["https://chatgpt.com/c/thread-1"]);
    assert.equal(preserved.preserved, true);
    assert.equal(preserved.fromWorkspaceId, "page-oldworkspace1");
    assert.match(preserved.workspaceId, /^page-/);
    assert.notEqual(preserved.workspaceId, "page-oldworkspace1");
    assert.equal(store.adopted[0], preserved.workspaceId);
    assert.equal(store.workspaceId(), preserved.workspaceId);
    assert.equal(state.topicTitle, "");
    assert.equal(state.topicTitleCustom, false);
    assert.equal(store.saved[0].topicTitle, "the rational male 系列");
    assert.equal(store.saved[0].groups[0].tabs[0].currentHref, "https://chatgpt.com/c/thread-1");
  }

  {
    const store = createStore("page-oldworkspace1");
    store.flush = async () => false;
    const { controller, state } = createController(store);
    const failed = await controller.preserveCurrentWorkspaceForNewChat(["https://chatgpt.com/c/thread-1"]);
    assert.deepEqual(failed, { preserved: false, workspaceId: "page-oldworkspace1" });
    assert.equal(store.adopted.length, 0);
    assert.equal(state.topicTitleCustom, true);
  }

  globalThis.document = previousDocument;

  function storageArea(initial = {}) {
    const values = structuredClone(initial);
    return {
      values,
      api: {
        async get(key) {
          if (key === null) return structuredClone(values);
          return key in values ? { [key]: structuredClone(values[key]) } : {};
        },
        async set(update) {
          Object.assign(values, structuredClone(update));
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
        }
      }
    };
  }

  function persistFixture({ local = {}, tabs = [] } = {}) {
    const localArea = storageArea(local);
    const liveTabs = tabs.map((tab) => ({ ...tab }));
    const api = {
      runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
      storage: { local: localArea.api, session: storageArea().api },
      alarms: { create: async () => {} },
      tabs: {
        query: async () => liveTabs.map((tab) => ({ ...tab })),
        get: async (tabId) => liveTabs.find((tab) => tab.id === tabId)
      }
    };
    return { api, liveTabs, local: localArea };
  }

  const generation = DEFAULT_WORKSPACE_SESSION_GENERATION;
  const oldId = "page-aaaaaaaaaaaa";
  const newId = "page-newchatrebind";
  const conversationSnapshot = {
    schemaVersion: 1,
    generation,
    topicTitle: "the rational male 系列",
    topicTitleCustom: true,
    groups: [{
      tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/c/remembered" }],
      activeIndex: 0
    }]
  };
  const emptySnapshot = {
    schemaVersion: 1,
    generation,
    groups: [{
      tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }],
      activeIndex: 0
    }]
  };
  const owner = { tabId: 11, windowId: 2, index: 0, pinned: false };
  const stable = (workspaceId, snapshot, updatedAt) => ({
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    snapshot,
    owner,
    updatedAt,
    detach: null,
    detachedAt: null,
    detachedKind: "",
    detachedRuntimeId: "",
    resolution: "",
    closedBy: ""
  });
  const binding = (workspaceId, updatedAt) => ({
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    tabId: 11,
    windowId: 2,
    index: 0,
    pinned: false,
    updatedAt,
    detachedAt: null
  });

  {
    const now = 9_800_000;
    const newUrl = `chrome-extension://chatclub/chatClub.html#workspace=${newId}`;
    const store = persistFixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(oldId)]: stable(oldId, conversationSnapshot, now - 50),
        [workspaceSessionBindingKey(11)]: binding(oldId, now - 50)
      },
      tabs: [{ id: 11, windowId: 2, index: 0, pinned: false, url: newUrl }]
    });
    const persisted = await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: emptySnapshot
    }, {
      url: newUrl,
      tab: { id: 11, windowId: 2, index: 0, pinned: false, url: newUrl }
    }, { now });
    assert.equal(persisted.persisted, true);
    assert.equal(persisted.workspaceId, newId);
    const remembered = store.local.values[workspaceSessionWorkspaceKey(oldId)];
    assert.equal(remembered.snapshot.topicTitle, "the rational male 系列");
    assert.equal(remembered.snapshot.groups[0].tabs[0].currentHref, "https://chatgpt.com/c/remembered");
    assert.equal(remembered.resolution, "");
    assert.ok(remembered.detach);
    assert.equal(WORKSPACE_SESSION_RECOVERY_KEY in store.local.values, false);
    const listed = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 11, url: newUrl }
    });
    assert.deepEqual(listed.tabs.map((item) => item.workspaceId), [newId, oldId]);
    assert.equal(listed.tabs[0].live, true);
    assert.equal(listed.tabs[0].current, true);
    assert.equal(listed.tabs[1].live, false);
    assert.equal(listed.tabs[1].topicTitle, "the rational male 系列");
    const cleared = await listClearedWorkspaceTabs(store.api, { now: now + 1 });
    assert.deepEqual(cleared.tabs, []);
  }

  {
    const now = 9_810_000;
    const oldUrl = `chrome-extension://chatclub/chatClub.html#workspace=${oldId}`;
    const newUrl = `chrome-extension://chatclub/chatClub.html#workspace=${newId}`;
    const pageTab = { id: 11, windowId: 2, index: 0, pinned: false, url: oldUrl };
    const store = persistFixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(oldId)]: stable(oldId, conversationSnapshot, now - 50),
        [workspaceSessionBindingKey(11)]: binding(oldId, now - 50)
      },
      tabs: [pageTab]
    });
    const persisted = await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: emptySnapshot
    }, {
      url: newUrl,
      tab: { ...pageTab }
    }, { now });
    assert.equal(persisted.persisted, true, "replaceState lag must still persist the rebound workspace");
    const remembered = store.local.values[workspaceSessionWorkspaceKey(oldId)];
    assert.ok(remembered.detach, "stale tab.url must not block detaching the frozen conversation workspace");
    assert.equal(WORKSPACE_SESSION_RECOVERY_KEY in store.local.values, false);
  }

  console.log("workspace new-chat preserve: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
