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
  usesExtensionPoints: ["settings.section"],
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
