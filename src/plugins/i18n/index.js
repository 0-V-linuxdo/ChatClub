import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";

export default definePlugin({
  name: "I18n",
  description: "plugin.I18n.description",
  authors: ["ChatClub"],
  required: true,
  hidden: true,
  startAt: "init",
  settings: definePluginSettings({
    language: {
      optionKey: "language",
      type: "select",
      description: "i18n.language.description",
      options: [
        { label: "i18n.language.system", value: "system", default: true },
        { label: "i18n.language.zh_CN", value: "zh_CN" },
        { label: "i18n.language.en", value: "en" },
      ],
    },
  }),
  usesExtensionPoints: ["appearance.field"],
  strings: {
    zh: {
      "plugin.I18n.description": "界面语言与翻译。",
      "appearance.language": "语言",
      "i18n.language.description": "跟随浏览器时，浏览器语言以 zh 开头用中文，否则英文。",
      "i18n.language.system": "跟随浏览器",
      "i18n.language.zh_CN": "中文",
      "i18n.language.en": "English",
      "plugin.Settings.description": "插件系统元数据。",
    },
    en: {
      "plugin.I18n.description": "Interface language and translations.",
      "appearance.language": "Language",
      "i18n.language.description": "When following the browser, Chinese is used if the browser language starts with zh; otherwise English.",
      "i18n.language.system": "Follow browser",
      "i18n.language.zh_CN": "中文",
      "i18n.language.en": "English",
      "plugin.Settings.description": "Plugin system metadata.",
    },
  },
  app: () => import("./app.js"),
});
