import { TAB_GROUP_HEADER_BUTTONS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { normalizeTabGroupButtonOrder, normalizeTabGroupButtonPlacement } from "../../shared/storage-schema.js";
import { claimTopmostPopoverEscape, el } from "../../ui/dom.js";
import { workspaceGridColumnCount } from "./model.js";
import { validateControllerContract } from "../controller-contract.js";

const LAYOUT_POPOVER_RIGHT_EXTENSION = 40;
const APP_PICKER_INTERNATIONAL_IDS = [
  "ChatGPT", "Claude", "Copilot", "CopilotGH", "Felo", "Gemini", "Genspark", "Grok", "Liner",
  "Meta", "Mistral", "Perplexity", "Poe", "QwenChat", "You", "Zai", "NotionAI", "Kagi", "TypingMind"
];
const APP_PICKER_INTERNATIONAL_ID_SET = new Set(APP_PICKER_INTERNATIONAL_IDS);
const APP_PICKER_FORCE_INTERNATIONAL_HOSTS = new Set(["assistant.kagi.com"]);
const APP_PICKER_CHINESE_IDS = [
  "ChatGLM", "DeepSeek", "DouBao", "YiYan", "Kimi", "LingGuang", "LongCat", "MetaSo",
  "HaiLuo", "NaMiSearch", "Qwen", "SenseChat", "YueWen", "HunYuan"
];
const APP_PICKER_CHINESE_ID_SET = new Set(APP_PICKER_CHINESE_IDS);

function requireMethods(port, label, methods) {
  for (const method of methods) {
    if (typeof port?.[method] !== "function") throw new TypeError(`Workspace view ${label} port requires ${method}().`);
  }
}

export function createWorkspaceViewController(dependencies = {}) {
  const { state, services, frame, layout, pocket, drag, navigator } = validateControllerContract(
    dependencies,
    "Workspace view controller",
    {
      state: "object",
      services: "object",
      frame: "object",
      layout: "object",
      pocket: "object",
      drag: "object",
      navigator: "object"
    }
  );
  const {
    allApps,
    appById,
    appFaviconUrl,
    browserFaviconUrl,
    compactIconButton,
    fallbackFaviconUrl,
    inferAppName,
    menuButton,
    notify,
    openCustomAppEditor,
    openableTabUrl,
    render,
    svgIcon
  } = services;
  requireMethods(frame, "frame", [
    "activeChatForGroup", "activeFrameIsLoading", "activeIframe", "activateChatTab", "beginFrameLoading",
    "chatFrameAllow", "chatFrameName", "chatFrameNeedsSandbox", "chatFrameSandbox", "closeTab",
    "completeFrameLoading", "consumeFrameInitialHref", "copyActiveChatLink", "createFrameBindingId", "currentFullscreenGroup", "currentGroupIndex",
    "deleteActiveThreadForGroup", "fullscreenShortcutLabel",
    "notifyWorkspaceFrameSync", "openChatInNewTab", "openGoToUrlDialog", "refreshCurrentPage", "reloadChat",
    "removeChatGroup", "setFrameSrcAfterPrepare", "startNewChatInActiveTab", "syncFullscreenLayout",
    "syncGroupTabOrder", "toggleFullscreen", "topicDeleteCapabilityForFrame"
  ]);
  requireMethods(layout, "layout", [
    "activeTemporaryLayoutPreset", "addAppToGroup", "addGroup", "addLayoutPreset", "deleteLayoutPreset", "layoutPresetSummary",
    "layoutShortcutLabel", "persistLayout", "persistentLayoutPresets", "shortcutTooltip", "switchLayoutPreset"
  ]);
  requireMethods(pocket, "Pocket", ["chatLocationForInstance"]);
  requireMethods(drag, "drag", [
    "cleanupGroupDragState", "consumeSuppressedTabClick", "draggedGroupId", "draggedTabId",
    "moveGroupByDrop", "moveTabByDrop", "previewTabDrop", "startTabPointerDrag"
  ]);
  requireMethods(navigator, "Message Navigator", [
    "closeTrackedMessageNavigatorMenu", "messageNavigatorFrameEnabled", "messageNavigatorPayloadForFrame",
    "toggleMessageNavigator"
  ]);
  const {
    activeChatForGroup, activeFrameIsLoading, activeIframe, activateChatTab, beginFrameLoading,
    chatFrameAllow, chatFrameName, chatFrameNeedsSandbox, chatFrameSandbox, closeTab,
    completeFrameLoading, consumeFrameInitialHref, copyActiveChatLink, createFrameBindingId, currentFullscreenGroup, currentGroupIndex,
    deleteActiveThreadForGroup, fullscreenShortcutLabel,
    notifyWorkspaceFrameSync, openChatInNewTab, openGoToUrlDialog, refreshCurrentPage, reloadChat,
    removeChatGroup, setFrameSrcAfterPrepare, startNewChatInActiveTab, syncFullscreenLayout,
    syncGroupTabOrder, toggleFullscreen, topicDeleteCapabilityForFrame
  } = frame;
  const {
    activeTemporaryLayoutPreset, addAppToGroup, addGroup, addLayoutPreset, deleteLayoutPreset, layoutPresetSummary,
    layoutShortcutLabel, persistLayout, persistentLayoutPresets, shortcutTooltip, switchLayoutPreset
  } = layout;
  const { chatLocationForInstance } = pocket;
  const {
    cleanupGroupDragState, consumeSuppressedTabClick, draggedGroupId, draggedTabId, moveGroupByDrop,
    moveTabByDrop, previewTabDrop, startTabPointerDrag
  } = drag;
  const {
    closeTrackedMessageNavigatorMenu, messageNavigatorFrameEnabled, messageNavigatorPayloadForFrame,
    toggleMessageNavigator
  } = navigator;
  let workspaceNode = null;
  let workspaceRenderSignature = "";
  let workspacePopoverAnchor = null;

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

  function syncHeaderForFrameInstance(instanceId) {
    const location = chatLocationForInstance(instanceId);
    const group = location?.group;
    if (!group) return;
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    if (card) syncTabGroupHeaderControls(card, group);
  }

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
    const customIds = customAppIds();
    const customApps = apps.filter((app) => !APP_PICKER_INTERNATIONAL_ID_SET.has(app.id)
      && !APP_PICKER_CHINESE_ID_SET.has(app.id)
      && !isForcedInternationalApp(app)
      && (customIds.has(app.id) || /^custom$/i.test(app.provider || "")));
    const customSet = new Set(customApps.map((app) => app.id));
    const customHostKeys = new Set(customApps.flatMap((app) => Array.from(appPickerHostKeys(app))));
    const byKnownOrder = (ids) => {
      const idSet = new Set(ids);
      return apps.filter((app) => idSet.has(app.id) && !customSet.has(app.id) && !hasCustomAppEquivalent(app, customHostKeys));
    };
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

  function frameSandboxMatchesApp(iframe, app) {
    const sandboxed = chatFrameNeedsSandbox(app);
    return sandboxed
      ? iframe?.getAttribute("sandbox") === chatFrameSandbox(app)
      : !iframe?.hasAttribute("sandbox");
  }

  function refreshChatTabPresentations(appIds = new Set(), sourceChangedAppIds = new Set()) {
    if (!appIds.size) return;
    for (const group of state.groups || []) {
      const card = Array.from(document.querySelectorAll(".main-grid > .chat-card"))
        .find((node) => node.dataset.groupId === group.id);
      if (!card) continue;
      for (const chat of group.chatApps || []) {
        if (!appIds.has(chat.appId)) continue;
        const tab = Array.from(card.querySelectorAll(".tab[data-instance-id]"))
          .find((node) => node.dataset.instanceId === chat.instanceId);
        tab?.replaceWith(renderChatTab(group, chat));
        const iframe = Array.from(card.querySelectorAll(".chat-frame[data-instance-id]"))
          .find((node) => node.dataset.instanceId === chat.instanceId);
        if (iframe && (
          sourceChangedAppIds.has(chat.appId)
          || !frameSandboxMatchesApp(iframe, appById(chat.appId))
        )) {
          iframe.replaceWith(renderChatFrame(group, chat));
        }
      }
      syncGroupTabOrder(group);
    }
  }

  function reconcileAppCatalogDom(result, affectedAppIds, sourceChangedAppIds, previousActiveTabs) {
    const grid = workspaceNode?.isConnected ? workspaceNode : document.querySelector(".main-grid");
    if (!grid) return false;
    const groupById = new Map((state.groups || []).map((group) => [group.id, group]));
    const cards = Array.from(grid.querySelectorAll(":scope > .chat-card"));
    for (const card of cards) {
      if (!groupById.has(card.dataset.groupId)) card.remove();
    }

    for (const [index, group] of (state.groups || []).entries()) {
      let card = Array.from(grid.querySelectorAll(":scope > .chat-card"))
        .find((node) => node.dataset.groupId === group.id);
      if (!card) {
        card = renderChatGroup(group, index);
        grid.append(card);
        continue;
      }
      const instanceIds = new Set((group.chatApps || []).map((chat) => chat.instanceId));
      card.querySelectorAll(".tab[data-instance-id]").forEach((tab) => {
        if (!instanceIds.has(tab.dataset.instanceId)) tab.remove();
      });
      card.querySelectorAll(".chat-frame[data-instance-id]").forEach((iframe) => {
        if (!instanceIds.has(iframe.dataset.instanceId)) iframe.remove();
      });

      const tabs = card.querySelector(".chat-tabs");
      const frameWrap = card.querySelector(".chat-frame-wrap");
      for (const chat of group.chatApps || []) {
        const currentTab = Array.from(card.querySelectorAll(".tab[data-instance-id]"))
          .find((node) => node.dataset.instanceId === chat.instanceId);
        if (!currentTab) {
          tabs?.insertBefore(renderChatTab(group, chat), tabs.querySelector(".tab-add"));
        } else if (affectedAppIds.has(chat.appId)) {
          currentTab.replaceWith(renderChatTab(group, chat));
        }
        const currentFrame = Array.from(card.querySelectorAll(".chat-frame[data-instance-id]"))
          .find((node) => node.dataset.instanceId === chat.instanceId);
        if (!currentFrame) frameWrap?.append(renderChatFrame(group, chat));
        else if (affectedAppIds.has(chat.appId) && (
          sourceChangedAppIds.has(chat.appId)
          || !frameSandboxMatchesApp(currentFrame, appById(chat.appId))
        )) {
          currentFrame.replaceWith(renderChatFrame(group, chat));
        }
      }
      card.style.order = String(index + 1);
      syncGroupTabOrder(group);
      activateChatTab(
        group,
        state.activeTabs[group.id] || group.chatApps[0]?.instanceId || "",
        previousActiveTabs?.[group.id] || ""
      );
    }

    workspaceNode = grid;
    workspaceRenderSignature = workspaceSignature();
    syncGridColumnClass();
    syncFullscreenLayout();
    return result.changed;
  }

  /**
   * Reconcile changes to the custom-app catalog without hydrating a new
   * workspace. Surviving iframe elements stay attached unless that app's URL,
   * built-in/custom source, or sandbox contract changed, in which case only
   * the affected frame is rebuilt.
   */
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
    return tabGroupButtonPlacement()[id] === "pinned";
  }

  function tabGroupButtonIsFolded(id) {
    return tabGroupButtonPlacement()[id] === "menu";
  }

  function syncTabGroupHeaderControls(card, group) {
    card.classList.add("tab-group-buttons-custom");
    card.classList.remove("tab-group-buttons-hidden", "tab-group-buttons-pinned");
    card.classList.toggle("frame-loading", activeFrameIsLoading(group));
    for (const item of TAB_GROUP_HEADER_BUTTONS) {
      card.dataset[`button${item.id.charAt(0).toUpperCase()}${item.id.slice(1)}`] = tabGroupButtonPlacement()[item.id] || "pinned";
    }
    const tabs = card.querySelector(".chat-tabs");
    const addButton = tabs?.querySelector(".tab-add");
    if (tabs && tabGroupButtonIsPinned("addApp") && !addButton) {
      tabs.append(renderTabAddButton(group));
    } else if (addButton && !tabGroupButtonIsPinned("addApp")) {
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
    notifyWorkspaceFrameSync();
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
        if (consumeSuppressedTabClick(chat.instanceId)) {
          event.preventDefault();
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
    const initialHref = consumeFrameInitialHref(chat.instanceId);
    const frameBindingId = createFrameBindingId();
    const dataset = { instanceId: chat.instanceId, appId: app.id, frameBindingId };
    if (initialHref) dataset.currentHref = initialHref;
    const attrs = {
      class: `chat-frame ${chat.instanceId === (state.activeTabs[group.id] || group.chatApps[0]?.instanceId) ? "active" : ""}`,
      dataset,
      allow: chatFrameAllow(),
      referrerpolicy: "no-referrer",
      name: chatFrameName(app, frameBindingId),
      onload: (event) => completeFrameLoading(event.currentTarget)
    };
    if (chatFrameNeedsSandbox(app)) attrs.sandbox = chatFrameSandbox(app);
    const iframe = el("iframe", attrs);
    setFrameSrcAfterPrepare(iframe, initialHref || app.url);
    return iframe;
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

  function renderGoToUrlButton(group) {
    return compactIconButton(t("chat.goToUrl"), "link", () => openGoToUrlDialog(group), "", t("chat.goToUrl"), "left", "workspace.group.goToUrl");
  }

  function renderNewChatButton(group) {
    return compactIconButton(t("topbar.newChat"), "edit", () => startNewChatInActiveTab(group), "", shortcutTooltip(t("topbar.newChat"), "newChat"), "left", "workspace.group.newChat");
  }

  function applyRefreshPageLoadingState(button, loading) {
    button.classList.toggle("refresh-page-loading", loading);
    button.toggleAttribute("aria-busy", loading);
    return button;
  }

  function renderRefreshPageButton(group) {
    const loading = activeFrameIsLoading(group);
    return applyRefreshPageLoadingState(
      compactIconButton(t("chat.refreshPage"), "reload", () => refreshCurrentPage(activeChatForGroup(group)), loading ? "refresh-page-loading" : "", shortcutTooltip(t("chat.refreshPage"), "refreshPage"), "left", "workspace.group.refreshPage"),
      loading
    );
  }

  function renderRefreshPageMenuButton(group) {
    const button = menuButton(t("chat.refreshPage"), "reload", () => {
      refreshCurrentPage(activeChatForGroup(group));
      closePopovers();
    }, "secondary", false, shortcutTooltip(t("chat.refreshPage"), "refreshPage"), "left", "workspace.group.refreshPage");
    return applyRefreshPageLoadingState(button, activeFrameIsLoading(group));
  }

  function renderHomeButton(group) {
    return compactIconButton(t("chat.home"), "home", () => reloadChat(activeChatForGroup(group)), "", shortcutTooltip(t("chat.home"), "reloadChat"), "left", "workspace.group.reload");
  }

  function renderRemoveGroupButton(group) {
    const button = compactIconButton(t("chat.removeGroup"), "x", async () => {
      await removeChatGroup(group);
      closePopovers();
    }, "danger-action", shortcutTooltip(t("chat.removeGroup"), "closeChat"), "left", "workspace.group.remove");
    button.disabled = state.groups.length <= 1;
    return button;
  }

  function renderMessageNavigatorButton(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    const active = messageNavigatorFrameEnabled(iframe);
    const button = compactIconButton(t("chat.messageNavigator"), "navigator", () => toggleMessageNavigator(group), active ? "message-navigator-active" : "", shortcutTooltip(t("chat.messageNavigator"), "toggleMessageNavigator"), "left", "workspace.group.messageNavigator");
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !active && !messageNavigatorPayloadForFrame(iframe, "", { appId: chat?.appId || "" });
    return button;
  }

  function renderDeleteThreadButton(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    const button = compactIconButton(t("chat.deleteThreadInGroup"), "trash", () => deleteActiveThreadForGroup(group), "danger-action", t("chat.deleteThreadInGroup"), "left", "workspace.group.deleteThread");
    button.disabled = !topicDeleteCapabilityForFrame(iframe, { appId: chat?.appId || "" }).available;
    return button;
  }

  function renderChatActionButtons(group) {
    const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
    const buttonById = {
      openInNewTab: () => renderOpenInNewTabButton(group),
      copyLink: () => renderCopyLinkButton(group),
      goToUrl: () => renderGoToUrlButton(group),
      newChat: () => renderNewChatButton(group),
      refreshPage: () => renderRefreshPageButton(group),
      reload: () => renderHomeButton(group),
      messageNavigator: () => renderMessageNavigatorButton(group),
      deleteThread: () => renderDeleteThreadButton(group),
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
    const frames = group.chatApps.map((chat) => renderChatFrame(group, chat));
    const isFrameLoading = activeFrameIsLoading(group);
    return el("section", {
      class: `chat-card tab-group-buttons-custom ${isFullscreen ? "fullscreen" : ""} ${isFrameLoading ? "frame-loading" : ""}`.trim(),
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
        frames
      )
    );
  }

  async function addAppToExistingGroup(group, appId) {
    const addition = await addAppToGroup(group.id, appId);
    if (!addition) return;
    const currentGroup = state.groups.find((candidate) => candidate.id === addition.groupId);
    const chat = currentGroup?.chatApps.find((candidate) => candidate.instanceId === addition.instanceId);
    if (!currentGroup || !chat) return;
    const card = document.querySelector(`.chat-card[data-group-id="${currentGroup.id}"]`);
    const tabs = card?.querySelector(".chat-tabs");
    const frameWrap = card?.querySelector(".chat-frame-wrap");
    if (!tabs || !frameWrap) {
      render();
      return;
    }
    tabs.insertBefore(renderChatTab(currentGroup, chat), tabs.querySelector(".tab-add"));
    frameWrap.append(renderChatFrame(currentGroup, chat));
    activateChatTab(currentGroup, addition.instanceId);
    notifyWorkspaceFrameSync();
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

  function openCustomAppEditorFromPicker(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = event?.currentTarget;
    if (target?.dataset?.opening === "true") return;
    if (target?.dataset) target.dataset.opening = "true";
    closePopovers();
    openCustomAppEditor?.();
  }

  function renderAppPickerHeading(section) {
    const title = el("h3", { class: "app-picker-heading" }, section.title);
    if (!section.custom || !openCustomAppEditor) return title;
    return el("div", { class: "app-picker-heading-row" },
      title,
      el("button", {
        class: "app-picker-add-button tooltip-trigger",
        type: "button",
        "aria-label": t("appPicker.addCustom"),
        "data-tooltip": t("appPicker.addCustom"),
        "data-tooltip-id": "appPicker.addCustom",
        onpointerdown: openCustomAppEditorFromPicker,
        onclick: openCustomAppEditorFromPicker
      },
        svgIcon("plus")
      )
    );
  }

  function renderAppPickerColumn(section, onSelect) {
    return el("section", { class: `app-picker-column app-picker-${section.id}` },
      renderAppPickerHeading(section),
      el("div", { class: "app-picker-list" },
        section.apps.map((app) => renderAppPickerItem(app, section.custom, onSelect))
      )
    );
  }

  function openAppPicker(anchor, options = {}) {
    if (!anchor) return;
    if (anchor.classList.contains("workspace-popover-anchor") && document.querySelector(".workspace-popover-menu.app-picker-popover")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor", "workspace-popover-anchor");
    workspacePopoverAnchor = anchor;
    const { group, mode } = options;
    const onSelect = async (app) => {
      closePopovers();
      if (mode === "group") await addGroup(app.id);
      else if (group) await addAppToExistingGroup(group, app.id);
    };
    const backdrop = el("div", {
      class: "popover-backdrop workspace-popover-backdrop app-picker-backdrop",
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
      class: "popover-menu workspace-popover-menu app-picker-popover",
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
    if (anchor.classList.contains("workspace-popover-anchor") && document.querySelector(".workspace-popover-menu.layout-popover")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor", "workspace-popover-anchor");
    workspacePopoverAnchor = anchor;
    const rect = anchor.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right - LAYOUT_POPOVER_RIGHT_EXTENSION);
    const top = Math.min(rect.bottom + 7, window.innerHeight - 8);
    const backdrop = el("div", {
      class: "popover-backdrop workspace-popover-backdrop layout-backdrop",
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
      class: "popover-menu workspace-popover-menu layout-popover",
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
    if (claimTopmostPopoverEscape(event, ".workspace-popover-menu")) closePopovers();
  }

  function closePopoverOnOutsideInteraction(event) {
    const menu = document.querySelector(".workspace-popover-menu");
    const anchor = document.querySelector(".workspace-popover-anchor");
    const target = event.target;
    if (menu?.contains(target) || anchor?.contains(target)) return;
    closePopovers();
  }

  function closePopovers() {
    document.querySelectorAll(".workspace-popover-menu, .workspace-popover-backdrop").forEach((node) => node.remove());
    document.querySelectorAll(".workspace-popover-anchor").forEach((node) => {
      node.classList.remove("popover-anchor", "workspace-popover-anchor");
    });
    workspacePopoverAnchor?.classList?.remove("popover-anchor", "workspace-popover-anchor");
    workspacePopoverAnchor = null;
    document.removeEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
    document.removeEventListener("focusin", closePopoverOnOutsideInteraction, true);
    document.removeEventListener("keydown", closePopoverOnKeydown, true);
    window.removeEventListener("resize", closePopovers, true);
    window.removeEventListener("scroll", closePopovers, true);
    window.removeEventListener("blur", closePopovers, true);
  }

  function closePopoversAnchoredWithin(root) {
    if (!workspacePopoverAnchor) return;
    if (!workspacePopoverAnchor.isConnected || root?.contains?.(workspacePopoverAnchor)) closePopovers();
  }

  function closeTransientOverlays() {
    closePopovers();
    closeTrackedMessageNavigatorMenu();
  }

  function openChatMenu(anchor, group) {
    if (anchor.classList.contains("workspace-popover-anchor") && document.querySelector(".workspace-popover-menu")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor", "workspace-popover-anchor");
    workspacePopoverAnchor = anchor;
    const rect = anchor.getBoundingClientRect();
    const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
    const activeChat = activeChatForGroup(group);
    const activeFrame = activeIframe(activeChat);
    const activeFallback = { appId: activeChat?.appId || "" };
    const messageNavigatorDisabled = !messageNavigatorFrameEnabled(activeFrame) && !messageNavigatorPayloadForFrame(activeFrame, "", activeFallback);
    const deleteThreadDisabled = !topicDeleteCapabilityForFrame(activeFrame, activeFallback).available;
    const menuButtonById = {
      addApp: () => menuButton(t("chat.addApp"), "plus", () => openAppPicker(anchor, { group }), "secondary", false, t("chat.addApp"), "", "workspace.group.addApp"),
      openInNewTab: () => menuButton(t("common.openInNewTab"), "external", () => openChatInNewTab(group), "secondary", false, t("common.openInNewTab"), "", "workspace.group.openInNewTab"),
      copyLink: () => menuButton(t("common.copyLink"), "copy", () => copyActiveChatLink(group), "secondary", false, t("common.copyLink"), "", "workspace.group.copyLink"),
      goToUrl: () => menuButton(t("chat.goToUrl"), "link", () => {
        closePopovers();
        openGoToUrlDialog(group);
      }, "secondary", false, t("chat.goToUrl"), "", "workspace.group.goToUrl"),
      newChat: () => menuButton(t("topbar.newChat"), "edit", async () => {
        await startNewChatInActiveTab(group);
        closePopovers();
      }, "secondary", false, shortcutTooltip(t("topbar.newChat"), "newChat"), "left", "workspace.group.newChat"),
      refreshPage: () => renderRefreshPageMenuButton(group),
      reload: () => menuButton(t("chat.home"), "home", () => {
        reloadChat(activeChatForGroup(group));
        closePopovers();
      }, "secondary", false, shortcutTooltip(t("chat.home"), "reloadChat"), "left", "workspace.group.reload"),
      messageNavigator: () => menuButton(t("chat.messageNavigator"), "navigator", () => {
        toggleMessageNavigator(group);
      }, "secondary", messageNavigatorDisabled, shortcutTooltip(t("chat.messageNavigator"), "toggleMessageNavigator"), "left", "workspace.group.messageNavigator"),
      deleteThread: () => menuButton(t("chat.deleteThreadInGroup"), "trash", () => {
        deleteActiveThreadForGroup(group);
      }, "danger", deleteThreadDisabled, t("chat.deleteThreadInGroup"), "left", "workspace.group.deleteThread"),
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
      class: "popover-backdrop workspace-popover-backdrop",
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
      class: "popover-menu workspace-popover-menu",
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
    appendChatGroup,
    closePopovers,
    closePopoversAnchoredWithin,
    closeTransientOverlays,
    fullscreenButtonMeta,
    openAppPicker,
    openChatMenu,
    openLayoutMenu,
    reconcileAppCatalogDom,
    refreshChatTabPresentations,
    renderChatFrame,
    renderChatTab,
    renderWorkspace,
    syncGridColumnClass,
    syncGridColumns,
    syncHeaderForFrameInstance,
    syncTabGroupHeaderControls,
    syncWorkspaceDom,
    syncWorkspaceIsland,
    workspaceDomMatchesState
  });
}
