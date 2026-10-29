import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "PluginsUI",
  description: "plugin.PluginsUI.description",
  authors: ["ChatClub"],
  icon: "plug",
  tags: ["developer"],
  required: true,
  startAt: "domReady",
  dependencies: ["SettingsUI"],
  provides: ["plugins.toolbar", "plugins.cardAction"],
  usesExtensionPoints: ["settings.section"],
  managedStyle: style,
  strings,
  app: () => import("./app.js"),
});
