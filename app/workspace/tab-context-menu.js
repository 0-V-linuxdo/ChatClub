import { TAB_CONTEXT_MENU_ITEMS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { normalizeTabContextMenuHiddenIds, normalizeTabContextMenuOrder } from "../../shared/storage-schema.js";

export function renderWorkspaceTabMenuItems({
  anchor,
  group,
  showAllActions = false,
  targetChat = null,
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
}) {
  const requestedChat = group?.chatApps?.find((chat) => chat.instanceId === targetChat?.instanceId);
  const menuTargetChat = requestedChat || activeChatForGroup(group);
  if (showAllActions && menuTargetChat) activateChatTab(group, menuTargetChat.instanceId);
  const { fullscreenLabel, fullscreenTooltipLabel, icon: fullscreenIcon } = fullscreenButtonMeta(group);
  const activeChat = activeChatForGroup(group);
  const activeFrame = activeIframe(activeChat);
  const activeFallback = { appId: activeChat?.appId || "" };
  const messageNavigatorDisabled = !messageNavigatorFrameEnabled(activeFrame)
    && !messageNavigatorPayloadForFrame(activeFrame, "", activeFallback);
  const deleteThreadDisabled = !topicDeleteCapabilityForFrame(activeFrame, activeFallback).available;
  const menuButtonById = {
    addApp: () => menuButton(
      t("chat.addApp"), "plus", () => openAppPicker(anchor, { group }),
      "secondary", false, t("chat.addApp"), "", "workspace.group.addApp"
    ),
    openInNewTab: () => menuButton(
      t("common.openInNewTab"), "external", () => openChatInNewTab(group),
      "secondary", false, t("common.openInNewTab"), "", "workspace.group.openInNewTab"
    ),
    copyLink: () => menuButton(
      t("common.copyLink"), "copy", () => copyActiveChatLink(group),
      "secondary", false, t("common.copyLink"), "", "workspace.group.copyLink"
    ),
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
    }, "danger", state.groups.length <= 1, shortcutTooltip(t("chat.removeGroup"), "closeChat"), "left", "workspace.group.remove"),
    closeTab: () => menuTargetChat ? menuButton(t("chat.closeTab"), "x", () => {
      closePopovers();
      return closeTab(group, menuTargetChat);
    }, "danger", false, t("chat.closeTab"), "left", "workspace.tab.context.close") : null
  };
  const menuItems = showAllActions
    ? normalizeTabContextMenuOrder(state.options?.tabContextMenuOrder)
      .map((id) => TAB_CONTEXT_MENU_ITEMS.find((item) => item.id === id))
      .filter(Boolean)
    : orderedTabGroupButtons().filter((item) => tabGroupButtonIsFolded(item.id));
  const hiddenContextMenuItems = new Set(
    normalizeTabContextMenuHiddenIds(state.options?.tabContextMenuHiddenIds)
  );
  const availableMenuButtons = menuItems
    .filter((item) => !showAllActions || !hiddenContextMenuItems.has(item.id))
    .map((item) => ({ item, node: menuButtonById[item.id]?.() }))
    .filter((entry) => entry.node && !entry.node.disabled);
  const menuHeaderButtons = availableMenuButtons
    .filter((entry) => !entry.item.danger)
    .map((entry) => entry.node);
  const menuDangerButtons = availableMenuButtons
    .filter((entry) => entry.item.danger)
    .map((entry) => entry.node);
  return { menuHeaderButtons, menuDangerButtons };
}
