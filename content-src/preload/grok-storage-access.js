export function installGrokStorageAccessBridge(runtimes) {
  const runtimeName = "grok-storage-access-bridge";
  const version = "2026.07.15.2";
  const existing = runtimes.registration(runtimeName);
  if (existing?.version === version) {
    window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__ = existing.api;
    return;
  }
  runtimes.invalidate(runtimeName, `replaced by ${version}`);

  const RELOAD_KEY = "__chatclub_grok_storage_access_reloaded__";
  let disposed = false;
  let reloadTimer = 0;
  let permissionRecord = null;
  let cleanupUserGesture = () => {};
  const diag = {
    version,
    href: String(location.href || ""),
    host: String(location.hostname || ""),
    framed: true,
    referrer: "",
    ancestorOrigins: [],
    supported: {
      hasStorageAccess: typeof document.hasStorageAccess === "function",
      requestStorageAccess: typeof document.requestStorageAccess === "function",
      permissionsQuery: !!navigator.permissions?.query
    },
    permissionState: "",
    hasStorageAccess: null,
    status: "starting",
    requested: false,
    requestResult: "",
    requestError: "",
    userGestureArmed: false,
    reloadScheduled: false,
    reloadReason: "",
    updatedAt: new Date().toISOString()
  };
  window.__CHATCLUB_GROK_EMBED_DIAG__ = diag;

  const update = (patch = {}) => {
    if (disposed) return diag;
    Object.assign(diag, patch, {
      href: String(location.href || ""),
      updatedAt: new Date().toISOString()
    });
    try {
      diag.referrer = String(document.referrer || "");
    } catch {}
    try {
      diag.ancestorOrigins = Array.from(location.ancestorOrigins || []);
    } catch {}
    return diag;
  };

  const storageMarker = () => `${location.origin || "grok"}|${location.pathname || "/"}`;

  const readHasStorageAccess = async () => {
    if (disposed) return null;
    if (typeof document.hasStorageAccess !== "function") {
      update({ hasStorageAccess: null });
      return null;
    }
    try {
      const hasAccess = await document.hasStorageAccess();
      if (disposed) return null;
      update({ hasStorageAccess: Boolean(hasAccess) });
      return Boolean(hasAccess);
    } catch (error) {
      if (disposed) return null;
      update({ hasStorageAccess: null, hasStorageAccessError: error?.message || String(error || "hasStorageAccess failed") });
      return null;
    }
  };

  const readPermissionState = async () => {
    if (disposed) return "";
    if (!navigator.permissions?.query) return "";
    try {
      const permission = await navigator.permissions.query({ name: "storage-access" });
      if (disposed) return "";
      permissionRecord = permission;
      update({ permissionState: String(permission.state || "") });
      permission.onchange = () => {
        if (!disposed) update({ permissionState: String(permission.state || "") });
      };
      return String(permission.state || "");
    } catch (error) {
      if (disposed) return "";
      update({ permissionState: "", permissionError: error?.message || String(error || "permission query failed") });
      return "";
    }
  };

  const reloadOnce = (reason) => {
    if (disposed) return;
    const marker = storageMarker();
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === marker) {
        update({ status: "reload-skipped", reloadReason: reason || "", reloadSkipped: "already reloaded for this page" });
        return;
      }
      sessionStorage.setItem(RELOAD_KEY, marker);
    } catch {}
    update({ status: "reload-scheduled", reloadScheduled: true, reloadReason: reason || "" });
    reloadTimer = setTimeout(() => {
      reloadTimer = 0;
      if (disposed) return;
      try { location.reload(); } catch {}
    }, 80);
  };

  const requestAccess = async (reason) => {
    if (disposed) return false;
    if (typeof document.requestStorageAccess !== "function") {
      update({ status: "unsupported", requestError: "document.requestStorageAccess is unavailable" });
      return false;
    }
    update({ status: "requesting", requested: true, requestReason: reason || "" });
    try {
      await document.requestStorageAccess();
      if (disposed) return false;
      const hasAccess = await readHasStorageAccess();
      if (disposed) return false;
      update({ status: "granted", requestResult: "granted", requestError: "", hasStorageAccess: hasAccess });
      reloadOnce(reason || "requestStorageAccess");
      return true;
    } catch (error) {
      if (disposed) return false;
      update({ status: "request-failed", requestResult: "failed", requestError: error?.message || String(error || "requestStorageAccess failed") });
      return false;
    }
  };

  const armUserGesture = (reason) => {
    if (disposed || diag.userGestureArmed || typeof document.requestStorageAccess !== "function") return;
    update({ status: "waiting-for-user-gesture", userGestureArmed: true, userGestureReason: reason || "" });
    const cleanup = () => {
      for (const type of ["click", "pointerup", "touchend", "keydown"]) {
        window.removeEventListener(type, handler, true);
      }
    };
    cleanupUserGesture();
    cleanupUserGesture = cleanup;
    const handler = (event) => {
      if (disposed) return;
      if (!event?.isTrusted) return;
      if (event.type === "keydown" && !["Enter", " ", "Spacebar"].includes(event.key)) return;
      cleanup();
      update({ userGestureArmed: false, status: "user-gesture-received", userGestureType: event.type });
      requestAccess("trusted-user-gesture");
    };
    for (const type of ["click", "pointerup", "touchend", "keydown"]) {
      window.addEventListener(type, handler, true);
    }
  };

  const run = async () => {
    if (disposed) return;
    update({ status: "checking" });
    const hasAccess = await readHasStorageAccess();
    if (disposed) return;
    const permissionState = await readPermissionState();
    if (disposed) return;
    if (hasAccess === true) {
      update({ status: "already-granted", requestResult: "not-needed", requestError: "" });
      return;
    }
    if (permissionState === "granted") {
      await requestAccess("permission-granted");
      return;
    }
    armUserGesture(permissionState || "permission-unknown");
  };

  const api = Object.freeze({ version, diag, requestAccess });
  window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__ = api;
  runtimes.register(runtimeName, {
    version,
    api,
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanupUserGesture();
      cleanupUserGesture = () => {};
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = 0;
      try { if (permissionRecord) permissionRecord.onchange = null; } catch {}
      permissionRecord = null;
      if (window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__ === api) {
        delete window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__;
      }
      if (window.__CHATCLUB_GROK_EMBED_DIAG__ === diag) delete window.__CHATCLUB_GROK_EMBED_DIAG__;
    }
  });
  run().catch((error) => {
    if (!disposed) update({ status: "failed", requestError: error?.message || String(error || "storage access bridge failed") });
  });
}
