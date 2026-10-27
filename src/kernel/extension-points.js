// Generic extension point registries (spec §11.1). Concrete points are rendered by API plugins.

export class ExtensionPoint {
  constructor(id, logger) {
    this.id = id;
    this.logger = logger;
    this.entries = new Map();
    this.listeners = new Set();
  }

  set(id, def) {
    this.entries.set(id, def);
    this._notify();
    return () => this.delete(id, def);
  }

  /** Deletes the entry; when `expected` is given, only if it is still that entry. */
  delete(id, expected) {
    if (!this.entries.has(id)) return false;
    if (expected !== undefined && this.entries.get(id) !== expected) return false;
    this.entries.delete(id);
    this._notify();
    return true;
  }

  get(id) {
    return this.entries.get(id);
  }

  has(id) {
    return this.entries.has(id);
  }

  get size() {
    return this.entries.size;
  }

  sorted() {
    return [...this.entries.entries()]
      .map(([id, def]) => ({ ...def, id }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    for (const fn of [...this.listeners]) {
      try {
        fn(this);
      } catch (error) {
        this.logger?.error(`Extension point "${this.id}" listener threw:`, error);
      }
    }
  }
}

export class ExtensionPointRegistry {
  constructor(logger) {
    this.logger = logger;
    this.points = new Map();
    this.anyListeners = new Set();
  }

  get(id) {
    let point = this.points.get(id);
    if (!point) {
      point = new ExtensionPoint(id, this.logger);
      point.subscribe(() => {
        for (const fn of [...this.anyListeners]) {
          try {
            fn(id);
          } catch (error) {
            this.logger?.error("Extension registry listener threw:", error);
          }
        }
      });
      this.points.set(id, point);
    }
    return point;
  }

  onAnyChange(fn) {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }
}

/**
 * Runs a render callback inside an error boundary. A failing entry yields `fallback`
 * (default: nothing) and is logged; sibling entries keep rendering.
 */
export function renderSafely(logger, pointId, entryId, render, fallback = null) {
  try {
    return render();
  } catch (error) {
    logger?.error(`Entry "${entryId}" of "${pointId}" failed to render:`, error);
    return typeof fallback === "function" ? fallback(error) : fallback;
  }
}

/** Wraps an entry callback (onClick etc.) so a throw is logged instead of escaping. */
export function guardCallback(logger, label, fn) {
  return (...args) => {
    try {
      const result = fn(...args);
      if (result && typeof result.catch === "function") {
        result.catch((error) => logger?.error(`${label} failed:`, error));
      }
      return result;
    } catch (error) {
      logger?.error(`${label} failed:`, error);
      return undefined;
    }
  };
}
