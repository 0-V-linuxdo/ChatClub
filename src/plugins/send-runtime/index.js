import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "SendRuntime",
  description: "plugin.SendRuntime.description",
  authors: ["ChatClub"],
  icon: "send",
  tags: ["sites"],
  required: true,
  hidden: true,
  dependencies: ["FrameBridge"],
  content: [
    {
      id: "send",
      bundle: "content/send.js",
      world: "ISOLATED",
      runAt: "document_idle",
      commands: {
        sendText: { timeoutMs: 12000, mutating: true },
        newChatPreprocess: { timeoutMs: 1500, mutating: true },
      },
    },
  ],
  strings: {
    zh: { "plugin.SendRuntime.description": "聊天页面内的通用发送实现：找输入框、写入文字、粘贴图片、点击发送并确认。" },
    en: { "plugin.SendRuntime.description": "Generic in-page sending: find the input, write the text, paste images, submit and confirm." },
  },
});
