import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";

export default definePlugin({
  name: "Apps",
  description: "plugin.Apps.description",
  authors: ["ChatClub"],
  icon: "apps",
  tags: ["sites"],
  required: true,
  startAt: "init",
  provides: ["chatApp"],
  // Custom platforms live in their own storage key (v2 07 §1.4).
  storageKeys: ["customConfig"],
  settings: definePluginSettings({
    builtinChatAppOrder: { optionKey: "builtinChatAppOrder", type: "custom", default: [] },
    builtinChatAppIframeConfigs: { optionKey: "builtinChatAppIframeConfigs", type: "custom", default: {} },
    appIcons: { optionKey: "appIcons", type: "custom", default: {} },
    iframePermissionsSource: { optionKey: "iframePermissionsSource", type: "custom", default: "builtIn" },
  }),
  strings: {
    zh: { "plugin.Apps.description": "平台注册表：内置聊天站点与自定义平台、iframe 权限、应用图标。", "apps.transfer": "自定义平台" },
    en: { "plugin.Apps.description": "Platform registry: built-in chat sites, custom platforms, iframe permissions and app icons.", "apps.transfer": "Custom platforms" },
  },
  app: () => import("./app.js"),
});
