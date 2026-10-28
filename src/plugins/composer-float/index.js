import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "ComposerFloat",
  description: "plugin.ComposerFloat.description",
  authors: ["ChatClub"],
  icon: "maximize",
  tags: ["composer"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Composer"],
  usesExtensionPoints: ["composer.keyHandler", "appearance.field"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    composerPlacement: {
      optionKey: "composerPlacement",
      type: "select",
      options: [
        { label: "composer.placement.topbar", value: "topbar", default: true },
        { label: "composer.placement.center", value: "center" },
      ],
    },
  }),
  app: () => import("./app.js"),
});
