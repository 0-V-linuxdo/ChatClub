import { groupByDate, timestamp } from "../../shared/date-groups.js";
import { STORAGE_KEYS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  framesFromSummaryPreviewItems,
  findFullTextQueryRanges,
  fullTextMessagesHavePair,
  matchesFullTextQuery,
  mergeWorkspaceTabFullTextFrames,
  normalizeWorkspaceTabFullTextStore,
  pruneWorkspaceTabFullTextStore,
  removeWorkspaceTabFullText,
  searchWorkspaceTabFullTextHits,
  upsertWorkspaceTabFullText,
  workspaceTabFullTextFramesEqual
} from "../../shared/workspace-tab-fulltext.js";
import { isStorageQuotaError } from "../../shared/storage-schema.js";
import { storageGet, storageSet } from "../../shared/storage-adapter.js";
import { el } from "../../ui/dom.js";

const SEARCH_TIME_FORMAT = Object.freeze({ month: "short", day: "numeric" });
const SEARCH_SNIPPET_MAX = 96;

export async function loadRecordFullTextEnabled() {
  const options = await storageGet(STORAGE_KEYS.options);
  return options?.recordFullText === true;
}

export async function loadWorkspaceTabFullTextStore() {
  return normalizeWorkspaceTabFullTextStore(await storageGet(STORAGE_KEYS.workspaceTabFullText));
}

async function saveWorkspaceTabFullTextStore(store) {
  let normalized = pruneWorkspaceTabFullTextStore(store);
  while (true) {
    try {
      await storageSet(STORAGE_KEYS.workspaceTabFullText, normalized);
      return normalized;
    } catch (error) {
      const ids = Object.keys(normalized);
      if (!isStorageQuotaError(error) || ids.length <= 1) throw error;
      const oldest = ids.sort((left, right) => (
        String(normalized[left]?.updatedAt || "").localeCompare(String(normalized[right]?.updatedAt || ""))
      ))[0];
      delete normalized[oldest];
      normalized = pruneWorkspaceTabFullTextStore(normalized);
    }
  }
}

export async function persistWorkspaceTabFullTextFromPreview({ workspaceId, topicTitle, items } = {}) {
  const incoming = framesFromSummaryPreviewItems(items)
    .filter((frame) => fullTextMessagesHavePair(frame.messages));
  const id = String(workspaceId || "").trim();
  if (!id || !incoming.length) return { saved: false };
  const store = await loadWorkspaceTabFullTextStore();
  const current = store[id];
  const frames = mergeWorkspaceTabFullTextFrames(current?.frames, incoming);
  const nextTitle = String(topicTitle || current?.topicTitle || "").trim();
  if (
    current
    && nextTitle === String(current.topicTitle || "").trim()
    && workspaceTabFullTextFramesEqual(current.frames, frames)
  ) {
    return { saved: true, unchanged: true, workspaceId: id };
  }
  const next = upsertWorkspaceTabFullText(store, {
    workspaceId: id,
    topicTitle: nextTitle,
    frames,
    updatedAt: new Date().toISOString()
  });
  await saveWorkspaceTabFullTextStore(next);
  return { saved: true, workspaceId: id };
}

export async function forgetWorkspaceTabFullText(workspaceId) {
  const store = await loadWorkspaceTabFullTextStore();
  const next = removeWorkspaceTabFullText(store, workspaceId);
  if (next === store || Object.keys(next).length === Object.keys(store).length) return store;
  return saveWorkspaceTabFullTextStore(next);
}

function tabTitleSearchValues(item = {}, label = "") {
  return [
    label,
    item.topicTitle,
    item.layoutName,
    item.title
  ];
}

function tabAppSearchValues(item = {}, stored = {}) {
  return [
    ...(Array.isArray(item.appIds) ? item.appIds : []),
    ...((Array.isArray(stored?.frames) ? stored.frames : []).map((frame) => frame.appName))
  ];
}

function itemMatchesTitleQuery(item, query, label) {
  return matchesFullTextQuery(query, tabTitleSearchValues(item, label));
}

function itemMatchesAppQuery(item, query, stored) {
  return matchesFullTextQuery(query, tabAppSearchValues(item, stored));
}

function workspaceFullTextHitsById(store, query) {
  const grouped = new Map();
  for (const hit of searchWorkspaceTabFullTextHits(store, query)) {
    const id = workspaceIdOf(hit);
    if (!id) continue;
    const list = grouped.get(id);
    if (list) list.push(hit);
    else grouped.set(id, [hit]);
  }
  return grouped;
}

function flattenSearchSnippetText(text) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  value = value.replace(/\[([^\]\n]{1,200})\]\([^)\n]{0,400}\)/g, "$1");
  value = value.replace(/`([^`\n]{1,200})`/g, "$1");
  value = value.replace(/\*\*\*([^*]{1,400})\*\*\*/g, "$1");
  value = value.replace(/\*\*([^*]{1,400})\*\*/g, "$1");
  value = value.replace(/__([^_\n]{1,400})__/g, "$1");
  value = value.replace(/^#{1,6}\s+/g, "");
  return value.replace(/\s+/g, " ").trim();
}

function clipSearchSnippet(text, query, max = SEARCH_SNIPPET_MAX) {
  const value = flattenSearchSnippetText(text);
  if (!value) return "";
  const limit = Number.isInteger(max) && max > 0 ? max : SEARCH_SNIPPET_MAX;
  const match = findFullTextQueryRanges(value, query)[0];
  let start = 0;
  let end = Math.min(value.length, limit);
  if (match) {
    const width = match.end - match.start;
    if (width >= limit) {
      start = match.start;
      end = Math.min(value.length, match.start + limit);
    } else {
      const before = Math.min(match.start, Math.ceil((limit - width) / 2));
      start = match.start - before;
      end = Math.min(value.length, start + limit);
      if (end - start < limit) start = Math.max(0, end - limit);
    }
  }
  let snippet = value.slice(start, end);
  if (start > 0) snippet = `…${snippet.replace(/^\s+/, "")}`;
  if (end < value.length) snippet = `${snippet.replace(/\s+$/, "")}…`;
  return snippet;
}

function bodySnippetFromHits(hits, query) {
  for (const hit of Array.isArray(hits) ? hits : []) {
    if (matchesFullTextQuery(query, [hit?.userMessage])) {
      const snippet = clipSearchSnippet(hit.userMessage, query);
      if (snippet) return snippet;
    }
    if (matchesFullTextQuery(query, [hit?.assistantMessage])) {
      const snippet = clipSearchSnippet(hit.assistantMessage, query);
      if (snippet) return snippet;
    }
  }
  return "";
}

function matchFieldsForRecord({ item, stored, title, needle, fullTextEnabled, hits }) {
  if (!needle) return {};
  if (itemMatchesTitleQuery(item, needle, title) || matchesFullTextQuery(needle, [title])) {
    return { matchKind: "title" };
  }
  if (fullTextEnabled) {
    const snippet = bodySnippetFromHits(hits, needle);
    if (snippet) return { matchKind: "body", snippet };
  }
  if (itemMatchesAppQuery(item, needle, stored)) return { matchKind: "app" };
  if (fullTextEnabled && (Array.isArray(hits) ? hits : []).length) return { matchKind: "title" };
  return {};
}

export function highlightQuery(text, query) {
  const value = String(text || "");
  const ranges = findFullTextQueryRanges(value, query);
  if (!ranges.length) return [value];
  const nodes = [];
  let from = 0;
  for (const range of ranges) {
    if (range.start > from) nodes.push(value.slice(from, range.start));
    nodes.push(el("mark", { class: "workspace-tabs-search-mark" }, value.slice(range.start, range.end)));
    from = range.end;
  }
  if (from < value.length) nodes.push(value.slice(from));
  return nodes.length ? nodes : [value];
}

function workspaceIdOf(value) {
  return String(value?.workspaceId || "").trim();
}

function workspaceSearchRecordTime(record = {}) {
  return timestamp(record.viewedAt)
    ?? timestamp(record.updatedAt)
    ?? timestamp(record.createdAt)
    ?? timestamp(record.detachedAt);
}

export function formatWorkspaceSearchTime(value) {
  const ms = value != null && typeof value === "object" && !(value instanceof Date)
    ? workspaceSearchRecordTime(value)
    : timestamp(value);
  if (ms == null) return "";
  try {
    return new Date(ms).toLocaleString(undefined, SEARCH_TIME_FORMAT);
  } catch {
    return "";
  }
}

export function workspaceSearchCopy({ fullTextEnabled = false, voice = "viewer" } = {}) {
  const composer = voice === "composer";
  return {
    placeholder: t(composer
      ? (fullTextEnabled ? "composer.search.placeholderFullText" : "composer.search.placeholder")
      : (fullTextEnabled ? "workspace.tabs.searchPlaceholderFullText" : "workspace.tabs.searchPlaceholder")),
    empty: t(composer ? "composer.search.empty" : "workspace.tabs.searchEmpty"),
    results: t(composer ? "composer.search.results" : "workspace.tabs.searchSidebar")
  };
}

export function collectWorkspaceSearchRecords({
  items = [],
  store = {},
  query = "",
  fullTextEnabled = false,
  labelOf
} = {}) {
  const needle = String(query || "").trim();
  const hitsById = needle && fullTextEnabled ? workspaceFullTextHitsById(store, needle) : new Map();
  const fullTextIds = new Set(hitsById.keys());
  const records = [];
  const seen = new Set();
  const titleOf = (item, index) => {
    if (typeof labelOf === "function") {
      try { return String(labelOf(item, index) || "").trim(); } catch { /* use stored titles */ }
    }
    return String(item?.topicTitle || item?.title || "").trim();
  };
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const id = workspaceIdOf(item);
    if (!id || seen.has(id)) return;
    const title = titleOf(item, index);
    const stored = store?.[id];
    const titleMatch = !needle || itemMatchesTitleQuery(item, needle, title)
      || matchesFullTextQuery(needle, Array.isArray(item.appIds) ? item.appIds : []);
    if (needle && !titleMatch && !fullTextIds.has(id)) return;
    seen.add(id);
    const hits = hitsById.get(id) || [];
    records.push({
      workspaceId: id,
      title: title || String(stored?.topicTitle || "").trim(),
      live: item.live === true,
      current: item.current === true,
      tabId: item.tabId ?? null,
      appIds: Array.isArray(item.appIds) ? item.appIds.filter(Boolean) : [],
      viewedAt: item.viewedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || stored?.updatedAt,
      detachedAt: item.detachedAt,
      fromTab: true,
      ...matchFieldsForRecord({
        item,
        stored,
        title: title || String(stored?.topicTitle || "").trim(),
        needle,
        fullTextEnabled,
        hits
      })
    });
  });
  if (fullTextEnabled) {
    for (const stored of Object.values(normalizeWorkspaceTabFullTextStore(store))) {
      const id = workspaceIdOf(stored);
      if (!id || seen.has(id)) continue;
      const title = String(stored.topicTitle || "").trim();
      const hits = hitsById.get(id) || [];
      const titleMatch = !needle || matchesFullTextQuery(needle, [title]);
      if (needle && !titleMatch && !fullTextIds.has(id)) continue;
      seen.add(id);
      records.push({
        workspaceId: id,
        title,
        live: false,
        current: false,
        tabId: null,
        appIds: (stored.frames || []).map((frame) => frame.appId).filter(Boolean),
        updatedAt: stored.updatedAt,
        fromTab: false,
        ...matchFieldsForRecord({
          item: stored,
          stored,
          title,
          needle,
          fullTextEnabled,
          hits
        })
      });
    }
  }
  return records.sort((left, right) => (workspaceSearchRecordTime(right) || 0) - (workspaceSearchRecordTime(left) || 0));
}

export function groupWorkspaceSearchRecords(records = [], now = Date.now()) {
  return groupByDate(records, workspaceSearchRecordTime, now, "workspace.tabs");
}
