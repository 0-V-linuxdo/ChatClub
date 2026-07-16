#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { fileURLToPath } = require("node:url");

(async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const body = await fs.readFile(fileURLToPath(url), "utf8");
    return { ok: true, status: 200, text: async () => body };
  };
  try {
    const { SCRIPT_CONFIG_SCHEMA_VERSION } = await import("../shared/constants.js");
    const { SUMMARY_SITE_CONFIGS, loadBuiltInSummarySource } = await import("../shared/summary-sites.js");
    const { TOPIC_DELETE_SITE_CONFIGS, loadBuiltInTopicDeleteSource } = await import("../shared/topic-delete-sites.js");
    const { migrateLegacyScriptConfig } = await import("../shared/script-config-migration.js");
    const { dehydrateOptions, normalizeOptions } = await import("../shared/storage-schema.js");

    assert.equal(SCRIPT_CONFIG_SCHEMA_VERSION, 3);
    assert.ok(SUMMARY_SITE_CONFIGS.every((item) => !("userscript" in item)));
    assert.ok(TOPIC_DELETE_SITE_CONFIGS.every((item) => !("userscript" in item)));
    for (const descriptor of SUMMARY_SITE_CONFIGS) {
      assert.equal((await loadBuiltInSummarySource(descriptor.id)).length, descriptor.userscriptLength);
    }
    for (const descriptor of TOPIC_DELETE_SITE_CONFIGS) {
      const source = await loadBuiltInTopicDeleteSource(descriptor.id);
      assert.equal(source.length, descriptor.userscriptLength);
      assert.equal(
        source.match(/^\/\/\s*@version\s+(\S+)\s*$/m)?.[1],
        descriptor.scriptVersion,
        `${descriptor.id} descriptor version must match the generated userscript @version`
      );
    }

    const summarySource = await loadBuiltInSummarySource("chatgpt");
    const deleteSource = await loadBuiltInTopicDeleteSource("chatgpt");
    const currentDeleteVersion = deleteSource.match(/^\/\/\s*@version\s+(\S+)\s*$/m)?.[1];
    assert.ok(currentDeleteVersion);
    const legacyDeleteVersion = currentDeleteVersion === "2000.01.01.1" ? "2000.01.01.2" : "2000.01.01.1";
    const legacyGeneratedDeleteSource = deleteSource.split(currentDeleteVersion).join(legacyDeleteVersion);
    const legacyGeneratedDeleteEdit = `${legacyGeneratedDeleteSource}\n// preserved user edit`;
    const migratedBuiltIns = await migrateLegacyScriptConfig({
      scriptConfigSchemaVersion: 2,
      summarySiteConfigs: [{ id: "chatgpt", builtIn: true, userscript: summarySource }],
      topicDeleteSiteConfigs: [{ id: "chatgpt", builtIn: true, userscript: deleteSource }]
    });
    for (const item of [migratedBuiltIns.summarySiteConfigs[0], migratedBuiltIns.topicDeleteSiteConfigs[0]]) {
      assert.equal(item.sourceMode, "builtIn");
      assert.ok(!("userscript" in item));
      assert.ok(!("customUserscript" in item));
    }

    const migratedLegacyGenerated = await migrateLegacyScriptConfig({
      topicDeleteSiteConfigs: [{ id: "chatgpt", builtIn: true, userscript: legacyGeneratedDeleteSource }]
    });
    assert.equal(migratedLegacyGenerated.topicDeleteSiteConfigs[0].sourceMode, "builtIn");
    assert.ok(!("customUserscript" in migratedLegacyGenerated.topicDeleteSiteConfigs[0]));

    const explicitCustomDeleteSource = `${legacyGeneratedDeleteSource}\n// customUserscript edit`;
    const migratedExplicitCustom = await migrateLegacyScriptConfig({
      topicDeleteSiteConfigs: [
        { id: "chatgpt", builtIn: true, sourceMode: "custom", userscript: legacyGeneratedDeleteEdit },
        { id: "chatgpt", builtIn: true, userscript: legacyGeneratedDeleteSource, customUserscript: explicitCustomDeleteSource },
        { id: "chatgpt", builtIn: true, userscriptOverride: true, userscript: legacyGeneratedDeleteEdit }
      ]
    });
    assert.deepEqual(
      migratedExplicitCustom.topicDeleteSiteConfigs.map((item) => item.sourceMode),
      ["custom", "custom", "custom"]
    );
    assert.equal(migratedExplicitCustom.topicDeleteSiteConfigs[0].customUserscript, legacyGeneratedDeleteEdit);
    assert.equal(migratedExplicitCustom.topicDeleteSiteConfigs[1].customUserscript, explicitCustomDeleteSource);
    assert.equal(migratedExplicitCustom.topicDeleteSiteConfigs[2].customUserscript, legacyGeneratedDeleteEdit);
    assert.ok(migratedExplicitCustom.topicDeleteSiteConfigs.every((item) => !("userscript" in item)));
    assert.ok(migratedExplicitCustom.topicDeleteSiteConfigs.every((item) => !("userscriptOverride" in item)));

    const dehydratedOverride = dehydrateOptions(normalizeOptions({
      topicDeleteSiteConfigs: [migratedExplicitCustom.topicDeleteSiteConfigs[2]]
    }));
    assert.equal(dehydratedOverride.topicDeleteSiteConfigs[0].sourceMode, "custom");
    assert.equal(dehydratedOverride.topicDeleteSiteConfigs[0].customUserscript, legacyGeneratedDeleteEdit);

    const exactEdit = `  ${summarySource}\n// user edit\n`;
    const exactCustom = "\n  return ['preserve whitespace'];\n\n";
    const migratedEdits = await migrateLegacyScriptConfig({
      summarySiteConfigs: [
        { id: "chatgpt", builtIn: true, userscript: exactEdit },
        { id: "private", builtIn: false, userscript: exactCustom }
      ],
      topicDeleteSiteConfigs: [{ id: "chatgpt", builtIn: true, userscript: `${deleteSource}\n// user edit` }]
    });
    assert.equal(migratedEdits.summarySiteConfigs[0].customUserscript, exactEdit);
    assert.equal(migratedEdits.summarySiteConfigs[1].customUserscript, exactCustom);
    assert.equal(migratedEdits.topicDeleteSiteConfigs[0].customUserscript, `${deleteSource}\n// user edit`);

    const normalized = normalizeOptions(migratedEdits);
    const dehydrated = dehydrateOptions(normalized);
    assert.equal(dehydrated.scriptConfigSchemaVersion, 3);
    assert.equal(dehydrated.summarySiteConfigs[0].customUserscript, exactEdit);
    assert.equal(dehydrated.summarySiteConfigs[1].customUserscript, exactCustom);
    assert.ok(dehydrated.summarySiteConfigs.every((item) => !("userscript" in item)));
    assert.ok(dehydrated.topicDeleteSiteConfigs.every((item) => !("userscript" in item)));

    const ordered = normalizeOptions({
      summarySiteConfigs: [
        { id: "kagi", builtIn: true },
        { id: "chatgpt", builtIn: true }
      ],
      topicDeleteSiteConfigs: [
        { id: "deepseek", builtIn: true },
        { id: "chatgpt", builtIn: true }
      ]
    });
    assert.deepEqual(ordered.summarySiteConfigs.slice(0, 2).map((item) => item.id), ["kagi", "chatgpt"]);
    assert.deepEqual(ordered.topicDeleteSiteConfigs.slice(0, 2).map((item) => item.id), ["deepseek", "chatgpt"]);

    console.log("storage script config v3: ok");
  } finally {
    globalThis.fetch = previousFetch;
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
