// WorkspaceSession (background): durable workspace records, tab bindings and tab operations (v2 02 §12).
// Keys: chatclubWorkspaceSessionWorkspace:<id>, chatclubWorkspaceSessionBinding:<tabId>,
// chatclubWorkspaceSessionGeneration.

const RECORD_PREFIX = "chatclubWorkspaceSessionWorkspace:";
const BINDING_PREFIX = "chatclubWorkspaceSessionBinding:";
const GENERATION_KEY = "chatclubWorkspaceSessionGeneration";
const MIRROR_PREFIX = "chatclubWorkspaceSessionMirror:";
export const DEFAULT_GENERATION = "chatclub-workspace-session-default-v1";
const DELETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const WORKSPACE_ID_RE = /^page-(?:[0-9a-f-]{8,64}|legacy-tab-\d+)$/i;

const local = () => chrome.storage.local;
const pageUrl = () => chrome.runtime.getURL("chatClub.html");
const isWorkspaceTab = (tab) => typeof tab?.url === "string" && tab.url.startsWith(pageUrl());
export const workspaceIdFromUrl = (url) => {
  const match = /[#&]workspace=([^&]+)/.exec(String(url || ""));
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return WORKSPACE_ID_RE.test(id) ? id : null;
};

let generation = null;
async function getGeneration() {
  if (generation) return generation;
  const stored = (await local().get(GENERATION_KEY))[GENERATION_KEY];
  generation = typeof stored === "string" && stored ? stored : DEFAULT_GENERATION;
  if (!stored) await local().set({ [GENERATION_KEY]: generation });
  return generation;
}

const readRecord = async (id) => {
  const key = RECORD_PREFIX + id;
  const record = (await local().get(key))[key] ?? null;
  if (!record) return null;
  return record.generation === (await getGeneration()) ? record : null;
};
const writeRecord = (record) => local().set({ [RECORD_PREFIX + record.workspaceId]: record });
const allRecords = async () => {
  const gen = await getGeneration();
  const everything = await local().get(null);
  return Object.entries(everything)
    .filter(([key, value]) => key.startsWith(RECORD_PREFIX) && value?.generation === gen)
    .map(([, value]) => value);
};
const bindingFor = async (tabId) => (await local().get(BINDING_PREFIX + tabId))[BINDING_PREFIX + tabId] ?? null;

// Serialize writes per workspace so concurrent persists can't interleave.
const chains = new Map();
const serial = (id, fn) => {
  const next = (chains.get(id) ?? Promise.resolve()).then(fn, fn);
  chains.set(id, next.catch(() => {}));
  return next;
};

/** The sender tab's current workspace id comes from tab.url (replaceState doesn't update sender.url). */
async function senderWorkspace(sender) {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") throw new Error("no tab");
  const tab = await chrome.tabs.get(tabId);
  return { tab, workspaceId: workspaceIdFromUrl(tab.url) };
}

async function bindTab(tab, workspaceId) {
  const previous = await bindingFor(tab.id);
  if (previous && previous !== workspaceId) {
    // The page switched ids (new chat keeping the old conversation): the old id becomes a detached memory.
    await serial(previous, async () => {
      const old = await readRecord(previous);
      if (old && old.tabId === tab.id) await writeRecord({ ...old, tabId: null, detachedAt: Date.now(), detachReason: "replaced" });
    });
  }
  await local().set({ [BINDING_PREFIX + tab.id]: workspaceId });
}

const tabInfo = (tab) => ({ tabId: tab.id, windowId: tab.windowId, index: tab.index, pinned: !!tab.pinned });

async function liveWorkspaceTabs() {
  const tabs = await chrome.tabs.query({ url: `${pageUrl()}*` }).catch(() => chrome.tabs.query({}));
  return tabs.filter(isWorkspaceTab);
}

/** Old builds kept one {snapshot, generation, ...} per tab id; move each into a workspace record (07 §2). */
async function migrateMirrors() {
  const everything = await local().get(null);
  const keys = Object.keys(everything).filter((k) => k.startsWith(MIRROR_PREFIX));
  if (!keys.length) return;
  const gen = await getGeneration();
  const liveTabs = await liveWorkspaceTabs().catch(() => []);
  for (const key of keys) {
    const value = everything[key];
    const tabId = Number(key.slice(MIRROR_PREFIX.length));
    const snapshot = value?.snapshot;
    if (!snapshot || typeof snapshot !== "object" || typeof value.generation !== "string" || !value.generation) continue;
    if (value.generation !== gen || !Number.isInteger(tabId)) continue;
    const live = liveTabs.find((t) => t.id === tabId);
    const workspaceId = (live && workspaceIdFromUrl(live.url)) || `page-legacy-tab-${tabId}`;
    if (await readRecord(workspaceId)) continue;
    const now = Date.now();
    const groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
    const appIds = [...new Set(groups.flatMap((g) => (g?.tabs ?? []).map((t) => t?.appId)).filter((id) => typeof id === "string"))];
    const updatedAt = Number(value.updatedAt) || now;
    await writeRecord({
      workspaceId,
      generation: gen,
      snapshot: { ...snapshot, schemaVersion: 1, generation: gen },
      memorable: groups.some((g) => (g?.tabs ?? []).some((t) => /^https?:/i.test(String(t?.currentHref || "")))) || !!snapshot.topicTitle,
      title: typeof snapshot.topicTitle === "string" ? snapshot.topicTitle : "",
      appIds: appIds.slice(0, 32),
      ...(live ? tabInfo(live) : { tabId: null }),
      createdAt: updatedAt,
      updatedAt,
      editedAt: null,
      detachedAt: live ? null : now,
      detachReason: live ? null : "migrated",
      disposition: null,
    });
    if (live) await local().set({ [BINDING_PREFIX + tabId]: workspaceId });
  }
  await local().remove(keys);
}

export default {
  async start(ctx) {
    await getGeneration();
    await migrateMirrors().catch((error) => ctx.logger.warn("Migrating old workspace snapshots failed:", error));
  },
  handlers: {
    persist: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.snapshot === "object",
      async handle(payload, sender) {
        const { tab, workspaceId } = await senderWorkspace(sender);
        if (!workspaceId || (payload.workspaceId && payload.workspaceId !== workspaceId)) return { ok: false, reason: "workspace id changed" };
        await bindTab(tab, workspaceId);
        const gen = await getGeneration();
        return serial(workspaceId, async () => {
          const existing = await readRecord(workspaceId);
          const now = Date.now();
          const record = {
            ...(existing ?? { createdAt: now }),
            workspaceId,
            generation: gen,
            snapshot: { ...payload.snapshot, generation: gen },
            memorable: !!payload.memorable,
            title: String(payload.title ?? ""),
            appIds: Array.isArray(payload.appIds) ? payload.appIds.slice(0, 32) : [],
            ...tabInfo(tab),
            updatedAt: now,
            editedAt: payload.edited ? now : existing?.editedAt ?? null,
            detachedAt: null,
            detachReason: null,
            disposition: existing?.disposition === "deleted" ? "deleted" : null,
          };
          await writeRecord(record);
          return { ok: true, generation: gen };
        });
      },
    },
    claim: {
      sender: "extensionPage",
      async handle(payload, sender) {
        const { tab, workspaceId } = await senderWorkspace(sender);
        const id = workspaceId ?? payload?.workspaceId;
        if (!id) return { snapshot: null };
        const record = await readRecord(id);
        if (!record || record.disposition === "deleted") return { snapshot: null };
        await bindTab(tab, id);
        await writeRecord({ ...record, ...tabInfo(tab), viewedAt: Date.now(), detachedAt: null, detachReason: null });
        return { snapshot: record.snapshot ?? null, generation: record.generation };
      },
    },
    list: {
      sender: "extensionPage",
      async handle(_payload, sender) {
        const tabs = await liveWorkspaceTabs();
        const records = await allRecords();
        const byId = new Map(records.map((r) => [r.workspaceId, r]));
        const live = [];
        const liveIds = new Set();
        for (const tab of tabs) {
          const id = workspaceIdFromUrl(tab.url);
          if (!id) continue;
          liveIds.add(id);
          const record = byId.get(id);
          live.push({ live: true, workspaceId: id, ...tabInfo(tab), isSelf: tab.id === sender.tab?.id, browserTitle: tab.title ?? "", ...(record ? pickPublic(record) : {}) });
        }
        const memories = records
          .filter((r) => !liveIds.has(r.workspaceId) && r.disposition !== "deleted" && r.memorable)
          .map((r) => ({ live: false, ...pickPublic(r) }));
        return { items: [...live, ...memories] };
      },
    },
    focus: {
      sender: "extensionPage",
      async handle(payload, sender) {
        const tab = await chrome.tabs.get(Number(payload?.tabId)).catch(() => null);
        if (!isWorkspaceTab(tab)) return { ok: false };
        const windowId = sender.tab?.windowId;
        if (typeof windowId === "number" && tab.windowId !== windowId) await chrome.tabs.move(tab.id, { windowId, index: -1 });
        await chrome.tabs.update(tab.id, { active: true });
        const updated = await chrome.tabs.get(tab.id);
        await chrome.windows.update(updated.windowId, { focused: true }).catch(() => {});
        return { ok: true };
      },
    },
    openWorkspaceTab: {
      sender: "extensionPage",
      async handle(payload, sender) {
        const id = WORKSPACE_ID_RE.test(String(payload?.workspaceId || "")) ? payload.workspaceId : `page-${crypto.randomUUID()}`;
        const extra = payload?.hash ? `&${String(payload.hash).replace(/^[#&]/, "")}` : "";
        const tab = await chrome.tabs.create({
          url: `${pageUrl()}#workspace=${encodeURIComponent(id)}${extra}`,
          index: typeof sender.tab?.index === "number" ? sender.tab.index + 1 : undefined,
          windowId: sender.tab?.windowId,
          active: payload?.active !== false,
        });
        return { ok: true, tabId: tab.id, workspaceId: id };
      },
    },
    setTitle: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.workspaceId === "string",
      async handle(payload) {
        return serial(payload.workspaceId, async () => {
          const record = await readRecord(payload.workspaceId);
          if (!record) return { ok: false };
          const snapshot = { ...(record.snapshot ?? {}), topicTitle: String(payload.title ?? ""), topicTitleCustom: !!payload.custom };
          await writeRecord({ ...record, snapshot, title: snapshot.topicTitle, editedAt: Date.now(), memorable: record.memorable || !!snapshot.topicTitle });
          return { ok: true };
        });
      },
    },
    deleteMemory: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.workspaceId === "string",
      async handle(payload, sender) {
        const id = payload.workspaceId;
        await serial(id, async () => {
          const record = await readRecord(id);
          if (record) await writeRecord({ ...record, disposition: "deleted", deletedAt: Date.now(), detachedAt: record.detachedAt ?? Date.now() });
        });
        for (const tab of await liveWorkspaceTabs()) {
          if (workspaceIdFromUrl(tab.url) === id && tab.id !== sender.tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
        }
        return { ok: true };
      },
    },
    closeOthers: {
      sender: "extensionPage",
      async handle(_payload, sender) {
        const ids = (await liveWorkspaceTabs()).map((t) => t.id).filter((id) => id !== sender.tab?.id);
        if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
        return { ok: true, closed: ids.length };
      },
    },
    moveTabs: {
      sender: "extensionPage",
      validate: (p) => p && Array.isArray(p.tabIds),
      async handle(payload) {
        const ids = payload.tabIds.map(Number).filter(Number.isInteger);
        if (!ids.length) return { ok: true };
        await chrome.tabs.move(ids, { windowId: payload.windowId, index: Number.isInteger(payload.index) ? payload.index : -1 });
        return { ok: true };
      },
    },
    clearAll: {
      sender: "extensionPage",
      async handle() {
        generation = crypto.randomUUID();
        await local().set({ [GENERATION_KEY]: generation });
        const everything = await local().get(null);
        const stale = Object.keys(everything).filter((k) => k.startsWith(RECORD_PREFIX));
        if (stale.length) await local().remove(stale);
        return { ok: true, generation };
      },
    },
    exportMemory: {
      sender: "extensionPage",
      async handle() {
        return { records: (await allRecords()).filter((r) => r.disposition !== "deleted") };
      },
    },
    importMemory: {
      sender: "extensionPage",
      validate: (p) => p && Array.isArray(p.records),
      async handle(payload) {
        const gen = await getGeneration();
        let count = 0;
        for (const r of payload.records) {
          if (!r || !WORKSPACE_ID_RE.test(String(r.workspaceId || "")) || typeof r.snapshot !== "object") continue;
          await writeRecord({ ...r, generation: gen, tabId: null, detachedAt: r.detachedAt ?? Date.now(), detachReason: r.detachReason ?? "imported" });
          count += 1;
        }
        return { ok: true, count };
      },
    },
  },
  on: {
    async tabRemoved(tabId, removeInfo) {
      const id = await bindingFor(tabId);
      await local().remove(BINDING_PREFIX + tabId);
      if (!id) return;
      await serial(id, async () => {
        const record = await readRecord(id);
        if (!record || record.tabId !== tabId) return;
        await writeRecord({ ...record, tabId: null, detachedAt: Date.now(), detachReason: removeInfo?.isWindowClosing ? "windowClosed" : "tabClosed", disposition: record.disposition ?? "userClosed" });
      });
    },
    async tabUpdated(tabId, change, tab) {
      if (!change.url || !isWorkspaceTab(tab)) return;
      const id = workspaceIdFromUrl(change.url);
      if (id) await bindTab(tab, id);
    },
    // Toolbar icon (01 §1): always a fresh workspace, right next to the current tab, activated.
    async actionClicked(tab) {
      await chrome.tabs.create({
        url: `${pageUrl()}#workspace=${encodeURIComponent(`page-${crypto.randomUUID()}`)}`,
        index: typeof tab?.index === "number" ? tab.index + 1 : undefined,
        windowId: tab?.windowId,
        active: true,
      });
    },
    startup: () => reconcile(),
    installed: () => reconcile(),
  },
};

function pickPublic(record) {
  return {
    workspaceId: record.workspaceId,
    title: record.title ?? "",
    topicTitleCustom: !!record.snapshot?.topicTitleCustom,
    layoutName: record.snapshot?.layout?.name ?? "",
    appIds: record.appIds ?? [],
    createdAt: record.createdAt ?? null,
    viewedAt: record.viewedAt ?? null,
    editedAt: record.editedAt ?? null,
    updatedAt: record.updatedAt ?? null,
    detachedAt: record.detachedAt ?? null,
    browserTitle: record.browserTitle ?? "",
  };
}

/** After a browser restart or extension update: rebind open tabs, mark the rest as cleared (02 §12.4). */
async function reconcile() {
  await migrateMirrors().catch(() => {});
  const tabs = await liveWorkspaceTabs();
  const open = new Map();
  for (const tab of tabs) {
    const id = workspaceIdFromUrl(tab.url);
    if (id) open.set(id, tab);
  }
  const everything = await local().get(null);
  const staleBindings = Object.keys(everything).filter((k) => k.startsWith(BINDING_PREFIX) && !tabs.some((t) => BINDING_PREFIX + t.id === k));
  if (staleBindings.length) await local().remove(staleBindings);
  const now = Date.now();
  for (const record of await allRecords()) {
    if (record.disposition === "deleted" && record.detachedAt && now - record.detachedAt > DELETED_RETENTION_MS) {
      await local().remove(RECORD_PREFIX + record.workspaceId);
      continue;
    }
    const tab = open.get(record.workspaceId);
    if (tab) {
      await local().set({ [BINDING_PREFIX + tab.id]: record.workspaceId });
      await writeRecord({ ...record, ...tabInfo(tab), detachedAt: null, detachReason: null });
    } else if (record.tabId !== null && record.tabId !== undefined) {
      await writeRecord({ ...record, tabId: null, detachedAt: now, detachReason: "browserCleared" });
    }
  }
}
