import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "Sites",
  description: "plugin.Sites.description",
  authors: ["ChatClub"],
  icon: "globe",
  tags: ["sites"],
  required: true,
  hidden: true,
  startAt: "init",
  provides: ["site.adapter"],
  strings: {
    zh: { "plugin.Sites.description": "站点适配注册表：各站点插件在这里登记 Summary、消息导航、删除话题、首选模型等适配数据。" },
    en: { "plugin.Sites.description": "Site adapter registry: site plugins register their Summary, navigator, topic-delete and model data here." },
  },
  app: () => import("./app.js"),
});
