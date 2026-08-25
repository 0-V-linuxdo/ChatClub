#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}`);

(async () => {
  const {
    BUILTIN_CHAT_APPS,
    PROMPT_IMAGE_PASTE_STRATEGY_BATCH,
    PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL
  } = await load("shared/constants.js");
  const { normalizeCustomConfig, normalizeHttpUrl, suggestCustomAppDraft } = await load("shared/storage-schema.js");
  const chatgpt = BUILTIN_CHAT_APPS.find((app) => app.id === "ChatGPT");
  const claude = BUILTIN_CHAT_APPS.find((app) => app.id === "Claude");
  const gemini = BUILTIN_CHAT_APPS.find((app) => app.id === "Gemini");
  const kimi = BUILTIN_CHAT_APPS.find((app) => app.id === "Kimi");
  const kimiAi = BUILTIN_CHAT_APPS.find((app) => app.id === "KimiAI");
  const dola = BUILTIN_CHAT_APPS.find((app) => app.id === "Dola");
  assert.ok(chatgpt && claude && gemini && kimi && kimiAi && dola);
  assert.equal(kimi.url, "https://www.kimi.com/");
  assert.equal(kimiAi.url, "https://www.kimi.ai/");
  assert.equal(kimiAi.name, "Kimi.ai");
  assert.equal(dola.name, "Dola");
  assert.equal(dola.url, "https://www.dola.com/chat/");

  assert.equal(normalizeHttpUrl("manus.im"), "https://manus.im/");
  assert.equal(normalizeHttpUrl("https://manus.im"), "https://manus.im/");
  assert.equal(normalizeHttpUrl("//claude.ai/new"), "https://claude.ai/new");
  assert.equal(normalizeHttpUrl("http://localhost:8787/chat"), "http://localhost:8787/chat");
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), "");
  assert.equal(normalizeHttpUrl("ftp://files.example"), "");
  assert.equal(normalizeHttpUrl(""), "");

  const imported = normalizeCustomConfig([{ name: "Manus", url: "manus.im" }]);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].url, "https://manus.im/");
  assert.equal(imported[0].name, "Manus");

  const unknown = suggestCustomAppDraft("manus.im", {
    current: { name: "Custom App", provider: "Custom" }
  });
  assert.equal(unknown.ok, true);
  assert.equal(unknown.kind, "suggest");
  assert.equal(unknown.url, "https://manus.im/");
  assert.equal(unknown.host, "manus.im");
  assert.equal(unknown.values.name, "Manus");
  assert.equal(unknown.values.provider, "Custom");
  assert.equal(unknown.values.inputSelector, "textarea, [contenteditable='true']");
  assert.match(unknown.values.sendButtonSelector, /Send/i);
  assert.equal(unknown.values.imagePasteStrategy, PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL);
  assert.deepEqual(unknown.values.hosts, ["manus.im"]);

  const matched = suggestCustomAppDraft("chatgpt.com", {
    current: { name: "Custom App", provider: "Custom" }
  });
  assert.equal(matched.kind, "match");
  assert.equal(matched.matched?.id, "ChatGPT");
  assert.equal(matched.values.name, chatgpt.name);
  assert.equal(matched.values.provider, chatgpt.provider);
  assert.equal(matched.values.url, chatgpt.url);
  assert.equal(matched.values.inputSelector, chatgpt.inputSelector);
  assert.equal(matched.values.sendButtonSelector, chatgpt.sendButtonSelector);

  const claudePath = suggestCustomAppDraft("https://claude.ai/chat/123", {
    current: { name: "Custom App" }
  });
  assert.equal(claudePath.kind, "match");
  assert.equal(claudePath.values.url, "https://claude.ai/chat/123");
  assert.equal(claudePath.values.name, claude.name);

  const geminiBare = suggestCustomAppDraft("gemini.google.com", {
    current: { name: "Custom App" }
  });
  assert.equal(geminiBare.values.url, gemini.url);
  assert.equal(geminiBare.values.imagePasteStrategy, PROMPT_IMAGE_PASTE_STRATEGY_BATCH);

  const kimiInternational = suggestCustomAppDraft("kimi.ai", {
    current: { name: "Custom App", provider: "Custom" }
  });
  assert.equal(kimiInternational.kind, "match");
  assert.equal(kimiInternational.matched?.id, "KimiAI");
  assert.equal(kimiInternational.values.name, "Kimi.ai");
  assert.equal(kimiInternational.values.url, kimiAi.url);

  const kimiChina = suggestCustomAppDraft("kimi.com", {
    current: { name: "Custom App" }
  });
  assert.equal(kimiChina.matched?.id, "Kimi");
  assert.equal(kimiChina.values.url, kimi.url);

  const dolaMatch = suggestCustomAppDraft("dola.com", {
    current: { name: "Custom App", provider: "Custom" }
  });
  assert.equal(dolaMatch.kind, "match");
  assert.equal(dolaMatch.matched?.id, "Dola");
  assert.equal(dolaMatch.values.name, "Dola");
  assert.equal(dolaMatch.values.url, dola.url);
  assert.equal(dolaMatch.values.provider, "ByteDance");

  const preserved = suggestCustomAppDraft("manus.im", {
    current: { name: "My Agent", provider: "Custom", inputSelector: "textarea.mine" },
    autofilled: {}
  });
  assert.equal(preserved.values.name, undefined);
  assert.equal(preserved.values.inputSelector, undefined);
  assert.equal(preserved.values.provider, "Custom");
  assert.equal(preserved.url, "https://manus.im/");

  const followUp = suggestCustomAppDraft("chatgpt.com", {
    current: {
      name: "Manus",
      provider: "Custom",
      inputSelector: unknown.values.inputSelector,
      sendButtonSelector: unknown.values.sendButtonSelector,
      imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL
    },
    autofilled: unknown.nextAutofilled
  });
  assert.equal(followUp.values.name, chatgpt.name);
  assert.equal(followUp.values.provider, chatgpt.provider);
  assert.equal(followUp.values.inputSelector, chatgpt.inputSelector);

  const empty = suggestCustomAppDraft("   ");
  assert.equal(empty.ok, false);
  assert.equal(empty.url, "");

  const appsSource = require("node:fs").readFileSync(path.join(root, "app/settings/apps.js"), "utf8");
  const viewSource = require("node:fs").readFileSync(path.join(root, "app/workspace/view-controller.js"), "utf8");
  const pickerSource = require("node:fs").readFileSync(path.join(root, "app/workspace/app-picker.js"), "utf8");
  const orderSource = require("node:fs").readFileSync(path.join(root, "shared/app-picker-order.js"), "utf8");
  assert.match(orderSource, /"KimiAI", "Dola"/);
  assert.match(orderSource, /APP_PICKER_AGGREGATOR_IDS/);
  assert.match(orderSource, /"GrokMirror", "LobeHub"/);
  assert.match(pickerSource, /APP_PICKER_AGGREGATOR_IDS/);
  assert.match(viewSource, /renderAppPickerColumns\(/);
  assert.match(appsSource, /suggestCustomAppDraft\(/);
  assert.match(appsSource, /normalizeHttpUrl\(/);
  assert.match(appsSource, /applyUrlAutofill/);
  assert.match(appsSource, /customAppUrlLooksComplete/);
  assert.match(appsSource, /url: ""/);
  assert.doesNotMatch(appsSource, /https:\/\/www\.example\.com\//);
  assert.match(appsSource, /dataset\.customAppField = "url"/);
  assert.match(appsSource, /t\("apps\.urlAutofillMatch"/);
  assert.match(appsSource, /t\("apps\.urlAutofillSuggest"/);

  console.log("custom app domain autofill: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
