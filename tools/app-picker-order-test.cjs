#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    APP_PICKER_AGGREGATOR_IDS,
    APP_PICKER_CHINESE_IDS,
    APP_PICKER_INTERNATIONAL_IDS,
    APP_PICKER_SECTION_IDS,
    applyStoredOrder,
    moveOrderedIds,
    normalizeAppPickerAppOrders,
    normalizeAppPickerSectionOrder
  } = await import(pathToFileURL(path.join(root, "shared/app-picker-order.js")).href);
  const { buildAppPickerSections } = await import(pathToFileURL(path.join(root, "app/workspace/app-picker.js")).href);
  const { t, setLanguage } = await import(pathToFileURL(path.join(root, "shared/i18n.js")).href);

  assert.deepEqual([...APP_PICKER_SECTION_IDS], ["custom", "international", "aggregator", "chinese"]);
  assert.ok(APP_PICKER_INTERNATIONAL_IDS.includes("KimiAI"));
  assert.ok(APP_PICKER_INTERNATIONAL_IDS.includes("Dola"));
  assert.ok(APP_PICKER_AGGREGATOR_IDS.includes("GrokMirror"));
  assert.ok(APP_PICKER_AGGREGATOR_IDS.includes("LobeHub"));
  assert.ok(APP_PICKER_INTERNATIONAL_IDS.includes("Qwen"));
  assert.equal(APP_PICKER_INTERNATIONAL_IDS.includes("QwenChat"), false);
  assert.ok(APP_PICKER_CHINESE_IDS.includes("Qianwen"));
  assert.equal(APP_PICKER_CHINESE_IDS.includes("Qwen"), false);

  assert.deepEqual(
    normalizeAppPickerSectionOrder(["chinese", "custom", "chinese", "unknown"]),
    ["chinese", "custom", "international", "aggregator"]
  );
  assert.deepEqual(
    normalizeAppPickerSectionOrder(undefined),
    ["custom", "international", "aggregator", "chinese"]
  );

  const appOrders = normalizeAppPickerAppOrders({
    international: ["Grok", "ChatGPT", "Grok", ""],
    extra: ["nope"]
  });
  assert.deepEqual(appOrders.international, ["Grok", "ChatGPT"]);
  assert.deepEqual(appOrders.custom, []);
  assert.equal(Object.hasOwn(appOrders, "extra"), false);

  const stored = applyStoredOrder(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    ["c", "missing", "a"]
  );
  assert.deepEqual(stored.map((item) => item.id), ["c", "a", "b"]);
  assert.deepEqual(moveOrderedIds(["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
  assert.deepEqual(moveOrderedIds(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);

  setLanguage("en");
  const sections = buildAppPickerSections({
    apps: [
      { id: "ChatGPT", name: "ChatGPT", provider: "OpenAI", url: "https://chatgpt.com/" },
      { id: "Poe", name: "Poe", provider: "Quora", url: "https://poe.com/" },
      { id: "Kimi", name: "Kimi.com", provider: "Moonshot", url: "https://www.kimi.com/" },
      { id: "custom-1", name: "Manus", provider: "Custom", url: "https://manus.im/" },
      { id: "GrokMirror", name: "Grok Mirror", provider: "dairoot", url: "https://gk.dairoot.cn/" }
    ],
    customConfig: [{ id: "custom-1" }],
    options: {
      appPickerSectionOrder: ["chinese", "aggregator", "custom", "international"],
      appPickerAppOrders: {
        aggregator: ["GrokMirror", "Poe"]
      }
    }
  });
  assert.deepEqual(sections.map((section) => section.id), ["chinese", "aggregator", "custom", "international"]);
  assert.deepEqual(sections.find((section) => section.id === "aggregator").apps.map((app) => app.id), ["GrokMirror", "Poe"]);
  assert.equal(sections.find((section) => section.id === "custom").apps[0].id, "custom-1");
  assert.equal(t("appPicker.aggregator"), "Aggregator AI");
  assert.equal(t("appNames.DouBao"), "豆包（doubao）");
  assert.equal(t("appNames.Qianwen"), "千问（qianwen）");
  setLanguage("zh_CN");
  assert.equal(t("appNames.DouBao"), "DouBao");
  assert.equal(t("appNames.Qianwen"), "千问");
  setLanguage("en");

  const pickerSource = require("node:fs").readFileSync(path.join(root, "app/workspace/app-picker.js"), "utf8");
  const viewSource = require("node:fs").readFileSync(path.join(root, "app/workspace/view-controller.js"), "utf8");
  const runtimeSource = require("node:fs").readFileSync(path.join(root, "app/runtime.js"), "utf8");
  assert.match(pickerSource, /startDrag\(/);
  assert.match(pickerSource, /persistOrder/);
  assert.match(viewSource, /persistAppPickerOrder/);
  assert.match(viewSource, /renderAppPickerColumns\(/);
  assert.doesNotMatch(viewSource, /APP_PICKER_AGGREGATOR_IDS/);
  assert.match(runtimeSource, /t\(`appNames\.\$\{app\.id\}`\)/);

  console.log("app picker order and drag wiring: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
