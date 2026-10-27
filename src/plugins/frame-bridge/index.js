import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "FrameBridge",
  description: "plugin.FrameBridge.description",
  authors: ["ChatClub"],
  icon: "cable",
  tags: ["sites"],
  required: true,
  requiresReload: true,
  startAt: "init",
  provides: ["frame.identityParams"],
  content: [
    {
      id: "preload",
      bundle: "content/preload.js",
      world: "MAIN",
      runAt: "document_start",
      commands: {},
    },
    {
      id: "base",
      bundle: "content/base.js",
      world: "ISOLATED",
      runAt: "document_idle",
      commands: {
        ping: { timeoutMs: 2000 },
        getPageMeta: { timeoutMs: 1800 },
        getLocationHref: { timeoutMs: 1500 },
        getPageText: { timeoutMs: 2500 },
        navigate: { timeoutMs: 3000, mutating: true },
        historyBack: { timeoutMs: 2000, mutating: true },
        setForwardCombos: { timeoutMs: 1500 },
        setLease: { timeoutMs: 1200 },
        captureStart: { timeoutMs: 10000, mutating: true },
        triggerScroll: { timeoutMs: 8000, mutating: true },
        captureEnd: { timeoutMs: 5000, mutating: true },
      },
    },
  ],
  strings: {
    zh: { "plugin.FrameBridge.description": "聊天 iframe 绑定、经后台鉴权的命令通道、基础内容能力（页面信息、文本、地址）。" },
    en: { "plugin.FrameBridge.description": "Chat iframe binding, background-authenticated command channel, base content capability (page info, text, address)." },
  },
  app: () => import("./app.js"),
});
