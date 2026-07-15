import { APP_NAME } from "../shared/constants.js";
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
  matchesSendShortcut,
  shortcutProfile
} from "../shared/shortcuts.js";
import {
  createId,
  getAllChatApps,
  normalizePromptImagePasteStrategy,
  normalizePromptSendHistory,
  normalizeFrameToastPosition,
  normalizeOptions,
  normalizePrimaryColor,
  normalizeTopbarPromptPlaceholderConfig
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
  savePromptSendHistory,
  storageGet,
  storageRemove,
  storageSet
} from "../shared/storage-adapter.js";
import {
  normalizeTopbarLayout,
  topbarItemIcon,
  topbarItemLabelKey,
  topbarSettingsSectionForItem
} from "../shared/topbar.js";
import { topicDeleteTimeoutMs } from "../shared/topic-delete-sites.js";
import { createTopicDeleteRuntime } from "./topic-delete/runtime.js";
import { createFrameBridgeController } from "./frame-bridge/controller.js";
import { createOptimizeController } from "./optimize/controller.js";
import { createFaviconService } from "./favicon/service.js";
import { createFaviconStatePort } from "./favicon/state-port.js";
import { createPromptImageModel } from "./composer/images.js";
import { createComposerStatePort } from "./composer/state-port.js";
import { createPreferredModelController } from "./preferred-model/controller.js";
import { createPreferredModelStatePort } from "./preferred-model/state-port.js";
import { createTopbarStatePort } from "./topbar/state-port.js";
import { createTopbarEditor } from "./topbar/editor.js";
import { createWorkspaceController } from "./workspace/controller.js";
import { createWorkspaceSessionStore } from "./workspace/session-store.js";
import { SETTINGS_SECTIONS } from "./settings/sections.js";
import { createSettingsControllerStatePort } from "./settings/state-ports.js";
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
import { createAppState, createFeatureStatePort } from "./state.js";

const appRoot = document.getElementById("app");
const SVG_NS = "http://www.w3.org/2000/svg";
const PROMPT_IMAGE_RETRY_COUNT = 3;
const FRAME_SUBMIT_ERROR_MAX_CHARS = 160;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
let appShellNode = null;
let topbarNode = null;
let topbarPromptPlaceholderValue = "";
let topbarPromptPlaceholderTimer = 0;
let topbarPromptPlaceholderTimerKey = "";
let topbarEditSavePending = false;
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
const state = createAppState();
const featureState = Object.freeze({
  workspace: createFeatureStatePort(state, "workspace"),
  summary: createFeatureStatePort(state, "summary"),
  pocket: createFeatureStatePort(state, "pocket"),
  optimize: createFeatureStatePort(state, "optimize"),
  composer: createComposerStatePort(state),
  preferredModel: createPreferredModelStatePort(state),
  topbar: createTopbarStatePort(state),
  favicon: createFaviconStatePort(state),
  settings: createSettingsControllerStatePort(state)
});
const composerState = featureState.composer;
const preferredModelState = featureState.preferredModel;
const topbarState = featureState.topbar;
const topbarEditor = createTopbarEditor({
  state: topbarState,
  settingsSections: SETTINGS_SECTIONS,
  syncTopbar: (...args) => syncTopbar(...args),
  openSettingsMenu: (...args) => openSettingsJumpMenu(...args),
  closeSettingsMenu: (...args) => closeSettingsJumpMenu(...args),
  openEditorSettingsMenu: (...args) => openTopbarEditSettingsMenu(...args)
});
const {
  activeTopbarEditLayout,
  cleanupPointerDrag: cleanupTopbarEditPointerDrag,
  consumePaletteClickSuppression,
  ensureTopbarSettingsMenuItems,
  foldedTopbarLayoutItems,
  insertTopbarPaletteItem,
  paletteCandidateIds: topbarEditPaletteCandidateIds,
  preventNativeDrag: preventTopbarEditNativeDrag,
  startPointerDrag: startTopbarEditPointerDrag,
  visibleTopbarLayoutItems
} = topbarEditor;
const promptImageModel = createPromptImageModel({ createId });
const normalizePromptImages = promptImageModel.normalize;
const normalizePromptImageEntry = promptImageModel.normalizeEntry;
const promptImageEntryFromFile = promptImageModel.fromFile;
const extractPromptImageFilesFromTransfer = promptImageModel.filesFromTransfer;
let workspaceController = null;
let frameBridgeController = null;
let preferredModelController = null;
const frameRuntimePort = new FrameRuntimePort({
  ensureRuntime: (...args) => frameBridgeController.prepareContentFrameRuntime(...args),
  invalidateRuntime(iframe) {
    if (!iframe?.dataset) return;
    delete iframe.dataset.preferredModelDocumentId;
    delete iframe.dataset.preferredModelContentBridgeVersion;
    delete iframe.dataset.summaryRuntimeDocumentId;
    delete iframe.dataset.summaryRuntimeBridgeVersion;
  }
});
const sendToContentFrame = (iframe, command, data = {}, timeoutMs) => {
  const options = timeoutMs && typeof timeoutMs === "object" ? timeoutMs : { timeoutMs };
  return frameRuntimePort.request(iframe, command, data, options);
};
const topicDeleteRuntime = createTopicDeleteRuntime({ framePort: frameRuntimePort });
const executeTopicDelete = topicDeleteRuntime.executeTopicDelete;
frameBridgeController = createFrameBridgeController({
  framePort: () => frameRuntimePort,
  workspace: () => workspaceController,
  schedulePreferredModelApply: (...args) => preferredModelController.schedulePreferredModelApplyToFrame(...args),
  invalidatePreferredModelFrame: (...args) => preferredModelController.invalidatePreferredModelFrame(...args),
  preferredModelFrameIsLoading: (...args) => preferredModelController.preferredModelFrameIsLoading(...args),
  handleShortcutAction: (...args) => handleShortcutAction(...args)
});
const prepareContentFrameRuntime = (...args) => frameBridgeController.prepareContentFrameRuntime(...args);
const scheduleContentFrameRepair = (...args) => frameBridgeController.scheduleContentFrameRepair(...args);
const verifiedCurrentContentFrameRegistration = (...args) => frameBridgeController.verifiedCurrentContentFrameRegistration(...args);
preferredModelController = createPreferredModelController({
  state: preferredModelState,
  workspace: () => workspaceController,
  framePort: frameRuntimePort,
  appRoot,
  normalizePromptImages,
  rememberPromptSelection: (...args) => rememberPromptSelection(...args),
  syncPromptCollapsedPreview: (...args) => syncPromptCollapsedPreview(...args),
  restorePromptSelection: (...args) => restorePromptSelection(...args),
  closePromptActionsMenu: (...args) => closePromptActionsMenu(...args),
  promptHasContent: (...args) => promptHasContent(...args),
  collapsePromptInput: (...args) => collapsePromptInput(...args),
  verifiedCurrentContentFrameRegistration,
  prepareContentFrameRuntime
});
const {
  applyPreferredModelsToFrames,
  armPreferredModelSubmissionNavigation,
  capturePreferredModelLockedPromptSnapshot,
  ensurePreferredModelInputReady,
  finishBootstrapping: finishPreferredModelBootstrapping,
  finishPreferredModelSubmissionNavigation,
  handlePreferredModelFrameLifecycleChange,
  handlePreferredModelPromptCompositionEnd,
  handlePreferredModelPromptCompositionStart,
  handlePromptBlur,
  installPreferredModelFrameCleanup,
  notifyPreferredModelGateBlocked,
  preferredModelInputGateIsLocked,
  preferredModelPromptCompositionIsActive,
  rememberPreferredModelLockedPromptSnapshot,
  restorePreferredModelLockedPromptSnapshot,
  syncPreferredModelInputGate
} = preferredModelController;

const keyboardPlatform = detectKeyboardPlatform();

function activeShortcutProfile() {
  return state.shortcutConfig?.profiles?.[keyboardPlatform]
    || shortcutProfile(state.shortcutConfig, keyboardPlatform);
}

function formatActiveShortcut(action, digitLabel = "") {
  const shortcut = activeShortcutProfile()?.shortcuts?.[action];
  return formatShortcut(action, shortcut, digitLabel, keyboardPlatform);
}

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
  const shortcut = formatActiveShortcut(action, digitLabel);
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
workspaceController = createWorkspaceController({
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
          state: featureState.settings,
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
          hydrateGroups: workspaceController.hydrateGroups,
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

function topbarPromptPlaceholderConfig() {
  return normalizeTopbarPromptPlaceholderConfig(topbarState.options?.topbarPromptPlaceholderConfig);
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
    topbarState.options = {
      ...topbarState.options,
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
  topbarState.options = {
    ...topbarState.options,
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
    topbarState.options = await saveOptions(topbarState.options);
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

function resetPromptHistoryNavigation() {
  composerState.promptHistoryCursor = PROMPT_HISTORY_LIVE_CURSOR;
  composerState.promptHistoryDraft = "";
}

function promptHasImages(images = composerState.promptImages) {
  return promptImageModel.hasImages(images);
}

function promptHasContent(text = composerState.promptText, images = composerState.promptImages) {
  return promptImageModel.hasContent(text, images);
}

function promptImageSendTimeoutMs(images = []) {
  return promptImageModel.timeoutMs(images);
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

function renderCollapsedPromptImages(images = composerState.promptImages) {
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

function renderCollapsedPromptPreviewContent(collapsed, images = composerState.promptImages) {
  return [
    renderCollapsedPromptImages(images),
    el("span", { class: "prompt-collapsed-preview-text" }, collapsed.text)
  ].filter(Boolean);
}

function syncPromptImagesPreview() {
  const images = normalizePromptImages(composerState.promptImages);
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
    return composerState.promptImages;
  }
  composerState.promptImages = normalizePromptImages(images);
  resetPromptHistoryNavigation();
  syncPromptImagesPreview();
  const inputNode = syncPromptInputNode({ focus });
  if (focus && inputNode) expandPromptInput(inputNode);
  return composerState.promptImages;
}

function removePromptImage(id) {
  setPromptImages(composerState.promptImages.filter((image) => image.id !== id), { focus: true });
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
      const entry = await promptImageEntryFromFile(file, composerState.promptImages.length + entries.length);
      if (entry) entries.push(entry);
    } catch (error) {
      console.warn("[ChatClub] Failed to load prompt image", error);
    }
  }
  if (!entries.length) {
    toast(t("toast.promptImageLoadFailed"), "error");
    return [];
  }
  const nextImages = setPromptImages([...composerState.promptImages, ...entries], { focus });
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
    ...composerState.promptSendHistory
  ]);
  composerState.promptSendHistory = await savePromptSendHistory(next);
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
    sendKeyMode: activeShortcutProfile()?.sendKeyMode || "enter"
  };
  const remainingMs = Math.max(1000, sendDeadlineAt - Date.now());
  const sendOnce = () => sendToContentFrame(iframe, "sendText", payload, { timeoutMs: remainingMs });
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
  if (composerState.promptSendInFlight) return;
  if (!ensurePreferredModelInputReady()) return;
  const text = composerState.promptText.trim();
  const images = normalizePromptImages(composerState.promptImages);
  if (!promptHasContent(text, images)) return;
  const frames = workspaceController.currentFrames();
  if (!frames.length) return;
  const targets = frames.map((iframe) => ({ iframe, app: workspaceController.frameApp(iframe) || {} }));
  const sendId = createId("prompt-send");
  const timeoutMs = images.length ? promptImageSendTimeoutMs(images, PROMPT_IMAGE_RETRY_COUNT) : 12000;
  const deadlineAt = Date.now() + timeoutMs;
  composerState.promptSendInFlight = true;
  syncPromptSendButton();
  try {
    const sendTasks = targets.map(async ({ iframe, app }) => {
      const statusToast = createFrameToast(
        iframe,
        t("toast.frameSubmitPending"),
        "info",
        composerState.options?.frameToastPosition
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
    composerState.promptSendInFlight = false;
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
    composerState.promptText = inputNode.value;
    rememberPromptSelection(inputNode);
    syncPromptCollapsedPreview(inputNode);
  }
  return sendPromptToFrames();
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

async function collectSummary() {
  const permissionAttempt = requestFeatureUserScriptsPermission("summary").catch((error) => {
    toast(error.message || String(error), "error");
    return false;
  });
  const [controller] = await Promise.all([ensureSummaryController(), permissionAttempt]);
  return controller.collect();
}

function resizePromptInput(inputNode, expanded = inputNode.classList.contains("prompt-input-expanded")) {
  const sizing = promptInputHeight(inputNode.scrollHeight, window.innerHeight, expanded, {
    hasImages: composerState.promptImages.length > 0
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
  composerState.promptSelection = {
    start: inputNode.selectionStart,
    end: inputNode.selectionEnd,
    direction: inputNode.selectionDirection || "none"
  };
}

function restorePromptSelection(inputNode) {
  const selection = composerState.promptSelection || {};
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

function promptHasText(value = composerState.promptText) {
  return String(value || "").length > 0;
}

function syncPromptClearButton(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
  const clearButton = shell?.querySelector?.(".prompt-clear-button");
  if (!clearButton) return;
  clearButton.hidden = !promptHasContent(inputNode?.value ?? composerState.promptText, composerState.promptImages);
}

function syncPromptSendButton(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell") || document.querySelector(".prompt-shell");
  const sendButton = shell?.querySelector?.(".prompt-send-button");
  if (!sendButton) return;
  sendButton.disabled = preferredModelInputGateIsLocked()
    || composerState.promptSendInFlight
    || !promptHasContent(inputNode?.value ?? composerState.promptText, composerState.promptImages);
}

function promptCollapsedPreviewWithImages(value = composerState.promptText, placeholder = promptPlaceholder()) {
  return promptCollapsedPreview(value, placeholder);
}

function syncPromptCollapsedPreview(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell");
  const preview = shell?.querySelector?.(".prompt-collapsed-preview");
  const value = inputNode?.value ?? composerState.promptText;
  syncPromptClearButton(inputNode);
  syncPromptSendButton(inputNode);
  syncPromptImagesPreview();
  if (!preview) return;
  const collapsed = promptCollapsedPreviewWithImages(value, promptPlaceholder());
  preview.replaceChildren(...renderCollapsedPromptPreviewContent(collapsed, composerState.promptImages));
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
  composerState.promptText = "";
  composerState.promptImages = [];
  composerState.promptSelection = { start: 0, end: 0, direction: "none" };
  resetPromptHistoryNavigation();
  const inputNode = syncPromptInputNode({ focus: true, bypassModelGate }) || document.querySelector(".prompt-input");
  try { inputNode?.setSelectionRange(0, 0, "none"); } catch {}
}

function applyPromptHistoryNavigation(inputNode, result) {
  composerState.promptText = result.text;
  composerState.promptImages = normalizePromptImages(result.images);
  composerState.promptHistoryCursor = result.cursor;
  composerState.promptHistoryDraft = result.draft;
  const cursor = composerState.promptText.length;
  composerState.promptSelection = { start: cursor, end: cursor, direction: "none" };
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
      history: composerState.promptSendHistory,
      cursor: composerState.promptHistoryCursor,
      draft: composerState.promptHistoryDraft,
      currentText: inputNode.value,
      currentImages: composerState.promptImages,
      direction: event.key === "ArrowUp" ? "up" : "down"
    });
    if (result.handled) {
      event.preventDefault();
      event.stopPropagation();
      applyPromptHistoryNavigation(inputNode, result);
      return;
    }
  }

  if (matchesSendShortcut(event, activeShortcutProfile()?.sendKeyMode || "enter", keyboardPlatform)) {
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
  composerState.promptText = event.target.value;
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
      if (consumePaletteClickSuppression()) return;
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

function openTopbarEditSettingsMenu() {
  if (!state.topbarEditMode) return;
  const anchor = document.querySelector(".topbar-edit-slot-settingsJumpMenu .top-icon-action, .topbar-edit-slot-settingsJumpMenu button");
  if (anchor) openSettingsJumpMenu(anchor, { forceOpen: true, editing: true });
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

async function openSettings(sectionId = "appearance") {
  try {
    return (await ensureSettingsController()).openSettings(sectionId);
  } catch (error) {
    return lazyControllerError("Settings", error);
  }
}

async function openCustomAppEditor() {
  try {
    return (await ensureSettingsController()).openCustomAppEditor();
  } catch (error) {
    return lazyControllerError("Settings", error);
  }
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
    rememberPreferredModelLockedPromptSnapshot();
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
    const matched = matchShortcut(event, state.shortcutConfig, keyboardPlatform);
    if (matched) {
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
  applyPreferredModelsToFrames(null, { immediate: false });
  finishPreferredModelBootstrapping();
}

init().catch((error) => {
  console.error(error);
  appRoot.append(el("pre", {}, error.stack || error.message || String(error)));
});
