import { defineSitePlugin, summaryConfig } from "../../../lib/site-plugin.js";

// Dev only (left out of release builds): a site adapter for the local test chat page used in smoke tests.
export default defineSitePlugin({
  name: "SiteLocalTest",
  appId: "LocalTest",
  hosts: ["127.0.0.1"],
  description: { zh: "开发用：本地测试聊天页的站点适配。", en: "Dev: site adapter for the local test chat page." },
  capabilities: {
    summary: summaryConfig({
      id: "localtest",
      name: "Local Test",
      hosts: ["127.0.0.1"],
      userscriptFile: "localtest",
      officialRuleHints: {
        messageRoot: ["[data-message-author-role]"],
        userRoleSignal: ['[data-message-author-role="user"]'],
        assistantRoleSignal: ['[data-message-author-role="assistant"]'],
        messageCopy: ['button[data-testid="copy-turn-action-button"]'],
      },
      generating: ['button[data-testid="stop-button"]'],
    }),
  },
});
