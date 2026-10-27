import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "NetRules",
  description: "plugin.NetRules.description",
  authors: ["ChatClub"],
  icon: "shield",
  tags: ["privacy"],
  required: true,
  hidden: true,
  requiresReload: true,
  permissions: ["declarativeNetRequest"],
  strings: {
    zh: { "plugin.NetRules.description": "网络规则：只对工作区页内的聊天 iframe 去掉禁止嵌入的响应头。" },
    en: { "plugin.NetRules.description": "Network rules: strips frame-blocking headers, only for chat iframes inside workspace pages." },
  },
});
