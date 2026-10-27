// Pocket data: entries, batches, de-duplication, clusters and restorable addresses (v2 04 §3.1–§3.5).

import { pairMessages, normalizeText } from "../../lib/conversation.js";

export const POCKET_LIMIT = 300;
export const CARD_DEFAULT = { width: 460, height: 560 };

const nonNeg = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const iso = (v, fallback) => {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
};

/** Tolerant read of one stored entry (04 §3.1). */
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const createdAt = iso(raw.createdAt ?? raw.batchCreatedAt, new Date(0).toISOString());
  const entry = {
    id: String(raw.id || `pocket-${Math.random().toString(36).slice(2, 12)}`),
    batchId: String(raw.batchId || "legacy"),
    batchCreatedAt: iso(raw.batchCreatedAt, createdAt),
    createdAt,
    sourceId: String(raw.sourceId ?? ""),
    chatUrl: String(raw.chatUrl ?? raw.url ?? raw.href ?? ""),
    title: String(raw.title ?? ""),
    appName: String(raw.appName ?? raw.siteName ?? raw.name ?? ""),
    logoUrl: String(raw.logoUrl ?? ""),
    appId: String(raw.appId ?? ""),
    groupId: String(raw.groupId ?? ""),
    instanceId: String(raw.instanceId ?? ""),
    groupIndex: nonNeg(raw.groupIndex),
    tabIndex: nonNeg(raw.tabIndex),
    userMessage: String(raw.userMessage ?? ""),
    assistantMessage: String(raw.assistantMessage ?? ""),
  };
  if (!entry.userMessage.trim() && !entry.assistantMessage.trim()) return null;
  return entry;
}

export const dedupeKey = (e) => [e.batchId, e.chatUrl, e.userMessage, e.assistantMessage].join("\u0000");

/** Normalizes, drops duplicates (first one wins) and keeps the newest 300. */
export function normalizeList(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = normalizeEntry(raw);
    if (!e) continue;
    const k = dedupeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.slice(0, POCKET_LIMIT);
}

/** Import merge: existing entries win, new ones go in front, then cap. */
export function mergeImport(existing, incoming) {
  const have = normalizeList(existing);
  const keys = new Set(have.map(dedupeKey));
  const fresh = normalizeList(incoming).filter((e) => !keys.has(dedupeKey(e)));
  return [...fresh, ...have].slice(0, POCKET_LIMIT);
}

/** Address that can be reopened in the workspace; null when the source address is not one. */
export function restorableUrl(appId, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (appId === "NotionAI" || /(^|\.)notion\.(so|com)$/.test(url.hostname)) {
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/ai") return `${url.origin}/ai`;
    const t = url.searchParams.get("t");
    if (path === "/chat" && t) return `${url.origin}/chat?t=${encodeURIComponent(t)}`;
    return null;
  }
  return url.href;
}

/**
 * One saved batch from collected sources (04 §3.2).
 * @param {object[]} sources Summary sources ({ key, instanceId, appId, href, title, brand, logoUrl, order, messages })
 * @param {{ groups: Array<{ id: string, tabs: Array<{ id: string, appId: string }> }>, now?: Date, rid?: () => string }} ws
 */
export function buildBatch(sources, { groups = [], now = new Date(), rid = () => Math.random().toString(36).slice(2, 12) } = {}) {
  const batchId = `batch-${rid()}`;
  const batchCreatedAt = now.toISOString();
  const entries = [];
  for (const source of sources ?? []) {
    if (!source?.messages?.length) continue;
    const chatUrl = restorableUrl(source.appId, source.href);
    if (!chatUrl) continue;
    let groupIndex = nonNeg(source.order);
    let tabIndex = 0;
    let groupId = source.groupId ?? "";
    groups.forEach((g, gi) => {
      const ti = g.tabs.findIndex((tb) => tb.id === source.instanceId);
      if (ti >= 0) {
        groupIndex = gi;
        tabIndex = ti;
        groupId = g.id;
      }
    });
    for (const pair of pairMessages(source.messages)) {
      entries.push({
        id: `pocket-${rid()}`,
        batchId,
        batchCreatedAt,
        createdAt: batchCreatedAt,
        sourceId: source.key || source.instanceId || `${source.appId || source.name}\n${source.href}`,
        chatUrl,
        title: source.title || source.brand || "",
        appName: source.brand || source.name || "",
        logoUrl: source.logoUrl || "",
        appId: source.appId || "",
        groupId,
        instanceId: source.instanceId || "",
        groupIndex,
        tabIndex,
        userMessage: pair.user,
        assistantMessage: pair.assistant,
      });
    }
  }
  return entries;
}

/** Batches in storage order (newest first), each with its entries. */
export function groupBatches(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.batchId)) map.set(e.batchId, { batchId: e.batchId, createdAt: e.batchCreatedAt, entries: [] });
    map.get(e.batchId).entries.push(e);
  }
  return [...map.values()];
}

export function sortedEntries(entries) {
  return entries.map((e, i) => ({ e, i })).sort((a, b) => a.e.groupIndex - b.e.groupIndex || a.e.tabIndex - b.e.tabIndex || a.i - b.i).map((x) => x.e);
}

/** Merged clusters share one identical user message; the rest are single clusters, in order (04 §3.4). */
export function clusters(entries) {
  const sorted = sortedEntries(entries);
  const key = (e) => normalizeText(e.userMessage).replace(/\s+/g, " ");
  const counts = new Map();
  for (const e of sorted) counts.set(key(e), (counts.get(key(e)) ?? 0) + 1);
  const out = [];
  const merged = new Map();
  for (const e of sorted) {
    const k = key(e);
    if (k && counts.get(k) > 1) {
      if (!merged.has(k)) {
        const c = { merged: true, userMessage: e.userMessage, entries: [] };
        merged.set(k, c);
        out.push(c);
      }
      merged.get(k).entries.push(e);
    } else out.push({ merged: false, userMessage: e.userMessage, entries: [e] });
  }
  return out;
}

export function normalizeCardSize(v) {
  const w = Number(v?.width);
  const h = Number(v?.height);
  const okW = Number.isFinite(w) && w >= 360 && w <= 760;
  const okH = Number.isFinite(h) && h >= 420 && h <= 820;
  return { width: okW ? Math.round(w / 20) * 20 : CARD_DEFAULT.width, height: okH ? Math.round(h / 20) * 20 : CARD_DEFAULT.height };
}

/** Restore plan for a batch: groups of { appId, url } in saved order (04 §3.5). */
export function restorePlan(entries, inferApp) {
  const seen = new Set();
  const items = [];
  sortedEntries(entries).forEach((e) => {
    if (seen.has(e.sourceId)) return;
    const appId = e.appId || inferApp?.(e.chatUrl) || "";
    const url = restorableUrl(appId, e.chatUrl);
    if (!appId || !url) return;
    seen.add(e.sourceId);
    items.push({ appId, url, groupIndex: e.groupIndex, groupId: e.groupId, tabIndex: e.tabIndex });
  });
  items.sort((a, b) => a.groupIndex - b.groupIndex || String(a.groupId).localeCompare(String(b.groupId)) || a.tabIndex - b.tabIndex);
  const groups = [];
  let last = null;
  for (const it of items) {
    const k = `${it.groupIndex}|${it.groupId}`;
    if (k !== last) {
      groups.push([]);
      last = k;
    }
    groups[groups.length - 1].push({ appId: it.appId, url: it.url });
  }
  return groups;
}
