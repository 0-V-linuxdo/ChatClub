import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "PromptFocus",
  description: "plugin.PromptFocus.description",
  authors: ["ChatClub"],
  icon: "keyboard",
  tags: ["composer"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Composer", "FrameBridge", "Workspace"],
  usesExtensionPoints: ["frame.identityParams", "shortcut.action"],
  shortcutActions: [{ id: "focusInput", labelKey: "promptFocus.shortcut" }],
  strings: {
    zh: {
      "plugin.PromptFocus.description": "输入框光标保持：发送后和 iframe 加载时不让聊天站点抢走焦点；用户点进 iframe 时立即让出；focusInput 快捷键随时把光标放回输入框。",
      "promptFocus.shortcut": "聚焦输入框",
    },
    en: {
      "plugin.PromptFocus.description": "Keeps the caret in the composer: chat sites can't steal focus after a send or while loading; clicking into a frame yields at once; the focusInput shortcut puts the caret back any time.",
      "promptFocus.shortcut": "Focus the input",
    },
  },
  app: () => import("./app.js"),
});
