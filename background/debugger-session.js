export function createDebuggerSessionCoordinator(api) {
  if (
    typeof api?.debugger?.attach !== "function"
    || typeof api?.debugger?.sendCommand !== "function"
    || typeof api?.debugger?.detach !== "function"
  ) {
    return Object.freeze({ available: false });
  }
  const tails = new Map();
  const activeLeases = new Map();
  let nextGeneration = 0;

  function debuggerTarget(value) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && Number.isInteger(value.tabId)
      && value.tabId >= 0
      && value.targetId === undefined
      && Object.keys(value).every((key) => key === "tabId")
    ) return { key: `tab:${value.tabId}`, target: Object.freeze({ tabId: value.tabId }) };
    const targetId = String(value?.targetId || "");
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && targetId
      && targetId.length <= 256
      && value.tabId === undefined
      && Object.keys(value).every((key) => key === "targetId")
    ) return { key: `target:${targetId}`, target: Object.freeze({ targetId }) };
    return null;
  }

  async function withDebuggerTarget(targetValue, task) {
    const resolved = debuggerTarget(targetValue);
    if (!resolved || typeof task !== "function") {
      throw new TypeError("Browser debugger session target is invalid");
    }
    const { key, target } = resolved;
    const previous = tails.get(key) || Promise.resolve();
    let release;
    const slot = new Promise((resolve) => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => slot);
    tails.set(key, tail);
    await previous.catch(() => {});

    let attached = false;
    let lease = null;
    try {
      await api.debugger.attach(target, "1.3");
      attached = true;
      lease = {
        active: true,
        generation: ++nextGeneration
      };
      activeLeases.set(key, lease);
      const generation = lease.generation;
      return await task(Object.freeze({
        target,
        async sendCommand(method, params = {}, sessionId = "") {
          if (
            !lease.active
            || lease.generation !== generation
            || activeLeases.get(key) !== lease
          ) {
            throw new Error("Browser debugger session lease is no longer active");
          }
          const commandTarget = sessionId ? { ...target, sessionId: String(sessionId) } : target;
          return api.debugger.sendCommand(commandTarget, method, params);
        }
      }));
    } finally {
      if (lease) {
        lease.active = false;
        lease.generation += 1;
        if (activeLeases.get(key) === lease) activeLeases.delete(key);
      }
      if (attached) {
        try { await api.debugger.detach(target); } catch {}
      }
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  }

  function withTabDebugger(tabId, task) {
    return withDebuggerTarget({ tabId }, task);
  }

  return Object.freeze({ available: true, withDebuggerTarget, withTabDebugger });
}
