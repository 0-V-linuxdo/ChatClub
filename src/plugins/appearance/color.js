// Primary color helpers (spec v2 01 §4.2).

export const DEFAULT_PRIMARY = "#1f7a5f";
export const DEFAULT_PRIMARY_DARK = "#40b889";

export function normalizeHexColor(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value ?? "").trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text color on a primary background: whichever of white / deep green contrasts more. */
export function onPrimaryFor(hex) {
  return contrast(hex, "#ffffff") >= contrast(hex, "#082018") ? "#ffffff" : "#082018";
}

export function mix(hexA, hexB, weightA) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ch = (shift) => Math.round(((a >> shift) & 255) * weightA + ((b >> shift) & 255) * (1 - weightA));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
