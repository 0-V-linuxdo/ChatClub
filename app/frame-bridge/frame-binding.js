const DEFAULT_CHALLENGE_TTL_MS = 8000;
const CHALLENGE_BYTES = 32;
const CHALLENGE_PATTERN = /^[a-f0-9]{64}$/i;

function secureChallenge(randomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)) {
  if (typeof randomValues !== "function") {
    throw new Error("Secure frame binding requires crypto.getRandomValues");
  }
  const bytes = new Uint8Array(CHALLENGE_BYTES);
  randomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function validFrameBindingChallenge(value) {
  return CHALLENGE_PATTERN.test(String(value || ""));
}

export function createFrameBindingChallengeRegistry(options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const randomValues = options.randomValues;
  const setTimer = typeof options.setTimer === "function" ? options.setTimer : globalThis.setTimeout?.bind(globalThis);
  const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : globalThis.clearTimeout?.bind(globalThis);
  const ttlMs = Math.max(1000, Number(options.ttlMs) || DEFAULT_CHALLENGE_TTL_MS);
  const entriesByChallenge = new Map();
  const entryByFrame = new WeakMap();
  const generationByFrame = new WeakMap();

  function entryIsLive(entry, at = now()) {
    const iframe = entry?.iframe;
    return Boolean(
      entry
      && iframe
      && iframe.isConnected !== false
      && entry.expiresAt >= at
      && generationByFrame.get(iframe) === entry.generation
      && entryByFrame.get(iframe) === entry
    );
  }

  function clearEntry(entry) {
    if (!entry) return;
    if (entry.expiryTimer != null && typeof clearTimer === "function") {
      clearTimer(entry.expiryTimer);
      entry.expiryTimer = null;
    }
    if (entriesByChallenge.get(entry.challenge) === entry) {
      entriesByChallenge.delete(entry.challenge);
    }
    const iframe = entry.iframe;
    if (iframe && entryByFrame.get(iframe) === entry) {
      entryByFrame.delete(iframe);
    }
  }

  function prune() {
    const at = now();
    for (const entry of entriesByChallenge.values()) {
      if (!entryIsLive(entry, at)) clearEntry(entry);
    }
  }

  function nextChallenge() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const challenge = secureChallenge(randomValues);
      if (!entriesByChallenge.has(challenge)) return challenge;
    }
    throw new Error("Could not allocate a unique secure frame binding challenge");
  }

  function issue(iframe, { rotate = false } = {}) {
    if (!iframe || iframe.isConnected === false) return null;
    prune();
    const existing = entryByFrame.get(iframe);
    if (!rotate && entryIsLive(existing)) return existing;
    clearEntry(existing);
    const generation = (generationByFrame.get(iframe) || 0) + 1;
    generationByFrame.set(iframe, generation);
    const iframeRef = new WeakRef(iframe);
    const entry = {
      challenge: nextChallenge(),
      generation,
      expiresAt: now() + ttlMs,
      claimed: false,
      expiryTimer: null
    };
    Object.defineProperty(entry, "iframe", {
      configurable: false,
      enumerable: false,
      get: () => iframeRef.deref()
    });
    entriesByChallenge.set(entry.challenge, entry);
    entryByFrame.set(iframe, entry);
    if (typeof setTimer === "function") {
      entry.expiryTimer = setTimer(() => clearEntry(entry), ttlMs + 1);
      entry.expiryTimer?.unref?.();
    }
    return entry;
  }

  function claim(challenge, generation) {
    const token = String(challenge || "");
    if (!validFrameBindingChallenge(token)) return null;
    const entry = entriesByChallenge.get(token);
    if (!entry || entry.claimed || entry.generation !== Number(generation)) return null;
    if (!entryIsLive(entry)) {
      clearEntry(entry);
      return null;
    }
    entry.claimed = true;
    entriesByChallenge.delete(token);
    return entry;
  }

  function isCurrent(entry) {
    return entryIsLive(entry) && entry.claimed === true;
  }

  function finish(entry) {
    const iframe = entry?.iframe;
    if (!iframe || entryByFrame.get(iframe) !== entry) return false;
    clearEntry(entry);
    return true;
  }

  function invalidate(iframe) {
    if (!iframe) return false;
    const existing = entryByFrame.get(iframe);
    clearEntry(existing);
    generationByFrame.set(iframe, (generationByFrame.get(iframe) || 0) + 1);
    return Boolean(existing);
  }

  return Object.freeze({
    claim,
    finish,
    invalidate,
    isCurrent,
    issue
  });
}
