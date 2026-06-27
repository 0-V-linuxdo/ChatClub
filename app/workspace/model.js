export function normalizeWorkspaceLayoutGroups(groups, validIds) {
  const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
  return (Array.isArray(groups) ? groups : [])
    .map((group) => (Array.isArray(group) ? group : [])
      .map((id) => String(id || ""))
      .filter((id) => valid.has(id)))
    .filter((group) => group.length);
}

export function layoutGroupsFromWorkspace(groups, validIds) {
  return normalizeWorkspaceLayoutGroups(
    (Array.isArray(groups) ? groups : []).map((group) => (group.chatApps || []).map((chat) => chat.appId)),
    validIds
  );
}

export function workspaceGridColumnCount(groupCount, colMaxCount) {
  const desired = colMaxCount || groupCount;
  return Math.max(1, Math.min(4, groupCount || 1, desired || 1));
}

export function hydrateWorkspaceGroups({ presetGroups, apps, createGroupId, createFrameId, fallbackGroups }) {
  const valid = new Set((apps || []).map((app) => app.id));
  const sourceGroups = Array.isArray(presetGroups) && presetGroups.length ? presetGroups : fallbackGroups;
  let groups = (sourceGroups || [])
    .map((group) => ({
      id: createGroupId(),
      chatApps: (Array.isArray(group) ? group : [])
        .filter((id) => valid.has(id))
        .map((id) => ({ appId: id, instanceId: createFrameId() }))
    }))
    .filter((group) => group.chatApps.length);
  if (!groups.length && apps?.[0]?.id) {
    groups = [{ id: createGroupId(), chatApps: [{ appId: apps[0].id, instanceId: createFrameId() }] }];
  }
  const activeTabs = {};
  for (const group of groups) activeTabs[group.id] = group.chatApps[0]?.instanceId;
  return { groups, activeTabs };
}

export function moveTabWithinGroup(group, tabId, insertIndex) {
  const fromIndex = group?.chatApps?.findIndex((item) => item.instanceId === tabId) ?? -1;
  if (fromIndex < 0) return { changed: false, moved: null, noop: false };
  const normalizedIndex = fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
  if (normalizedIndex === fromIndex) return { changed: false, moved: group.chatApps[fromIndex], noop: true };
  const [moved] = group.chatApps.splice(fromIndex, 1);
  group.chatApps.splice(Math.max(0, Math.min(normalizedIndex, group.chatApps.length)), 0, moved);
  return { changed: true, moved, noop: false };
}

export function moveGroupWithinWorkspace(groups, groupId, insertIndex) {
  const fromIndex = (groups || []).findIndex((group) => group.id === groupId);
  if (fromIndex < 0) return { changed: false, moved: null, noop: false };
  const normalizedIndex = fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
  if (normalizedIndex === fromIndex) return { changed: false, moved: groups[fromIndex], noop: true };
  const [moved] = groups.splice(fromIndex, 1);
  groups.splice(Math.max(0, Math.min(normalizedIndex, groups.length)), 0, moved);
  return { changed: true, moved, noop: false };
}

export function moveDroppedGroupWithinWorkspace(groups, groupId, targetIndex, insertAfterTarget) {
  const fromIndex = (groups || []).findIndex((item) => item.id === groupId);
  if (fromIndex < 0 || fromIndex === targetIndex) return { changed: false, moved: null };
  let insertIndex = targetIndex + (insertAfterTarget ? 1 : 0);
  const [moved] = groups.splice(fromIndex, 1);
  if (fromIndex < insertIndex) insertIndex -= 1;
  groups.splice(Math.max(0, Math.min(insertIndex, groups.length)), 0, moved);
  return { changed: true, moved };
}

export function removeChatFromGroup(groups, activeTabs, group, chat) {
  const closeIndex = group?.chatApps?.findIndex((item) => item.instanceId === chat?.instanceId) ?? -1;
  if (closeIndex < 0) return { removed: false, removeGroup: false, closeIndex };
  if (group.chatApps.length > 1) {
    group.chatApps = group.chatApps.filter((item) => item.instanceId !== chat.instanceId);
    let nextActiveId = activeTabs[group.id];
    if (nextActiveId === chat.instanceId) {
      const nextIndex = Math.min(closeIndex, group.chatApps.length - 1);
      nextActiveId = group.chatApps[nextIndex]?.instanceId || group.chatApps[0]?.instanceId || "";
      activeTabs[group.id] = nextActiveId;
    }
    return { removed: true, removeGroup: false, closeIndex, nextActiveId };
  }
  return { removed: false, removeGroup: (groups || []).length > 1, closeIndex };
}

export function removeGroupFromWorkspace(groups, activeTabs, groupId) {
  if (!Array.isArray(groups) || groups.length <= 1) return { changed: false, groups };
  const nextGroups = groups.filter((item) => item.id !== groupId);
  delete activeTabs[groupId];
  return { changed: nextGroups.length !== groups.length, groups: nextGroups };
}

