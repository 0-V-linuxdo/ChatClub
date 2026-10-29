import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "TopbarAPI",
  description: "plugin.TopbarAPI.description",
  authors: ["ChatClub"],
  icon: "customizeTopbar",
  tags: ["workspace", "appearance"],
  required: true,
  startAt: "domReady",
  shortcutActions: [{ id: "toggleTopbar", labelKey: "topbar.visibility.auto" }, { id: "openSettingsMenu", labelKey: "topbar.settingsJumpMenu" }],
  dependencies: ["AppShell"],
  provides: ["topbar.item", "topbar.menu"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    topbarLayout: { optionKey: "topbarLayout", type: "custom", default: null },
    // Legacy markers: buttons added after the layout was first saved (07 §2).
  }),
  app: () => import("./app.js"),
});
