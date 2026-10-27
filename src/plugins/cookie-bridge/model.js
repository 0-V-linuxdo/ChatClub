// CookieBridge data (v2 05 §6.2): which login cookies are mirrored into the extension's iframe partition.
// Never holds cookie values: only names, domains and timestamps.

export const STATE_KEY = "chatclubCookieBridgeV1";
export const TOMBSTONE_MS = 10 * 60 * 1000;

export const SITES = [
  { id: "grok", domains: ["grok.com"], names: ["sso", "sso-rw", "grok_device_id"], reloadOnChange: true },
  { id: "manus", domains: ["manus.im"], names: ["session_id", "login_success"], reloadOnChange: false },
];

const bare = (domain) => String(domain || "").replace(/^\./, "").toLowerCase();

/** The bridged site a host belongs to, or null. */
export function siteForHost(host) {
  const h = bare(host);
  return SITES.find((s) => s.domains.some((d) => h === d || h.endsWith(`.${d}`))) ?? null;
}

/** The bridged site a cookie belongs to (by name and domain), or null. */
export function siteForCookie(cookie) {
  const site = siteForHost(cookie?.domain);
  return site && site.names.includes(cookie.name) ? site : null;
}

export const cookieKey = (cookie) => `${bare(cookie.domain)}|${cookie.path || "/"}|${cookie.name}`;

export const emptyState = () => ({ version: 1, mirrors: {}, tombstones: {}, changedAt: {} });

export function normalizeState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    mirrors: s.mirrors && typeof s.mirrors === "object" ? s.mirrors : {},
    tombstones: s.tombstones && typeof s.tombstones === "object" ? s.tombstones : {},
    changedAt: s.changedAt && typeof s.changedAt === "object" ? s.changedAt : {},
  };
}

/** Drops tombstones older than TOMBSTONE_MS. */
export function pruneTombstones(state, now = Date.now()) {
  const tombstones = {};
  for (const [k, at] of Object.entries(state.tombstones)) if (now - at < TOMBSTONE_MS) tombstones[k] = at;
  return { ...state, tombstones };
}

/** The `chrome.cookies.set` details for the partitioned copy of a source cookie (always Secure + SameSite=None). */
export function mirrorDetails(source, partitionKey) {
  const domain = bare(source.domain);
  const details = {
    url: `https://${domain}${source.path || "/"}`,
    name: source.name,
    value: source.value,
    path: source.path || "/",
    secure: true,
    httpOnly: !!source.httpOnly,
    sameSite: "no_restriction",
    partitionKey,
  };
  if (!source.hostOnly) details.domain = source.domain;
  if (!source.session && Number.isFinite(source.expirationDate)) details.expirationDate = source.expirationDate;
  return details;
}

/** True when a cookie's partition key is exactly the expected extension partition. */
export function samePartition(a, b) {
  return !!a && !!b && a.topLevelSite === b.topLevelSite && !!a.hasCrossSiteAncestor === !!b.hasCrossSiteAncestor;
}
