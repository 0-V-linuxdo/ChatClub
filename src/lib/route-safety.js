// Which chat addresses may be saved and restored (v2 05 §6.3). NotionAI only keeps `/ai` and
// `/chat?t=<id>`; sign-in, authorization and API addresses never are. Anything that can't be judged
// (bad encoding, odd parameters) is treated as unsafe and restored as the app's `/ai` page.

const NOTION_HOSTS = /(^|\.)notion\.(so|com)$/i;
const UNSAFE = /(log-?in|sign-?in|sign-?up|log-?out|oauth|authori[sz]e|\bauth\b|callback|\bsso\b|saml|\bapi\b|token|verify|consent|redirect|password|magic-?link)/i;

/** Decodes repeatedly until the text stops changing; null when decoding fails or never settles. */
export function decodeFully(text) {
  let cur = String(text ?? "");
  for (let i = 0; i < 8; i++) {
    let next;
    try {
      next = decodeURIComponent(cur.replace(/\+/g, " "));
    } catch {
      return null;
    }
    if (next === cur) return cur;
    cur = next;
  }
  return null;
}

function notionSafe(url) {
  const full = decodeFully(url.pathname + url.search + url.hash);
  if (full === null || UNSAFE.test(full)) return false;
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/ai") return [...url.searchParams.keys()].every((k) => k === "wr" || k === "v");
  if (path === "/chat") {
    const t = url.searchParams.get("t") ?? "";
    return /^[A-Za-z0-9_-]{6,128}$/.test(t) && [...url.searchParams.keys()].every((k) => k === "t");
  }
  return false;
}

/**
 * The address to save or restore for a tab: `href` itself when it may be kept, otherwise a safe
 * fallback (NotionAI: `<origin>/ai`). Non-Notion addresses are returned unchanged.
 */
export function restorableHref(href, appUrl = "") {
  let url;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!NOTION_HOSTS.test(url.hostname)) return href;
  if (url.protocol === "https:" && notionSafe(url)) return url.href;
  let base;
  try {
    base = new URL(appUrl && NOTION_HOSTS.test(new URL(appUrl).hostname) ? appUrl : `https://${url.hostname}/ai`);
  } catch {
    base = new URL("https://app.notion.com/ai");
  }
  return `${base.origin}/ai`;
}
