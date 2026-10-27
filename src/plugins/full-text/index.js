import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";

export default definePlugin({
  name: "FullTextRecorder",
  description: "plugin.FullTextRecorder.description",
  authors: ["ChatClub"],
  icon: "fileText",
  tags: ["capture", "data"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Summary", "Workspace"],
  settings: definePluginSettings({
    recordFullText: { optionKey: "recordFullText", type: "boolean", description: "fullText.setting.desc", default: false },
  }),
  strings: {
    zh: {
      "plugin.FullTextRecorder.description": "记录全文：在后台用站点自己的复制按钮记下各标签的对话正文，供标签搜索、发送历史和收藏使用；对话没变化时绝不复制。",
      "fullText.setting.desc": "保存提取出的对话正文，以便在 ChatClub 标签页里搜索消息。",
    },
    en: {
      "plugin.FullTextRecorder.description": "Full-text recording: copies each tab's conversation in the background with the site's own copy button, for tab search, send history and Pocket; never copies when nothing changed.",
      "fullText.setting.desc": "Keep the extracted conversation text so messages can be searched in ChatClub tabs.",
    },
  },
  app: () => import("./app.js"),
});
