import { defineSitePlugin, summaryConfig } from "../../lib/site-plugin.js";

const SITES = [
  {
    "id": "perplexity",
    "name": "Perplexity",
    "appId": "Perplexity",
    "hosts": [
      "perplexity.ai"
    ],
    "officialRuleHints": {
      "userRoot": [
        "[class*=\"group/query\"]",
        "h1[class*=\"query\"]"
      ],
      "assistantRoot": [
        "[id^=\"markdown-content-\"]",
        ".prose"
      ]
    }
  },
  {
    "id": "kimi",
    "name": "Kimi.com",
    "appId": "Kimi",
    "hosts": [
      "kimi.com",
      "kimi.moonshot.cn"
    ],
    "officialRuleHints": {
      "userRoot": [
        ".chat-content-item-user .user-content",
        ".chat-content-item-user"
      ],
      "assistantRoot": [
        ".chat-content-item-assistant .markdown",
        ".chat-content-item-assistant"
      ]
    }
  },
  {
    "id": "kimiAi",
    "name": "Kimi.ai",
    "appId": "KimiAI",
    "hosts": [
      "kimi.ai"
    ],
    "officialRuleHints": {
      "userRoot": [
        ".chat-content-item-user"
      ],
      "assistantRoot": [
        ".chat-content-item-assistant"
      ]
    }
  },
  {
    "id": "doubao",
    "name": "DouBao",
    "appId": "DouBao",
    "hosts": [
      "doubao.com"
    ],
    "officialRuleHints": {
      "userRoot": [
        "[data-testid=\"send_message\"]"
      ],
      "assistantRoot": [
        "[data-testid=\"receive_message\"]"
      ]
    }
  },
  {
    "id": "dola",
    "name": "Dola",
    "appId": "Dola",
    "hosts": [
      "dola.com"
    ],
    "officialRuleHints": {
      "userRoot": [
        "[data-testid=\"send_message\"]"
      ],
      "assistantRoot": [
        "[data-testid=\"receive_message\"]"
      ]
    }
  },
  {
    "id": "qwen",
    "name": "Qwen",
    "appId": "Qwen",
    "hosts": [
      "chat.qwen.ai"
    ],
    "officialRuleHints": {
      "userRoot": [
        ".user-message-content",
        ".chat-user-message"
      ],
      "assistantRoot": [
        ".response-message-content",
        ".chat-response-message"
      ]
    }
  },
  {
    "id": "qianwen",
    "name": "千问",
    "appId": "Qianwen",
    "hosts": [
      "qianwen.com"
    ],
    "officialRuleHints": {
      "userRoot": [
        "[class*=\"questionItem\"]"
      ],
      "assistantRoot": [
        "[class*=\"answerItem\"]"
      ]
    }
  }
];

// One plugin covers several sites that only ship selector slots: one adapter contribution per site.
const plugin = defineSitePlugin({
  name: "SiteGenericSlots",
  appId: "Perplexity",
  hosts: SITES.flatMap((s) => s.hosts),
  description: { zh: "其他站点（Perplexity、Kimi、豆包、Dola、Qwen、千问）的 Summary 官方规则槽位，读不到时退回页面文本。", en: "Summary selector slots for Perplexity, Kimi, DouBao, Dola, Qwen and Qianwen, with page-text fallback." },
  capabilities: {},
});
plugin.app = {
  start(ctx) {
    for (const s of SITES) {
      const { appId, ...summary } = s;
      ctx.contribute("site.adapter", { id: appId, appId, hosts: s.hosts, capabilities: { summary: summaryConfig({ ...summary, fallbackMode: "allowPageText" }) } });
    }
  },
};
export default plugin;
