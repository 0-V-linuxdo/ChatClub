import { t } from "../../shared/i18n.js";
import { findMessageNavigatorSiteConfig } from "../../shared/message-navigator-sites.js";
import { isDismissalEscape } from "../../ui/dom.js";
import { validateControllerContract } from "../controller-contract.js";

export function createWorkspaceMessageNavigatorController(dependencies = {}) {
  const {
    state,
    appById,
    openableTabUrl,
    knownNoConversationPage,
    sendToContentFrame,
    activeChatForGroup,
    activeIframe,
    activeHref,
    activeShortcutGroupId,
    notify,
    syncWorkspaceDom,
    closePopovers
  } = validateControllerContract(dependencies, "Workspace Message Navigator controller", {
    state: "object",
    appById: "function",
    openableTabUrl: "function",
    knownNoConversationPage: "function",
    sendToContentFrame: "function",
    activeChatForGroup: "function",
    activeIframe: "function",
    activeHref: "function",
    activeShortcutGroupId: "function",
    notify: "function",
    syncWorkspaceDom: "function",
    closePopovers: "function"
  });

  let messageNavigatorMenuIframe = null;

  function messageNavigatorFrameEnabled(iframe) {
    return iframe?.dataset.messageNavigatorEnabled === "1";
  }

  function clearMessageNavigatorMenuOutsideClose() {
    messageNavigatorMenuIframe = null;
    document.removeEventListener("pointerdown", closeMessageNavigatorMenuOnParentPointerDown, true);
    document.removeEventListener("keydown", closeMessageNavigatorMenuOnParentKeydown, true);
  }

  function messageNavigatorActionTarget(target) {
    return target instanceof Element
      ? target.closest("[data-tooltip-id='workspace.group.messageNavigator']")
      : null;
  }

  function armMessageNavigatorMenuOutsideClose(iframe) {
    clearMessageNavigatorMenuOutsideClose();
    if (!iframe) return;
    messageNavigatorMenuIframe = iframe;
    requestAnimationFrame(() => {
      if (messageNavigatorMenuIframe !== iframe) return;
      document.addEventListener("pointerdown", closeMessageNavigatorMenuOnParentPointerDown, true);
      document.addEventListener("keydown", closeMessageNavigatorMenuOnParentKeydown, true);
    });
  }

  function hideMessageNavigatorMenuForFrame(iframe) {
    if (!iframe?.contentWindow) return Promise.resolve(null);
    return sendToContentFrame(iframe, "hideMessageNavigatorMenu", {}, 2000).catch((error) => {
      console.warn("[ChatClub] Failed to hide message navigator menu", error);
      return null;
    });
  }

  function closeTrackedMessageNavigatorMenu() {
    const iframe = messageNavigatorMenuIframe;
    clearMessageNavigatorMenuOutsideClose();
    if (iframe?.isConnected && messageNavigatorFrameEnabled(iframe)) hideMessageNavigatorMenuForFrame(iframe);
  }

  function hasTrackedMessageNavigatorMenu() {
    return Boolean(messageNavigatorMenuIframe?.isConnected);
  }

  async function dismissTrackedMessageNavigatorMenu() {
    const iframe = messageNavigatorMenuIframe;
    if (!iframe?.isConnected || !messageNavigatorFrameEnabled(iframe)) {
      clearMessageNavigatorMenuOutsideClose();
      return false;
    }
    try {
      const result = await sendToContentFrame(iframe, "getMessageNavigatorState", {}, 2000);
      if (messageNavigatorMenuIframe !== iframe) return true;
      if (result?.menuOpen === false) {
        clearMessageNavigatorMenuOutsideClose();
        return false;
      }
      clearMessageNavigatorMenuOutsideClose();
      await hideMessageNavigatorMenuForFrame(iframe);
      return true;
    } catch {
      if (messageNavigatorMenuIframe === iframe) closeTrackedMessageNavigatorMenu();
      return true;
    }
  }

  function closeMessageNavigatorMenuOnParentPointerDown(event) {
    if (messageNavigatorActionTarget(event.target)) return;
    closeTrackedMessageNavigatorMenu();
  }

  function closeMessageNavigatorMenuOnParentKeydown(event) {
    if (!isDismissalEscape(event)) return;
    if (document.querySelector(".modal-backdrop, .popover-menu")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dismissTrackedMessageNavigatorMenu().catch(() => {});
  }

  function messageNavigatorPayloadForFrame(iframe, href = "", fallback = {}) {
    const appId = iframe?.dataset.appId || fallback.appId || "";
    const app = appById(appId) || {};
    const currentHref = openableTabUrl(href)
      || openableTabUrl(fallback.currentHref || fallback.href || fallback.url)
      || openableTabUrl(iframe?.dataset.currentHref)
      || openableTabUrl(iframe?.src || iframe?.getAttribute?.("src"))
      || openableTabUrl(app.url);
    const payload = {
      appId,
      appName: app.name || appId,
      currentHref
    };
    const config = findMessageNavigatorSiteConfig(state.options?.messageNavigatorSiteConfigs, payload);
    if (!config || config.enabled === false || knownNoConversationPage(config, payload)) return null;
    return {
      enabled: true,
      config,
      currentHref,
      options: {
        effectMode: state.options?.messageNavigatorEffectMode || "border",
        primaryColor: state.options?.primaryColor || "#1f7a5f"
      }
    };
  }

  async function setMessageNavigatorForFrame(iframe, enabled, payload = null) {
    const data = enabled ? payload : { enabled: false };
    return sendToContentFrame(iframe, "setMessageNavigator", data, 6000);
  }

  async function toggleMessageNavigator(group) {
    const chat = activeChatForGroup(group);
    const iframe = activeIframe(chat);
    if (!iframe) {
      notify(t("messageNavigator.noIframe"), "error");
      closePopovers();
      return;
    }
    if (messageNavigatorFrameEnabled(iframe)) {
      clearMessageNavigatorMenuOutsideClose();
      iframe.dataset.messageNavigatorEnabled = "0";
      iframe.dataset.messageNavigatorSiteId = "";
      try { await setMessageNavigatorForFrame(iframe, false); } catch {}
      syncWorkspaceDom();
      closePopovers();
      return;
    }
    const href = await activeHref(chat);
    const payload = messageNavigatorPayloadForFrame(iframe, href);
    if (!payload) {
      notify(t("messageNavigator.unsupported"), "error");
      closePopovers();
      return;
    }
    try {
      const result = await setMessageNavigatorForFrame(iframe, true, { ...payload, openMenu: true });
      iframe.dataset.messageNavigatorEnabled = "1";
      iframe.dataset.messageNavigatorSiteId = payload.config.id || "";
      syncWorkspaceDom();
      closePopovers();
      armMessageNavigatorMenuOutsideClose(iframe);
      if (result?.messageCount === 0) notify(t("messageNavigator.noMessages"), "info");
    } catch (error) {
      clearMessageNavigatorMenuOutsideClose();
      iframe.dataset.messageNavigatorEnabled = "0";
      iframe.dataset.messageNavigatorSiteId = "";
      syncWorkspaceDom();
      closePopovers();
      console.warn("[ChatClub] Message navigator failed", error);
      notify(t("messageNavigator.failed"), "error");
    }
  }

  async function toggleMessageNavigatorForShortcut(sourceWindow = null) {
    const groupId = activeShortcutGroupId(sourceWindow);
    const group = state.groups.find((item) => item.id === groupId) || state.groups[0];
    if (!group) {
      notify(t("messageNavigator.noIframe"), "error");
      return;
    }
    await toggleMessageNavigator(group);
  }

  async function reapplyMessageNavigatorForFrame(iframe) {
    if (!messageNavigatorFrameEnabled(iframe)) return;
    const payload = messageNavigatorPayloadForFrame(iframe);
    if (!payload) {
      iframe.dataset.messageNavigatorEnabled = "0";
      iframe.dataset.messageNavigatorSiteId = "";
      syncWorkspaceDom();
      return;
    }
    try {
      await setMessageNavigatorForFrame(iframe, true, payload);
      iframe.dataset.messageNavigatorSiteId = payload.config.id || "";
      syncWorkspaceDom();
    } catch (error) {
      console.warn("[ChatClub] Failed to reapply message navigator", error);
    }
  }

  return Object.freeze({
    closeTrackedMessageNavigatorMenu,
    dismissTrackedMessageNavigatorMenu,
    hasTrackedMessageNavigatorMenu,
    messageNavigatorFrameEnabled,
    messageNavigatorPayloadForFrame,
    reapplyMessageNavigatorForFrame,
    toggleMessageNavigator,
    toggleMessageNavigatorForShortcut
  });
}
