import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { definePlugin } from "../src/kernel/define.js";
import { definePluginSettings } from "../src/kernel/settings.js";
import { createMemoryStorageAdapter } from "../src/kernel/storage-adapter.js";
import { PluginHost } from "../src/kernel/host.js";
import { captureLogs, makeHost, tick, makeDom } from "./helpers.mjs";

let cap;
beforeEach(() => (cap = captureLogs()));
afterEach(() => cap.restore());

const p = (def) => definePlugin({ description: "d", authors: [], ...def });

test("duplicate registration keeps the first and warns (AC-03)", async () => {
  const a = p({ name: "Alpha", marker: 1 });
  const b = p({ name: "Alpha", marker: 2 });
  const { host } = await makeHost({ plugins: [a, b] });
  assert.equal(host.plugins.Alpha.marker, 1);
  assert.ok(cap.has("warn", /already registered/));
});

test("enable order: requires > required/dependency > stored > default (AC-04)", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  const plugins = () => [
    p({ name: "Def", enabledByDefault: true }),
    p({ name: "Req", required: true }),
    p({ name: "Ff", required: true, requires: ["firefox"] }),
  ];
  let { host, adapter } = await makeHost({ plugins: plugins(), shared });
  assert.equal(host.isPluginEnabled("Def"), true);
  assert.equal(host.isPluginEnabled("Req"), true);
  assert.equal(host.isPluginEnabled("Ff"), false);
  assert.equal(host.isPluginEnabled("Nope"), false);
  host.settings.setEnabledSetting("Def", false);
  await host.settings.flush();
  ({ host } = await makeHost({ plugins: plugins(), shared }));
  assert.equal(host.isPluginEnabled("Def"), false);
  delete host.settings.store.plugins.Def.enabled;
  assert.equal(host.isPluginEnabled("Def"), true);
});

test("required and dependency plugins cannot be toggled (AC-05)", async () => {
  const { host } = await makeHost({
    plugins: [p({ name: "Core", required: true }), p({ name: "Lib" }), p({ name: "User", enabledByDefault: true, dependencies: ["Lib"] })],
  });
  await host.startPhase("init");
  assert.deepEqual(await host.togglePlugin("Core"), { toggled: false, enabled: true, reloadNeeded: false });
  assert.equal(host.plugins.Lib.isDependency, true);
  assert.equal((await host.togglePlugin("Lib")).toggled, false);
  assert.equal(host.settings.getEnabledSetting("Lib"), true);
});

test("phases start in order (AC-07)", async () => {
  const order = [];
  const mk = (name, startAt) => p({ name, startAt, enabledByDefault: true, app: { start: () => order.push(name) } });
  const { host } = await makeHost({ plugins: [mk("W", "workspaceReady"), mk("D", "domReady"), mk("I", "init")] });
  await host.startPhase("init");
  await host.startPhase("domReady");
  await host.fireWorkspaceReady();
  assert.deepEqual(order, ["I", "D", "W"]);
});

test("failed start rolls back contributions, styles and subscriptions (AC-08)", async () => {
  const dom = makeDom();
  let eventCalls = 0;
  const failing = p({
    name: "DevFailingPlugin",
    dev: true,
    enabledByDefault: true,
    managedStyle: ".x{color:red}",
    app: {
      start(ctx) {
        ctx.contribute("topbar.item", { id: "devFailing", labelKey: "x" });
        ctx.styles.register("extra", ".y{}");
        ctx.events.on("ping", () => eventCalls++);
        throw new Error("boom");
      },
    },
  });
  const ok = p({ name: "Fine", enabledByDefault: true, app: { start: () => {} } });
  const { host } = await makeHost({ plugins: [failing, ok], doc: dom.document });
  await host.startPhase("init");
  assert.equal(host.isStarted("DevFailingPlugin"), false);
  assert.equal(host.isStarted("Fine"), true);
  assert.equal(host.hasFailed("DevFailingPlugin"), true);
  assert.equal(host.extensionPoints.get("topbar.item").has("devFailing"), false);
  assert.equal(host.styles.isEnabled("DevFailingPlugin"), false);
  assert.equal(host.styles.has("DevFailingPlugin:extra"), false);
  host.events.dispatch("ping");
  assert.equal(eventCalls, 0);
  assert.ok(cap.has("error", /DevFailingPlugin.*failed to start/));
});

test("retry window: success logs once all recover (AC-09)", async () => {
  let ready = false;
  const flaky = p({
    name: "Flaky",
    enabledByDefault: true,
    startAt: "workspaceReady",
    app: { start() { if (!ready) throw new Error("not yet"); } },
  });
  const { host } = await makeHost({ plugins: [flaky] });
  await host.fireWorkspaceReady();
  assert.equal(host.isStarted("Flaky"), false);
  ready = true;
  host.events.dispatch("frameRegistered", { frameKey: "f1" });
  await tick(600);
  assert.equal(host.isStarted("Flaky"), true);
  assert.ok(cap.has("info", /now started/));
});

test("retry window: summary warning lists failures when time runs out (AC-09)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const never = p({ name: "Never", enabledByDefault: true, startAt: "workspaceReady", app: { start() { throw new Error("no"); } } });
  const { host } = await makeHost({ plugins: [never] });
  await host.fireWorkspaceReady();
  t.mock.timers.tick(15000);
  t.mock.timers.reset();
  await tick(10);
  assert.ok(cap.has("warn", /1 plugin\(s\) still failed.*Never/));
});

test("stop disposes everything registered through ctx (AC-10)", async () => {
  const dom = makeDom();
  let calls = 0;
  let stateCalls = 0;
  const plugin = p({
    name: "Tidy",
    enabledByDefault: true,
    managedStyle: ".t{}",
    cleanupSelectors: [".tidy-node"],
    app: {
      start(ctx) {
        ctx.events.on("ping", () => calls++);
        ctx.contribute("topbar.item", { id: "tidy" });
        ctx.styles.register("s", ".u{}");
        ctx.state.subscribe("demo", (s) => s.n, () => stateCalls++);
        const node = dom.document.createElement("div");
        node.className = "tidy-node";
        dom.document.body.append(node);
      },
    },
  });
  const { host } = await makeHost({ plugins: [plugin], doc: dom.document });
  let state = { n: 1 };
  const listeners = new Set();
  host.statePorts.register("demo", { getState: () => state, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)) });
  await host.startPhase("init");
  assert.equal(host.extensionPoints.get("topbar.item").has("tidy"), true);
  const result = await host.togglePlugin("Tidy");
  assert.equal(result.enabled, false);
  host.events.dispatch("ping");
  state = { n: 2 };
  listeners.forEach((fn) => fn());
  assert.equal(calls, 0);
  assert.equal(stateCalls, 0);
  assert.equal(host.extensionPoints.get("topbar.item").has("tidy"), false);
  assert.equal(host.styles.isEnabled("Tidy"), false);
  assert.equal(host.styles.has("Tidy:s"), false);
  assert.equal(dom.document.querySelectorAll(".tidy-node").length, 0);
});

test("methods are bound once to the plugin (AC-11), including methods from a lazy part", async () => {
  const plugin = p({
    name: "Summaryish",
    enabledByDefault: true,
    label: "me",
    getLabel() {
      return this.label;
    },
    app: async () => ({ default: { methods: { getUpper() { return this.label.toUpperCase(); } } } }),
  });
  const { host } = await makeHost({ plugins: [plugin] });
  await host.startPhase("init");
  const f = host.plugins.Summaryish.getLabel;
  const g = host.plugins.Summaryish.getUpper;
  assert.equal(f(), "me");
  assert.equal(g(), "ME");
  const first = host.plugins.Summaryish.getLabel;
  host._bindMethods(host.plugins.Summaryish);
  assert.equal(host.plugins.Summaryish.getLabel, first);
});

test("dependencies: auto start, missing, cycles (AC-13..15)", async () => {
  const { host } = await makeHost({
    plugins: [
      p({ name: "Base" }),
      p({ name: "Uses", enabledByDefault: true, dependencies: ["Base"] }),
      p({ name: "Missing", enabledByDefault: true, dependencies: ["Ghost"] }),
      p({ name: "CycA", enabledByDefault: true, dependencies: ["CycB"] }),
      p({ name: "CycB", enabledByDefault: true, dependencies: ["CycA"] }),
      p({ name: "Other", enabledByDefault: true }),
    ],
  });
  await host.startPhase("init");
  assert.equal(host.isStarted("Base"), true);
  assert.equal(host.plugins.Base.isDependency, true);
  assert.deepEqual(host.dependents("Base"), ["Uses"]);
  assert.equal(host.isStarted("Missing"), false);
  assert.ok(cap.has("warn", /depends on "Ghost"/));
  assert.equal(host.isStarted("CycA"), false);
  assert.equal(host.isStarted("CycB"), false);
  assert.ok(cap.has("error", /Circular dependency detected: CycA → CycB → CycA/));
  assert.equal(host.isStarted("Other"), true);
});

test("API plugins start only on demand (AC-16)", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  const defs = (userEnabled) => [
    p({ name: "MenuAPI", hidden: true, provides: ["tab.contextMenu"] }),
    p({ name: "MenuUser", enabledByDefault: userEnabled, contributes: { "tab.contextMenu": { id: "close" } } }),
  ];
  let { host } = await makeHost({ plugins: defs(false), shared });
  await host.startPhase("init");
  assert.equal(host.isStarted("MenuAPI"), false);
  await host.togglePlugin("MenuUser");
  assert.equal(host.isStarted("MenuAPI"), true);
  assert.equal(host.extensionPoints.get("tab.contextMenu").has("close"), true);
  await host.settings.flush();
  // API plugin enablement is never persisted.
  assert.equal(host.settings.getEnabledSetting("MenuAPI"), undefined);
});

test("events: one throwing listener does not block others (AC-26, AC-27)", async () => {
  const { host } = await makeHost({ plugins: [p({ name: "Tog" })] });
  const got = [];
  host.events.subscribe("pluginToggle", () => {
    throw new Error("bad");
  });
  host.events.subscribe("pluginToggle", (d) => got.push(d));
  await host.togglePlugin("Tog");
  assert.deepEqual(got, [{ name: "Tog", enabled: true }]);
  assert.ok(cap.has("error", /pluginToggle/));
});

test("state ports: selector filtering and late registration (AC-28, AC-29)", async () => {
  const { host } = await makeHost();
  const seen = [];
  host.statePorts.subscribe("late", (s) => s.a, (cur, prev) => seen.push([cur, prev]));
  let state = { a: 1, b: 1 };
  const ls = new Set();
  const fire = () => ls.forEach((fn) => fn());
  host.statePorts.register("late", { getState: () => state, subscribe: (fn) => (ls.add(fn), () => ls.delete(fn)) });
  state = { a: 1, b: 2 };
  fire();
  state = { a: 2, b: 2 };
  fire();
  assert.deepEqual(seen, [[2, 1]]);
});

test("orphan settings are removed with a log (AC-24)", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  shared.data.set("pluginSettings", { plugins: { Ghosty: { enabled: true }, Real: { enabled: false } } });
  const { host } = await makeHost({ plugins: [p({ name: "Real" })], shared });
  assert.equal(host.settings.hasPluginData("Ghosty"), false);
  assert.equal(host.settings.hasPluginData("Real"), true);
  assert.ok(cap.has("info", /Ghosty/));
});

test("migration tools move settings once (AC-25)", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  shared.data.set("pluginSettings", { plugins: { OldName: { enabled: true, a: 1 }, Src: { k1: "v", k2: "w" }, Keys: { oldKey: 5 } } });
  const adapter = createMemoryStorageAdapter(shared);
  const host = new PluginHost({ adapter, env: {}, doc: null });
  host.registerPlugins([p({ name: "NewName" }), p({ name: "Src" }), p({ name: "Dst" }), p({ name: "Keys" })]);
  host.migratePluginSettings("NewName", "OldName");
  host.migrateSettingsToPlugin("Dst", "Src", "k1");
  host.migratePluginSetting("Keys", "newKey", "oldKey");
  await host.initSettings();
  const plugins = host.settings.plain.plugins;
  assert.deepEqual(plugins.NewName, { enabled: true, a: 1 });
  assert.equal(plugins.OldName, undefined);
  assert.deepEqual(plugins.Dst, { enabled: false, k1: "v" });
  assert.deepEqual(plugins.Src, { k2: "w" });
  assert.deepEqual(plugins.Keys, { newKey: 5 });
  // idempotent
  host.migratePluginSettings("NewName", "OldName");
  host.migrateSettingsToPlugin("Dst", "Src", "k1");
  assert.deepEqual(plugins.Dst, { enabled: false, k1: "v" });
});

test("frame commands: only own declared commands, disabled plugins fail (AC-36, AC-39)", async () => {
  const owner = p({ name: "Nav", enabledByDefault: true, content: [{ id: "nav", bundle: "x.js", commands: { setNav: { timeoutMs: 100 } } }] });
  const thief = p({ name: "Thief", enabledByDefault: true });
  const { host } = await makeHost({ plugins: [owner, thief] });
  const sent = [];
  host.provideService("frames.transport", { send: async (key, msg) => (sent.push([key, msg]), "ok") });
  await host.startPhase("init");
  assert.equal(owner.requiresReload, true);
  assert.equal(await host.rt?.ctx, undefined);
  const navCtx = host._rt("Nav").ctx;
  const thiefCtx = host._rt("Thief").ctx;
  assert.equal(await navCtx.frames.send("f1", "setNav", { on: true }), "ok");
  await assert.rejects(thiefCtx.frames.send("f1", "setNav"), /may not send/);
  await host.togglePlugin("Nav");
  await assert.rejects(host.sendFrameCommand("f1", "setNav"), /feature disabled/);
  assert.equal(sent.length, 1);
});

test("toast before shell ready warns and does not throw (AC-34)", async () => {
  const { host } = await makeHost({ plugins: [p({ name: "Early", enabledByDefault: true })] });
  await host.startPhase("init");
  const ctx = host._rt("Early").ctx;
  assert.equal(ctx.ui.toast("hi"), null);
  assert.ok(cap.has("warn", /before the app shell was ready/));
});

test("pluginError is broadcast on start failure", async () => {
  const { host } = await makeHost({ plugins: [p({ name: "Bad", enabledByDefault: true, app: { start() { throw new Error("x"); } } })] });
  const errors = [];
  host.events.subscribe("pluginError", (e) => errors.push(e));
  await host.startPhase("init");
  assert.equal(errors[0].name, "Bad");
  assert.equal(errors[0].phase, "start");
});

test("Settings metadata plugin is restored when stored disabled", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  shared.data.set("pluginSettings", { plugins: { Settings: { enabled: false } } });
  const { host } = await makeHost({ shared });
  assert.equal(host.settings.getEnabledSetting("Settings"), true);
});

test("knownPlugins records first-seen time for visible plugins (new badge)", async () => {
  const { host } = await makeHost({ plugins: [p({ name: "Visible" }), p({ name: "Hid", hidden: true })] });
  assert.equal(typeof host.meta.knownPlugins.Visible, "number");
  assert.equal(host.meta.knownPlugins.Hid, undefined);
  assert.equal(host.isNew("Visible"), true);
  assert.equal(host.isNew("Visible", Date.now() + 3 * 86400000), false);
});

test("onSettingsChange fires for own keys", async () => {
  const changes = [];
  const plugin = p({
    name: "Watcher",
    enabledByDefault: true,
    settings: definePluginSettings({ size: { type: "number", default: 3 } }),
    onSettingsChange(path) {
      changes.push(path);
    },
  });
  const { host } = await makeHost({ plugins: [plugin] });
  await host.startPhase("init");
  plugin.settings.store.size = 4;
  assert.deepEqual(changes, ["plugins.Watcher.size"]);
});
