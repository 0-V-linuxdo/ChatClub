import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { definePlugin } from "../src/kernel/define.js";
import { definePluginSettings, REVISION_KEY } from "../src/kernel/settings.js";
import { decodeOptions, encodeOptions } from "../src/kernel/options-codec.js";
import { createMemoryStorageAdapter } from "../src/kernel/storage-adapter.js";
import { captureLogs, makeHost, tick } from "./helpers.mjs";

let cap;
beforeEach(() => (cap = captureLogs()));
afterEach(() => cap.restore());

test("v4 split: customs stay in the array, overrides and order move out, and come back", () => {
  const memory = {
    themeMode: "dark",
    summarySiteConfigs: [
      { id: "chatgpt", builtIn: true, enabled: false },
      { id: "custom-a", builtIn: false, sourceMode: "custom", name: "A", hosts: ["a.com"], customUserscript: "return []" },
      { id: "claude", builtIn: true, sourceMode: "custom", userscriptOverride: true, customUserscript: "return 1" },
    ],
    topicDeleteSiteConfigs: [
      { id: "gemini", builtIn: true },
      { id: "chatgpt", builtIn: true, timeoutMs: 20000, script: "api.click(api.qs('x'))" },
    ],
  };
  const stored = encodeOptions(memory);
  assert.equal(stored.optionsSchemaVersion, 4);
  assert.equal(stored.scriptConfigSchemaVersion, 3);
  assert.deepEqual(stored.summarySiteConfigs.map((c) => c.id), ["custom-a", "claude"]);
  assert.equal(stored.summarySiteConfigs[0].scriptType, "summary");
  assert.deepEqual(stored.officialOverrides["summary/chatgpt"], { enabled: false });
  assert.deepEqual(stored.officialOrders.summary, ["summary/chatgpt", "custom/summary/custom-a", "custom/summary/claude"]);
  assert.deepEqual(stored.officialOrders.delete, ["delete/gemini", "custom/delete/chatgpt"]);
  const del = stored.topicDeleteSiteConfigs[0];
  assert.equal(del.customUserscript, "api.click(api.qs('x'))");
  assert.equal(del.script, undefined);
  assert.equal(del.scriptType, "topic-delete");

  const back = decodeOptions(JSON.parse(JSON.stringify(stored)));
  assert.equal(back.optionsSchemaVersion, undefined);
  assert.equal(back.officialOrders, undefined);
  assert.deepEqual(back.summarySiteConfigs.map((c) => c.id), ["chatgpt", "custom-a", "claude"]);
  assert.equal(back.summarySiteConfigs[0].enabled, false);
  assert.equal(back.topicDeleteSiteConfigs[1].script, "api.click(api.qs('x'))");
  assert.equal(back.topicDeleteSiteConfigs[1].timeoutMs, 20000);
  assert.deepEqual(encodeOptions(back), stored, "encode ∘ decode is stable");
});

test("old inline userscripts: bundled copies are dropped, marked custom ones move to customUserscript", () => {
  const old = decodeOptions({
    summarySiteConfigs: [
      { id: "chatgpt", builtIn: true, userscript: "old bundled copy" },
      { id: "mine", builtIn: false, name: "M", hosts: ["m.com"], userscript: "return []" },
      { id: "kagi", builtIn: true, sourceMode: "custom", userscript: "return 2" },
    ],
    topicDeleteSiteConfigs: [{ id: "x", builtIn: false, name: "X", hosts: ["x.com"], userscript: "del()" }],
  });
  const [a, b, c] = old.summarySiteConfigs;
  assert.equal(a.userscript, undefined);
  assert.equal(a.customUserscript, undefined);
  assert.equal(a.sourceMode, "builtIn");
  assert.equal(b.customUserscript, "return []");
  assert.equal(c.customUserscript, "return 2");
  assert.equal(c.userscriptOverride, true);
  assert.equal(old.topicDeleteSiteConfigs[0].script, "del()");
  // A second pass over v3 data leaves scripts alone.
  assert.deepEqual(decodeOptions(encodeOptions(old)).summarySiteConfigs[1].customUserscript, "return []");
});

const owner = () =>
  definePlugin({
    name: "Owner",
    description: "d",
    authors: [],
    enabledByDefault: true,
    settings: definePluginSettings({
      a: { optionKey: "optA", type: "string", default: "" },
      b: { optionKey: "optB", type: "string", default: "" },
    }),
  });

test("options are written in the v4 shape with a revision", async () => {
  const plugin = owner();
  const { adapter } = await makeHost({ plugins: [plugin] });
  plugin.settings.store.a = "one";
  await tick(150);
  const stored = await adapter.get("options");
  assert.equal(stored.optA, "one");
  assert.equal(stored.optionsSchemaVersion, 4);
  assert.ok(stored[REVISION_KEY] >= 1);
});

test("CONFIG_REVISION_CONFLICT: a stale writer re-reads and merges instead of overwriting", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  const p1 = owner();
  const { host: h1 } = await makeHost({ plugins: [p1], shared });
  p1.settings.store.a = "first";
  await tick(150);
  // Another page writes optB behind this page's back (its change event is lost).
  const raw = createMemoryStorageAdapter({ data: shared.data, listeners: new Set() });
  const cur = await raw.get("options");
  await raw.set("options", { ...cur, optB: "theirs", [REVISION_KEY]: cur[REVISION_KEY] + 1 });
  p1.settings.store.a = "second";
  await h1.settings.flush();
  const stored = await raw.get("options");
  assert.equal(stored.optA, "second");
  assert.equal(stored.optB, "theirs", "the other page's write survives");
  assert.equal(stored[REVISION_KEY], cur[REVISION_KEY] + 2);
  assert.equal(p1.settings.store.b, "theirs");
});
