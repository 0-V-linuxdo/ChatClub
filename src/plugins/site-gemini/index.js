import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig, modelConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteGemini",
  appId: "Gemini",
  hosts: ["gemini.google.com", "bard.google.com"],
  description: { zh: "Gemini 站点适配：Summary 采集。", en: "Gemini adapter: Summary collection." },
  capabilities: {
    model: modelConfig({
      "trigger": [
        "[data-test-id='bard-mode-menu-button']",
        "button.input-area-switch",
        "button[aria-haspopup='menu'][aria-label*='mode' i]"
      ],
      "menuRoot": [
        ".cdk-overlay-container [role='menu']",
        ".cdk-overlay-container .mat-mdc-menu-panel"
      ],
      "option": [
        "[role='menuitem']",
        "[role='menuitemradio']",
        "button.bard-mode-list-button"
      ],
      "thinking": {
        "extended": [
          "extended thinking",
          "extended",
          "deep think",
          "扩展思考",
          "扩展"
        ],
        "standard": [
          "standard",
          "标准"
        ]
      }
    }),
    delete: deleteConfig({
      "id": "gemini",
      "name": "Gemini",
      "appIds": [
        "Gemini"
      ],
      "hosts": [
        "gemini.google.com"
      ],
      "timeoutMs": 24000,
      "flow": "rowMenu",
      "headerFallback": true,
      "trusted": {
        "open": "always",
        "pick": "retry",
        "confirm": "retry"
      },
      "trustedBudget": 3,
      "slots": {
        "conversationLink": "a[data-test-id='conversation'][href*='/app/'], a.mat-mdc-list-item[href*='/app/']",
        "conversationRow": "[data-test-id='conversation'], .conversation-items-container, li",
        "menuTrigger": "[data-test-id='actions-menu-button'], button[aria-haspopup='menu'], button[aria-haspopup='true']",
        "headerMenuTrigger": "conversation-actions-icon button, [data-test-id='conversation-actions-menu-icon-button'], button[aria-label*='conversation actions' i]",
        "menuRoot": "gem-menu[role='menu'], .cdk-overlay-container [role='menu'], .cdk-overlay-container .mat-mdc-menu-panel",
        "deleteCandidate": "[data-test-id='delete-button'], [role='menuitem'], button",
        "dialog": "mat-dialog-container, .cdk-overlay-container [role='dialog']",
        "confirmCandidate": "[data-test-id='confirm-button'], button"
      }
    }),
    navigator: navigatorConfig({
      "id": "gemini",
      "name": "Gemini",
      "adapter": "gemini",
      "appIds": [
        "Gemini"
      ],
      "hosts": [
        "gemini.google.com",
        "bard.google.com"
      ],
      "messageSelector": "user-query, model-response",
      "userSelector": "user-query",
      "assistantSelector": "model-response",
      "thinkingSelector": "model-thoughts",
      "textCleanupSelectors": [
        ".cdk-visually-hidden",
        "model-thoughts",
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "gemini",
      "name": "Gemini",
      "userscriptFile": "gemini",
      "userscriptTimeoutMs": 20000,
      "copyTimeoutMs": 1400,
      "officialRuleHints": {
        "userRoot": [
          "user-query .query-text",
          "user-query"
        ],
        "assistantRoot": [
          "model-response message-content",
          "model-response"
        ],
        "messageCopy": [
          "copy-button button",
          "button[data-test-id=\"copy-button\"]",
          "button[aria-label=\"Copy\"]"
        ],
        "cleanup": [
          ".cdk-visually-hidden",
          "sources-carousel-inline",
          "response-container-footer"
        ]
      },
      "generating": [
        "button[aria-label=\"Stop response\"]",
        ".stop-icon"
      ],
      "hosts": [
        "gemini.google.com",
        "bard.google.com"
      ]
    }),
  },
});
