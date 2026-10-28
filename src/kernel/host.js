// Plugin host: registry, enablement, lifecycle, dependencies, contributions, retries (spec §4–§8, §16).
// The kernel never imports business plugins; they are handed to it by the entry points.

import { Logger } from "./logger.js";
import { EventBus } from "./events.js";
import { ExtensionPointRegistry } from "./extension-points.js";
import { StyleRegistry } from "./styles.js";
import { StatePorts } from "./state-ports.js";
import { SettingsManager, definePluginSettings, isVisibleSetting, DELETE } from "./settings.js";
import { unmetRequirements } from "./environment.js";
import { createSettingsPlugin } from "./settings-plugin.js";

export const RETRY_WINDOW_MS = 15000;
export const RETRY_DEBOUNCE_MS = 200;
export const WORKSPACE_READY_FALLBACK_MS = 15000;
export const NEW_BADGE_MS = 2 * 24 * 60 * 60 * 1000;

const RESERVED_KEYS = new Set([
  "name", "description", "authors", "icon", "tags", "enabledByDefault", "required", "hidden", "dev",
  "requires", "dependencies", "optionalDependencies", "startAt", "requiresReload", "updatedAt", "settings",
  "managedStyle", "cleanupSelectors", "events", "stateSubscriptions", "contributes", "onSettingsChange",
  "app", "background", "content", "permissions", "storageKeys", "optionKeys", "provides",
  "usesExtensionPoints", "started", "isDependency",
]);

const BOUND = Symbol("chatclub.bound");
const NOT_DISPOSABLE = () => {};

export const FEATURE_DISABLED = "feature disabled";

export class PluginHost {
  /**
   * @param {object} options
   * @param {"app"|"background"} options.context
   * @param {object} options.adapter storage adapter (see storage-adapter.js)
   * @param {object} options.env requirement flags (see environment.js)
   * @param {Document} [options.doc]
   * @param {object} [options.messaging] { sendRuntime(message) → Promise<response> }
   */
  constructor({ context = "app", adapter, env = {}, doc = globalThis.document, messaging = null, isDev = false } = {}) {
    this.context = context;
    this.env = env;
    this.isDev = isDev;
    this.logger = new Logger("PluginHost", "#6d5dfc");
    this.events = new EventBus(new Logger("EventBus", "#6d5dfc"));
    this.extensionPoints = new ExtensionPointRegistry(new Logger("ExtensionPoints", "#6d5dfc"));
    this.styles = doc ? new StyleRegistry(doc) : null;
    this.statePorts = new StatePorts(new Logger("StatePorts", "#6d5dfc"));
    this.settings = new SettingsManager({ adapter, logger: new Logger("Settings", "#6d5dfc") });
    this.settings.onRestartNeeded = (plugin, key) => this.events.dispatch("reloadNeeded", { reason: `${plugin}.${key}` });
    this.messaging = messaging;
    this.doc = doc;

    this.plugins = {};
    this.order = [];
    this.providers = new Map(); // extension point id -> provider plugin name
    this.commandOwners = new Map(); // frame command -> { plugin, capability, spec }
    this.runtime = new Map(); // plugin name -> runtime record
    this.services = new Map();
    this.serviceWaiters = new Map();
    this.pendingMigrations = [];
    this.defaultPromotions = [];
    this.managerInitialized = false;
    this.phasesReached = new Set();
    this.workspaceReadyFired = false;
    this.retry = null;

    this.registerPlugin(createSettingsPlugin());
  }

  // ------------------------------------------------------------------ registry

  registerPlugin(def) {
    if (!def || typeof def.name !== "string") {
      this.logger.warn("Ignoring a plugin definition without a name:", def);
      return false;
    }
    if (this.plugins[def.name]) {
      this.logger.warn(`Plugin "${def.name}" is already registered; ignoring the second definition`);
      return false;
    }
    if (def.dev && !this.isDev) return false;
    try {
      if (def.settings) this.settings.bind(def.name, def.settings);
      if (Array.isArray(def.optionKeys)) this.settings.claimOptionKeys(def.name, def.optionKeys);
    } catch (error) {
      this.logger.error(`Registering plugin "${def.name}" failed:`, error);
      return false;
    }
    if (def.content?.length && def.requiresReload === undefined) def.requiresReload = true;
    def.started = false;
    def.isDependency = false;
    this.plugins[def.name] = def;
    this.order.push(def.name);
    for (const pointId of def.provides ?? []) {
      if (this.providers.has(pointId)) this.logger.warn(`Extension point "${pointId}" already provided by ${this.providers.get(pointId)}`);
      else this.providers.set(pointId, def.name);
    }
    for (const cap of def.content ?? []) {
      for (const [command, spec] of Object.entries(cap.commands ?? {})) {
        if (this.commandOwners.has(command)) {
          this.logger.warn(`Frame command "${command}" is declared by both ${this.commandOwners.get(command).plugin} and ${def.name}`);
          continue;
        }
        this.commandOwners.set(command, { plugin: def.name, capability: cap.id, spec: spec || {} });
      }
    }
    this.runtime.set(def.name, { started: false, starting: null, disposers: [], part: null, failed: false, ctx: null });
    return true;
  }

  registerPlugins(defs) {
    for (const def of defs) {
      try {
        this.registerPlugin(def);
      } catch (error) {
        this.logger.error(`Registering plugin "${def?.name}" failed:`, error);
      }
    }
  }

  _rt(name) {
    return this.runtime.get(name);
  }

  // ------------------------------------------------------------------ enablement (§6)

  unmetRequirements(name) {
    const plugin = this.plugins[name];
    return plugin ? unmetRequirements(plugin.requires, this.env) : [];
  }

  isPluginEnabled(name) {
    const plugin = this.plugins[name];
    if (!plugin) return false;
    if (this.unmetRequirements(name).length) return false;
    if (plugin.required || plugin.isDependency) return true;
    const stored = this.settings.getEnabledSetting(name);
    if (stored !== undefined) return stored;
    // A function decides from the saved options, so a setting that became a plugin keeps its old value.
    if (typeof plugin.enabledByDefault === "function") {
      try {
        return !!plugin.enabledByDefault(this.settings.optionsBag?.data ?? {});
      } catch {
        return false;
      }
    }
    return plugin.enabledByDefault === true;
  }

  isApiPlugin(name) {
    const plugin = this.plugins[name];
    return !!plugin && !plugin.required && (plugin.provides?.length ?? 0) > 0;
  }

  _markDependency(name, by) {
    const plugin = this.plugins[name];
    if (!plugin) return;
    if (!plugin.isDependency && !plugin.required) {
      plugin.isDependency = true;
      // API plugins are pulled in on demand each load; persisting them would keep them on forever (§11.3).
      if (!this.isApiPlugin(name)) this.settings.setEnabledSetting(name, true);
    }
    const rt = this._rt(name);
    if (rt) (rt.dependedBy ??= new Set()).add(by);
  }

  dependents(name) {
    return [...(this._rt(name)?.dependedBy ?? [])];
  }

  usedExtensionPoints(plugin) {
    return [...new Set([...Object.keys(plugin.contributes ?? {}), ...(plugin.usesExtensionPoints ?? [])])];
  }

  _apiProvidersFor(plugin) {
    const out = [];
    for (const pointId of this.usedExtensionPoints(plugin)) {
      const provider = this.providers.get(pointId);
      if (provider && provider !== plugin.name) out.push(provider);
    }
    return out;
  }

  // ------------------------------------------------------------------ settings & migrations (§9)

  async initSettings() {
    await this.settings.init();
    this.settings.onRemoteChange = () => this._onRemoteSettingsChange();
    for (const job of this.pendingMigrations.splice(0)) this._runMigration(job);
    // §6: the metadata plugin can never be stored as disabled.
    if (this.settings.getEnabledSetting("Settings") === false) this.settings.setEnabledSetting("Settings", true);
  }

  _queueMigration(job) {
    if (this.settings.ready) this._runMigration(job);
    else this.pendingMigrations.push(job);
  }

  _runMigration(job) {
    try {
      if (job()) this.settings.markAsChanged();
    } catch (error) {
      this.logger.error("Settings migration failed:", error);
    }
  }

  migratePluginSettings(newName, ...oldNames) {
    this._queueMigration(() => {
      const plugins = this.settings.plain.plugins;
      if (plugins[newName] !== undefined) return false;
      const from = oldNames.find((old) => plugins[old] !== undefined);
      if (!from) return false;
      plugins[newName] = plugins[from];
      delete plugins[from];
      this.logger.info(`Moved settings of "${from}" to "${newName}"`);
      return true;
    });
  }

  migratePluginSetting(pluginName, newKey, oldKey) {
    this._queueMigration(() => {
      const data = this.settings.plain.plugins[pluginName];
      if (!data || !(oldKey in data) || newKey in data) return false;
      data[newKey] = data[oldKey];
      delete data[oldKey];
      return true;
    });
  }

  migrateSettingsToPlugin(target, source, ...keys) {
    this._queueMigration(() => {
      const plugins = this.settings.plain.plugins;
      const src = plugins[source];
      if (!src) return false;
      let moved = false;
      for (const key of keys) {
        if (!(key in src)) continue;
        if (!plugins[target]) plugins[target] = { enabled: false };
        if (key in plugins[target]) continue;
        plugins[target][key] = src[key];
        delete src[key];
        moved = true;
      }
      return moved;
    });
  }

  addDefaultPromotion(flag, pluginName) {
    this.defaultPromotions.push({ flag, pluginName });
  }

  get meta() {
    return this.plugins.Settings.settings.store;
  }

  // ------------------------------------------------------------------ manager init (§7.3)

  initPluginManager() {
    if (this.managerInitialized) return;
    this.managerInitialized = true;
    const step = (label, fn) => {
      try {
        fn();
      } catch (error) {
        this.logger.error(`Plugin manager step "${label}" failed:`, error);
      }
    };

    step("orphans", () => {
      const stored = Object.keys(this.settings.plain.plugins);
      const orphans = stored.filter((name) => !this.plugins[name]);
      if (!orphans.length) return;
      for (const name of orphans) this.settings.deletePluginData(name);
      this.logger.info(`Removed stored settings of ${orphans.length} plugin(s) that no longer exist: ${orphans.join(", ")}`);
    });

    step("knownPlugins", () => {
      const known = { ...(this.meta.knownPlugins || {}) };
      let changed = false;
      const now = Date.now();
      for (const name of this.order) {
        const p = this.plugins[name];
        if (p.hidden || p.required || known[name]) continue;
        known[name] = now;
        changed = true;
      }
      if (changed) this.meta.knownPlugins = known;
    });

    step("defaultPromotions", () => {
      for (const { flag, pluginName } of this.defaultPromotions) {
        const flags = { ...(this.meta.migrationFlags || {}) };
        if (flags[flag]) continue;
        if (this.plugins[pluginName]) this.settings.setEnabledSetting(pluginName, true);
        flags[flag] = Date.now();
        this.meta.migrationFlags = flags;
      }
    });

    step("dependencies", () => this._lockDependencies());
    step("bindMethods", () => {
      for (const name of this.order) this._bindMethods(this.plugins[name]);
    });
  }

  /** Marks dependencies (and on-demand API plugins) of every enabled plugin, transitively. */
  _lockDependencies() {
    const visit = (name, seen) => {
      if (seen.has(name)) return;
      seen.add(name);
      const plugin = this.plugins[name];
      for (const dep of plugin.dependencies ?? []) {
        if (!this.plugins[dep]) {
          this.logger.warn(`Plugin "${name}" depends on "${dep}", which does not exist`);
          continue;
        }
        this._markDependency(dep, name);
        visit(dep, seen);
      }
      for (const dep of plugin.optionalDependencies ?? []) {
        if (this.plugins[dep] && !this.unmetRequirements(dep).length) {
          this._markDependency(dep, name);
          visit(dep, seen);
        }
      }
      for (const provider of this._apiProvidersFor(plugin)) {
        this._markDependency(provider, name);
        visit(provider, seen);
      }
    };
    const seen = new Set();
    for (const name of this.order) if (this.isPluginEnabled(name)) visit(name, seen);
  }

  _bindMethods(plugin, source = plugin) {
    for (const key of Object.keys(source)) {
      if (RESERVED_KEYS.has(key)) continue;
      const fn = source[key];
      if (typeof fn !== "function" || fn[BOUND]) continue;
      const bound = fn.bind(plugin);
      bound[BOUND] = true;
      plugin[key] = bound;
    }
  }

  // ------------------------------------------------------------------ lifecycle (§7.4–§7.6)

  async startPlugin(nameOrPlugin, options = {}) {
    const plugin = typeof nameOrPlugin === "string" ? this.plugins[nameOrPlugin] : nameOrPlugin;
    if (!plugin) {
      this.logger.warn(`Cannot start unknown plugin "${nameOrPlugin}"`);
      return false;
    }
    return this._start(plugin, [], options);
  }

  async _start(plugin, chain, { silent = false } = {}) {
    const rt = this._rt(plugin.name);
    if (rt.started) return true;
    if (rt.starting) {
      // A plugin reached again while its own start is in flight is a cycle only if it is on this chain.
      if (chain.includes(plugin.name)) return false;
      return rt.starting;
    }
    const unmet = this.unmetRequirements(plugin.name);
    if (unmet.length) {
      this.logger.warn(`Plugin "${plugin.name}" cannot run here (missing: ${unmet.join(", ")})`);
      return false;
    }
    rt.starting = this._doStart(plugin, [...chain, plugin.name], silent).finally(() => {
      rt.starting = null;
    });
    return rt.starting;
  }

  async _startDependencies(plugin, chain, silent) {
    const deps = [
      ...(plugin.dependencies ?? []).map((name) => ({ name, optional: false })),
      ...(plugin.optionalDependencies ?? []).map((name) => ({ name, optional: true })),
      ...this._apiProvidersFor(plugin).map((name) => ({ name, optional: false })),
    ];
    for (const { name, optional } of deps) {
      const dep = this.plugins[name];
      if (!dep) {
        if (optional) continue;
        this.logger.warn(`Plugin "${plugin.name}" depends on "${name}", which does not exist`);
        return false;
      }
      if (this._rt(name).started) continue;
      if (chain.includes(name)) {
        this.logger.error(`Circular dependency detected: ${[...chain, name].join(" → ")}`);
        return false;
      }
      if (this.unmetRequirements(name).length) {
        if (optional) continue;
        this.logger.warn(`Plugin "${plugin.name}" depends on "${name}", which cannot run here`);
        return false;
      }
      this._markDependency(name, plugin.name);
      const ok = await this._start(dep, chain, { silent });
      if (!ok) {
        if (optional) continue;
        this.logger.error(`Plugin "${plugin.name}" could not start because its dependency "${name}" failed to start`);
        return false;
      }
    }
    return true;
  }

  async _loadPart(plugin) {
    const rt = this._rt(plugin.name);
    if (rt.part) return rt.part;
    let part = plugin[this.context];
    if (typeof part === "function") {
      const mod = await part();
      part = mod?.default ?? mod;
    }
    part = part || {};
    if (part.methods) {
      for (const [key, fn] of Object.entries(part.methods)) {
        if (!(key in plugin) || !plugin[key]?.[BOUND]) plugin[key] = fn;
      }
      this._bindMethods(plugin, part.methods);
    }
    rt.part = part;
    return part;
  }

  async _doStart(plugin, chain, silent) {
    const rt = this._rt(plugin.name);
    rt.failed = false;
    if (!(await this._startDependencies(plugin, chain, silent))) {
      rt.failed = true;
      this.logger.error(`Plugin "${plugin.name}" failed to start`);
      this.events.dispatch("pluginError", { name: plugin.name, phase: "start", error: new Error("dependency failed") });
      return false;
    }
    if (!silent && !plugin.hidden) this.logger.info(`Starting plugin "${plugin.name}"`);
    const ctx = this._createCtx(plugin, rt);
    try {
      this._bindMethods(plugin);
      if (plugin.managedStyle && this.styles) {
        this.styles.register(plugin.name, plugin.managedStyle);
        this.styles.enable(plugin.name);
      }
      const part = await this._loadPart(plugin);
      if (typeof part.start === "function") await part.start(ctx);
      for (const [pointId, defs] of Object.entries(plugin.contributes ?? {})) {
        for (const def of Array.isArray(defs) ? defs : [defs]) ctx.contribute(pointId, def);
      }
      for (const [event, handler] of Object.entries(plugin.events ?? {})) {
        ctx.events.on(event, (data) => handler.call(plugin, data, ctx));
      }
      for (const [port, sub] of Object.entries(plugin.stateSubscriptions ?? {})) {
        const handler = typeof sub === "function" ? sub : sub.handler;
        ctx.state.subscribe(port, sub.selector ?? null, (cur, prev) => handler.call(plugin, cur, prev, ctx));
      }
      if (typeof plugin.onSettingsChange === "function") {
        const prefix = `plugins.${plugin.name}`;
        const off = this.settings.addPrefixListener(prefix, (path) => {
          if (path === `${prefix}.enabled`) return;
          plugin.onSettingsChange.call(plugin, path, ctx);
        });
        rt.disposers.push(off);
      }
    } catch (error) {
      this.logger.error(`Plugin "${plugin.name}" failed to start:`, error);
      this._dispose(plugin, rt, { keepStyle: false });
      rt.failed = true;
      this.events.dispatch("pluginError", { name: plugin.name, phase: "start", error });
      return false;
    }
    rt.started = true;
    plugin.started = true;
    return true;
  }

  async stopPlugin(nameOrPlugin) {
    const plugin = typeof nameOrPlugin === "string" ? this.plugins[nameOrPlugin] : nameOrPlugin;
    if (!plugin) return false;
    const rt = this._rt(plugin.name);
    if (rt.starting) await rt.starting.catch(() => {});
    if (!rt.started) return true;
    let ok = true;
    try {
      if (typeof rt.part?.stop === "function") await rt.part.stop(rt.ctx);
    } catch (error) {
      ok = false;
      this.logger.error(`Plugin "${plugin.name}" threw while stopping:`, error);
      this.events.dispatch("pluginError", { name: plugin.name, phase: "stop", error });
    }
    if (!this._dispose(plugin, rt, { keepStyle: !!plugin.requiresReload })) {
      ok = false;
      this.logger.error(`Some cleanup steps failed while stopping plugin "${plugin.name}"`);
    }
    rt.started = false;
    plugin.started = false;
    return ok;
  }

  /** Runs every collected disposer (reverse order), removes styles and cleanup selectors. */
  _dispose(plugin, rt, { keepStyle }) {
    let ok = true;
    const disposers = rt.disposers.splice(0).reverse();
    for (const fn of disposers) {
      try {
        fn();
      } catch (error) {
        ok = false;
        this.logger.error(`Cleanup of plugin "${plugin.name}" failed:`, error);
      }
    }
    if (plugin.managedStyle && this.styles && !keepStyle) {
      try {
        this.styles.disable(plugin.name);
      } catch (error) {
        ok = false;
        this.logger.error(`Removing styles of "${plugin.name}" failed:`, error);
      }
    }
    if (plugin.cleanupSelectors?.length && this.doc?.querySelectorAll) {
      for (const selector of plugin.cleanupSelectors) {
        try {
          this.doc.querySelectorAll(selector).forEach((node) => node.remove());
        } catch (error) {
          ok = false;
          this.logger.error(`Cleanup selector "${selector}" of "${plugin.name}" failed:`, error);
        }
      }
    }
    rt.ctx = null;
    return ok;
  }

  async togglePlugin(name) {
    const plugin = this.plugins[name];
    if (!plugin || plugin.required || plugin.isDependency) {
      return { toggled: false, enabled: this.isPluginEnabled(name), reloadNeeded: false };
    }
    const next = !this.isPluginEnabled(name);
    this.settings.setEnabledSetting(name, next);
    if (next) {
      for (const dep of [...(plugin.dependencies ?? []), ...this._apiProvidersFor(plugin)]) {
        if (this.plugins[dep]) this._markDependency(dep, name);
      }
      await this._start(plugin, [], { silent: true });
    } else {
      await this.stopPlugin(plugin);
    }
    this.events.dispatch("pluginToggle", { name, enabled: next });
    return { toggled: true, enabled: next, reloadNeeded: !!plugin.requiresReload };
  }

  isStarted(name) {
    return !!this._rt(name)?.started;
  }

  /** Enabled, not required, but not started — the "failed to start" state (§15.3). */
  hasFailed(name) {
    const rt = this._rt(name);
    return !!rt && rt.failed && !rt.started && this.isPluginEnabled(name);
  }

  // ------------------------------------------------------------------ phases (§7.1)

  /** Resolves once startPhase(phase) has finished starting every plugin of that phase. */
  whenPhaseDone(phase) {
    this._phaseWaiters ??= new Map();
    if (!this._phaseWaiters.has(phase)) {
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      this._phaseWaiters.set(phase, { promise, resolve });
    }
    return this._phaseWaiters.get(phase).promise;
  }

  async startPhase(phase, { silent = false } = {}) {
    this.phasesReached.add(phase);
    const failed = [];
    for (const name of this.order) {
      const plugin = this.plugins[name];
      if (this.context === "app" && (plugin.startAt ?? "init") !== phase) continue;
      if (!this.isPluginEnabled(name) || this._rt(name).started) continue;
      let ok = false;
      try {
        ok = await this._start(plugin, [], { silent });
      } catch (error) {
        this.logger.error(`Plugin "${name}" failed to start:`, error);
      }
      if (!ok) failed.push(name);
    }
    this.whenPhaseDone(phase);
    this._phaseWaiters.get(phase).resolve();
    return failed;
  }

  /** Workspace ready signal (or fallback timeout); fires once (§7.1 step ⑧). */
  async fireWorkspaceReady() {
    if (this.workspaceReadyFired) return;
    this.workspaceReadyFired = true;
    clearTimeout(this.workspaceReadyTimer);
    const failed = await this.startPhase("workspaceReady");
    if (failed.length) this._openRetryWindow(failed);
  }

  armWorkspaceReadyFallback(ms = WORKSPACE_READY_FALLBACK_MS) {
    clearTimeout(this.workspaceReadyTimer);
    this.workspaceReadyTimer = setTimeout(() => this.fireWorkspaceReady(), ms);
  }

  _openRetryWindow(names) {
    if (this.retry) {
      for (const n of names) this.retry.names.add(n);
      return;
    }
    const retry = { names: new Set(names), timer: null, debounce: null, offs: [] };
    this.retry = retry;
    const attempt = async () => {
      for (const name of [...retry.names]) {
        if (!this.isPluginEnabled(name) || this._rt(name).started) {
          retry.names.delete(name);
          continue;
        }
        if (await this._start(this.plugins[name], [], { silent: true })) retry.names.delete(name);
      }
      return retry.names.size === 0;
    };
    const finish = (allOk) => {
      clearTimeout(retry.timer);
      clearTimeout(retry.debounce);
      retry.offs.forEach((off) => off());
      this.retry = null;
      if (allOk) this.logger.info("Every plugin that failed during workspace start-up has now started");
      else {
        const left = [...retry.names];
        this.logger.warn(`${left.length} plugin(s) still failed to start after the retry window: ${left.join(", ")}`);
      }
    };
    const schedule = () => {
      clearTimeout(retry.debounce);
      retry.debounce = setTimeout(async () => {
        if (this.retry !== retry) return;
        if (await attempt()) finish(true);
      }, RETRY_DEBOUNCE_MS);
    };
    retry.offs.push(this.events.subscribe("frameRegistered", schedule));
    retry.offs.push(this.events.subscribe("configReloaded", schedule));
    retry.offs.push(this.extensionPoints.onAnyChange(schedule));
    retry.timer = setTimeout(async () => {
      if (this.retry !== retry) return;
      finish(await attempt());
    }, RETRY_WINDOW_MS);
  }

  /** Re-evaluates enablement after another context changed settings; starts/stops to match. */
  async _onRemoteSettingsChange() {
    for (const name of this.order) {
      const plugin = this.plugins[name];
      if (plugin.required) continue;
      const enabled = this.isPluginEnabled(name);
      const rt = this._rt(name);
      const phaseOk = this.context !== "app" || this.phasesReached.has(plugin.startAt ?? "init");
      if (enabled && !rt.started && !rt.failed && phaseOk) await this._start(plugin, [], { silent: true });
      else if (!enabled && rt.started) await this.stopPlugin(plugin);
    }
    this.events.dispatch("configReloaded");
  }

  // ------------------------------------------------------------------ services

  provideService(name, impl) {
    this.services.set(name, impl);
    for (const resolve of this.serviceWaiters.get(name) ?? []) resolve(impl);
    this.serviceWaiters.delete(name);
    return () => {
      if (this.services.get(name) === impl) this.services.delete(name);
    };
  }

  getService(name) {
    return this.services.get(name);
  }

  waitForService(name) {
    if (this.services.has(name)) return Promise.resolve(this.services.get(name));
    return new Promise((resolve) => {
      let list = this.serviceWaiters.get(name);
      if (!list) this.serviceWaiters.set(name, (list = []));
      list.push(resolve);
    });
  }

  // ------------------------------------------------------------------ contributions (§11)

  _contribute(plugin, pointId, def) {
    if (!def || typeof def !== "object") throw new TypeError(`${plugin.name}: contribution to "${pointId}" must be an object`);
    const provider = this.providers.get(pointId);
    if (provider && provider !== plugin.name && !this._rt(provider).started) {
      this._markDependency(provider, plugin.name);
      this._start(this.plugins[provider], [], { silent: true });
    }
    const id = def.id ?? plugin.name;
    const entry = { ...def, id, pluginName: plugin.name };
    return this.extensionPoints.get(pointId).set(id, entry);
  }

  // ------------------------------------------------------------------ frames & background (§13, §14)

  async sendFrameCommand(frameKey, command, payload, { asPlugin } = {}) {
    const owner = this.commandOwners.get(command);
    if (!owner) throw new Error(`Unknown frame command "${command}"`);
    if (asPlugin && owner.plugin !== asPlugin) {
      throw new Error(`Plugin "${asPlugin}" may not send "${command}"; it is declared by ${owner.plugin}`);
    }
    if (!this.isPluginEnabled(owner.plugin) || !this.isStarted(owner.plugin)) throw new Error(FEATURE_DISABLED);
    const transport = this.getService("frames.transport");
    if (!transport) throw new Error("Frame bridge is not available");
    return transport.send(frameKey, { capability: owner.capability, command, payload }, owner.spec);
  }

  async requestBackground(pluginName, action, payload) {
    if (!this.messaging) throw new Error("Background messaging is not available");
    const response = await this.messaging.sendRuntime({
      type: "chatclub.request",
      action: action.includes(".") ? action : `${pluginName}.${action}`,
      payload,
    });
    if (!response || response.ok !== true) throw new Error(response?.error || "No response from background");
    return response.result;
  }

  // ------------------------------------------------------------------ ctx (§7.7)

  _createCtx(plugin, rt) {
    const host = this;
    const add = (fn) => {
      if (typeof fn === "function" && fn !== NOT_DISPOSABLE) rt.disposers.push(fn);
      return fn;
    };
    const settingsStore = (() => {
      if (!plugin.settings) {
        plugin.settings = definePluginSettings({});
        this.settings.bind(plugin.name, plugin.settings);
      }
      return plugin.settings.store;
    })();
    const ctx = {
      plugin,
      host,
      context: this.context,
      settings: settingsStore,
      logger: new Logger(plugin.name),
      events: {
        on: (name, fn) => add(host.events.subscribe(name, fn)),
        emit: (name, data) => host.events.dispatch(name, data),
      },
      contribute: (pointId, def) => add(host._contribute(plugin, pointId, def)),
      extensionPoint: (pointId) => host.extensionPoints.get(pointId),
      state: {
        subscribe: (port, selector, handler) => add(host.statePorts.subscribe(port, selector, handler)),
        register: (name, port) => add(host.statePorts.register(name, port)),
        get: (name) => host.statePorts.getState(name),
      },
      styles: {
        register: (id, css) => {
          const key = `${plugin.name}:${id}`;
          host.styles?.register(key, css);
          host.styles?.enable(key);
          add(() => host.styles?.unregister(key));
        },
        enable: (id) => host.styles?.enable(`${plugin.name}:${id}`) ?? false,
        disable: (id) => host.styles?.disable(`${plugin.name}:${id}`) ?? false,
      },
      storage: createPluginStorage(this.settings.adapter, plugin, add),
      background: {
        request: (action, payload) => host.requestBackground(plugin.name, action, payload),
      },
      frames: {
        send: (frameKey, command, payload) => host.sendFrameCommand(frameKey, command, payload, { asPlugin: plugin.name }),
      },
      services: {
        provide: (name, impl) => add(host.provideService(name, impl)),
        get: (name) => host.getService(name),
        wait: (name) => host.waitForService(name),
      },
      ui: createUiFacade(host),
      onDispose: (fn) => add(fn),
      t: (key, vars) => host.t(key, vars),
      reportAnomaly: (record) => {
        try {
          host.getService("anomalies")?.report({ ...record });
        } catch (error) {
          ctx.logger.warn("Reporting an anomaly failed:", error);
        }
      },
    };
    rt.ctx = ctx;
    return ctx;
  }

  t(key, vars) {
    const i18n = this.getService("i18n");
    if (i18n) return i18n.t(key, vars);
    return String(key);
  }

  // ------------------------------------------------------------------ helpers for UI plugins

  visibleSettingKeys(name) {
    const def = this.plugins[name]?.settings?.def ?? {};
    return Object.keys(def).filter((key) => isVisibleSetting(def[key]));
  }

  isNew(name, now = Date.now()) {
    const seen = this.meta.knownPlugins?.[name];
    return typeof seen === "number" && now - seen < NEW_BADGE_MS;
  }
}

function createUiFacade(host) {
  const warnLogger = new Logger("UI", "#6d5dfc");
  const call = (method, fallback) => (...args) => {
    const ui = host.getService("ui");
    if (!ui || typeof ui[method] !== "function") {
      warnLogger.warn(`ui.${method}() called before the app shell was ready; ignored`);
      return fallback;
    }
    return ui[method](...args);
  };
  return {
    toast: call("toast", null),
    dismissToast: call("dismissToast"),
    showNotice: call("showNotice"),
    closeNotice: call("closeNotice"),
    openModal: call("openModal"),
    closeModal: call("closeModal"),
    closeAllModals: call("closeAllModals"),
    confirm: call("confirm", Promise.resolve(false)),
  };
}

function createPluginStorage(adapter, plugin, add) {
  const owned = new Set(plugin.storageKeys ?? []);
  const keyFor = (key) => (owned.has(key) ? key : `plugin:${plugin.name}:${key}`);
  return {
    keyFor,
    get: (key) => adapter.get(keyFor(key)),
    set: (key, value) => adapter.set(keyFor(key), value),
    remove: (key) => adapter.remove(keyFor(key)),
    onChanged(key, fn) {
      const full = keyFor(key);
      return add(adapter.onChanged?.((changes) => {
        if (changes[full]) fn(changes[full].newValue, changes[full].oldValue);
      }) ?? (() => {}));
    },
  };
}

export { DELETE };
