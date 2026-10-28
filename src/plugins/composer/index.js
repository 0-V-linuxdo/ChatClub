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
  provides: ["composer.action", "composer.sendPipeline", "composer.targetGate", "composer.keyHandler", "composer.mode", "composer.placeholder"],
  usesExtensionPoints: ["appearance.field", "topbar.item", "shortcut.action"],
  managedStyle: style,
  strings,
  settings: definePluginSettings({
    topbarPromptInputFontSize: { optionKey: "topbarPromptInputFontSize", type: "slider", min: 13, max: 20, step: 1, default: 16 },
  }),
  app: () => import("./app.js"),
});
