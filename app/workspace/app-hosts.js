export function normalizeAppPickerHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/^www\./, "");
}

export function appPickerHostKeys(app) {
  const keys = new Set();
  for (const host of app?.hosts || []) {
    const normalized = normalizeAppPickerHost(host);
    if (normalized) keys.add(normalized);
  }
  try {
    const normalized = normalizeAppPickerHost(new URL(app?.url).hostname);
    if (normalized) keys.add(normalized);
  } catch {}
  return keys;
}
