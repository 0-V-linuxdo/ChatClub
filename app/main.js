import {
  APP_NAME,
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS
} from "../shared/constants.js";
import {
  DELETE_THREAD_POST_MESSAGE_SOURCE,
  PREFERRED_MODEL_POST_MESSAGE_SOURCE,
  SEND_TEXT_POST_MESSAGE_SOURCE,
  sendToIframe
} from "../shared/post-message.js";
import { setLanguage, t } from "../shared/i18n.js";
import {
  matchShortcut,
  formatShortcut,
} from "../shared/shortcuts.js";
import {
  createId,
  getAllChatApps,
  loadCustomConfig,
  loadOptions,
  loadPocketHistory,
  loadPromptLibrary,
  loadPromptSendHistory,
  loadShortcutConfig,
  normalizePromptImagePasteStrategy,
  normalizePromptSendHistory,
  normalizeFrameToastPosition,
  normalizeOptions,
  normalizePrimaryColor,
  normalizeTopbarPromptPlaceholderConfig,
  saveOptions,
  savePocketHistory,
  savePromptSendHistory,
  storageGet,
  storageSet
} from "../shared/storage.js";
import {
  DEFAULT_TOPBAR_LAYOUT,
  TOPBAR_BUILTIN_ITEMS,
  TOPBAR_REQUIRED_ITEMS,
  normalizeTopbarLayout,
  topbarItemIcon,
  topbarItemLabelKey,
  topbarSettingsItemForSection,
  topbarSettingsSectionForItem
} from "../shared/topbar.js";
import { topicDeleteTimeoutMs } from "../shared/topic-delete-sites.js";
import { createAppContext } from "./app-context.js";
import { createOptimizeController } from "./optimize/controller.js";
import { createPocketController } from "./pocket/controller.js";
import { createSummaryController } from "./summary/controller.js";
import { createWorkspaceController } from "./workspace/controller.js";
import { createSettingsController } from "./settings/controller.js";
import {
  SETTINGS_SECTIONS,
  cleanupSettingsDragRows
} from "./settings/kit.js";
import {
  PROMPT_HISTORY_LIVE_CURSOR,
  promptHistoryNavigate,
  shouldNavigatePromptHistory,
  shouldOpenPromptLibraryFromSlash
} from "./composer/history.js";
import { promptCollapsedPreview, promptInputHeight } from "./composer/model.js";
import { createActionButton, createCompactIconButton, createMenuButton, createTopIconButton } from "../ui/components.js";
import {
  button,
  createFrameToast,
  FRAME_TOAST_POSITION_EVENT,
  el,
  field,
  iconButton,
  input,
  modal,
  select,
  textarea,
  toast
} from "../ui/dom.js";
import { installGlobalTooltips } from "../ui/tooltip.js";

const appRoot = document.getElementById("app");
const SVG_NS = "http://www.w3.org/2000/svg";
const FAVICON_CACHE_KEY = "chatclub.faviconCache.v4";
const FAVICON_CACHE_MAX_ENTRIES = 240;
const PROMPT_IMAGE_RETRY_COUNT = 3;
const PROMPT_IMAGE_SEND_DEADLINE_MS = 60000;
const FRAME_SUBMIT_ERROR_MAX_CHARS = 160;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const faviconDiscoveryPromises = new Map();
let faviconCachePersistTimer = 0;
let appShellNode = null;
let topbarNode = null;
let topbarPromptPlaceholderValue = "";
let topbarPromptPlaceholderTimer = 0;
let topbarPromptPlaceholderTimerKey = "";
let activeTopbarEditPointerDrag = null;
let suppressTopbarPaletteClick = false;
let topbarEditSavePending = false;
const MODEL_PREFERENCE_APP_ID_ALIASES = Object.freeze({
  Gemini: "Gemini",
  Grok: "Grok",
  GrokMirror: "Grok",
  "Grok Mirror": "Grok",
  DeepSeek: "DeepSeek",
  "DeepSeek AI": "DeepSeek",
  NotionAI: "NotionAI",
  "Notion AI": "NotionAI"
});
const MODEL_PREFERENCE_APPLY_RETRY_DELAYS = Object.freeze([0, 700, 1600, 3200, 5200, 8000, 12000]);
const MODEL_PREFERENCE_READY_APPLY_RETRY_DELAYS = Object.freeze([1600, 3200, 5200, 8000, 12000, 16000]);
const MODEL_PREFERENCE_APPLY_TIMEOUT_MS = 15000;
const MODEL_PREFERENCE_CANCEL_TIMEOUT_MS = 1200;
const MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS = 15000;
const preferredModelApplyRuns = new Map();
let preferredModelPromptComposing = false;
let preferredModelComposingPromptInput = null;
let preferredModelGateBootstrapping = true;
let preferredModelLockedPromptSnapshot = null;
let preferredModelGateBlockedToastAt = 0;
let preferredModelFrameCleanupObserver = null;
const ICONS = {
  edit: [
    ["path", { d: "M12 20h9" }],
    ["path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }]
  ],
  external: [
    ["path", { d: "M15 3h6v6" }],
    ["path", { d: "M10 14 21 3" }],
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]
  ],
  copy: [
    ["rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }],
    ["path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }]
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.71-1.71" }]
  ],
  trash: [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
    ["path", { d: "M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }],
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }]
  ],
  fileCog: [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v6h6" }],
    ["circle", { cx: "12", cy: "16", r: "2" }],
    ["path", { d: "M12 12.5v1" }],
    ["path", { d: "M12 18.5v1" }],
    ["path", { d: "m9 14.2.9.5" }],
    ["path", { d: "m14.1 17.3.9.5" }],
    ["path", { d: "m15 14.2-.9.5" }],
    ["path", { d: "m9.9 17.3-.9.5" }]
  ],
  fileDown: [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v6h6" }],
    ["path", { d: "M12 18v-6" }],
    ["path", { d: "m9 15 3 3 3-3" }]
  ],
  fileUp: [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v6h6" }],
    ["path", { d: "M12 12v6" }],
    ["path", { d: "m9 15 3-3 3 3" }]
  ],
  image: [
    ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }],
    ["circle", { cx: "8.5", cy: "10", r: "1.5" }],
    ["path", { d: "m21 15-4.3-4.3a1 1 0 0 0-1.4 0L9 17" }],
    ["path", { d: "m3 15 4-4a1 1 0 0 1 1.4 0L13 15.6" }]
  ],
  paperclip: [
    ["path", { d: "m16 6-8.4 8.4a2 2 0 0 0 2.8 2.8l8.4-8.4a4 4 0 0 0-5.7-5.7l-8.3 8.5a6 6 0 0 0 8.5 8.5l8.3-8.5" }]
  ],
  grip: [
    ["circle", { cx: "9", cy: "5", r: "1" }],
    ["circle", { cx: "9", cy: "12", r: "1" }],
    ["circle", { cx: "9", cy: "19", r: "1" }],
    ["circle", { cx: "15", cy: "5", r: "1" }],
    ["circle", { cx: "15", cy: "12", r: "1" }],
    ["circle", { cx: "15", cy: "19", r: "1" }]
  ],
  palette: [
    ["path", { d: "M12 4.5c-4.1 0-7.5 2.85-7.5 6.45 0 3.2 2.72 5.75 6.25 5.75h1.3c.9 0 1.62.7 1.62 1.56 0 .68.58 1.2 1.25 1.04 2.78-.66 4.58-3.05 4.58-6.22 0-4.72-3.32-8.58-7.5-8.58Z" }],
    ["path", { d: "M8.15 10.15h.01" }],
    ["path", { d: "M11.25 8h.01" }],
    ["path", { d: "M14.75 8.75h.01" }],
    ["path", { d: "M16.95 12.05h.01" }]
  ],
  settings: [
    ["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }]
  ],
  key: [
    ["circle", { cx: "7.5", cy: "12", r: "3.25" }],
    ["path", { d: "M10.75 12H21" }],
    ["path", { d: "M16.5 12v-2.5" }],
    ["path", { d: "M19 12v-2.5" }]
  ],
  check: [
    ["path", { d: "M20 6 9 17l-5-5" }]
  ],
  apps: [
    ["rect", { x: "4", y: "4", width: "6", height: "6", rx: "1.4" }],
    ["rect", { x: "14", y: "4", width: "6", height: "6", rx: "1.4" }],
    ["rect", { x: "4", y: "14", width: "6", height: "6", rx: "1.4" }],
    ["rect", { x: "14", y: "14", width: "6", height: "6", rx: "1.4" }]
  ],
  model: [
    ["circle", { cx: "12", cy: "12", r: "3" }],
    ["circle", { cx: "6", cy: "6", r: "2" }],
    ["circle", { cx: "18", cy: "6", r: "2" }],
    ["circle", { cx: "6", cy: "18", r: "2" }],
    ["circle", { cx: "18", cy: "18", r: "2" }],
    ["path", { d: "M7.5 7.5 10 10" }],
    ["path", { d: "M16.5 7.5 14 10" }],
    ["path", { d: "M7.5 16.5 10 14" }],
    ["path", { d: "M16.5 16.5 14 14" }]
  ],
  layout: [
    ["polygon", { points: "12 4 21 8.5 12 13 3 8.5", "stroke-width": "2.5" }],
    ["polyline", { points: "3 13 12 17.5 21 13", "stroke-width": "2.5" }],
    ["polyline", { points: "3 17 12 21.5 21 17", "stroke-width": "2.5" }]
  ],
  navigator: [
    ["path", { d: "M9 7h9", opacity: ".7", "stroke-width": "2.6" }],
    ["path", { d: "M9 12h9", opacity: ".7", "stroke-width": "2.6" }],
    ["path", { d: "M4 17h14", "stroke-width": "2.8" }]
  ],
  sidebarCollapse: [
    ["rect", { x: "5", y: "5", width: "14", height: "14", rx: "1.6" }],
    ["path", { d: "M10 5v14" }]
  ],
  sidebarExpand: [
    ["rect", { x: "5", y: "5", width: "14", height: "14", rx: "1.6" }],
    ["path", { d: "M10 5v14" }]
  ],
  focusMode: [
    ["path", { d: "M12 7v14" }],
    ["path", { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" }],
    ["path", { d: "M6 8h2" }],
    ["path", { d: "M6 12h2" }],
    ["path", { d: "M16 8h2" }],
    ["path", { d: "M16 12h2" }]
  ],
  customizeTopbar: {
    viewBox: "0 0 117.6 154",
    children: [
      ["path", {
        d: "m92.8 9.5h-67.9c-5.5 0-9.5 2.7-9.5 8.5v41.5c-2.5 0.5-5.2 3.4-5.2 6.6v19c0 8.6 5.1 16.4 14.7 16.4l22.5 0.1v30.9c0 4.6 4.6 11 11.4 11s12.2-6.1 12.2-9.5v-32.4h21.3c6.4 0 15.6-5.2 15.6-15.2v-19.6c0-3-2.9-6.4-5.2-7.3v-41.5c0.1-4.4-4.8-8.5-9.9-8.5zm-3.3 16.9c1 0 1.9 0.6 2.4 1.3v32.2h-64.1v-32.6c1.1-3.1 3.2-4.1 6.1-4.1 5.6-0.2 7.4 5.2 11 7.7 1.3 0.9 2.5 1.4 5.7 1.4 4.3 0.3 5.6-5.3 9.1-5.2h2.2c4.1-0.2 6.5 7.8 12.6 7.8h1.4c4.9 0 9.2-5.5 9.8-6.5 1.2-1.4 2.6-2 3.8-2z",
        fill: "currentColor",
        stroke: "none"
      }],
      ["path", {
        d: "m94 9.4h-70c-4.1 0-8.8 2.5-8.8 7.2v42.8c-1.9 0.3-5.1 3.3-5.1 6.9v20.8c1.8 5.4 4.4 13.4 13.6 14l23.7 0.5v32.5c1.4 4.7 5.2 9.7 11.6 9.7 5 0.6 9.1-4.1 11.4-8l0.3-34.2 21 0.1c8.5 0 15.8-5.4 16.3-14.6v-20.8c-0.5-3.3-2.6-5.6-5.3-6.8l-0.1-42.9c-0.7-5.2-5.1-7.2-8.6-7.2zm-5.9 17.8h1.8c0.9 0 1.2 0.5 2 1v31.7h-64.3v-32.6c0.8-1.7 2.4-3.7 5.9-4 5.9-0.8 8.5 7.1 14 8.7 0.9 0.4 2.1 0.2 4.2 0.2 3.8 0 4.5-4.6 7.2-4.8h2.8c4.3-0.4 6.6 7.5 12.1 7.5 1.3 0.1 2.3 0 2.3 0 3.6 0.1 7-3.2 9-5.8 0.7-1 2-1.9 3-1.9z",
        fill: "currentColor",
        stroke: "none"
      }]
    ]
  },
  library: [
    ["path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }],
    ["path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" }],
    ["path", { d: "M8 6h8" }],
    ["path", { d: "M8 10h6" }]
  ],
  pocket: {
    viewBox: "0 43.5 107 95.5",
    children: [
      ["title", { textContent: "Pocket Icon" }],
      ["path", {
        d: "M84.06,83.31l-25.52,24a6.69,6.69,0,0,1-4.88,2.07,7.22,7.22,0,0,1-5.25-2.07l-25.14-24a7.59,7.59,0,0,1,0-10.51c2.81-2.63,7.5-3,10.32,0L53.66,92.13,74.11,72.8c2.63-3,7.32-2.63,10,0a8,8,0,0,1,0,10.51M97,43.53H10.32A10.1,10.1,0,0,0,0,53.47V85.56c0,29.08,24,53.29,53.66,53.29A53.5,53.5,0,0,0,107,85.56V53.47A9.89,9.89,0,0,0,97,43.53",
        fill: "#ef4056",
        "fill-rule": "evenodd",
        stroke: "none"
      }]
    ]
  },
  insert: [
    ["path", { d: "M9 10 4 15l5 5" }],
    ["path", { d: "M20 4v7a4 4 0 0 1-4 4H4" }]
  ],
  keyboard: [
    ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }],
    ["path", { d: "M7 9h.01" }],
    ["path", { d: "M11 9h.01" }],
    ["path", { d: "M15 9h.01" }],
    ["path", { d: "M7 13h.01" }],
    ["path", { d: "M11 13h6" }]
  ],
  transfer: [
    ["path", { d: "M7 7h11" }],
    ["path", { d: "m15 4 3 3-3 3" }],
    ["path", { d: "M17 17H6" }],
    ["path", { d: "m9 14-3 3 3 3" }]
  ],
  info: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "M12 11v5" }],
    ["path", { d: "M12 8h.01" }]
  ],
  left: [
    ["path", { d: "m12 19-7-7 7-7" }],
    ["path", { d: "M19 12H5" }]
  ],
  menu: [
    ["path", { d: "M4 6h16" }],
    ["path", { d: "M4 12h16" }],
    ["path", { d: "M4 18h16" }]
  ],
  moreTools: [
    ["polyline", { points: "4.5,4.75 10.75,12 4.5,19.25", "stroke-width": "2.35" }],
    ["polyline", { points: "13.25,4.75 19.5,12 13.25,19.25", "stroke-width": "2.35" }]
  ],
  more: [
    ["circle", { cx: "5", cy: "12", r: "1" }],
    ["circle", { cx: "12", cy: "12", r: "1" }],
    ["circle", { cx: "19", cy: "12", r: "1" }]
  ],
  plus: [
    ["path", { d: "M12 5v14" }],
    ["path", { d: "M5 12h14" }]
  ],
  preview: {
    viewBox: "0 0 16 16",
    children: [
      ["path", {
        d: "M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z",
        fill: "currentColor",
        stroke: "none"
      }],
      ["path", {
        d: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0",
        fill: "currentColor",
        stroke: "none"
      }]
    ]
  },
  reload: {
    viewBox: "3 3 18 18",
    children: [
      ["path", {
        d: "M12,20.75a7.25,7.25,0,0,1,0-14.5h2.5a.75.75,0,0,1,0,1.5H12a5.75,5.75,0,1,0,5.75,5.75.75.75,0,0,1,1.5,0A7.26,7.26,0,0,1,12,20.75Z",
        fill: "currentColor",
        stroke: "none"
      }],
      ["path", {
        d: "M12,10.75a.74.74,0,0,1-.53-.22.75.75,0,0,1,0-1.06L13.94,7,11.47,4.53a.75.75,0,1,1,1.06-1.06l3,3a.75.75,0,0,1,0,1.06l-3,3A.74.74,0,0,1,12,10.75Z",
        fill: "currentColor",
        stroke: "none"
      }]
    ]
  },
  reset: {
    viewBox: "128 104 256 288",
    children: [
      ["path", {
        d: "M208.75 153.5c1.74-.77 3.5-1.48 5.28-2.16a117.29 117.29 0 0 1 41.78-7.68c32.4 0 61.76 13.15 83 34.39l.87.94c20.73 21.19 33.51 50.17 33.51 82.06 0 32.41-13.15 61.77-34.38 83.01-21.24 21.24-50.6 34.39-83 34.39-30.53 0-58.4-11.71-79.31-30.89l-.93-.92c-20.54-19.27-34.18-45.83-36.72-75.48-.74-9.03 5.98-16.97 15.02-17.7 9.03-.74 16.97 5.99 17.7 15.02 1.83 21.34 11.58 40.4 26.24 54.21l.89.76c15 13.74 35.06 22.15 57.11 22.15 23.34 0 44.49-9.47 59.78-24.76 15.29-15.29 24.76-36.45 24.76-59.79 0-23.01-9.14-43.86-23.97-59.05l-.79-.74c-15.29-15.28-36.44-24.75-59.78-24.75-10.65 0-20.8 1.94-30.11 5.49l-2.87 1.15 16.87 6.09c8.5 3.04 12.92 12.42 9.88 20.92-3.05 8.49-12.43 12.92-20.92 9.88l-54.21-19.56c-8.5-3.04-12.93-12.43-9.88-20.92l18.63-51.66c3.04-8.49 12.42-12.92 20.92-9.87 8.49 3.04 12.92 12.42 9.88 20.91l-5.25 14.56z",
        fill: "currentColor",
        "fill-rule": "nonzero",
        stroke: "none"
      }]
    ]
  },
  home: [
    ["path", { d: "m3 10.5 9-7.5 9 7.5" }],
    ["path", { d: "M5 10v10h14V10" }],
    ["path", { d: "M9 20v-6h6v6" }]
  ],
  right: [
    ["path", { d: "m12 5 7 7-7 7" }],
    ["path", { d: "M5 12h14" }]
  ],
  send: [
    ["path", { d: "m22 2-7 20-4-9-9-4Z" }],
    ["path", { d: "M22 2 11 13" }]
  ],
  sparkles: [
    ["path", { d: "m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7Z" }],
    ["path", { d: "m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z" }],
    ["path", { d: "m5 14 .8 1.7L7.5 16.5l-1.7.8L5 19l-.8-1.7-1.7-.8 1.7-.8Z" }]
  ],
  summary: [
    ["path", {
      d: "M4 4.5h3v3H4v-3zm5 0h11v3H9v-3zm-5 6h3v3H4v-3zm5 0h11v3H9v-3zm-5 6h3v3H4v-3zm5 0h11v3H9v-3z",
      fill: "currentColor",
      stroke: "none"
    }]
  ],
  maximize: [
    ["path", { d: "M8 3H5a2 2 0 0 0-2 2v3" }],
    ["path", { d: "M16 3h3a2 2 0 0 1 2 2v3" }],
    ["path", { d: "M8 21H5a2 2 0 0 1-2-2v-3" }],
    ["path", { d: "M16 21h3a2 2 0 0 0 2-2v-3" }]
  ],
  minimize: [
    ["path", { d: "M8 3v3a2 2 0 0 1-2 2H3" }],
    ["path", { d: "M21 8h-3a2 2 0 0 1-2-2V3" }],
    ["path", { d: "M3 16h3a2 2 0 0 1 2 2v3" }],
    ["path", { d: "M16 21v-3a2 2 0 0 1 2-2h3" }]
  ],
  history: [
    ["path", { d: "M3 12a9 9 0 1 0 3-6.7" }],
    ["path", { d: "M3 4v5h5" }],
    ["path", { d: "M12 7v5l3 2" }]
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }]
  ]
};
const state = {
  options: null,
  customConfig: [],
  promptLibrary: [],
  promptSendHistory: [],
  promptHistoryCursor: PROMPT_HISTORY_LIVE_CURSOR,
  promptHistoryDraft: "",
  pocketEntries: [],
  shortcutConfig: null,
  groups: [],
  activeTabs: {},
  frameLoadingInstanceIds: [],
  temporaryLayoutPreset: null,
  fullscreenGroupId: null,
  promptText: "",
  promptImages: [],
  promptSendInFlight: false,
  promptSelection: { start: 0, end: 0, direction: "none" },
  preferredModelGateState: "bootstrapping",
  preferredModelGateReason: "",
  preferredModelGatePendingCount: 0,
  preferredModelGateFailedCount: 0,
  preferredModelGateFailedAppIds: [],
  summaryOpen: false,
  summaryMaximized: false,
  summarySize: null,
  summaryBusy: false,
  summaryStatus: "",
  summaryError: "",
  summaryNotice: "",
  summaryLoadingPhase: "",
  summaryPreviewItems: [],
  summaryPreviewRefreshingKeys: [],
  summaryContexts: [],
  summaryDiagnostics: [],
  summaryExpandedKeys: [],
  summaryResult: "",
  summaryQuestion: "",
  summaryComposing: false,
  summaryView: "preview",
  summarySettingsTab: "ai",
  faviconCache: {},
  shortcutDraftConfig: null,
  shortcutRecordingAction: "",
  shortcutSettingsTab: "input",
  summaryCollectorEditingId: "",
  summaryCollectorDragId: "",
  messageNavigatorSiteExpandedId: "",
  messageNavigatorSettingsTab: "effects",
  settingsAppsTab: "builtIn",
  settingsPromptTemplateDragId: "",
  settingsPromptLibraryDragId: "",
  settingsProfileDragId: "",
  settingsBuiltinAppDragId: "",
  settingsCustomAppDragId: "",
  settingsAppearanceTab: "workspace",
  settingsTopbarPromptPlaceholderDraft: "",
  settingsTopbarPromptPlaceholderEditingIndex: -1,
  settingsTopbarPromptPlaceholderDragIndex: "",
  settingsTabGroupButtonPlacementDraft: null,
  settingsTabGroupButtonOrderDraft: null,
  settingsTabGroupButtonDragId: "",
  modelPreferenceDraft: null,
  topbarEditMode: false,
  topbarEditLayoutDraft: null,
  topbarEditDragId: ""
};

function svgIcon(name) {
  const iconSpec = ICONS[name];
  const iconChildren = Array.isArray(iconSpec) ? iconSpec : iconSpec?.children || [];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "svg-icon");
  svg.setAttribute("viewBox", Array.isArray(iconSpec) ? "0 0 24 24" : iconSpec?.viewBox || "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const [tag, attrs] of iconChildren) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "textContent") child.textContent = value;
      else child.setAttribute(key, value);
    }
    svg.append(child);
  }
  return svg;
}

function svgBrandNode(spec) {
  const [tag, attrs = {}, children = []] = spec;
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "textContent") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children || []) {
    node.append(Array.isArray(child) ? svgBrandNode(child) : document.createTextNode(String(child)));
  }
  return node;
}

function shortcutTooltip(label, action, digitLabel = "") {
  const shortcut = formatShortcut(action, state.shortcutConfig?.shortcuts?.[action], digitLabel);
  if (!shortcut || shortcut === "Disabled" || shortcut === "Unassigned") return label;
  return `${label} (${shortcut})`;
}

function actionButton(label, iconName, onClick, variant = "secondary", tooltipLabel = label, tooltipPlacement = "", className = "", tooltipId = "") {
  return createActionButton({ label, icon: svgIcon(iconName), onClick, variant, tooltipLabel, tooltipPlacement, className, tooltipId });
}

function topIconButton(label, iconName, onClick, tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return createTopIconButton({ label, icon: svgIcon(iconName), onClick, tooltipLabel, tooltipPlacement, tooltipId });
}

function compactIconButton(label, iconName, onClick, extraClass = "", tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return createCompactIconButton({ label, icon: svgIcon(iconName), onClick, className: extraClass, tooltipLabel, tooltipPlacement, tooltipId });
}

function topbarItemClass(id) {
  return `topbar-item topbar-item-${id}`;
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

const appContext = createAppContext({
  state,
  svgIcon,
  syncPromptInputNode,
  ensurePromptInputReady: ensurePreferredModelInputReady
});
const optimizeController = createOptimizeController(appContext);
let settingsController;
const workspaceController = createWorkspaceController({
  state,
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
  formatShortcut,
  onFrameLifecycleChange: handlePreferredModelFrameLifecycleChange,
  openCustomAppEditor: () => settingsController?.openCustomAppEditor?.()
});
const pocketController = createPocketController({
  state,
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
const summaryController = createSummaryController({
  state,
  svgIcon,
  compactIconButton,
  currentFrames: workspaceController.currentFrames,
  frameApp: workspaceController.frameApp,
  setFramePointerBlockedForOverlay: workspaceController.setFramePointerBlockedForOverlay,
  findFrameForSummarySource: workspaceController.findFrameForSummarySource,
  highlightFrameForSummarySource: workspaceController.highlightFrameForSummarySource,
  inferAppName,
  effectiveFaviconUrl,
  discoverDeclaredFaviconUrl,
  rememberFaviconUrl,
  fallbackFaviconUrl,
  browserFaviconUrl,
  formatShortcut,
  pocketPort: {
    save: pocketController.saveSummaryPreviewToPocket,
    entries: pocketController.pocketEntriesFromSummaryPreview
  }
});
settingsController = createSettingsController({
  state,
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
  hydrateGroups: workspaceController.hydrateGroups,
  enterTopbarEditMode,
  openTabUrl: workspaceController.openTabUrl
});

function topbarPromptPlaceholderConfig() {
  return normalizeTopbarPromptPlaceholderConfig(state.options?.topbarPromptPlaceholderConfig);
}

function pickTopbarPromptPlaceholderIndex(itemCount, config, promptState, advance) {
  if (itemCount <= 0) return -1;
  if (itemCount === 1) {
    promptState.index = 0;
    promptState.lastRandom = 0;
    return 0;
  }

  if (config.order === "random") {
    if (!advance) {
      if (promptState.index >= 0 && promptState.index < itemCount) return promptState.index;
      promptState.index = 0;
      promptState.lastRandom = 0;
      return 0;
    }
    let next = Math.floor(Math.random() * itemCount);
    const previous = promptState.index >= 0 && promptState.index < itemCount ? promptState.index : promptState.lastRandom;
    let guard = 0;
    while (next === previous && guard < 10) {
      next = Math.floor(Math.random() * itemCount);
      guard += 1;
    }
    promptState.index = next;
    promptState.lastRandom = next;
    return next;
  }

  if (!advance) {
    if (promptState.index >= 0 && promptState.index < itemCount) return promptState.index;
    promptState.index = 0;
    return 0;
  }
  const previous = promptState.index >= -1 && promptState.index < itemCount ? promptState.index : -1;
  const next = (previous + 1) % itemCount;
  promptState.index = next;
  return next;
}

function applyTopbarPromptPlaceholderSelection({ advance = false } = {}) {
  const config = topbarPromptPlaceholderConfig();
  const items = config.items || [];
  if (!items.length) {
    topbarPromptPlaceholderValue = "";
    state.options = {
      ...state.options,
      topbarPromptPlaceholderConfig: config
    };
    return { changed: false, config };
  }

  const previousState = JSON.stringify(config.state || {});
  const nextState = { ...(config.state || {}) };
  const index = pickTopbarPromptPlaceholderIndex(items.length, config, nextState, advance);
  const nextConfig = {
    ...config,
    state: nextState
  };
  state.options = {
    ...state.options,
    topbarPromptPlaceholderConfig: nextConfig
  };
  topbarPromptPlaceholderValue = items[index] || items[0] || "";
  return {
    changed: previousState !== JSON.stringify(nextState),
    config: nextConfig
  };
}

function topbarPromptPlaceholderTimerConfigKey(config) {
  return [
    config.mode,
    config.order,
    config.intervalSec,
    ...(config.items || [])
  ].join("\u0001");
}

function stopTopbarPromptPlaceholderTimer() {
  if (!topbarPromptPlaceholderTimer) return;
  clearInterval(topbarPromptPlaceholderTimer);
  topbarPromptPlaceholderTimer = 0;
  topbarPromptPlaceholderTimerKey = "";
}

function restartTopbarPromptPlaceholderTimer() {
  const config = topbarPromptPlaceholderConfig();
  const items = config.items || [];
  if (config.mode !== "interval" || items.length <= 1) {
    stopTopbarPromptPlaceholderTimer();
    return;
  }
  const key = topbarPromptPlaceholderTimerConfigKey(config);
  if (topbarPromptPlaceholderTimer && topbarPromptPlaceholderTimerKey === key) return;
  stopTopbarPromptPlaceholderTimer();
  topbarPromptPlaceholderTimerKey = key;
  topbarPromptPlaceholderTimer = setInterval(() => {
    applyTopbarPromptPlaceholderSelection({ advance: true });
    syncTopbar();
  }, Math.max(1, config.intervalSec) * 1000);
}

async function initializeTopbarPromptPlaceholder() {
  const config = topbarPromptPlaceholderConfig();
  const shouldAdvance = config.mode === "refresh" && (config.items || []).length > 0;
  const result = applyTopbarPromptPlaceholderSelection({ advance: shouldAdvance });
  if (shouldAdvance && result.changed) {
    state.options = await saveOptions(state.options);
    applyTopbarPromptPlaceholderSelection({ advance: false });
  }
  restartTopbarPromptPlaceholderTimer();
}

function syncTopbarPromptPlaceholder() {
  applyTopbarPromptPlaceholderSelection({ advance: false });
  restartTopbarPromptPlaceholderTimer();
  syncTopbar();
}

function promptPlaceholder() {
  return topbarPromptPlaceholderValue || t("topbar.promptPlaceholder");
}

function menuButton(label, iconName, onClick, variant = "secondary", disabled = false, tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return createMenuButton({ label, icon: svgIcon(iconName), onClick, variant, disabled, tooltipLabel, tooltipPlacement, tooltipId });
}

function allApps() {
  return getAllChatApps(state.customConfig, state.options?.builtinChatAppOrder);
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

function browserFaviconUrl(href) {
  try {
    const pageUrl = new URL(String(href || ""), location.href);
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return "";
    if (globalThis.chrome?.runtime?.getURL) {
      const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
      faviconUrl.searchParams.set("pageUrl", pageUrl.href);
      faviconUrl.searchParams.set("size", "32");
      return faviconUrl.href;
    }
  } catch {
  }
  return "";
}

function faviconCacheKeys(href) {
  try {
    const pageUrl = new URL(String(href || ""), location.href);
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return [];
    pageUrl.hash = "";
    const full = pageUrl.href;
    const path = `${pageUrl.origin}${pageUrl.pathname || "/"}`;
    return Array.from(new Set([full, path, pageUrl.origin, pageUrl.hostname].filter(Boolean)));
  } catch {
    return [];
  }
}

function normalizeFaviconCache(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const url = typeof entry === "string" ? entry : entry?.url;
    if (!url) continue;
    next[key] = {
      url: String(url),
      updatedAt: Number(entry?.updatedAt || 0) || 0
    };
  }
  return next;
}

function isCacheableFaviconUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSiteFaviconForPage(href, logoUrl) {
  try {
    const pageUrl = new URL(String(href || ""), location.href);
    const iconUrl = new URL(String(logoUrl || ""), pageUrl.href);
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return false;
    if (iconUrl.protocol !== "http:" && iconUrl.protocol !== "https:") return false;
    if (iconUrl.origin !== pageUrl.origin) return false;
    const path = iconUrl.pathname.toLowerCase();
    return path === "/favicon.ico"
      || path.includes("/favicon")
      || path.includes("apple-touch-icon")
      || path.includes("touch-icon");
  } catch {
    return false;
  }
}

function chooseDeclaredFaviconUrl(doc, href) {
  try {
    const pageUrl = new URL(String(href || ""), location.href);
    const candidates = Array.from(doc.querySelectorAll("link[rel][href]"))
      .map((link, index) => {
        const rel = String(link.getAttribute("rel") || "").toLowerCase();
        if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
        const hrefValue = String(link.getAttribute("href") || "").trim();
        if (!hrefValue) return null;
        let url = "";
        try { url = new URL(hrefValue, pageUrl.href).href; } catch { return null; }
        if (!isSiteFaviconForPage(pageUrl.href, url)) return null;
        const sizes = String(link.getAttribute("sizes") || "").toLowerCase();
        const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
        const type = String(link.getAttribute("type") || "").toLowerCase();
        const relScore = rel.includes("shortcut icon") ? 0 : rel.includes("icon") ? 1 : rel.includes("apple-touch-icon") ? 3 : 4;
        const typeScore = type.includes("png") || type.includes("x-icon") || type.includes("icon") ? 0 : 1;
        return { url, score: relScore * 100 + sizeScore * 10 + typeScore, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.index - b.index);
    return candidates[0]?.url || "";
  } catch {
    return "";
  }
}

async function discoverDeclaredFaviconUrl(href) {
  const cacheUrl = cachedFaviconUrl(href);
  if (cacheUrl) return cacheUrl;
  let pageUrl;
  try {
    pageUrl = new URL(String(href || ""), location.href);
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return "";
    pageUrl.hash = "";
  } catch {
    return "";
  }
  const key = pageUrl.origin;
  if (faviconDiscoveryPromises.has(key)) return faviconDiscoveryPromises.get(key);
  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(pageUrl.href, {
        cache: "force-cache",
        credentials: "omit",
        signal: controller.signal
      });
      if (!response.ok) return "";
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const logoUrl = chooseDeclaredFaviconUrl(doc, pageUrl.href);
      if (logoUrl) rememberFaviconUrl(pageUrl.href, logoUrl);
      return logoUrl;
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
      faviconDiscoveryPromises.delete(key);
    }
  })();
  faviconDiscoveryPromises.set(key, promise);
  return promise;
}

function pruneFaviconCache(cache) {
  return Object.fromEntries(Object.entries(cache)
    .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
    .slice(0, FAVICON_CACHE_MAX_ENTRIES));
}

function cachedFaviconUrl(href) {
  for (const key of faviconCacheKeys(href)) {
    const url = state.faviconCache?.[key]?.url;
    if (url && isSiteFaviconForPage(href, url)) return url;
  }
  return "";
}

function persistFaviconCacheSoon() {
  clearTimeout(faviconCachePersistTimer);
  faviconCachePersistTimer = setTimeout(() => {
    storageSet(FAVICON_CACHE_KEY, state.faviconCache).catch(() => {});
  }, 300);
}

function rememberFaviconUrl(href, logoUrl) {
  if (!isSiteFaviconForPage(href, logoUrl) || !isCacheableFaviconUrl(logoUrl)) return;
  const keys = faviconCacheKeys(href);
  if (!keys.length) return;
  const updatedAt = Date.now();
  for (const key of keys) state.faviconCache[key] = { url: String(logoUrl), updatedAt };
  state.faviconCache = pruneFaviconCache(state.faviconCache);
  persistFaviconCacheSoon();
}

function effectiveFaviconUrl(href, declaredLogoUrl = "") {
  if (isSiteFaviconForPage(href, declaredLogoUrl)) return new URL(String(declaredLogoUrl), String(href || location.href)).href;
  return cachedFaviconUrl(href) || browserFaviconUrl(href);
}

function appFaviconUrl(app) {
  return effectiveFaviconUrl(app?.url || "");
}

function fallbackFaviconUrl(app) {
  const label = inferAppName(app).replace(/\s+/g, "").slice(0, 2).toUpperCase() || "AI";
  const hue = Array.from(String(app?.id || app?.url || label)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="hsl(${hue} 48% 36%)"/><text x="16" y="21" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
    await chrome.runtime.sendMessage({ source: "chatclub", action: "reloadConfigs", data: {} });
  } catch (error) {
    console.warn("[ChatClub] Failed to reload background config", error);
  }
}

function resetPromptHistoryNavigation() {
  state.promptHistoryCursor = PROMPT_HISTORY_LIVE_CURSOR;
  state.promptHistoryDraft = "";
}

function inferPromptImageExtension(mime) {
  const token = String(mime || "").trim().toLowerCase();
  if (token === "image/jpeg") return "jpg";
  if (token === "image/png") return "png";
  if (token === "image/webp") return "webp";
  if (token === "image/gif") return "gif";
  if (token === "image/bmp") return "bmp";
  if (token === "image/svg+xml") return "svg";
  if (token === "image/avif") return "avif";
  const tail = token.split("/").pop();
  return tail ? tail.replace(/[^a-z0-9]+/gi, "") || "png" : "png";
}

function splitPromptImageFileName(name) {
  const raw = String(name || "").trim().replace(/[\\/]+/g, "_");
  if (!raw) return { stem: "", ext: "" };
  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex <= 0) return { stem: raw, ext: "" };
  return { stem: raw.slice(0, dotIndex) || raw, ext: raw.slice(dotIndex) };
}

function defaultPromptImageName(index = 0, type = "") {
  const ext = inferPromptImageExtension(type);
  return `prompt-image-${Math.max(0, Number(index) || 0) + 1}${ext ? `.${ext}` : ""}`;
}

function claimPromptImageName(rawName, usedNames, index = 0, type = "") {
  const registry = usedNames instanceof Set ? usedNames : new Set();
  const fallbackName = defaultPromptImageName(index, type);
  const preferred = String(rawName || "").trim().replace(/[\\/]+/g, "_") || fallbackName;
  const preferredKey = preferred.toLowerCase();
  if (!registry.has(preferredKey)) {
    registry.add(preferredKey);
    return preferred;
  }
  const preferredParts = splitPromptImageFileName(preferred);
  const fallbackParts = splitPromptImageFileName(fallbackName);
  const stem = preferredParts.stem || fallbackParts.stem || "prompt-image";
  const ext = preferredParts.ext || fallbackParts.ext;
  let counter = 2;
  while (counter < 10000) {
    const candidate = `${stem} (${counter})${ext}`;
    const key = candidate.toLowerCase();
    if (!registry.has(key)) {
      registry.add(key);
      return candidate;
    }
    counter += 1;
  }
  return fallbackName;
}

function inferPromptImageMimeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
  return match ? match[1].toLowerCase() : "";
}

function normalizePromptImageEntry(value, index = 0, usedNames = new Set()) {
  if (!value || typeof value !== "object") return null;
  const dataUrl = String(value.dataUrl || value.dataURL || "").trim();
  if (!/^data:image\//i.test(dataUrl)) return null;
  const type = String(value.type || "").trim().toLowerCase() || inferPromptImageMimeFromDataUrl(dataUrl) || "image/png";
  const name = claimPromptImageName(value.name, usedNames, index, type);
  const lastModifiedRaw = Number(value.lastModified);
  return {
    id: String(value.id || "").trim() || createId("prompt-image"),
    name,
    type,
    size: Math.max(0, Math.round(Number(value.size) || 0)),
    lastModified: Number.isFinite(lastModifiedRaw) ? lastModifiedRaw : Date.now(),
    dataUrl
  };
}

function normalizePromptImages(value) {
  const usedNames = new Set();
  return (Array.isArray(value) ? value : [])
    .map((entry, index) => normalizePromptImageEntry(entry, index, usedNames))
    .filter(Boolean);
}

function promptHasImages(images = state.promptImages) {
  return normalizePromptImages(images).length > 0;
}

function promptHasContent(text = state.promptText, images = state.promptImages) {
  return String(text || "").trim().length > 0 || promptHasImages(images);
}

function promptImageSendTimeoutMs(images = [], retryCount = PROMPT_IMAGE_RETRY_COUNT) {
  if (!normalizePromptImages(images).length) return 0;
  return PROMPT_IMAGE_SEND_DEADLINE_MS;
}

function readPromptImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Invalid image file"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

async function promptImageEntryFromFile(file, index = 0) {
  const dataUrl = await readPromptImageFileAsDataUrl(file);
  return normalizePromptImageEntry({
    id: createId("prompt-image"),
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    dataUrl
  }, index);
}

function extractPromptImageFilesFromTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files || [])
    .filter((file) => file && String(file.type || "").startsWith("image/"));
  if (files.length) return files;
  return Array.from(dataTransfer.items || [])
    .filter((item) => item?.kind === "file" && String(item.type || "").startsWith("image/"))
    .map((item) => item.getAsFile?.())
    .filter(Boolean);
}

function transferHasPromptImages(dataTransfer) {
  return extractPromptImageFilesFromTransfer(dataTransfer).length > 0;
}

function renderPromptImagePreview(image) {
  return el("div", { class: "prompt-image-chip", title: image.name || t("topbar.imageAttachment") },
    el("img", {
      src: image.dataUrl,
      alt: image.name || t("topbar.imageAttachment"),
      loading: "lazy"
    }),
    el("button", {
      class: "prompt-image-remove prompt-image-remove-visible compact-icon tooltip-trigger",
      type: "button",
      disabled: preferredModelInputGateIsLocked(),
      "aria-label": t("topbar.removeImage"),
      "data-tooltip": t("topbar.removeImage"),
      "data-tooltip-id": "topbar.removeImage",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        removePromptImage(image.id);
      },
      onpointerdown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onkeydown: (event) => event.stopPropagation()
    }, svgIcon("x"))
  );
}

function renderCollapsedPromptImages(images = state.promptImages) {
  const promptImages = normalizePromptImages(images);
  if (!promptImages.length) return null;
  const visibleImages = promptImages.slice(0, 3);
  return el("span", { class: "prompt-collapsed-preview-images", "aria-hidden": "true" },
    visibleImages.map((image) => el("img", {
      class: "prompt-collapsed-preview-thumb",
      src: image.dataUrl,
      alt: "",
      loading: "lazy",
      draggable: "false"
    })),
    promptImages.length > visibleImages.length
      ? el("span", { class: "prompt-collapsed-preview-more" }, `+${promptImages.length - visibleImages.length}`)
      : null
  );
}

function renderCollapsedPromptPreviewContent(collapsed, images = state.promptImages) {
  return [
    renderCollapsedPromptImages(images),
    el("span", { class: "prompt-collapsed-preview-text" }, collapsed.text)
  ].filter(Boolean);
}

function syncPromptImagesPreview() {
  const images = normalizePromptImages(state.promptImages);
  const hasImages = images.length > 0;
  document.querySelectorAll(".prompt-shell").forEach((shell) => {
    shell.classList.toggle("prompt-shell-has-images", hasImages);
    const list = shell.querySelector(".prompt-image-preview-list");
    if (list) {
      list.replaceChildren(...images.map((image) => renderPromptImagePreview(image)));
      list.hidden = !hasImages;
    }
  });
}

function setPromptImages(images, { focus = false, bypassModelGate = false } = {}) {
  if (!bypassModelGate && !ensurePreferredModelInputReady()) {
    restorePreferredModelLockedPromptSnapshot();
    return state.promptImages;
  }
  state.promptImages = normalizePromptImages(images);
  resetPromptHistoryNavigation();
  syncPromptImagesPreview();
  const inputNode = syncPromptInputNode({ focus });
  if (focus && inputNode) expandPromptInput(inputNode);
  return state.promptImages;
}

function removePromptImage(id) {
  setPromptImages(state.promptImages.filter((image) => image.id !== id), { focus: true });
}

function clearPromptImages() {
  setPromptImages([], { focus: true });
}

async function addPromptImageFiles(fileList, { focus = true } = {}) {
  if (!ensurePreferredModelInputReady()) return [];
  const files = Array.from(fileList || []).filter((file) => String(file?.type || "").startsWith("image/"));
  if (!files.length) {
    toast(t("toast.promptNoImages"), "error");
    return [];
  }
  const entries = [];
  for (const file of files) {
    try {
      const entry = await promptImageEntryFromFile(file, state.promptImages.length + entries.length);
      if (entry) entries.push(entry);
    } catch (error) {
      console.warn("[ChatClub] Failed to load prompt image", error);
    }
  }
  if (!entries.length) {
    toast(t("toast.promptImageLoadFailed"), "error");
    return [];
  }
  const nextImages = setPromptImages([...state.promptImages, ...entries], { focus });
  toast(t("toast.promptImagesAdded", { count: entries.length, total: nextImages.length }), "success");
  return entries;
}

function openPromptImagePicker(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!ensurePreferredModelInputReady()) return;
  const inputNode = event?.currentTarget?.closest?.(".prompt-shell")?.querySelector?.(".prompt-image-file-input")
    || document.querySelector(".prompt-image-file-input");
  try { inputNode?.click?.(); } catch {}
}

function closePromptActionsMenu() {
  document.querySelectorAll(".prompt-actions-backdrop, .prompt-actions-popover").forEach((node) => node.remove());
  document.querySelectorAll(".prompt-actions-button-active").forEach((node) => node.classList.remove("prompt-actions-button-active"));
  document.removeEventListener("keydown", closePromptActionsMenuOnKeydown, true);
  window.removeEventListener("resize", closePromptActionsMenu, true);
  window.removeEventListener("scroll", closePromptActionsMenu, true);
  window.removeEventListener("blur", closePromptActionsMenu, true);
}

function closePromptActionsMenuOnKeydown(event) {
  if (event.key === "Escape") closePromptActionsMenu();
}

function promptActionsMenuItem(label, iconName, onClick) {
  return el("button", {
    class: "button button-secondary menu-button prompt-actions-menu-button",
    type: "button",
    role: "menuitem",
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePromptActionsMenu();
      onClick?.(event);
    },
    onpointerdown: (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
    }
  },
    svgIcon(iconName),
    el("span", {}, label)
  );
}

function openPromptActionsMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!ensurePreferredModelInputReady()) return;
  const anchor = event?.currentTarget;
  if (!anchor) return;
  if (anchor.classList.contains("prompt-actions-button-active") && document.querySelector(".prompt-actions-popover")) {
    closePromptActionsMenu();
    return;
  }
  closePromptActionsMenu();
  closeSettingsJumpMenu();
  workspaceController?.closePopovers?.();
  anchor.classList.add("prompt-actions-button-active");
  const rect = anchor.getBoundingClientRect();
  const menuWidth = 236;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
  const top = Math.min(rect.bottom + 8, window.innerHeight - 8);
  const backdrop = el("div", {
    class: "popover-backdrop prompt-actions-backdrop",
    onpointerdown: (backdropEvent) => {
      backdropEvent.preventDefault();
      closePromptActionsMenu();
    },
    oncontextmenu: (backdropEvent) => {
      backdropEvent.preventDefault();
      closePromptActionsMenu();
    }
  });
  const menu = el("div", {
    class: "popover-menu prompt-actions-popover",
    role: "menu",
    style: { top: `${top}px`, left: `${left}px` },
    onpointerdown: (menuEvent) => menuEvent.stopPropagation(),
    onclick: (menuEvent) => menuEvent.stopPropagation()
  },
    promptActionsMenuItem(t("topbar.addPhotos"), "paperclip", openPromptImagePicker),
    promptActionsMenuItem(t("topbar.promptLibrary"), "library", openPromptLibraryDialog),
    promptActionsMenuItem(t("topbar.optimizePrompt"), "sparkles", optimizeCurrentPrompt)
  );
  document.body.append(backdrop, menu);
  document.addEventListener("keydown", closePromptActionsMenuOnKeydown, true);
  window.addEventListener("resize", closePromptActionsMenu, true);
  window.addEventListener("scroll", closePromptActionsMenu, true);
  window.addEventListener("blur", closePromptActionsMenu, true);
}

function handlePromptImageFileChange(event) {
  const inputNode = event.currentTarget;
  if (!ensurePreferredModelInputReady()) {
    try { inputNode.value = ""; } catch {}
    return;
  }
  addPromptImageFiles(inputNode.files, { focus: true }).finally(() => {
    try { inputNode.value = ""; } catch {}
  });
}

function handlePromptPaste(event) {
  if (preferredModelInputGateIsLocked()) {
    event.preventDefault();
    event.stopPropagation();
    notifyPreferredModelGateBlocked();
    return;
  }
  const files = extractPromptImageFilesFromTransfer(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  addPromptImageFiles(files, { focus: true });
}

function handlePromptDragEnter(event) {
  if (preferredModelInputGateIsLocked()) {
    event.preventDefault();
    event.currentTarget.classList.remove("prompt-shell-drag-over");
    return;
  }
  if (!transferHasPromptImages(event.dataTransfer)) return;
  event.preventDefault();
  event.currentTarget.classList.add("prompt-shell-drag-over");
}

function handlePromptDragOver(event) {
  if (preferredModelInputGateIsLocked()) {
    event.preventDefault();
    event.currentTarget.classList.remove("prompt-shell-drag-over");
    try { event.dataTransfer.dropEffect = "none"; } catch {}
    return;
  }
  if (!transferHasPromptImages(event.dataTransfer)) return;
  event.preventDefault();
  event.currentTarget.classList.add("prompt-shell-drag-over");
  try { event.dataTransfer.dropEffect = "copy"; } catch {}
}

function handlePromptDragLeave(event) {
  event.currentTarget.classList.remove("prompt-shell-drag-over");
}

function handlePromptDrop(event) {
  if (preferredModelInputGateIsLocked()) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("prompt-shell-drag-over");
    notifyPreferredModelGateBlocked();
    return;
  }
  const files = extractPromptImageFilesFromTransfer(event.dataTransfer);
  event.currentTarget.classList.remove("prompt-shell-drag-over");
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  addPromptImageFiles(files, { focus: true });
}

async function recordPromptSendHistory(text, images = []) {
  const value = String(text || "").trim();
  const promptImages = normalizePromptImages(images);
  if (!value && !promptImages.length) return;
  const next = normalizePromptSendHistory([
    { id: createId("prompt-history"), text: value, images: promptImages, createdAt: new Date().toISOString() },
    ...state.promptSendHistory
  ]);
  state.promptSendHistory = await savePromptSendHistory(next);
  resetPromptHistoryNavigation();
}

function sendPromptAppIsNotion(app = {}) {
  const id = String(app?.id || "").trim().toLowerCase();
  const name = String(app?.name || "").trim().toLowerCase();
  const url = String(app?.url || "");
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  return id === "notionai"
    || /\bnotion\b/.test(name)
    || host === "app.notion.com"
    || host === "notion.so"
    || host === "www.notion.so"
    || host.endsWith(".notion.so");
}

function promptImagePasteStrategyForApp(app = {}) {
  return normalizePromptImagePasteStrategy(app?.imagePasteStrategy);
}

function sendPromptFrameHrefHints(iframe, app = {}) {
  const values = [
    iframe?.dataset?.currentHref,
    iframe?.dataset?.currentThreadHref,
    iframe?.src,
    iframe?.getAttribute?.("src"),
    app?.url
  ].map((item) => String(item || "").trim()).filter(Boolean);
  return Array.from(new Set(values));
}

async function ensureSendTextContentBridge(iframe, app = {}) {
  const tabId = await currentTabId();
  if (!tabId) return null;
  try {
    return await runtimeMessage({
      source: "chatclub",
      action: "ensureContentBridge",
      tabId,
      hrefs: sendPromptFrameHrefHints(iframe, app)
    });
  } catch (error) {
    console.warn("[ChatClub] Failed to ensure send text bridge", error);
    return { error: error?.message || String(error) };
  }
}

function sendTextTimeoutError(error) {
  return String(error?.message || error || "").includes("[PostMessage] Timeout waiting for response: sendText");
}

async function sendTextToFrame(iframe, app = {}, text = "", images = [], sendId = "", deadlineAt = 0) {
  const notion = sendPromptAppIsNotion(app);
  const promptImages = normalizePromptImages(images);
  const imageRetryCount = PROMPT_IMAGE_RETRY_COUNT;
  const timeout = promptImages.length ? promptImageSendTimeoutMs(promptImages, imageRetryCount) : (notion ? 12000 : 10000);
  const sendDeadlineAt = Number(deadlineAt) > Date.now() ? Number(deadlineAt) : Date.now() + timeout;
  const payload = {
    sendId,
    deadlineAt: sendDeadlineAt,
    text,
    images: promptImages,
    imageRetryCount,
    imagePasteStrategy: promptImagePasteStrategyForApp(app),
    appId: app.id,
    appName: app.name,
    inputSelector: app.inputSelector,
    sendButtonSelector: app.sendButtonSelector,
    sendKeyMode: state.shortcutConfig?.sendKeyMode || "enter"
  };
  const options = { source: SEND_TEXT_POST_MESSAGE_SOURCE };
  if (notion || promptImages.length) {
    await ensureSendTextContentBridge(iframe, app);
    await sleep(120);
  }
  const remainingMs = Math.max(1000, sendDeadlineAt - Date.now());
  const sendOnce = () => sendToIframe(iframe, "sendText", payload, remainingMs, options);
  armPreferredModelSubmissionNavigation(iframe, sendId, sendDeadlineAt);
  let result;
  try {
    result = await sendOnce();
  } catch (error) {
    finishPreferredModelSubmissionNavigation(iframe, sendId, false);
    throw error;
  }
  if (result?.sent === false && /bridge timed out/i.test(String(result?.reason || ""))) {
    finishPreferredModelSubmissionNavigation(iframe, sendId, false);
    throw new Error(result?.reason || "Send failed");
  }
  if (!result || result.sent === false) {
    finishPreferredModelSubmissionNavigation(iframe, sendId, false);
    throw new Error(result?.reason || "Send failed");
  }
  finishPreferredModelSubmissionNavigation(iframe, sendId, true);
  return result;
}

async function sendPromptToFrames() {
  if (state.promptSendInFlight) return;
  if (!ensurePreferredModelInputReady()) return;
  const text = state.promptText.trim();
  const images = normalizePromptImages(state.promptImages);
  if (!promptHasContent(text, images)) return;
  const frames = workspaceController.currentFrames();
  if (!frames.length) return;
  const targets = frames.map((iframe) => ({ iframe, app: workspaceController.frameApp(iframe) || {} }));
  const sendId = createId("prompt-send");
  const timeoutMs = images.length ? promptImageSendTimeoutMs(images, PROMPT_IMAGE_RETRY_COUNT) : 12000;
  const deadlineAt = Date.now() + timeoutMs;
  state.promptSendInFlight = true;
  syncPromptSendButton();
  try {
    const sendTasks = targets.map(async ({ iframe, app }) => {
      const statusToast = createFrameToast(
        iframe,
        t("toast.frameSubmitPending"),
        "info",
        state.options?.frameToastPosition
      );
      try {
        const result = await sendTextToFrame(iframe, app, text, images, sendId, deadlineAt);
        statusToast.update(t("toast.frameSubmitSuccess"), "success");
        statusToast.dismiss(2000);
        return result;
      } catch (error) {
        const rawReason = String(error?.message || error || "").replace(/\s+/g, " ").trim();
        const reasonChars = Array.from(rawReason || t("toast.frameSubmitFailureFallback"));
        const reason = reasonChars.length > FRAME_SUBMIT_ERROR_MAX_CHARS
          ? `${reasonChars.slice(0, FRAME_SUBMIT_ERROR_MAX_CHARS - 1).join("")}…`
          : reasonChars.join("");
        statusToast.update(t("toast.frameSubmitFailed", { reason }), "error");
        statusToast.dismiss(5000);
        throw error;
      }
    });
    const results = await Promise.allSettled(sendTasks);
    const failures = results
      .map((result, index) => ({ result, app: targets[index].app }))
      .filter((item) => item.result.status === "rejected");
    const successCount = results.length - failures.length;
    await recordPromptSendHistory(text, images);
    if (!failures.length) {
      clearPromptInput(null, { bypassModelGate: true });
      toast(t("toast.sentToChats", { count: successCount, plural: successCount === 1 ? "" : "s" }), "success");
      return;
    }
    const failureNames = failures
      .map((item) => inferAppName(item.app))
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    const names = failureNames || t("common.failed");
    if (successCount > 0) {
      toast(t("toast.sentToSomeChats", {
        sentCount: successCount,
        sentPlural: successCount === 1 ? "" : "s",
        names
      }), "error");
      return;
    }
    toast(t("toast.sendFailedToChats", { names }), "error");
  } finally {
    state.promptSendInFlight = false;
    syncPromptSendButton();
  }
}

function submitPromptFromComposer(source = null) {
  if (!ensurePreferredModelInputReady()) return;
  const inputNode = source?.classList?.contains?.("prompt-input")
    ? source
    : source?.currentTarget?.closest?.(".prompt-shell")?.querySelector?.(".prompt-input")
      || document.querySelector(".prompt-input");
  if (inputNode) {
    state.promptText = inputNode.value;
    rememberPromptSelection(inputNode);
    syncPromptCollapsedPreview(inputNode);
  }
  return sendPromptToFrames();
}

function preferredModelAppId(app) {
  return MODEL_PREFERENCE_APP_ID_ALIASES[String(app?.id || "")] || MODEL_PREFERENCE_APP_ID_ALIASES[String(app?.name || "")] || String(app?.id || "");
}

function preferredModelForApp(app) {
  const appId = preferredModelAppId(app);
  const preferences = state.modelPreferenceDraft || state.options?.modelPreferences || {};
  const modelId = String(preferences[appId] || "");
  if (!modelId) return "";
  return (MODEL_PREFERENCE_TARGETS[appId] || []).some((target) => target.id === modelId) ? modelId : "";
}

function preferredGeminiThinkingLevel() {
  const preferences = state.modelPreferenceDraft || state.options?.modelPreferences || {};
  const value = String(preferences[GEMINI_THINKING_LEVEL_PREFERENCE_KEY] || DEFAULT_GEMINI_THINKING_LEVEL);
  return GEMINI_THINKING_LEVEL_TARGETS.some((target) => target.id === value)
    ? value
    : DEFAULT_GEMINI_THINKING_LEVEL;
}

function preferredModelPayloadForApp(app) {
  const appId = preferredModelAppId(app);
  const modelId = preferredModelForApp(app);
  if (!modelId) return null;
  return {
    appId,
    modelId,
    ...(appId === "Gemini" && modelId === "pro" ? { thinkingLevel: preferredGeminiThinkingLevel() } : {})
  };
}

function preferredModelInputGateIsLocked() {
  return state.preferredModelGateState !== "ready";
}

function preferredModelPromptSnapshotFromState() {
  return {
    text: String(state.promptText || ""),
    images: normalizePromptImages(state.promptImages),
    selection: { ...(state.promptSelection || { start: 0, end: 0, direction: "none" }) }
  };
}

function capturePreferredModelLockedPromptSnapshot() {
  const inputNode = document.querySelector(".prompt-input");
  if (inputNode) {
    state.promptText = inputNode.value;
    rememberPromptSelection(inputNode);
  }
  preferredModelLockedPromptSnapshot = preferredModelPromptSnapshotFromState();
  return preferredModelLockedPromptSnapshot;
}

function restorePreferredModelLockedPromptSnapshot() {
  const snapshot = preferredModelLockedPromptSnapshot;
  if (!snapshot) return;
  state.promptText = snapshot.text;
  state.promptImages = normalizePromptImages(snapshot.images);
  state.promptSelection = { ...snapshot.selection };
  const inputNode = document.querySelector(".prompt-input");
  if (!inputNode) return;
  inputNode.value = snapshot.text;
  syncPromptCollapsedPreview(inputNode);
  restorePromptSelection(inputNode);
}

function notifyPreferredModelGateBlocked() {
  const now = Date.now();
  if (now - preferredModelGateBlockedToastAt < 1600) return;
  preferredModelGateBlockedToastAt = now;
  toast(t("toast.modelGateBlocked"), "info");
}

function ensurePreferredModelInputReady({ notify = true } = {}) {
  if (!preferredModelInputGateIsLocked()) return true;
  if (notify) notifyPreferredModelGateBlocked();
  return false;
}

function preferredModelTargetLabel(payload = {}) {
  const target = (MODEL_PREFERENCE_TARGETS[payload.appId] || [])
    .find((item) => item.id === payload.modelId);
  const baseLabel = String(target?.label || payload.modelId || payload.appId || "");
  if (payload.appId !== "Gemini" || payload.modelId !== "pro" || !payload.thinkingLevel) return baseLabel;
  const level = GEMINI_THINKING_LEVEL_TARGETS.find((item) => item.id === payload.thinkingLevel);
  return level?.label ? `${baseLabel} · ${level.label}` : baseLabel;
}

function compactPreferredModelFailureReason(result = {}) {
  const fallback = t("toast.frameModelSwitchFailureFallback");
  const raw = String(
    result.reason
      || (result.unavailable ? "unavailable" : "")
      || (result.unsupported ? "unsupported" : "")
      || fallback
  ).replace(/\s+/g, " ").trim();
  const chars = Array.from(raw || fallback);
  return chars.length > FRAME_SUBMIT_ERROR_MAX_CHARS
    ? `${chars.slice(0, FRAME_SUBMIT_ERROR_MAX_CHARS - 1).join("")}…`
    : chars.join("");
}

function preferredModelFrameIsLoading(iframe) {
  const instanceId = String(iframe?.dataset?.instanceId || "");
  return Boolean(instanceId && (state.frameLoadingInstanceIds || []).includes(instanceId));
}

function preferredModelConfiguredActiveFrames() {
  return workspaceController.currentFrames()
    .map((iframe) => ({
      iframe,
      app: workspaceController.frameApp(iframe) || {},
      payload: preferredModelPayloadForApp(workspaceController.frameApp(iframe) || {})
    }))
    .filter((item) => item.iframe?.isConnected && item.payload);
}

function preferredModelGateStatus() {
  const configuredFrames = preferredModelConfiguredActiveFrames();
  if (preferredModelGateBootstrapping) {
    return {
      state: "bootstrapping",
      reason: "",
      pendingCount: configuredFrames.length,
      failedCount: 0,
      failedAppIds: []
    };
  }

  let pendingCount = 0;
  const failures = [];
  for (const { iframe, payload } of configuredFrames) {
    if (preferredModelFrameIsLoading(iframe)) {
      pendingCount += 1;
      continue;
    }
    const key = preferredModelFrameKey(iframe);
    const record = preferredModelApplyRuns.get(iframe);
    if (record?.key === key && record.success) continue;
    if (record?.key === key && record.terminal) {
      failures.push({ appId: payload.appId, reason: record.failureReason || t("toast.frameModelSwitchFailureFallback") });
      continue;
    }
    pendingCount += 1;
  }

  if (failures.length) {
    return {
      state: "failed",
      reason: failures[0].reason,
      pendingCount,
      failedCount: failures.length,
      failedAppIds: Array.from(new Set(failures.map((item) => item.appId).filter(Boolean)))
    };
  }
  if (pendingCount > 0) {
    return { state: "applying", reason: "", pendingCount, failedCount: 0, failedAppIds: [] };
  }
  return { state: "ready", reason: "", pendingCount: 0, failedCount: 0, failedAppIds: [] };
}

function syncPreferredModelInputGate() {
  const next = preferredModelGateStatus();
  const wasLocked = preferredModelInputGateIsLocked();
  const willBeLocked = next.state !== "ready";
  if (willBeLocked && (!wasLocked || !preferredModelLockedPromptSnapshot)) {
    capturePreferredModelLockedPromptSnapshot();
  } else if (!willBeLocked) {
    preferredModelLockedPromptSnapshot = null;
  }

  state.preferredModelGateState = next.state;
  state.preferredModelGateReason = next.reason;
  state.preferredModelGatePendingCount = next.pendingCount;
  state.preferredModelGateFailedCount = next.failedCount;
  state.preferredModelGateFailedAppIds = next.failedAppIds;

  if (willBeLocked) closePromptActionsMenu();
  document.querySelectorAll(".prompt-shell").forEach((shell) => {
    const inputNode = shell.querySelector(".prompt-input");
    const composingHere = preferredModelPromptCompositionIsActive(inputNode);
    const applying = next.state === "bootstrapping" || next.state === "applying";
    const failed = next.state === "failed";
    shell.classList.toggle("prompt-shell-model-gate-applying", applying);
    shell.classList.toggle("prompt-shell-model-gate-failed", failed);
    shell.dataset.modelGateState = next.state;
    shell.dataset.modelGatePendingCount = String(next.pendingCount);
    shell.dataset.modelGateFailedCount = String(next.failedCount);
    shell.dataset.modelGateFailedAppIds = next.failedAppIds.join(",");
    shell.setAttribute("aria-busy", willBeLocked ? "true" : "false");

    if (inputNode) {
      inputNode.readOnly = willBeLocked && !composingHere;
      inputNode.dataset.modelGateState = next.state;
      inputNode.setAttribute("aria-busy", willBeLocked ? "true" : "false");
      if (willBeLocked) {
        inputNode.setAttribute("aria-label", failed
          ? t("topbar.modelGateFailedAria", { reason: next.reason })
          : t("topbar.modelGateApplyingAria"));
      } else {
        inputNode.removeAttribute("aria-label");
      }
    }

    shell.querySelectorAll(".prompt-actions-button, .prompt-image-file-input, .prompt-clear-button, .prompt-image-remove")
      .forEach((node) => { node.disabled = willBeLocked; });
    const sendButton = shell.querySelector(".prompt-send-button");
    if (sendButton) {
      sendButton.disabled = willBeLocked
        || state.promptSendInFlight
        || !promptHasContent(inputNode?.value ?? state.promptText, state.promptImages);
    }

    let statusNode = shell.querySelector(".prompt-model-gate-status");
    if (!statusNode) {
      statusNode = el("div", { class: "prompt-model-gate-status", "aria-live": "polite", "aria-atomic": "true" });
      shell.append(statusNode);
    }
    statusNode.hidden = !willBeLocked;
    if (willBeLocked) {
      const statusText = failed
        ? t("topbar.modelGateFailed", { reason: next.reason })
        : t("topbar.modelGateApplying");
      const announcementKey = `${applying ? "applying" : "failed"}:${statusText}`;
      if (statusNode.dataset.modelGateAnnouncementKey !== announcementKey) {
        statusNode.dataset.modelGateAnnouncementKey = announcementKey;
        statusNode.replaceChildren(...[
          applying ? el("span", { class: "prompt-model-gate-spinner", "aria-hidden": "true" }) : null,
          el("span", { class: "prompt-model-gate-status-text" }, statusText)
        ].filter(Boolean));
      }
    } else {
      delete statusNode.dataset.modelGateAnnouncementKey;
      if (statusNode.childNodes.length) statusNode.replaceChildren();
    }
  });
  return next;
}

function preferredModelFrameKey(iframe) {
  if (!iframe) return "";
  const app = workspaceController.frameApp(iframe);
  const payload = preferredModelPayloadForApp(app);
  if (!payload) return "";
  const thinkingLevel = payload.thinkingLevel ? `:${payload.thinkingLevel}` : "";
  const documentId = String(iframe.dataset.preferredModelDocumentId || "");
  return `${payload.appId}:${payload.modelId}${thinkingLevel}:${documentId}`;
}

function preferredModelSubmissionRouteState(appId, value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
  if (appId === "Gemini") {
    if (host !== "gemini.google.com" && !host.endsWith(".gemini.google.com") && host !== "bard.google.com") return null;
    if (path === "/app") return { host, phase: "start" };
    const threadMatch = /^\/app\/([^/?#]+)/i.exec(path);
    if (threadMatch) return { host, phase: "terminal", threadId: threadMatch[1] };
    return null;
  }
  if (appId === "NotionAI") {
    const notionHost = host === "app.notion.com"
      || host === "notion.so"
      || host === "www.notion.so"
      || host.endsWith(".notion.so");
    if (!notionHost) return null;
    if (path === "/ai") return { host, phase: "start" };
    if (path === "/chat") {
      const threadId = String(url.searchParams.get("t") || "");
      return threadId ? { host, phase: "terminal", threadId } : { host, phase: "intermediate" };
    }
  }
  return null;
}

function clearPreferredModelSubmissionNavigation(record) {
  const lease = record?.submissionNavigationLease;
  if (!lease) return;
  if (lease.timer) clearTimeout(lease.timer);
  lease.timer = 0;
  if (record.submissionNavigationLease === lease) record.submissionNavigationLease = null;
}

function schedulePreferredModelSubmissionNavigationExpiry(record) {
  const lease = record?.submissionNavigationLease;
  if (!lease) return;
  if (lease.timer) clearTimeout(lease.timer);
  const delay = Math.max(0, Math.min(0x7fffffff, lease.expiresAt - Date.now()));
  lease.timer = window.setTimeout(() => {
    if (record.submissionNavigationLease === lease) record.submissionNavigationLease = null;
  }, delay);
}

function armPreferredModelSubmissionNavigation(iframe, sendId, deadlineAt = 0) {
  const id = String(sendId || "").trim();
  const record = preferredModelApplyRuns.get(iframe);
  const key = preferredModelFrameKey(iframe);
  if (!id || !record?.success || record.cancelled || record.key !== key) return null;
  const appId = String(record.payload?.appId || "");
  const initialHref = String(iframe?.dataset?.currentHref || iframe?.src || "");
  const initialRoute = preferredModelSubmissionRouteState(appId, initialHref);
  const documentId = String(iframe?.dataset?.preferredModelDocumentId || "");
  const bridgeVersion = String(iframe?.dataset?.preferredModelContentBridgeVersion || "");
  const validInitialRoute = initialRoute && (
    initialRoute.phase === "start"
    || (appId === "NotionAI" && initialRoute.phase === "intermediate")
  );
  if (!validInitialRoute || !documentId || !bridgeVersion) return null;
  clearPreferredModelSubmissionNavigation(record);
  const now = Date.now();
  const expiresAt = Math.max(
    now + MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS,
    Math.max(0, Number(deadlineAt) || 0) + MODEL_PREFERENCE_SUBMISSION_NAVIGATION_GRACE_MS
  );
  record.submissionNavigationLease = {
    sendId: id,
    appId,
    initialHref,
    initialHost: initialRoute.host,
    documentId,
    bridgeVersion,
    recordKey: key,
    armedAt: now,
    hardExpiresAt: expiresAt,
    expiresAt,
    observed: false,
    terminalObserved: false,
    terminalThreadId: "",
    lastHref: initialHref,
    lastPhase: initialRoute.phase,
    timer: 0
  };
  schedulePreferredModelSubmissionNavigationExpiry(record);
  return record.submissionNavigationLease;
}

function finishPreferredModelSubmissionNavigation(iframe, sendId, sent) {
  const record = preferredModelApplyRuns.get(iframe);
  const lease = record?.submissionNavigationLease;
  if (!lease || lease.sendId !== String(sendId || "")) return;
  lease.sendSettledAt = Date.now();
  lease.sent = Boolean(sent);
  if (sent || lease.terminalObserved) return;
  lease.expiresAt = Math.min(lease.hardExpiresAt, Date.now() + 2000);
  schedulePreferredModelSubmissionNavigationExpiry(record);
}

function preservePreferredModelForSubmissionNavigation(iframe, event = {}) {
  const record = preferredModelApplyRuns.get(iframe);
  const lease = record?.submissionNavigationLease;
  if (!lease) return false;
  const reject = () => {
    clearPreferredModelSubmissionNavigation(record);
    return false;
  };
  if (Date.now() > lease.expiresAt) return reject();
  const navigation = event.navigation;
  const submission = navigation?.submission;
  const kind = String(navigation?.kind || "").toLowerCase();
  if (!submission || !["pushstate", "replacestate", "poll"].includes(kind)) return reject();
  if (String(submission.sendId || "") !== lease.sendId) return reject();
  const observedAppId = MODEL_PREFERENCE_APP_ID_ALIASES[String(submission.appId || "")]
    || String(submission.appId || "");
  if (observedAppId && observedAppId !== lease.appId) return reject();
  if (String(navigation.documentId || "") !== lease.documentId) return reject();
  if (String(navigation.bridgeVersion || "") !== lease.bridgeVersion) return reject();
  if (
    preferredModelApplyRuns.get(iframe) !== record
    || !record.success
    || record.cancelled
    || record.key !== lease.recordKey
    || preferredModelFrameKey(iframe) !== lease.recordKey
  ) return reject();
  const nextRoute = preferredModelSubmissionRouteState(lease.appId, event.href);
  if (!nextRoute || nextRoute.host !== lease.initialHost) return reject();
  if (String(event.previousHref || "") !== lease.lastHref) return reject();
  const allowedPhaseTransition = lease.appId === "Gemini"
    ? (
        (lease.lastPhase === "start" && (nextRoute.phase === "start" || nextRoute.phase === "terminal"))
        || (lease.lastPhase === "terminal" && nextRoute.phase === "terminal")
      )
    : (
        (lease.lastPhase === "start" && ["start", "intermediate", "terminal"].includes(nextRoute.phase))
        || (lease.lastPhase === "intermediate" && ["intermediate", "terminal"].includes(nextRoute.phase))
        || (lease.lastPhase === "terminal" && nextRoute.phase === "terminal")
      );
  if (!allowedPhaseTransition) return reject();
  if (
    lease.terminalThreadId
    && (nextRoute.phase !== "terminal" || nextRoute.threadId !== lease.terminalThreadId)
  ) return reject();
  lease.observed = true;
  lease.lastHref = String(event.href || "");
  lease.lastPhase = nextRoute.phase;
  if (nextRoute.phase === "terminal") {
    lease.terminalObserved = true;
    lease.terminalThreadId = lease.terminalThreadId || String(nextRoute.threadId || "");
  }
  return true;
}

function preferredModelRecordIsCurrent(iframe, record) {
  return Boolean(
    iframe?.isConnected
    && preferredModelApplyRuns.get(iframe) === record
    && record?.key
    && record.key === preferredModelFrameKey(iframe)
  );
}

function preferredModelResult(runId, values = {}) {
  return {
    ok: false,
    skipped: false,
    changed: false,
    cancelled: false,
    retryable: false,
    reason: "",
    runId,
    ...values
  };
}

function requestPreferredModelCancellation(iframe, record, reason) {
  if (!iframe?.contentWindow || !record?.runId) return;
  const payload = {
    ...record.payload,
    runId: record.runId,
    reason: String(reason || "cancelled")
  };
  sendToIframe(
    iframe,
    "cancelPreferredModelApply",
    payload,
    MODEL_PREFERENCE_CANCEL_TIMEOUT_MS,
    { source: PREFERRED_MODEL_POST_MESSAGE_SOURCE }
  ).catch(() => {});
}

function stopPreferredModelRecord(iframe, record, reason, options = {}) {
  if (!record) return;
  clearPreferredModelSubmissionNavigation(record);
  if (record.timer) clearTimeout(record.timer);
  record.timer = 0;
  const wasInFlight = record.inFlight;
  record.controller?.abort?.();
  record.controller = null;
  record.pending = false;
  record.inFlight = false;
  record.cancelled = true;
  record.statusToast?.remove?.();
  record.statusToast = null;
  if (options.notify !== false && wasInFlight) {
    requestPreferredModelCancellation(iframe, record, reason);
  }
}

function createPreferredModelRecord(iframe, payload, key, delays, options = {}) {
  const record = {
    iframe,
    payload,
    key,
    delays,
    runId: createId("model-apply"),
    attempt: Math.max(0, Number(options.attempt) || 0),
    timer: 0,
    controller: null,
    pending: true,
    inFlight: false,
    success: false,
    terminal: false,
    cancelled: false,
    result: null,
    failureReason: "",
    statusToast: null,
    submissionNavigationLease: null
  };
  record.statusToast = createFrameToast(
    iframe,
    t("toast.frameModelSwitchPending"),
    "info",
    state.options?.frameToastPosition
  );
  return record;
}

function schedulePreferredModelRecordRun(iframe, record, delay = 0) {
  if (!preferredModelRecordIsCurrent(iframe, record) || record.success || record.terminal) return;
  if (record.timer) clearTimeout(record.timer);
  record.timer = 0;
  record.pending = true;
  record.statusToast?.update?.(t("toast.frameModelSwitchPending"), "info");
  syncPreferredModelInputGate();
  record.timer = window.setTimeout(() => {
    record.timer = 0;
    runPreferredModelRecord(iframe, record);
  }, Math.max(0, Number(delay) || 0));
}

function handlePreferredModelPromptCompositionStart(event) {
  if (preferredModelInputGateIsLocked()) {
    preferredModelPromptComposing = false;
    preferredModelComposingPromptInput = null;
    notifyPreferredModelGateBlocked();
    syncPreferredModelInputGate();
    return;
  }
  preferredModelPromptComposing = true;
  preferredModelComposingPromptInput = event.currentTarget || null;
}

function handlePreferredModelPromptCompositionEnd(event) {
  if (preferredModelInputGateIsLocked()) {
    state.promptText = event.currentTarget?.value ?? state.promptText;
    rememberPromptSelection(event.currentTarget);
    capturePreferredModelLockedPromptSnapshot();
  }
  preferredModelPromptComposing = false;
  preferredModelComposingPromptInput = null;
  syncPreferredModelInputGate();
}

function preferredModelPromptCompositionIsActive(inputNode) {
  return Boolean(
    preferredModelPromptComposing
    && preferredModelComposingPromptInput === inputNode
    && inputNode?.isConnected
    && document.activeElement === inputNode
  );
}

function handlePromptBlur(event) {
  const inputNode = event.currentTarget;
  collapsePromptInput(inputNode);
  queueMicrotask(() => {
    if (preferredModelComposingPromptInput !== inputNode || document.activeElement === inputNode) return;
    preferredModelPromptComposing = false;
    preferredModelComposingPromptInput = null;
    syncPreferredModelInputGate();
  });
}

function cleanupDetachedPreferredModelFrames() {
  let changed = false;
  for (const [iframe, record] of preferredModelApplyRuns) {
    if (iframe?.isConnected) continue;
    stopPreferredModelRecord(iframe, record, "frame-detached");
    preferredModelApplyRuns.delete(iframe);
    changed = true;
  }
  if (changed) syncPreferredModelInputGate();
  return changed;
}

function invalidatePreferredModelFrame(iframe, reason = "frame-invalidated", { clearDocumentId = false } = {}) {
  if (!iframe) return;
  const record = preferredModelApplyRuns.get(iframe);
  if (record) stopPreferredModelRecord(iframe, record, reason);
  preferredModelApplyRuns.delete(iframe);
  if (clearDocumentId) {
    delete iframe.dataset.preferredModelDocumentId;
  }
  syncPreferredModelInputGate();
}

function handlePreferredModelFrameLifecycleChange(change = {}) {
  const event = change instanceof HTMLIFrameElement ? { type: "workspace-sync", iframe: change } : (change || {});
  const iframe = event.iframe || null;
  if (event.type === "loading") {
    if (event.loading) {
      if (iframe) iframe.dataset.preferredModelNavigationInvalidated = "1";
      invalidatePreferredModelFrame(iframe, "navigation-start", { clearDocumentId: true });
    } else if (iframe?.isConnected) {
      schedulePreferredModelApplyToFrame(iframe);
    }
    syncPreferredModelInputGate();
    return;
  }
  if (event.type === "active-tab") {
    if (iframe?.isConnected) schedulePreferredModelApplyToFrame(iframe);
    syncPreferredModelInputGate();
    return;
  }
  if (event.type === "location") {
    if (iframe?.isConnected) {
      if (!preservePreferredModelForSubmissionNavigation(iframe, event)) {
        invalidatePreferredModelFrame(iframe, "location-changed");
        schedulePreferredModelApplyToFrame(iframe);
      }
    }
    syncPreferredModelInputGate();
    return;
  }
  if (event.type === "workspace-sync") {
    cleanupDetachedPreferredModelFrames();
    const activeFrames = Array.from(event.activeFrames || workspaceController.currentFrames()).filter(Boolean);
    for (const activeFrame of activeFrames) schedulePreferredModelApplyToFrame(activeFrame);
    syncPreferredModelInputGate();
  }
}

function installPreferredModelFrameCleanup() {
  if (preferredModelFrameCleanupObserver) return;
  preferredModelFrameCleanupObserver = new MutationObserver(cleanupDetachedPreferredModelFrames);
  preferredModelFrameCleanupObserver.observe(appRoot, { childList: true, subtree: true });
}

async function applyPreferredModelToFrame(iframe, record) {
  const payload = { ...record.payload, runId: record.runId };
  try {
    const result = await sendToIframe(
      iframe,
      "applyPreferredModel",
      payload,
      MODEL_PREFERENCE_APPLY_TIMEOUT_MS,
      {
        source: PREFERRED_MODEL_POST_MESSAGE_SOURCE,
        signal: record.controller?.signal
      }
    );
    if (String(result?.runId || "") !== record.runId) {
      return preferredModelResult(record.runId, { reason: "preferred-model response runId mismatch" });
    }
    return preferredModelResult(record.runId, result || {});
  } catch (error) {
    const cancelled = error?.name === "AbortError";
    const timedOut = /timeout waiting for response/i.test(String(error?.message || ""));
    if (timedOut) requestPreferredModelCancellation(iframe, record, "parent-timeout");
    return preferredModelResult(record.runId, {
      cancelled,
      // A transport timeout cannot prove that the iframe performed no UI
      // activation, so it must never start a blind second interaction.
      retryable: false,
      reason: error?.message || String(error || "preferred-model request failed")
    });
  }
}

async function runPreferredModelRecord(iframe, record) {
  if (!preferredModelRecordIsCurrent(iframe, record) || record.success || record.terminal) return;
  const runId = record.runId;
  const key = record.key;
  record.pending = false;
  record.inFlight = true;
  record.cancelled = false;
  record.controller = new AbortController();
  const result = await applyPreferredModelToFrame(iframe, record);
  if (!preferredModelRecordIsCurrent(iframe, record) || record.runId !== runId || record.key !== key) return;
  record.controller = null;
  record.inFlight = false;
  record.result = result;
  if (result.ok === true && result.unavailable !== true && result.unsupported !== true) {
    record.success = true;
    record.terminal = true;
    const model = preferredModelTargetLabel(record.payload);
    record.statusToast?.update?.(
      result.changed === true
        ? t("toast.frameModelSwitchChanged", { model })
        : t("toast.frameModelSwitchReady", { model }),
      "success"
    );
    record.statusToast?.dismiss?.(2000);
    syncPreferredModelInputGate();
    return;
  }
  if (result.cancelled === true) {
    // Navigation and bridge replacement both publish a fresh readiness signal.
    // Keep the gate closed without surfacing an obsolete run as a failure; the
    // next contentReady/load signal replaces this cancelled record.
    record.cancelled = true;
    record.pending = true;
    record.statusToast?.update?.(t("toast.frameModelSwitchPending"), "info");
    syncPreferredModelInputGate();
    if (/content bridge superseded/i.test(String(result.reason || ""))) {
      schedulePreferredModelApplyToFrame(iframe, { immediate: true });
    }
    return;
  }
  if (result.retryable === true && record.attempt + 1 < record.delays.length) {
    record.attempt += 1;
    schedulePreferredModelRecordRun(iframe, record, record.delays[record.attempt]);
    return;
  }
  record.terminal = true;
  record.cancelled = result.cancelled === true;
  record.failureReason = compactPreferredModelFailureReason(result);
  record.statusToast?.update?.(t("toast.frameModelSwitchFailed", { reason: record.failureReason }), "error");
  record.statusToast?.dismiss?.(5000);
  console.warn(
    "[ChatClub] Preferred model was not applied",
    record.payload.appId,
    record.payload.modelId,
    result.reason || result
  );
  syncPreferredModelInputGate();
}

function schedulePreferredModelApplyToFrame(iframe, options = {}) {
  if (!iframe) return null;
  const key = preferredModelFrameKey(iframe);
  const existing = preferredModelApplyRuns.get(iframe);
  if (!key) {
    if (existing) {
      stopPreferredModelRecord(iframe, existing, "preference-cleared");
      preferredModelApplyRuns.delete(iframe);
    }
    syncPreferredModelInputGate();
    return null;
  }
  const existingIsLive = Boolean(
    existing?.success
    || existing?.terminal
    || existing?.inFlight
    || existing?.timer
  );
  if (existing?.key === key && existing.cancelled !== true && existingIsLive) {
    return existing;
  }
  if (existing) stopPreferredModelRecord(iframe, existing, "superseded");
  const app = workspaceController.frameApp(iframe);
  const payload = preferredModelPayloadForApp(app);
  if (!payload) {
    preferredModelApplyRuns.delete(iframe);
    syncPreferredModelInputGate();
    return null;
  }
  const delays = options.immediate
    ? MODEL_PREFERENCE_APPLY_RETRY_DELAYS
    : MODEL_PREFERENCE_READY_APPLY_RETRY_DELAYS;
  const record = createPreferredModelRecord(iframe, payload, key, delays);
  preferredModelApplyRuns.set(iframe, record);
  schedulePreferredModelRecordRun(iframe, record, delays[0]);
  return record;
}

async function applyPreferredModelsToFrames(frames = null, options = {}) {
  const frameList = frames
    ? Array.from(frames).filter(Boolean)
    : Array.from(document.querySelectorAll(".chat-frame"));
  const immediate = options.immediate !== false;
  for (const iframe of frameList) schedulePreferredModelApplyToFrame(iframe, { immediate });
  syncPreferredModelInputGate();
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

function topicDeleteTrustedClick(result = {}) {
  const click = result?.trustedClick;
  const point = click?.framePoint || click?.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!result?.needsTrustedClick || !click || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { ...click, framePoint: { x, y } };
}

function topicDeleteTrustedHover(result = {}) {
  const hover = result?.trustedHover;
  const point = hover?.framePoint || hover?.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!result?.needsTrustedHover || !hover || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { ...hover, framePoint: { x, y } };
}

function topicDeleteTrustedMenuClick(result = {}) {
  const click = result?.trustedMenuClick;
  const rawPoints = [
    ...(Array.isArray(click?.framePoints) ? click.framePoints : []),
    click?.framePoint,
    click?.point
  ];
  const seen = new Set();
  const framePoints = rawPoints
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const key = `${point.x},${point.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!result?.needsTrustedMenuClick || !click || !framePoints.length) return null;
  return { ...click, framePoint: framePoints[0], framePoints };
}

function topicDeleteTrustedKeySequence(result = {}) {
  const sequence = result?.trustedKeySequence;
  if (!result?.needsTrustedKeySequence || !sequence) return null;
  const rawKeys = Array.isArray(sequence.keys) ? sequence.keys : [];
  const keys = rawKeys
    .map((item) => typeof item === "string"
      ? { key: item }
      : {
          key: String(item?.key || ""),
          settleMs: item?.settleMs,
          shiftKey: Boolean(item?.shiftKey),
          ctrlKey: Boolean(item?.ctrlKey),
          metaKey: Boolean(item?.metaKey),
          altKey: Boolean(item?.altKey),
          modifiers: Number.isFinite(Number(item?.modifiers)) ? Number(item.modifiers) : undefined
        })
    .filter((item) => /^(tab|enter|return|escape|esc|backspace|delete| |space|spacebar)$/i.test(item.key));
  if (!keys.length) return null;
  const point = sequence.framePoint || sequence.point;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return {
    ...sequence,
    keys,
    ...(Number.isFinite(x) && Number.isFinite(y) ? { framePoint: { x, y } } : {})
  };
}

function currentTabId() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.tabs?.getCurrent) {
      resolve(null);
      return;
    }
    try {
      chrome.tabs.getCurrent((tab) => {
        resolve(Number.isInteger(tab?.id) ? tab.id : null);
      });
    } catch {
      resolve(null);
    }
  });
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("extension runtime is unavailable"));
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || "extension request failed"));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function topicDeleteTimeoutError(error, action = "") {
  const message = String(error?.message || error || "");
  return message.includes(`[PostMessage] Timeout waiting for response: ${action}`);
}

function topicDeleteFrameHrefHints(iframe, payload = {}) {
  const values = [
    payload.currentThreadHref,
    payload.currentHref,
    payload.cachedHref,
    payload.href,
    payload.url,
    iframe?.dataset?.currentThreadHref,
    iframe?.dataset?.currentHref,
    iframe?.src,
    iframe?.getAttribute?.("src")
  ].map((item) => String(item || "").trim()).filter(Boolean);
  return Array.from(new Set(values));
}

async function ensureTopicDeleteContentBridge(iframe, payload = {}) {
  const tabId = await currentTabId();
  if (!tabId) return null;
  const hrefs = topicDeleteFrameHrefHints(iframe, payload);
  try {
    return await runtimeMessage({
      source: "chatclub",
      action: "ensureContentBridge",
      tabId,
      hrefs
    });
  } catch (error) {
    console.warn("[ChatClub] Failed to ensure iframe content bridge", error);
    return { error: error?.message || String(error) };
  }
}

async function pingTopicDeleteContentBridge(iframe, timeoutMs = 900) {
  try {
    await sendToIframe(iframe, "getLocationHref", {}, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function prepareTopicDeleteContentBridge(iframe, payload = {}) {
  if (await pingTopicDeleteContentBridge(iframe, 900)) return { ok: true };
  const installed = await ensureTopicDeleteContentBridge(iframe, payload);
  await sleep(180);
  if (await pingTopicDeleteContentBridge(iframe, 1400)) return { ok: true, installed };
  const installError = installed?.error || (Array.isArray(installed?.errors) && installed.errors.length ? installed.errors.join("; ") : "");
  const reason = installError
    ? `iframe content bridge did not respond; injection failed: ${installError}`
    : "iframe content bridge did not respond";
  return { ok: false, reason, installed };
}

async function sendTopicDeleteToIframe(iframe, payload = {}, config = null, timeoutMs = 15000) {
  const site = config?.id || payload.appId || "topic-delete";
  const ready = await prepareTopicDeleteContentBridge(iframe, payload);
  if (!ready.ok) return { ok: false, site, reason: ready.reason };
  const data = { payload, ...(config ? { config } : {}) };
  try {
    return await sendToIframe(iframe, "deleteThread", data, timeoutMs + 1000, { source: DELETE_THREAD_POST_MESSAGE_SOURCE });
  } catch (error) {
    if (!topicDeleteTimeoutError(error, "deleteThread")) throw error;
    await ensureTopicDeleteContentBridge(iframe, payload);
    await sleep(220);
    return sendToIframe(iframe, "deleteThread", data, timeoutMs + 1000, { source: DELETE_THREAD_POST_MESSAGE_SOURCE });
  }
}

function getTopicDeleteConfirmState(iframe, site, timeoutMs = 1200) {
  return sendToIframe(iframe, "getDeleteConfirmState", { site }, timeoutMs, { source: DELETE_THREAD_POST_MESSAGE_SOURCE });
}

async function dispatchTrustedTopicDeleteClick(iframe, trustedClick) {
  const iframeRect = iframe?.getBoundingClientRect?.();
  if (!iframeRect || iframeRect.width <= 0 || iframeRect.height <= 0) {
    throw new Error("trusted browser click failed: iframe is not visible");
  }
  const framePoint = trustedClick.framePoint;
  const x = Math.round((iframeRect.left + (iframe.clientLeft || 0) + framePoint.x) * 100) / 100;
  const y = Math.round((iframeRect.top + (iframe.clientTop || 0) + framePoint.y) * 100) / 100;
  if (x < iframeRect.left - 2 || y < iframeRect.top - 2 || x > iframeRect.right + 2 || y > iframeRect.bottom + 2) {
    throw new Error("trusted browser click failed: confirm button coordinates are outside the iframe");
  }
  return runtimeMessage({
    source: "chatclub",
    action: "dispatchTrustedClick",
    tabId: await currentTabId(),
    x,
    y,
    kind: trustedClick.kind || "",
    hoverSettleMs: trustedClick.hoverSettleMs,
    reason: trustedClick.reason || "delete confirmation"
  });
}

async function dispatchTrustedTopicDeleteHover(iframe, trustedHover) {
  const iframeRect = iframe?.getBoundingClientRect?.();
  if (!iframeRect || iframeRect.width <= 0 || iframeRect.height <= 0) {
    throw new Error("trusted browser hover failed: iframe is not visible");
  }
  const framePoint = trustedHover.framePoint;
  const x = Math.round((iframeRect.left + (iframe.clientLeft || 0) + framePoint.x) * 100) / 100;
  const y = Math.round((iframeRect.top + (iframe.clientTop || 0) + framePoint.y) * 100) / 100;
  if (x < iframeRect.left - 2 || y < iframeRect.top - 2 || x > iframeRect.right + 2 || y > iframeRect.bottom + 2) {
    throw new Error("trusted browser hover failed: target coordinates are outside the iframe");
  }
  return runtimeMessage({
    source: "chatclub",
    action: "dispatchTrustedMouseMove",
    tabId: await currentTabId(),
    x,
    y,
    kind: trustedHover.kind || "",
    reason: trustedHover.reason || "topic menu hover"
  });
}

async function dispatchTrustedTopicDeleteKeySequence(iframe, trustedSequence) {
  const framePoint = trustedSequence.framePoint;
  if (framePoint) {
    await dispatchTrustedTopicDeleteClick(iframe, {
      kind: trustedSequence.kind || "trusted-key-sequence-focus",
      reason: trustedSequence.reason || "topic menu keyboard focus",
      hoverSettleMs: trustedSequence.clickSettleMs,
      framePoint
    });
    await sleep(Math.max(80, Number(trustedSequence.clickSettleMs) || 160));
  }
  return runtimeMessage({
    source: "chatclub",
    action: "dispatchTrustedKeySequence",
    tabId: await currentTabId(),
    keys: trustedSequence.keys,
    keySettleMs: trustedSequence.keySettleMs,
    kind: trustedSequence.kind || "trusted-key-sequence",
    reason: trustedSequence.reason || "topic menu keyboard sequence"
  });
}

async function retryTopicDeleteAfterTrustedHover(iframe, result = {}, payload = {}, config = null, timeoutMs = 15000) {
  const trustedHover = topicDeleteTrustedHover(result);
  if (!trustedHover) return result;
  await dispatchTrustedTopicDeleteHover(iframe, trustedHover);
  await sleep(Math.max(180, Number(trustedHover.hoverSettleMs) || 360));
  return sendTopicDeleteToIframe(
    iframe,
    { ...payload, trustedHoverRetried: true },
    config,
    timeoutMs
  );
}

async function retryTopicDeleteAfterTrustedMenuClick(iframe, result = {}, payload = {}, config = null, timeoutMs = 15000) {
  const trustedMenuClick = topicDeleteTrustedMenuClick(result);
  if (!trustedMenuClick || payload?.trustedMenuClickRetried) return result;
  let lastResult = result;
  for (const framePoint of trustedMenuClick.framePoints || [trustedMenuClick.framePoint]) {
    await dispatchTrustedTopicDeleteHover(iframe, {
      kind: trustedMenuClick.kind || "topic-menu-trigger",
      reason: trustedMenuClick.reason || "topic menu trigger hover",
      framePoint
    });
    await sleep(Math.max(180, Number(trustedMenuClick.hoverSettleMs) || 360));
    await dispatchTrustedTopicDeleteClick(iframe, { ...trustedMenuClick, framePoint });
    await sleep(360);
    lastResult = await sendTopicDeleteToIframe(
      iframe,
      { ...payload, trustedMenuClickRetried: true },
      config,
      timeoutMs
    );
    if (lastResult?.ok) return lastResult;
    const reason = String(lastResult?.reason || "");
    if (reason && !/topic menu trigger|delete menu item|menu|trigger/i.test(reason)) return lastResult;
  }
  return lastResult;
}

async function retryTopicDeleteAfterTrustedKeySequence(iframe, result = {}, payload = {}, config = null, timeoutMs = 15000) {
  const trustedSequence = topicDeleteTrustedKeySequence(result);
  if (!trustedSequence || payload?.trustedKeySequenceRetried) return result;
  await dispatchTrustedTopicDeleteKeySequence(iframe, trustedSequence);
  await sleep(Math.max(180, Number(trustedSequence.settleMs) || 360));
  return sendTopicDeleteToIframe(
    iframe,
    { ...payload, trustedKeySequenceRetried: true },
    config,
    timeoutMs
  );
}

async function waitForTopicDeleteConfirmGone(iframe, site, timeoutMs = 5200) {
  const deadline = Date.now() + Math.max(800, Number(timeoutMs) || 5200);
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const state = await getTopicDeleteConfirmState(iframe, site, 1200);
      if (!state?.present) return { ok: true };
    } catch (error) {
      lastError = error;
    }
    await sleep(260);
  }
  return {
    ok: false,
    reason: lastError
      ? `trusted browser click sent but verification failed: ${lastError.message || String(lastError)}`
      : "trusted browser click did not close delete confirmation"
  };
}

async function tryTrustedTopicDeleteFallback(iframe, result = {}) {
  const trustedClick = topicDeleteTrustedClick(result);
  if (!trustedClick) return result;
  await dispatchTrustedTopicDeleteClick(iframe, trustedClick);
  await sleep(420);
  const verified = await waitForTopicDeleteConfirmGone(iframe, result.site || trustedClick.site || "topic-delete");
  return verified.ok
    ? { ok: true, site: result.site || trustedClick.site || "topic-delete" }
    : { ...result, ok: false, reason: verified.reason || result.reason || "delete confirmation did not close" };
}

async function settleTopicDeleteResult(iframe, result = {}) {
  if (!result?.ok) {
    const recovered = await tryTrustedTopicDeleteFallback(iframe, result);
    if (recovered?.ok || topicDeleteTrustedClick(recovered)) return recovered;
    try {
      const state = await getTopicDeleteConfirmState(iframe, recovered.site || result.site || "topic-delete", 1200);
      if (!state?.present) return recovered;
      return tryTrustedTopicDeleteFallback(iframe, {
        ...recovered,
        ok: false,
        reason: recovered.reason || "delete confirmation is still visible",
        ...(state.trustedClick ? { needsTrustedClick: true, trustedClick: state.trustedClick } : {})
      });
    } catch {
      return recovered;
    }
  }
  try {
    const state = await getTopicDeleteConfirmState(iframe, result.site || "topic-delete", 1200);
    if (!state?.present) return result;
    return tryTrustedTopicDeleteFallback(iframe, {
      ...result,
      ok: false,
      reason: "delete confirmation is still visible",
      ...(state.trustedClick ? { needsTrustedClick: true, trustedClick: state.trustedClick } : {})
    });
  } catch {
    return result;
  }
}

async function deleteThreadOnFrames() {
  const frames = workspaceController.currentFrames();
  if (!frames.length) return;
  const targets = await Promise.all(frames.map(async (iframe) => {
    let href = "";
    try { href = await sendToIframe(iframe, "getLocationHref", {}, 1200); } catch {}
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
  const settled = await Promise.allSettled(activeTargets.map(async ({ iframe, payload, config }) => {
    const timeoutMs = topicDeleteTimeoutMs(config, payload);
    let result;
    try {
      result = await sendTopicDeleteToIframe(iframe, payload, config, timeoutMs);
      result = await retryTopicDeleteAfterTrustedHover(iframe, result, payload, config, timeoutMs);
      result = await retryTopicDeleteAfterTrustedKeySequence(iframe, result, payload, config, timeoutMs);
      result = await retryTopicDeleteAfterTrustedMenuClick(iframe, result, payload, config, timeoutMs);
    } catch (error) {
      const recovered = await settleTopicDeleteResult(iframe, {
        ok: false,
        site: config?.id || payload.appId || "topic-delete",
        reason: error?.message || String(error)
      });
      if (recovered?.ok) return recovered;
      throw error;
    }
    result = await settleTopicDeleteResult(iframe, result);
    if (!result?.ok) throw new Error(result?.reason || "Delete failed");
    return result;
  }));
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
  topbarNode = null;
  appRoot.replaceChildren(appShellNode);
  return appShellNode;
}

function syncTopbar() {
  const shell = ensureAppShell();
  shell.classList.toggle("topbar-editing-mode", Boolean(state.topbarEditMode));
  const nextTopbar = renderTopbar();
  if (topbarNode?.isConnected) topbarNode.replaceWith(nextTopbar);
  else shell.prepend(nextTopbar);
  topbarNode = nextTopbar;
  syncPromptInputNode();
  syncPreferredModelInputGate();
}

function render() {
  applyTheme();
  workspaceController.closePopovers();
  const shell = ensureAppShell();
  syncTopbar();
  workspaceController.syncWorkspaceIsland(shell);
  syncSummaryPanel();
}

function syncSummaryPanel() {
  return summaryController.sync();
}

function openSummaryPanel() {
  return summaryController.open();
}

async function collectSummary() {
  return summaryController.collect();
}

async function loadSummaryPanelSize() {
  return summaryController.loadPanelSize();
}

function resizePromptInput(inputNode, expanded = inputNode.classList.contains("prompt-input-expanded")) {
  const sizing = promptInputHeight(inputNode.scrollHeight, window.innerHeight, expanded, {
    hasImages: state.promptImages.length > 0
  });
  inputNode.style.height = `${sizing.height}px`;
  inputNode.style.overflowY = sizing.overflowY;
  if (!expanded) {
    inputNode.scrollTop = 0;
    requestAnimationFrame(() => { inputNode.scrollTop = 0; });
  }
}

function rememberPromptSelection(inputNode) {
  if (!inputNode || typeof inputNode.selectionStart !== "number") return;
  state.promptSelection = {
    start: inputNode.selectionStart,
    end: inputNode.selectionEnd,
    direction: inputNode.selectionDirection || "none"
  };
}

function restorePromptSelection(inputNode) {
  const selection = state.promptSelection || {};
  if (typeof inputNode.setSelectionRange !== "function") return;
  const max = inputNode.value.length;
  const start = Math.max(0, Math.min(selection.start ?? max, max));
  const end = Math.max(start, Math.min(selection.end ?? start, max));
  try {
    inputNode.setSelectionRange(start, end, selection.direction || "none");
  } catch {}
}

function restorePromptSelectionSoon(inputNode) {
  restorePromptSelection(inputNode);
  requestAnimationFrame(() => {
    restorePromptSelection(inputNode);
    requestAnimationFrame(() => restorePromptSelection(inputNode));
  });
}

function promptHasText(value = state.promptText) {
  return String(value || "").length > 0;
}

function syncPromptClearButton(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
  const clearButton = shell?.querySelector?.(".prompt-clear-button");
  if (!clearButton) return;
  clearButton.hidden = !promptHasContent(inputNode?.value ?? state.promptText, state.promptImages);
}

function syncPromptSendButton(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
  const sendButton = shell?.querySelector?.(".prompt-send-button");
  if (!sendButton) return;
  sendButton.disabled = preferredModelInputGateIsLocked()
    || state.promptSendInFlight
    || !promptHasContent(inputNode?.value ?? state.promptText, state.promptImages);
}

function promptCollapsedPreviewWithImages(value = state.promptText, placeholder = promptPlaceholder()) {
  return promptCollapsedPreview(value, placeholder);
}

function syncPromptCollapsedPreview(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell");
  const preview = shell?.querySelector?.(".prompt-collapsed-preview");
  const value = inputNode?.value ?? state.promptText;
  syncPromptClearButton(inputNode);
  syncPromptSendButton(inputNode);
  syncPromptImagesPreview();
  if (!preview) return;
  const collapsed = promptCollapsedPreviewWithImages(value, promptPlaceholder());
  preview.replaceChildren(...renderCollapsedPromptPreviewContent(collapsed, state.promptImages));
  preview.title = collapsed.title;
  preview.classList.toggle("prompt-collapsed-preview-empty", collapsed.empty);
}

function expandPromptInput(inputNode) {
  syncPromptCollapsedPreview(inputNode);
  const shell = inputNode.closest?.(".prompt-shell");
  shell?.classList.add("prompt-shell-expanded");
  inputNode.classList.add("prompt-input-expanded");
  resizePromptInput(inputNode, true);
  restorePromptSelectionSoon(inputNode);
}

function collapsePromptInput(inputNode) {
  rememberPromptSelection(inputNode);
  syncPromptCollapsedPreview(inputNode);
  const shell = inputNode.closest?.(".prompt-shell");
  shell?.classList.remove("prompt-shell-expanded");
  inputNode.classList.remove("prompt-input-expanded");
  resizePromptInput(inputNode, false);
}

function promptInputFromEvent(event) {
  const target = event.currentTarget;
  if (target?.classList?.contains("prompt-input")) return target;
  return target?.querySelector?.(".prompt-input") || document.querySelector(".prompt-input");
}

function openCollapsedPrompt(event) {
  const inputNode = promptInputFromEvent(event);
  if (!inputNode || inputNode.classList.contains("prompt-input-expanded")) return false;
  event.preventDefault();
  event.stopPropagation();
  inputNode.dataset.openedFromCollapsed = "1";
  inputNode.focus({ preventScroll: true });
  expandPromptInput(inputNode);
  return true;
}

function handlePromptPointerDown(event) {
  openCollapsedPrompt(event);
}

function handlePromptOverlayClick(event) {
  event.preventDefault();
  event.stopPropagation();
  const inputNode = promptInputFromEvent(event);
  delete inputNode?.dataset.openedFromCollapsed;
  if (inputNode) restorePromptSelectionSoon(inputNode);
}

function handlePromptClick(event) {
  const inputNode = event.currentTarget;
  if (inputNode.dataset.openedFromCollapsed === "1") {
    event.preventDefault();
    event.stopPropagation();
    delete inputNode.dataset.openedFromCollapsed;
    restorePromptSelectionSoon(inputNode);
    return;
  }
  rememberPromptSelection(inputNode);
}

function clearPromptInput(event, { bypassModelGate = false } = {}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!bypassModelGate && !ensurePreferredModelInputReady()) return;
  state.promptText = "";
  state.promptImages = [];
  state.promptSelection = { start: 0, end: 0, direction: "none" };
  resetPromptHistoryNavigation();
  const inputNode = syncPromptInputNode({ focus: true, bypassModelGate }) || document.querySelector(".prompt-input");
  try { inputNode?.setSelectionRange(0, 0, "none"); } catch {}
}

function applyPromptHistoryNavigation(inputNode, result) {
  state.promptText = result.text;
  state.promptImages = normalizePromptImages(result.images);
  state.promptHistoryCursor = result.cursor;
  state.promptHistoryDraft = result.draft;
  const cursor = state.promptText.length;
  state.promptSelection = { start: cursor, end: cursor, direction: "none" };
  const syncedInput = syncPromptInputNode({ focus: true }) || inputNode;
  try { syncedInput?.setSelectionRange(cursor, cursor, "none"); } catch {}
}

function handlePromptInputKeydown(event) {
  const inputNode = event.currentTarget;
  if (event.isComposing || event.keyCode === 229) return;
  if (preferredModelInputGateIsLocked()) {
    const key = String(event.key || "");
    if (key === "Enter" || key === "Backspace" || key === "Delete" || key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      notifyPreferredModelGateBlocked();
    }
    return;
  }
  if (shouldOpenPromptLibraryFromSlash(event, inputNode.value, inputNode.selectionStart, inputNode.selectionEnd)) {
    event.preventDefault();
    event.stopPropagation();
    openPromptLibraryDialog();
    return;
  }

  if (shouldNavigatePromptHistory(event, inputNode.value, inputNode.selectionStart, inputNode.selectionEnd)) {
    const result = promptHistoryNavigate({
      history: state.promptSendHistory,
      cursor: state.promptHistoryCursor,
      draft: state.promptHistoryDraft,
      currentText: inputNode.value,
      currentImages: state.promptImages,
      direction: event.key === "ArrowUp" ? "up" : "down"
    });
    if (result.handled) {
      event.preventDefault();
      event.stopPropagation();
      applyPromptHistoryNavigation(inputNode, result);
      return;
    }
  }

  if ((state.shortcutConfig?.sendKeyMode || "enter") === "enter" && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    submitPromptFromComposer(inputNode);
  }
}

function handlePromptBeforeInput(event) {
  if (!preferredModelInputGateIsLocked() || preferredModelPromptCompositionIsActive(event.currentTarget)) return;
  event.preventDefault();
  event.stopPropagation();
  restorePreferredModelLockedPromptSnapshot();
  notifyPreferredModelGateBlocked();
}

function handlePromptInput(event) {
  if (preferredModelInputGateIsLocked() && !preferredModelPromptCompositionIsActive(event.currentTarget)) {
    restorePreferredModelLockedPromptSnapshot();
    return;
  }
  state.promptText = event.target.value;
  resetPromptHistoryNavigation();
  rememberPromptSelection(event.target);
  syncPromptCollapsedPreview(event.target);
  expandPromptInput(event.target);
  if (preferredModelInputGateIsLocked()) capturePreferredModelLockedPromptSnapshot();
}

function renderTopbar() {
  if (state.topbarEditMode) return renderTopbarEditMode();
  const prompt = textarea(state.promptText, {
    class: "textarea prompt-input",
    rows: 1,
    placeholder: promptPlaceholder(),
    readonly: preferredModelInputGateIsLocked(),
    "aria-busy": preferredModelInputGateIsLocked() ? "true" : "false",
    dataset: { modelGateState: state.preferredModelGateState },
    onpointerdown: handlePromptPointerDown,
    onfocus: (event) => expandPromptInput(event.target),
    onblur: handlePromptBlur,
    onclick: handlePromptClick,
    onbeforeinput: handlePromptBeforeInput,
    onpaste: handlePromptPaste,
    oncompositionstart: handlePreferredModelPromptCompositionStart,
    oncompositionend: handlePreferredModelPromptCompositionEnd,
    onkeyup: (event) => rememberPromptSelection(event.target),
    onselect: (event) => rememberPromptSelection(event.target),
    oninput: handlePromptInput,
    onkeydown: handlePromptInputKeydown
  });
  const collapsedPreview = promptCollapsedPreviewWithImages(state.promptText, promptPlaceholder());
  const topbarLayout = visibleTopbarLayoutItems(normalizeTopbarLayout(state.options?.topbarLayout));
  return el("header", { class: "topbar" },
    topbarLayout.map((item) => renderTopbarItem(item, prompt, collapsedPreview))
  );
}

function activeTopbarEditLayout() {
  if (!state.topbarEditLayoutDraft) {
    state.topbarEditLayoutDraft = normalizeTopbarLayout(state.options?.topbarLayout);
  }
  return normalizeTopbarLayout(state.topbarEditLayoutDraft);
}

function topbarLayoutMenuIndex(layout) {
  return layout.findIndex((entry) => entry.type === "item" && entry.id === "settingsJumpMenu");
}

function visibleTopbarLayoutItems(layout) {
  const menuIndex = topbarLayoutMenuIndex(layout);
  return menuIndex < 0 ? layout : layout.slice(0, menuIndex + 1);
}

function foldedTopbarLayoutItems(layout) {
  const menuIndex = topbarLayoutMenuIndex(layout);
  return menuIndex < 0 ? [] : layout.slice(menuIndex + 1);
}

function topbarLayoutItemIds(layout) {
  return new Set(layout
    .filter((item) => item.type === "item")
    .map((item) => item.id));
}

function topbarSettingsSectionItemIds() {
  return SETTINGS_SECTIONS
    .map(([id]) => topbarSettingsItemForSection(id))
    .filter(Boolean);
}

function ensureTopbarSettingsMenuItems(layout) {
  const normalized = normalizeTopbarLayout(layout);
  const existing = topbarLayoutItemIds(normalized);
  const settingsIds = topbarSettingsSectionItemIds();
  const missingSettingsIds = settingsIds.filter((id) => !existing.has(id));
  if (!missingSettingsIds.length) return normalized;
  let menuIndex = topbarLayoutMenuIndex(normalized);
  const base = [...normalized];
  if (menuIndex < 0) {
    base.push({ type: "item", id: "settingsJumpMenu" });
    menuIndex = base.length - 1;
  }
  const settingsOrder = new Map(settingsIds.map((id, index) => [id, index]));
  const missingSettings = new Set(missingSettingsIds);
  const mergedFoldedItems = [];
  const appendMissingBefore = (orderLimit) => {
    for (const id of settingsIds) {
      if (!missingSettings.has(id)) continue;
      if (settingsOrder.get(id) >= orderLimit) continue;
      mergedFoldedItems.push({ type: "item", id });
      missingSettings.delete(id);
    }
  };
  for (const item of base.slice(menuIndex + 1)) {
    const order = item.type === "item" ? settingsOrder.get(item.id) : undefined;
    if (typeof order === "number") appendMissingBefore(order);
    mergedFoldedItems.push(item);
  }
  appendMissingBefore(Number.POSITIVE_INFINITY);
  return [
    ...base.slice(0, menuIndex + 1),
    ...mergedFoldedItems
  ];
}

function renderTopbarEditMode() {
  const layout = activeTopbarEditLayout();
  const visibleLayout = visibleTopbarLayoutItems(layout);
  const prompt = textarea(state.promptText, {
    class: "textarea prompt-input",
    rows: 1,
    placeholder: promptPlaceholder(),
    readonly: preferredModelInputGateIsLocked(),
    "aria-busy": preferredModelInputGateIsLocked() ? "true" : "false",
    dataset: { modelGateState: state.preferredModelGateState },
    onpointerdown: handlePromptPointerDown,
    onfocus: (event) => expandPromptInput(event.target),
    onblur: handlePromptBlur,
    onclick: handlePromptClick,
    onbeforeinput: handlePromptBeforeInput,
    onpaste: handlePromptPaste,
    oncompositionstart: handlePreferredModelPromptCompositionStart,
    oncompositionend: handlePreferredModelPromptCompositionEnd,
    onkeyup: (event) => rememberPromptSelection(event.target),
    onselect: (event) => rememberPromptSelection(event.target),
    oninput: handlePromptInput,
    onkeydown: handlePromptInputKeydown
  });
  const collapsedPreview = promptCollapsedPreviewWithImages(state.promptText, promptPlaceholder());
  return el("div", { class: "topbar-customize-mode" },
    el("header", { class: "topbar topbar-editing" },
      el("div", { class: "topbar-editing-livebar" },
        el("div", {
          class: "topbar-editing-livebar-items",
          role: "list",
          "aria-label": t("topbar.customize.workbench"),
          ondragstart: preventTopbarEditNativeDrag,
          ondragover: preventTopbarEditNativeDrag,
          ondrop: preventTopbarEditNativeDrag
        },
          visibleLayout.map((item) => renderTopbarEditSlot(item, prompt, collapsedPreview))
        )
      )
    ),
    renderTopbarCustomizePalette()
  );
}

function renderTopbarCustomizePalette() {
  const hiddenItems = hiddenTopbarEditItems();
  return el("section", {
    class: "topbar-customize-palette",
    "aria-label": t("topbar.customize.palette"),
    ondragstart: preventTopbarEditNativeDrag,
    ondragover: preventTopbarEditNativeDrag,
    ondrop: preventTopbarEditNativeDrag
  },
    el("p", { class: "topbar-editing-hint" }, t("topbar.customize.dragHint")),
    el("div", { class: "topbar-customize-palette-row" },
      el("div", { class: "topbar-customize-candidates" },
        hiddenItems.map((item) => renderTopbarPaletteItem(item)),
        renderTopbarPaletteItem({ type: "flex", id: "flex-template", weight: 1 }, true),
        !hiddenItems.length ? el("div", { class: "topbar-customize-empty" }, t("topbar.customize.noHiddenItems")) : null
      )
    ),
    el("div", { class: "topbar-customize-controls" },
      el("button", {
        class: "button button-secondary topbar-edit-action topbar-edit-cancel",
        type: "button",
        onclick: exitTopbarEditMode
      },
        svgIcon("x"),
        el("span", {}, t("common.cancel"))
      ),
      el("button", {
        class: "button button-primary topbar-edit-action topbar-edit-save",
        type: "button",
        disabled: topbarEditSavePending,
        onclick: saveTopbarEditLayout
      },
        svgIcon("check"),
        el("span", {}, t("common.save"))
      )
    )
  );
}

function hiddenTopbarEditItems() {
  const visible = new Set(activeTopbarEditLayout()
    .filter((item) => item.type === "item")
    .map((item) => item.id));
  return topbarEditPaletteCandidateIds()
    .filter((id) => !visible.has(id))
    .map((id) => ({ type: "item", id }));
}

function topbarEditPaletteCandidateIds() {
  return TOPBAR_BUILTIN_ITEMS.filter((id) => !TOPBAR_REQUIRED_ITEMS.includes(id));
}

function topbarEditItemLabel(item) {
  if (item?.type !== "flex") return t(topbarItemLabelKey(item));
  return t("topbar.flexSpace");
}

function renderTopbarFlexCells(extraClass = "") {
  return el("span", {
    class: `topbar-flex-space-cells ${extraClass}`.trim(),
    "aria-hidden": "true"
  },
    el("span", { class: "topbar-flex-space-cell" })
  );
}

function renderTopbarPaletteItem(item, flexTemplate = false) {
  const label = topbarEditItemLabel(item);
  return el("button", {
    class: `topbar-palette-item tooltip-trigger ${flexTemplate ? "topbar-palette-flex" : `topbar-palette-${item.id}`}`,
    type: "button",
    "aria-label": label,
    "data-tooltip": label,
    "data-tooltip-id": "topbar.customize.paletteItem",
    draggable: "false",
    dataset: {
      topbarItemId: item.id,
      topbarPalette: flexTemplate ? "flex" : "item"
    },
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressTopbarPaletteClick) {
        suppressTopbarPaletteClick = false;
        return;
      }
      insertTopbarPaletteItem(item, flexTemplate);
    },
    onpointerdown: (event) => startTopbarEditPointerDrag(event, item, flexTemplate ? "flex-template" : "palette"),
    onmousedown: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onselectstart: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    ondragstart: preventTopbarEditNativeDrag,
    ondragover: preventTopbarEditNativeDrag,
    ondrop: preventTopbarEditNativeDrag
  },
    flexTemplate
      ? renderTopbarFlexCells("topbar-palette-flex-preview")
      : svgIcon(topbarItemIcon(item)),
    el("span", { class: "topbar-palette-item-label" }, label)
  );
}

function renderTopbarEditSlot(item, prompt, collapsedPreview) {
  const label = topbarEditItemLabel(item);
  const body = el("div", { class: "topbar-edit-slot-body" },
    renderTopbarItem(item, prompt, collapsedPreview)
  );
  return el("div", {
    class: `topbar-edit-slot ${item.type === "flex" ? "topbar-edit-slot-flex" : `topbar-edit-slot-item topbar-edit-slot-${item.id}`}`,
    role: "listitem",
    draggable: "false",
    title: label,
    "aria-label": label,
    dataset: { topbarItemId: item.id },
    onpointerdown: (event) => startTopbarEditPointerDrag(event, item),
    onmousedown: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onselectstart: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    ondragstart: preventTopbarEditNativeDrag,
    ondragover: preventTopbarEditNativeDrag,
    ondrop: preventTopbarEditNativeDrag
  },
    body
  );
}

function setTopbarEditLayoutDraft(layout) {
  state.topbarEditLayoutDraft = normalizeTopbarLayout(layout);
  syncTopbar();
}

function enterTopbarEditMode() {
  closeSettingsJumpMenu();
  state.topbarEditMode = true;
  state.topbarEditDragId = "";
  state.topbarEditLayoutDraft = ensureTopbarSettingsMenuItems(state.options?.topbarLayout);
  syncTopbar();
  requestAnimationFrame(openTopbarEditSettingsMenu);
}

function scheduleEnterTopbarEditMode() {
  requestAnimationFrame(() => enterTopbarEditMode());
}

function exitTopbarEditMode() {
  cleanupTopbarEditPointerDrag();
  closeSettingsJumpMenu();
  state.topbarEditMode = false;
  state.topbarEditLayoutDraft = null;
  state.topbarEditDragId = "";
  syncTopbar();
}

async function saveTopbarEditLayout(event) {
  if (topbarEditSavePending) return;
  topbarEditSavePending = true;
  const saveButton = event?.currentTarget;
  const controls = saveButton?.closest?.(".topbar-customize-controls");
  const actionButtons = [...(controls?.querySelectorAll?.("button") || [])];
  actionButtons.forEach((buttonNode) => { buttonNode.disabled = true; });
  saveButton?.setAttribute?.("aria-busy", "true");
  try {
    const layout = normalizeTopbarLayout(state.topbarEditLayoutDraft);
    state.options = await saveOptions({
      ...state.options,
      topbarLayout: layout
    });
    cleanupTopbarEditPointerDrag();
    closeSettingsJumpMenu();
    state.topbarEditMode = false;
    state.topbarEditLayoutDraft = null;
    state.topbarEditDragId = "";
    syncTopbar();
    toast(t("toast.appearanceSaved"), "success");
  } finally {
    topbarEditSavePending = false;
    actionButtons.forEach((buttonNode) => { buttonNode.disabled = false; });
    saveButton?.removeAttribute?.("aria-busy");
  }
}

function addTopbarEditFlexSpace() {
  const layout = activeTopbarEditLayout();
  setTopbarEditLayoutDraft(insertTopbarItemBeforeSettingsMenu(layout, {
    type: "flex",
    id: createId("topbar-flex"),
    weight: 1
  }));
}

function insertTopbarItemBeforeSettingsMenu(layout, item) {
  const menuIndex = topbarLayoutMenuIndex(layout);
  const insertIndex = menuIndex >= 0 ? menuIndex : layout.length;
  return [
    ...layout.slice(0, insertIndex),
    item,
    ...layout.slice(insertIndex)
  ];
}

function insertTopbarPaletteItem(item, flexTemplate = false) {
  const layout = activeTopbarEditLayout();
  if (flexTemplate || item.type === "flex") {
    setTopbarEditLayoutDraft(insertTopbarItemBeforeSettingsMenu(layout, {
      type: "flex",
      id: createId("topbar-flex"),
      weight: item.weight || 1
    }));
    return;
  }
  if (layout.some((entry) => entry.type === "item" && entry.id === item.id)) return;
  setTopbarEditLayoutDraft(insertTopbarItemBeforeSettingsMenu(layout, { type: "item", id: item.id }));
}

function topbarEditItemIsRequired(item) {
  return item?.type === "item" && TOPBAR_REQUIRED_ITEMS.includes(item.id);
}

function removeTopbarEditItem(item) {
  if (!item || topbarEditItemIsRequired(item)) return;
  setTopbarEditLayoutDraft(activeTopbarEditLayout().filter((entry) => entry.id !== item.id));
}

function resetTopbarEditLayout() {
  setTopbarEditLayoutDraft(DEFAULT_TOPBAR_LAYOUT);
}

function openTopbarEditSettingsMenu() {
  if (!state.topbarEditMode) return;
  const anchor = document.querySelector(".topbar-edit-slot-settingsJumpMenu .top-icon-action, .topbar-edit-slot-settingsJumpMenu button");
  if (anchor) openSettingsJumpMenu(anchor, { forceOpen: true, editing: true });
}

function addTopbarEditPointerDragGuards() {
  document.addEventListener("pointermove", handleTopbarEditPointerMove, true);
  document.addEventListener("pointerup", handleTopbarEditPointerUp, true);
  document.addEventListener("pointercancel", cancelTopbarEditPointerDrag, true);
  document.addEventListener("selectstart", preventTopbarEditNativeDrag, true);
  document.addEventListener("dragstart", preventTopbarEditNativeDrag, true);
  document.addEventListener("dragover", preventTopbarEditNativeDrag, true);
  document.addEventListener("drop", preventTopbarEditNativeDrag, true);
}

function removeTopbarEditPointerDragGuards() {
  document.removeEventListener("pointermove", handleTopbarEditPointerMove, true);
  document.removeEventListener("pointerup", handleTopbarEditPointerUp, true);
  document.removeEventListener("pointercancel", cancelTopbarEditPointerDrag, true);
  document.removeEventListener("selectstart", preventTopbarEditNativeDrag, true);
  document.removeEventListener("dragstart", preventTopbarEditNativeDrag, true);
  document.removeEventListener("dragover", preventTopbarEditNativeDrag, true);
  document.removeEventListener("drop", preventTopbarEditNativeDrag, true);
}

function preventTopbarEditNativeDrag(event) {
  if (!state.topbarEditMode && !activeTopbarEditPointerDrag) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
}

function startTopbarEditPointerDrag(event, item, source = "toolbar", command = null) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  globalThis.getSelection?.()?.removeAllRanges?.();
  cleanupTopbarEditPointerDrag();
  const slot = event.currentTarget.closest(".topbar-edit-slot, .topbar-settings-menu-slot, .topbar-palette-item") || event.currentTarget;
  state.topbarEditDragId = item.id;
  document.body.classList.add("topbar-edit-gesture-active");
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  activeTopbarEditPointerDrag = {
    id: item.id,
    item,
    source,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    targetId: item.id,
    placement: "before",
    dropZone: "toolbar",
    removeTarget: false,
    slot,
    started: false,
    command
  };
  addTopbarEditPointerDragGuards();
}

function beginTopbarEditPointerDrag(drag) {
  if (drag.started) return;
  drag.started = true;
  document.body.classList.add("topbar-edit-dragging");
  drag.slot?.classList.add("dragging");
}

function cleanupTopbarEditPointerDrag() {
  const drag = activeTopbarEditPointerDrag;
  removeTopbarEditPointerDragGuards();
  activeTopbarEditPointerDrag = null;
  state.topbarEditDragId = "";
  document.body.classList.remove("topbar-edit-gesture-active", "topbar-edit-dragging");
  drag?.slot?.classList?.remove("dragging");
  cleanupSettingsDragRows(".topbar-edit-slot");
  cleanupSettingsDragRows(".topbar-settings-menu-slot");
  document.querySelectorAll(".topbar-settings-popover.drop-empty").forEach((node) => node.classList.remove("drop-empty"));
  document.querySelectorAll(".topbar-customize-palette.is-remove-target").forEach((node) => node.classList.remove("is-remove-target"));
}

function cancelTopbarEditPointerDrag(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  cleanupTopbarEditPointerDrag();
}

function handleTopbarEditPointerMove(event) {
  const drag = activeTopbarEditPointerDrag;
  if (!drag) return;
  event.preventDefault();
  event.stopPropagation();
  if (!drag.started) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < 4) return;
    beginTopbarEditPointerDrag(drag);
  }
  previewTopbarEditPointerDrop(event.clientX, event.clientY, drag);
}

function handleTopbarEditPointerUp(event) {
  const drag = activeTopbarEditPointerDrag;
  if (!drag) return;
  event.preventDefault();
  event.stopPropagation();
  if (!drag.started && drag.source === "toolbar" && drag.item?.id === "settingsJumpMenu") {
    const anchor = drag.slot?.querySelector?.(".top-icon-action, button");
    cleanupTopbarEditPointerDrag();
    if (anchor?.isConnected) openSettingsJumpMenu(anchor, { forceOpen: true, editing: true });
    return;
  }
  if (!drag.started && typeof drag.command === "function") {
    const command = drag.command;
    cleanupTopbarEditPointerDrag();
    command(event);
    return;
  }
  if (drag.started && drag.source !== "toolbar") suppressTopbarPaletteClick = true;
  const shouldRemove = drag.started && drag.removeTarget && drag.source !== "palette" && drag.source !== "flex-template" && !topbarEditItemIsRequired(drag.item);
  const shouldFoldIntoMenu = drag.started && drag.dropZone === "settings-menu" && drag.item?.type === "item" && !topbarEditItemIsRequired(drag.item);
  const shouldPlaceOnToolbar = drag.started && drag.targetId && drag.dropZone === "toolbar" && drag.source !== "toolbar";
  const shouldMove = drag.started && drag.targetId && drag.dropZone === "toolbar" && drag.source === "toolbar" && drag.targetId !== drag.id;
  let layout = null;
  if (shouldRemove) {
    layout = activeTopbarEditLayout().filter((entry) => entry.id !== drag.id);
  } else if (shouldFoldIntoMenu) {
    layout = placeTopbarItemInSettingsMenu(activeTopbarEditLayout(), drag.item, drag.targetId, drag.placement);
  } else if (shouldPlaceOnToolbar) {
    layout = placeTopbarItemOnToolbar(activeTopbarEditLayout(), drag.item, drag.targetId, drag.placement, drag.source === "flex-template");
  } else if (shouldMove) {
    layout = placeTopbarItemOnToolbar(activeTopbarEditLayout(), drag.item, drag.targetId, drag.placement);
  }
  const shouldReopenSettingsMenu = Boolean(layout && state.topbarEditMode && document.querySelector(".topbar-settings-popover"));
  cleanupTopbarEditPointerDrag();
  if (layout) {
    if (shouldReopenSettingsMenu) closeSettingsJumpMenu();
    setTopbarEditLayoutDraft(layout);
    if (shouldReopenSettingsMenu) requestAnimationFrame(openTopbarEditSettingsMenu);
  }
}

function previewTopbarEditPointerDrop(clientX, clientY, drag) {
  document.querySelectorAll(".topbar-customize-palette.is-remove-target").forEach((node) => node.classList.remove("is-remove-target"));
  const elementAtPoint = document.elementFromPoint(clientX, clientY);
  const palette = elementAtPoint?.closest?.(".topbar-customize-palette");
  cleanupSettingsDragRows(".topbar-edit-slot");
  cleanupSettingsDragRows(".topbar-settings-menu-slot");
  drag.slot?.classList.add("dragging");
  drag.dropZone = "";
  drag.removeTarget = Boolean(palette && drag.source !== "palette" && drag.source !== "flex-template" && !topbarEditItemIsRequired(drag.item));
  if (palette) {
    if (drag.removeTarget) palette.classList.add("is-remove-target");
    drag.targetId = "";
    return;
  }
  const menuSlot = topbarSettingsMenuSlotFromPoint(clientX, clientY);
  if (menuSlot && drag.item?.type === "item" && !topbarEditItemIsRequired(drag.item)) {
    const targetId = menuSlot.dataset?.topbarItemId || "";
    drag.targetId = targetId;
    drag.placement = targetId ? topbarEditDropPlacement(menuSlot, clientX) : "after";
    drag.dropZone = "settings-menu";
    if (targetId) {
      menuSlot.classList.toggle("drop-after", drag.placement === "after");
      menuSlot.classList.toggle("drop-before", drag.placement !== "after");
    } else {
      menuSlot.classList.add("drop-empty");
    }
    return;
  }
  const targetSlot = topbarEditSlotFromPoint(clientX, clientY);
  if (!targetSlot) return;
  const targetId = targetSlot.dataset?.topbarItemId || "";
  drag.targetId = targetId;
  drag.placement = topbarEditDropPlacement(targetSlot, clientX);
  drag.dropZone = "toolbar";
  if (!targetId || targetId === drag.id) return;
  targetSlot.classList.toggle("drop-after", drag.placement === "after");
  targetSlot.classList.toggle("drop-before", drag.placement !== "after");
}

function topbarDropItemEntry(item, flexTemplate = false) {
  if (flexTemplate || item.type === "flex") {
    return { type: "flex", id: createId("topbar-flex"), weight: item.weight || 1 };
  }
  return { type: "item", id: item.id };
}

function removeTopbarDropItem(layout, item, flexTemplate = false) {
  if (flexTemplate) return layout;
  if (item.type === "item") return layout.filter((entry) => !(entry.type === "item" && entry.id === item.id));
  return layout.filter((entry) => entry.id !== item.id);
}

function placeTopbarItemOnToolbar(layout, item, targetId, placement, flexTemplate = false) {
  const nextItem = topbarDropItemEntry(item, flexTemplate);
  const base = removeTopbarDropItem(layout, item, flexTemplate);
  const targetIndex = base.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) return [...base, nextItem];
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...base.slice(0, insertIndex),
    nextItem,
    ...base.slice(insertIndex)
  ];
}

function placeTopbarItemInSettingsMenu(layout, item, targetId, placement) {
  if (item.type !== "item" || topbarEditItemIsRequired(item)) return layout;
  const base = removeTopbarDropItem(layout, item);
  let menuIndex = topbarLayoutMenuIndex(base);
  if (menuIndex < 0) {
    base.push({ type: "item", id: "settingsJumpMenu" });
    menuIndex = base.length - 1;
  }
  const targetIndex = base.findIndex((entry, index) => index > menuIndex && entry.id === targetId);
  const insertIndex = targetIndex >= 0
    ? targetIndex + (placement === "after" ? 1 : 0)
    : menuIndex + 1;
  return [
    ...base.slice(0, insertIndex),
    { type: "item", id: item.id },
    ...base.slice(insertIndex)
  ];
}

function topbarSettingsMenuSlotFromPoint(clientX, clientY) {
  const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".topbar-settings-menu-slot");
  if (direct) return direct;
  const menu = document.elementFromPoint(clientX, clientY)?.closest?.(".topbar-settings-popover.is-editing");
  if (!menu) return null;
  const slots = [...menu.querySelectorAll(".topbar-settings-menu-slot")];
  if (!slots.length) return menu;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const rect = slot.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - centerY);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

function topbarEditSlotFromPoint(clientX, clientY) {
  const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".topbar-edit-slot");
  if (direct) return direct;
  const slots = [...document.querySelectorAll(".topbar-edit-slot")];
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const rect = slot.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(clientX - centerX, clientY - centerY);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

function topbarEditDropPlacement(slot, clientX) {
  const rect = slot.getBoundingClientRect();
  return clientX > rect.left + rect.width / 2 ? "after" : "before";
}

function topbarTooltipIdForItem(item) {
  const id = item?.id || "";
  const settingsSectionId = topbarSettingsSectionForItem(id);
  if (settingsSectionId) return `topbar.settings.${settingsSectionId}`;
  return ({
    brand: "topbar.brand",
    newChat: "topbar.newChat",
    deleteThread: "topbar.deleteThread",
    summary: "topbar.summary",
    pocket: "topbar.pocket",
    addGroup: "topbar.addGroup",
    layout: "topbar.layout",
    settingsJumpMenu: "topbar.settingsJumpMenu"
  })[id] || "";
}

function renderTopbarItem(item, prompt, collapsedPreview) {
  if (item.type === "flex") {
    return el("div", {
      class: "topbar-flex-space",
      title: t("topbar.flexSpace"),
      "aria-hidden": "true"
    }, renderTopbarFlexCells());
  }
  if (item.id === "brand") return renderTopbarBrand();
  if (item.id === "settings") return renderTopbarSettingsButton();
  if (item.id === "composer") return renderTopbarComposer(prompt, collapsedPreview);
  if (item.id === "newChat") return actionButton(t("topbar.newChat"), "edit", newChatOnFrames, "secondary", shortcutTooltip(t("topbar.newChatAllTooltip"), "newChatAll"), "", "", "topbar.newChat");
  if (item.id === "deleteThread") return actionButton(t("topbar.deleteThread"), "trash", deleteThreadOnFrames, "danger", shortcutTooltip(t("topbar.deleteThread"), "deleteThread"), "", "", "topbar.deleteThread");
  if (item.id === "summary") return actionButton(t("topbar.summary"), "summary", openSummaryPanel, "secondary", shortcutTooltip(t("topbar.summary"), "openSummaryPanel"), "", "", "topbar.summary");
  if (item.id === "pocket") return actionButton(t("topbar.pocket"), "pocket", openPocketPanel, "secondary", shortcutTooltip(t("topbar.pocket"), "openPocketPanel"), "", topbarItemClass("pocket"), "topbar.pocket");
  if (item.id === "addGroup") return topIconButton(t("topbar.addGroup"), "plus", (event) => workspaceController.openAppPicker(event.currentTarget, { mode: "group" }), t("topbar.addGroup"), "left", "topbar.addGroup");
  if (item.id === "layout") return topIconButton(t("topbar.switchLayout"), "layout", (event) => workspaceController.openLayoutMenu(event.currentTarget), shortcutTooltip(t("topbar.switchLayout"), "switchLayout"), "left", "topbar.layout");
  if (item.id === "settingsJumpMenu") return renderSettingsJumpMenuButton();
  const settingsSectionId = topbarSettingsSectionForItem(item.id);
  if (settingsSectionId) {
    const label = t(topbarItemLabelKey(item));
    return topIconButton(label, topbarItemIcon(item), (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSettings(settingsSectionId);
    }, label, "left", `topbar.settings.${settingsSectionId}`);
  }
  return el("span", { class: "topbar-unknown-item", hidden: true });
}

function renderSettingsJumpMenuButton() {
  let pointerHandled = false;
  const openFromEvent = (event) => {
    if (!event?.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    openSettingsJumpMenu(event.currentTarget);
  };
  const buttonNode = topIconButton(t("topbar.settingsJumpMenu"), "moreTools", (event) => {
    if (state.topbarEditMode) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (pointerHandled) {
      pointerHandled = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    openFromEvent(event);
  }, t("topbar.settingsJumpMenu"), "left", "topbar.settingsJumpMenu");
  buttonNode.addEventListener("pointerdown", (event) => {
    if (state.topbarEditMode || event.button !== 0) return;
    pointerHandled = true;
    openFromEvent(event);
  });
  return buttonNode;
}

function openChatClubAbout(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  openSettings("about");
}

function renderTopbarBrand() {
  const label = t("topbar.about");
  return el("button", {
    class: `brand tooltip-trigger ${topbarItemClass("brand")}`,
    type: "button",
    "aria-label": label,
    "data-tooltip": label,
    "data-tooltip-id": "topbar.brand",
    onclick: openChatClubAbout
  },
    el("img", { class: "brand-logo", src: "icons/logo.svg", alt: "", draggable: "false" }),
    el("div", {}, APP_NAME)
  );
}

function renderTopbarSettingsButton() {
  return topIconButton(t("topbar.settings"), "settings", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  }, t("topbar.settings"), "left", "topbar.settings");
}

function renderTopbarComposer(prompt, collapsedPreview) {
  const gateLocked = preferredModelInputGateIsLocked();
  const gateApplying = ["bootstrapping", "applying"].includes(state.preferredModelGateState);
  const gateFailed = state.preferredModelGateState === "failed";
  const gateStatusText = gateFailed
    ? t("topbar.modelGateFailed", { reason: state.preferredModelGateReason })
    : t("topbar.modelGateApplying");
  return el("div", { class: `composer ${topbarItemClass("composer")}` },
    el("div", {
      class: `prompt-shell ${state.promptImages.length ? "prompt-shell-has-images" : ""} ${gateApplying ? "prompt-shell-model-gate-applying" : ""} ${gateFailed ? "prompt-shell-model-gate-failed" : ""}`.trim(),
      dataset: {
        modelGateState: state.preferredModelGateState,
        modelGatePendingCount: String(state.preferredModelGatePendingCount),
        modelGateFailedCount: String(state.preferredModelGateFailedCount),
        modelGateFailedAppIds: state.preferredModelGateFailedAppIds.join(",")
      },
      "aria-busy": gateLocked ? "true" : "false",
      onpointerdown: handlePromptPointerDown,
      ondragenter: handlePromptDragEnter,
      ondragover: handlePromptDragOver,
      ondragleave: handlePromptDragLeave,
      ondrop: handlePromptDrop,
      onpaste: handlePromptPaste
    },
      prompt,
      el("div", {
        class: `prompt-collapsed-preview ${collapsedPreview.empty ? "prompt-collapsed-preview-empty" : ""}`.trim(),
        title: collapsedPreview.title,
        onclick: handlePromptOverlayClick
      }, renderCollapsedPromptPreviewContent(collapsedPreview, state.promptImages)),
      el("div", { class: "prompt-image-preview-list", hidden: state.promptImages.length <= 0 },
        state.promptImages.map((image) => renderPromptImagePreview(image))
      ),
      el("button", {
        class: "prompt-actions-button compact-icon tooltip-trigger",
        type: "button",
        disabled: gateLocked,
        "aria-label": t("topbar.promptActions"),
        "data-tooltip": t("topbar.promptActions"),
        "data-tooltip-id": "topbar.promptActions",
        onclick: openPromptActionsMenu,
        onpointerdown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onkeydown: (event) => event.stopPropagation()
      }, svgIcon("plus")),
      el("input", {
        class: "prompt-image-file-input",
        type: "file",
        disabled: gateLocked,
        accept: "image/*",
        multiple: true,
        tabindex: "-1",
        onchange: handlePromptImageFileChange
      }),
      el("button", {
        class: "prompt-clear-button compact-icon tooltip-trigger",
        type: "button",
        disabled: gateLocked,
        hidden: !promptHasContent(state.promptText, state.promptImages),
        "aria-label": t("topbar.clearPrompt"),
        "data-tooltip": t("topbar.clearPrompt"),
        "data-tooltip-id": "topbar.clearPrompt",
        onclick: clearPromptInput,
        onpointerdown: (event) => event.stopPropagation(),
        onkeydown: (event) => event.stopPropagation()
      }, svgIcon("x")),
      el("button", {
        class: "prompt-send-button tooltip-trigger",
        type: "button",
        disabled: gateLocked || state.promptSendInFlight || !promptHasContent(state.promptText, state.promptImages),
        "aria-label": t("topbar.send"),
        "data-tooltip": t("topbar.sendTooltip"),
        "data-tooltip-id": "topbar.send",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.promptSendInFlight || !ensurePreferredModelInputReady()) return;
          submitPromptFromComposer(event);
        },
        onpointerdown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onkeydown: (event) => event.stopPropagation()
      },
        svgIcon("send")
      ),
      el("div", {
        class: "prompt-model-gate-status",
        hidden: !gateLocked,
        "aria-live": "polite",
        "aria-atomic": "true"
      },
        gateApplying ? el("span", { class: "prompt-model-gate-spinner", "aria-hidden": "true" }) : null,
        gateLocked ? el("span", { class: "prompt-model-gate-status-text" }, gateStatusText) : null
      )
    )
  );
}

function openSettings(sectionId = "appearance") {
  return settingsController.openSettings(sectionId);
}

function closeSettingsJumpMenu() {
  document.querySelectorAll(".topbar-settings-backdrop, .topbar-settings-popover").forEach((node) => node.remove());
  document.querySelectorAll(".topbar-settings-anchor").forEach((node) => node.classList.remove("topbar-settings-anchor"));
  document.removeEventListener("keydown", closeSettingsJumpMenuOnKeydown, true);
  window.removeEventListener("resize", closeSettingsJumpMenu, true);
  window.removeEventListener("scroll", closeSettingsJumpMenu, true);
  window.removeEventListener("blur", closeSettingsJumpMenu, true);
}

function closeSettingsJumpMenuOnKeydown(event) {
  if (event.key === "Escape") closeSettingsJumpMenu();
}

function topbarSettingsMenuButton(label, iconName, onClick, variant = "secondary", disabled = false, dragItem = null, options = {}) {
  let pointerActivated = false;
  const extraClass = options.className ? ` ${options.className}` : "";
  const tooltipId = options.tooltipId || "";
  const run = (event) => {
    if (disabled) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onClick?.(event);
  };
  const editModeDragProps = state.topbarEditMode && dragItem
    ? {
        onpointerdown: (event) => {
          startTopbarEditPointerDrag(event, dragItem, "settings-menu");
        },
        onmousedown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onselectstart: preventTopbarEditNativeDrag,
        ondragstart: preventTopbarEditNativeDrag,
        ondragover: preventTopbarEditNativeDrag,
        ondrop: preventTopbarEditNativeDrag
      }
    : {
        onpointerdown: (event) => {
          if (event.button !== 0 || disabled) return;
          event.preventDefault();
          event.stopPropagation();
        },
        onpointerup: (event) => {
          if (event.button !== 0 || disabled) return;
          pointerActivated = true;
          run(event);
        }
      };
  return el("button", {
    class: `button button-${variant} menu-button tooltip-trigger ${dragItem ? "menu-button-draggable" : ""}${extraClass}`.trim(),
    type: "button",
    "aria-label": label,
    "data-tooltip": label,
    "data-tooltip-id": tooltipId || null,
    dataset: options.dataset || {},
    disabled,
    draggable: "false",
    onclick: (event) => {
      if (event.currentTarget?.disabled) return;
      if (pointerActivated) {
        pointerActivated = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (state.topbarEditMode && dragItem) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      run(event);
    },
    ...editModeDragProps
  },
    svgIcon(iconName),
    el("span", {}, label)
  );
}

function runTopbarMenuItem(item, event) {
  if (!item || item.type !== "item") return;
  const settingsSectionId = topbarSettingsSectionForItem(item.id);
  if (settingsSectionId) {
    closeSettingsJumpMenu();
    openSettings(settingsSectionId);
    return;
  }
  if (item.id === "brand") {
    closeSettingsJumpMenu();
    openSettings("about");
    return;
  }
  if (item.id === "composer") {
    closeSettingsJumpMenu();
    focusPromptInput();
    return;
  }
  if (item.id === "newChat") {
    closeSettingsJumpMenu();
    newChatOnFrames();
    return;
  }
  if (item.id === "deleteThread") {
    closeSettingsJumpMenu();
    deleteThreadOnFrames();
    return;
  }
  if (item.id === "summary") {
    closeSettingsJumpMenu();
    openSummaryPanel();
    return;
  }
  if (item.id === "pocket") {
    closeSettingsJumpMenu();
    openPocketPanel();
    return;
  }
  if (item.id === "addGroup") {
    workspaceController.openAppPicker(event?.currentTarget, { mode: "group" });
    return;
  }
  if (item.id === "layout") {
    workspaceController.openLayoutMenu(event?.currentTarget);
  }
}

function renderTopbarFoldedMenuButton(item, editing) {
  const label = t(topbarItemLabelKey(item));
  const dragItem = editing && item.type === "item"
    ? { type: "item", id: item.id }
    : null;
  const button = topbarSettingsMenuButton(label, topbarItemIcon(item), (event) => runTopbarMenuItem(item, event), "secondary", false, dragItem, {
    className: editing && item.type === "item" ? "topbar-settings-menu-button" : "",
    tooltipId: topbarTooltipIdForItem(item)
  });
  if (!editing || item.type !== "item") return button;
  return el("div", {
    class: "topbar-settings-menu-slot",
    dataset: { topbarItemId: item.id }
  }, button);
}

function openSettingsJumpMenu(anchor, options = {}) {
  const forceOpen = Boolean(options.forceOpen);
  const editing = Boolean(options.editing ?? state.topbarEditMode);
  const persistentEditMenu = editing && state.topbarEditMode;
  if (!forceOpen && anchor.classList.contains("topbar-settings-anchor") && document.querySelector(".topbar-settings-popover")) {
    if (persistentEditMenu) return;
    closeSettingsJumpMenu();
    return;
  }
  closeSettingsJumpMenu();
  workspaceController?.closePopovers?.();
  anchor.classList.add("topbar-settings-anchor");
  const rect = anchor.getBoundingClientRect();
  const backdrop = persistentEditMenu ? null : el("div", {
    class: "popover-backdrop topbar-settings-backdrop",
    onpointerdown: (event) => {
      event.preventDefault();
      closeSettingsJumpMenu();
    },
    oncontextmenu: (event) => {
      event.preventDefault();
      closeSettingsJumpMenu();
    }
  });
  const editControls = editing
    ? []
    : [
        topbarSettingsMenuButton(t("topbar.customize.enter"), "customizeTopbar", () => {
          closeSettingsJumpMenu();
          scheduleEnterTopbarEditMode();
        }, "secondary", false, null, { tooltipId: "topbar.customize.enter" })
      ];
  const layout = editing
    ? ensureTopbarSettingsMenuItems(activeTopbarEditLayout())
    : ensureTopbarSettingsMenuItems(state.options?.topbarLayout);
  const foldedItems = foldedTopbarLayoutItems(layout)
    .filter((item) => item.type === "item" && item.id !== "settingsJumpMenu");
  const foldedSettingsItemIds = new Set(foldedItems
    .map((item) => topbarSettingsSectionForItem(item.id) ? item.id : "")
    .filter(Boolean));
  const foldedButtons = foldedItems.map((item) => renderTopbarFoldedMenuButton(item, editing));
  const shouldRenderImplicitSettingsButtons = !editing && foldedSettingsItemIds.size === 0;
  const settingsButtons = !shouldRenderImplicitSettingsButtons ? [] : SETTINGS_SECTIONS.map(([id, labelKey, , icon]) => {
    return topbarSettingsMenuButton(t(labelKey), icon, () => {
      closeSettingsJumpMenu();
      openSettings(id);
    }, "secondary", false, null, { tooltipId: `topbar.settings.${id}` });
  });
  const menu = el("div", {
    class: `popover-menu topbar-settings-popover ${editing ? "is-editing" : ""}`,
    role: "menu",
    style: { top: `${rect.bottom + 5}px`, right: `${Math.max(8, window.innerWidth - rect.right)}px` },
    onpointerdown: (event) => event.stopPropagation(),
    onclick: (event) => event.stopPropagation()
  },
    editControls,
    editControls.length ? el("div", { class: "menu-separator", role: "separator" }) : null,
    foldedButtons,
    foldedButtons.length && settingsButtons.length ? el("div", { class: "menu-separator", role: "separator" }) : null,
    settingsButtons
  );
  if (backdrop) document.body.append(backdrop);
  document.body.append(menu);
  document.addEventListener("keydown", closeSettingsJumpMenuOnKeydown, true);
  if (!persistentEditMenu) {
    window.addEventListener("resize", closeSettingsJumpMenu, true);
    window.addEventListener("scroll", closeSettingsJumpMenu, true);
    window.addEventListener("blur", closeSettingsJumpMenu, true);
  }
}

function openPromptLibraryDialog() {
  if (!ensurePreferredModelInputReady()) return;
  return settingsController.openPromptLibraryDialog();
}

function insertTextIntoPrompt(text) {
  if (!ensurePreferredModelInputReady()) return;
  return settingsController.insertTextIntoPrompt(text);
}

function openPocketPanel() {
  return pocketController.openPocketPanel();
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

function activeChatForShortcut(sourceWindow) {
  const group = activeGroupForShortcut(sourceWindow);
  return group ? workspaceController.activeChatForGroup(group) : null;
}

function syncPromptInputNode({ focus = false, bypassModelGate = false } = {}) {
  const inputNode = document.querySelector(".prompt-input");
  if (!inputNode) return null;
  if (!bypassModelGate && preferredModelInputGateIsLocked()) {
    restorePreferredModelLockedPromptSnapshot();
    return inputNode;
  }
  if (bypassModelGate && preferredModelInputGateIsLocked()) {
    preferredModelLockedPromptSnapshot = preferredModelPromptSnapshotFromState();
  }
  inputNode.value = state.promptText;
  syncPromptCollapsedPreview(inputNode);
  if (focus) {
    inputNode.focus({ preventScroll: true });
    expandPromptInput(inputNode);
    restorePromptSelectionSoon(inputNode);
  }
  return inputNode;
}

function focusPromptInput() {
  syncPromptInputNode({ focus: true });
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
  else if (action === "openSummaryPanel" || action === "openSummary") openSummaryPanel();
  else if (action === "openPocketPanel") openPocketPanel();
  else if (action === "toggleMessageNavigator") await workspaceController.toggleMessageNavigatorForShortcut(sourceWindow);
  else if (action === "closeChat" && group && chat) await workspaceController.closeTab(group, chat);
  else if (action === "refreshPage" && chat) workspaceController.refreshCurrentPage(chat);
  else if (action === "reloadChat" && chat) workspaceController.reloadChat(chat);
  else if (action === "enterFullscreen") {
    if (state.summaryOpen) summaryController.toggleMaximized();
    else if (pocketController.toggleOpenPocketPanelFullscreen()) {}
    else workspaceController.toggleFullscreen(group?.id || workspaceController.activeShortcutGroupId(sourceWindow));
  }
  else if (action === "insertPrompt" && digit > 0) insertPromptLibraryItem(digit - 1);
  else if (action === "switchLayout" && digit > 0) await switchLayoutByShortcut(digit - 1);
  else if (action === "switchPlatformTab" && digit > 0) switchPlatformTabByShortcut(digit - 1, sourceWindow);
}

function installShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (state.shortcutRecordingAction) return;
    if (state.summaryOpen && event.key === "Escape") {
      event.preventDefault();
      state.summaryOpen = false;
      state.summaryMaximized = false;
      syncSummaryPanel();
      return;
    }
    const matched = matchShortcut(event, state.shortcutConfig);
    if (matched) {
      event.preventDefault();
      event.stopPropagation();
      handleShortcutAction(matched.action, matched.matchObj).catch((error) => {
        console.warn("[ChatClub] Shortcut action failed", error);
      });
    }
  }, true);
}

function installIframeEventBridge() {
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.source === "chatclub-parent-clipboard" && message.type === "request") {
      (async () => {
        let data = { ok: false };
        try {
          if (message.action === "read") {
            data = { ok: true, text: await navigator.clipboard.readText() };
          } else {
            data = { ok: false, error: "Clipboard writes are disabled for internal capture requests." };
          }
        } catch (error) {
          data = { ok: false, error: error.message || String(error) };
        }
        event.source?.postMessage({
          source: "chatclub-parent-clipboard",
          type: "response",
          action: message.action,
          id: message.id,
          data
        }, "*");
      })();
      return;
    }
    if (message?.source !== "chatclub" || message.type !== "request") return;
    if (message.action === "getShortcutConfig") {
      event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: state.shortcutConfig }, "*");
      return;
    }
    if (message.action === "shortcutTriggered") {
      handleShortcutAction(message.data?.action, message.data?.matchObj, event.source).catch((error) => {
        console.warn("[ChatClub] Iframe shortcut action failed", error);
      });
      event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
      return;
    }
    if (message.action === "locationChanged") {
      event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
      const iframe = workspaceController.iframeForWindow(event.source);
      if (!iframe) return;
      const currentDocumentId = String(iframe.dataset.preferredModelDocumentId || "");
      const reportedDocumentId = String(message.data?.documentId || "");
      const currentBridgeVersion = String(iframe.dataset.preferredModelContentBridgeVersion || "");
      const reportedBridgeVersion = String(message.data?.bridgeVersion || "");
      if (currentDocumentId && reportedDocumentId && currentDocumentId !== reportedDocumentId) return;
      if (currentBridgeVersion && reportedBridgeVersion && currentBridgeVersion !== reportedBridgeVersion) return;
      workspaceController.rememberFrameLocation(iframe, message.data || {});
      return;
    }
    if (message.action === "contentUnloading") {
      event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
      const iframe = workspaceController.iframeForWindow(event.source);
      if (!iframe) return;
      const currentDocumentId = String(iframe.dataset.preferredModelDocumentId || "");
      const unloadingDocumentId = String(message.data?.documentId || "");
      const currentBridgeVersion = String(iframe.dataset.preferredModelContentBridgeVersion || "");
      const unloadingBridgeVersion = String(message.data?.bridgeVersion || "");
      if (currentDocumentId && unloadingDocumentId && currentDocumentId !== unloadingDocumentId) return;
      if (currentBridgeVersion && unloadingBridgeVersion && currentBridgeVersion !== unloadingBridgeVersion) return;
      iframe.dataset.preferredModelNavigationInvalidated = "1";
      invalidatePreferredModelFrame(iframe, "content-unloading", { clearDocumentId: true });
      return;
    }
    if (message.action === "contentReady") {
      event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
      const iframe = workspaceController.iframeForWindow(event.source);
      if (iframe) {
        const documentId = String(message.data?.documentId || "");
        const previousDocumentId = String(iframe.dataset.preferredModelDocumentId || "");
        const bridgeVersion = String(message.data?.bridgeVersion || "");
        const previousBridgeVersion = String(iframe.dataset.preferredModelContentBridgeVersion || "");
        if (
          (documentId && previousDocumentId && documentId !== previousDocumentId)
          || (bridgeVersion && previousBridgeVersion && bridgeVersion !== previousBridgeVersion)
        ) {
          invalidatePreferredModelFrame(iframe, "document-changed");
        }
        if (documentId) iframe.dataset.preferredModelDocumentId = documentId;
        if (bridgeVersion) iframe.dataset.preferredModelContentBridgeVersion = bridgeVersion;
        workspaceController.rememberFrameLocation(iframe, message.data || {});
      }
      workspaceController.syncFrameFavicon(event.source).catch((error) => console.warn("[ChatClub] Failed to sync frame favicon", error));
      if (iframe) {
        schedulePreferredModelApplyToFrame(iframe);
        workspaceController.reapplyMessageNavigatorForFrame(iframe).catch((error) => console.warn("[ChatClub] Failed to restore message navigator", error));
      }
      return;
    }
  }, true);
}

function installPreferredModelIframeLoadHandler() {
  document.addEventListener("load", (event) => {
    const iframe = event.target;
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.classList.contains("chat-frame")) return;
    // Parent-driven loads were invalidated when loading started. Preserve a
    // contentReady documentId that arrived before the iframe load event so the
    // init/load/contentReady signals still coalesce into the same record.
    const navigationAlreadyInvalidated = iframe.dataset.preferredModelNavigationInvalidated === "1";
    delete iframe.dataset.preferredModelNavigationInvalidated;
    if (!preferredModelFrameIsLoading(iframe) && !navigationAlreadyInvalidated) {
      invalidatePreferredModelFrame(iframe, "iframe-load", { clearDocumentId: true });
    }
    schedulePreferredModelApplyToFrame(iframe);
  }, true);
}

function installExtensionTabTracker() {
  workspaceController.refreshCurrentExtensionTabInfo();
  window.addEventListener("focus", workspaceController.refreshCurrentExtensionTabInfo);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") workspaceController.refreshCurrentExtensionTabInfo();
  });
}

async function init() {
  state.options = await loadOptions();
  state.customConfig = await loadCustomConfig();
  state.promptLibrary = await loadPromptLibrary();
  state.promptSendHistory = await loadPromptSendHistory();
  state.pocketEntries = await loadPocketHistory();
  state.shortcutConfig = await loadShortcutConfig();
  state.summarySize = await loadSummaryPanelSize();
  state.faviconCache = normalizeFaviconCache(await storageGet(FAVICON_CACHE_KEY));
  state.options = normalizeOptions(state.options);
  syncI18nLanguage();
  await initializeTopbarPromptPlaceholder();
  workspaceController.hydrateGroups();
  installGlobalTooltips({
    getDisabledTooltipIds: () => state.options?.tooltipDisabledIds || []
  });
  installExtensionTabTracker();
  installShortcuts();
  installIframeEventBridge();
  installPreferredModelIframeLoadHandler();
  installPreferredModelFrameCleanup();
  render();
  applyPreferredModelsToFrames(null, { immediate: false });
  preferredModelGateBootstrapping = false;
  syncPreferredModelInputGate();
}

init().catch((error) => {
  console.error(error);
  appRoot.append(el("pre", {}, error.stack || error.message || String(error)));
});
