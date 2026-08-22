import {
  WORKSPACE_SESSION_CLEARED_BY_BROWSER,
  WORKSPACE_SESSION_RECOVERY_KEY,
  WORKSPACE_SESSION_STORAGE_VERSION,
  normalizeWorkspaceSessionId,
  workspaceSessionWorkspaceKey
} from "../shared/workspace-session.js";
import {
  cloneSnapshot,
  compareLiveTabs,
  currentStableRecords,
  finiteTime,
  isChatClubWorkspaceTab,
  liveTabItem,
  liveTabState,
  localStorageArea,
  positiveTabId,
  recoveryRecord,
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
  const stableRecords = currentStableRecords(stored || {});
  const currentTabId = positiveTabId(sender?.tab?.id);
  return {
    tabs: tabs
      .filter((tab) => isChatClubWorkspaceTab(api, tab))
      .map((tab) => {
        const workspaceId = workspaceIdForChatClubTab(api, tab);
        return liveTabItem(api, tab, currentTabId, workspaceId ? stableRecords.get(workspaceId) : null);
      })
      .filter((item) => item.tabId !== null)
      .sort(compareLiveTabs)
  };
}

export async function setWorkspaceTabTitleOperation(api, request = {}) {
  const tabId = positiveTabId(request.tabId);
  if (tabId === null) throw new Error("Workspace tab id is invalid");
  if (typeof api?.tabs?.get !== "function") throw new Error("Workspace session tab lookup is unavailable");
  const storage = localStorageArea(api);
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new Error("Workspace session title storage is unavailable");
  }
  const tab = await api.tabs.get(tabId).catch(() => null);
  if (!tab || !isChatClubWorkspaceTab(api, tab)) throw new Error("Workspace tab is not a live ChatClub page");
  const workspaceId = workspaceIdForChatClubTab(api, tab);
  if (!workspaceId) throw new Error("Workspace tab is missing a workspace id");
  const key = workspaceSessionWorkspaceKey(workspaceId);
  const stored = await storage.get(key);
  const record = stableWorkspaceRecord(key, stored?.[key]);
  if (!record?.snapshot) throw new Error("Workspace session snapshot is unavailable");
  const snapshot = cloneSnapshot(record.snapshot);
  if (!snapshot) throw new Error("Workspace session snapshot is unavailable");
  snapshot.topicTitle = String(request.title || "").trim();
  snapshot.topicTitleCustom = request.custom !== false;
  await storage.set({
    [key]: { ...record, snapshot, updatedAt: Date.now(), storageVersion: WORKSPACE_SESSION_STORAGE_VERSION }
  });
  return { updated: true, tabId, title: snapshot.topicTitle, custom: snapshot.topicTitleCustom };
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
