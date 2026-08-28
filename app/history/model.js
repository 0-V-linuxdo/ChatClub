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
  const visible = names.slice(0, 3);
  const extra = names.length - visible.length;
  const sources = extra > 0 ? `${visible.join(", ")} +${extra}` : visible.join(", ");
  const vars = { count, plural: count === 1 ? "" : "s", sources };
  return sources ? t("pocket.groupSources", vars) : t("pocket.groupCards", vars);
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

function promptHistoryPairMatchesUser(pair, item) {
  return fullTextTextsOverlap(pair?.userMessage, item?.text);
}

function promptHistoryPairMatches(pair, item) {
  return promptHistoryPairMatchesUser(pair, item)
    || fullTextTextsOverlap(pair?.assistantMessage, item?.text);
}

function matchingMessages(item, messages = []) {
  const pairs = pocketPairsFromMessages(messages);
  const userMatches = pairs.filter((pair) => promptHistoryPairMatchesUser(pair, item));
  const matching = userMatches.length
    ? userMatches
    : pairs.filter((pair) => promptHistoryPairMatches(pair, item));
  if (matching.length) {
    return matching.flatMap((pair) => [
      { role: "user", text: pair.userMessage },
      { role: "assistant", text: pair.assistantMessage }
    ]);
  }
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : "";
    const text = String(message?.text || message?.content || "").trim();
    return role && text && fullTextTextsOverlap(text, item?.text) ? [{ role, text }] : [];
  });
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

function pageIdentityKey(page = {}) {
  const href = String(page.href || page.url || "").trim();
  if (href) return `href:${href}`;
  const instanceId = String(page.instanceId || "").trim();
  return instanceId ? `id:${instanceId}` : "";
}

function pageMessageScore(page = {}) {
  const messages = Array.isArray(page.messages) ? page.messages : [];
  let score = 0;
  for (const message of messages) {
    score += 1 + String(message?.text || "").trim().length;
  }
  return score;
}

function adoptConversationPage(existing, page) {
  if (!existing.logoUrl && page.logoUrl) existing.logoUrl = page.logoUrl;
  if (!existing.appId && page.appId) existing.appId = page.appId;
  if (!existing.href && (page.href || page.url)) {
    existing.href = page.href || page.url;
    existing.url = page.url || page.href;
  }
  if (!existing.title && page.title) existing.title = page.title;
  if (!existing.appName && page.appName) existing.appName = page.appName;
  if (pageMessageScore(page) <= pageMessageScore(existing)) return;
  existing.messages = page.messages;
  if (page.title) existing.title = page.title;
  if (page.pageTitle) existing.pageTitle = page.pageTitle;
  if (page.logoUrl) existing.logoUrl = page.logoUrl;
  if (page.appName) existing.appName = page.appName;
  if (page.siteName) existing.siteName = page.siteName;
}

function uniqueConversationPages(pages = []) {
  const seenIdentity = new Map();
  const seenContent = new Map();
  const result = [];
  for (const page of pages) {
    const messages = Array.isArray(page.messages) ? page.messages : [];
    if (!messages.length) continue;
    const identity = pageIdentityKey(page);
    if (identity) {
      const existing = seenIdentity.get(identity);
      if (existing) {
        adoptConversationPage(existing, page);
        continue;
      }
      seenIdentity.set(identity, page);
      result.push(page);
      continue;
    }
    const key = [page.siteName || page.name, ...messages.map((message) => message.text)].join("\n");
    const existing = seenContent.get(key);
    if (!existing) {
      seenContent.set(key, page);
      result.push(page);
      continue;
    }
    adoptConversationPage(existing, page);
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
  const pairs = pocketPairsFromMessages(messages).filter((pair) => (
    promptHistoryMessageKey(pair.userMessage) || promptHistoryMessageKey(pair.assistantMessage)
  ));
  if (pairs.length) {
    return pairs.map((pair) => ({
      ...meta,
      userMessage: pair.userMessage,
      assistantMessage: pair.assistantMessage
    }));
  }
  const user = messages.find((message) => message.role === "user" && promptHistoryMessageKey(message.text));
  const assistant = messages.find((message) => message.role === "assistant" && promptHistoryMessageKey(message.text));
  if (!user && !assistant) return [];
  return [{
    ...meta,
    userMessage: user?.text || "",
    assistantMessage: assistant?.text || ""
  }];
}

export function promptHistoryConversationEntries(item, sources = {}) {
  return promptHistoryConversationPages(item, sources).flatMap(pageToHistoryEntries);
}

export function promptHistoryEntryClusters(entries = []) {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => (
    promptHistoryMessageKey(entry?.userMessage) || promptHistoryMessageKey(entry?.assistantMessage)
  ));
  const entriesByMessage = new Map();
  for (const entry of list) {
    const messageKey = promptHistoryMessageKey(entry?.userMessage);
    if (!messageKey) continue;
    let group = entriesByMessage.get(messageKey);
    if (!group) {
      group = [];
      entriesByMessage.set(messageKey, group);
    }
    group.push(entry);
  }
  const clusters = [];
  const emitted = new Set();
  let loose = [];
  const flush = () => {
    if (!loose.length) return;
    clusters.push({ merged: false, entries: loose });
    loose = [];
  };
  for (const entry of list) {
    const messageKey = promptHistoryMessageKey(entry?.userMessage);
    const group = messageKey ? entriesByMessage.get(messageKey) || [] : [];
    if (messageKey && group.length > 1) {
      if (emitted.has(messageKey)) continue;
      flush();
      emitted.add(messageKey);
      clusters.push({
        key: messageKey,
        userMessage: group[0]?.userMessage || entry.userMessage,
        entries: group,
        merged: true
      });
      continue;
    }
    loose.push(entry);
  }
  flush();
  return clusters;
}
