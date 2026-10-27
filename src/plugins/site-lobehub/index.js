import { defineSitePlugin, summaryConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteLobeHub",
  appId: "LobeHub",
  hosts: ["app.lobehub.com"],
  description: { zh: "LobeHub 站点适配：Summary 采集，读不到时退回页面文本。", en: "LobeHub adapter: Summary collection with page-text fallback." },
  capabilities: {
    summary: summaryConfig({
      "id": "lobehub",
      "name": "LobeHub",
      "userscriptFile": "lobehub",
      "userscriptTimeoutMs": 36000,
      "fallbackMode": "allowPageText",
      "officialRuleHints": {
        "messageRoot": [
          "[data-index] .message-wrapper",
          ".message-wrapper"
        ],
        "userRoleSignal": [
          "[data-placement=\"right\"]",
          ".message-wrapper.user"
        ],
        "assistantRoleSignal": [
          "[data-placement=\"left\"]",
          ".message-wrapper.assistant"
        ]
      },
      "hosts": [
        "app.lobehub.com"
      ]
    }),
  },
});
