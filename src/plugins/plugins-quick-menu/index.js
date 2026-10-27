import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import { pickerComponent } from "./picker.js";

export default definePlugin({
  name: "PluginsQuickMenu",
  description: "plugin.PluginsQuickMenu.description",
  authors: ["ChatClub"],
  icon: "plug",
  tags: ["navigation"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["TopbarAPI"],
  usesExtensionPoints: ["topbar.menu"],
  settings: definePluginSettings({
    quickMenuPlugins: {
      type: "component",
      description: "quickmenu.setting.desc",
      default: null,
      component: pickerComponent,
    },
  }),
  strings: {
    zh: {
      "plugin.PluginsQuickMenu.description": "在顶部栏设置菜单中加入\"插件\"子菜单，快速开关插件。",
      "quickmenu.label": "插件",
      "quickmenu.manage": "管理插件…",
      "quickmenu.setting.desc": "选择哪些插件出现在子菜单里。默认显示全部可关闭的插件。",
      "setting.PluginsQuickMenu.quickMenuPlugins": "子菜单中的插件",
      "quickmenu.reloadHint": "{name} 需要重新加载页面才能完全生效",
    },
    en: {
      "plugin.PluginsQuickMenu.description": "Adds a Plugins submenu to the top bar settings menu for quick toggling.",
      "quickmenu.label": "Plugins",
      "quickmenu.manage": "Manage plugins…",
      "quickmenu.setting.desc": "Choose which plugins appear in the submenu. By default every plugin that can be turned off is shown.",
      "setting.PluginsQuickMenu.quickMenuPlugins": "Plugins in the submenu",
      "quickmenu.reloadHint": "{name} needs a page reload to take full effect",
    },
  },
  app: () => import("./app.js"),
});
