export function stateAccess(read = [], write = [], objects = {}) {
  return Object.freeze({
    read: Object.freeze([...new Set(read)]),
    write: Object.freeze([...new Set(write)]),
    objects: Object.freeze({ ...objects })
  });
}
export function objectStateAccess(read = [], write = []) {
  return Object.freeze({
    read: Object.freeze([...new Set(read)]),
    write: Object.freeze([...new Set(write)])
  });
}

export function readonlyStateValue(value, feature, key, cache = new WeakMap(), namespace = "app state") {
  if (!value || typeof value !== "object") return value;
  const cached = cache.get(value);
  if (cached) return cached;
  const fail = (childKey = "") => {
    const suffix = childKey === "" ? "" : `.${String(childKey)}`;
    throw new TypeError(`${feature} cannot mutate read-only ${namespace}.${String(key)}${suffix}`);
  };
  const mirror = Array.isArray(value) ? [] : Object.create(null);
  const proxy = new Proxy(mirror, {
    get(_target, childKey, receiver) {
      return readonlyStateValue(
        Reflect.get(value, childKey, receiver),
        feature,
        `${String(key)}.${String(childKey)}`,
        cache,
        namespace
      );
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(value);
    },
    has(_target, childKey) {
      return Reflect.has(value, childKey);
    },
    ownKeys() {
      return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(target, childKey) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, childKey);
      if (!descriptor) return undefined;
      const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, childKey);
      if (targetDescriptor && targetDescriptor.configurable === false) {
        return Object.hasOwn(descriptor, "value")
          ? { ...targetDescriptor, value: descriptor.value }
          : targetDescriptor;
      }
      if (Object.hasOwn(descriptor, "value")) {
        return {
          configurable: true,
          enumerable: descriptor.enumerable,
          writable: false,
          value: readonlyStateValue(
            descriptor.value,
            feature,
            `${String(key)}.${String(childKey)}`,
            cache,
            namespace
          )
        };
      }
      return {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: typeof descriptor.get === "function"
          ? () => readonlyStateValue(
              Reflect.get(value, childKey, value),
              feature,
              `${String(key)}.${String(childKey)}`,
              cache,
              namespace
            )
          : undefined,
        set: undefined
      };
    },
    set(_target, childKey) {
      fail(childKey);
    },
    defineProperty(_target, childKey) {
      fail(childKey);
    },
    deleteProperty(_target, childKey) {
      fail(childKey);
    },
    preventExtensions() {
      fail("[[Extensible]]");
    },
    setPrototypeOf() {
      fail("__proto__");
    },
  });
  cache.set(value, proxy);
  return proxy;
}

function stateValuesEquivalent(left, right, seen = new WeakMap()) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const previous = seen.get(left);
  if (previous) return previous === right;
  seen.set(left, right);
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const rightKeySet = new Set(rightKeys);
  return leftKeys.every((key) => rightKeySet.has(key) && stateValuesEquivalent(left[key], right[key], seen));
}

function validateScopedObjectReplacement(current, next, feature, key, objectAccess) {
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    throw new TypeError(`${feature} must assign an object to app state.${String(key)}`);
  }
  const currentValue = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const writable = new Set(objectAccess.write);
  for (const childKey of new Set([...Object.keys(currentValue), ...Object.keys(next)])) {
    if (writable.has(childKey)) continue;
    if (!stateValuesEquivalent(currentValue[childKey], next[childKey])) {
      throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
    }
  }
}

function scopedStateObjectValue(value, feature, key, objectAccess, readonlyCache, scopedCache) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const cached = scopedCache.get(value);
  if (cached) return cached;
  const readable = new Set(objectAccess.read);
  const writable = new Set(objectAccess.write);
  const proxy = new Proxy(Object.create(null), {
    get(_target, childKey) {
      if (typeof childKey === "symbol") return value[childKey];
      if (!readable.has(childKey)) throw new TypeError(`${feature} cannot read app state.${String(key)}.${String(childKey)}`);
      const childValue = value[childKey];
      return writable.has(childKey)
        ? childValue
        : readonlyStateValue(childValue, feature, `${String(key)}.${String(childKey)}`, readonlyCache);
    },
    set(_target, childKey, childValue) {
      if (!writable.has(childKey)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
      value[childKey] = childValue;
      return true;
    },
    defineProperty(_target, childKey, descriptor) {
      if (!writable.has(childKey)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
      Object.defineProperty(value, childKey, descriptor);
      return true;
    },
    deleteProperty(_target, childKey) {
      if (!writable.has(childKey)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}.${String(childKey)}`);
      return delete value[childKey];
    },
    setPrototypeOf() {
      throw new TypeError(`${feature} cannot mutate app state.${String(key)}.__proto__`);
    },
    has(_target, childKey) {
      return readable.has(childKey) && childKey in value;
    },
    ownKeys() {
      return objectAccess.read.filter((childKey) => Object.prototype.hasOwnProperty.call(value, childKey));
    },
    getOwnPropertyDescriptor(_target, childKey) {
      return readable.has(childKey) && Object.prototype.hasOwnProperty.call(value, childKey)
        ? { enumerable: true, configurable: true }
        : undefined;
    }
  });
  scopedCache.set(value, proxy);
  return proxy;
}

export function createScopedStatePort(rootState, feature, access) {
  if (!rootState || typeof rootState !== "object") throw new TypeError("Feature state requires a root state object");
  if (!access) throw new TypeError(`Unknown feature state: ${feature}`);
  const readable = new Set(access.read);
  const writable = new Set(access.write);
  const readonlyCache = new WeakMap();
  const scopedObjectCaches = new Map();
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (typeof key === "symbol") return rootState[key];
      if (!readable.has(key)) throw new TypeError(`${feature} cannot read app state.${key}`);
      const objectAccess = access.objects?.[key];
      if (objectAccess) {
        if (!scopedObjectCaches.has(key)) scopedObjectCaches.set(key, new WeakMap());
        return scopedStateObjectValue(
          rootState[key],
          feature,
          key,
          objectAccess,
          readonlyCache,
          scopedObjectCaches.get(key)
        );
      }
      return writable.has(key) ? rootState[key] : readonlyStateValue(rootState[key], feature, key, readonlyCache);
    },
    set(_target, key, value) {
      if (!writable.has(key)) throw new TypeError(`${feature} cannot mutate app state.${String(key)}`);
      const objectAccess = access.objects?.[key];
      if (objectAccess) validateScopedObjectReplacement(rootState[key], value, feature, key, objectAccess);
      rootState[key] = value;
      return true;
    },
    has(_target, key) {
      return readable.has(key);
    },
    ownKeys() {
      return [...readable];
    },
    getOwnPropertyDescriptor(_target, key) {
      return readable.has(key) ? { enumerable: true, configurable: true } : undefined;
    }
  });
}
