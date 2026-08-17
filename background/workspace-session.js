import { BUILTIN_CHAT_APPS, STORAGE_KEYS } from "../shared/constants.js";
import {
  DEFAULT_WORKSPACE_SESSION_GENERATION,
  WORKSPACE_SESSION_BINDING_PREFIX,
  WORKSPACE_SESSION_CLEARED_BY_BROWSER,
  WORKSPACE_SESSION_CLOSED_BY_USER,
  WORKSPACE_SESSION_DETACHED_TTL_MS,
  WORKSPACE_SESSION_GENERATION_KEY,
  WORKSPACE_SESSION_RECENT_DETACH_MS,
  WORKSPACE_SESSION_RECOVERY_KEY,
  WORKSPACE_SESSION_RECOVERY_TTL_MS,
  WORKSPACE_SESSION_RECOVERY_VERSION,
  WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
  WORKSPACE_SESSION_STORAGE_VERSION,
  WORKSPACE_SESSION_USER_CLOSE_ALARM,
  WORKSPACE_SESSION_USER_CLOSE_CONFIRM_MS,
  createWorkspaceSessionGeneration,
  createWorkspaceSessionId,
  normalizeWorkspaceSessionGeneration,
  normalizeWorkspaceSessionId,
  workspaceSessionBindingKey,
  workspaceSessionBindingTabId,
  workspaceSessionIdFromUrl,
  workspaceSessionMirrorKey,
  workspaceSessionMirrorTabId,
  workspaceSessionWorkspaceId,
  workspaceSessionWorkspaceKey,
  workspaceSnapshotIsNonEmpty
} from "../shared/workspace-session.js";
import { openWorkspaceTab } from "./tab-runtime.js";

let workspaceSessionChain = Promise.resolve();

function queueWorkspaceSession(task) {
  const queued = workspaceSessionChain
    .catch(() => {})
    .then(task);
  workspaceSessionChain = queued.then(() => undefined, () => undefined);
  return queued;
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveTabId(value) {
  const tabId = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nullableTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cloneSnapshot(value) {
  if (!plainObject(value)) return null;
  try {
    const cloned = JSON.parse(JSON.stringify(value));
    return plainObject(cloned) ? cloned : null;
  } catch {
    return null;
  }
}

function localStorageArea(api) {
  return api?.storage?.local || null;
}

function sessionStorageArea(api) {
  return api?.storage?.session || null;
}

function tabMetadata(tab = {}) {
  return {
    tabId: positiveTabId(tab.id),
    windowId: Number.isInteger(tab.windowId) ? tab.windowId : null,
    index: Number.isInteger(tab.index) && tab.index >= 0 ? tab.index : null,
    pinned: tab.pinned === true
  };
}

function liveTabState(tabs = []) {
  const records = Array.isArray(tabs) ? tabs : [];
  const tabIds = new Set();
  const workspaceIds = new Set();
  for (const tab of records) {
    const tabId = positiveTabId(tab?.id);
    if (tabId !== null) tabIds.add(tabId);
    const workspaceId = workspaceSessionIdFromUrl(tab?.url || tab?.pendingUrl);
    if (workspaceId) workspaceIds.add(workspaceId);
  }
  return { records, tabIds, workspaceIds };
}

function chatClubPageUrl(api) {
  try {
    return new URL(api.runtime.getURL("chatClub.html"));
  } catch {
    return null;
  }
}

function tabHref(tab) {
  return String(tab?.url || tab?.pendingUrl || "");
}

function isChatClubWorkspaceTab(api, tab) {
  const href = tabHref(tab);
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

function liveTabItem(tab, currentTabId, record) {
  const tabId = positiveTabId(tab?.id);
  const snapshot = record?.snapshot;
  return {
    tabId,
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : null,
    index: Number.isInteger(tab?.index) && tab.index >= 0 ? tab.index : null,
    workspaceId: workspaceSessionIdFromUrl(tabHref(tab)) || "",
    current: tabId !== null && tabId === currentTabId,
    title: String(tab?.title || "").trim(),
    layoutName: snapshotLayoutName(snapshot),
    appIds: snapshotAppIds(snapshot)
  };
}

function compareLiveTabs(left, right) {
  const windowA = Number.isInteger(left.windowId) ? left.windowId : Number.MAX_SAFE_INTEGER;
  const windowB = Number.isInteger(right.windowId) ? right.windowId : Number.MAX_SAFE_INTEGER;
  if (windowA !== windowB) return windowA - windowB;
  const indexA = Number.isInteger(left.index) ? left.index : Number.MAX_SAFE_INTEGER;
  const indexB = Number.isInteger(right.index) ? right.index : Number.MAX_SAFE_INTEGER;
  return indexA - indexB;
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

function stableWorkspaceRecord(key, value) {
  if (!plainObject(value)) return null;
  const workspaceId = normalizeWorkspaceSessionId(value.workspaceId) || workspaceSessionWorkspaceId(key);
  if (!workspaceId) return null;
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation: normalizedGeneration(value.generation),
    workspaceId,
    snapshot: cloneSnapshot(value.snapshot),
    owner: normalizedOwner(value.owner),
    updatedAt: finiteTime(value.updatedAt),
    detachedAt: nullableTime(value.detachedAt),
    closedBy: value.closedBy === WORKSPACE_SESSION_CLOSED_BY_USER ? WORKSPACE_SESSION_CLOSED_BY_USER : ""
  };
}

function bindingRecord(key, value) {
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

function legacyMirrorRecord(key, value) {
  if (!plainObject(value)) return null;
  const tabId = workspaceSessionMirrorTabId(key);
  const snapshot = cloneSnapshot(value.snapshot);
  const generation = normalizedGeneration(value.generation);
  return tabId === null || !snapshot || !generation ? null : { tabId, generation, snapshot };
}

function recoveryRecord(value, generation, now) {
  if (!plainObject(value) || Number(value.version) !== WORKSPACE_SESSION_RECOVERY_VERSION) return null;
  if (normalizedGeneration(value.generation) !== generation) return null;
  const expiresAt = finiteTime(value.expiresAt);
  if (!expiresAt || expiresAt <= now) return null;
  const candidates = (Array.isArray(value.candidates) ? value.candidates : [])
    .map((candidate) => {
      if (!plainObject(candidate)) return null;
      const workspaceId = normalizeWorkspaceSessionId(candidate.workspaceId);
      if (!workspaceId) return null;
      return {
        workspaceId,
        windowId: Number.isInteger(candidate.windowId) ? candidate.windowId : null,
        index: Number.isInteger(candidate.index) && candidate.index >= 0 ? candidate.index : null,
        pinned: candidate.pinned === true,
        source: candidate.source === "legacy" ? "legacy" : "stable",
        clearedBy: candidate.clearedBy === WORKSPACE_SESSION_CLEARED_BY_BROWSER
          ? WORKSPACE_SESSION_CLEARED_BY_BROWSER
          : "",
        claimedAt: finiteTime(candidate.claimedAt),
        claimedTabId: positiveTabId(candidate.claimedTabId),
        claimId: String(candidate.claimId || ""),
        committedAt: finiteTime(candidate.committedAt)
      };
    })
    .filter(Boolean);
  return {
    version: WORKSPACE_SESSION_RECOVERY_VERSION,
    id: String(value.id || ""),
    runtimeId: String(value.runtimeId || ""),
    generation,
    reason: String(value.reason || "runtime-restart"),
    createdAt: finiteTime(value.createdAt, now),
    expiresAt,
    candidates
  };
}

function runtimeMarker(value) {
  if (!plainObject(value) || Number(value.version) !== WORKSPACE_SESSION_STORAGE_VERSION) return null;
  const runtimeId = String(value.runtimeId || "").trim();
  return runtimeId ? {
    version: WORKSPACE_SESSION_STORAGE_VERSION,
    runtimeId,
    startedAt: finiteTime(value.startedAt)
  } : null;
}

async function ensureGenerationInternal(storage) {
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new Error("Workspace session generation storage is unavailable");
  }
  const stored = await storage.get(WORKSPACE_SESSION_GENERATION_KEY);
  const current = normalizedGeneration(stored?.[WORKSPACE_SESSION_GENERATION_KEY]);
  if (current) return current;
  await storage.set({ [WORKSPACE_SESSION_GENERATION_KEY]: DEFAULT_WORKSPACE_SESSION_GENERATION });
  return DEFAULT_WORKSPACE_SESSION_GENERATION;
}

function stableRecordForClaim(existing, workspaceId, generation, snapshot, tab, now) {
  const meta = tabMetadata(tab);
  return {
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation,
    workspaceId,
    snapshot: snapshot ?? existing?.snapshot ?? null,
    owner: meta,
    updatedAt: now,
    detachedAt: null,
    closedBy: ""
  };
}

function bindingForClaim(workspaceId, generation, tab, now) {
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

function recoveryCandidate(record, source = "stable", clearedBy = "") {
  return {
    workspaceId: record.workspaceId,
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
    committedAt: 0
  };
}

function workspaceRecordIsLive(record, live) {
  if (!record) return false;
  if (live.workspaceIds.has(record.workspaceId)) return true;
  return record.owner.tabId !== null && live.tabIds.has(record.owner.tabId);
}

function homeHrefByAppIdFromStored(stored = {}) {
  const homes = {};
  for (const app of BUILTIN_CHAT_APPS) {
    if (app?.id && app?.url) homes[app.id] = app.url;
  }
  const custom = stored?.[STORAGE_KEYS.customConfig];
  if (Array.isArray(custom)) {
    for (const app of custom) {
      if (app?.id && app?.url && !homes[app.id]) homes[app.id] = app.url;
    }
  }
  return homes;
}

function isBrowserClearedRecord(record, live, now, homeHrefByAppId, options = {}) {
  if (!record || workspaceRecordIsLive(record, live)) return false;
  if (record.closedBy === WORKSPACE_SESSION_CLOSED_BY_USER) return false;
  if (!workspaceSnapshotIsNonEmpty(record.snapshot, homeHrefByAppId)) return false;
  if (options.restartRecovery === true) return true;
  if (record.detachedAt === null) return true;
  return now - record.detachedAt <= WORKSPACE_SESSION_USER_CLOSE_CONFIRM_MS;
}

async function restorePlacement(api, item = {}, sender = {}) {
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

function retainWorkspaceOwner(existing, workspaceId, generation, tab, now) {
  if (!existing?.snapshot) return null;
  return {
    ...existing,
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    generation: existing.generation || generation,
    workspaceId,
    snapshot: existing.snapshot,
    owner: tabMetadata(tab),
    updatedAt: now,
    detachedAt: null,
    closedBy: ""
  };
}

function claimToken() {
  return `claim-${createWorkspaceSessionGeneration().replace(/^workspace-/, "")}`;
}

async function scheduleUserCloseConfirm(api, now) {
  const alarms = api?.alarms;
  if (typeof alarms?.create !== "function") return;
  try {
    await alarms.create(WORKSPACE_SESSION_USER_CLOSE_ALARM, {
      when: now + WORKSPACE_SESSION_USER_CLOSE_CONFIRM_MS
    });
  } catch {}
}

function markClosedByUser(stableRecords, live, now, updates) {
  for (const [workspaceId, record] of stableRecords) {
    if (record.closedBy === WORKSPACE_SESSION_CLOSED_BY_USER || record.detachedAt === null) continue;
    if (workspaceRecordIsLive(record, live)) continue;
    if (now - record.detachedAt < WORKSPACE_SESSION_USER_CLOSE_CONFIRM_MS) continue;
    const updated = { ...record, closedBy: WORKSPACE_SESSION_CLOSED_BY_USER };
    stableRecords.set(workspaceId, updated);
    updates[workspaceSessionWorkspaceKey(workspaceId)] = updated;
  }
}

function mergeRecoveryCandidates(existing = [], incoming = []) {
  const byId = new Map(existing.map((candidate) => [candidate.workspaceId, candidate]));
  for (const candidate of incoming) {
    if (!byId.has(candidate.workspaceId)) byId.set(candidate.workspaceId, candidate);
  }
  return [...byId.values()];
}

function recoveryId(now) {
  return `recovery-${now.toString(36)}-${createWorkspaceSessionGeneration().replace(/^workspace-/, "")}`;
}

function currentStableRecords(stored = {}) {
  const records = new Map();
  for (const [key, value] of Object.entries(stored)) {
    if (!workspaceSessionWorkspaceId(key)) continue;
    const record = stableWorkspaceRecord(key, value);
    if (record) records.set(record.workspaceId, record);
  }
  return records;
}

function currentBindings(stored = {}) {
  const records = new Map();
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(WORKSPACE_SESSION_BINDING_PREFIX)) continue;
    const record = bindingRecord(key, value);
    if (record) records.set(record.tabId, record);
  }
  return records;
}

export function rotateWorkspaceSessionGeneration(api, targetGeneration = "") {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.set !== "function") throw new Error("Workspace session generation storage is unavailable");
    const target = String(targetGeneration || "").trim();
    const workspaceSessionGeneration = normalizeWorkspaceSessionGeneration(
      target || createWorkspaceSessionGeneration()
    );
    await storage.set({ [WORKSPACE_SESSION_GENERATION_KEY]: workspaceSessionGeneration });
    return workspaceSessionGeneration;
  });
}

export function detachWorkspaceSessionMirror(api, tabId, removeInfo = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const normalizedTabId = positiveTabId(tabId);
    if (normalizedTabId === null) return { detached: false, workspaceId: "" };
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      return { detached: false, workspaceId: "" };
    }
    const now = finiteTime(options.now, Date.now());
    const bindingKey = workspaceSessionBindingKey(normalizedTabId);
    const stored = await storage.get(bindingKey);
    const binding = bindingRecord(bindingKey, stored?.[bindingKey]);
    if (!binding) return { detached: false, workspaceId: "", legacy: true };
    const stableKey = workspaceSessionWorkspaceKey(binding.workspaceId);
    const current = await storage.get(stableKey);
    const stable = stableWorkspaceRecord(stableKey, current?.[stableKey]);
    if (stable && stable.owner.tabId === normalizedTabId) {
      const owner = {
        ...stable.owner,
        windowId: Number.isInteger(removeInfo.windowId) ? removeInfo.windowId : stable.owner.windowId
      };
      await storage.set({
        [stableKey]: {
          ...stable,
          owner,
          updatedAt: Math.max(stable.updatedAt, now),
          detachedAt: now
        }
      });
    }
    await storage.remove(bindingKey);
    await scheduleUserCloseConfirm(api, now);
    return { detached: Boolean(stable), workspaceId: binding.workspaceId, legacy: false };
  });
}

export function prepareWorkspaceSessionLifecycle(api, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    const session = sessionStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session lifecycle storage is unavailable");
    }
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");

    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const markerStored = typeof session?.get === "function"
      ? await session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY)
      : {};
    let marker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]);
    const lifecycleRestart = !marker;
    if (!marker) {
      marker = {
        version: WORKSPACE_SESSION_STORAGE_VERSION,
        runtimeId: createWorkspaceSessionGeneration(),
        startedAt: now
      };
    }

    const [stored, tabs] = await Promise.all([
      storage.get(null),
      api.tabs.query({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(tabs);
    const stableRecords = currentStableRecords(stored);
    const bindings = currentBindings(stored);
    const updates = {};
    const removals = [];

    for (const [tabId, binding] of bindings) {
      if (live.tabIds.has(tabId)) continue;
      const stable = stableRecords.get(binding.workspaceId);
      if (stable && stable.owner.tabId === tabId && stable.detachedAt === null) {
        const detached = { ...stable, updatedAt: Math.max(stable.updatedAt, now), detachedAt: now };
        stableRecords.set(binding.workspaceId, detached);
        updates[workspaceSessionWorkspaceKey(binding.workspaceId)] = detached;
      }
      removals.push(workspaceSessionBindingKey(tabId));
    }

    let recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    if (!recovery && Object.prototype.hasOwnProperty.call(stored || {}, WORKSPACE_SESSION_RECOVERY_KEY)) {
      removals.push(WORKSPACE_SESSION_RECOVERY_KEY);
    }

    const expiredWorkspaceIds = new Set();
    for (const [workspaceId, record] of stableRecords) {
      const ownerLive = record.owner.tabId !== null && live.tabIds.has(record.owner.tabId);
      const urlLive = live.workspaceIds.has(workspaceId);
      if (
        record.generation === generation
        && record.detachedAt !== null
        && now - record.detachedAt > WORKSPACE_SESSION_DETACHED_TTL_MS
        && !ownerLive
        && !urlLive
      ) {
        expiredWorkspaceIds.add(workspaceId);
        removals.push(workspaceSessionWorkspaceKey(workspaceId));
      }
    }

    const forceRecovery = options.forceRecovery === true;
    const restartRecovery = lifecycleRestart || forceRecovery;
    if (!restartRecovery) markClosedByUser(stableRecords, live, now, updates);
    if (restartRecovery) {
      const homes = homeHrefByAppIdFromStored(stored);
      const incoming = [];
      for (const [workspaceId, record] of stableRecords) {
        if (expiredWorkspaceIds.has(workspaceId) || record.generation !== generation) continue;
        if (workspaceRecordIsLive(record, live)) continue;
        if (record.detachedAt !== null && now - record.detachedAt > WORKSPACE_SESSION_RECENT_DETACH_MS) continue;
        incoming.push(recoveryCandidate(
          record,
          "stable",
          isBrowserClearedRecord(record, live, now, homes, { restartRecovery: true })
            ? WORKSPACE_SESSION_CLEARED_BY_BROWSER
            : ""
        ));
      }

      for (const [key, value] of Object.entries(stored || {})) {
        const legacy = legacyMirrorRecord(key, value);
        if (!legacy || legacy.generation !== generation || live.tabIds.has(legacy.tabId)) continue;
        const workspaceId = createWorkspaceSessionId();
        const stable = {
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId,
          snapshot: legacy.snapshot,
          owner: { tabId: legacy.tabId, windowId: null, index: null, pinned: false },
          updatedAt: now,
          detachedAt: now,
          closedBy: ""
        };
        stableRecords.set(workspaceId, stable);
        updates[workspaceSessionWorkspaceKey(workspaceId)] = stable;
        removals.push(key);
        incoming.push(recoveryCandidate(stable, "legacy"));
      }

      const existingForRuntime = recovery?.runtimeId === marker.runtimeId ? recovery : null;
      recovery = {
        version: WORKSPACE_SESSION_RECOVERY_VERSION,
        id: existingForRuntime?.id || recoveryId(now),
        runtimeId: marker.runtimeId,
        generation,
        reason: String(options.reason || existingForRuntime?.reason || (forceRecovery ? "update" : "runtime-restart")),
        createdAt: existingForRuntime?.createdAt || now,
        expiresAt: now + WORKSPACE_SESSION_RECOVERY_TTL_MS,
        candidates: mergeRecoveryCandidates(existingForRuntime?.candidates, incoming)
      };
      updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    }

    if (Object.keys(updates).length) await storage.set(updates);
    const removableKeys = [...new Set(removals)].filter((key) => !Object.prototype.hasOwnProperty.call(updates, key));
    if (removableKeys.length) await storage.remove(removableKeys);
    if (typeof session?.set === "function") {
      await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
    }

    return {
      lifecycleRestart,
      forced: forceRecovery,
      generation,
      recovery
    };
  });
}

export function claimWorkspaceSessionRecovery(api, request = {}, sender = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session claim storage is unavailable");
    }
    const tab = sender?.tab || {};
    const meta = tabMetadata(tab);
    if (meta.tabId === null) throw new Error("Workspace session claim requires a browser tab");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const stored = await storage.get(null);
    const urlWorkspaceId = workspaceSessionIdFromUrl(sender?.url || tab?.url);
    const requestedWorkspaceId = normalizeWorkspaceSessionId(request.workspaceId) || urlWorkspaceId;
    if (urlWorkspaceId && requestedWorkspaceId && urlWorkspaceId !== requestedWorkspaceId) {
      throw new Error("Workspace session claim does not match the page URL");
    }

    let workspaceId = requestedWorkspaceId;
    let recovered = false;
    let claimId = "";
    let recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    if (!workspaceId && recovery) {
      const available = recovery.candidates.filter((candidate) => (
        !candidate.claimedAt && candidate.clearedBy !== WORKSPACE_SESSION_CLEARED_BY_BROWSER
      ));
      const sameWindow = meta.windowId === null
        ? []
        : available.filter((candidate) => candidate.windowId === meta.windowId);
      const noMetadata = available.filter((candidate) => candidate.windowId === null);
      const selected = sameWindow.length === 1
        ? sameWindow[0]
        : sameWindow.length === 0 && noMetadata.length === 1
          ? noMetadata[0]
          : null;
      if (selected) {
        workspaceId = selected.workspaceId;
        selected.claimedAt = now;
        selected.claimedTabId = meta.tabId;
        selected.claimId = `claim-${createWorkspaceSessionGeneration().replace(/^workspace-/, "")}`;
        claimId = selected.claimId;
        recovered = true;
      }
    }

    if (!workspaceId) {
      return {
        claimed: false,
        recovered: false,
        workspaceId: "",
        claimId: "",
        workspaceSessionGeneration: generation,
        snapshot: null
      };
    }

    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    let stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    const previousOwnerTabId = stable?.owner.tabId ?? null;
    const removeKeys = [];
    if ((!stable || stable.generation !== generation) && requestedWorkspaceId) {
      const legacyKey = workspaceSessionMirrorKey(meta.tabId);
      const legacy = legacyMirrorRecord(legacyKey, stored?.[legacyKey]);
      if (legacy?.generation === generation) {
        stable = stableRecordForClaim(null, workspaceId, generation, legacy.snapshot, tab, now);
        removeKeys.push(legacyKey);
        recovered = true;
      }
    }
    if (!stable || stable.generation !== generation) {
      stable = stableRecordForClaim(null, workspaceId, generation, null, tab, now);
    } else {
      stable = stableRecordForClaim(stable, workspaceId, generation, stable.snapshot, tab, now);
      recovered = recovered || Boolean(stable.snapshot);
    }

    const currentBindingKey = workspaceSessionBindingKey(meta.tabId);
    const currentBinding = bindingRecord(currentBindingKey, stored?.[currentBindingKey]);
    if (currentBinding && currentBinding.workspaceId !== workspaceId) {
      const previousStableKey = workspaceSessionWorkspaceKey(currentBinding.workspaceId);
      const previousStable = stableWorkspaceRecord(previousStableKey, stored?.[previousStableKey]);
      if (previousStable?.owner.tabId === meta.tabId) {
        await storage.set({
          [previousStableKey]: { ...previousStable, updatedAt: now, detachedAt: now }
        });
      }
    }
    if (previousOwnerTabId !== null && previousOwnerTabId !== meta.tabId) {
      removeKeys.push(workspaceSessionBindingKey(previousOwnerTabId));
    }
    stable = stableRecordForClaim(stable, workspaceId, generation, stable.snapshot, tab, now);
    const updates = {
      [stableKey]: stable,
      [currentBindingKey]: bindingForClaim(workspaceId, generation, tab, now)
    };
    if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    await storage.set(updates);
    const removableKeys = [...new Set(removeKeys)].filter((key) => !Object.prototype.hasOwnProperty.call(updates, key));
    if (removableKeys.length) await storage.remove(removableKeys);

    return {
      claimed: true,
      recovered,
      workspaceId,
      claimId,
      workspaceSessionGeneration: generation,
      snapshot: stable.snapshot
    };
  });
}

export function commitWorkspaceSessionRecovery(api, request = {}, sender = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session commit storage is unavailable");
    }
    const tab = sender?.tab || {};
    const meta = tabMetadata(tab);
    const workspaceId = normalizeWorkspaceSessionId(request.workspaceId);
    const claimId = String(request.claimId || "").trim();
    if (meta.tabId === null || !workspaceId || !/^claim-[A-Za-z0-9_-]{12,192}$/.test(claimId)) {
      throw new Error("Workspace session commit is invalid");
    }
    const urlWorkspaceId = workspaceSessionIdFromUrl(sender?.url || tab?.url);
    if (urlWorkspaceId && urlWorkspaceId !== workspaceId) throw new Error("Workspace session commit does not match the page URL");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const bindingKey = workspaceSessionBindingKey(meta.tabId);
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const stored = await storage.get([bindingKey, stableKey, WORKSPACE_SESSION_RECOVERY_KEY]);
    const binding = bindingRecord(bindingKey, stored?.[bindingKey]);
    if (!binding || binding.workspaceId !== workspaceId || binding.generation !== generation) {
      throw new Error("Workspace session commit requires an active claim");
    }
    const stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    if (!stable || stable.generation !== generation || stable.owner.tabId !== meta.tabId) {
      throw new Error("Workspace session commit requires a persisted workspace lease");
    }
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    const candidate = recovery?.candidates.find((item) =>
      item.workspaceId === workspaceId
      && item.claimedTabId === meta.tabId
      && item.claimId === claimId
      && !item.committedAt
    );
    if (!candidate) throw new Error("Workspace session recovery claim is stale");
    candidate.committedAt = now;
    await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
    const legacyKey = workspaceSessionMirrorKey(meta.tabId);
    await storage.remove(legacyKey);
    return {
      committed: true,
      workspaceId,
      claimId,
      workspaceSessionGeneration: generation
    };
  });
}

function clearedTabItem(candidate) {
  return {
    workspaceId: candidate.workspaceId,
    windowId: candidate.windowId,
    index: candidate.index,
    pinned: candidate.pinned === true
  };
}

function unclaimedBrowserCleared(recovery, live, stableRecords = new Map()) {
  if (!recovery) return [];
  return recovery.candidates.filter((candidate) => {
    if (candidate.clearedBy !== WORKSPACE_SESSION_CLEARED_BY_BROWSER || candidate.claimedAt) return false;
    if (live.workspaceIds.has(candidate.workspaceId)) return false;
    const record = stableRecords.get(candidate.workspaceId);
    return !record || !workspaceRecordIsLive(record, live);
  });
}

function confirmUserClosedWorkspaceSessions(api, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
      return { confirmed: 0 };
    }
    if (typeof api?.tabs?.query !== "function") return { confirmed: 0 };
    const now = finiteTime(options.now, Date.now());
    const [stored, tabs] = await Promise.all([
      storage.get(null),
      api.tabs.query({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(tabs);
    const stableRecords = currentStableRecords(stored);
    const updates = {};
    markClosedByUser(stableRecords, live, now, updates);
    if (Object.keys(updates).length) await storage.set(updates);
    return { confirmed: Object.keys(updates).length };
  });
}

export function handleWorkspaceSessionAlarm(api, alarm, options = {}) {
  if (String(alarm?.name || "") !== WORKSPACE_SESSION_USER_CLOSE_ALARM) return Promise.resolve(null);
  return confirmUserClosedWorkspaceSessions(api, options);
}

export function listClearedWorkspaceTabs(api, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function") return { tabs: [] };
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const [stored, tabs] = await Promise.all([
      storage.get(null),
      api.tabs.query({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(tabs);
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    return {
      tabs: unclaimedBrowserCleared(recovery, live, currentStableRecords(stored)).map(clearedTabItem)
    };
  });
}

export function listLiveWorkspaceTabs(api, _request = {}, sender = {}) {
  return queueWorkspaceSession(async () => {
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
          const workspaceId = workspaceSessionIdFromUrl(tabHref(tab));
          return liveTabItem(tab, currentTabId, workspaceId ? stableRecords.get(workspaceId) : null);
        })
        .filter((item) => item.tabId !== null)
        .sort(compareLiveTabs)
    };
  });
}

export function focusWorkspaceTab(api, request = {}, sender = {}) {
  return queueWorkspaceSession(async () => {
    const tabId = positiveTabId(request.tabId);
    if (tabId === null) throw new Error("Workspace tab id is invalid");
    if (typeof api?.tabs?.get !== "function") throw new Error("Workspace session tab lookup is unavailable");
    const tab = await api.tabs.get(tabId).catch(() => null);
    if (!tab || !isChatClubWorkspaceTab(api, tab)) {
      throw new Error("Workspace tab is not a live ChatClub page");
    }
    const currentTabId = positiveTabId(sender?.tab?.id);
    if (currentTabId === tabId) return { focused: true, tabId, current: true };
    if (typeof api.tabs.update === "function") await api.tabs.update(tabId, { active: true });
    if (Number.isInteger(tab.windowId) && typeof api.windows?.update === "function") {
      await api.windows.update(tab.windowId, { focused: true });
    }
    return { focused: true, tabId, current: false };
  });
}

export function dismissClearedWorkspaceTabs(api, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session dismiss storage is unavailable");
    }
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const stored = await storage.get(WORKSPACE_SESSION_RECOVERY_KEY);
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    if (!recovery) return { dismissed: 0, tabs: [] };
    const remaining = recovery.candidates.filter((candidate) => (
      candidate.clearedBy !== WORKSPACE_SESSION_CLEARED_BY_BROWSER || candidate.claimedAt
    ));
    const dismissed = recovery.candidates.length - remaining.length;
    if (!remaining.length) await storage.remove(WORKSPACE_SESSION_RECOVERY_KEY);
    else await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: { ...recovery, candidates: remaining } });
    return { dismissed, tabs: [] };
  });
}

export function restoreClearedWorkspaceTabs(api, _request = {}, sender = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
      throw new Error("Workspace session restore storage is unavailable");
    }
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const [stored, tabs] = await Promise.all([
      storage.get(null),
      api.tabs.query({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(tabs);
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    const items = unclaimedBrowserCleared(recovery, live, currentStableRecords(stored));
    if (!items.length) {
      return { restored: 0, absorbed: null, opened: [] };
    }

    const updates = {};
    const opened = [];
    const openedIds = new Set(live.workspaceIds);

    for (const item of items) {
      if (openedIds.has(item.workspaceId)) continue;
      const placement = await restorePlacement(api, item, sender);
      let tab = null;
      try {
        tab = await openWorkspaceTab(api, sender, null, { workspaceId: item.workspaceId, restore: placement });
      } catch {
        tab = null;
      }
      const openedTabId = positiveTabId(tab?.id);
      if (openedTabId === null) continue;
      const claimId = claimToken();
      item.claimedAt = now;
      item.claimedTabId = openedTabId;
      item.claimId = claimId;
      item.committedAt = now;
      const stableKey = workspaceSessionWorkspaceKey(item.workspaceId);
      const stable = stableWorkspaceRecord(stableKey, stored?.[stableKey])
        || currentStableRecords({ ...stored, ...updates }).get(item.workspaceId);
      const retained = retainWorkspaceOwner(stable, item.workspaceId, generation, tab, now);
      if (retained) updates[stableKey] = retained;
      updates[workspaceSessionBindingKey(openedTabId)] = bindingForClaim(
        item.workspaceId,
        generation,
        tab,
        now
      );
      opened.push({ workspaceId: item.workspaceId, tabId: openedTabId });
      openedIds.add(item.workspaceId);
    }

    if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    if (Object.keys(updates).length) await storage.set(updates);
    return {
      restored: opened.length,
      absorbed: null,
      opened
    };
  });
}
