import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "NewChat",
  description: "plugin.NewChat.description",
  authors: ["ChatClub"],
  icon: "squarePen",
  tags: ["chats"],
  enabledByDefault: true,
  requiresReload: true,
  startAt: "domReady",
  dependencies: ["Workspace", "Composer", "FrameBridge"],
  usesExtensionPoints: ["tabGroup.button", "topbar.item", "shortcut.action"],
  shortcutActions: [{ id: "newChat", labelKey: "newChat.shortcut.one" }, { id: "newChatAll", labelKey: "newChat.shortcut.all" }],
  strings: {
    zh: {
      "plugin.NewChat.description": "新建对话：单列或全部列回到首页开始新会话；工作区里有对话时先把它留作记忆，再换新的工作区 id。",
      "newChat.group": "新建对话",
      "newChat.all": "全部新建对话",
      "newChat.shortcut.one": "当前列新建对话",
      "newChat.shortcut.all": "全部新建对话",
    },
    en: {
      "plugin.NewChat.description": "New chat: one column or all columns return home and start fresh; a workspace that holds conversations is kept as a memory first and the page moves to a new workspace id.",
      "newChat.group": "New chat",
      "newChat.all": "New chat in all columns",
      "newChat.shortcut.one": "New chat in current column",
      "newChat.shortcut.all": "New chat in all columns",
    },
  },
  app: () => import("./app.js"),
});
