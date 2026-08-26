import { DEFAULT_TOPBAR_LAYOUT } from "./topbar.js";
import {
  DEFAULT_APP_PICKER_APP_ORDERS,
  DEFAULT_APP_PICKER_SECTION_ORDER
} from "./app-picker-order.js";
import {
  DEFAULT_NOTION_EFFORT_PREFERENCES,
  NOTION_EFFORT_TARGETS,
  notionEffortTargetsForModel
} from "./notion-efforts.js";

export const APP_NAME = "ChatClub";
export const APP_VERSION = "「2026-08-26｜18:54:00」";
export const REPOSITORY_URL = "https://github.com/0-V-linuxdo/ChatClub";
export const TELEGRAM_CHANNEL_URL = "https://t.me/chatclub_extension";

export const STORAGE_KEYS = {
  options: "options",
  customConfig: "customConfig",
  promptLibrary: "promptLibrary",
  promptSendHistory: "promptSendHistory",
  pocketHistory: "pocketHistory",
  shortcutConfig: "shortcutConfig",
  cachedConfig: "cachedConfig",
  functionalAnomalies: "functionalAnomalies",
  workspaceTabFullText: "workspaceTabFullText"
};

export const API_PROFILE_ENDPOINT_DEFAULT = "https://api.openai.com/v1/chat/completions";
export const API_PROFILE_MODEL_DEFAULT = "GPT5.5";
export const API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION = 1;
export const API_PROMOTION_CHANNELS_VERSION = 2;
const API_PROFILE_ZERO_ZERO_ENDPOINT = "https://api.0-0.pro/v1/chat/completions";
const API_PROFILE_ZERO_ZERO_MODEL = "gpt-5.5";
const API_PROFILE_ZERO_ZERO_REGISTER_URL = "https://0-0.pro/register?ref=CSLPRL76";
export const SUMMARY_SITE_CONFIG_VERSION = 81;
export const SCRIPT_CONFIG_SCHEMA_VERSION = 3;
export const PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL = "sequential";
export const PROMPT_IMAGE_PASTE_STRATEGY_BATCH = "batch";
export const PROMPT_IMAGE_PASTE_STRATEGIES = Object.freeze([
  PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL,
  PROMPT_IMAGE_PASTE_STRATEGY_BATCH
]);

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
export const NOTION_ALL_SOURCES_PREFERENCE_KEY = "NotionAIAllSources";
export const NOTION_EFFORT_PREFERENCE_KEY = "NotionAIEfforts";

export const GEMINI_THINKING_LEVEL_TARGETS = Object.freeze([
  Object.freeze({ id: "standard", label: "Standard" }),
  Object.freeze({ id: "extended", label: "Extended" })
]);

export const DEFAULT_GEMINI_THINKING_LEVEL = "standard";

export const NOTION_ALL_SOURCES_PREFERENCE_VALUES = Object.freeze([
  "",
  "enabled",
  "disabled"
]);

export {
  DEFAULT_NOTION_EFFORT_PREFERENCES,
  NOTION_EFFORT_TARGETS,
  notionEffortTargetsForModel
};

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
    Object.freeze({ id: "sonnet5", label: "Claude Sonnet 5" }),
    Object.freeze({ id: "opus47", label: "Claude Opus 4.7" }),
    Object.freeze({ id: "opus48", label: "Claude Opus 4.8" }),
    Object.freeze({ id: "opus5", label: "Claude Opus 5" }),
    Object.freeze({ id: "fable5", label: "Claude Fable 5" }),
    Object.freeze({ id: "gemini31pro", label: "Gemini 3.1 Pro" }),
    Object.freeze({ id: "gemini35flash", label: "Gemini 3.5 Flash" }),
    Object.freeze({ id: "gpt56sol", label: "GPT-5.6 Sol" }),
    Object.freeze({ id: "gpt56terra", label: "GPT-5.6 Terra" }),
    Object.freeze({ id: "gpt52", label: "GPT-5.2" }),
    Object.freeze({ id: "gpt54", label: "GPT-5.4" }),
    Object.freeze({ id: "gpt55", label: "GPT-5.5" }),
    Object.freeze({ id: "grok43", label: "Grok 4.3" }),
    Object.freeze({ id: "grok45", label: "Grok 4.5" }),
    Object.freeze({ id: "grokBuild01", label: "Grok Build 0.1" }),
    Object.freeze({ id: "kimi26", label: "Kimi K2.6" }),
    Object.freeze({ id: "kimi27code", label: "Kimi K2.7 Code" }),
    Object.freeze({ id: "kimi3", label: "Kimi K3" }),
    Object.freeze({ id: "deepseekV4Pro", label: "DeepSeek V4 Pro" }),
    Object.freeze({ id: "glm52", label: "GLM 5.2" })
  ])
});

export const MODEL_PREFERENCE_SECONDARY_ENABLED_KEY = "SecondaryModelEnabled";
export const MODEL_PREFERENCE_SECONDARY_KEYS = Object.freeze(
  Object.fromEntries(
    Object.keys(MODEL_PREFERENCE_TARGETS).map((appId) => [appId, `${appId}Secondary`])
  )
);

export const DEFAULT_MODEL_PREFERENCES = Object.freeze(
  {
    ...Object.fromEntries(Object.keys(MODEL_PREFERENCE_TARGETS).map((appId) => [appId, ""])),
    ...Object.fromEntries(Object.values(MODEL_PREFERENCE_SECONDARY_KEYS).map((key) => [key, ""])),
    [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: false,
    [GEMINI_THINKING_LEVEL_PREFERENCE_KEY]: DEFAULT_GEMINI_THINKING_LEVEL,
    [NOTION_ALL_SOURCES_PREFERENCE_KEY]: "",
    [NOTION_EFFORT_PREFERENCE_KEY]: DEFAULT_NOTION_EFFORT_PREFERENCES
  }
);

export const DEFAULT_MODEL_PREFERENCE_ORDER = Object.freeze(Object.keys(MODEL_PREFERENCE_TARGETS));

export const MODEL_PREFERENCE_FAILURE_POLICIES = Object.freeze(["send-current", "skip"]);
export const MODEL_PREFERENCE_FAILURE_OVERRIDE_POLICIES = Object.freeze([
  "inherit",
  ...MODEL_PREFERENCE_FAILURE_POLICIES
]);
export const DEFAULT_MODEL_PREFERENCE_FAILURE_POLICY = "send-current";
export const DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES = Object.freeze(
  Object.fromEntries(Object.keys(MODEL_PREFERENCE_TARGETS).map((appId) => [appId, "inherit"]))
);

export const TAB_GROUP_HEADER_BUTTONS = [
  { id: "addApp", icon: "plus", section: "header", defaultPlacement: "pinned" },
  { id: "refreshPage", icon: "reload", section: "header", defaultPlacement: "pinned" },
  { id: "newChat", icon: "edit", section: "header", defaultPlacement: "pinned" },
  { id: "messageNavigator", icon: "navigator", section: "header", defaultPlacement: "pinned" },
  { id: "deleteThread", icon: "trash", section: "header", defaultPlacement: "pinned", danger: true },
  { id: "reload", icon: "home", section: "header", defaultPlacement: "menu" },
  { id: "fullscreen", icon: "maximize", section: "header", defaultPlacement: "menu" },
  { id: "copyLink", icon: "copy", section: "menu", defaultPlacement: "menu" },
  { id: "openInNewTab", icon: "external", section: "menu", defaultPlacement: "menu" },
  { id: "goToUrl", icon: "link", section: "menu", defaultPlacement: "menu" },
  { id: "removeGroup", icon: "x", section: "menu", defaultPlacement: "menu", danger: true },
  { id: "more", icon: "more", section: "anchor", requiredPinned: true, defaultPlacement: "pinned" }
];

export const TAB_CONTEXT_MENU_ITEMS = Object.freeze([
  ...TAB_GROUP_HEADER_BUTTONS.filter((item) => item.id !== "removeGroup" && item.id !== "more"),
  { id: "closeTab", icon: "x", section: "context", danger: true }
]);

export const DEFAULT_TAB_CONTEXT_MENU_ORDER = Object.freeze(
  TAB_CONTEXT_MENU_ITEMS.map((item) => item.id)
);

export const DEFAULT_TAB_GROUP_BUTTON_PLACEMENT = Object.freeze(
  Object.fromEntries(TAB_GROUP_HEADER_BUTTONS.map((item) => [item.id, item.defaultPlacement || "pinned"]))
);

export const DEFAULT_TAB_GROUP_BUTTON_ORDER = Object.freeze(
  TAB_GROUP_HEADER_BUTTONS.filter((item) => !item.requiredPinned).map((item) => item.id)
);

export const TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION = 1;

export const TABS_SIDEBAR_HOVER_BUTTONS = Object.freeze([
  { id: "pin", icon: "pin", defaultPlacement: "pinned" },
  { id: "edit", icon: "edit", defaultPlacement: "pinned" },
  { id: "delete", icon: "trash", defaultPlacement: "pinned", danger: true },
  { id: "more", icon: "more", requiredPinned: true, defaultPlacement: "pinned" }
]);

export const DEFAULT_TABS_SIDEBAR_BUTTON_PLACEMENT = Object.freeze(
  Object.fromEntries(TABS_SIDEBAR_HOVER_BUTTONS.map((item) => [item.id, item.defaultPlacement || "pinned"]))
);

export const DEFAULT_TABS_SIDEBAR_BUTTON_ORDER = Object.freeze(
  TABS_SIDEBAR_HOVER_BUTTONS.filter((item) => !item.requiredPinned).map((item) => item.id)
);

export const DEFAULT_POCKET_CARD_SIZE = Object.freeze({
  width: 460,
  height: 560
});

export const TOOLTIP_TARGET_GROUPS = Object.freeze([
  Object.freeze({
    id: "topbar",
    labelKey: "tooltip.group.topbar",
    targets: Object.freeze([
      Object.freeze({ id: "topbar.workspaceTabs", labelKey: "topbar.workspaceTabs" }),
      Object.freeze({ id: "topbar.brand", labelKey: "common.openInNewTab" }),
      Object.freeze({ id: "topbar.settings", labelKey: "topbar.settings" }),
      Object.freeze({ id: "topbar.search", labelKey: "topbar.search" }),
      Object.freeze({ id: "topbar.promptActions", labelKey: "topbar.promptActions" }),
      Object.freeze({ id: "topbar.promptLibrary", labelKey: "topbar.promptLibrary" }),
      Object.freeze({ id: "topbar.addPhotos", labelKey: "topbar.addPhotos" }),
      Object.freeze({ id: "topbar.clearPrompt", labelKey: "topbar.clearPrompt" }),
      Object.freeze({ id: "topbar.removeImage", labelKey: "topbar.removeImage" }),
      Object.freeze({ id: "topbar.optimizePrompt", labelKey: "topbar.optimizePrompt" }),
      Object.freeze({ id: "topbar.modelGateStatus", labelKey: "topbar.modelGateStatus" }),
      Object.freeze({ id: "topbar.send", labelKey: "topbar.sendTooltip" }),
      Object.freeze({ id: "topbar.newChat", labelKey: "topbar.newChatAllTooltip" }),
      Object.freeze({ id: "topbar.deleteThread", labelKey: "topbar.deleteThread" }),
      Object.freeze({ id: "topbar.summary", labelKey: "topbar.summary" }),
      Object.freeze({ id: "topbar.share", labelKey: "topbar.share" }),
      Object.freeze({ id: "topbar.pocket", labelKey: "topbar.pocket" }),
      Object.freeze({ id: "topbar.addGroup", labelKey: "topbar.addGroup" }),
      Object.freeze({ id: "topbar.layout", labelKey: "topbar.switchLayout" }),
      Object.freeze({ id: "topbar.settingsJumpMenu", labelKey: "topbar.settingsJumpMenu" }),
      Object.freeze({ id: "topbar.settings.appearance", labelKey: "settings.appearance.title" }),
      Object.freeze({ id: "topbar.settings.profiles", labelKey: "settings.profiles.title" }),
      Object.freeze({ id: "topbar.settings.apps", labelKey: "settings.apps.title" }),
      Object.freeze({ id: "topbar.settings.models", labelKey: "settings.models.title" }),
      Object.freeze({ id: "topbar.settings.summary", labelKey: "settings.summary.title" }),
      Object.freeze({ id: "topbar.settings.messageNavigation", labelKey: "settings.messageNavigation.title" }),
      Object.freeze({ id: "topbar.settings.topicDeletion", labelKey: "settings.topicDeletion.title" }),
      Object.freeze({ id: "topbar.settings.rules", labelKey: "settings.rules.title" }),
      Object.freeze({ id: "topbar.settings.optimize", labelKey: "settings.optimize.title" }),
      Object.freeze({ id: "topbar.settings.prompts", labelKey: "settings.prompts.title" }),
      Object.freeze({ id: "topbar.settings.promptHistory", labelKey: "settings.promptHistory.title" }),
      Object.freeze({ id: "topbar.settings.shortcuts", labelKey: "settings.shortcuts.title" }),
      Object.freeze({ id: "topbar.settings.io", labelKey: "settings.io.title" }),
      Object.freeze({ id: "topbar.settings.functionalAnomalies", labelKey: "settings.functionalAnomalies.title" }),
      Object.freeze({ id: "topbar.settings.about", labelKey: "settings.about.title" }),
      Object.freeze({ id: "topbar.customize.paletteItem", labelKey: "topbar.customize.item" }),
      Object.freeze({ id: "topbar.customize.enter", labelKey: "topbar.customize.enter" })
    ])
  }),
  Object.freeze({
    id: "workspace",
    labelKey: "tooltip.group.workspace",
    targets: Object.freeze([
      Object.freeze({ id: "workspace.group.addApp", labelKey: "chat.addApp" }),
      Object.freeze({ id: "workspace.group.newChat", labelKey: "topbar.newChat" }),
      Object.freeze({ id: "workspace.group.openInNewTab", labelKey: "common.openInNewTab" }),
      Object.freeze({ id: "workspace.group.copyLink", labelKey: "common.copyLink" }),
      Object.freeze({ id: "workspace.group.goToUrl", labelKey: "chat.goToUrl" }),
      Object.freeze({ id: "workspace.group.refreshPage", labelKey: "chat.refreshPage" }),
      Object.freeze({ id: "workspace.group.reload", labelKey: "chat.home" }),
      Object.freeze({ id: "workspace.group.messageNavigator", labelKey: "chat.messageNavigator" }),
      Object.freeze({ id: "workspace.group.deleteThread", labelKey: "chat.deleteThreadInGroup" }),
      Object.freeze({ id: "workspace.group.fullscreen", labelKey: "chat.fullscreen" }),
      Object.freeze({ id: "workspace.group.remove", labelKey: "chat.removeGroup" }),
      Object.freeze({ id: "workspace.group.more", labelKey: "chat.more" }),
      Object.freeze({ id: "workspace.tab.close", labelKey: "common.close" }),
      Object.freeze({ id: "workspace.tab.context.close", labelKey: "chat.closeTab" }),
      Object.freeze({ id: "workspace.tabs.pin", labelKey: "workspace.tabs.pin" }),
      Object.freeze({ id: "workspace.tabs.edit", labelKey: "workspace.tabs.edit" }),
      Object.freeze({ id: "workspace.tabs.delete", labelKey: "workspace.tabs.delete" }),
      Object.freeze({ id: "workspace.tabs.more", labelKey: "chat.more" }),
      Object.freeze({ id: "workspace.tabs.closeOthers", labelKey: "workspace.tabs.closeOthers" }),
      Object.freeze({ id: "workspace.tabs.newFolder", labelKey: "workspace.tabs.newFolder" }),
      Object.freeze({ id: "workspace.tabs.sort", labelKey: "workspace.tabs.sort" }),
      Object.freeze({ id: "workspace.tabs.sortTime", labelKey: "workspace.tabs.sortTime" }),
      Object.freeze({ id: "workspace.tabs.sortOpen", labelKey: "workspace.tabs.sortOpen" }),
      Object.freeze({ id: "workspace.tabs.sortName", labelKey: "workspace.tabs.sortName" }),
      Object.freeze({ id: "workspace.tabs.renameFolder", labelKey: "workspace.tabs.renameFolder" }),
      Object.freeze({ id: "workspace.tabs.deleteFolder", labelKey: "workspace.tabs.deleteFolder" }),
      Object.freeze({ id: "workspace.layout.add", labelKey: "layout.add" }),
      Object.freeze({ id: "workspace.layout.delete", labelKey: "layout.delete" }),
      Object.freeze({ id: "appPicker.addCustom", labelKey: "appPicker.addCustom" })
    ])
  }),
  Object.freeze({
    id: "summary",
    labelKey: "tooltip.group.summary",
    targets: Object.freeze([
      Object.freeze({ id: "summary.window.fullscreen", labelKey: "chat.fullscreen" }),
      Object.freeze({ id: "summary.window.close", labelKey: "common.close" }),
      Object.freeze({ id: "summary.source.refresh", labelKey: "summaryPanel.refreshMessages" }),
      Object.freeze({ id: "summary.action.pocket", labelKey: "summaryPanel.pocket" }),
      Object.freeze({ id: "summary.action.preview", labelKey: "summaryPanel.preview" }),
      Object.freeze({ id: "summary.action.summarize", labelKey: "summaryPanel.summarize" }),
      Object.freeze({ id: "summary.action.ask", labelKey: "summaryPanel.ask" })
    ])
  }),
  Object.freeze({
    id: "share",
    labelKey: "tooltip.group.share",
    targets: Object.freeze([
      Object.freeze({ id: "share.window.fullscreen", labelKey: "sharePanel.maximize" }),
      Object.freeze({ id: "share.window.close", labelKey: "common.close" }),
      Object.freeze({ id: "share.action.capture", labelKey: "sharePanel.capture" }),
      Object.freeze({ id: "share.action.stop", labelKey: "sharePanel.stop" }),
      Object.freeze({ id: "share.action.copy", labelKey: "sharePanel.copy" }),
      Object.freeze({ id: "share.action.download", labelKey: "sharePanel.download" }),
      Object.freeze({ id: "share.action.open", labelKey: "sharePanel.open" })
    ])
  }),
  Object.freeze({
    id: "pocket",
    labelKey: "tooltip.group.pocket",
    targets: Object.freeze([
      Object.freeze({ id: "pocket.fullscreen", labelKey: "chat.fullscreen" }),
      Object.freeze({ id: "pocket.copyUserMessage", labelKey: "pocket.copyUserMessage" }),
      Object.freeze({ id: "pocket.copyAssistantMessage", labelKey: "pocket.copyAssistantMessage" }),
      Object.freeze({ id: "pocket.openChat", labelKey: "pocket.openChat" }),
      Object.freeze({ id: "pocket.actions", labelKey: "pocket.actions" }),
      Object.freeze({ id: "pocket.focusMode", labelKey: "pocket.focusMode" }),
      Object.freeze({ id: "pocket.sidebar", labelKey: "pocket.sidebar" }),
      Object.freeze({ id: "pocket.deleteItem", labelKey: "pocket.deleteItem" })
    ])
  }),
  Object.freeze({
    id: "optimize",
    labelKey: "tooltip.group.optimize",
    targets: Object.freeze([
      Object.freeze({ id: "optimize.retry", labelKey: "optimize.retryOptimization" })
    ])
  }),
  Object.freeze({
    id: "settings",
    labelKey: "tooltip.group.settings",
    targets: Object.freeze([
      Object.freeze({ id: "settings.modal.fullscreen", labelKey: "chat.fullscreen" }),
      Object.freeze({ id: "settings.modal.close", labelKey: "common.close" }),
      Object.freeze({ id: "settings.profiles.promotion", labelKey: "profiles.openPromotionChannel" }),
      Object.freeze({ id: "settings.action.view", labelKey: "apps.viewDetails" }),
      Object.freeze({ id: "settings.action.edit", labelKey: "common.edit" }),
      Object.freeze({ id: "settings.action.duplicate", labelKey: "profiles.duplicate" }),
      Object.freeze({ id: "settings.action.delete", labelKey: "common.delete" }),
      Object.freeze({ id: "settings.action.reset", labelKey: "common.reset" }),
      Object.freeze({ id: "settings.action.insert", labelKey: "prompts.insert" }),
      Object.freeze({ id: "settings.action.copy", labelKey: "settings.action.copy" }),
      Object.freeze({ id: "settings.shortcuts.record", labelKey: "shortcuts.record" }),
      Object.freeze({ id: "settings.shortcuts.help", labelKey: "settings.shortcuts.help" }),
      Object.freeze({ id: "settings.apps.iframe.scopeHelp", labelKey: "apps.iframe.scopeHelp" }),
      Object.freeze({ id: "settings.apps.iframe.edit", labelKey: "apps.iframe.edit" }),
      Object.freeze({ id: "settings.apps.iframe.reset", labelKey: "apps.iframe.restoreDefault" }),
      Object.freeze({ id: "settings.apps.iframe.removeAttribute", labelKey: "apps.iframe.removeAttribute" }),
      Object.freeze({ id: "settings.models.allSources", labelKey: "modelPreferences.allSources" })
    ])
  })
]);

export const TOOLTIP_TARGET_IDS = Object.freeze(
  TOOLTIP_TARGET_GROUPS.flatMap((group) => group.targets.map((target) => target.id))
);

const OPTIMIZE_PROMPT_TEMPLATE_DEFAULT = `You are an AI prompt expert, skilled at analyzing and optimizing user-provided prompts.

Analyze the user prompt and rewrite it so it is clearer, more specific, and easier for an AI model to follow.

Constraints:
- Do not answer the user's prompt.
- Keep the user's intent and language.
- Return only the optimized prompt.`;

const SUMMARY_PANEL_PROMPT_DEFAULT = `Summarize the selected chat context. Keep the answer concise, factual, and useful.

When the user asks a follow-up question, answer from the provided context first and clearly say when the context is insufficient.`;

export const TOPIC_TITLE_PROMPT_DEFAULT = `You assign a short topic title to a chat tab.

Rules:
- Return only the title, nothing else.
- Keep the user's language.
- Use 3 to 12 words, or a short Chinese phrase.
- No quotes, markdown, wrapping punctuation, or explanation.
- Do not answer the user's request.`;

export const TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN = 100;
export const TOPBAR_PROMPT_PLACEHOLDER_MAX_COUNT = 30;
export const TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MIN_SEC = 1;
export const TOPBAR_PROMPT_PLACEHOLDER_INTERVAL_MAX_SEC = 3600;
export const TOPBAR_PROMPT_INPUT_FONT_SIZE_MIN_PX = 13;
export const TOPBAR_PROMPT_INPUT_FONT_SIZE_MAX_PX = 18;
export const DEFAULT_FRAME_TOAST_POSITION = Object.freeze({ x: 100, y: 100 });

export const DEFAULT_OPTIONS = {
  scriptConfigSchemaVersion: SCRIPT_CONFIG_SCHEMA_VERSION,
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
  frameLoadingOverlayOpacity: 82,
  modelPreferenceSelectionOverlayEnabled: true,
  modelPreferenceSelectionOverlayOpacity: 70,
  frameToastPosition: DEFAULT_FRAME_TOAST_POSITION,
  pocketCardSize: DEFAULT_POCKET_CARD_SIZE,
  tooltipDisabledIds: [],
  topbarPromptInputFontSize: 15,
  topbarPromptPlaceholderConfig: {
    items: [],
    mode: "refresh",
    order: "sequential",
    intervalSec: 10,
    state: {
      index: -1,
      lastRandom: -1
    }
  },
  tabGroupButtonsMode: "pinned",
  tabGroupButtonPlacement: DEFAULT_TAB_GROUP_BUTTON_PLACEMENT,
  tabGroupButtonOrder: DEFAULT_TAB_GROUP_BUTTON_ORDER,
  tabGroupButtonOrderMigrationVersion: TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION,
  tabContextMenuOrder: DEFAULT_TAB_CONTEXT_MENU_ORDER,
  tabContextMenuHiddenIds: [],
  tabsSidebarButtonPlacement: DEFAULT_TABS_SIDEBAR_BUTTON_PLACEMENT,
  tabsSidebarButtonOrder: DEFAULT_TABS_SIDEBAR_BUTTON_ORDER,
  appPickerSectionOrder: DEFAULT_APP_PICKER_SECTION_ORDER,
  appPickerAppOrders: DEFAULT_APP_PICKER_APP_ORDERS,
  topbarLayout: DEFAULT_TOPBAR_LAYOUT,
  topbarDeleteThreadMigrated: true,
  topbarSearchMigrated: true,
  topbarShareMigrated: true,
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
  apiProfileDefaultModelMigrationVersion: API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION,
  optimizeApiProfileId: "default-openai",
  summaryApiProfileId: "default-openai",
  topicTitleApiProfileId: "default-openai",
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
  modelPreferenceOrder: DEFAULT_MODEL_PREFERENCE_ORDER,
  modelPreferenceFailurePolicy: DEFAULT_MODEL_PREFERENCE_FAILURE_POLICY,
  modelPreferenceFailureOverrides: DEFAULT_MODEL_PREFERENCE_FAILURE_OVERRIDES,
  builtinChatAppIframeConfigs: {},
  iframePermissionsSource: "builtIn",
  messageNavigatorEffectMode: "border",
  recordFullText: false,
  messageNavigatorSiteConfigs: [],
  summarySiteConfigs: [],
  topicDeleteSiteConfigs: []
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
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Gemini",
    name: "Gemini",
    provider: "Google",
    url: "https://gemini.google.com/app",
    hosts: ["gemini.google.com", "*.gemini.google.com"],
    inputSelector: "rich-textarea div[contenteditable='true'], textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]",
    imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_BATCH
  },
  {
    id: "Grok",
    name: "Grok",
    provider: "xAI",
    url: "https://grok.com/",
    hosts: ["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i], button[aria-label*='Submit' i], button[aria-label*='发送' i], button[aria-label*='提交' i]",
    imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_BATCH,
    noSandbox: true
  },
  {
    id: "GrokMirror",
    name: "Grok Mirror",
    provider: "dairoot",
    url: "https://gk.dairoot.cn/",
    hosts: ["gk.dairoot.cn", "*.gk.dairoot.cn"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i], button[aria-label*='Submit' i], button[aria-label*='发送' i], button[aria-label*='提交' i]",
    imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_BATCH
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
    sendButtonSelector: "button[aria-label*='Send' i]",
    imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_BATCH
  },
  {
    id: "NotionAI",
    name: "Notion AI",
    provider: "Notion",
    url: "https://app.notion.com/ai",
    hosts: ["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"],
    inputSelector: "div[contenteditable='true'][role='textbox'], div[contenteditable='true'], div[role='textbox'], textarea",
    sendButtonSelector: "button[aria-label*='Submit AI message' i], button[aria-label*='Send' i]",
    imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_BATCH,
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
    name: "Kimi.com",
    provider: "Moonshot",
    url: "https://www.kimi.com/",
    hosts: ["kimi.com", "www.kimi.com", "*.kimi.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "KimiAI",
    name: "Kimi.ai",
    provider: "Moonshot",
    url: "https://www.kimi.ai/",
    hosts: ["kimi.ai", "www.kimi.ai", "*.kimi.ai"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "DouBao",
    name: "DouBao",
    provider: "ByteDance",
    url: "https://www.doubao.com/",
    hosts: ["doubao.com", "www.doubao.com", "*.doubao.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Dola",
    name: "Dola",
    provider: "ByteDance",
    url: "https://www.dola.com/chat/",
    hosts: ["dola.com", "www.dola.com", "*.dola.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Qwen",
    name: "Qwen",
    provider: "Alibaba",
    url: "https://chat.qwen.ai/",
    hosts: ["chat.qwen.ai", "qwen.ai", "www.qwen.ai", "*.qwen.ai"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i]"
  },
  {
    id: "Qianwen",
    name: "千问",
    provider: "Alibaba",
    url: "https://www.qianwen.com/",
    hosts: ["qianwen.com", "www.qianwen.com", "*.qianwen.com"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button[aria-label*='Send' i], button[aria-label*='发送' i]"
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
