import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "SettingsUI",
  description: "plugin.SettingsUI.description",
  authors: ["ChatClub"],
  icon: "settings",
  tags: ["appearance"],
  required: true,
  startAt: "domReady",
  dependencies: ["AppShell"],
  provides: ["settings.section"],
  usesExtensionPoints: ["topbar.item", "shortcut.action"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    // Shown on the Appearance page (06 §1.4); owned here because every sortable settings list reads it.
    settingsClickReorderButtonsEnabled: {
      optionKey: "settingsClickReorderButtonsEnabled",
      type: "boolean",
      default: false,
      description: "settingsUi.moveButtons.description",
    },
  }),
  app: () => import("./app.js"),
});
