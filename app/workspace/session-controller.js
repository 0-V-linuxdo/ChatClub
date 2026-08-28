import { captureWorkspaceSnapshotV1, restoreWorkspaceSnapshotV1 } from "./session-state.js";
import { validateControllerContract } from "../controller-contract.js";
import { restorableChatFrameHref } from "../../shared/chat-frame-config.js";
import { createWorkspaceSessionId } from "../../shared/workspace-session.js";
import {
  conversationHrefFromLocation,
  workspaceSnapshotHasConversation
} from "../../shared/workspace-tab-memory.js";

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
  if (
    typeof workspaceSessionStore?.save !== "function"
    || typeof workspaceSessionStore?.generation !== "function"
    || typeof workspaceSessionStore?.flush !== "function"
    || typeof workspaceSessionStore?.adopt !== "function"
    || typeof workspaceSessionStore?.workspaceId !== "function"
  ) {
    throw new TypeError("Workspace session controller requires workspaceSessionStore.save/generation/flush/adopt/workspaceId.");
  }

  function currentHrefForWorkspaceTab(chat, framesByInstanceId = null) {
    const instanceId = String(chat?.instanceId || "");
    const iframe = framesByInstanceId?.get(instanceId) || frameForInstance(instanceId);
    const app = appById(chat?.appId);
    const openableFrameUrl = (value) => openableTabUrl(restorableChatFrameHref(app, value));
    return openableFrameUrl(iframe?.dataset?.currentHref)
      || openableFrameUrl(chat?.initialHref)
      || openableFrameUrl(iframe?.getAttribute?.("src"))
      || openableFrameUrl(appById(chat?.appId)?.url);
  }

  function captureWorkspaceSession() {
    if (!Array.isArray(state.groups) || !state.groups.length) return null;
    const framesByInstanceId = new Map(Array.from(document.querySelectorAll(".chat-frame"))
      .map((iframe) => [String(iframe.dataset.instanceId || ""), iframe]));
    return captureWorkspaceSnapshotV1({
      generation: workspaceSessionStore.generation(),
      options: state.options,
      temporaryLayoutPreset: state.temporaryLayoutPreset,
      groups: state.groups,
      activeTabs: state.activeTabs,
      fullscreenGroupId: state.fullscreenGroupId,
      topicTitle: state.topicTitle,
      topicTitleCustom: state.topicTitleCustom,
      currentHrefForTab: (chat) => currentHrefForWorkspaceTab(chat, framesByInstanceId)
    });
  }

  function rememberWorkspaceSession() {
    const snapshot = captureWorkspaceSession();
    if (snapshot) workspaceSessionStore.save(snapshot).catch(() => {});
    return snapshot;
  }

  async function persistWorkspaceSession() {
    const snapshot = captureWorkspaceSession();
    return snapshot ? workspaceSessionStore.save(snapshot) : null;
  }

  function restoreWorkspaceSession(snapshot) {
    if (!snapshot) return false;
    const presets = persistentLayoutPresets();
    const restored = restoreWorkspaceSnapshotV1(snapshot, {
      validAppIds: validChatAppIds(),
      fallbackPresetId: state.options?.activeLayoutPresetId || presets[0]?.id || "default",
      normalizeCurrentHref: (appId, href) => restorableChatFrameHref(appById(appId), href),
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
    state.topicTitle = restored.topicTitle || "";
    state.topicTitleCustom = restored.topicTitleCustom === true;
    return true;
  }

  function leavingConversationHrefs(hrefs) {
    return (Array.isArray(hrefs) ? hrefs : []).filter((href) => conversationHrefFromLocation(href));
  }

  async function preserveCurrentWorkspaceForNewChat(hrefs = []) {
    const fromWorkspaceId = workspaceSessionStore.workspaceId() || "";
    try {
      if (!leavingConversationHrefs(hrefs).length) return { preserved: false, workspaceId: fromWorkspaceId };
      const snapshot = captureWorkspaceSession();
      if (!workspaceSnapshotHasConversation(snapshot)) return { preserved: false, workspaceId: fromWorkspaceId };
      if (!fromWorkspaceId) return { preserved: false, workspaceId: "" };
      await persistWorkspaceSession();
      if (!await workspaceSessionStore.flush()) return { preserved: false, workspaceId: fromWorkspaceId };
      const workspaceId = workspaceSessionStore.adopt(createWorkspaceSessionId());
      if (!workspaceId || workspaceId === fromWorkspaceId) return { preserved: false, workspaceId: fromWorkspaceId };
      state.topicTitle = "";
      state.topicTitleCustom = false;
      return { preserved: true, fromWorkspaceId, workspaceId };
    } catch {
      return { preserved: false, workspaceId: fromWorkspaceId };
    }
  }

  return Object.freeze({
    captureWorkspaceSession,
    rememberWorkspaceSession,
    persistWorkspaceSession,
    preserveCurrentWorkspaceForNewChat,
    restoreWorkspaceSession
  });
}
