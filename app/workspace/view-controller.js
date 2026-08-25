import { TAB_GROUP_HEADER_BUTTONS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { normalizeTabGroupButtonOrder, normalizeTabGroupButtonPlacement } from "../../shared/storage-schema.js";
import { claimTopmostPopoverEscape, el, isChatFrameNode, scheduleFrameOwnedBlurDismissal } from "../../ui/dom.js";
import { buildAppPickerSections, renderAppPickerColumns } from "./app-picker.js";
import { workspaceGridColumnCount } from "./model.js";
import { renderPreferredModelSelectionOverlay } from "./preferred-model-selection-overlay.js";
import { renderWorkspaceTabMenuItems } from "./tab-context-menu.js";
import { createControllerMethodValidator, validateControllerContract } from "../controller-contract.js";
const LAYOUT_POPOVER_RIGHT_EXTENSION = 40;
const requireMethods = createControllerMethodValidator("Workspace view", "port");
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
    openCustomAppEditor,
    openableTabUrl,
    render,
    svgIcon
  } = services;
  requireMethods(frame, "frame", [
    "activeChatForGroup", "activeFrameIsLoading", "activeIframe", "activateChatTab",
    "chatFrameAttributes", "chatFrameName", "closeTab",
    "completeFrameLoading", "consumeFrameInitialHref", "copyActiveChatLink", "createFrameBindingId",
    "deleteActiveThreadForGroup", "fullscreenShortcutLabel",
    "notifyWorkspaceFrameSync", "openChatInNewTab", "openGoToUrlDialog", "refreshCurrentPage", "reloadChat",
    "removeChatGroup", "setFrameSrcAfterPrepare", "stageFrameInitialHref", "startNewChatInActiveTab", "syncFullscreenLayout",
    "syncFrameLoadingMask", "syncGroupTabOrder", "toggleFullscreen", "topicDeleteCapabilityForFrame"
  ]);
  requireMethods(layout, "layout", [
    "activeTemporaryLayoutPreset", "addAppToGroup", "addGroup", "addLayoutPreset", "deleteLayoutPreset", "layoutPresetSummary",
    "layoutShortcutLabel", "persistAppPickerOrder", "persistentLayoutPresets", "shortcutTooltip", "switchLayoutPreset"
  ]);
  requireMethods(pocket, "Pocket", ["chatLocationForInstance"]);
  requireMethods(drag, "drag", [
    "consumeSuppressedTabClick", "startTabPointerDrag"
  ]);
  requireMethods(navigator, "Message Navigator", [
    "closeTrackedMessageNavigatorMenu", "messageNavigatorFrameEnabled", "messageNavigatorPayloadForFrame",
    "toggleMessageNavigator"
  ]);
  const {
    activeChatForGroup, activeFrameIsLoading, activeIframe, activateChatTab,
    chatFrameAttributes, chatFrameName, closeTab,
    completeFrameLoading, consumeFrameInitialHref, copyActiveChatLink, createFrameBindingId,
    deleteActiveThreadForGroup, fullscreenShortcutLabel,
    notifyWorkspaceFrameSync, openChatInNewTab, openGoToUrlDialog, refreshCurrentPage, reloadChat,
    removeChatGroup, setFrameSrcAfterPrepare, stageFrameInitialHref, startNewChatInActiveTab, syncFullscreenLayout,
    syncFrameLoadingMask, syncGroupTabOrder, toggleFullscreen, topicDeleteCapabilityForFrame
  } = frame;
  const {
    activeTemporaryLayoutPreset, addAppToGroup, addGroup, addLayoutPreset, deleteLayoutPreset, layoutPresetSummary,
    layoutShortcutLabel, persistAppPickerOrder, persistentLayoutPresets, shortcutTooltip, switchLayoutPreset
  } = layout;
  const { chatLocationForInstance } = pocket;
  const { consumeSuppressedTabClick, startTabPointerDrag } = drag;
  const {
    closeTrackedMessageNavigatorMenu, messageNavigatorFrameEnabled, messageNavigatorPayloadForFrame,
    toggleMessageNavigator
  } = navigator;
  let workspaceNode = null;
  let workspaceRenderSignature = "";
  let workspacePopoverAnchor = null;
  let frameLoadingAnnouncementSequence = 0;

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
        && ids.every((id, index) => tabs[index]?.dataset.instanceId === id)
        && ids.every((id) => frames.some((frame) => frame.dataset.instanceId === id));
    });
  }

  function syncWorkspaceTabOrder() {
    for (const group of state.groups || []) syncGroupTabOrder(group);
  }

  function syncHeaderForFrameInstance(instanceId) {
    const location = chatLocationForInstance(instanceId);
    const group = location?.group;
    if (!group) return;
    const card = document.querySelector(`.chat-card[data-group-id="${group.id}"]`);
    if (card) syncTabGroupHeaderControls(card, group);
  }

  function frameAttributeContractMatches(iframe, app, href = "") {
    const targetHref = openableTabUrl(href)
      || openableTabUrl(iframe?.dataset?.currentHref)
      || openableTabUrl(iframe?.getAttribute?.("src"))
      || openableTabUrl(app?.url);
    const contract = chatFrameAttributes(app, targetHref);
    return String(iframe?.dataset?.iframeAttributeContract || "") === String(contract.signature || "");
  }

  function frameCurrentHref(iframe, app = {}) {
    return openableTabUrl(iframe?.dataset?.currentHref)
      || openableTabUrl(iframe?.getAttribute?.("src"))
      || openableTabUrl(app?.url);
  }

  function replaceChatFrame(group, chat, iframe, { preserveHref = false, href = "" } = {}) {
    if (!group || !chat || !(iframe instanceof HTMLIFrameElement)) return null;
    const app = appById(chat.appId);
    const targetHref = openableTabUrl(href) || (preserveHref ? frameCurrentHref(iframe, app) : "");
    if (targetHref) stageFrameInitialHref(chat.instanceId, targetHref);
    const replacement = renderChatFrame(group, chat);
    iframe.replaceWith(replacement);
    syncHeaderForFrameInstance(chat.instanceId);
    syncGroupTabOrder(group);
    return replacement;
  }

  function ensureFrameAttributeContract(iframe, href = "") {
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.isConnected) return false;
    const instanceId = String(iframe.dataset.instanceId || "");
    const location = chatLocationForInstance(instanceId);
    const group = location?.group;
    const chat = location?.chat;
    if (!group || !chat) return false;
    const app = appById(chat.appId);
    const targetHref = openableTabUrl(href) || frameCurrentHref(iframe, app);
    if (frameAttributeContractMatches(iframe, app, targetHref)) return false;
    replaceChatFrame(group, chat, iframe, { preserveHref: true, href: targetHref });
    return true;
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
          || !frameAttributeContractMatches(iframe, appById(chat.appId))
        )) {
          if (sourceChangedAppIds.has(chat.appId)) replaceChatFrame(group, chat, iframe);
          else replaceChatFrame(group, chat, iframe, { preserveHref: true });
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
          || !frameAttributeContractMatches(currentFrame, appById(chat.appId))
        )) {
          if (sourceChangedAppIds.has(chat.appId)) replaceChatFrame(group, chat, currentFrame);
          else replaceChatFrame(group, chat, currentFrame, { preserveHref: true });
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
    // Repair tab order before deciding whether the existing workspace island
    // can be retained. Membership can match while a prior async save left the
    // DOM in an older order; replacing the island would unnecessarily reload
    // every live chat iframe.
    syncWorkspaceTabOrder();
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

  function frameLoadingStatusText(iframe) {
    return t(iframe?.dataset?.frameLoadingKind === "new-topic"
      ? "chat.frameLoadingNewTopic"
      : "chat.frameLoadingRestoring");
  }

  function renderFrameLoadingStatus() {
    return el("div", {
      class: "chat-frame-loading-status",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      hidden: true
    }, "");
  }

  function syncFrameLoadingStatus(card, group) {
    const loading = activeFrameIsLoading(group);
    const frameWrap = card.querySelector(".chat-frame-wrap");
    const activeFrame = frameWrap?.querySelector(".chat-frame.active");
    const status = frameWrap?.querySelector(".chat-frame-loading-status");
    frameWrap?.querySelectorAll(".chat-frame").forEach((frame) => {
      frame.setAttribute("aria-busy", String(frame === activeFrame && loading));
    });
    if (status) {
      if (!loading) {
        status.hidden = true;
        status.textContent = "";
        delete status.dataset.frameLoadingAnnouncement;
      } else {
        const message = frameLoadingStatusText(activeFrame);
        if (status.hidden || status.textContent !== message) {
          status.hidden = false;
          const announcementId = String(++frameLoadingAnnouncementSequence);
          status.dataset.frameLoadingAnnouncement = announcementId;
          queueMicrotask(() => {
            if (
              status.hidden
              || status.dataset.frameLoadingAnnouncement !== announcementId
              || frameWrap?.querySelector(".chat-frame.active") !== activeFrame
              || !activeFrameIsLoading(group)
            ) return;
            status.textContent = message;
          });
        }
      }
    }
    return loading;
  }

  function syncTabGroupHeaderControls(card, group) {
    card.classList.add("tab-group-buttons-custom");
    card.classList.remove("tab-group-buttons-hidden", "tab-group-buttons-pinned");
    card.classList.toggle("frame-loading", syncFrameLoadingStatus(card, group));
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
    syncWorkspaceTabOrder();
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

  function appendEmptyChatGroup(group) {
    const grid = document.querySelector(".main-grid");
    if (!grid || !group) return null;
    const card = renderChatGroup(group, state.groups.findIndex((item) => item.id === group.id), { chatApps: [] });
    grid.append(card);
    return card;
  }
  function renderChatTab(group, chat) {
    const app = appById(chat.appId);
    const name = inferAppName(app);
    const active = state.activeTabs[group.id] || group.chatApps[0]?.instanceId;
    const currentLocation = () => chatLocationForInstance(chat.instanceId);
    const activateCurrentLocation = () => {
      const location = currentLocation();
      if (location?.group) activateChatTab(location.group, chat.instanceId);
    };
    const openCurrentTabMenu = (event) => {
      event?.preventDefault?.(); event?.stopPropagation?.();
      const location = currentLocation();
      if (!location?.group || !location.chat) return;
      openChatMenu(event.currentTarget, location.group, { showAllActions: true, targetChat: location.chat });
    };
    return el("div", {
      class: `tab ${chat.instanceId === active ? "active" : ""}`,
      role: "button",
      tabindex: "0",
      draggable: "false",
      title: name,
      dataset: { instanceId: chat.instanceId },
      onselectstart: (event) => {
        event.preventDefault(); event.stopPropagation();
      },
      onmousedown: (event) => {
        if (event.button !== 0 || event.target?.closest?.(".tab-close")) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onpointerdown: (event) => startTabPointerDrag(event, currentLocation()?.group?.id, chat.instanceId),
      oncontextmenu: openCurrentTabMenu,
      onclick: (event) => {
        if (consumeSuppressedTabClick(chat.instanceId)) {
          event.preventDefault();
          return;
        }
        activateCurrentLocation();
      },
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateCurrentLocation();
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
          const location = currentLocation();
          if (location?.group && location.chat) await closeTab(location.group, location.chat);
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
    const targetHref = initialHref || app.url;
    const contract = chatFrameAttributes(app, targetHref);
    const dataset = {
      instanceId: chat.instanceId,
      appId: app.id,
      frameBindingId,
      iframeAttributeContract: String(contract.signature || "")
    };
    if (initialHref) dataset.currentHref = initialHref;
    const attrs = {
      ...Object.fromEntries((contract.entries || []).map(({ name, value }) => [name, value])),
      class: `chat-frame ${chat.instanceId === (state.activeTabs[group.id] || group.chatApps[0]?.instanceId) ? "active" : ""}`,
      dataset,
      name: chatFrameName(app, frameBindingId), inert: true, tabindex: "-1",
      onload: (event) => completeFrameLoading(event.currentTarget)
    };
    const iframe = el("iframe", attrs);
    setFrameSrcAfterPrepare(iframe, targetHref);
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
  function renderChatGroup(group, index, { chatApps = group.chatApps } = {}) {
    const isFullscreen = state.fullscreenGroupId === group.id;
    const frames = chatApps.map((chat) => renderChatFrame(group, chat));
    const isFrameLoading = activeFrameIsLoading(group);
    const activeFrame = frames.find((iframe) => iframe.classList.contains("active"));
    activeFrame?.setAttribute("aria-busy", String(isFrameLoading));
    const frameWrap = el("div", { class: "chat-frame-wrap" },
      frames,
      renderFrameLoadingStatus(activeFrame, isFrameLoading),
      renderPreferredModelSelectionOverlay()
    );
    syncFrameLoadingMask(activeFrame);
    return el("section", {
      class: `chat-card tab-group-buttons-custom ${isFullscreen ? "fullscreen" : ""} ${isFrameLoading ? "frame-loading" : ""}`.trim(),
      dataset: { groupId: group.id },
      style: { order: String(index + 1) }
    },
      el("div", { class: "chat-header" },
        el("div", { class: "chat-tabs" },
          chatApps.map((chat) => renderChatTab(group, chat)),
          tabGroupButtonIsPinned("addApp") ? renderTabAddButton(group) : null
        ),
        el("div", { class: "chat-actions" }, renderChatActionButtons(group))
      ),
      frameWrap
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
      : Math.min(1680, Math.max(880, window.innerWidth - 32));
    const left = Math.max(8, Math.min(rect.left - 28, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 88));
    picker.style.width = `${width}px`;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    picker.style.maxHeight = `${Math.max(180, window.innerHeight - top - 12)}px`;
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
      renderAppPickerColumns({
        sections: buildAppPickerSections({
          apps: allApps(),
          customConfig: state.customConfig,
          options: state.options
        }),
        onSelect,
        persistOrder: persistAppPickerOrder,
        openCustomAppEditor,
        closePopovers,
        inferAppName,
        appFaviconUrl,
        browserFaviconUrl,
        fallbackFaviconUrl,
        svgIcon
      })
    );
    document.body.append(backdrop, picker);
    positionAppPicker(anchor, picker);
    armWorkspacePopoverDismissal();
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
    armWorkspacePopoverDismissal();
  }

  function closePopoverOnKeydown(event) {
    if (claimTopmostPopoverEscape(event, ".workspace-popover-menu")) closePopovers();
  }

  function armWorkspacePopoverDismissal() {
    document.body.classList.add("workspace-popover-open");
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", closePopoverOnOutsideInteraction, true);
      document.addEventListener("focusin", closePopoverOnOutsideInteraction, true);
    });
    document.addEventListener("keydown", closePopoverOnKeydown, true);
    window.addEventListener("resize", closePopovers, true);
    window.addEventListener("scroll", closePopovers, true);
    window.addEventListener("blur", closePopoverOnWindowBlur, true);
  }

  function closePopoverOnWindowBlur() {
    scheduleFrameOwnedBlurDismissal(() => document.querySelector(".workspace-popover-menu"), closePopovers);
  }

  function closePopoverOnOutsideInteraction(event) {
    const menu = document.querySelector(".workspace-popover-menu");
    const anchor = document.querySelector(".workspace-popover-anchor");
    const target = event.target;
    if (menu?.contains(target) || anchor?.contains(target) || (event.type === "focusin" && isChatFrameNode(target))) return;
    closePopovers();
  }

  function closePopovers() {
    document.body.classList.remove("workspace-popover-open");
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
    window.removeEventListener("blur", closePopoverOnWindowBlur, true);
  }

  function closePopoversAnchoredWithin(root) {
    if (!workspacePopoverAnchor) return;
    if (!workspacePopoverAnchor.isConnected || root?.contains?.(workspacePopoverAnchor)) closePopovers();
  }

  function closeTransientOverlays() {
    closePopovers();
    closeTrackedMessageNavigatorMenu();
  }

  function openChatMenu(anchor, group, { showAllActions = false, targetChat = null } = {}) {
    if (anchor.classList.contains("workspace-popover-anchor") && document.querySelector(".workspace-popover-menu")) {
      closePopovers();
      return;
    }
    closePopovers();
    anchor.classList.add("popover-anchor", "workspace-popover-anchor");
    workspacePopoverAnchor = anchor;
    const rect = anchor.getBoundingClientRect();
    const { menuHeaderButtons, menuDangerButtons } = renderWorkspaceTabMenuItems({
      anchor,
      group,
      showAllActions,
      targetChat,
      state,
      activeChatForGroup,
      activeIframe,
      activateChatTab,
      fullscreenButtonMeta,
      messageNavigatorFrameEnabled,
      messageNavigatorPayloadForFrame,
      topicDeleteCapabilityForFrame,
      menuButton,
      openAppPicker,
      openChatInNewTab,
      copyActiveChatLink,
      openGoToUrlDialog,
      startNewChatInActiveTab,
      closePopovers,
      shortcutTooltip,
      renderRefreshPageMenuButton,
      reloadChat,
      toggleMessageNavigator,
      deleteActiveThreadForGroup,
      toggleFullscreen,
      removeChatGroup,
      closeTab,
      orderedTabGroupButtons,
      tabGroupButtonIsFolded
    });
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
      style: showAllActions
        ? { top: `${rect.bottom + 5}px`, left: `${Math.max(8, rect.left)}px` }
        : { top: `${rect.bottom + 5}px`, right: `${Math.max(8, window.innerWidth - rect.right)}px` },
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation()
    },
      menuHeaderButtons,
      menuHeaderButtons.length && menuDangerButtons.length ? el("div", { class: "menu-separator" }) : null,
      menuDangerButtons
    );
    menu.classList.toggle("tab-context-menu", showAllActions);
    document.body.append(backdrop, menu);
    if (showAllActions) {
      const menuRect = menu.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - menuRect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - menuRect.height - 8);
      menu.style.left = `${Math.min(Math.max(8, rect.left), maxLeft)}px`;
      menu.style.top = `${Math.min(Math.max(8, rect.bottom + 5), maxTop)}px`;
    }
    armWorkspacePopoverDismissal();
  }

  return Object.freeze({
    appendChatGroup,
    appendEmptyChatGroup,
    closePopovers,
    closePopoversAnchoredWithin,
    closeTransientOverlays,
    ensureFrameAttributeContract,
    frameAttributeContractMatches,
    fullscreenButtonMeta,
    openAppPicker,
    openChatMenu,
    openLayoutMenu,
    reconcileAppCatalogDom,
    refreshChatTabPresentations,
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
