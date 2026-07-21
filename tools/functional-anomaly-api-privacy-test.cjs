#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { optimizePromptStream } = await import("../shared/api.js");
  const originalFetch = globalThis.fetch;
  const responseBody = '{"message":"Your prompt was My medical chat","api_key":"provider-secret"}';
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    async text() { return responseBody; }
  });
  try {
    await assert.rejects(
      () => optimizePromptStream({
        apiProfiles: [{ id: "profile", apiKey: "test-key", endpoint: "https://api.example.test", model: "model" }],
        optimizeApiProfileId: "profile",
        optimizePromptTemplates: [{ id: "template", prompt: "Improve the prompt" }],
        optimizePromptTemplateId: "template"
      }, "private input", () => {}),
      (error) => {
        assert.equal(error.message, responseBody, "the immediate feature error remains available to the UI");
        assert.equal(error.functionalAnomalyMessage, "API request failed with HTTP 422");
        assert.equal(Object.keys(error).includes("functionalAnomalyMessage"), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("functional anomaly API response-body privacy marker: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
