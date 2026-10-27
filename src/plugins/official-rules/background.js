// OfficialRules (background): the single writer of the official rules state. Checks the signed channel,
// stages a candidate release, applies / rolls back atomically, and keeps the anti-rollback watermark (v2 06 §9).

import * as releaseConfig from "./config.js";
import {
  STATE_KEY, BLOB_PREFIX, LIMITS, componentKey, normalizeState, defaultState, nextCheckAt,
  validateChannel, validateCatalog, validateComponent, verifySignature, sha256Hex, checkWatermark, compareVersions,
  componentDiff, applyCandidate, rollbackLast,
} from "./model.js";

const ALARM = "OfficialRules.check";
// The release channel; tests point it at a local fixture.
let CHANNEL_URL = releaseConfig.CHANNEL_URL;
let KEYS = releaseConfig.KEYS;
export function configureForTest(config) {
  CHANNEL_URL = config.CHANNEL_URL;
  KEYS = config.KEYS;
}
const local = () => chrome.storage.local;
let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};
const read = async () => normalizeState((await local().get(STATE_KEY))[STATE_KEY]);
const write = (state) => local().set({ [STATE_KEY]: state });
const update = (fn) => serial(async () => {
  const next = await fn(await read());
  if (next) await write(next);
  return next;
});

class RulesError extends Error {}

/** Only the fixed channel (and its signature), or addresses under the channel's own directory, may be fetched. */
const allowedUrl = (url) => {
  if (!CHANNEL_URL) return false;
  try {
    const u = new URL(url);
    const base = new URL(".", CHANNEL_URL);
    return u.protocol === "https:" && u.origin === base.origin && u.pathname.startsWith(base.pathname);
  } catch {
    return false;
  }
};
const resolveUrl = (ref) => new URL(ref, CHANNEL_URL).href;

async function fetchBytes(url, maxBytes, expected = null) {
  if (!allowedUrl(url)) throw new RulesError(`blockedUrl:${url}`);
  const res = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
  if (!allowedUrl(res.url || url)) throw new RulesError(`blockedRedirect:${res.url}`);
  if (!res.ok) throw new RulesError(`http${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > maxBytes) throw new RulesError("tooLarge");
  if (expected) {
    if (bytes.length !== expected.size) throw new RulesError("sizeMismatch");
    if ((await sha256Hex(bytes)) !== expected.sha256) throw new RulesError("hashMismatch");
  }
  return bytes;
}
const parse = (bytes) => {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RulesError("badJson");
  }
};
async function fetchSigned(kind, url, sigUrl, maxBytes, expected) {
  const bytes = await fetchBytes(url, maxBytes, expected);
  const sig = parse(await fetchBytes(sigUrl, LIMITS.signature));
  const verdict = await verifySignature(KEYS, kind, bytes, sig);
  if (!verdict.ok) throw new RulesError(verdict.reason);
  if (expected?.keyId && expected.keyId !== verdict.keyId) throw new RulesError("keyMismatch");
  return { bytes, doc: parse(bytes), keyId: verdict.keyId };
}

const extensionVersion = () => chrome.runtime.getManifest?.().version ?? "0";

/** Downloads and verifies the current release; stores a candidate when it brings changes. */
async function check() {
  if (!CHANNEL_URL || !KEYS.current) {
    await update((s) => ({ ...s, status: "error", lastError: "notConfigured", lastCheckAt: Date.now() }));
    return read();
  }
  await update((s) => ({ ...s, status: "checking" }));
  try {
    const channel = await fetchSigned("channel", CHANNEL_URL, `${CHANNEL_URL.replace(/\.json$/, "")}.sig.json`, LIMITS.channel);
    const bad = validateChannel(channel.doc);
    if (bad) throw new RulesError(`channel:${bad}`);
    const ch = channel.doc;
    const state = await read();
    const wmIssue = checkWatermark(state.watermark, ch.sequence);
    if (wmIssue) throw new RulesError(wmIssue);
    if (compareVersions(ch.minExtensionVersion, extensionVersion()) > 0) {
      await update((s) => ({ ...s, status: "needsExtensionUpdate", lastCheckAt: Date.now(), lastError: "", failures: 0 }));
      return read();
    }
    if (state.current && ch.sequence === state.current.sequence) {
      await update((s) => ({ ...s, status: s.candidate ? "updateAvailable" : "upToDate", lastCheckAt: Date.now(), lastError: "", failures: 0 }));
      return read();
    }
    const catPtr = { ...ch.catalog, url: resolveUrl(ch.catalog.url), signatureUrl: resolveUrl(ch.catalog.signatureUrl) };
    const catalog = await fetchSigned("catalog", catPtr.url, catPtr.signatureUrl, LIMITS.catalog, catPtr);
    const badCat = validateCatalog(catalog.doc, ch);
    if (badCat) throw new RulesError(`catalog:${badCat}`);
    const pointers = catalog.doc.components;
    const wmComp = checkWatermark(state.watermark, ch.sequence, pointers);
    if (wmComp) throw new RulesError(wmComp);
    const currentComponents = state.current?.components ?? {};
    const components = {};
    const diffs = {};
    for (const p of pointers) {
      const key = componentKey(p.feature, p.siteId);
      const have = currentComponents[key];
      if (have && have.revision === p.revision && have.sha256 === p.sha256) continue;
      const comp = await fetchSigned("component", resolveUrl(p.url), resolveUrl(p.signatureUrl), LIMITS.component, p);
      const badComp = validateComponent(comp.doc, p);
      if (badComp) throw new RulesError(`component:${key}:${badComp}`);
      await local().set({ [BLOB_PREFIX + p.sha256]: new TextDecoder().decode(comp.bytes) });
      components[key] = { ...comp.doc, sha256: p.sha256 };
      diffs[key] = componentDiff(have, comp.doc);
    }
    const listed = new Set(pointers.map((p) => componentKey(p.feature, p.siteId)));
    const removed = Object.keys(currentComponents).filter((k) => !listed.has(k));
    const changed = Object.keys(components).length || removed.length;
    await update((s) => ({
      ...s,
      status: changed ? "updateAvailable" : "upToDate",
      lastCheckAt: Date.now(),
      lastError: "",
      failures: 0,
      candidate: changed
        ? { sequence: ch.sequence, rulesVersion: ch.rulesVersion, publishedAt: ch.publishedAt ?? null, keyId: catalog.keyId, releaseNotes: catalog.doc.releaseNotes ?? "", components, removed, diffs }
        : null,
    }));
  } catch (error) {
    const reason = error instanceof RulesError ? error.message : String(error?.message || error);
    await update((s) => ({ ...s, status: "error", lastError: reason, lastCheckAt: Date.now(), failures: (s.failures ?? 0) + 1 }));
  }
  await schedule();
  return read();
}

async function schedule() {
  const state = await read();
  const at = nextCheckAt(state);
  try {
    if (!at) await chrome.alarms.clear(ALARM);
    else await chrome.alarms.create(ALARM, { when: Math.max(Date.now() + 60_000, at) });
  } catch {
    // alarms unavailable
  }
}

const publicState = (s) => ({ ...s, configured: !!(CHANNEL_URL && KEYS.current), channelUrl: CHANNEL_URL, keys: { current: KEYS.current ?? null, recovery: KEYS.recovery ?? null }, nextCheckAt: nextCheckAt(s) });

const keyOk = (k) => typeof k === "string" && /^(summary|messageNavigator|delete)\/[a-zA-Z][a-zA-Z0-9]*$/.test(k);

export default {
  alarms: [ALARM],
  async onAlarm() {
    const state = await read();
    if (state.mode === "auto") await check();
  },
  handlers: {
    getOfficialRulesStatus: {
      sender: "extensionPage",
      validate: () => true,
      handle: async () => publicState(await read()),
    },
    setOfficialRulesMode: {
      sender: "extensionPage",
      validate: (p) => p && ["auto", "manual"].includes(p.mode),
      handle: async (p) => {
        const next = await update((s) => ({ ...s, mode: p.mode }));
        await schedule();
        if (p.mode === "auto" && !next.lastCheckAt) check();
        return publicState(next);
      },
    },
    checkOfficialRulesUpdate: {
      sender: "extensionPage",
      validate: () => true,
      handle: async () => publicState(await check()),
    },
    applyOfficialRulesUpdate: {
      sender: "extensionPage",
      validate: () => true,
      handle: async () => publicState(await update((s) => (s.candidate ? applyCandidate({ ...s, status: "applying" }) : s))),
    },
    rollbackLastRulesUpdate: {
      sender: "extensionPage",
      validate: () => true,
      handle: async () => publicState(await update((s) => rollbackLast(s))),
    },
    rollbackOfficialComponent: {
      sender: "extensionPage",
      validate: (p) => p && keyOk(p.key),
      handle: async (p) => publicState(await update((s) => ({ ...s, rolledBack: { ...s.rolledBack, [p.key]: true } }))),
    },
    restoreOfficialComponent: {
      sender: "extensionPage",
      validate: (p) => p && keyOk(p.key),
      handle: async (p) => publicState(await update((s) => {
        const rolledBack = { ...s.rolledBack };
        delete rolledBack[p.key];
        return { ...s, rolledBack };
      })),
    },
    setOfficialDeleteAliasApproval: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.host === "string" && /^[a-z0-9.-]+$/i.test(p.host) && typeof p.approved === "boolean",
      handle: async (p) => publicState(await update((s) => {
        const deleteAliases = { ...s.deleteAliases };
        if (p.approved) deleteAliases[p.host.toLowerCase()] = "approved";
        else delete deleteAliases[p.host.toLowerCase()];
        return { ...s, deleteAliases };
      })),
    },
    /** Full reset (06 §11.4): back to built-in rules, but the watermark survives. */
    resetOfficialRules: {
      sender: "extensionPage",
      validate: () => true,
      handle: async () => {
        const next = await update((s) => ({ ...defaultState(), watermark: s.watermark, jitterMs: s.jitterMs }));
        await schedule();
        return publicState(next);
      },
    },
  },
  on: {
    startup: () => schedule(),
    installed: () => schedule(),
  },
};
