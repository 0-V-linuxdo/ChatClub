import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "Composer",
  description: "plugin.Composer.description",
  authors: ["ChatClub"],
  icon: "send",
  tags: ["composer"],
  required: true,
  requiresReload: true,
  startAt: "domReady",
  dependencies: ["AppShell", "TopbarAPI", "Workspace", "FrameBridge", "SendRuntime"],
  provides: ["composer.action", "composer.sendPipeline", "composer.targetGate", "composer.keyHandler", "composer.searchProvider", "composer.placeholder"],
  usesExtensionPoints: ["topbar.item", "shortcut.action"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    composerPlacement: {
      optionKey: "composerPlacement",
      type: "select",
      options: [
        { label: "composer.placement.topbar", value: "topbar", default: true },
        { label: "composer.placement.center", value: "center" },
      ],
    },
    topbarPromptInputFontSize: { optionKey: "topbarPromptInputFontSize", type: "slider", min: 13, max: 20, step: 1, default: 16 },
    topbarPromptInputFontSizeMigrationVersion: { optionKey: "topbarPromptInputFontSizeMigrationVersion", type: "custom", default: 0 },
  }),
  app: () => import("./app.js"),
});
