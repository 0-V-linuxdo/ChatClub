import { t } from "../../shared/i18n.js";
import { appPickerHostKeys, normalizeAppPickerHost } from "./app-hosts.js";
import { layoutGroupsFromWorkspace } from "./model.js";
import { createControllerMethodValidator, validateControllerContract } from "../controller-contract.js";

const requireMethods = createControllerMethodValidator("Workspace Pocket", "port");

export function createWorkspacePocketController(dependencies = {}) {
  const { state, services, registry, session, layout, frame } = validateControllerContract(
    dependencies,
    "Workspace Pocket controller",
    {
      state: "object",
      services: "object",
      registry: "object",
      session: "object",
      layout: "object",
      frame: "object"
    }
  );
  const {
    allApps,
    appById,
    createFrameId,
    createGroupId,
    createLayoutId,
    openableTabUrl,
    render
  } = services;
  requireMethods(registry, "registry", ["frameApp"]);
  requireMethods(session, "session", ["rememberWorkspaceSession"]);
  requireMethods(layout, "layout", ["validChatAppIds"]);
  requireMethods(frame, "frame", ["activateChatTab", "assignFrameSrc"]);
  const { frameApp } = registry;
  const { rememberWorkspaceSession } = session;
  const { validChatAppIds } = layout;
  const { activateChatTab, assignFrameSrc } = frame;

  function pocketEntryHref(entry = {}) {
    return openableTabUrl(entry.chatUrl || entry.url || entry.href || "");
  }

  function pocketNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pocketHost(value) {
    const href = openableTabUrl(value);
    if (!href) return "";
    try {
      return normalizeAppPickerHost(new URL(href).hostname);
    } catch {
      return "";
    }
  }

  function appMatchesPocketHost(app, host) {
    if (!host) return false;
    for (const key of appPickerHostKeys(app)) {
      if (key === host || host.endsWith(`.${key}`)) return true;
    }
    return false;
  }

  function appForPocketEntry(entry = {}) {
    const directId = String(entry.appId || "");
    const direct = directId ? appById(directId) : null;
    if (direct?.id === directId) return direct;
    const host = pocketHost(pocketEntryHref(entry));
    return allApps().find((app) => appMatchesPocketHost(app, host)) || null;
  }

  function chatLocationForInstance(instanceId) {
    if (!instanceId) return null;
    for (const group of state.groups || []) {
      const tabIndex = (group.chatApps || []).findIndex((chat) => chat.instanceId === instanceId);
      if (tabIndex >= 0) return { group, chat: group.chatApps[tabIndex], tabIndex };
    }
    return null;
  }

  function pocketFrameRecord(iframe) {
    if (!iframe) return null;
    const location = chatLocationForInstance(iframe.dataset.instanceId || "");
    return { iframe, group: location?.group || null, chat: location?.chat || null };
  }

  function frameMatchesPocketHost(iframe, host) {
    if (!host) return false;
    const app = frameApp(iframe);
    if (appMatchesPocketHost(app, host)) return true;
    return [
      iframe.dataset.currentHref,
      iframe.src,
      iframe.getAttribute("src")
    ].some((value) => pocketHost(value) === host);
  }

  function findPocketFrame(entry = {}) {
    const instanceId = String(entry.instanceId || "");
    if (instanceId) {
      const iframe = document.querySelector(`iframe[data-instance-id="${instanceId}"]`);
      if (iframe) return pocketFrameRecord(iframe);
    }
    const app = appForPocketEntry(entry);
    const frames = Array.from(document.querySelectorAll(".chat-frame"));
    if (app?.id) {
      const iframe = frames.find((frame) => frame.classList.contains("active") && frame.dataset.appId === app.id)
        || frames.find((frame) => frame.dataset.appId === app.id);
      if (iframe) return pocketFrameRecord(iframe);
    }
    const host = pocketHost(pocketEntryHref(entry));
    const iframe = frames.find((frame) => frameMatchesPocketHost(frame, host));
    return iframe ? pocketFrameRecord(iframe) : null;
  }

  function loadPocketEntryInFrame(entry = {}) {
    const href = pocketEntryHref(entry);
    if (!href) return false;
    const record = findPocketFrame(entry);
    if (!record?.iframe) return false;
    const instanceId = record.iframe.dataset.instanceId || "";
    if (record.group && instanceId) activateChatTab(record.group, instanceId);
    record.iframe.dataset.currentHref = href;
    rememberWorkspaceSession();
    return assignFrameSrc(record.iframe, href);
  }

  function pocketRestoreSources(entries = []) {
    const seen = new Set();
    return (entries || []).map((entry, index) => {
      const href = pocketEntryHref(entry);
      const app = appForPocketEntry(entry);
      if (!href || !app?.id) return null;
      const sourceId = String(entry.sourceId || entry.instanceId || `${app.id}\n${href}`);
      if (seen.has(sourceId)) return null;
      seen.add(sourceId);
      return {
        entry,
        href,
        app,
        sourceId,
        groupId: String(entry.groupId || ""),
        groupIndex: pocketNumber(entry.groupIndex, 0),
        tabIndex: pocketNumber(entry.tabIndex, index),
        index
      };
    }).filter(Boolean).sort((a, b) =>
      a.groupIndex - b.groupIndex
      || a.groupId.localeCompare(b.groupId)
      || a.tabIndex - b.tabIndex
      || a.index - b.index
    );
  }

  function pocketRestoreGroups(entries = []) {
    const groups = [];
    const byKey = new Map();
    for (const source of pocketRestoreSources(entries)) {
      const key = `${source.groupIndex}:${source.groupId}`;
      let group = byKey.get(key);
      if (!group) {
        group = { key, groupIndex: source.groupIndex, sources: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.sources.push(source);
    }
    return groups.sort((a, b) => a.groupIndex - b.groupIndex);
  }

  function activatePocketTemporaryLayout(restoreGroups = [], batchId = "") {
    const activeTabs = {};
    const groups = restoreGroups.map((restoreGroup) => {
      const group = { id: createGroupId(), temporary: true, pocketBatchId: batchId, chatApps: [] };
      for (const source of restoreGroup.sources) {
        const instanceId = createFrameId();
        group.chatApps.push({ appId: source.app.id, instanceId, initialHref: source.href });
      }
      return group;
    }).filter((group) => group.chatApps.length);
    if (!groups.length) return false;
    for (const group of groups) activeTabs[group.id] = group.chatApps[0]?.instanceId || "";
    state.temporaryLayoutPreset = {
      id: createLayoutId(),
      name: t("pocket.restoreBatch"),
      temporary: true,
      pocketBatchId: batchId,
      chatAppIdGroups: layoutGroupsFromWorkspace(groups, validChatAppIds())
    };
    state.fullscreenGroupId = null;
    state.groups = groups;
    state.activeTabs = activeTabs;
    rememberWorkspaceSession();
    render();
    return true;
  }

  async function restorePocketBatch(entries = []) {
    const restoreGroups = pocketRestoreGroups(entries);
    if (!restoreGroups.length) return false;
    const batchId = String(entries[0]?.batchId || "");
    return activatePocketTemporaryLayout(restoreGroups, batchId);
  }

  return Object.freeze({
    chatLocationForInstance,
    loadPocketEntryInFrame,
    restorePocketBatch
  });
}
