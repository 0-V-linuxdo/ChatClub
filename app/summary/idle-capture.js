export const IDLE_FULLTEXT_CAPTURE_DEFAULTS = Object.freeze({
  idleMs: 30_000,
  pollMs: 2_500,
  maxAttempts: 3,
  wallMs: 9 * 60 * 1000
});

export function conversationFingerprintSignature(fingerprint) {
  if (!fingerprint || typeof fingerprint !== "object") return "";
  return [
    String(fingerprint.documentId || ""),
    String(fingerprint.href || ""),
    String(fingerprint.childCount ?? ""),
    String(fingerprint.textLength ?? ""),
    String(fingerprint.tailHash || "")
  ].join("\n");
}

function positiveInteger(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

export function createIdleFullTextCaptureScheduler(options = {}) {
  const idleMs = positiveInteger(options.idleMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.idleMs);
  const pollMs = positiveInteger(options.pollMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.pollMs);
  const maxAttempts = Math.max(1, Math.min(10, Math.floor(positiveInteger(options.maxAttempts, IDLE_FULLTEXT_CAPTURE_DEFAULTS.maxAttempts))));
  const wallMs = positiveInteger(options.wallMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.wallMs);
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const sleep = typeof options.sleep === "function"
    ? options.sleep
    : (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
  const listFrames = typeof options.listFrames === "function" ? options.listFrames : () => [];
  const getFingerprint = typeof options.getFingerprint === "function" ? options.getFingerprint : async () => null;
  const collectFrame = typeof options.collectFrame === "function" ? options.collectFrame : async () => null;
  const persistItem = typeof options.persistItem === "function" ? options.persistItem : async () => {};
  const itemMatchesPrompt = typeof options.itemMatchesPrompt === "function"
    ? options.itemMatchesPrompt
    : () => false;
  const isEnabled = typeof options.isEnabled === "function" ? options.isEnabled : () => true;
  const frameExists = typeof options.frameExists === "function" ? options.frameExists : () => true;

  let generation = 0;
  let activeKind = "";

  function cancel() {
    generation += 1;
    activeKind = "";
  }

  function isRunning() {
    return activeKind === "send" || activeKind === "existing";
  }

  async function listCaptureFrames() {
    const listed = listFrames();
    const frames = listed && typeof listed.then === "function" ? await listed : listed;
    return Array.isArray(frames) ? frames : [];
  }

  async function schedule(prompt = "", options = {}) {
    const existing = options.existing === true;
    const text = String(prompt || "").trim();
    if (!existing && !text) return { scheduled: false, runId: generation };
    if (!isEnabled()) return { scheduled: false, runId: generation };
    if (existing && isRunning()) return { scheduled: false, runId: generation };
    generation += 1;
    const runId = generation;
    const kind = existing ? "existing" : "send";
    activeKind = kind;
    try {
      const list = await listCaptureFrames();
      await Promise.all(list.map((frame) => captureFrame({
        frame,
        prompt: text,
        existing,
        runId,
        startedAt: now()
      })));
      return { scheduled: true, runId };
    } finally {
      if (generation === runId) activeKind = "";
    }
  }

  async function collectOnce({ frame, prompt, runId, attempts }) {
    if (runId !== generation) return { status: "cancelled", attempts };
    let item = null;
    try {
      item = await collectFrame(frame, prompt);
    } catch {
      return { status: "collect-error", attempts };
    }
    if (runId !== generation) return { status: "cancelled", attempts };
    if (!itemMatchesPrompt(item, prompt)) return { status: "unmatched", attempts };
    try {
      const persisted = await persistItem(item, prompt);
      if (persisted === false || persisted?.saved === false) return { status: "persist-error", attempts };
    } catch {
      return { status: "persist-error", attempts };
    }
    if (runId !== generation) return { status: "cancelled", attempts };
    return { status: "saved", attempts };
  }

  async function captureFrame({ frame, prompt, runId, startedAt, existing = false }) {
    let lastSignature = "";
    let idleSince = startedAt;
    let attempts = 0;
    let sawFingerprint = false;
    let sawChange = false;
    let sawPrompt = false;

    while (runId === generation) {
      if (!isEnabled()) return { status: "disabled", attempts };
      if (frameExists(frame) !== true) return { status: "gone", attempts };

      const elapsed = now() - startedAt;
      const wallHit = elapsed >= wallMs;
      let fingerprint = null;
      let signature = "";
      try {
        fingerprint = await getFingerprint(frame, prompt);
        signature = conversationFingerprintSignature(fingerprint);
      } catch {
        signature = "";
      }
      if (runId !== generation) return { status: "cancelled", attempts };

      if (signature) {
        if (sawFingerprint && signature !== lastSignature) sawChange = true;
        if (!sawFingerprint || signature !== lastSignature) idleSince = now();
        lastSignature = signature;
        sawFingerprint = true;
      }
      if (fingerprint?.containsPrompt === true) sawPrompt = true;

      const canCollect = existing ? sawFingerprint : (sawPrompt || sawChange);
      const idle = canCollect && sawFingerprint && (now() - idleSince >= idleMs);
      if ((idle || wallHit) && attempts < maxAttempts) {
        attempts += 1;
        const result = await collectOnce({ frame, prompt, runId, attempts });
        if (result.status === "saved" || result.status === "cancelled") return result;
        idleSince = now();
        if (wallHit || attempts >= maxAttempts) {
          return wallHit ? { status: result.status === "unmatched" ? "expired" : result.status, attempts } : { status: "exhausted", attempts };
        }
      } else if (wallHit) {
        return { status: "expired", attempts };
      }

      const remaining = wallMs - (now() - startedAt);
      if (remaining <= 0) {
        if (attempts < maxAttempts) {
          attempts += 1;
          const result = await collectOnce({ frame, prompt, runId, attempts });
          if (result.status === "saved" || result.status === "cancelled") return result;
          return { status: "expired", attempts };
        }
        return { status: "expired", attempts };
      }
      await sleep(Math.min(pollMs, remaining));
    }
    return { status: "cancelled", attempts };
  }

  return Object.freeze({ schedule, cancel, isRunning });
}
