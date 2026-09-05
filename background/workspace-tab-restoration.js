import {
  WORKSPACE_SESSION_OPENING_LEASE_MS,
  WORKSPACE_SESSION_RECOVERY_KEY,
  WORKSPACE_SESSION_RUNTIME_MARKER_KEY,
  WORKSPACE_SESSION_TAB_OPEN_TIMEOUT_MS,
  workspaceSessionBindingKey,
  workspaceSessionWorkspaceKey
} from "../shared/workspace-session.js";
import { openWorkspaceTab } from "./tab-runtime.js";
import {
  clearedTabItem,
  listClearedWorkspaceTabsOperation,
  requestedRecoveryEvents,
  unclaimedBrowserCleared
} from "./workspace-tab-directory.js";
import {
  bindingForClaim,
  bindingRecord,
  claimToken,
  createRuntimeMarker,
  currentStableRecords,
  finiteTime,
  liveTabState,
  localStorageArea,
  markerWithAtRiskWorkspaces,
  positiveTabId,
  rearmRecoveryCandidate,
  recoveryRecord,
  restorePlacement,
  retainWorkspaceOwner,
  runtimeMarker,
  scheduleRecoveryLeaseAlarm,
  sessionStorageArea,
  stableWorkspaceRecord
} from "./workspace-session-helpers.js";

function restoreOperationNow(options = {}) {
  const supplied = typeof options.now === "function" ? options.now() : options.now;
  return finiteTime(supplied, Date.now());
}

async function prepareClearedWorkspaceTabOpen(api, workspaceId, eventId, options, ensureGeneration) {
  const storage = localStorageArea(api);
  if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
    throw new Error("Workspace session restore storage is unavailable");
  }
  if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
  const now = restoreOperationNow(options);
  const generation = await ensureGeneration(storage);
  const session = sessionStorageArea(api);
  const [stored, tabs, markerStored] = await Promise.all([
    storage.get(null),
    api.tabs.query({}),
    typeof session?.get === "function" ? session.get(WORKSPACE_SESSION_RUNTIME_MARKER_KEY) : Promise.resolve({})
  ]);
  if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
  const live = liveTabState(api, tabs, stored);
  const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
  const item = unclaimedBrowserCleared(recovery, live, currentStableRecords(stored)).find((candidate) => (
    candidate.workspaceId === workspaceId && candidate.eventId === eventId
  ));
  if (!item) return null;

  let marker = runtimeMarker(markerStored?.[WORKSPACE_SESSION_RUNTIME_MARKER_KEY]) || createRuntimeMarker(now);
  item.claimedAt = now;
  item.claimedTabId = null;
  item.claimId = claimToken();
  item.claimRuntimeId = marker.runtimeId;
  item.claimExpiresAt = now + WORKSPACE_SESSION_OPENING_LEASE_MS;
  item.committedAt = 0;
  marker = markerWithAtRiskWorkspaces(marker, [item.workspaceId]);
  await scheduleRecoveryLeaseAlarm(api, recovery, now);
  await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
  try {
    if (typeof session?.set === "function") {
      await session.set({ [WORKSPACE_SESSION_RUNTIME_MARKER_KEY]: marker });
    }
  } catch (error) {
    rearmRecoveryCandidate(item);
    await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery }).catch(() => {});
    throw error;
  }

  let latestTabs;
  try {
    latestTabs = await api.tabs.query({});
    if (!Array.isArray(latestTabs)) throw new TypeError("Browser tabs query returned an invalid result");
  } catch (error) {
    rearmRecoveryCandidate(item);
    await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery }).catch(() => {});
    throw error;
  }
  const existingTab = (liveTabState(api, latestTabs, stored).tabsByWorkspaceId.get(item.workspaceId) || [])[0] || null;
  if (existingTab) {
    rearmRecoveryCandidate(item);
    await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
    return {
      reused: true,
      opened: {
        workspaceId: item.workspaceId,
        tabId: positiveTabId(existingTab.id),
        reused: true
      }
    };
  }
  return {
    reused: false,
    reservation: {
      ...clearedTabItem(item),
      claimId: item.claimId,
      claimRuntimeId: item.claimRuntimeId,
      generation
    }
  };
}

async function openReservedWorkspaceTab(api, sender, reservation, options = {}) {
  const placement = await restorePlacement(api, reservation, sender);
  const openRun = Promise.resolve().then(() => openWorkspaceTab(api, sender, null, {
    workspaceId: reservation.workspaceId,
    openingClaimId: reservation.claimId,
    restore: placement,
    allowCreateFallback: false,
    active: false,
    focus: false
  }));
  const scheduleTimeout = options.scheduleTimeout || globalThis.setTimeout;
  const cancelTimeout = options.cancelTimeout || globalThis.clearTimeout;
  if (typeof scheduleTimeout !== "function" || typeof cancelTimeout !== "function") {
    try { return { status: "settled", tab: await openRun }; }
    catch (error) { return { status: "failed", error }; }
  }
  const timeoutMs = Math.max(50, Number(options.tabOpenTimeoutMs) || WORKSPACE_SESSION_TAB_OPEN_TIMEOUT_MS);
  let timeoutId = null;
  const outcome = await Promise.race([
    openRun.then(
      (tab) => ({ status: "settled", tab }),
      (error) => ({ status: "failed", error })
    ),
    new Promise((resolve) => {
      timeoutId = scheduleTimeout(() => resolve({ status: "uncertain" }), timeoutMs);
    })
  ]);
  if (timeoutId !== null) cancelTimeout(timeoutId);
  return outcome;
}

async function rearmReservedWorkspaceTab(api, reservation, options, queueWorkspaceSession, ensureGeneration) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function") return false;
    const now = restoreOperationNow(options);
    const generation = await ensureGeneration(storage);
    const stored = await storage.get(WORKSPACE_SESSION_RECOVERY_KEY);
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    const candidate = recovery?.candidates.find((item) => (
      item.workspaceId === reservation.workspaceId
      && item.eventId === reservation.eventId
      && item.claimId === reservation.claimId
      && item.claimRuntimeId === reservation.claimRuntimeId
    ));
    if (!candidate || candidate.claimedTabId !== null) return false;
    rearmRecoveryCandidate(candidate);
    await storage.set({ [WORKSPACE_SESSION_RECOVERY_KEY]: recovery });
    await scheduleRecoveryLeaseAlarm(api, recovery, now).catch(() => {});
    return true;
  });
}

async function finalizeReservedWorkspaceTab(api, reservation, tab, options, queueWorkspaceSession, ensureGeneration) {
  return queueWorkspaceSession(async () => {
    const storage = localStorageArea(api);
    if (typeof storage?.get !== "function" || typeof storage?.set !== "function") {
      throw new Error("Workspace session restore storage is unavailable");
    }
    if (typeof api?.tabs?.query !== "function") throw new Error("Workspace session tab query is unavailable");
    const openedTabId = positiveTabId(tab?.id);
    if (openedTabId === null) return null;
    const now = restoreOperationNow(options);
    const generation = await ensureGeneration(storage);
    const [stored, tabs] = await Promise.all([storage.get(null), api.tabs.query({})]);
    if (!Array.isArray(tabs)) throw new TypeError("Browser tabs query returned an invalid result");
    const live = liveTabState(api, tabs, stored);
    const exactTabs = live.tabsByWorkspaceId.get(reservation.workspaceId) || [];
    const exactTab = exactTabs.find((item) => positiveTabId(item?.id) === openedTabId) || null;
    if (!exactTab || exactTabs.length !== 1) return null;

    const stableKey = workspaceSessionWorkspaceKey(reservation.workspaceId);
    const bindingKey = workspaceSessionBindingKey(openedTabId);
    const stable = stableWorkspaceRecord(stableKey, stored?.[stableKey]);
    const binding = bindingRecord(bindingKey, stored?.[bindingKey]);
    const durableOwner = stable?.generation === generation
      && stable.owner.tabId === openedTabId
      && binding?.workspaceId === reservation.workspaceId
      && binding.generation === generation;
    const recovery = recoveryRecord(stored?.[WORKSPACE_SESSION_RECOVERY_KEY], generation, now);
    const candidate = recovery?.candidates.find((item) => (
      item.workspaceId === reservation.workspaceId && item.eventId === reservation.eventId
    ));
    if (!candidate) return durableOwner ? { workspaceId: reservation.workspaceId, tabId: openedTabId } : null;
    if (
      candidate.claimId !== reservation.claimId
      || candidate.claimRuntimeId !== reservation.claimRuntimeId
      || candidate.claimExpiresAt <= now
      || (candidate.claimedTabId !== null && candidate.claimedTabId !== openedTabId)
    ) return null;
    if (candidate.claimedTabId === openedTabId && durableOwner) {
      return { workspaceId: reservation.workspaceId, tabId: openedTabId };
    }

    candidate.claimedTabId = openedTabId;
    const retained = retainWorkspaceOwner(stable, reservation.workspaceId, generation, exactTab, now);
    const updates = {
      [WORKSPACE_SESSION_RECOVERY_KEY]: recovery,
      [bindingKey]: bindingForClaim(reservation.workspaceId, generation, exactTab, now)
    };
    if (retained) updates[stableKey] = retained;
    try {
      await storage.set(updates);
    } catch (error) {
      error.workspaceRestoreCompensation = true;
      throw error;
    }
    return { workspaceId: reservation.workspaceId, tabId: openedTabId };
  });
}

async function compensateReservedWorkspaceTab(api, reservation, tab, options, queueWorkspaceSession, ensureGeneration) {
  const tabId = positiveTabId(tab?.id);
  if (tabId === null || typeof api?.tabs?.remove !== "function") return false;
  try { await api.tabs.remove(tabId); }
  catch { return false; }
  await rearmReservedWorkspaceTab(
    api,
    reservation,
    options,
    queueWorkspaceSession,
    ensureGeneration
  ).catch(() => {});
  return true;
}

export async function restoreClearedWorkspaceTabsOperation({
  api,
  request = {},
  sender = {},
  options = {},
  queueWorkspaceSession,
  ensureGeneration
}) {
  if (typeof queueWorkspaceSession !== "function" || typeof ensureGeneration !== "function") {
    throw new TypeError("Workspace tab restoration requires serialized storage dependencies");
  }
  const requestedEvents = requestedRecoveryEvents(request);
  const opened = [];
  for (const [workspaceId, eventId] of requestedEvents) {
    const prepared = await queueWorkspaceSession(() => (
      prepareClearedWorkspaceTabOpen(api, workspaceId, eventId, options, ensureGeneration)
    ));
    if (!prepared) continue;
    if (prepared.reused) {
      if (prepared.opened?.tabId) opened.push(prepared.opened);
      continue;
    }
    const { reservation } = prepared;
    const outcome = await openReservedWorkspaceTab(api, sender, reservation, options);
    if (outcome.status === "uncertain") continue;
    if (outcome.status !== "settled" || positiveTabId(outcome.tab?.id) === null) {
      await rearmReservedWorkspaceTab(api, reservation, options, queueWorkspaceSession, ensureGeneration);
      continue;
    }
    let finalized;
    try {
      finalized = await finalizeReservedWorkspaceTab(
        api,
        reservation,
        outcome.tab,
        options,
        queueWorkspaceSession,
        ensureGeneration
      );
    } catch (error) {
      if (error?.workspaceRestoreCompensation) {
        const compensated = await compensateReservedWorkspaceTab(
          api,
          reservation,
          outcome.tab,
          options,
          queueWorkspaceSession,
          ensureGeneration
        );
        if (!compensated) {
          const uncertain = new Error("Restored workspace tab opened but its durable binding could not be confirmed");
          uncertain.cause = error;
          throw uncertain;
        }
      }
      throw error;
    }
    if (finalized) opened.push(finalized);
  }
  const remaining = await queueWorkspaceSession(() => (
    listClearedWorkspaceTabsOperation(api, options, ensureGeneration)
  ));
  return {
    restored: opened.length,
    absorbed: null,
    opened,
    tabs: remaining.tabs
  };
}
