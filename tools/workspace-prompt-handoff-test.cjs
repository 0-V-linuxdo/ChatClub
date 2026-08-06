#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const SESSION_THRESHOLD_BYTES = 4 * 1024 * 1024;
const HANDOFF_ALARM = "chatclub-workspace-prompt-handoff-expiry-v1";
const sessionPayloadKey = (handoffId) => `chatclubWorkspacePromptPayloadV1:${handoffId}`;
const payloadByteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function createSessionStorage(options = {}) {
  const values = new Map();
  let rejectedGetAllCount = Math.max(0, Number(options.rejectGetAllCount) || 0);
  let rejectedGetCount = Math.max(0, Number(options.rejectGetCount) || 0);
  return {
    values,
    rejectNextGet(count = 1) { rejectedGetCount += Math.max(0, Number(count) || 0); },
    async get(keys) {
      if (keys !== null && keys !== undefined && rejectedGetCount > 0) {
        rejectedGetCount -= 1;
        throw new Error("simulated session read failure");
      }
      if (keys === null || keys === undefined) {
        if (rejectedGetAllCount > 0) {
          rejectedGetAllCount -= 1;
          throw new Error("simulated session enumeration failure");
        }
        return Object.fromEntries(Array.from(values, ([key, value]) => [key, clone(value)]));
      }
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter((key) => values.has(key)).map((key) => [key, clone(values.get(key))]));
    },
    async set(entries) {
      if (options.rejectSet?.(entries)) throw new Error("simulated session quota failure");
      for (const [key, value] of Object.entries(entries || {})) values.set(key, clone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    }
  };
}

function createIndexedDbBackend(options = {}) {
  const values = new Map();
  const metadataValues = new Map();
  const calls = { get: 0, getMetadata: 0, listMetadata: 0 };
  let rejectedListCount = Math.max(0, Number(options.rejectListCount) || 0);
  let rejectedRemoveCount = Math.max(0, Number(options.rejectRemoveCount) || 0);
  return {
    values,
    metadataValues,
    calls,
    async put(entry) {
      values.set(entry.handoffId, clone(entry));
      const metadata = clone(entry);
      delete metadata.payload;
      metadataValues.set(entry.handoffId, metadata);
    },
    async get(handoffId) {
      calls.get += 1;
      return clone(values.get(handoffId));
    },
    async getMetadata(handoffId) {
      calls.getMetadata += 1;
      return clone(metadataValues.get(handoffId));
    },
    async remove(handoffId) {
      if (rejectedRemoveCount > 0) {
        rejectedRemoveCount -= 1;
        throw new Error("simulated IndexedDB removal failure");
      }
      values.delete(handoffId);
      metadataValues.delete(handoffId);
    },
    async listMetadata() {
      calls.listMetadata += 1;
      if (rejectedListCount > 0) {
        rejectedListCount -= 1;
        throw new Error("simulated IndexedDB enumeration failure");
      }
      return Array.from(metadataValues.values(), clone);
    }
  };
}

function payload(text = "预先填写并自动提交", imageData = "") {
  return {
    text,
    images: imageData ? [{
      id: "prompt-image-1",
      name: "capture.png",
      type: "image/png",
      size: imageData.length,
      lastModified: 123,
      dataUrl: `data:image/png;base64,${imageData}`
    }] : [],
    appIdGroups: [["ChatGPT"], ["Claude"], ["ChatGPT"]]
  };
}

function workspaceUrl(workspaceId) {
  return `chrome-extension://chatclub/chatClub.html#workspace=${workspaceId}`;
}

function documentResourceUrl(href) {
  const url = new URL(href);
  url.hash = "";
  return url.href;
}

function createApi(sessionStorage, options = {}) {
  const tabs = new Map(options.tabs || []);
  const receipts = [];
  const alarms = new Map();
  const removedTabIds = [];
  return {
    tabsById: tabs,
    receipts,
    removedTabIds,
    alarmValues: alarms,
    runtime: {
      id: "chatclub",
      getURL: (file = "") => `chrome-extension://chatclub/${file}`,
      async sendMessage(message) { receipts.push(clone(message)); }
    },
    storage: { session: sessionStorage },
    tabs: {
      async get(tabId) {
        const tab = tabs.get(tabId);
        if (!tab) throw new Error("tab not found");
        return clone(tab);
      },
      async remove(tabId) {
        removedTabIds.push(tabId);
        tabs.delete(tabId);
      }
    },
    alarms: {
      async create(name, details) { alarms.set(name, clone(details)); },
      async clear(name) { return alarms.delete(name); }
    }
  };
}

(async () => {
  const shared = await import(moduleUrl("shared/workspace-prompt-handoff.js"));
  const background = await import(moduleUrl("background/workspace-prompt-handoff.js"));
  const tabRuntime = await import(moduleUrl("background/tab-runtime.js"));
  const requests = await import(moduleUrl("shared/background-requests.js"));
  const protocol = await import(moduleUrl("shared/protocol.js"));

  {
    let current = 1_000;
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const store = shared.createWorkspacePromptPayloadStore({ storage: { session } }, {
      indexedDbBackend: idb,
      now: () => current
    });
    const handoffId = "prompt-handoff-small-123456";
    const originalPayload = payload("  preserve prompt spacing  ");
    const locator = await store.put(handoffId, originalPayload);
    assert.equal(locator.backend, "session", "small payloads must prefer storage.session");
    assert.equal(
      shared.normalizeWorkspacePromptPayloadLocator({ ...locator, payload: payload() }),
      null,
      "runtime locators must reject embedded payload data"
    );
    assert.deepEqual(await store.get(locator), originalPayload, "session payload must round-trip exactly");
    await assert.rejects(
      store.put("prompt-handoff-invalid-groups", { ...payload(), appIdGroups: [["ChatGPT", "Claude"]] }),
      /payload is invalid/,
      "each appIdGroups entry must contain exactly one app id"
    );
    current = locator.expiresAt;
    assert.equal(await store.get(locator), null, "expired payloads must fail closed");
    await store.remove(locator);
    assert.equal(session.values.has(sessionPayloadKey(handoffId)), false);
  }

  {
    const idb = createIndexedDbBackend();
    const rejectedSession = createSessionStorage({
      rejectSet: (entries) => Object.keys(entries).some((key) => key.startsWith("chatclubWorkspacePromptPayloadV1:"))
    });
    const fallbackStore = shared.createWorkspacePromptPayloadStore({ storage: { session: rejectedSession } }, {
      indexedDbBackend: idb,
      now: () => 2_000
    });
    const fallbackLocator = await fallbackStore.put("prompt-handoff-fallback-1234", payload());
    assert.equal(fallbackLocator.backend, "indexeddb", "session write failures must fall back to IndexedDB");
    assert.deepEqual(await fallbackStore.get(fallbackLocator), payload());

    const largeLocator = await fallbackStore.put(
      "prompt-handoff-large-123456",
      payload("image", "A".repeat(SESSION_THRESHOLD_BYTES))
    );
    assert.equal(largeLocator.backend, "indexeddb", "payloads over 4 MiB must bypass storage.session");
    assert.ok(largeLocator.byteLength > SESSION_THRESHOLD_BYTES);
    const fullPayloadReads = idb.calls.get;
    assert.equal(await fallbackStore.has(largeLocator), true);
    assert.equal(idb.calls.get, fullPayloadReads, "IndexedDB presence checks must read metadata without materializing a large payload");
    await fallbackStore.prune({
      now: 2_000,
      activeHandoffIds: new Set([fallbackLocator.handoffId, largeLocator.handoffId])
    });
    assert.equal(idb.calls.get, fullPayloadReads, "IndexedDB cleanup scans must remain metadata-only");
    assert.ok(idb.calls.listMetadata > 0);
  }

  {
    let current = 3_000;
    const sourceWorkspaceId = "page-delayed-write-source-1234";
    const sourceTab = {
      id: 7,
      windowId: 1,
      index: 0,
      url: `chrome-extension://chatclub/chatClub.html?keep=1#panel=settings&workspace=${sourceWorkspaceId}`
    };
    const session = createSessionStorage({
      rejectSet: (entries) => Object.keys(entries).some((key) => key.startsWith("chatclubWorkspacePromptPayloadV1:"))
    });
    const idb = createIndexedDbBackend();
    const writePayload = idb.put.bind(idb);
    idb.put = async (entry) => {
      current += 31_000;
      return writePayload(entry);
    };
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const handoffId = "prompt-handoff-delayed-write-1234";
    const locator = await store.put(handoffId, payload("slow large write"));
    const targetTab = { id: 8, windowId: 1, index: 1, url: workspaceUrl("page-delayed-write-target-1234") };
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => "page-delayed-write-target-1234",
      openWorkspaceTab: async () => {
        api.tabsById.set(targetTab.id, targetTab);
        return targetTab;
      }
    });
    await assert.rejects(
      runtime.open(
        { handoffId, locator },
        { id: "chatclub", url: "chrome-extension://chatclub/chatClub.html?keep=2", tab: sourceTab }
      ),
      (error) => error.code === "HANDOFF_SENDER_INVALID",
      "a source sender may omit its fragment but must retain the exact document query"
    );
    const opened = await runtime.open(
      { handoffId, locator },
      { id: "chatclub", url: documentResourceUrl(sourceTab.url), tab: sourceTab }
    );
    assert.equal(opened.tabId, targetTab.id);
    assert.equal(await store.has(locator), true, "a payload write slower than the old 30-second grace must remain claimable until TTL");
  }

  {
    let current = 5_000;
    const session = createSessionStorage({ rejectGetAllCount: 1 });
    const idb = createIndexedDbBackend({ rejectListCount: 1 });
    const api = createApi(session);
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const sessionLocator = await store.put("prompt-handoff-orphan-session", payload("session orphan"));
    const idbPayload = payload("IndexedDB orphan");
    const idbLocator = {
      version: shared.WORKSPACE_PROMPT_HANDOFF_VERSION,
      backend: "indexeddb",
      handoffId: "prompt-handoff-orphan-indexeddb",
      byteLength: payloadByteLength(idbPayload),
      createdAt: current,
      expiresAt: current + shared.WORKSPACE_PROMPT_HANDOFF_TTL_MS
    };
    await idb.put({ ...idbLocator, payload: idbPayload });
    current += shared.WORKSPACE_PROMPT_HANDOFF_TTL_MS;
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      openWorkspaceTab: async () => ({ id: 1 })
    });
    await runtime.initialize();
    const retryAlarm = api.alarmValues.get(HANDOFF_ALARM);
    assert.ok(retryAlarm?.when > current, "payload enumeration failures must retain a cleanup retry alarm");
    assert.ok(session.values.has(sessionPayloadKey(sessionLocator.handoffId)));
    assert.ok(idb.values.has(idbLocator.handoffId));
    await runtime.handleAlarm({ name: HANDOFF_ALARM });
    assert.equal(session.values.has(sessionPayloadKey(sessionLocator.handoffId)), false);
    assert.equal(idb.values.has(idbLocator.handoffId), false, "a later successful enumeration must remove the orphan payload");
  }

  {
    const current = 50_000;
    const session = createSessionStorage();
    const idb = createIndexedDbBackend({ rejectRemoveCount: 1 });
    idb.values.set("invalid", { handoffId: "invalid", payload: { sensitive: true } });
    idb.metadataValues.set("invalid", { handoffId: "invalid" });
    const api = createApi(session);
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      openWorkspaceTab: async () => ({ id: 1 })
    });
    await runtime.initialize();
    assert.ok(api.alarmValues.has(HANDOFF_ALARM), "failed orphan removal must schedule a retry");
    assert.ok(idb.values.has("invalid"));
    await runtime.handleAlarm({ name: HANDOFF_ALARM });
    assert.equal(idb.values.has("invalid"), false, "malformed IndexedDB entries must be removed by their raw key");
  }

  {
    let current = 10_000;
    let nextTabId = 20;
    const sourceWorkspaceId = "page-source-workspace-1234";
    const sourceTab = { id: 10, windowId: 1, index: 2, url: workspaceUrl(sourceWorkspaceId) };
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const opened = [];
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => "page-target-workspace-1234",
      createClaimId: () => "prompt-claim-1234567890",
      openWorkspaceTab: async (_api, _sender, _opener, options) => {
        const tab = { id: nextTabId++, windowId: 1, index: 3, url: workspaceUrl(options.workspaceId) };
        api.tabsById.set(tab.id, tab);
        opened.push({ tab: clone(tab), options: clone(options) });
        return tab;
      }
    });
    const handoffId = "prompt-handoff-runtime-1234";
    const locator = await store.put(handoffId, payload());
    const sender = { id: "chatclub", url: documentResourceUrl(sourceTab.url), tab: sourceTab };
    const openedResult = await runtime.open({ handoffId, locator }, sender);
    assert.deepEqual(openedResult, {
      handoffId,
      workspaceId: "page-target-workspace-1234",
      tabId: 20
    });
    assert.equal(opened[0].options.workspaceId, openedResult.workspaceId, "the prepared workspace id must be passed into tab creation");
    assert.ok(await store.has(locator), "claimable payload must remain available after the tab opens");

    const targetTab = api.tabsById.get(openedResult.tabId);
    for (const url of [
      `chrome-extension://chatclub/chatClub.html?workspace=${openedResult.workspaceId}`,
      `${targetTab.url}&extra=1`,
      `chrome-extension://chatclub/chatClub.html#extra=1&workspace=${openedResult.workspaceId}`
    ]) {
      const noncanonicalTarget = { ...targetTab, url };
      api.tabsById.set(targetTab.id, noncanonicalTarget);
      await assert.rejects(
        runtime.claim(
          { workspaceId: openedResult.workspaceId },
          { id: "chatclub", url, tab: noncanonicalTarget }
        ),
        (error) => error.code === "HANDOFF_SENDER_INVALID"
      );
    }
    api.tabsById.set(targetTab.id, targetTab);
    api.tabsById.set(targetTab.id, { ...targetTab, pendingUrl: "https://example.com/leaving" });
    await assert.rejects(
      runtime.claim(
        { workspaceId: openedResult.workspaceId },
        { id: "chatclub", url: targetTab.url, tab: targetTab }
      ),
      (error) => error.code === "HANDOFF_SENDER_INVALID",
      "a target with a pending navigation away must not win a claim race"
    );
    api.tabsById.set(targetTab.id, targetTab);

    await assert.rejects(
      runtime.claim(
        { workspaceId: openedResult.workspaceId },
        { id: "chatclub", url: `${documentResourceUrl(targetTab.url)}?wrong=1`, tab: targetTab }
      ),
      (error) => error.code === "HANDOFF_SENDER_INVALID",
      "an omitted sender fragment must not permit a query mismatch"
    );
    await assert.rejects(
      runtime.claim(
        { workspaceId: openedResult.workspaceId },
        { id: "chatclub", url: `${targetTab.url}&spoofed=1`, tab: targetTab }
      ),
      (error) => error.code === "HANDOFF_SENDER_INVALID",
      "a nonempty sender fragment must match the exact target tab URL"
    );

    const wrongTarget = { id: 21, url: workspaceUrl(openedResult.workspaceId) };
    api.tabsById.set(21, wrongTarget);
    await assert.rejects(
      runtime.claim({ workspaceId: openedResult.workspaceId }, { id: "chatclub", url: wrongTarget.url, tab: wrongTarget }),
      (error) => error.code === "HANDOFF_TARGET_MISMATCH"
    );

    const targetSender = { id: "chatclub", url: documentResourceUrl(targetTab.url), tab: targetTab };
    const claimed = await runtime.claim({ workspaceId: openedResult.workspaceId }, targetSender);
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.handoffId, handoffId);
    assert.deepEqual(claimed.locator, locator, "claim messages must carry only locator metadata");
    assert.deepEqual(await store.get(claimed.locator), payload(), "the target must resolve the payload out of band");
    assert.deepEqual(
      await runtime.claim({ workspaceId: openedResult.workspaceId }, targetSender),
      { claimed: false },
      "a page reload or second claim must never replay the handoff"
    );

    const settled = await runtime.settle({
      workspaceId: openedResult.workspaceId,
      handoffId,
      claimId: claimed.claimId,
      admittedCount: 3
    }, targetSender);
    assert.deepEqual(settled, { settled: true, outcome: "admitted" });
    assert.equal(await store.get(locator), null, "settlement must delete the payload backend entry");
    assert.equal(api.receipts.length, 1);
    assert.deepEqual(api.receipts[0], {
      source: protocol.EXTENSION_RUNTIME_RELAY_SOURCE,
      action: shared.WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
      sourceTabId: sourceTab.id,
      handoffId,
      outcome: "admitted",
      admittedCount: 3
    });
    assert.equal("locator" in api.receipts[0], false, "settlement receipts must not expose a locator");
    assert.equal("payload" in api.receipts[0], false, "settlement receipts must not expose prompt data");

    const closeId = "prompt-handoff-close-123456";
    const closeLocator = await store.put(closeId, payload("close target"));
    const closeOpen = await runtime.open({ handoffId: closeId, locator: closeLocator }, sender);
    assert.equal(await runtime.handleTabRemoved(closeOpen.tabId), 1);
    assert.equal(await store.get(closeLocator), null, "closing the target tab must remove its payload");

    const navigationId = "prompt-handoff-navigation-1234";
    const navigationLocator = await store.put(navigationId, payload("navigation target"));
    const navigationOpen = await runtime.open({ handoffId: navigationId, locator: navigationLocator }, sender);
    assert.equal(
      await runtime.handleTabUpdated(navigationOpen.tabId, `${workspaceUrl(navigationOpen.workspaceId)}&extra=1`),
      1,
      "a noncanonical workspace URL must release the bound prompt handoff"
    );
    assert.equal(await store.get(navigationLocator), null);

    const expiryId = "prompt-handoff-expiry-12345";
    const expiryLocator = await store.put(expiryId, payload("expire target"));
    await runtime.open({ handoffId: expiryId, locator: expiryLocator }, sender);
    current = expiryLocator.expiresAt;
    assert.equal(await runtime.handleAlarm({ name: HANDOFF_ALARM }), true);
    assert.equal(await store.get(expiryLocator), null, "the expiry alarm must remove stale payloads");
  }

  {
    const current = 50_000;
    const sourceWorkspaceId = "page-settle-storage-source-1234";
    const targetWorkspaceId = "page-settle-storage-target-1234";
    const sourceTab = { id: 57, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: 58, url: workspaceUrl(targetWorkspaceId) };
    let rejectedSettledWrite = false;
    const session = createSessionStorage({
      rejectSet: (entries) => {
        const hasSettled = Object.values(entries || {}).some((ledger) => (
          ledger?.entries && Object.values(ledger.entries).some((entry) => entry?.phase === "settled")
        ));
        if (!hasSettled || rejectedSettledWrite) return false;
        rejectedSettledWrite = true;
        return true;
      }
    });
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab], [targetTab.id, targetTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const dependencies = {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      createClaimId: () => "prompt-claim-settle-storage-1234",
      openWorkspaceTab: async () => targetTab
    };
    const runtime = background.createWorkspacePromptHandoffRuntime(api, dependencies);
    const handoffId = "prompt-handoff-settle-storage-1234";
    const locator = await store.put(handoffId, payload("settlement storage retry"));
    await runtime.open(
      { handoffId, locator },
      { id: "chatclub", url: sourceTab.url, tab: sourceTab }
    );
    const targetSender = { id: "chatclub", url: targetTab.url, tab: targetTab };
    const claimed = await runtime.claim({ workspaceId: targetWorkspaceId }, targetSender);
    const settlementMessage = {
      workspaceId: targetWorkspaceId,
      handoffId,
      claimId: claimed.claimId,
      admittedCount: 1
    };
    await assert.rejects(
      runtime.settle(settlementMessage, targetSender),
      (error) => error.code === "HANDOFF_STORAGE_FAILED" && error.delivered === false
    );
    const restartedRuntime = background.createWorkspacePromptHandoffRuntime(api, dependencies);
    assert.deepEqual(
      await restartedRuntime.settle(settlementMessage, targetSender),
      { settled: true, outcome: "admitted" },
      "an explicit pre-delivery settlement retry must survive a worker restart"
    );
    assert.equal(api.receipts.length, 1);
  }

  {
    const current = 50_000;
    const sourceWorkspaceId = "page-binding-source-1234";
    const targetWorkspaceId = "page-binding-target-1234";
    const sourceTab = { id: 55, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: 56, url: workspaceUrl(targetWorkspaceId) };
    const session = createSessionStorage({
      rejectSet: (entries) => Object.values(entries || {}).some((ledger) => (
        ledger?.entries && Object.values(ledger.entries).some((entry) => entry?.targetTabId === targetTab.id)
      ))
    });
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      openWorkspaceTab: async () => {
        api.tabsById.set(targetTab.id, targetTab);
        return targetTab;
      }
    });
    const handoffId = "prompt-handoff-binding-failure";
    const locator = await store.put(handoffId, payload("binding failure"));
    await assert.rejects(
      runtime.open(
        { handoffId, locator },
        { id: "chatclub", url: sourceTab.url, tab: sourceTab }
      ),
      (error) => error.code === "HANDOFF_STORAGE_FAILED" && error.delivered === false
    );
    assert.deepEqual(api.removedTabIds, [targetTab.id], "an undurable target binding must close the compensated tab");
    assert.equal(await store.get(locator), null);
    const ledger = Array.from(session.values.values()).find((value) => value?.entries);
    assert.deepEqual(ledger?.entries || {}, {}, "a worker restart must not recover an unbound compensated target");
  }

  {
    const current = 50_000;
    const sourceWorkspaceId = "page-claim-has-source-1234";
    const targetWorkspaceId = "page-claim-has-target-1234";
    const sourceTab = { id: 62, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: 63, url: workspaceUrl(targetWorkspaceId) };
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab], [targetTab.id, targetTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    let rejectNextHas = false;
    const payloadStore = {
      ...store,
      async has(value) {
        if (rejectNextHas) {
          rejectNextHas = false;
          throw new Error("simulated transient payload metadata failure");
        }
        return store.has(value);
      }
    };
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      createClaimId: () => "prompt-claim-has-retry-1234",
      openWorkspaceTab: async () => targetTab
    });
    const handoffId = "prompt-handoff-claim-has-1234";
    const locator = await store.put(handoffId, payload("transient metadata read"));
    await runtime.open(
      { handoffId, locator },
      { id: "chatclub", url: sourceTab.url, tab: sourceTab }
    );
    rejectNextHas = true;
    const targetSender = { id: "chatclub", url: targetTab.url, tab: targetTab };
    await assert.rejects(
      runtime.claim({ workspaceId: targetWorkspaceId }, targetSender),
      (error) => error.code === "HANDOFF_STORAGE_FAILED" && error.delivered === false,
      "a transient claim presence check must remain safely retryable"
    );
    assert.equal(await store.has(locator), true, "a transient presence failure must preserve the payload");
    assert.equal(
      (await runtime.claim({ workspaceId: targetWorkspaceId }, targetSender)).claimed,
      true,
      "the prepared claim must survive a transient presence read failure"
    );
  }

  {
    const current = 50_000;
    const sourceWorkspaceId = "page-claim-init-source-1234";
    const targetWorkspaceId = "page-claim-init-target-1234";
    const sourceTab = { id: 64, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: 65, url: workspaceUrl(targetWorkspaceId) };
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab], [targetTab.id, targetTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const dependencies = {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      createClaimId: () => "prompt-claim-init-retry-1234",
      openWorkspaceTab: async () => targetTab
    };
    const handoffId = "prompt-handoff-claim-init-1234";
    const locator = await store.put(handoffId, payload("transient ledger read"));
    const firstRuntime = background.createWorkspacePromptHandoffRuntime(api, dependencies);
    await firstRuntime.open(
      { handoffId, locator },
      { id: "chatclub", url: sourceTab.url, tab: sourceTab }
    );
    session.rejectNextGet();
    const restartedRuntime = background.createWorkspacePromptHandoffRuntime(api, dependencies);
    const targetSender = { id: "chatclub", url: targetTab.url, tab: targetTab };
    await assert.rejects(
      restartedRuntime.claim({ workspaceId: targetWorkspaceId }, targetSender),
      (error) => error.code === "HANDOFF_STORAGE_FAILED" && error.delivered === false,
      "a transient ledger read must remain safely retryable before claim mutation"
    );
    assert.equal(
      (await restartedRuntime.claim({ workspaceId: targetWorkspaceId }, targetSender)).claimed,
      true,
      "claim must recover after a transient initialization read failure"
    );
  }

  {
    const current = 50_000;
    const sourceWorkspaceId = "page-restart-source-1234";
    const targetWorkspaceId = "page-restart-target-1234";
    const sourceTab = { id: 60, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: 61, url: workspaceUrl(targetWorkspaceId) };
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[60, sourceTab], [61, targetTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const dependencies = {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      createClaimId: () => "prompt-claim-restart-1234",
      openWorkspaceTab: async () => targetTab
    };
    const handoffId = "prompt-handoff-restart-1234";
    const locator = await store.put(handoffId, payload("restart-safe"));
    const firstRuntime = background.createWorkspacePromptHandoffRuntime(api, dependencies);
    await firstRuntime.open(
      { handoffId, locator },
      { id: "chatclub", url: sourceTab.url, tab: sourceTab }
    );
    const ledgerKey = Array.from(session.values.keys()).find((key) => key.startsWith("chatclubWorkspacePromptHandoffs"));
    const ledger = clone(session.values.get(ledgerKey));
    ledger.entries[handoffId].targetTabId = null;
    await session.set({ [ledgerKey]: ledger });

    const restartedRuntime = background.createWorkspacePromptHandoffRuntime(api, dependencies);
    const claimed = await restartedRuntime.claim(
      { workspaceId: targetWorkspaceId },
      { id: "chatclub", url: targetTab.url, tab: targetTab }
    );
    assert.equal(claimed.claimed, true, "an exact target may bind an opening record after a worker restart");
    assert.deepEqual(
      await restartedRuntime.claim(
        { workspaceId: targetWorkspaceId },
        { id: "chatclub", url: targetTab.url, tab: targetTab }
      ),
      { claimed: false },
      "the recovered record must still be one-shot"
    );
    assert.equal(await restartedRuntime.handleTabRemoved(targetTab.id), 1);
    assert.equal(await store.get(locator), null, "closing a recovered target must delete its payload");
  }

  {
    const current = 70_000;
    const sourceWorkspaceId = "page-idb-source-123456";
    const targetWorkspaceId = "page-idb-target-123456";
    const sourceTab = { id: 70, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: 71, url: workspaceUrl(targetWorkspaceId) };
    const session = createSessionStorage({
      rejectSet: (entries) => Object.keys(entries).some((key) => key.startsWith("chatclubWorkspacePromptPayloadV1:"))
    });
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[70, sourceTab], [71, targetTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      createClaimId: () => "prompt-claim-idb-1234567",
      openWorkspaceTab: async () => targetTab
    });
    const handoffId = "prompt-handoff-idb-1234567";
    const locator = await store.put(handoffId, payload("idb cleanup"));
    assert.equal(locator.backend, "indexeddb");
    await runtime.open(
      { handoffId, locator },
      { id: "chatclub", url: sourceTab.url, tab: sourceTab }
    );
    const claimed = await runtime.claim(
      { workspaceId: targetWorkspaceId },
      { id: "chatclub", url: targetTab.url, tab: targetTab }
    );
    assert.deepEqual(
      await runtime.settle({
        workspaceId: targetWorkspaceId,
        handoffId,
        claimId: claimed.claimId,
        admittedCount: 0
      }, { id: "chatclub", url: targetTab.url, tab: targetTab }),
      { settled: true, outcome: "rejected" }
    );
    assert.equal(idb.values.has(handoffId), false, "rejected settlement must delete an IndexedDB payload");
    assert.equal(api.receipts[0].outcome, "rejected");
  }

  for (const [cleanupIndex, cleanupKind] of ["close", "navigation", "alarm"].entries()) {
    let current = 75_000 + cleanupIndex;
    const sourceWorkspaceId = `page-receipt-source-${cleanupKind}-1234`;
    const targetWorkspaceId = `page-receipt-target-${cleanupKind}-1234`;
    const sourceTab = { id: 80 + cleanupIndex * 2, url: workspaceUrl(sourceWorkspaceId) };
    const targetTab = { id: sourceTab.id + 1, url: workspaceUrl(targetWorkspaceId) };
    const session = createSessionStorage({
      rejectSet: (entries) => Object.keys(entries).some((key) => key.startsWith("chatclubWorkspacePromptPayloadV1:"))
    });
    const idb = createIndexedDbBackend({ rejectRemoveCount: 1 });
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab], [targetTab.id, targetTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => targetWorkspaceId,
      createClaimId: () => `prompt-claim-receipt-${cleanupKind}-1234`,
      openWorkspaceTab: async () => targetTab
    });
    const handoffId = `prompt-handoff-receipt-${cleanupKind}-1234`;
    const locator = await store.put(handoffId, payload(`receipt ${cleanupKind}`));
    const sender = { id: "chatclub", url: sourceTab.url, tab: sourceTab };
    await runtime.open({ handoffId, locator }, sender);
    const targetSender = { id: "chatclub", url: targetTab.url, tab: targetTab };
    const claimed = await runtime.claim({ workspaceId: targetWorkspaceId }, targetSender);
    await assert.rejects(
      runtime.settle({
        workspaceId: targetWorkspaceId,
        handoffId,
        claimId: claimed.claimId,
        admittedCount: 1
      }, targetSender),
      (error) => error.code === "HANDOFF_CLEANUP_FAILED" && error.delivered === true
    );
    assert.equal(api.receipts.length, 0, "a receipt must wait until physical payload removal is confirmed");
    if (cleanupKind === "close") await runtime.handleTabRemoved(targetTab.id);
    else if (cleanupKind === "navigation") await runtime.handleTabUpdated(targetTab.id, "https://example.com/");
    else {
      current += 60_000;
      await runtime.handleAlarm({ name: HANDOFF_ALARM });
    }
    assert.equal(idb.values.has(handoffId), false);
    assert.equal(api.receipts.length, 1, `${cleanupKind} cleanup must deliver the persisted admitted receipt`);
    assert.equal(api.receipts[0].outcome, "admitted");
    assert.equal(api.receipts[0].admittedCount, 1);
  }

  {
    let current = 78_000;
    let workspaceCounter = 0;
    let claimCounter = 0;
    let tabCounter = 200;
    const sourceWorkspaceId = "page-receipt-capacity-source-1234";
    const sourceTab = { id: 199, url: workspaceUrl(sourceWorkspaceId) };
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => `page-receipt-capacity-${String(++workspaceCounter).padStart(4, "0")}`,
      createClaimId: () => `prompt-claim-capacity-${String(++claimCounter).padStart(6, "0")}`,
      openWorkspaceTab: async (_api, _sender, _opener, options) => {
        const tab = { id: tabCounter++, url: workspaceUrl(options.workspaceId) };
        api.tabsById.set(tab.id, tab);
        return tab;
      },
      sendRuntimeMessage: async () => { throw new Error("source receiver unavailable"); }
    });
    const sender = { id: "chatclub", url: sourceTab.url, tab: sourceTab };
    for (let index = 0; index < shared.WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES; index += 1) {
      const handoffId = `prompt-handoff-receipt-capacity-${String(index).padStart(4, "0")}`;
      const locator = await store.put(handoffId, payload(`capacity ${index}`));
      const opened = await runtime.open({ handoffId, locator }, sender);
      const targetTab = api.tabsById.get(opened.tabId);
      const targetSender = { id: "chatclub", url: targetTab.url, tab: targetTab };
      const claimed = await runtime.claim({ workspaceId: opened.workspaceId }, targetSender);
      await assert.rejects(
        runtime.settle({
          workspaceId: opened.workspaceId,
          handoffId,
          claimId: claimed.claimId,
          admittedCount: 1
        }, targetSender),
        (error) => error.code === "HANDOFF_CLEANUP_FAILED"
      );
    }
    const overflowId = "prompt-handoff-receipt-overflow";
    const overflowLocator = await store.put(overflowId, payload("receipt overflow"));
    await assert.rejects(runtime.open({ handoffId: overflowId, locator: overflowLocator }, sender), (error) => error.code === "HANDOFF_LIMIT");
    current += shared.WORKSPACE_PROMPT_HANDOFF_TTL_MS;
    await runtime.handleAlarm({ name: HANDOFF_ALARM });
    const recoveredId = "prompt-handoff-receipt-recovered";
    const recoveredLocator = await store.put(recoveredId, payload("capacity recovered"));
    const recovered = await runtime.open({ handoffId: recoveredId, locator: recoveredLocator }, sender);
    assert.ok(recovered.tabId > 0, "expired unreachable receipts must release handoff capacity");
  }

  {
    let current = 79_000;
    let workspaceCounter = 0;
    let tabCounter = 300;
    const sourceWorkspaceId = "page-remove-capacity-source-1234";
    const sourceTab = { id: 299, url: workspaceUrl(sourceWorkspaceId) };
    const session = createSessionStorage({
      rejectSet: (entries) => Object.keys(entries).some((key) => key.startsWith("chatclubWorkspacePromptPayloadV1:"))
    });
    const idb = createIndexedDbBackend({ rejectRemoveCount: 10_000 });
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => `page-remove-capacity-${String(++workspaceCounter).padStart(4, "0")}`,
      openWorkspaceTab: async (_api, _sender, _opener, options) => {
        const tab = { id: tabCounter++, url: workspaceUrl(options.workspaceId) };
        api.tabsById.set(tab.id, tab);
        return tab;
      }
    });
    const sender = { id: "chatclub", url: sourceTab.url, tab: sourceTab };
    for (let index = 0; index < shared.WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES; index += 1) {
      const handoffId = `prompt-handoff-remove-capacity-${String(index).padStart(4, "0")}`;
      const locator = await store.put(handoffId, payload(`remove failure ${index}`));
      await runtime.open({ handoffId, locator }, sender);
    }
    current += shared.WORKSPACE_PROMPT_HANDOFF_TTL_MS;
    await runtime.handleAlarm({ name: HANDOFF_ALARM });
    assert.ok(api.alarmValues.has(HANDOFF_ALARM), "orphan payload removal failures must retain an independent retry alarm");
    const recoveredId = "prompt-handoff-remove-recovered";
    const recoveredLocator = await store.put(recoveredId, payload("remove capacity recovered"));
    const recovered = await runtime.open({ handoffId: recoveredId, locator: recoveredLocator }, sender);
    assert.ok(recovered.tabId > 0, "expired payload cleanup failures must not permanently consume handoff capacity");
  }

  {
    const current = 80_000;
    let workspaceCounter = 0;
    let tabCounter = 100;
    const sourceWorkspaceId = "page-limit-source-123456";
    const sourceTab = { id: 90, url: workspaceUrl(sourceWorkspaceId) };
    const session = createSessionStorage();
    const idb = createIndexedDbBackend();
    const api = createApi(session, { tabs: [[sourceTab.id, sourceTab]] });
    const store = shared.createWorkspacePromptPayloadStore(api, { indexedDbBackend: idb, now: () => current });
    const runtime = background.createWorkspacePromptHandoffRuntime(api, {
      payloadStore: store,
      now: () => current,
      createWorkspaceId: () => `page-limit-target-${String(++workspaceCounter).padStart(4, "0")}`,
      openWorkspaceTab: async (_api, _sender, _opener, options) => {
        const tab = { id: tabCounter++, url: workspaceUrl(options.workspaceId) };
        api.tabsById.set(tab.id, tab);
        return tab;
      }
    });
    const sender = { id: "chatclub", url: sourceTab.url, tab: sourceTab };
    for (let index = 0; index < shared.WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES; index += 1) {
      const handoffId = `prompt-handoff-limit-${String(index).padStart(6, "0")}`;
      const locator = await store.put(handoffId, payload(`pending ${index}`));
      await runtime.open({ handoffId, locator }, sender);
    }
    const overflowId = "prompt-handoff-limit-overflow";
    const overflowLocator = await store.put(overflowId, payload("overflow"));
    await assert.rejects(
      runtime.open({ handoffId: overflowId, locator: overflowLocator }, sender),
      (error) => error.code === "HANDOFF_LIMIT"
    );
    assert.equal(await store.get(overflowLocator), null, "a rejected ninth handoff must clean up its payload");
  }

  {
    const created = [];
    const explicitWorkspaceId = "page-explicit-workspace-1234";
    const api = {
      runtime: { getURL: (file) => `chrome-extension://chatclub/${file}` },
      tabs: {
        async query() { return []; },
        async create(details) {
          created.push(clone(details));
          return { id: 50, windowId: 2 };
        },
        async update() {}
      },
      windows: { async update() {} }
    };
    await tabRuntime.openWorkspaceTab(api, {}, null, { workspaceId: explicitWorkspaceId });
    assert.equal(
      new URL(created[0].url).hash,
      `#workspace=${explicitWorkspaceId}`,
      "tab-runtime must retain an explicitly prepared workspace id"
    );
  }

  for (const action of [
    requests.BACKGROUND_REQUEST_ACTIONS.OPEN_WORKSPACE_TAB_WITH_PROMPT,
    requests.BACKGROUND_REQUEST_ACTIONS.CLAIM_WORKSPACE_PROMPT_HANDOFF,
    requests.BACKGROUND_REQUEST_ACTIONS.SETTLE_WORKSPACE_PROMPT_HANDOFF
  ]) {
    assert.ok(requests.BACKGROUND_REQUEST_SPECS[action]?.mutates, `${action} must have a mutating request contract`);
  }

  console.log("workspace prompt handoff tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
