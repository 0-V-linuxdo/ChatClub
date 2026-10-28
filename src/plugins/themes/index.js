import { definePlugin } from "../../kernel/define.js";
import strings from "./strings.js";

export default definePlugin({
  name: "Themes",
  description: "plugin.Themes.description",
  authors: ["ChatClub"],
  icon: "palette",
  tags: ["appearance"],
  enabledByDefault: true,
  startAt: "init",
  usesExtensionPoints: ["settings.section"],
  strings,
  app: () => import("./app.js"),
});
