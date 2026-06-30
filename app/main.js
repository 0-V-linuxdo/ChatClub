import {
  APP_NAME,
  REPOSITORY_URL,
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_THINKING_LEVEL_PREFERENCE_KEY,
  GEMINI_THINKING_LEVEL_TARGETS,
  MODEL_PREFERENCE_TARGETS
} from "../shared/constants.js";
import { sendToIframe } from "../shared/post-message.js";
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
  normalizePromptSendHistory,
  normalizeOptions,
  normalizePrimaryColor,
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
const faviconDiscoveryPromises = new Map();
let faviconCachePersistTimer = 0;
let appShellNode = null;
let topbarNode = null;
let activeTopbarEditPointerDrag = null;
let suppressTopbarPaletteClick = false;
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
const preferredModelApplyRuns = new WeakMap();
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
  reload: [
    ["path", { d: "M21 12a9 9 0 1 1-2.6-6.4" }],
    ["path", { d: "M21 3v6h-6" }]
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
  temporaryLayoutPreset: null,
  fullscreenGroupId: null,
  promptText: "",
  promptSelection: { start: 0, end: 0, direction: "none" },
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
  settingsPromptTemplateDragId: "",
  settingsPromptLibraryDragId: "",
  settingsProfileDragId: "",
  settingsCustomAppDragId: "",
  settingsAppearanceTab: "workspace",
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
  syncPromptInputNode
});
const optimizeController = createOptimizeController(appContext);
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
  formatShortcut
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
const settingsController = createSettingsController({
  state,
  svgIcon,
  syncPromptInputNode,
  notifyConfigReload,
  render,
  syncTopbar,
  syncSummaryPanel,
  syncWorkspaceDom: workspaceController.syncWorkspaceDom,
  applyPreferredModels: applyPreferredModelsToFrames,
  applyTheme,
  syncI18nLanguage,
  hydrateGroups: workspaceController.hydrateGroups,
  enterTopbarEditMode
});

function promptPlaceholder() {
  return t("topbar.promptPlaceholder");
}

function menuButton(label, iconName, onClick, variant = "secondary", disabled = false, tooltipLabel = label, tooltipPlacement = "", tooltipId = "") {
  return createMenuButton({ label, icon: svgIcon(iconName), onClick, variant, disabled, tooltipLabel, tooltipPlacement, tooltipId });
}

function allApps() {
  return getAllChatApps(state.customConfig);
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
  document.documentElement.style.setProperty("--primary", primaryColor);
  document.documentElement.style.setProperty("--primary-2", `color-mix(in srgb, ${primaryColor} ${isDark ? "22%" : "14%"}, ${isDark ? "#020617" : "#ffffff"})`);
  document.documentElement.style.setProperty("--summary-panel-link", primaryColor);
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

async function recordPromptSendHistory(text) {
  const value = String(text || "").trim();
  if (!value) return;
  const next = normalizePromptSendHistory([
    { id: createId("prompt-history"), text: value, createdAt: new Date().toISOString() },
    ...state.promptSendHistory
  ]);
  state.promptSendHistory = await savePromptSendHistory(next);
  resetPromptHistoryNavigation();
}

async function sendPromptToFrames() {
  const text = state.promptText.trim();
  if (!text) return;
  const frames = workspaceController.currentFrames();
  if (!frames.length) return;
  await recordPromptSendHistory(text);
  await Promise.allSettled(frames.map((iframe) => {
    const app = workspaceController.frameApp(iframe);
    return sendToIframe(iframe, "sendText", {
      text,
      inputSelector: app.inputSelector,
      sendButtonSelector: app.sendButtonSelector,
      sendKeyMode: state.shortcutConfig?.sendKeyMode || "enter"
    }, 10000);
  }));
  toast(t("toast.sentToChats", { count: frames.length, plural: frames.length === 1 ? "" : "s" }), "success");
}

function preferredModelAppId(app) {
  return MODEL_PREFERENCE_APP_ID_ALIASES[String(app?.id || "")] || MODEL_PREFERENCE_APP_ID_ALIASES[String(app?.name || "")] || String(app?.id || "");
}

function preferredModelForApp(app) {
  const appId = preferredModelAppId(app);
  const modelId = String(state.options?.modelPreferences?.[appId] || "");
  if (!modelId) return "";
  return (MODEL_PREFERENCE_TARGETS[appId] || []).some((target) => target.id === modelId) ? modelId : "";
}

function preferredGeminiThinkingLevel() {
  const value = String(state.options?.modelPreferences?.[GEMINI_THINKING_LEVEL_PREFERENCE_KEY] || DEFAULT_GEMINI_THINKING_LEVEL);
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

function preferredModelFrameKey(iframe) {
  if (!iframe) return "";
  const app = workspaceController.frameApp(iframe);
  const payload = preferredModelPayloadForApp(app);
  if (!payload) return "";
  const thinkingLevel = payload.thinkingLevel ? `:${payload.thinkingLevel}` : "";
  return `${payload.appId}:${payload.modelId}${thinkingLevel}:${iframe.dataset.currentHref || iframe.src || ""}`;
}

async function applyPreferredModelToFrame(iframe, options = {}) {
  if (!iframe) return null;
  const app = workspaceController.frameApp(iframe);
  const payload = preferredModelPayloadForApp(app);
  if (!payload) return null;
  try {
    const result = await sendToIframe(iframe, "applyPreferredModel", payload, 15000);
    if (result?.ok === false && !options.quiet) {
      console.warn("[ChatClub] Preferred model was not applied", payload.appId, payload.modelId, result.reason || result);
    }
    return result;
  } catch (error) {
    if (!options.quiet) console.warn("[ChatClub] Failed to apply preferred model", payload.appId, payload.modelId, error);
    return {
      ok: false,
      appId: payload.appId,
      modelId: payload.modelId,
      reason: error?.message || String(error || "message timeout")
    };
  }
}

function schedulePreferredModelApplyToFrame(iframe, options = {}) {
  const key = preferredModelFrameKey(iframe);
  if (!key) return null;
  const token = createId("model-apply");
  const delays = options.immediate
    ? MODEL_PREFERENCE_APPLY_RETRY_DELAYS
    : MODEL_PREFERENCE_READY_APPLY_RETRY_DELAYS;
  preferredModelApplyRuns.set(iframe, { token, key });
  const run = async (attempt = 0) => {
    const record = preferredModelApplyRuns.get(iframe);
    if (!record || record.token !== token || record.key !== preferredModelFrameKey(iframe)) return;
    const isLastAttempt = attempt >= delays.length - 1;
    const result = await applyPreferredModelToFrame(iframe, { quiet: !isLastAttempt });
    if (result?.ok || /unknown model/i.test(String(result?.reason || ""))) return;
    if (attempt + 1 < delays.length) {
      window.setTimeout(() => run(attempt + 1), delays[attempt + 1]);
    }
  };
  window.setTimeout(() => run(0), delays[0]);
  return { token, key };
}

async function applyPreferredModelsToFrames(frames = null, options = {}) {
  const frameList = frames
    ? Array.from(frames).filter(Boolean)
    : Array.from(document.querySelectorAll(".chat-frame"));
  const immediate = options.immediate !== false;
  for (const iframe of frameList) schedulePreferredModelApplyToFrame(iframe, { immediate });
}

async function newChatOnFrames() {
  await Promise.allSettled(workspaceController.currentFrames().map(async (iframe) => {
    try {
      await sendToIframe(iframe, "newChatPreprocess", {}, 1500);
    } catch {}
    const app = workspaceController.frameApp(iframe);
    iframe.src = app.url;
  }));
}

async function optimizeCurrentPrompt() {
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
  const sizing = promptInputHeight(inputNode.scrollHeight, window.innerHeight, expanded);
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

function syncPromptCollapsedPreview(inputNode = document.querySelector(".prompt-input")) {
  const shell = inputNode?.closest?.(".prompt-shell");
  const preview = shell?.querySelector?.(".prompt-collapsed-preview");
  if (!preview) return;
  const collapsed = promptCollapsedPreview(inputNode?.value ?? state.promptText, promptPlaceholder());
  preview.textContent = collapsed.text;
  preview.title = collapsed.title;
  preview.classList.toggle("prompt-collapsed-preview-empty", collapsed.empty);
}

function expandPromptInput(inputNode) {
  syncPromptCollapsedPreview(inputNode);
  inputNode.closest?.(".prompt-shell")?.classList.add("prompt-shell-expanded");
  inputNode.classList.add("prompt-input-expanded");
  resizePromptInput(inputNode, true);
  restorePromptSelectionSoon(inputNode);
}

function collapsePromptInput(inputNode) {
  rememberPromptSelection(inputNode);
  syncPromptCollapsedPreview(inputNode);
  inputNode.closest?.(".prompt-shell")?.classList.remove("prompt-shell-expanded");
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

function applyPromptHistoryNavigation(inputNode, result) {
  state.promptText = result.text;
  state.promptHistoryCursor = result.cursor;
  state.promptHistoryDraft = result.draft;
  const cursor = state.promptText.length;
  state.promptSelection = { start: cursor, end: cursor, direction: "none" };
  const syncedInput = syncPromptInputNode({ focus: true }) || inputNode;
  try { syncedInput?.setSelectionRange(cursor, cursor, "none"); } catch {}
}

function handlePromptInputKeydown(event) {
  const inputNode = event.currentTarget;
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
    sendPromptToFrames();
  }
}

function renderTopbar() {
  if (state.topbarEditMode) return renderTopbarEditMode();
  const prompt = textarea(state.promptText, {
    class: "textarea prompt-input",
    rows: 1,
    placeholder: promptPlaceholder(),
    onpointerdown: handlePromptPointerDown,
    onfocus: (event) => expandPromptInput(event.target),
    onblur: (event) => collapsePromptInput(event.target),
    onclick: handlePromptClick,
    onkeyup: (event) => rememberPromptSelection(event.target),
    onselect: (event) => rememberPromptSelection(event.target),
    oninput: (event) => {
      state.promptText = event.target.value;
      resetPromptHistoryNavigation();
      rememberPromptSelection(event.target);
      syncPromptCollapsedPreview(event.target);
      expandPromptInput(event.target);
    },
    onkeydown: handlePromptInputKeydown
  });
  const collapsedPreview = promptCollapsedPreview(state.promptText, promptPlaceholder());
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
    onpointerdown: handlePromptPointerDown,
    onfocus: (event) => expandPromptInput(event.target),
    onblur: (event) => collapsePromptInput(event.target),
    onclick: handlePromptClick,
    onkeyup: (event) => rememberPromptSelection(event.target),
    onselect: (event) => rememberPromptSelection(event.target),
    oninput: (event) => {
      state.promptText = event.target.value;
      resetPromptHistoryNavigation();
      rememberPromptSelection(event.target);
      syncPromptCollapsedPreview(event.target);
      expandPromptInput(event.target);
    },
    onkeydown: handlePromptInputKeydown
  });
  const collapsedPreview = promptCollapsedPreview(state.promptText, promptPlaceholder());
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
      compactIconButton(t("common.cancel"), "x", exitTopbarEditMode, "topbar-edit-utility topbar-edit-cancel", t("common.cancel"), "", "topbar.customize.cancel"),
      el("button", {
        class: "button button-primary topbar-edit-done",
        type: "button",
        onclick: saveTopbarEditLayout
      }, t("topbar.customize.done"))
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

function renderTopbarPaletteItem(item, flexTemplate = false) {
  const label = t(topbarItemLabelKey(item));
  return el("button", {
    class: `topbar-palette-item tooltip-trigger ${flexTemplate ? "topbar-palette-flex" : `topbar-palette-${item.id}`}`,
    type: "button",
    "aria-label": label,
    "data-tooltip": label,
    "data-tooltip-id": "topbar.customize.paletteItem",
    draggable: "false",
    dataset: { topbarItemId: item.id, topbarPalette: flexTemplate ? "flex" : "item" },
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
    svgIcon(topbarItemIcon(item)),
    el("span", {}, label)
  );
}

function renderTopbarEditSlot(item, prompt, collapsedPreview) {
  const label = t(topbarItemLabelKey(item));
  const body = el("div", { class: "topbar-edit-slot-body" },
    renderTopbarItem(item, prompt, collapsedPreview)
  );
  return el("div", {
    class: `topbar-edit-slot ${item.type === "flex" ? "topbar-edit-slot-flex" : `topbar-edit-slot-item topbar-edit-slot-${item.id}`}`,
    role: "listitem",
    draggable: "false",
    title: label,
    "aria-label": label,
    style: item.type === "flex" ? { "--topbar-flex-weight": String(item.weight || 1) } : {},
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

async function saveTopbarEditLayout() {
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
}

function addTopbarEditFlexSpace() {
  setTopbarEditLayoutDraft([
    ...activeTopbarEditLayout(),
    { type: "flex", id: createId("topbar-flex"), weight: 1 }
  ]);
}

function insertTopbarPaletteItem(item, flexTemplate = false) {
  const layout = activeTopbarEditLayout();
  if (flexTemplate || item.type === "flex") {
    setTopbarEditLayoutDraft([
      ...layout,
      { type: "flex", id: createId("topbar-flex"), weight: item.weight || 1 }
    ]);
    return;
  }
  if (layout.some((entry) => entry.type === "item" && entry.id === item.id)) return;
  setTopbarEditLayoutDraft([...layout, { type: "item", id: item.id }]);
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
    promptLibrary: "topbar.promptLibrary",
    send: "topbar.send",
    newChat: "topbar.newChat",
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
      "aria-hidden": "true",
      style: { "--topbar-flex-weight": String(item.weight || 1) }
    });
  }
  if (item.id === "brand") return renderTopbarBrand();
  if (item.id === "settings") return renderTopbarSettingsButton();
  if (item.id === "promptLibrary") return renderPromptLibraryButton();
  if (item.id === "composer") return renderTopbarComposer(prompt, collapsedPreview);
  if (item.id === "send") return actionButton(t("topbar.send"), "send", sendPromptToFrames, "primary", t("topbar.send"), "", "", "topbar.send");
  if (item.id === "newChat") return actionButton(t("topbar.newChat"), "edit", newChatOnFrames, "secondary", shortcutTooltip(t("topbar.newChat"), "newChat"), "", "", "topbar.newChat");
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

function openChatClubRepository(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  workspaceController.openTabUrl(REPOSITORY_URL);
}

function renderTopbarBrand() {
  const label = t("topbar.repository");
  return el("button", {
    class: `brand tooltip-trigger ${topbarItemClass("brand")}`,
    type: "button",
    "aria-label": label,
    "data-tooltip": label,
    "data-tooltip-id": "topbar.brand",
    onclick: openChatClubRepository
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

function renderPromptLibraryButton() {
  return el("button", {
    class: `prompt-library-button compact-icon tooltip-trigger ${topbarItemClass("prompt-library")}`,
    type: "button",
    "aria-label": t("topbar.promptLibrary"),
    "data-tooltip": t("topbar.promptLibrary"),
    "data-tooltip-id": "topbar.promptLibrary",
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPromptLibraryDialog();
    }
  }, svgIcon("library"));
}

function renderTopbarComposer(prompt, collapsedPreview) {
  return el("div", { class: `composer ${topbarItemClass("composer")}` },
    el("div", { class: "prompt-shell", onpointerdown: handlePromptPointerDown },
      prompt,
      el("div", {
        class: `prompt-collapsed-preview ${collapsedPreview.empty ? "prompt-collapsed-preview-empty" : ""}`.trim(),
        title: collapsedPreview.title,
        onclick: handlePromptOverlayClick
      }, collapsedPreview.text),
      el("button", {
        class: "prompt-optimize-button compact-icon tooltip-trigger",
        type: "button",
        "aria-label": t("topbar.optimizePrompt"),
        "data-tooltip": shortcutTooltip(t("topbar.optimizePrompt"), "optimizePrompt"),
        "data-tooltip-id": "topbar.optimizePrompt",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          optimizeCurrentPrompt();
        },
        onpointerdown: (event) => event.stopPropagation(),
        onkeydown: (event) => event.stopPropagation()
      }, svgIcon("sparkles"))
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
    openSettings();
    return;
  }
  if (item.id === "promptLibrary") {
    closeSettingsJumpMenu();
    openPromptLibraryDialog();
    return;
  }
  if (item.id === "composer") {
    closeSettingsJumpMenu();
    focusPromptInput();
    return;
  }
  if (item.id === "send") {
    closeSettingsJumpMenu();
    sendPromptToFrames();
    return;
  }
  if (item.id === "newChat") {
    closeSettingsJumpMenu();
    newChatOnFrames();
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
  return settingsController.openPromptLibraryDialog();
}

function insertTextIntoPrompt(text) {
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

function syncPromptInputNode({ focus = false } = {}) {
  const inputNode = document.querySelector(".prompt-input");
  if (!inputNode) return null;
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
  else if (action === "newChat") await newChatOnFrames();
  else if (action === "optimizePrompt") await optimizeCurrentPrompt();
  else if (action === "openSummaryPanel" || action === "openSummary") openSummaryPanel();
  else if (action === "openPocketPanel") openPocketPanel();
  else if (action === "closeChat" && group && chat) await workspaceController.closeTab(group, chat);
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
          } else if (message.action === "write") {
            await navigator.clipboard.writeText(String(message.data?.text || ""));
            data = { ok: true };
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
    if (message.action === "contentReady") {
      event.source?.postMessage({ source: "chatclub", type: "response", id: message.id, action: message.action, data: { ok: true } }, "*");
      const iframe = workspaceController.iframeForWindow(event.source);
      const href = workspaceController.openableTabUrl(message.data?.href);
      if (iframe && href) iframe.dataset.currentHref = href;
      workspaceController.syncFrameFavicon(event.source).catch((error) => console.warn("[ChatClub] Failed to sync frame favicon", error));
      if (iframe) schedulePreferredModelApplyToFrame(iframe);
    }
  }, true);
}

function installPreferredModelIframeLoadHandler() {
  document.addEventListener("load", (event) => {
    const iframe = event.target;
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.classList.contains("chat-frame")) return;
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
  workspaceController.hydrateGroups();
  installGlobalTooltips({
    getDisabledTooltipIds: () => state.options?.tooltipDisabledIds || []
  });
  installExtensionTabTracker();
  installShortcuts();
  installIframeEventBridge();
  installPreferredModelIframeLoadHandler();
  render();
  requestAnimationFrame(() => applyPreferredModelsToFrames(null, { immediate: false }));
}

init().catch((error) => {
  console.error(error);
  appRoot.append(el("pre", {}, error.stack || error.message || String(error)));
});
