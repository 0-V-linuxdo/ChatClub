import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";

/** Official links (06 §13). 2.0 fills in its own; an empty url shows "to be announced". */
export const LINKS = [
  { id: "telegram", titleKey: "about.telegram", descKey: "about.telegram.desc", url: "https://t.me/chatclub_extension" },
  { id: "github", titleKey: "about.github", descKey: "about.github.desc", url: "https://github.com/0-V-linuxdo/ChatClub" },
];

export default definePlugin({
  name: "About",
  description: "plugin.About.description",
  authors: ["ChatClub"],
  icon: "info",
  tags: ["data"],
  enabledByDefault: true,
  startAt: "init",
  usesExtensionPoints: ["settings.section"],
  managedStyle: style,
  strings: {
    zh: {
      "plugin.About.description": "关于：版本号和官方链接。",
      "about.section.title": "关于",
      "about.section.desc": "版本与官方链接。",
      "about.pitch": "多 AI 聊天工作台：一次发送、对比回答、总结、管理提示词。",
      "about.version": "版本",
      "about.links": "官方链接",
      "about.telegram": "Telegram 频道",
      "about.telegram.desc": "产品更新、技巧、公告",
      "about.github": "GitHub 仓库",
      "about.github.desc": "源码、发布、反馈",
      "about.open": "打开",
      "about.linkPending": "待公布",
    },
    en: {
      "plugin.About.description": "About: version and official links.",
      "about.section.title": "About",
      "about.section.desc": "Version and official links.",
      "about.pitch": "A multi-AI chat workbench: send once, compare answers, summarize, manage prompts.",
      "about.version": "Version",
      "about.links": "Official links",
      "about.telegram": "Telegram channel",
      "about.telegram.desc": "Product updates, tips, announcements",
      "about.github": "GitHub repository",
      "about.github.desc": "Source, releases, feedback",
      "about.open": "Open",
      "about.linkPending": "To be announced",
    },
  },
  app: () => import("./app.js"),
});
