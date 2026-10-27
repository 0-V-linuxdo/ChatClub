import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export const GROUP_BUTTON_ORDER = ["addApp", "refreshPage", "newChat", "messageNavigator", "deleteThread", "reload", "fullscreen", "copyLink", "openInNewTab", "goToUrl", "removeGroup"];
export const CONTEXT_MENU_ORDER = ["addApp", "refreshPage", "newChat", "messageNavigator", "deleteThread", "reload", "fullscreen", "copyLink", "openInNewTab", "goToUrl", "closeTab"];

export default definePlugin({
  name: "Workspace",
  description: "plugin.Workspace.description",
  authors: ["ChatClub"],
  icon: "layout",
  tags: ["workspace"],
  required: true,
  requiresReload: true,
  startAt: "domReady",
  dependencies: ["AppShell", "Apps", "FrameBridge"],
  provides: ["tabGroup.button", "tab.contextMenu", "workspace.contentProvider", "fullscreen.target"],
  usesExtensionPoints: ["shortcut.action", "appearance.group"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    colMaxCount: {
      optionKey: "colMaxCount",
      type: "select",
      options: [
        { label: "workspace.cols.auto", value: 0, default: true },
        { label: "1", value: 1 },
        { label: "2", value: 2 },
        { label: "3", value: 3 },
        { label: "4", value: 4 },
      ],
    },
    frameLoadingOverlayEnabled: { optionKey: "frameLoadingOverlayEnabled", type: "boolean", default: true, description: "workspace.overlay.description" },
    frameLoadingOverlayOpacity: { optionKey: "frameLoadingOverlayOpacity", type: "slider", min: 0, max: 100, step: 1, default: 82 },
    tabGroupButtonPlacement: { optionKey: "tabGroupButtonPlacement", type: "custom", default: {} },
    tabGroupButtonOrder: { optionKey: "tabGroupButtonOrder", type: "custom", default: GROUP_BUTTON_ORDER },
    tabContextMenuOrder: { optionKey: "tabContextMenuOrder", type: "custom", default: CONTEXT_MENU_ORDER },
    tabContextMenuHiddenIds: { optionKey: "tabContextMenuHiddenIds", type: "custom", default: [] },
    // Legacy markers (07 §2).
    tabGroupButtonsMode: { optionKey: "tabGroupButtonsMode", type: "custom", default: null },
    tabGroupButtonOrderMigrationVersion: { optionKey: "tabGroupButtonOrderMigrationVersion", type: "custom", default: 0 },
  }),
  app: () => import("./app.js"),
});
