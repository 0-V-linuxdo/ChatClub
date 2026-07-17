import { createBindOnceControllerPort } from "../controller-port.js";
import { requireControllerContext, requireControllerFunction, validateControllerContract } from "../controller-contract.js";
import { createWorkspaceDragController } from "./drag-controller.js";
import { createWorkspaceFrameController } from "./frame-controller.js";
import { createWorkspaceFrameRegistry } from "./frame-registry.js";
import { createWorkspaceLayoutController } from "./layout-controller.js";
import { createWorkspaceMessageNavigatorController } from "./message-navigator-controller.js";
import { createWorkspaceOpenTabs } from "./open-tab.js";
import { createWorkspacePocketController } from "./pocket-controller.js";
import { createWorkspaceSessionController } from "./session-controller.js";
import { createWorkspaceOwnerStatePorts } from "./state-ports.js";
import { createWorkspaceViewController } from "./view-controller.js";

const requireContext = (ctx, name) => requireControllerContext(ctx, "Workspace controller", name);
const requireFunction = (ctx, name) => requireControllerFunction(ctx, "Workspace controller", name);

export function createWorkspaceController(ctx = {}) {
  ctx = validateControllerContract(ctx, "Workspace controller", {
    state: "object",
    createGroupId: "function",
    createFrameId: "function",
    createLayoutId: "function",
    allApps: "function",
    appById: "function",
    inferAppName: "function",
    appFaviconUrl: "function",
    fallbackFaviconUrl: "function",
    browserFaviconUrl: "function",
    effectiveFaviconUrl: "function",
    discoverDeclaredFaviconUrl: "function",
    rememberFaviconUrl: "function",
    saveOptions: "function",
    normalizeOptions: "function",
    toast: "function",
    render: "function",
    svgIcon: "function",
    compactIconButton: "function",
    menuButton: "function",
    formatShortcut: "function",
    requestTopicDeletePermission: "function?",
    prepareContentFrameRuntime: "function?",
    openCustomAppEditor: "function?",
    onFrameLifecycleChange: "function?",
    workspaceSessionStore: "object",
    framePort: "object",
    executeTopicDelete: "function"
  });

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
  const executeTopicDelete = requireFunction(ctx, "executeTopicDelete");
  const framePort = requireContext(ctx, "framePort");
  const workspaceSessionStore = requireContext(ctx, "workspaceSessionStore");
  if (typeof framePort.request !== "function") throw new TypeError("Workspace controller requires framePort.request.");
  if (typeof workspaceSessionStore.save !== "function" || typeof workspaceSessionStore.generation !== "function") {
    throw new TypeError("Workspace controller requires workspaceSessionStore.save/generation.");
  }

  const requestTopicDeletePermission = typeof ctx.requestTopicDeletePermission === "function"
    ? ctx.requestTopicDeletePermission
    : async () => true;
  const prepareContentFrameRuntime = typeof ctx.prepareContentFrameRuntime === "function"
    ? ctx.prepareContentFrameRuntime
    : async () => ({ ok: true });
  const openCustomAppEditor = typeof ctx.openCustomAppEditor === "function" ? ctx.openCustomAppEditor : null;
  const onFrameLifecycleChange = typeof ctx.onFrameLifecycleChange === "function" ? ctx.onFrameLifecycleChange : () => {};
  const sendToContentFrame = (iframe, command, data = {}, timeoutMs) => {
    const options = timeoutMs && typeof timeoutMs === "object" ? timeoutMs : { timeoutMs };
    return framePort.request(iframe, command, data, options);
  };

  const ownerState = createWorkspaceOwnerStatePorts(state);
  const openTabs = createWorkspaceOpenTabs();
  const { openableTabUrl, openTabUrl, refreshCurrentExtensionTabInfo } = openTabs;
  const frameRegistry = createWorkspaceFrameRegistry({ appById, openableTabUrl });
  const {
    currentFrames,
    findFrameForSummarySource,
    frameApp,
    highlightFrameForSummarySource,
    setFramePointerBlockedForOverlay
  } = frameRegistry;

  const sessionBinding = createBindOnceControllerPort("Workspace session", [
    "rememberWorkspaceSession",
    "restoreWorkspaceSession"
  ]);
  const layoutBinding = createBindOnceControllerPort("Workspace layout", [
    "activeTemporaryLayoutPreset",
    "addAppToGroup",
    "addGroup",
    "addLayoutPreset",
    "deleteLayoutPreset",
    "hydrateGroups",
    "hydrateImportedLayoutIfNeeded",
    "layoutPresetSummary",
    "layoutShortcutLabel",
    "persistLayout",
    "persistentLayoutPresets",
    "reconcileAppCatalog",
    "shortcutLabel",
    "shortcutTooltip",
    "switchLayoutPreset",
    "validChatAppIds"
  ]);
  const frameBinding = createBindOnceControllerPort("Workspace frame", [
    "activeChatForGroup",
    "activeFrameIsLoading",
    "activeHref",
    "activeIframe",
    "activeShortcutGroupId",
    "activateChatTab",
    "assignFrameSrc",
    "beginFrameLoading",
    "chatFrameAllow",
    "chatFrameName",
    "chatFrameNeedsSandbox",
    "chatFrameSandbox",
    "closeTab",
    "completeFrameLoading",
    "consumeFrameInitialHref",
    "copyActiveChatLink",
    "createFrameBindingId",
    "currentFullscreenGroup",
    "currentGroupIndex",
    "deleteActiveThreadForGroup",
    "frameDeleteThreadPayload",
    "frameIsLoading",
    "fullscreenShortcutLabel",
    "groupIdForFrameWindow",
    "iframeForWindow",
    "knownNoConversationPage",
    "notifyWorkspaceFrameSync",
    "openChatInNewTab",
    "openGoToUrlDialog",
    "refreshCurrentPage",
    "reloadChat",
    "removeChatGroup",
    "rememberFrameLocation",
    "setFrameSrcAfterPrepare",
    "startNewChatForShortcut",
    "startNewChatInActiveTab",
    "startNewChatInFrame",
    "syncFrameFavicon",
    "syncFullscreenLayout",
    "syncGroupTabOrder",
    "toggleFullscreen",
    "topicDeleteCapabilityForFrame"
  ]);
  const pocketBinding = createBindOnceControllerPort("Workspace Pocket", [
    "chatLocationForInstance",
    "loadPocketEntryInFrame",
    "restorePocketBatch"
  ]);
  const viewBinding = createBindOnceControllerPort("Workspace view", [
    "appendChatGroup",
    "closePopovers",
    "closePopoversAnchoredWithin",
    "closeTransientOverlays",
    "fullscreenButtonMeta",
    "openAppPicker",
    "openChatMenu",
    "openLayoutMenu",
    "reconcileAppCatalogDom",
    "refreshChatTabPresentations",
    "renderWorkspace",
    "syncGridColumnClass",
    "syncGridColumns",
    "syncHeaderForFrameInstance",
    "syncTabGroupHeaderControls",
    "syncWorkspaceDom",
    "syncWorkspaceIsland",
    "workspaceDomMatchesState"
  ]);

  const sessionController = createWorkspaceSessionController({
    state: ownerState.session,
    services: {
      appById,
      createFrameId,
      createGroupId,
      createLayoutId,
      openableTabUrl,
      workspaceSessionStore
    },
    layout: layoutBinding.port
  });
  sessionBinding.bind(sessionController);

  const layoutController = createWorkspaceLayoutController({
    state: ownerState.layout,
    services: {
      allApps,
      appById,
      createFrameId,
      createGroupId,
      createLayoutId,
      formatShortcut,
      inferAppName,
      normalizeOptions,
      notify,
      render,
      saveOptions
    },
    session: sessionBinding.port,
    view: viewBinding.port
  });
  layoutBinding.bind(layoutController);

  const frameController = createWorkspaceFrameController({
    state: ownerState.frame,
    services: {
      appById,
      discoverDeclaredFaviconUrl,
      effectiveFaviconUrl,
      executeTopicDelete,
      inferAppName,
      notify,
      onFrameLifecycleChange,
      openTabUrl,
      openableTabUrl,
      prepareContentFrameRuntime,
      rememberFaviconUrl,
      requestTopicDeletePermission,
      sendToContentFrame,
      svgIcon
    },
    registry: frameRegistry,
    session: sessionBinding.port,
    layout: layoutBinding.port,
    view: viewBinding.port
  });
  frameBinding.bind(frameController);

  const pocketController = createWorkspacePocketController({
    state: ownerState.pocket,
    services: {
      allApps,
      appById,
      createFrameId,
      createGroupId,
      createLayoutId,
      openableTabUrl,
      render
    },
    registry: frameRegistry,
    session: sessionBinding.port,
    layout: layoutBinding.port,
    frame: frameBinding.port
  });
  pocketBinding.bind(pocketController);

  const dragController = createWorkspaceDragController({
    state: ownerState.drag,
    persistLayout: layoutBinding.port.persistLayout,
    syncGroupTabOrder: frameBinding.port.syncGroupTabOrder,
    activateChatTab: frameBinding.port.activateChatTab,
    syncWorkspaceDom: viewBinding.port.syncWorkspaceDom
  });

  const messageNavigatorController = createWorkspaceMessageNavigatorController({
    state: ownerState.messageNavigator,
    appById,
    openableTabUrl,
    knownNoConversationPage: frameBinding.port.knownNoConversationPage,
    sendToContentFrame,
    activeChatForGroup: frameBinding.port.activeChatForGroup,
    activeIframe: frameBinding.port.activeIframe,
    activeHref: frameBinding.port.activeHref,
    activeShortcutGroupId: frameBinding.port.activeShortcutGroupId,
    notify,
    syncWorkspaceDom: viewBinding.port.syncWorkspaceDom,
    closePopovers: viewBinding.port.closePopovers
  });

  const viewController = createWorkspaceViewController({
    state: ownerState.render,
    services: {
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
    },
    frame: frameBinding.port,
    layout: layoutBinding.port,
    pocket: pocketBinding.port,
    drag: dragController,
    navigator: messageNavigatorController
  });
  viewBinding.bind(viewController);

  return Object.freeze({
    renderWorkspace: viewController.renderWorkspace,
    syncWorkspaceIsland: viewController.syncWorkspaceIsland,
    syncWorkspaceDom: viewController.syncWorkspaceDom,
    syncGridColumnClass: viewController.syncGridColumnClass,
    addGroup: layoutController.addGroup,
    closeTab: frameController.closeTab,
    toggleFullscreen: frameController.toggleFullscreen,
    toggleMessageNavigatorForShortcut: messageNavigatorController.toggleMessageNavigatorForShortcut,
    openChatMenu: viewController.openChatMenu,
    openAppPicker: viewController.openAppPicker,
    openLayoutMenu: viewController.openLayoutMenu,
    reapplyMessageNavigatorForFrame: messageNavigatorController.reapplyMessageNavigatorForFrame,
    syncFullscreenLayout: frameController.syncFullscreenLayout,
    activeShortcutGroupId: frameController.activeShortcutGroupId,
    activeChatForGroup: frameController.activeChatForGroup,
    activateChatTab: frameController.activateChatTab,
    startNewChatInFrame: frameController.startNewChatInFrame,
    startNewChatInActiveTab: frameController.startNewChatInActiveTab,
    startNewChatForShortcut: frameController.startNewChatForShortcut,
    refreshCurrentPage: frameController.refreshCurrentPage,
    reloadChat: frameController.reloadChat,
    loadPocketEntryInFrame: pocketController.loadPocketEntryInFrame,
    restorePocketBatch: pocketController.restorePocketBatch,
    iframeForWindow: frameController.iframeForWindow,
    groupIdForFrameWindow: frameController.groupIdForFrameWindow,
    syncFrameFavicon: frameController.syncFrameFavicon,
    rememberFrameLocation: frameController.rememberFrameLocation,
    frameDeleteThreadPayload: frameController.frameDeleteThreadPayload,
    topicDeleteCapabilityForFrame: frameController.topicDeleteCapabilityForFrame,
    openableTabUrl,
    openTabUrl,
    hydrateGroups: layoutController.hydrateGroups,
    hydrateImportedLayoutIfNeeded: layoutController.hydrateImportedLayoutIfNeeded,
    reconcileAppCatalog: layoutController.reconcileAppCatalog,
    switchLayoutPreset: layoutController.switchLayoutPreset,
    closePopovers: viewController.closePopovers,
    closePopoversAnchoredWithin: viewController.closePopoversAnchoredWithin,
    closeTransientOverlays: viewController.closeTransientOverlays,
    dismissTrackedMessageNavigatorMenu: messageNavigatorController.dismissTrackedMessageNavigatorMenu,
    hasTrackedMessageNavigatorMenu: messageNavigatorController.hasTrackedMessageNavigatorMenu,
    currentFrames,
    frameApp,
    setFramePointerBlockedForOverlay,
    findFrameForSummarySource,
    highlightFrameForSummarySource,
    refreshCurrentExtensionTabInfo
  });
}
