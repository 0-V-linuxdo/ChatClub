import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { definePlugin } from "../src/kernel/define.js";
import { definePluginSettings, parseStoredJson, diffPaths } from "../src/kernel/settings.js";
import { StyleRegistry } from "../src/kernel/styles.js";
import { ExtensionPoint } from "../src/kernel/extension-points.js";
import { captureLogs, makeHost, tick, makeDom } from "./helpers.mjs";

let cap;
beforeEach(() => (cap = captureLogs()));
afterEach(() => cap.restore());

const withSettings = (name, fields, extra = {}) =>
  definePlugin({ name, description: "d", authors: [], enabledByDefault: true, settings: definePluginSettings(fields), ...extra });

test("defaults resolve lazily; select falls back to default:true option (AC-18)", async () => {
  const plugin = withSettings("Defs", {
    count: { type: "number", default: 7 },
    mode: { type: "select", options: [{ label: "A", value: "a" }, { label: "B", value: "b", default: true }] },
    free: { type: "string" },
  });
  const { host } = await makeHost({ plugins: [plugin] });
  assert.equal(plugin.settings.store.count, 7);
  assert.equal(plugin.settings.store.mode, "b");
  assert.equal(plugin.settings.store.free, undefined);
  assert.equal(host.settings.plain.plugins.Defs.count, 7);
});

test("store access before registration throws", () => {
  const s = definePluginSettings({ a: { type: "string" } });
  assert.throws(() => s.store.a);
});

test("writes persist within 100ms and empty plugins never persist (AC-19)", async () => {
  const plugin = withSettings("Persist", { v: { type: "string", default: "x" } });
  const { host, adapter } = await makeHost({ plugins: [plugin] });
  plugin.settings.store.v = "y";
  await tick(150);
  const stored = await adapter.get("pluginSettings");
  assert.equal(stored.plugins.Persist.v, "y");

  const { adapter: emptyAdapter } = await makeHost();
  await tick(150);
  // Settings namespace exists (knownPlugins) only when there are plugins to remember; an empty bag is never written.
  const raw = await emptyAdapter.get("pluginSettings");
  assert.ok(raw === undefined || Object.keys(raw.plugins).length > 0);
});

test("option-backed settings read/write the legacy options bag (spec §19)", async () => {
  const shared = { data: new Map([["options", { themeMode: "dark" }]]), listeners: new Set() };
  const plugin = withSettings("Look", {
    themeMode: { type: "select", optionKey: "themeMode", options: [{ label: "L", value: "light", default: true }, { label: "D", value: "dark" }] },
    primaryColor: { type: "string", optionKey: "primaryColor", default: "#6d5dfc" },
  });
  const { host, adapter } = await makeHost({ plugins: [plugin], shared });
  const changes = [];
  host.settings.addPrefixListener("plugins.Look", (path) => changes.push(path));
  assert.equal(plugin.settings.store.themeMode, "dark");
  assert.equal(plugin.settings.store.primaryColor, "#6d5dfc");
  plugin.settings.store.themeMode = "light";
  assert.deepEqual(changes, ["plugins.Look.themeMode"]);
  await tick(150);
  assert.equal((await adapter.get("options")).themeMode, "light");
  assert.equal((await adapter.get("pluginSettings")).plugins.Look?.themeMode, undefined);
  plugin.settings.reset();
  assert.equal(host.settings.optionsPlain.themeMode, "light");
  assert.equal(plugin.settings.store.themeMode, "light");
});

test("an option key can only have one owner", async () => {
  const a = withSettings("OwnA", { x: { type: "string", optionKey: "shared" } });
  const b = withSettings("OwnB", { y: { type: "string", optionKey: "shared" } });
  const { host } = await makeHost({ plugins: [a, b] });
  assert.ok(host.plugins.OwnA);
  assert.equal(host.plugins.OwnB, undefined);
  assert.ok(cap.has("error", /already owned/));
});

test("other contexts get changes without writing back (AC-20)", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  const mk = () => withSettings("Sync", { v: { type: "string", default: "a" } });
  const one = mk();
  const two = mk();
  const { host: h1 } = await makeHost({ plugins: [one], shared });
  const { host: h2 } = await makeHost({ plugins: [two], shared });
  await tick(150);
  let writes = 0;
  const origSet = h2.settings.adapter.set;
  h2.settings.adapter.set = async (...args) => (writes++, origSet(...args));
  const seen = [];
  h2.settings.addPathListener("plugins.Sync.v", (path) => seen.push(path));
  one.settings.store.v = "changed";
  await tick(200);
  assert.equal(two.settings.store.v, "changed");
  assert.deepEqual(seen, ["plugins.Sync.v"]);
  await tick(200);
  assert.equal(writes, 0);
  void h1;
});

test("isValid blocks writes; disabled() reflects other settings (AC-21)", async () => {
  const plugin = withSettings("Valid", {
    on: { type: "boolean", default: false },
    name: {
      type: "string",
      default: "ok",
      isValid: (v) => (v.length > 2 ? true : "too short"),
      disabled() {
        return !this.on;
      },
    },
  });
  await makeHost({ plugins: [plugin] });
  assert.equal(plugin.settings.trySet("name", "no"), "too short");
  assert.equal(plugin.settings.store.name, "ok");
  assert.equal(plugin.settings.isDisabled("name"), true);
  plugin.settings.store.on = true;
  assert.equal(plugin.settings.isDisabled("name"), false);
  assert.equal(plugin.settings.trySet("name", "long"), true);
});

test("restartNeeded broadcasts reloadNeeded (AC-22)", async () => {
  const plugin = withSettings("Restart", { x: { type: "boolean", default: false, restartNeeded: true } });
  const { host } = await makeHost({ plugins: [plugin] });
  const events = [];
  host.events.subscribe("reloadNeeded", (e) => events.push(e));
  plugin.settings.trySet("x", true);
  assert.equal(events.length, 1);
});

test("reset keeps enabled and custom values (AC-23)", async () => {
  const plugin = withSettings("Resettable", {
    a: { type: "string", default: "A" },
    secret: { type: "custom", default: 1 },
    h: { type: "string", hidden: true, default: "H" },
  });
  const { host } = await makeHost({ plugins: [plugin] });
  host.settings.setEnabledSetting("Resettable", false);
  plugin.settings.store.a = "changed";
  plugin.settings.store.secret = 2;
  plugin.settings.store.h = "kept";
  plugin.settings.reset();
  assert.equal(plugin.settings.store.a, "A");
  assert.equal(plugin.settings.store.secret, 2);
  assert.equal(plugin.settings.store.h, "kept");
  assert.equal(host.settings.getEnabledSetting("Resettable"), false);
});

test("nested writes through the store notify the full path", async () => {
  const plugin = withSettings("Nested", { map: { type: "custom", default: {} } });
  const { host } = await makeHost({ plugins: [plugin] });
  const paths = [];
  host.settings.addGlobalListener((path) => paths.push(path));
  plugin.settings.store.map.inner = 1;
  plugin.settings.store.map.inner = 1;
  delete plugin.settings.store.map.inner;
  assert.deepEqual(paths, ["plugins.Nested.map.inner", "plugins.Nested.map.inner"]);
});

test("parseStoredJson accepts objects, JSON and double-encoded JSON", () => {
  assert.deepEqual(parseStoredJson({ a: 1 }), { a: 1 });
  assert.deepEqual(parseStoredJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseStoredJson(JSON.stringify('{"a":1}')), { a: 1 });
  assert.equal(parseStoredJson("{bad"), null);
  assert.deepEqual(diffPaths({ a: { b: 1 } }, { a: { b: 2, c: 3 } }), ["a.b", "a.c"]);
});

test("style registry rebuilds its container and keeps enable state", () => {
  const dom = makeDom();
  const styles = new StyleRegistry(dom.document);
  styles.register("one", ".a{}");
  styles.register("two", ".b{}");
  styles.disable("two");
  dom.document.getElementById("chatclub-plugin-styles").remove();
  styles.register("one", ".a{color:red}");
  const nodes = dom.document.querySelectorAll("#chatclub-plugin-styles style");
  assert.equal(nodes.length, 2);
  assert.equal([...nodes].find((n) => n.dataset.chatclubStyle === "two").disabled, true);
  assert.equal(styles.enable("missing"), false);
});

test("extension point sort by order then id", () => {
  const point = new ExtensionPoint("x");
  point.set("b", { order: 1 });
  point.set("a", { order: 1 });
  point.set("c", { order: 0 });
  assert.deepEqual(point.sorted().map((e) => e.id), ["c", "a", "b"]);
  let n = 0;
  point.subscribe(() => n++);
  assert.equal(point.delete("zzz"), false);
  assert.equal(point.delete("a"), true);
  assert.equal(n, 1);
});
