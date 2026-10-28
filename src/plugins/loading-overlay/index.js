import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import strings from "./strings.js";

export default definePlugin({
  name: "LoadingOverlay",
  description: "plugin.LoadingOverlay.description",
  authors: ["ChatClub"],
  icon: "loader",
  tags: ["appearance", "workspace"],
  // Off only for people who switched the old "Loading overlay" setting off.
  optionKeys: ["frameLoadingOverlayEnabled"],
  enabledByDefault: (options) => options.frameLoadingOverlayEnabled !== false,
  startAt: "domReady",
  usesExtensionPoints: ["appearance.field"],
  managedStyle: String.raw`
:root[data-theme="dark"] .cc-ws-overlay { background: color-mix(in srgb, var(--bg) var(--overlay-opacity, 82%), transparent); }
`,
  strings,
  settings: definePluginSettings({
    frameLoadingOverlayOpacity: { optionKey: "frameLoadingOverlayOpacity", type: "slider", min: 0, max: 100, step: 1, default: 82, description: "workspace.overlay.description" },
  }),
  app: () => import("./app.js"),
});
