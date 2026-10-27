import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteChatGPT",
  appId: "ChatGPT",
  hosts: ["chatgpt.com", "chat.openai.com"],
  description: { zh: "ChatGPT 站点适配：Summary 采集（逐条点击站点自带的复制按钮）。", en: "ChatGPT adapter: Summary collection through the site's own copy buttons." },
  capabilities: {
    delete: deleteConfig({
      "id": "chatgpt",
      "name": "ChatGPT",
      "appIds": [
        "ChatGPT"
      ],
      "hosts": [
        "chatgpt.com",
        "chat.openai.com"
      ],
      "timeoutMs": 15000,
      "flow": "shortcut",
      "trusted": {
        "open": "retry"
      },
      "slots": {
        "conversationLink": "nav a[href*='/c/']",
        "dialog": "[role='dialog'], [role='alertdialog']",
        "confirmCandidate": "button[data-testid='delete-conversation-confirm-button'], button"
      }
    }),
    navigator: navigatorConfig({
      "id": "chatgpt",
      "name": "ChatGPT",
      "adapter": "chatgpt",
      "appIds": [
        "ChatGPT"
      ],
      "hosts": [
        "chatgpt.com",
        "chat.openai.com"
      ],
      "messageSelector": "[data-message-author-role]",
      "userSelector": "[data-message-author-role='user']",
      "assistantSelector": "[data-message-author-role='assistant']",
      "textCleanupSelectors": [
        ".sr-only",
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "chatgpt",
      "name": "ChatGPT",
      "userscriptFile": "chatgpt",
      "userscriptRunMode": "pageWorldFirst",
      "officialRuleHints": {
        "conversationRoot": [
          "main"
        ],
        "messageRoot": [
          "[data-message-author-role]"
        ],
        "userRoleSignal": [
          "[data-message-author-role=\"user\"]"
        ],
        "assistantRoleSignal": [
          "[data-message-author-role=\"assistant\"]"
        ],
        "messageCopy": [
          "button[data-testid=\"copy-turn-action-button\"]"
        ],
        "cleanup": [
          ".sr-only"
        ]
      },
      "generating": [
        "button[data-testid=\"stop-button\"]"
      ],
      "hosts": [
        "chatgpt.com",
        "chat.openai.com"
      ]
    }),
  },
});
