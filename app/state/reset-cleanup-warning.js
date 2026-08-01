const CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY = "chatclubConfigResetCleanupWarningV1";

const WARNING_VERSION = 1;
const MAX_WARNING_COUNT = 1000;

function sessionArea(area) {
  return area && typeof area.getItem === "function"
    && typeof area.setItem === "function"
    && typeof area.removeItem === "function"
    ? area
    : null;
}

export function persistConfigResetCleanupWarning(warnings, area = globalThis.sessionStorage) {
  const storage = sessionArea(area);
  const count = Math.min(MAX_WARNING_COUNT, Array.isArray(warnings) ? warnings.length : 0);
  if (!storage || count < 1) return false;
  try {
    storage.setItem(CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY, JSON.stringify({
      version: WARNING_VERSION,
      count
    }));
    return true;
  } catch {
    return false;
  }
}

export function consumeConfigResetCleanupWarning(area = globalThis.sessionStorage) {
  const storage = sessionArea(area);
  if (!storage) return 0;
  let raw = "";
  try {
    raw = String(storage.getItem(CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY) || "");
    storage.removeItem(CONFIG_RESET_CLEANUP_WARNING_SESSION_KEY);
  } catch {
    return 0;
  }
  try {
    const parsed = JSON.parse(raw);
    const count = Number(parsed?.count);
    return Number(parsed?.version) === WARNING_VERSION
      && Number.isSafeInteger(count)
      && count > 0
      && count <= MAX_WARNING_COUNT
      ? count
      : 0;
  } catch {
    return 0;
  }
}
