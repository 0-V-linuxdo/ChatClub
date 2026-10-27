// NewChat: single-column and all-columns new chat, keeping the old conversation as a memory (v2 02 §9).

import { isGenericTitle } from "../../lib/titles.js";

const PREPROCESS_TIMEOUT_MS = 1500;

/** Whether the workspace holds anything worth keeping before a new chat replaces it (02 §9.1). */
export function hasConversation(groups, topicTitle, isNewTopic) {
  if (!isGenericTitle(topicTitle)) return true;
  const isHttp = (href) => /^https?:\/\//i.test(String(href || ""));
  return groups.some((g) => g.tabs.some((tab) => !tab.pendingNewChat && isHttp(tab.href) && !isNewTopic(tab.appId, tab.href)));
}

export default {
  start(ctx) {
    const workspace = ctx.services.get("workspace");
    if (!workspace) return;
    const transport = ctx.services.get("frames.transport");
    const frames = ctx.services.get("frames");
    const session = () => ctx.services.get("workspaceSession");
    let running = null;

    const preprocess = (tab) => {
      if (!tab?.frameKey || !frames.isRegistered(tab.frameKey)) return Promise.resolve();
      return transport
        .send(tab.frameKey, { capability: "send", command: "newChatPreprocess", payload: { appId: tab.appId } }, { timeoutMs: PREPROCESS_TIMEOUT_MS })
        .catch(() => {});
    };

    /** Saves the current workspace under its id, then moves the page to a fresh id. Returns true on switch. */
    const keepOldWorkspace = async () => {
      const store = session();
      if (!store) return false;
      const topic = workspace.getTopic();
      if (!hasConversation(workspace.groups(), topic.title, workspace.isNewTopicUrl)) return false;
      const oldId = workspace.workspaceId();
      try {
        await store.saveNow(oldId);
      } catch (error) {
        ctx.logger.warn("Keeping the old conversation failed; starting the new chat in place:", error?.message || error);
        return false;
      }
      if (workspace.workspaceId() !== oldId) return false;
      const ok = workspace.setWorkspaceId(workspace.newWorkspaceId());
      if (ok === false) return false;
      workspace.setTopic({ title: "", custom: false });
      return true;
    };

    const newChat = async (groupIds) => {
      if (running) return running;
      running = (async () => {
        const groups = workspace.groups().filter((g) => groupIds.includes(g.id));
        const tabs = groups.map((g) => g.tabs[g.activeIndex]).filter(Boolean);
        if (!tabs.length) return;
        await Promise.all(tabs.map(preprocess));
        const switched = await keepOldWorkspace();
        for (const tab of tabs) workspace.homeTab(tab.id, { pendingNewChat: true });
        ctx.events.emit("NewChat:started", { groupIds, tabIds: tabs.map((t) => t.id), switchedWorkspace: switched });
        if (switched) session()?.saveNow().catch(() => {});
      })().finally(() => {
        running = null;
      });
      return running;
    };
    const allGroupIds = () => workspace.groups().map((g) => g.id);

    ctx.contribute("tabGroup.button", {
      id: "newChat",
      icon: "edit",
      labelKey: "newChat.group",
      tipId: "workspace.group.newChat",
      defaultPlacement: "pinned",
      shortcutAction: "newChat",
      order: 25,
      onClick: (g) => newChat([g.groupId]),
    });
    ctx.contribute("topbar.item", {
      id: "newChat",
      variant: "action",
      labelKey: "newChat.all",
      icon: "squarePen",
      tipId: "topbar.newChat",
      shortcutAction: "newChatAll",
      onClick: () => newChat(allGroupIds()),
    });
    ctx.contribute("shortcut.action", {
      id: "newChat",
      labelKey: "newChat.shortcut.one",
      run: (_match, source) => {
        const group = workspace.currentGroup(source);
        if (group) newChat([group.id]);
      },
    });
    ctx.contribute("shortcut.action", { id: "newChatAll", labelKey: "newChat.shortcut.all", run: () => newChat(allGroupIds()) });

    ctx.services.provide("newChat", { start: newChat, all: () => newChat(allGroupIds()), hasConversation: () => hasConversation(workspace.groups(), workspace.getTopic().title, workspace.isNewTopicUrl) });
  },
};
