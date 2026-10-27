// Built-in chat apps (v2 05 §1.2). App ids are PascalCase and case-sensitive (stored in layouts, icons, orders). Site-specific selectors are adapter data and may change with the sites.
// section: international | aggregator | chinese

export const BUILTIN_APPS = [
  { id: "ChatGPT", name: "ChatGPT", provider: "OpenAI", url: "https://chatgpt.com/", hosts: ["chatgpt.com", "chat.openai.com"], section: "international", imagePasteStrategy: "sequential", sendSelector: 'button[data-testid="send-button"]', newChatPaths: ["/"] },
  { id: "Claude", name: "Claude", provider: "Anthropic", url: "https://claude.ai/new", hosts: ["claude.ai"], section: "international", imagePasteStrategy: "sequential", newChatPaths: ["/new", "/"] },
  { id: "Gemini", name: "Gemini", provider: "Google", url: "https://gemini.google.com/app", hosts: ["gemini.google.com"], section: "international", imagePasteStrategy: "batch", pasteTextWithImages: true, newChatPaths: ["/app"] },
  { id: "Grok", name: "Grok", provider: "xAI", url: "https://grok.com/", hosts: ["grok.com"], section: "international", imagePasteStrategy: "batch", pasteTextWithImages: true, isolatedPaste: true, noSandbox: true, newChatPaths: ["/"] },
  { id: "GrokMirror", name: "GrokMirror", provider: "Grok", url: "https://gk.dairoot.cn/", hosts: ["gk.dairoot.cn"], section: "aggregator", imagePasteStrategy: "batch", pasteTextWithImages: true, isolatedPaste: true, siteAs: "Grok", newChatPaths: ["/"] },
  { id: "DeepSeek", name: "DeepSeek", provider: "DeepSeek", url: "https://chat.deepseek.com/", hosts: ["chat.deepseek.com"], section: "chinese", imagePasteStrategy: "sequential", newChatPaths: ["/"] },
  { id: "Kagi", name: "Kagi", provider: "Kagi", url: "https://assistant.kagi.com/", hosts: ["assistant.kagi.com"], section: "aggregator", imagePasteStrategy: "batch", pasteTextWithImages: true, noTextInputFallback: true, newChatPaths: ["/"] },
  { id: "NotionAI", name: "NotionAI", provider: "Notion", url: "https://app.notion.com/ai", hosts: ["app.notion.com", "notion.so", "www.notion.so"], section: "aggregator", imagePasteStrategy: "notion-bridge", noSandbox: true, newChatPaths: ["/ai"] },
  { id: "Perplexity", name: "Perplexity", provider: "Perplexity", url: "https://www.perplexity.ai/", hosts: ["perplexity.ai"], section: "international", imagePasteStrategy: "sequential", newChatPaths: ["/"] },
  { id: "Poe", name: "Poe", provider: "Quora", url: "https://poe.com/", hosts: ["poe.com"], section: "aggregator", imagePasteStrategy: "sequential" },
  { id: "Kimi", name: "Kimi", provider: "Moonshot", url: "https://www.kimi.com/", hosts: ["kimi.com", "kimi.moonshot.cn"], section: "chinese", imagePasteStrategy: "sequential", newChatPaths: ["/"] },
  { id: "KimiAI", name: "KimiAI", provider: "Moonshot", url: "https://www.kimi.ai/", hosts: ["kimi.ai"], section: "international", imagePasteStrategy: "sequential", newChatPaths: ["/"] },
  { id: "DouBao", name: "DouBao", provider: "ByteDance", url: "https://www.doubao.com/", hosts: ["doubao.com"], section: "chinese", imagePasteStrategy: "sequential", newChatPaths: ["/", "/chat"] },
  { id: "Dola", name: "Dola", provider: "ByteDance", url: "https://www.dola.com/chat/", hosts: ["dola.com"], section: "international", imagePasteStrategy: "sequential", newChatPaths: ["/chat"] },
  { id: "Qwen", name: "Qwen", provider: "Alibaba", url: "https://chat.qwen.ai/", hosts: ["chat.qwen.ai"], section: "international", imagePasteStrategy: "sequential", newChatPaths: ["/"] },
  { id: "Qianwen", name: "千问", provider: "Alibaba", url: "https://www.qianwen.com/", hosts: ["qianwen.com"], section: "chinese", imagePasteStrategy: "sequential", newChatPaths: ["/"] },
  { id: "TypingMind", name: "TypingMind", provider: "TypingMind", url: "https://setapp.typingcloud.com/", hosts: ["setapp.typingcloud.com", "typingmind.com"], section: "aggregator", imagePasteStrategy: "sequential" },
  { id: "LobeHub", name: "LobeHub", provider: "LobeHub", url: "https://app.lobehub.com/", hosts: ["app.lobehub.com"], section: "aggregator", imagePasteStrategy: "sequential" },
];

export const DEFAULT_LAYOUT_APPS = [["ChatGPT"], ["Gemini"], ["Grok"]];
export const DEFAULT_LAYOUT_APPS_ZH = [["Kimi"], ["DouBao"], ["Qianwen"]];

export function hostMatches(hostname, hosts) {
  const h = String(hostname || "").toLowerCase();
  return hosts.some((host) => h === host || h.endsWith(`.${host}`));
}

/** Merges built-ins with user custom apps; custom apps may not reuse a built-in id. */
/** Normalizes the stored customConfig array (v2 07 §1.4). */
export function normalizeCustomConfig(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name ?? "").trim();
    const url = String(raw.url ?? "").trim();
    if (!name || !/^https?:\/\//i.test(url)) continue;
    let id = typeof raw.id === "string" && raw.id ? raw.id : `custom-app-${Math.random().toString(36).slice(2, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let hosts = Array.isArray(raw.hosts) ? raw.hosts.filter((x) => typeof x === "string" && x) : [];
    if (!hosts.length) {
      try {
        hosts = [new URL(url).hostname.replace(/^www\./, "")];
      } catch {
        continue;
      }
    }
    out.push({
      ...raw,
      id,
      name,
      url,
      provider: raw.provider || "Custom",
      inputSelector: typeof raw.inputSelector === "string" ? raw.inputSelector : "",
      sendButtonSelector: typeof raw.sendButtonSelector === "string" ? raw.sendButtonSelector : "",
      imagePasteStrategy: raw.imagePasteStrategy === "batch" ? "batch" : "sequential",
      hosts,
    });
  }
  return out;
}

/** Built-ins (in the user's order) followed by custom apps; custom ids that clash with built-ins are dropped. */
export function mergeApps(builtins, custom = [], order = []) {
  const ids = new Set(builtins.map((a) => a.id));
  const pos = new Map((Array.isArray(order) ? order : []).map((id, i) => [id, i]));
  const sorted = builtins
    .map((a, i) => ({ a, rank: pos.has(a.id) ? pos.get(a.id) : 10000 + i }))
    .sort((x, y) => x.rank - y.rank)
    .map((x) => x.a);
  const out = sorted.map((a) => ({ ...a, builtin: true }));
  for (const app of normalizeCustomConfig(custom)) {
    if (ids.has(app.id)) continue;
    ids.add(app.id);
    const { sendButtonSelector, ...rest } = app;
    out.push({ ...rest, sendSelector: sendButtonSelector || undefined, section: "custom", builtin: false });
  }
  return out;
}

export function allHosts(apps) {
  return [...new Set(apps.flatMap((a) => a.hosts))].sort();
}
