export const WORKSPACE_SESSION_SCHEMA_VERSION = 1;

// The page-local snapshot survives a normal document reload. Durable mirrors
// use a random workspace id carried in the extension-page URL; the browser tab
// id remains only a short-lived owner binding and legacy migration key.
export const WORKSPACE_SESSION_PAGE_KEY = "chatclubWorkspaceSessionPageV1";
export const WORKSPACE_SESSION_GENERATION_KEY = "chatclubWorkspaceSessionGeneration";
export const DEFAULT_WORKSPACE_SESSION_GENERATION = "chatclub-workspace-session-default-v1";
// Legacy mirrors shipped in the first workspace-memory build and were keyed
// by the browser's transient tab id. Keep the format readable so an already
// open page can migrate without losing its snapshot.
const WORKSPACE_SESSION_MIRROR_PREFIX = "chatclubWorkspaceSessionMirror:";
const WORKSPACE_SESSION_WORKSPACE_PREFIX = "chatclubWorkspaceSessionWorkspace:";
export const WORKSPACE_SESSION_BINDING_PREFIX = "chatclubWorkspaceSessionBinding:";
export const WORKSPACE_SESSION_RECOVERY_KEY = "chatclubWorkspaceSessionRecoveryV1";
export const WORKSPACE_SESSION_RUNTIME_MARKER_KEY = "chatclubWorkspaceSessionRuntimeV1";
export const WORKSPACE_SESSION_STORAGE_VERSION = 1;
export const WORKSPACE_SESSION_RECOVERY_VERSION = 1;
const WORKSPACE_SESSION_URL_PARAM = "workspace";
export const WORKSPACE_SESSION_RECOVERY_TTL_MS = 10 * 60 * 1000;
export const WORKSPACE_SESSION_RECENT_DETACH_MS = 2 * 60 * 1000;
export const WORKSPACE_SESSION_DETACHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeWorkspaceSessionGeneration(value) {
  const generation = typeof value === "string" ? value.trim() : "";
  return generation || DEFAULT_WORKSPACE_SESSION_GENERATION;
}

export function createWorkspaceSessionGeneration() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `workspace-${uuid}`;
  } catch {}
  const random = Math.random().toString(36).slice(2);
  return `workspace-${Date.now().toString(36)}-${random || "generation"}`;
}

export function normalizeWorkspaceSessionId(value) {
  const workspaceId = typeof value === "string" ? value.trim() : "";
  return /^page-[A-Za-z0-9_-]{12,128}$/.test(workspaceId) ? workspaceId : "";
}

export function createWorkspaceSessionId() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `page-${uuid}`;
  } catch {}
  const random = Math.random().toString(36).slice(2);
  return `page-${Date.now().toString(36)}-${random || "workspace"}`;
}

export function workspaceSessionWorkspaceKey(workspaceId) {
  const normalized = normalizeWorkspaceSessionId(workspaceId);
  if (!normalized) throw new TypeError("Workspace session mirror requires a valid workspace id");
  return `${WORKSPACE_SESSION_WORKSPACE_PREFIX}${normalized}`;
}

export function workspaceSessionWorkspaceId(key) {
  const value = String(key ?? "");
  if (!value.startsWith(WORKSPACE_SESSION_WORKSPACE_PREFIX)) return "";
  return normalizeWorkspaceSessionId(value.slice(WORKSPACE_SESSION_WORKSPACE_PREFIX.length));
}

export function workspaceSessionBindingKey(tabId) {
  const normalized = normalizedBrowserTabId(tabId);
  if (normalized === null) throw new TypeError("Workspace session binding requires a positive browser tab id");
  return `${WORKSPACE_SESSION_BINDING_PREFIX}${normalized}`;
}

export function workspaceSessionBindingTabId(key) {
  const value = String(key ?? "");
  if (!value.startsWith(WORKSPACE_SESSION_BINDING_PREFIX)) return null;
  const suffix = value.slice(WORKSPACE_SESSION_BINDING_PREFIX.length);
  if (!/^[1-9]\d*$/.test(suffix)) return null;
  return normalizedBrowserTabId(suffix);
}

export function workspaceSessionIdFromUrl(href) {
  try {
    const url = new URL(String(href || ""));
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    return normalizeWorkspaceSessionId(hashParams.get(WORKSPACE_SESSION_URL_PARAM))
      || normalizeWorkspaceSessionId(url.searchParams.get(WORKSPACE_SESSION_URL_PARAM));
  } catch {
    return "";
  }
}

export function workspaceSessionUrl(href, workspaceId) {
  const normalized = normalizeWorkspaceSessionId(workspaceId);
  if (!normalized) return "";
  try {
    const url = new URL(String(href || ""));
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    hashParams.set(WORKSPACE_SESSION_URL_PARAM, normalized);
    url.hash = hashParams.toString();
    return url.href;
  } catch {
    return "";
  }
}

function normalizedBrowserTabId(value) {
  const tabId = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

export function workspaceSessionMirrorKey(tabId) {
  const normalized = normalizedBrowserTabId(tabId);
  if (normalized === null) throw new TypeError("Workspace session mirror requires a positive browser tab id");
  return `${WORKSPACE_SESSION_MIRROR_PREFIX}${normalized}`;
}

export function workspaceSessionMirrorTabId(key) {
  const value = String(key ?? "");
  if (!value.startsWith(WORKSPACE_SESSION_MIRROR_PREFIX)) return null;
  const suffix = value.slice(WORKSPACE_SESSION_MIRROR_PREFIX.length);
  if (!/^[1-9]\d*$/.test(suffix)) return null;
  return normalizedBrowserTabId(suffix);
}
