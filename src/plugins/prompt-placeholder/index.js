import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";

export const DEFAULT_CONFIG = { items: [], mode: "refresh", order: "sequential", intervalSec: 10, state: { index: -1, lastRandom: -1 } };

export default definePlugin({
  name: "PromptPlaceholder",
  description: "plugin.PromptPlaceholder.description",
  authors: ["ChatClub"],
  icon: "messageSquare",
  tags: ["composer"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Composer"],
  usesExtensionPoints: ["composer.placeholder", "appearance.group"],
  settings: definePluginSettings({
    topbarPromptPlaceholderConfig: { optionKey: "topbarPromptPlaceholderConfig", type: "custom", default: DEFAULT_CONFIG },
  }),
  strings: {
    zh: {
      "plugin.PromptPlaceholder.description": "输入框自定义占位语：每次打开换一条或定时轮换，顺序或随机。",
      "placeholder.card": "输入框占位语",
      "placeholder.items": "自定义占位语",
      "placeholder.items.desc": "每行一条，最多 30 条，每条最多 100 字。留空则用默认提示。",
      "placeholder.mode": "轮换方式",
      "placeholder.mode.refresh": "每次打开页面换一条",
      "placeholder.mode.interval": "定时轮换",
      "placeholder.interval": "间隔（秒）",
      "placeholder.order": "顺序",
      "placeholder.order.sequential": "按顺序",
      "placeholder.order.random": "随机",
    },
    en: {
      "plugin.PromptPlaceholder.description": "Custom composer placeholders: a new one on every page open or on a timer, in order or at random.",
      "placeholder.card": "Composer placeholder",
      "placeholder.items": "Custom placeholders",
      "placeholder.items.desc": "One per line, up to 30, each up to 100 characters. Leave empty for the default hint.",
      "placeholder.mode": "Rotation",
      "placeholder.mode.refresh": "A new one on every page open",
      "placeholder.mode.interval": "On a timer",
      "placeholder.interval": "Interval (seconds)",
      "placeholder.order": "Order",
      "placeholder.order.sequential": "In order",
      "placeholder.order.random": "Random",
    },
  },
  app: () => import("./app.js"),
});
