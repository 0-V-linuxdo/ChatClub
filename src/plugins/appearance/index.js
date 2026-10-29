import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import strings from "./strings.js";
import { normalizeHexColor, DEFAULT_PRIMARY } from "./color.js";
import { ZONE_BOARD_STYLE } from "../../lib/zone-board.js";

export default definePlugin({
  name: "Appearance",
  description: "plugin.Appearance.description",
  authors: ["ChatClub"],
  icon: "palette",
  tags: ["appearance"],
  enabledByDefault: true,
  startAt: "init",
  provides: ["appearance.group"],
  // Other plugins only add rows to the Appearance page; with it off the page follows the system theme.
  optionalProvider: true,
  // `appearance.field` has no provider on purpose: SettingsUI and I18n add rows to it, and Appearance depends on them.
  usesExtensionPoints: ["settings.section", "appearance.field"],
  managedStyle: ZONE_BOARD_STYLE,
  strings,
  settings: definePluginSettings({
    themeMode: {
      optionKey: "themeMode",
      type: "select",
      options: [
        { label: "appearance.theme.system", value: "system", default: true },
        { label: "appearance.theme.light", value: "light" },
        { label: "appearance.theme.dark", value: "dark" },
      ],
    },
    primaryColor: {
      optionKey: "primaryColor",
      type: "string",
      default: DEFAULT_PRIMARY,
      description: "appearance.primary.description",
      isValid: (v) => (normalizeHexColor(v) ? true : "appearance.primary.invalid"),
    },
    primaryColorCustom: { optionKey: "primaryColorCustom", type: "boolean", default: false, hidden: true },
  }),
  app: () => import("./app.js"),
});
