// Grok compatibility preload (MAIN world, document_start; v2 05 §6.2): the initial layout guard on `/`
// and the storage-access request for the partitioned iframe. Inert outside ChatClub iframes.
(() => {
  if (window === window.top || window.__chatclubGrokCompat) return;
  let params;
  try {
    params = new URLSearchParams(window.name || "");
  } catch {
    return;
  }
  if (!params.has("chatclub_webview") || !/^[0-9a-f]{64}$/.test(params.get("chatclub_frame_binding") || "")) return;
  Object.defineProperty(window, "__chatclubGrokCompat", { value: true });

  // --- initial layout guard: on `/` during the first 20 s, undo small site auto-scrolls of the main view
  if (location.pathname === "/") {
    const started = Date.now();
    let active = true;
    const stop = () => {
      active = false;
      for (const type of ["wheel", "keydown", "pointerdown", "touchstart"]) window.removeEventListener(type, onUser, true);
    };
    const onUser = (event) => {
      if (event.isTrusted) stop();
    };
    for (const type of ["wheel", "keydown", "pointerdown", "touchstart"]) window.addEventListener(type, onUser, true);
    const mainView = () => [...document.querySelectorAll("[class*='@container/mainview']")].find((el) => el.scrollHeight > el.clientHeight) ?? null;
    const onScroll = (event) => {
      if (!active) return;
      if (Date.now() - started > 20000) return stop();
      const view = mainView();
      if (!view || event.target !== view) return;
      if (view.scrollTop > 0 && view.scrollTop <= 96) view.scrollTop = 0;
    };
    document.addEventListener("scroll", onScroll, true);
    setTimeout(() => {
      stop();
      document.removeEventListener("scroll", onScroll, true);
    }, 20000);
  }

  // --- storage access: ask on the first user gesture, reload once after it is granted
  const RELOADED = "chatclub.grokStorageAccessReloaded";
  const request = async () => {
    if (!document.hasStorageAccess || !document.requestStorageAccess) return;
    try {
      if (await document.hasStorageAccess()) return;
    } catch {
      return;
    }
    const onGesture = async (event) => {
      if (!event.isTrusted) return;
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      try {
        await document.requestStorageAccess();
      } catch {
        return; // refused: keep working without it
      }
      let already = false;
      try {
        already = sessionStorage.getItem(RELOADED) === "1";
        sessionStorage.setItem(RELOADED, "1");
      } catch {
        already = true; // no way to remember the reload, so don't risk a loop
      }
      if (!already) location.reload();
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
  };
  request();
})();
