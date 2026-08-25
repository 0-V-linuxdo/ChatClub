import { DEFAULT_SHORTCUT_CONFIG } from "./default-shortcuts.js";

const SHORTCUT_CONFIG_SCHEMA_VERSION = 2;
export const KEYBOARD_PLATFORM_MAC = "mac";
const KEYBOARD_PLATFORM_WINDOWS = "windows";

export const ALL_SHORTCUT_ACTIONS = [
  "focusInput",
  "openNewWorkspaceTab",
  "toggleWorkspaceTabsSidebar",
  "openSettings",
  "openAppPicker",
  "openSettingsMenu",
  "newChat",
  "newChatAll",
  "deleteThread",
  "optimizePrompt",
  "openSummaryPanel",
  "openSharePanel",
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

const PATTERN_ACTIONS = ["insertPrompt", "switchLayout", "switchPlatformTab"];

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

export function normalizeKeyboardPlatform(platform) {
  return String(platform || "").toLowerCase() === KEYBOARD_PLATFORM_MAC
    ? KEYBOARD_PLATFORM_MAC
    : KEYBOARD_PLATFORM_WINDOWS;
}

export function detectKeyboardPlatform(navigatorLike = globalThis.navigator) {
  const platform = [
    navigatorLike?.userAgentData?.platform,
    navigatorLike?.platform,
    navigatorLike?.userAgent
  ].filter(Boolean).join(" ");
  return /Mac|iPhone|iPad|iPod/i.test(platform)
    ? KEYBOARD_PLATFORM_MAC
    : KEYBOARD_PLATFORM_WINDOWS;
}

function defaultProfile(platform) {
  return DEFAULT_SHORTCUT_CONFIG.profiles[normalizeKeyboardPlatform(platform)] || {};
}

function defaultShortcut(action, platform) {
  return defaultProfile(platform).shortcuts?.[action] || {};
}

function shortcutSameFixedShape(shortcut, expected) {
  if (!shortcut || !expected) return false;
  return Boolean(shortcut.disabled) === Boolean(expected.disabled)
    && Boolean(shortcut.cmdOrCtrl) === Boolean(expected.cmdOrCtrl)
    && Boolean(shortcut.alt) === Boolean(expected.alt)
    && Boolean(shortcut.shift) === Boolean(expected.shift)
    && String(shortcut.code || "") === String(expected.code || "");
}

function normalizeFixedShortcut(action, raw, platform) {
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  const base = defaultShortcut(action, normalizedPlatform);
  const source = raw || {};
  const modifiers = normalizedPlatform === KEYBOARD_PLATFORM_MAC
    ? {
      command: bool(source.command, Boolean(base.command)),
      control: bool(source.control, Boolean(base.control)),
      option: bool(source.option, Boolean(base.option)),
      shift: bool(source.shift, Boolean(base.shift))
    }
    : {
      control: bool(source.control, Boolean(base.control)),
      alt: bool(source.alt, Boolean(base.alt)),
      shift: bool(source.shift, Boolean(base.shift))
    };
  return {
    disabled: Boolean(source.disabled),
    ...modifiers,
    code: String(source.code || base.code || "")
  };
}

function normalizePatternShortcut(action, raw, platform) {
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  const base = defaultShortcut(action, normalizedPlatform);
  const source = raw || {};
  const modifiers = normalizedPlatform === KEYBOARD_PLATFORM_MAC
    ? {
      command: bool(source.command, Boolean(base.command)),
      control: bool(source.control, Boolean(base.control)),
      option: bool(source.option, Boolean(base.option)),
      shift: bool(source.shift, Boolean(base.shift))
    }
    : {
      control: bool(source.control, Boolean(base.control)),
      alt: bool(source.alt, Boolean(base.alt)),
      shift: bool(source.shift, Boolean(base.shift))
    };
  return {
    disabled: Boolean(source.disabled),
    ...modifiers,
    codePattern: "Digit"
  };
}

function normalizeShortcutProfile(raw, platform) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawShortcuts = { ...(source.shortcuts || {}) };
  if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) {
    rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
  }
  const shortcuts = {};
  for (const action of ALL_SHORTCUT_ACTIONS) {
    shortcuts[action] = PATTERN_ACTIONS.includes(action)
      ? normalizePatternShortcut(action, rawShortcuts[action], platform)
      : normalizeFixedShortcut(action, rawShortcuts[action], platform);
  }
  return {
    sendKeyMode: source.sendKeyMode === "mod-enter" ? "mod-enter" : "enter",
    shortcuts
  };
}

function legacyDefaultShortcut(action) {
  const mac = defaultShortcut(action, KEYBOARD_PLATFORM_MAC);
  return {
    alt: Boolean(mac.option),
    shift: Boolean(mac.shift),
    cmdOrCtrl: Boolean(mac.command),
    ...(mac.codePattern ? { codePattern: "Digit" } : { code: String(mac.code || "") })
  };
}

function migrateLegacyShortcutConfig(source) {
  const rawShortcuts = { ...(source.shortcuts || {}) };
  if (rawShortcuts.openSummary && !rawShortcuts.openSummaryPanel) {
    rawShortcuts.openSummaryPanel = rawShortcuts.openSummary;
  }
  if (
    source.deleteThreadShortcutMigrated !== true
    && shortcutSameFixedShape(rawShortcuts.deleteThread, LEGACY_KAGI_CONFLICT_DELETE_THREAD_SHORTCUT)
  ) {
    rawShortcuts.deleteThread = legacyDefaultShortcut("deleteThread");
  }
  if (
    source.newChatShortcutMigrated !== true
    && shortcutSameFixedShape(rawShortcuts.newChat, LEGACY_DEFAULT_NEW_CHAT_SHORTCUT)
  ) {
    rawShortcuts.newChat = legacyDefaultShortcut("newChat");
  }
  if (
    source.homeShortcutMigrated !== true
    && LEGACY_DEFAULT_RELOAD_CHAT_SHORTCUTS.some((shortcut) => shortcutSameFixedShape(rawShortcuts.reloadChat, shortcut))
  ) {
    rawShortcuts.reloadChat = legacyDefaultShortcut("reloadChat");
  }
  const sendKeyMode = source.sendKeyMode === "mod-enter" ? "mod-enter" : "enter";
  const profiles = {};
  for (const platform of [KEYBOARD_PLATFORM_MAC, KEYBOARD_PLATFORM_WINDOWS]) {
    const shortcuts = {};
    for (const action of ALL_SHORTCUT_ACTIONS) {
      const base = legacyDefaultShortcut(action);
      const item = rawShortcuts[action] || {};
      const common = {
        disabled: Boolean(item.disabled),
        shift: bool(item.shift, Boolean(base.shift))
      };
      const modifiers = platform === KEYBOARD_PLATFORM_MAC
        ? {
          command: bool(item.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
          control: false,
          option: bool(item.alt, Boolean(base.alt))
        }
        : {
          control: bool(item.cmdOrCtrl, Boolean(base.cmdOrCtrl)),
          alt: bool(item.alt, Boolean(base.alt))
        };
      shortcuts[action] = shortcutUsesDigitPattern(action, item)
        ? { ...common, ...modifiers, codePattern: "Digit" }
        : { ...common, ...modifiers, code: String(item.code || base.code || "") };
    }
    profiles[platform] = normalizeShortcutProfile({ sendKeyMode, shortcuts }, platform);
  }
  return { schemaVersion: SHORTCUT_CONFIG_SCHEMA_VERSION, profiles };
}

export function normalizeShortcutConfig(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  if (source.schemaVersion !== SHORTCUT_CONFIG_SCHEMA_VERSION || !source.profiles) {
    return migrateLegacyShortcutConfig(source);
  }
  return {
    schemaVersion: SHORTCUT_CONFIG_SCHEMA_VERSION,
    profiles: {
      mac: normalizeShortcutProfile(source.profiles.mac, KEYBOARD_PLATFORM_MAC),
      windows: normalizeShortcutProfile(source.profiles.windows, KEYBOARD_PLATFORM_WINDOWS)
    }
  };
}

export function shortcutProfile(shortcutConfig, platform = detectKeyboardPlatform()) {
  return normalizeShortcutConfig(shortcutConfig).profiles[normalizeKeyboardPlatform(platform)];
}

export function replaceShortcutProfile(shortcutConfig, platform, profile) {
  const normalized = normalizeShortcutConfig(shortcutConfig);
  const key = normalizeKeyboardPlatform(platform);
  return {
    ...normalized,
    profiles: {
      ...normalized.profiles,
      [key]: normalizeShortcutProfile(profile, key)
    }
  };
}

export function shortcutUsesDigitPattern(action, shortcut) {
  return PATTERN_ACTIONS.includes(action) || shortcut?.codePattern === "Digit";
}

function digitMatch(code) {
  return /^Digit([1-9])$/.exec(code || "") || /^Numpad([1-9])$/.exec(code || "");
}

function matchSingleShortcut(event, action, shortcut, platform) {
  if (!shortcut || shortcut.disabled) return null;
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  if (normalizedPlatform === KEYBOARD_PLATFORM_MAC) {
    if (Boolean(shortcut.command) !== Boolean(event.metaKey)) return null;
    if (Boolean(shortcut.control) !== Boolean(event.ctrlKey)) return null;
    if (Boolean(shortcut.option) !== Boolean(event.altKey)) return null;
  } else {
    if (event.metaKey) return null;
    if (Boolean(shortcut.control) !== Boolean(event.ctrlKey)) return null;
    if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return null;
  }
  if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return null;
  if (shortcutUsesDigitPattern(action, shortcut)) {
    const match = digitMatch(event.code);
    return match ? { digit: match[1] } : null;
  }
  return shortcut.code && event.code === shortcut.code ? {} : null;
}

export function matchShortcut(event, shortcutConfig, platform = detectKeyboardPlatform()) {
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  const profile = shortcutProfile(shortcutConfig, normalizedPlatform);
  for (const action of ALL_SHORTCUT_ACTIONS) {
    const matchObj = matchSingleShortcut(event, action, profile.shortcuts[action], normalizedPlatform);
    if (matchObj) return { action, matchObj };
  }
  return null;
}

export function formatShortcut(action, shortcut, digitLabel = "", platform = detectKeyboardPlatform()) {
  if (!shortcut || shortcut.disabled) return "Disabled";
  const mac = normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC;
  const parts = [];
  if (mac) {
    if (shortcut.command) parts.push("⌘");
    if (shortcut.control) parts.push("⌃");
    if (shortcut.option) parts.push("⌥");
    if (shortcut.shift) parts.push("⇧");
  } else {
    if (shortcut.control) parts.push("Ctrl");
    if (shortcut.alt) parts.push("Alt");
    if (shortcut.shift) parts.push("Shift");
  }
  if (shortcutUsesDigitPattern(action, shortcut)) parts.push(digitLabel || "1-9");
  else if (shortcut.code) parts.push(shortcut.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num "));
  return parts.join(mac ? "" : "+") || "Unassigned";
}

export function shortcutFromKeyboardEvent(event, action, platform = detectKeyboardPlatform()) {
  const pattern = PATTERN_ACTIONS.includes(action);
  if (!event.code || MODIFIER_CODES.has(event.code)) return null;
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  if (normalizedPlatform === KEYBOARD_PLATFORM_WINDOWS && event.metaKey) return null;
  const shortcut = normalizedPlatform === KEYBOARD_PLATFORM_MAC
    ? {
      disabled: false,
      command: Boolean(event.metaKey),
      control: Boolean(event.ctrlKey),
      option: Boolean(event.altKey),
      shift: Boolean(event.shiftKey)
    }
    : {
      disabled: false,
      control: Boolean(event.ctrlKey),
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

const NATIVE_SEARCH_CHORD_CODES = new Set(["KeyA", "KeyC", "KeyV", "KeyX", "KeyZ"]);

function shortcutKeyToken(action, shortcut) {
  if (!shortcut) return "";
  if (shortcutUsesDigitPattern(action, shortcut)) return "1-9";
  const code = String(shortcut.code || "");
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5).toLowerCase();
  if (code.startsWith("Numpad")) return `num${code.slice(6).toLowerCase()}`;
  return code.toLowerCase();
}

function shortcutModifierTokens(shortcut, platform) {
  if (!shortcut) return [];
  const mac = normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC;
  if (mac) {
    return [
      shortcut.command ? "cmd" : "",
      shortcut.control ? "ctrl" : "",
      shortcut.option ? "alt" : "",
      shortcut.shift ? "shift" : ""
    ].filter(Boolean);
  }
  return [
    shortcut.control ? "ctrl" : "",
    shortcut.alt ? "alt" : "",
    shortcut.shift ? "shift" : ""
  ].filter(Boolean);
}

function compactShortcutSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/⌘/g, "cmd")
    .replace(/⌃/g, "ctrl")
    .replace(/⌥/g, "alt")
    .replace(/⇧/g, "shift")
    .replace(/command/g, "cmd")
    .replace(/control/g, "ctrl")
    .replace(/option/g, "alt")
    .replace(/alternate/g, "alt")
    .replace(/\bopt\b/g, "alt")
    .replace(/meta/g, "cmd")
    .replace(/[^a-z0-9]+/g, "");
}

function shortcutComboMatchesQuery(compactNeedle, shortcut, action, platform) {
  if (!compactNeedle || !shortcut) return false;
  const mods = shortcutModifierTokens(shortcut, platform);
  const compactMods = compactShortcutSearchText(mods.join(""));
  const key = shortcutKeyToken(action, shortcut);
  const compactCombo = `${compactMods}${compactShortcutSearchText(key)}`;
  if (compactCombo === compactNeedle) return true;
  if (compactMods && compactNeedle === compactMods) return true;
  if (!shortcutUsesDigitPattern(action, shortcut)) return false;
  const digitMatch = compactNeedle.match(/^([a-z]*)([1-9])$/);
  if (digitMatch && digitMatch[1] === compactMods) return true;
  return compactNeedle === `${compactMods}19`;
}

export function shortcutMatchesSearchQuery(query, fields = {}) {
  const raw = String(query || "").trim();
  if (!raw) return true;
  const needle = raw.toLowerCase();
  const compactNeedle = compactShortcutSearchText(raw);
  const texts = [
    fields.label,
    fields.description,
    ...(Array.isArray(fields.extraTexts) ? fields.extraTexts : [])
  ].map((value) => String(value || "").toLowerCase());
  const latinKeyQuery = needle.length === 1 && /^[a-z0-9]$/i.test(needle);
  if (!latinKeyQuery && texts.some((text) => text.includes(needle))) return true;

  const shortcut = fields.shortcut;
  const formatted = String(fields.formatted || "");
  const formattedLower = formatted.toLowerCase();
  const key = shortcutKeyToken(fields.action, shortcut);
  const compactKey = compactShortcutSearchText(key);

  if (latinKeyQuery) {
    if (compactKey === compactNeedle || compactKey.replace(/^num/, "") === compactNeedle) return true;
    if (shortcutUsesDigitPattern(fields.action, shortcut) && /[1-9]/.test(needle)) return true;
    const keyPart = formattedLower.includes("+")
      ? formattedLower.split("+").pop()
      : formattedLower;
    const compactKeyPart = compactShortcutSearchText(keyPart);
    return Boolean(compactNeedle && (compactKeyPart === compactNeedle || compactKeyPart.endsWith(compactNeedle)));
  }

  if (formattedLower.includes(needle)) return true;
  const compactFormatted = compactShortcutSearchText(formatted);
  if (compactNeedle && compactFormatted === compactNeedle) return true;
  return shortcutComboMatchesQuery(compactNeedle, shortcut, fields.action, fields.platform);
}

function isNativeSearchChord(event, platform) {
  if (!event || event.shiftKey || event.altKey) return false;
  const mac = normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC;
  const primary = mac
    ? Boolean(event.metaKey) && !event.ctrlKey
    : Boolean(event.ctrlKey) && !event.metaKey;
  return primary && NATIVE_SEARCH_CHORD_CODES.has(event.code);
}

export function shortcutSearchQueryFromKeyboardEvent(event, platform = detectKeyboardPlatform()) {
  if (!event || event.isComposing || event.keyCode === 229) return null;
  if (MODIFIER_CODES.has(event.code)) return null;
  if (isNativeSearchChord(event, platform)) return null;
  const hasModifier = normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC
    ? Boolean(event.metaKey || event.ctrlKey || event.altKey)
    : Boolean(event.ctrlKey || event.altKey);
  if (!hasModifier) return null;
  const captured = shortcutFromKeyboardEvent(event, "focusInput", platform);
  if (!captured) return null;
  return formatShortcut("focusInput", captured, "", platform);
}

function shortcutSignatures(action, shortcut, platform) {
  if (!shortcut || shortcut.disabled) return [];
  const mac = normalizeKeyboardPlatform(platform) === KEYBOARD_PLATFORM_MAC;
  const modifiers = (mac
    ? [shortcut.command ? "command" : "", shortcut.control ? "control" : "", shortcut.option ? "option" : "", shortcut.shift ? "shift" : ""]
    : [shortcut.control ? "control" : "", shortcut.alt ? "alt" : "", shortcut.shift ? "shift" : ""]
  ).filter(Boolean).join("+");
  if (shortcutUsesDigitPattern(action, shortcut)) {
    return Array.from({ length: 9 }, (_, index) => index + 1)
      .flatMap((digit) => [`${modifiers}:Digit${digit}`, `${modifiers}:Numpad${digit}`]);
  }
  return shortcut.code ? [`${modifiers}:${shortcut.code}`] : [];
}

export function shortcutConflictActions(shortcutConfig, platform = detectKeyboardPlatform()) {
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  const profile = shortcutProfile(shortcutConfig, normalizedPlatform);
  const seen = new Map();
  const conflicts = new Set();
  for (const action of ALL_SHORTCUT_ACTIONS) {
    for (const signature of shortcutSignatures(action, profile.shortcuts[action], normalizedPlatform)) {
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

export function defaultShortcutProfile(platform = detectKeyboardPlatform()) {
  return clone(shortcutProfile(DEFAULT_SHORTCUT_CONFIG, platform));
}

export function matchesSendShortcut(event, sendKeyMode = "enter", platform = detectKeyboardPlatform()) {
  if (event?.key !== "Enter" || event?.isComposing || event?.keyCode === 229) return false;
  const normalizedPlatform = normalizeKeyboardPlatform(platform);
  if (sendKeyMode === "mod-enter") {
    if (event.altKey || event.shiftKey) return false;
    return normalizedPlatform === KEYBOARD_PLATFORM_MAC
      ? Boolean(event.metaKey) && !event.ctrlKey
      : Boolean(event.ctrlKey) && !event.metaKey;
  }
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}
