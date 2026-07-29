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

export function importedWorkspaceLayoutNeedsHydration({
  temporary = false,
  previousTargetGroups = [],
  nextTargetGroups = [],
  currentGroups = []
} = {}) {
  if (temporary) return false;
  const previousSignature = JSON.stringify(previousTargetGroups);
  const nextSignature = JSON.stringify(nextTargetGroups);
  if (previousSignature === nextSignature) return false;
  return nextSignature !== JSON.stringify(currentGroups);
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

function sameActiveTabs(left = {}, right = {}) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => left[key] === right[key]);
}

function effectiveCustomAppsById(config = []) {
  const byId = new Map();
  for (const app of Array.isArray(config) ? config : []) {
    if (app?.id && !byId.has(app.id)) byId.set(app.id, app);
  }
  return byId;
}

export function diffEffectiveCustomAppCatalog(previousConfig = [], currentConfig = []) {
  const previousById = effectiveCustomAppsById(previousConfig);
  const currentById = effectiveCustomAppsById(currentConfig);
  const ids = new Set([...previousById.keys(), ...currentById.keys()]);
  return {
    affectedAppIds: new Set([...ids]
      .filter((appId) => JSON.stringify(previousById.get(appId)) !== JSON.stringify(currentById.get(appId)))),
    sourceChangedAppIds: new Set([...ids]
      .filter((appId) => previousById.has(appId) !== currentById.has(appId)
        || String(previousById.get(appId)?.url || "") !== String(currentById.get(appId)?.url || "")))
  };
}

/**
 * Remove workspace tabs whose app no longer exists without regenerating the
 * identities of surviving groups or tabs. A fallback tab is created only when
 * the removed apps would otherwise leave the workspace empty.
 */
export function reconcileWorkspaceAppCatalog({
  groups = [],
  activeTabs = {},
  validAppIds = [],
  fallbackAppId = "",
  createGroupId,
  createFrameId
} = {}) {
  const sourceGroups = Array.isArray(groups) ? groups : [];
  const sourceActiveTabs = activeTabs && typeof activeTabs === "object" ? activeTabs : {};
  const validIds = validAppIds instanceof Set ? validAppIds : new Set(validAppIds || []);
  const fallbackActiveByGroupId = new Map();
  let groupsChanged = false;

  let nextGroups = sourceGroups.flatMap((group) => {
    const chats = Array.isArray(group?.chatApps) ? group.chatApps : [];
    const keptChats = chats.filter((chat) => validIds.has(chat?.appId));
    if (!keptChats.length) {
      groupsChanged = true;
      return [];
    }
    const previousActive = sourceActiveTabs[group.id];
    if (previousActive && !keptChats.some((chat) => chat.instanceId === previousActive)) {
      const removedActiveIndex = chats.findIndex((chat) => chat.instanceId === previousActive);
      const nearest = removedActiveIndex >= 0
        ? chats.slice(removedActiveIndex + 1).find((chat) => keptChats.includes(chat))
          || chats.slice(0, removedActiveIndex).reverse().find((chat) => keptChats.includes(chat))
        : null;
      fallbackActiveByGroupId.set(group.id, nearest?.instanceId || keptChats[0]?.instanceId || "");
    }
    if (keptChats.length === chats.length) return [group];
    groupsChanged = true;
    group.chatApps = keptChats;
    return [group];
  });

  const normalizedFallbackAppId = validIds.has(fallbackAppId)
    ? fallbackAppId
    : [...validIds][0] || "";
  if (!nextGroups.length && normalizedFallbackAppId) {
    if (typeof createFrameId !== "function") {
      throw new TypeError("Workspace app reconciliation requires createFrameId for its fallback tab");
    }
    const reusableGroup = sourceGroups[0];
    const groupId = reusableGroup?.id || (() => {
      if (typeof createGroupId !== "function") {
        throw new TypeError("Workspace app reconciliation requires createGroupId for its fallback group");
      }
      return createGroupId();
    })();
    const instanceId = createFrameId();
    const fallbackGroup = reusableGroup || { id: groupId, chatApps: [] };
    fallbackGroup.id = groupId;
    fallbackGroup.chatApps = [{ appId: normalizedFallbackAppId, instanceId }];
    nextGroups = [fallbackGroup];
    groupsChanged = true;
  }

  const nextActiveTabs = {};
  for (const group of nextGroups) {
    const previousActive = sourceActiveTabs[group.id];
    nextActiveTabs[group.id] = group.chatApps.some((chat) => chat.instanceId === previousActive)
      ? previousActive
      : fallbackActiveByGroupId.get(group.id) || group.chatApps[0]?.instanceId || "";
  }
  const activeTabsChanged = !sameActiveTabs(sourceActiveTabs, nextActiveTabs);

  return {
    groups: groupsChanged ? nextGroups : sourceGroups,
    activeTabs: activeTabsChanged ? nextActiveTabs : sourceActiveTabs,
    changed: groupsChanged || activeTabsChanged
  };
}

export function moveTabWithinGroup(groups, groupId, tabId, insertIndex) {
  const group = (Array.isArray(groups) ? groups : []).find((item) => item?.id === groupId);
  const fromIndex = group?.chatApps?.findIndex((item) => item.instanceId === tabId) ?? -1;
  if (fromIndex < 0) return { changed: false, moved: null, noop: false };
  const requestedIndex = Number(insertIndex);
  const targetIndex = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(Math.trunc(requestedIndex), group.chatApps.length))
    : fromIndex;
  const normalizedIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
  if (normalizedIndex === fromIndex) return { changed: false, moved: group.chatApps[fromIndex], noop: true };
  const [moved] = group.chatApps.splice(fromIndex, 1);
  group.chatApps.splice(Math.max(0, Math.min(normalizedIndex, group.chatApps.length)), 0, moved);
  return { changed: true, moved, noop: false };
}

export function moveTabBetweenGroups(
  groups,
  activeTabs,
  sourceGroupId,
  targetGroupId,
  tabId,
  insertIndex
) {
  const sourceGroups = Array.isArray(groups) ? groups : [];
  const activeByGroupId = activeTabs && typeof activeTabs === "object" ? activeTabs : null;
  const sourceGroup = sourceGroups.find((group) => group?.id === sourceGroupId);
  const targetGroup = sourceGroups.find((group) => group?.id === targetGroupId);
  const fromIndex = sourceGroup?.chatApps?.findIndex((chat) => chat.instanceId === tabId) ?? -1;
  if (
    !activeByGroupId
    || !sourceGroup
    || !targetGroup
    || sourceGroup === targetGroup
    || fromIndex < 0
    || targetGroup.chatApps.some((chat) => chat.instanceId === tabId)
  ) {
    return { changed: false, moved: null, sourceGroup: null, targetGroup: null };
  }

  const previousSourceActiveId = activeByGroupId[sourceGroup.id] || sourceGroup.chatApps[0]?.instanceId || "";
  const previousTargetActiveId = activeByGroupId[targetGroup.id] || targetGroup.chatApps[0]?.instanceId || "";
  const [moved] = sourceGroup.chatApps.splice(fromIndex, 1);
  const requestedTargetIndex = Number(insertIndex);
  const targetIndex = Number.isFinite(requestedTargetIndex)
    ? Math.max(0, Math.min(Math.trunc(requestedTargetIndex), targetGroup.chatApps.length))
    : targetGroup.chatApps.length;
  targetGroup.chatApps.splice(targetIndex, 0, moved);

  let sourceActiveId = "";
  let sourceGroupRemoved = false;
  if (!sourceGroup.chatApps.length) {
    const sourceIndex = sourceGroups.indexOf(sourceGroup);
    if (sourceIndex >= 0) sourceGroups.splice(sourceIndex, 1);
    delete activeByGroupId[sourceGroup.id];
    sourceGroupRemoved = true;
  } else {
    sourceActiveId = previousSourceActiveId !== moved.instanceId
      && sourceGroup.chatApps.some((chat) => chat.instanceId === previousSourceActiveId)
      ? previousSourceActiveId
      : sourceGroup.chatApps[Math.min(fromIndex, sourceGroup.chatApps.length - 1)]?.instanceId
        || sourceGroup.chatApps[0]?.instanceId
        || "";
    activeByGroupId[sourceGroup.id] = sourceActiveId;
  }
  activeByGroupId[targetGroup.id] = moved.instanceId;

  return {
    changed: true,
    moved,
    sourceGroup,
    targetGroup,
    sourceGroupRemoved,
    sourceActiveId,
    nextSourceActiveId: sourceActiveId,
    previousSourceActiveId,
    previousTargetActiveId,
    targetActiveId: moved.instanceId,
    targetIndex
  };
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

export function removeChatFromGroup(groups, activeTabs, group, chat) {
  const sourceGroups = Array.isArray(groups) ? groups : [];
  const groupId = group?.id;
  const instanceId = chat?.instanceId;
  const canonicalGroup = sourceGroups.find((item) => item?.id === groupId);
  const closeIndex = canonicalGroup?.chatApps?.findIndex((item) => item.instanceId === instanceId) ?? -1;
  if (closeIndex < 0) return { removed: false, removeGroup: false };
  if (canonicalGroup.chatApps.length > 1) {
    canonicalGroup.chatApps = canonicalGroup.chatApps.filter((item) => item.instanceId !== instanceId);
    let nextActiveId = activeTabs[groupId];
    if (nextActiveId === instanceId) {
      const nextIndex = Math.min(closeIndex, canonicalGroup.chatApps.length - 1);
      nextActiveId = canonicalGroup.chatApps[nextIndex]?.instanceId || canonicalGroup.chatApps[0]?.instanceId || "";
      activeTabs[groupId] = nextActiveId;
    }
    return { removed: true, removeGroup: false, nextActiveId };
  }
  return { removed: false, removeGroup: sourceGroups.length > 1 };
}

export function removeGroupFromWorkspace(groups, activeTabs, groupId) {
  if (!Array.isArray(groups) || groups.length <= 1) return { changed: false, groups };
  const nextGroups = groups.filter((item) => item.id !== groupId);
  delete activeTabs[groupId];
  return { changed: nextGroups.length !== groups.length, groups: nextGroups };
}
