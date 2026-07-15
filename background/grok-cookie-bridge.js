export const GROK_SESSION_COOKIE_NAMES = Object.freeze(["sso", "sso-rw", "grok_device_id"]);
export const GROK_COOKIE_LEDGER_KEY = "chatclubGrokCookieBridgeLedgerV1";

const GROK_COOKIE_URL = "https://grok.com/";
const GROK_FRAME_HOSTS = new Set(["grok.com"]);
const GROK_COOKIE_NAME_SET = new Set(GROK_SESSION_COOKIE_NAMES);
const PENDING_OPERATION_TTL_MS = 5000;
const pendingOperations = new Map();

function normalizedCookieDomain(value) {
  return String(value || "").trim().replace(/^\./, "").toLowerCase();
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
  if (!GROK_COOKIE_NAME_SET.has(String(name || "")) || !key) return "";
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
    if (!partitionKey || !GROK_COOKIE_NAME_SET.has(name)) continue;
    const canonicalId = targetIdentity(name, entry.storeId, partitionKey);
    if (!canonicalId || canonicalId !== id) continue;
    ledger.entries[id] = {
      name,
      storeId: String(entry.storeId || ""),
      url: String(entry.url || GROK_COOKIE_URL),
      partitionKey
    };
  }
  for (const [id, entry] of Object.entries(value.tombstones || {})) {
    const partitionKey = normalizedPartitionKey(entry?.partitionKey);
    const name = String(entry?.name || "");
    if (!partitionKey || !GROK_COOKIE_NAME_SET.has(name)) continue;
    const canonicalId = targetIdentity(name, entry.storeId, partitionKey);
    if (!canonicalId || canonicalId !== id) continue;
    ledger.tombstones[id] = {
      name,
      storeId: String(entry.storeId || ""),
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

function cookieUrl(cookie = {}) {
  const host = normalizedCookieDomain(cookie.domain);
  if (host !== "grok.com") return "";
  const path = String(cookie.path || "/");
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function sourceCookieIsUsable(cookie, name) {
  return Boolean(
    cookie
    && cookie.name === name
    && GROK_COOKIE_NAME_SET.has(name)
    && normalizedCookieDomain(cookie.domain) === "grok.com"
    && cookie.secure === true
    && !cookie.partitionKey?.topLevelSite
  );
}

function targetCookieMatchesSource(target, source, partitionKey) {
  if (!target || !source || !samePartitionKey(target.partitionKey, partitionKey)) return false;
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

function setDetailsForSource(source, storeId, partitionKey) {
  const url = cookieUrl(source);
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
  if (!source.hostOnly) details.domain = String(source.domain || ".grok.com");
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
  if (target) events.push({ removed: true, value: String(target.value || "") });
  events.push({ removed: false, value: String(source.value || "") });
  pendingOperations.set(id, { expiresAt: Date.now() + PENDING_OPERATION_TTL_MS, events });
}

function clearPendingSetEvents(name, storeId, partitionKey) {
  const id = targetIdentity(name, storeId, partitionKey);
  if (id) pendingOperations.delete(id);
}

export function isGrokSessionUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && GROK_FRAME_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
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

export async function syncGrokSessionCookies(api, options = {}) {
  const partitionKey = normalizedPartitionKey(options.partitionKey);
  if (!partitionKey) throw new Error("Grok Cookie partition is unavailable");
  const storeId = String(options.storeId || "");
  const requestedNames = Array.isArray(options.names) ? options.names : GROK_SESSION_COOKIE_NAMES;
  const names = requestedNames.filter((name) => GROK_COOKIE_NAME_SET.has(String(name || "")));
  const ledger = await readLedger(api);
  let created = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  for (const name of names) {
    const id = targetIdentity(name, storeId, partitionKey);
    const sourceQuery = cookieDetailsWithStore({ url: GROK_COOKIE_URL, name }, storeId);
    const targetQuery = cookieDetailsWithStore({ ...sourceQuery, partitionKey }, storeId);
    const source = await api.cookies.get(sourceQuery);
    const target = await api.cookies.get(targetQuery);
    const managed = Boolean(ledger.entries[id]);
    const tombstoned = Boolean(ledger.tombstones[id]);

    if (!sourceCookieIsUsable(source, name)) {
      if (managed && target) {
        await api.cookies.remove(targetQuery);
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
      if (targetCookieMatchesSource(target, source, partitionKey)) {
        ledger.entries[id] = {
          name,
          storeId,
          url: cookieUrl(source),
          partitionKey
        };
        await writeLedger(api, ledger);
      } else {
        skipped += 1;
      }
      continue;
    }
    if (target && targetCookieMatchesSource(target, source, partitionKey)) continue;

    const setDetails = setDetailsForSource(source, storeId, partitionKey);
    if (!setDetails) {
      skipped += 1;
      continue;
    }
    ledger.entries[id] = {
      name,
      storeId,
      url: setDetails.url,
      partitionKey
    };
    await writeLedger(api, ledger);
    markPendingSetEvents(target, source, storeId, partitionKey);
    try {
      await api.cookies.set(setDetails);
    } catch (error) {
      clearPendingSetEvents(name, storeId, partitionKey);
      throw error;
    }
    if (target) updated += 1;
    else created += 1;
  }

  return { changed: created + updated + removed > 0, created, updated, removed, skipped };
}

export async function removeManagedGrokPartitionsExcept(api, options = {}) {
  const keepPartitionKey = normalizedPartitionKey(options.partitionKey);
  if (!keepPartitionKey) return { changed: false, removed: 0 };
  const storeId = String(options.storeId || "");
  const ledger = await readLedger(api);
  let removed = 0;
  for (const [id, entry] of Object.entries(ledger.entries)) {
    if (entry.storeId !== storeId || samePartitionKey(entry.partitionKey, keepPartitionKey)) continue;
    await api.cookies.remove(cookieDetailsWithStore({
      url: entry.url,
      name: entry.name,
      partitionKey: entry.partitionKey
    }, storeId));
    delete ledger.entries[id];
    delete ledger.tombstones[id];
    await writeLedger(api, ledger);
    removed += 1;
  }
  return { changed: removed > 0, removed };
}

export async function removeAllManagedGrokPartitions(api) {
  const ledger = await readLedger(api);
  let removed = 0;
  for (const [id, entry] of Object.entries(ledger.entries)) {
    await api.cookies.remove(cookieDetailsWithStore({
      url: entry.url,
      name: entry.name,
      partitionKey: entry.partitionKey
    }, entry.storeId));
    delete ledger.entries[id];
    delete ledger.tombstones[id];
    await writeLedger(api, ledger);
    removed += 1;
  }
  await api.storage.local.remove(GROK_COOKIE_LEDGER_KEY);
  return { changed: removed > 0, removed };
}

export function isUnpartitionedGrokSourceChange(changeInfo = {}) {
  const cookie = changeInfo.cookie;
  return Boolean(
    cookie
    && GROK_COOKIE_NAME_SET.has(String(cookie.name || ""))
    && normalizedCookieDomain(cookie.domain) === "grok.com"
    && !cookie.partitionKey?.topLevelSite
  );
}

export function isPartitionedGrokTargetChange(changeInfo = {}) {
  const cookie = changeInfo.cookie;
  return Boolean(
    cookie
    && GROK_COOKIE_NAME_SET.has(String(cookie.name || ""))
    && normalizedCookieDomain(cookie.domain) === "grok.com"
    && normalizedPartitionKey(cookie.partitionKey)
  );
}

export function grokCookieChangeOwnedByBridge(changeInfo = {}) {
  const cookie = changeInfo.cookie;
  prunePendingOperations();
  const id = targetIdentity(cookie?.name, cookie?.storeId, cookie?.partitionKey);
  const pending = id ? pendingOperations.get(id) : null;
  if (!pending) return false;
  const index = pending.events.findIndex((event) =>
    event.removed === Boolean(changeInfo.removed)
    && event.value === String(cookie?.value || "")
  );
  if (index < 0) return false;
  pending.events.splice(index, 1);
  if (pending.events.length) pendingOperations.set(id, pending);
  else pendingOperations.delete(id);
  return true;
}

export async function releaseChangedGrokPartition(api, changeInfo = {}) {
  if (!isPartitionedGrokTargetChange(changeInfo) || grokCookieChangeOwnedByBridge(changeInfo)) {
    return { changed: false, tombstoned: false };
  }
  const cookie = changeInfo.cookie;
  const id = targetIdentity(cookie.name, cookie.storeId, cookie.partitionKey);
  const ledger = await readLedger(api);
  if (!ledger.entries[id]) return { changed: false, tombstoned: false };
  delete ledger.entries[id];
  const tombstoned = Boolean(
    changeInfo.removed
    && (changeInfo.cause === "explicit" || changeInfo.cause === "expired_overwrite")
    && (cookie.name === "sso" || cookie.name === "sso-rw")
  );
  if (tombstoned) {
    ledger.tombstones[id] = {
      name: cookie.name,
      storeId: String(cookie.storeId || ""),
      partitionKey: normalizedPartitionKey(cookie.partitionKey)
    };
  }
  await writeLedger(api, ledger);
  return { changed: true, tombstoned };
}

export async function clearGrokTombstonesForStore(api, storeId, names = []) {
  const allowedNames = new Set(
    (Array.isArray(names) ? names : []).filter((name) => name === "sso" || name === "sso-rw")
  );
  if (!allowedNames.size) return false;
  const ledger = await readLedger(api);
  let changed = false;
  for (const [id, entry] of Object.entries(ledger.tombstones)) {
    if (entry.storeId !== String(storeId || "") || !allowedNames.has(entry.name)) continue;
    delete ledger.tombstones[id];
    changed = true;
  }
  if (changed) await writeLedger(api, ledger);
  return changed;
}

export async function managedGrokPartitionKeys(api, storeId) {
  const ledger = await readLedger(api);
  const keys = [];
  for (const entry of Object.values(ledger.entries)) {
    if (entry.storeId !== String(storeId || "")) continue;
    if (!keys.some((key) => samePartitionKey(key, entry.partitionKey))) keys.push(entry.partitionKey);
  }
  return keys;
}
