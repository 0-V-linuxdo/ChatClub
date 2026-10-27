// FullTextRecorder (background): per-workspace full-text records, index and legacy migration (v2 04 §5.3).

import { LIMITS, mergeRecord, frameIdentity } from "./model.js";
import { normalizeForCompare } from "../../lib/conversation.js";

const PREFIX = "workspaceTabFullText.";
const INDEX_KEY = "workspaceTabFullTextIndex";
const LEGACY_KEY = "workspaceTabFullText";
const WORKSPACE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

const local = () => chrome.storage.local;
let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

const validRecord = (r) => r && typeof r === "object" && Array.isArray(r.frames) && r.frames.length > 0;

async function readLegacy() {
  const raw = (await local().get(LEGACY_KEY))[LEGACY_KEY];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

async function readIndex() {
  const raw = (await local().get(INDEX_KEY))[INDEX_KEY];
  return raw && typeof raw === "object" ? { ...raw } : {};
}

const newer = (a, b) => (!a ? b : !b ? a : Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a);

/** Merged view of per-workspace keys and the legacy aggregate key. */
async function readRecord(workspaceId) {
  const key = PREFIX + workspaceId;
  const own = (await local().get(key))[key];
  const legacy = (await readLegacy())?.[workspaceId];
  const r = newer(validRecord(own) ? own : null, validRecord(legacy) ? { ...legacy, workspaceId } : null);
  return r ?? null;
}

async function readAll(ids) {
  const index = await readIndex();
  const legacy = (await readLegacy()) ?? {};
  const wanted = ids?.length ? ids : [...new Set([...Object.keys(index), ...Object.keys(legacy)])];
  const keys = wanted.map((id) => PREFIX + id);
  const got = keys.length ? await local().get(keys) : {};
  const out = new Map();
  for (const id of wanted) {
    const own = got[PREFIX + id];
    const old = legacy[id];
    const r = newer(validRecord(own) ? own : null, validRecord(old) ? { ...old, workspaceId: id } : null);
    if (r) out.set(id, r);
  }
  return out;
}

/** First write: move every legacy workspace without its own copy to its own key, then drop the aggregate. */
async function migrate() {
  const legacy = await readLegacy();
  if (!legacy) return;
  const index = await readIndex();
  const ids = Object.keys(legacy);
  const own = ids.length ? await local().get(ids.map((id) => PREFIX + id)) : {};
  const writes = {};
  for (const id of ids) {
    const r = legacy[id];
    if (!validRecord(r)) continue;
    const mine = own[PREFIX + id];
    const winner = newer(validRecord(mine) ? mine : null, { ...r, workspaceId: id });
    if (winner !== mine) writes[PREFIX + id] = winner;
    index[id] = winner.updatedAt;
  }
  writes[INDEX_KEY] = index;
  await local().set(writes);
  await local().remove(LEGACY_KEY);
}

/** Writes one workspace and trims the store to the newest 80, dropping the oldest others on quota errors. */
async function writeRecord(record) {
  await migrate();
  const index = await readIndex();
  index[record.workspaceId] = record.updatedAt;
  let ranked = Object.entries(index).sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
  const keep = ranked.slice(0, LIMITS.workspaces).map(([id]) => id);
  if (!keep.includes(record.workspaceId)) keep[keep.length - 1] = record.workspaceId;
  const dropped = Object.keys(index).filter((id) => !keep.includes(id));
  for (;;) {
    const nextIndex = Object.fromEntries(keep.map((id) => [id, index[id]]));
    try {
      await local().set({ [PREFIX + record.workspaceId]: record, [INDEX_KEY]: nextIndex });
      if (dropped.length) await local().remove(dropped.map((id) => PREFIX + id));
      return;
    } catch (error) {
      if (!/quota/i.test(String(error?.message || error))) throw error;
      const others = keep.filter((id) => id !== record.workspaceId);
      if (!others.length) throw error;
      const oldest = others.sort((a, b) => Date.parse(index[a]) - Date.parse(index[b]))[0];
      keep.splice(keep.indexOf(oldest), 1);
      dropped.push(oldest);
    }
  }
}

async function persist({ workspaceId, topicTitle, frames }) {
  return serial(async () => {
    const old = await readRecord(workspaceId);
    const { record, changed } = mergeRecord(old, { workspaceId, topicTitle, frames });
    if (!record.frames.length) return { ok: true, changed: false, stored: false };
    const same = old && JSON.stringify(old) === JSON.stringify(record);
    if (!same) await writeRecord(record);
    return { ok: true, changed, stored: true, updatedAt: record.updatedAt };
  });
}

/** Mark-only writes: [{ frameId, mark }] onto existing frames; never touches updatedAt. */
async function writeMarks({ workspaceId, marks }) {
  return serial(async () => {
    const old = await readRecord(workspaceId);
    if (!old) return { ok: true, changed: false };
    let touched = false;
    const frames = old.frames.map((f) => {
      const m = marks.find((x) => x.frameId === frameIdentity(f));
      if (!m) return f;
      touched = true;
      return { ...f, capture: m.mark };
    });
    if (touched) await writeRecord({ ...old, frames });
    return { ok: true, changed: false };
  });
}

function snippet(text, query) {
  const flat = String(text).replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return flat.slice(0, 120);
  const start = Math.max(0, i - 40);
  return (start ? "…" : "") + flat.slice(start, i + query.length + 80) + (i + query.length + 80 < flat.length ? "…" : "");
}

export default {
  handlers: {
    persist: {
      sender: "extensionPage",
      validate: (p) => p && WORKSPACE_ID_RE.test(String(p.workspaceId ?? "")) && Array.isArray(p.frames),
      handle: (p) => persist(p),
    },
    writeMarks: {
      sender: "extensionPage",
      validate: (p) => p && WORKSPACE_ID_RE.test(String(p.workspaceId ?? "")) && Array.isArray(p.marks),
      handle: (p) => writeMarks(p),
    },
    read: {
      sender: "extensionPage",
      validate: (p) => p && WORKSPACE_ID_RE.test(String(p.workspaceId ?? "")),
      handle: async (p) => ({ record: await readRecord(p.workspaceId) }),
    },
    search: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.query === "string",
      async handle({ query, workspaceIds }) {
        const q = query.trim();
        if (!q) return { hits: [] };
        const nq = normalizeForCompare(q).toLowerCase();
        const all = await readAll(Array.isArray(workspaceIds) ? workspaceIds.map(String) : null);
        const hits = [];
        for (const [workspaceId, r] of all) {
          for (const f of r.frames) {
            const m = f.messages.find((x) => normalizeForCompare(x.text).toLowerCase().includes(nq));
            if (m) {
              hits.push({ workspaceId, text: snippet(m.text, q), appId: f.appId, updatedAt: r.updatedAt });
              break;
            }
          }
        }
        return { hits };
      },
    },
    remove: {
      sender: "extensionPage",
      validate: (p) => p && WORKSPACE_ID_RE.test(String(p.workspaceId ?? "")),
      handle: (p) =>
        serial(async () => {
          const index = await readIndex();
          delete index[p.workspaceId];
          await local().set({ [INDEX_KEY]: index });
          await local().remove(PREFIX + p.workspaceId);
          const legacy = await readLegacy();
          if (legacy && legacy[p.workspaceId]) {
            delete legacy[p.workspaceId];
            await local().set({ [LEGACY_KEY]: legacy });
          }
          return { ok: true };
        }),
    },
    exportAll: {
      sender: "extensionPage",
      handle: async () => ({ records: [...(await readAll(null)).values()] }),
    },
  },
};
