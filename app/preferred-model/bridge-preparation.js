const PREFERRED_MODEL_BRIDGE_PREPARATION_TIMEOUT_MS = 2500;

export function waitForPreferredModelBridgePreparation(prepare, options = {}) {
  const signal = options.signal || null;
  const ownerIsCurrent = typeof options.ownerIsCurrent === "function" ? options.ownerIsCurrent : () => true;
  const requestedTimeoutMs = Number(options.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? requestedTimeoutMs
    : PREFERRED_MODEL_BRIDGE_PREPARATION_TIMEOUT_MS;
  const cancelledResult = () => ({
    ok: false,
    cancelled: true,
    reason: "preferred-model frame was superseded during bridge recovery"
  });
  if (signal?.aborted || !ownerIsCurrent()) return Promise.resolve(cancelledResult());
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve(result);
    };
    const ownerResult = (result) => {
      finish(signal?.aborted || !ownerIsCurrent() ? cancelledResult() : result);
    };
    const onAbort = () => finish(cancelledResult());
    signal?.addEventListener?.("abort", onAbort, { once: true });
    if (signal?.aborted || !ownerIsCurrent()) {
      finish(cancelledResult());
      return;
    }
    timer = setTimeout(() => ownerResult({
      ok: false,
      timedOut: true,
      reason: "iframe content bridge recovery timed out"
    }), timeoutMs);
    Promise.resolve().then(prepare).then(
      (result) => ownerResult(result || { ok: false, reason: "iframe content bridge recovery failed" }),
      (error) => ownerResult({
        ok: false,
        reason: error?.message || String(error || "iframe content bridge recovery failed")
      })
    );
  });
}
