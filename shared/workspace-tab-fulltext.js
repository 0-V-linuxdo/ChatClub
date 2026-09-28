import { normalizeWorkspaceSessionId } from "./workspace-session.js";
import {
  conversationKeyFromHref,
  fullTextCaptureMarksEqual,
  fullTextTextsOverlap,
  normalizeFullTextCaptureMark
} from "./fulltext-ledger.js";

export { fullTextTextsOverlap };

export const WORKSPACE_TAB_FULLTEXT_MAX_WORKSPACES = 80;
const WORKSPACE_TAB_FULLTEXT_MAX_FRAMES = 12;
const WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES = 200;
const WORKSPACE_TAB_FULLTEXT_MAX_MESSAGE_CHARS = 20000;

function textValue(value) {
  return String(value || "").trim();
}

function foldFullTextSearchText(value) {
  const text = String(value || "");
  if (!text) return "";
  try {
    return text.normalize("NFKC").toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

function normalizeFullTextQuery(value) {
  return foldFullTextSearchText(textValue(value));
}

export function matchesFullTextQuery(query, values = []) {
  const needle = normalizeFullTextQuery(query);
  if (!needle) return true;
  return (Array.isArray(values) ? values : [values]).some((value) => (
    normalizeFullTextQuery(value).includes(needle)
  ));
}

function codePointSize(text, index) {
  const code = String(text || "").codePointAt(index);
  return Number.isInteger(code) && code > 0xFFFF ? 2 : 1;
}

function mapFoldedRangeToOriginal(original, foldedStart, foldedEnd) {
  let foldedIndex = 0;
  let start = 0;
  let end = original.length;
  let seenStart = false;
  for (let index = 0; index < original.length; ) {
    const size = codePointSize(original, index);
    const piece = foldFullTextSearchText(original.slice(index, index + size));
    const nextFolded = foldedIndex + (piece.length || 0);
    if (!seenStart && nextFolded > foldedStart) {
      start = index;
      seenStart = true;
    }
    if (seenStart && nextFolded >= foldedEnd) {
      end = index + size;
      break;
    }
    foldedIndex = nextFolded;
    index += size;
  }
  if (!seenStart) start = Math.min(foldedStart, original.length);
  if (end <= start) end = Math.min(original.length, start + codePointSize(original, start));
  return { start, end };
}

export function findFullTextQueryRanges(text, query) {
  const original = String(text || "");
  const needle = normalizeFullTextQuery(query);
  if (!needle || !original) return [];
  const folded = foldFullTextSearchText(original);
  const ranges = [];
  let from = 0;
  let index = folded.indexOf(needle, from);
  while (index >= 0) {
    const mapped = folded.length === original.length
      ? { start: index, end: index + needle.length }
      : mapFoldedRangeToOriginal(original, index, index + needle.length);
    if (mapped.end > mapped.start && (!ranges.length || mapped.start >= ranges[ranges.length - 1].end)) {
      ranges.push(mapped);
    }
    from = index + Math.max(needle.length, 1);
    index = folded.indexOf(needle, from);
  }
  return ranges;
}

function normalizeFullTextMessage(message = {}) {
  const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : "";
  const text = clipText(message?.text || message?.content);
  return role && text ? { role, text } : null;
}

export function pocketPairsFromMessages(messages = []) {
  const entries = [];
  let userMessage = "";
  for (const raw of Array.isArray(messages) ? messages : []) {
    const message = normalizeFullTextMessage(raw);
    if (!message) continue;
    if (message.role === "user") {
      userMessage = message.text;
      continue;
    }
    if (message.role === "assistant" && userMessage) {
      entries.push({ userMessage, assistantMessage: message.text });
      userMessage = "";
    }
  }
  return entries;
}

function stableConversationHref(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return "";
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    const host = url.hostname.toLowerCase();
    if (path === "/" || path === "/ai" || path === "/new") return "";
    if ((host === "gemini.google.com" || host === "bard.google.com") && path === "/app") return "";
    if (
      (host === "app.notion.com" || host === "notion.so" || host.endsWith(".notion.so"))
      && path === "/chat"
      && !url.searchParams.get("t")
    ) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function frameIdentityKey(frame = {}) {
  const href = stableConversationHref(frame.href);
  if (href) return `href:${href}`;
  const instanceId = textValue(frame.instanceId);
  if (instanceId) return `id:${instanceId}`;
  const fallbackHref = textValue(frame.href);
  return fallbackHref ? `href:${fallbackHref}` : "";
}

export function workspaceTabFullTextFrameIdentityKey(frame = {}) {
  return frameIdentityKey(frame);
}

function pairsOverlap(left, right) {
  return fullTextTextsOverlap(left?.userMessage, right?.userMessage);
}

function mergeFrameMessages(existingMessages, incomingMessages) {
  const existing = (Array.isArray(existingMessages) ? existingMessages : [])
    .map((message) => normalizeFullTextMessage(message))
    .filter(Boolean);
  const incoming = (Array.isArray(incomingMessages) ? incomingMessages : [])
    .map((message) => normalizeFullTextMessage(message))
    .filter(Boolean);
  if (!incoming.length) return existing.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  if (!existing.length) return incoming.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  const existingPairs = pocketPairsFromMessages(existing);
  const incomingPairs = pocketPairsFromMessages(incoming);
  if (!incomingPairs.length) return existing.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  if (!existingPairs.length) return incoming.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  const existingCovered = existingPairs.every((pair) => incomingPairs.some((other) => pairsOverlap(pair, other)));
  if (existingCovered && incomingPairs.length >= existingPairs.length) {
    return incoming.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  }
  const mergedPairs = existingPairs.map((pair) => {
    const match = incomingPairs.find((other) => pairsOverlap(pair, other));
    if (!match) return pair;
    return {
      userMessage: match.userMessage.length >= pair.userMessage.length ? match.userMessage : pair.userMessage,
      assistantMessage: match.assistantMessage.length >= pair.assistantMessage.length
        ? match.assistantMessage
        : pair.assistantMessage
    };
  });
  for (const incomingPair of incomingPairs) {
    if (!mergedPairs.some((pair) => pairsOverlap(pair, incomingPair))) mergedPairs.push(incomingPair);
  }
  return mergedPairs
    .flatMap((pair) => [
      { role: "user", text: pair.userMessage },
      { role: "assistant", text: pair.assistantMessage }
    ])
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
}

export function mergeWorkspaceTabFullTextFrames(existing = [], incoming = []) {
  const current = (Array.isArray(existing) ? existing : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
  const next = (Array.isArray(incoming) ? incoming : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
  if (!next.length) return current.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
  const indexByKey = new Map();
  const merged = current.map((frame, index) => {
    const key = frameIdentityKey(frame);
    if (key) indexByKey.set(key, index);
    return frame;
  });
  for (const frame of next) {
    const key = frameIdentityKey(frame);
    const index = key ? indexByKey.get(key) : undefined;
    if (index != null) {
      const previous = merged[index];
      const messages = mergeFrameMessages(previous.messages, frame.messages);
      // A mark describes the text it was Copied with. An incoming frame
      // brings its own; otherwise the old mark survives only while the text
      // it describes is unchanged, so a Summary persist cannot leave a stale
      // baseline behind.
      const capture = frame.capture || (messagesEqual(previous.messages, messages) ? previous.capture : null);
      merged[index] = {
        ...frame,
        messages,
        order: previous.order,
        ...(capture ? { capture } : {})
      };
      if (!capture) delete merged[index].capture;
      continue;
    }
    if (key) indexByKey.set(key, merged.length);
    merged.push({ ...frame, order: merged.length });
  }
  return merged
    .map((frame, order) => ({ ...frame, order }))
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
}

export function fullTextMessagesHavePair(messages) {
  return pocketPairsFromMessages(messages).some((pair) => (
    textValue(pair.userMessage) && textValue(pair.assistantMessage)
  ));
}

export function framesFromSummaryPreviewItems(items = []) {
  return (Array.isArray(items) ? items : []).flatMap((item, order) => {
    if (item?.status && item.status !== "ok") return [];
    const page = item?.page && typeof item.page === "object" ? item.page : item || {};
    const messages = (Array.isArray(page.messages) ? page.messages : [])
      .map((message) => normalizeFullTextMessage(message))
      .filter(Boolean)
      .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
    if (!messages.length) return [];
    return [{
      appId: textValue(item.siteId || item.appId || page.siteId),
      instanceId: textValue(item.instanceId || page.instanceId),
      href: textValue(page.href || item.href),
      title: textValue(page.title || item.title || page.pageTitle),
      appName: textValue(item.siteName || item.name || page.siteName || page.name),
      logoUrl: textValue(page.logoUrl || item.logoUrl),
      messages,
      order: Number.isInteger(item.order) ? item.order : order,
      ...(item.captureMark ? { capture: item.captureMark } : {})
    }];
  }).slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
}

function messagesEqual(left = [], right = []) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].role !== right[index].role) return false;
    if (left[index].text !== right[index].text) return false;
  }
  return true;
}

function normalizedFrames(frames) {
  return (Array.isArray(frames) ? frames : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean);
}

// Text equality only: capture marks are compared separately so a mark-only
// change is written without counting as new content.
export function workspaceTabFullTextFramesEqual(left = [], right = []) {
  const a = normalizedFrames(left);
  const b = normalizedFrames(right);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (frameIdentityKey(a[index]) !== frameIdentityKey(b[index])) return false;
    if (textValue(a[index].href) !== textValue(b[index].href)) return false;
    if (!messagesEqual(a[index].messages, b[index].messages)) return false;
  }
  return true;
}

export function workspaceTabFullTextMarksEqual(left = [], right = []) {
  const a = normalizedFrames(left);
  const b = normalizedFrames(right);
  if (a.length !== b.length) return false;
  return a.every((frame, index) => fullTextCaptureMarksEqual(frame.capture, b[index].capture));
}

function frameConversationKey(frame = {}) {
  return frame.capture?.conversationKey || conversationKeyFromHref(frame.href);
}

// Mark-only update from the idle reconciler: the frames keep their text and
// order, only the matching conversation's capture mark changes.
export function applyWorkspaceTabFullTextMarks(frames = [], marks = []) {
  const byKey = new Map();
  for (const raw of Array.isArray(marks) ? marks : []) {
    const mark = normalizeFullTextCaptureMark(raw);
    if (mark) byKey.set(mark.conversationKey, mark);
  }
  return normalizedFrames(frames).map((frame) => {
    const mark = byKey.get(frameConversationKey(frame));
    return mark ? { ...frame, capture: mark } : frame;
  });
}

// The stored frame for one conversation, for the reconciler's decision.
export function workspaceTabFullTextConversation(record, conversationKey) {
  const key = String(conversationKey || "");
  if (!key) return null;
  let found = null;
  for (const frame of normalizedFrames(record?.frames)) {
    if (frameConversationKey(frame) !== key) continue;
    if (!found || String(frame.capture?.capturedAt || "") > String(found.capture?.capturedAt || "")) found = frame;
  }
  if (!found) return null;
  const users = found.messages.filter((message) => message.role === "user");
  return {
    mark: found.capture || null,
    hasPair: fullTextMessagesHavePair(found.messages),
    lastUserMessage: users.length ? users[users.length - 1].text : ""
  };
}

function clipText(value, max = WORKSPACE_TAB_FULLTEXT_MAX_MESSAGE_CHARS) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeFrame(frame = {}, order = 0) {
  const messages = (Array.isArray(frame.messages) ? frame.messages : [])
    .map((message) => normalizeFullTextMessage(message))
    .filter(Boolean)
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_MESSAGES);
  if (!messages.length) return null;
  const capture = normalizeFullTextCaptureMark(frame.capture);
  return {
    appId: textValue(frame.appId),
    instanceId: textValue(frame.instanceId),
    href: textValue(frame.href),
    title: textValue(frame.title),
    appName: textValue(frame.appName),
    logoUrl: textValue(frame.logoUrl),
    messages,
    order: Number.isInteger(frame.order) ? frame.order : order,
    ...(capture ? { capture } : {})
  };
}

function normalizeWorkspaceTabFullTextRecord(raw = {}) {
  const workspaceId = normalizeWorkspaceSessionId(raw.workspaceId);
  const frames = (Array.isArray(raw.frames) ? raw.frames : [])
    .map((frame, order) => normalizeFrame(frame, order))
    .filter(Boolean)
    .slice(0, WORKSPACE_TAB_FULLTEXT_MAX_FRAMES);
  if (!workspaceId || !frames.length) return null;
  return {
    workspaceId,
    topicTitle: textValue(raw.topicTitle),
    updatedAt: textValue(raw.updatedAt) || new Date().toISOString(),
    frames
  };
}

export function normalizeWorkspaceTabFullTextStore(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const store = {};
  for (const [key, value] of Object.entries(source)) {
    const record = normalizeWorkspaceTabFullTextRecord({ ...value, workspaceId: value?.workspaceId || key });
    if (record) store[record.workspaceId] = record;
  }
  return pruneWorkspaceTabFullTextStore(store);
}

export function pruneWorkspaceTabFullTextStore(store = {}) {
  const records = Object.values(store && typeof store === "object" ? store : {})
    .map((record) => normalizeWorkspaceTabFullTextRecord(record))
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return Object.fromEntries(
    records.slice(0, WORKSPACE_TAB_FULLTEXT_MAX_WORKSPACES).map((record) => [record.workspaceId, record])
  );
}

export function upsertWorkspaceTabFullText(store, record) {
  const next = normalizeWorkspaceTabFullTextRecord(record);
  if (!next) return normalizeWorkspaceTabFullTextStore(store);
  return pruneWorkspaceTabFullTextStore({
    ...normalizeWorkspaceTabFullTextStore(store),
    [next.workspaceId]: next
  });
}

export function removeWorkspaceTabFullText(store, workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  const current = normalizeWorkspaceTabFullTextStore(store);
  if (!id || !Object.prototype.hasOwnProperty.call(current, id)) return current;
  const next = { ...current };
  delete next[id];
  return next;
}

export function searchWorkspaceTabFullTextHits(store, query, items = []) {
  const needle = normalizeFullTextQuery(query);
  if (!needle) return [];
  const labels = new Map(
    (Array.isArray(items) ? items : []).map((item) => [normalizeWorkspaceSessionId(item.workspaceId), item])
  );
  const hits = [];
  for (const record of Object.values(normalizeWorkspaceTabFullTextStore(store))) {
    const item = labels.get(record.workspaceId);
    for (const frame of record.frames) {
      for (const pair of pocketPairsFromMessages(frame.messages)) {
        if (!matchesFullTextQuery(needle, [pair.userMessage, pair.assistantMessage, frame.title, frame.appName])) {
          continue;
        }
        hits.push({
          workspaceId: record.workspaceId,
          topicTitle: record.topicTitle,
          live: item?.live === true,
          title: item?.topicTitle || record.topicTitle || frame.title || frame.appName,
          appName: frame.appName,
          href: frame.href,
          userMessage: pair.userMessage,
          assistantMessage: pair.assistantMessage
        });
      }
    }
  }
  return hits;
}

export function uniqueWorkspaceTabFullTextHits(store, query, items = []) {
  const grouped = new Map();
  for (const hit of searchWorkspaceTabFullTextHits(store, query, items)) {
    let entry = grouped.get(hit.workspaceId);
    if (!entry) {
      entry = {
        workspaceId: hit.workspaceId,
        topicTitle: hit.topicTitle,
        live: hit.live === true,
        title: hit.title,
        appNames: []
      };
      grouped.set(hit.workspaceId, entry);
    }
    const appName = textValue(hit.appName);
    if (appName && !entry.appNames.includes(appName)) entry.appNames.push(appName);
  }
  return [...grouped.values()];
}

export function leftoverWorkspaceTabFullTextHits(store, query, items = []) {
  const present = new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeWorkspaceSessionId(item?.workspaceId))
      .filter(Boolean)
  );
  return uniqueWorkspaceTabFullTextHits(store, query, items)
    .filter((hit) => !present.has(hit.workspaceId));
}

export function workspaceIdsMatchingFullText(store, query) {
  return [...new Set(searchWorkspaceTabFullTextHits(store, query).map((hit) => hit.workspaceId))];
}

function frameToPocketPage(frame = {}) {
  const href = textValue(frame.href);
  if (!href || !fullTextMessagesHavePair(frame.messages)) return null;
  return {
    href,
    url: href,
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

export function pocketPagesFromWorkspaceFullText(store, workspaceId) {
  const id = normalizeWorkspaceSessionId(workspaceId);
  const record = id ? normalizeWorkspaceTabFullTextStore(store)[id] : null;
  return (record?.frames || []).map((frame) => frameToPocketPage(frame)).filter(Boolean);
}

export function pocketPagesFromPreviewItems(items = []) {
  return framesFromSummaryPreviewItems(items).map((frame) => frameToPocketPage(frame)).filter(Boolean);
}
