import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";
import strings from "./strings.js";

export default definePlugin({
  name: "TabDragDrop",
  description: "plugin.TabDragDrop.description",
  authors: ["ChatClub"],
  icon: "grip",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Workspace"],
  managedStyle: style,
  strings,
  app: () => import("./app.js"),
});
