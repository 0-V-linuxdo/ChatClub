import {
  WORKSPACE_SESSION_CLEARED_BY_BROWSER,
  WORKSPACE_SESSION_DISMISSED,
  WORKSPACE_SESSION_RECOVERY_KEY,
  WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
  WORKSPACE_SESSION_STORAGE_VERSION,
  normalizeWorkspaceSessionId,
  workspaceSessionWorkspaceKey
} from "../shared/workspace-session.js";
import { workspaceSnapshotHasConversation } from "../shared/workspace-tab-memory.js";
import {
  cloneSnapshot,
  compareRememberedTabs,
  currentStableRecords,
  finiteTime,
  isChatClubWorkspaceTab,
  liveTabItem,
  liveTabState,
  localStorageArea,
  markerWithoutAtRiskWorkspace,
  positiveTabId,
  recoveryRecord,
  runtimeMarker,
  sessionStorageArea,
  stableWorkspaceRecord,
  workspaceIdForChatClubTab
} from "./workspace-session-helpers.js";

export function clearedTabItem(candidate) {
  return {
    workspaceId: candidate.workspaceId,
    eventId: candidate.eventId,
    windowId: candidate.windowId,
    index: candidate.index,
    pinned: candidate.pinned === true
  };
}

export function requestedRecoveryEvents(request = {}) {
  const requested = new Map();
  for (const item of Array.isArray(request.candidates) ? request.candidates : []) {
    const workspaceId = normalizeWorkspaceSessionId(item?.workspaceId);
    const eventId = typeof item?.eventId === "string" ? item.eventId.trim() : "";
    if (workspaceId && eventId) requested.set(workspaceId, eventId);
  }
  return requested;
}

export function recoveryEventWasRequested(candidate, requested) {
  return requested.get(candidate.workspaceId) === candidate.eventId;
}

export function unclaimedBrowserCleared(recovery, live, stableRecords = new Map()) {
  if (!recovery) return [];
  return recovery.candidates.filter((candidate) => (
    candidate.clearedBy === WORKSPACE_SESSION_CLEARED_BY_BROWSER && !candidate.claimedAt
    && !live?.workspaceIds?.has(candidate.workspaceId)
    && !stableRecords.get(candidate.workspaceId)?.resolution
  ));
}

function rememberedWorkspaceRecord(record) {
  return Boolean(
    record
    && record.resolution !== WORKSPACE_SESSION_DISMISSED
    && workspaceSnapshotHasConversation(record.snapshot)
  );
}

function listRememberedWorkspaceTabs(api, stored, live, currentTabId) {
  const stableRecords = currentStableRecords(stored || {});
  const items = [];
  const seen = new Set();
  for (const tab of Array.isArray(live.records) ? live.records : []) {
    if (!isChatClubWorkspaceTab(api, tab)) continue;
    const workspaceId = workspaceIdForChatClubTab(api, tab);
    if (!workspaceId) continue;
    const record = stableRecords.get(workspaceId);
    if (!rememberedWorkspaceRecord(record)) continue;
    items.push(liveTabItem(api, tab, currentTabId, record));
    seen.add(workspaceId);
  }
  for (const record of stableRecords.values()) {
    if (seen.has(record.workspaceId) || live.workspaceIds?.has(record.workspaceId)) continue;
    if (!rememberedWorkspaceRecord(record)) continue;
    items.push(liveTabItem(api, null, currentTabId, record));
  }
  return items.sort(compareRememberedTabs);
}

export async function listClearedWorkspaceTabsOperation(api, options, ensureGeneration) {
  const storage = localStorageArea(api);
  if (typeof storage?.get !== "function") return { tabs: [] };
  if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
  const now = finiteTime(options.now, Date.now());
  const generation = await ensureGeneration(storage);
  const [stored, tabs] = await Promise.all([storage.get(null), api.tabs.query({})]);
  if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
  const live = liveTabState(api, tabs);
  const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
  return { tabs: unclaimedBrowserCleared(recovery, live, currentStableRecords(stored)).map(clearedTabItem) };
}

export async function listLiveWorkspaceTabsOperation(api, sender = {}) {
  if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
  const storage = localStorageArea(api);
  const [stored, tabs] = await Promise.all([
    typeof storage?.get === "function" ? storage.get(null) : Promise.resolve({}),
    api.tabs.query({})
  ]);
  if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
  const live = liveTabState(api, tabs);
  const currentTabId = positiveTabId(sender?.tab?.id);
  return { tabs: listRememberedWorkspaceTabs(api, stored || {}, live, currentTabId) };
}

function titleSnapshotUpdate(record, title, custom) {
  const snapshot = cloneSnapshot(record.snapshot);
  if (!snapshot) throw new Error("Workspace session snapshot is unavailable");
  snapshot.topicTitle = String(title || "").trim();
  snapshot.topicTitleCustom = custom !== false;
  return {
    record: {
      ...record,
      snapshot,
      updatedAt: Date.now(),
      storageVersion: WORKSPACE_SESSION_STORAGE_VERSION
    },
    snapshot
  };
}

export async function setWorkspaceTabTitleOperation(api, request = {}) {
  const tabId = positiveTabId(request.tabId);
  const requestedWorkspaceId = normalizeWorkspaceSessionId(request.workspaceId);
  const storage = localStorageArea(api);
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new Error("Workspace session title storage is unavailable");
  }

  let workspaceId = requestedWorkspaceId;
  if (tabId !== null) {
    if (typeof api?.tabs?.get !== "function") throw new Error("Workspace session tab lookup is unavailable");
    const tab = await api.tabs.get(tabId).catch(() => null);
    if (!tab || !isChatClubWorkspaceTab(api, tab)) throw new Error("Workspace tab is not a live ChatClub page");
    workspaceId = workspaceIdForChatClubTab(api, tab) || workspaceId;
  }
  if (!workspaceId) throw new Error("Workspace tab is missing a workspace id");
  const key = workspaceSessionWorkspaceKey(workspaceId);
  const stored = await storage.get(key);
  const record = stableWorkspaceRecord(key, stored?.[key]);
  if (!record?.snapshot) throw new Error("Workspace session snapshot is unavailable");
  const { record: nextRecord, snapshot } = titleSnapshotUpdate(record, request.title, request.custom);
  await storage.set({ [key]: nextRecord });
  const response = {
    updated: true,
    workspaceId,
    title: snapshot.topicTitle,
    custom: snapshot.topicTitleCustom
  };
  if (tabId !== null) response.tabId = tabId;
  return response;
}

export async function focusWorkspaceTabOperation(api, request = {}, sender = {}) {
  const tabId = positiveTabId(request.tabId);
  if (tabId === null) throw new Error("Workspace tab id is invalid");
  if (typeof api?.tabs?.get !== "function") throw new Error("Workspace session tab lookup is unavailable");
  const tab = await api.tabs.get(tabId).catch(() => null);
  if (!tab || !isChatClubWorkspaceTab(api, tab)) throw new Error("Workspace tab is not a live ChatClub page");
  const currentTabId = positiveTabId(sender?.tab?.id);
  if (currentTabId === tabId) return { focused: true, tabId, current: true };
  if (typeof api.tabs.update === "function") await api.tabs.update(tabId, { active: true });
  if (Number.isInteger(tab.windowId) && typeof api.windows?.update === "function") {
    await api.windows.update(tab.windowId, { focused: true });
  }
  return { focused: true, tabId, current: false };
}

export async function forgetRememberedWorkspaceTabOperation(api, request = {}, options = {}, ensureGeneration) {
  const workspaceId = normalizeWorkspaceSessionId(request.workspaceId);
  if (!workspaceId) throw new Error("Workspace tab is missing a workspace id");
  const storage = localStorageArea(api);
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new Error("Workspace session forget storage is unavailable");
  }
  if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
  const now = finiteTime(options.now, Date.now());
  const generation = typeof ensureGeneration === "function" ? await ensureGeneration(storage) : "";
  const session = sessionStorageArea(api);
  const [stored, tabs, markerStored] = await Promise.all([
    storage.get(null),
    api.tabs.query({}),
    typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
  ]);
  if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
  const live = liveTabState(api, tabs);
  const stableKey = workspaceSessionWorkspaceKey(workspaceId);
  const record = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
  if (!record) return { forgotten: false, workspaceId, closed: false };
  const recovery = generation
    ? recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now)
    : null;
  const remaining = (recovery?.candidates || []).filter((candidate) => candidate.workspaceId !== workspaceId);
  const updates = {
    [stableKey]: {
      ...record,
      storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
      sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
      resolution: WORKSPACE_SESSION_DISMISSED,
      closedBy: "",
      updatedAt: Math.max(record.updatedAt, now)
    }
  };
  if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = { ...recovery, candidates: remaining };
  await storage.set(updates);
  if (recovery && !remaining.length && typeof storage.remove === "function") {
    await storage.remove(WORKSPACE_SESSION_RECOVERY_KEY);
  }
  const marker = markerWithoutAtRiskWorkspace(
    runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]),
    workspaceId
  );
  if (marker && typeof session?.set === "function") {
    await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
  }
  const liveTabs = live.tabsByWorkspaceId.get(workspaceId) || [];
  let closed = false;
  let closedTabId = null;
  if (typeof api?.tabs?.remove === "function") {
    for (const tab of liveTabs) {
      const tabId = positiveTabId(tab?.id);
      if (tabId === null) continue;
      try {
        await api.tabs.remove(tabId);
        closed = true;
        closedTabId = tabId;
      } catch {}
    }
  }
  const response = { forgotten: true, workspaceId, closed };
  if (closedTabId !== null) response.tabId = closedTabId;
  return response;
}
