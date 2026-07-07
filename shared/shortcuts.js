import { DEFAULT_SHORTCUT_CONFIG } from "./constants.js";

export const ALL_SHORTCUT_ACTIONS = [
  "focusInput",
  "newChat",
  "newChatAll",
  "deleteThread",
  "optimizePrompt",
  "openSummaryPanel",
  "openPocketPanel",
  "toggleMessageNavigator",
  "closeChat",
  "refreshPage",
  "reloadChat",
  "enterFullscreen",
  "insertPrompt",
  "switchLayout",
  "switchPlatformTab"
];

export const PATTERN_ACTIONS = ["insertPrompt", "switchLayout", "switchPlatformTab"];
export const FIXED_KEY_ACTIONS = ALL_SHORTCUT_ACTIONS.filter((action) => !PATTERN_ACTIONS.includes(action));
export const INTENT_SCOPED_ACTIONS = ["newChat", "toggleMessageNavigator", "closeChat", "refreshPage", "reloadChat", "enterFullscreen"];

export const SHORTCUT_ACTION_LABELS = {
  focusInput: "Focus Input",
  newChat: "New Chat Current Tab",
  newChatAll: "New Chat All Tabs",
  deleteThread: "Delete All Topics",
  optimizePrompt: "Optimize Prompt",
  openSummaryPanel: "Summary Panel",
  openPocketPanel: "Pocket",
  toggleMessageNavigator: "Message Navigator",
  closeChat: "Close Current Tab",
  refreshPage: "Refresh Current Page",
  reloadChat: "Home",
  enterFullscreen: "Full Screen",
  insertPrompt: "Insert Prompt",
  switchLayout: "Switch Layout",
  switchPlatformTab: "Switch Platform Tab"
};

export const SHORTCUT_ACTION_DESCRIPTIONS = {
  focusInput: "Focus the top prompt input.",
  newChat: "Start a new chat in the active tab.",
  newChatAll: "Start new chats in all active pages.",
  deleteThread: "Delete all current topics in active pages.",
  optimizePrompt: "Optimize the current prompt.",
  openSummaryPanel: "Open Summary / Ask.",
  openPocketPanel: "Open Pocket.",
  toggleMessageNavigator: "Toggle the message navigator for the active chat.",
  closeChat: "Close the active tab or group.",
  refreshPage: "Refresh the active chat page.",
  reloadChat: "Go to the active app home page.",
  enterFullscreen: "Toggle the active group fullscreen.",
  insertPrompt: "Insert prompt library item 1-9.",
  switchLayout: "Switch layout preset 1-9.",
  switchPlatformTab: "Switch tab 1-9 in the active group."
};

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight"
]);

const LEGACY_KAGI_CONFLICT_DELETE_THREAD_SHORTCUT = Object.freeze({
  alt: false,
  shift: true,
  cmdOrCtrl: true,
  code: "Backspace"
});

const LEGACY_DEFAULT_NEW_CHAT_SHORTCUT = Object.freeze({
  alt: true,
  shift: false,
  cmdOrCtrl: false,
  code: "KeyN"
});

const LEGACY_DEFAULT_RELOAD_CHAT_SHORTCUTS = Object.freeze([
  Object.freeze({ alt: true, shift: false, cmdOrCtrl: false, code: "KeyR" }),
  Object.freeze({ alt: false, shift: false, cmdOrCtrl: true, code: "KeyR" }),
  Object.freeze({ alt: false, shift: true, cmdOrCtrl: true, code: "KeyR" })
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bool(value, fallback = false) {
  return value == null ? fallback : Boolean(value);
}

function defaultShortcut(action) {
  return DEFAULT_SHORTCUT_CONFIG.shortcuts[action] || {};
}

function shortcutSameFixedShape(shortcut, expected) {
  if (!shortcut || !expected) return false;
  return Boolean(shortcut.disabled) === Boolean(expected.disabled)
    && Boolean(shortcut.cmdOrCtrl) === Boolean(expected.cmdOrCtrl)
    && Boolean(shortcut.alt) === Boolean(expected.alt)
    && Boolean(shortcut.shift) === Boolean(expected.shift)
    && String(shortcut.code || "") === String(expected.code || "");
}

function normalizeFixedShortcut(action, raw) {
  const base = defaultShortcut(action);
  const source = raw || {};
  return {
    disabled: Boolean(source.disabled),
    cmdOrCtrl: bool(source.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
    alt: bool(source.alt, Boolean(base.alt)),
    shift: bool(source.shift, Boolean(base.shift)),
    code: String(source.code || base.code || "")
  };
}

function normalizePatternShortcut(action, raw) {
  const base = defaultShortcut(action);
  const source = raw || {};
  return {
    disabled: Boolean(source.disabled),
    cmdOrCtrl: bool(source.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
    alt: bool(source.alt, Boolean(base.alt)),
    shift: bool(source.shift, Boolean(base.shift)),
    codePattern: "Digit"
  };
}

export function normalizeShortcutConfig(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawShortcuts = { ...(source.shortcuts || {}) };
  if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) {
    rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
  }
  if (
    source.deleteThreadShortcutMigrated !== true
    && shortcutSameFixedShape(rawShortcuts.deleteThread, LEGACY_KAGI_CONFLICT_DELETE_THREAD_SHORTCUT)
  ) {
    rawShortcuts.deleteThread = defaultShortcut("deleteThread");
  }
  if (
    source.newChatShortcutMigrated !== true
    && shortcutSameFixedShape(rawShortcuts.newChat, LEGACY_DEFAULT_NEW_CHAT_SHORTCUT)
  ) {
    rawShortcuts.newChat = defaultShortcut("newChat");
  }
  if (
    source.homeShortcutMigrated !== true
    && LEGACY_DEFAULT_RELOAD_CHAT_SHORTCUTS.some((shortcut) => shortcutSameFixedShape(rawShortcuts.reloadChat, shortcut))
  ) {
    rawShortcuts.reloadChat = defaultShortcut("reloadChat");
  }
  const shortcuts = {};
  for (const action of ALL_SHORTCUT_ACTIONS) {
    shortcuts[action] = PATTERN_ACTIONS.includes(action)
      ? normalizePatternShortcut(action, rawShortcuts[action])
      : normalizeFixedShortcut(action, rawShortcuts[action]);
  }
  return {
    ...clone(DEFAULT_SHORTCUT_CONFIG),
    ...source,
    deleteThreadShortcutMigrated: true,
    newChatShortcutMigrated: true,
    reloadChatShortcutMigrated: true,
    homeShortcutMigrated: true,
    sendKeyMode: source.sendKeyMode === "mod-enter" ? "mod-enter" : "enter",
    shortcuts
  };
}

export function shortcutUsesDigitPattern(action, shortcut) {
  return PATTERN_ACTIONS.includes(action) || shortcut?.codePattern === "Digit";
}

export function digitMatch(code) {
  return /^Digit([0-9])$/.exec(code || "") || /^Numpad([0-9])$/.exec(code || "");
}

function matchSingleShortcut(event, action, shortcut) {
  if (!shortcut || shortcut.disabled) return null;
  const cmdOrCtrl = Boolean(event.metaKey || event.ctrlKey);
  if (Boolean(shortcut.cmdOrCtrl) !== cmdOrCtrl) return null;
  if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return null;
  if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return null;
  if (shortcutUsesDigitPattern(action, shortcut)) {
    const match = digitMatch(event.code);
    return match ? { digit: match[1] } : null;
  }
  return shortcut.code && event.code === shortcut.code ? {} : null;
}

export function matchShortcut(event, shortcutConfig) {
  const config = normalizeShortcutConfig(shortcutConfig);
  for (const action of ALL_SHORTCUT_ACTIONS) {
    const matchObj = matchSingleShortcut(event, action, config.shortcuts[action]);
    if (matchObj) return { action, matchObj };
  }
  return null;
}

export function formatShortcut(action, shortcut, digitLabel = "") {
  if (!shortcut || shortcut.disabled) return "Disabled";
  const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
  const parts = [];
  if (shortcut.cmdOrCtrl) parts.push(mac ? "⌘" : "Ctrl");
  if (shortcut.alt) parts.push(mac ? "⌥" : "Alt");
  if (shortcut.shift) parts.push(mac ? "⇧" : "Shift");
  if (shortcutUsesDigitPattern(action, shortcut)) parts.push(digitLabel || "1-9");
  else if (shortcut.code) parts.push(shortcut.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num "));
  return parts.join(mac ? "" : "+") || "Unassigned";
}

export function shortcutFromKeyboardEvent(event, action) {
  const pattern = PATTERN_ACTIONS.includes(action);
  if (!event.code || MODIFIER_CODES.has(event.code)) return null;
  const shortcut = {
    disabled: false,
    cmdOrCtrl: Boolean(event.metaKey || event.ctrlKey),
    alt: Boolean(event.altKey),
    shift: Boolean(event.shiftKey)
  };
  if (pattern) {
    if (!digitMatch(event.code)) return null;
    shortcut.codePattern = "Digit";
  } else {
    shortcut.code = event.code;
  }
  return shortcut;
}

function shortcutSignatures(action, shortcut) {
  if (!shortcut || shortcut.disabled) return [];
  const modifiers = [
    shortcut.cmdOrCtrl ? "mod" : "",
    shortcut.alt ? "alt" : "",
    shortcut.shift ? "shift" : ""
  ].filter(Boolean).join("+");
  if (shortcutUsesDigitPattern(action, shortcut)) {
    return Array.from({ length: 10 }, (_, index) => `${modifiers}:Digit${index}`);
  }
  return shortcut.code ? [`${modifiers}:${shortcut.code}`] : [];
}

export function shortcutConflictActions(shortcutConfig) {
  const config = normalizeShortcutConfig(shortcutConfig);
  const seen = new Map();
  const conflicts = new Set();
  for (const action of ALL_SHORTCUT_ACTIONS) {
    for (const signature of shortcutSignatures(action, config.shortcuts[action])) {
      const existing = seen.get(signature);
      if (existing) {
        conflicts.add(existing);
        conflicts.add(action);
      } else {
        seen.set(signature, action);
      }
    }
  }
  return conflicts;
}

export function defaultShortcutConfig() {
  return normalizeShortcutConfig(DEFAULT_SHORTCUT_CONFIG);
}
