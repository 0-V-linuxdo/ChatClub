import {
  DEFAULT_WORKSPACE_SESSION_GENERATION,
  WORKSPACE_SESSION_BINDING_PREFIX,
  WORKSPACE_SESSION_DETACHED_TTL_MS,
  WORKSPACE_SESSION_GENERATION_KEY,
  WORKSPACE_SESSION_RECENT_DETACH_MS,
  WORKSPACE_SESSION_RECOVERY_KEY,
  WORKSPACE_SESSION_RECOVERY_TTL_MS,
  WORKSPACE_SESSION_RECOVERY_VERSION,
  WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
  WORKSPACE_SESSION_STORAGE_VERSION,
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
  workspaceSessionWorkspaceKey
} from "../shared/workspace-session.js";

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
    detachedAt: nullableTime(value.detachedAt)
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
        source: candidate.source === "legacy" ? "legacy" : "stable",
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
    detachedAt: null
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

function recoveryCandidate(record, source = "stable") {
  return {
    workspaceId: record.workspaceId,
    windowId: record.owner?.windowId ?? null,
    index: record.owner?.index ?? null,
    source,
    claimedAt: 0,
    claimedTabId: null,
    claimId: "",
    committedAt: 0
  };
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

export function ensureWorkspaceSessionGeneration(api) {
  return queueWorkspaceSession(() => ensureGenerationInternal(localStorageArea(api)));
}

export function rotateWorkspaceSessionGeneration(api) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.set !== "function") throw new Error("Workspace session generation storage is unavailable");
    const workspaceSessionGeneration = normalizeWorkspaceSessionGeneration(createWorkspaceSessionGeneration());
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
    return { detached: Boolean(stable), workspaceId: binding.workspaceId, legacy: false };
  });
}

// Backward-compatible name for callers from the first workspace-memory build.
export function removeWorkspaceSessionMirror(api, tabId, removeInfo = {}, options = {}) {
  return detachWorkspaceSessionMirror(api, tabId, removeInfo, options);
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
    if (lifecycleRestart || forceRecovery) {
      const incoming = [];
      for (const [workspaceId, record] of stableRecords) {
        if (expiredWorkspaceIds.has(workspaceId) || record.generation !== generation) continue;
        if (live.workspaceIds.has(workspaceId)) continue;
        if (record.owner.tabId !== null && live.tabIds.has(record.owner.tabId)) continue;
        if (record.detachedAt !== null && now - record.detachedAt > WORKSPACE_SESSION_RECENT_DETACH_MS) continue;
        incoming.push(recoveryCandidate(record));
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
          detachedAt: now
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
      runtimeId: marker.runtimeId,
      recovery,
      detachedTabIds: [...bindings.keys()].filter((tabId) => !live.tabIds.has(tabId)),
      removedKeys: removableKeys
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
      const available = recovery.candidates.filter((candidate) => !candidate.claimedAt);
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
