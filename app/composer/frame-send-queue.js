const QUEUE_CANCELLED_CODE = "FRAME_SEND_QUEUE_CANCELLED";
const QUEUE_PURGED_CODE = "FRAME_SEND_QUEUE_PURGED_UNCERTAIN";

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isPlainObject(value) {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function immutableJobSnapshot(value, seen = new Map()) {
  if (!isObject(value)) return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(immutableJobSnapshot(item, seen));
    return Object.freeze(copy);
  }

  if (value instanceof Date) return Object.freeze(new Date(value.getTime()));
  if (!isPlainObject(value)) return value;

  const copy = Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    copy[key] = immutableJobSnapshot(value[key], seen);
  }
  return Object.freeze(copy);
}

function errorMessage(reason, fallback) {
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  if (reason instanceof Error && reason.message) return reason.message;
  return fallback;
}

function queueCancellationError(reason) {
  if (reason instanceof Error && reason.code === QUEUE_CANCELLED_CODE) return reason;
  const error = new Error(errorMessage(reason, "Frame send queue was cancelled."));
  error.name = "FrameSendQueueCancelledError";
  error.code = QUEUE_CANCELLED_CODE;
  if (reason instanceof Error) error.cause = reason;
  return error;
}

function uncertainQueueError(reason) {
  const error = new Error("Frame send queue stopped after an uncertain delivery failure.");
  error.name = "FrameSendQueueUncertainError";
  error.code = QUEUE_PURGED_CODE;
  error.uncertain = true;
  if (reason instanceof Error) error.cause = reason;
  return error;
}

function abortRejection(signal) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason || queueCancellationError());
      return;
    }
    signal.addEventListener("abort", () => {
      reject(signal.reason || queueCancellationError());
    }, { once: true });
  });
}

function requireFrame(frame) {
  if ((typeof frame !== "object" && typeof frame !== "function") || frame === null) {
    throw new TypeError("Frame send queue requires an iframe identity.");
  }
}

export function createFrameSendQueue({
  execute,
  isUncertainError = () => false,
  onStateChange = null
} = {}) {
  if (typeof execute !== "function") throw new TypeError("Frame send queue requires execute().");
  if (typeof isUncertainError !== "function") {
    throw new TypeError("Frame send queue isUncertainError must be a function.");
  }
  if (onStateChange !== null && typeof onStateChange !== "function") {
    throw new TypeError("Frame send queue onStateChange must be a function.");
  }

  const lanes = new Map();

  function snapshot(frame) {
    if (frame !== undefined) {
      requireFrame(frame);
      const lane = lanes.get(frame);
      const runningCount = lane?.active ? 1 : 0;
      const queuedCount = lane?.entries.length || 0;
      return Object.freeze({
        pendingCount: runningCount + queuedCount,
        queuedCount,
        runningCount,
        laneCount: lane ? 1 : 0
      });
    }

    let queuedCount = 0;
    let runningCount = 0;
    for (const lane of lanes.values()) {
      queuedCount += lane.entries.length;
      if (lane.active) runningCount += 1;
    }
    return Object.freeze({
      pendingCount: runningCount + queuedCount,
      queuedCount,
      runningCount,
      laneCount: lanes.size
    });
  }

  function notifyStateChange() {
    if (!onStateChange) return;
    try {
      onStateChange(snapshot());
    } catch {
      // State observers are informational and must never break queue progress.
    }
  }

  function settleQueuedEntries(entries, error) {
    for (const entry of entries) {
      entry.controller.abort(error);
      entry.reject(error);
    }
  }

  function deliveryIsUncertain(error, frame, job) {
    try {
      return Boolean(isUncertainError(error, { frame, job }));
    } catch {
      return true;
    }
  }

  async function executeEntry(frame, entry) {
    const execution = Promise.resolve().then(() => execute(frame, entry.job, {
      signal: entry.controller.signal
    }));
    return Promise.race([execution, abortRejection(entry.controller.signal)]);
  }

  async function drain(frame, lane) {
    if (lane.draining) return;
    lane.draining = true;

    while (lane.entries.length) {
      const entry = lane.entries.shift();
      lane.active = entry;
      notifyStateChange();
      try {
        entry.resolve(await executeEntry(frame, entry));
      } catch (error) {
        entry.reject(error);
        if (error?.code !== QUEUE_CANCELLED_CODE && deliveryIsUncertain(error, frame, entry.job)) {
          const queued = lane.entries.splice(0);
          settleQueuedEntries(queued, uncertainQueueError(error));
        }
      } finally {
        lane.active = null;
        notifyStateChange();
      }
    }

    lane.draining = false;
    if (lanes.get(frame) === lane && !lane.active && !lane.entries.length) {
      lanes.delete(frame);
      notifyStateChange();
    }
  }

  function enqueue(frame, job) {
    requireFrame(frame);
    const immutableJob = immutableJobSnapshot(job);
    let lane = lanes.get(frame);
    if (!lane) {
      lane = { active: null, draining: false, entries: [] };
      lanes.set(frame, lane);
    }

    const promise = new Promise((resolve, reject) => {
      lane.entries.push({
        controller: new AbortController(),
        job: immutableJob,
        reject,
        resolve
      });
    });
    notifyStateChange();
    void drain(frame, lane);
    return promise;
  }

  function cancelFrame(frame, reason) {
    requireFrame(frame);
    const lane = lanes.get(frame);
    if (!lane) return 0;

    const error = queueCancellationError(reason);
    const queued = lane.entries.splice(0);
    settleQueuedEntries(queued, error);
    const activeCount = lane.active ? 1 : 0;
    lane.active?.controller.abort(error);
    if (!lane.active && lanes.get(frame) === lane) lanes.delete(frame);
    notifyStateChange();
    return queued.length + activeCount;
  }

  return Object.freeze({ cancelFrame, enqueue, snapshot });
}
