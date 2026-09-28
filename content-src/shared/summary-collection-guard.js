// Collection runs, user-input tracking, and runner-opened menus for the
// Copy-based Summary collectors. Everything here is document-local: the
// extension page only learns about it through the collectSummary result or
// the cancelSummaryCollection command, never through a new event channel.

export const SUMMARY_COLLECTION_ABORTED = "SUMMARY_COLLECTION_ABORTED";

const USER_INPUT_EVENTS = Object.freeze(["pointerdown", "wheel", "keydown", "touchstart"]);
const USER_ACTIVITY_EVENTS = Object.freeze([...USER_INPUT_EVENTS, "pointermove"]);

const runs = new Map();
let activeRun = null;
let lastTrustedInputAt = 0;
let activityTrackingInstalled = false;
let runnerOpenedMenus = 0;

export class SummaryCollectionAbortedError extends Error {
  constructor(reason = "cancelled") {
    super(`Summary collection aborted: ${reason}`);
    this.name = "SummaryCollectionAbortedError";
    this.code = SUMMARY_COLLECTION_ABORTED;
    this.reason = String(reason || "cancelled");
  }
}

export function isSummaryCollectionAborted(error) {
  return Boolean(error) && (error.code === SUMMARY_COLLECTION_ABORTED || error.name === "SummaryCollectionAbortedError");
}

function trackTrustedActivity(event) {
  if (event?.isTrusted) lastTrustedInputAt = Date.now();
}

// Passive capture listeners that only stamp a timestamp. Installed lazily so
// the MAIN-world bundle, which shares this module, never binds them at load.
export function installUserActivityTracking() {
  if (activityTrackingInstalled || typeof window === "undefined") return;
  activityTrackingInstalled = true;
  for (const type of USER_ACTIVITY_EVENTS) {
    try {
      window.addEventListener(type, trackTrustedActivity, { capture: true, passive: true });
    } catch {}
  }
}

// null until the first trusted event so a fresh document does not look busy.
export function userInputIdleMs(now = Date.now()) {
  return lastTrustedInputAt ? Math.max(0, now - lastTrustedInputAt) : null;
}

export function beginSummaryCollectionRun(options = {}) {
  const runId = String(options.runId || "").trim() || `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    runId,
    idle: options.idle === true,
    aborted: false,
    reason: "",
    listeners: [],
    waiters: []
  };
  run.abort = (reason = "cancelled") => {
    if (run.aborted) return;
    run.aborted = true;
    run.reason = String(reason || "cancelled");
    const waiters = run.waiters.splice(0);
    detach(run);
    for (const waiter of waiters) {
      try { waiter(); } catch {}
    }
  };
  if (options.abortOnUserInput === true && typeof window !== "undefined") {
    const onInput = (event) => {
      if (!event?.isTrusted) return;
      trackTrustedActivity(event);
      run.abort("user-input");
    };
    for (const type of USER_INPUT_EVENTS) {
      try {
        window.addEventListener(type, onInput, { capture: true, passive: true });
        run.listeners.push([type, onInput]);
      } catch {}
    }
  }
  runs.set(runId, run);
  activeRun = run;
  return run;
}

function detach(run) {
  for (const [type, handler] of run.listeners.splice(0)) {
    try { window.removeEventListener(type, handler, { capture: true }); } catch {}
  }
}

export function endSummaryCollectionRun(run) {
  if (!run) return;
  detach(run);
  runs.delete(run.runId);
  if (activeRun === run) {
    activeRun = null;
    for (const other of runs.values()) activeRun = other;
  }
}

// A cancel names the runId it saw; an empty runId cancels every idle run so a
// parent that lost the id can still stop a background scan.
export function cancelSummaryCollectionRuns(runId = "", reason = "cancelled") {
  const id = String(runId || "").trim();
  let cancelled = 0;
  for (const run of runs.values()) {
    if (id ? run.runId !== id : !run.idle) continue;
    if (!run.aborted) cancelled += 1;
    run.abort(reason);
  }
  return cancelled;
}

export function summaryCollectionAborted() {
  return Boolean(activeRun?.aborted);
}

export function throwIfSummaryCollectionAborted() {
  if (activeRun?.aborted) throw new SummaryCollectionAbortedError(activeRun.reason);
}

export function abortableSleep(ms, sleep) {
  throwIfSummaryCollectionAborted();
  const run = activeRun;
  const wait = typeof sleep === "function"
    ? sleep(ms)
    : new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
  if (!run) {
    return Promise.resolve(wait).then(() => {
      throwIfSummaryCollectionAborted();
    });
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (next) => {
      if (settled) return;
      settled = true;
      const index = run.waiters.indexOf(onAbort);
      if (index >= 0) run.waiters.splice(index, 1);
      next();
    };
    const onAbort = () => finish(() => reject(new SummaryCollectionAbortedError(run.reason)));
    run.waiters.push(onAbort);
    Promise.resolve(wait).then(
      () => finish(() => {
        if (run.aborted) reject(new SummaryCollectionAbortedError(run.reason));
        else resolve();
      }),
      (error) => finish(() => reject(error))
    );
  });
}

export function noteRunnerOpenedMenu() {
  runnerOpenedMenus += 1;
}

// Escape closes whatever menu is open, including one the user opened in the
// chat; only dispatch it after this runner opened one itself.
export function closeRunnerOpenedMenus(dispatchEscape) {
  if (runnerOpenedMenus <= 0) return false;
  runnerOpenedMenus = 0;
  try { dispatchEscape(); } catch {}
  return true;
}
