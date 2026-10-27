import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig, modelConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteGrok",
  appId: "Grok",
  hosts: ["grok.com", "grok.x.ai"],
  description: { zh: "Grok 站点适配：Summary 采集（站点复制按钮）。", en: "Grok adapter: Summary collection with the site's copy buttons." },
  content: [{ id: "compat-grok", bundle: "content/compat.js", world: "MAIN", runAt: "document_start" }],
  capabilities: {
    model: modelConfig({
      "trigger": [
        "button[aria-label='Model select']",
        "button[id^='model-select']",
        "button[aria-label*='model' i]"
      ],
      "menuRoot": [
        "[role='menu']",
        "[role='listbox']"
      ],
      "option": [
        "[role='menuitem']",
        "[role='option']"
      ],
      "readBack": true,
      "closesOnSelect": true,
      "alwaysOpen": true
    }),
    delete: deleteConfig({
      "id": "grok",
      "name": "Grok",
      "appIds": [
        "Grok"
      ],
      "hosts": [
        "grok.com",
        "grok.x.ai"
      ],
      "timeoutMs": 15000,
      "flow": "headerMenu",
      "dialogOptional": true,
      "trusted": {},
      "slots": {
        "conversationLink": "a[href*='/c/'], a[href*='/chat/']",
        "headerMenuTrigger": "header button[aria-haspopup='menu'], button[aria-label='More'], button[aria-label='更多']",
        "menuRoot": "[role='menu']",
        "deleteCandidate": "[role='menuitem']",
        "dialog": "[role='dialog'], [role='alertdialog']",
        "confirmCandidate": "button"
      }
    }),
    navigator: navigatorConfig({
      "id": "grok",
      "name": "Grok",
      "adapter": "grok",
      "appIds": [
        "Grok"
      ],
      "hosts": [
        "grok.com",
        "grok.x.ai"
      ],
      "messageSelector": ".message-bubble",
      "userSelector": ".items-end",
      "assistantSelector": ".items-start",
      "textCleanupSelectors": [
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "grok",
      "name": "Grok",
      "userscriptFile": "grok",
      "userscriptRunMode": "pageWorldFirst",
      "userscriptFallbackDelayMs": 1000,
      "userscriptTimeoutMs": 36000,
      "copyTimeoutMs": 3600,
      "officialRuleHints": {
        "messageRoot": [
          "div[id^=\"response-\"]"
        ],
        "userRoleSignal": [
          "div[id^=\"response-\"].items-end"
        ],
        "assistantRoleSignal": [
          "div[id^=\"response-\"].items-start"
        ],
        "messageCopy": [
          "button[aria-label=\"Copy\"]",
          "button[aria-label=\"复制\"]"
        ]
      },
      "generating": [
        "button[aria-label=\"Stop model response\"]",
        "button[aria-label=\"Stop\"]"
      ],
      "hosts": [
        "grok.com",
        "grok.x.ai"
      ]
    }),
  },
});
