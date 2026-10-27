import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "QuickCSS",
  description: "plugin.QuickCSS.description",
  authors: ["ChatClub"],
  icon: "code",
  tags: ["appearance"],
  enabledByDefault: true,
  startAt: "init",
  usesExtensionPoints: ["appearance.group"],
  strings: {
    zh: {
      "plugin.QuickCSS.description": "随手写几行 CSS，输入即生效。",
      "quickcss.card": "Quick CSS",
      "quickcss.enabled": "启用 Quick CSS",
      "quickcss.enabled.desc": "关闭后样式移除，文本保留。",
      "quickcss.placeholder": "/* 在这里写 CSS，例如 */\n.cc-topbar { gap: 12px; }",
    },
    en: {
      "plugin.QuickCSS.description": "Write a few lines of CSS; changes apply as you type.",
      "quickcss.card": "Quick CSS",
      "quickcss.enabled": "Enable Quick CSS",
      "quickcss.enabled.desc": "When off, the styles are removed but the text is kept.",
      "quickcss.placeholder": "/* Write CSS here, for example */\n.cc-topbar { gap: 12px; }",
    },
  },
  app: () => import("./app.js"),
});
