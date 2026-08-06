import {
  WORKSPACE_SESSION_SCHEMA_VERSION,
  normalizeWorkspaceSessionGeneration
} from "../../shared/workspace-session.js";

const PROMPT_HANDOFF_LAYOUT_SKIP_REASON = Object.freeze({
  INVALID_APP_ID: "invalid-app-id",
  APP_NOT_FOUND: "app-not-found",
  INVALID_HOME_URL: "invalid-home-url"
});

function text(value) {
  return String(value ?? "").trim();
}

function httpUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function requestedAppId(group) {
  if (Array.isArray(group)) return text(group[0]);
  if (group && typeof group === "object") return text(group.appId || group.id);
  return text(group);
}

function appCatalogById(apps) {
  const byId = new Map();
  for (const app of Array.isArray(apps) ? apps : []) {
    const appId = text(app?.id);
    if (!appId || byId.has(appId)) continue;
    byId.set(appId, app);
  }
  return byId;
}

/**
 * Build a one-shot temporary workspace from the source workspace's active
 * apps. Runtime ids are deliberately absent; workspace snapshot restoration
 * allocates fresh group, frame, and temporary-layout ids in the target page.
 */
export function createPromptHandoffWorkspaceSnapshot(options = {}) {
  const sourceGroups = Array.isArray(options.appIdGroups) ? options.appIdGroups : [];
  const catalog = appCatalogById(options.apps);
  const groups = [];
  const acceptedAppIds = [];
  const skipped = [];

  for (const [groupIndex, sourceGroup] of sourceGroups.entries()) {
    const appId = requestedAppId(sourceGroup);
    if (!appId) {
      skipped.push({
        groupIndex,
        appId: "",
        reason: PROMPT_HANDOFF_LAYOUT_SKIP_REASON.INVALID_APP_ID
      });
      continue;
    }
    const app = catalog.get(appId);
    if (!app) {
      skipped.push({
        groupIndex,
        appId,
        reason: PROMPT_HANDOFF_LAYOUT_SKIP_REASON.APP_NOT_FOUND
      });
      continue;
    }
    const currentHref = httpUrl(app.url);
    if (!currentHref) {
      skipped.push({
        groupIndex,
        appId,
        reason: PROMPT_HANDOFF_LAYOUT_SKIP_REASON.INVALID_HOME_URL
      });
      continue;
    }
    groups.push({
      tabs: [{ appId, currentHref }],
      activeIndex: 0
    });
    acceptedAppIds.push(appId);
  }

  if (!groups.length) return { snapshot: null, acceptedAppIds, skipped };

  return {
    snapshot: {
      schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
      generation: normalizeWorkspaceSessionGeneration(options.generation),
      layout: {
        type: "temporary",
        presetId: text(options.basePresetId),
        name: text(options.layoutName) || "Prompt",
        pocketBatchId: ""
      },
      groups,
      fullscreenGroupIndex: null
    },
    acceptedAppIds,
    skipped
  };
}
