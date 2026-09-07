#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const {
    API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION,
    API_PROFILE_MODEL_DEFAULT
  } = await import("../shared/constants.js");
  const { normalizeOptions } = await import("../shared/storage-schema.js");

  assert.equal(API_PROFILE_MODEL_DEFAULT, "GPT5.5");
  assert.equal(normalizeOptions({}).apiProfiles[0].model, API_PROFILE_MODEL_DEFAULT);
  assert.deepEqual(normalizeOptions({}).apiProfiles[0].models, [API_PROFILE_MODEL_DEFAULT]);
  assert.equal(normalizeOptions({}).optimizeApiModel, "");

  const migrated = normalizeOptions({
    apiProfiles: [{
      id: "default-openai",
      name: "Default API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-3.5-turbo"
    }]
  });
  assert.equal(migrated.apiProfiles[0].model, API_PROFILE_MODEL_DEFAULT);
  assert.equal(
    migrated.apiProfileDefaultModelMigrationVersion,
    API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION
  );

  const custom = normalizeOptions({
    apiProfiles: [{
      id: "custom-openai",
      name: "My API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-3.5-turbo"
    }]
  });
  assert.equal(custom.apiProfiles[0].model, "gpt-3.5-turbo");

  const postMigrationChoice = normalizeOptions({
    apiProfileDefaultModelMigrationVersion: API_PROFILE_DEFAULT_MODEL_MIGRATION_VERSION,
    apiProfiles: [{
      id: "default-openai",
      name: "Default API",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-3.5-turbo"
    }]
  });
  assert.equal(postMigrationChoice.apiProfiles[0].model, "gpt-3.5-turbo");

  const catalog = normalizeOptions({
    apiProfiles: [{
      id: "zero",
      name: "0.0",
      endpoint: "https://api.0-0.pro/v1/chat/completions",
      model: "gpt-5.6-luna",
      models: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-luna"]
    }],
    optimizeApiProfileId: "zero",
    optimizeApiModel: "gpt-5.6-terra",
    summaryApiProfileId: "zero",
    summaryApiModel: "missing"
  });
  assert.deepEqual(catalog.apiProfiles[0].models, ["gpt-5.6-luna", "gpt-5.6-terra"]);
  assert.equal(catalog.optimizeApiModel, "gpt-5.6-terra");
  assert.equal(catalog.summaryApiModel, "");

  const { apiProfileDropdownModels } = await import("../shared/api-options.js");
  const starred = normalizeOptions({
    apiProfiles: [{
      id: "zero",
      name: "0.0",
      endpoint: "https://api.0-0.pro/v1/chat/completions",
      model: "gpt-5.6-luna",
      models: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-orbit"],
      favoriteModels: ["gpt-5.6-terra", "missing", "gpt-5.6-luna"]
    }]
  }).apiProfiles[0];
  assert.deepEqual(starred.favoriteModels, ["gpt-5.6-terra", "gpt-5.6-luna"]);
  assert.deepEqual(apiProfileDropdownModels(starred), ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-orbit"]);

  console.log("API profile default model migration: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
