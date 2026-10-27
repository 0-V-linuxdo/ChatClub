import { defineSitePlugin, summaryConfig, navigatorConfig, deleteConfig, modelConfig } from "../../lib/site-plugin.js";

const NOTION_HOST = /(^|\.)notion\.(so|com)$/i;
const RETRY_GAP_MS = 60_000;

/**
 * Notion's service worker can answer the first framed load from a cache that still carries X-Frame-Options;
 * the preflight lease (05 §6.3) refreshes that cache without the header, so a blocked Notion frame gets one
 * more load a moment later. At most one retry per column per minute.
 */
function retryBlockedFrames(ctx) {
  const nav = globalThis.chrome?.webNavigation;
  if (!nav?.onErrorOccurred || !chrome.tabs?.getCurrent) return;
  let ownTab = null;
  chrome.tabs.getCurrent((tab) => (ownTab = tab?.id ?? null));
  const retried = new Map();
  const onError = (d) => {
    let host = "";
    try {
      host = new URL(d.url).hostname;
    } catch {
      return;
    }
    if (d.tabId !== ownTab || d.frameId === 0 || !NOTION_HOST.test(host)) return;
    const workspace = ctx.services.get("workspace");
    const frames = ctx.services.get("frames");
    for (const tab of workspace?.groups?.().flatMap((g) => g.tabs) ?? []) {
      let tabHost = "";
      try {
        tabHost = new URL(tab.href || "").hostname;
      } catch {
        continue;
      }
      if (!NOTION_HOST.test(tabHost) || frames?.isRegistered?.(tab.frameKey)) continue;
      if (Date.now() - (retried.get(tab.id) ?? 0) < RETRY_GAP_MS) continue;
      retried.set(tab.id, Date.now());
      setTimeout(() => workspace.refreshTab?.(tab.id), 1500);
    }
  };
  nav.onErrorOccurred.addListener(onError);
  ctx.onDispose(() => nav.onErrorOccurred.removeListener(onError));
}

export default defineSitePlugin({
  name: "SiteNotion",
  appId: "NotionAI",
  hosts: ["app.notion.com", "notion.so"],
  description: { zh: "Notion AI 站点适配：Summary 采集，读不到时退回页面文本。", en: "Notion AI adapter: Summary collection with page-text fallback." },
  content: [{ id: "notion-bridge", bundle: "content/bridge.js", world: "MAIN", runAt: "document_start" }],
  start: retryBlockedFrames,
  capabilities: {
    model: modelConfig({
      "trigger": [
        "[aria-label*='model' i][role='button']",
        "[aria-label*='模型'][role='button']",
        "[data-testid*='model-picker']"
      ],
      "menuRoot": [
        "[role='menu']",
        "[role='listbox']",
        "[role='dialog']"
      ],
      "option": [
        "[role='menuitem']",
        "[role='option']",
        "[role='menuitemradio']"
      ],
      "efforts": {
        "none": [
          "none",
          "无"
        ],
        "minimal": [
          "minimal",
          "最低"
        ],
        "low": [
          "low",
          "低"
        ],
        "medium": [
          "medium",
          "中"
        ],
        "high": [
          "high",
          "高"
        ],
        "xhigh": [
          "extra high",
          "xhigh",
          "超高"
        ],
        "max": [
          "max",
          "最高"
        ]
      },
      "allSources": [
        "all sources",
        "全部来源",
        "所有来源"
      ]
    }),
    delete: deleteConfig({
      "id": "notion",
      "name": "Notion AI",
      "appIds": [
        "NotionAI"
      ],
      "hosts": [
        "app.notion.com",
        "notion.so"
      ],
      "timeoutMs": 15000,
      "flow": "headerMenu",
      "trusted": {
        "confirm": "always"
      },
      "trustedBudget": 1,
      "slots": {
        "headerMenuTrigger": "[aria-label*='More' i][role='button'], [aria-haspopup='menu'], [aria-haspopup='dialog'][role='button']",
        "menuRoot": "[role='menu'], [role='listbox']",
        "deleteCandidate": "[role='menuitem'], [role='option']",
        "dialog": "[role='dialog'], [role='alertdialog']",
        "confirmCandidate": "[role='button'], button"
      }
    }),
    navigator: navigatorConfig({
      "id": "notion",
      "name": "Notion AI",
      "adapter": "generic",
      "appIds": [
        "NotionAI"
      ],
      "hosts": [
        "app.notion.com",
        "notion.so"
      ],
      "messageSelector": "[data-agent-chat-user-step-id], [data-agent-chat-assistant-step-id]",
      "userSelector": "[data-agent-chat-user-step-id]",
      "assistantSelector": "[data-agent-chat-assistant-step-id]",
      "textCleanupSelectors": [
        "button"
      ]
    }),
    summary: summaryConfig({
      "id": "notion",
      "name": "Notion",
      "userscriptFile": "notion",
      "pathPrefixes": [
        "/chat",
        "/ai"
      ],
      "fallbackMode": "allowPageText",
      "officialRuleHints": {
        "userRoot": [
          "[data-testid=\"user-message\"]",
          ".notion-ai-chat-user-message"
        ],
        "assistantRoot": [
          "[data-testid=\"assistant-message\"]",
          ".notion-ai-chat-assistant-message"
        ]
      },
      "hosts": [
        "app.notion.com",
        "notion.so"
      ]
    }),
  },
});
