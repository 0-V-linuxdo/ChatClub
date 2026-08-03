import { frameDocumentUrlsMatch, notionFrameLoadRequest } from "../shared/chat-frame-config.js";

const NOTION_FRAME_PREPARED_TIMEOUT_MS = 10_000;
const NOTION_FRAME_NAVIGATION_TIMEOUT_MS = 5 * 60_000;
const NOTION_FRAME_CANCELLATION_TIMEOUT_MS = NOTION_FRAME_NAVIGATION_TIMEOUT_MS;
const NOTION_FRAME_RELEASE_RETRY_MS = 1_000;
const NOTION_FRAME_ALARM_PERIOD_MINUTES = 0.5;
const NOTION_FRAME_LEASE_STORAGE_KEY = "chatclubNotionFramePreflightLeasesV1";
const NOTION_FRAME_LEASE_STORAGE_VERSION = 1;
const NOTION_FRAME_LEASE_ALARM = "chatclub-notion-frame-preflight-lease-expiry-v1";
const NOTION_FRAME_RULE_ID_MIN = 1_840_000_000;
const NOTION_FRAME_RULE_ID_MAX = NOTION_FRAME_RULE_ID_MIN + 65_535;
const NOTION_FRAME_RULE_MAX_ACTIVE = 32;
const NOTION_FRAME_RULE_MAX_REGEX_LENGTH = 1_900;
const NOTION_FRAME_RESPONSE_HEADERS = Object.freeze([
  Object.freeze({ header: "X-Frame-Options", operation: "remove" }),
  Object.freeze({ header: "Content-Security-Policy", operation: "remove" }),
  Object.freeze({ header: "Content-Security-Policy-Report-Only", operation: "remove" })
]);

function regexEscape(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function notionFrameRuleRegex(networkHref) {
  const exactUrl = regexEscape(networkHref);
  const regexFilter = `^${exactUrl}(?:&assetsVersion=[^&#]+&clientBuildTarget=[^&#]+)?$`;
  return regexFilter.length <= NOTION_FRAME_RULE_MAX_REGEX_LENGTH ? regexFilter : "";
}

function buildNotionFrameResponseRule(url, nonce, ruleId) {
  const request = notionFrameLoadRequest(url, nonce);
  const regexFilter = request ? notionFrameRuleRegex(request.networkHref) : "";
  if (
    !request
    || !regexFilter
    || !Number.isInteger(ruleId)
    || ruleId < NOTION_FRAME_RULE_ID_MIN
    || ruleId > NOTION_FRAME_RULE_ID_MAX
  ) return null;
  return {
    id: ruleId,
    priority: 10_000,
    action: {
      type: "modifyHeaders",
      responseHeaders: NOTION_FRAME_RESPONSE_HEADERS.map((entry) => ({ ...entry }))
    },
    condition: {
      regexFilter,
      isUrlFilterCaseSensitive: true,
      requestDomains: ["app.notion.com"],
      initiatorDomains: ["app.notion.com"],
      requestMethods: ["get"],
      resourceTypes: ["xmlhttprequest", "other"]
    }
  };
}

function publicResult(value = {}) {
  return {
    applicable: value.applicable === true,
    armed: value.armed === true,
    reason: String(value.reason || "")
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function notionRulesEqual(first, second) {
  try { return canonicalJson(first) === canonicalJson(second); } catch { return false; }
}

export function createNotionFramePreflightRuntime(api, dependencies = {}) {
  const dnr = api?.declarativeNetRequest;
  const sessionStorage = api?.storage?.session;
  const alarms = api?.alarms;
  const active = new Map();
  const pending = new Map();
  const cancelled = new Map();
  const setTimer = dependencies.setTimeout || globalThis.setTimeout;
  const clearTimer = dependencies.clearTimeout || globalThis.clearTimeout;
  const now = dependencies.now || Date.now;
  let nextRuleId = NOTION_FRAME_RULE_ID_MIN;
  let mutationTail = Promise.resolve();
  let initialization = null;

  function withDnrMutation(operation) {
    if (typeof operation !== "function") return Promise.reject(new TypeError("DNR mutation must be a function"));
    const result = mutationTail.catch(() => {}).then(operation);
    mutationTail = result.catch(() => {});
    return result;
  }

  function available() {
    let extensionUrl = "";
    try { extensionUrl = String(api?.runtime?.getURL?.("") || ""); } catch {}
    return extensionUrl.startsWith("chrome-extension://")
      && typeof dnr?.getSessionRules === "function"
      && typeof dnr?.updateSessionRules === "function"
      && typeof sessionStorage?.get === "function"
      && typeof sessionStorage?.set === "function"
      && typeof alarms?.create === "function"
      && typeof alarms?.clear === "function";
  }

  function allocateRuleId() {
    for (let count = 0; count <= NOTION_FRAME_RULE_ID_MAX - NOTION_FRAME_RULE_ID_MIN; count += 1) {
      const ruleId = nextRuleId;
      nextRuleId = ruleId >= NOTION_FRAME_RULE_ID_MAX ? NOTION_FRAME_RULE_ID_MIN : ruleId + 1;
      if (!active.has(ruleId)) return ruleId;
    }
    return 0;
  }

  function activeSessionRules() {
    const current = now();
    return Array.from(active.values())
      .filter((entry) => entry.deadlineAt > current)
      .map((entry) => entry.rule);
  }

  function sessionRulesWithActiveLeases(rules = []) {
    const baseRules = (Array.isArray(rules) ? rules : []).filter((rule) => {
      const ruleId = Number(rule?.id);
      return ruleId < NOTION_FRAME_RULE_ID_MIN || ruleId > NOTION_FRAME_RULE_ID_MAX;
    });
    return [...baseRules, ...activeSessionRules()];
  }

  function hasActiveLeases() {
    return active.size > 0;
  }

  function cancellationKey(tabId, request) {
    return `${Number(tabId)}\u0000${request.nonce}\u0000${request.networkHref}`;
  }

  function entryStorageValue(entry) {
    return {
      ruleId: entry.rule.id,
      tabId: entry.tabId,
      parentDocumentId: entry.parentDocumentId,
      nonce: entry.nonce,
      navigationHref: entry.navigationHref,
      networkHref: entry.networkHref,
      phase: entry.phase,
      frameId: entry.frameId,
      createdAt: entry.createdAt,
      phaseStartedAt: entry.phaseStartedAt,
      deadlineAt: entry.deadlineAt
    };
  }

  function storageValue() {
    return {
      version: NOTION_FRAME_LEASE_STORAGE_VERSION,
      leases: Object.fromEntries(Array.from(active.values(), (entry) => [String(entry.rule.id), entryStorageValue(entry)]))
    };
  }

  async function persistActive() {
    await sessionStorage.set({ [NOTION_FRAME_LEASE_STORAGE_KEY]: storageValue() });
  }

  async function syncExpiryAlarm() {
    const deadlines = Array.from(active.values(), (entry) => Number(entry.deadlineAt))
      .filter((deadline) => Number.isFinite(deadline));
    if (!deadlines.length) {
      await alarms.clear(NOTION_FRAME_LEASE_ALARM);
      return false;
    }
    await alarms.create(NOTION_FRAME_LEASE_ALARM, {
      when: Math.max(now(), Math.min(...deadlines)),
      periodInMinutes: NOTION_FRAME_ALARM_PERIOD_MINUTES
    });
    return true;
  }

  function clearEntryTimer(entry) {
    if (entry?.timer) clearTimer(entry.timer);
    if (entry) entry.timer = 0;
  }

  function armTimer(callback, delay) {
    const timer = setTimer(callback, delay);
    if (typeof timer?.unref === "function") timer.unref();
    return timer;
  }

  function scheduleEntryTimer(entry) {
    clearEntryTimer(entry);
    const delay = Math.max(0, entry.deadlineAt - now());
    entry.timer = armTimer(() => expireEntry(entry), delay);
  }

  function storedEntry(value, actualRule) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const ruleId = Number(value.ruleId);
    const tabId = Number(value.tabId);
    const frameId = Number(value.frameId || 0);
    const phase = String(value.phase || "");
    const deadlineAt = Number(value.deadlineAt);
    const current = now();
    const maximumLifetime = phase === "prepared"
      ? NOTION_FRAME_PREPARED_TIMEOUT_MS
      : NOTION_FRAME_NAVIGATION_TIMEOUT_MS;
    if (
      !Number.isInteger(ruleId)
      || ruleId < NOTION_FRAME_RULE_ID_MIN
      || ruleId > NOTION_FRAME_RULE_ID_MAX
      || !Number.isInteger(tabId)
      || tabId < 0
      || !["prepared", "navigating"].includes(phase)
      || !Number.isFinite(deadlineAt)
      || deadlineAt <= current
      || deadlineAt > current + maximumLifetime
      || (phase === "prepared" && frameId !== 0)
      || (phase === "navigating" && (!Number.isInteger(frameId) || frameId <= 0))
    ) return null;
    const request = notionFrameLoadRequest(value.navigationHref, value.nonce);
    if (!request || request.networkHref !== String(value.networkHref || "")) return null;
    const rule = buildNotionFrameResponseRule(request.navigationHref, request.nonce, ruleId);
    if (!rule || !notionRulesEqual(rule, actualRule)) return null;
    return {
      key: cancellationKey(tabId, request),
      nonce: request.nonce,
      navigationHref: request.navigationHref,
      networkHref: request.networkHref,
      tabId,
      parentDocumentId: String(value.parentDocumentId || ""),
      phase,
      frameId,
      createdAt: Number(value.createdAt) || current,
      phaseStartedAt: Number(value.phaseStartedAt) || current,
      deadlineAt,
      rule,
      timer: 0
    };
  }

  function initialize() {
    if (initialization) return initialization;
    if (!available()) return Promise.resolve(false);
    initialization = withDnrMutation(async () => {
      const [stored, rulesValue] = await Promise.all([
        sessionStorage.get(NOTION_FRAME_LEASE_STORAGE_KEY),
        dnr.getSessionRules()
      ]);
      const rules = Array.isArray(rulesValue) ? rulesValue : [];
      const rulesById = new Map(rules.map((rule) => [Number(rule?.id), rule]));
      const rawLedger = stored?.[NOTION_FRAME_LEASE_STORAGE_KEY];
      const rawLeases = rawLedger?.version === NOTION_FRAME_LEASE_STORAGE_VERSION
        && rawLedger.leases
        && typeof rawLedger.leases === "object"
        && !Array.isArray(rawLedger.leases)
        ? rawLedger.leases
        : {};
      const restored = [];
      for (const [rawRuleId, value] of Object.entries(rawLeases)) {
        const ruleId = Number(rawRuleId);
        if (ruleId !== Number(value?.ruleId) || restored.length >= NOTION_FRAME_RULE_MAX_ACTIVE) continue;
        const entry = storedEntry(value, rulesById.get(ruleId));
        if (entry) restored.push(entry);
      }
      active.clear();
      for (const entry of restored) active.set(entry.rule.id, entry);
      const removeRuleIds = rules
        .map((rule) => Number(rule?.id))
        .filter((ruleId) => (
          ruleId >= NOTION_FRAME_RULE_ID_MIN
          && ruleId <= NOTION_FRAME_RULE_ID_MAX
          && !active.has(ruleId)
        ));
      if (removeRuleIds.length) await dnr.updateSessionRules({ removeRuleIds });
      await persistActive();
      for (const entry of active.values()) scheduleEntryTimer(entry);
      await syncExpiryAlarm();
      return true;
    }).catch((error) => {
      initialization = null;
      throw error;
    });
    return initialization;
  }

  function pruneCancellations() {
    const current = now();
    for (const [key, entry] of cancelled) {
      if (entry.expiresAt <= current) {
        if (entry.timer) clearTimer(entry.timer);
        cancelled.delete(key);
      }
    }
  }

  function rememberCancellation(key, tabId) {
    pruneCancellations();
    const previous = cancelled.get(key);
    if (previous?.timer) clearTimer(previous.timer);
    const cancellation = {
      tabId: Number(tabId),
      expiresAt: now() + NOTION_FRAME_CANCELLATION_TIMEOUT_MS,
      timer: 0
    };
    cancellation.timer = armTimer(() => {
      if (cancelled.get(key) === cancellation) cancelled.delete(key);
    }, NOTION_FRAME_CANCELLATION_TIMEOUT_MS);
    cancelled.set(key, cancellation);
  }

  async function releaseEntriesLocked(entries) {
    const currentEntries = entries.filter((entry) => entry && active.get(entry.rule.id) === entry);
    if (!currentEntries.length) return 0;
    const ruleIds = currentEntries.map((entry) => entry.rule.id);
    try {
      await dnr.updateSessionRules({ removeRuleIds: ruleIds });
    } catch {
      const retryAt = now();
      for (const entry of currentEntries) {
        entry.deadlineAt = Math.min(entry.deadlineAt, retryAt);
        clearEntryTimer(entry);
        entry.timer = armTimer(() => releaseEntry(entry).catch(() => {}), NOTION_FRAME_RELEASE_RETRY_MS);
      }
      try { await persistActive(); } catch {}
      try { await syncExpiryAlarm(); } catch {}
      return 0;
    }
    for (const entry of currentEntries) {
      if (active.get(entry.rule.id) !== entry) continue;
      active.delete(entry.rule.id);
      clearEntryTimer(entry);
    }
    try { await persistActive(); } catch {}
    try { await syncExpiryAlarm(); } catch {}
    return currentEntries.length;
  }

  async function releaseEntry(entry) {
    await initialize();
    return withDnrMutation(() => releaseEntriesLocked([entry]));
  }

  function expireEntry(entry) {
    if (!entry || active.get(entry.rule.id) !== entry || entry.deadlineAt > now()) return;
    releaseEntry(entry).catch(() => {});
  }

  function registerPendingPreparation(message = {}, metadata = {}) {
    const request = notionFrameLoadRequest(message.url, message.preflightId);
    if (!request) return null;
    const tabId = Number(message.tabId);
    const key = cancellationKey(tabId, request);
    const existing = pending.get(key);
    if (existing) return existing;
    const attempt = {
      key,
      request,
      tabId,
      parentDocumentId: String(metadata.parentDocumentId || message.parentDocumentId || ""),
      cancelled: false,
      promise: null
    };
    pending.set(key, attempt);
    return attempt;
  }

  function finishPendingPreparation(attempt) {
    if (attempt && pending.get(attempt.key) === attempt) pending.delete(attempt.key);
  }

  function armPendingPreparation(attempt) {
    if (!attempt) return Promise.resolve(publicResult());
    if (attempt.promise) return attempt.promise;
    attempt.promise = (async () => {
      if (!available()) return publicResult({ applicable: true, reason: "session-rules-unavailable" });
      await initialize();
      pruneCancellations();
      if (attempt.cancelled || cancelled.has(attempt.key)) {
        return publicResult({ applicable: true, reason: "cancelled" });
      }
      return withDnrMutation(async () => {
        if (attempt.cancelled || cancelled.has(attempt.key)) {
          return publicResult({ applicable: true, reason: "cancelled" });
        }
        const existing = Array.from(active.values()).find((entry) => entry.key === attempt.key);
        if (existing) return publicResult({ applicable: true, armed: true });
        if (active.size >= NOTION_FRAME_RULE_MAX_ACTIVE) {
          return publicResult({ applicable: true, reason: "too-many-pending-navigations" });
        }
        const ruleId = allocateRuleId();
        const rule = buildNotionFrameResponseRule(attempt.request.navigationHref, attempt.request.nonce, ruleId);
        if (!rule) return publicResult({ applicable: true, reason: "invalid-rule" });
        const startedAt = now();
        const entry = {
          key: attempt.key,
          nonce: attempt.request.nonce,
          navigationHref: attempt.request.navigationHref,
          networkHref: attempt.request.networkHref,
          tabId: attempt.tabId,
          parentDocumentId: attempt.parentDocumentId,
          phase: "prepared",
          frameId: 0,
          createdAt: startedAt,
          phaseStartedAt: startedAt,
          deadlineAt: startedAt + NOTION_FRAME_PREPARED_TIMEOUT_MS,
          rule,
          timer: 0
        };
        active.set(rule.id, entry);
        let installed = false;
        try {
          await persistActive();
          await dnr.updateSessionRules({ removeRuleIds: [rule.id], addRules: [rule] });
          installed = true;
          if (attempt.cancelled || cancelled.has(attempt.key) || entry.deadlineAt <= now()) {
            const reason = attempt.cancelled || cancelled.has(attempt.key) ? "cancelled" : "rule-expired";
            await releaseEntriesLocked([entry]);
            return publicResult({ applicable: true, reason });
          }
          scheduleEntryTimer(entry);
          await syncExpiryAlarm();
          return publicResult({ applicable: true, armed: true });
        } catch {
          if (installed) {
            const released = await releaseEntriesLocked([entry]);
            if (!released && active.get(rule.id) === entry) {
              return publicResult({ applicable: true, reason: "session-rule-install-failed" });
            }
          }
          if (active.get(rule.id) === entry) active.delete(rule.id);
          clearEntryTimer(entry);
          try { await persistActive(); } catch {}
          try { await syncExpiryAlarm(); } catch {}
          return publicResult({ applicable: true, reason: "session-rule-install-failed" });
        }
      });
    })().finally(() => finishPendingPreparation(attempt));
    return attempt.promise;
  }

  async function prepareFrameLoad(message = {}, metadata = {}) {
    const attempt = registerPendingPreparation(message, metadata);
    return armPendingPreparation(attempt);
  }

  async function cancelFrameLoad(message = {}, tabId) {
    const request = notionFrameLoadRequest(message.url, message.preflightId);
    if (!request || !Number.isInteger(Number(tabId))) return false;
    const key = cancellationKey(tabId, request);
    const attempt = pending.get(key);
    if (attempt) attempt.cancelled = true;
    rememberCancellation(key, tabId);
    if (!available()) return true;
    await initialize();
    await withDnrMutation(() => releaseEntriesLocked(Array.from(active.values()).filter((entry) => entry.key === key)));
    return true;
  }

  async function beginNavigation(details = {}) {
    if (!available()) return false;
    await initialize();
    const tabId = Number(details.tabId);
    const frameId = Number(details.frameId);
    const parentFrameId = Number(details.parentFrameId);
    const href = String(details.url || "");
    const parentDocumentId = String(details.parentDocumentId || "");
    if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0 || parentFrameId !== 0) return false;
    return withDnrMutation(async () => {
      let changed = false;
      for (const entry of active.values()) {
        if (entry.tabId !== tabId) continue;
        const request = notionFrameLoadRequest(href, entry.nonce);
        if (!request || request.navigationHref !== entry.navigationHref || request.networkHref !== entry.networkHref) continue;
        if (entry.parentDocumentId && entry.parentDocumentId !== parentDocumentId) continue;
        // onBeforeNavigate has no future documentId. Claim the exact nonce URL
        // here, but leave terminal proof to the authenticated frame registration.
        if (entry.phase === "navigating") {
          return entry.frameId === frameId;
        }
        entry.phase = "navigating";
        entry.frameId = frameId;
        entry.phaseStartedAt = now();
        entry.deadlineAt = entry.phaseStartedAt + NOTION_FRAME_NAVIGATION_TIMEOUT_MS;
        scheduleEntryTimer(entry);
        changed = true;
        break;
      }
      if (changed) {
        await persistActive();
        try { await syncExpiryAlarm(); } catch {}
      }
      return changed;
    });
  }

  async function settleRegisteredFrame(sender = {}) {
    if (!available()) return 0;
    await initialize();
    const tabId = Number(sender?.tab?.id);
    const frameId = Number(sender?.frameId);
    const documentId = String(sender?.documentId || "");
    const href = String(sender?.url || "");
    if (
      !Number.isInteger(tabId)
      || !Number.isInteger(frameId)
      || frameId <= 0
      || !documentId
    ) return 0;
    return withDnrMutation(async () => {
      const matches = [];
      for (const entry of active.values()) {
        if (
          entry.phase !== "navigating"
          || entry.tabId !== tabId
          || entry.frameId !== frameId
        ) continue;
        const request = notionFrameLoadRequest(href, entry.nonce);
        // REGISTER_FRAME_CONTEXT has already authenticated this concrete
        // sender document, so tab/frame plus nonce-bound URL equivalence is a terminal proof.
        if (
          (request?.navigationHref !== entry.navigationHref || request.networkHref !== entry.networkHref)
          && !frameDocumentUrlsMatch(href, entry.navigationHref)
        ) continue;
        matches.push(entry);
      }
      return releaseEntriesLocked(matches);
    });
  }

  async function handleTabRemoved(tabId) {
    const normalizedTabId = Number(tabId);
    for (const attempt of pending.values()) {
      if (attempt.tabId === normalizedTabId) attempt.cancelled = true;
    }
    for (const [key, entry] of cancelled) {
      if (entry.tabId !== normalizedTabId) continue;
      if (entry.timer) clearTimer(entry.timer);
      cancelled.delete(key);
    }
    if (!available()) return 0;
    await initialize();
    return withDnrMutation(() => releaseEntriesLocked(Array.from(active.values()).filter((entry) => entry.tabId === normalizedTabId)));
  }

  async function handleAlarm(alarm = {}) {
    if (String(alarm?.name || "") !== NOTION_FRAME_LEASE_ALARM || !available()) return false;
    await initialize();
    return withDnrMutation(async () => {
      const expired = Array.from(active.values()).filter((entry) => entry.deadlineAt <= now());
      if (expired.length) await releaseEntriesLocked(expired);
      else await syncExpiryAlarm();
      return true;
    });
  }

  async function cleanupStaleSessionRules() {
    return initialize();
  }

  function dnrRuleUpdater(updateDnrRules) {
    if (typeof updateDnrRules !== "function") throw new TypeError("Notion frame preflight requires a DNR rule updater");
    return async (tabId, message = {}, sender = {}) => {
      const request = notionFrameLoadRequest(message.url, message.preflightId);
      const attempt = request
        ? registerPendingPreparation({ ...message, tabId }, { parentDocumentId: sender?.documentId })
        : null;
      try {
        const mode = await updateDnrRules(tabId);
        if (!request) return;
        if (mode !== "session") throw new Error("Notion frame preflight failed: session-rules-unavailable");
        const result = await armPendingPreparation(attempt);
        if (!result.armed) throw new Error(`Notion frame preflight failed: ${result.reason || "unavailable"}`);
      } catch (error) {
        if (attempt) attempt.cancelled = true;
        finishPendingPreparation(attempt);
        throw error;
      }
    };
  }

  return Object.freeze({
    activeSessionRules,
    beginNavigation,
    cancelFrameLoad,
    cleanupStaleSessionRules,
    dnrRuleUpdater,
    handleAlarm,
    handleTabRemoved,
    hasActiveLeases,
    initialize,
    prepareFrameLoad,
    sessionRulesWithActiveLeases,
    settleRegisteredFrame,
    withDnrMutation
  });
}
