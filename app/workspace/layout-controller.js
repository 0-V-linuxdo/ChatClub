import { t } from "../../shared/i18n.js";
import { getAllChatApps } from "../../shared/storage-schema.js";
import {
  diffEffectiveCustomAppCatalog,
  hydrateWorkspaceGroups,
  importedWorkspaceLayoutNeedsHydration,
  layoutGroupsFromWorkspace,
  normalizeWorkspaceLayoutGroups,
  reconcileWorkspaceAppCatalog
} from "./model.js";
import { validateControllerContract } from "../controller-contract.js";

function requireMethods(port, label, methods) {
  for (const method of methods) {
    if (typeof port?.[method] !== "function") throw new TypeError(`Workspace layout ${label} port requires ${method}().`);
  }
}

export function createWorkspaceLayoutController(dependencies = {}) {
  const { state, services, session, view } = validateControllerContract(
    dependencies,
    "Workspace layout controller",
    { state: "object", services: "object", session: "object", view: "object" }
  );
  const {
    allApps,
    appById,
    createFrameId,
    createGroupId,
    createLayoutId,
    formatShortcut,
    inferAppName,
    normalizeOptions,
    notify,
    render,
    saveOptions
  } = services;
  requireMethods(session, "session", ["rememberWorkspaceSession", "restoreWorkspaceSession"]);
  requireMethods(view, "view", [
    "appendChatGroup",
    "closePopovers",
    "reconcileAppCatalogDom",
    "refreshChatTabPresentations",
    "syncWorkspaceDom"
  ]);
  const { rememberWorkspaceSession, restoreWorkspaceSession } = session;
  const {
    appendChatGroup,
    closePopovers,
    reconcileAppCatalogDom,
    refreshChatTabPresentations,
    syncWorkspaceDom
  } = view;

  function activePreset() {
    const temporary = activeTemporaryLayoutPreset();
    if (temporary) return temporary;
    const presets = persistentLayoutPresets();
    return presets.find((preset) => preset.id === state.options.activeLayoutPresetId) || presets[0];
  }

  function activeTemporaryLayoutPreset() {
    const preset = state.temporaryLayoutPreset;
    return preset?.id && preset.temporary ? preset : null;
  }

  function temporaryLayoutIsActive() {
    return Boolean(activeTemporaryLayoutPreset());
  }

  function persistentLayoutPresets(options = state.options) {
    return (Array.isArray(options?.layoutPresets) ? options.layoutPresets : []).filter((preset) => !preset?.temporary);
  }

  function persistentLayoutOptions(options = state.options) {
    const layoutPresets = persistentLayoutPresets(options);
    const activeLayoutPresetId = layoutPresets.some((preset) => preset.id === options?.activeLayoutPresetId)
      ? options.activeLayoutPresetId
      : layoutPresets[0]?.id || "default";
    return { ...options, layoutPresets, activeLayoutPresetId };
  }

  function validChatAppIds() {
    return new Set(allApps().map((app) => app.id));
  }

  function normalizeLayoutGroups(groups) {
    return normalizeWorkspaceLayoutGroups(groups, validChatAppIds());
  }

  function currentLayoutGroups({ includeTemporary = false } = {}) {
    const groups = includeTemporary
      ? state.groups || []
      : (state.groups || []).filter((group) => !group.temporary);
    return layoutGroupsFromWorkspace(groups, validChatAppIds());
  }

  function preferredLayoutGroupsForLocale() {
    const language = state.options?.language && state.options.language !== "system"
      ? state.options.language
      : navigator.language || "";
    const preferred = /^zh/i.test(language)
      ? [["Kimi"], ["DouBao"], ["Qwen"]]
      : [["ChatGPT"], ["Gemini"], ["Grok"]];
    const normalized = normalizeLayoutGroups(preferred);
    if (normalized.length) return normalized;
    return normalizeLayoutGroups(allApps().slice(0, 3).map((app) => [app.id]));
  }

  function layoutPresetGroups(preset) {
    return normalizeLayoutGroups(preset?.chatAppIdGroups);
  }

  function layoutPresetSummary(preset) {
    const groups = layoutPresetGroups(preset);
    if (!groups.length) return preset?.name || t("layout.empty");
    return groups
      .map((group) => group.map((id) => inferAppName(appById(id))).join(", "))
      .join(" / ");
  }

  function layoutShortcutLabel(index) {
    if (index < 0 || index > 8) return "";
    const label = formatShortcut("switchLayout", String(index + 1));
    return label === "Disabled" || label === "Unassigned" ? "" : label;
  }

  function shortcutLabel(action, digitLabel = "") {
    const label = formatShortcut(action, digitLabel);
    return label === "Disabled" || label === "Unassigned" ? "" : label;
  }

  function shortcutTooltip(label, action, digitLabel = "") {
    const shortcut = shortcutLabel(action, digitLabel);
    return shortcut ? `${label} (${shortcut})` : label;
  }

  async function saveLayoutOptions(nextOptions) {
    state.options = await saveOptions(normalizeOptions(persistentLayoutOptions(nextOptions)));
  }

  async function switchLayoutPreset(presetId) {
    if (activeTemporaryLayoutPreset()?.id === presetId) {
      closePopovers();
      return;
    }
    const preset = persistentLayoutPresets().find((item) => item.id === presetId);
    if (!preset) {
      closePopovers();
      notify(t("toast.layoutNotFound"), "error");
      return;
    }
    if (!temporaryLayoutIsActive() && preset.id === state.options.activeLayoutPresetId) {
      closePopovers();
      return;
    }
    state.temporaryLayoutPreset = null;
    await saveLayoutOptions({ ...state.options, activeLayoutPresetId: preset.id });
    hydrateGroups();
    closePopovers();
    render();
  }

  async function addLayoutPreset() {
    const chatAppIdGroups = preferredLayoutGroupsForLocale();
    if (!chatAppIdGroups.length) {
      closePopovers();
      notify(t("layout.noApps"), "error");
      return;
    }
    const layoutPresets = persistentLayoutPresets();
    const preset = {
      id: createLayoutId(),
      name: `Layout ${layoutPresets.length + 1}`,
      chatAppIdGroups
    };
    state.temporaryLayoutPreset = null;
    await saveLayoutOptions({
      ...state.options,
      layoutPresets: [...layoutPresets, preset],
      activeLayoutPresetId: preset.id
    });
    hydrateGroups();
    closePopovers();
    render();
  }

  async function deleteLayoutPreset(presetId) {
    if (activeTemporaryLayoutPreset()?.id === presetId) {
      state.temporaryLayoutPreset = null;
      hydrateGroups();
      closePopovers();
      render();
      return;
    }
    const layoutPresets = persistentLayoutPresets();
    if (layoutPresets.length <= 1) return;
    const remaining = layoutPresets.filter((preset) => preset.id !== presetId);
    const wasActive = state.options.activeLayoutPresetId === presetId;
    const activeLayoutPresetId = wasActive ? remaining[0]?.id : state.options.activeLayoutPresetId;
    await saveLayoutOptions({ ...state.options, layoutPresets: remaining, activeLayoutPresetId });
    closePopovers();
    if (wasActive && !temporaryLayoutIsActive()) {
      hydrateGroups();
      render();
    }
  }

  function hydrateGroups(snapshot = null) {
    if (restoreWorkspaceSession(snapshot)) {
      rememberWorkspaceSession();
      return true;
    }
    const preset = activePreset();
    const apps = allApps();
    const workspace = hydrateWorkspaceGroups({
      presetGroups: preset?.chatAppIdGroups,
      apps,
      createGroupId,
      createFrameId,
      fallbackGroups: [["ChatGPT"], ["Gemini"], ["Grok"]]
    });
    if (temporaryLayoutIsActive()) {
      for (const group of workspace.groups) {
        group.temporary = true;
        group.pocketBatchId = preset.pocketBatchId || "";
      }
    }
    state.groups = workspace.groups;
    state.activeTabs = workspace.activeTabs;
    state.fullscreenGroupId = null;
    rememberWorkspaceSession();
    return false;
  }

  function activeLayoutGroupsForOptions(options = state.options, customConfig = state.customConfig) {
    const presets = persistentLayoutPresets(options);
    const active = presets.find((preset) => preset.id === options?.activeLayoutPresetId) || presets[0];
    const validIds = new Set(getAllChatApps(customConfig, options?.builtinChatAppOrder).map((app) => app.id));
    return normalizeWorkspaceLayoutGroups(active?.chatAppIdGroups, validIds);
  }

  function hydrateImportedLayoutIfNeeded(previousOptions = {}, previousCustomConfig = state.customConfig) {
    const targetGroups = activeLayoutGroupsForOptions(state.options);
    const currentGroups = currentLayoutGroups();
    if (!importedWorkspaceLayoutNeedsHydration({
      temporary: temporaryLayoutIsActive(),
      previousTargetGroups: activeLayoutGroupsForOptions(previousOptions, previousCustomConfig),
      nextTargetGroups: targetGroups,
      currentGroups
    })) {
      rememberWorkspaceSession();
      return false;
    }
    hydrateGroups();
    return true;
  }

  async function reconcileAppCatalog(previousCustomConfig = []) {
    const { affectedAppIds, sourceChangedAppIds } = diffEffectiveCustomAppCatalog(previousCustomConfig, state.customConfig);
    const validAppIds = validChatAppIds();
    const result = reconcileWorkspaceAppCatalog({
      groups: state.groups,
      activeTabs: state.activeTabs,
      validAppIds,
      fallbackAppId: allApps()[0]?.id || "",
      createGroupId,
      createFrameId
    });

    if (result.changed) {
      const previousActiveTabs = state.activeTabs;
      state.groups = result.groups;
      state.activeTabs = result.activeTabs;
      const liveInstanceIds = new Set(result.groups.flatMap((group) =>
        (group.chatApps || []).map((chat) => chat.instanceId)
      ));
      state.frameLoadingInstanceIds = (state.frameLoadingInstanceIds || [])
        .filter((instanceId) => liveInstanceIds.has(instanceId));
      if (!result.groups.some((group) => group.id === state.fullscreenGroupId)) {
        state.fullscreenGroupId = null;
      }
      reconcileAppCatalogDom(result, affectedAppIds, sourceChangedAppIds, previousActiveTabs);
      await persistLayout();
    } else {
      refreshChatTabPresentations(affectedAppIds, sourceChangedAppIds);
      syncWorkspaceDom();
      // A targeted frame replacement can happen without changing workspace
      // membership. Persist the new app URL immediately so a reload before the
      // frame's first location report cannot restore the old URL under the new
      // sandbox contract.
      rememberWorkspaceSession();
    }
    return result;
  }

  async function persistLayout() {
    const temporary = activeTemporaryLayoutPreset();
    if (temporary) {
      state.temporaryLayoutPreset = {
        ...temporary,
        chatAppIdGroups: currentLayoutGroups({ includeTemporary: true })
      };
      rememberWorkspaceSession();
      return;
    }
    const preset = activePreset();
    if (!preset) return;
    const chatAppIdGroups = currentLayoutGroups();
    rememberWorkspaceSession();
    const next = {
      ...state.options,
      layoutPresets: persistentLayoutPresets().map((item) => item.id === preset.id
        ? { ...item, chatAppIdGroups }
        : item)
    };
    state.options = await saveOptions(next);
    rememberWorkspaceSession();
  }

  async function addGroup(appId = allApps()[0]?.id) {
    if (!appId) return;
    const temporary = activeTemporaryLayoutPreset();
    const group = {
      id: createGroupId(),
      ...(temporary ? { temporary: true, pocketBatchId: temporary.pocketBatchId || "" } : {}),
      chatApps: [{ appId, instanceId: createFrameId() }]
    };
    state.groups.push(group);
    state.activeTabs[group.id] = group.chatApps[0].instanceId;
    await persistLayout();
    appendChatGroup(group);
  }

  async function addAppToGroup(groupId, appId) {
    const group = state.groups.find((candidate) => candidate.id === groupId);
    if (!group || !appId) return null;
    const instanceId = createFrameId();
    group.chatApps.push({ appId, instanceId });
    state.activeTabs[group.id] = instanceId;
    await persistLayout();
    return Object.freeze({ groupId: group.id, appId, instanceId });
  }

  return Object.freeze({
    activeLayoutGroupsForOptions,
    activePreset,
    activeTemporaryLayoutPreset,
    addAppToGroup,
    addGroup,
    addLayoutPreset,
    currentLayoutGroups,
    deleteLayoutPreset,
    hydrateGroups,
    hydrateImportedLayoutIfNeeded,
    layoutPresetGroups,
    layoutPresetSummary,
    layoutShortcutLabel,
    normalizeLayoutGroups,
    persistLayout,
    persistentLayoutOptions,
    persistentLayoutPresets,
    preferredLayoutGroupsForLocale,
    reconcileAppCatalog,
    shortcutLabel,
    shortcutTooltip,
    switchLayoutPreset,
    temporaryLayoutIsActive,
    validChatAppIds
  });
}
