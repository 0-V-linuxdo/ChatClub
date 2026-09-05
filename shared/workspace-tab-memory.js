import { deleteConversationIdentityFromHref } from "./delete-completion.js";
import { isGenericTopicTitle } from "./topic-title.js";
import { WORKSPACE_SESSION_SCHEMA_VERSION } from "./workspace-session.js";

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

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function httpUrl(value) {
  return parsedHttpUrl(value)?.href || "";
}

export function conversationHrefFromLocation(value) {
  const url = parsedHttpUrl(value);
  if (!url) return "";
  if (deleteConversationIdentityFromHref(url.href)) return url.href;
  if (isKnownEmptyConversationPage(url)) return "";
  if (isKnownChatHost(url.hostname)) return "";
  return normalizedPath(url) === "/" ? "" : url.href;
}

export function preferredWorkspaceTabHref(values = []) {
  const hrefs = (Array.isArray(values) ? values : [])
    .map((value) => httpUrl(value))
    .filter(Boolean);
  for (const href of hrefs) {
    if (conversationHrefFromLocation(href)) return href;
  }
  return hrefs[0] || "";
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

export function workspaceSnapshotIsRememberable(snapshot) {
  if (workspaceSnapshotHasConversation(snapshot)) return true;
  const title = String(snapshot?.topicTitle || "").trim();
  return Boolean(title) && !isGenericTopicTitle(title);
}

function tabConversationHref(tab) {
  return httpUrl(tab?.currentHref || tab?.href || tab?.url || tab?.initialHref);
}

function mergePreferredConversationGroups(existingSnapshot, incomingSnapshot) {
  const existingGroups = Array.isArray(existingSnapshot?.groups) ? existingSnapshot.groups : [];
  const incomingGroups = Array.isArray(incomingSnapshot?.groups) ? incomingSnapshot.groups : [];
  return incomingGroups.map((group, groupIndex) => {
    const existingTabs = Array.isArray(existingGroups[groupIndex]?.tabs)
      ? existingGroups[groupIndex].tabs.slice()
      : [];
    const used = new Set();
    const tabs = (Array.isArray(group?.tabs) ? group.tabs : []).map((tab) => {
      const incomingHref = tabConversationHref(tab);
      if (conversationHrefFromLocation(incomingHref)) {
        return { ...tab, currentHref: incomingHref };
      }
      const appId = text(tab?.appId);
      const matchIndex = existingTabs.findIndex((candidate, index) => (
        !used.has(index) && text(candidate?.appId) === appId
      ));
      if (matchIndex < 0) return incomingHref ? { ...tab, currentHref: incomingHref } : tab;
      used.add(matchIndex);
      const existingHref = tabConversationHref(existingTabs[matchIndex]);
      const currentHref = conversationHrefFromLocation(existingHref) || incomingHref || existingHref;
      return currentHref ? { ...tab, currentHref } : tab;
    });
    return { ...group, tabs };
  });
}

export function snapshotWithRetainedConversation(existingSnapshot, incomingSnapshot) {
  let incoming = null;
  let existing = null;
  try { incoming = plainObject(incomingSnapshot) ? JSON.parse(JSON.stringify(incomingSnapshot)) : null; }
  catch { incoming = null; }
  if (!plainObject(incoming)) {
    try { existing = plainObject(existingSnapshot) ? JSON.parse(JSON.stringify(existingSnapshot)) : null; }
    catch { existing = null; }
    return plainObject(existing) ? existing : null;
  }
  try { existing = plainObject(existingSnapshot) ? JSON.parse(JSON.stringify(existingSnapshot)) : null; }
  catch { existing = null; }
  if (!workspaceSnapshotHasConversation(existing)) return incoming;
  if (workspaceSnapshotHasConversation(incoming)) {
    return {
      ...incoming,
      groups: mergePreferredConversationGroups(existing, incoming)
    };
  }
  return {
    ...incoming,
    groups: existing.groups,
    fullscreenGroupIndex: Object.prototype.hasOwnProperty.call(existing, "fullscreenGroupIndex")
      ? existing.fullscreenGroupIndex
      : incoming.fullscreenGroupIndex
  };
}

function sanitizedTab(value) {
  if (!plainObject(value)) return null;
  const appId = text(value.appId);
  if (!appId) return null;
  return {
    appId,
    currentHref: httpUrl(value.currentHref || value.href || value.url || value.initialHref)
  };
}

function sanitizedGroup(value) {
  const tabs = (Array.isArray(value?.tabs) ? value.tabs : []).map(sanitizedTab).filter(Boolean);
  if (!tabs.length) return null;
  const requested = Number(value?.activeIndex);
  const activeIndex = Number.isSafeInteger(requested)
    ? Math.max(0, Math.min(requested, tabs.length - 1))
    : 0;
  return { tabs, activeIndex };
}

function sanitizedLayout(value) {
  const source = plainObject(value) ? value : {};
  const presetId = text(source.presetId || source.activeLayoutPresetId);
  const temporary = source.type === "temporary"
    || source.temporary === true
    || Boolean(source.temporary && typeof source.temporary === "object");
  if (!temporary) return { type: "preset", presetId };
  const temp = plainObject(source.temporary) ? source.temporary : source;
  return {
    type: "temporary",
    presetId,
    name: text(temp.name),
    pocketBatchId: text(temp.pocketBatchId)
  };
}

export function sanitizeExportedWorkspaceTab(value) {
  const source = plainObject(value) ? value : {};
  const snapshotSource = plainObject(source.snapshot) ? source.snapshot : source;
  if (Number(snapshotSource.schemaVersion) !== WORKSPACE_SESSION_SCHEMA_VERSION) return null;
  const groups = (Array.isArray(snapshotSource.groups) ? snapshotSource.groups : [])
    .map(sanitizedGroup)
    .filter(Boolean);
  const requestedFullscreen = Number(snapshotSource.fullscreenGroupIndex);
  const snapshot = {
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    layout: sanitizedLayout(snapshotSource.layout),
    groups,
    fullscreenGroupIndex: Number.isSafeInteger(requestedFullscreen)
      && requestedFullscreen >= 0
      && requestedFullscreen < groups.length
      ? requestedFullscreen
      : null,
    topicTitle: text(snapshotSource.topicTitle || source.title),
    topicTitleCustom: snapshotSource.topicTitleCustom === true || source.topicTitleCustom === true
  };
  if (!workspaceSnapshotHasConversation(snapshot)) return null;
  return {
    title: text(source.title || snapshot.topicTitle),
    snapshot
  };
}

export function inspectImportedWorkspaceTabs(raw) {
  if (!Array.isArray(raw)) return { value: null, droppedCount: 0 };
  if (!raw.length) return { value: [], droppedCount: 0 };
  const value = [];
  let droppedCount = 0;
  for (const item of raw) {
    const sanitized = sanitizeExportedWorkspaceTab(item);
    if (sanitized) value.push(sanitized);
    else droppedCount += 1;
  }
  return value.length ? { value, droppedCount } : { value: null, droppedCount };
}

export function workspaceTabFingerprint(item) {
  const sanitized = sanitizeExportedWorkspaceTab(item);
  if (!sanitized) return "";
  try {
    return JSON.stringify({
      title: sanitized.title,
      layout: sanitized.snapshot.layout,
      groups: sanitized.snapshot.groups
    });
  } catch {
    return "";
  }
}
