import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig, modelConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteDeepSeek",
  appId: "DeepSeek",
  hosts: ["deepseek.com"],
  description: { zh: "DeepSeek 站点适配：Summary 采集。", en: "DeepSeek adapter: Summary collection." },
  capabilities: {
    model: modelConfig({
      "trigger": [
        "[class*='model-selector']",
        "button[aria-haspopup='listbox']",
        "[role='button'][aria-haspopup]"
      ],
      "menuRoot": [
        ".ds-dropdown-menu",
        "[role='listbox']",
        "[role='menu']"
      ],
      "option": [
        ".ds-dropdown-menu-option",
        "[role='option']",
        "[role='menuitem']"
      ]
    }),
    delete: deleteConfig({
      "id": "deepseek",
      "name": "DeepSeek",
      "appIds": [
        "DeepSeek"
      ],
      "hosts": [
        "deepseek.com"
      ],
      "timeoutMs": 36000,
      "flow": "rowMenu",
      "headerFallback": true,
      "activateRepeats": 3,
      "trusted": {
        "open": "always"
      },
      "trustedBudget": 1,
      "slots": {
        "conversationLink": "a[href*='/chat/s/']",
        "conversationRow": "a",
        "menuTrigger": "[role='button'], .ds-icon-button, div[tabindex]",
        "headerMenuTrigger": "header [role='button'][aria-haspopup], header .ds-icon-button",
        "menuRoot": ".ds-dropdown-menu, .ds-floating-position-wrapper, [role='menu']",
        "deleteCandidate": ".ds-dropdown-menu-option, [role='menuitem']",
        "dialog": ".ds-modal, [role='dialog']",
        "confirmCandidate": ".ds-button--error, button, [role='button']"
      }
    }),
    navigator: navigatorConfig({
      "id": "deepseek",
      "name": "DeepSeek",
      "adapter": "deepseek",
      "appIds": [
        "DeepSeek"
      ],
      "hosts": [
        "deepseek.com"
      ],
      "messageSelector": ".ds-message",
      "userSelector": "",
      "assistantSelector": ".ds-markdown",
      "thinkingSelector": "",
      "textCleanupSelectors": [
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "deepseek",
      "name": "DeepSeek",
      "userscriptFile": "deepseek",
      "userscriptRunMode": "pageWorldFirst",
      "userscriptFallbackDelayMs": 1000,
      "userscriptTimeoutMs": 36000,
      "copyTimeoutMs": 3600,
      "roleFallback": "rest-user",
      "officialRuleHints": {
        "messageRoot": [
          ".ds-message",
          "[class*=\"ds-message\"]"
        ],
        "assistantRoleSignal": [
          ".ds-markdown"
        ],
        "cleanup": [
          ".ds-think-content"
        ]
      },
      "generating": [
        "div[role=\"button\"][aria-label*=\"Stop\"]"
      ],
      "hosts": [
        "deepseek.com"
      ]
    }),
  },
});
