import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "ComposerImages",
  description: "plugin.ComposerImages.description",
  authors: ["ChatClub"],
  icon: "images",
  tags: ["composer"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Composer"],
  usesExtensionPoints: ["composer.action"],
  managedStyle: style,
  strings,
  app: () => import("./app.js"),
});
