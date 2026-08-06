const RUNTIME_NAME = "grok-initial-layout-guard";
const RUNTIME_VERSION = "2026.08.07.4";
const INITIAL_LAYOUT_WINDOW_MS = 20_000;
const MAX_INITIAL_SCROLL_OFFSET = 96;
const MAINVIEW_CLASS_TOKEN = "@container/mainview";

export function installGrokInitialLayoutGuard(runtimes) {
  const existing = runtimes.registration(RUNTIME_NAME);
  if (existing?.version === RUNTIME_VERSION) return;
  runtimes.invalidate(RUNTIME_NAME, `replaced by ${RUNTIME_VERSION}`);

  let stopped = false;
  let userInteracted = false;
  let mainview = null;
  let mutationObserver = null;
  let scheduled = false;
  let frameId = 0;
  let retryTimer = 0;
  let deadlineTimer = 0;
  const deadlineAt = Date.now() + INITIAL_LAYOUT_WINDOW_MS;

  const atGrokHome = () => {
    try {
      return new URL(String(location.href || "")).pathname === "/";
    } catch {
      return false;
    }
  };

  const findMainview = () => {
    if (mainview?.isConnected) return mainview;
    mainview = null;
    try {
      for (const element of document.querySelectorAll("div[class]")) {
        if (!String(element.className || "").includes(MAINVIEW_CLASS_TOKEN)) continue;
        if (element.clientHeight <= 0 || element.scrollHeight <= 0) continue;
        mainview = element;
        break;
      }
    } catch {}
    return mainview;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frameId) cancelAnimationFrame(frameId);
    if (retryTimer) clearTimeout(retryTimer);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    frameId = 0;
    retryTimer = 0;
    deadlineTimer = 0;
    try { mutationObserver?.disconnect?.(); } catch {}
    mutationObserver = null;
    for (const type of ["pointerdown", "wheel", "touchstart", "keydown"]) {
      try { window.removeEventListener(type, onTrustedInteraction, true); } catch {}
    }
  };

  const onTrustedInteraction = (event) => {
    if (event?.isTrusted !== true) return;
    userInteracted = true;
    stop();
  };

  function schedule() {
    if (stopped || scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === "function") {
      frameId = requestAnimationFrame(() => {
        scheduled = false;
        frameId = 0;
        run();
      });
      return;
    }
    retryTimer = setTimeout(() => {
      scheduled = false;
      retryTimer = 0;
      run();
    }, 32);
  }

  function run() {
    if (stopped || userInteracted || !atGrokHome() || Date.now() >= deadlineAt) {
      stop();
      return;
    }
    const view = findMainview();
    if (view) {
      const offset = Number(view.scrollTop) || 0;
      if (offset > 0 && offset <= MAX_INITIAL_SCROLL_OFFSET) {
        try { view.scrollTop = 0; } catch {}
      }
    }
    schedule();
  }

  for (const type of ["pointerdown", "wheel", "touchstart", "keydown"]) {
    try { window.addEventListener(type, onTrustedInteraction, true); } catch {}
  }
  try {
    if (typeof MutationObserver === "function") {
      mutationObserver = new MutationObserver(schedule);
      mutationObserver.observe(document, { childList: true, subtree: true });
    }
  } catch {}
  deadlineTimer = setTimeout(stop, INITIAL_LAYOUT_WINDOW_MS + 100);
  runtimes.register(RUNTIME_NAME, {
    version: RUNTIME_VERSION,
    api: Object.freeze({ version: RUNTIME_VERSION }),
    dispose: stop
  });
  schedule();
}
