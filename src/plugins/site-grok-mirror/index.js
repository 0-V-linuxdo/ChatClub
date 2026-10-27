import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig, modelConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteGrokMirror",
  appId: "GrokMirror",
  hosts: ["gk.dairoot.cn"],
  description: { zh: "Grok 镜像站点适配：Summary 采集（与 Grok 相同的页面结构）。", en: "Grok mirror adapter: Summary collection (same page structure as Grok)." },
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
      "id": "grokMirror",
      "name": "Grok Mirror",
      "appIds": [
        "GrokMirror"
      ],
      "hosts": [
        "gk.dairoot.cn"
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
      "id": "grokMirror",
      "name": "Grok Mirror",
      "adapter": "grok",
      "appIds": [
        "GrokMirror"
      ],
      "hosts": [
        "gk.dairoot.cn"
      ],
      "messageSelector": ".message-bubble",
      "userSelector": ".items-end",
      "assistantSelector": ".items-start",
      "textCleanupSelectors": [
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "grok-dairoot",
      "name": "Grok Mirror",
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
        "button[aria-label=\"Stop model response\"]"
      ],
      "hosts": [
        "gk.dairoot.cn"
      ]
    }),
  },
});
