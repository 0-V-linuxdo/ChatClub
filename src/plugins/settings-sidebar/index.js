import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import { layoutEditor } from "./editor.js";
import strings from "./strings.js";
import style from "./style.js";

export default definePlugin({
  name: "SettingsSidebar",
  description: "plugin.SettingsSidebar.description",
  authors: ["ChatClub"],
  icon: "sidebar",
  tags: ["appearance"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["SettingsUI"],
  usesExtensionPoints: ["settings.navLayout"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    // { order: section ids in sidebar order, hidden: section ids not shown }.
    navLayout: {
      type: "component",
      description: "settingsSidebar.setting.desc",
      default: null,
      component: layoutEditor,
    },
  }),
  app: () => import("./app.js"),
});
