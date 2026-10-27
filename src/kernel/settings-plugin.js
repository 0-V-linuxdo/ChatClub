// The kernel's own metadata namespace (spec §9.5): required, hidden, always enabled.

import { definePlugin } from "./define.js";
import { definePluginSettings } from "./settings.js";

export function createSettingsPlugin() {
  return definePlugin({
    name: "Settings",
    description: "pluginDesc_Settings",
    authors: [],
    required: true,
    hidden: true,
    settings: definePluginSettings({
      knownPlugins: { type: "custom", default: {} },
      pinnedPlugins: { type: "custom", default: [] },
      starredPlugins: { type: "custom", default: [] },
      themes: { type: "custom", default: [] },
      themesEnabled: { type: "custom", default: true },
      onlineThemesEnabled: { type: "custom", default: true },
      customCSS: { type: "custom", default: "" },
      customCSSEnabled: { type: "custom", default: true },
      migrationFlags: { type: "custom", default: {} },
    }),
  });
}
