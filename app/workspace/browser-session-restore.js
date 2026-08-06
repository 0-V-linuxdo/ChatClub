const BROWSER_SESSION_RESTORE_RELOAD_KEY = "chatclub.browserSessionRestoreReloadV1";
const BROWSER_SESSION_RESTORE_RELOAD_TTL_MS = 60_000;

function navigationType(performanceObject = globalThis.performance) {
  try {
    const entries = performanceObject?.getEntriesByType?.("navigation") || [];
    return String(entries[0]?.type || "");
  } catch {
    return "";
  }
}

function sessionStorageFor(storageObject = globalThis.sessionStorage) {
  try {
    const storage = storageObject;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") return null;
    return storage;
  } catch {
    return null;
  }
}

function restoredChatClubDom(documentObject = globalThis.document) {
  try {
    return Boolean(documentObject?.querySelector?.("#app > .app-shell, #app .chat-frame"));
  } catch {
    return false;
  }
}

function restoreReloadMarker(storage, href) {
  if (!storage) return null;
  try {
    const raw = JSON.parse(String(storage.getItem(BROWSER_SESSION_RESTORE_RELOAD_KEY) || "null"));
    if (!raw || typeof raw !== "object") return null;
    const markedHref = String(raw.href || "");
    const markedAt = Number(raw.at);
    if (
      markedHref !== href
      || !Number.isFinite(markedAt)
      || Date.now() - markedAt > BROWSER_SESSION_RESTORE_RELOAD_TTL_MS
    ) {
      storage.removeItem(BROWSER_SESSION_RESTORE_RELOAD_KEY);
      return null;
    }
    return { href: markedHref, at: markedAt };
  } catch {
    try { storage.removeItem(BROWSER_SESSION_RESTORE_RELOAD_KEY); } catch {}
    return null;
  }
}

function markRestoreReload(storage, href) {
  if (!storage) return false;
  try {
    storage.setItem(BROWSER_SESSION_RESTORE_RELOAD_KEY, JSON.stringify({ href, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearBrowserSessionRestoreReload(storageObject = globalThis.sessionStorage) {
  const storage = sessionStorageFor(storageObject);
  try { storage?.removeItem(BROWSER_SESSION_RESTORE_RELOAD_KEY); } catch {}
}

/**
 * Tabbit restores the extension page as a back/forward navigation. Its old
 * app DOM can be visible before the new extension document has rebuilt the
 * content-script registrations and iframe bindings. Reload that restored
 * page once, before bootstrap can reuse any of those stale nodes.
 */
export function prepareBrowserSessionRestore(windowObject, documentObject = globalThis.document) {
  const type = navigationType(windowObject?.performance);
  const restored = type === "back_forward";
  const storage = sessionStorageFor(windowObject?.sessionStorage);
  const href = String(windowObject.location?.href || "");
  if (!restored) {
    try { storage?.removeItem(BROWSER_SESSION_RESTORE_RELOAD_KEY); } catch {}
    return Object.freeze({ navigationType: type, restored: false, reloadRequested: false, guarded: false });
  }

  if (!restoredChatClubDom(documentObject)) {
    return Object.freeze({ navigationType: type, restored: true, reloadRequested: false, guarded: false });
  }

  const marker = restoreReloadMarker(storage, href);
  if (marker) {
    try {
      documentObject?.documentElement?.style?.removeProperty("visibility");
      documentObject?.documentElement?.removeAttribute("data-chatclub-browser-restore");
    } catch {}
    return Object.freeze({ navigationType: type, restored: true, reloadRequested: false, guarded: true });
  }

  const marked = markRestoreReload(storage, href);
  try {
    documentObject?.documentElement?.style?.setProperty("visibility", "hidden");
    documentObject?.documentElement?.setAttribute("data-chatclub-browser-restore", "reloading");
  } catch {}
  let reloadTriggered = false;
  try {
    if (typeof windowObject.location?.reload === "function") {
      windowObject.location.reload();
      reloadTriggered = true;
    }
  } catch {}
  if (!reloadTriggered) {
    try {
      documentObject?.documentElement?.style?.removeProperty("visibility");
      documentObject?.documentElement?.removeAttribute("data-chatclub-browser-restore");
    } catch {}
  }
  return Object.freeze({
    navigationType: type,
    restored: true,
    reloadRequested: reloadTriggered && (marked || !storage),
    guarded: false
  });
}
