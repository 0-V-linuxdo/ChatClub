import { conversationFingerprint, conversationSampleRoot } from "./summary-runtime.js";
import { installUserActivityTracking, userInputIdleMs } from "./summary-collection-guard.js";

// Frame RPC clamps a command at 60s; one long poll stays well inside that so
// the parent's own timeout (waitMs plus a margin) never has to reach the clamp.
const CONVERSATION_FINGERPRINT_MAX_WAIT_MS = 25_000;
// A streaming reply mutates the DOM continuously; recompute only once it has
// been quiet this long so a burst of records costs one fingerprint, not one
// per record.
const CONVERSATION_FINGERPRINT_QUIET_MS = 1_200;

const SIGNATURE_FIELDS = Object.freeze(["turnCount", "userChars", "assistantChars", "tailHash"]);
const STATE_FIELDS = Object.freeze(["generating", "containsPrompt"]);

function fieldValue(fingerprint, key) {
  const value = fingerprint?.[key];
  if (key === "tailHash") return String(value || "");
  if (STATE_FIELDS.includes(key)) return value === true;
  return Number(value) || 0;
}

function conversationFingerprintDiffers(next, since) {
  if (!since || typeof since !== "object") return true;
  for (const key of [...SIGNATURE_FIELDS, ...STATE_FIELDS]) {
    if (fieldValue(next, key) !== fieldValue(since, key)) return true;
  }
  return false;
}

function decorate(fingerprint, startedAt) {
  return {
    ...fingerprint,
    inputIdleMs: userInputIdleMs(),
    waitedMs: Math.max(0, Date.now() - startedAt)
  };
}

function observedRoot() {
  // Observe from the body so a site that replaces its <main> during a
  // re-render cannot leave the observer on a detached subtree.
  return document.body || conversationSampleRoot() || document.documentElement;
}

// One fingerprint now; then, when the parent asked to wait, resolve as soon as
// the DOM has gone quiet and the fingerprint differs from `since`, or at the
// deadline with a fresh fingerprint. Without `waitMs` this is the old probe.
export function conversationFingerprintWhenChanged(documentId = "", data = {}) {
  installUserActivityTracking();
  const startedAt = Date.now();
  const waitMs = Math.max(0, Math.min(CONVERSATION_FINGERPRINT_MAX_WAIT_MS, Number(data?.waitMs) || 0));
  const since = data?.since && typeof data.since === "object" ? data.since : null;
  const probe = () => conversationFingerprint(documentId, data);
  let current = probe();
  if (!waitMs || !since || conversationFingerprintDiffers(current, since) || typeof MutationObserver !== "function") {
    return Promise.resolve(decorate(current, startedAt));
  }
  return new Promise((resolve) => {
    let finished = false;
    let dirty = false;
    let quietTimer = 0;
    const deadline = startedAt + waitMs;
    const finish = (fingerprint) => {
      if (finished) return;
      finished = true;
      clearTimeout(quietTimer);
      clearTimeout(deadlineTimer);
      try { observer.disconnect(); } catch {}
      window.removeEventListener("pagehide", onPageHide, true);
      resolve(decorate(fingerprint, startedAt));
    };
    const recompute = () => {
      quietTimer = 0;
      if (finished) return;
      dirty = false;
      try {
        current = probe();
      } catch {
        return;
      }
      if (conversationFingerprintDiffers(current, since)) finish(current);
    };
    const observer = new MutationObserver(() => {
      if (finished) return;
      dirty = true;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(recompute, Math.max(0, Math.min(CONVERSATION_FINGERPRINT_QUIET_MS, deadline - Date.now())));
    });
    const onPageHide = () => finish(current);
    const deadlineTimer = setTimeout(() => {
      if (finished) return;
      if (dirty) {
        try { current = probe(); } catch {}
      }
      finish(current);
    }, waitMs);
    try {
      observer.observe(observedRoot(), {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-busy", "data-is-streaming"]
      });
    } catch {
      finish(current);
      return;
    }
    window.addEventListener("pagehide", onPageHide, true);
  });
}
