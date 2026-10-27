// Topic title rules (v2 02 §14).

import { isGenericTitle } from "../../lib/titles.js";

const MAX = 48;
const PLACEHOLDERS = [
  "new chat", "new conversation", "新对话", "新聊天", "新建对话", "新会话", "just a moment", "just a moment...", "just a moment…",
  "log in", "login", "sign in", "sign up", "登录", "注册", "untitled", "home", "chat", "loading", "loading...", "loading…",
];
const BRANDS = ["ChatGPT", "OpenAI", "Claude", "Anthropic", "Gemini", "Google Gemini", "Google", "Grok", "xAI", "DeepSeek", "Kagi", "Kagi Assistant", "Notion", "Notion AI", "NotionAI", "Perplexity", "Poe", "Kimi", "Moonshot", "Kimi AI", "豆包", "Doubao", "DouBao", "Dola", "Qwen", "Qwen Chat", "通义千问", "千问", "Qianwen", "TypingMind", "LobeHub", "LobeChat"];

/** Prompt text → short title: first non-empty line, no Markdown lead, no quotes, ≤ 48 chars (14.1). */
export function titleFromText(text) {
  const line = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  let s = line.replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+|`{1,3}|\*\*|__)+/, "");
  s = s.replace(/^["'“”‘’「」『』《》]+|["'“”‘’「」『』《》]+$/g, "").replace(/\s+/g, " ").trim();
  if (s.length > MAX) {
    let cut = s.slice(0, MAX);
    const space = cut.lastIndexOf(" ");
    if (space > 16) cut = cut.slice(0, space);
    s = cut;
  }
  s = s.replace(/[\s.,;:!?，。；：！？、…·\-–—]+$/u, "").trim();
  return isGenericTitle(s) ? "" : s;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Document title → conversation title, without site branding or placeholder titles (14.2 step 1). */
export function titleFromDocument(docTitle, { appName = "", provider = "", hostname = "" } = {}) {
  let s = String(docTitle ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const hostPart = String(hostname).replace(/^www\./, "").split(".").slice(-2, -1)[0] ?? "";
  const brands = [...BRANDS, appName, provider, hostPart, hostname].filter((b) => b && b.length > 1);
  const brandRe = brands.map(escapeRe).join("|");
  // "Title - Brand", "Brand | Title", "Title · Brand" …
  for (let i = 0; i < 3; i += 1) {
    const before = s;
    s = s.replace(new RegExp(`\\s*[-|·—–:：]\\s*(?:${brandRe})\\s*$`, "i"), "").replace(new RegExp(`^(?:${brandRe})\\s*[-|·—–:：]\\s*`, "i"), "").trim();
    if (s === before) break;
  }
  if (new RegExp(`^(?:${brandRe})$`, "i").test(s)) return "";
  if (PLACEHOLDERS.includes(s.toLowerCase())) return "";
  if (/^(just a moment|attention required|verify you are human|please wait)/i.test(s)) return "";
  return titleFromText(s);
}
