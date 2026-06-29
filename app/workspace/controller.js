import { t } from "../../shared/i18n.js";
import { sendToIframe } from "../../shared/post-message.js";
import { TAB_GROUP_HEADER_BUTTONS } from "../../shared/constants.js";
import { normalizeTabGroupButtonOrder, normalizeTabGroupButtonPlacement } from "../../shared/storage.js";
import { el } from "../../ui/dom.js";
import {
  hydrateWorkspaceGroups,
  layoutGroupsFromWorkspace,
  moveDroppedGroupWithinWorkspace,
  moveGroupWithinWorkspace,
  moveTabWithinGroup,
  normalizeWorkspaceLayoutGroups,
  removeChatFromGroup,
  removeGroupFromWorkspace,
  workspaceGridColumnCount
} from "./model.js";
import { createWorkspaceFrameRegistry } from "./frame-registry.js";
import { createWorkspaceOpenTabs } from "./open-tab.js";

const DRAG_TAB_MIME = "application/x-chatclub-tab";
const DRAG_TAB_GROUP_MIME = "application/x-chatclub-tab-group";
const DRAG_GROUP_MIME = "application/x-chatclub-group";
const TAB_DRAG_START_DISTANCE = 6;
const GROUP_DRAG_START_DISTANCE = 6;
const APP_PICKER_INTERNATIONAL_IDS = [
  "ChatGPT",
  "Claude",
  "Copilot",
  "CopilotGH",
  "Felo",
  "Gemini",
  "Genspark",
  "Grok",
  "Liner",
  "Meta",
  "Mistral",
  "Perplexity",
  "Poe",
  "QwenChat",
  "You",
  "Zai",
  "NotionAI",
  "Kagi",
  "TypingMind"
];
const APP_PICKER_INTERNATIONAL_ID_SET = new Set(APP_PICKER_INTERNATIONAL_IDS);
const APP_PICKER_FORCE_INTERNATIONAL_HOSTS = new Set(["assistant.kagi.com"]);
const APP_PICKER_CHINESE_IDS = [
  "ChatGLM",
  "DeepSeek",
  "DouBao",
  "YiYan",
  "Kimi",
  "LingGuang",
  "LongCat",
  "MetaSo",
  "HaiLuo",
  "NaMiSearch",
  "Qwen",
  "SenseChat",
  "YueWen",
  "HunYuan"
];
const APP_PICKER_CHINESE_ID_SET = new Set(APP_PICKER_CHINESE_IDS);

/**
 * @typedef {object} WorkspaceControllerContext
 * @property {any} state
 * @property {() => string} createGroupId
 * @property {() => string} createFrameId
 * @property {() => string} createLayoutId
 * @property {() => any[]} allApps
 * @property {(id: string) => any} appById
 * @property {(app: any) => string} inferAppName
 * @property {(app: any) => string} appFaviconUrl
 * @property {(app: any) => string} fallbackFaviconUrl
 * @property {(href: string) => string} browserFaviconUrl
 * @property {(href: string, declaredLogoUrl?: string) => string} effectiveFaviconUrl
 * @property {(href: string) => Promise<string>} discoverDeclaredFaviconUrl
 * @property {(href: string, logoUrl: string) => void} rememberFaviconUrl
 * @property {(nextOptions: any) => Promise<any>} saveOptions
 * @property {(nextOptions: any) => any} normalizeOptions
 * @property {(message: string, type?: string) => void} toast
 * @property {() => void} render
 * @property {(name: string) => SVGElement} svgIcon
 * @property {(label: string, iconName: string, onClick: Function, extraClass?: string, tooltipLabel?: string, tooltipPlacement?: string, tooltipId?: string) => HTMLElement} compactIconButton
 * @property {(label: string, iconName: string, onClick: Function, variant?: string, disabled?: boolean, tooltipLabel?: string, tooltipPlacement?: string, tooltipId?: string) => HTMLElement} menuButton
 * @property {(action: string, shortcut: any, slot?: string) => string} formatShortcut
 */

function requireContext(ctx, name) {
  const value = ctx?.[name];
  if (value === undefined || value === null) throw new TypeError(`Workspace controller requires ${name}.`);
  return value;
}

function requireFunction(ctx, name) {
  const value = requireContext(ctx, name);
  if (typeof value !== "function") throw new TypeError(`Workspace controller requires ${name} to be a function.`);
  return value;
}

/**
 * Workspace owns group/tab DOM orchestration and iframe lifecycle. It receives
 * app-level services explicitly so feature modules do not reach through main.ts
 * globals for workspace behavior.
 *
 * @param {WorkspaceControllerContext} ctx
 */
export function createWorkspaceController(ctx = {}) {
  const state = requireContext(ctx, "state");
  const createGroupId = requireFunction(ctx, "createGroupId");
  const createFrameId = requireFunction(ctx, "createFrameId");
  const createLayoutId = requireFunction(ctx, "createLayoutId");
  const allApps = requireFunction(ctx, "allApps");
  const appById = requireFunction(ctx, "appById");
  const inferAppName = requireFunction(ctx, "inferAppName");
  const appFaviconUrl = requireFunction(ctx, "appFaviconUrl");
  const fallbackFaviconUrl = requireFunction(ctx, "fallbackFaviconUrl");
  const browserFaviconUrl = requireFunction(ctx, "browserFaviconUrl");
  const effectiveFaviconUrl = requireFunction(ctx, "effectiveFaviconUrl");
  const discoverDeclaredFaviconUrl = requireFunction(ctx, "discoverDeclaredFaviconUrl");
  const rememberFaviconUrl = requireFunction(ctx, "rememberFaviconUrl");
  const saveOptions = requireFunction(ctx, "saveOptions");
  const normalizeOptions = requireFunction(ctx, "normalizeOptions");
  const notify = requireFunction(ctx, "toast");
  const render = requireFunction(ctx, "render");
  const svgIcon = requireFunction(ctx, "svgIcon");
  const compactIconButton = requireFunction(ctx, "compactIconButton");
  const menuButton = requireFunction(ctx, "menuButton");
  const formatShortcut = requireFunction(ctx, "formatShortcut");
  let workspaceNode = null;
  let workspaceRenderSignature = "";

  function workspaceSignature() {
    return JSON.stringify({
      colMaxCount: state.options?.colMaxCount,
      groups: (state.groups || []).map((group) => ({
        id: group.id,
        chats: (group.chatApps || []).map((chat) => ({
          appId: chat.appId,
          instanceId: chat.instanceId
        }))
      }))
    });
  }

  function workspaceDomMatchesState() {
    const grid = workspaceNode?.isConnected ? workspaceNode : document.querySelector(".main-grid");
    if (!grid) return false;
    const cards = Array.from(grid.querySelectorAll(":scope > .chat-card"));
    if (cards.length !== (state.groups || []).length) return false;
    return (state.groups || []).every((group) => {
      const card = cards.find((node) => node.dataset.groupId === group.id);
      if (!card) return false;
      const tabs = Array.from(card.querySelectorAll(".tab[data-instance-id]"));
      const frames = Array.from(card.querySelectorAll(".chat-frame[data-instance-id]"));
      const ids = (group.chatApps || []).map((chat) => chat.instanceId);
      return ids.length === tabs.length
        && ids.length === frames.length
        && ids.every((id) => tabs.some((tab) => tab.dataset.instanceId === id))
        && ids.every((id) => frames.some((frame) => frame.dataset.instanceId === id));
    });
  }

  let activeTabDrag = null;
  let activeTabPointerDrag = null;
  let activeGroupPointerDrag = null;
  let suppressTabClickInstanceId = "";
  const openTabs = createWorkspaceOpenTabs();
  const { openableTabUrl, openTabUrl, refreshCurrentExtensionTabInfo } = openTabs;
  const frameRegistry = createWorkspaceFrameRegistry({ appById, openableTabUrl });
  const {
    currentFrames,
    findFrameForSummarySource,
    frameApp,
    setFramePointerBlockedForOverlay
  } = frameRegistry;

  function customAppIds() {
    return new Set((state.customConfig || []).map((app) => app?.id).filter(Boolean));
  }

  function normalizeAppPickerHost(host) {
    return String(host || "")
      .trim()
      .toLowerCase()
      .replace(/^\*\./, "")
      .replace(/^www\./, "");
  }

  function appPickerHostKeys(app) {
    const keys = new Set();
    for (const host of app?.hosts || []) {
      const normalized = normalizeAppPickerHost(host);
      if (normalized) keys.add(normalized);
    }
    try {
      const normalized = normalizeAppPickerHost(new URL(app.url).hostname);
      if (normalized) keys.add(normalized);
    } catch {}
    return keys;
  }

  function hasCustomAppEquivalent(app, customHostKeys) {
    for (const key of appPickerHostKeys(app)) {
      if (customHostKeys.has(key)) return true;
    }
    return false;
  }

  function isForcedInternationalApp(app) {
    for (const key of appPickerHostKeys(app)) {
      if (APP_PICKER_FORCE_INTERNATIONAL_HOSTS.has(key)) return true;
    }
    return false;
  }

  function appPickerProvider(app) {
    const provider = String(app?.provider || "").trim();
    if (!provider || /^custom$/i.test(provider)) return "";
    return provider;
  }

  function appPickerFaviconUrl(app) {
    return appFaviconUrl(app) || fallbackFaviconUrl(app);
  }

  function renderAppPickerFavicon(app) {
    const image = el("img", {
      class: "app-picker-favicon",
      src: appPickerFaviconUrl(app),
      alt: "",
      draggable: "false",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      onerror: (event) => {
        const icon = event.currentTarget;
        if (icon.dataset.browserFallback !== "1") {
          const browserUrl = browserFaviconUrl(app.url);
          icon.dataset.browserFallback = "1";
          if (browserUrl && icon.src !== browserUrl) {
            icon.src = browserUrl;
            return;
          }
        }
        if (icon.dataset.fallback === "1") return;
        icon.dataset.fallback = "1";
        icon.src = fallbackFaviconUrl(app);
      }
    });
    image.title = inferAppName(app);
    return image;
  }

  function appPickerSections() {
    const apps = allApps();
    const appByPickerId = new Map(apps.map((app) => [app.id, app]));
    const customIds = customAppIds();
    const customApps = apps.filter((app) => !APP_PICKER_INTERNATIONAL_ID_SET.has(app.id)
      && !APP_PICKER_CHINESE_ID_SET.has(app.id)
      && !isForcedInternationalApp(app)
      && (customIds.has(app.id) || /^custom$/i.test(app.provider || "")));
    const customSet = new Set(customApps.map((app) => app.id));
    const customHostKeys = new Set(customApps.flatMap((app) => Array.from(appPickerHostKeys(app))));
    const byKnownOrder = (ids) => ids
      .map((id) => appByPickerId.get(id))
      .filter((app) => app && !customSet.has(app.id) && !hasCustomAppEquivalent(app, customHostKeys));
    const internationalApps = byKnownOrder(APP_PICKER_INTERNATIONAL_IDS);
    const chineseApps = byKnownOrder(APP_PICKER_CHINESE_IDS);
    const assigned = new Set([...customSet, ...internationalApps.map((app) => app.id), ...chineseApps.map((app) => app.id)]);
    const extraInternationalApps = apps.filter((app) => !assigned.has(app.id)
      && !APP_PICKER_CHINESE_ID_SET.has(app.id)
      && !isForcedInternationalApp(app)
      && !hasCustomAppEquivalent(app, customHostKeys));
    return [
      { id: "custom", title: t("appPicker.custom"), apps: customApps, custom: true },
      { id: "international", title: t("appPicker.international"), apps: [...internationalApps, ...extraInternationalApps] },
      { id: "chinese", title: t("appPicker.chinese"), apps: chineseApps }
    ];
  }

  function activePreset() {
    const temporary = activeTemporaryLayoutPreset();
    if (temporary) return temporary;
    const presets = persistentLayoutPresets();
    return presets.find((preset) => preset.id === state.options.activeLayoutPresetId) || presets[0];
  }

  function activeTemporaryLayoutPreset() {
    const preset = state.temporaryLayoutPreset;
    return preset?.id && preset.temporary ? preset : null;
  }

  function temporaryLayoutIsActive() {
    return Boolean(activeTemporaryLayoutPreset());
  }

  function persistentLayoutPresets(options = state.options) {
    return (Array.isArray(options?.layoutPresets) ? options.layoutPresets : []).filter((preset) => !preset?.temporary);
  }

  function persistentLayoutOptions(options = state.options) {
    const layoutPresets = persistentLayoutPresets(options);
    const activeLayoutPresetId = layoutPresets.some((preset) => preset.id === options?.activeLayoutPresetId)
      ? options.activeLayoutPresetId
      : layoutPresets[0]?.id || "default";
    return { ...options, layoutPresets, activeLayoutPresetId };
  }

  function validChatAppIds() {
    return new Set(allApps().map((app) => app.id));
  }

  function normalizeLayoutGroups(groups) {
    return normalizeWorkspaceLayoutGroups(groups, validChatAppIds());
  }

  function currentLayoutGroups({ includeTemporary = false } = {}) {
    const groups = includeTemporary
      ? state.groups || []
      : (state.groups || []).filter((group) => !group.temporary);
    return layoutGroupsFromWorkspace(groups, validChatAppIds());
  }

  function preferredLayoutGroupsForLocale() {
    const language = state.options?.language && state.options.language !== "system"
      ? state.options.language
      : navigator.language || "";
    const preferred = /^zh/i.test(language)
      ? [["Kimi"], ["DouBao"], ["Qwen"]]
      : [["ChatGPT"], ["Gemini"], ["Grok"]];
    const normalized = normalizeLayoutGroups(preferred);
    if (normalized.length) return normalized;
    return normalizeLayoutGroups(allApps().slice(0, 3).map((app) => [app.id]));
  }

  function layoutPresetGroups(preset) {
    return normalizeLayoutGroups(preset?.chatAppIdGroups);
  }

  function layoutPresetSummary(preset) {
    const groups = layoutPresetGroups(preset);
    if (!groups.length) return preset?.name || t("layout.empty");
    return groups
      .map((group) => group.map((id) => inferAppName(appById(id))).join(", "))
      .join(" / ");
  }

  function layoutShortcutLabel(index) {
    if (index < 0 || index > 8) return "";
    const label = formatShortcut("switchLayout", state.shortcutConfig?.shortcuts?.switchLayout, String(index + 1));
    return label === "Disabled" || label === "Unassigned" ? "" : label;
  }

  function shortcutLabel(action, digitLabel = "") {
    const label = formatShortcut(action, state.shortcutConfig?.shortcuts?.[action], digitLabel);
    return label === "Disabled" || label === "Unassigned" ? "" : label;
  }

  function shortcutTooltip(label, action, digitLabel = "") {
    const shortcut = shortcutLabel(action, digitLabel);
    return shortcut ? `${label} (${shortcut})` : label;
  }

  async function saveLayoutOptions(nextOptions) {
    state.options = await saveOptions(normalizeOptions(persistentLayoutOptions(nextOptions)));
  }

  async function switchLayoutPreset(presetId) {
    if (activeTemporaryLayoutPreset()?.id === presetId) {
      closePopovers();
      return;
    }
    const preset = persistentLayoutPresets().find((item) => item.id === presetId);
    if (!preset) {
      closePopovers();
      notify(t("toast.layoutNotFound"), "error");
      return;
    }
    if (!temporaryLayoutIsActive() && preset.id === state.options.activeLayoutPresetId) {
      closePopovers();
      return;
    }
    state.temporaryLayoutPreset = null;
    await saveLayoutOptions({ ...state.options, activeLayoutPresetId: preset.id });
    hydrateGroups();
    closePopovers();
    render();
  }

  async function addLayoutPreset() {
    const chatAppIdGroups = preferredLayoutGroupsForLocale();
    if (!chatAppIdGroups.length) {
      closePopovers();
      notify(t("layout.noApps"), "error");
      return;
    }
    const layoutPresets = persistentLayoutPresets();
    const preset = {
      id: createLayoutId(),
      name: `Layout ${layoutPresets.length + 1}`,
      chatAppIdGroups
    };
    state.temporaryLayoutPreset = null;
    await saveLayoutOptions({
      ...state.options,
      layoutPresets: [...layoutPresets, preset],
      activeLayoutPresetId: preset.id
    });
    hydrateGroups();
    closePopovers();
    render();
  }

  async function deleteLayoutPreset(presetId) {
    if (activeTemporaryLayoutPreset()?.id === presetId) {
      state.temporaryLayoutPreset = null;
      hydrateGroups();
      closePopovers();
      render();
      return;
    }
    const layoutPresets = persistentLayoutPresets();
    if (layoutPresets.length <= 1) return;
    const remaining = layoutPresets.filter((preset) => preset.id !== presetId);
    const wasActive = state.options.activeLayoutPresetId === presetId;
    const activeLayoutPresetId = wasActive ? remaining[0]?.id : state.options.activeLayoutPresetId;
    await saveLayoutOptions({ ...state.options, layoutPresets: remaining, activeLayoutPresetId });
    closePopovers();
    if (wasActive && !temporaryLayoutIsActive()) {
      hydrateGroups();
      render();
    }
  }

  function hydrateGroups() {
    const preset = activePreset();
    const apps = allApps();
    const workspace = hydrateWorkspaceGroups({
      presetGroups: preset?.chatAppIdGroups,
      apps,
      createGroupId,
      createFrameId,
      fallbackGroups: [["ChatGPT"], ["Gemini"], ["Grok"]]
    });
    if (temporaryLayoutIsActive()) {
      for (const group of workspace.groups) {
        group.temporary = true;
        group.pocketBatchId = preset.pocketBatchId || "";
      }
    }
    state.groups = workspace.groups;
    state.activeTabs = workspace.activeTabs;
  }

  async function persistLayout() {
    const temporary = activeTemporaryLayoutPreset();
    if (temporary) {
      state.temporaryLayoutPreset = {
        ...temporary,
        chatAppIdGroups: currentLayoutGroups({ includeTemporary: true })
      };
      return;
    }
    const preset = activePreset();
    if (!preset) return;
    const chatAppIdGroups = currentLayoutGroups();
    const next = {
      ...state.options,
      layoutPresets: persistentLayoutPresets().map((item) => item.id === preset.id
        ? { ...item, chatAppIdGroups }
        : item)
    };
    state.options = await saveOptions(next);
  }

  async function addGroup(appId = allApps()[0]?.id) {
    if (!appId) return;
    const temporary = activeTemporaryLayoutPreset();
    const group = {
      id: createGroupId(),
      ...(temporary ? { temporary: true, pocketBatchId: temporary.pocketBatchId || "" } : {}),
      chatApps: [{ appId, instanceId: createFrameId() }]
    };
    state.groups.push(group);
    state.activeTabs[group.id] = group.chatApps[0].instanceId;
    await persistLayout();
    appendChatGroup(group);
  }

  function workspaceVisibleColumnCount() {
    return workspaceGridColumnCount(state.groups.length, state.options.colMaxCount);
  }

  function workspaceColumnTemplate() {
    const count = state.groups.length || 1;
    const visibleCount = Math.max(1, workspaceVisibleColumnCount());
    const basis = `max(280px, calc(100% / ${visibleCount}))`;
    return `repeat(${count}, minmax(${basis}, ${basis}))`;
  }

  function syncGridColumns() {
    const grid = document.querySelector(".main-grid");
    if (!grid) return;
    if (grid.classList.contains("fullscreen-grid")) {
      grid.style.gridTemplateColumns = "minmax(0, 1fr)";
      return;
    }
    grid.style.gridTemplateColumns = workspaceColumnTemplate();
  }

  function renderWorkspace() {
    const cols = workspaceGridColumnCount(state.groups.length, state.options.colMaxCount);
    return el("main", {
      class: `main-grid grid-cols-${cols}`,
      style: { gridTemplateColumns: workspaceColumnTemplate() }
    },
      state.groups.map((group, index) => renderChatGroup(group, index))
    );
  }

  function syncWorkspaceIsland(shell) {
    if (!shell?.isConnected) return renderWorkspace();
    const signature = workspaceSignature();
    if (workspaceNode?.isConnected && workspaceRenderSignature === signature) {
      syncWorkspaceDom();
      syncFullscreenLayout();
      return workspaceNode;
    }
    if (workspaceDomMatchesState()) {
      workspaceNode = workspaceNode?.isConnected ? workspaceNode : document.querySelector(".main-grid");
      workspaceRenderSignature = signature;
      syncGridColumnClass();
      syncFullscreenLayout();
      return workspaceNode;
    }
    const nextWorkspace = renderWorkspace();
    if (workspaceNode?.isConnected) workspaceNode.replaceWith(nextWorkspace);
    else shell.append(nextWorkspace);
    workspaceNode = nextWorkspace;
    workspaceRenderSignature = signature;
    syncWorkspaceDom();
    syncFullscreenLayout();
    return workspaceNode;
  }

  function syncGridColumnClass() {
    const grid = document.querySelector(".main-grid");
    if (!grid) return;
    grid.classList.remove("grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4");
    grid.classList.add(`grid-cols-${workspaceVisibleColumnCount()}`);
    syncGridColumns();
    syncWorkspaceDom();
  }

  function tabGroupButtonPlacement() {
    return normalizeTabGroupButtonPlacement(
      state.options?.tabGroupButtonPlacement,
      state.options?.tabGroupButtonsMode
    );
  }

  function orderedTabGroupButtons() {
    const itemById = new Map(TAB_GROUP_HEADER_BUTTONS.map((item) => [item.id, item]));
    return normalizeTabGroupButtonOrder(state.options?.tabGroupButtonOrder)
      .map((id) => itemById.get(id))
      .filter(Boolean);
  }

  function tabGroupButtonIsPinned(id) {
    return tabGroupButtonPlacement()[id] !== "menu";
  }

  function tabGroupButtonIsFolded(id) {
    return !tabGroupButtonIsPinned(id);
  }

  function syncTabGroupHeaderControls(card, group) {
    card.classList.add("tab-group-buttons-custom");
    card.classList.remove("tab-group-buttons-hidden", "tab-group-buttons-pinned");
    for (const item of TAB_GROUP_HEADER_BUTTONS) {
      card.dataset[`button${item.id.charAt(0).toUpperCase()}${item.id.slice(1)}`] = tabGroupButtonPlacement()[item.id] || "pinned";
    }
    const tabs = card.querySelector(".chat-tabs");
    const addButton = tabs?.querySelector(".tab-add");
    if (tabs && tabGroupButtonIsPinned("addApp") && !addButton) {
      tabs.append(renderTabAddButton(group));
    } else if (addButton && tabGroupButtonIsFolded("addApp")) {
      addButton.remove();
    }
    const actions = card.querySelector(".chat-actions");
    if (actions) actions.replaceChildren(...renderChatActionButtons(group));
  }

  function syncWorkspaceDom() {
    state.groups.forEach((group, index) => {
      const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
      if (card) {
        card.style.order = String(index + 1);
        syncTabGroupHeaderControls(card, group);
      }
    });
  }

  function appendChatGroup(group) {
    const grid = document.querySelector(".main-grid");
    if (!grid) {
      render();
      return;
    }
    grid.append(renderChatGroup(group, state.groups.findIndex((item) => item.id === group.id)));
    syncGridColumnClass();
    syncFullscreenLayout();
  }

  function currentFullscreenGroup() {
    if (!state.fullscreenGroupId) return null;
    const group = state.groups.find((item) => item.id === state.fullscreenGroupId);
    if (!group) state.fullscreenGroupId = null;
    return group || null;
  }

  function fullscreenShortcutLabel() {
    return shortcutLabel("enterFullscreen");
  }

  function iframeForWindow(sourceWindow) {
    if (!sourceWindow) return null;
    for (const iframe of document.querySelectorAll(".chat-frame")) {
      if (iframe.contentWindow === sourceWindow) return iframe;
    }
    return null;
  }

  function groupIdForFrameWindow(sourceWindow) {
    const iframe = iframeForWindow(sourceWindow);
    if (iframe) return iframe.closest(".chat-card")?.dataset.groupId || "";
    return "";
  }

  function activeShortcutGroupId(sourceWindow) {
    const sourceGroupId = groupIdForFrameWindow(sourceWindow);
    if (sourceGroupId) return sourceGroupId;
    if (state.fullscreenGroupId) return state.fullscreenGroupId;
    const focusedFrame = document.activeElement?.classList?.contains("chat-frame") ? document.activeElement : null;
    const focusedGroupId = focusedFrame?.closest(".chat-card")?.dataset.groupId;
    return focusedGroupId || state.groups[0]?.id || "";
  }

  function currentGroupIndex(group) {
    return state.groups.findIndex((item) => item.id === group.id);
  }

  function activeChatForGroup(group) {
    const active = state.activeTabs[group.id] || group.chatApps[0]?.instanceId;
    return group.chatApps.find((chat) => chat.instanceId === active) || group.chatApps[0];
  }

  function activateChatTab(group, instanceId) {
    if (!group?.chatApps.some((chat) => chat.instanceId === instanceId)) return;
    state.activeTabs[group.id] = instanceId;
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    card?.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.instanceId === instanceId);
    });
    card?.querySelectorAll(".chat-frame").forEach((frame) => {
      frame.classList.toggle("active", frame.dataset.instanceId === instanceId);
    });
  }

  function syncGroupTabOrder(group) {
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const tabs = card?.querySelector(".chat-tabs");
    if (!tabs) return;
    const addButton = tabs.querySelector(".tab-add");
    for (const chat of group.chatApps) {
      const tab = tabs.querySelector(`.tab[data-instance-id="${chat.instanceId}"]`);
      if (tab) tabs.insertBefore(tab, addButton || null);
    }
  }

  function toggleFullscreen(groupId = activeShortcutGroupId()) {
    if (!groupId || !state.groups.some((group) => group.id === groupId)) return;
    state.fullscreenGroupId = state.fullscreenGroupId === groupId ? null : groupId;
    closePopovers();
    syncFullscreenLayout();
  }

  function syncFullscreenLayout() {
    const fullscreenGroup = currentFullscreenGroup();
    const shell = document.querySelector(".app-shell");
    const grid = document.querySelector(".main-grid");
    shell?.classList.toggle("fullscreen-mode", Boolean(fullscreenGroup));
    grid?.classList.toggle("fullscreen-grid", Boolean(fullscreenGroup));
    syncGridColumns();
    document.querySelectorAll(".chat-card").forEach((card) => {
      const isActive = Boolean(fullscreenGroup && card.dataset.groupId === fullscreenGroup.id);
      card.classList.toggle("fullscreen", isActive);
      card.classList.toggle("fullscreen-hidden", Boolean(fullscreenGroup && !isActive));
      const buttonNode = card.querySelector(".fullscreen-action");
      if (!buttonNode) return;
      const cardGroup = state.groups.find((item) => item.id === card.dataset.groupId);
      if (!cardGroup) return;
      const { fullscreenLabel: label, fullscreenTooltipLabel } = fullscreenButtonMeta(cardGroup);
      buttonNode.setAttribute("aria-label", label);
      buttonNode.setAttribute("data-tooltip", fullscreenTooltipLabel);
      buttonNode.setAttribute("data-tooltip-id", "workspace.group.fullscreen");
      buttonNode.replaceChildren(svgIcon(isActive ? "minimize" : "maximize"));
    });
  }

  async function syncFrameFavicon(sourceWindow) {
    const iframe = iframeForWindow(sourceWindow);
    if (!iframe) return;
    const instanceId = iframe.dataset.instanceId || "";
    if (!instanceId) return;
    const app = frameApp(iframe);
    let href = app.url;
    let logoUrl = "";
    try {
      const meta = await sendToIframe(iframe, "getPageMeta", {}, 1800);
      href = meta?.href || href;
      logoUrl = effectiveFaviconUrl(href, meta?.logoUrl) || meta?.logoUrl || "";
    } catch {
      logoUrl = effectiveFaviconUrl(href);
    }
    const discoveredLogoUrl = await discoverDeclaredFaviconUrl(href);
    if (discoveredLogoUrl) logoUrl = discoveredLogoUrl;
    const currentHref = openableTabUrl(href);
    if (currentHref) iframe.dataset.currentHref = currentHref;
    if (logoUrl) {
      rememberFaviconUrl(href, logoUrl);
      if (app.url && app.url !== href) rememberFaviconUrl(app.url, logoUrl);
    }
    const image = document.querySelector(`.tab[data-instance-id="${instanceId}"] .tab-favicon`);
    if (!image || !logoUrl) return;
    image.dataset.browserFallback = "0";
    image.dataset.fallback = "0";
    image.hidden = false;
    image.src = logoUrl;
  }

  function suspendIframePointerEventsForDrag() {
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (!Object.prototype.hasOwnProperty.call(iframe.dataset, "dragPointerEvents")) {
        iframe.dataset.dragPointerEvents = iframe.style.pointerEvents || "";
      }
      iframe.style.pointerEvents = "none";
    });
  }

  function restoreIframePointerEventsForDrag() {
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (!Object.prototype.hasOwnProperty.call(iframe.dataset, "dragPointerEvents")) return;
      iframe.style.pointerEvents = iframe.dataset.dragPointerEvents || "";
      delete iframe.dataset.dragPointerEvents;
    });
  }

  function cleanupGroupDragState() {
    removeTabPointerDragListeners();
    removeGroupPointerDragListeners();
    restoreIframePointerEventsForDrag();
    document.body.classList.remove("tab-dragging");
    document.body.classList.remove("tab-gesture-active");
    document.querySelectorAll(".chat-card.drag-over").forEach((node) => node.classList.remove("drag-over"));
    document.querySelectorAll(".chat-card.group-dragging, .chat-card.group-drop-before, .chat-card.group-drop-after").forEach((node) => {
      node.classList.remove("group-dragging", "group-drop-before", "group-drop-after");
    });
    document.querySelectorAll(".chat-tabs.tab-drop-target").forEach((node) => node.classList.remove("tab-drop-target"));
    document.querySelectorAll(".tab.dragging, .tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("dragging", "drop-before", "drop-after");
    });
    activeTabDrag = null;
    activeTabPointerDrag = null;
    activeGroupPointerDrag = null;
  }

  function draggedGroupId(event) {
    return event.dataTransfer?.getData(DRAG_GROUP_MIME) || "";
  }

  function draggedTabId(event) {
    return event.dataTransfer?.getData(DRAG_TAB_MIME) || activeTabDrag?.instanceId || "";
  }

  function draggedTabGroupId(event) {
    return event.dataTransfer?.getData(DRAG_TAB_GROUP_MIME) || activeTabDrag?.groupId || "";
  }

  function startTabDrag(event, group, chat) {
    activeTabDrag = { groupId: group.id, instanceId: chat.instanceId };
    globalThis.getSelection?.()?.removeAllRanges?.();
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    event.currentTarget.classList.add("dragging");
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_TAB_MIME, chat.instanceId);
    event.dataTransfer.setData(DRAG_TAB_GROUP_MIME, group.id);
    event.dataTransfer.setData("text/plain", chat.instanceId);
  }

  function tabDropIndexFromPoint(event, group) {
    return tabDropIndexFromClientX(event.clientX, group);
  }

  function tabDropIndexFromClientX(clientX, group) {
    const tabs = Array.from(document.querySelectorAll(`.chat-card[data-group-id="${group.id}"] .tab`));
    if (!tabs.length) return 0;
    for (const [index, tab] of tabs.entries()) {
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return index;
    }
    return tabs.length;
  }

  function tabDropTargetFromClientX(clientX, group) {
    const tabs = Array.from(document.querySelectorAll(`.chat-card[data-group-id="${group.id}"] .tab`));
    if (!tabs.length) return { tab: null, insertIndex: 0, after: false };
    for (const [index, tab] of tabs.entries()) {
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { tab, insertIndex: index, after: false };
      if (clientX < rect.right) return { tab, insertIndex: index + 1, after: true };
    }
    return { tab: tabs[tabs.length - 1], insertIndex: tabs.length, after: true };
  }

  function previewTabDrop(event, group, targetTab = null) {
    const tabId = draggedTabId(event);
    if (!tabId || draggedTabGroupId(event) !== group.id) return false;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("drop-before", "drop-after");
    });
    const tabs = event.currentTarget.closest?.(".chat-tabs") || event.currentTarget;
    tabs?.classList?.add("tab-drop-target");
    if (targetTab) {
      const rect = targetTab.getBoundingClientRect();
      targetTab.classList.add(event.clientX > rect.left + rect.width / 2 ? "drop-after" : "drop-before");
    }
    return true;
  }

  async function moveTabByDrop(event, group, targetChat = null) {
    const tabId = draggedTabId(event);
    if (!tabId || draggedTabGroupId(event) !== group.id) return false;
    let insertIndex = targetChat
      ? group.chatApps.findIndex((item) => item.instanceId === targetChat.instanceId)
      : tabDropIndexFromPoint(event, group);
    if (insertIndex < 0) return false;
    if (targetChat) {
      const targetTab = event.currentTarget.closest?.(".tab") || event.currentTarget;
      const rect = targetTab.getBoundingClientRect();
      if (event.clientX > rect.left + rect.width / 2) insertIndex += 1;
    }
    return moveTabToIndex(group, tabId, insertIndex);
  }

  async function moveTabToIndex(group, tabId, insertIndex) {
    const result = moveTabWithinGroup(group, tabId, insertIndex);
    if (!result.moved) return false;
    if (result.noop) {
      cleanupGroupDragState();
      return true;
    }
    state.activeTabs[group.id] = result.moved.instanceId;
    cleanupGroupDragState();
    await persistLayout();
    syncGroupTabOrder(group);
    activateChatTab(group, result.moved.instanceId);
    return true;
  }

  function removeTabPointerDragListeners() {
    document.removeEventListener("pointermove", handleTabPointerMove, true);
    document.removeEventListener("pointerup", handleTabPointerUp, true);
    document.removeEventListener("pointercancel", cancelTabPointerDrag, true);
    removeTabNativeSelectionGuards();
  }

  function addTabNativeSelectionGuards() {
    document.addEventListener("selectstart", preventTabNativeSelection, true);
    document.addEventListener("dragstart", preventTabNativeSelection, true);
  }

  function removeTabNativeSelectionGuards() {
    document.removeEventListener("selectstart", preventTabNativeSelection, true);
    document.removeEventListener("dragstart", preventTabNativeSelection, true);
  }

  function preventTabNativeSelection(event) {
    if (!document.body.classList.contains("tab-gesture-active") && !document.body.classList.contains("tab-dragging")) return;
    event.preventDefault();
  }

  function startTabPointerDrag(event, group, chat) {
    if (event.button !== 0 || event.target?.closest?.(".tab-close")) return;
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    removeTabPointerDragListeners();
    addTabNativeSelectionGuards();
    document.body.classList.add("tab-gesture-active");
    if (group.chatApps.length <= 1) {
      if (state.groups.length > 1) startGroupPointerDrag(event, group, event.currentTarget);
      else {
        removeTabNativeSelectionGuards();
        document.body.classList.remove("tab-gesture-active");
      }
      return;
    }
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    activeTabPointerDrag = {
      group,
      instanceId: chat.instanceId,
      startX: event.clientX,
      startY: event.clientY,
      insertIndex: group.chatApps.findIndex((item) => item.instanceId === chat.instanceId),
      tab: event.currentTarget,
      started: false
    };
    document.addEventListener("pointermove", handleTabPointerMove, true);
    document.addEventListener("pointerup", handleTabPointerUp, true);
    document.addEventListener("pointercancel", cancelTabPointerDrag, true);
  }

  function beginTabPointerDrag(drag) {
    if (drag.started) return;
    drag.started = true;
    activeTabDrag = { groupId: drag.group.id, instanceId: drag.instanceId };
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    drag.tab.classList.add("dragging");
  }

  function updateTabPointerDropPreview(drag, clientX) {
    document.querySelectorAll(".tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("drop-before", "drop-after");
    });
    const tabs = document.querySelector(`.chat-card[data-group-id="${drag.group.id}"] .chat-tabs`);
    tabs?.classList?.add("tab-drop-target");
    const target = tabDropTargetFromClientX(clientX, drag.group);
    drag.insertIndex = target.insertIndex;
    if (target.tab && target.tab !== drag.tab) {
      target.tab.classList.add(target.after ? "drop-after" : "drop-before");
    }
  }

  function handleTabPointerMove(event) {
    const drag = activeTabPointerDrag;
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < TAB_DRAG_START_DISTANCE) return;
    event.preventDefault();
    beginTabPointerDrag(drag);
    updateTabPointerDropPreview(drag, event.clientX);
  }

  function handleTabPointerUp(event) {
    const drag = activeTabPointerDrag;
    removeTabPointerDragListeners();
    if (!drag) return;
    if (!drag.started) {
      activeTabPointerDrag = null;
      document.body.classList.remove("tab-gesture-active");
      return;
    }
    event.preventDefault();
    suppressTabClickInstanceId = drag.instanceId;
    setTimeout(() => {
      if (suppressTabClickInstanceId === drag.instanceId) suppressTabClickInstanceId = "";
    }, 0);
    moveTabToIndex(drag.group, drag.instanceId, drag.insertIndex ?? tabDropIndexFromClientX(event.clientX, drag.group))
      .catch((error) => {
        cleanupGroupDragState();
        console.warn("[ChatClub] Failed to reorder tab", error);
      });
  }

  function cancelTabPointerDrag() {
    removeTabPointerDragListeners();
    cleanupGroupDragState();
  }

  function removeGroupPointerDragListeners() {
    document.removeEventListener("pointermove", handleGroupPointerMove, true);
    document.removeEventListener("pointerup", handleGroupPointerUp, true);
    document.removeEventListener("pointercancel", cancelGroupPointerDrag, true);
    removeTabNativeSelectionGuards();
  }

  function startGroupPointerDrag(event, group, tab) {
    const index = currentGroupIndex(group);
    if (index < 0) {
      removeTabNativeSelectionGuards();
      document.body.classList.remove("tab-gesture-active");
      return;
    }
    tab?.setPointerCapture?.(event.pointerId);
    activeGroupPointerDrag = {
      group,
      startX: event.clientX,
      startY: event.clientY,
      insertIndex: index,
      tab,
      started: false
    };
    removeGroupPointerDragListeners();
    addTabNativeSelectionGuards();
    document.addEventListener("pointermove", handleGroupPointerMove, true);
    document.addEventListener("pointerup", handleGroupPointerUp, true);
    document.addEventListener("pointercancel", cancelGroupPointerDrag, true);
  }

  function beginGroupPointerDrag(drag) {
    if (drag.started) return;
    drag.started = true;
    activeTabDrag = null;
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    drag.tab?.classList?.add("dragging");
    document.querySelector(`.chat-card[data-group-id="${drag.group.id}"]`)?.classList.add("group-dragging");
  }

  function groupDropTargetFromClientX(clientX) {
    const cards = state.groups
      .map((group) => document.querySelector(`.chat-card[data-group-id="${group.id}"]`))
      .filter(Boolean);
    if (!cards.length) return { card: null, insertIndex: 0, after: false };
    for (const [index, card] of cards.entries()) {
      const rect = card.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { card, insertIndex: index, after: false };
      if (clientX < rect.right) return { card, insertIndex: index + 1, after: true };
    }
    return { card: cards[cards.length - 1], insertIndex: cards.length, after: true };
  }

  function updateGroupPointerDropPreview(drag, clientX) {
    document.querySelectorAll(".chat-card.group-drop-before, .chat-card.group-drop-after").forEach((node) => {
      node.classList.remove("group-drop-before", "group-drop-after");
    });
    const target = groupDropTargetFromClientX(clientX);
    drag.insertIndex = target.insertIndex;
    if (target.card && target.card.dataset.groupId !== drag.group.id) {
      target.card.classList.add(target.after ? "group-drop-after" : "group-drop-before");
    }
  }

  function handleGroupPointerMove(event) {
    const drag = activeGroupPointerDrag;
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < GROUP_DRAG_START_DISTANCE) return;
    event.preventDefault();
    beginGroupPointerDrag(drag);
    updateGroupPointerDropPreview(drag, event.clientX);
  }

  function handleGroupPointerUp(event) {
    const drag = activeGroupPointerDrag;
    removeGroupPointerDragListeners();
    if (!drag) return;
    if (!drag.started) {
      activeGroupPointerDrag = null;
      document.body.classList.remove("tab-gesture-active");
      return;
    }
    event.preventDefault();
    suppressTabClickInstanceId = drag.group.chatApps[0]?.instanceId || "";
    setTimeout(() => {
      if (suppressTabClickInstanceId === drag.group.chatApps[0]?.instanceId) suppressTabClickInstanceId = "";
    }, 0);
    moveGroupToIndex(drag.group, drag.insertIndex ?? groupDropTargetFromClientX(event.clientX).insertIndex)
      .catch((error) => {
        cleanupGroupDragState();
        console.warn("[ChatClub] Failed to reorder group", error);
      });
  }

  function cancelGroupPointerDrag() {
    removeGroupPointerDragListeners();
    cleanupGroupDragState();
  }

  async function moveGroupToIndex(group, insertIndex) {
    const result = moveGroupWithinWorkspace(state.groups, group.id, insertIndex);
    if (!result.moved) return false;
    if (result.noop) {
      cleanupGroupDragState();
      return true;
    }
    cleanupGroupDragState();
    await persistLayout();
    syncWorkspaceDom();
    return true;
  }

  async function moveGroupByDrop(event, targetIndex) {
    const fromGroupId = draggedGroupId(event);
    const targetCard = event.currentTarget.closest?.(".chat-card") || event.currentTarget;
    const rect = targetCard.getBoundingClientRect();
    const insertAfterTarget = event.clientX > rect.left + rect.width / 2;
    const result = moveDroppedGroupWithinWorkspace(state.groups, fromGroupId, targetIndex, insertAfterTarget);
    if (!result.changed) return false;
    cleanupGroupDragState();
    await persistLayout();
    syncWorkspaceDom();
    return true;
  }

  async function closeTab(group, chat) {
    if (!group || !chat) return;
    const result = removeChatFromGroup(state.groups, state.activeTabs, group, chat);
    if (result.removeGroup) {
      await removeChatGroup(group);
      return;
    }
    if (!result.removed) return;
    if (group.chatApps.length >= 1) {
      const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
      card?.querySelector(`.tab[data-instance-id="${chat.instanceId}"]`)?.remove();
      card?.querySelector(`.chat-frame[data-instance-id="${chat.instanceId}"]`)?.remove();
      if (result.nextActiveId) activateChatTab(group, result.nextActiveId);
    }
    await persistLayout();
    syncGroupTabOrder(group);
  }

  async function removeChatGroup(group) {
    if (!group || state.groups.length <= 1) return false;
    const result = removeGroupFromWorkspace(state.groups, state.activeTabs, group.id);
    if (!result.changed) return false;
    state.groups = result.groups;
    if (state.fullscreenGroupId === group.id) state.fullscreenGroupId = null;
    await persistLayout();
    document.querySelector(`.chat-card[data-group-id="${group.id}"]`)?.remove();
    syncGridColumnClass();
    syncFullscreenLayout();
    return true;
  }

  function renderChatTab(group, chat) {
    const app = appById(chat.appId);
    const name = inferAppName(app);
    const active = state.activeTabs[group.id] || group.chatApps[0]?.instanceId;
    return el("div", {
      class: `tab ${chat.instanceId === active ? "active" : ""}`,
      role: "button",
      tabindex: "0",
      draggable: "false",
      title: name,
      dataset: { instanceId: chat.instanceId },
      onselectstart: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onmousedown: (event) => {
        if (event.target?.closest?.(".tab-close")) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onpointerdown: (event) => startTabPointerDrag(event, group, chat),
      onclick: (event) => {
        if (suppressTabClickInstanceId === chat.instanceId) {
          event.preventDefault();
          suppressTabClickInstanceId = "";
          return;
        }
        activateChatTab(group, chat.instanceId);
      },
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateChatTab(group, chat.instanceId);
        }
      }
    },
      el("img", {
        class: "tab-favicon",
        src: appFaviconUrl(app) || fallbackFaviconUrl(app),
        alt: "",
        draggable: "false",
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
        onerror: (event) => {
          const image = event.currentTarget;
          if (image.dataset.browserFallback !== "1") {
            const browserUrl = browserFaviconUrl(app.url);
            image.dataset.browserFallback = "1";
            if (browserUrl && image.src !== browserUrl) {
              image.src = browserUrl;
              return;
            }
          }
          if (image.dataset.fallback === "1") return;
          image.dataset.fallback = "1";
          image.src = fallbackFaviconUrl(app);
        }
      }),
      el("span", { class: "tab-label" }, name),
      el("button", {
        class: "tab-close compact-icon tooltip-trigger",
        type: "button",
        "aria-label": `${t("common.close")} ${name}`,
        "data-tooltip": shortcutTooltip(`${t("common.close")} ${name}`, "closeChat"),
        "data-tooltip-placement": "left",
        "data-tooltip-id": "workspace.tab.close",
        draggable: "false",
        onclick: async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await closeTab(group, chat);
        },
        onpointerdown: (event) => event.stopPropagation(),
        onkeydown: (event) => event.stopPropagation()
      }, svgIcon("x"))
    );
  }

  function renderChatFrame(group, chat) {
    const app = appById(chat.appId);
    const attrs = {
      class: `chat-frame ${chat.instanceId === (state.activeTabs[group.id] || group.chatApps[0]?.instanceId) ? "active" : ""}`,
      src: app.url,
      dataset: { instanceId: chat.instanceId, appId: app.id },
      allow: "clipboard-write; clipboard-read; microphone; camera; geolocation; autoplay; fullscreen; picture-in-picture; storage-access; web-share; forms",
      referrerpolicy: "no-referrer-when-downgrade"
    };
    if (!app.noSandbox) attrs.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-modals";
    return el("iframe", attrs);
  }

  function fullscreenButtonMeta(group) {
    const isFullscreen = state.fullscreenGroupId === group.id;
    const shortcut = fullscreenShortcutLabel();
    const fullscreenLabel = isFullscreen ? t("chat.exitFullscreen") : t("chat.fullscreen");
    const fullscreenTooltipLabel = !isFullscreen && shortcut ? `${fullscreenLabel} (${shortcut})` : fullscreenLabel;
    return { isFullscreen, fullscreenLabel, fullscreenTooltipLabel, icon: isFullscreen ? "minimize" : "maximize" };
  }

  function renderTabAddButton(group) {
    return compactIconButton(t("chat.addApp"), "plus", (event) => openAppPicker(event.currentTarget, { group }), "tab-add", t("chat.addApp"), "", "workspace.group.addApp");
  }

  function renderOpenInNewTabButton(group) {
    return compactIconButton(t("common.openInNewTab"), "external", () => openChatInNewTab(group), "", t("common.openInNewTab"), "left", "workspace.group.openInNewTab");
  }

  function renderCopyLinkButton(group) {
    return compactIconButton(t("common.copyLink"), "copy", () => copyActiveChatLink(group), "", t("common.copyLink"), "left", "workspace.group.copyLink");
  }

  function renderRemoveGroupButton(group) {
    const button = compactIconButton(t("chat.removeGroup"), "x", async () => {
      await removeChatGroup(group);
      closePopovers();
    }, "danger-action", shortcutTooltip(t("chat.removeGroup"), "closeChat"), "left", "workspace.group.remove");
    button.disabled = state.groups.length <= 1;
    return button;
  }

  function renderChatActionButtons(group) {
    const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
    const buttonById = {
      openInNewTab: () => renderOpenInNewTabButton(group),
      copyLink: () => renderCopyLinkButton(group),
      reload: () => compactIconButton(t("chat.reload"), "reload", () => reloadChat(activeChatForGroup(group)), "", shortcutTooltip(t("chat.reload"), "reloadChat"), "left", "workspace.group.reload"),
      fullscreen: () => compactIconButton(fullscreenLabel, fullscreenIcon, () => toggleFullscreen(group.id), "fullscreen-action", fullscreenTooltipLabel, "left", "workspace.group.fullscreen"),
      removeGroup: () => renderRemoveGroupButton(group)
    };
    return [
      ...orderedTabGroupButtons()
        .filter((item) => item.id !== "addApp" && tabGroupButtonIsPinned(item.id))
        .map((item) => buttonById[item.id]?.())
        .filter(Boolean),
      compactIconButton(t("chat.more"), "more", (event) => openChatMenu(event.currentTarget, group), "", t("chat.more"), "left", "workspace.group.more")
    ];
  }

  function renderChatGroup(group, index) {
    const isFullscreen = state.fullscreenGroupId === group.id;
    return el("section", {
      class: `chat-card tab-group-buttons-custom ${isFullscreen ? "fullscreen" : ""}`.trim(),
      dataset: { groupId: group.id },
      style: { order: String(index + 1) },
      ondragover: (event) => {
        if (!draggedGroupId(event) || draggedGroupId(event) === group.id) return;
        event.preventDefault();
        event.currentTarget.classList.add("drag-over");
      },
      ondragleave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove("drag-over");
      },
      ondrop: async (event) => {
        if (!draggedGroupId(event) || draggedGroupId(event) === group.id) return;
        event.preventDefault();
        await moveGroupByDrop(event, currentGroupIndex(group));
      }
    },
      el("div", { class: "chat-header" },
        el("div", {
          class: "chat-tabs",
          ondragover: (event) => previewTabDrop(event, group),
          ondragleave: (event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) cleanupGroupDragState();
          },
          ondrop: async (event) => {
            if (!draggedTabId(event)) return;
            event.preventDefault();
            event.stopPropagation();
            await moveTabByDrop(event, group);
          }
        },
          group.chatApps.map((chat) => renderChatTab(group, chat)),
          tabGroupButtonIsPinned("addApp") ? renderTabAddButton(group) : null
        ),
        el("div", { class: "chat-actions" }, renderChatActionButtons(group))
      ),
      el("div", { class: "chat-frame-wrap" },
        group.chatApps.map((chat) => renderChatFrame(group, chat))
      )
    );
  }

  function activeIframe(chat) {
    if (!chat?.instanceId) return null;
    return document.querySelector(`iframe[data-instance-id="${chat.instanceId}"]`);
  }

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
    record.iframe.src = href;
    return true;
  }

  function reloadChat(chat) {
    const iframe = activeIframe(chat);
    if (iframe) iframe.src = appById(chat.appId).url;
  }

  async function activeHref(chat) {
    const iframe = activeIframe(chat);
    let href = appById(chat?.appId).url;
    try { href = await sendToIframe(iframe, "getLocationHref", {}, 1200) || href; } catch {}
    const currentHref = openableTabUrl(href);
    if (iframe && currentHref) iframe.dataset.currentHref = currentHref;
    return href;
  }

  function cachedChatHref(chat) {
    const iframe = activeIframe(chat);
    return openableTabUrl(iframe?.dataset.currentHref) || openableTabUrl(appById(chat?.appId).url);
  }

  function cachedGroupHref(group) {
    const chat = activeChatForGroup(group);
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const iframe = card?.querySelector(".chat-frame.active") || activeIframe(chat);
    return openableTabUrl(iframe?.dataset.currentHref)
      || openableTabUrl(iframe?.src || iframe?.getAttribute?.("src"))
      || cachedChatHref(chat);
  }

  function openChatInNewTab(group) {
    const chat = activeChatForGroup(group);
    if (!chat) return;
    const href = cachedGroupHref(group);
    if (!href) {
      closePopovers();
      notify(t("chat.unableToOpenTab"), "error");
      return;
    }
    const opened = openTabUrl(href);
    closePopovers();
    if (!opened) notify(t("chat.unableToOpenTab"), "error");
    activeHref(chat).catch(() => {});
  }

  async function copyActiveChatLink(group) {
    const chat = activeChatForGroup(group);
    if (!chat) return;
    await navigator.clipboard.writeText(await activeHref(chat));
    notify(t("chat.linkCopied"), "success");
    closePopovers();
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
    const loads = [];
    const activeTabs = {};
    const groups = restoreGroups.map((restoreGroup) => {
      const group = { id: createGroupId(), temporary: true, pocketBatchId: batchId, chatApps: [] };
      for (const source of restoreGroup.sources) {
        const instanceId = createFrameId();
        group.chatApps.push({ appId: source.app.id, instanceId });
        loads.push({ instanceId, href: source.href });
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
    render();
    for (const item of loads) {
      const iframe = document.querySelector(`iframe[data-instance-id="${item.instanceId}"]`);
      if (!iframe) continue;
      iframe.dataset.currentHref = item.href;
      iframe.src = item.href;
    }
    return true;
  }

  async function restorePocketBatch(entries = []) {
    const restoreGroups = pocketRestoreGroups(entries);
    if (!restoreGroups.length) return false;
    const batchId = String(entries[0]?.batchId || "");
    return activatePocketTemporaryLayout(restoreGroups, batchId);
  }

  async function addAppToExistingGroup(group, appId) {
    const instanceId = createFrameId();
    const chat = { appId, instanceId };
    group.chatApps.push(chat);
    state.activeTabs[group.id] = instanceId;
    await persistLayout();
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    const tabs = card?.querySelector(".chat-tabs");
    const frameWrap = card?.querySelector(".chat-frame-wrap");
    if (!tabs || !frameWrap) {
      render();
      return;
    }
    tabs.insertBefore(renderChatTab(group, chat), tabs.querySelector(".tab-add"));
    frameWrap.append(renderChatFrame(group, chat));
    activateChatTab(group, instanceId);
  }

  function positionAppPicker(anchor, picker) {
    const rect = anchor.getBoundingClientRect();
    const width = window.innerWidth < 760
      ? Math.max(320, window.innerWidth - 16)
      : Math.min(1460, Math.max(720, window.innerWidth - 32));
    const left = Math.max(8, Math.min(rect.left - 28, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 88));
    picker.style.width = `${width}px`;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    picker.style.maxHeight = `${Math.max(180, window.innerHeight - top - 12)}px`;
  }

  async function selectAppFromPicker(event, app, onSelect) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = event?.currentTarget;
    if (target?.dataset?.selecting === "true") return;
    if (target?.dataset) target.dataset.selecting = "true";
    await onSelect(app);
  }

  function renderAppPickerItem(app, custom, onSelect) {
    const provider = appPickerProvider(app);
    return el("button", {
      class: "app-picker-item",
      type: "button",
      title: inferAppName(app),
      onpointerdown: (event) => selectAppFromPicker(event, app, onSelect),
      onclick: (event) => selectAppFromPicker(event, app, onSelect),
      onkeydown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        selectAppFromPicker(event, app, onSelect);
      }
    },
      renderAppPickerFavicon(app),
      el("span", { class: "app-picker-name" }, inferAppName(app)),
      !custom && provider ? el("span", { class: "app-picker-provider" }, provider) : null
    );
  }

  function renderAppPickerColumn(section, onSelect) {
    return el("section", { class: `app-picker-column app-picker-${section.id}` },
      el("h3", { class: "app-picker-heading" }, section.title),
      el("div", { class: "app-picker-list" },
        section.apps.map((app) => renderAppPickerItem(app, section.custom, onSelect))
      )
    );
  }

  function openAppPicker(anchor, options = {}) {
    if (!anchor) return;
    if (anchor.classList.contains("popover-anchor") && document.querySelector(".app-picker-popover")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor");
    const { group, mode } = options;
    const onSelect = async (app) => {
      closePopovers();
      if (mode === "group") await addGroup(app.id);
      else if (group) await addAppToExistingGroup(group, app.id);
    };
    const backdrop = el("div", {
      class: "popover-backdrop app-picker-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closePopovers();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closePopovers();
      }
    });
    const picker = el("div", {
      class: "popover-menu app-picker-popover",
      role: "menu",
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      el("div", { class: "app-picker-columns" },
        appPickerSections().map((section) => renderAppPickerColumn(section, onSelect))
      )
    );
    document.body.append(backdrop, picker);
    positionAppPicker(anchor, picker);
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopovers, true);
  }

  function layoutPresetIsActive(preset) {
    const temporary = activeTemporaryLayoutPreset();
    return temporary ? preset?.id === temporary.id : preset?.id === state.options.activeLayoutPresetId;
  }

  function renderLayoutPresetItem(preset, index) {
    const temporary = Boolean(preset?.temporary);
    const active = layoutPresetIsActive(preset);
    const shortcut = temporary ? "" : layoutShortcutLabel(index);
    return el("div", {
      class: `layout-preset-item${active ? " active" : ""}${temporary ? " temporary" : ""}`.trim(),
      role: "menuitem",
      tabindex: "0",
      title: layoutPresetSummary(preset),
      onpointerdown: (event) => {
        if (event.button !== 0 || event.target?.closest?.(".layout-preset-delete")) return;
        event.preventDefault();
        event.stopPropagation();
        if (temporary) {
          closePopovers();
          return;
        }
        switchLayoutPreset(preset.id).catch((error) => {
          console.warn("[ChatClub] Failed to switch layout", error);
        });
      },
      onclick: (event) => {
        if (event.target?.closest?.(".layout-preset-delete")) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onkeydown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (temporary) {
          closePopovers();
          return;
        }
        switchLayoutPreset(preset.id).catch((error) => {
          console.warn("[ChatClub] Failed to switch layout", error);
        });
      }
    },
      el("span", { class: "layout-preset-summary" }, layoutPresetSummary(preset)),
      shortcut ? el("span", { class: "layout-preset-shortcut" }, shortcut) : null,
      el("button", {
        class: "icon-button layout-preset-delete compact-icon tooltip-trigger",
        type: "button",
        "aria-label": t("layout.delete"),
        "data-tooltip": t("layout.delete"),
        "data-tooltip-id": "workspace.layout.delete",
        disabled: !temporary && persistentLayoutPresets().length <= 1,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteLayoutPreset(preset.id).catch((error) => {
            console.warn("[ChatClub] Failed to delete layout", error);
          });
        },
        onpointerdown: (event) => event.stopPropagation()
      }, svgIcon("x"))
    );
  }

  function openLayoutMenu(anchor) {
    if (!anchor) return;
    if (anchor.classList.contains("popover-anchor") && document.querySelector(".layout-popover")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor");
    const rect = anchor.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = Math.min(rect.bottom + 7, window.innerHeight - 8);
    const backdrop = el("div", {
      class: "popover-backdrop layout-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closePopovers();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closePopovers();
      }
    });
    const menu = el("div", {
      class: "popover-menu layout-popover",
      role: "menu",
      style: { top: `${top}px`, right: `${right}px` },
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      activeTemporaryLayoutPreset() ? [
        renderLayoutPresetItem(activeTemporaryLayoutPreset(), -1),
        el("div", { class: "menu-separator" })
      ] : null,
      persistentLayoutPresets().map((preset, index) => renderLayoutPresetItem(preset, index)),
      el("div", { class: "menu-separator" }),
      menuButton(t("layout.add"), "plus", () => {
        addLayoutPreset().catch((error) => {
          console.warn("[ChatClub] Failed to add layout", error);
        });
      }, "secondary", false, t("layout.add"), "", "workspace.layout.add")
    );
    document.body.append(backdrop, menu);
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopovers, true);
  }

  function closePopoverOnKeydown(event) {
    if (event.key === "Escape") closePopovers();
  }

  function closePopoverOnOutsideInteraction(event) {
    const menu = document.querySelector(".popover-menu");
    const anchor = document.querySelector(".popover-anchor");
    const target = event.target;
    if (menu?.contains(target) || anchor?.contains(target)) return;
    closePopovers();
  }

  function closePopovers() {
    document.querySelectorAll(".popover-menu, .popover-backdrop").forEach((node) => node.remove());
    document.querySelectorAll(".popover-anchor").forEach((node) => node.classList.remove("popover-anchor"));
    document.removeEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
    document.removeEventListener("focusin", closePopoverOnOutsideInteraction, true);
    document.removeEventListener("keydown", closePopoverOnKeydown, true);
    window.removeEventListener("resize", closePopovers, true);
    window.removeEventListener("scroll", closePopovers, true);
    window.removeEventListener("blur", closePopovers, true);
  }

  function openChatMenu(anchor, group) {
    if (anchor.classList.contains("popover-anchor") && document.querySelector(".popover-menu")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor");
    const rect = anchor.getBoundingClientRect();
    const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
    const menuButtonById = {
      addApp: () => menuButton(t("chat.addApp"), "plus", () => openAppPicker(anchor, { group }), "secondary", false, t("chat.addApp"), "", "workspace.group.addApp"),
      openInNewTab: () => menuButton(t("common.openInNewTab"), "external", () => openChatInNewTab(group), "secondary", false, t("common.openInNewTab"), "", "workspace.group.openInNewTab"),
      copyLink: () => menuButton(t("common.copyLink"), "copy", () => copyActiveChatLink(group), "secondary", false, t("common.copyLink"), "", "workspace.group.copyLink"),
      reload: () => menuButton(t("chat.reload"), "reload", () => {
        reloadChat(activeChatForGroup(group));
        closePopovers();
      }, "secondary", false, shortcutTooltip(t("chat.reload"), "reloadChat"), "left", "workspace.group.reload"),
      fullscreen: () => menuButton(fullscreenLabel, fullscreenIcon, () => {
        toggleFullscreen(group.id);
        closePopovers();
      }, "secondary", false, fullscreenTooltipLabel, "left", "workspace.group.fullscreen"),
      removeGroup: () => menuButton(t("chat.removeGroup"), "x", async () => {
        await removeChatGroup(group);
        closePopovers();
      }, "danger", state.groups.length <= 1, shortcutTooltip(t("chat.removeGroup"), "closeChat"), "left", "workspace.group.remove")
    };
    const foldedMenuButtons = orderedTabGroupButtons()
      .filter((item) => tabGroupButtonIsFolded(item.id))
      .map((item) => ({ item, node: menuButtonById[item.id]?.() }))
      .filter((entry) => entry.node);
    const foldedHeaderButtons = foldedMenuButtons
      .filter((entry) => !entry.item.danger)
      .map((entry) => entry.node);
    const foldedDangerButtons = foldedMenuButtons
      .filter((entry) => entry.item.danger)
      .map((entry) => entry.node);
    const backdrop = el("div", {
      class: "popover-backdrop",
      onpointerdown: (event) => {
        event.preventDefault();
        closePopovers();
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closePopovers();
      }
    });
    const menu = el("div", {
      class: "popover-menu",
      role: "menu",
      style: { top: `${rect.bottom + 5}px`, right: `${Math.max(8, window.innerWidth - rect.right)}px` },
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      foldedHeaderButtons,
      foldedHeaderButtons.length && foldedDangerButtons.length ? el("div", { class: "menu-separator" }) : null,
      foldedDangerButtons
    );
    document.body.append(backdrop, menu);
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopovers, true);
  }

  return Object.freeze({
    renderWorkspace,
    syncWorkspaceIsland,
    syncWorkspaceDom,
    syncGridColumnClass,
    addGroup,
    closeTab,
    toggleFullscreen,
    openChatMenu,
    openAppPicker,
    openLayoutMenu,
    syncFullscreenLayout,
    activeShortcutGroupId,
    activeChatForGroup,
    activateChatTab,
    reloadChat,
    loadPocketEntryInFrame,
    restorePocketBatch,
    iframeForWindow,
    groupIdForFrameWindow,
    syncFrameFavicon,
    openableTabUrl,
    openTabUrl,
    hydrateGroups,
    switchLayoutPreset,
    closePopovers,
    currentFrames,
    frameApp,
    setFramePointerBlockedForOverlay,
    findFrameForSummarySource,
    refreshCurrentExtensionTabInfo
  });
}
