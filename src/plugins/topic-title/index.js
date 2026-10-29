import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";

export default definePlugin({
  name: "TopicTitle",
  description: "plugin.TopicTitle.description",
  authors: ["ChatClub"],
  icon: "edit",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Workspace", "FrameBridge"],
  softDependencies: ["ApiProfiles"],
  usesExtensionPoints: ["apiConsumer"],
  settings: definePluginSettings({
    topicTitleApiProfileId: { optionKey: "topicTitleApiProfileId", type: "custom", default: "default-openai" },
    topicTitleApiModel: { optionKey: "topicTitleApiModel", type: "custom", default: "" },
  }),
  strings: {
    zh: {
      "plugin.TopicTitle.description": "桌面自动命名：第一次发送的提示词（可用 API 生成短标题）或打开的对话标题。",
      "topicTitle.consumer": "话题标题",
    },
    en: {
      "plugin.TopicTitle.description": "Automatic workspace names: from the first prompt sent (optionally a short API-generated title) or from the open conversation.",
      "topicTitle.consumer": "Topic title",
    },
  },
  app: () => import("./app.js"),
});
