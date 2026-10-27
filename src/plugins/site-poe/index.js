import { defineSitePlugin, summaryConfig, navigatorConfig } from "../../lib/site-plugin.js";

export default defineSitePlugin({
  name: "SitePoe",
  appId: "Poe",
  hosts: ["poe.com"],
  description: { zh: "Poe 站点适配：Summary 官方规则槽位。", en: "Poe adapter: Summary official selector slots." },
  capabilities: {
    navigator: navigatorConfig({
      "id": "poe",
      "name": "Poe",
      "adapter": "poe",
      "appIds": [
        "Poe"
      ],
      "hosts": [
        "poe.com"
      ],
      "messageSelector": "[class*='ChatMessage_chatMessage']",
      "userSelector": "[class*='rightSideMessage']",
      "assistantSelector": "[class*='leftSideMessage']",
      "textCleanupSelectors": [
        "button",
        "[class*='ChatMessageActionBar']"
      ]
    }),
    summary: summaryConfig({
      "id": "poe",
      "name": "Poe",
      "fallbackMode": "allowPageText",
      "officialRuleHints": {
        "userRoot": [
          "[class*=\"Message_rightSideMessageBubble\"]",
          "[class*=\"Message_humanMessageBubble\"]"
        ],
        "assistantRoot": [
          "[class*=\"Message_leftSideMessageBubble\"]",
          "[class*=\"Message_botMessageBubble\"]"
        ]
      },
      "hosts": [
        "poe.com"
      ]
    }),
  },
});
