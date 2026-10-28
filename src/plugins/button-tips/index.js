import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "ButtonTips",
  description: "plugin.ButtonTips.description",
  authors: ["ChatClub"],
  icon: "help",
  tags: ["appearance"],
  enabledByDefault: true,
  startAt: "init",
  usesExtensionPoints: ["appearance.group"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    tooltipDisabledIds: { optionKey: "tooltipDisabledIds", type: "custom", default: [] },
  }),
  app: () => import("./app.js"),
});
