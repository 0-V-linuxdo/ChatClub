import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "SettingsUI",
  description: "plugin.SettingsUI.description",
  authors: ["ChatClub"],
  icon: "settings",
  tags: ["appearance"],
  shortcutActions: [{ id: "openSettings", labelKey: "settings.open" }],
  required: true,
  startAt: "domReady",
  dependencies: ["AppShell"],
  provides: ["settings.section", "settings.navLayout"],
  usesExtensionPoints: ["topbar.item", "shortcut.action"],
  managedStyle: style,
  strings,
  app: () => import("./app.js"),
});
