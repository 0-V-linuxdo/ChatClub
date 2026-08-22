import {
  currentExtensionTab, currentExtensionTabId, extensionApi, permissionsContains,
  permissionsRequest, requestBackground, runtimeGetUrl, runtimeRequest
} from "../shared/extension-api.js";
import { APP_VERSION } from "../shared/constants.js";
import { FrameRuntimePort } from "../shared/frame-rpc.js";
import { setLanguage, t } from "../shared/i18n.js";
import {
  detectKeyboardPlatform,
  formatShortcut,
  matchShortcut,
  shortcutProfile
} from "../shared/shortcuts.js";
import {
  createId,
  getAllChatApps,
  normalizeFrameToastPosition,
  normalizeModelPreferenceSelectionOverlayOpacity,
  normalizeOptions,
  normalizePrimaryColor,
  normalizeTopbarPromptInputFontSize
} from "../shared/storage-schema.js";
import {
  loadPocketHistory,
  loadPromptLibrary,
  loadPromptSendHistory,
  loadShortcutConfig,
  savePocketHistory,
  storageGet,
  storageRemove,
  storageSet
} from "../shared/storage-adapter.js";
import { topicDeleteTimeoutMs } from "../shared/topic-delete-sites.js";
import { createTopicDeleteRuntime } from "./topic-delete/runtime.js";
import { createFrameBridgeController } from "./frame-bridge/controller.js";
import { createFrameRequest } from "./frame-request.js";
import { createOptimizeController } from "./optimize/controller.js";
import { createFaviconService } from "./favicon/service.js";
import { createComposerController } from "./composer/controller.js";
import { createBindOnceControllerPort } from "./controller-port.js";
import { createPreferredModelController } from "./preferred-model/controller.js";
import { createTopbarController } from "./topbar/controller.js";
import { createWorkspaceController } from "./workspace/controller.js";
import { PROMPT_HANDOFF_LAUNCH_REASON, createWorkspacePromptHandoffController } from "./workspace/prompt-handoff-controller.js";
import { attachWorkspaceClearedTabsController } from "./workspace/cleared-tabs-controller.js";
import { attachWorkspaceTabsSidebarController } from "./workspace/tabs-sidebar-controller.js";
import { createWorkspaceTopicTitleController } from "./workspace/topic-title-controller.js";
import { createWorkspaceSessionStore } from "./workspace/session-store.js";
import {
  createFunctionalAnomalyController,
  settledOperationFailure
} from "./functional-anomalies/controller.js";
import { SETTINGS_SECTIONS } from "./settings/sections.js";
import { createCompactIconButton, createMenuButton } from "../ui/components.js";
import { el, isDismissalEscape, toast } from "../ui/dom.js";
import { FRAME_TOAST_POSITION_EVENT } from "../ui/frame-toast.js";
import { installGlobalTooltips } from "../ui/tooltip.js";
import { createSvgIcon } from "../ui/icons.js";
import { createAppState, createFeatureStatePorts } from "./state.js";
import { createAppConfigService } from "./config-service.js";
import { consumeConfigResetCleanupWarning } from "./state/reset-cleanup-warning.js";
import { clearBrowserSessionRestoreReload, prepareBrowserSessionRestore } from "./workspace/browser-session-restore.js";
import { createWorkspaceBootstrapRecoveryController } from "./workspace/bootstrap-recovery-controller.js";

const appRoot = document.getElementById("app");
const isOptionsPage = document.body?.dataset.chatclubEntry === "options";
const browserSessionRestore = isOptionsPage
  ? Object.freeze({ reloadRequested: false })
  : prepareBrowserSessionRestore(window, document);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
let appShellNode = null;
let summaryEscapeDismissalPromise = null;
const state = createAppState();
const featureState = createFeatureStatePorts(state);
const configService = createAppConfigService({ request: requestBackground });
const functionalAnomalyController = createFunctionalAnomalyController({
  state: featureState.functionalAnomalies, requestBackground, appVersion: APP_VERSION,
  surface: isOptionsPage ? "options" : "workspace"
});
const recordFunctionalAnomaly = functionalAnomalyController.record;
const composerState = featureState.composer;
const preferredModelState = featureState.preferredModel;
const topbarState = featureState.topbar;
const keyboardPlatform = detectKeyboardPlatform();
const workspaceBinding = createBindOnceControllerPort("Workspace", [
  "closePopovers",
  "closePopoversAnchoredWithin",
  "currentFrames",
  "frameApp",
  "openAppPicker",
  "openLayoutMenu"
]);
const frameBridgeWorkspaceBinding = createBindOnceControllerPort("Frame Bridge Workspace", [
  "currentFrames",
  "ensureFrameAttributeContract",
  "frameApp",
  "iframeForWindow",
  "reloadFrameDocument",
  "reapplyMessageNavigatorForFrame",
  "refreshCurrentExtensionTabInfo",
  "rememberFrameLocation",
  "syncFrameFavicon"
]);
const composerPreferredModelBinding = createBindOnceControllerPort("Composer Preferred Model", [
  "armPreferredModelSubmissionNavigation",
  "finishPreferredModelSubmissionNavigation",
  "preferredModelFailurePolicyForApp",
  "preferredModelFrameReadiness",
  "preferredModelFrameReadinessIsCurrent",
  "waitForPreferredModelFrame",
  "waitForPreferredModelSubmissionBarrier"
]);
const topbarPreferredModelBinding = createBindOnceControllerPort("Topbar Preferred Model", [
  "syncPreferredModelInputGate"
]);
const frameBridgePreferredModelBinding = createBindOnceControllerPort("Frame Bridge Preferred Model", [
  "invalidatePreferredModelFrame",
  "preferredModelFrameIsLoading",
  "schedulePreferredModelApplyToFrame"
]);
const topbarBinding = createBindOnceControllerPort("Topbar", ["closeSettingsMenu", "runShortcutAction"]);
const frameBridgeBinding = createBindOnceControllerPort("Frame Bridge", [
  "prepareContentFrameRuntime",
  "scheduleContentFrameRepair",
  "verifiedCurrentContentFrameRegistration"
]);
function invalidateFrameRuntimeState(iframe, _reason, options = {}) {
  if (!iframe?.dataset) return;
  if (!options.preserveDocument) {
    delete iframe.dataset.preferredModelDocumentId;
    delete iframe.dataset.preferredModelContentBridgeVersion;
    delete iframe.dataset.preferredModelContentRuntimeImplementation;
  }
  if (!options.preserveDocument || options.clearCapabilities) {
    iframe.dataset.contentRuntimeCapabilitiesEpoch = String(
      Math.max(0, Number(iframe.dataset.contentRuntimeCapabilitiesEpoch) || 0) + 1
    );
    delete iframe.dataset.summaryRuntimeDocumentId;
    delete iframe.dataset.summaryRuntimeBridgeVersion;
    delete iframe.dataset.summaryRuntimeImplementationVersion;
    delete iframe.dataset.contentRuntimeCapabilitiesDocumentId;
    delete iframe.dataset.contentRuntimeCapabilities;
  }
}
const frameRuntimePort = new FrameRuntimePort({
  ensureRuntime: frameBridgeBinding.port.prepareContentFrameRuntime,
  invalidateRuntime: invalidateFrameRuntimeState
});
const sendToContentFrame = createFrameRequest(frameRuntimePort, "App runtime");
const topicDeleteRuntime = createTopicDeleteRuntime({ framePort: frameRuntimePort });
const executeTopicDelete = topicDeleteRuntime.executeTopicDelete;
let workspaceTopicTitleController = null;
const composerController = createComposerController({
  state: composerState,
  workspace: workspaceBinding.port,
  preferredModel: composerPreferredModelBinding.port,
  topbar: topbarBinding.port,
  framePort: frameRuntimePort,
  keyboardPlatform,
  activeShortcutProfile,
  inferAppName,
  openPromptLibrary: openPromptLibraryDialog,
  optimizePrompt: optimizeCurrentPrompt,
  recordFunctionalAnomaly,
  onPromptAdmitted: (text) => workspaceTopicTitleController?.maybeGenerateFromPrompt(text)
});
const preferredModelController = createPreferredModelController({
  state: preferredModelState,
  workspace: workspaceBinding.port,
  framePort: frameRuntimePort,
  appRoot,
  verifiedCurrentContentFrameRegistration: frameBridgeBinding.port.verifiedCurrentContentFrameRegistration,
  prepareContentFrameRuntime: frameBridgeBinding.port.prepareContentFrameRuntime,
  recordFunctionalAnomaly
});
composerPreferredModelBinding.bind(preferredModelController);
topbarPreferredModelBinding.bind(preferredModelController);
frameBridgePreferredModelBinding.bind(preferredModelController);
const topbarController = createTopbarController({
  state: topbarState,
  composer: composerController,
  workspace: workspaceBinding.port,
  preferredModel: topbarPreferredModelBinding.port,
  settingsSections: SETTINGS_SECTIONS,
  saveOptions: saveOptionsState,
  actions: {
    deleteThread: deleteThreadOnFrames,
    formatShortcutTooltip: shortcutTooltip,
    newChat: newChatOnFrames,
    openNewWorkspaceTab,
    openPocket: openPocketPanel,
    openSettings,
    openSummary: openSummaryPanel,
    toggleWorkspaceTabsSidebar,
    isWorkspaceTabsSidebarOpen
  }
});
topbarBinding.bind(topbarController);
const frameBridgeController = createFrameBridgeController({
  framePort: () => frameRuntimePort,
  workspace: () => frameBridgeWorkspaceBinding.port,
  schedulePreferredModelApply: frameBridgePreferredModelBinding.port.schedulePreferredModelApplyToFrame,
  invalidatePreferredModelFrame: frameBridgePreferredModelBinding.port.invalidatePreferredModelFrame,
  preferredModelFrameIsLoading: frameBridgePreferredModelBinding.port.preferredModelFrameIsLoading,
  handleShortcutAction
});
frameBridgeBinding.bind(frameBridgeController);
const prepareContentFrameRuntime = frameBridgeBinding.port.prepareContentFrameRuntime;
const scheduleContentFrameRepair = frameBridgeBinding.port.scheduleContentFrameRepair;
const {
  applyPreferredModelsToFrames,
  finishBootstrapping: finishPreferredModelBootstrapping,
  handlePreferredModelFrameLifecycleChange,
  installPreferredModelFrameCleanup, syncPreferredModelSelectionOverlays
} = preferredModelController;
const initializeTopbarPromptPlaceholder = topbarController.initializePlaceholder;
const syncTopbarPromptPlaceholder = topbarController.syncPlaceholder;
const syncPromptInputNode = composerController.syncInputNode;
const setPromptImages = composerController.setImages;
const focusPromptInput = composerController.focusInput;
const promptFocusPromise = import("./prompt-focus/controller.js").then(({ installPromptFocusController }) => installPromptFocusController());
const closePromptActionsMenu = composerController.closeActionsMenu;
const closeSettingsJumpMenu = topbarController.closeSettingsMenu;
const enterTopbarEditMode = topbarController.enterEditMode;

function activeShortcutProfile() {
  return state.shortcutConfig?.profiles?.[keyboardPlatform]
    || shortcutProfile(state.shortcutConfig, keyboardPlatform);
}

function formatActiveShortcut(action, digitLabel = "") {
  const shortcut = activeShortcutProfile()?.shortcuts?.[action];
  return formatShortcut(action, shortcut, digitLabel, keyboardPlatform);
}

const svgIcon = createSvgIcon;

function shortcutTooltip(label, action, digitLabel = "") {
  const shortcut = formatActiveShortcut(action, digitLabel);
  if (!shortcut || shortcut === "Disabled" || shortcut === "Unassigned") return label;
  return `${label} (${shortcut})`;
}

function compactIconButton(label, iconName, onClick, extraClass = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return createCompactIconButton({ label, icon: svgIcon(iconName), onClick, className: extraClass, tooltipLabel, tooltipPlacement, tooltipId });
}

function browserUiLanguage() {
  try {
    return globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || "en";
  } catch {
    return navigator.language || "en";
  }
}

function syncI18nLanguage() {
  const language = setLanguage(state.options?.language || "system", browserUiLanguage());
  document.documentElement.lang = language === "zh_CN" ? "zh-CN" : "en";
  return language;
}

const faviconService = createFaviconService({
  state: featureState.favicon,
  storageGet,
  storageSet,
  runtimeGetUrl,
  inferAppName
});
const browserFaviconUrl = faviconService.browserUrl;
const discoverDeclaredFaviconUrl = faviconService.discover;
const rememberFaviconUrl = faviconService.remember;
const effectiveFaviconUrl = faviconService.effective;
const appFaviconUrl = faviconService.app;
const fallbackFaviconUrl = faviconService.fallback;

const appContext = Object.freeze({
  state: featureState.optimize, svgIcon, syncPromptInputNode, recordFunctionalAnomaly
});
const optimizeController = createOptimizeController(appContext);
let pocketController = null;
let summaryController = null;
let settingsController = null;
let pocketControllerPromise = null;
let summaryControllerPromise = null;
let settingsControllerPromise = null;
const workspaceSessionStore = createWorkspaceSessionStore({
  disabled: isOptionsPage, currentTab: currentExtensionTab,
  currentTabId: currentExtensionTabId,
  claimWorkspaceSession: (request = {}) => runtimeRequest({
    source: "chatclub", action: "claimWorkspaceSessionRecovery", ...request
  }),
  commitWorkspaceSession: ({ workspaceId, claimId } = {}) => runtimeRequest({
    source: "chatclub",
    action: "commitWorkspaceSessionRecovery",
    workspaceId,
    ...(claimId ? { claimId } : {})
  }),
  persistWorkspaceSession: ({ workspaceId, snapshot, clear = false } = {}) => runtimeRequest({
    source: "chatclub", action: "persistWorkspaceSession", workspaceId,
    ...(clear ? { clear: true } : { snapshot })
  }),
  storageGet,
  storageRemove
});
const workspaceController = createWorkspaceController({
  state: featureState.workspace,
  createGroupId: () => createId("group"),
  createFrameId: () => createId("frame"),
  createLayoutId: () => createId("layout"),
  allApps,
  appById,
  inferAppName,
  appFaviconUrl,
  fallbackFaviconUrl,
  browserFaviconUrl,
  effectiveFaviconUrl,
  discoverDeclaredFaviconUrl,
  rememberFaviconUrl,
  recordFunctionalAnomaly,
  saveOptions: saveOptionsState,
  normalizeOptions,
  toast,
  render,
  svgIcon,
  compactIconButton,
  menuButton,
  formatShortcut: formatActiveShortcut,
  requestTopicDeletePermission: (config) => requestFeatureUserScriptsPermission("topic-delete", config ? [config] : null),
  prepareContentFrameRuntime,
  onFrameLifecycleChange: handleWorkspaceFrameLifecycleChange,
  openCustomAppEditor: () => openCustomAppEditor(),
  workspaceSessionStore,
  framePort: frameRuntimePort,
  executeTopicDelete
});
workspaceBinding.bind(workspaceController);
frameBridgeWorkspaceBinding.bind(workspaceController);
workspaceTopicTitleController = createWorkspaceTopicTitleController({
  state, rememberWorkspaceSession: () => workspaceController.rememberWorkspaceSession(), render, extensionApi,
  workspaceId: () => workspaceSessionStore.workspaceId()
});
const clearedTabsController = attachWorkspaceClearedTabsController({
  requestBackground, toast, render, extensionApi, foregroundHost: () => document.querySelector(".settings-modal") });
const workspaceTabsSidebarController = attachWorkspaceTabsSidebarController({
  requestBackground, toast, render, inferAppName, appById, extensionApi,
  currentWorkspace: () => ({ layoutName: state.temporaryLayoutPreset?.name || "", groups: state.groups, topicTitle: state.topicTitle }),
  setCurrentTabTitle: (title) => workspaceTopicTitleController.setCustomTitle(title),
  canDismiss: () => !state.summaryOpen && !hasForegroundOverlay()
});
const {
  renderRuntimeBootstrapFailure,
  scheduleWorkspaceSessionLoadRecovery,
  waitForInitialWorkspaceFrameRestoration
} = createWorkspaceBootstrapRecoveryController({
  appRoot, clearedTabsController, createElement: el,
  currentFrames: workspaceController.currentFrames,
  frameLoadingInstanceIds: () => state.frameLoadingInstanceIds,
  isOptionsPage, reloadPage: () => window.location.reload(), sessionStore: workspaceSessionStore, sleep
});
function toggleWorkspaceTabsSidebar() { workspaceTabsSidebarController.toggle(); }
function isWorkspaceTabsSidebarOpen() { return workspaceTabsSidebarController.isOpen(); }
const workspacePromptHandoffController = createWorkspacePromptHandoffController({
  api: extensionApi(), requestBackground, composer: composerController, workspace: workspaceController,
  appCatalog: allApps, workspaceGeneration: workspaceSessionStore.generation,
  basePresetId: () => state.options?.activeLayoutPresetId || "", currentTabId: currentExtensionTabId,
  isOptionsPage: isOptionsPage || browserSessionRestore.reloadRequested
});
workspacePromptHandoffController.install();
configService.subscribe(applyConfigSnapshot);

function lazyControllerError(label, error) {
  void recordFunctionalAnomaly({
    feature: "runtime",
    operation: `load${String(label || "Feature").replace(/\s+/g, "")}`,
    error,
    message: error?.message || String(error || `Failed to load ${label}`)
  });
  console.error(`[ChatClub] Failed to load ${label}`, error);
  toast(error?.message || String(error || `Failed to load ${label}`), "error");
  return null;
}

let userScriptsPermissionGranted = false;

function executableCustomUserscript(config = {}) {
  const customMode = config.sourceMode === "custom" || config.builtIn === false;
  return customMode && Boolean(String(config.customUserscript || "").trim());
}

function featureNeedsUserScripts(feature, configs = null) {
  const key = feature === "topic-delete" ? "topicDeleteSiteConfigs" : "summarySiteConfigs";
  const candidates = Array.isArray(configs) ? configs : state.options?.[key] || [];
  return candidates.some((config) => config?.enabled !== false && executableCustomUserscript(config));
}

async function requestFeatureUserScriptsPermission(feature, configs = null) {
  if (!featureNeedsUserScripts(feature, configs) || userScriptsPermissionGranted) return true;
  return requestUserScriptsAccess();
}

async function requestUserScriptsAccess() {
  if (userScriptsPermissionGranted) return true;
  let granted = false;
  try {
    // Invoke request immediately in the click/keyboard handler. Checking first
    // would cross an await boundary and lose Firefox's user-activation token.
    granted = await permissionsRequest({ permissions: ["userScripts"] });
  } catch (error) {
    throw new Error(`User Scripts access could not be requested: ${error?.message || String(error)}`);
  }
  if (!granted) throw new Error("User Scripts access was not granted; custom Summary/Delete scripts remain disabled.");
  userScriptsPermissionGranted = true;
  return true;
}

function ensurePocketController() {
  if (pocketController) return Promise.resolve(pocketController);
  if (!pocketControllerPromise) {
    pocketControllerPromise = import("./pocket/controller.js")
      .then(({ createPocketController }) => {
        pocketController = createPocketController({
          state: featureState.pocket,
          createId,
          loadPocketHistory,
          savePocketHistory,
          saveOptions: saveOptionsState,
          openableTabUrl: workspaceController.openableTabUrl,
          loadPocketEntryInFrame: workspaceController.loadPocketEntryInFrame,
          restorePocketBatch: workspaceController.restorePocketBatch,
          setFramePointerBlockedForOverlay: workspaceController.setFramePointerBlockedForOverlay,
          effectiveFaviconUrl,
          compactIconButton,
          svgIcon
        });
        summaryController?.sync?.();
        return pocketController;
      })
      .catch((error) => {
        pocketControllerPromise = null;
        throw error;
      });
  }
  return pocketControllerPromise;
}

function ensureSummaryController() {
  if (summaryController) return Promise.resolve(summaryController);
  if (!summaryControllerPromise) {
    ensurePocketController().catch((error) => {
      console.warn("[ChatClub] Pocket preload failed; it will be retried on demand", error);
    });
    summaryControllerPromise = import("./summary/controller.js").then(async ({ createSummaryController }) => {
      const controller = createSummaryController({
        state: featureState.summary,
        svgIcon,
        compactIconButton,
        currentFrames: workspaceController.currentFrames,
        frameApp: workspaceController.frameApp,
        prepareContentFrameRuntime,
        setFramePointerBlockedForOverlay: workspaceController.setFramePointerBlockedForOverlay,
        findFrameForSummarySource: workspaceController.findFrameForSummarySource,
        highlightFrameForSummarySource: workspaceController.highlightFrameForSummarySource,
        inferAppName,
        effectiveFaviconUrl,
        discoverDeclaredFaviconUrl,
        rememberFaviconUrl,
        browserFaviconUrl,
        framePort: frameRuntimePort,
        formatShortcut: formatActiveShortcut,
        recordFunctionalAnomaly,
        pocketPort: {
          save: (...args) => ensurePocketController().then((pocket) => pocket.saveSummaryPreviewToPocket(...args)),
          entries: (...args) => pocketController?.pocketEntriesFromSummaryPreview(...args) || []
        }
      });
      if (!state.summarySize) {
        try {
          state.summarySize = await controller.loadPanelSize();
        } catch (error) {
          console.warn("[ChatClub] Failed to restore Summary panel size", error);
        }
      }
      summaryController = controller;
      return summaryController;
    }).catch((error) => {
      summaryControllerPromise = null;
      throw error;
    });
  }
  return summaryControllerPromise;
}

function ensureSettingsController() {
  if (settingsController) return Promise.resolve(settingsController);
  if (!settingsControllerPromise) {
    settingsControllerPromise = Promise.all([
      import("./settings/controller.js"),
      import("./official-rules/service.js")
    ])
      .then(([{ createSettingsController }, { createOfficialRulesService }]) => {
        const officialRulesService = createOfficialRulesService({ request: requestBackground, configService });
        settingsController = createSettingsController({
          settingsSections: featureState.settingsSections,
          officialRules: officialRulesService,
          importConfigPatch,
          resetConfig: resetConfigState,
          reloadAfterConfigReset: () => window.location.reload(),
          saveCustomConfig: saveCustomConfigState,
          saveOptionsPatch,
          svgIcon,
          syncPromptInputNode,
          setPromptImages,
          notifyConfigReload,
          render,
          syncTopbar,
          syncTopbarPromptPlaceholder,
          syncSummaryPanel,
          syncWorkspaceDom: workspaceController.syncWorkspaceDom, syncPreferredModelSelectionOverlays,
          applyPreferredModels: applyPreferredModelsToFrames,
          applyTheme,
          syncI18nLanguage,
          requestUserScriptsPermission: requestUserScriptsAccess,
          onSettingsDialogClosed: () => clearedTabsController.syncBanner(ensureAppShell()),
          functionalAnomalyLog: functionalAnomalyController,
          hydrateImportedLayoutIfNeeded: workspaceController.hydrateImportedLayoutIfNeeded,
          reconcileAppCatalog: workspaceController.reconcileAppCatalog,
          enterTopbarEditMode,
          openTabUrl: workspaceController.openTabUrl
        });
        return settingsController;
      })
      .catch((error) => {
        settingsControllerPromise = null;
        throw error;
      });
  }
  return settingsControllerPromise;
}

let optionsPatchWriteTail = Promise.resolve();
const pendingOptionsPatches = [];
let messageNavigatorActivationSyncTail = Promise.resolve();

function pendingOptionsPatchOverlay() {
  return pendingOptionsPatches.reduce(
    (overlay, entry) => Object.assign(overlay, entry.patch),
    {}
  );
}

function syncMessageNavigatorForActivation(activationRevision) {
  const revision = Math.max(0, Number(activationRevision) || 0);
  messageNavigatorActivationSyncTail = messageNavigatorActivationSyncTail.catch(() => {}).then(async () => {
    const frames = workspaceController.currentFrames().filter((iframe) => (
      iframe?.dataset?.messageNavigatorEnabled === "1"
      && iframe.dataset.messageNavigatorActivationRevision !== String(revision)
    ));
    await Promise.allSettled(frames.map((iframe) => workspaceController.reapplyMessageNavigatorForFrame(iframe)));
  });
  return messageNavigatorActivationSyncTail;
}

function applyConfigSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return;
  const wasLoaded = state.configSnapshotLoaded === true;
  const previousActivationRevision = Math.max(0, Number(state.officialRulesActivationRevision) || 0);
  state.configRevision = Math.max(0, Number(snapshot.revision) || 0);
  state.officialRulesActivationRevision = Math.max(0, Number(snapshot.activationRevision) || 0);
  state.storedOptions = snapshot.storedOptions && typeof snapshot.storedOptions === "object"
    ? structuredClone(snapshot.storedOptions)
    : structuredClone(snapshot.options || {});
  state.options = {
    ...normalizeOptions(snapshot.options || {}),
    ...pendingOptionsPatchOverlay()
  };
  state.customConfig = Array.isArray(snapshot.customConfig) ? structuredClone(snapshot.customConfig) : [];
  state.configSnapshotLoaded = true;
  if (wasLoaded && previousActivationRevision !== state.officialRulesActivationRevision) {
    void syncMessageNavigatorForActivation(state.officialRulesActivationRevision);
  }
}

async function saveOptionsState(nextOptions = {}) {
  const currentOptions = normalizeOptions(configService.current()?.options || {});
  const normalizedNext = normalizeOptions(nextOptions);
  const patch = Object.fromEntries(Object.entries(normalizedNext).filter(([key, value]) => (
    JSON.stringify(value) !== JSON.stringify(currentOptions[key])
  )));
  if (!Object.keys(patch).length) return { ...normalizedNext, ...pendingOptionsPatchOverlay() };
  const snapshot = await configService.patchOptions(patch);
  return { ...normalizeOptions(snapshot.options), ...pendingOptionsPatchOverlay() };
}

async function saveCustomConfigState(customConfig = []) {
  const snapshot = await configService.replaceCustomConfig(customConfig);
  return structuredClone(snapshot.customConfig);
}

async function importConfigPatch(patch = {}) {
  const result = await configService.importConfig(patch);
  return result.saved;
}

function resetConfigState() {
  return configService.resetConfig();
}

function saveOptionsPatch(patch = {}) {
  const acceptedPatch = { ...patch };
  const entry = { patch: acceptedPatch };
  pendingOptionsPatches.push(entry);
  state.options = { ...state.options, ...acceptedPatch };
  const write = async () => {
    try {
      const snapshot = await configService.patchOptions(acceptedPatch);
      const entryIndex = pendingOptionsPatches.indexOf(entry);
      if (entryIndex >= 0) pendingOptionsPatches.splice(entryIndex, 1);
      state.options = { ...normalizeOptions(snapshot.options), ...pendingOptionsPatchOverlay() };
      return state.options;
    } catch (error) {
      const entryIndex = pendingOptionsPatches.indexOf(entry);
      if (entryIndex >= 0) pendingOptionsPatches.splice(entryIndex, 1);
      const canonical = error?.latestSnapshot?.options || configService.current()?.options || state.options;
      state.options = { ...normalizeOptions(canonical), ...pendingOptionsPatchOverlay() };
      throw error;
    }
  };
  const queued = optionsPatchWriteTail.catch(() => {}).then(write);
  optionsPatchWriteTail = queued.then(() => undefined, () => undefined);
  return queued;
}

function menuButton(label, iconName, onClick, variant = "secondary", disabled = false, tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return createMenuButton({ label, icon: svgIcon(iconName), onClick, variant, disabled, tooltipLabel, tooltipPlacement, tooltipId });
}

function allApps() {
  return getAllChatApps(
    state.customConfig,
    state.options?.builtinChatAppOrder,
    state.options?.builtinChatAppIframeConfigs
  );
}

function appById(id) {
  return allApps().find((app) => app.id === id) || allApps()[0];
}

function inferAppName(app) {
  const name = String(app?.name || "").trim();
  const provider = String(app?.provider || "").trim();
  const url = String(app?.url || "");
  const host = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();
  const hostMap = [
    [/assistant\.kagi\.com$/, "Kagi Assistant"],
    [/gk\.dairoot\.cn$/, "Grok Mirror"],
    [/(^|\.)grok\.com$/, "Grok"],
    [/(^|\.)chatgpt\.com$|chat\.openai\.com$/, "ChatGPT"],
    [/(^|\.)claude\.ai$/, "Claude"],
    [/gemini\.google\.com$/, "Gemini"],
    [/(^|\.)deepseek\.com$/, "DeepSeek"],
    [/app\.notion\.com|notion\.so$/, "Notion AI"],
    [/(^|\.)lobehub\.com$/, "LobeHub"],
    [/(^|\.)typingcloud\.com$/, "TypingMind"]
  ];
  const inferred = hostMap.find(([pattern]) => pattern.test(host))?.[1];
  if (!name || /^custom(?:\s+\d+)?$/i.test(name) || name === host) {
    return inferred || (provider && !/^custom$/i.test(provider) ? provider : host || "Custom App");
  }
  return name;
}

 function applyTheme() {
  const mode = state.options?.themeMode || "system";
  if (mode === "dark" || mode === "light") document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
  const primaryColor = normalizePrimaryColor(state.options?.primaryColor);
  const isDark = mode === "dark" || (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  const rawFrameLoadingOverlayOpacity = Number(state.options?.frameLoadingOverlayOpacity);
  const frameLoadingOverlayOpacity = Math.max(0, Math.min(100, Math.round(Number.isFinite(rawFrameLoadingOverlayOpacity) ? rawFrameLoadingOverlayOpacity : 82))) / 100;
  const modelSelectionOverlayOpacity = normalizeModelPreferenceSelectionOverlayOpacity(state.options?.modelPreferenceSelectionOverlayOpacity) / 100;
  const frameToastPosition = normalizeFrameToastPosition(state.options?.frameToastPosition);
  const topbarPromptInputFontSize = normalizeTopbarPromptInputFontSize(state.options?.topbarPromptInputFontSize);
  document.documentElement.style.setProperty("--primary", primaryColor);
  document.documentElement.style.setProperty("--primary-2", `color-mix(in srgb, ${primaryColor} ${isDark ? "22%" : "14%"}, ${isDark ? "#020617" : "#ffffff"})`);
  document.documentElement.style.setProperty("--summary-panel-link", primaryColor);
  document.documentElement.style.setProperty("--frame-loading-overlay-opacity", String(frameLoadingOverlayOpacity));
  document.documentElement.style.setProperty("--preferred-model-selection-overlay-opacity", String(modelSelectionOverlayOpacity));
  document.documentElement.style.setProperty("--topbar-prompt-input-font-size", `${topbarPromptInputFontSize}px`);
  document.documentElement.dataset.frameToastX = String(frameToastPosition.x);
  document.documentElement.dataset.frameToastY = String(frameToastPosition.y);
  document.dispatchEvent(new CustomEvent(FRAME_TOAST_POSITION_EVENT, { detail: frameToastPosition }));
}

async function notifyConfigReload() {
  try {
    await runtimeRequest({ source: "chatclub", action: "reloadConfigs", data: {} });
  } catch (error) {
    void recordFunctionalAnomaly({
      feature: "settings",
      operation: "reloadRuntimeConfig",
      error,
      message: error?.message || "Failed to reload background config"
    });
    console.warn("[ChatClub] Failed to reload background config", error);
  }
}

function handleWorkspaceFrameLifecycleChange(change = {}) {
  handlePreferredModelFrameLifecycleChange(change);
  const isFrame = typeof HTMLIFrameElement !== "undefined" && change instanceof HTMLIFrameElement;
  const event = isFrame ? { type: "workspace-sync", iframe: change } : (change || {});
  if (event.type === "loading" && event.loading === false && event.iframe?.isConnected) {
    scheduleContentFrameRepair(event.iframe, 120);
    return;
  }
  if (event.type !== "workspace-sync" || event.membershipChanged === false) return;
  const frames = event.frames || (event.iframe ? [event.iframe] : workspaceController.currentFrames());
  for (const iframe of frames) scheduleContentFrameRepair(iframe, 180);
}

async function openNewWorkspaceTab() {
  try {
    await workspacePromptHandoffController.openNewWorkspaceTab();
  } catch (error) {
    toast(t("chat.unableToOpenTab"), "error");
    void recordFunctionalAnomaly({ feature: "workspace", operation: "openNewWorkspaceTab", error,
      message: error?.message || "Failed to open a new ChatClub tab" });
  }
}

async function newChatOnFrames() {
  const frames = workspaceController.currentFrames();
  const settled = await Promise.allSettled(frames.map((iframe) =>
    workspaceController.startNewChatInFrame(iframe)
  ));
  settled.forEach((result, index) => {
    const error = settledOperationFailure(result, "New chat did not start");
    if (!error) return;
    const iframe = frames[index];
    const app = workspaceController.frameApp(iframe) || {};
    void recordFunctionalAnomaly({
      feature: "newChat",
      operation: "startNewChat",
      appId: app.id || iframe?.dataset?.appId || "",
      appName: inferAppName(app),
      href: iframe?.dataset?.currentHref || app.url || "",
      error,
      message: error?.message || "New chat failed"
    });
  });
}

function deleteThreadFailureReason(item) {
  if (!item) return "";
  if (item.status === "rejected") return String(item.reason?.message || item.reason || "").trim();
  return String(item.value?.reason || item.value?.error || "").trim();
}

function deleteThreadFailureSummary(failures = []) {
  const reasons = [];
  for (const item of failures) {
    const reason = deleteThreadFailureReason(item);
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  }
  return reasons.slice(0, 2).join("; ");
}

async function deleteThreadOnFrames() {
  const permissionAttempt = requestFeatureUserScriptsPermission("topic-delete").catch((error) => {
    toast(error.message || String(error), "error");
    return false;
  });
  const frames = workspaceController.currentFrames();
  if (!frames.length) return;
  const targets = await Promise.all(frames.map(async (iframe) => {
    let href = "";
    try { href = await sendToContentFrame(iframe, "getLocationHref", {}, 1200); } catch {}
    if (href) workspaceController.rememberFrameLocation(iframe, { href });
    return workspaceController.topicDeleteCapabilityForFrame(iframe, href ? { currentHref: href } : {});
  }));
  const skippedCount = targets.filter((target) => target.skipped).length;
  const activeTargets = targets.filter((target) => !target.skipped);
  if (!activeTargets.length) {
    if (skippedCount) toast(t("toast.deleteThreadSkipped", { count: skippedCount, plural: skippedCount === 1 ? "" : "s" }), "info");
    return;
  }
  const count = activeTargets.length;
  if (!window.confirm(t("topbar.deleteThreadConfirm", { count, plural: count === 1 ? "" : "s" }))) return;
  const permissionGranted = await permissionAttempt;
  const runnableTargets = permissionGranted
    ? activeTargets
    : activeTargets.filter(({ config }) => !executableCustomUserscript(config));
  const deniedFailures = permissionGranted
    ? []
    : activeTargets
      .filter(({ config }) => executableCustomUserscript(config))
      .map((target) => ({
        status: "rejected",
        reason: new Error("User Scripts access is required for this custom Delete Site."),
        reportable: false,
        target
      }));
  const runnableSettled = (await Promise.allSettled(runnableTargets.map(async ({ iframe, payload, config }) => {
    const timeoutMs = topicDeleteTimeoutMs(config, payload);
    return executeTopicDelete(iframe, payload, config, timeoutMs);
  }))).map((item, index) => ({ ...item, reportable: true, target: runnableTargets[index] }));
  const settled = [
    ...runnableSettled,
    ...deniedFailures
  ];
  const failures = settled.filter((item) => item.status === "rejected" || item.value?.ok === false);
  const successCount = settled.length - failures.length;
  if (successCount > 0) {
    toast(t("toast.deleteThreadTriggered", { count: successCount, plural: successCount === 1 ? "" : "s" }), "success");
  }
  if (failures.length > 0) {
    for (const item of failures) {
      if (item.reportable === false) continue;
      const target = item.target || {};
      const app = workspaceController.frameApp(target.iframe) || {};
      const error = item.status === "rejected" ? item.reason : item.value;
      void recordFunctionalAnomaly({
        feature: "topicDeletion",
        operation: "deleteTopic",
        appId: app.id || target.payload?.appId || target.config?.id || "",
        appName: inferAppName(app) || target.payload?.appName || target.config?.name || "",
        href: target.payload?.currentHref || target.iframe?.dataset?.currentHref || app.url || "",
        error,
        message: deleteThreadFailureReason(item) || t("toast.deleteThreadFailed", { count: 1, plural: "" })
      });
    }
    console.warn("[ChatClub] Delete thread failed", failures);
    const reason = deleteThreadFailureSummary(failures);
    const message = t("toast.deleteThreadFailed", { count: failures.length, plural: failures.length === 1 ? "" : "s" });
    toast(reason ? `${message}: ${reason}` : message, "error");
  }
  if (skippedCount > 0) {
    toast(t("toast.deleteThreadSkipped", { count: skippedCount, plural: skippedCount === 1 ? "" : "s" }), "info");
  }
}

async function optimizeCurrentPrompt() {
  return optimizeController.optimizeCurrentPrompt();
}

function ensureAppShell() {
  if (appShellNode?.isConnected) return appShellNode;
  appShellNode = el("div", { class: "app-shell" });
  appRoot.replaceChildren(appShellNode);
  return appShellNode;
}

function syncTopbar() {
  return topbarController.sync(ensureAppShell());
}

function closeTransientOverlays() {
  closePromptActionsMenu();
  closeSettingsJumpMenu();
  workspaceController.closeTransientOverlays();
}

function render() {
  applyTheme();
  closeTransientOverlays();
  const shell = ensureAppShell();
  syncTopbar();
  clearedTabsController.syncBanner(shell);
  workspaceController.syncWorkspaceIsland(shell);
  workspaceTabsSidebarController.syncSidebar(shell);
  syncSummaryPanel();
}

function discardGuardedBrowserRestoreDom() {
  if (!browserSessionRestore.guarded) return;
  appShellNode = null;
  appRoot?.replaceChildren();
}

function syncSummaryPanel() {
  return summaryController?.sync?.();
}

async function openSummaryPanel() {
  const permissionAttempt = requestFeatureUserScriptsPermission("summary").catch((error) => {
    toast(error.message || String(error), "error");
    return false;
  });
  try {
    const [controller] = await Promise.all([ensureSummaryController(), permissionAttempt]);
    return controller.open();
  } catch (error) {
    return lazyControllerError("Summary", error);
  }
}

async function openSettings(sectionId = "appearance") {
  try {
    const result = (await ensureSettingsController()).openSettings(sectionId);
    clearedTabsController.syncBanner(ensureAppShell()); return result;
  } catch (error) {
    return lazyControllerError("Settings", error);
  }
}

let optionsSettingsOpening = false;

async function ensureOptionsSettingsOpen() {
  if (!isOptionsPage || optionsSettingsOpening || document.visibilityState === "hidden") return;
  if (document.querySelector(".settings-modal")) return;
  optionsSettingsOpening = true;
  try {
    await openSettings();
  } finally {
    optionsSettingsOpening = false;
  }
}

async function openCustomAppEditor() {
  try {
    return (await ensureSettingsController()).openCustomAppEditor();
  } catch (error) {
    return lazyControllerError("Settings", error);
  }
}

async function openPromptLibraryDialog() {
  try {
    return (await ensureSettingsController()).openPromptLibraryDialog();
  } catch (error) {
    return lazyControllerError("Prompt Library", error);
  }
}

async function insertTextIntoPrompt(text) {
  try {
    return (await ensureSettingsController()).insertTextIntoPrompt(text);
  } catch (error) {
    return lazyControllerError("Prompt Library", error);
  }
}

async function openPocketPanel() {
  try {
    return (await ensurePocketController()).openPocketPanel();
  } catch (error) {
    return lazyControllerError("Pocket", error);
  }
}

function shortcutDigit(matchObj) {
  const raw = matchObj?.digit ?? matchObj?.[1] ?? "";
  const digit = Number.parseInt(raw, 10);
  return Number.isFinite(digit) ? digit : 0;
}

function activeGroupForShortcut(sourceWindow) {
  const groupId = workspaceController.activeShortcutGroupId(sourceWindow);
  return state.groups.find((group) => group.id === groupId) || state.groups[0] || null;
}

function insertPromptLibraryItem(index) {
  const prompt = state.promptLibrary[index];
  if (!prompt?.prompt) {
    toast(t("toast.noPromptAtSlot"), "error");
    return;
  }
  insertTextIntoPrompt(prompt.prompt);
}

async function switchLayoutByShortcut(index) {
  const preset = state.options?.layoutPresets?.[index];
  if (!preset) {
    toast(t("toast.noLayoutAtSlot"), "error");
    return;
  }
  await workspaceController.switchLayoutPreset(preset.id);
}

function switchPlatformTabByShortcut(index, sourceWindow) {
  const sourceGroupId = workspaceController.groupIdForFrameWindow(sourceWindow);
  const multiTabGroups = state.groups.filter((group) => group.chatApps.length > 1);
  const group = sourceGroupId
    ? state.groups.find((item) => item.id === sourceGroupId)
    : state.fullscreenGroupId
      ? state.groups.find((item) => item.id === state.fullscreenGroupId)
      : state.groups.length === 1
        ? state.groups[0]
        : multiTabGroups.length === 1
          ? multiTabGroups[0]
          : activeGroupForShortcut(sourceWindow);
  const chat = group?.chatApps[index];
  if (!group || !chat) {
    toast(t("toast.noTabAtSlot"), "error");
    return;
  }
  workspaceController.activateChatTab(group, chat.instanceId);
}

async function handleShortcutAction(action, matchObj = null, sourceWindow = null) {
  if (!action) return;
  const group = activeGroupForShortcut(sourceWindow);
  const chat = group ? workspaceController.activeChatForGroup(group) : null;
  const digit = shortcutDigit(matchObj); if (action === "focusInput") focusPromptInput(); else if (action === "openNewWorkspaceTab") await openNewWorkspaceTab(); else if (action === "openSettings" || action === "openAppPicker" || action === "openSettingsMenu") topbarBinding.port.runShortcutAction(action);
  else if (action === "newChat") {
    const started = await workspaceController.startNewChatForShortcut(sourceWindow);
    const error = settledOperationFailure({ status: "fulfilled", value: started }, "New chat did not start");
    if (error) {
      void recordFunctionalAnomaly({
        feature: "newChat",
        operation: "startNewChat",
        error,
        message: error.message
      });
    }
  }
  else if (action === "newChatAll") await newChatOnFrames();
  else if (action === "deleteThread") await deleteThreadOnFrames();
  else if (action === "optimizePrompt") await optimizeCurrentPrompt();
  else if (action === "openSummaryPanel" || action === "openSummary") await openSummaryPanel();
  else if (action === "openPocketPanel") await openPocketPanel();
  else if (action === "toggleMessageNavigator") await workspaceController.toggleMessageNavigatorForShortcut(sourceWindow);
  else if (action === "closeChat" && group && chat) await workspaceController.closeTab(group, chat);
  else if (action === "refreshPage" && chat) await workspaceController.refreshCurrentPage(chat);
  else if (action === "reloadChat" && chat) workspaceController.reloadChat(chat);
  else if (action === "enterFullscreen") {
    if (state.summaryOpen) (await ensureSummaryController()).toggleMaximized();
    else if (pocketController?.toggleOpenPocketPanelFullscreen?.()) {}
    else workspaceController.toggleFullscreen(group?.id || workspaceController.activeShortcutGroupId(sourceWindow));
  }
  else if (action === "insertPrompt" && digit > 0) insertPromptLibraryItem(digit - 1);
  else if (action === "switchLayout" && digit > 0) await switchLayoutByShortcut(digit - 1);
  else if (action === "switchPlatformTab" && digit > 0) switchPlatformTabByShortcut(digit - 1, sourceWindow);
}

function hasForegroundOverlay() {
  return Boolean(document.querySelector(".modal-backdrop, .popover-menu, .popover-backdrop"));
}

function closeSummaryFromEscape() {
  if (!state.summaryOpen || hasForegroundOverlay()) return;
  state.summaryOpen = false;
  state.summaryMaximized = false;
  syncSummaryPanel();
}

function installShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (state.shortcutRecordingAction) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (state.summaryOpen && event.key === "Escape") {
      if (!isDismissalEscape(event) || hasForegroundOverlay()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (workspaceController.hasTrackedMessageNavigatorMenu()) {
        if (!summaryEscapeDismissalPromise) {
          summaryEscapeDismissalPromise = workspaceController.dismissTrackedMessageNavigatorMenu()
            .then((consumed) => {
              if (!consumed) closeSummaryFromEscape();
            })
            .catch((error) => {
              console.warn("[ChatClub] Summary Escape dismissal failed", error);
            })
            .finally(() => {
              summaryEscapeDismissalPromise = null;
            });
        }
        return;
      }
      closeSummaryFromEscape();
      return;
    }
    if (document.querySelector(".modal-backdrop")) return;
    if (isDismissalEscape(event) && (hasForegroundOverlay() || workspaceController.hasTrackedMessageNavigatorMenu())) return;
    const matched = matchShortcut(event, state.shortcutConfig, keyboardPlatform);
    if (matched) {
      closeTransientOverlays();
      event.preventDefault();
      event.stopPropagation();
      handleShortcutAction(matched.action, matched.matchObj).catch((error) => {
        void recordFunctionalAnomaly({
          feature: "shortcuts",
          operation: matched.action || "unknown",
          error,
          message: error?.message || "Shortcut action failed"
        });
        console.warn("[ChatClub] Shortcut action failed", error);
      });
    }
  }, true);
}

async function init() {
  if (browserSessionRestore.reloadRequested) return;
  discardGuardedBrowserRestoreDom();
  clearBrowserSessionRestoreReload(window.sessionStorage);
  void functionalAnomalyController.refresh().catch((error) => {
    console.warn("[ChatClub] Failed to load functional anomaly records", error);
  });
  const recoveryShell = ensureAppShell();
  clearedTabsController.syncBanner(recoveryShell);
  const clearedTabsRefreshPromise = clearedTabsController.refresh().then((tabs) => {
    if (recoveryShell.isConnected) clearedTabsController.syncBanner(recoveryShell);
    return tabs;
  }).catch((error) => {
    console.warn("[ChatClub] Cleared workspace tabs could not be listed", error);
    return [];
  });
  let workspaceLoadError = null;
  const workspaceSessionSnapshotPromise = workspaceSessionStore.load().catch((error) => {
    workspaceLoadError = error; return null;
  });
  await configService.load();
  state.promptLibrary = await loadPromptLibrary();
  state.promptSendHistory = await loadPromptSendHistory();
  state.pocketEntries = await loadPocketHistory();
  state.shortcutConfig = await loadShortcutConfig();
  const workspaceSessionSnapshot = await workspaceSessionSnapshotPromise;
  userScriptsPermissionGranted = await permissionsContains({ permissions: ["userScripts"] }).catch(() => false);
  await faviconService.load();
  let contentScriptsRefreshed = false;
  let contentScriptsRefreshError = null;
  await Promise.race([
    runtimeRequest({
      source: "chatclub",
      action: "reloadConfigs",
      data: { reason: "app-init" }
    }),
    sleep(8000).then(() => { throw new Error("runtime registration reconciliation timed out"); })
  ]).then((result) => {
    if (result?.contentScriptsRefreshed !== true) throw new Error("background did not confirm a content-script registration refresh");
    contentScriptsRefreshed = true;
    return result;
  }).catch((error) => {
    contentScriptsRefreshError = error;
    void recordFunctionalAnomaly({
      feature: "runtime",
      operation: "reconcileRegistration",
      error,
      message: error?.message || "Runtime registration reconciliation failed"
    });
    console.warn("[ChatClub] Runtime registration reconciliation failed; frame-level recovery remains enabled", error);
  });
  if (!contentScriptsRefreshed) {
    console.warn("[ChatClub] Workspace bootstrap is waiting for a current content-script registration");
    renderRuntimeBootstrapFailure(contentScriptsRefreshError);
    return;
  }
  if (workspaceLoadError) {
    void recordFunctionalAnomaly({ feature: "workspace", operation: "loadSession", error: workspaceLoadError,
      message: workspaceLoadError?.message || "Workspace session storage could not be read" });
    renderRuntimeBootstrapFailure(workspaceLoadError);
    scheduleWorkspaceSessionLoadRecovery(); return;
  }
  syncI18nLanguage();
  const resetCleanupWarningCount = consumeConfigResetCleanupWarning();
  if (resetCleanupWarningCount > 0) {
    toast(t("toast.configResetCleanupWarning", { count: resetCleanupWarningCount }), "error");
  }
  await initializeTopbarPromptPlaceholder({ persist: !workspaceSessionSnapshot });
  const promptHandoffLaunch = await workspacePromptHandoffController.prepareInitialLaunch();
  promptHandoffLaunch.claimed && !promptHandoffLaunch.snapshot ? workspaceController.hydrateEmptyPromptHandoffWorkspace() : workspaceController.hydrateGroups(promptHandoffLaunch.snapshot || workspaceSessionSnapshot);
  if (await workspaceController.persistWorkspaceSession() === false) {
    const error = new Error("Workspace session could not be persisted");
    void recordFunctionalAnomaly({ feature: "workspace", operation: "persistSession", error, message: error.message });
    renderRuntimeBootstrapFailure(error);
    scheduleWorkspaceSessionLoadRecovery(); return;
  }
  workspaceTopicTitleController.install();
  await clearedTabsRefreshPromise;
  installGlobalTooltips({
    getDisabledTooltipIds: () => state.options?.tooltipDisabledIds || []
  });
  installShortcuts();
  frameBridgeController.install();
  installPreferredModelFrameCleanup();
  await promptFocusPromise;
  render(); if (workspaceTabsSidebarController.isOpen()) await workspaceTabsSidebarController.refresh().then(() => workspaceTabsSidebarController.syncSidebar(ensureAppShell())).catch((error) => console.warn("[ChatClub] Live workspace tabs could not be listed", error));
  const promptHandoffAdmission = workspacePromptHandoffController.admitInitialLaunch(promptHandoffLaunch);
  const skippedPromptTargets = promptHandoffLaunch.diagnostics?.skipped?.length || 0, promptHandoffReason = promptHandoffLaunch.diagnostics?.reason;
  if (skippedPromptTargets) toast(t("toast.promptHandoffTargetsSkipped", { count: skippedPromptTargets }), "info");
  if ([PROMPT_HANDOFF_LAUNCH_REASON.CLAIM_FAILED, PROMPT_HANDOFF_LAUNCH_REASON.INVALID_CLAIM].includes(promptHandoffReason)) lazyControllerError("Prompt Handoff", new Error(t("toast.promptHandoffUnavailable"), { cause: promptHandoffLaunch.error }));
  if (promptHandoffLaunch.claimed && promptHandoffReason === PROMPT_HANDOFF_LAUNCH_REASON.PAYLOAD_UNAVAILABLE) toast(t("toast.promptHandoffUnavailable"), "error");
  else if (promptHandoffLaunch.claimed && promptHandoffAdmission.admittedCount === 0) toast(t("toast.promptHandoffNotAdmitted"), "error");
  if (isOptionsPage) {
    await ensureOptionsSettingsOpen();
    window.addEventListener("focus", ensureOptionsSettingsOpen);
    document.addEventListener("visibilitychange", ensureOptionsSettingsOpen);
  }
  const frameRestore = await waitForInitialWorkspaceFrameRestoration();
  if (frameRestore.timedOut) {
    const pending = frameRestore.pendingInstanceIds.filter(Boolean).join(", ");
    const message = `Initial workspace frame restoration timed out${pending ? ` (${pending})` : ""}`;
    void recordFunctionalAnomaly({
      feature: "workspace",
      operation: "restoreFrames",
      error: new Error(message),
      message
    });
    console.warn(`[ChatClub] ${message}; preferred-model bootstrapping will continue with per-frame recovery`);
  }
  applyPreferredModelsToFrames(null, { immediate: false });
  finishPreferredModelBootstrapping();
}

init().catch((error) => {
  void recordFunctionalAnomaly({
    feature: "runtime",
    operation: "initialize",
    error,
    message: error?.message || "ChatClub initialization failed"
  });
  console.error(error);
  renderRuntimeBootstrapFailure(error);
});
