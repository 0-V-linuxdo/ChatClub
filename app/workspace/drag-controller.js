import {
  moveDroppedGroupWithinWorkspace,
  moveGroupWithinWorkspace,
  moveTabWithinGroup
} from "./model.js";
import { validateControllerContract } from "../controller-contract.js";

const DRAG_TAB_MIME = "application/x-chatclub-tab";
const DRAG_TAB_GROUP_MIME = "application/x-chatclub-tab-group";
const DRAG_GROUP_MIME = "application/x-chatclub-group";
const TAB_DRAG_START_DISTANCE = 6;
const GROUP_DRAG_START_DISTANCE = 6;

export function createWorkspaceDragController(dependencies = {}) {
  const {
    state,
    persistLayout,
    syncGroupTabOrder,
    activateChatTab,
    syncWorkspaceDom
  } = validateControllerContract(dependencies, "Workspace drag controller", {
    state: "object",
    persistLayout: "function",
    syncGroupTabOrder: "function",
    activateChatTab: "function",
    syncWorkspaceDom: "function"
  });

  let activeTabDrag = null;
  let activeTabPointerDrag = null;
  let activeGroupPointerDrag = null;
  let suppressTabClickInstanceId = "";

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
    const index = state.groups.findIndex((item) => item.id === group.id);
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

  function consumeSuppressedTabClick(instanceId) {
    if (!instanceId || suppressTabClickInstanceId !== instanceId) return false;
    suppressTabClickInstanceId = "";
    return true;
  }

  return Object.freeze({
    cleanupGroupDragState,
    consumeSuppressedTabClick,
    draggedGroupId,
    draggedTabId,
    moveGroupByDrop,
    moveTabByDrop,
    previewTabDrop,
    startTabDrag,
    startTabPointerDrag
  });
}
