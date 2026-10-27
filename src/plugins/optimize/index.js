import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import { templateStrings } from "../../lib/prompt-templates.js";

export const OPTIMIZE_DEFAULT = {
  id: "optimize-default",
  title: "Default Optimize",
  builtIn: true,
  prompt: [
    "You are a prompt expert. Rewrite the user's prompt so that a language model can act on it more reliably:",
    "make the goal explicit, add the missing context and constraints the user clearly implies, and state the expected form of the answer.",
    "Keep the user's intent and language. Do not answer or carry out the prompt itself.",
    "Output only the rewritten prompt, with no preface or explanation.",
  ].join(" "),
};

export default definePlugin({
  name: "Optimize",
  description: "plugin.Optimize.description",
  authors: ["ChatClub"],
  icon: "sparkles",
  tags: ["composer"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Composer", "ApiProfiles"],
  usesExtensionPoints: ["composer.action", "shortcut.action", "settings.section", "apiConsumer"],
  settings: definePluginSettings({
    optimizeApiProfileId: { optionKey: "optimizeApiProfileId", type: "custom", default: "default-openai" },
    optimizeApiModel: { optionKey: "optimizeApiModel", type: "custom", default: "" },
    optimizePromptTemplates: { optionKey: "optimizePromptTemplates", type: "custom", default: [OPTIMIZE_DEFAULT] },
    optimizePromptTemplateId: { optionKey: "optimizePromptTemplateId", type: "custom", default: "optimize-default" },
  }),
  strings: {
    zh: {
      ...templateStrings.zh,
      "plugin.Optimize.description": "提示词优化：用选定的 API 流式改写输入框里的提示词，左右对比后再决定用不用。",
      "optimize.action": "优化提示词",
      "optimize.consumer": "优化设置",
      "optimize.title": "优化提示词",
      "optimize.intro": "左边是原文，右边流式显示优化结果。",
      "optimize.original": "原 Prompt",
      "optimize.result": "优化后的 Prompt",
      "optimize.streaming": "流式输出中…",
      "optimize.ready": "就绪",
      "optimize.failed": "失败",
      "optimize.chars": "{n} 字符",
      "optimize.retry": "重新优化",
      "optimize.keep": "保留原文",
      "optimize.use": "使用优化结果",
      "optimize.done": "提示词已优化",
      "optimize.noKey": "API key 未配置",
      "optimize.httpFailed": "API 请求失败，HTTP {status}",
      "optimize.shortcut": "优化提示词",
      "optimize.section.title": "优化",
      "optimize.section.desc": "提示词优化配置。",
      "optimize.card": "优化 AI",
      "optimize.card.desc": "配置 优化 API 和提示词模板。",
      "optimize.templates.desc": "选择 Optimize Prompt 使用的提示词模板。",
      "optimize.resetPrompt": "重置提示词",
    },
    en: {
      ...templateStrings.en,
      "plugin.Optimize.description": "Prompt optimization: rewrite the composer's prompt through the chosen API with streaming, compare side by side, then decide.",
      "optimize.action": "Optimize prompt",
      "optimize.consumer": "Optimize",
      "optimize.title": "Optimize prompt",
      "optimize.intro": "The original is on the left; the optimized result streams in on the right.",
      "optimize.original": "Original prompt",
      "optimize.result": "Optimized prompt",
      "optimize.streaming": "Streaming…",
      "optimize.ready": "Ready",
      "optimize.failed": "Failed",
      "optimize.chars": "{n} chars",
      "optimize.retry": "Optimize again",
      "optimize.keep": "Keep original",
      "optimize.use": "Use optimized prompt",
      "optimize.done": "Prompt optimized",
      "optimize.noKey": "API key is not configured",
      "optimize.httpFailed": "API request failed, HTTP {status}",
      "optimize.shortcut": "Optimize prompt",
      "optimize.section.title": "Optimize",
      "optimize.section.desc": "Prompt optimization settings.",
      "optimize.card": "Optimize AI",
      "optimize.card.desc": "Configure the optimize API and prompt templates.",
      "optimize.templates.desc": "Choose the template Optimize Prompt uses.",
      "optimize.resetPrompt": "Reset prompt",
    },
  },
  managedStyle: String.raw`
.cc-optimize { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cc-optimize .pane { display: flex; flex-direction: column; gap: 8px; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.cc-optimize .pane-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.cc-optimize .pane-head .grow { flex: 1; }
.cc-optimize .meta { color: var(--muted); font-size: 12px; font-weight: 400; }
.cc-optimize textarea { min-height: 320px; resize: vertical; }
.cc-optimize .error { color: var(--danger); font-size: 12px; white-space: pre-wrap; }
@media (max-width: 760px) { .cc-optimize { grid-template-columns: 1fr; } }
`,
  app: () => import("./app.js"),
});
