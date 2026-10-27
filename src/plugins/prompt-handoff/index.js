import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "PromptHandoff",
  description: "plugin.PromptHandoff.description",
  authors: ["ChatClub"],
  icon: "send",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Composer", "WorkspaceSession", "Workspace"],
  usesExtensionPoints: ["workspace.contentProvider"],
  strings: {
    zh: {
      "plugin.PromptHandoff.description": "带草稿新开工作区：新标签页每列放源页面活动标签的应用，自动发送草稿；新页面接受发送后源草稿才清空。",
      "handoff.layoutName": "Prompt",
      "handoff.failed": "新标签页没能发送草稿，草稿已保留",
      "handoff.openFailed": "无法打开新的工作区标签页",
    },
    en: {
      "plugin.PromptHandoff.description": "Open a new workspace with the draft: each column holds the app of the source column's active tab and the draft is sent automatically; the source draft clears only once the new page accepted it.",
      "handoff.layoutName": "Prompt",
      "handoff.failed": "The new tab couldn't send the draft; the draft was kept",
      "handoff.openFailed": "Couldn't open a new workspace tab",
    },
  },
  app: () => import("./app.js"),
});
