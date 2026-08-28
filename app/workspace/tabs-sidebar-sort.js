import { dateGroupId, groupByDate, timestamp } from "../../shared/date-groups.js";

const TABS_SIDEBAR_SORT_MODE_ALIASES = Object.freeze({ time: "viewed" });
export const TABS_SIDEBAR_SORT_MODES = Object.freeze(["viewed", "edited", "created", "open", "name"]);
const DEFAULT_TABS_SIDEBAR_SORT_MODE = "viewed";
export const TABS_SIDEBAR_SORT_LABEL_KEYS = Object.freeze({
  viewed: "workspace.tabs.sortViewed",
  edited: "workspace.tabs.sortEdited",
  created: "workspace.tabs.sortCreated",
  open: "workspace.tabs.sortOpen",
  name: "workspace.tabs.sortName"
});

export function normalizeTabsSidebarSortMode(value) {
  const aliased = TABS_SIDEBAR_SORT_MODE_ALIASES[value] || value;
  return TABS_SIDEBAR_SORT_MODES.includes(aliased) ? aliased : DEFAULT_TABS_SIDEBAR_SORT_MODE;
}

export function workspaceIdValue(value) {
  return String(value || "").trim();
}

function tabSortTime(item = {}, mode) {
  const sortMode = normalizeTabsSidebarSortMode(mode);
  const fallback = timestamp(item.updatedAt) ?? timestamp(item.detachedAt);
  if (sortMode === "created") return timestamp(item.createdAt) ?? fallback;
  if (sortMode === "edited") return timestamp(item.editedAt) ?? fallback;
  return timestamp(item.viewedAt) ?? fallback;
}

function applyClosedOrder(list = [], order = []) {
  if (!order.length) return list;
  const rank = new Map(order.map((id, index) => [id, index]));
  const live = [];
  const closed = [];
  for (const item of list) {
    if (item.live) live.push(item);
    else closed.push(item);
  }
  closed.sort((left, right) => {
    const leftRank = rank.has(left.workspaceId) ? rank.get(left.workspaceId) : Number.MAX_SAFE_INTEGER;
    const rightRank = rank.has(right.workspaceId) ? rank.get(right.workspaceId) : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
  return [...live, ...closed];
}

function applyPinnedOrder(list = [], order = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  const live = [];
  const closed = [];
  for (const item of list) {
    if (item.live) live.push(item);
    else closed.push(item);
  }
  const split = (group) => {
    const pinned = [];
    const rest = [];
    for (const item of group) {
      const id = workspaceIdValue(item.workspaceId);
      if (id && rank.has(id)) pinned.push({ ...item, pinned: true });
      else rest.push({ ...item, pinned: false });
    }
    pinned.sort((left, right) => rank.get(left.workspaceId) - rank.get(right.workspaceId));
    return [...pinned, ...rest];
  };
  return [...split(live), ...split(closed)];
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
  if (sortMode === "open") {
    items.sort((left, right) => {
      if (Boolean(left.live) !== Boolean(right.live)) return left.live ? -1 : 1;
      return 0;
    });
    return items;
  }
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
  closedOrder = [],
  pinnedOrder = [],
  getLabel,
  now = Date.now()
} = {}) {
  const sortMode = normalizeTabsSidebarSortMode(mode);
  if (sortMode === "open") {
    return applyPinnedOrder(applyClosedOrder(list, closedOrder), pinnedOrder);
  }
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
  closedOrder = [],
  pinnedOrder = [],
  getLabel,
  now = Date.now()
} = {}) {
  const sortMode = normalizeTabsSidebarSortMode(mode);
  const sorted = sortSidebarItems(items, { mode: sortMode, closedOrder, pinnedOrder, getLabel, now });
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
  if (pinned.length && sortMode !== "open") {
    nodes.push({ type: "group", id: "pinned", labelKey: "workspace.tabs.pinned", items: pinned });
  }
  for (const folder of folders) {
    nodes.push({
      type: "folder",
      folder,
      items: sortTabGroup(folderItems.get(folder.id) || [], sortMode, getLabel, now)
    });
  }
  if (sortMode === "open") {
    const livePinned = pinned.filter((item) => item.live);
    const closedPinned = pinned.filter((item) => !item.live);
    const live = [...livePinned, ...unfoldered.filter((item) => item.live)];
    const closed = [...closedPinned, ...unfoldered.filter((item) => !item.live)];
    if (live.length) nodes.push({ type: "items", id: "live", items: live });
    if (closed.length) {
      nodes.push({ type: "divider", id: "closed", labelKey: "workspace.tabs.closed" });
      nodes.push({ type: "items", id: "closed", items: closed });
    }
    return nodes;
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
