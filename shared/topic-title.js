const TOPIC_TITLE_MAX_LENGTH = 48;
const GENERIC_TOPIC_TITLE = /^(?:chatclub(?:\s+\d+)?|prompt)$/i;
// Segment separators that chat sites put between a conversation title and
// their own brand ("Kyoto trip - Claude", "Gemini | Kyoto trip").
const DOCUMENT_TITLE_SEPARATOR = /\s+(?:[-–—|·•]|::)\s+/;
// Placeholder titles that a site shows before, or instead of, a real
// conversation title. They must never become a desk name.
const GENERIC_CONVERSATION_TITLE = /^(?:new\s+(?:chat|conversation|thread)|untitled(?:\s+(?:chat|conversation))?|chat|home|loading|just\s+a\s+moment|attention\s+required!?|sign\s+in|log\s+in|login|error|access\s+denied|新对话|新聊天|新的聊天|新会话|新建对话|无标题|未命名|加载中|登录|请稍候)[.…!]*$/i;
// Brands that appear in built-in and common custom chat site titles. The app
// name and hostname supplied by the caller extend this list at runtime.
const KNOWN_CHAT_BRANDS = Object.freeze([
  "chatgpt", "openai", "claude", "anthropic", "gemini", "google gemini", "bard", "grok", "xai",
  "deepseek", "kagi", "kagi assistant", "notion", "notion ai", "perplexity", "copilot",
  "microsoft copilot", "mistral", "le chat", "poe", "ai studio", "google ai studio", "manus",
  "kimi", "qwen", "通义千问", "千问", "豆包", "doubao", "文心一言", "chatglm", "智谱清言"
]);
const BRAND_SUFFIX = /\s+(?:ai|assistant|chat|app)$/i;
const IGNORED_HOST_LABELS = new Set(["www", "app", "chat", "assistant", "ai", "com", "net", "org", "io", "im", "cn", "so", "google", "x"]);

function brandKey(value) {
  return String(value || "").toLowerCase().replace(/[\s._-]+/g, " ").replace(/[.,;:!?。，；：！？]+$/g, "").trim();
}

function brandTokens({ appName = "", hostname = "" } = {}) {
  const tokens = new Set(KNOWN_CHAT_BRANDS.map(brandKey));
  const name = brandKey(appName);
  if (name) {
    tokens.add(name);
    tokens.add(name.replace(BRAND_SUFFIX, ""));
  }
  for (const label of String(hostname || "").toLowerCase().split(".")) {
    if (label && !IGNORED_HOST_LABELS.has(label)) tokens.add(brandKey(label));
  }
  tokens.delete("");
  return tokens;
}

function isBrandSegment(segment, tokens) {
  const key = brandKey(segment);
  return !key || tokens.has(key) || tokens.has(key.replace(BRAND_SUFFIX, ""));
}

export function isGenericTopicTitle(value) {
  return GENERIC_TOPIC_TITLE.test(String(value || "").trim());
}

function isGenericConversationTitle(value) {
  return GENERIC_CONVERSATION_TITLE.test(String(value || "").replace(/\s+/g, " ").trim());
}

export function sanitizeTopicTitle(value) {
  let text = String(value || "").replace(/\r\n/g, "\n");
  text = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
  text = text.replace(/^[*_`#>\-\s]+/, "").replace(/[*_`]+$/g, "");
  text = text.replace(/^["'`“”‘’「」『』]+/, "").replace(/["'`“”‘’「」『』]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text || isGenericTopicTitle(text)) return "";
  if (text.length > TOPIC_TITLE_MAX_LENGTH) {
    text = text.slice(0, TOPIC_TITLE_MAX_LENGTH).trim();
    const cut = text.lastIndexOf(" ");
    if (cut >= 16) text = text.slice(0, cut).trim();
    text = text.replace(/[.,;:：、，；]+$/g, "").trim();
  }
  return text && !isGenericTopicTitle(text) ? text : "";
}

export function topicTitleFromPrompt(value) {
  return sanitizeTopicTitle(value);
}

/**
 * Derive a desk name from a chat frame's document title. Sites that publish
 * the conversation title there ("Kyoto trip - Claude", "Kyoto trip") yield
 * that title; a bare brand ("Grok", "ChatGPT", "Kagi Assistant") or a
 * placeholder ("New chat") yields "" so the caller can fall back to the
 * conversation content instead of naming the desk after the site.
 */
export function conversationTitleFromDocumentTitle(value, context = {}) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const tokens = brandTokens(context);
  const kept = raw.split(DOCUMENT_TITLE_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !isBrandSegment(segment, tokens) && !isGenericConversationTitle(segment));
  if (!kept.length) return "";
  return sanitizeTopicTitle(kept.join(" - "));
}
