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

  console.log("API profile default model migration: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
