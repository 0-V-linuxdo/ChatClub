import { notionFrameLoadRequest } from "../shared/chat-frame-config.js";

const NOTION_FRAME_RULE_TIMEOUT_MS = 10_000;
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

export function createNotionFramePreflightRuntime(api, dependencies = {}) {
  const dnr = api?.declarativeNetRequest;
  const active = new Map();
  const cancelled = new Map();
  const setTimer = dependencies.setTimeout || globalThis.setTimeout;
  const clearTimer = dependencies.clearTimeout || globalThis.clearTimeout;
  const now = dependencies.now || Date.now;
  let nextRuleId = NOTION_FRAME_RULE_ID_MIN;
  let mutationTail = Promise.resolve();

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
      && typeof dnr?.updateSessionRules === "function";
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
      .filter((entry) => entry.expiresAt > current)
      .map((entry) => entry.rule);
  }

  function cancellationKey(tabId, request) {
    return `${Number(tabId)}\u0000${request.nonce}\u0000${request.networkHref}`;
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

  async function releaseEntry(entry) {
    if (!entry || active.get(entry.rule.id) !== entry) return false;
    active.delete(entry.rule.id);
    if (entry.timer) clearTimer(entry.timer);
    try {
      await withDnrMutation(() => dnr.updateSessionRules({ removeRuleIds: [entry.rule.id] }));
    } catch {}
    return true;
  }

  function expireEntry(entry) {
    if (!entry || active.get(entry.rule.id) !== entry || entry.expiresAt > now()) return;
    releaseEntry(entry).catch(() => {});
  }

  async function prepareFrameLoad(message = {}) {
    const request = notionFrameLoadRequest(message.url, message.preflightId);
    if (!request) return publicResult();
    if (!available()) return publicResult({ applicable: true, reason: "session-rules-unavailable" });
    pruneCancellations();
    const cancelKey = cancellationKey(message.tabId, request);
    if (cancelled.has(cancelKey)) return publicResult({ applicable: true, reason: "cancelled" });
    if (active.size >= NOTION_FRAME_RULE_MAX_ACTIVE) {
      return publicResult({ applicable: true, reason: "too-many-pending-navigations" });
    }
    const ruleId = allocateRuleId();
    const rule = buildNotionFrameResponseRule(message.url, message.preflightId, ruleId);
    if (!rule) return publicResult({ applicable: true, reason: "invalid-rule" });
    const entry = {
      nonce: request.nonce,
      networkHref: request.networkHref,
      tabId: Number(message.tabId),
      expiresAt: now() + NOTION_FRAME_RULE_TIMEOUT_MS,
      rule,
      timer: 0
    };
    active.set(rule.id, entry);
    entry.timer = setTimer(() => expireEntry(entry), NOTION_FRAME_RULE_TIMEOUT_MS);
    try {
      await withDnrMutation(() => dnr.updateSessionRules({ removeRuleIds: [rule.id], addRules: [rule] }));
      if (active.get(rule.id) !== entry || entry.expiresAt <= now() || cancelled.has(cancelKey)) {
        const reason = cancelled.has(cancelKey) ? "cancelled" : "rule-expired";
        await releaseEntry(entry);
        return publicResult({ applicable: true, reason });
      }
      return publicResult({ applicable: true, armed: true });
    } catch {
      await releaseEntry(entry);
      return publicResult({ applicable: true, reason: "session-rule-install-failed" });
    }
  }

  async function cancelFrameLoad(message = {}, tabId) {
    const request = notionFrameLoadRequest(message.url, message.preflightId);
    if (!request || !Number.isInteger(Number(tabId))) return false;
    pruneCancellations();
    const key = cancellationKey(tabId, request);
    const previous = cancelled.get(key);
    if (previous?.timer) clearTimer(previous.timer);
    const cancellation = { tabId: Number(tabId), expiresAt: now() + NOTION_FRAME_RULE_TIMEOUT_MS, timer: 0 };
    cancellation.timer = setTimer(() => {
      if (cancelled.get(key) === cancellation) cancelled.delete(key);
    }, NOTION_FRAME_RULE_TIMEOUT_MS);
    cancelled.set(key, cancellation);
    const releases = [];
    for (const entry of active.values()) {
      if (
        entry.tabId === Number(tabId)
        && entry.nonce === request.nonce
        && entry.networkHref === request.networkHref
      ) releases.push(releaseEntry(entry));
    }
    await Promise.all(releases);
    return true;
  }

  function settleNavigation(details = {}) {
    const tabId = Number(details.tabId);
    const href = String(details.url || "");
    for (const entry of active.values()) {
      const request = notionFrameLoadRequest(href, entry.nonce);
      if (
        entry.tabId === tabId
        && request?.networkHref === entry.networkHref
      ) releaseEntry(entry).catch(() => {});
    }
  }

  function handleTabRemoved(tabId) {
    for (const entry of active.values()) {
      if (entry.tabId === Number(tabId)) releaseEntry(entry).catch(() => {});
    }
    for (const [key, entry] of cancelled) {
      if (entry.tabId !== Number(tabId)) continue;
      if (entry.timer) clearTimer(entry.timer);
      cancelled.delete(key);
    }
  }

  async function cleanupStaleSessionRules() {
    if (!available()) return false;
    return withDnrMutation(async () => {
      const rules = await dnr.getSessionRules();
      const removeRuleIds = (Array.isArray(rules) ? rules : [])
        .map((rule) => Number(rule?.id))
        .filter((ruleId) => (
          ruleId >= NOTION_FRAME_RULE_ID_MIN
          && ruleId <= NOTION_FRAME_RULE_ID_MAX
          && !active.has(ruleId)
        ));
      if (removeRuleIds.length) await dnr.updateSessionRules({ removeRuleIds });
      return true;
    });
  }

  function dnrRuleUpdater(updateDnrRules) {
    if (typeof updateDnrRules !== "function") throw new TypeError("Notion frame preflight requires a DNR rule updater");
    return async (tabId, message = {}) => {
      const mode = await updateDnrRules(tabId);
      if (!notionFrameLoadRequest(message.url, message.preflightId)) return;
      if (mode !== "session") throw new Error("Notion frame preflight failed: session-rules-unavailable");
      const result = await prepareFrameLoad({ ...message, tabId });
      if (!result.armed) throw new Error(`Notion frame preflight failed: ${result.reason || "unavailable"}`);
    };
  }

  return Object.freeze({
    activeSessionRules,
    cancelFrameLoad,
    cleanupStaleSessionRules,
    dnrRuleUpdater,
    handleTabRemoved,
    prepareFrameLoad,
    settleNavigation,
    withDnrMutation
  });
}
