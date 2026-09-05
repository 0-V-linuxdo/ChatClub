#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
assert.match(agents, /## New Chat Workspace Preserve/);
assert.match(agents, /preserveCurrentWorkspaceForNewChat/);
assert.match(agents, /replaceState/);
assert.match(agents, /listLiveWorkspaceTabs/);
assert.match(agents, /claim that binding instead of the lagged URL/);
assert.match(agents, /registerWorkspaceSessionTab/);
assert.match(agents, /failing closed as a URL mismatch/);
assert.match(agents, /real topic title must stay in ChatClub Tabs/);

(async () => {
  const { createWorkspaceSessionController } = await import(
    pathToFileURL(path.join(root, "app/workspace/session-controller.js")).href
  );
  const { createWorkspaceSessionStore } = await import(
    pathToFileURL(path.join(root, "app/workspace/session-store.js")).href
  );
  const {
    persistWorkspaceSessionSnapshot,
    listLiveWorkspaceTabs,
    listClearedWorkspaceTabs,
    claimWorkspaceSessionRecovery,
    prepareWorkspaceSessionLifecycle,
    registerWorkspaceSessionTab
  } = await import(pathToFileURL(path.join(root, "background/workspace-session.js")).href);
  const {
    BACKGROUND_REQUEST_ACTIONS,
    BACKGROUND_REQUEST_SPECS,
    assertBackgroundContractValue
  } = await import(pathToFileURL(path.join(root, "shared/background-requests.js")).href);
  const claimResponseContract = BACKGROUND_REQUEST_SPECS[BACKGROUND_REQUEST_ACTIONS.CLAIM_WORKSPACE_SESSION_RECOVERY].response;
  function assertClaimResponse(response) {
    assertBackgroundContractValue(
      claimResponseContract,
      response,
      "Background response claimWorkspaceSessionRecovery"
    );
  }
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
    appById: (id) => {
      const appId = String(id || "ChatGPT");
      if (appId === "Grok") return { id: "Grok", url: "https://grok.com/" };
      if (appId === "Notion") return { id: "Notion", url: "https://app.notion.com/ai" };
      if (appId === "Kagi") return { id: "Kagi", url: "https://assistant.kagi.com/" };
      return { id: "ChatGPT", url: "https://chatgpt.com/" };
    },
        createFrameId: () => "frame-1",
        createGroupId: () => "group-1",
        createLayoutId: () => "layout-1",
        openableTabUrl: (value) => String(value || ""),
        workspaceSessionStore: store
      },
      registry: { frameForInstance: () => null },
      layout: {
        persistentLayoutPresets: () => [{ id: "default" }],
        validChatAppIds: () => ["ChatGPT", "Grok", "Notion", "Kagi"]
      }
    });
    return { controller, state };
  }

  {
    const store = createStore("page-oldworkspace1");
    const { controller, state } = createController(store, {
      groups: [{
        id: "g1",
        chatApps: [{ instanceId: "i1", appId: "ChatGPT", initialHref: "https://chatgpt.com/" }]
      }],
      topicTitle: "",
      topicTitleCustom: false
    });
    const skipped = await controller.preserveCurrentWorkspaceForNewChat(["https://chatgpt.com/"]);
    assert.deepEqual(skipped, { preserved: false, workspaceId: "page-oldworkspace1" });
    assert.equal(store.adopted.length, 0);
    assert.equal(state.topicTitle, "");
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
    assert.equal(store.saved[0].topicTitleCustom, true);
    assert.equal(store.saved[1].topicTitle, "");
    assert.equal(store.saved[1].topicTitleCustom, false);
    assert.equal(store.saved[0].groups[0].tabs[0].currentHref, "https://chatgpt.com/c/thread-1");
  }

  {
    const store = createStore("page-oldworkspace1");
    const { controller, state } = createController(store, {
      groups: [
        { id: "g1", chatApps: [{ instanceId: "i1", appId: "Notion", initialHref: "https://app.notion.com/ai" }] },
        { id: "g2", chatApps: [{ instanceId: "i2", appId: "Grok", initialHref: "https://grok.com/c/star-wars" }] }
      ],
      activeTabs: { g1: "i1", g2: "i2" },
      topicTitle: "深入搜索: Star Wars 小说",
      topicTitleCustom: true
    });
    const preserved = await controller.preserveCurrentWorkspaceForNewChat(["https://app.notion.com/ai"]);
    assert.equal(preserved.preserved, true, "a Notion home New Chat must freeze Grok conversations in the same workspace");
    assert.equal(state.topicTitle, "");
    assert.equal(store.saved[0].topicTitle, "深入搜索: Star Wars 小说");
    assert.equal(
      store.saved[0].groups.some((group) => group.tabs.some((tab) => tab.currentHref === "https://grok.com/c/star-wars")),
      true
    );
  }

  {
    const store = createStore("page-oldworkspace1");
    store.durableSnapshot = () => ({
      schemaVersion: 1,
      topicTitle: "深入搜索: Star Wars 小说",
      topicTitleCustom: true,
      groups: [{
        tabs: [
          { appId: "Notion", currentHref: "https://app.notion.com/chat?t=star-wars" },
          { appId: "Grok", currentHref: "https://grok.com/c/star-wars" },
          { appId: "Kagi", currentHref: "https://assistant.kagi.com/c/star-wars" }
        ],
        activeIndex: 0
      }]
    });
    const { controller, state } = createController(store, {
      groups: [{
        id: "g1",
        chatApps: [
          { instanceId: "i1", appId: "Notion", initialHref: "https://app.notion.com/ai" },
          { instanceId: "i2", appId: "Grok", initialHref: "https://grok.com/" },
          { instanceId: "i3", appId: "Kagi", initialHref: "https://assistant.kagi.com/" }
        ]
      }],
      activeTabs: { g1: "i1" },
      topicTitle: "深入搜索: Star Wars 小说",
      topicTitleCustom: true
    });
    const preserved = await controller.preserveCurrentWorkspaceForNewChat(["https://app.notion.com/ai"]);
    assert.equal(preserved.preserved, true, "stale home iframe hrefs must not skip preserve when durable Tabs memory still has the conversation");
    assert.equal(state.topicTitle, "");
    const frozen = store.saved[0];
    assert.equal(frozen.topicTitle, "深入搜索: Star Wars 小说");
    assert.equal(frozen.groups[0].tabs.find((tab) => tab.appId === "Grok").currentHref, "https://grok.com/c/star-wars");
    assert.equal(frozen.groups[0].tabs.find((tab) => tab.appId === "Kagi").currentHref, "https://assistant.kagi.com/c/star-wars");
    assert.equal(frozen.groups[0].tabs.find((tab) => tab.appId === "Notion").currentHref, "https://app.notion.com/chat?t=star-wars");
  }

  {
    const iframe = {
      dataset: { instanceId: "i1", currentHref: "https://chatgpt.com/" },
      src: "https://chatgpt.com/c/thread-1",
      getAttribute: (name) => (name === "src" ? "https://chatgpt.com/c/thread-1" : "")
    };
    globalThis.document = { querySelectorAll: () => [iframe] };
    const store = createStore("page-oldworkspace1");
    const { controller } = createController(store, {
      groups: [{
        id: "g1",
        chatApps: [{ instanceId: "i1", appId: "ChatGPT" }]
      }]
    });
    const preserved = await controller.preserveCurrentWorkspaceForNewChat(["https://chatgpt.com/"]);
    assert.equal(preserved.preserved, true, "a stale home currentHref must not hide the live conversation src");
    assert.equal(store.saved[0].groups[0].tabs[0].currentHref, "https://chatgpt.com/c/thread-1");
    globalThis.document = { querySelectorAll: () => [] };
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
    const sessionArea = storageArea();
    const liveTabs = tabs.map((tab) => ({ ...tab }));
    const api = {
      runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
      storage: { local: localArea.api, session: sessionArea.api },
      alarms: { create: async () => {}, clear: async () => {} },
      tabs: {
        query: async () => liveTabs.map((tab) => ({ ...tab })),
        get: async (tabId) => liveTabs.find((tab) => tab.id === tabId)
      }
    };
    return { api, liveTabs, local: localArea, session: sessionArea };
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
    assert.equal(listed.tabs[0].topicTitle, "");
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
    const listed = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 11, url: oldUrl, windowId: 2, index: 0 }
    });
    assert.deepEqual(
      listed.tabs.map((item) => item.workspaceId),
      [newId, oldId],
      "a lagged chrome URL must not keep the frozen conversation marked live"
    );
    assert.equal(listed.tabs[0].live, true);
    assert.equal(listed.tabs[0].current, true);
    assert.equal(listed.tabs[0].tabId, 11);
    assert.equal(listed.tabs[1].live, false);
    assert.equal(listed.tabs[1].tabId, null);
    assert.equal(listed.tabs[1].topicTitle, "the rational male 系列");
    const opened = {
      id: 22,
      windowId: 2,
      index: 1,
      pinned: false,
      url: oldUrl
    };
    store.liveTabs.push(opened);
    const claimed = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: oldId },
      { url: oldUrl, tab: opened },
      { now: now + 1 }
    );
    assertClaimResponse(claimed);
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.forked, false, "opening the frozen row must not fork an empty desk from a stale hash");
    assert.equal(claimed.workspaceId, oldId);
    assert.equal(store.local.values[workspaceSessionWorkspaceKey(oldId)].owner.tabId, 22);
  }

  {
    const now = 9_815_000;
    const oldUrl = `chrome-extension://chatclub/chatClub.html#workspace=${oldId}`;
    const newUrl = `chrome-extension://chatclub/chatClub.html#workspace=${newId}`;
    const pageTab = { id: 11, windowId: 2, index: 0, pinned: false, url: oldUrl };
    const titledHome = {
      schemaVersion: 1,
      generation,
      topicTitle: "星球大战 小说推荐",
      topicTitleCustom: false,
      groups: [{
        tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }],
        activeIndex: 0
      }]
    };
    const store = persistFixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(oldId)]: stable(oldId, conversationSnapshot, now - 50),
        [workspaceSessionBindingKey(11)]: binding(oldId, now - 50)
      },
      tabs: [pageTab]
    });
    await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: emptySnapshot
    }, { url: newUrl, tab: { ...pageTab } }, { now });
    const titled = await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: titledHome
    }, { url: newUrl, tab: { ...pageTab } }, { now: now + 1 });
    assert.equal(titled.persisted, true);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(newId)].snapshot.topicTitle,
      "星球大战 小说推荐"
    );
    store.liveTabs.splice(0);
    const listed = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 99, url: `chrome-extension://chatclub/chatClub.html#workspace=${oldId}` }
    });
    assert.equal(
      listed.tabs.some((item) => item.workspaceId === newId && item.live === false && item.topicTitle === "星球大战 小说推荐"),
      true,
      "a titled New Chat desk must remain in ChatClub Tabs after reload even without a conversation URL"
    );
    store.liveTabs.push({ ...pageTab });
    const rebound = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: oldId },
      { url: oldUrl, tab: pageTab },
      { now: now + 2 }
    );
    assertClaimResponse(rebound);
    assert.equal(rebound.claimed, true);
    assert.equal(rebound.forked, false);
    assert.equal(rebound.reboundFromStaleUrl, true);
    assert.equal(rebound.workspaceId, newId, "extension reload must not resurrect a detached lagged hash");
    assert.equal(store.local.values[workspaceSessionBindingKey(11)].workspaceId, newId);
  }

  {
    const now = 9_816_000;
    const oldUrl = `chrome-extension://chatclub/chatClub.html#workspace=${oldId}`;
    const newUrl = `chrome-extension://chatclub/chatClub.html#workspace=${newId}`;
    const pageTab = { id: 11, windowId: 2, index: 0, pinned: false, url: oldUrl };
    const titledHome = {
      schemaVersion: 1,
      generation,
      topicTitle: "星球大战 小说推荐",
      topicTitleCustom: false,
      groups: [{
        tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }],
        activeIndex: 0
      }]
    };
    const store = persistFixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(oldId)]: stable(oldId, conversationSnapshot, now - 50),
        [workspaceSessionBindingKey(11)]: binding(oldId, now - 50)
      },
      tabs: [pageTab]
    });
    await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: emptySnapshot
    }, { url: newUrl, tab: { ...pageTab } }, { now });
    await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: titledHome
    }, { url: newUrl, tab: { ...pageTab } }, { now: now + 1 });
    for (const key of Object.keys(store.session.values)) delete store.session.values[key];
    await prepareWorkspaceSessionLifecycle(store.api, {
      now: now + 2,
      forceRecovery: true,
      reason: "update"
    });
    const registered = await registerWorkspaceSessionTab(store.api, { ...pageTab, url: oldUrl }, { now: now + 3 });
    assert.deepEqual(registered, {
      registered: false,
      workspaceId: newId,
      staleUrl: true
    }, "a lagged detached hash must not overwrite the rebound tab binding");
    assert.equal(store.local.values[workspaceSessionBindingKey(11)].workspaceId, newId);
    assert.ok(store.local.values[workspaceSessionWorkspaceKey(oldId)].detach);
    const pageClaim = await claimWorkspaceSessionRecovery(
      store.api,
      { workspaceId: newId },
      { url: oldUrl, tab: pageTab },
      { now: now + 4 }
    );
    assertClaimResponse(pageClaim);
    assert.equal(pageClaim.claimed, true);
    assert.equal(pageClaim.forked, false);
    assert.equal(pageClaim.reboundFromStaleUrl, true);
    assert.equal(pageClaim.workspaceId, newId);
    const persisted = await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: newId,
      snapshot: titledHome
    }, { url: oldUrl, tab: pageTab }, { now: now + 5 });
    assert.equal(persisted.persisted, true);
    const href = { value: newUrl };
    const pageStorage = {
      values: {},
      getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; },
      setItem(key, value) { this.values[key] = String(value); },
      removeItem(key) { delete this.values[key]; }
    };
    const pageStore = createWorkspaceSessionStore({
      sessionStorage: pageStorage,
      location: { get href() { return href.value; } },
      history: { replaceState(_state, _title, next) { href.value = String(next); } },
      currentTab: async () => ({ ...pageTab, url: oldUrl }),
      currentTabId: async () => 11,
      claimWorkspaceSession: (request) => claimWorkspaceSessionRecovery(
        store.api,
        request,
        { url: oldUrl, tab: { ...pageTab, url: oldUrl } },
        { now: now + 6 }
      ),
      persistWorkspaceSession: (request) => persistWorkspaceSessionSnapshot(
        store.api,
        request,
        { url: href.value, tab: { ...pageTab, url: oldUrl } },
        { now: now + 7 }
      ),
      storageGet: async (key) => (await store.api.storage.local.get(key))[key]
    });
    const loaded = await pageStore.load();
    assert.equal(pageStore.workspaceId(), newId);
    assert.equal(loaded?.topicTitle, "星球大战 小说推荐");
  }

  {
    const now = 9_820_000;
    const url = `chrome-extension://chatclub/chatClub.html#workspace=${oldId}`;
    const pageTab = { id: 11, windowId: 2, index: 0, pinned: false, url };
    const store = persistFixture({
      local: {
        [WORKSPACE_SESSION_GENERATION_KEY]: generation,
        [workspaceSessionWorkspaceKey(oldId)]: stable(oldId, conversationSnapshot, now - 50),
        [workspaceSessionBindingKey(11)]: binding(oldId, now - 50)
      },
      tabs: [pageTab]
    });
    const persisted = await persistWorkspaceSessionSnapshot(store.api, {
      workspaceId: oldId,
      snapshot: emptySnapshot
    }, { url, tab: pageTab }, { now });
    assert.equal(persisted.persisted, true);
    assert.equal(
      store.local.values[workspaceSessionWorkspaceKey(oldId)].snapshot.groups[0].tabs[0].currentHref,
      "https://chatgpt.com/c/remembered",
      "a home-page capture must not erase the durable conversation"
    );
    store.liveTabs.splice(0);
    const listed = await listLiveWorkspaceTabs(store.api, {}, {
      tab: { id: 99, url: `chrome-extension://chatclub/chatClub.html#workspace=${newId}` }
    });
    assert.equal(
      listed.tabs.some((item) => item.workspaceId === oldId && item.live === false),
      true,
      "a conversation workspace must remain in ChatClub Tabs after the live page is gone"
    );
  }

  console.log("workspace new-chat preserve: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
