import { dateGroupId, groupByDate, timestamp } from "../../shared/date-groups.js";

const TABS_SIDEBAR_SORT_MODE_ALIASES = Object.freeze({
  time: "activity",
  viewed: "activity",
  edited: "activity",
  open: "activity"
});
export const TABS_SIDEBAR_SORT_MODES = Object.freeze(["name", "created", "activity"]);
const DEFAULT_TABS_SIDEBAR_SORT_MODE = "activity";
export const TABS_SIDEBAR_SORT_LABEL_KEYS = Object.freeze({
  name: "workspace.tabs.sortName",
  created: "workspace.tabs.sortCreated",
  activity: "workspace.tabs.sortActivity"
});

export function normalizeTabsSidebarSortMode(value) {
  const aliased = TABS_SIDEBAR_SORT_MODE_ALIASES[value] || value;
  return TABS_SIDEBAR_SORT_MODES.includes(aliased) ? aliased : DEFAULT_TABS_SIDEBAR_SORT_MODE;
}

export function workspaceIdValue(value) {
  return String(value || "").trim();
}

function latestActivityTime(item = {}) {
  const times = [item.createdAt, item.viewedAt, item.editedAt, item.updatedAt]
    .map(timestamp)
    .filter((value) => value !== null);
  return times.length ? Math.max(...times) : timestamp(item.detachedAt);
}

function tabSortTime(item = {}, mode) {
  if (normalizeTabsSidebarSortMode(mode) === "created") {
    return timestamp(item.createdAt) ?? timestamp(item.updatedAt) ?? timestamp(item.detachedAt);
  }
  return latestActivityTime(item);
}

function applyGlobalPinnedOrder(list = [], order = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  const pinned = [];
  const rest = [];
  for (const item of list) {
    const id = workspaceIdValue(item.workspaceId);
    if (id && rank.has(id)) pinned.push({ ...item, pinned: true });
    else rest.push({ ...item, pinned: false });
  }
  pinned.sort((left, right) => rank.get(left.workspaceId) - rank.get(right.workspaceId));
  return [...pinned, ...rest];
}

function compareByName(left, right, getLabel) {
  const leftLabel = String(getLabel?.(left) || left?.topicTitle || left?.layoutName || left?.title || "");
  const rightLabel = String(getLabel?.(right) || right?.topicTitle || right?.layoutName || right?.title || "");
  const named = leftLabel.localeCompare(rightLabel, undefined, { sensitivity: "base" });
  if (named) return named;
  return workspaceIdValue(left?.workspaceId).localeCompare(workspaceIdValue(right?.workspaceId));
}

function compareByTime(left, right, mode) {
  const delta = (tabSortTime(right, mode) || 0) - (tabSortTime(left, mode) || 0);
  if (delta) return delta;
  return workspaceIdValue(left?.workspaceId).localeCompare(workspaceIdValue(right?.workspaceId));
}

function sortTabGroup(list = [], mode, getLabel, now = Date.now()) {
  const items = list.slice();
  const sortMode = normalizeTabsSidebarSortMode(mode);
  if (sortMode === "name") {
    items.sort((left, right) => compareByName(left, right, getLabel));
    return items;
  }
  items.sort((left, right) => compareByTime(left, right, sortMode)
    || dateGroupId(tabSortTime(left, sortMode), now).localeCompare(dateGroupId(tabSortTime(right, sortMode), now)));
  return items;
}

export function sortSidebarItems(list = [], {
  mode = DEFAULT_TABS_SIDEBAR_SORT_MODE,
  pinnedOrder = [],
  getLabel,
  now = Date.now()
} = {}) {
  const sortMode = normalizeTabsSidebarSortMode(mode);
  const flagged = applyGlobalPinnedOrder(list, pinnedOrder);
  const pinned = flagged.filter((item) => item.pinned);
  const rest = sortTabGroup(flagged.filter((item) => !item.pinned), sortMode, getLabel, now);
  return [...pinned, ...rest];
}

export function folderIdForItem(item = {}, folders = []) {
  const workspaceId = workspaceIdValue(item.workspaceId);
  if (!workspaceId) return "";
  for (const folder of folders) {
    if ((folder.workspaceIds || []).includes(workspaceId)) return folder.id;
  }
  return "";
}

export function buildSidebarTree({
  items = [],
  folders = [],
  mode = DEFAULT_TABS_SIDEBAR_SORT_MODE,
  pinnedOrder = [],
  getLabel,
  now = Date.now()
} = {}) {
  const sortMode = normalizeTabsSidebarSortMode(mode);
  const sorted = sortSidebarItems(items, { mode: sortMode, pinnedOrder, getLabel, now });
  const memberToFolder = new Map();
  for (const folder of folders) {
    for (const id of folder.workspaceIds || []) memberToFolder.set(id, folder.id);
  }
  const pinned = [];
  const folderItems = new Map(folders.map((folder) => [folder.id, []]));
  const unfoldered = [];
  for (const item of sorted) {
    if (item.pinned) {
      pinned.push(item);
      continue;
    }
    const folderId = memberToFolder.get(workspaceIdValue(item.workspaceId));
    if (folderId && folderItems.has(folderId)) folderItems.get(folderId).push(item);
    else unfoldered.push(item);
  }
  const nodes = [];
  if (pinned.length) {
    nodes.push({ type: "group", id: "pinned", labelKey: "workspace.tabs.pinned", items: pinned });
  }
  for (const folder of folders) {
    nodes.push({
      type: "folder",
      folder,
      items: sortTabGroup(folderItems.get(folder.id) || [], sortMode, getLabel, now)
    });
  }
  if (sortMode === "name") {
    if (unfoldered.length) nodes.push({ type: "items", id: "named", items: unfoldered });
    return nodes;
  }
  for (const group of groupByDate(unfoldered, (item) => tabSortTime(item, sortMode), now, "workspace.tabs")) {
    nodes.push({ type: "group", id: group.id, labelKey: group.labelKey, items: group.items });
  }
  return nodes;
}
