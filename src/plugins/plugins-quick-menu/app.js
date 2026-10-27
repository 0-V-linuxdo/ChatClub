// PluginsQuickMenu: "Plugins" submenu in the settings jump menu (spec v1.2 §18.2).

import { setPickerHost, toggleablePlugins } from "./picker.js";

export default {
  start(ctx) {
    const host = ctx.host;
    setPickerHost(host);
    ctx.onDispose(() => setPickerHost(null));
    const t = ctx.t;
    const submenu = ({ ui }) => {
      const chosen = ctx.settings.quickMenuPlugins;
      const names = Array.isArray(chosen) ? chosen : toggleablePlugins(host).map((p) => p.name);
      const items = names
        .filter((n) => host.plugins[n] && !host.plugins[n].required && !host.plugins[n].hidden)
        .sort()
        .map((name) => ({
          label: name,
          checked: host.isPluginEnabled(name),
          disabled: () => host.plugins[name].isDependency || host.unmetRequirements(name).length > 0,
          keepOpen: true,
          onSelect: async () => {
            const result = await host.togglePlugin(name);
            if (result.reloadNeeded) ui.toast(t("quickmenu.reloadHint", { name }), "info");
            ui.closeMenus();
          },
        }));
      return [...items, "separator", { label: t("quickmenu.manage"), icon: "settings", onSelect: () => ctx.services.get("settingsUI")?.open("plugins", { args: { tab: "all" } }) }];
    };
    ctx.contribute("topbar.menu", { id: "PluginsQuickMenu", labelKey: "quickmenu.label", icon: "plug", order: 0, submenu });
  },
};
