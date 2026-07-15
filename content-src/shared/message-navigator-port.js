export function createMessageNavigatorPort(runtimes) {
  const runtime = (required = true) => {
    const api = runtimes?.registration?.("message-navigator")?.api;
    if (api && typeof api.setEnabled === "function") return api;
    if (required) throw new Error("Message navigator runtime is unavailable");
    return null;
  };
  return Object.freeze({
    setEnabled(data = {}) {
      return runtime().setEnabled(data);
    },
    hideMenu() {
      const api = runtime();
      return typeof api.closeMenu === "function" ? api.closeMenu() : api.state();
    },
    state() {
      const api = runtime(false);
      return api && typeof api.state === "function"
        ? api.state()
        : { ok: false, enabled: false, messageCount: 0, error: "Message navigator runtime is unavailable" };
    }
  });
}
