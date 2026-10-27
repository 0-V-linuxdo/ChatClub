// Default key bindings and the stored config model (v2 06 §2). Order matters: the first matching
// action wins.

const M = (code, { command = false, option = false, shift = false, control = false } = {}) => ({ disabled: false, command, control, option, shift, ...code });
const W = (code, { control = false, alt = false, shift = false } = {}) => ({ disabled: false, control, alt, shift, ...code });
const key = (code) => ({ code });
const digits = { codePattern: "Digit" };

export const SHORTCUT_ACTIONS = [
  ["focusInput", M(key("KeyK"), { option: true }), W(key("KeyK"), { alt: true })],
  ["enterSearchMode", M(key("KeyF"), { option: true, shift: true }), W(key("KeyF"), { alt: true, shift: true })],
  ["openNewWorkspaceTab", M(key("KeyN"), { command: true, option: true, shift: true }), W(key("KeyN"), { control: true, alt: true, shift: true })],
  ["toggleWorkspaceTabsSidebar", M(key("KeyB"), { command: true }), W(key("KeyB"), { control: true })],
  ["toggleTopbar", M(key("KeyB"), { option: true, shift: true }), W(key("KeyB"), { alt: true, shift: true })],
  ["openSettings", M(key("KeyS"), { command: true, option: true, shift: true }), W(key("KeyS"), { control: true, alt: true, shift: true })],
  ["openAppPicker", M(key("KeyA"), { command: true, option: true, shift: true }), W(key("KeyA"), { control: true, alt: true, shift: true })],
  ["openSettingsMenu", M(key("KeyJ"), { command: true, option: true, shift: true }), W(key("KeyJ"), { control: true, alt: true, shift: true })],
  ["newChat", M(key("KeyN"), { command: true }), W(key("KeyN"), { control: true })],
  ["newChatAll", M(key("KeyN"), { command: true, shift: true }), W(key("KeyN"), { control: true, shift: true })],
  ["deleteThread", M(key("KeyD"), { option: true, shift: true }), W(key("KeyD"), { alt: true, shift: true })],
  ["optimizePrompt", M(key("KeyO"), { option: true }), W(key("KeyO"), { alt: true })],
  ["openSummaryPanel", M(key("KeyS"), { option: true }), W(key("KeyS"), { alt: true })],
  ["openSharePanel", M(key("KeyS"), { option: true, shift: true }), W(key("KeyS"), { alt: true, shift: true })],
  ["openPocketPanel", M(key("KeyP"), { command: true }), W(key("KeyP"), { control: true })],
  ["openHistoryPanel", M(key("KeyH"), { option: true, shift: true }), W(key("KeyH"), { alt: true, shift: true })],
  ["toggleMessageNavigator", M(key("KeyM"), { command: true }), W(key("KeyM"), { control: true })],
  ["closeChat", M(key("KeyW"), { option: true }), W(key("KeyW"), { alt: true })],
  ["refreshPage", M(key("KeyR"), { command: true }), W(key("KeyR"), { control: true })],
  ["reloadChat", M(key("KeyH"), { command: true }), W(key("KeyH"), { control: true })],
  ["enterFullscreen", M(key("KeyF"), { option: true }), W(key("KeyF"), { alt: true })],
  ["insertPrompt", M(digits, { option: true }), W(digits, { alt: true })],
  ["switchLayout", M(digits, { command: true, shift: true }), W(digits, { control: true, shift: true })],
  ["switchPlatformTab", M(digits, { command: true }), W(digits, { control: true })],
];

export const ACTION_IDS = SHORTCUT_ACTIONS.map(([id]) => id);
export const DIGIT_ACTIONS = new Set(SHORTCUT_ACTIONS.filter(([, m]) => m.codePattern === "Digit").map(([id]) => id));
const clone = (v) => JSON.parse(JSON.stringify(v));

export function defaultProfile(platform) {
  const shortcuts = {};
  for (const [id, mac, win] of SHORTCUT_ACTIONS) shortcuts[id] = clone(platform === "mac" ? mac : win);
  return { sendKeyMode: "enter", shortcuts };
}

export function defaultConfig() {
  return { schemaVersion: 2, profiles: { mac: defaultProfile("mac"), windows: defaultProfile("windows") } };
}

const bool = (v) => v === true;
function normalizeShortcut(platform, value, fallback) {
  if (!value || typeof value !== "object") return clone(fallback);
  const out = { disabled: bool(value.disabled) };
  if (platform === "mac") Object.assign(out, { command: bool(value.command), control: bool(value.control), option: bool(value.option), shift: bool(value.shift) });
  else Object.assign(out, { control: bool(value.control), alt: bool(value.alt), shift: bool(value.shift) });
  if (fallback.codePattern === "Digit") out.codePattern = "Digit"; // the digit part can't change
  else if (typeof value.code === "string" && value.code) out.code = value.code;
  else return clone(fallback);
  return out;
}

/** Fills missing profiles/actions with defaults and drops unknown fields. */
export function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== 2) return base;
  for (const platform of ["mac", "windows"]) {
    const profile = raw.profiles?.[platform];
    if (!profile || typeof profile !== "object") continue;
    const target = base.profiles[platform];
    target.sendKeyMode = profile.sendKeyMode === "mod-enter" ? "mod-enter" : "enter";
    for (const id of ACTION_IDS) target.shortcuts[id] = normalizeShortcut(platform, profile.shortcuts?.[id], target.shortcuts[id]);
  }
  return base;
}

const sameLegacy = (sc, { cmdOrCtrl = false, alt = false, shift = false, code }) =>
  !!sc && !sc.codePattern && !!sc.cmdOrCtrl === cmdOrCtrl && !!sc.alt === alt && !!sc.shift === shift && sc.code === code;

/** Migrates a pre-v2 single-profile config (06 §2.5). */
export function migrateLegacyConfig(old) {
  if (!old || typeof old !== "object") return defaultConfig();
  if (old.schemaVersion === 2) return normalizeConfig(old);
  const legacy = { ...(old.shortcuts ?? {}) };
  if (legacy.openSummary && !legacy.openSummaryPanel) legacy.openSummaryPanel = legacy.openSummary;
  delete legacy.openSummary;
  if (!old.deleteThreadShortcutMigrated && sameLegacy(legacy.deleteThread, { cmdOrCtrl: true, shift: true, code: "Backspace" })) delete legacy.deleteThread;
  if (!old.newChatShortcutMigrated && sameLegacy(legacy.newChat, { alt: true, code: "KeyN" })) delete legacy.newChat;
  if (!old.homeShortcutMigrated && legacy.reloadChat
      && [{ alt: true, code: "KeyR" }, { cmdOrCtrl: true, code: "KeyR" }, { cmdOrCtrl: true, shift: true, code: "KeyR" }].some((d) => sameLegacy(legacy.reloadChat, d))) delete legacy.reloadChat;
  const out = defaultConfig();
  for (const platform of ["mac", "windows"]) {
    const profile = out.profiles[platform];
    profile.sendKeyMode = old.sendKeyMode === "mod-enter" ? "mod-enter" : "enter";
    for (const id of ACTION_IDS) {
      const sc = legacy[id];
      if (!sc || typeof sc !== "object") continue;
      const converted = platform === "mac"
        ? { disabled: !!sc.disabled, command: !!sc.cmdOrCtrl, control: false, option: !!sc.alt, shift: !!sc.shift }
        : { disabled: !!sc.disabled, control: !!sc.cmdOrCtrl, alt: !!sc.alt, shift: !!sc.shift };
      if (sc.codePattern === "Digit" || DIGIT_ACTIONS.has(id)) converted.codePattern = "Digit";
      else if (sc.code) converted.code = sc.code;
      profile.shortcuts[id] = normalizeShortcut(platform, converted, profile.shortcuts[id]);
    }
  }
  return out;
}

/** Stored shortcut → internal combo string ("Meta+Alt+Shift+KeyN", "Alt+Digit"). */
export function shortcutToCombo(platform, sc) {
  if (!sc || sc.disabled) return null;
  const mods = platform === "mac"
    ? [sc.command && "Meta", sc.control && "Ctrl", sc.option && "Alt", sc.shift && "Shift"]
    : [sc.control && "Ctrl", sc.alt && "Alt", sc.shift && "Shift"];
  const code = sc.codePattern === "Digit" ? "Digit" : sc.code;
  if (!code) return null;
  return [...mods.filter(Boolean), code].join("+");
}

/** Internal combo string → stored shortcut for a platform. */
export function comboToShortcut(platform, combo, { digit = false } = {}) {
  const parts = String(combo).split("+");
  const code = parts.pop();
  const has = (m) => parts.includes(m);
  const base = platform === "mac"
    ? { disabled: false, command: has("Meta"), control: has("Ctrl"), option: has("Alt"), shift: has("Shift") }
    : { disabled: false, control: has("Ctrl"), alt: has("Alt"), shift: has("Shift") };
  return digit ? { ...base, codePattern: "Digit" } : { ...base, code };
}
