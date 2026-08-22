import {
  WORKSPACE_SESSION_BINDING_PREFIX,
  WORKSPACE_SESSION_CLEARED_BY_BROWSER,
  WORKSPACE_SESSION_CLOSED_BY_USER,
  WORKSPACE_SESSION_DETACH_BROWSER,
  WORKSPACE_SESSION_DETACH_TAB,
  WORKSPACE_SESSION_DETACH_WINDOW,
  WORKSPACE_SESSION_DISMISSED,
  WORKSPACE_SESSION_OPENING_LEASE_MS,
  WORKSPACE_SESSION_RECOVERY_ALARM,
  WORKSPACE_SESSION_RECOVERY_VERSION,
  WORKSPACE_SESSION_STORAGE_VERSION,
  createWorkspaceSessionGeneration,
  normalizeWorkspaceSessionId,
  workspaceSessionBindingTabId,
  workspaceSessionIdFromUrl,
  workspaceSessionMirrorTabId,
  workspaceSessionWorkspaceId
} from "../shared/workspace-session.js";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function positiveTabId(value) {
  const tabId = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

export function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export async function scheduleRecoveryLeaseAlarm(api, recovery, now) {
  const alarms = api?.alarms;
  const nextExpiry = (recovery?.candidates || [])
    .filter((candidate) => candidate.claimedAt && candidate.claimExpiresAt > now)
    .reduce((earliest, candidate) => Math.min(earliest, candidate.claimExpiresAt), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextExpiry)) {
    if (typeof alarms?.clear === "function") {
      try { await alarms.clear(WORKSPACE_SESSION_RECOVERY_ALARM); }
      catch {}
    }
    return;
  }
  if (typeof alarms?.create !== "function") throw new Error("Workspace session recovery alarm is unavailable");
  await alarms.create(WORKSPACE_SESSION_RECOVERY_ALARM, { when: nextExpiry });
}

function nullableTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function cloneSnapshot(value) {
  if (!plainObject(value)) return null;
  try {
    const cloned = JSON.parse(JSON.stringify(value));
    return plainObject(cloned) ? cloned : null;
  } catch {
    return null;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!plainObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

export function workspaceSessionSnapshotsEqual(first, second) {
  const firstSnapshot = cloneSnapshot(first);
  const secondSnapshot = cloneSnapshot(second);
  if (!firstSnapshot || !secondSnapshot) return false;
  try { return canonicalJson(firstSnapshot) === canonicalJson(secondSnapshot); }
  catch { return false; }
}

export function localStorageArea(api) {
  return api?.storage?.local || null;
}

export function sessionStorageArea(api) {
  return api?.storage?.session || null;
}

export function tabMetadata(tab = {}) {
  return {
    tabId: positiveTabId(tab.id),
    windowId: Number.isInteger(tab.windowId) ? tab.windowId : null,
    index: Number.isInteger(tab.index) && tab.index >= 0 ? tab.index : null,
    pinned: tab.pinned === true
  };
}

function tabHrefs(tab) {
  return [...new Set([tab?.url, tab?.pendingUrl].map((value) => String(value || "")).filter(Boolean))];
}

export function workspaceIdForChatClubTab(api, tab) {
  for (const href of tabHrefs(tab)) {
    if (!isChatClubWorkspaceHref(api, href)) continue;
    const workspaceId = workspaceSessionIdFromUrl(href);
    if (workspaceId) return workspaceId;
  }
  return "";
}

export function liveTabState(api, tabs = []) {
  const records = Array.isArray(tabs) ? tabs : [];
  const workspaceIds = new Set();
  const workspaceByTabId = new Map();
  const tabsByWorkspaceId = new Map();
  for (const tab of records) {
    const tabId = positiveTabId(tab?.id);
    const workspaceId = workspaceIdForChatClubTab(api, tab);
    if (tabId === null || !workspaceId) continue;
    workspaceIds.add(workspaceId);
    workspaceByTabId.set(tabId, workspaceId);
    const owners = tabsByWorkspaceId.get(workspaceId) || [];
    owners.push(tab);
    tabsByWorkspaceId.set(workspaceId, owners);
  }
  return { records, workspaceIds, workspaceByTabId, tabsByWorkspaceId };
}

function chatClubPageUrl(api) {
  try {
    return new URL(api.runtime.getURL("chatClub.html"));
  } catch {
    return null;
  }
}

function isChatClubWorkspaceHref(api, href) {
  if (!href) return false;
  try {
    const url = new URL(href);
    const page = chatClubPageUrl(api);
    if (page) {
      return url.protocol === page.protocol && url.host === page.host && url.pathname === page.pathname;
    }
    return /^(chrome|moz)-extension:$/.test(url.protocol) && /\/chatClub\.html$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isChatClubWorkspaceTab(api, tab) {
  return tabHrefs(tab).some((href) => isChatClubWorkspaceHref(api, href));
}

function snapshotLayoutName(snapshot) {
  return String(snapshot?.layout?.name || "").trim();
}

function snapshotAppIds(snapshot) {
  const ids = [];
  const seen = new Set();
  for (const group of Array.isArray(snapshot?.groups) ? snapshot.groups : []) {
    for (const entry of Array.isArray(group?.tabs) ? group.tabs : []) {
      const appId = String(entry?.appId || "").trim();
      if (!appId || seen.has(appId)) continue;
      seen.add(appId);
      ids.push(appId);
    }
  }
  return ids;
}

export function liveTabItem(api, tab, currentTabId, record) {
  const tabId = positiveTabId(tab?.id);
  const snapshot = record?.snapshot;
  return {
    tabId,
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : null,
    index: Number.isInteger(tab?.index) && tab.index >= 0 ? tab.index : null,
    workspaceId: workspaceIdForChatClubTab(api, tab),
    current: tabId !== null && tabId === currentTabId,
    title: String(tab?.title || "").trim(),
    layoutName: snapshotLayoutName(snapshot),
    appIds: snapshotAppIds(snapshot),
    topicTitle: String(snapshot?.topicTitle || "").trim(),
    topicTitleCustom: snapshot?.topicTitleCustom === true
  };
}

export function compareLiveTabs(left, right) {
  const windowA = Number.isInteger(left.windowId) ? left.windowId : Number.MAX_SAFE_INTEGER;
  const windowB = Number.isInteger(right.windowId) ? right.windowId : Number.MAX_SAFE_INTEGER;
  if (windowA !== windowB) return windowA - windowB;
  const indexA = Number.isInteger(left.index) ? left.index : Number.MAX_SAFE_INTEGER;
  const indexB = Number.isInteger(right.index) ? right.index : Number.MAX_SAFE_INTEGER;
  return indexA - indexB;
}

export async function restorePlacement(api, item = {}, sender = {}) {
  const windowId = Number.isInteger(item.windowId) ? item.windowId : null;
  const index = Number.isInteger(item.index) && item.index >= 0 ? item.index : null;
  const pinned = item.pinned === true;
  if (windowId === null) {
    const senderWindowId = Number.isInteger(sender?.tab?.windowId) ? sender.tab.windowId : null;
    return { windowId: senderWindowId, index: null, pinned };
  }
  if (typeof api?.windows?.get !== "function") return { windowId, index, pinned };
  try {
    await api.windows.get(windowId);
    return { windowId, index, pinned };
  } catch {
    const senderWindowId = Number.isInteger(sender?.tab?.windowId) ? sender.tab.windowId : null;
    return { windowId: senderWindowId, index: null, pinned };
  }
}

function normalizedGeneration(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedOwner(value = {}) {
  const source = plainObject(value) ? value : {};
  return {
    tabId: positiveTabId(source.tabId),
    windowId: Number.isInteger(source.windowId) ? source.windowId : null,
    index: Number.isInteger(source.index) && source.index >= 0 ? source.index : null,
    pinned: source.pinned === true
  };
}

function stableDetach(value = {}) {
  const source = plainObject(value?.detach) ? value.detach : {};
  const at = nullableTime(source.at ?? value?.detachedAt);
  const kind = [WORKSPACE_SESSION_DETACH_TAB, WORKSPACE_SESSION_DETACH_WINDOW, WORKSPACE_SESSION_DETACH_BROWSER]
    .includes(source.kind || value?.detachedKind)
    ? String(source.kind || value.detachedKind)
    : "";
  const runtimeId = String(source.runtimeId || value?.detachedRuntimeId || "").trim();
  return at === null ? null : { at, kind, runtimeId };
}

export function stableWorkspaceRecord(key, value) {
  if (!plainObject(value)) return null;
  const workspaceId = normalizeWorkspaceSessionId(value.workspaceId) || workspaceSessionWorkspaceId(key);
  if (!workspaceId) return null;
  const sourceStorageVersion = Number(value.storageVersion) === WORKSPACE_SESSION_STORAGE_VERSION
    ? WORKSPACE_SESSION_STORAGE_VERSION
    : 1;
  const detach = stableDetach(value);
  const resolution = sourceStorageVersion === WORKSPACE_SESSION_STORAGE_VERSION
    && [WORKSPACE_SESSION_CLOSED_BY_USER, WORKSPACE_SESSION_DISMISSED].includes(value.resolution)
    ? value.resolution
    : "";
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    sourceStorageVersion,
    generation: normalizedGeneration(value.generation),
    workspaceId,
    snapshot: cloneSnapshot(value.snapshot),
    owner: normalizedOwner(value.owner),
    updatedAt: finiteTime(value.updatedAt),
    detach,
    detachedAt: detach?.at ?? null,
    detachedKind: detach?.kind || "",
    detachedRuntimeId: detach?.runtimeId || "",
    resolution,
    closedBy: resolution === WORKSPACE_SESSION_CLOSED_BY_USER ? WORKSPACE_SESSION_CLOSED_BY_USER : ""
  };
}

export function bindingRecord(key, value) {
  if (!plainObject(value)) return null;
  const tabId = positiveTabId(value.tabId) || workspaceSessionBindingTabId(key);
  const workspaceId = normalizeWorkspaceSessionId(value.workspaceId);
  if (tabId === null || !workspaceId) return null;
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation: normalizedGeneration(value.generation),
    workspaceId,
    tabId,
    windowId: Number.isInteger(value.windowId) ? value.windowId : null,
    index: Number.isInteger(value.index) && value.index >= 0 ? value.index : null,
    pinned: value.pinned === true,
    updatedAt: finiteTime(value.updatedAt),
    detachedAt: nullableTime(value.detachedAt)
  };
}

export function legacyMirrorRecord(key, value) {
  if (!plainObject(value)) return null;
  const tabId = workspaceSessionMirrorTabId(key);
  const snapshot = cloneSnapshot(value.snapshot);
  const generation = normalizedGeneration(value.generation);
  return tabId === null || !snapshot || !generation ? null : { tabId, generation, snapshot };
}

export function recoveryRecord(value, generation, now) {
  if (!plainObject(value) || ![1, WORKSPACE_SESSION_RECOVERY_VERSION].includes(Number(value.version))) return null;
  if (normalizedGeneration(value.generation) !== generation) return null;
  const sourceVersion = Number(value.version);
  const recoveryCreatedAt = finiteTime(value.createdAt, now);
  const candidates = (Array.isArray(value.candidates) ? value.candidates : [])
    .map((candidate) => {
      if (!plainObject(candidate)) return null;
      const workspaceId = normalizeWorkspaceSessionId(candidate.workspaceId);
      if (!workspaceId) return null;
      const storedEventId = typeof candidate.eventId === "string" ? candidate.eventId.trim() : "";
      const claimedAt = finiteTime(candidate.claimedAt);
      const claimExpiresAt = finiteTime(candidate.claimExpiresAt, claimedAt + WORKSPACE_SESSION_OPENING_LEASE_MS);
      const opening = sourceVersion === WORKSPACE_SESSION_RECOVERY_VERSION
        && claimedAt > 0
        && !finiteTime(candidate.committedAt)
        && claimExpiresAt > now;
      return {
        workspaceId,
        eventId: storedEventId || `event-legacy-${recoveryCreatedAt.toString(36)}-${workspaceId}`,
        windowId: Number.isInteger(candidate.windowId) ? candidate.windowId : null,
        index: Number.isInteger(candidate.index) && candidate.index >= 0 ? candidate.index : null,
        pinned: candidate.pinned === true,
        source: candidate.source === "legacy" ? "legacy" : "stable",
        clearedBy: candidate.clearedBy === WORKSPACE_SESSION_CLEARED_BY_BROWSER
          ? WORKSPACE_SESSION_CLEARED_BY_BROWSER
          : "",
        claimedAt: opening ? claimedAt : 0,
        claimedTabId: opening ? positiveTabId(candidate.claimedTabId) : null,
        claimId: opening ? String(candidate.claimId || "") : "",
        claimRuntimeId: opening ? String(candidate.claimRuntimeId || "") : "",
        claimExpiresAt: opening ? claimExpiresAt : 0,
        committedAt: 0
      };
    })
    .filter(Boolean);
  return {
    version: WORKSPACE_SESSION_RECOVERY_VERSION,
    id: String(value.id || ""),
    runtimeId: String(value.runtimeId || ""),
    generation,
    reason: String(value.reason || "runtime-restart"),
    createdAt: recoveryCreatedAt,
    expiresAt: 0,
    candidates
  };
}

export function nakedRecoveryCandidate(recovery, meta) {
  const currentTabClaims = recovery.candidates.filter((candidate) => (
    candidate.claimedAt && candidate.claimedTabId === meta.tabId
  ));
  if (currentTabClaims.length > 1) {
    throw new Error("Workspace session claim found ambiguous current-tab leases");
  }
  if (currentTabClaims.length === 1) return currentTabClaims[0];
  const available = recovery.candidates.filter((candidate) => (
    !candidate.claimedAt && candidate.clearedBy !== WORKSPACE_SESSION_CLEARED_BY_BROWSER
  ));
  const sameWindow = meta.windowId === null
    ? []
    : available.filter((candidate) => candidate.windowId === meta.windowId);
  const noMetadata = available.filter((candidate) => candidate.windowId === null);
  return sameWindow.length === 1
    ? sameWindow[0]
    : sameWindow.length === 0 && noMetadata.length === 1
      ? noMetadata[0]
      : null;
}

export function runtimeMarker(value) {
  if (!plainObject(value) || Number(value.version) !== WORKSPACE_SESSION_STORAGE_VERSION) return null;
  const runtimeId = String(value.runtimeId || "").trim();
  return runtimeId ? {
    version: WORKSPACE_SESSION_STORAGE_VERSION,
    runtimeId,
    startedAt: finiteTime(value.startedAt),
    atRiskWorkspaceIds: [...new Set((Array.isArray(value.atRiskWorkspaceIds) ? value.atRiskWorkspaceIds : [])
      .map(normalizeWorkspaceSessionId)
      .filter(Boolean))]
  } : null;
}

export function stableRecordForClaim(existing, workspaceId, generation, snapshot, tab, now) {
  const meta = tabMetadata(tab);
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    snapshot: snapshot ?? existing?.snapshot ?? null,
    owner: meta,
    updatedAt: now,
    detach: null,
    detachedAt: null,
    detachedKind: "",
    detachedRuntimeId: "",
    resolution: "",
    closedBy: ""
  };
}

export function bindingForClaim(workspaceId, generation, tab, now) {
  const meta = tabMetadata(tab);
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    tabId: meta.tabId,
    windowId: meta.windowId,
    index: meta.index,
    pinned: meta.pinned,
    updatedAt: now,
    detachedAt: null
  };
}

export function recoveryCandidate(record, source = "stable", clearedBy = "") {
  return {
    workspaceId: record.workspaceId,
    eventId: `event-${createWorkspaceSessionGeneration().replace(/^workspace-/, "")}`,
    windowId: record.owner?.windowId ?? null,
    index: record.owner?.index ?? null,
    pinned: record.owner?.pinned === true,
    source,
    clearedBy: clearedBy === WORKSPACE_SESSION_CLEARED_BY_BROWSER
      ? WORKSPACE_SESSION_CLEARED_BY_BROWSER
      : "",
    claimedAt: 0,
    claimedTabId: null,
    claimId: "",
    claimRuntimeId: "",
    claimExpiresAt: 0,
    committedAt: 0
  };
}

export function workspaceRecordIsLive(record, live) {
  if (!record) return false;
  return live.workspaceIds.has(record.workspaceId);
}

export function retainWorkspaceOwner(existing, workspaceId, generation, tab, now) {
  if (!existing) return null;
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation: existing.generation || generation,
    workspaceId,
    snapshot: existing.snapshot,
    owner: tabMetadata(tab),
    updatedAt: now,
    detach: null,
    detachedAt: null,
    detachedKind: "",
    detachedRuntimeId: "",
    resolution: "",
    closedBy: ""
  };
}

export function claimToken() {
  return `claim-${createWorkspaceSessionGeneration().replace(/^workspace-/, "")}`;
}

export function createRuntimeMarker(now) {
  return {
    version: WORKSPACE_SESSION_STORAGE_VERSION,
    runtimeId: createWorkspaceSessionGeneration(),
    startedAt: now,
    atRiskWorkspaceIds: []
  };
}

export function markerHasAtRiskWorkspace(marker, workspaceId) {
  return Boolean(marker?.atRiskWorkspaceIds?.includes(workspaceId));
}

export function markerWithAtRiskWorkspaces(marker, workspaceIds) {
  return {
    ...marker,
    atRiskWorkspaceIds: [...new Set([
      ...(marker?.atRiskWorkspaceIds || []),
      ...workspaceIds
    ].map(normalizeWorkspaceSessionId).filter(Boolean))]
  };
}

export function markerWithoutAtRiskWorkspace(marker, workspaceId) {
  if (!marker) return null;
  return {
    ...marker,
    atRiskWorkspaceIds: marker.atRiskWorkspaceIds.filter((item) => item !== workspaceId)
  };
}

function mergeRecoveryCandidates(existing = [], incoming = []) {
  const byId = new Map(existing.map((candidate) => [candidate.workspaceId, candidate]));
  for (const candidate of incoming) {
    const current = byId.get(candidate.workspaceId);
    if (!current) {
      byId.set(candidate.workspaceId, candidate);
      continue;
    }
    byId.set(candidate.workspaceId, {
      ...candidate,
      ...current,
      clearedBy: candidate.clearedBy === WORKSPACE_SESSION_CLEARED_BY_BROWSER
        ? WORKSPACE_SESSION_CLEARED_BY_BROWSER
        : current.clearedBy
    });
  }
  return [...byId.values()];
}

export function createRecovery(marker, generation, now, reason, existing = null, incoming = []) {
  return {
    version: WORKSPACE_SESSION_RECOVERY_VERSION,
    id: existing?.id || recoveryId(now),
    runtimeId: marker?.runtimeId || existing?.runtimeId || "",
    generation,
    reason: String(reason || existing?.reason || "runtime-restart"),
    createdAt: existing?.createdAt || now,
    expiresAt: 0,
    candidates: mergeRecoveryCandidates(existing?.candidates, incoming)
  };
}

export function rearmRecoveryCandidate(candidate, clearedBy = WORKSPACE_SESSION_CLEARED_BY_BROWSER) {
  if (!candidate) return;
  candidate.clearedBy = clearedBy;
  candidate.claimedAt = 0;
  candidate.claimedTabId = null;
  candidate.claimId = "";
  candidate.claimRuntimeId = "";
  candidate.claimExpiresAt = 0;
  candidate.committedAt = 0;
}

function recoveryId(now) {
  return `recovery-${now.toString(36)}-${createWorkspaceSessionGeneration().replace(/^workspace-/, "")}`;
}

export function currentStableRecords(stored = {}) {
  const records = new Map();
  for (const [key, value] of Object.entries(stored)) {
    if (!workspaceSessionWorkspaceId(key)) continue;
    const record = stableWorkspaceRecord(key, value);
    if (record) records.set(record.workspaceId, record);
  }
  return records;
}

export function currentBindings(stored = {}) {
  const records = new Map();
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(WORKSPACE_SESSION_BINDING_PREFIX)) continue;
    const record = bindingRecord(key, value);
    if (record) records.set(record.tabId, record);
  }
  return records;
}
