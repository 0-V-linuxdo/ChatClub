import {
  DEFAULT_WORKSPACE_SESSION_GENERATION,
  WORKSPACE_SESSION_CLEARED_BY_BROWSER,
  WORKSPACE_SESSION_DETACH_BROWSER,
  WORKSPACE_SESSION_DETACH_WINDOW,
  WORKSPACE_SESSION_DETACHED_TTL_MS,
  WORKSPACE_SESSION_DISMISSED,
  WORKSPACE_SESSION_GENERATION_KEY,
  WORKSPACE_SESSION_OPENING_LEASE_MS,
  WORKSPACE_SESSION_RECOVERY_ALARM,
  WORKSPACE_SESSION_RECOVERY_KEY,
  WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
  WORKSPACE_SESSION_STORAGE_VERSION,
  createWorkspaceSessionGeneration,
  createWorkspaceSessionId,
  normalizeWorkspaceSessionClaimId,
  normalizeWorkspaceSessionGeneration,
  normalizeWorkspaceSessionId,
  workspaceSessionOpeningClaimIdFromUrl,
  workspaceSessionBindingKey,
  workspaceSessionLegacyWorkspaceId,
  workspaceSessionMirrorKey,
  workspaceSessionWorkspaceKey
} from "../shared/workspace-session.js";
import { clearedTabItem, exportRememberedWorkspaceTabsOperation, focusWorkspaceTabOperation, forgetRememberedWorkspaceTabOperation, importRememberedWorkspaceTabsOperation, listClearedWorkspaceTabsOperation, listLiveWorkspaceTabsOperation, recoveryEventWasRequested, requestedRecoveryEvents, setWorkspaceTabTitleOperation, unclaimedBrowserCleared } from "./workspace-tab-directory.js";
import { restoreClearedWorkspaceTabsOperation } from "./workspace-tab-restoration.js";
import {
  bindingForClaim,
  bindingRecord,
  claimToken,
  cloneSnapshot,
  createRecovery,
  createRuntimeMarker,
  currentBindings,
  currentStableRecords,
  finiteTime,
  isChatClubWorkspaceTab,
  legacyMirrorRecord,
  liveTabState,
  localStorageArea,
  markerHasAtRiskWorkspace,
  markerWithAtRiskWorkspaces,
  markerWithoutAtRiskWorkspace,
  nakedRecoveryCandidate,
  positiveTabId,
  rearmRecoveryCandidate,
  recoveryCandidate,
  recoveryRecord,
  runtimeMarker,
  scheduleRecoveryLeaseAlarm,
  sessionStorageArea,
  stableRecordForClaim,
  stableWorkspaceRecord,
  tabMetadata,
  workspaceIdForChatClubTab,
  workspaceRecordIsLive,
  workspaceSessionSnapshotsEqual
} from "./workspace-session-helpers.js";

let workspaceSessionChain = Promise.resolve();

function queueWorkspaceSession(task) {
  const queued = workspaceSessionChain
    .catch(() => {})
    .then(task);
  workspaceSessionChain = queued.then(() => undefined, () => undefined);
  return queued;
}

function adoptedLegacyTombstone(record, now, runtimeId) {
  if (!record) return null;
  const detach = record.detach || {
    at: now,
    kind: WORKSPACE_SESSION_DETACH_BROWSER,
    runtimeId: String(runtimeId || "")
  };
  return {
    ...record,
    storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
    owner: { ...record.owner, tabId: null },
    updatedAt: Math.max(record.updatedAt, now),
    detach,
    detachedAt: detach.at,
    detachedKind: detach.kind,
    detachedRuntimeId: detach.runtimeId,
    resolution: WORKSPACE_SESSION_DISMISSED,
    closedBy: ""
  };
}

async function ensureGenerationInternal(storage) {
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new Error("Workspace session generation storage is unavailable");
  }
  const stored = await storage.get(WORKSPACE_SESSION_GENERATION_KEY);
  const current = typeof stored?.[WORKSPACE_SESSION_GENERATION_KEY] === "string"
    ? stored[WORKSPACE_SESSION_GENERATION_KEY].trim()
    : "";
  if (current) return current;
  await storage.set({ [WORKSPACE_SESSION_GENERATION_KEY]: DEFAULT_WORKSPACE_SESSION_GENERATION });
  return DEFAULT_WORKSPACE_SESSION_GENERATION;
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

export function registerWorkspaceSessionTab(api, tab = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const workspaceId = workspaceIdForChatClubTab(api, tab);
    const meta = tabMetadata(tab);
    if (!workspaceId || meta.tabId === null) return { registered: false, workspaceId: "" };
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
      return { registered: false, workspaceId };
    }
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab inventory is unavailable");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const session = sessionStorageArea(api);
    const [stored, tabs, markerStored] = await Promise.all([
      storage.get(null),
      api.tabs.query({}),
      typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs);
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const existing = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    const otherOwnerIsLive = existing?.owner?.tabId != null
      && existing.owner.tabId !== meta.tabId
      && live.workspaceByTabId.get(existing.owner.tabId) === workspaceId;
    if (otherOwnerIsLive) {
      return { registered: false, workspaceId, duplicate: true };
    }
    const stable = stableRecordForClaim(
      existing?.generation === generation ? existing : null,
      workspaceId,
      generation,
      existing?.generation === generation ? existing.snapshot : null,
      tab,
      now
    );
    await storage.set({
      [stableKey]: stable,
      [workspaceSessionBindingKey(meta.tabId)]: bindingForClaim(workspaceId, generation, tab, now)
    });
    const currentMarker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY])
      || createRuntimeMarker(now);
    const marker = markerWithAtRiskWorkspaces(currentMarker, [workspaceId]);
    if (typeof session?.set === "function") {
      await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
    }
    return { registered: true, workspaceId, duplicate: false };
  });
}

export function persistWorkspaceSessionSnapshot(api, request = {}, sender = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session persistence storage is unavailable");
    }
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab inventory is unavailable");
    const tab = sender?.tab || {};
    const meta = tabMetadata(tab);
    const workspaceId = normalizeWorkspaceSessionId(request.workspaceId);
    const clear = request.clear === true;
    const snapshot = clear ? null : cloneSnapshot(request.snapshot);
    if (meta.tabId === null || !workspaceId || (!clear && !snapshot)) {
      throw new Error("Workspace session persistence request is invalid");
    }
    const senderTab = { ...tab, url: sender?.url || tab?.url };
    if (!isChatClubWorkspaceTab(api, senderTab)) {
      throw new Error("Workspace session persistence requires a ChatClub page");
    }
    const urlWorkspaceId = workspaceIdForChatClubTab(api, senderTab);
    if (urlWorkspaceId && urlWorkspaceId !== workspaceId) {
      throw new Error("Workspace session persistence does not match the page URL");
    }

    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const session = sessionStorageArea(api);
    const [stored, tabs, markerStored] = await Promise.all([
      storage.get(null),
      api.tabs.query({}),
      typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs);
    if (live.workspaceByTabId.get(meta.tabId) !== workspaceId) {
      throw new Error("Workspace session persistence requires the exact live workspace tab");
    }
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const bindingKey = workspaceSessionBindingKey(meta.tabId);
    const legacyKey = workspaceSessionMirrorKey(meta.tabId);
    const existing = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    const otherOwners = (live.tabsByWorkspaceId.get(workspaceId) || [])
      .filter((item) => positiveTabId(item?.id) !== meta.tabId);
    const stableOwnerIsOtherLive = existing?.owner?.tabId != null
      && existing.owner.tabId !== meta.tabId
      && live.workspaceByTabId.get(existing.owner.tabId) === workspaceId;
    if (otherOwners.length || stableOwnerIsOtherLive) {
      throw new Error("Workspace session persistence rejected a duplicate workspace owner");
    }
    let marker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]) || createRuntimeMarker(now);
    let recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);

    if (clear) {
      if (recovery) recovery.candidates = recovery.candidates.filter((item) => item.workspaceId !== workspaceId);
      if (recovery?.candidates.length) await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
      const removals = [stableKey, bindingKey, legacyKey];
      if (!recovery?.candidates.length) removals.push(WORKSPACE_SESSION_RECOVERY_KEY);
      await storage.remove(removals);
      marker = markerWithoutAtRiskWorkspace(marker, workspaceId);
      if (typeof session?.set === "function") {
        await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
      }
      await scheduleRecoveryLeaseAlarm(api, recovery, now).catch(() => {});
      return { persisted: true, cleared: true, workspaceId, workspaceSessionGeneration: generation };
    }

    marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);

    const durableSnapshot = { ...snapshot, generation };
    const updates = {};
    const removals = [legacyKey];
    const currentBinding = bindingRecord(bindingKey, stored?.[bindingKey]);
    let adoptedLegacyWorkspaceId = "";
    if (currentBinding && currentBinding.workspaceId !== workspaceId) {
      const previousStableKey = workspaceSessionWorkspaceKey(currentBinding.workspaceId);
      const previousStable = stableWorkspaceRecord(previousStableKey, stored?.[previousStableKey]);
      const provisionalLegacyCandidate = recovery?.candidates.find((candidate) => (
        candidate.workspaceId === currentBinding.workspaceId
        && candidate.source === "legacy"
        && candidate.clearedBy !== WORKSPACE_SESSION_CLEARED_BY_BROWSER
        && !candidate.claimedAt
      ));
      const adoptsProvisionalLegacy = Boolean(
        provisionalLegacyCandidate && previousStable?.owner.tabId === meta.tabId
      );
      if (adoptsProvisionalLegacy) {
        adoptedLegacyWorkspaceId = currentBinding.workspaceId;
        recovery.candidates = recovery.candidates.filter((candidate) => (
          candidate.workspaceId !== currentBinding.workspaceId
        ));
        updates[previousStableKey] = adoptedLegacyTombstone(previousStable, now, marker.runtimeId);
        marker = markerWithoutAtRiskWorkspace(marker, currentBinding.workspaceId) || marker;
        marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);
      } else {
        if (markerHasAtRiskWorkspace(marker, currentBinding.workspaceId)) {
          marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);
        }
      }
      if (!adoptsProvisionalLegacy && previousStable?.owner.tabId === meta.tabId && !live.workspaceIds.has(currentBinding.workspaceId)) {
        const detach = { at: now, kind: WORKSPACE_SESSION_DETACH_BROWSER, runtimeId: marker.runtimeId };
        const displaced = {
          ...previousStable,
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          updatedAt: Math.max(previousStable.updatedAt, now),
          detach,
          detachedAt: now,
          detachedKind: detach.kind,
          detachedRuntimeId: detach.runtimeId,
          resolution: "",
          closedBy: ""
        };
        updates[previousStableKey] = displaced;
        recovery = createRecovery(marker, generation, now, "binding-replaced", recovery, [
          recoveryCandidate(displaced, "stable", WORKSPACE_SESSION_CLEARED_BY_BROWSER)
        ]);
      }
    }
    if (!adoptedLegacyWorkspaceId && recovery) {
      const matchingLegacyCandidates = recovery.candidates.filter((candidate) => {
        if (candidate.workspaceId === workspaceId || candidate.source !== "legacy" || candidate.claimedAt) return false;
        const candidateStable = stableWorkspaceRecord(
          workspaceSessionWorkspaceKey(candidate.workspaceId),
          stored?.[workspaceSessionWorkspaceKey(candidate.workspaceId)]
        );
        if (!candidateStable || !workspaceSessionSnapshotsEqual(candidateStable.snapshot, durableSnapshot)) return false;
        if (candidate.windowId !== null && meta.windowId !== null && candidate.windowId !== meta.windowId) return false;
        return candidate.index === null || meta.index === null || candidate.index === meta.index;
      });
      if (matchingLegacyCandidates.length === 1) {
        const adopted = matchingLegacyCandidates[0];
        adoptedLegacyWorkspaceId = adopted.workspaceId;
        recovery.candidates = recovery.candidates.filter((candidate) => candidate.workspaceId !== adopted.workspaceId);
        const adoptedStableKey = workspaceSessionWorkspaceKey(adopted.workspaceId);
        const adoptedStable = stableWorkspaceRecord(adoptedStableKey, stored?.[adoptedStableKey]);
        updates[adoptedStableKey] = adoptedLegacyTombstone(adoptedStable, now, marker.runtimeId);
        const adoptedOwnerTabId = positiveTabId(adoptedStable?.owner.tabId);
        if (adoptedOwnerTabId !== null && adoptedOwnerTabId !== meta.tabId) {
          removals.push(workspaceSessionBindingKey(adoptedOwnerTabId));
        }
        marker = markerWithoutAtRiskWorkspace(marker, adopted.workspaceId) || marker;
        marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);
      }
    }
    const previousOwnerTabId = existing?.owner?.tabId ?? null;
    updates[stableKey] = stableRecordForClaim(
      existing?.generation === generation ? existing : null,
      workspaceId,
      generation,
      durableSnapshot,
      tab,
      now
    );
    updates[bindingKey] = bindingForClaim(workspaceId, generation, tab, now);
    let removeEmptyRecovery = false;
    if (recovery?.candidates.length) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    else if (recovery) {
      updates[WORKSPACE_SESSION_RECOVERY_KEY] = { ...recovery, candidates: [] };
      removals.push(WORKSPACE_SESSION_RECOVERY_KEY);
      removeEmptyRecovery = true;
    }
    await storage.set(updates);
    if (previousOwnerTabId !== null && previousOwnerTabId !== meta.tabId) {
      removals.push(workspaceSessionBindingKey(previousOwnerTabId));
    }
    if (typeof session?.set === "function") {
      await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
    }
    const removableKeys = [...new Set(removals)].filter((key) => (
      !Object.prototype.hasOwnProperty.call(updates, key)
      || (removeEmptyRecovery && key === WORKSPACE_SESSION_RECOVERY_KEY)
    ));
    if (removableKeys.length) await storage.remove(removableKeys);
    // A successful persist proves that the snapshot is durable, but it cannot
    // prove that a later tab removal was intentional. Inherited/restored pages
    // remain protected until the user explicitly dismisses their recovery.
    await scheduleRecoveryLeaseAlarm(api, recovery, now).catch(() => {});
    return { persisted: true, workspaceId, workspaceSessionGeneration: generation };
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
    const generation = await ensureGenerationInternal(storage);
    const bindingKey = workspaceSessionBindingKey(normalizedTabId);
    const session = sessionStorageArea(api);
    const [stored, markerStored] = await Promise.all([
      storage.get(null),
      typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
    ]);
    const marker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]);
    const binding = bindingRecord(bindingKey, stored?.[bindingKey]);
    const ownerRecord = binding || [...currentStableRecords(stored).values()]
      .find((record) => record.owner.tabId === normalizedTabId);
    if (!ownerRecord) return { detached: false, workspaceId: "", legacy: true };
    const stableKey = workspaceSessionWorkspaceKey(ownerRecord.workspaceId);
    const stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    const detachedKind = removeInfo?.isWindowClosing === true
      ? WORKSPACE_SESSION_DETACH_WINDOW
      : WORKSPACE_SESSION_DETACH_BROWSER;
    const detach = { at: now, kind: detachedKind, runtimeId: marker?.runtimeId || "" };
    let updatedStable = null;
    if (stable && stable.owner.tabId === normalizedTabId) {
      const owner = {
        ...stable.owner,
        windowId: Number.isInteger(removeInfo.windowId) ? removeInfo.windowId : stable.owner.windowId
      };
      const alreadyDismissed = stable.resolution === WORKSPACE_SESSION_DISMISSED;
      updatedStable = {
        ...stable,
        storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
        sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
        generation: stable.generation || generation,
        owner,
        updatedAt: Math.max(stable.updatedAt, now),
        detach,
        detachedAt: now,
        detachedKind,
        detachedRuntimeId: detach.runtimeId,
        resolution: alreadyDismissed ? WORKSPACE_SESSION_DISMISSED : "",
        closedBy: ""
      };
    }
    let recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    const openingCandidate = recovery?.candidates.find((candidate) => (
      candidate.workspaceId === ownerRecord.workspaceId && candidate.claimedTabId === normalizedTabId
    ));
    if (updatedStable && updatedStable.resolution !== WORKSPACE_SESSION_DISMISSED) {
      const candidate = openingCandidate || recovery?.candidates.find((item) => item.workspaceId === ownerRecord.workspaceId);
      if (candidate) rearmRecoveryCandidate(candidate);
      else {
        recovery = createRecovery(marker, generation, now, "tab-removed", recovery, [
          recoveryCandidate(updatedStable, "stable", WORKSPACE_SESSION_CLEARED_BY_BROWSER)
        ]);
      }
    } else if (updatedStable && recovery) {
      recovery.candidates = recovery.candidates.filter((candidate) => (
        candidate.workspaceId !== ownerRecord.workspaceId
      ));
    }
    const updates = {};
    if (updatedStable) updates[stableKey] = updatedStable;
    if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    try {
      await scheduleRecoveryLeaseAlarm(api, recovery, now);
    } catch {
      for (const candidate of recovery?.candidates || []) {
        if (candidate.claimedAt) rearmRecoveryCandidate(candidate);
      }
      if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    }
    if (Object.keys(updates).length) await storage.set(updates);
    await storage.remove(bindingKey);
    return { detached: Boolean(stable), workspaceId: ownerRecord.workspaceId, legacy: false };
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
    if (!marker) marker = createRuntimeMarker(now);

    const [stored, tabs] = await Promise.all([
      storage.get(null),
      api.tabs.query({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs);
    const forceRecovery = options.forceRecovery === true;
    const restartRecovery = lifecycleRestart || forceRecovery;
    if (restartRecovery) marker = markerWithAtRiskWorkspaces(marker, live.workspaceIds);
    const stableRecords = currentStableRecords(stored);
    const bindings = currentBindings(stored);
    const updates = {};
    const removals = [];

    for (const [tabId, binding] of bindings) {
      if (live.workspaceByTabId.get(tabId) === binding.workspaceId) continue;
      const stable = stableRecords.get(binding.workspaceId);
      if (stable && stable.owner.tabId === tabId && stable.detachedAt === null) {
        // A cold MV3 worker can observe only the post-navigation URL, so a
        // missing durable binding owner has no trustworthy user-close signal.
        const kind = WORKSPACE_SESSION_DETACH_BROWSER;
        const detach = { at: now, kind, runtimeId: marker.runtimeId };
        const detached = {
          ...stable,
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          updatedAt: Math.max(stable.updatedAt, now),
          detach,
          detachedAt: now,
          detachedKind: kind,
          detachedRuntimeId: marker.runtimeId,
          resolution: "",
          closedBy: ""
        };
        stableRecords.set(binding.workspaceId, detached);
        updates[workspaceSessionWorkspaceKey(binding.workspaceId)] = detached;
      }
      removals.push(workspaceSessionBindingKey(tabId));
    }

    for (const [tabId, workspaceId] of live.workspaceByTabId) {
      const tab = live.records.find((item) => positiveTabId(item?.id) === tabId);
      if (!tab) continue;
      const existing = stableRecords.get(workspaceId);
      const existingOwnerIsLive = existing?.owner?.tabId != null
        && live.workspaceByTabId.get(existing.owner.tabId) === workspaceId;
      if (!existingOwnerIsLive) {
        const attached = stableRecordForClaim(
          existing?.generation === generation ? existing : null,
          workspaceId,
          generation,
          existing?.generation === generation ? existing.snapshot : null,
          tab,
          now
        );
        stableRecords.set(workspaceId, attached);
        updates[workspaceSessionWorkspaceKey(workspaceId)] = attached;
      }
      updates[workspaceSessionBindingKey(tabId)] = bindingForClaim(workspaceId, generation, tab, now);
    }

    let recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    if (!recovery && Object.prototype.hasOwnProperty.call(stored || {}, WORKSPACE_SESSION_RECOVERY_KEY)) {
      removals.push(WORKSPACE_SESSION_RECOVERY_KEY);
    }

    const expiredWorkspaceIds = new Set();
    for (const [workspaceId, record] of stableRecords) {
      if (
        record.generation === generation
        && record.sourceStorageVersion === WORKSPACE_SESSION_STORAGE_VERSION
        && Boolean(record.resolution)
        && record.detachedAt !== null
        && now - record.detachedAt > WORKSPACE_SESSION_DETACHED_TTL_MS
        && !workspaceRecordIsLive(record, live)
      ) {
        expiredWorkspaceIds.add(workspaceId);
        removals.push(workspaceSessionWorkspaceKey(workspaceId));
      }
    }

    for (const candidate of recovery?.candidates || []) {
      if (candidate.claimedAt && candidate.claimRuntimeId !== marker.runtimeId) {
        rearmRecoveryCandidate(candidate);
      }
    }

    const incoming = [];
    if (restartRecovery) {
      for (const [workspaceId, record] of stableRecords) {
        if (expiredWorkspaceIds.has(workspaceId) || record.generation !== generation) continue;
        if (workspaceRecordIsLive(record, live)) continue;
        if (record.sourceStorageVersion === WORKSPACE_SESSION_STORAGE_VERSION && record.resolution) continue;
        const detach = { at: record.detachedAt ?? now, kind: WORKSPACE_SESSION_DETACH_BROWSER, runtimeId: marker.runtimeId };
        const recoverable = {
          ...record,
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          detach,
          detachedAt: detach.at,
          detachedKind: detach.kind,
          detachedRuntimeId: detach.runtimeId,
          resolution: "",
          closedBy: ""
        };
        stableRecords.set(workspaceId, recoverable);
        updates[workspaceSessionWorkspaceKey(workspaceId)] = recoverable;
        incoming.push(recoveryCandidate(recoverable, "stable", WORKSPACE_SESSION_CLEARED_BY_BROWSER));
      }

      for (const [key, value] of Object.entries(stored || {})) {
        const legacy = legacyMirrorRecord(key, value);
        if (!legacy || legacy.generation !== generation) continue;
        const legacyTab = live.records.find((tab) => positiveTabId(tab?.id) === legacy.tabId);
        if (legacyTab && isChatClubWorkspaceTab(api, legacyTab)) {
          const liveWorkspaceId = workspaceIdForChatClubTab(api, legacyTab);
          const migrationWorkspaceId = liveWorkspaceId
            || workspaceSessionLegacyWorkspaceId(legacy.tabId);
          if (!migrationWorkspaceId) continue;
          const existing = stableRecords.get(migrationWorkspaceId);
          const attached = stableRecordForClaim(
            existing?.generation === generation ? existing : null,
            migrationWorkspaceId,
            generation,
            existing?.snapshot || legacy.snapshot,
            legacyTab,
            now
          );
          stableRecords.set(migrationWorkspaceId, attached);
          updates[workspaceSessionWorkspaceKey(migrationWorkspaceId)] = attached;
          updates[workspaceSessionBindingKey(legacy.tabId)] = bindingForClaim(
            migrationWorkspaceId,
            generation,
            legacyTab,
            now
          );
          if (!liveWorkspaceId) {
            marker = markerWithAtRiskWorkspaces(marker, [migrationWorkspaceId]);
            incoming.push(recoveryCandidate(attached, "legacy"));
          }
          removals.push(key);
          continue;
        }
        const workspaceId = workspaceSessionLegacyWorkspaceId(legacy.tabId);
        if (!workspaceId) continue;
        const detach = { at: now, kind: WORKSPACE_SESSION_DETACH_BROWSER, runtimeId: marker.runtimeId };
        const existing = stableRecords.get(workspaceId);
        const stable = {
          ...existing,
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          generation,
          workspaceId,
          snapshot: existing?.snapshot || legacy.snapshot,
          owner: { tabId: legacy.tabId, windowId: null, index: null, pinned: false },
          updatedAt: now,
          detach,
          detachedAt: now,
          detachedKind: detach.kind,
          detachedRuntimeId: detach.runtimeId,
          resolution: "",
          closedBy: ""
        };
        stableRecords.set(workspaceId, stable);
        updates[workspaceSessionWorkspaceKey(workspaceId)] = stable;
        removals.push(key);
        incoming.push(recoveryCandidate(stable, "legacy", WORKSPACE_SESSION_CLEARED_BY_BROWSER));
      }
    }

    // Reconcile the ledger on every worker wake. A corrupt or lost recovery
    // value must not strand an unresolved browser/window detach until restart.
    for (const [workspaceId, record] of stableRecords) {
      if (expiredWorkspaceIds.has(workspaceId) || record.generation !== generation) continue;
      if (workspaceRecordIsLive(record, live) || record.resolution) continue;
      if (![WORKSPACE_SESSION_DETACH_BROWSER, WORKSPACE_SESSION_DETACH_WINDOW].includes(record.detachedKind)) continue;
      incoming.push(recoveryCandidate(record, "stable", WORKSPACE_SESSION_CLEARED_BY_BROWSER));
    }
    if (recovery) {
      recovery.candidates = recovery.candidates.filter((candidate) => {
        const record = stableRecords.get(candidate.workspaceId);
        return Boolean(record)
          && record.generation === generation
          && !expiredWorkspaceIds.has(candidate.workspaceId)
          && !record.resolution;
      });
    }
    if (incoming.length || recovery?.candidates.length) {
      recovery = createRecovery(
        marker,
        generation,
        now,
        options.reason || (forceRecovery ? "update" : restartRecovery ? "runtime-restart" : recovery?.reason),
        recovery,
        incoming
      );
      updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    } else if (recovery) {
      removals.push(WORKSPACE_SESSION_RECOVERY_KEY);
      recovery = null;
    }

    try {
      await scheduleRecoveryLeaseAlarm(api, recovery, now);
    } catch {
      for (const candidate of recovery?.candidates || []) {
        if (candidate.claimedAt) rearmRecoveryCandidate(candidate);
      }
      if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
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
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab inventory is unavailable");
    const tab = sender?.tab || {};
    const meta = tabMetadata(tab);
    if (meta.tabId === null) throw new Error("Workspace session claim requires a browser tab");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const session = sessionStorageArea(api);
    const [stored, tabs, markerStored] = await Promise.all([
      storage.get(null),
      api.tabs.query({}),
      typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
    ]);
    let marker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]) || createRuntimeMarker(now);
    const senderTab = { ...tab, url: sender?.url || tab?.url };
    if (!isChatClubWorkspaceTab(api, senderTab)) throw new Error("Workspace session claim requires a ChatClub page");
    const urlWorkspaceId = workspaceIdForChatClubTab(api, senderTab);
    const requestedWorkspaceId = normalizeWorkspaceSessionId(request.workspaceId) || urlWorkspaceId;
    if (urlWorkspaceId && requestedWorkspaceId && urlWorkspaceId !== requestedWorkspaceId) {
      throw new Error("Workspace session claim does not match the page URL");
    }
    const rawOpeningClaimId = typeof request.openingClaimId === "string" ? request.openingClaimId.trim() : "";
    const openingClaimId = normalizeWorkspaceSessionClaimId(rawOpeningClaimId);
    const urlOpeningClaimId = workspaceSessionOpeningClaimIdFromUrl(senderTab.url);
    if (rawOpeningClaimId && !openingClaimId) {
      throw new Error("Workspace session opening claim id is invalid");
    }
    if (openingClaimId !== urlOpeningClaimId) {
      throw new Error("Workspace session opening claim does not match the page URL");
    }

    let workspaceId = requestedWorkspaceId;
    let recovered = false;
    let claimId = "";
    let recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs);
    let forkedFrom = "";
    if (workspaceId) {
      const otherOwners = (live.tabsByWorkspaceId.get(workspaceId) || [])
        .filter((item) => positiveTabId(item?.id) !== meta.tabId);
      const requestedKey = workspaceSessionWorkspaceKey(workspaceId);
      const requestedStable = stableWorkspaceRecord(requestedKey, stored?.[requestedKey]);
      const stableOwnerIsLive = requestedStable?.owner?.tabId != null
        && live.workspaceByTabId.get(requestedStable.owner.tabId) === workspaceId;
      const canonicalTabId = stableOwnerIsLive
        ? requestedStable.owner.tabId
        : Math.min(meta.tabId, ...otherOwners.map((item) => positiveTabId(item?.id)).filter(Boolean));
      if (otherOwners.length && canonicalTabId !== meta.tabId) {
        forkedFrom = workspaceId;
        workspaceId = createWorkspaceSessionId();
        if (markerHasAtRiskWorkspace(marker, forkedFrom)) {
          marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);
        }
      }
    }

    let selected = null;
    let legacyClaimSnapshot = null;
    let legacyClaimRemoveKey = "";
    const legacyWorkspaceId = workspaceSessionLegacyWorkspaceId(meta.tabId);
    const exactLegacyRequest = !forkedFrom && workspaceId === legacyWorkspaceId;
    if (!workspaceId || exactLegacyRequest) {
      const senderBindingKey = workspaceSessionBindingKey(meta.tabId);
      const senderBinding = bindingRecord(senderBindingKey, stored?.[senderBindingKey]);
      if (senderBinding?.workspaceId === legacyWorkspaceId && recovery) {
        selected = recovery.candidates.find((candidate) => (
          candidate.workspaceId === legacyWorkspaceId
          && candidate.source === "legacy"
          && candidate.clearedBy !== WORKSPACE_SESSION_CLEARED_BY_BROWSER
          && (!candidate.claimedAt || candidate.claimedTabId === meta.tabId)
        )) || null;
        if (selected) workspaceId = legacyWorkspaceId;
      }
      if (!selected) {
        const legacyKey = workspaceSessionMirrorKey(meta.tabId);
        const legacy = legacyMirrorRecord(legacyKey, stored?.[legacyKey]);
        if (legacy?.generation === generation && legacyWorkspaceId) {
          workspaceId = legacyWorkspaceId;
          legacyClaimSnapshot = legacy.snapshot;
          legacyClaimRemoveKey = legacyKey;
          const provisionalStable = stableRecordForClaim(
            null,
            workspaceId,
            generation,
            legacyClaimSnapshot,
            tab,
            now
          );
          recovery = createRecovery(marker, generation, now, "legacy-claim", recovery, [
            recoveryCandidate(provisionalStable, "legacy")
          ]);
          selected = recovery.candidates.find((candidate) => candidate.workspaceId === workspaceId) || null;
        }
      }
    }
    if (!selected && workspaceId && !forkedFrom && recovery) {
      const candidate = recovery.candidates.find((item) => item.workspaceId === workspaceId);
      if (openingClaimId) {
        if (
          !candidate
          || !candidate.claimedAt
          || (candidate.claimedTabId !== null && candidate.claimedTabId !== meta.tabId)
          || candidate.claimId !== openingClaimId
          || candidate.claimRuntimeId !== marker.runtimeId
          || candidate.claimExpiresAt <= now
        ) {
          throw new Error("Workspace session opening claim is stale");
        }
        selected = candidate;
      } else if (candidate && (!candidate.claimedAt || candidate.claimedTabId === meta.tabId)) {
        selected = candidate;
      } else if (candidate?.claimedAt && candidate.claimedTabId === null) {
        throw new Error("Workspace session opening claim requires its exact lease id");
      }
    } else if (!selected && !workspaceId && recovery) {
      selected = nakedRecoveryCandidate(recovery, meta);
    }
    if (selected) {
      workspaceId = selected.workspaceId;
      marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);
      selected.claimedAt = now;
      selected.claimedTabId = meta.tabId;
      selected.claimId = selected.claimId || claimToken();
      selected.claimRuntimeId = marker?.runtimeId || "";
      selected.claimExpiresAt = now + WORKSPACE_SESSION_OPENING_LEASE_MS;
      selected.committedAt = 0;
      claimId = selected.claimId;
      recovered = true;
    }

    if (!workspaceId) {
      return {
        claimed: false,
        recovered: false,
        forked: false,
        workspaceId: "",
        claimId: "",
        workspaceSessionGeneration: generation,
        snapshot: null
      };
    }
    marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);

    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    let stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    const forkSource = forkedFrom
      ? stableWorkspaceRecord(workspaceSessionWorkspaceKey(forkedFrom), stored?.[workspaceSessionWorkspaceKey(forkedFrom)])
      : null;
    const previousOwnerTabId = stable?.owner.tabId ?? null;
    const removeKeys = [];
    if (legacyClaimRemoveKey) removeKeys.push(legacyClaimRemoveKey);
    if ((!stable || stable.generation !== generation) && requestedWorkspaceId && !legacyClaimSnapshot) {
      const legacyKey = workspaceSessionMirrorKey(meta.tabId);
      const legacy = legacyMirrorRecord(legacyKey, stored?.[legacyKey]);
      if (legacy?.generation === generation) {
        stable = stableRecordForClaim(null, workspaceId, generation, legacy.snapshot, tab, now);
        removeKeys.push(legacyKey);
      }
    }
    if (!stable || stable.generation !== generation) {
      stable = stableRecordForClaim(
        null,
        workspaceId,
        generation,
        legacyClaimSnapshot || forkSource?.snapshot || null,
        tab,
        now
      );
    } else {
      stable = stableRecordForClaim(stable, workspaceId, generation, stable.snapshot, tab, now);
    }

    const currentBindingKey = workspaceSessionBindingKey(meta.tabId);
    const currentBinding = bindingRecord(currentBindingKey, stored?.[currentBindingKey]);
    const displacedUpdates = {};
    if (currentBinding && currentBinding.workspaceId !== workspaceId) {
      if (markerHasAtRiskWorkspace(marker, currentBinding.workspaceId)) {
        marker = markerWithAtRiskWorkspaces(marker, [workspaceId]);
      }
      const previousStableKey = workspaceSessionWorkspaceKey(currentBinding.workspaceId);
      const previousStable = stableWorkspaceRecord(previousStableKey, stored?.[previousStableKey]);
      if (previousStable?.owner.tabId === meta.tabId && !live.workspaceIds.has(currentBinding.workspaceId)) {
        const detach = { at: now, kind: WORKSPACE_SESSION_DETACH_BROWSER, runtimeId: marker?.runtimeId || "" };
        const displaced = {
          ...previousStable,
          storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
          updatedAt: Math.max(previousStable.updatedAt, now),
          detach,
          detachedAt: now,
          detachedKind: detach.kind,
          detachedRuntimeId: detach.runtimeId,
          resolution: "",
          closedBy: ""
        };
        displacedUpdates[previousStableKey] = displaced;
        recovery = createRecovery(marker, generation, now, "binding-replaced", recovery, [
          recoveryCandidate(displaced, "stable", WORKSPACE_SESSION_CLEARED_BY_BROWSER)
        ]);
      }
    }
    if (previousOwnerTabId !== null && previousOwnerTabId !== meta.tabId) {
      removeKeys.push(workspaceSessionBindingKey(previousOwnerTabId));
    }
    stable = stableRecordForClaim(stable, workspaceId, generation, stable.snapshot, tab, now);
    const updates = {
      ...displacedUpdates,
      [stableKey]: stable,
      [currentBindingKey]: bindingForClaim(workspaceId, generation, tab, now)
    };
    if (recovery) updates[WORKSPACE_SESSION_RECOVERY_KEY] = recovery;
    await scheduleRecoveryLeaseAlarm(api, recovery, now);
    await storage.set(updates);
    const removableKeys = [...new Set(removeKeys)].filter((key) => !Object.prototype.hasOwnProperty.call(updates, key));
    if (removableKeys.length) await storage.remove(removableKeys);
    if (typeof session?.set === "function") {
      await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
    }
    return {
      claimed: true,
      recovered,
      forked: Boolean(forkedFrom),
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
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab inventory is unavailable");
    const tab = sender?.tab || {};
    const meta = tabMetadata(tab);
    const workspaceId = normalizeWorkspaceSessionId(request.workspaceId);
    const claimId = String(request.claimId || "").trim();
    if (meta.tabId === null || !workspaceId || !/^claim-[A-Za-z0-9_-]{12,192}$/.test(claimId)) {
      throw new Error("Workspace session commit is invalid");
    }
    const senderTab = { ...tab, url: sender?.url || tab?.url };
    const urlWorkspaceId = workspaceIdForChatClubTab(api, senderTab);
    if (urlWorkspaceId !== workspaceId) throw new Error("Workspace session commit does not match the page URL");
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const bindingKey = workspaceSessionBindingKey(meta.tabId);
    const stableKey = workspaceSessionWorkspaceKey(workspaceId);
    const session = sessionStorageArea(api);
    const [stored, markerStored, tabs] = await Promise.all([
      storage.get([bindingKey, stableKey, WORKSPACE_SESSION_RECOVERY_KEY]),
      typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({}),
      api.tabs.query({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs);
    if (
      live.workspaceByTabId.get(meta.tabId) !== workspaceId
      || (live.tabsByWorkspaceId.get(workspaceId) || []).length !== 1
    ) {
      throw new Error("Workspace session commit requires the exact live workspace tab");
    }
    const marker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]);
    if (!marker) throw new Error("Workspace session commit requires the current runtime lease");
    const binding = bindingRecord(bindingKey, stored?.[bindingKey]);
    if (!binding || binding.workspaceId !== workspaceId || binding.generation !== generation) {
      throw new Error("Workspace session commit requires an active claim");
    }
    const stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    if (!stable || stable.generation !== generation || stable.owner.tabId !== meta.tabId) {
      throw new Error("Workspace session commit requires a persisted workspace lease");
    }
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    const candidateIndex = recovery?.candidates.findIndex((item) =>
      item.workspaceId === workspaceId
      && item.claimedAt > 0
      && item.claimedTabId === meta.tabId
      && item.claimId === claimId
      && item.claimRuntimeId === marker.runtimeId
      && item.claimExpiresAt > now
    );
    if (!Number.isInteger(candidateIndex) || candidateIndex < 0) {
      throw new Error("Workspace session recovery claim is stale");
    }
    recovery.candidates.splice(candidateIndex, 1);
    if (recovery.candidates.length) await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
    else await storage.remove(WORKSPACE_SESSION_RECOVERY_KEY);
    await scheduleRecoveryLeaseAlarm(api, recovery, now).catch(() => {});
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

export function handleWorkspaceSessionAlarm(api, alarm, options = {}) {
  const name = String(alarm?.name || "");
  if (name !== WORKSPACE_SESSION_RECOVERY_ALARM) return Promise.resolve(null);
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session recovery lease storage is unavailable");
    }
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const stored = await storage.get(WORKSPACE_SESSION_RECOVERY_KEY);
    const raw = stored?.[WORKSPACE_SESSION_RECOVERY_KEY];
    const recovery = recoveryRecord(raw, generation, now);
    const rawCandidates = Array.isArray(raw?.candidates) ? raw.candidates : [];
    let rearmed = (recovery?.candidates || []).filter((candidate) => {
      const previous = rawCandidates.find((item) => item?.workspaceId === candidate.workspaceId);
      return finiteTime(previous?.claimedAt) > 0 && !candidate.claimedAt;
    }).length;
    try {
      await scheduleRecoveryLeaseAlarm(api, recovery, now);
    } catch {
      for (const candidate of recovery?.candidates || []) {
        if (!candidate.claimedAt) continue;
        rearmRecoveryCandidate(candidate);
        rearmed += 1;
      }
    }
    if (recovery?.candidates.length) await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
    else if (Object.prototype.hasOwnProperty.call(stored || {}, WORKSPACE_SESSION_RECOVERY_KEY)) {
      await storage.remove(WORKSPACE_SESSION_RECOVERY_KEY);
    }
    return { rearmed };
  });
}

export function listClearedWorkspaceTabs(api, options = {}) {
  return queueWorkspaceSession(() => listClearedWorkspaceTabsOperation(api, options, ensureGenerationInternal));
}
export function listLiveWorkspaceTabs(api, _request = {}, sender = {}) {
  return queueWorkspaceSession(() => listLiveWorkspaceTabsOperation(api, sender));
}
export function exportRememberedWorkspaceTabs(api) {
  return queueWorkspaceSession(() => exportRememberedWorkspaceTabsOperation(api));
}
export function importRememberedWorkspaceTabs(api, request = {}, options = {}) {
  return queueWorkspaceSession(() => (
    importRememberedWorkspaceTabsOperation(api, request, options, ensureGenerationInternal)
  ));
}
export function setWorkspaceTabTitle(api, request = {}) {
  return queueWorkspaceSession(() => setWorkspaceTabTitleOperation(api, request));
}
export function forgetRememberedWorkspaceTab(api, request = {}, options = {}) {
  return queueWorkspaceSession(() => (
    forgetRememberedWorkspaceTabOperation(api, request, options, ensureGenerationInternal)
  ));
}
export function focusWorkspaceTab(api, request = {}, sender = {}) {
  return queueWorkspaceSession(() => focusWorkspaceTabOperation(api, request, sender));
}
export function dismissClearedWorkspaceTabs(api, request = {}, options = {}) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function" || typeof storage?.remove !== "function") {
      throw new Error("Workspace session dismiss storage is unavailable");
    }
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
    const requestedEvents = requestedRecoveryEvents(request);
    const now = finiteTime(options.now, Date.now());
    const generation = await ensureGenerationInternal(storage);
    const session = sessionStorageArea(api);
    const [stored, tabs, markerStored] = await Promise.all([
      storage.get(null),
      api.tabs.query({}),
      typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
    ]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs);
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    if (!recovery) return { dismissed: 0, tabs: [] };
    const stableRecords = currentStableRecords(stored);
    const visibleWorkspaceIds = new Set(
      unclaimedBrowserCleared(recovery, live, stableRecords).map((candidate) => candidate.workspaceId)
    );
    const targetedWorkspaceIds = new Set([...visibleWorkspaceIds].filter((workspaceId) => {
      const candidate = recovery.candidates.find((item) => item.workspaceId === workspaceId);
      return candidate && recoveryEventWasRequested(candidate, requestedEvents);
    }));
    const updates = {};
    const dismissedWorkspaceIds = [];
    for (const candidate of recovery.candidates) {
      if (!targetedWorkspaceIds.has(candidate.workspaceId)) continue;
      dismissedWorkspaceIds.push(candidate.workspaceId);
      const stableKey = workspaceSessionWorkspaceKey(candidate.workspaceId);
      const stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
      if (!stable) continue;
      updates[stableKey] = {
        ...stable,
        storageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
        sourceStorageVersion: WORKSPACE_SESSION_STORAGE_VERSION,
        resolution: WORKSPACE_SESSION_DISMISSED,
        closedBy: "",
        updatedAt: Math.max(stable.updatedAt, now)
      };
    }
    const remaining = recovery.candidates.filter((candidate) => (
      !targetedWorkspaceIds.has(candidate.workspaceId)
    ));
    const dismissed = dismissedWorkspaceIds.length;
    if (remaining.length) updates[WORKSPACE_SESSION_RECOVERY_KEY] = { ...recovery, candidates: remaining };
    if (Object.keys(updates).length) await storage.set(updates);
    if (!remaining.length) await storage.remove(WORKSPACE_SESSION_RECOVERY_KEY);
    const marker = dismissedWorkspaceIds.reduce(
      (current, workspaceId) => markerWithoutAtRiskWorkspace(current, workspaceId),
      runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY])
    );
    if (marker && typeof session?.set === "function") {
      await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
    }
    const remainingRecovery = remaining.length ? { ...recovery, candidates: remaining } : null;
    const remainingStableRecords = currentStableRecords({ ...stored, ...updates });
    return {
      dismissed,
      tabs: unclaimedBrowserCleared(remainingRecovery, live, remainingStableRecords).map(clearedTabItem)
    };
  });
}

export async function restoreClearedWorkspaceTabs(api, request = {}, sender = {}, options = {}) {
  return restoreClearedWorkspaceTabsOperation({
    api,
    request,
    sender,
    options,
    queueWorkspaceSession,
    ensureGeneration: ensureGenerationInternal
  });
}
