// Application state ports (spec §10.4). Owners register ports; subscribers may attach before registration.

export class StatePorts {
  constructor(logger) {
    this.logger = logger;
    this.ports = new Map();
    this.subscriptions = new Map(); // portName -> Set<sub>
  }

  register(name, port) {
    if (!port || typeof port.getState !== "function" || typeof port.subscribe !== "function") {
      throw new TypeError(`State port "${name}" needs getState() and subscribe()`);
    }
    if (this.ports.has(name)) throw new Error(`State port "${name}" is already registered`);
    this.ports.set(name, port);
    for (const sub of this.subscriptions.get(name) ?? []) this._attach(sub);
    return () => {
      if (this.ports.get(name) !== port) return;
      this.ports.delete(name);
      for (const sub of this.subscriptions.get(name) ?? []) this._detach(sub);
    };
  }

  has(name) {
    return this.ports.has(name);
  }

  getState(name) {
    return this.ports.get(name)?.getState();
  }

  /** Returns an unsubscribe function; pending subscriptions attach once the port appears. */
  subscribe(name, selector, handler) {
    if (typeof handler !== "function" && typeof selector === "function") {
      handler = selector;
      selector = null;
    }
    const sub = { name, selector: selector || null, handler, detach: null, last: undefined, hasLast: false };
    let set = this.subscriptions.get(name);
    if (!set) {
      set = new Set();
      this.subscriptions.set(name, set);
    }
    set.add(sub);
    if (this.ports.has(name)) this._attach(sub);
    return () => {
      this._detach(sub);
      set.delete(sub);
      if (set.size === 0) this.subscriptions.delete(name);
    };
  }

  _select(sub, state) {
    if (!sub.selector) return state;
    try {
      return sub.selector(state);
    } catch (error) {
      this.logger?.error(`Selector on state port "${sub.name}" threw:`, error);
      return sub.last;
    }
  }

  _attach(sub) {
    const port = this.ports.get(sub.name);
    if (!port || sub.detach) return;
    try {
      const initial = port.getState();
      sub.last = this._select(sub, initial);
      sub.hasLast = true;
      sub.prevState = initial;
    } catch (error) {
      this.logger?.error(`Reading state port "${sub.name}" failed:`, error);
    }
    const onChange = () => {
      let state;
      try {
        state = port.getState();
      } catch (error) {
        this.logger?.error(`Reading state port "${sub.name}" failed:`, error);
        return;
      }
      const prevState = sub.prevState;
      sub.prevState = state;
      if (sub.selector) {
        const next = this._select(sub, state);
        if (sub.hasLast && Object.is(next, sub.last)) return;
        const prev = sub.last;
        sub.last = next;
        sub.hasLast = true;
        this._call(sub, next, prev);
      } else {
        this._call(sub, state, prevState);
      }
    };
    try {
      const off = port.subscribe(onChange);
      sub.detach = typeof off === "function" ? off : () => {};
    } catch (error) {
      this.logger?.error(`Subscribing to state port "${sub.name}" failed:`, error);
    }
  }

  _detach(sub) {
    if (!sub.detach) return;
    try {
      sub.detach();
    } catch (error) {
      this.logger?.error(`Detaching from state port "${sub.name}" failed:`, error);
    }
    sub.detach = null;
  }

  _call(sub, current, prev) {
    try {
      sub.handler(current, prev);
    } catch (error) {
      this.logger?.error(`State subscriber on "${sub.name}" threw:`, error);
    }
  }
}

/** Tiny observable store for state-port owners. Returned state is frozen (read-only for subscribers). */
export function createStateStore(initial) {
  let state = deepFreeze(structuredCloneSafe(initial));
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update(recipe) {
      const draft = structuredCloneSafe(state);
      const result = recipe(draft);
      const next = deepFreeze(result === undefined ? draft : result);
      state = next;
      for (const fn of [...listeners]) {
        try {
          fn(state);
        } catch {
          // Subscribers guard themselves via StatePorts.
        }
      }
    },
  };
}

function structuredCloneSafe(value) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}
