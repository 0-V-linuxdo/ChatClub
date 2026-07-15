import {
  RUNTIME_REGISTRY_ABI_VERSION,
  RUNTIME_REGISTRY_KEY
} from "../../shared/protocol.js";

function validName(name) {
  const value = String(name || "").trim();
  if (!value) throw new TypeError("Runtime name is required");
  return value;
}

export function runtimeRegistry(target = globalThis) {
  const current = target[RUNTIME_REGISTRY_KEY];
  if (current?.abiVersion === RUNTIME_REGISTRY_ABI_VERSION && typeof current.register === "function") return current;

  const entries = new Map();
  const registry = Object.freeze({
    abiVersion: RUNTIME_REGISTRY_ABI_VERSION,
    register(name, descriptor = {}) {
      const key = validName(name);
      const version = String(descriptor.version || "");
      if (!version) throw new TypeError(`Runtime ${key} requires a version`);
      if (!("api" in descriptor)) throw new TypeError(`Runtime ${key} requires an api`);
      const previous = entries.get(key);
      if (previous?.version === version) return previous.api;
      if (previous) {
        try { previous.dispose?.(`replaced by ${version}`); } catch {}
      }
      entries.set(key, {
        version,
        api: descriptor.api,
        dispose: typeof descriptor.dispose === "function" ? descriptor.dispose : null
      });
      return descriptor.api;
    },
    require(name, version) {
      const key = validName(name);
      const entry = entries.get(key);
      if (!entry) throw new Error(`Runtime ${key} is not registered`);
      if (version != null && entry.version !== String(version)) {
        throw new Error(`Runtime ${key} version ${entry.version} does not satisfy ${String(version)}`);
      }
      return entry.api;
    },
    registration(name) {
      const entry = entries.get(validName(name));
      return entry ? Object.freeze({ version: entry.version, api: entry.api }) : null;
    },
    invalidate(name, reason = "invalidated") {
      const key = validName(name);
      const entry = entries.get(key);
      if (!entry) return false;
      entries.delete(key);
      try { entry.dispose?.(String(reason || "invalidated")); } catch {}
      return true;
    }
  });

  Object.defineProperty(target, RUNTIME_REGISTRY_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: registry
  });
  return registry;
}
