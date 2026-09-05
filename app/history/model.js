import { t } from "../../shared/i18n.js";
import { dateGroupId, groupByDate, timestamp } from "../../shared/date-groups.js";
import {
  framesFromSummaryPreviewItems,
  fullTextTextsOverlap,
  pocketPairsFromMessages
} from "../../shared/workspace-tab-fulltext.js";

export function promptHistoryGroupId(createdAt, now = Date.now()) {
  return dateGroupId(createdAt, now);
}

export function groupPromptHistory(history = [], now = Date.now()) {
  return groupByDate(history, (item) => item?.createdAt, now, "promptHistory");
}

export function promptHistoryMatchesSearch(item, query, extraTexts = []) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const images = Array.isArray(item?.images) ? item.images : [];
  return [item?.text, ...images.map((image) => image?.name), ...extraTexts]
    .some((text) => String(text || "").toLowerCase().includes(needle));
}

export function promptHistoryPreview(text, limit = 180) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

export function promptHistoryTimeLabel(createdAt) {
  const parsedTimestamp = timestamp(createdAt);
  if (parsedTimestamp === null) return t("promptHistory.unknownTime");
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(parsedTimestamp));
  } catch {
    return new Date(parsedTimestamp).toLocaleString();
  }
}

export function promptHistoryImageCountLabel(images = []) {
  return images.length
    ? t("promptHistory.imageCount", { count: images.length, plural: images.length === 1 ? "" : "s" })
    : "";
}

export function promptHistorySourceMeta(pages = []) {
  const list = Array.isArray(pages) ? pages : [];
  const names = [];
  for (const page of list) {
    const name = String(page?.siteName || page?.name || page?.title || "").replace(/\s+/g, " ").trim();
    if (!name || names.includes(name)) continue;
    names.push(name);
  }
  const count = Math.max(list.length, names.length);
  if (!count) return "";
  const sources = names.join(" · ");
  return sources ? t("pocket.groupSources", { count, sources }) : t("pocket.groupCards", { count });
}

function promptHistorySearchExtraTexts(item) {
  const images = Array.isArray(item?.images) ? item.images : [];
  return [
    promptHistoryTimeLabel(item?.createdAt),
    promptHistoryImageCountLabel(images),
    item?.text ? "" : t("promptHistory.emptyPrompt")
  ];
}

export function promptHistoryItemMatchesSearch(item, query) {
  return promptHistoryMatchesSearch(item, query, promptHistorySearchExtraTexts(item));
}

export function promptHistoryMessageKey(text = "") {
  return String(text || "").replace(/\r\n?/g, "\n").trim();
}

function matchingMessages(item, messages = []) {
  const pairs = pocketPairsFromMessages(messages);
  const userHits = pairs.filter((pair) => fullTextTextsOverlap(pair?.userMessage, item?.text));
  const matching = userHits.length
    ? userHits
    : pairs.filter((pair) => fullTextTextsOverlap(pair?.assistantMessage, item?.text));
  return matching.flatMap((pair) => [
    { role: "user", text: pair.userMessage },
    { role: "assistant", text: pair.assistantMessage }
  ]);
}

export function promptHistoryPocketSaved(item, pocketEntries = []) {
  const key = promptHistoryMessageKey(item?.text);
  if (!key) return false;
  return (Array.isArray(pocketEntries) ? pocketEntries : []).some(
    (entry) => promptHistoryMessageKey(entry?.userMessage) === key
  );
}

function matchingFrames(item, frames = []) {
  if (!promptHistoryMessageKey(item?.text)) return [];
  return (Array.isArray(frames) ? frames : []).flatMap((frame) => {
    const messages = matchingMessages(item, frame?.messages);
    return messages.length ? [{ ...frame, messages }] : [];
  });
}

function framesMatchingPromptHistory(item, store = {}) {
  const records = store && typeof store === "object" && !Array.isArray(store) ? Object.values(store) : [];
  return matchingFrames(item, records.flatMap((record) => (record?.frames || []).map((frame) => ({
    ...frame,
    title: frame.title || record.topicTitle
  }))));
}

function previewItemsMatchingPromptHistory(item, previewItems = []) {
  return matchingFrames(item, framesFromSummaryPreviewItems(previewItems));
}

function pocketFramesMatchingPromptHistory(item, pocketEntries = []) {
  return matchingFrames(item, (Array.isArray(pocketEntries) ? pocketEntries : []).map((entry) => ({
    href: entry?.chatUrl || entry?.href || "",
    title: entry?.title || "",
    appName: entry?.appName || "",
    appId: entry?.appId || "",
    instanceId: entry?.instanceId || "",
    logoUrl: entry?.logoUrl || "",
    messages: [
      { role: "user", text: entry?.userMessage },
      { role: "assistant", text: entry?.assistantMessage }
    ]
  })));
}

function frameToPocketPage(frame = {}) {
  return {
    href: frame.href,
    url: frame.href,
    title: frame.title,
    pageTitle: frame.title,
    siteName: frame.appName,
    name: frame.appName,
    appId: frame.appId,
    instanceId: frame.instanceId,
    logoUrl: frame.logoUrl,
    messages: frame.messages
  };
}

function conversationPageIdentity(page = {}) {
  const href = String(page.href || page.url || "").trim();
  if (href) return `href:${href}`;
  const instanceId = String(page.instanceId || "").trim();
  if (instanceId) return `id:${instanceId}`;
  const name = String(page.siteName || page.name || "").trim();
  return name ? `name:${name}` : "";
}

function conversationPageWeight(page = {}) {
  return (Array.isArray(page.messages) ? page.messages : [])
    .reduce((sum, message) => sum + String(message?.text || "").length, 0);
}

function uniqueConversationPages(pages = []) {
  const seen = new Map();
  const result = [];
  for (const page of pages) {
    const messages = Array.isArray(page.messages) ? page.messages : [];
    if (!messages.length) continue;
    const key = conversationPageIdentity(page);
    if (!key) {
      result.push(page);
      continue;
    }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, page);
      result.push(page);
      continue;
    }
    if (conversationPageWeight(page) > conversationPageWeight(existing)) {
      existing.messages = page.messages;
      if (page.title) existing.title = page.title;
      if (page.pageTitle) existing.pageTitle = page.pageTitle;
    }
    if (!existing.logoUrl && page.logoUrl) existing.logoUrl = page.logoUrl;
    if (!existing.appId && page.appId) existing.appId = page.appId;
    if (!existing.siteName && page.siteName) existing.siteName = page.siteName;
    if (!existing.name && page.name) existing.name = page.name;
    if (!existing.href && page.href) {
      existing.href = page.href;
      existing.url = page.url || page.href;
    }
  }
  return result;
}

export function promptHistoryConversationPages(item, sources = {}) {
  return uniqueConversationPages([
    ...framesMatchingPromptHistory(item, sources.store),
    ...previewItemsMatchingPromptHistory(item, sources.previewItems),
    ...pocketFramesMatchingPromptHistory(item, sources.pocketEntries)
  ].map(frameToPocketPage));
}

export function promptHistoryPocketPages(item, sources = {}) {
  return promptHistoryConversationPages(item, sources).filter((page) => page.href);
}

function pageToHistoryEntries(page = {}) {
  const messages = Array.isArray(page.messages) ? page.messages : [];
  const meta = {
    title: page.title || page.pageTitle || page.siteName || page.name || "",
    appName: page.siteName || page.name || "",
    appId: page.appId || "",
    chatUrl: page.href || page.url || "",
    logoUrl: page.logoUrl || "",
    instanceId: page.instanceId || ""
  };
  const pairs = pocketPairsFromMessages(messages);
  return pairs.map((pair) => ({
    ...meta,
    userMessage: pair.userMessage,
    assistantMessage: pair.assistantMessage
  }));
}

export function promptHistoryConversationEntries(item, sources = {}) {
  return promptHistoryConversationPages(item, sources).flatMap(pageToHistoryEntries);
}

const WORKSPACE_PREVIEW_HISTORY_PREFIX = "workspace-preview:";

export function workspacePreviewHistoryItemId(workspaceId) {
  const id = String(workspaceId || "").trim();
  return id ? `${WORKSPACE_PREVIEW_HISTORY_PREFIX}${id}` : "";
}

export function isWorkspacePreviewHistoryItem(item) {
  return String(item?.id || "").startsWith(WORKSPACE_PREVIEW_HISTORY_PREFIX);
}

export function workspacePreviewHistoryItem({ workspaceId, topicTitle, updatedAt } = {}) {
  const id = workspacePreviewHistoryItemId(workspaceId);
  if (!id) return null;
  return {
    id,
    text: String(topicTitle || "").trim(),
    createdAt: String(updatedAt || "").trim() || new Date().toISOString(),
    images: []
  };
}

export function promptHistoryItemMatchesWorkspace(item, record) {
  if (!promptHistoryMessageKey(item?.text)) return false;
  const frames = Array.isArray(record?.frames) ? record.frames : [];
  return frames.some((frame) => matchingMessages(item, frame?.messages).length > 0);
}

export function workspaceConversationPages(record) {
  return uniqueConversationPages((Array.isArray(record?.frames) ? record.frames : []).map(frameToPocketPage));
}

export function workspaceConversationEntries(record) {
  return workspaceConversationPages(record).flatMap(pageToHistoryEntries);
}

function longestUserMessage(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((best, entry) => {
    const text = String(entry?.userMessage || "");
    return text.length > String(best || "").length ? text : best;
  }, "");
}

export function promptHistoryEntryClusters(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const used = new Set();
  const clusters = [];
  let loose = [];
  const flush = () => {
    if (!loose.length) return;
    clusters.push({ merged: false, entries: loose });
    loose = [];
  };
  for (let index = 0; index < list.length; index += 1) {
    if (used.has(index)) continue;
    const seed = list[index];
    const seedKey = promptHistoryMessageKey(seed?.userMessage);
    if (!seedKey) {
      flush();
      clusters.push({ merged: false, entries: [seed] });
      used.add(index);
      continue;
    }
    const group = [seed];
    const groupIndexes = [index];
    for (let next = index + 1; next < list.length; next += 1) {
      if (used.has(next)) continue;
      if (!fullTextTextsOverlap(seed.userMessage, list[next]?.userMessage)) continue;
      group.push(list[next]);
      groupIndexes.push(next);
    }
    if (group.length > 1) {
      flush();
      groupIndexes.forEach((groupIndex) => used.add(groupIndex));
      clusters.push({
        key: seedKey,
        userMessage: longestUserMessage(group),
        entries: group,
        merged: true
      });
      continue;
    }
    used.add(index);
    loose.push(seed);
  }
  flush();
  return clusters;
}
