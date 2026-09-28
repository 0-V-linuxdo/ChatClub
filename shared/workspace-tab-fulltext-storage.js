// Storage layout for Record Full Text.
//
// The first layout kept every workspace under one `workspaceTabFullText`
// object, so each idle capture re-serialised up to 80 desks of conversation
// text to save one, every `storage.onChanged` listener received that whole
// blob, and two ChatClub tabs persisting different desks clobbered each
// other's read-modify-write. The current layout stores one record per
// workspace under `workspaceTabFullText.<workspaceId>` plus a small
// `workspaceTabFullTextIndex` ({ workspaceId: updatedAt }) that lists them: a
// persist reads and writes one record plus the index, and a whole-store read
// is `get([index keys])` then `get([...record keys])` instead of `get(null)`.
//
// The legacy aggregate is folded in wherever it is still found and removed by
// the next page write; the background forget path keeps honouring it so a
// remembered desk deleted before that migration still drops its text.
//
// Everything here is pure: callers hand in the storage snapshot they read and
// apply the returned `{ set, remove }` plan.
import { normalizeWorkspaceSessionId } from "./workspace-session.js";
import {
  WORKSPACE_TAB_FULLTEXT_MAX_WORKSPACES,
  normalizeWorkspaceTabFullTextStore,
  pruneWorkspaceTabFullTextStore
} from "./workspace-tab-fulltext.js";

export const WORKSPACE_TAB_FULLTEXT_LEGACY_KEY = "workspaceTabFullText";
const WORKSPACE_TAB_FULLTEXT_RECORD_PREFIX = "workspaceTabFullText.";
export const WORKSPACE_TAB_FULLTEXT_INDEX_KEY = "workspaceTabFullTextIndex";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return plainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

export function workspaceTabFullTextRecordKey(workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  return id ? `${WORKSPACE_TAB_FULLTEXT_RECORD_PREFIX}${id}` : "";
}

export function workspaceIdFromFullTextRecordKey(key) {
  const text = String(key || "");
  if (!text.startsWith(WORKSPACE_TAB_FULLTEXT_RECORD_PREFIX)) return "";
  return normalizeWorkspaceSessionId(text.slice(WORKSPACE_TAB_FULLTEXT_RECORD_PREFIX.length));
}

function normalizeWorkspaceTabFullTextIndex(raw) {
  const index = {};
  if (!plainObject(raw)) return index;
  for (const [key, value] of Object.entries(raw)) {
    const id = normalizeWorkspaceSessionId(key);
    if (id) index[id] = String(value || "");
  }
  return index;
}

function legacyStore(snapshot) {
  return normalizeWorkspaceTabFullTextStore(plainObject(snapshot) ? snapshot[WORKSPACE_TAB_FULLTEXT_LEGACY_KEY] : null);
}

function workspaceTabFullTextSnapshotHasLegacy(snapshot = {}) {
  const legacy = plainObject(snapshot) ? snapshot[WORKSPACE_TAB_FULLTEXT_LEGACY_KEY] : null;
  return plainObject(legacy) && Object.keys(legacy).length > 0;
}

// Keys a page reads first to see the whole store: the index names the record
// keys; the legacy aggregate is consulted until a write has migrated it.
export function workspaceTabFullTextIndexKeys() {
  return [WORKSPACE_TAB_FULLTEXT_INDEX_KEY, WORKSPACE_TAB_FULLTEXT_LEGACY_KEY];
}

export function workspaceTabFullTextRecordKeysFromIndex(index) {
  return Object.keys(normalizeWorkspaceTabFullTextIndex(index)).map((id) => workspaceTabFullTextRecordKey(id));
}

// Keys a page reads to answer for one desk.
export function workspaceTabFullTextRecordReadKeys(workspaceId) {
  const key = workspaceTabFullTextRecordKey(workspaceId);
  return key ? [key, WORKSPACE_TAB_FULLTEXT_INDEX_KEY, WORKSPACE_TAB_FULLTEXT_LEGACY_KEY] : workspaceTabFullTextIndexKeys();
}

// Assemble the normalized store from whatever subset of storage the caller
// read. A per-record entry wins over the legacy aggregate for the same id
// unless the legacy copy is newer (written by a pre-migration page).
export function workspaceTabFullTextStoreFromSnapshot(snapshot = {}) {
  const source = plainObject(snapshot) ? snapshot : {};
  const merged = {};
  for (const [key, value] of Object.entries(source)) {
    const id = workspaceIdFromFullTextRecordKey(key);
    if (!id || !plainObject(value)) continue;
    const normalized = normalizeWorkspaceTabFullTextStore({ [id]: { ...value, workspaceId: id } });
    if (normalized[id]) merged[id] = normalized[id];
  }
  for (const [id, record] of Object.entries(legacyStore(source))) {
    const current = merged[id];
    if (!current || String(record.updatedAt).localeCompare(String(current.updatedAt)) > 0) merged[id] = record;
  }
  return pruneWorkspaceTabFullTextStore(merged);
}

export function workspaceTabFullTextRecordFromSnapshot(snapshot = {}, workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  if (!id) return null;
  return workspaceTabFullTextStoreFromSnapshot(snapshot)[id] || null;
}

function sortedIdsNewestFirst(index) {
  return Object.keys(index).sort((left, right) => String(index[right]).localeCompare(String(index[left])));
}

// Plan the write of one desk. The caller read `workspaceTabFullTextRecordReadKeys(id)`;
// the plan writes that record and the index, migrates any legacy aggregate
// it found onto per-record keys, and prunes the oldest desks beyond the cap.
export function planWorkspaceTabFullTextRecordWrite(snapshot = {}, record, options = {}) {
  const max = Math.max(1, Number(options.maxWorkspaces) || WORKSPACE_TAB_FULLTEXT_MAX_WORKSPACES);
  const source = plainObject(snapshot) ? snapshot : {};
  const next = normalizeWorkspaceTabFullTextStore({ [String(record?.workspaceId || "")]: record });
  const id = Object.keys(next)[0] || "";
  if (!id) return null;
  const normalizedRecord = next[id];
  const set = {};
  const remove = [];
  const index = normalizeWorkspaceTabFullTextIndex(source[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]);
  const migratingLegacy = workspaceTabFullTextSnapshotHasLegacy(source);
  if (migratingLegacy) {
    // Every legacy desk that has no per-record copy yet lands under its own
    // key before the aggregate goes, even when this write changed one desk.
    for (const [legacyId, legacyRecord] of Object.entries(legacyStore(source))) {
      if (legacyId === id || hasOwn(index, legacyId)) continue;
      set[workspaceTabFullTextRecordKey(legacyId)] = legacyRecord;
      index[legacyId] = legacyRecord.updatedAt;
    }
    remove.push(WORKSPACE_TAB_FULLTEXT_LEGACY_KEY);
  }
  index[id] = normalizedRecord.updatedAt;
  set[workspaceTabFullTextRecordKey(id)] = normalizedRecord;
  const keep = sortedIdsNewestFirst(index);
  for (const staleId of keep.slice(max)) {
    if (staleId === id) continue;
    delete index[staleId];
    delete set[workspaceTabFullTextRecordKey(staleId)];
    remove.push(workspaceTabFullTextRecordKey(staleId));
  }
  set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY] = index;
  return { set, remove, workspaceId: id, migratedLegacy: migratingLegacy };
}

// Quota fallback: drop the oldest desk other than the one being written from
// a record-write plan. Returns null when nothing else is left to evict.
export function evictOldestFromWorkspaceTabFullTextPlan(plan, keepWorkspaceId) {
  if (!plan || !plainObject(plan.set)) return null;
  const index = normalizeWorkspaceTabFullTextIndex(plan.set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]);
  const keep = normalizeWorkspaceSessionId(keepWorkspaceId);
  const oldest = sortedIdsNewestFirst(index).reverse().find((id) => id !== keep);
  if (!oldest) return null;
  const set = { ...plan.set };
  const remove = [...(Array.isArray(plan.remove) ? plan.remove : [])];
  const nextIndex = { ...index };
  delete nextIndex[oldest];
  delete set[workspaceTabFullTextRecordKey(oldest)];
  remove.push(workspaceTabFullTextRecordKey(oldest));
  set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY] = nextIndex;
  return { ...plan, set, remove, evicted: oldest };
}

// Forget one desk: drop its record key, its index entry, and its legacy
// aggregate entry. The background applies this with a get(null) snapshot; the
// page with `workspaceTabFullTextRecordReadKeys(id)`.
export function planWorkspaceTabFullTextForget(snapshot = {}, workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  const source = plainObject(snapshot) ? snapshot : {};
  const set = {};
  const remove = [];
  if (!id) return { set, remove, changed: false };
  const recordKey = workspaceTabFullTextRecordKey(id);
  if (hasOwn(source, recordKey)) remove.push(recordKey);
  const index = normalizeWorkspaceTabFullTextIndex(source[WORKSPACE_TAB_FULLTEXT_INDEX_KEY]);
  if (hasOwn(index, id)) {
    const nextIndex = { ...index };
    delete nextIndex[id];
    set[WORKSPACE_TAB_FULLTEXT_INDEX_KEY] = nextIndex;
  }
  const legacy = source[WORKSPACE_TAB_FULLTEXT_LEGACY_KEY];
  if (hasOwn(legacy, id)) {
    const nextLegacy = { ...legacy };
    delete nextLegacy[id];
    set[WORKSPACE_TAB_FULLTEXT_LEGACY_KEY] = nextLegacy;
  }
  return { set, remove, changed: remove.length > 0 || Object.keys(set).length > 0 };
}
