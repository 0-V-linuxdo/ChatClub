import { definePlugin } from "../../kernel/define.js";
import style from "./style.js";

export default definePlugin({
  name: "TopbarAutoHide",
  description: "plugin.TopbarAutoHide.description",
  authors: ["ChatClub"],
  icon: "customizeTopbar",
  tags: ["appearance", "navigation"],
  // On for people who had chosen "Auto-hide" under the old Top bar visibility setting.
  optionKeys: ["topbarVisibility"],
  enabledByDefault: (options) => options.topbarVisibility === "auto",
  startAt: "domReady",
  dependencies: ["TopbarAPI"],
  managedStyle: style,
  strings: {
    zh: { "plugin.TopbarAutoHide.description": "顶部栏自动隐藏：鼠标移到页面顶部时出现，离开后收起。快捷键可以随时开关。" },
    en: { "plugin.TopbarAutoHide.description": "Auto-hides the top bar: it appears when the pointer reaches the top edge and hides when it leaves. A shortcut turns it on or off." },
  },
  app: () => import("./app.js"),
});
