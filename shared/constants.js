import { DEFAULT_TOPBAR_LAYOUT } from "./topbar.js";

export const APP_NAME = "ChatClub";
export const APP_VERSION = "「2026-06-29｜03:45:30」";
export const BASELINE_MOD_VERSION = "2.4.0.14";
export const HOMEPAGE_URL = "https://chatclub.local/";

export const STORAGE_KEYS = {
  options: "options",
  customConfig: "customConfig",
  promptLibrary: "promptLibrary",
  promptSendHistory: "promptSendHistory",
  pocketHistory: "pocketHistory",
  shortcutConfig: "shortcutConfig",
  cachedConfig: "cachedConfig"
};

export const API_PROFILE_ENDPOINT_DEFAULT = "https://api.openai.com/v1/chat/completions";
export const API_PROFILE_MODEL_DEFAULT = "gpt-3.5-turbo";
export const API_PROMOTION_CHANNELS_VERSION = 2;
export const API_PROFILE_ZERO_ZERO_ENDPOINT = "https://api.0-0.pro/v1/chat/completions";
export const API_PROFILE_ZERO_ZERO_MODEL = "gpt-5.5";
export const API_PROFILE_ZERO_ZERO_REGISTER_URL = "https://0-0.pro/register?ref=CSLPRL76";
export const SUMMARY_SITE_CONFIG_VERSION = 65;

export const DEFAULT_PROMOTION_API_PROFILES = [
  {
    id: "default-zero-zero",
    name: "0.0",
    endpoint: API_PROFILE_ZERO_ZERO_ENDPOINT,
    apiKey: "",
    model: API_PROFILE_ZERO_ZERO_MODEL,
    registerUrl: API_PROFILE_ZERO_ZERO_REGISTER_URL,
    promotionChannel: true
  }
];

export const GEMINI_THINKING_LEVEL_PREFERENCE_KEY = "GeminiThinkingLevel";

export const GEMINI_THINKING_LEVEL_TARGETS = Object.freeze([
  Object.freeze({ id: "standard", label: "Standard" }),
  Object.freeze({ id: "extended", label: "Extended" })
]);

export const DEFAULT_GEMINI_THINKING_LEVEL = "standard";

export const MODEL_PREFERENCE_TARGETS = Object.freeze({
  Gemini: Object.freeze([
    Object.freeze({ id: "", label: "" }),
    Object.freeze({ id: "pro", label: "3.1 Pro" }),
    Object.freeze({ id: "fast", label: "3.1 Flash-Lite" }),
    Object.freeze({ id: "flash35", label: "3.5 Flash" })
  ]),
  Grok: Object.freeze([
    Object.freeze({ id: "", label: "" }),
    Object.freeze({ id: "auto", label: "Auto" }),
    Object.freeze({ id: "fast", label: "Fast" }),
    Object.freeze({ id: "expert", label: "Expert" }),
    Object.freeze({ id: "grok43", label: "Grok 4.3 (beta)" }),
    Object.freeze({ id: "heavy", label: "Heavy" })
  ]),
  DeepSeek: Object.freeze([
    Object.freeze({ id: "", label: "" }),
    Object.freeze({ id: "instant", label: "Instant" }),
    Object.freeze({ id: "expert", label: "Expert" }),
    Object.freeze({ id: "vision", label: "Vision" })
  ]),
  NotionAI: Object.freeze([
    Object.freeze({ id: "", label: "" }),
    Object.freeze({ id: "auto", label: "Auto" }),
    Object.freeze({ id: "sonnet46", label: "Claude Sonnet 4.6" }),
    Object.freeze({ id: "opus47", label: "Claude Opus 4.7" }),
    Object.freeze({ id: "opus48", label: "Claude Opus 4.8" }),
    Object.freeze({ id: "gemini31pro", label: "Gemini 3.1 Pro" }),
    Object.freeze({ id: "gpt52", label: "GPT-5.2" }),
    Object.freeze({ id: "gpt54", label: "GPT-5.4" }),
    Object.freeze({ id: "gpt55", label: "GPT-5.5" }),
    Object.freeze({ id: "grok43", label: "Grok 4.3" }),
    Object.freeze({ id: "grokBuild01", label: "Grok Build 0.1" }),
    Object.freeze({ id: "kimi26", label: "Kimi K2.6" }),
    Object.freeze({ id: "deepseekV4Pro", label: "DeepSeek V4 Pro" }),
    Object.freeze({ id: "glm52", label: "GLM 5.2" })
  ])
});

export const DEFAULT_MODEL_PREFERENCES = Object.freeze(
  {
    ...Object.fromEntries(Object.keys(MODEL_PREFERENCE_TARGETS).map((appId) => [appId, ""])),
    [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: DEFAULT_GEMINI_THINKING_LEVEL
  }
);

export const TAB_GROUP_HEADER_BUTTONS = [
  { id: "addApp", icon: "plus", section: "header", defaultPlacement: "pinned" },
  { id: "reload", icon: "reload", section: "header", defaultPlacement: "pinned" },
  { id: "fullscreen", icon: "maximize", section: "header", defaultPlacement: "pinned" },
  { id: "openInNewTab", icon: "external", section: "menu", defaultPlacement: "menu" },
  { id: "copyLink", icon: "copy", section: "menu", defaultPlacement: "menu" },
  { id: "removeGroup", icon: "x", section: "menu", defaultPlacement: "menu", danger: true },
  { id: "more", icon: "more", section: "anchor", requiredPinned: true, defaultPlacement: "pinned" }
];

export const DEFAULT_TAB_GROUP_BUTTON_PLACEMENT = Object.freeze(
  Object.fromEntries(TAB_GROUP_HEADER_BUTTONS.map((item) => [item.id, item.defaultPlacement || "pinned"]))
);

export const DEFAULT_TAB_GROUP_BUTTON_ORDER = Object.freeze(
  TAB_GROUP_HEADER_BUTTONS.filter((item) => !item.requiredPinned).map((item) => item.id)
);

export const OPTIMIZE_PROMPT_TEMPLATE_DEFAULT = `You are an AI prompt expert, skilled at analyzing and optimizing user-provided prompts.

Analyze the user prompt and rewrite it so it is clearer, more specific, and easier for an AI model to follow.

Constraints:
- Do not answer the user's prompt.
- Keep the user's intent and language.
- Return only the optimized prompt.`;

export const SUMMARY_PANEL_PROMPT_DEFAULT = `Summarize the selected chat context. Keep the answer concise, factual, and useful.

When the user asks a follow-up question, answer from the provided context first and clearly say when the context is insufficient.`;

export const DEFAULT_OPTIONS = {
  layoutPresets: [
    {
      id: "default",
      name: "Default",
      chatAppIdGroups: [["ChatGPT"], ["Gemini"], ["Grok"]]
    }
  ],
  activeLayoutPresetId: "default",
  colMaxCount: 0,
  themeMode: "system",
  language: "system",
  primaryColor: "#1f7a5f",
  primaryColorCustom: false,
  tabGroupButtonsMode: "pinned",
  tabGroupButtonPlacement: DEFAULT_TAB_GROUP_BUTTON_PLACEMENT,
  tabGroupButtonOrder: DEFAULT_TAB_GROUP_BUTTON_ORDER,
  topbarLayout: DEFAULT_TOPBAR_LAYOUT,
  apiProfiles: [
    {
      id: "default-openai",
      name: "Default API",
      endpoint: API_PROFILE_ENDPOINT_DEFAULT,
      apiKey: "",
      model: API_PROFILE_MODEL_DEFAULT
    },
    ...DEFAULT_PROMOTION_API_PROFILES
  ],
  apiPromotionChannelsVersion: API_PROMOTION_CHANNELS_VERSION,
  optimizeApiProfileId: "default-openai",
  summaryApiProfileId: "default-openai",
  optimizePromptTemplateId: "optimize-default",
  optimizePromptTemplates: [
    {
      id: "optimize-default",
      title: "Default Optimize",
      prompt: OPTIMIZE_PROMPT_TEMPLATE_DEFAULT,
      builtIn: true
    }
  ],
  summaryPromptTemplateId: "summary-default",
  summaryPromptTemplates: [
    {
      id: "summary-default",
      title: "Default Summary",
      prompt: SUMMARY_PANEL_PROMPT_DEFAULT,
      builtIn: true
    }
  ],
  modelPreferences: DEFAULT_MODEL_PREFERENCES,
  summarySiteConfigs: []
};

export const DEFAULT_SHORTCUT_CONFIG = {
  sendKeyMode: "enter",
  shortcuts: {
    focusInput: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyK" },
    newChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyN" },
    optimizePrompt: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyO" },
    openSummaryPanel: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyS" },
    closeChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyW" },
    reloadChat: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyR" },
    enterFullscreen: { alt: true, shift: false, cmdOrCtrl: false, code: "KeyF" },
    insertPrompt: { alt: true, shift: false, cmdOrCtrl: false, codePattern: "Digit" },
    switchLayout: { alt: false, shift: true, cmdOrCtrl: true, codePattern: "Digit" },
    switchPlatformTab: { alt: false, shift: false, cmdOrCtrl: true, codePattern: "Digit" }
  }
};

export const BUILTIN_CHAT_APPS = [
  {
    id: "ChatGPT",
    name: "ChatGPT",
    provider: "OpenAI",
    url: "https://chatgpt.com/",
    hosts: ["chatgpt.com", "*.chatgpt.com", "chat.openai.com", "*.chat.openai.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[data-testid='send-button'], button[aria-label*='Send' i]"
  },
  {
    id: "Claude",
    name: "Claude",
    provider: "Anthropic",
    url: "https://claude.ai/new",
    hosts: ["claude.ai", "*.claude.ai"],
    inputSelector: "div[contenteditable='true'], textarea",
    sendButtonSelector: "button[aria-label*='Send' i]",
    noSandbox: true
  },
  {
    id: "Gemini",
    name: "Gemini",
    provider: "Google",
    url: "https://gemini.google.com/app",
    hosts: ["gemini.google.com", "*.gemini.google.com"],
    inputSelector: "rich-textarea div[contenteditable='true'], textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Grok",
    name: "Grok",
    provider: "xAI",
    url: "https://grok.com/",
    hosts: ["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "GrokMirror",
    name: "Grok Mirror",
    provider: "dairoot",
    url: "https://gk.dairoot.cn/",
    hosts: ["gk.dairoot.cn", "*.gk.dairoot.cn"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "DeepSeek",
    name: "DeepSeek",
    provider: "DeepSeek",
    url: "https://chat.deepseek.com/",
    hosts: ["deepseek.com", "*.deepseek.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Kagi",
    name: "Kagi Assistant",
    provider: "Kagi",
    url: "https://assistant.kagi.com/",
    hosts: ["assistant.kagi.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "NotionAI",
    name: "Notion AI",
    provider: "Notion",
    url: "https://app.notion.com/ai",
    hosts: ["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"],
    inputSelector: "div[contenteditable='true'][role='textbox'], div[contenteditable='true'], textarea",
    sendButtonSelector: "button[aria-label*='Submit AI message' i], button[aria-label*='Send' i]",
    noSandbox: true
  },
  {
    id: "Perplexity",
    name: "Perplexity",
    provider: "Perplexity",
    url: "https://www.perplexity.ai/",
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Submit' i], button[aria-label*='Send' i]"
  },
  {
    id: "Poe",
    name: "Poe",
    provider: "Quora",
    url: "https://poe.com/",
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Kimi",
    name: "Kimi",
    provider: "Moonshot",
    url: "https://www.kimi.com/",
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "DouBao",
    name: "DouBao",
    provider: "ByteDance",
    url: "https://www.doubao.com/",
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Qwen",
    name: "Qwen",
    provider: "Alibaba",
    url: "https://chat.qwen.ai/",
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "TypingMind",
    name: "TypingMind",
    provider: "TypingMind",
    url: "https://setapp.typingcloud.com/",
    hosts: ["setapp.typingcloud.com", "*.typingcloud.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "LobeHub",
    name: "LobeHub",
    provider: "LobeHub",
    url: "https://app.lobehub.com/",
    hosts: ["app.lobehub.com", "*.lobehub.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  }
];

export const LEGACY_OPTION_KEYS = [
  "optimizeEndpoint",
  "optimizeApiKey",
  "optimizeModel",
  "summaryEndpoint",
  "summaryApiKey",
  "summaryModel",
  "apiProfiles",
  "summarySiteConfigs",
  "shortcutConfig"
];
