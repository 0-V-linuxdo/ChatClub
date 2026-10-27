import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteClaude",
  appId: "Claude",
  hosts: ["claude.ai"],
  description: { zh: "Claude 站点适配：Summary 采集。", en: "Claude adapter: Summary collection." },
  content: [{ id: "compat-claude", bundle: "content/compat.js", world: "MAIN", runAt: "document_start" }],
  capabilities: {
    delete: deleteConfig({
      "id": "claude",
      "name": "Claude",
      "appIds": [
        "Claude"
      ],
      "hosts": [
        "claude.ai"
      ],
      "timeoutMs": 15000,
      "flow": "titleMenu",
      "trusted": {
        "open": "retry",
        "pick": "retry",
        "confirm": "retry"
      },
      "trustedBudget": 1,
      "slots": {
        "conversationLink": "a[href*='/chat/']",
        "menuTrigger": "button[aria-haspopup], button[data-testid='chat-menu-trigger']",
        "menuRoot": "[role='menu']",
        "deleteCandidate": "[role='menuitem']",
        "dialog": "[role='dialog'], [role='alertdialog']",
        "confirmCandidate": "button[data-testid='delete-modal-confirm'], button"
      }
    }),
    navigator: navigatorConfig({
      "id": "claude",
      "name": "Claude",
      "adapter": "claude",
      "appIds": [
        "Claude"
      ],
      "hosts": [
        "claude.ai"
      ],
      "messageSelector": "[data-testid='user-message'], .font-claude-response, .font-claude-message",
      "userSelector": "[data-testid='user-message']",
      "assistantSelector": ".font-claude-response, .font-claude-message",
      "textCleanupSelectors": [
        ".sr-only",
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "claude",
      "name": "Claude",
      "userscriptFile": "claude",
      "pathPrefixes": [
        "/chat",
        "/new"
      ],
      "officialRuleHints": {
        "userRoot": [
          "[data-testid=\"user-message\"]"
        ],
        "assistantRoot": [
          ".font-claude-response",
          ".font-claude-message",
          "[data-testid=\"assistant-message\"]"
        ],
        "messageCopy": [
          "button[data-testid=\"action-bar-copy\"]"
        ],
        "cleanup": [
          ".sr-only"
        ]
      },
      "generating": [
        "[data-is-streaming=\"true\"]",
        "button[aria-label=\"Stop response\"]"
      ],
      "hosts": [
        "claude.ai"
      ]
    }),
  },
});
