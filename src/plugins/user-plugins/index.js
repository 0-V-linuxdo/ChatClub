import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "UserPlugins",
  description: "plugin.UserPlugins.description",
  authors: ["ChatClub"],
  icon: "plug",
  tags: ["developer"],
  enabledByDefault: true,
  startAt: "init",
  usesExtensionPoints: ["plugins.toolbar", "plugins.cardAction"],
  managedStyle: style,
  strings,
  app: () => import("./app.js"),
});
