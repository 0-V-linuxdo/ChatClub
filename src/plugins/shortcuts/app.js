// Shortcuts: matches key presses (page and forwarded from chat frames) against `shortcut.action`
// contributions, using the per-platform config stored under "shortcutConfig" (v2 06 §2).

import { comboFromEvent, formatCombo, matchCombo, platformKey, isMac } from "./keys.js";
import { registerShortcutSettings } from "./settings.js";
import { ACTION_IDS, DIGIT_ACTIONS, defaultConfig, defaultProfile, migrateLegacyConfig, normalizeConfig, shortcutToCombo, comboToShortcut } from "./defaults.js";

const STORAGE_KEY = "shortcutConfig";

export default {
  async start(ctx) {
    const actions = ctx.extensionPoint("shortcut.action");
    const platform = platformKey();
    let config = defaultConfig();
    try {
      const raw = await ctx.storage.get(STORAGE_KEY);
      if (raw) {
        config = raw.schemaVersion === 2 ? normalizeConfig(raw) : migrateLegacyConfig(raw);
        if (raw.schemaVersion !== 2) await ctx.storage.set(STORAGE_KEY, config);
      }
    } catch (error) {
      ctx.logger.warn("Loading the shortcut config failed; using defaults:", error);
    }
    const changed = () => ctx.events.emit("Shortcuts:changed");
    ctx.storage.onChanged?.(STORAGE_KEY, (value) => {
      config = normalizeConfig(value);
      changed();
    });
    const save = async (next) => {
      config = normalizeConfig(next);
      changed();
      await ctx.storage.set(STORAGE_KEY, config);
    };
    const profile = (p = platform) => config.profiles[p];

    /** Combos for an action: the stored profile for known actions, else the contribution's defaults. */
    const bindingsFor = (actionId, p = platform) => {
      const stored = profile(p).shortcuts[actionId];
      if (stored) {
        const combo = shortcutToCombo(p, stored);
        return combo ? [combo] : [];
      }
      const entry = actions.get(actionId);
      const defaults = entry?.defaultBindings?.[p] ?? entry?.defaultBindings?.windows ?? [];
      return [].concat(defaults).filter(Boolean);
    };

    // Fixed table order first (first match wins, 06 §2.3), then actions from other plugins.
    // Plugins also declare their actions statically (`shortcutActions`), so pages where a plugin does
    // not run its app part, such as the options page, still list them for binding. Live contributions
    // win; a declared-only entry has no `run` and is never dispatched.
    const declaredEntries = () => ctx.host.order
      .filter((name) => ctx.host.isPluginEnabled(name))
      .flatMap((name) => (ctx.host.plugins[name].shortcutActions ?? []).map((a) => ({ ...a, pluginName: name })));
    const orderedEntries = () => {
      const live = actions.sorted();
      const ids = new Set(live.map((e) => e.id));
      const all = [...live, ...declaredEntries().filter((e) => !ids.has(e.id))];
      const rank = new Map(ACTION_IDS.map((id, i) => [id, i]));
      return all.map((e, i) => ({ e, r: rank.has(e.id) ? rank.get(e.id) : 1000 + i })).sort((a, b) => a.r - b.r).map((x) => x.e);
    };

    const find = (combo) => {
      for (const entry of orderedEntries()) {
        if (typeof entry.run !== "function") continue;
        for (const pattern of bindingsFor(entry.id)) {
          const match = matchCombo(pattern, combo);
          if (match) return { entry, match };
        }
      }
      return null;
    };

    const run = (entry, match, source) => {
      try {
        const result = entry.run?.(match, source);
        result?.catch?.((error) => ctx.logger.error(`Shortcut "${entry.id}" failed:`, error));
      } catch (error) {
        ctx.logger.error(`Shortcut "${entry.id}" failed:`, error);
      }
    };

    /** Returns true when the event was handled. */
    const handle = (eventLike, source = { kind: "page" }) => {
      if (eventLike.isComposing || eventLike.repeat) return false;
      const combo = comboFromEvent(eventLike);
      if (!combo) return false;
      if (!/^(Meta|Ctrl|Alt)\+/.test(combo)) return false; // plain keys never trigger global shortcuts
      if (platform === "windows" && combo.startsWith("Meta+")) return false;
      const hit = find(combo);
      if (!hit) return false;
      run(hit.entry, hit.match, source);
      return true;
    };

    const onKeydown = (event) => {
      if (!event.isTrusted) return;
      if (handle(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeydown, true);
    ctx.onDispose(() => window.removeEventListener("keydown", onKeydown, true));
    ctx.events.on("Frames:keydown", ({ event, frameKey }) => handle(event, { kind: "frame", frameKey }));
    ctx.onDispose(actions.subscribe(changed));

    const conflictWith = (p, actionId, sc) => {
      const combo = shortcutToCombo(p, sc);
      if (!combo) return null;
      for (const id of ACTION_IDS) {
        if (id === actionId) continue;
        if (shortcutToCombo(p, profile(p).shortcuts[id]) === combo) return id;
      }
      return null;
    };

    ctx.contribute("dataTransfer", {
      id: "shortcutConfig",
      labelKey: "shortcuts.transfer",
      check: (data) => ({ count: data && typeof data === "object" ? 1 : 0, warnings: [] }),
      export: async () => JSON.parse(JSON.stringify(config)),
      import: async (data) => save(data?.schemaVersion === 2 ? normalizeConfig(data) : migrateLegacyConfig(data)),
      reset: async () => save(defaultConfig()),
    });

    ctx.services.provide("shortcuts", {
      platform,
      labelFor(actionId) {
        if (!actions.has(actionId)) return "";
        const first = bindingsFor(actionId)[0];
        return first ? formatCombo(first.replace(/Digit$/, "Digit"), platform === "mac") : "";
      },
      bindingsFor: (actionId) => (actions.has(actionId) ? bindingsFor(actionId) : []),
      sendKeyMode: () => profile().sendKeyMode ?? "enter",
      isMac,
      format: (combo) => formatCombo(combo, platform === "mac"),
      handle,
      /** All active combos, for content scripts that forward shortcuts from chat frames. */
      activeCombos: () => orderedEntries().filter((e) => typeof e.run === "function").flatMap((e) => bindingsFor(e.id)),
      actionIds: () => orderedEntries().map((e) => e.id),
      entries: () => orderedEntries().map((e) => ({ id: e.id, labelKey: e.labelKey, icon: e.icon })),
      comboOf: (p, actionId) => {
        const sc = profile(p).shortcuts[actionId];
        return sc ? shortcutToCombo(p, { ...sc, disabled: false }) : bindingsFor(actionId, p)[0] ?? "";
      },
      isDisabled: (p, actionId) => !!profile(p).shortcuts[actionId]?.disabled,
      isDigit: (actionId) => DIGIT_ACTIONS.has(actionId),
      sendKeyModeOf: (p) => profile(p).sendKeyMode ?? "enter",
      getConfig: () => JSON.parse(JSON.stringify(config)),
      /** Saves a recorded combo; returns the id of a conflicting action instead of saving. */
      async setCombo(p, actionId, combo) {
        const sc = comboToShortcut(p, combo, { digit: DIGIT_ACTIONS.has(actionId) });
        const clash = conflictWith(p, actionId, sc);
        if (clash) return { ok: false, conflict: clash };
        const next = JSON.parse(JSON.stringify(config));
        next.profiles[p].shortcuts[actionId] = { ...sc, disabled: !!next.profiles[p].shortcuts[actionId]?.disabled };
        await save(next);
        return { ok: true };
      },
      async setDisabled(p, actionId, disabled) {
        const next = JSON.parse(JSON.stringify(config));
        const current = next.profiles[p].shortcuts[actionId];
        if (!current) return;
        if (!disabled) {
          const clash = conflictWith(p, actionId, { ...current, disabled: false });
          if (clash) return { ok: false, conflict: clash };
        }
        current.disabled = !!disabled;
        await save(next);
        return { ok: true };
      },
      async setSendKeyMode(p, value) {
        const next = JSON.parse(JSON.stringify(config));
        next.profiles[p].sendKeyMode = value === "mod-enter" ? "mod-enter" : "enter";
        await save(next);
      },
      async resetProfile(p) {
        const next = JSON.parse(JSON.stringify(config));
        next.profiles[p] = defaultProfile(p);
        await save(next);
      },
      async replaceConfig(raw) {
        await save(raw?.schemaVersion === 2 ? raw : migrateLegacyConfig(raw));
      },
    });
    registerShortcutSettings(ctx, ctx.services.get("shortcuts"));
  },
};
