import { definePlugin } from "../../kernel/define.js";
import strings from "./strings.js";

export default definePlugin({
  name: "GroupButtons",
  description: "plugin.GroupButtons.description",
  authors: ["ChatClub"],
  icon: "link",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["AppShell", "Workspace"],
  usesExtensionPoints: ["tabGroup.button", "shortcut.action"],
  strings,
  app: () => import("./app.js"),
});
