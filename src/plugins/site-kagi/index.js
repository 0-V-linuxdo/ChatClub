import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteKagi",
  appId: "Kagi",
  hosts: ["assistant.kagi.com"],
  description: { zh: "Kagi Assistant 站点适配：Summary 采集，结构化读不到时退回页面文本。", en: "Kagi Assistant adapter: Summary collection with page-text fallback." },
  capabilities: {
    delete: deleteConfig({
      "id": "kagi",
      "name": "Kagi",
      "appIds": [
        "Kagi"
      ],
      "hosts": [
        "assistant.kagi.com"
      ],
      "timeoutMs": 15000,
      "flow": "shortcut",
      "trusted": {},
      "slots": {
        "conversationLink": "a[href*='/c/'], a[href*='/chat/']",
        "dialog": "[role='dialog'], [role='alertdialog'], dialog[open]",
        "confirmCandidate": "button"
      }
    }),
    navigator: navigatorConfig({
      "id": "kagi",
      "name": "Kagi",
      "adapter": "kagi",
      "appIds": [
        "Kagi"
      ],
      "hosts": [
        "assistant.kagi.com"
      ],
      "messageSelector": "[data-author], .chat_bubble",
      "userSelector": "[data-author='user'], .chat_bubble.user",
      "assistantSelector": "[data-author='assistant'], .chat_bubble.assistant",
      "textCleanupSelectors": [
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "kagi",
      "name": "Kagi Assistant",
      "userscriptFile": "kagi",
      "userscriptTimeoutMs": 32000,
      "copyTimeoutMs": 3600,
      "fallbackMode": "allowPageText",
      "officialRuleHints": {
        "messageRoot": [
          ".chat-item",
          "[data-author]"
        ],
        "userRoleSignal": [
          ".chat-item.user",
          "[data-author=\"user\"]"
        ],
        "assistantRoleSignal": [
          ".chat-item.assistant",
          "[data-author=\"assistant\"]"
        ]
      },
      "hosts": [
        "assistant.kagi.com"
      ]
    }),
  },
});
