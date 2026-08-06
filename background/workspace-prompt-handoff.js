import { EXTENSION_RUNTIME_RELAY_SOURCE } from "../shared/protocol.js";
import {
  WORKSPACE_PROMPT_HANDOFF_ALARM,
  WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES,
  WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
  WORKSPACE_PROMPT_HANDOFF_TTL_MS,
  WORKSPACE_PROMPT_HANDOFF_VERSION,
  createWorkspacePromptPayloadStore,
  normalizeWorkspacePromptHandoffId,
  normalizeWorkspacePromptPayloadLocator
} from "../shared/workspace-prompt-handoff.js";
import {
  createWorkspaceSessionId,
  normalizeWorkspaceSessionId,
  workspaceSessionIdFromUrl,
  workspaceSessionUrl
} from "../shared/workspace-session.js";

const HANDOFF_LEDGER_KEY = "chatclubWorkspacePromptHandoffsV1";
const ORPHAN_PAYLOAD_GRACE_MS = WORKSPACE_PROMPT_HANDOFF_TTL_MS;
const CLEANUP_RETRY_MS = 60_000;
const PHASES = new Set(["prepared", "claimed", "settled"]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveTabId(value) {
  const tabId = Number(value);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function handoffError(code, message, delivered = false) {
  const error = new Error(message);
  error.code = code;
  error.delivered = delivered;
  return error;
}

function token(prefix) {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}-${uuid}`;
  } catch {}
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function chatClubWorkspaceId(api, href, options = {}) {
  try {
    const actualHref = new URL(String(href || "")).href;
    const baseHref = api.runtime.getURL("chatClub.html");
    const actual = new URL(actualHref);
    const base = new URL(baseHref);
    if (actual.origin !== base.origin || actual.pathname !== base.pathname) return "";
    const workspaceId = workspaceSessionIdFromUrl(actualHref);
    if (!workspaceId) return "";
    return options.canonical !== true || workspaceSessionUrl(baseHref, workspaceId) === actualHref
      ? workspaceId
      : "";
  } catch {
    return "";
  }
}

function normalizedHref(value) {
  try {
    return new URL(String(value || "")).href;
  } catch {
    return "";
  }
}

function senderDocumentMatchesTab(senderHref, tabHref) {
  if (!senderHref || !tabHref) return false;
  if (senderHref === tabHref) return true;
  try {
    const senderUrl = new URL(senderHref);
    if (senderUrl.hash) return false;
    const tabUrl = new URL(tabHref);
    tabUrl.hash = "";
    return senderUrl.href === tabUrl.href;
  } catch {
    return false;
  }
}

function storedRecord(value, current) {
  if (!plainObject(value)) return null;
  const handoffId = normalizeWorkspacePromptHandoffId(value.handoffId);
  const workspaceId = normalizeWorkspaceSessionId(value.workspaceId);
  const sourceWorkspaceId = normalizeWorkspaceSessionId(value.sourceWorkspaceId);
  const sourceTabId = positiveTabId(value.sourceTabId);
  const targetTabId = value.targetTabId === null ? null : positiveTabId(value.targetTabId);
  const phase = String(value.phase || "");
  const createdAt = finiteInteger(value.createdAt);
  const expiresAt = finiteInteger(value.expiresAt);
  const locator = normalizeWorkspacePromptPayloadLocator(value.locator, { allowExpired: true });
  const claimId = String(value.claimId || "").trim();
  const settledAt = finiteInteger(value.settledAt) ?? 0;
  const cleanupRetryAt = finiteInteger(value.cleanupRetryAt) ?? 0;
  const admittedCount = finiteInteger(value.admittedCount) ?? 0;
  const outcome = String(value.outcome || "");
  if (
    !handoffId
    || !workspaceId
    || !sourceWorkspaceId
    || sourceTabId === null
    || !PHASES.has(phase)
    || createdAt === null
    || expiresAt === null
    || expiresAt <= createdAt
    || expiresAt > createdAt + WORKSPACE_PROMPT_HANDOFF_TTL_MS
    || !locator
    || locator.handoffId !== handoffId
  ) return null;
  if (phase === "prepared" && claimId) return null;
  if (phase !== "prepared" && !normalizeWorkspacePromptHandoffId(claimId)) return null;
  if (phase === "settled" && !["admitted", "rejected"].includes(outcome)) return null;
  return {
    version: WORKSPACE_PROMPT_HANDOFF_VERSION,
    handoffId,
    workspaceId,
    sourceWorkspaceId,
    sourceTabId,
    targetTabId,
    phase,
    createdAt,
    expiresAt,
    locator,
    claimId,
    settledAt,
    cleanupRetryAt,
    admittedCount,
    outcome,
    expired: expiresAt <= current
  };
}

export function createWorkspacePromptHandoffRuntime(api, dependencies = {}) {
  if (!api?.runtime || !api?.tabs) {
    throw new TypeError("Workspace prompt handoff runtime requires the extension runtime and tabs API");
  }
  const sessionStorage = api?.storage?.session || null;
  const alarms = api.alarms || null;
  const payloadStore = dependencies.payloadStore || createWorkspacePromptPayloadStore(api, dependencies.payloadStoreDependencies);
  const openWorkspaceTab = dependencies.openWorkspaceTab;
  const now = dependencies.now || Date.now;
  const createWorkspaceId = dependencies.createWorkspaceId || createWorkspaceSessionId;
  const createClaimId = dependencies.createClaimId || (() => token("prompt-claim"));
  const sendRuntimeMessage = dependencies.sendRuntimeMessage || ((message) => api.runtime.sendMessage(message));
  const entries = new Map();
  let mutationTail = Promise.resolve();
  let initialization = null;
  let payloadWakeAt = 0;

  if (typeof openWorkspaceTab !== "function") {
    throw new TypeError("Workspace prompt handoff runtime requires openWorkspaceTab");
  }

  function withMutation(operation) {
    const result = mutationTail.catch(() => {}).then(operation);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  function storageValue() {
    return {
      version: WORKSPACE_PROMPT_HANDOFF_VERSION,
      entries: Object.fromEntries(Array.from(entries, ([handoffId, entry]) => [handoffId, {
        version: WORKSPACE_PROMPT_HANDOFF_VERSION,
        handoffId: entry.handoffId,
        workspaceId: entry.workspaceId,
        sourceWorkspaceId: entry.sourceWorkspaceId,
        sourceTabId: entry.sourceTabId,
        targetTabId: entry.targetTabId,
        phase: entry.phase,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        locator: entry.locator,
        claimId: entry.claimId,
        settledAt: entry.settledAt,
        cleanupRetryAt: entry.cleanupRetryAt,
        admittedCount: entry.admittedCount,
        outcome: entry.outcome
      }]))
    };
  }

  async function persist() {
    if (typeof sessionStorage?.set !== "function") {
      throw handoffError("HANDOFF_STORAGE_FAILED", "Workspace prompt handoff session storage is unavailable");
    }
    await sessionStorage.set({ [HANDOFF_LEDGER_KEY]: storageValue() });
  }

  function nextWakeAt(payloadExpiry = 0) {
    const deadlines = Array.from(entries.values(), (entry) => (
      entry.cleanupRetryAt || entry.expiresAt
    )).filter((value) => Number.isFinite(value) && value > 0);
    if (Number.isFinite(payloadExpiry) && payloadExpiry > 0) deadlines.push(payloadExpiry);
    return deadlines.length ? Math.min(...deadlines) : 0;
  }

  async function syncAlarm(payloadExpiry = payloadWakeAt) {
    if (typeof alarms?.create !== "function" || typeof alarms?.clear !== "function") return false;
    const deadline = nextWakeAt(payloadExpiry);
    if (!deadline) {
      await alarms.clear(WORKSPACE_PROMPT_HANDOFF_ALARM);
      return false;
    }
    await alarms.create(WORKSPACE_PROMPT_HANDOFF_ALARM, { when: Math.max(now(), deadline) });
    return true;
  }

  async function sendReceipt(entry) {
    try {
      await Promise.resolve(sendRuntimeMessage({
        source: EXTENSION_RUNTIME_RELAY_SOURCE,
        action: WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
        sourceTabId: entry.sourceTabId,
        handoffId: entry.handoffId,
        outcome: entry.outcome,
        admittedCount: entry.admittedCount
      }));
      return true;
    } catch {
      return false;
    }
  }

  async function removePayload(entry) {
    try {
      return await payloadStore.remove(entry.locator);
    } catch {
      return false;
    }
  }

  function scheduleCleanupRetry(entry, current = now()) {
    entry.cleanupRetryAt = current < entry.expiresAt
      ? Math.min(entry.expiresAt, current + CLEANUP_RETRY_MS)
      : current + CLEANUP_RETRY_MS;
  }

  async function cleanupEntryLocked(entry, options = {}) {
    if (!await removePayload(entry)) {
      if (options.releaseExpiredOwnership === true && now() >= entry.expiresAt) {
        entries.delete(entry.handoffId);
        return true;
      }
      scheduleCleanupRetry(entry);
      return false;
    }
    if (entry.phase === "settled" && !await sendReceipt(entry)) {
      if (now() < entry.expiresAt) {
        scheduleCleanupRetry(entry);
        return false;
      }
      entries.delete(entry.handoffId);
      return true;
    }
    entries.delete(entry.handoffId);
    return true;
  }

  async function pruneLocked() {
    const current = now();
    let changed = false;
    for (const entry of entries.values()) {
      const cleanupDue = entry.cleanupRetryAt
        ? entry.cleanupRetryAt <= current
        : entry.phase === "settled" || entry.expiresAt <= current;
      if (!cleanupDue) continue;
      await cleanupEntryLocked(entry, { releaseExpiredOwnership: true });
      changed = true;
    }
    const activeHandoffIds = new Set(entries.keys());
    const prunedPayloads = await payloadStore.prune({
      now: current,
      activeHandoffIds,
      orphanGraceMs: ORPHAN_PAYLOAD_GRACE_MS
    }).catch(() => ({ failed: 1, nextExpiresAt: 0 }));
    payloadWakeAt = prunedPayloads.failed > 0
      ? current + CLEANUP_RETRY_MS
      : Number(prunedPayloads.nextExpiresAt) || 0;
    if (changed) await persist();
    await syncAlarm(payloadWakeAt).catch(() => {});
    return changed;
  }

  function initialize() {
    if (initialization) return initialization;
    if (typeof sessionStorage?.get !== "function" || typeof sessionStorage?.set !== "function") {
      return Promise.resolve(false);
    }
    initialization = (async () => {
      const stored = await sessionStorage.get(HANDOFF_LEDGER_KEY);
      const ledger = stored?.[HANDOFF_LEDGER_KEY];
      const rawEntries = ledger?.version === WORKSPACE_PROMPT_HANDOFF_VERSION
        && plainObject(ledger.entries)
        ? Object.values(ledger.entries)
        : [];
      const current = now();
      const restored = rawEntries
        .map((value) => storedRecord(value, current))
        .filter(Boolean)
        .sort((first, second) => first.createdAt - second.createdAt)
        .slice(-WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES);
      entries.clear();
      for (const entry of restored) entries.set(entry.handoffId, entry);
      await persist();
      await withMutation(() => pruneLocked());
      return true;
    })().catch((error) => {
      initialization = null;
      throw error;
    });
    return initialization;
  }

  async function initializeRequest() {
    try {
      await initialize();
    } catch (error) {
      throw handoffError(
        "HANDOFF_STORAGE_FAILED",
        error?.message || "Workspace prompt handoff state could not be loaded"
      );
    }
  }

  async function payloadIsAvailable(locator) {
    try {
      return await payloadStore.has(locator);
    } catch (error) {
      throw handoffError(
        "HANDOFF_STORAGE_FAILED",
        error?.message || "Workspace prompt handoff payload could not be checked"
      );
    }
  }

  async function workspaceSender(sender = {}, expectedWorkspaceId = "", options = {}) {
    const tabId = positiveTabId(sender?.tab?.id);
    if (tabId === null) throw handoffError("HANDOFF_SENDER_INVALID", "Workspace prompt handoff requires a ChatClub tab");
    const senderHref = normalizedHref(sender?.url);
    const senderTabHref = normalizedHref(sender?.tab?.url);
    const senderWorkspaceId = chatClubWorkspaceId(api, senderTabHref, options);
    if (!senderWorkspaceId || !senderDocumentMatchesTab(senderHref, senderTabHref)) {
      throw handoffError("HANDOFF_SENDER_INVALID", "Workspace prompt handoff sender URL is invalid");
    }
    const liveTab = await api.tabs.get(tabId).catch(() => null);
    const liveHref = normalizedHref(liveTab?.url || liveTab?.pendingUrl);
    const rawPendingHref = String(liveTab?.pendingUrl || "");
    const pendingHref = rawPendingHref ? normalizedHref(rawPendingHref) : "";
    const liveWorkspaceId = chatClubWorkspaceId(api, liveHref, options);
    const pendingWorkspaceId = pendingHref ? chatClubWorkspaceId(api, pendingHref, options) : "";
    if (
      !liveWorkspaceId
      || liveWorkspaceId !== senderWorkspaceId
      || liveHref !== senderTabHref
      || (rawPendingHref && (pendingHref !== liveHref || pendingWorkspaceId !== senderWorkspaceId))
    ) {
      throw handoffError("HANDOFF_SENDER_INVALID", "Workspace prompt handoff tab URL changed");
    }
    const expected = normalizeWorkspaceSessionId(expectedWorkspaceId);
    if (expected && senderWorkspaceId !== expected) {
      throw handoffError("HANDOFF_TARGET_MISMATCH", "Workspace prompt handoff belongs to another workspace");
    }
    return { tabId, workspaceId: senderWorkspaceId, tab: liveTab };
  }

  async function open(message = {}, sender = {}) {
    await initializeRequest();
    return withMutation(async () => {
      await pruneLocked();
      const source = await workspaceSender(sender);
      const handoffId = normalizeWorkspacePromptHandoffId(message.handoffId);
      const locator = normalizeWorkspacePromptPayloadLocator(message.locator, { now: now() });
      if (!handoffId || !locator || locator.handoffId !== handoffId) {
        throw handoffError("HANDOFF_INVALID", "Workspace prompt handoff locator is invalid");
      }
      if (entries.has(handoffId)) {
        throw handoffError("HANDOFF_DUPLICATE", "Workspace prompt handoff already exists");
      }
      if (entries.size >= WORKSPACE_PROMPT_HANDOFF_MAX_ENTRIES) {
        await payloadStore.remove(locator).catch(() => {});
        throw handoffError("HANDOFF_LIMIT", "Too many workspace prompt handoffs are pending");
      }
      if (!await payloadIsAvailable(locator)) {
        throw handoffError("HANDOFF_PAYLOAD_MISSING", "Workspace prompt handoff payload is unavailable");
      }
      const workspaceId = normalizeWorkspaceSessionId(createWorkspaceId());
      if (!workspaceId) {
        await payloadStore.remove(locator).catch(() => {});
        throw handoffError("HANDOFF_INVALID", "Unable to allocate a workspace prompt handoff");
      }
      const createdAt = now();
      const entry = {
        version: WORKSPACE_PROMPT_HANDOFF_VERSION,
        handoffId,
        workspaceId,
        sourceWorkspaceId: source.workspaceId,
        sourceTabId: source.tabId,
        targetTabId: null,
        phase: "prepared",
        createdAt,
        expiresAt: Math.min(locator.expiresAt, createdAt + WORKSPACE_PROMPT_HANDOFF_TTL_MS),
        locator,
        claimId: "",
        settledAt: 0,
        cleanupRetryAt: 0,
        admittedCount: 0,
        outcome: ""
      };
      entries.set(handoffId, entry);
      try {
        await persist();
      } catch (error) {
        entries.delete(handoffId);
        await removePayload(entry);
        throw handoffError("HANDOFF_STORAGE_FAILED", error?.message || "Workspace prompt handoff could not be stored");
      }
      await syncAlarm().catch(() => {});
      let tab;
      try {
        tab = await openWorkspaceTab(api, sender, null, { workspaceId });
        if (positiveTabId(tab?.id) === null) throw new Error("New workspace tab is unavailable");
      } catch (error) {
        entries.delete(handoffId);
        await removePayload(entry);
        await persist().catch(() => {});
        await syncAlarm().catch(() => {});
        throw handoffError("HANDOFF_TAB_OPEN_FAILED", error?.message || "New workspace tab could not be opened");
      }
      entry.targetTabId = positiveTabId(tab.id);
      try {
        await persist();
      } catch (error) {
        entries.delete(handoffId);
        await removePayload(entry);
        try { await api.tabs.remove?.(entry.targetTabId); } catch {}
        await persist().catch(() => {});
        await syncAlarm().catch(() => {});
        throw handoffError("HANDOFF_STORAGE_FAILED", error?.message || "Workspace prompt handoff target binding could not be stored");
      }
      return { handoffId, workspaceId, tabId: entry.targetTabId };
    });
  }

  async function claim(message = {}, sender = {}) {
    await initializeRequest();
    return withMutation(async () => {
      await pruneLocked();
      const workspaceId = normalizeWorkspaceSessionId(message.workspaceId);
      const target = await workspaceSender(sender, workspaceId, { canonical: true });
      const entry = Array.from(entries.values()).find((candidate) => candidate.workspaceId === workspaceId);
      if (!entry || entry.phase !== "prepared") return { claimed: false };
      if (entry.targetTabId !== null && entry.targetTabId !== target.tabId) {
        throw handoffError("HANDOFF_TARGET_MISMATCH", "Workspace prompt handoff belongs to another tab");
      }
      if (!await payloadIsAvailable(entry.locator)) {
        entries.delete(entry.handoffId);
        await persist();
        await syncAlarm().catch(() => {});
        return { claimed: false };
      }
      const claimId = normalizeWorkspacePromptHandoffId(createClaimId());
      if (!claimId) throw handoffError("HANDOFF_INVALID", "Unable to claim workspace prompt handoff");
      const previousTargetTabId = entry.targetTabId;
      entry.targetTabId = target.tabId;
      entry.phase = "claimed";
      entry.claimId = claimId;
      try {
        await persist();
      } catch (error) {
        entry.targetTabId = previousTargetTabId;
        entry.phase = "prepared";
        entry.claimId = "";
        throw handoffError("HANDOFF_STORAGE_FAILED", error?.message || "Workspace prompt handoff claim could not be stored");
      }
      return {
        claimed: true,
        handoffId: entry.handoffId,
        claimId,
        locator: entry.locator
      };
    });
  }

  async function settle(message = {}, sender = {}) {
    await initializeRequest();
    return withMutation(async () => {
      await pruneLocked();
      const workspaceId = normalizeWorkspaceSessionId(message.workspaceId);
      const handoffId = normalizeWorkspacePromptHandoffId(message.handoffId);
      const claimId = normalizeWorkspacePromptHandoffId(message.claimId);
      const admittedCount = finiteInteger(message.admittedCount);
      if (!workspaceId || !handoffId || !claimId || admittedCount === null) {
        throw handoffError("HANDOFF_INVALID", "Workspace prompt handoff settlement is invalid");
      }
      const target = await workspaceSender(sender, workspaceId, { canonical: true });
      const entry = entries.get(handoffId);
      if (
        !entry
        || entry.workspaceId !== workspaceId
        || entry.targetTabId !== target.tabId
        || entry.claimId !== claimId
      ) throw handoffError("HANDOFF_TARGET_MISMATCH", "Workspace prompt handoff settlement does not match its claim");
      if (entry.phase === "settled") {
        const outcome = entry.outcome;
        const cleaned = await cleanupEntryLocked(entry);
        await persist().catch(() => {});
        await syncAlarm().catch(() => {});
        if (!cleaned) throw handoffError("HANDOFF_CLEANUP_FAILED", "Workspace prompt handoff cleanup is pending", true);
        return { settled: true, outcome };
      }
      if (entry.phase !== "claimed") {
        throw handoffError("HANDOFF_NOT_CLAIMED", "Workspace prompt handoff was not claimed");
      }
      const previousSettlement = {
        phase: entry.phase,
        settledAt: entry.settledAt,
        cleanupRetryAt: entry.cleanupRetryAt,
        admittedCount: entry.admittedCount,
        outcome: entry.outcome
      };
      entry.phase = "settled";
      entry.settledAt = now();
      entry.cleanupRetryAt = entry.settledAt;
      entry.admittedCount = admittedCount;
      entry.outcome = admittedCount > 0 ? "admitted" : "rejected";
      try {
        await persist();
      } catch (error) {
        Object.assign(entry, previousSettlement);
        throw handoffError("HANDOFF_STORAGE_FAILED", error?.message || "Workspace prompt handoff settlement could not be stored");
      }
      const outcome = entry.outcome;
      const cleaned = await cleanupEntryLocked(entry);
      await persist().catch(() => {});
      await syncAlarm().catch(() => {});
      if (!cleaned) throw handoffError("HANDOFF_CLEANUP_FAILED", "Workspace prompt handoff cleanup is pending", true);
      return { settled: true, outcome };
    });
  }

  async function handleTabRemoved(tabId) {
    await initialize();
    const targetTabId = positiveTabId(tabId);
    if (targetTabId === null) return 0;
    return withMutation(async () => {
      const matches = Array.from(entries.values()).filter((entry) => entry.targetTabId === targetTabId);
      for (const entry of matches) {
        await cleanupEntryLocked(entry);
      }
      if (matches.length) await persist();
      await syncAlarm().catch(() => {});
      return matches.length;
    });
  }

  async function handleTabUpdated(tabId, href) {
    await initialize();
    const targetTabId = positiveTabId(tabId);
    if (targetTabId === null) return 0;
    return withMutation(async () => {
      const matches = Array.from(entries.values()).filter((entry) => (
        entry.targetTabId === targetTabId
        && chatClubWorkspaceId(api, href, { canonical: true }) !== entry.workspaceId
      ));
      for (const entry of matches) {
        await cleanupEntryLocked(entry);
      }
      if (matches.length) await persist();
      await syncAlarm().catch(() => {});
      return matches.length;
    });
  }

  async function handleAlarm(alarm = {}) {
    if (String(alarm?.name || "") !== WORKSPACE_PROMPT_HANDOFF_ALARM) return false;
    await initialize();
    await withMutation(() => pruneLocked());
    return true;
  }

  function requestHandlers(actions = {}) {
    return [
      [actions.OPEN_WORKSPACE_TAB_WITH_PROMPT, (message, sender) => open(message, sender)],
      [actions.CLAIM_WORKSPACE_PROMPT_HANDOFF, (message, sender) => claim(message, sender)],
      [actions.SETTLE_WORKSPACE_PROMPT_HANDOFF, (message, sender) => settle(message, sender)]
    ];
  }

  return Object.freeze({
    claim,
    handleAlarm,
    handleTabRemoved,
    handleTabUpdated,
    initialize,
    open,
    requestHandlers,
    settle
  });
}
