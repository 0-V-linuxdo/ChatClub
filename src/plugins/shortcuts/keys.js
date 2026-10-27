// Key combo parsing/formatting. Combos are stored as "Alt+Shift+KeyF" (modifiers + KeyboardEvent.code).

export const isMac = () => {
  const nav = globalThis.navigator ?? {};
  return [nav.userAgentData?.platform, nav.platform, nav.userAgent].some((v) => /Mac|iPhone|iPad|iPod/.test(v || ""));
};
export const platformKey = () => (isMac() ? "mac" : "windows");

const MOD_ORDER = ["Meta", "Ctrl", "Alt", "Shift"];

export function comboFromEvent(event) {
  const mods = [];
  if (event.metaKey) mods.push("Meta");
  if (event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  let code = event.code;
  if (!code || /^(Meta|Control|Alt|Shift|OS)(Left|Right)?$/.test(code)) return null;
  // Keypad digits count as digits (06 §2.2).
  if (/^Numpad[0-9]$/.test(code)) code = `Digit${code.slice(6)}`;
  return [...mods, code].join("+");
}

export function normalizeCombo(combo) {
  const parts = String(combo).split("+").filter(Boolean);
  let code = parts.pop();
  // Accept shorthand keys ("W", "7") as well as KeyboardEvent.code values.
  if (/^[a-z]$/i.test(code ?? "")) code = `Key${code.toUpperCase()}`;
  else if (/^[0-9]$/.test(code ?? "")) code = `Digit${code}`;
  const mods = MOD_ORDER.filter((m) => parts.includes(m) || (m === "Ctrl" && parts.includes("Control")));
  return [...mods, code].join("+");
}

const CODE_LABELS = { Slash: "/", Backslash: "\\", Comma: ",", Period: ".", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`", Enter: "Enter", Escape: "Esc", Space: "Space", Tab: "Tab", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backspace: "⌫", Delete: "Del" };

export function codeLabel(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code === "Digit") return "1–9";
  return CODE_LABELS[code] ?? code;
}

export function formatCombo(combo, mac = isMac()) {
  if (!combo) return "";
  const parts = normalizeCombo(combo).split("+");
  const code = parts.pop();
  const macSym = { Meta: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" };
  const winName = { Meta: "Win", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift" };
  if (mac) return parts.map((m) => macSym[m]).join("") + codeLabel(code);
  return [...parts.map((m) => winName[m]), codeLabel(code)].join("+");
}

/** "Alt+Digit" patterns match Alt+Digit1..9 and report the digit. */
export function matchCombo(pattern, combo) {
  if (pattern === combo) return { digit: null };
  if (pattern.endsWith("+Digit") || pattern === "Digit") {
    const m = /^(.*?)(?:\+)?Digit([1-9])$/.exec(combo);
    if (m && (pattern === "Digit" ? m[1] === "" : pattern.slice(0, -"+Digit".length) === m[1])) return { digit: Number(m[2]) };
  }
  return null;
}
