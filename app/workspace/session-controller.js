import { captureWorkspaceSnapshotV1, restoreWorkspaceSnapshotV1 } from "./session-state.js";
import { frameNewChatPending, markFrameNewChatPending } from "./frame-loading.js";
import { validateControllerContract } from "../controller-contract.js";
import { restorableChatFrameHref } from "../../shared/chat-frame-config.js";
import { createWorkspaceSessionId } from "../../shared/workspace-session.js";
import {
  conversationHrefFromLocation,
  preferredWorkspaceTabHref,
  snapshotWithRetainedConversation,
  workspaceSnapshotHasConversation,
  workspaceSnapshotIsRememberable
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

  function liveFramesByInstanceId() {
    return new Map(Array.from(document.querySelectorAll(".chat-frame"))
      .map((iframe) => [String(iframe.dataset.instanceId || ""), iframe]));
  }

  function currentHrefForWorkspaceTab(chat, framesByInstanceId = null) {
    const instanceId = String(chat?.instanceId || "");
    const iframe = framesByInstanceId?.get(instanceId) || frameForInstance(instanceId);
    const app = appById(chat?.appId);
    const openableFrameUrl = (value) => openableTabUrl(restorableChatFrameHref(app, value));
    // A frame that New Chat is resetting has released its conversation. Its
    // stale src / thread cache must not put that thread into this snapshot.
    if (frameNewChatPending(iframe)) return openableFrameUrl(app?.url);
    return preferredWorkspaceTabHref([
      iframe?.dataset?.currentHref,
      iframe?.dataset?.currentThreadHref,
      chat?.initialHref,
      iframe?.getAttribute?.("src"),
      iframe?.src,
      app?.url
    ].map((value) => openableFrameUrl(value)));
  }

  function captureWorkspaceSession() {
    if (!Array.isArray(state.groups) || !state.groups.length) return null;
    const framesByInstanceId = liveFramesByInstanceId();
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
    if (!snapshot) return snapshot;
    const pending = workspaceSessionStore.save(snapshot).catch(() => false);
    if (workspaceSnapshotIsRememberable(snapshot)) {
      pending.then((ok) => {
        if (ok !== true) return workspaceSessionStore.flush();
      }).catch(() => {});
    }
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

  /**
   * New Chat callers describe each frame they are about to reset. Entries may
   * be plain hrefs, `{ instanceId, href }` records, or the iframe elements
   * themselves; the instance id is what lets the rebound snapshot leave that
   * frame at its app home instead of copying the frozen conversation.
   */
  function leavingFrameEntries(leaving) {
    return (Array.isArray(leaving) ? leaving : []).map((entry) => {
      if (typeof entry === "string") return { instanceId: "", href: entry };
      if (!entry || typeof entry !== "object") return { instanceId: "", href: "" };
      return {
        instanceId: String(entry.instanceId || entry.dataset?.instanceId || ""),
        href: String(entry.href || entry.currentHref || entry.dataset?.currentHref || entry.src || "")
      };
    });
  }

  function leavingConversationHrefs(entries) {
    return entries.map((entry) => entry.href).filter((href) => conversationHrefFromLocation(href));
  }

  function leavingFrameFor(entry, framesByInstanceId) {
    if (entry.instanceId) return framesByInstanceId.get(entry.instanceId) || frameForInstance(entry.instanceId) || null;
    const href = openableTabUrl(entry.href);
    if (!conversationHrefFromLocation(href)) return null;
    for (const iframe of framesByInstanceId.values()) {
      const candidates = [iframe?.dataset?.currentHref, iframe?.dataset?.currentThreadHref, iframe?.src]
        .map((value) => openableTabUrl(value));
      if (candidates.includes(href)) return iframe;
    }
    return null;
  }

  function releaseLeavingFrames(entries) {
    const framesByInstanceId = liveFramesByInstanceId();
    let released = 0;
    for (const entry of entries) {
      if (markFrameNewChatPending(leavingFrameFor(entry, framesByInstanceId))) released += 1;
    }
    return released;
  }

  function snapshotForNewChatPreserve(live) {
    const durable = typeof workspaceSessionStore.durableSnapshot === "function"
      ? workspaceSessionStore.durableSnapshot()
      : null;
    const snapshot = snapshotWithRetainedConversation(durable, live) || live;
    if (!snapshot) return null;
    const durableTitle = String(durable?.topicTitle || "").trim();
    if (!String(snapshot.topicTitle || "").trim() && durableTitle) {
      snapshot.topicTitle = durableTitle;
      snapshot.topicTitleCustom = durable?.topicTitleCustom === true;
    }
    return snapshot;
  }

  async function preserveCurrentWorkspaceForNewChat(leaving = []) {
    const fromWorkspaceId = workspaceSessionStore.workspaceId() || "";
    try {
      const entries = leavingFrameEntries(leaving);
      const snapshot = snapshotForNewChatPreserve(captureWorkspaceSession());
      if (!leavingConversationHrefs(entries).length && !workspaceSnapshotHasConversation(snapshot)) {
        return { preserved: false, workspaceId: fromWorkspaceId };
      }
      if (!workspaceSnapshotHasConversation(snapshot)) {
        return { preserved: false, workspaceId: fromWorkspaceId };
      }
      if (!fromWorkspaceId) return { preserved: false, workspaceId: "" };
      if (!await workspaceSessionStore.save(snapshot)) return { preserved: false, workspaceId: fromWorkspaceId };
      if (!await workspaceSessionStore.flush()) return { preserved: false, workspaceId: fromWorkspaceId };
      const workspaceId = workspaceSessionStore.adopt(createWorkspaceSessionId());
      if (!workspaceId || workspaceId === fromWorkspaceId) return { preserved: false, workspaceId: fromWorkspaceId };
      state.topicTitle = "";
      state.topicTitleCustom = false;
      // The frozen conversation now belongs to fromWorkspaceId only. Mark the
      // leaving frames before anything else can capture, so the first snapshot
      // persisted under the rebound id (and every capture until the home
      // document loads) records those frames at their app home. Otherwise the
      // live pre-navigation DOM would copy the old thread onto the new id and
      // conversation retention would keep it there after a restart.
      releaseLeavingFrames(entries);
      try { await persistWorkspaceSession(); } catch {}
      try { await workspaceSessionStore.flush(); } catch {}
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
