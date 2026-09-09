import { groupByDate, timestamp } from "../../shared/date-groups.js";
import { STORAGE_KEYS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  framesFromSummaryPreviewItems,
  fullTextMessagesHavePair,
  matchesFullTextQuery,
  mergeWorkspaceTabFullTextFrames,
  normalizeWorkspaceTabFullTextStore,
  pruneWorkspaceTabFullTextStore,
  removeWorkspaceTabFullText,
  upsertWorkspaceTabFullText,
  workspaceIdsMatchingFullText,
  workspaceTabFullTextFramesEqual
} from "../../shared/workspace-tab-fulltext.js";
import { isStorageQuotaError } from "../../shared/storage-schema.js";
import { storageGet, storageSet } from "../../shared/storage-adapter.js";
import { el, input } from "../../ui/dom.js";
import { createSvgIcon } from "../../ui/icons.js";

export { workspaceIdsMatchingFullText };

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
    item.title,
    ...(Array.isArray(item.appIds) ? item.appIds : [])
  ];
}

export function itemMatchesTitleQuery(item, query, label) {
  return matchesFullTextQuery(query, tabTitleSearchValues(item, label));
}

export function renderWorkspaceTabSearchField({ query, fullTextEnabled, onInput, onFocus, onBlur, onCompositionStart, onCompositionEnd }) {
  const placeholder = fullTextEnabled
    ? t("workspace.tabs.searchPlaceholderFullText")
    : t("workspace.tabs.searchPlaceholder");
  const field = input(query, {
    class: "workspace-tabs-sidebar-search-input",
    type: "search",
    placeholder,
    "aria-label": placeholder,
    autocomplete: "off",
    spellcheck: "false"
  });
  field.value = query;
  field.addEventListener("keydown", (event) => {
    if (event?.isComposing || event?.keyCode === 229) onCompositionStart?.(event);
  });
  field.addEventListener("compositionstart", (event) => onCompositionStart?.(event));
  field.addEventListener("compositionend", (event) => {
    onCompositionEnd?.(String(event?.target?.value || ""), event);
  });
  field.addEventListener("input", (event) => {
    onInput(String(event?.target?.value || ""), event);
  });
  field.addEventListener("focus", () => onFocus?.());
  field.addEventListener("blur", () => onBlur?.());
  return el("label", { class: "workspace-tabs-sidebar-search" },
    createSvgIcon("search"),
    field
  );
}

export function highlightQuery(text, query) {
  const value = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) return [value];
  const lower = value.toLowerCase();
  const match = needle.toLowerCase();
  const nodes = [];
  let from = 0;
  let index = lower.indexOf(match, from);
  while (index >= 0) {
    if (index > from) nodes.push(value.slice(from, index));
    nodes.push(el("mark", { class: "workspace-tabs-search-mark" }, value.slice(index, index + needle.length)));
    from = index + needle.length;
    index = lower.indexOf(match, from);
  }
  if (from < value.length) nodes.push(value.slice(from));
  return nodes.length ? nodes : [value];
}

function workspaceIdOf(value) {
  return String(value?.workspaceId || "").trim();
}

export function workspaceSearchRecordTime(record = {}) {
  return timestamp(record.viewedAt)
    ?? timestamp(record.updatedAt)
    ?? timestamp(record.createdAt)
    ?? timestamp(record.detachedAt);
}

export function collectWorkspaceSearchRecords({
  items = [],
  store = {},
  query = "",
  fullTextEnabled = false,
  labelOf
} = {}) {
  const needle = String(query || "").trim();
  const fullTextIds = needle && fullTextEnabled
    ? new Set(workspaceIdsMatchingFullText(store, needle))
    : new Set();
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
    const titleMatch = !needle || itemMatchesTitleQuery(item, needle, title);
    if (needle && !titleMatch && !fullTextIds.has(id)) return;
    seen.add(id);
    const stored = store?.[id];
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
      fromTab: true
    });
  });
  if (fullTextEnabled) {
    for (const stored of Object.values(normalizeWorkspaceTabFullTextStore(store))) {
      const id = workspaceIdOf(stored);
      if (!id || seen.has(id)) continue;
      const title = String(stored.topicTitle || "").trim();
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
        fromTab: false
      });
    }
  }
  return records.sort((left, right) => (workspaceSearchRecordTime(right) || 0) - (workspaceSearchRecordTime(left) || 0));
}

export function groupWorkspaceSearchRecords(records = [], now = Date.now()) {
  return groupByDate(records, workspaceSearchRecordTime, now, "workspace.tabs");
}
