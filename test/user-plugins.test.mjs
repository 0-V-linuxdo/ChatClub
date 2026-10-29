import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { definePlugin } from "../src/kernel/define.js";
import { parsePluginFile } from "../src/lib/user-plugin-format.js";
import { listForTab, tabsFor } from "../src/plugins/plugins-ui/app.js";
import { captureLogs, makeHost } from "./helpers.mjs";

let cap;
beforeEach(() => (cap = captureLogs()));
afterEach(() => cap.restore());

const p = (def) => definePlugin({ description: "d", authors: [], ...def });

const HEADER = (lines) => `// ==ChatClubPlugin==\n${lines.map((l) => `// ${l}`).join("\n")}\n// ==/ChatClubPlugin==\nchatclub.log("hi");\n`;

test("parsePluginFile reads the header, grants and per-language descriptions", () => {
  const { meta, errors } = parsePluginFile(HEADER(["@name WordCount", "@description:zh 字数", "@description:en Count", "@version 1.2.0", "@author A", "@grant ui composer", "@grant ui"]));
  assert.deepEqual(errors, []);
  assert.equal(meta.name, "WordCount");
  assert.deepEqual(meta.description, { zh: "字数", en: "Count" });
  assert.equal(meta.version, "1.2.0");
  assert.deepEqual(meta.grants, ["ui", "composer"]);
});

test("parsePluginFile reports a missing block, bad names and unknown grants", () => {
  assert.deepEqual(parsePluginFile("chatclub.log(1)").errors.map((e) => e.key), ["userPlugins.err.noHeader"]);
  const { errors } = parsePluginFile(HEADER(["@name word count", "@grant tabs"]));
  assert.deepEqual(errors.map((e) => e.key).sort(), ["userPlugins.err.badGrant", "userPlugins.err.badName", "userPlugins.err.noDescription"]);
  const plainDesc = parsePluginFile(HEADER(["@name Abc", "@description both"]));
  assert.deepEqual(plainDesc.meta.description, { zh: "both", en: "both" });
});

test("unregisterPlugin stops the plugin and forgets or keeps its settings", async () => {
  const log = [];
  const { host } = await makeHost({ plugins: [p({ name: "Base", enabledByDefault: true })] });
  const def = () => p({ name: "Dyn", enabledByDefault: false, app: { start: () => log.push("start"), stop: () => log.push("stop") } });
  assert.ok(host.registerPlugin(def()));
  await host.togglePlugin("Dyn");
  assert.equal(host.isStarted("Dyn"), true);
  assert.equal(await host.unregisterPlugin("Dyn", { keepData: true }), true);
  assert.deepEqual(log, ["start", "stop"]);
  assert.equal(host.plugins.Dyn, undefined);
  assert.ok(!host.order.includes("Dyn"));
  assert.equal(host.settings.getEnabledSetting("Dyn"), true);
  host.registerPlugin(def());
  assert.equal(host.isPluginEnabled("Dyn"), true);
  await host.unregisterPlugin("Dyn");
  assert.equal(host.settings.getEnabledSetting("Dyn"), undefined);
});

test("stored settings of dynamic plugins survive the orphan cleanup", async () => {
  const shared = { data: new Map(), listeners: new Set() };
  let { host } = await makeHost({ plugins: [p({ name: "Base" })], shared });
  host.registerPlugin(p({ name: "Dyn" }));
  await host.togglePlugin("Dyn");
  host.meta.dynamicPlugins = ["Dyn"];
  await host.settings.flush();
  ({ host } = await makeHost({ plugins: [p({ name: "Base" })], shared }));
  host.registerPlugin(p({ name: "Dyn" }));
  assert.equal(host.isPluginEnabled("Dyn"), true);
});

test("the User plugins tab appears only when a user plugin is registered", async () => {
  const { host } = await makeHost({ plugins: [p({ name: "Base", tags: ["developer"] })] });
  assert.ok(!tabsFor(host).includes("user"));
  assert.ok(tabsFor(host, ["user"]).includes("user"));
  host.registerPlugin(p({ name: "Mine", userPlugin: true }));
  assert.ok(tabsFor(host).includes("user"));
  assert.deepEqual(listForTab(host, "user").flat().map((x) => x.name), ["Mine"]);
});
