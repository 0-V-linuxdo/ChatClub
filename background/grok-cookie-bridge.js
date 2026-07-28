export const GROK_SESSION_COOKIE_NAMES = Object.freeze(["sso", "sso-rw", "grok_device_id"]);
export const GROK_COOKIE_LEDGER_KEY = "chatclubGrokCookieBridgeLedgerV1";

const GROK_MIRROR_SESSION_COOKIE_NAMES = Object.freeze(["user-gateway-token"]);
const GROK_COOKIE_PROFILES = Object.freeze({
  grok: Object.freeze({
    id: "grok",
    host: "grok.com",
    url: "https://grok.com/",
    names: GROK_SESSION_COOKIE_NAMES,
    sourceMustBeSecure: true,
    tombstoneNames: Object.freeze(["sso", "sso-rw"])
  }),
  grokMirror: Object.freeze({
    id: "grokMirror",
    host: "gk.dairoot.cn",
    url: "https://gk.dairoot.cn/",
    names: GROK_MIRROR_SESSION_COOKIE_NAMES,
    sourceMustBeSecure: false,
    tombstoneNames: GROK_MIRROR_SESSION_COOKIE_NAMES
  })
});
const DEFAULT_GROK_COOKIE_PROFILE = GROK_COOKIE_PROFILES.grok;
const GROK_COOKIE_PROFILE_BY_HOST = new Map(
  Object.values(GROK_COOKIE_PROFILES).map((profile) => [profile.host, profile])
);
const GROK_COOKIE_PROFILE_BY_NAME = new Map(
  Object.values(GROK_COOKIE_PROFILES).flatMap((profile) => profile.names.map((name) => [name, profile]))
);
const GROK_AUTH_COOKIE_NAME_SET = new Set(
  Object.values(GROK_COOKIE_PROFILES).flatMap((profile) => profile.tombstoneNames)
);
const PENDING_OPERATION_TTL_MS = 5000;
const GROK_MIRROR_LOGIN_COOKIE_SECONDS = 12 * 60 * 60;
const GROK_MIRROR_RANDOM_COOKIE_SECONDS = 7 * 24 * 60 * 60;
const pendingOperations = new Map();
const ledgerTransactionTails = new WeakMap();

async function withLedgerTransaction(api, task) {
  if (!api || typeof task !== "function") throw new TypeError("Grok Cookie ledger transaction is invalid");
  const previous = ledgerTransactionTails.get(api) || Promise.resolve();
  let release;
  const slot = new Promise((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => slot);
  ledgerTransactionTails.set(api, tail);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (ledgerTransactionTails.get(api) === tail) ledgerTransactionTails.delete(api);
  }
}

function normalizedCookieDomain(value) {
  return String(value || "").trim().replace(/^\./, "").toLowerCase();
}

function cookieProfileForId(value) {
  return GROK_COOKIE_PROFILES[String(value || "")] || null;
}

function cookieProfileForUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    return GROK_COOKIE_PROFILE_BY_HOST.get(parsed.hostname.toLowerCase()) || null;
  } catch {
    return null;
  }
}

function cookieProfileForCookie(cookie = {}) {
  const profile = GROK_COOKIE_PROFILE_BY_NAME.get(String(cookie?.name || "")) || null;
  return profile && normalizedCookieDomain(cookie?.domain) === profile.host ? profile : null;
}

function cookieProfileForSyncOptions(options = {}) {
  if (Object.hasOwn(options, "frameUrl")) return cookieProfileForUrl(options.frameUrl);
  if (Object.hasOwn(options, "profileId")) return cookieProfileForId(options.profileId);
  return DEFAULT_GROK_COOKIE_PROFILE;
}

function normalizedManagedCookieUrl(value, profile) {
  try {
    const parsed = new URL(String(value || profile?.url || ""));
    if (
      !profile
      || parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== profile.host
      || parsed.username
      || parsed.password
      || parsed.port
    ) return "";
    const path = parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`;
    return `https://${profile.host}${path || "/"}`;
  } catch {
    return "";
  }
}

function normalizedPartitionKey(value) {
  const topLevelSite = String(value?.topLevelSite || "").replace(/\/+$/, "");
  if (!/^chrome-extension:\/\/[a-p]{32}$/i.test(topLevelSite)) return null;
  const key = { topLevelSite };
  if (typeof value?.hasCrossSiteAncestor === "boolean") {
    key.hasCrossSiteAncestor = value.hasCrossSiteAncestor;
  }
  return key;
}

function samePartitionKey(left, right) {
  const a = normalizedPartitionKey(left);
  const b = normalizedPartitionKey(right);
  return Boolean(
    a
    && b
    && a.topLevelSite === b.topLevelSite
    && Boolean(a.hasCrossSiteAncestor) === Boolean(b.hasCrossSiteAncestor)
  );
}

function targetIdentity(name, storeId, partitionKey) {
  const key = normalizedPartitionKey(partitionKey);
  if (!GROK_COOKIE_PROFILE_BY_NAME.has(String(name || "")) || !key) return "";
  return JSON.stringify([
    String(storeId || ""),
    String(name),
    key.topLevelSite,
    Boolean(key.hasCrossSiteAncestor)
  ]);
}

function emptyLedger() {
  return { version: 1, entries: {}, tombstones: {} };
}

function normalizedLedger(value) {
  const ledger = emptyLedger();
  if (!value || typeof value !== "object" || Array.isArray(value)) return ledger;
  for (const [id, entry] of Object.entries(value.entries || {})) {
    const partitionKey = normalizedPartitionKey(entry?.partitionKey);
    const name = String(entry?.name || "");
    const profile = GROK_COOKIE_PROFILE_BY_NAME.get(name) || null;
    if (!partitionKey || !profile) continue;
    const canonicalId = targetIdentity(name, entry.storeId, partitionKey);
    if (!canonicalId || canonicalId !== id) continue;
    const url = normalizedManagedCookieUrl(entry.url, profile);
    if (!url) continue;
    ledger.entries[id] = {
      name,
      storeId: String(entry.storeId || ""),
      url,
      partitionKey
    };
  }
  for (const [id, entry] of Object.entries(value.tombstones || {})) {
    const partitionKey = normalizedPartitionKey(entry?.partitionKey);
    const name = String(entry?.name || "");
    const profile = GROK_COOKIE_PROFILE_BY_NAME.get(name) || null;
    if (!partitionKey || !profile || !GROK_AUTH_COOKIE_NAME_SET.has(name)) continue;
    const canonicalId = targetIdentity(name, entry.storeId, partitionKey);
    if (!canonicalId || canonicalId !== id) continue;
    const url = normalizedManagedCookieUrl(entry.url, profile);
    if (!url) continue;
    ledger.tombstones[id] = {
      name,
      storeId: String(entry.storeId || ""),
      url,
      partitionKey
    };
  }
  return ledger;
}

async function readLedger(api) {
  const stored = await api.storage.local.get(GROK_COOKIE_LEDGER_KEY);
  return normalizedLedger(stored?.[GROK_COOKIE_LEDGER_KEY]);
}

async function writeLedger(api, ledger) {
  await api.storage.local.set({ [GROK_COOKIE_LEDGER_KEY]: normalizedLedger(ledger) });
}

function cookieDetailsWithStore(details, storeId) {
  return String(storeId || "") ? { ...details, storeId: String(storeId) } : details;
}

function cookieUrl(cookie = {}, expectedProfile = null) {
  const profile = cookieProfileForCookie(cookie);
  if (!profile || (expectedProfile && profile !== expectedProfile)) return "";
  const host = normalizedCookieDomain(cookie.domain);
  const path = String(cookie.path || "/");
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function sourceCookieIsUsable(cookie, name, profile) {
  return Boolean(
    cookie
    && cookie.name === name
    && profile?.names.includes(name)
    && cookieProfileForCookie(cookie) === profile
    && (!profile.sourceMustBeSecure || cookie.secure === true)
    && !cookie.partitionKey?.topLevelSite
  );
}

function targetCookieMatchesSource(target, source, partitionKey, profile) {
  if (!target || !source || !samePartitionKey(target.partitionKey, partitionKey)) return false;
  if (cookieProfileForCookie(target) !== profile || cookieProfileForCookie(source) !== profile) return false;
  if (target.value !== source.value) return false;
  if (target.secure !== true || target.sameSite !== "no_restriction") return false;
  if (Boolean(target.httpOnly) !== Boolean(source.httpOnly)) return false;
  if (String(target.path || "/") !== String(source.path || "/")) return false;
  if (normalizedCookieDomain(target.domain) !== normalizedCookieDomain(source.domain)) return false;
  if (Boolean(target.hostOnly) !== Boolean(source.hostOnly)) return false;
  if (Boolean(target.session) !== Boolean(source.session)) return false;
  if (!source.session) {
    const sourceExpiry = Number(source.expirationDate);
    const targetExpiry = Number(target.expirationDate);
    if (!Number.isFinite(sourceExpiry) || !Number.isFinite(targetExpiry) || Math.abs(sourceExpiry - targetExpiry) > 1) {
      return false;
    }
  }
  return true;
}

function setDetailsForSource(source, storeId, partitionKey, profile) {
  const url = cookieUrl(source, profile);
  if (!url) return null;
  const details = cookieDetailsWithStore({
    url,
    name: source.name,
    value: source.value,
    path: String(source.path || "/"),
    secure: true,
    httpOnly: Boolean(source.httpOnly),
    sameSite: "no_restriction",
    partitionKey: normalizedPartitionKey(partitionKey)
  }, storeId);
  if (!source.hostOnly) details.domain = String(source.domain || `.${profile.host}`);
  if (!source.session && Number.isFinite(Number(source.expirationDate))) {
    details.expirationDate = Number(source.expirationDate);
  }
  return details;
}

function prunePendingOperations(now = Date.now()) {
  for (const [id, pending] of pendingOperations) {
    if (Number(pending?.expiresAt) <= now) pendingOperations.delete(id);
  }
}

function markPendingSetEvents(target, source, storeId, partitionKey) {
  const id = targetIdentity(source?.name, storeId, partitionKey);
  if (!id) return;
  prunePendingOperations();
  const events = [];
  if (target) {
    events.push({
      removed: true,
      value: String(target.value || ""),
      url: cookieUrl(target)
    });
  }
  events.push({
    removed: false,
    value: String(source.value || ""),
    url: cookieUrl(source)
  });
  pendingOperations.set(id, { expiresAt: Date.now() + PENDING_OPERATION_TTL_MS, events });
}

function clearPendingSetEvents(name, storeId, partitionKey) {
  const id = targetIdentity(name, storeId, partitionKey);
  if (id) pendingOperations.delete(id);
}

function appendPendingRollbackEvents(target, previousTarget, storeId, partitionKey) {
  const name = String(target?.name || previousTarget?.name || "");
  const id = targetIdentity(name, storeId, partitionKey);
  if (!id) return;
  prunePendingOperations();
  const pending = pendingOperations.get(id) || { expiresAt: 0, events: [] };
  if (target) {
    pending.events.push({
      removed: true,
      value: String(target.value || ""),
      url: cookieUrl(target)
    });
  }
  if (previousTarget) {
    pending.events.push({
      removed: false,
      value: String(previousTarget.value || ""),
      url: cookieUrl(previousTarget)
    });
  }
  pending.expiresAt = Date.now() + PENDING_OPERATION_TTL_MS;
  pendingOperations.set(id, pending);
}

async function rollbackUncommittedPartitionSet(targetCookies, {
  target,
  source,
  storeId,
  partitionKey,
  profile,
  setDetails
}) {
  const writtenQuery = cookieDetailsWithStore({
    url: setDetails.url,
    name: setDetails.name,
    partitionKey
  }, storeId);
  const written = await targetCookies.get(writtenQuery);
  appendPendingRollbackEvents(written, target, storeId, partitionKey);
  if (written) await targetCookies.remove(writtenQuery);
  const afterRemoval = await targetCookies.get(writtenQuery);
  if (!target) {
    if (afterRemoval) throw new Error("Grok Cookie creation rollback verification failed");
    return;
  }
  if (targetCookieMatchesSource(afterRemoval, source, partitionKey, profile)) {
    throw new Error("Grok Cookie update rollback removal failed");
  }
  const restoreDetails = setDetailsForSource(target, storeId, partitionKey, profile);
  if (!restoreDetails) throw new Error("Grok Cookie update rollback target is invalid");
  await targetCookies.set(restoreDetails);
  const restoreQuery = cookieDetailsWithStore({
    url: restoreDetails.url,
    name: restoreDetails.name,
    partitionKey
  }, storeId);
  const restored = await targetCookies.get(restoreQuery);
  if (!targetCookieMatchesSource(restored, target, partitionKey, profile)) {
    throw new Error("Grok Cookie update rollback verification failed");
  }
  const remainingWritten = await targetCookies.get(writtenQuery);
  if (targetCookieMatchesSource(remainingWritten, source, partitionKey, profile)) {
    throw new Error("Grok Cookie update rollback left the uncommitted projection installed");
  }
}

function partitionCookieBackend(api, options = {}) {
  const backend = options.partitionCookieBackend;
  if (backend == null) return api.cookies;
  if (
    typeof backend !== "object"
    || typeof backend.get !== "function"
    || typeof backend.set !== "function"
    || typeof backend.remove !== "function"
  ) throw new TypeError("Grok Cookie partition backend is invalid");
  return backend;
}

async function managedCleanupBackend(api, options, entry) {
  const resolver = options?.partitionCookieBackendForEntry;
  if (typeof resolver !== "function") return api.cookies;
  const backend = await resolver(Object.freeze({
    name: entry.name,
    storeId: entry.storeId,
    url: entry.url,
    partitionKey: normalizedPartitionKey(entry.partitionKey)
  }));
  return partitionCookieBackend(api, { partitionCookieBackend: backend });
}

function mirrorLoginTokenLifetimeSeconds(value) {
  const token = String(value || "");
  if (/^gt-[0-9a-f]{32}$/.test(token)) return GROK_MIRROR_LOGIN_COOKIE_SECONDS;
  if (/^random-[A-Za-z0-9]{32}$/.test(token)) return GROK_MIRROR_RANDOM_COOKIE_SECONDS;
  return 0;
}

function mirrorLoginCookieMatches(cookie, token, partitionKey, lifetimeSeconds) {
  if (!cookie || cookie.value !== token || !samePartitionKey(cookie.partitionKey, partitionKey)) return false;
  const remainingSeconds = Number(cookie.expirationDate) - Date.now() / 1000;
  return cookieProfileForCookie(cookie)?.id === "grokMirror"
    && cookie.hostOnly === true
    && String(cookie.path || "/") === "/"
    && cookie.secure === true
    && cookie.httpOnly === true
    && cookie.sameSite === "no_restriction"
    && cookie.session === false
    && Number.isFinite(remainingSeconds)
    && remainingSeconds > lifetimeSeconds - 5 * 60
    && remainingSeconds <= lifetimeSeconds + 60;
}

async function releaseMirrorLoginCookieOwnership(api, storeId, partitionKey) {
  const id = targetIdentity("user-gateway-token", storeId, partitionKey);
  if (!id) throw new Error("Grok Mirror login Cookie target is invalid");
  const ledger = await readLedger(api);
  const changed = Boolean(ledger.entries[id] || ledger.tombstones[id]);
  delete ledger.entries[id];
  delete ledger.tombstones[id];
  if (changed) await writeLedger(api, ledger);
}

async function setGrokMirrorLoginCookieTransaction(api, options = {}) {
  const token = String(options.token || "");
  const lifetimeSeconds = mirrorLoginTokenLifetimeSeconds(token);
  const partitionKey = normalizedPartitionKey(options.partitionKey);
  if (!lifetimeSeconds || !partitionKey) {
    throw new Error("Grok Mirror login Cookie input is invalid");
  }
  const storeId = String(options.storeId || "");
  const targetCookies = partitionCookieBackend(api, options);
  const query = cookieDetailsWithStore({
    url: GROK_COOKIE_PROFILES.grokMirror.url,
    name: "user-gateway-token",
    partitionKey
  }, storeId);
  const existing = await targetCookies.get(query);
  if (mirrorLoginCookieMatches(existing, token, partitionKey, lifetimeSeconds)) {
    await releaseMirrorLoginCookieOwnership(api, storeId, partitionKey);
    return { changed: false, created: 0, updated: 0 };
  }
  const details = cookieDetailsWithStore({
    url: GROK_COOKIE_PROFILES.grokMirror.url,
    name: "user-gateway-token",
    value: token,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "no_restriction",
    expirationDate: Date.now() / 1000 + lifetimeSeconds,
    partitionKey
  }, storeId);
  const projected = {
    ...details,
    domain: GROK_COOKIE_PROFILES.grokMirror.host,
    hostOnly: true,
    session: false
  };
  markPendingSetEvents(existing, projected, storeId, partitionKey);
  try {
    await targetCookies.set(details);
  } catch (error) {
    let observed;
    try {
      observed = await targetCookies.get(query);
    } catch (probeError) {
      throw new AggregateError(
        [error, probeError],
        "Grok Mirror login Cookie delivery could not be determined"
      );
    }
    if (targetCookieMatchesSource(
      observed,
      projected,
      partitionKey,
      GROK_COOKIE_PROFILES.grokMirror
    )) {
      try {
        await rollbackUncommittedPartitionSet(targetCookies, {
          target: existing,
          source: projected,
          storeId,
          partitionKey,
          profile: GROK_COOKIE_PROFILES.grokMirror,
          setDetails: details
        });
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Grok Mirror login Cookie installation and partition rollback both failed"
        );
      }
      throw new Error("Grok Mirror login Cookie could not be installed", { cause: error });
    }
    const unchanged = existing
      ? targetCookieMatchesSource(
        observed,
        existing,
        partitionKey,
        GROK_COOKIE_PROFILES.grokMirror
      )
      : !observed;
    if (unchanged) {
      clearPendingSetEvents("user-gateway-token", storeId, partitionKey);
      throw new Error("Grok Mirror login Cookie could not be installed", { cause: error });
    }
    throw new AggregateError(
      [error],
      "Grok Mirror login Cookie delivery state is ambiguous"
    );
  }
  try {
    const installed = await targetCookies.get(query);
    if (!mirrorLoginCookieMatches(installed, token, partitionKey, lifetimeSeconds)) {
      throw new Error("Grok Mirror login Cookie verification failed");
    }
    await releaseMirrorLoginCookieOwnership(api, storeId, partitionKey);
  } catch (error) {
    try {
      await rollbackUncommittedPartitionSet(targetCookies, {
        target: existing,
        source: projected,
        storeId,
        partitionKey,
        profile: GROK_COOKIE_PROFILES.grokMirror,
        setDetails: details
      });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Grok Mirror login ownership release and partition rollback both failed"
      );
    }
    throw error;
  }
  return { changed: true, created: existing ? 0 : 1, updated: existing ? 1 : 0 };
}

export function setGrokMirrorLoginCookie(api, options = {}) {
  return withLedgerTransaction(api, () => setGrokMirrorLoginCookieTransaction(api, options));
}

export function isGrokSessionUrl(value) {
  return Boolean(cookieProfileForUrl(value));
}

export function grokCookieProfileIdForUrl(value) {
  return cookieProfileForUrl(value)?.id || "";
}

export function grokCookieProfileIdForCookie(cookie) {
  return cookieProfileForCookie(cookie)?.id || "";
}

export function chromiumExtensionPartitionKey(runtime) {
  const extensionBase = String(runtime?.getURL?.("") || "");
  const topLevelSite = extensionBase.match(/^chrome-extension:\/\/[a-p]{32}/i)?.[0] || "";
  return topLevelSite ? { topLevelSite, hasCrossSiteAncestor: true } : null;
}

export async function cookieStoreIdForTab(api, tabId) {
  if (!Number.isInteger(tabId)) throw new Error("Cookie store tab is unavailable");
  const stores = await api.cookies.getAllCookieStores();
  const store = (stores || []).find((entry) => Array.isArray(entry?.tabIds) && entry.tabIds.includes(tabId));
  if (!store?.id) throw new Error("Cookie store for the ChatClub tab is unavailable");
  return String(store.id);
}

async function syncGrokSessionCookiesTransaction(api, options = {}) {
  const partitionKey = normalizedPartitionKey(options.partitionKey);
  if (!partitionKey) throw new Error("Grok Cookie partition is unavailable");
  const profile = cookieProfileForSyncOptions(options);
  if (!profile) throw new Error("Grok Cookie profile is unavailable");
  const storeId = String(options.storeId || "");
  const targetCookies = partitionCookieBackend(api, options);
  const requestedNames = Array.isArray(options.names) ? options.names : profile.names;
  const names = requestedNames.filter((name) => profile.names.includes(String(name || "")));
  const ledger = await readLedger(api);
  let created = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  for (const name of names) {
    const id = targetIdentity(name, storeId, partitionKey);
    const sourceQuery = cookieDetailsWithStore({ url: profile.url, name }, storeId);
    const source = await api.cookies.get(sourceQuery);
    const sourceUsable = sourceCookieIsUsable(source, name, profile);
    const targetUrl = sourceUsable
      ? cookieUrl(source, profile)
      : String(ledger.entries[id]?.url || profile.url);
    const targetQuery = cookieDetailsWithStore({ url: targetUrl, name, partitionKey }, storeId);
    const target = await targetCookies.get(targetQuery);
    const managed = Boolean(ledger.entries[id]);
    const tombstoned = Boolean(ledger.tombstones[id]);

    if (!sourceUsable) {
      if (managed && target) {
        await targetCookies.remove(targetQuery);
        removed += 1;
      }
      if (managed) {
        delete ledger.entries[id];
        await writeLedger(api, ledger);
      }
      if (tombstoned) {
        delete ledger.tombstones[id];
        await writeLedger(api, ledger);
      }
      continue;
    }

    if (tombstoned) {
      skipped += 1;
      continue;
    }
    if (target && !managed) {
      if (targetCookieMatchesSource(target, source, partitionKey, profile)) {
        ledger.entries[id] = {
          name,
          storeId,
          url: cookieUrl(source, profile),
          partitionKey
        };
        await writeLedger(api, ledger);
      } else {
        skipped += 1;
      }
      continue;
    }
    if (target && targetCookieMatchesSource(target, source, partitionKey, profile)) continue;

    const setDetails = setDetailsForSource(source, storeId, partitionKey, profile);
    if (!setDetails) {
      skipped += 1;
      continue;
    }
    markPendingSetEvents(target, source, storeId, partitionKey);
    let deliveryError = null;
    try {
      await targetCookies.set(setDetails);
    } catch (error) {
      let observed;
      try {
        observed = await targetCookies.get(targetQuery);
      } catch (probeError) {
        throw new AggregateError(
          [error, probeError],
          "Grok Cookie set delivery could not be determined"
        );
      }
      if (targetCookieMatchesSource(observed, source, partitionKey, profile)) {
        deliveryError = error;
      } else {
        const unchanged = target
          ? targetCookieMatchesSource(observed, target, partitionKey, profile)
          : !observed;
        if (unchanged) {
          clearPendingSetEvents(name, storeId, partitionKey);
          throw error;
        }
        throw new AggregateError([error], "Grok Cookie set delivery state is ambiguous");
      }
    }
    const previousEntry = ledger.entries[id] ? {
      ...ledger.entries[id],
      partitionKey: normalizedPartitionKey(ledger.entries[id].partitionKey)
    } : null;
    ledger.entries[id] = {
      name,
      storeId,
      url: setDetails.url,
      partitionKey
    };
    try {
      await writeLedger(api, ledger);
    } catch (error) {
      if (previousEntry) ledger.entries[id] = previousEntry;
      else delete ledger.entries[id];
      try {
        await rollbackUncommittedPartitionSet(targetCookies, {
          target,
          source,
          storeId,
          partitionKey,
          profile,
          setDetails
        });
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Grok Cookie ledger write and partition rollback both failed"
        );
      }
      throw error;
    }
    if (deliveryError) {
      throw new Error("Grok Cookie set reported failure after a verified write", {
        cause: deliveryError
      });
    }
    if (target) updated += 1;
    else created += 1;
  }

  return { changed: created + updated + removed > 0, created, updated, removed, skipped };
}

export function syncGrokSessionCookies(api, options = {}) {
  return withLedgerTransaction(api, () => syncGrokSessionCookiesTransaction(api, options));
}

async function removeManagedGrokPartitionsExceptTransaction(api, options = {}) {
  const keepPartitionKey = normalizedPartitionKey(options.partitionKey);
  if (!keepPartitionKey) return { changed: false, removed: 0 };
  const revalidate = typeof options.revalidate === "function" ? options.revalidate : null;
  const requireCurrentTarget = async () => {
    if (revalidate && await revalidate() !== true) {
      throw new Error("Grok Cookie bridge frame changed");
    }
  };
  const storeId = String(options.storeId || "");
  await requireCurrentTarget();
  const ledger = await readLedger(api);
  let removed = 0;
  let changed = false;
  for (const [id, entry] of Object.entries(ledger.entries)) {
    if (entry.storeId !== storeId || samePartitionKey(entry.partitionKey, keepPartitionKey)) continue;
    await requireCurrentTarget();
    const backend = await managedCleanupBackend(api, options, entry);
    const details = cookieDetailsWithStore({
      url: entry.url,
      name: entry.name,
      partitionKey: entry.partitionKey
    }, storeId);
    const existing = await backend.get(details);
    if (existing) {
      await backend.remove(details);
      if (await backend.get(details)) throw new Error("Grok Cookie cleanup verification failed");
      removed += 1;
    }
    await requireCurrentTarget();
    delete ledger.entries[id];
    delete ledger.tombstones[id];
    changed = true;
  }
  for (const [id, entry] of Object.entries(ledger.tombstones)) {
    if (entry.storeId !== storeId || samePartitionKey(entry.partitionKey, keepPartitionKey)) continue;
    await requireCurrentTarget();
    delete ledger.tombstones[id];
    changed = true;
  }
  if (changed) {
    await requireCurrentTarget();
    await writeLedger(api, ledger);
  }
  return { changed, removed };
}

export function removeManagedGrokPartitionsExcept(api, options = {}) {
  return withLedgerTransaction(api, () => removeManagedGrokPartitionsExceptTransaction(api, options));
}

async function removeAllManagedGrokPartitionsTransaction(api, options = {}) {
  const ledger = await readLedger(api);
  let removed = 0;
  for (const [id, entry] of Object.entries(ledger.entries)) {
    const backend = await managedCleanupBackend(api, options, entry);
    const details = cookieDetailsWithStore({
      url: entry.url,
      name: entry.name,
      partitionKey: entry.partitionKey
    }, entry.storeId);
    const existing = await backend.get(details);
    if (existing) {
      await backend.remove(details);
      if (await backend.get(details)) throw new Error("Grok Cookie cleanup verification failed");
      removed += 1;
    }
    delete ledger.entries[id];
    delete ledger.tombstones[id];
    await writeLedger(api, ledger);
  }
  await api.storage.local.remove(GROK_COOKIE_LEDGER_KEY);
  return { changed: removed > 0, removed };
}

export function removeAllManagedGrokPartitions(api, options = {}) {
  return withLedgerTransaction(api, () => removeAllManagedGrokPartitionsTransaction(api, options));
}

export function isUnpartitionedGrokSourceChange(changeInfo = {}) {
  const cookie = changeInfo.cookie;
  const profile = cookieProfileForCookie(cookie);
  return Boolean(
    cookie
    && profile
    && !cookie.partitionKey?.topLevelSite
  );
}

export function isPartitionedGrokTargetChange(changeInfo = {}) {
  const cookie = changeInfo.cookie;
  const profile = cookieProfileForCookie(cookie);
  return Boolean(
    cookie
    && profile
    && normalizedPartitionKey(cookie.partitionKey)
  );
}

export function grokCookieChangeOwnedByBridge(changeInfo = {}) {
  const cookie = changeInfo.cookie;
  const profile = cookieProfileForCookie(cookie);
  if (!profile) return false;
  prunePendingOperations();
  const id = targetIdentity(cookie?.name, cookie?.storeId, cookie?.partitionKey);
  const pending = id ? pendingOperations.get(id) : null;
  if (!pending) return false;
  const index = pending.events.findIndex((event) =>
    event.removed === Boolean(changeInfo.removed)
    && event.value === String(cookie?.value || "")
    && event.url === cookieUrl(cookie, profile)
  );
  if (index < 0) return false;
  pending.events.splice(index, 1);
  if (pending.events.length) pendingOperations.set(id, pending);
  else pendingOperations.delete(id);
  return true;
}

async function releaseChangedGrokPartitionTransaction(api, changeInfo = {}) {
  if (!isPartitionedGrokTargetChange(changeInfo) || grokCookieChangeOwnedByBridge(changeInfo)) {
    return { changed: false, tombstoned: false };
  }
  const cookie = changeInfo.cookie;
  const id = targetIdentity(cookie.name, cookie.storeId, cookie.partitionKey);
  const ledger = await readLedger(api);
  const entry = ledger.entries[id];
  const profile = cookieProfileForCookie(cookie);
  const changedUrl = normalizedManagedCookieUrl(cookieUrl(cookie, profile), profile);
  if (!entry || !changedUrl || changedUrl !== entry.url) return { changed: false, tombstoned: false };
  delete ledger.entries[id];
  const tombstoned = Boolean(
    changeInfo.removed
    && (changeInfo.cause === "explicit" || changeInfo.cause === "expired_overwrite")
    && cookieProfileForCookie(cookie)?.tombstoneNames.includes(cookie.name)
  );
  if (tombstoned) {
    ledger.tombstones[id] = {
      name: cookie.name,
      storeId: String(cookie.storeId || ""),
      url: entry.url,
      partitionKey: normalizedPartitionKey(cookie.partitionKey)
    };
  }
  await writeLedger(api, ledger);
  return { changed: true, tombstoned };
}

export function releaseChangedGrokPartition(api, changeInfo = {}) {
  return withLedgerTransaction(api, () => releaseChangedGrokPartitionTransaction(api, changeInfo));
}

async function clearGrokTombstonesForStoreTransaction(api, storeId, sourceChanges = []) {
  const selectors = [];
  for (const sourceChange of Array.isArray(sourceChanges) ? sourceChanges : []) {
    const profile = cookieProfileForCookie(sourceChange);
    const name = String(sourceChange?.name || "");
    if (!profile || !GROK_AUTH_COOKIE_NAME_SET.has(name) || sourceChange.partitionKey?.topLevelSite) continue;
    const current = await api.cookies.get(cookieDetailsWithStore({ url: profile.url, name }, storeId));
    if (!sourceCookieIsUsable(current, name, profile)) continue;
    const sourceUrl = normalizedManagedCookieUrl(cookieUrl(sourceChange, profile), profile);
    const currentUrl = normalizedManagedCookieUrl(cookieUrl(current, profile), profile);
    if (!sourceUrl || sourceUrl !== currentUrl || sourceChange.value !== current.value) continue;
    selectors.push({ name, url: currentUrl });
  }
  if (!selectors.length) return false;
  const ledger = await readLedger(api);
  let changed = false;
  for (const [id, entry] of Object.entries(ledger.tombstones)) {
    if (
      entry.storeId !== String(storeId || "")
      || !selectors.some((selector) => selector.name === entry.name && selector.url === entry.url)
    ) continue;
    delete ledger.tombstones[id];
    changed = true;
  }
  if (changed) await writeLedger(api, ledger);
  return changed;
}

export function clearGrokTombstonesForStore(api, storeId, sourceChanges = []) {
  return withLedgerTransaction(
    api,
    () => clearGrokTombstonesForStoreTransaction(api, storeId, sourceChanges)
  );
}

async function managedGrokPartitionKeysTransaction(api, storeId, options = {}) {
  const ledger = await readLedger(api);
  const profile = Object.hasOwn(options, "profileId") ? cookieProfileForId(options.profileId) : null;
  if (Object.hasOwn(options, "profileId") && !profile) return [];
  const keys = [];
  for (const entry of [...Object.values(ledger.entries), ...Object.values(ledger.tombstones)]) {
    if (entry.storeId !== String(storeId || "")) continue;
    if (profile && GROK_COOKIE_PROFILE_BY_NAME.get(entry.name) !== profile) continue;
    if (!keys.some((key) => samePartitionKey(key, entry.partitionKey))) keys.push(entry.partitionKey);
  }
  return keys;
}

export function managedGrokPartitionKeys(api, storeId, options = {}) {
  return withLedgerTransaction(api, () => managedGrokPartitionKeysTransaction(api, storeId, options));
}
