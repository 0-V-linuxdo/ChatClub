import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "SettingsShortcuts",
  description: "plugin.SettingsShortcuts.description",
  authors: ["ChatClub"],
  icon: "settings",
  tags: ["navigation"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["SettingsUI"],
  usesExtensionPoints: ["topbar.item"],
  strings: {
    zh: { "plugin.SettingsShortcuts.description": "为每个设置分区提供一个顶部栏按钮（可在自定义顶部栏里摆放），一键打开对应分区。" },
    en: { "plugin.SettingsShortcuts.description": "Adds a top bar item for each settings section (place them while customizing the top bar) that opens that section in one click." },
  },
  app: () => import("./app.js"),
});
