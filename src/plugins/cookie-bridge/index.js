import { definePlugin } from "../../kernel/define.js";
import { STATE_KEY } from "./model.js";

export default definePlugin({
  name: "CookieBridge",
  description: "plugin.CookieBridge.description",
  authors: ["ChatClub"],
  icon: "cookie",
  tags: ["sites"],
  enabledByDefault: true,
  requiresReload: true,
  dependencies: ["Workspace"],
  permissions: ["cookies"],
  storageKeys: [STATE_KEY],
  strings: {
    zh: { "plugin.CookieBridge.description": "Cookie 桥：把 Grok、Manus 的登录 cookie 镜像到工作区 iframe 的分区，让 iframe 里保持登录。不修改原 cookie，也不记录 cookie 值。" },
    en: { "plugin.CookieBridge.description": "Cookie bridge: mirrors the Grok and Manus login cookies into the workspace iframe partition so they stay signed in. Source cookies are never changed and values are never logged." },
  },
  app: () => import("./app.js"),
});
