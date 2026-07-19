import { captureWorkspaceSnapshotV1, restoreWorkspaceSnapshotV1 } from "./session-state.js";
import { validateControllerContract } from "../controller-contract.js";

export function createWorkspaceSessionController(dependencies = {}) {
  const { state, services, registry, layout } = validateControllerContract(dependencies, "Workspace session controller", {
    state: "object",
    services: "object",
    registry: "object",
    layout: "object"
  });
  const {
    appById,
    createFrameId,
    createGroupId,
    createLayoutId,
    openableTabUrl,
    workspaceSessionStore
  } = services;
  for (const method of ["persistentLayoutPresets", "validChatAppIds"]) {
    if (typeof layout[method] !== "function") throw new TypeError(`Workspace session layout port requires ${method}().`);
  }
  if (typeof registry.frameForInstance !== "function") {
    throw new TypeError("Workspace session registry port requires frameForInstance().");
  }
  const { persistentLayoutPresets, validChatAppIds } = layout;
  const { frameForInstance } = registry;
  if (typeof workspaceSessionStore?.save !== "function" || typeof workspaceSessionStore?.generation !== "function") {
    throw new TypeError("Workspace session controller requires workspaceSessionStore.save/generation.");
  }

  function currentHrefForWorkspaceTab(chat, framesByInstanceId = null) {
    const instanceId = String(chat?.instanceId || "");
    const iframe = framesByInstanceId?.get(instanceId) || frameForInstance(instanceId);
    return openableTabUrl(iframe?.dataset?.currentHref)
      || openableTabUrl(chat?.initialHref)
      || openableTabUrl(iframe?.getAttribute?.("src"))
      || openableTabUrl(appById(chat?.appId)?.url);
  }

  function rememberWorkspaceSession() {
    if (!Array.isArray(state.groups) || !state.groups.length) return null;
    const framesByInstanceId = new Map(Array.from(document.querySelectorAll(".chat-frame"))
      .map((iframe) => [String(iframe.dataset.instanceId || ""), iframe]));
    const snapshot = captureWorkspaceSnapshotV1({
      generation: workspaceSessionStore.generation(),
      options: state.options,
      temporaryLayoutPreset: state.temporaryLayoutPreset,
      groups: state.groups,
      activeTabs: state.activeTabs,
      fullscreenGroupId: state.fullscreenGroupId,
      currentHrefForTab: (chat) => currentHrefForWorkspaceTab(chat, framesByInstanceId)
    });
    workspaceSessionStore.save(snapshot).catch(() => {});
    return snapshot;
  }

  function restoreWorkspaceSession(snapshot) {
    if (!snapshot) return false;
    const presets = persistentLayoutPresets();
    const restored = restoreWorkspaceSnapshotV1(snapshot, {
      validAppIds: validChatAppIds(),
      validPresetIds: new Set(presets.map((preset) => preset.id)),
      fallbackPresetId: state.options?.activeLayoutPresetId || presets[0]?.id || "default",
      createGroupId,
      createFrameId,
      createLayoutId
    });
    if (!restored) return false;
    state.options = {
      ...state.options,
      activeLayoutPresetId: restored.activeLayoutPresetId || state.options.activeLayoutPresetId
    };
    state.temporaryLayoutPreset = restored.temporaryLayoutPreset;
    state.groups = restored.groups;
    state.activeTabs = restored.activeTabs;
    state.fullscreenGroupId = restored.fullscreenGroupId;
    return true;
  }

  return Object.freeze({ rememberWorkspaceSession, restoreWorkspaceSession });
}
