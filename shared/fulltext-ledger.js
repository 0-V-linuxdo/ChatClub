import { deleteConversationIdentityFromHref } from "./delete-completion.js";

// Record Full Text decides whether to Copy by comparing a DOM ledger with a
// DOM ledger: the content side hashes each rendered turn, the parent keeps the
// ledger it saw when it last Copied, and only a real difference between the
// two may start another Copy. Copy text is stored, never compared. Bump the
// version whenever the content-side turn text or hashing rules change, so old
// marks are adopted instead of looking like growth.
export const FULLTEXT_LEDGER_VERSION = 1;
export const FULLTEXT_LEDGER_TAIL = 12;
const TAIL_ENTRY_PATTERN = /^[ua?]:[0-9a-f]{16}$/;
const GRANULARITIES = new Set(["turns", "blocks", "none"]);

export function normalizeLedgerGranularity(value) {
  return GRANULARITIES.has(value) ? value : "none";
}
const OVERLAP_MIN_CHARS = 8;

// Hosts whose conversation routes delete-completion already knows: any other
// route on them (home, settings, library) is not a conversation.
const KNOWN_CONVERSATION_HOSTS = Object.freeze([
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
const EMPTY_CONVERSATION_PATHS = new Set(["/", "/new", "/ai", "/app", "/chat", "/chats", "/home", "/c"]);
const IDENTITY_QUERY_KEYS = Object.freeze([
  "c",
  "chat",
  "chatid",
  "conversation",
  "conversationid",
  "id",
  "session",
  "sessionid",
  "t",
  "thread",
  "threadid",
  "topic",
  "topicid"
]);

function hostMatches(host, roots) {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function identityParams(url) {
  const pairs = [];
  const collect = (params) => {
    for (const [name, value] of params) {
      const key = String(name || "").toLowerCase();
      const text = String(value || "").trim();
      if (!IDENTITY_QUERY_KEYS.includes(key) || !text || text.length > 160) continue;
      if (!pairs.some(([existing]) => existing === key)) pairs.push([key, text]);
    }
  };
  collect(url.searchParams);
  const hash = String(url.hash || "").replace(/^#\/?/, "");
  if (/[=&]/.test(hash)) {
    try { collect(new URLSearchParams(hash.replace(/^[^?]*\?/, ""))); } catch {}
  }
  return pairs.sort(([left], [right]) => left.localeCompare(right));
}

// One key per conversation, shared by the content ledger and the stored
// marks. Known sites reuse the delete-completion identity; other sites use
// host + path, plus identity-looking query or hash parameters. Start pages
// have no key: nothing there can be recorded yet.
export function conversationKeyFromHref(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return "";
  }
  if (!/^https?:$/.test(url.protocol)) return "";
  const identity = deleteConversationIdentityFromHref(url.href);
  if (identity?.provider && identity.id) return `${identity.provider}:${identity.id}`;
  const host = url.hostname.toLowerCase();
  if (hostMatches(host, KNOWN_CONVERSATION_HOSTS)) return "";
  const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
  const params = identityParams(url);
  const query = params.length ? `?${params.map(([key, text]) => `${key}=${text}`).join("&")}` : "";
  if (EMPTY_CONVERSATION_PATHS.has(path.toLowerCase()) && !query) {
    const hash = String(url.hash || "").replace(/^#/, "");
    if (!hash || /[=&]/.test(hash) || hash.length < 8 || hash.length > 120) return "";
    return `${host}${path}#${hash}`;
  }
  const hash = String(url.hash || "").replace(/^#/, "");
  const suffix = !query && hash && !/[=&]/.test(hash) && hash.length >= 8 && hash.length <= 120 ? `#${hash}` : "";
  return `${host}${path}${query}${suffix}`;
}

function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hash64(text) {
  const value = String(text || "");
  return `${fnv1a(value, 0x811c9dc5)}${fnv1a(value, 0x2f6b8e3d)}`;
}

function roleCode(role) {
  return role === "u" || role === "user" ? "u" : role === "a" || role === "assistant" ? "a" : "?";
}

export function ledgerTurnEntry(role, text) {
  const code = roleCode(role);
  return `${code}:${hash64(`${code}\n${String(text || "")}`)}`;
}

export function ledgerDigest(granularity, entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  return list.length ? hash64(`${granularity}\n${list.join("|")}`) : "";
}

export function normalizeLedgerTail(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || ""))
    .filter((entry) => TAIL_ENTRY_PATTERN.test(entry))
    .slice(-FULLTEXT_LEDGER_TAIL);
}

export function normalizeFullTextCaptureMark(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = Math.floor(Number(raw.v) || 0);
  const conversationKey = String(raw.conversationKey || "").trim().slice(0, 600);
  if (v <= 0 || !conversationKey) return null;
  return {
    v,
    conversationKey,
    granularity: normalizeLedgerGranularity(raw.granularity),
    digest: /^[0-9a-f]{16}$/.test(String(raw.digest || "")) ? String(raw.digest) : "",
    tail: normalizeLedgerTail(raw.tail),
    turnCount: Math.max(0, Math.floor(Number(raw.turnCount) || 0)),
    capturedAt: String(raw.capturedAt || ""),
    source: String(raw.source || "")
  };
}

export function fullTextCaptureMarksEqual(left, right) {
  const a = normalizeFullTextCaptureMark(left);
  const b = normalizeFullTextCaptureMark(right);
  if (!a || !b) return !a && !b;
  return a.v === b.v
    && a.conversationKey === b.conversationKey
    && a.digest === b.digest
    && a.tail.join("|") === b.tail.join("|");
}

function normalizeFullTextMatchText(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  try {
    return text.normalize("NFKC").replace(/\s+/g, " ").trim();
  } catch {
    return text.replace(/\s+/g, " ").trim();
  }
}

export function fullTextTextsOverlap(left, right) {
  const a = normalizeFullTextMatchText(left);
  const b = normalizeFullTextMatchText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (compactA === compactB) return true;
  const includes = (short, long) => short.length >= OVERLAP_MIN_CHARS && long.includes(short);
  if (a.length <= b.length ? includes(a, b) : includes(b, a)) return true;
  return compactA.length <= compactB.length ? includes(compactA, compactB) : includes(compactB, compactA);
}
