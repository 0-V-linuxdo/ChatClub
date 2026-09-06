#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const {
    API_PROFILE_MODEL_DEFAULT,
    DEFAULT_OPTIONS,
    MODEL_PREFERENCE_SECONDARY_ENABLED_KEY,
    MODEL_PREFERENCE_SECONDARY_KEYS
  } = await import("../shared/constants.js");
  const {
    apiProfileModel,
    apiProfileSelectLabel,
    listModelInventory,
    resolveApiProfile
  } = await import("../shared/model-inventory.js");
  const apiSource = read("shared/api.js");
  const i18nSource = read("shared/i18n.js");
  const optimizeSource = read("app/optimize/controller.js");
  const summarySource = read("app/summary/controller.js");

  assert.match(apiSource, /export \{ apiProfileModel, resolveApiProfile \}/);
  assert.match(apiSource, /model: apiProfileModel\(profile\)/);
  assert.doesNotMatch(apiSource, /function resolveApiProfile/);
  assert.match(optimizeSource, /dataset: \{ optimizeModel: attrs\.model \|\| "" \}/);
  assert.match(summarySource, /summaryPanel\.generatingTitleWithModel/);
  assert.match(i18nSource, /"settings\.models\.title": "Iframe Preferred Models"/);
  assert.match(i18nSource, /"settings\.models\.title": "iframe 首选模型"/);
  assert.match(i18nSource, /"inventory\.title": "Current models"/);
  assert.match(i18nSource, /"inventory\.title": "当前使用的模型"/);

  const defaults = listModelInventory(DEFAULT_OPTIONS);
  assert.deepEqual(defaults.outbound.map((row) => row.id), ["optimize", "summary", "topicTitle"]);
  assert.deepEqual(defaults.iframe.map((row) => row.id), ["Gemini", "Grok", "DeepSeek", "NotionAI"]);
  assert.equal(defaults.outbound[0].model, API_PROFILE_MODEL_DEFAULT);
  assert.equal(defaults.outbound[0].profileName, "Default API");
  assert.equal(defaults.outbound[0].host, "api.openai.com");
  assert.equal(defaults.outbound[1].profileName, "Default API");
  assert.equal(defaults.outbound[1].model, API_PROFILE_MODEL_DEFAULT);
  assert.equal(defaults.outbound[2].profileId, "default-openai");
  assert.equal(defaults.iframe[0].primary, "");
  assert.equal(defaults.iframe[0].secondaryEnabled, false);

  const fallback = listModelInventory({
    apiProfiles: DEFAULT_OPTIONS.apiProfiles,
    optimizeApiProfileId: "missing",
    summaryApiProfileId: "missing",
    topicTitleApiProfileId: "missing"
  });
  assert.equal(fallback.outbound[0].profileId, "default-openai");
  assert.equal(fallback.outbound[1].profileId, "default-zero-zero");
  assert.equal(fallback.outbound[1].model, "gpt-5.5");
  assert.equal(fallback.outbound[2].profileId, "default-openai");

  const custom = listModelInventory({
    apiProfiles: [
      {
        id: "fast",
        name: "Flash",
        endpoint: "https://gateway.example/v1/chat/completions",
        apiKey: "sk",
        model: "gpt-4.1-mini"
      },
      {
        id: "heavy",
        name: "Opus",
        endpoint: "https://api.anthropic.example/v1/messages",
        model: "claude-opus"
      }
    ],
    optimizeApiProfileId: "fast",
    summaryApiProfileId: "heavy",
    topicTitleApiProfileId: "fast",
    modelPreferences: {
      Gemini: "pro",
      Grok: "expert",
      DeepSeek: "",
      NotionAI: { kind: "label", label: "GPT-5.2 Thinking" },
      [MODEL_PREFERENCE_SECONDARY_ENABLED_KEY]: true,
      [MODEL_PREFERENCE_SECONDARY_KEYS.Gemini]: "fast"
    },
    modelPreferenceOrder: ["NotionAI", "Gemini", "Grok", "DeepSeek"]
  });
  assert.equal(custom.outbound[0].model, "gpt-4.1-mini");
  assert.equal(custom.outbound[1].model, "claude-opus");
  assert.equal(custom.outbound[1].host, "api.anthropic.example");
  assert.equal(custom.outbound[2].profileId, "fast");
  assert.deepEqual(custom.iframe.map((row) => row.id), ["NotionAI", "Gemini", "Grok", "DeepSeek"]);
  assert.equal(custom.iframe[0].primary, "GPT-5.2 Thinking");
  assert.equal(custom.iframe[1].primary, "3.1 Pro");
  assert.equal(custom.iframe[1].secondary, "3.1 Flash-Lite");
  assert.equal(custom.iframe[1].secondaryEnabled, true);

  const missingModel = resolveApiProfile({
    apiProfiles: [{ id: "bare", name: "Bare", endpoint: "https://api.openai.com/v1/chat/completions" }],
    optimizeApiProfileId: "bare"
  }, "optimize");
  assert.equal(apiProfileModel(missingModel), API_PROFILE_MODEL_DEFAULT);
  assert.equal(apiProfileSelectLabel(missingModel), `Bare · ${API_PROFILE_MODEL_DEFAULT}`);
  assert.equal(listModelInventory({
    apiProfiles: [{ id: "bare", name: "Bare", endpoint: "https://api.openai.com/v1/chat/completions" }],
    optimizeApiProfileId: "bare",
    summaryApiProfileId: "bare",
    topicTitleApiProfileId: "bare"
  }).outbound[0].host, "api.openai.com");

  console.log("model inventory: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
