import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "WorkspaceSession",
  description: "plugin.WorkspaceSession.description",
  authors: ["ChatClub"],
  icon: "history",
  tags: ["workspace"],
  enabledByDefault: true,
  requiresReload: true,
  startAt: "domReady",
  dependencies: ["Workspace"],
  usesExtensionPoints: ["workspace.contentProvider", "dataTransfer"],
  strings: {
    zh: {
      "session.transfer": "ChatClub 标签页",
      "plugin.WorkspaceSession.description": "工作区记忆：刷新、重启浏览器后恢复分组、标签、对话地址、全屏和话题标题；关掉的工作区留作记忆。",
      "session.runtime.title": "ChatClub 正在重新建立运行时",
      "session.runtime.reload": "重新加载 ChatClub",
    },
    en: {
      "session.transfer": "ChatClub tabs",
      "plugin.WorkspaceSession.description": "Workspace memory: restores groups, tabs, conversation addresses, full screen and topic title after a refresh or browser restart; closed workspaces stay as memories.",
      "session.runtime.title": "ChatClub is re-establishing its runtime",
      "session.runtime.reload": "Reload ChatClub",
    },
  },
  app: () => import("./app.js"),
});
