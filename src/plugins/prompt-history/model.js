// Send history data (v2 03 §6.1) and the "site conversations" matching (03 §6.3).

import { normalizeText, textsOverlap, pairMessages } from "../../lib/conversation.js";

export const HISTORY_LIMIT = 100;

const cleanImage = (img) => (img && typeof img === "object" ? { name: String(img.name ?? ""), type: String(img.type ?? ""), size: Number(img.size) || 0, dataUrl: String(img.dataUrl ?? "") } : null);

export function normalizeHistoryItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text ?? raw.prompt ?? "");
  const images = (Array.isArray(raw.images) ? raw.images : []).map(cleanImage).filter(Boolean);
  if (!text.trim() && !images.length) return null;
  const d = new Date(raw.createdAt ?? raw.time ?? 0);
  return {
    id: String(raw.id || `history-${Math.random().toString(36).slice(2, 12)}`),
    text,
    images,
    createdAt: Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString(),
  };
}

export const historyKey = (item) => [item.text.trim(), ...item.images.map((i) => `${i.name}|${i.size}|${i.dataUrl.length}`)].join("\u0000");

/** Newest first, de-duplicated by text + images (first occurrence wins), capped at 100. */
export function normalizeHistory(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const item = normalizeHistoryItem(raw);
    if (!item) continue;
    const k = historyKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out.slice(0, HISTORY_LIMIT);
}

export const addToHistory = (list, item) => normalizeHistory([item, ...list]);

/** today | yesterday | lastWeek | lastMonth | earlier, relative to `now`. */
export function dateBucket(iso, now = new Date()) {
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tm = d.getTime();
  if (tm >= start) return "today";
  if (tm >= start - 86400000) return "yesterday";
  if (tm >= start - 7 * 86400000) return "lastWeek";
  if (tm >= start - 30 * 86400000) return "lastMonth";
  return "earlier";
}

export function filterHistory(list, query) {
  const q = normalizeText(query ?? "").toLowerCase();
  if (!q) return list;
  return list.filter((x) => normalizeText(x.text).toLowerCase().includes(q) || x.images.some((i) => i.name.toLowerCase().includes(q)));
}

/**
 * Site conversations that contain the prompt. Each source: { appId, appName, logoUrl, href, title, messages }.
 * Returns clusters [{ key, appId, appName, logoUrl, href, title, pairs: [{ user, assistant }] }], one per site address.
 */
export function matchConversations(prompt, sources) {
  const want = String(prompt ?? "").trim();
  if (!want) return [];
  const byKey = new Map();
  for (const s of sources ?? []) {
    const pairs = pairMessages(s.messages ?? []).filter((p) => textsOverlap(p.user, want));
    if (!pairs.length) continue;
    const key = `${s.appId || s.appName}\n${s.href}`;
    if (!byKey.has(key)) byKey.set(key, { key, appId: s.appId, appName: s.appName, logoUrl: s.logoUrl, href: s.href, title: s.title, pairs: [] });
    const c = byKey.get(key);
    for (const p of pairs) {
      const i = c.pairs.findIndex((x) => textsOverlap(x.user, p.user));
      if (i < 0) c.pairs.push(p);
      else if (p.assistant.length > c.pairs[i].assistant.length) c.pairs[i] = p;
    }
  }
  return [...byKey.values()];
}

/** User messages of conversations, as new history items (03 §6.4); skips texts already in history. */
export function userMessagesAsItems(sources, existing, now = new Date()) {
  const have = new Set(existing.map((x) => x.text.trim()));
  const out = [];
  let ms = now.getTime();
  for (const s of sources ?? []) {
    for (const m of s.messages ?? []) {
      const text = String(m.text ?? "").trim();
      if (m.role !== "user" || !text || have.has(text)) continue;
      have.add(text);
      out.push({ id: `history-${Math.random().toString(36).slice(2, 12)}`, text, images: [], createdAt: new Date(ms--).toISOString() });
    }
  }
  return out;
}
