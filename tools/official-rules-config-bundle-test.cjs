const assert = require("node:assert/strict");

(async () => {
  const {
    exportConfigBundle,
    inspectImportedConfig
  } = await import("../shared/storage-config-bundle.js");

  const storedOptions = {
    optionsSchemaVersion: 4,
    language: "zh-CN",
    summarySiteConfigs: [{
      id: "local-summary",
      builtIn: false,
      sourceMode: "custom",
      customUserscript: "console.log('local user source')"
    }],
    messageNavigatorSiteConfigs: [],
    topicDeleteSiteConfigs: [],
    officialOrders: {
      summary: ["summary/chatgpt", "custom/summary/local-summary", "summary/chatgpt"],
      messageNavigator: ["messageNavigator/chatgpt"],
      delete: ["delete/chatgpt"],
      remoteSecurityState: ["must-not-export"]
    },
    officialOverrides: {
      "summary/chatgpt": { enabled: false },
      "summary/not-packaged": { enabled: true }
    },
    officialTargets: { "summary/chatgpt": { sha256: "must-not-export" } },
    candidate: { catalogHash: "must-not-export" },
    highestSeenSequence: 99,
    etag: "must-not-export"
  };

  const exported = exportConfigBundle({
    storedOptions,
    options: {
      summarySiteConfigs: [{ id: "chatgpt", builtIn: true }]
    }
  }, ["options"]);

  assert.equal(exported.options.optionsSchemaVersion, 4);
  assert.equal(exported.options.language, "zh-CN");
  assert.deepEqual(exported.options.summarySiteConfigs, storedOptions.summarySiteConfigs);
  assert.deepEqual(exported.options.officialOrders.summary, [
    "summary/chatgpt",
    "custom/summary/local-summary"
  ]);
  assert.deepEqual(exported.options.officialOverrides, {
    "summary/chatgpt": { enabled: false }
  });
  for (const forbidden of ["officialTargets", "candidate", "highestSeenSequence", "etag"]) {
    assert.equal(Object.hasOwn(exported.options, forbidden), false, `${forbidden} must not be exported`);
  }
  assert.equal(
    exported.options.summarySiteConfigs.some((entry) => entry.id === "chatgpt"),
    false,
    "v4 export must not materialize the effective packaged/official baseline"
  );

  const inspected = inspectImportedConfig({
    schema: "chatclub.config.v1",
    options: {
      ...storedOptions,
      activationRevision: 10,
      officialRulesState: { signatures: ["must-not-import"] }
    }
  });
  assert.equal(inspected.data.options.optionsSchemaVersion, 4);
  assert.equal(inspected.data.options.language, "zh-CN");
  assert.deepEqual(inspected.data.options.summarySiteConfigs, storedOptions.summarySiteConfigs);
  assert.equal(
    inspected.data.options.summarySiteConfigs.some((entry) => entry.id === "chatgpt"),
    false,
    "v4 import must remain sparse"
  );
  assert.equal(Object.hasOwn(inspected.data.options, "activationRevision"), false);
  assert.equal(Object.hasOwn(inspected.data.options, "officialRulesState"), false);
  assert.ok(inspected.diagnostics.options.droppedCount >= 6);
  assert.ok(inspected.diagnostics.options.droppedFields.includes("officialTargets"));
  assert.ok(inspected.diagnostics.options.droppedFields.includes("officialRulesState"));

  const legacy = inspectImportedConfig({
    schema: "chatclub.config.v1",
    options: { language: "en" }
  });
  assert.equal(legacy.data.options.language, "en");
  assert.ok(Array.isArray(legacy.data.options.summarySiteConfigs));
  assert.ok(legacy.data.options.summarySiteConfigs.length > 0);

  console.log("official rules config bundle tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
