const SESSION_LOAD_RETRY_DELAYS_MS = [1000, 3000, 10_000, 20_000];
const INITIAL_FRAME_RESTORE_TIMEOUT_MS = 45_000;
const INITIAL_FRAME_RESTORE_POLL_MS = 50;

export function createWorkspaceBootstrapRecoveryController({
  appRoot,
  createElement,
  currentFrames,
  frameLoadingInstanceIds,
  isOptionsPage = false,
  reloadPage,
  sessionStore,
  sleep,
  setTimer = globalThis.setTimeout,
  now = Date.now
} = {}) {
  let sessionLoadRetryTimer = null;

  function renderRuntimeBootstrapFailure(error) {
    const detail = String(error?.message || error || "").trim();
    const shell = createElement("div", { class: "runtime-bootstrap-failure-shell" }, createElement("main", {
      class: "runtime-bootstrap-failure",
      role: "alert"
    },
    createElement("h1", {}, "ChatClub 正在重新建立运行时"),
    createElement("p", {}, detail || "当前浏览器恢复了旧的扩展运行时，工作区暂时不会加载。"),
    createElement("button", { type: "button", onclick: reloadPage }, "重新加载 ChatClub")));
    appRoot?.replaceChildren(shell);
    return shell;
  }

  function scheduleWorkspaceSessionLoadRecovery(attempt = 0) {
    if (isOptionsPage || sessionLoadRetryTimer !== null) return;
    const delay = SESSION_LOAD_RETRY_DELAYS_MS[Math.min(attempt, SESSION_LOAD_RETRY_DELAYS_MS.length - 1)];
    sessionLoadRetryTimer = setTimer(async () => {
      sessionLoadRetryTimer = null;
      try {
        await sessionStore.load();
        reloadPage();
      } catch {
        scheduleWorkspaceSessionLoadRecovery(attempt + 1);
      }
    }, delay);
  }

  function initialWorkspaceFrameRestoreState() {
    const loadingIds = new Set(frameLoadingInstanceIds() || []);
    const pendingFrames = currentFrames().filter((iframe) => (
      loadingIds.has(String(iframe?.dataset?.instanceId || ""))
    ));
    return {
      pendingFrames,
      pendingInstanceIds: pendingFrames.map((iframe) => String(iframe.dataset.instanceId || ""))
    };
  }

  async function waitForInitialWorkspaceFrameRestoration(timeoutMs = INITIAL_FRAME_RESTORE_TIMEOUT_MS) {
    const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
    while (true) {
      const current = initialWorkspaceFrameRestoreState();
      if (!current.pendingFrames.length) return { timedOut: false, pendingInstanceIds: [] };
      const remaining = deadline - now();
      if (remaining <= 0) return { timedOut: true, pendingInstanceIds: current.pendingInstanceIds };
      await sleep(Math.min(INITIAL_FRAME_RESTORE_POLL_MS, remaining));
    }
  }

  return Object.freeze({
    renderRuntimeBootstrapFailure,
    scheduleWorkspaceSessionLoadRecovery,
    waitForInitialWorkspaceFrameRestoration
  });
}
