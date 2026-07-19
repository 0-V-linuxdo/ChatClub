import {
  currentExtensionTab,
  currentExtensionTabId,
  permissionsContains,
  permissionsRequest,
  runtimeGetUrl,
  runtimeRequest
} from "../shared/extension-api.js";
import {
  FrameRuntimePort
} from "../shared/frame-rpc.js";
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
  normalizeOptions,
  normalizePrimaryColor
} from "../shared/storage-schema.js";
import {
  loadCustomConfig,
  loadOptions,
  loadPocketHistory,
  loadPromptLibrary,
  loadPromptSendHistory,
  loadShortcutConfig,
  saveOptions,
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
import { createWorkspaceSessionStore } from "./workspace/session-store.js";
import { SETTINGS_SECTIONS } from "./settings/sections.js";
import { createCompactIconButton, createMenuButton } from "../ui/components.js";
import { el, isDismissalEscape, toast } from "../ui/dom.js";
import { FRAME_TOAST_POSITION_EVENT } from "../ui/frame-toast.js";
import { installGlobalTooltips } from "../ui/tooltip.js";
import { createSvgIcon } from "../ui/icons.js";
import { createAppState, createFeatureStatePorts } from "./state.js";

const appRoot = document.getElementById("app");
const isOptionsPage = document.body?.dataset.chatclubEntry === "options";
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
let appShellNode = null;
let summaryEscapeDismissalPromise = null;
const state = createAppState();
const featureState = createFeatureStatePorts(state);
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
  "frameApp",
  "iframeForWindow",
  "reapplyMessageNavigatorForFrame",
  "refreshCurrentExtensionTabInfo",
  "rememberFrameLocation",
  "syncFrameFavicon"
]);
const composerPreferredModelBinding = createBindOnceControllerPort("Composer Preferred Model", [
  "armPreferredModelSubmissionNavigation",
  "capturePreferredModelLockedPromptSnapshot",
  "ensurePreferredModelInputReady",
  "finishPreferredModelSubmissionNavigation",
  "handlePreferredModelPromptCompositionEnd",
  "handlePreferredModelPromptCompositionStart",
  "handlePromptBlur",
  "notifyPreferredModelGateBlocked",
  "preferredModelInputGateIsLocked",
  "preferredModelPromptCompositionIsActive",
  "rememberPreferredModelLockedPromptSnapshot",
  "restorePreferredModelLockedPromptSnapshot"
]);
const topbarPreferredModelBinding = createBindOnceControllerPort("Topbar Preferred Model", [
  "syncPreferredModelInputGate"
]);
const frameBridgePreferredModelBinding = createBindOnceControllerPort("Frame Bridge Preferred Model", [
  "invalidatePreferredModelFrame",
  "preferredModelFrameIsLoading",
  "schedulePreferredModelApplyToFrame"
]);
const topbarBinding = createBindOnceControllerPort("Topbar", ["closeSettingsMenu"]);
const frameBridgeBinding = createBindOnceControllerPort("Frame Bridge", [
  "prepareContentFrameRuntime",
  "scheduleContentFrameRepair",
  "verifiedCurrentContentFrameRegistration"
]);
const frameRuntimePort = new FrameRuntimePort({
  ensureRuntime: frameBridgeBinding.port.prepareContentFrameRuntime,
  invalidateRuntime(iframe) {
    if (!iframe?.dataset) return;
    delete iframe.dataset.preferredModelDocumentId;
    delete iframe.dataset.preferredModelContentBridgeVersion;
    delete iframe.dataset.preferredModelContentRuntimeImplementation;
    delete iframe.dataset.summaryRuntimeDocumentId;
    delete iframe.dataset.summaryRuntimeBridgeVersion;
    delete iframe.dataset.summaryRuntimeImplementationVersion;
    delete iframe.dataset.contentRuntimeCapabilitiesDocumentId;
    delete iframe.dataset.contentRuntimeCapabilities;
  }
});
const sendToContentFrame = createFrameRequest(frameRuntimePort, "App runtime");
const topicDeleteRuntime = createTopicDeleteRuntime({ framePort: frameRuntimePort });
const executeTopicDelete = topicDeleteRuntime.executeTopicDelete;
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
  optimizePrompt: optimizeCurrentPrompt
});
const preferredModelController = createPreferredModelController({
  state: preferredModelState,
  workspace: workspaceBinding.port,
  framePort: frameRuntimePort,
  appRoot,
  composer: composerController.preferredModelPort,
  verifiedCurrentContentFrameRegistration: frameBridgeBinding.port.verifiedCurrentContentFrameRegistration,
  prepareContentFrameRuntime: frameBridgeBinding.port.prepareContentFrameRuntime
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
  actions: {
    deleteThread: deleteThreadOnFrames,
    formatShortcutTooltip: shortcutTooltip,
    newChat: newChatOnFrames,
    openPocket: openPocketPanel,
    openSettings,
    openSummary: openSummaryPanel
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
  installPreferredModelFrameCleanup
} = preferredModelController;
const initializeTopbarPromptPlaceholder = topbarController.initializePlaceholder;
const syncTopbarPromptPlaceholder = topbarController.syncPlaceholder;
const syncPromptInputNode = composerController.syncInputNode;
const setPromptImages = composerController.setImages;
const ensurePreferredModelInputReady = composerPreferredModelBinding.port.ensurePreferredModelInputReady;
const focusPromptInput = composerController.focusInput;
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
  state: featureState.optimize,
  svgIcon,
  syncPromptInputNode,
  ensurePromptInputReady: ensurePreferredModelInputReady
});
const optimizeController = createOptimizeController(appContext);
let pocketController = null;
let summaryController = null;
let settingsController = null;
let pocketControllerPromise = null;
let summaryControllerPromise = null;
let settingsControllerPromise = null;
const workspaceSessionStore = createWorkspaceSessionStore({
  currentTab: currentExtensionTab,
  currentTabId: currentExtensionTabId,
  claimWorkspaceSession: ({ workspaceId = "" } = {}) => runtimeRequest({
    source: "chatclub",
    action: "claimWorkspaceSessionRecovery",
    ...(workspaceId ? { workspaceId } : {})
  }),
  commitWorkspaceSession: ({ workspaceId, claimId } = {}) => runtimeRequest({
    source: "chatclub",
    action: "commitWorkspaceSessionRecovery",
    workspaceId,
    ...(claimId ? { claimId } : {})
  }),
  storageGet,
  storageSet,
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
  saveOptions,
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

function lazyControllerError(label, error) {
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
          saveOptions,
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
    settingsControllerPromise = import("./settings/controller.js")
      .then(({ createSettingsController }) => {
        settingsController = createSettingsController({
          settingsSections: featureState.settingsSections,
          saveOptionsPatch,
          svgIcon,
          syncPromptInputNode,
          setPromptImages,
          ensurePromptInputReady: ensurePreferredModelInputReady,
          notifyConfigReload,
          render,
          syncTopbar,
          syncTopbarPromptPlaceholder,
          syncSummaryPanel,
          syncWorkspaceDom: workspaceController.syncWorkspaceDom,
          applyPreferredModels: applyPreferredModelsToFrames,
          applyTheme,
          syncI18nLanguage,
          requestUserScriptsPermission: requestUserScriptsAccess,
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

async function saveOptionsPatch(patch = {}) {
  state.options = await saveOptions({ ...state.options, ...patch });
  return state.options;
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
  const frameToastPosition = normalizeFrameToastPosition(state.options?.frameToastPosition);
  document.documentElement.style.setProperty("--primary", primaryColor);
  document.documentElement.style.setProperty("--primary-2", `color-mix(in srgb, ${primaryColor} ${isDark ? "22%" : "14%"}, ${isDark ? "#020617" : "#ffffff"})`);
  document.documentElement.style.setProperty("--summary-panel-link", primaryColor);
  document.documentElement.style.setProperty("--frame-loading-overlay-opacity", String(frameLoadingOverlayOpacity));
  document.documentElement.dataset.frameToastX = String(frameToastPosition.x);
  document.documentElement.dataset.frameToastY = String(frameToastPosition.y);
  document.dispatchEvent(new CustomEvent(FRAME_TOAST_POSITION_EVENT, { detail: frameToastPosition }));
}

async function notifyConfigReload() {
  try {
    await runtimeRequest({ source: "chatclub", action: "reloadConfigs", data: {} });
  } catch (error) {
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

async function newChatOnFrames() {
  await Promise.allSettled(workspaceController.currentFrames().map((iframe) =>
    workspaceController.startNewChatInFrame(iframe)
  ));
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
      .map(() => ({ status: "rejected", reason: new Error("User Scripts access is required for this custom Delete Site.") }));
  const settled = [
    ...await Promise.allSettled(runnableTargets.map(async ({ iframe, payload, config }) => {
    const timeoutMs = topicDeleteTimeoutMs(config, payload);
    return executeTopicDelete(iframe, payload, config, timeoutMs);
    })),
    ...deniedFailures
  ];
  const failures = settled.filter((item) => item.status === "rejected" || item.value?.ok === false);
  const successCount = settled.length - failures.length;
  if (successCount > 0) {
    toast(t("toast.deleteThreadTriggered", { count: successCount, plural: successCount === 1 ? "" : "s" }), "success");
  }
  if (failures.length > 0) {
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
  if (!ensurePreferredModelInputReady()) return;
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
  workspaceController.syncWorkspaceIsland(shell);
  syncSummaryPanel();
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
    return (await ensureSettingsController()).openSettings(sectionId);
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
  if (!ensurePreferredModelInputReady()) return;
  try {
    return (await ensureSettingsController()).openPromptLibraryDialog();
  } catch (error) {
    return lazyControllerError("Prompt Library", error);
  }
}

async function insertTextIntoPrompt(text) {
  if (!ensurePreferredModelInputReady()) return;
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
  const digit = shortcutDigit(matchObj);
  if (action === "focusInput") focusPromptInput();
  else if (action === "newChat") await workspaceController.startNewChatForShortcut(sourceWindow);
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
        console.warn("[ChatClub] Shortcut action failed", error);
      });
    }
  }, true);
}

async function init() {
  const workspaceSessionSnapshotPromise = workspaceSessionStore.load().catch(() => null);
  state.options = await loadOptions();
  state.customConfig = await loadCustomConfig();
  state.promptLibrary = await loadPromptLibrary();
  state.promptSendHistory = await loadPromptSendHistory();
  state.pocketEntries = await loadPocketHistory();
  state.shortcutConfig = await loadShortcutConfig();
  const workspaceSessionSnapshot = await workspaceSessionSnapshotPromise;
  userScriptsPermissionGranted = await permissionsContains({ permissions: ["userScripts"] }).catch(() => false);
  await faviconService.load();
  state.options = normalizeOptions(state.options);
  await Promise.race([
    runtimeRequest({
      source: "chatclub",
      action: "reloadConfigs",
      data: { reason: "app-init" }
    }),
    sleep(8000).then(() => { throw new Error("runtime registration reconciliation timed out"); })
  ]).catch((error) => {
    console.warn("[ChatClub] Runtime registration reconciliation failed; frame-level recovery remains enabled", error);
  });
  syncI18nLanguage();
  await initializeTopbarPromptPlaceholder();
  workspaceController.hydrateGroups(workspaceSessionSnapshot);
  installGlobalTooltips({
    getDisabledTooltipIds: () => state.options?.tooltipDisabledIds || []
  });
  installShortcuts();
  frameBridgeController.install();
  installPreferredModelFrameCleanup();
  render();
  if (isOptionsPage) {
    await ensureOptionsSettingsOpen();
    window.addEventListener("focus", ensureOptionsSettingsOpen);
    document.addEventListener("visibilitychange", ensureOptionsSettingsOpen);
  }
  applyPreferredModelsToFrames(null, { immediate: false });
  finishPreferredModelBootstrapping();
}

init().catch((error) => {
  console.error(error);
  appRoot.append(el("pre", {}, error.stack || error.message || String(error)));
});
