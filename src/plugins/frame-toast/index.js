import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "FrameToast",
  description: "plugin.FrameToast.description",
  authors: ["ChatClub"],
  icon: "messageSquare",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Workspace"],
  usesExtensionPoints: ["appearance.group"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    frameToastPosition: { optionKey: "frameToastPosition", type: "custom", default: { x: 100, y: 100 } },
  }),
  app: () => import("./app.js"),
});
