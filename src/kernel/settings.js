// Settings system (spec §9 and §19 v1.1).
//
// Two persistent bags live in chrome.storage.local:
//   - "pluginSettings": { plugins: { <Name>: { enabled, <key>: value } } }
//   - "options":        the pre-existing ChatClub options object; keys stay where they are and
//                       are owned by plugins through `optionKey` on a setting definition.
// Every change, from either bag, is announced as a dotted plugin path such as
// "plugins.Appearance.themeMode", so plugins never need to know where a value is stored.

import { decodeOptions, encodeOptions } from "./options-codec.js";

const PERSIST_DELAY_MS = 100;
/** Write counter stored beside each bag's data (v2 07 §5.3). */
export const REVISION_KEY = "configRevision";

export const DELETE = Symbol("delete");

export const SettingType = Object.freeze({
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  SELECT: "select",
  SLIDER: "slider",
  COMPONENT: "component",
  CUSTOM: "custom",
});

const VISIBLE_TYPES = new Set(["string", "number", "boolean", "select", "slider", "component"]);

export function isVisibleSetting(field) {
  return !!field && VISIBLE_TYPES.has(field.type) && !field.hidden;
}

/** Parses the stored value, accepting an object, a JSON string, or a JSON string of a JSON string. */
export function parseStoredJson(raw) {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clone(value) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

/** Lists dotted paths whose values differ between two plain JSON trees. */
export function diffPaths(a, b, base = []) {
  const out = [];
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  if ((isObj(a) && (isObj(b) || b === undefined)) || (isObj(b) && a === undefined)) {
    a = a ?? {};
    b = b ?? {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) out.push(...diffPaths(a[key], b[key], [...base, key]));
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (stableJson(a) !== stableJson(b)) out.push(base.join("."));
    return out;
  }
  if (!Object.is(a, b)) out.push(base.join("."));
  return out;
}

/** One chrome.storage.local key holding a JSON object, with debounced persistence. */
class PersistentBag {
  constructor({ key, adapter, logger, initial, canPersist, onPathChanged, pathPrefix = "" }) {
    this.key = key;
    this.adapter = adapter;
    this.logger = logger;
    this.data = initial;
    this.canPersist = canPersist || (() => true);
    this.onPathChanged = onPathChanged;
    this.pathPrefix = pathPrefix;
    this.ready = false;
    this.pending = []; // writes made before ready: [parts, value | DELETE]
    this.dirty = new Map(); // path -> parts, written locally since the last flush
    this.timer = null;
    this.lastWritten = null;
    this.proxies = new WeakMap();
    this.targets = new WeakMap();
    this.revision = 0; // revision of the stored copy this bag last read or wrote
    this.lastBody = null; // stored data without the revision, as last read or written
    this.flushChain = Promise.resolve(false);
  }

  preloadSync() {
    if (typeof this.adapter.getSync !== "function") return false;
    try {
      const parsed = parseStoredJson(this.adapter.getSync(this.key));
      if (parsed) {
        this.data = this._decode(parsed);
        return true;
      }
    } catch (error) {
      this.logger.warn(`Synchronous preload of "${this.key}" failed:`, error);
    }
    return false;
  }

  normalize(value) {
    return value;
  }

  /** Memory → stored shape (without the revision). */
  encode(value) {
    return value;
  }

  _decode(parsed) {
    const { [REVISION_KEY]: revision, ...rest } = parsed;
    this.revision = Number(revision) || 0;
    this.lastBody = stableJson(rest);
    return this.normalize(rest);
  }

  async load() {
    let parsed = null;
    try {
      parsed = parseStoredJson(await this.adapter.get(this.key));
    } catch (error) {
      this.logger.error(`Reading "${this.key}" failed:`, error);
    }
    if (parsed) {
      this.data = this._decode(parsed);
      for (const [parts, value] of this.pending) this._rawWrite(parts, value);
    }
    this.pending = [];
    this.ready = true;
    if (parsed) await this.flush();
    else if (this.timer === null) this._schedule();
    return !!parsed;
  }

  _rawWrite(parts, value) {
    let node = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== "object") node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === DELETE) delete node[last];
    else node[last] = value;
  }

  unwrap(value) {
    return value && typeof value === "object" ? this.targets.get(value) ?? value : value;
  }

  get(parts) {
    let node = this.data;
    for (const part of parts) {
      if (node === undefined || node === null) return undefined;
      node = node[part];
    }
    return node;
  }

  /** Writes and notifies. Returns true when the value actually changed. */
  set(parts, value, { notify = true } = {}) {
    value = this.unwrap(value);
    const old = this.get(parts);
    if (value !== DELETE && Object.is(old, value)) return false;
    if (value === DELETE && old === undefined && !this._hasPath(parts)) return false;
    this._rawWrite(parts, value);
    if (!this.ready) this.pending.push([parts, value]);
    this.dirty.set(parts.join("\u0000"), parts);
    if (notify) this.onPathChanged?.(this.pathPrefix + parts.join("."));
    this._schedule();
    return true;
  }

  _hasPath(parts) {
    let node = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node?.[parts[i]];
      if (!node || typeof node !== "object") return false;
    }
    return !!node && Object.prototype.hasOwnProperty.call(node, parts[parts.length - 1]);
  }

  /** Reactive proxy over an object inside this bag. */
  proxy(target, parts) {
    const cacheKey = target;
    const cached = this.proxies.get(cacheKey);
    if (cached && cached.path === parts.join(".")) return cached.proxy;
    const bag = this;
    const proxy = new Proxy(target, {
      get(t, prop, receiver) {
        const value = Reflect.get(t, prop, receiver);
        if (typeof prop === "string" && value && typeof value === "object") return bag.proxy(value, [...parts, prop]);
        return value;
      },
      set(t, prop, value) {
        if (typeof prop !== "string") return Reflect.set(t, prop, value);
        bag.set([...parts, prop], value);
        return true;
      },
      deleteProperty(t, prop) {
        if (typeof prop !== "string") return Reflect.deleteProperty(t, prop);
        bag.set([...parts, prop], DELETE);
        return true;
      },
    });
    this.proxies.set(cacheKey, { proxy, path: parts.join(".") });
    this.targets.set(proxy, target);
    return proxy;
  }

  _schedule() {
    if (!this.ready) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, PERSIST_DELAY_MS);
  }

  flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushChain = this.flushChain.then(() => this._flush(), () => this._flush());
    return this.flushChain;
  }

  async _flush() {
    if (!this.ready || !this.canPersist(this.data)) return false;
    const mine = [...this.dirty.values()];
    this.dirty.clear();
    let body = stableJson(this.encode(this.data));
    if (body === this.lastBody) return false;
    let current = null;
    try {
      current = parseStoredJson(await this.adapter.get(this.key));
    } catch {
      current = null;
    }
    const storedRevision = Number(current?.[REVISION_KEY]) || 0;
    if (current && storedRevision !== this.revision) {
      // CONFIG_REVISION_CONFLICT: another page wrote since this one last read. Take its copy, put this
      // page's own changes back on top (per path), then write the merge.
      this.logger.info?.(`CONFIG_REVISION_CONFLICT on "${this.key}" (expected ${this.revision}, found ${storedRevision}); merging`);
      const values = mine.map((parts) => [parts, this.get(parts)]);
      const previous = this.data;
      this.data = this._decode(current);
      for (const [parts, value] of values) this._rawWrite(parts, value === undefined ? DELETE : value);
      for (const path of diffPaths(previous, this.data).filter(Boolean)) this.onPathChanged?.(this.pathPrefix + path);
      body = stableJson(this.encode(this.data));
      if (body === this.lastBody) return false;
    }
    const revision = storedRevision + 1;
    const record = { ...JSON.parse(body), [REVISION_KEY]: revision };
    const json = stableJson(record);
    this.lastWritten = json;
    try {
      await this.adapter.set(this.key, record);
      this.revision = revision;
      this.lastBody = body;
      return true;
    } catch (error) {
      this.lastWritten = null;
      this.logger.error(`Persisting "${this.key}" failed:`, error);
      return false;
    }
  }

  /** Applies a change made in another context: update memory and notify, never write back. */
  applyRemote(newValue) {
    const parsed = parseStoredJson(newValue);
    if (!parsed) return [];
    const json = stableJson(parsed);
    if (json === this.lastWritten) return [];
    const next = this._decode(parsed);
    // Local writes not yet flushed win over the remote copy (per path), then get flushed.
    const local = [...this.dirty.values()].map((parts) => [parts, this.get(parts)]);
    const previous = this.data;
    this.data = next;
    for (const [parts, value] of local) this._rawWrite(parts, value === undefined ? DELETE : value);
    this.lastWritten = json;
    const changed = diffPaths(previous, this.data).filter(Boolean);
    for (const path of changed) this.onPathChanged?.(this.pathPrefix + path);
    return changed;
  }
}

export class SettingsManager {
  constructor({ adapter, logger, pluginSettingsKey = "pluginSettings", optionsKey = "options" }) {
    this.adapter = adapter;
    this.logger = logger;
    this.globalListeners = new Set();
    this.exactListeners = new Map();
    this.prefixListeners = new Map();
    this.optionOwners = new Map(); // optionKey -> { plugin, key }
    this.defined = new Map(); // plugin name -> DefinedSettings
    this.loadedFromStorage = false;

    this.pluginBag = new PersistentBag({
      key: pluginSettingsKey,
      adapter,
      logger,
      initial: { plugins: {} },
      canPersist: (data) => !!data.plugins && Object.keys(data.plugins).length > 0,
      onPathChanged: (path) => this._notify(path),
    });
    this.pluginBag.normalize = (value) => {
      if (!value.plugins || typeof value.plugins !== "object") value.plugins = {};
      return value;
    };
    this.optionsBag = new PersistentBag({
      key: optionsKey,
      adapter,
      logger,
      initial: {},
      canPersist: (data) => Object.keys(data).length > 0,
      onPathChanged: (path) => {
        const owner = this.optionOwners.get(path.split(".")[0]);
        if (owner) this._notify(`plugins.${owner.plugin}.${owner.key}${path.includes(".") ? path.slice(path.indexOf(".")) : ""}`);
      },
    });
    this.optionsBag.normalize = decodeOptions;
    this.optionsBag.encode = encodeOptions;
    this.offStorage = null;
  }

  get plain() {
    return this.pluginBag.data;
  }

  get optionsPlain() {
    return this.optionsBag.data;
  }

  /** Reactive root store: ChatClub.Settings.plugins.X.enabled */
  get store() {
    return this.pluginBag.proxy(this.pluginBag.data, []);
  }

  get ready() {
    return this.pluginBag.ready;
  }

  preloadSync() {
    this.pluginBag.preloadSync();
    this.optionsBag.preloadSync();
  }

  async init() {
    const [hadPlugins] = await Promise.all([this.pluginBag.load(), this.optionsBag.load()]);
    this.loadedFromStorage = hadPlugins;
    this.offStorage = this.adapter.onChanged?.((changes) => {
      if (changes[this.pluginBag.key]) this.pluginBag.applyRemote(changes[this.pluginBag.key].newValue);
      if (changes[this.optionsBag.key]) this.optionsBag.applyRemote(changes[this.optionsBag.key].newValue);
      if (changes[this.pluginBag.key] || changes[this.optionsBag.key]) this.onRemoteChange?.();
    }) ?? null;
    return hadPlugins;
  }

  async flush() {
    await Promise.all([this.pluginBag.flush(), this.optionsBag.flush()]);
  }

  /** Synchronously starts the writes; used from pagehide where awaiting is impossible. */
  flushNow() {
    this.pluginBag.flush();
    this.optionsBag.flush();
  }

  markAsChanged() {
    this._notify("");
    this.pluginBag._schedule();
    this.optionsBag._schedule();
  }

  // ---- change listeners (§9.6) ----

  addGlobalListener(fn) {
    this.globalListeners.add(fn);
    return () => this.globalListeners.delete(fn);
  }

  addPathListener(path, fn) {
    return this._addTo(this.exactListeners, path, fn);
  }

  addPrefixListener(prefix, fn) {
    return this._addTo(this.prefixListeners, prefix, fn);
  }

  _addTo(map, key, fn) {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) map.delete(key);
    };
  }

  _notify(path) {
    const call = (fn) => {
      try {
        fn(path);
      } catch (error) {
        this.logger.error(`Settings listener for "${path}" threw:`, error);
      }
    };
    for (const fn of [...this.globalListeners]) call(fn);
    if (!path) return;
    for (const fn of [...(this.exactListeners.get(path) ?? [])]) call(fn);
    for (const [prefix, set] of this.prefixListeners) {
      if (path === prefix || path.startsWith(prefix + ".") || prefix.startsWith(path + ".")) {
        for (const fn of [...set]) call(fn);
      }
    }
  }

  // ---- per-plugin raw access ----

  pluginData(name) {
    const plugins = this.pluginBag.data.plugins;
    if (!plugins[name] || typeof plugins[name] !== "object") plugins[name] = {};
    return plugins[name];
  }

  hasPluginData(name) {
    return Object.prototype.hasOwnProperty.call(this.pluginBag.data.plugins, name);
  }

  getEnabledSetting(name) {
    const value = this.pluginBag.data.plugins[name]?.enabled;
    return typeof value === "boolean" ? value : undefined;
  }

  setEnabledSetting(name, enabled) {
    this.pluginData(name);
    this.pluginBag.set(["plugins", name, "enabled"], !!enabled);
  }

  deletePluginData(name) {
    if (!this.hasPluginData(name)) return false;
    return this.pluginBag.set(["plugins", name], DELETE);
  }

  // ---- DefinedSettings binding ----

  /** Called by the host when a plugin with settings registers. */
  bind(pluginName, defined) {
    for (const [key, field] of Object.entries(defined.def)) {
      if (!field.optionKey) continue;
      const owner = this.optionOwners.get(field.optionKey);
      if (owner && owner.plugin !== pluginName) {
        throw new Error(`Option key "${field.optionKey}" is already owned by ${owner.plugin}`);
      }
      this.optionOwners.set(field.optionKey, { plugin: pluginName, key });
    }
    defined._bind(this, pluginName);
    this.defined.set(pluginName, defined);
  }

  /** Option-key ownership claimed by a plugin outside its settings definition (spec §19 `optionKeys`). */
  claimOptionKeys(pluginName, keys) {
    for (const optionKey of keys) {
      const owner = this.optionOwners.get(optionKey);
      if (owner && owner.plugin !== pluginName) {
        throw new Error(`Option key "${optionKey}" is already owned by ${owner.plugin}`);
      }
      if (!owner) this.optionOwners.set(optionKey, { plugin: pluginName, key: optionKey });
    }
  }
}

/**
 * definePluginSettings(def, checks?) — spec §9.1/§9.2.
 * A field may carry `optionKey` to keep its value in the legacy options bag.
 */
export function definePluginSettings(def, checks = {}) {
  const fields = {};
  for (const [key, field] of Object.entries(def)) {
    if (!field || typeof field !== "object" || !field.type) throw new TypeError(`Setting "${key}" needs a type`);
    if (field.type === "slider" && (field.min === undefined || field.max === undefined || field.default === undefined)) {
      throw new TypeError(`Slider setting "${key}" needs min, max and default`);
    }
    fields[key] = { ...field, ...(checks[key] || {}) };
  }

  let manager = null;
  let storeProxy = null;

  const defined = {
    def: fields,
    pluginName: undefined,

    _bind(m, name) {
      manager = m;
      defined.pluginName = name;
      storeProxy = null;
    },

    get store() {
      if (!manager) throw new Error("Plugin settings were read before the plugin was registered");
      if (!storeProxy) storeProxy = makeStore();
      return storeProxy;
    },

    get plain() {
      if (!manager) throw new Error("Plugin settings were read before the plugin was registered");
      return manager.pluginData(defined.pluginName);
    },

    /** Resolved default for a key (§9.3). */
    defaultFor(key) {
      const field = fields[key];
      if (!field) return undefined;
      if ("default" in field) return clone(typeof field.default === "function" ? field.default() : field.default);
      if (field.type === "select") return field.options?.find((o) => o.default)?.value;
      return undefined;
    },

    /** Validates then writes. Returns true, or the error message string. */
    trySet(key, value) {
      const field = fields[key];
      if (field?.isValid) {
        let verdict;
        try {
          verdict = field.isValid.call(defined.store, value);
        } catch (error) {
          verdict = String(error?.message || error);
        }
        if (verdict !== true && verdict !== undefined) return typeof verdict === "string" ? verdict : "Invalid value";
      }
      defined.store[key] = value;
      try {
        field?.onChange?.call(defined.store, value);
      } catch (error) {
        manager.logger.error(`onChange of ${defined.pluginName}.${key} threw:`, error);
      }
      if (field?.restartNeeded) manager.onRestartNeeded?.(defined.pluginName, key);
      return true;
    },

    isDisabled(key) {
      const fn = fields[key]?.disabled;
      if (typeof fn !== "function") return false;
      try {
        return !!fn.call(defined.store);
      } catch {
        return false;
      }
    },

    /** Resets every visible setting to its default; keeps `enabled`, custom and hidden values (§9.9). */
    reset() {
      for (const [key, field] of Object.entries(fields)) {
        if (!isVisibleSetting(field)) continue;
        if (field.optionKey) {
          const next = defined.defaultFor(key);
          if (next === undefined) manager.optionsBag.set([field.optionKey], DELETE);
          else manager.optionsBag.set([field.optionKey], next);
        } else {
          manager.pluginBag.set(["plugins", defined.pluginName, key], DELETE);
        }
      }
    },

    /** use(keys, rerender) — re-run `rerender` when given keys (or any) change. Returns unsubscribe. */
    use(keys, rerender) {
      if (typeof keys === "function") {
        rerender = keys;
        keys = null;
      }
      const base = `plugins.${defined.pluginName}`;
      if (!keys) return manager.addPrefixListener(base, () => rerender());
      const offs = keys.map((k) => manager.addPrefixListener(`${base}.${k}`, () => rerender()));
      return () => offs.forEach((off) => off());
    },

    withPrivateSettings() {
      return defined;
    },
  };

  function makeStore() {
    const name = defined.pluginName;
    const bag = manager.pluginBag;
    const opts = manager.optionsBag;
    return new Proxy(Object.create(null), {
      get(_, key) {
        if (typeof key !== "string") return undefined;
        const field = fields[key];
        if (field?.optionKey) {
          let value = opts.data[field.optionKey];
          if (value === undefined) {
            value = defined.defaultFor(key);
            if (value === undefined) return undefined;
            // Defaults for option-backed fields are not written back: options stay as the user left them.
            return value && typeof value === "object" ? value : value;
          }
          return value && typeof value === "object" ? opts.proxy(value, [field.optionKey]) : value;
        }
        const data = manager.pluginData(name);
        let value = data[key];
        if (value === undefined && field) {
          value = defined.defaultFor(key);
          if (value !== undefined) data[key] = value; // lazy write-back, no notification (§9.3)
        }
        return value && typeof value === "object" ? bag.proxy(value, ["plugins", name, key]) : value;
      },
      set(_, key, value) {
        if (typeof key !== "string") return false;
        const field = fields[key];
        if (field?.optionKey) opts.set([field.optionKey], value);
        else {
          manager.pluginData(name);
          bag.set(["plugins", name, key], value);
        }
        return true;
      },
      deleteProperty(_, key) {
        const field = fields[key];
        if (field?.optionKey) opts.set([field.optionKey], DELETE);
        else bag.set(["plugins", name, key], DELETE);
        return true;
      },
      has(_, key) {
        return key in fields || key in manager.pluginData(name);
      },
      ownKeys() {
        return [...new Set([...Object.keys(fields), ...Object.keys(manager.pluginData(name))])];
      },
      getOwnPropertyDescriptor(target, key) {
        return { configurable: true, enumerable: true, writable: true, value: this.get(target, key) };
      },
    });
  }

  return defined;
}
