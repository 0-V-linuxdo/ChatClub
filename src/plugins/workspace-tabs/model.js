// WorkspaceTabs data rules: display names, sorting, time sections, folders (v2 02 §10).

import { isGenericTitle } from "../../lib/titles.js";

export const SORTS = ["name", "created", "activity"];
export const SECTION_IDS = ["today", "yesterday", "lastWeek", "lastMonth", "older"];
const DAY = 24 * 60 * 60 * 1000;

/** Stored sort value; old builds wrote time / viewed / edited, which are all "activity" now. */
export function normalizeSort(value) {
  if (SORTS.includes(value)) return value;
  if (["time", "viewed", "edited", "updated", "recent"].includes(value)) return "activity";
  return "activity";
}

export const activityTime = (item) => Math.max(0, ...["createdAt", "viewedAt", "editedAt", "updatedAt"].map((k) => Number(item[k]) || 0));

/** Name shown for a row and used for the page title (02 §10.2). `index` is 1-based within the section. */
export function displayName(item, { index = 1, appName = (id) => id, newTabLabel = "New Tab" } = {}) {
  if (!isGenericTitle(item.title)) return item.title.trim();
  if (item.isSelf) return newTabLabel;
  if (!isGenericTitle(item.layoutName)) return item.layoutName.trim();
  const names = [...new Set((item.appIds ?? []).map(appName).filter(Boolean))];
  if (names.length) return names.join(" · ");
  if (!item.live && !isGenericTitle(item.browserTitle)) return item.browserTitle.trim();
  return `ChatClub ${index}`;
}

export function sortItems(items, sort, nameOf) {
  const list = [...items];
  if (sort === "name") {
    return list.sort((a, b) => {
      const an = nameOf(a).toLowerCase();
      const bn = nameOf(b).toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : a.workspaceId < b.workspaceId ? -1 : a.workspaceId > b.workspaceId ? 1 : 0;
    });
  }
  const key = sort === "created" ? (x) => Number(x.createdAt) || 0 : activityTime;
  return list.sort((a, b) => key(b) - key(a));
}

export function sectionOf(time, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (time >= today) return "today";
  if (time >= today - DAY) return "yesterday";
  if (time >= today - 7 * DAY) return "lastWeek";
  if (time >= today - 30 * DAY) return "lastMonth";
  return "older";
}

export function normalizeFolders(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const f of raw) {
    if (!f || typeof f.id !== "string" || !f.id) continue;
    const ids = (Array.isArray(f.workspaceIds) ? f.workspaceIds : []).filter((id) => typeof id === "string" && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    out.push({ id: f.id, name: typeof f.name === "string" ? f.name : "", collapsed: !!f.collapsed, workspaceIds: ids });
  }
  return out;
}

/**
 * Builds the visible sections: pinned, each folder, then the rest (by time unless sorted by name).
 * Returns [{ kind: "pinned"|"folder"|"time"|"all", id, folder?, items }].
 */
export function buildSections(items, { pinned = [], folders = [], sort = "activity", nameOf, now = Date.now() }) {
  const byId = new Map(items.map((x) => [x.workspaceId, x]));
  const pinnedIds = pinned.filter((id) => byId.has(id));
  const pinnedSet = new Set(pinnedIds);
  const inFolder = new Set(folders.flatMap((f) => f.workspaceIds));
  const sections = [];
  if (pinnedIds.length) sections.push({ kind: "pinned", id: "pinned", items: pinnedIds.map((id) => byId.get(id)) });
  for (const folder of folders) {
    sections.push({ kind: "folder", id: folder.id, folder, items: folder.workspaceIds.filter((id) => byId.has(id) && !pinnedSet.has(id)).map((id) => byId.get(id)) });
  }
  const rest = sortItems(items.filter((x) => !pinnedSet.has(x.workspaceId) && !inFolder.has(x.workspaceId)), sort, nameOf);
  if (sort === "name") {
    if (rest.length) sections.push({ kind: "all", id: "all", items: rest });
  } else {
    const time = sort === "created" ? (x) => Number(x.createdAt) || 0 : activityTime;
    for (const id of SECTION_IDS) {
      const part = rest.filter((x) => sectionOf(time(x), now) === id);
      if (part.length) sections.push({ kind: "time", id, items: part });
    }
  }
  return sections;
}

export function moveIntoFolder(folders, workspaceId, folderId, beforeId = null) {
  const next = folders.map((f) => ({ ...f, workspaceIds: f.workspaceIds.filter((id) => id !== workspaceId) }));
  if (!folderId) return next;
  const target = next.find((f) => f.id === folderId);
  if (!target) return next;
  const at = beforeId ? target.workspaceIds.indexOf(beforeId) : -1;
  if (at < 0) target.workspaceIds.push(workspaceId);
  else target.workspaceIds.splice(at, 0, workspaceId);
  return next;
}
