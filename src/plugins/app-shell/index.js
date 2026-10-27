import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import { WINDOW_VIEWER_STYLE } from "../../lib/window-viewer.js";
import strings from "./strings.js";

export default definePlugin({
  name: "AppShell",
  description: "plugin.AppShell.description",
  authors: ["ChatClub"],
  icon: "home",
  tags: ["workspace"],
  required: true,
  requiresReload: true,
  startAt: "init",
  provides: ["panel"],
  managedStyle: style + WINDOW_VIEWER_STYLE,
  strings,
  settings: definePluginSettings({
    toastStay: {
      optionKey: "toastStay",
      type: "select",
      description: "appShell.toastStay.description",
      options: [
        { label: "appShell.toastStay.short", value: "short" },
        { label: "appShell.toastStay.default", value: "default", default: true },
        { label: "appShell.toastStay.long", value: "long" },
      ],
    },
    tooltipDisabledIds: { optionKey: "tooltipDisabledIds", type: "custom", default: [] },
    frameToastPosition: { optionKey: "frameToastPosition", type: "custom", default: { x: 100, y: 100 } },
  }),
  app: () => import("./app.js"),
});
