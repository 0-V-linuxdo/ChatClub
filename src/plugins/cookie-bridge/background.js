// CookieBridge (background; v2 05 §6.2): mirrors the Grok / Manus login cookies of the top-level site into
// the partition of ChatClub's iframes, so the chat stays signed in inside the workspace.
// Rules: source cookies are never modified; cookie values are never logged, stored or exported.

import { STATE_KEY, SITES, siteForHost, siteForCookie, cookieKey, normalizeState, pruneTombstones, mirrorDetails, samePartition } from "./model.js";

const cookies = () => chrome.cookies;
const expectedPartition = () => ({ topLevelSite: `chrome-extension://${chrome.runtime.id}`, hasCrossSiteAncestor: true });
let partition = null;

let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};
const read = async () => normalizeState((await chrome.storage.local.get(STATE_KEY))[STATE_KEY]);
const write = (state) => chrome.storage.local.set({ [STATE_KEY]: state });

/** The partition key of a bridged iframe in `tabId`, checked against the extension's own partition. */
async function partitionFor(tabId, site) {
  if (partition) return partition;
  const expected = expectedPartition();
  if (typeof tabId === "number" && cookies().getPartitionKey && chrome.webNavigation?.getAllFrames) {
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      const frame = frames?.find((f) => f.frameId !== 0 && siteForHost(new URL(f.url).hostname) === site);
      if (frame) {
        const { partitionKey } = await cookies().getPartitionKey({ tabId, frameId: frame.frameId });
        if (partitionKey?.topLevelSite !== expected.topLevelSite) throw new Error("unexpected partition");
        partition = { topLevelSite: partitionKey.topLevelSite, hasCrossSiteAncestor: !!partitionKey.hasCrossSiteAncestor };
        return partition;
      }
    } catch (error) {
      if (error?.message === "unexpected partition") throw error;
      // fall back to the computed key
    }
  }
  return expected;
}

const sameValue = (a, b) => a?.value === b?.value && (a?.expirationDate ?? null) === (b?.expirationDate ?? null);

/** Brings the mirrors of one site in line with its source cookies. Returns true when a mirror changed. */
async function syncSite(site, tabId, ctx) {
  let key;
  try {
    key = await partitionFor(tabId, site);
  } catch {
    ctx?.logger.warn(`Cookie bridge: unexpected partition for ${site.id}; not mirroring.`);
    return false;
  }
  return serial(async () => {
    let state = pruneTombstones(await read());
    let changed = false;
    for (const domain of site.domains) {
      for (const name of site.names) {
        const sources = await cookies().getAll({ domain, name });
        const mirrors = (await cookies().getAll({ domain, name, partitionKey: key })).filter((c) => samePartition(c.partitionKey, key));
        for (const source of sources.filter((c) => !c.partitionKey)) {
          const k = cookieKey(source);
          const existing = mirrors.find((m) => cookieKey(m) === k);
          delete state.tombstones[k];
          if (existing && sameValue(existing, source)) {
            // A valid mirror that is already there is adopted, not rewritten.
            if (!state.mirrors[k]) state.mirrors[k] = { site: site.id, adoptedAt: Date.now() };
            continue;
          }
          await cookies().set(mirrorDetails(source, key));
          state.mirrors[k] = { site: site.id, since: Date.now() };
          changed = true;
        }
        // Mirrors whose source is gone are removed and tombstoned.
        for (const mirror of mirrors) {
          const k = cookieKey(mirror);
          if (sources.some((c) => !c.partitionKey && cookieKey(c) === k)) continue;
          if (!state.mirrors[k] && !state.tombstones[k]) continue; // not ours to touch
          await cookies().remove({ url: `https://${mirror.domain.replace(/^\./, "")}${mirror.path}`, name: mirror.name, partitionKey: key });
          delete state.mirrors[k];
          state.tombstones[k] = Date.now();
          changed = true;
        }
      }
    }
    if (changed) state = { ...state, changedAt: { ...state.changedAt, [site.id]: Date.now() } };
    await write(state);
    return changed;
  });
}

export default {
  handlers: {
    /** Runs before the first `src` of a bridged iframe: the mirror is ready before the page loads. */
    cookiePreflight: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.url === "string",
      async handle(p, sender, ctx) {
        let host = "";
        try {
          host = new URL(p.url).hostname;
        } catch {
          return { bridged: false };
        }
        const site = siteForHost(host);
        if (!site || !cookies()) return { bridged: false };
        await syncSite(site, sender.tab?.id, ctx);
        return { bridged: true, site: site.id };
      },
    },
  },
  on: {
    cookieChanged(info, ctx) {
      const cookie = info?.cookie;
      const site = cookie && siteForCookie(cookie);
      if (!site) return;
      if (cookie.partitionKey) {
        // Something wrote into our partition: if its source was deleted (tombstoned), it is removed again.
        if (info.removed || !samePartition(cookie.partitionKey, partition ?? expectedPartition())) return;
        return serial(async () => {
          const state = pruneTombstones(await read());
          if (!state.tombstones[cookieKey(cookie)]) return;
          await cookies().remove({ url: `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`, name: cookie.name, partitionKey: cookie.partitionKey });
        });
      }
      if (info.removed && info.cause === "overwrite") return; // a set follows
      return syncSite(site, undefined, ctx);
    },
    startup: (ctx) => Promise.all(SITES.map((s) => syncSite(s, undefined, ctx))),
  },
};
