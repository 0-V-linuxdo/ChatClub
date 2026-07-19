import {
  WORKSPACE_SESSION_SCHEMA_VERSION,
  normalizeWorkspaceSessionGeneration
} from "../../shared/workspace-session.js";

function text(value) {
  return String(value ?? "").trim();
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function idSet(value, supplied) {
  if (!supplied) return null;
  const values = value instanceof Set ? [...value] : Array.isArray(value) ? value : [];
  return new Set(values.map(text).filter(Boolean));
}

function integer(value, fallback = 0) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function httpUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function firstId(ids) {
  return ids ? ids.values().next().value || "" : "";
}

function normalizedPresetId(value, validPresetIds, fallbackPresetId) {
  const requested = text(value);
  if (!validPresetIds) return requested || text(fallbackPresetId);
  if (validPresetIds.has(requested)) return requested;
  const fallback = text(fallbackPresetId);
  if (validPresetIds.has(fallback)) return fallback;
  return firstId(validPresetIds);
}

function normalizeLayout(value, context = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const validPresetIds = idSet(context.validPresetIds, own(context, "validPresetIds"));
  const presetId = normalizedPresetId(
    source.presetId || source.activeLayoutPresetId,
    validPresetIds,
    context.fallbackPresetId
  );
  const temporarySource = source.temporary && typeof source.temporary === "object"
    ? source.temporary
    : source;
  const temporary = source.type === "temporary"
    || source.temporary === true
    || Boolean(source.temporary && typeof source.temporary === "object");
  if (temporary) {
    return {
      type: "temporary",
      presetId,
      name: text(temporarySource.name),
      pocketBatchId: text(temporarySource.pocketBatchId)
    };
  }
  return { type: "preset", presetId };
}

function normalizedTab(value, validAppIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const appId = text(value.appId);
  if (!appId || (validAppIds && !validAppIds.has(appId))) return null;
  return {
    appId,
    currentHref: httpUrl(value.currentHref || value.href || value.url || value.initialHref)
  };
}

function normalizeGroup(value, validAppIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sourceTabs = Array.isArray(value.tabs) ? value.tabs : [];
  if (!sourceTabs.length) return null;
  const requestedActiveIndex = Math.max(0, Math.min(
    integer(value.activeIndex, 0),
    sourceTabs.length - 1
  ));
  const retained = sourceTabs
    .map((tab, originalIndex) => ({ tab: normalizedTab(tab, validAppIds), originalIndex }))
    .filter((entry) => entry.tab);
  if (!retained.length) return null;
  let activeIndex = retained.findIndex((entry) => entry.originalIndex === requestedActiveIndex);
  if (activeIndex < 0) activeIndex = retained.findIndex((entry) => entry.originalIndex > requestedActiveIndex);
  if (activeIndex < 0) activeIndex = retained.length - 1;
  return {
    tabs: retained.map((entry) => entry.tab),
    activeIndex
  };
}

function normalizedGroups(value, validAppIds) {
  const records = [];
  for (const [originalIndex, group] of (Array.isArray(value) ? value : []).entries()) {
    const normalized = normalizeGroup(group, validAppIds);
    if (normalized) records.push({ originalIndex, group: normalized });
  }
  return records;
}

function collectionValue(collection, key) {
  if (!collection || !key) return "";
  if (collection instanceof Map) return collection.get(key);
  if (typeof collection === "object") return collection[key];
  return "";
}

function capturedTabHref(source, group, tab, groupIndex, tabIndex) {
  if (typeof source.currentHrefForTab === "function") {
    const value = source.currentHrefForTab(tab, group, groupIndex, tabIndex);
    if (value) return value;
  }
  const instanceId = text(tab?.instanceId);
  const remembered = collectionValue(source.currentHrefByInstanceId || source.currentHrefs, instanceId);
  return remembered || tab?.currentHref || tab?.href || tab?.url || tab?.initialHref || "";
}

function capturedGroupTabs(group) {
  if (Array.isArray(group)) return group.map((appId) => ({ appId }));
  if (Array.isArray(group?.tabs)) return group.tabs;
  return Array.isArray(group?.chatApps) ? group.chatApps : [];
}

function capturedLayout(source) {
  const temporary = source.temporaryLayoutPreset;
  if (temporary?.temporary) {
    return {
      type: "temporary",
      presetId: source.activeLayoutPresetId || source.options?.activeLayoutPresetId,
      name: temporary.name,
      pocketBatchId: temporary.pocketBatchId
    };
  }
  if (source.layout && typeof source.layout === "object") return source.layout;
  return {
    type: "preset",
    presetId: source.activeLayoutPresetId || source.options?.activeLayoutPresetId
  };
}

/**
 * Capture a serializable V1 workspace snapshot from app state plus caller-
 * supplied frame locations. Runtime group/frame ids are used only to derive
 * indexes and are never copied into the result.
 */
export function captureWorkspaceSnapshotV1(source = {}) {
  const sourceGroups = Array.isArray(source.groups) ? source.groups : [];
  const groups = sourceGroups.map((group, groupIndex) => {
    const tabs = capturedGroupTabs(group);
    const activeInstanceId = text(source.activeTabs?.[group?.id] || group?.activeInstanceId);
    const explicitActiveIndex = integer(group?.activeIndex, -1);
    const activeIndex = explicitActiveIndex >= 0
      ? explicitActiveIndex
      : Math.max(0, tabs.findIndex((tab) => text(tab?.instanceId) === activeInstanceId));
    return {
      tabs: tabs.map((tab, tabIndex) => ({
        appId: text(tab?.appId),
        currentHref: capturedTabHref(source, group, tab, groupIndex, tabIndex)
      })),
      activeIndex
    };
  });
  const explicitFullscreenIndex = integer(source.fullscreenGroupIndex, -1);
  const fullscreenGroupIndex = explicitFullscreenIndex >= 0
    ? explicitFullscreenIndex
    : sourceGroups.findIndex((group) => group?.id && group.id === source.fullscreenGroupId);
  return normalizeWorkspaceSnapshotV1({
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    generation: source.generation,
    layout: capturedLayout(source),
    groups,
    fullscreenGroupIndex: fullscreenGroupIndex >= 0 ? fullscreenGroupIndex : null
  });
}

/**
 * Validate and clone an untrusted V1 snapshot. Invalid apps and empty groups
 * are removed locally; surviving duplicate apps retain their original order.
 */
function normalizeWorkspaceSnapshotV1(value, context = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Number(value.schemaVersion) !== WORKSPACE_SESSION_SCHEMA_VERSION) return null;
  const validAppIds = idSet(context.validAppIds, own(context, "validAppIds"));
  const records = normalizedGroups(value.groups, validAppIds);
  const requestedFullscreenIndex = integer(value.fullscreenGroupIndex, -1);
  const fullscreenGroupIndex = requestedFullscreenIndex >= 0
    ? records.findIndex((record) => record.originalIndex === requestedFullscreenIndex)
    : -1;
  return {
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    generation: normalizeWorkspaceSessionGeneration(value.generation),
    layout: normalizeLayout(value.layout, context),
    groups: records.map((record) => record.group),
    fullscreenGroupIndex: fullscreenGroupIndex >= 0 ? fullscreenGroupIndex : null
  };
}

function fallbackSnapshotGroups(groups = []) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    tabs: capturedGroupTabs(group).map((tab) => ({
      appId: text(tab?.appId),
      currentHref: tab?.currentHref || tab?.href || tab?.url || tab?.initialHref || ""
    })),
    activeIndex: Math.max(0, integer(group?.activeIndex, 0))
  }));
}

function restoredId(factory, label, ...args) {
  if (typeof factory !== "function") throw new TypeError(`Workspace snapshot restore requires ${label}`);
  const id = text(factory(...args));
  if (!id) throw new TypeError(`Workspace snapshot restore ${label} returned an empty id`);
  return id;
}

function presetSnapshotCanRestore(value, context) {
  if (!own(context, "validPresetIds")) return true;
  const layout = value?.layout && typeof value.layout === "object" && !Array.isArray(value.layout)
    ? value.layout
    : {};
  const temporary = layout.type === "temporary"
    || layout.temporary === true
    || Boolean(layout.temporary && typeof layout.temporary === "object");
  if (temporary) return true;
  const validPresetIds = idSet(context.validPresetIds, true);
  return validPresetIds.has(text(layout.presetId || layout.activeLayoutPresetId));
}

/**
 * Restore normalized snapshot data into the current workspace state shape.
 * ID factories are required because persisted snapshots intentionally contain
 * no runtime ids. Returns null when no valid tab can be restored.
 */
export function restoreWorkspaceSnapshotV1(value, context = {}) {
  // A persistent snapshot belongs to the preset it captured. If that preset
  // was deleted, the caller must use its ordinary current/default hydration
  // instead of applying stale groups to a different preset. Temporary Pocket
  // workspaces remain independently restorable.
  if (!presetSnapshotCanRestore(value, context)) return null;
  let snapshot = normalizeWorkspaceSnapshotV1(value, context);
  if (!snapshot) return null;
  if (!snapshot.groups.length && Array.isArray(context.fallbackGroups)) {
    snapshot = normalizeWorkspaceSnapshotV1({
      ...snapshot,
      groups: fallbackSnapshotGroups(context.fallbackGroups),
      fullscreenGroupIndex: null
    }, context);
  }
  if (!snapshot?.groups.length) return null;

  const temporary = snapshot.layout.type === "temporary";
  const activeTabs = {};
  const groups = snapshot.groups.map((sourceGroup, groupIndex) => {
    const groupId = restoredId(context.createGroupId, "createGroupId", groupIndex);
    const chatApps = sourceGroup.tabs.map((tab, tabIndex) => {
      const instanceId = restoredId(context.createFrameId, "createFrameId", groupIndex, tabIndex);
      return {
        appId: tab.appId,
        instanceId,
        ...(tab.currentHref ? { initialHref: tab.currentHref } : {})
      };
    });
    activeTabs[groupId] = chatApps[sourceGroup.activeIndex]?.instanceId || chatApps[0].instanceId;
    return {
      id: groupId,
      ...(temporary ? {
        temporary: true,
        pocketBatchId: snapshot.layout.pocketBatchId
      } : {}),
      chatApps
    };
  });

  let temporaryLayoutPreset = null;
  if (temporary) {
    temporaryLayoutPreset = {
      id: restoredId(context.createLayoutId, "createLayoutId"),
      name: snapshot.layout.name,
      temporary: true,
      pocketBatchId: snapshot.layout.pocketBatchId,
      chatAppIdGroups: snapshot.groups.map((group) => group.tabs.map((tab) => tab.appId))
    };
  }
  const fullscreenGroupId = snapshot.fullscreenGroupIndex === null
    ? null
    : groups[snapshot.fullscreenGroupIndex]?.id || null;
  return {
    generation: snapshot.generation,
    layout: snapshot.layout,
    activeLayoutPresetId: snapshot.layout.presetId,
    temporaryLayoutPreset,
    groups,
    activeTabs,
    fullscreenGroupId
  };
}
