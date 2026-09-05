import { STORAGE_KEYS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  framesFromSummaryPreviewItems,
  fullTextMessagesHavePair,
  leftoverWorkspaceTabFullTextHits,
  matchesFullTextQuery,
  mergeWorkspaceTabFullTextFrames,
  normalizeWorkspaceTabFullTextStore,
  pruneWorkspaceTabFullTextStore,
  removeWorkspaceTabFullText,
  uniqueWorkspaceTabFullTextHits,
  upsertWorkspaceTabFullText,
  workspaceTabFullTextFramesEqual
} from "../../shared/workspace-tab-fulltext.js";
import { isStorageQuotaError } from "../../shared/storage-schema.js";
import { storageGet, storageSet } from "../../shared/storage-adapter.js";
import { el, input } from "../../ui/dom.js";
import { createSvgIcon } from "../../ui/icons.js";

export { workspaceIdsMatchingFullText } from "../../shared/workspace-tab-fulltext.js";

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

function highlightQuery(text, query) {
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

function searchHitCard(hit, query, onActivate) {
  const sources = Array.isArray(hit.appNames) ? hit.appNames.filter(Boolean) : [];
  return el("article", {
    class: "ui-card pocket-entry workspace-tabs-search-hit",
    onclick: () => onActivate?.(hit)
  },
    el("header", { class: "pocket-entry-header" },
      el("div", { class: "pocket-entry-titleblock" },
        el("div", { class: "pocket-entry-title" },
          el("strong", {}, ...highlightQuery(hit.title || hit.appName || t("workspace.tabs.untitled", { index: 1 }), query))
        )
      ),
      sources.length ? el("div", { class: "pocket-entry-meta" },
        el("span", { class: "pocket-entry-source" }, sources.join(" · "))
      ) : null
    )
  );
}

export function renderWorkspaceTabSearchHits({ query, store, items, fullTextEnabled, onActivate }) {
  const needle = String(query || "").trim();
  if (!needle) return null;
  if (!fullTextEnabled) {
    return el("div", { class: "workspace-tabs-search-hint" }, t("workspace.tabs.fullTextDisabled"));
  }
  const leftover = leftoverWorkspaceTabFullTextHits(store, needle, items);
  if (!leftover.length) {
    return uniqueWorkspaceTabFullTextHits(store, needle, items).length
      ? null
      : el("div", { class: "workspace-tabs-search-hint" }, t("workspace.tabs.fullTextEmpty"));
  }
  return el("section", { class: "workspace-tabs-search-hits", "aria-label": t("workspace.tabs.fullTextHits") },
    el("div", { class: "workspace-tabs-sidebar-divider", role: "separator" },
      el("span", { class: "workspace-tabs-sidebar-divider-label" }, t("workspace.tabs.fullTextHits"))
    ),
    el("div", { class: "workspace-tabs-search-hit-list" },
      leftover.map((hit) => searchHitCard(hit, needle, onActivate))
    )
  );
}
