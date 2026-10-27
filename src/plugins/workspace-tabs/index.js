import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export const SIDEBAR_BUTTON_ORDER = ["pin", "pocket", "edit", "delete"];

export default definePlugin({
  name: "WorkspaceTabs",
  description: "plugin.WorkspaceTabs.description",
  authors: ["ChatClub"],
  icon: "sidebar",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Workspace", "WorkspaceSession", "TopbarAPI"],
  provides: ["tabsSidebar.button"],
  usesExtensionPoints: ["topbar.item", "shortcut.action", "appearance.group"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    tabsSidebarButtonPlacement: { optionKey: "tabsSidebarButtonPlacement", type: "custom", default: {} },
    tabsSidebarButtonOrder: { optionKey: "tabsSidebarButtonOrder", type: "custom", default: SIDEBAR_BUTTON_ORDER },
  }),
  app: () => import("./app.js"),
});
