#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lineCount = (source) => source.split(/\r?\n/).length;

(async () => {
  const workspace = read("app/workspace/controller.js");
  const appHosts = read("app/workspace/app-hosts.js");
  const drag = read("app/workspace/drag-controller.js");
  const navigator = read("app/workspace/message-navigator-controller.js");
  const frame = read("app/workspace/frame-controller.js");
  const layout = read("app/workspace/layout-controller.js");
  const pocket = read("app/workspace/pocket-controller.js");
  const session = read("app/workspace/session-controller.js");
  const statePorts = read("app/workspace/state-ports.js");
  const view = read("app/workspace/view-controller.js");
  const picker = read("app/workspace/app-picker.js");

  assert.ok(lineCount(workspace) < 1200, "Workspace facade must remain assembly-only and need no size exception");
  assert.ok(lineCount(drag) > 250, "pointer drag coordinator must remain a substantive lifecycle boundary");
  assert.ok(lineCount(navigator) > 180, "Message Navigator controller must remain a substantive lifecycle boundary");
  assert.ok(lineCount(frame) > 700 && lineCount(frame) < 1250, "frame lifecycle/navigation must remain a substantive bounded owner");
  assert.ok(lineCount(layout) > 250, "layout/catalog reconciliation must remain a substantive owner");
  assert.ok(lineCount(view) > 700 && lineCount(view) < 1200, "Workspace rendering and menus must remain a bounded owner");
  assert.ok(lineCount(pocket) > 150, "Pocket restore must remain a substantive owner");
  assert.ok(lineCount(session) > 60, "session persistence must remain an explicit owner");
  assert.match(workspace, /createWorkspaceDragController\(\{/);
  assert.match(workspace, /createWorkspaceMessageNavigatorController\(\{/);
  assert.match(workspace, /createWorkspaceFrameController\(\{/);
  assert.match(workspace, /createWorkspaceLayoutController\(\{/);
  assert.match(workspace, /createWorkspacePocketController\(\{/);
  assert.match(workspace, /createWorkspaceViewController\(\{/);
  assert.match(workspace, /createWorkspaceOwnerStatePorts\(state\)/);
  assert.match(workspace, /createBindOnceControllerPort\("Workspace frame"/);
  const quotedNames = (block) => [...String(block || "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const assertPortCoversView = (relationship, portName) => {
    const required = quotedNames(view.match(new RegExp(`requireMethods\\(${relationship}, "[^"]+", \\[([\\s\\S]*?)\\]\\)`))?.[1]);
    const port = new Set(quotedNames(workspace.match(new RegExp(`createBindOnceControllerPort\\("${portName}", \\[([\\s\\S]*?)\\]\\)`))?.[1]));
    assert.ok(required.length, `view must require ${relationship} methods`);
    for (const method of required) {
      assert.ok(port.has(method), `${portName} port must expose view-required ${method}()`);
    }
  };
  assertPortCoversView("layout", "Workspace layout");
  assertPortCoversView("frame", "Workspace frame");
  assertPortCoversView("pocket", "Workspace Pocket");
  assert.doesNotMatch(workspace, /function handleTabPointerMove\(/);
  assert.doesNotMatch(workspace, /function closeMessageNavigatorMenuOnParentKeydown\(/);
  assert.doesNotMatch(workspace, /let messageNavigatorMenuIframe/);
  assert.doesNotMatch(workspace, /function renderChatFrame\(/);
  assert.doesNotMatch(workspace, /function rememberFrameLocation\(/);
  assert.doesNotMatch(workspace, /function restorePocketBatch\(/);
  assert.match(appHosts, /export function appPickerHostKeys\(app\)/);
  assert.match(pocket, /import \{ appPickerHostKeys, normalizeAppPickerHost \} from "\.\/app-hosts\.js"/);
  assert.match(picker, /import \{ appPickerHostKeys \} from "\.\/app-hosts\.js"/);
  assert.doesNotMatch(pocket, /function appPickerHostKeys\(/);
  assert.doesNotMatch(view, /function appPickerHostKeys\(/);
  assert.doesNotMatch(view, /APP_PICKER_AGGREGATOR_IDS/);
  assert.match(view, /import \{ buildAppPickerSections, renderAppPickerColumns \} from "\.\/app-picker\.js"/);
  assert.match(picker, /APP_PICKER_AGGREGATOR_IDS/);
  assert.match(picker, /persistOrder/);
  assert.doesNotMatch(view, /APP_PICKER_FORCE_INTERNATIONAL_HOSTS/);

  assert.match(drag, /validateControllerContract\(dependencies, "Workspace drag controller"/);
  assert.match(drag, /moveTabWithinGroup\(state\.groups, groupId, tabId, insertIndex\)/);
  assert.match(drag, /moveTabBetweenGroups\(/);
  assert.match(drag, /moveGroupWithinWorkspace\(state\.groups, groupId, insertIndex\)/);
  assert.match(drag, /const ADD_GROUP_DROP_SELECTOR = '\[data-tooltip-id="topbar\.addGroup"\]'/);
  assert.match(drag, /typeof parent\.moveBefore === "function"/);
  assert.match(drag, /iframe\.dataset\.dragPointerEvents/);
  assert.match(drag, /document\.removeEventListener\("pointercancel", cancelTabPointerDrag, true\)/);
  assert.match(drag, /consumeSuppressedTabClick/);
  assert.doesNotMatch(drag, /dataTransfer|DRAG_(?:TAB|GROUP)_MIME|moveDroppedGroupWithinWorkspace/);
  assert.doesNotMatch(view, /ondragover|ondragleave|ondrop/);
  assert.doesNotMatch(drag, /deleteThread|executeTopicDelete|frameBindingId/);
  assert.match(view, /ids\.every\(\(id, index\) => tabs\[index\]\?\.dataset\.instanceId === id\)/);
  assert.match(view, /function syncWorkspaceTabOrder\(\) \{[\s\S]*?syncGroupTabOrder\(group\)/);
  assert.match(view, /function syncWorkspaceDom\(\) \{\s*syncWorkspaceTabOrder\(\)/);
  assert.match(view, /startTabPointerDrag\(event, currentLocation\(\)\?\.group\?\.id, chat\.instanceId\)/);

  assert.match(navigator, /validateControllerContract\(dependencies, "Workspace Message Navigator controller"/);
  assert.match(navigator, /sendToContentFrame\(iframe, "setMessageNavigator"/);
  assert.match(navigator, /sendToContentFrame\(iframe, "getMessageNavigatorState"/);
  assert.match(navigator, /sendToContentFrame\(iframe, "hideMessageNavigatorMenu"/);
  assert.match(navigator, /document\.querySelector\("\.modal-backdrop, \.popover-menu"\)/);
  assert.doesNotMatch(navigator, /deleteThread|executeTopicDelete|trustedInput/);

  assert.match(frame, /function frameDeleteThreadPayload\(/, "Delete identity payload must remain in the frame owner");
  assert.doesNotMatch(frame, /function chatFrame(?:Allow|NeedsSandbox|Sandbox)\(/, "legacy iframe attribute wrappers must not shadow the canonical contract");
  assert.doesNotMatch(workspace, /"(?:beginFrameLoading|chatFrameAllow|chatFrameNeedsSandbox|chatFrameSandbox|currentFullscreenGroup|currentGroupIndex|frameDeleteThreadPayload|frameIsLoading)"/);
  assert.match(frame, /function consumeFrameInitialHref\(instanceId\)/, "one-shot restored href mutation must remain in the frame state owner");
  assert.match(frame, /function stageFrameInitialHref\(instanceId, href\)/, "targeted frame replacement href staging must remain in the frame state owner");
  assert.match(frame, /executeTopicDelete\(iframe, payload, deleteSiteConfig, timeoutMs\)/);
  assert.match(layout, /function addAppToGroup\(groupId, appId\)/, "workspace membership mutation must remain in the layout state owner");
  assert.match(view, /const dataset = \{[\s\S]*?instanceId: chat\.instanceId,[\s\S]*?frameBindingId,[\s\S]*?iframeAttributeContract:/, "iframe binding identity and attribute contract must be recorded together");
  assert.doesNotMatch(view, /delete chat\.initialHref/, "the read-only render owner must not mutate restored frame state");
  assert.doesNotMatch(view, /group\.chatApps\.push\(/, "the read-only render owner must not mutate workspace membership");
  assert.match(statePorts, /drag:[\s\S]*read: \["activeTabs", "groups"\]/);
  assert.match(statePorts, /messageNavigator:[\s\S]*read: \["groups", "officialRulesActivationRevision", "options"\]/);
  assert.doesNotMatch(drag, /state\.options|state\.fullscreenGroupId/);
  assert.doesNotMatch(navigator, /state\.activeTabs|state\.frameLoadingInstanceIds/);

  const { createWorkspaceDragController } = await import(
    pathToFileURL(path.join(root, "app/workspace/drag-controller.js")).href
  );
  const { createWorkspaceStatePort } = await import(
    pathToFileURL(path.join(root, "app/workspace/state-port.js")).href
  );
  const { createWorkspaceOwnerStatePorts } = await import(
    pathToFileURL(path.join(root, "app/workspace/state-ports.js")).href
  );
  global.document = { addEventListener() {} };
  const { createWorkspaceMessageNavigatorController } = await import(
    pathToFileURL(path.join(root, "app/workspace/message-navigator-controller.js")).href
  );
  delete global.document;
  const noop = () => {};
  assert.throws(
    () => createWorkspaceDragController({ state: { groups: [] }, extra: true }),
    /extra dependencies field extra/
  );

  const flushTasks = () => new Promise((resolve) => { setImmediate(resolve); });
  const createClassList = (...initial) => {
    const values = new Set(initial);
    return {
      add: (...names) => names.forEach((name) => values.add(name)),
      remove: (...names) => names.forEach((name) => values.delete(name)),
      contains: (name) => values.has(name)
    };
  };
  const createDragDom = (groups) => {
    const cardsById = new Map();
    const tabsById = new Map();
    const framesById = new Map();
    const listeners = new Map();
    const moveCalls = [];
    const addGroupButton = {
      classList: createClassList(),
      getBoundingClientRect: () => ({ left: 1000, right: 1060, top: 0, bottom: 60, width: 60, height: 60 })
    };

    const moveChild = (parent, node, before) => {
      const previous = node.parentElement;
      if (previous) {
        const previousIndex = previous.children.indexOf(node);
        if (previousIndex >= 0) previous.children.splice(previousIndex, 1);
        previous.children.forEach((child, index) => {
          child.parentNode = previous;
          child.nextSibling = previous.children[index + 1] || null;
        });
      }
      const beforeIndex = before ? parent.children.indexOf(before) : -1;
      parent.children.splice(beforeIndex >= 0 ? beforeIndex : parent.children.length, 0, node);
      node.parentElement = parent;
      parent.children.forEach((child, index) => {
        child.parentNode = parent;
        child.nextSibling = parent.children[index + 1] || null;
      });
    };

    const tabNode = (instanceId) => {
      if (tabsById.has(instanceId)) return tabsById.get(instanceId);
      const node = {
        classList: createClassList("tab"),
        dataset: { instanceId },
        parentElement: null,
        setPointerCapture() {},
        getBoundingClientRect() {
          const parent = node.parentElement;
          const cardLeft = parent?.card?.left || 0;
          const index = Math.max(0, parent?.querySelectorAll(".tab[data-instance-id]").indexOf(node) ?? 0);
          const left = cardLeft + index * 100;
          return { left, right: left + 100, top: 0, bottom: 60, width: 100, height: 60 };
        }
      };
      tabsById.set(instanceId, node);
      return node;
    };

    const frameNode = (instanceId) => {
      if (framesById.has(instanceId)) return framesById.get(instanceId);
      const node = {
        classList: createClassList("chat-frame"),
        dataset: { instanceId },
        parentElement: null,
        style: { pointerEvents: "" }
      };
      framesById.set(instanceId, node);
      return node;
    };

    const appendGroup = (group) => {
      const left = cardsById.size * 400;
      const card = {
        classList: createClassList("chat-card"),
        dataset: { groupId: group.id },
        left,
        removed: false,
        getBoundingClientRect: () => ({ left, right: left + 300, top: 0, bottom: 300, width: 300, height: 300 }),
        remove() { card.removed = true; }
      };
      const header = {
        getBoundingClientRect: () => ({ left, right: left + 300, top: 0, bottom: 60, width: 300, height: 60 })
      };
      const tabAdd = { classList: createClassList("tab-add"), parentElement: null };
      const loadingStatus = { classList: createClassList("chat-frame-loading-status"), parentElement: null };
      const tabs = {
        card,
        classList: createClassList("chat-tabs"),
        children: [],
        querySelectorAll(selector) {
          return selector === ".tab[data-instance-id]"
            ? tabs.children.filter((node) => node.dataset?.instanceId)
            : [];
        },
        querySelector: (selector) => selector === ".tab-add" ? tabAdd : null,
        moveBefore(node, before) {
          moveCalls.push({ kind: "tab", parent: tabs, node, before });
          moveChild(tabs, node, before);
        },
        insertBefore(node, before) {
          moveCalls.push({ kind: "tab-fallback", parent: tabs, node, before });
          moveChild(tabs, node, before);
        }
      };
      const frames = {
        card,
        classList: createClassList("chat-frame-wrap"),
        children: [],
        querySelectorAll(selector) {
          return selector === ".chat-frame[data-instance-id]"
            ? frames.children.filter((node) => node.dataset?.instanceId)
            : [];
        },
        querySelector: (selector) => selector === ".chat-frame-loading-status" ? loadingStatus : null,
        moveBefore(node, before) {
          moveCalls.push({ kind: "frame", parent: frames, node, before });
          moveChild(frames, node, before);
        },
        insertBefore(node, before) {
          moveCalls.push({ kind: "frame-fallback", parent: frames, node, before });
          moveChild(frames, node, before);
        }
      };
      card.querySelector = (selector) => {
        if (selector === ".chat-header") return header;
        if (selector === ".chat-tabs") return tabs;
        if (selector === ".chat-frame-wrap") return frames;
        return null;
      };
      card.querySelectorAll = (selector) => selector === ".tab[data-instance-id]"
        ? tabs.querySelectorAll(selector)
        : [];
      tabs.children.push(tabAdd);
      tabAdd.parentElement = tabs;
      frames.children.push(loadingStatus);
      loadingStatus.parentElement = frames;
      for (const chat of group.chatApps) {
        moveChild(tabs, tabNode(chat.instanceId), tabAdd);
        moveChild(frames, frameNode(chat.instanceId), loadingStatus);
      }
      card.header = header;
      card.tabs = tabs;
      card.frames = frames;
      cardsById.set(group.id, card);
      return card;
    };

    const activeCards = () => Array.from(cardsById.values()).filter((card) => !card.removed);
    const allTabs = () => activeCards().flatMap((card) => card.tabs.querySelectorAll(".tab[data-instance-id]"));
    const allFrames = () => activeCards().flatMap((card) => card.frames.querySelectorAll(".chat-frame[data-instance-id]"));
    for (const group of groups) appendGroup(group);

    const documentMock = {
      body: { classList: createClassList() },
      querySelectorAll(selector) {
        if (selector === ".chat-card[data-group-id]") return activeCards();
        if (selector === "iframe") return allFrames();
        if (selector === '[data-tooltip-id="topbar.addGroup"]') return [addGroupButton];
        if (selector === ".chat-card.group-dragging, .chat-card.group-drop-before, .chat-card.group-drop-after") {
          return activeCards().filter((card) => ["group-dragging", "group-drop-before", "group-drop-after"]
            .some((name) => card.classList.contains(name)));
        }
        if (selector === ".chat-tabs.tab-drop-target") {
          return activeCards().map((card) => card.tabs)
            .filter((tabs) => tabs.classList.contains("tab-drop-target"));
        }
        if (selector === ".tab.drop-before, .tab.drop-after") {
          return allTabs().filter((tab) => tab.classList.contains("drop-before") || tab.classList.contains("drop-after"));
        }
        if (selector === '[data-tooltip-id="topbar.addGroup"].tab-new-group-drop-target') {
          return addGroupButton.classList.contains("tab-new-group-drop-target") ? [addGroupButton] : [];
        }
        if (selector === ".tab.dragging") return allTabs().filter((tab) => tab.classList.contains("dragging"));
        return [];
      },
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      }
    };

    return {
      addGroupButton,
      appendGroup,
      card: (groupId) => cardsById.get(groupId),
      frame: (instanceId) => framesById.get(instanceId),
      frameIds: (groupId) => cardsById.get(groupId)?.frames.querySelectorAll(".chat-frame[data-instance-id]")
        .map((node) => node.dataset.instanceId) || [],
      install() { global.document = documentMock; },
      listeners,
      moveCalls,
      syncGroupTabOrder(group) {
        const card = cardsById.get(group.id);
        const ordered = group.chatApps.map((chat) => tabNode(chat.instanceId));
        card.tabs.children = [...ordered, card.tabs.children.find((node) => node.classList.contains("tab-add"))];
        card.tabs.children.forEach((node) => { node.parentElement = card.tabs; });
      },
      tab: (instanceId) => tabsById.get(instanceId),
      tabIds: (groupId) => cardsById.get(groupId)?.tabs.querySelectorAll(".tab[data-instance-id]")
        .map((node) => node.dataset.instanceId) || []
    };
  };

  const createDragFixture = ({ groups, activeTabs, persistLayout, createGroupId = () => "new-group" }) => {
    const rootState = { groups, activeTabs };
    const owners = createWorkspaceOwnerStatePorts(createWorkspaceStatePort(rootState));
    const dom = createDragDom(groups);
    const effects = [];
    dom.install();
    const api = createWorkspaceDragController({
      state: owners.drag,
      createGroupId,
      persistLayout: () => persistLayout(effects),
      appendEmptyChatGroup: (group) => {
        effects.push(`append:${group.id}`);
        return dom.appendGroup(group);
      },
      syncGroupTabOrder: (group) => {
        dom.syncGroupTabOrder(group);
        effects.push(`sync-tabs:${group.id}:${dom.tabIds(group.id).join(",")}`);
      },
      activateChatTab: (group, instanceId, previousInstanceId = "") => {
        effects.push(`activate:${group.id}:${instanceId}:${previousInstanceId}`);
      },
      syncWorkspaceDom: () => { effects.push("sync-workspace"); },
      syncGridColumnClass: () => { effects.push("sync-grid"); },
      syncFullscreenLayout: () => { effects.push("sync-fullscreen"); }
    });
    return { api, dom, effects, owners, rootState };
  };

  const dispatchPointerDrag = (fixture, groupId, instanceId, {
    startX,
    endX,
    startY = 20,
    endY = startY,
    pointerId = 1
  }) => {
    fixture.api.startTabPointerDrag({
      button: 0,
      clientX: startX,
      clientY: startY,
      pointerId,
      currentTarget: fixture.dom.tab(instanceId),
      target: { closest: () => null },
      preventDefault() {},
      stopPropagation() {}
    }, groupId, instanceId);
    assert.equal(typeof fixture.dom.listeners.get("pointermove"), "function", "pointer drag must register its move listener");
    fixture.dom.listeners.get("pointermove")({ clientX: endX, clientY: endY, preventDefault() {} });
    fixture.dom.listeners.get("pointerup")({ clientX: endX, clientY: endY, preventDefault() {} });
  };

  const withinFirst = { instanceId: "within-1" };
  const withinSecond = { instanceId: "within-2" };
  const withinThird = { instanceId: "within-3" };
  const withinTabs = [withinFirst, withinSecond, withinThird];
  let resolveWithinPersist;
  let withinPersistSettled = false;
  let withinPersistCalls = 0;
  const withinPersist = new Promise((resolve) => { resolveWithinPersist = resolve; });
  const withinFixture = createDragFixture({
    groups: [{ id: "within-group", chatApps: withinTabs }],
    activeTabs: { "within-group": "within-1" },
    persistLayout: async (effects) => {
      withinPersistCalls += 1;
      effects.push("persist-within-start");
      await withinPersist;
      withinPersistSettled = true;
      effects.push("persist-within-done");
    }
  });
  const readonlyWithinGroup = withinFixture.owners.render.groups[0];
  const readonlyWithinTab = readonlyWithinGroup.chatApps[0];
  dispatchPointerDrag(withinFixture, readonlyWithinGroup.id, readonlyWithinTab.instanceId, {
    startX: 50,
    endX: 290
  });
  assert.equal(typeof withinFixture.api.startTabPointerDrag, "function");
  assert.equal(typeof withinFixture.api.consumeSuppressedTabClick, "function");
  assert.equal(withinFixture.api.consumeSuppressedTabClick(readonlyWithinTab.instanceId), true);
  assert.deepEqual(withinFixture.rootState.groups[0].chatApps, [withinSecond, withinThird, withinFirst]);
  assert.deepEqual(
    withinFixture.dom.tabIds("within-group"),
    ["within-2", "within-3", "within-1"],
    "readonly render IDs must reorder canonical state and synchronize DOM before persistence settles"
  );
  assert.equal(withinPersistSettled, false);
  assert.equal(withinPersistCalls, 1);
  assert.deepEqual(withinFixture.effects, [
    "sync-tabs:within-group:within-2,within-3,within-1",
    "activate:within-group:within-1:",
    "persist-within-start"
  ]);
  resolveWithinPersist();
  await flushTasks();
  assert.equal(withinPersistSettled, true);

  const movedAcross = { instanceId: "cross-moved" };
  const targetExisting = { instanceId: "cross-target" };
  let crossPersistCalls = 0;
  const crossFixture = createDragFixture({
    groups: [
      { id: "cross-source", chatApps: [movedAcross] },
      { id: "cross-target-group", chatApps: [targetExisting] }
    ],
    activeTabs: { "cross-source": movedAcross.instanceId, "cross-target-group": targetExisting.instanceId },
    persistLayout: async (effects) => {
      crossPersistCalls += 1;
      effects.push("persist-cross");
    }
  });
  const movedTabNode = crossFixture.dom.tab(movedAcross.instanceId);
  const movedFrameNode = crossFixture.dom.frame(movedAcross.instanceId);
  const readonlyCrossSource = crossFixture.owners.render.groups[0];
  const readonlyCrossTarget = crossFixture.owners.render.groups[1];
  dispatchPointerDrag(crossFixture, readonlyCrossSource.id, readonlyCrossSource.chatApps[0].instanceId, {
    startX: 50,
    endX: 550,
    pointerId: 2
  });
  assert.equal(crossFixture.api.consumeSuppressedTabClick(movedAcross.instanceId), true);
  assert.deepEqual(crossFixture.rootState.groups.map((group) => group.id), [readonlyCrossTarget.id]);
  assert.equal(Object.hasOwn(crossFixture.rootState.activeTabs, readonlyCrossSource.id), false);
  assert.equal(crossFixture.rootState.activeTabs[readonlyCrossTarget.id], movedAcross.instanceId);
  assert.deepEqual(crossFixture.rootState.groups[0].chatApps, [targetExisting, movedAcross]);
  assert.deepEqual(crossFixture.dom.tabIds(readonlyCrossTarget.id), [targetExisting.instanceId, movedAcross.instanceId]);
  assert.deepEqual(crossFixture.dom.frameIds(readonlyCrossTarget.id), [targetExisting.instanceId, movedAcross.instanceId]);
  assert.equal(movedTabNode.parentElement, crossFixture.dom.card(readonlyCrossTarget.id).tabs);
  assert.equal(movedFrameNode.parentElement, crossFixture.dom.card(readonlyCrossTarget.id).frames);
  assert.equal(crossFixture.dom.card(readonlyCrossSource.id).removed, true, "an emptied source group shell must be removed");
  assert.deepEqual(crossFixture.dom.moveCalls.map((call) => call.kind), ["tab", "frame"]);
  assert.equal(crossFixture.dom.moveCalls[0].node, movedTabNode, "cross-group transfer must reuse the exact tab DOM node");
  assert.equal(crossFixture.dom.moveCalls[1].node, movedFrameNode, "cross-group transfer must reuse the exact iframe DOM node");
  assert.equal(crossPersistCalls, 1, "cross-group transfer must persist exactly once");
  assert.deepEqual(crossFixture.effects, [
    `activate:${readonlyCrossTarget.id}:${movedAcross.instanceId}:${targetExisting.instanceId}`,
    "sync-grid",
    "sync-fullscreen",
    "persist-cross"
  ]);

  const rollbackMoved = { instanceId: "rollback-moved" };
  const rollbackTarget = { instanceId: "rollback-target" };
  let rollbackPersistCalls = 0;
  const rollbackFixture = createDragFixture({
    groups: [
      { id: "rollback-source", chatApps: [rollbackMoved] },
      { id: "rollback-target-group", chatApps: [rollbackTarget] }
    ],
    activeTabs: { "rollback-source": rollbackMoved.instanceId, "rollback-target-group": rollbackTarget.instanceId },
    persistLayout: async () => { rollbackPersistCalls += 1; }
  });
  const rollbackSourceCard = rollbackFixture.dom.card("rollback-source");
  rollbackFixture.dom.card("rollback-target-group").frames.moveBefore = () => {
    throw new Error("simulated iframe DOM transfer failure");
  };
  const rollbackWarnings = [];
  const originalRollbackWarn = console.warn;
  console.warn = (...args) => { rollbackWarnings.push(args); };
  try {
    dispatchPointerDrag(rollbackFixture, "rollback-source", rollbackMoved.instanceId, {
      startX: 50,
      endX: 550,
      pointerId: 21
    });
    await flushTasks();
  } finally {
    console.warn = originalRollbackWarn;
  }
  assert.deepEqual(rollbackFixture.rootState.groups[0].chatApps, [rollbackMoved]);
  assert.deepEqual(rollbackFixture.rootState.groups[1].chatApps, [rollbackTarget]);
  assert.equal(rollbackFixture.dom.tab(rollbackMoved.instanceId).parentElement, rollbackSourceCard.tabs);
  assert.equal(rollbackFixture.dom.frame(rollbackMoved.instanceId).parentElement, rollbackSourceCard.frames);
  assert.equal(rollbackPersistCalls, 0, "a rolled-back DOM transfer must not persist a model mutation");
  assert.equal(rollbackWarnings.length, 1);
  assert.match(String(rollbackWarnings[0][1]?.message || ""), /simulated iframe DOM transfer failure/);

  const stayedInSource = { instanceId: "new-stay" };
  const movedToNewGroup = { instanceId: "new-moved" };
  let newGroupPersistCalls = 0;
  const newGroupFixture = createDragFixture({
    groups: [{ id: "new-source", chatApps: [stayedInSource, movedToNewGroup] }],
    activeTabs: { "new-source": movedToNewGroup.instanceId },
    createGroupId: () => "created-by-drop",
    persistLayout: async (effects) => {
      newGroupPersistCalls += 1;
      effects.push("persist-new-group");
    }
  });
  const readonlyNewSource = newGroupFixture.owners.render.groups[0];
  const newGroupTabNode = newGroupFixture.dom.tab(movedToNewGroup.instanceId);
  const newGroupFrameNode = newGroupFixture.dom.frame(movedToNewGroup.instanceId);
  dispatchPointerDrag(newGroupFixture, readonlyNewSource.id, readonlyNewSource.chatApps[1].instanceId, {
    startX: 150,
    endX: 1020,
    pointerId: 3
  });
  assert.equal(newGroupFixture.api.consumeSuppressedTabClick(movedToNewGroup.instanceId), true);
  assert.deepEqual(newGroupFixture.rootState.groups.map((group) => group.id), ["new-source", "created-by-drop"]);
  assert.deepEqual(newGroupFixture.rootState.groups[0].chatApps, [stayedInSource]);
  assert.deepEqual(newGroupFixture.rootState.groups[1].chatApps, [movedToNewGroup]);
  assert.deepEqual(newGroupFixture.rootState.activeTabs, {
    "new-source": stayedInSource.instanceId,
    "created-by-drop": movedToNewGroup.instanceId
  });
  assert.deepEqual(newGroupFixture.dom.tabIds("created-by-drop"), [movedToNewGroup.instanceId]);
  assert.deepEqual(newGroupFixture.dom.frameIds("created-by-drop"), [movedToNewGroup.instanceId]);
  assert.equal(newGroupTabNode.parentElement, newGroupFixture.dom.card("created-by-drop").tabs);
  assert.equal(newGroupFrameNode.parentElement, newGroupFixture.dom.card("created-by-drop").frames);
  assert.equal(newGroupPersistCalls, 1, "a new group drop must persist exactly once");
  assert.equal(newGroupFixture.dom.addGroupButton.classList.contains("tab-new-group-drop-target"), false);
  assert.deepEqual(newGroupFixture.effects, [
    "append:created-by-drop",
    `activate:new-source:${stayedInSource.instanceId}:${movedToNewGroup.instanceId}`,
    `activate:created-by-drop:${movedToNewGroup.instanceId}:`,
    "sync-grid",
    "sync-fullscreen",
    "persist-new-group"
  ]);

  const appendFailureFirst = { instanceId: "append-failure-1" };
  const appendFailureSecond = { instanceId: "append-failure-2" };
  let appendFailurePersistCalls = 0;
  const appendFailureFixture = createDragFixture({
    groups: [{ id: "append-failure-source", chatApps: [appendFailureFirst, appendFailureSecond] }],
    activeTabs: { "append-failure-source": appendFailureFirst.instanceId },
    createGroupId: () => "append-failure-target",
    persistLayout: async () => { appendFailurePersistCalls += 1; }
  });
  appendFailureFixture.dom.appendGroup = () => {
    throw new Error("simulated empty group append failure");
  };
  const appendFailureWarnings = [];
  const originalAppendFailureWarn = console.warn;
  console.warn = (...args) => { appendFailureWarnings.push(args); };
  try {
    dispatchPointerDrag(
      appendFailureFixture,
      "append-failure-source",
      appendFailureSecond.instanceId,
      { startX: 150, endX: 1020, pointerId: 31 }
    );
    await flushTasks();
  } finally {
    console.warn = originalAppendFailureWarn;
  }
  assert.deepEqual(appendFailureFixture.rootState.groups.map((group) => group.id), ["append-failure-source"]);
  assert.deepEqual(appendFailureFixture.rootState.groups[0].chatApps, [appendFailureFirst, appendFailureSecond]);
  assert.equal(Object.hasOwn(appendFailureFixture.rootState.activeTabs, "append-failure-target"), false);
  assert.equal(appendFailureFixture.dom.card("append-failure-target"), undefined);
  assert.equal(appendFailurePersistCalls, 0);
  assert.equal(appendFailureWarnings.length, 1);
  assert.match(String(appendFailureWarnings[0][1]?.message || ""), /simulated empty group append failure/);

  const rejectFirst = { instanceId: "reject-1" };
  const rejectSecond = { instanceId: "reject-2" };
  const rejectThird = { instanceId: "reject-3" };
  const rejectTabs = [rejectFirst, rejectSecond, rejectThird];
  let rejectPersistCalls = 0;
  const rejectFixture = createDragFixture({
    groups: [{ id: "reject-group", chatApps: rejectTabs }],
    activeTabs: { "reject-group": rejectTabs[0].instanceId },
    persistLayout: async (effects) => {
      rejectPersistCalls += 1;
      effects.push("persist-reject");
      throw new Error("simulated storage failure");
    }
  });
  const dragWarnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { dragWarnings.push(args); };
  try {
    const readonlyRejectGroup = rejectFixture.owners.render.groups[0];
    dispatchPointerDrag(rejectFixture, readonlyRejectGroup.id, readonlyRejectGroup.chatApps[0].instanceId, {
      startX: 50,
      endX: 290,
      pointerId: 4
    });
    assert.equal(rejectFixture.api.consumeSuppressedTabClick(rejectFirst.instanceId), true);
    assert.deepEqual(rejectFixture.rootState.groups[0].chatApps, [rejectSecond, rejectThird, rejectFirst]);
    assert.deepEqual(
      rejectFixture.dom.tabIds("reject-group"),
      rejectFixture.rootState.groups[0].chatApps.map((chat) => chat.instanceId),
      "a persistence rejection must not roll model or DOM back to inconsistent orders"
    );
    await flushTasks();
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(rejectPersistCalls, 1);
  assert.equal(dragWarnings.length, 1);
  assert.match(String(dragWarnings[0][1]?.message || ""), /simulated storage failure/);

  let groupPersistCalls = 0;
  const groupFixture = createDragFixture({
    groups: [
      { id: "group-first", chatApps: [{ instanceId: "group-tab-1" }] },
      { id: "group-second", chatApps: [{ instanceId: "group-tab-2" }] }
    ],
    activeTabs: { "group-first": "group-tab-1", "group-second": "group-tab-2" },
    persistLayout: async (effects) => {
      groupPersistCalls += 1;
      effects.push("persist-group");
    }
  });
  const readonlyFirstGroup = groupFixture.owners.render.groups[0];
  dispatchPointerDrag(groupFixture, readonlyFirstGroup.id, readonlyFirstGroup.chatApps[0].instanceId, {
    startX: 50,
    endX: 550,
    startY: 100,
    pointerId: 5
  });
  assert.equal(groupFixture.api.consumeSuppressedTabClick("group-tab-1"), true);
  assert.deepEqual(groupFixture.rootState.groups.map((group) => group.id), ["group-second", "group-first"]);
  assert.deepEqual(groupFixture.effects, ["sync-workspace", "persist-group"]);
  assert.equal(groupPersistCalls, 1);
  delete global.document;

  const navigatorState = { groups: [], options: {} };
  const navigatorCommands = [];
  const navigatorApi = createWorkspaceMessageNavigatorController({
    state: navigatorState,
    appById: (id) => id === "ChatGPT" ? { id, name: "ChatGPT", url: "https://chatgpt.com/" } : null,
    openableTabUrl: (value) => /^https?:\/\//.test(String(value || "")) ? String(value) : "",
    knownNoConversationPage: () => false,
    sendToContentFrame: async (_iframe, command, data) => {
      navigatorCommands.push({ command, data });
      return {};
    },
    activeChatForGroup: () => null,
    activeIframe: () => null,
    activeHref: async () => "",
    activeShortcutGroupId: () => "",
    notify: noop,
    recordFunctionalAnomaly: async () => null,
    syncWorkspaceDom: noop,
    closePopovers: noop
  });
  assert.equal(typeof navigatorApi.dismissTrackedMessageNavigatorMenu, "function");
  assert.equal(typeof navigatorApi.reapplyMessageNavigatorForFrame, "function");
  const iframe = {
    dataset: {
      appId: "ChatGPT",
      currentHref: "https://chatgpt.com/c/example",
      messageNavigatorEnabled: "1",
      messageNavigatorSiteId: ""
    },
    getAttribute: () => "",
    src: ""
  };
  assert.equal(navigatorApi.messageNavigatorPayloadForFrame(iframe)?.config?.id, "chatgpt");
  await navigatorApi.reapplyMessageNavigatorForFrame(iframe);
  assert.equal(navigatorCommands.at(-1)?.command, "setMessageNavigator");
  assert.equal(iframe.dataset.messageNavigatorSiteId, "chatgpt");

  console.log(`workspace controller boundaries: ok (${lineCount(workspace)} facade lines)`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
