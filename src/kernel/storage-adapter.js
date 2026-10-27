// Thin async key/value adapter over chrome.storage.local, with an in-memory fallback for tests.

export function createChromeStorageAdapter(area = globalThis.chrome?.storage?.local, onChangedApi = globalThis.chrome?.storage?.onChanged) {
  if (!area) return createMemoryStorageAdapter();
  return {
    async get(key) {
      const result = await area.get(key);
      return result?.[key];
    },
    async getMany(keys) {
      return (await area.get(keys)) ?? {};
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
    onChanged(cb) {
      if (!onChangedApi) return () => {};
      const listener = (changes, areaName) => {
        if (areaName !== "local") return;
        cb(changes);
      };
      onChangedApi.addListener(listener);
      return () => onChangedApi.removeListener(listener);
    },
  };
}

/** Memory adapter. Several adapters created from one `shared` map behave like separate contexts. */
export function createMemoryStorageAdapter(shared = { data: new Map(), listeners: new Set() }) {
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const own = new Set();
  return {
    shared,
    async get(key) {
      return clone(shared.data.get(key));
    },
    async getMany(keys) {
      const out = {};
      for (const key of keys) if (shared.data.has(key)) out[key] = clone(shared.data.get(key));
      return out;
    },
    getSync(key) {
      return clone(shared.data.get(key));
    },
    async set(key, value) {
      const oldValue = shared.data.get(key);
      shared.data.set(key, clone(value));
      emit(shared, { [key]: { oldValue: clone(oldValue), newValue: clone(value) } });
    },
    async remove(key) {
      if (!shared.data.has(key)) return;
      const oldValue = shared.data.get(key);
      shared.data.delete(key);
      emit(shared, { [key]: { oldValue: clone(oldValue) } });
    },
    onChanged(cb) {
      shared.listeners.add(cb);
      own.add(cb);
      return () => {
        shared.listeners.delete(cb);
        own.delete(cb);
      };
    },
  };
}

function emit(shared, changes) {
  // chrome.storage.onChanged is async; mimic that.
  queueMicrotask(() => {
    for (const cb of [...shared.listeners]) cb(changes);
  });
}
