import {
  moveGroupWithinWorkspace,
  moveTabBetweenGroups,
  moveTabWithinGroup
} from "./model.js";
import { validateControllerContract } from "../controller-contract.js";

const TAB_DRAG_START_DISTANCE = 6;
const TAB_GROUP_HIT_SLOP = 6;
const ADD_GROUP_DROP_SELECTOR = '[data-tooltip-id="topbar.addGroup"]';

export function createWorkspaceDragController(dependencies = {}) {
  const {
    state,
    createGroupId,
    persistLayout,
    appendEmptyChatGroup,
    syncGroupTabOrder,
    activateChatTab,
    syncWorkspaceDom,
    syncGridColumnClass,
    syncFullscreenLayout
  } = validateControllerContract(dependencies, "Workspace drag controller", {
    state: "object",
    createGroupId: "function",
    persistLayout: "function",
    appendEmptyChatGroup: "function",
    syncGroupTabOrder: "function",
    activateChatTab: "function",
    syncWorkspaceDom: "function",
    syncGridColumnClass: "function",
    syncFullscreenLayout: "function"
  });

  let activeTabPointerDrag = null;
  let suppressTabClickInstanceId = "";

  function canonicalGroup(groupId) {
    return state.groups.find((group) => group.id === groupId) || null;
  }

  function groupCard(groupId) {
    return Array.from(document.querySelectorAll(".chat-card[data-group-id]"))
      .find((card) => card.dataset.groupId === groupId) || null;
  }

  function instanceNode(selector, instanceId, root = document) {
    return Array.from(root.querySelectorAll(selector))
      .find((node) => node.dataset.instanceId === instanceId) || null;
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

  function removeTabPointerDragListeners() {
    document.removeEventListener("pointermove", handleTabPointerMove, true);
    document.removeEventListener("pointerup", handleTabPointerUp, true);
    document.removeEventListener("pointercancel", cancelTabPointerDrag, true);
    removeTabNativeSelectionGuards();
  }

  function clearDropPreview() {
    document.querySelectorAll(".chat-card.group-dragging, .chat-card.group-drop-before, .chat-card.group-drop-after").forEach((node) => {
      node.classList.remove("group-dragging", "group-drop-before", "group-drop-after");
    });
    document.querySelectorAll(".chat-tabs.tab-drop-target").forEach((node) => node.classList.remove("tab-drop-target"));
    document.querySelectorAll(".tab.drop-before, .tab.drop-after").forEach((node) => {
      node.classList.remove("drop-before", "drop-after");
    });
    document.querySelectorAll(`${ADD_GROUP_DROP_SELECTOR}.tab-new-group-drop-target`).forEach((node) => {
      node.classList.remove("tab-new-group-drop-target");
    });
  }

  function cleanupDragState() {
    removeTabPointerDragListeners();
    restoreIframePointerEventsForDrag();
    document.body.classList.remove("tab-dragging", "tab-gesture-active");
    clearDropPreview();
    document.querySelectorAll(".tab.dragging").forEach((node) => node.classList.remove("dragging"));
    activeTabPointerDrag = null;
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

  function rectContainsPoint(rect, clientX, clientY, slop = 0) {
    return clientX >= rect.left - slop
      && clientX <= rect.right + slop
      && clientY >= rect.top - slop
      && clientY <= rect.bottom + slop;
  }

  function addGroupDropTarget(clientX, clientY) {
    return Array.from(document.querySelectorAll(ADD_GROUP_DROP_SELECTOR))
      .find((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rectContainsPoint(rect, clientX, clientY);
      }) || null;
  }

  function tabGroupDropTarget(clientX, clientY) {
    for (const group of state.groups) {
      const card = groupCard(group.id);
      const header = card?.querySelector(".chat-header");
      const tabs = card?.querySelector(".chat-tabs");
      const rect = header?.getBoundingClientRect();
      if (
        tabs
        && rect
        && clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top - TAB_GROUP_HIT_SLOP
        && clientY <= rect.bottom + TAB_GROUP_HIT_SLOP
      ) {
        return { group, card, tabs };
      }
    }
    return null;
  }

  function tabDropTargetFromClientX(clientX, groupId) {
    const card = groupCard(groupId);
    const tabs = Array.from(card?.querySelectorAll(".tab[data-instance-id]") || []);
    if (!tabs.length) return { tab: null, insertIndex: 0, after: false };
    for (const [index, tab] of tabs.entries()) {
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { tab, insertIndex: index, after: false };
      if (clientX < rect.right) return { tab, insertIndex: index + 1, after: true };
    }
    return { tab: tabs[tabs.length - 1], insertIndex: tabs.length, after: true };
  }

  function groupDropTargetFromClientX(clientX) {
    const cards = state.groups.map((group) => groupCard(group.id)).filter(Boolean);
    if (!cards.length) return { card: null, insertIndex: 0, after: false };
    for (const [index, card] of cards.entries()) {
      const rect = card.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { card, insertIndex: index, after: false };
      if (clientX < rect.right) return { card, insertIndex: index + 1, after: true };
    }
    return { card: cards[cards.length - 1], insertIndex: cards.length, after: true };
  }

  function startTabPointerDrag(event, sourceGroupId, instanceId) {
    if (event.button !== 0 || event.target?.closest?.(".tab-close")) return;
    const group = canonicalGroup(sourceGroupId);
    const chatIndex = group?.chatApps?.findIndex((chat) => chat.instanceId === instanceId) ?? -1;
    if (!group || chatIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    globalThis.getSelection?.()?.removeAllRanges?.();
    removeTabPointerDragListeners();
    addTabNativeSelectionGuards();
    document.body.classList.add("tab-gesture-active");
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    activeTabPointerDrag = {
      sourceGroupId,
      instanceId,
      startX: event.clientX,
      startY: event.clientY,
      insertIndex: chatIndex,
      targetGroupId: sourceGroupId,
      mode: null,
      tab: event.currentTarget,
      started: false,
      singleTab: group.chatApps.length === 1
    };
    document.addEventListener("pointermove", handleTabPointerMove, true);
    document.addEventListener("pointerup", handleTabPointerUp, true);
    document.addEventListener("pointercancel", cancelTabPointerDrag, true);
  }

  function beginTabPointerDrag(drag) {
    if (drag.started) return;
    drag.started = true;
    suspendIframePointerEventsForDrag();
    document.body.classList.add("tab-dragging");
    drag.tab?.classList?.add("dragging");
  }

  function updateTabPointerDropPreview(drag, clientX, clientY) {
    clearDropPreview();
    const newGroupButton = addGroupDropTarget(clientX, clientY);
    if (newGroupButton) {
      drag.mode = "new-group";
      drag.targetGroupId = "";
      drag.insertIndex = 0;
      newGroupButton.classList.add("tab-new-group-drop-target");
      return;
    }

    const groupTarget = tabGroupDropTarget(clientX, clientY);
    if (groupTarget) {
      const target = tabDropTargetFromClientX(clientX, groupTarget.group.id);
      drag.mode = "tab";
      drag.targetGroupId = groupTarget.group.id;
      drag.insertIndex = target.insertIndex;
      groupTarget.tabs.classList.add("tab-drop-target");
      if (target.tab && target.tab !== drag.tab) {
        target.tab.classList.add(target.after ? "drop-after" : "drop-before");
      }
      return;
    }

    if (drag.singleTab && state.groups.length > 1) {
      const target = groupDropTargetFromClientX(clientX);
      drag.mode = "group";
      drag.targetGroupId = "";
      drag.insertIndex = target.insertIndex;
      groupCard(drag.sourceGroupId)?.classList.add("group-dragging");
      if (target.card && target.card.dataset.groupId !== drag.sourceGroupId) {
        target.card.classList.add(target.after ? "group-drop-after" : "group-drop-before");
      }
      return;
    }

    drag.mode = null;
    drag.targetGroupId = "";
  }

  function handleTabPointerMove(event) {
    const drag = activeTabPointerDrag;
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < TAB_DRAG_START_DISTANCE) return;
    event.preventDefault();
    beginTabPointerDrag(drag);
    updateTabPointerDropPreview(drag, event.clientX, event.clientY);
  }

  function moveNodeToParent(parent, node, before = null) {
    if (typeof parent.moveBefore === "function") {
      parent.moveBefore(node, before);
      return;
    }
    // Older packaged baselines do not expose moveBefore(). Reusing the exact
    // node preserves identity, though those engines may reload a moved iframe.
    parent.insertBefore(node, before);
  }

  function transferTabDom(sourceGroupId, targetGroupId, instanceId, targetIndex) {
    const sourceCard = groupCard(sourceGroupId);
    const targetCard = groupCard(targetGroupId);
    const sourceTabs = sourceCard?.querySelector(".chat-tabs");
    const targetTabs = targetCard?.querySelector(".chat-tabs");
    const sourceFrames = sourceCard?.querySelector(".chat-frame-wrap");
    const targetFrames = targetCard?.querySelector(".chat-frame-wrap");
    const tab = sourceTabs && instanceNode(".tab[data-instance-id]", instanceId, sourceTabs);
    const iframe = sourceFrames && instanceNode(".chat-frame[data-instance-id]", instanceId, sourceFrames);
    if (!sourceTabs || !targetTabs || !sourceFrames || !targetFrames || !tab || !iframe) return null;
    const targetTabNodes = Array.from(targetTabs.querySelectorAll(".tab[data-instance-id]"));
    const tabBefore = targetTabNodes[Math.max(0, Math.min(targetIndex, targetTabNodes.length))]
      || targetTabs.querySelector(".tab-add")
      || null;
    const frameBefore = targetFrames.querySelector(".chat-frame-loading-status") || null;
    const sourceTabBefore = tab.nextSibling || null;
    const sourceFrameBefore = iframe.nextSibling || null;
    let tabMoved = false;
    let frameMoved = false;
    const validReference = (parent, node) => node
      && (node.parentNode === parent || node.parentElement === parent)
      ? node
      : null;
    const rollback = () => {
      if (tabMoved) moveNodeToParent(sourceTabs, tab, validReference(sourceTabs, sourceTabBefore));
      if (frameMoved) moveNodeToParent(sourceFrames, iframe, validReference(sourceFrames, sourceFrameBefore));
      tabMoved = false;
      frameMoved = false;
    };
    try {
      moveNodeToParent(targetTabs, tab, tabBefore);
      tabMoved = true;
      moveNodeToParent(targetFrames, iframe, frameBefore);
      frameMoved = true;
    } catch (error) {
      try {
        rollback();
      } catch {}
      throw error;
    }
    return { rollback };
  }

  async function moveTabToIndex(groupId, tabId, insertIndex) {
    const group = canonicalGroup(groupId);
    const result = moveTabWithinGroup(state.groups, groupId, tabId, insertIndex);
    if (!group || !result.moved) return false;
    cleanupDragState();
    syncGroupTabOrder(group);
    if (result.noop) return true;
    state.activeTabs[group.id] = result.moved.instanceId;
    activateChatTab(group, result.moved.instanceId);
    await persistLayout();
    return true;
  }

  async function moveTabToGroup(sourceGroupId, targetGroupId, tabId, insertIndex) {
    const sourceGroup = canonicalGroup(sourceGroupId);
    const targetGroup = canonicalGroup(targetGroupId);
    if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) return false;
    const sourceIndex = sourceGroup.chatApps.findIndex((chat) => chat.instanceId === tabId);
    if (sourceIndex < 0 || targetGroup.chatApps.some((chat) => chat.instanceId === tabId)) return false;
    const requestedIndex = Number(insertIndex);
    const targetIndex = Number.isFinite(requestedIndex)
      ? Math.max(0, Math.min(Math.trunc(requestedIndex), targetGroup.chatApps.length))
      : targetGroup.chatApps.length;
    const domTransfer = transferTabDom(sourceGroupId, targetGroupId, tabId, targetIndex);
    if (!domTransfer) return false;
    let result;
    try {
      result = moveTabBetweenGroups(
        state.groups,
        state.activeTabs,
        sourceGroupId,
        targetGroupId,
        tabId,
        targetIndex
      );
    } catch (error) {
      domTransfer.rollback();
      throw error;
    }
    if (!result.changed) {
      domTransfer.rollback();
      return false;
    }
    if (result.sourceGroupRemoved) groupCard(sourceGroupId)?.remove();
    else activateChatTab(result.sourceGroup, result.sourceActiveId, result.previousSourceActiveId);
    activateChatTab(result.targetGroup, result.targetActiveId, result.previousTargetActiveId);
    cleanupDragState();
    syncGridColumnClass();
    syncFullscreenLayout();
    await persistLayout();
    return true;
  }

  function createDraggedTabGroup(sourceGroupId) {
    const sourceGroup = canonicalGroup(sourceGroupId);
    if (!sourceGroup) return null;
    const groupId = createGroupId();
    if (!groupId || canonicalGroup(groupId)) return null;
    const group = {
      id: groupId,
      ...(sourceGroup.temporary ? {
        temporary: true,
        pocketBatchId: sourceGroup.pocketBatchId || ""
      } : {}),
      chatApps: []
    };
    state.groups.push(group);
    const rollback = () => {
      groupCard(group.id)?.remove();
      const groupIndex = state.groups.findIndex((item) => item.id === group.id);
      if (groupIndex >= 0) state.groups.splice(groupIndex, 1);
      delete state.activeTabs[group.id];
    };
    try {
      const card = appendEmptyChatGroup(group);
      if (card) return group;
      rollback();
      return null;
    } catch (error) {
      rollback();
      throw error;
    }
  }

  async function moveTabToNewGroup(sourceGroupId, tabId) {
    const targetGroup = createDraggedTabGroup(sourceGroupId);
    if (!targetGroup) return false;
    const discardEmptyTarget = () => {
      if (targetGroup.chatApps.length) return false;
      groupCard(targetGroup.id)?.remove();
      const targetIndex = state.groups.findIndex((group) => group.id === targetGroup.id);
      if (targetIndex >= 0) state.groups.splice(targetIndex, 1);
      delete state.activeTabs[targetGroup.id];
      syncGridColumnClass();
      syncFullscreenLayout();
      return true;
    };
    try {
      const moved = await moveTabToGroup(sourceGroupId, targetGroup.id, tabId, 0);
      if (moved) return true;
      discardEmptyTarget();
      return false;
    } catch (error) {
      discardEmptyTarget();
      throw error;
    }
  }

  async function moveGroupToIndex(groupId, insertIndex) {
    const result = moveGroupWithinWorkspace(state.groups, groupId, insertIndex);
    if (!result.moved) return false;
    cleanupDragState();
    syncWorkspaceDom();
    if (result.noop) return true;
    await persistLayout();
    return true;
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
    const operation = drag.mode === "new-group"
      ? moveTabToNewGroup(drag.sourceGroupId, drag.instanceId)
      : drag.mode === "tab" && drag.targetGroupId !== drag.sourceGroupId
        ? moveTabToGroup(drag.sourceGroupId, drag.targetGroupId, drag.instanceId, drag.insertIndex)
        : drag.mode === "tab"
          ? moveTabToIndex(drag.sourceGroupId, drag.instanceId, drag.insertIndex)
          : drag.mode === "group"
            ? moveGroupToIndex(drag.sourceGroupId, drag.insertIndex)
            : Promise.resolve(false);
    operation.then((moved) => {
      if (!moved) cleanupDragState();
    }).catch((error) => {
      cleanupDragState();
      console.warn("[ChatClub] Failed to move dragged tab", error);
    });
  }

  function cancelTabPointerDrag() {
    cleanupDragState();
  }

  function consumeSuppressedTabClick(instanceId) {
    if (!instanceId || suppressTabClickInstanceId !== instanceId) return false;
    suppressTabClickInstanceId = "";
    return true;
  }

  return Object.freeze({
    consumeSuppressedTabClick,
    startTabPointerDrag
  });
}
