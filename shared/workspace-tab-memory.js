import { deleteConversationIdentityFromHref } from "./delete-completion.js";

const KNOWN_CHAT_HOSTS = Object.freeze([
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "bard.google.com",
  "assistant.kagi.com",
  "app.notion.com",
  "notion.so",
  "grok.com",
  "grok.x.ai",
  "gk.dairoot.cn",
  "deepseek.com"
]);

function hostMatches(host, roots = []) {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function normalizedPath(url) {
  return (url.pathname || "/").replace(/\/+$/, "") || "/";
}

function parsedHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isKnownChatHost(host) {
  return hostMatches(String(host || "").toLowerCase(), KNOWN_CHAT_HOSTS);
}

function isKnownEmptyConversationPage(url) {
  const host = url.hostname.toLowerCase();
  const path = normalizedPath(url);
  if (hostMatches(host, ["chatgpt.com", "chat.openai.com"]) && path === "/") return true;
  if (hostMatches(host, ["claude.ai"]) && (path === "/new" || path === "/")) return true;
  if (hostMatches(host, ["gemini.google.com", "bard.google.com"]) && path === "/app") return true;
  if (host === "assistant.kagi.com" && path === "/") return true;
  if (hostMatches(host, ["app.notion.com", "notion.so"]) && (
    path === "/ai" || (path === "/chat" && !url.searchParams.get("t"))
  )) return true;
  if (hostMatches(host, ["grok.com", "grok.x.ai", "gk.dairoot.cn"]) && path === "/") return true;
  if (hostMatches(host, ["deepseek.com"]) && path === "/") return true;
  return false;
}

export function conversationHrefFromLocation(value) {
  const url = parsedHttpUrl(value);
  if (!url) return "";
  if (deleteConversationIdentityFromHref(url.href)) return url.href;
  if (isKnownEmptyConversationPage(url)) return "";
  if (isKnownChatHost(url.hostname)) return "";
  return normalizedPath(url) === "/" ? "" : url.href;
}

export function workspaceSnapshotHasConversation(snapshot) {
  for (const group of Array.isArray(snapshot?.groups) ? snapshot.groups : []) {
    for (const tab of Array.isArray(group?.tabs) ? group.tabs : []) {
      if (conversationHrefFromLocation(tab?.currentHref || tab?.href || tab?.url || tab?.initialHref)) {
        return true;
      }
    }
  }
  return false;
}
