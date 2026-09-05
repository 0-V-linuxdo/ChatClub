// Lightweight Summary catalog. Built-in source bodies live only in userscripts/*.js
// and are fetched on demand by loadBuiltInSummarySource().
export const SUMMARY_SITE_CONFIGS = Object.freeze([
  {
    id: "chatgpt", name: "ChatGPT", configVersion: 56,
    hosts: ["chatgpt.com", "*.chatgpt.com", "chat.openai.com", "*.chat.openai.com"],
    userscriptRunMode: "pageWorldFirst",
    userscriptFile: "chatgpt.js", userscriptLength: 3484
  },
  {
    id: "claude", name: "Claude", configVersion: 39,
    hosts: ["claude.ai", "*.claude.ai"], pathPrefixes: ["/chat", "/new"],
    userscriptFile: "claude.js", userscriptLength: 17802
  },
  {
    id: "gemini", name: "Gemini", configVersion: 35,
    hosts: ["gemini.google.com", "*.gemini.google.com"],
    userscriptTimeoutMs: 20000, copyTimeoutMs: 1400,
    userscriptFile: "gemini.js", userscriptLength: 9017
  },
  {
    id: "deepseek", name: "DeepSeek", configVersion: 63,
    hosts: ["deepseek.com", "*.deepseek.com"],
    userscriptRunMode: "pageWorldFirst", userscriptTimeoutMs: 36000,
    copyTimeoutMs: 3600, userscriptFallbackDelayMs: 1000,
    userscriptFile: "deepseek.js", userscriptLength: 23179
  },
  {
    id: "grok", name: "Grok", configVersion: 67,
    hosts: ["grok.com", "*.grok.com", "grok.x.ai", "*.grok.x.ai"],
    userscriptRunMode: "pageWorldFirst", userscriptTimeoutMs: 36000,
    copyTimeoutMs: 3600, userscriptFallbackDelayMs: 1000,
    userscriptFile: "grok.js", userscriptLength: 13568
  },
  {
    id: "grok-dairoot", name: "Grok Mirror", configVersion: 73,
    hosts: ["gk.dairoot.cn", "*.gk.dairoot.cn"],
    userscriptFile: "grok-dairoot.js", userscriptLength: 13568, userscriptRunMode: "pageWorldFirst",
    userscriptTimeoutMs: 36000, copyTimeoutMs: 3600, userscriptFallbackDelayMs: 1000
  },
  {
    id: "kagi", name: "Kagi Assistant", configVersion: 67,
    hosts: ["assistant.kagi.com"], userscriptTimeoutMs: 32000, copyTimeoutMs: 3600,
    userscriptFile: "kagi.js", userscriptLength: 4343
  },
  {
    id: "notion", name: "Notion", configVersion: 73,
    hosts: ["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"], pathPrefixes: ["/chat", "/ai"],
    userscriptFile: "notion.js", userscriptLength: 8827
  },
  {
    id: "lobehub", name: "LobeHub", configVersion: 49,
    hosts: ["app.lobehub.com", "*.lobehub.com"], pathPrefixes: ["/"], userscriptTimeoutMs: 36000,
    userscriptFile: "lobehub.js", userscriptLength: 14030
  },
  {
    id: "typingmind", name: "TypingMind", configVersion: 48,
    hosts: ["setapp.typingcloud.com", "*.typingcloud.com"],
    userscriptFile: "typingmind.js", userscriptLength: 3232
  },
  {
    id: "manus", name: "Manus", configVersion: 6,
    hosts: ["manus.im"],
    userscriptRunMode: "pageWorldFirst", userscriptTimeoutMs: 36000,
    copyTimeoutMs: 3600, userscriptFallbackDelayMs: 1000,
    userscriptFile: "manus.js", userscriptLength: 21440
  },
  {
    id: "poe", name: "Poe", configVersion: 1,
    hosts: ["poe.com", "*.poe.com"],
    userscriptFile: "poe.js", userscriptLength: 10
  },
  {
    id: "aiStudio", name: "AI Studio", configVersion: 1,
    hosts: ["aistudio.google.com"],
    userscriptFile: "ai-studio.js", userscriptLength: 10
  },
  {
    id: "lechat", name: "LeChat", configVersion: 1,
    hosts: ["chat.mistral.ai"],
    userscriptFile: "lechat.js", userscriptLength: 10
  },
  {
    id: "perplexity", name: "Perplexity", configVersion: 1,
    hosts: ["perplexity.ai", "*.perplexity.ai"],
    userscriptFile: "perplexity.js", userscriptLength: 10
  },
  {
    id: "kimi", name: "Kimi.com", configVersion: 1,
    hosts: ["kimi.com", "www.kimi.com", "*.kimi.com"],
    userscriptFile: "kimi.js", userscriptLength: 10
  },
  {
    id: "kimiAi", name: "Kimi.ai", configVersion: 1,
    hosts: ["kimi.ai", "www.kimi.ai", "*.kimi.ai"],
    userscriptFile: "kimi-ai.js", userscriptLength: 10
  },
  {
    id: "doubao", name: "DouBao", configVersion: 1,
    hosts: ["doubao.com", "www.doubao.com", "*.doubao.com"],
    userscriptFile: "doubao.js", userscriptLength: 10
  },
  {
    id: "dola", name: "Dola", configVersion: 1,
    hosts: ["dola.com", "www.dola.com", "*.dola.com"],
    userscriptFile: "dola.js", userscriptLength: 10
  },
  {
    id: "qwen", name: "Qwen", configVersion: 1,
    hosts: ["chat.qwen.ai", "qwen.ai", "www.qwen.ai", "*.qwen.ai"],
    userscriptFile: "qwen.js", userscriptLength: 10
  },
  {
    id: "qianwen", name: "千问", configVersion: 1,
    hosts: ["qianwen.com", "www.qianwen.com", "*.qianwen.com"],
    userscriptFile: "qianwen.js", userscriptLength: 10
  }
].map(Object.freeze));

function summaryDescriptor(idOrFile) {
  const key = String(idOrFile || "");
  return SUMMARY_SITE_CONFIGS.find((item) => item.id === key || item.userscriptFile === key) || null;
}

function summaryBody(source, file) {
  const normalized = String(source || "").replace(/\r\n?/g, "\n");
  const header = normalized.match(/^(?:\/\/[^\n]*\n)+\s*/);
  if (!header || !/Summary userscript/.test(header[0])) throw new Error(`${file}: invalid Summary userscript header`);
  const body = normalized.slice(header[0].length).trim();
  if (!body) throw new Error(`${file}: Summary userscript body is empty`);
  return body;
}

export async function loadBuiltInSummarySource(idOrFile, options = {}) {
  const descriptor = summaryDescriptor(idOrFile);
  if (!descriptor) throw new Error(`Unknown built-in Summary userscript: ${String(idOrFile || "")}`);
  const url = new URL(`../userscripts/${descriptor.userscriptFile}`, import.meta.url);
  const fetchSource = options.fetchSource || (async (sourceUrl) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to load ${descriptor.userscriptFile}: HTTP ${response.status}`);
    return response.text();
  });
  const body = summaryBody(await fetchSource(url, descriptor), descriptor.userscriptFile);
  if (body.length !== descriptor.userscriptLength) {
    throw new Error(`${descriptor.userscriptFile}: expected ${descriptor.userscriptLength} bytes, received ${body.length}`);
  }
  return body;
}

export function summaryConfigHasCollector(config = {}) {
  if (!config || typeof config !== "object") return false;
  if (String(config.userscriptFile || "").trim()) return true;
  if ((config.sourceMode === "custom" || config.builtIn === false) && String(config.customUserscript || "").trim()) {
    return true;
  }
  const hints = config.officialRuleHints;
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return false;
  return Object.values(hints).some((value) => (
    Array.isArray(value) && value.some((item) => String(item || "").trim())
  ));
}

export function summaryConfigIsOfficialSlotStub(config = {}) {
  if (!config || typeof config !== "object") return false;
  if ((config.sourceMode === "custom" || config.builtIn === false) && String(config.customUserscript || "").trim()) {
    return false;
  }
  return Number(config.userscriptLength) === 10 && Boolean(String(config.userscriptFile || "").trim());
}
