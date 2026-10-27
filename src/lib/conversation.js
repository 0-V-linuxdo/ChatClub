// Conversation identity, text normalization, Q&A pairing and a stable 64-bit hash (v2 04 §5.2–§5.4, §3.2).
// No imports: content bundles include this file verbatim (scripts/build.mjs `@include`).

/** Topic identity per known provider (05 §4.2). Each entry: provider, host test, id from URL. */
export const KNOWN_CONVERSATION_SITES = [
  { provider: "chatgpt", hosts: ["chatgpt.com", "chat.openai.com"], id: (u) => u.pathname.match(/^\/(?:g\/[^/]+\/)?c\/([^/?#]+)/)?.[1] },
  { provider: "claude", hosts: ["claude.ai"], id: (u) => u.pathname.match(/^\/chat\/([^/?#]+)/)?.[1] },
  { provider: "gemini", hosts: ["gemini.google.com", "bard.google.com"], id: (u) => u.pathname.match(/^\/(?:u\/\d+\/)?app\/([^/?#]+)/)?.[1] },
  { provider: "kagi", hosts: ["assistant.kagi.com"], id: (u) => u.pathname.match(/^\/(?:c|chat)\/([^/?#]+)/)?.[1] },
  { provider: "notion", hosts: ["app.notion.com", "notion.so"], id: (u) => (u.pathname.replace(/\/+$/, "") === "/chat" ? u.searchParams.get("t") || undefined : undefined) },
  { provider: "grok", hosts: ["grok.com", "grok.x.ai"], id: (u) => u.pathname.match(/^\/(?:c|chat)\/([^/?#]+)/)?.[1] },
  { provider: "grokMirror", hosts: ["gk.dairoot.cn"], id: (u) => u.pathname.match(/^\/(?:c|chat)\/([^/?#]+)/)?.[1] },
  { provider: "deepseek", hosts: ["deepseek.com"], id: (u) => u.pathname.match(/^\/(?:a\/)?chat\/s\/([^/?#]+)/)?.[1] },
];

export function hostMatchesList(hostname, hosts) {
  const host = String(hostname || "").toLowerCase();
  return hosts.some((h) => {
    const pattern = String(h).toLowerCase().replace(/^\*\./, "");
    return host === pattern || host.endsWith(`.${pattern}`);
  });
}

const IDENTITY_PARAMS = new Set(["c", "chat", "chatid", "conversation", "conversationid", "id", "session", "sessionid", "t", "thread", "threadid", "topic", "topicid"]);
const START_PATHS = new Set(["/", "/new", "/ai", "/app", "/chat", "/chats", "/home", "/c"]);

/** `<provider>:<id>` for known sites, `host+path[?ids][#hash]` for others, null for start pages (04 §5.2). */
export function conversationKey(href) {
  let url;
  try {
    url = new URL(String(href || ""));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const known = KNOWN_CONVERSATION_SITES.find((s) => hostMatchesList(url.hostname, s.hosts));
  if (known) {
    const id = known.id(url);
    return id ? `${known.provider}:${id}` : null;
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const ids = [];
  for (const [k, v] of url.searchParams) if (IDENTITY_PARAMS.has(k.toLowerCase()) && v && v.length <= 160) ids.push([k.toLowerCase(), v]);
  const hash = url.hash.replace(/^#/, "");
  if (hash.includes("=")) {
    for (const part of hash.split("&")) {
      const [k, v] = part.split("=");
      if (k && v && IDENTITY_PARAMS.has(k.toLowerCase()) && v.length <= 160) ids.push([k.toLowerCase(), decodeURIComponent(v)]);
    }
  }
  ids.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let key = `${url.hostname.toLowerCase()}${path === "/" ? "" : path}`;
  if (ids.length) key += `?${ids.map(([k, v]) => `${k}=${v}`).join("&")}`;
  else if (hash && !/[=&]/.test(hash) && hash.length >= 8 && hash.length <= 120) key += `#${hash}`;
  else if (START_PATHS.has(path)) return null;
  return key;
}

/** Collapses whitespace after NFKC (the comparison form used for overlap checks). */
export function normalizeForCompare(text) {
  let s = String(text ?? "");
  try {
    s = s.normalize("NFKC");
  } catch {
    // ignore
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Unifies newlines, trims, and squeezes runs of blank lines and spaces. */
export function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Overlap" between two texts (04 §5.3): equal normalized, equal without spaces, or containment (≥ 8 chars). */
export function textsOverlap(a, b) {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xs = x.replace(/\s/g, "");
  const ys = y.replace(/\s/g, "");
  if (xs === ys) return true;
  const [short, long] = xs.length <= ys.length ? [xs, ys] : [ys, xs];
  return short.length >= 8 && long.includes(short);
}

/** Pairs user/assistant messages in order (04 §3.2): the last pending user wins; orphan assistants are dropped. */
export function pairMessages(messages) {
  const pairs = [];
  let user = null;
  for (const m of messages ?? []) {
    const text = String(m?.text ?? "").trim();
    if (!text) continue;
    if (m.role === "user") user = text;
    else if (m.role === "assistant" && user !== null) {
      pairs.push({ user, assistant: text });
      user = null;
    }
  }
  return pairs;
}

/** Merges adjacent messages of the same role and drops empty ones. */
export function mergeAdjacent(messages) {
  const out = [];
  for (const m of messages ?? []) {
    const text = String(m?.text ?? "").trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.text = `${prev.text}\n\n${text}`;
    else out.push({ role: m.role, text });
  }
  return out;
}

function fnv1a32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 64-bit hash as 16 hex chars: two FNV-1a 32 passes with different seeds. */
export function hash64(str) {
  const s = String(str ?? "");
  const a = fnv1a32(s, 0x811c9dc5);
  const b = fnv1a32(s, 0x2b992ddf ^ s.length);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
