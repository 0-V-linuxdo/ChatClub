import {
  fullTextContentMetricsFromFingerprint,
  fullTextContentMetricsFromMessages,
  fullTextContentSignature,
  fullTextContentSignatureFromFingerprint,
  fullTextConversationHrefIsStable,
  fullTextExistingIsCovered,
  fullTextExistingNeedsCollect,
  workspaceTabFullTextFrameIdentityKey
} from "../../shared/workspace-tab-fulltext.js";

export const IDLE_FULLTEXT_CAPTURE_DEFAULTS = Object.freeze({
  idleMs: 30_000,
  pollMs: 2_500,
  maxAttempts: 3,
  wallMs: 9 * 60 * 1000,
  generatingWallMs: 45 * 60 * 1000,
  // Frame RPC clamps command timeouts at 60s. Last-N copy collection must finish
  // inside this window so idle persist is not killed mid-Copy.
  collectTimeoutMs: 60_000
});

export function conversationFingerprintSignature(fingerprint) {
  return fullTextContentSignatureFromFingerprint(fingerprint);
}

function fingerprintIsGenerating(fingerprint) {
  return fingerprint?.generating === true;
}

function positiveInteger(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function frameCaptureKey(frame) {
  return String(frame?.key || frame?.instanceId || "").trim();
}

function captureKeys(frame, fingerprint) {
  const keys = [];
  const instanceId = frameCaptureKey(frame);
  if (instanceId) {
    keys.push(instanceId);
    if (!instanceId.startsWith("id:") && !instanceId.startsWith("href:")) keys.push(`id:${instanceId}`);
  }
  for (const href of [fingerprint?.href, frame?.href]) {
    const text = String(href || "").trim();
    if (!fullTextConversationHrefIsStable(text)) continue;
    const identity = workspaceTabFullTextFrameIdentityKey({ href: text, instanceId: "" });
    if (identity.startsWith("href:")) keys.push(identity);
  }
  return [...new Set(keys.filter(Boolean))];
}

function snapshotFromMetrics(metrics, prompt = "", hasPair = false) {
  const next = {
    turnCount: Number(metrics?.turnCount) || 0,
    userChars: Number(metrics?.userChars) || 0,
    assistantChars: Number(metrics?.assistantChars) || 0,
    tailHash: String(metrics?.tailHash || ""),
    hasPair: hasPair === true,
    prompt: String(prompt || ""),
    representation: metrics?.representation === "live" ? "live" : "store",
    lastUserMessage: String(metrics?.lastUserMessage || ""),
    lastAssistantMessage: String(metrics?.lastAssistantMessage || ""),
    href: String(metrics?.href || "")
  };
  next.signature = fullTextContentSignature(next);
  return next.signature ? next : null;
}

export function createIdleFullTextCaptureScheduler(options = {}) {
  const idleMs = positiveInteger(options.idleMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.idleMs);
  const pollMs = positiveInteger(options.pollMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.pollMs);
  const maxAttempts = Math.max(1, Math.min(10, Math.floor(positiveInteger(options.maxAttempts, IDLE_FULLTEXT_CAPTURE_DEFAULTS.maxAttempts))));
  const wallMs = positiveInteger(options.wallMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.wallMs);
  const generatingWallMs = Math.max(
    wallMs,
    positiveInteger(options.generatingWallMs, IDLE_FULLTEXT_CAPTURE_DEFAULTS.generatingWallMs)
  );
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
  const loadStoredSnapshots = typeof options.loadStoredSnapshots === "function"
    ? options.loadStoredSnapshots
    : async () => [];
  const savedSignatures = new Map();
  let workspaceHasStoredPair = false;

  let generation = 0;
  let activeKind = "";

  function cancel() {
    generation += 1;
    activeKind = "";
  }

  function isRunning() {
    return activeKind === "send" || activeKind === "existing";
  }

  function savedRecordFor(frame, fingerprint) {
    for (const key of captureKeys(frame, fingerprint)) {
      const record = savedSignatures.get(key);
      if (!record) continue;
      if (typeof record === "string") {
        return { signature: record, prompt: "", hasPair: true };
      }
      return {
        signature: String(record.signature || ""),
        prompt: String(record.prompt || ""),
        hasPair: record.hasPair === true,
        turnCount: Number(record.turnCount) || 0,
        userChars: Number(record.userChars) || 0,
        assistantChars: Number(record.assistantChars) || 0,
        tailHash: String(record.tailHash || ""),
        representation: record.representation === "live" ? "live" : "store",
        lastUserMessage: String(record.lastUserMessage || ""),
        lastAssistantMessage: String(record.lastAssistantMessage || ""),
        href: String(record.href || "")
      };
    }
    return null;
  }

  function savedSignatureFor(frame, fingerprint) {
    return String(savedRecordFor(frame, fingerprint)?.signature || "");
  }

  function savedPromptFor(frame, fingerprint) {
    return String(savedRecordFor(frame, fingerprint)?.prompt || "");
  }

  function alreadySavedIdleSnapshot(frame, prompt, signature, fingerprint) {
    if (!signature || signature !== savedSignatureFor(frame, fingerprint)) return false;
    const text = String(prompt || "");
    return !text || savedPromptFor(frame, fingerprint) === text;
  }

  function rememberSnapshot(frame, snapshot, fingerprint) {
    if (!snapshot?.signature) return;
    for (const key of captureKeys(frame, fingerprint)) {
      savedSignatures.set(key, snapshot);
    }
  }

  function rememberFromFingerprint(frame, prompt, fingerprint, hasPair = false) {
    const snapshot = snapshotFromMetrics(
      {
        ...fullTextContentMetricsFromFingerprint(fingerprint),
        representation: "live"
      },
      prompt,
      hasPair
    );
    if (snapshot) rememberSnapshot(frame, snapshot, fingerprint);
    return snapshot;
  }

  async function rememberSavedSignature(frame, prompt, fallback = "", extra = {}) {
    const fingerprint = extra.fingerprint && typeof extra.fingerprint === "object" ? extra.fingerprint : null;
    let snapshot = fingerprint
      ? snapshotFromMetrics({
        ...fullTextContentMetricsFromFingerprint(fingerprint),
        representation: "live"
      }, prompt, extra.hasPair === true)
      : null;
    if (!snapshot?.signature && Array.isArray(extra.messages)) {
      snapshot = snapshotFromMetrics(
        {
          ...fullTextContentMetricsFromMessages(extra.messages),
          representation: "store"
        },
        prompt,
        extra.hasPair === true
      );
    }
    if (!snapshot?.signature) {
      try {
        const probed = await getFingerprint(frame, prompt);
        snapshot = snapshotFromMetrics(
          {
            ...fullTextContentMetricsFromFingerprint(probed),
            representation: "live"
          },
          prompt,
          extra.hasPair === true
        );
        if (snapshot) rememberSnapshot(frame, snapshot, probed);
        return;
      } catch {
        if (fallback) {
          rememberSnapshot(frame, {
            signature: String(fallback),
            prompt: String(prompt || ""),
            hasPair: extra.hasPair === true
          }, fingerprint);
        }
        return;
      }
    }
    if (snapshot?.signature) rememberSnapshot(frame, snapshot, fingerprint);
  }

  async function hydrateFromStore() {
    workspaceHasStoredPair = false;
    let snapshots = [];
    try {
      snapshots = await loadStoredSnapshots();
    } catch {
      return;
    }
    for (const snap of Array.isArray(snapshots) ? snapshots : []) {
      const keys = Array.isArray(snap?.keys) ? snap.keys : [];
      const snapshot = snapshotFromMetrics(snap, "", snap?.hasPair !== false);
      if (!snapshot) continue;
      if (snap?.signature) snapshot.signature = String(snap.signature);
      snapshot.hasPair = snap?.hasPair !== false;
      snapshot.representation = snap?.representation === "live" ? "live" : "store";
      snapshot.lastUserMessage = String(snap?.lastUserMessage || snapshot.lastUserMessage || "");
      snapshot.lastAssistantMessage = String(snap?.lastAssistantMessage || snapshot.lastAssistantMessage || "");
      if (snapshot.hasPair) workspaceHasStoredPair = true;
      for (const key of keys) {
        const nextKey = String(key || "").trim();
        if (!nextKey || savedSignatures.has(nextKey)) continue;
        savedSignatures.set(nextKey, snapshot);
      }
    }
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
      if (existing) await hydrateFromStore();
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
    return { status: "saved", attempts, item };
  }

  async function captureFrame({ frame, prompt, runId, startedAt, existing = false }) {
    let lastSignature = "";
    let lastFingerprint = null;
    let idleSince = startedAt;
    let attempts = 0;
    let sawFingerprint = false;
    let sawChange = false;
    let sawPrompt = false;
    let lastKnownGenerating;

    while (runId === generation) {
      if (!isEnabled()) return { status: "disabled", attempts };
      if (frameExists(frame) !== true) return { status: "gone", attempts };

      const elapsed = now() - startedAt;
      const generatingCapHit = elapsed >= generatingWallMs;
      let fingerprint = null;
      let signature = "";
      let probeFailed = false;
      try {
        fingerprint = await getFingerprint(frame, prompt);
        signature = conversationFingerprintSignature(fingerprint);
        probeFailed = !fingerprint;
      } catch {
        signature = "";
        probeFailed = true;
      }
      if (runId !== generation) return { status: "cancelled", attempts };

      const generating = probeFailed
        ? lastKnownGenerating !== false
        : fingerprintIsGenerating(fingerprint);
      if (!probeFailed) lastKnownGenerating = generating;
      const stored = savedRecordFor(frame, fingerprint);
      const liveMetrics = fingerprint ? fullTextContentMetricsFromFingerprint(fingerprint) : null;
      const liveIsHome = !fullTextConversationHrefIsStable(liveMetrics?.href);
      const homeCovered = existing && liveIsHome && (stored?.hasPair === true || workspaceHasStoredPair);
      const existingCovered = existing && !homeCovered && fullTextExistingIsCovered(liveMetrics, stored);
      if (existingCovered) {
        rememberFromFingerprint(frame, prompt, fingerprint, true);
        return { status: "unchanged", attempts };
      }
      if (signature) {
        if (sawFingerprint && signature !== lastSignature) sawChange = true;
        if (!sawFingerprint || signature !== lastSignature || generating) idleSince = now();
        lastSignature = signature;
        lastFingerprint = fingerprint;
        sawFingerprint = true;
      } else if (probeFailed && lastKnownGenerating !== false) {
        idleSince = now();
      }
      if (fingerprint?.containsPrompt === true) sawPrompt = true;

      const waitingForReply = !existing && (sawPrompt || sawChange);
      const wallHit = !generatingCapHit && !waitingForReply && elapsed >= wallMs;
      const canCollect = existing ? sawFingerprint : (sawPrompt || sawChange);
      const idle = !generating && canCollect && sawFingerprint && (now() - idleSince >= idleMs);
      const storedPair = stored?.hasPair === true || homeCovered;
      const needsCollect = existing
        ? (homeCovered ? false : fullTextExistingNeedsCollect(liveMetrics, stored))
        : true;
      if (generating && generatingCapHit) {
        return { status: "expired", attempts };
      }
      if (homeCovered) {
        const remainingHome = wallMs - (now() - startedAt);
        if (remainingHome <= 0 || wallHit) return { status: "unchanged", attempts };
        await sleep(Math.min(pollMs, remainingHome));
        continue;
      }
      if (existing && wallHit && storedPair && !needsCollect) {
        return { status: "unchanged", attempts };
      }
      if (existing && wallHit && storedPair && (Number(liveMetrics?.turnCount) || 0) <= 0) {
        return { status: "expired", attempts };
      }
      if (!generating && (idle || wallHit) && attempts < maxAttempts) {
        if (existing && storedPair && !needsCollect) {
          return { status: "unchanged", attempts };
        }
        if (alreadySavedIdleSnapshot(frame, prompt, lastSignature || signature, fingerprint)) {
          return { status: "unchanged", attempts };
        }
        const result = await collectOnce({ frame, prompt, runId, attempts: attempts + 1 });
        if (result.status === "saved") {
          await rememberSavedSignature(frame, prompt, lastSignature, {
            fingerprint: lastFingerprint,
            messages: result.item?.page?.messages,
            hasPair: true
          });
          return { ...result, attempts: attempts + 1 };
        }
        if (result.status === "cancelled") return result;
        idleSince = now();
        if (result.status === "unmatched" && (!wallHit || waitingForReply) && (now() - startedAt) < generatingWallMs) {
          const remainingIdle = generatingWallMs - (now() - startedAt);
          if (remainingIdle <= 0) return { status: "expired", attempts };
          await sleep(Math.min(pollMs, remainingIdle));
          continue;
        }
        attempts += 1;
        if (wallHit || attempts >= maxAttempts) {
          return wallHit ? { status: result.status === "unmatched" ? "expired" : result.status, attempts } : { status: "exhausted", attempts };
        }
      } else if (!generating && wallHit) {
        return { status: "expired", attempts };
      }

      const remaining = ((generating || waitingForReply) ? generatingWallMs : wallMs) - (now() - startedAt);
      if (remaining <= 0) {
        if (generating) return { status: "expired", attempts };
        if (existing && storedPair && !needsCollect) {
          return { status: "unchanged", attempts };
        }
        if (attempts < maxAttempts) {
          if (alreadySavedIdleSnapshot(frame, prompt, lastSignature || signature, fingerprint)) {
            return { status: "unchanged", attempts };
          }
          attempts += 1;
          const result = await collectOnce({ frame, prompt, runId, attempts });
          if (result.status === "saved") {
            await rememberSavedSignature(frame, prompt, lastSignature, {
              fingerprint: lastFingerprint,
              messages: result.item?.page?.messages,
              hasPair: true
            });
            return result;
          }
          if (result.status === "cancelled") return result;
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
