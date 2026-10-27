// Synchronous event bus (spec §10.1).

export class EventBus {
  constructor(logger) {
    this.logger = logger;
    this.listeners = new Map();
  }

  subscribe(event, handler) {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      const current = this.listeners.get(event);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.listeners.delete(event);
    };
  }

  dispatch(event, data) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(data);
      } catch (error) {
        this.logger?.error(`Listener for event "${event}" threw:`, error);
      }
    }
  }

  listenerCount(event) {
    return this.listeners.get(event)?.size ?? 0;
  }
}
