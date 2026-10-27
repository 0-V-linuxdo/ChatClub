import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "TrustedInput",
  description: "plugin.TrustedInput.description",
  authors: ["ChatClub"],
  icon: "shield",
  tags: ["sites"],
  enabledByDefault: true,
  startAt: "init",
  dependencies: ["Workspace"],
  requires: ["debugger"],
  strings: {
    zh: { "plugin.TrustedInput.description": "可信输入：站点忽略合成事件时，在用户发起的操作里用浏览器调试接口向聊天 iframe 发真实的点击和按键（仅 Chromium）。" },
    en: { "plugin.TrustedInput.description": "Trusted input: when a site ignores synthetic events, user-started actions send real clicks and keys into the chat iframe through the browser debugger API (Chromium only)." },
  },
  app: () => import("./app.js"),
});
