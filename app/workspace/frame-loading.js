const FRAME_LOADING_KIND_NEW_TOPIC = "new-topic";
const FRAME_LOADING_KIND_RESTORING = "restoring";
const FRAME_NEW_CHAT_PENDING_KEY = "newChatPending";

/**
 * New Chat marker. While ChatClub resets a frame to its app home, the DOM
 * still carries stale conversation signals: the iframe `src` attribute keeps
 * the last assigned URL until the new navigation is committed, cached
 * `currentThreadHref` may still name the old thread, and the outgoing document
 * can still report its location. Workspace snapshot capture treats a marked
 * frame as sitting at its app home so the rebound workspace never records, and
 * conversation retention never resurrects, the thread that was frozen on the
 * previous workspace id. The marker clears once the home document has loaded
 * or another ChatClub navigation supersedes the reset.
 */
export function markFrameNewChatPending(iframe) {
  if (!iframe?.dataset) return false;
  iframe.dataset[FRAME_NEW_CHAT_PENDING_KEY] = "1";
  return true;
}

export function clearFrameNewChatPending(iframe) {
  if (!iframe?.dataset || iframe.dataset[FRAME_NEW_CHAT_PENDING_KEY] === undefined) return false;
  delete iframe.dataset[FRAME_NEW_CHAT_PENDING_KEY];
  return true;
}

export function frameNewChatPending(iframe) {
  return iframe?.dataset?.[FRAME_NEW_CHAT_PENDING_KEY] === "1";
}

function parsedHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function normalizedPath(url) {
  return (url.pathname || "/").replace(/\/+$/, "") || "/";
}

function comparableUrl(value) {
  const url = parsedHttpUrl(value);
  if (!url) return "";
  url.hash = "";
  url.pathname = normalizedPath(url);
  return url.href;
}

function sameHost(host, roots = []) {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function knownEmptyConversationUrl(app = {}, targetUrl) {
  const source = String(app.chatAppSource || app.source || "").trim().toLowerCase();
  // A custom app's configured URL is its only known home. In particular, a
  // query string can distinguish two different custom-app entry points.
  if (source === "custom") return false;

  const identity = `${app.id || ""} ${app.name || ""}`.toLowerCase();
  const host = targetUrl.hostname.toLowerCase();
  const path = normalizedPath(targetUrl);
  if (/kagi/.test(identity) && host === "assistant.kagi.com" && path === "/") return true;
  if (/chatgpt|chat gpt/.test(identity) && sameHost(host, ["chatgpt.com", "chat.openai.com"]) && path === "/") return true;
  if (/deepseek/.test(identity) && sameHost(host, ["deepseek.com"]) && path === "/") return true;
  if (/grok/.test(identity) && sameHost(host, ["grok.com", "grok.x.ai", "gk.dairoot.cn"]) && path === "/") return true;
  if (/notion/.test(identity) && sameHost(host, ["app.notion.com", "notion.so"]) && (path === "/ai" || (path === "/chat" && !targetUrl.searchParams.get("t")))) return true;
  if (/claude/.test(identity) && sameHost(host, ["claude.ai"]) && path === "/new") return true;
  if (/gemini|bard/.test(identity) && sameHost(host, ["gemini.google.com", "bard.google.com"]) && path === "/app") return true;
  return false;
}

export function frameLoadingKindForTarget(app = {}, targetHref = "") {
  const targetUrl = parsedHttpUrl(targetHref);
  if (!targetUrl) return FRAME_LOADING_KIND_RESTORING;
  const configuredHome = comparableUrl(app.url);
  if (configuredHome && comparableUrl(targetUrl.href) === configuredHome) {
    return FRAME_LOADING_KIND_NEW_TOPIC;
  }
  return knownEmptyConversationUrl(app, targetUrl)
    ? FRAME_LOADING_KIND_NEW_TOPIC
    : FRAME_LOADING_KIND_RESTORING;
}
