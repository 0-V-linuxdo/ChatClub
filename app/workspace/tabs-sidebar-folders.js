import { workspaceIdValue } from "./tabs-sidebar-sort.js";

export const WORKSPACE_TABS_SIDEBAR_FOLDERS_KEY = "chatclubWorkspaceTabsSidebarFoldersV1";

function randomFolderId() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `folder-${uuid}`;
  } catch {}
  const random = Math.random().toString(36).slice(2);
  return `folder-${Date.now().toString(36)}-${random || "folder"}`;
}

function normalizeFolderName(value, fallback = "") {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  return name || fallback;
}

function normalizeFolder(value = {}, knownIds = new Set()) {
  const id = String(value?.id || "").trim();
  if (!/^folder-[A-Za-z0-9_-]{6,192}$/.test(id) || knownIds.has(id)) return null;
  const workspaceIds = [];
  const seen = new Set();
  for (const entry of Array.isArray(value?.workspaceIds) ? value.workspaceIds : []) {
    const workspaceId = workspaceIdValue(entry);
    if (!workspaceId || seen.has(workspaceId)) continue;
    seen.add(workspaceId);
    workspaceIds.push(workspaceId);
  }
  return {
    id,
    name: normalizeFolderName(value.name),
    collapsed: value?.collapsed === true,
    workspaceIds
  };
}

function normalizeFolders(value = []) {
  const folders = [];
  const seen = new Set();
  const claimed = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const folder = normalizeFolder(entry, seen);
    if (!folder) continue;
    folder.workspaceIds = folder.workspaceIds.filter((id) => {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    });
    seen.add(folder.id);
    folders.push(folder);
  }
  return folders;
}

export function readFolders(storage, getItem) {
  try {
    const raw = JSON.parse(getItem?.(storage, WORKSPACE_TABS_SIDEBAR_FOLDERS_KEY) || "[]");
    return normalizeFolders(raw);
  } catch {
    return [];
  }
}

export function serializeFolders(folders = []) {
  return JSON.stringify(normalizeFolders(folders));
}

export function createFolder(folders = [], name = "") {
  return normalizeFolders([
    ...folders,
    {
      id: randomFolderId(),
      name: normalizeFolderName(name),
      collapsed: false,
      workspaceIds: []
    }
  ]);
}

export function renameFolder(folders = [], folderId, name, fallback = "") {
  return folders.map((folder) => (
    folder.id === folderId
      ? { ...folder, name: normalizeFolderName(name, fallback) }
      : folder
  ));
}

export function toggleFolderCollapsed(folders = [], folderId) {
  return folders.map((folder) => (
    folder.id === folderId ? { ...folder, collapsed: !folder.collapsed } : folder
  ));
}

export function deleteFolder(folders = [], folderId) {
  return folders.filter((folder) => folder.id !== folderId);
}

export function pruneFolderMembers(folders = [], workspaceIds = []) {
  const allowed = new Set((Array.isArray(workspaceIds) ? workspaceIds : []).map(workspaceIdValue).filter(Boolean));
  return folders.map((folder) => ({
    ...folder,
    workspaceIds: folder.workspaceIds.filter((id) => allowed.has(id))
  }));
}

function withoutMember(folders, workspaceId) {
  return folders.map((folder) => ({
    ...folder,
    workspaceIds: folder.workspaceIds.filter((id) => id !== workspaceId)
  }));
}

export function moveTabToFolder(folders = [], workspaceId, folderId, place = "end", beforeId = "") {
  const id = workspaceIdValue(workspaceId);
  const targetId = String(folderId || "").trim();
  if (!id || !targetId) return folders;
  const next = withoutMember(folders, id);
  return next.map((folder) => {
    if (folder.id !== targetId) return folder;
    const members = folder.workspaceIds.filter((value) => value !== id);
    if (place === "before" && beforeId) {
      const index = members.indexOf(beforeId);
      if (index >= 0) members.splice(index, 0, id);
      else members.push(id);
    } else if (place === "after" && beforeId) {
      const index = members.indexOf(beforeId);
      if (index >= 0) members.splice(index + 1, 0, id);
      else members.push(id);
    } else members.push(id);
    return { ...folder, workspaceIds: members, collapsed: false };
  });
}

export function removeTabFromFolder(folders = [], workspaceId) {
  return withoutMember(folders, workspaceIdValue(workspaceId));
}

export function moveFolder(folders = [], folderId, targetId, place = "before") {
  if (!folderId || folderId === targetId) return folders;
  const next = folders.filter((folder) => folder.id !== folderId);
  const moving = folders.find((folder) => folder.id === folderId);
  if (!moving) return folders;
  const targetIndex = next.findIndex((folder) => folder.id === targetId);
  if (targetIndex < 0) return folders;
  next.splice(place === "after" ? targetIndex + 1 : targetIndex, 0, moving);
  return next;
}
