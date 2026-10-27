import { defineSitePlugin, summaryConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SiteTypingMind",
  appId: "TypingMind",
  hosts: ["setapp.typingcloud.com", "typingmind.com"],
  description: { zh: "TypingMind 站点适配：Summary 采集。", en: "TypingMind adapter: Summary collection." },
  capabilities: {
    summary: summaryConfig({
      "id": "typingmind",
      "name": "TypingMind",
      "userscriptFile": "typingmind",
      "fallbackMode": "allowPageText",
      "officialRuleHints": {
        "userRoot": [
          "[data-element-id=\"user-message\"]"
        ],
        "assistantRoot": [
          "[data-element-id=\"ai-response\"]"
        ]
      },
      "hosts": [
        "setapp.typingcloud.com",
        "typingmind.com"
      ]
    }),
  },
});
