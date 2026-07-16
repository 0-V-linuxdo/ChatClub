#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CONTENT_ENTRIES,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  TOPIC_DELETE_OUTPUTS,
  GENERATED_ARTIFACT_FILES,
  GENERATED_ARTIFACT_DIRECT_INPUT_FILES,
  assertGeneratedArtifactDirectInputs,
  assertSummaryCatalogMetadata,
  assertTopicDeleteDescriptors,
  generatedArtifactDirectInputFiles,
  metadataDifferences,
  missingGeneratedArtifactDirectInputs,
  unexpectedGeneratedArtifacts,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const generatorSource = fs.readFileSync(path.join(root, "tools/generate-artifacts.cjs"), "utf8");

assert.equal(Object.keys(CONTENT_ENTRIES).length, 6);
assert.equal(Object.keys(TOPIC_DELETE_OUTPUTS).length, 7);
assert.equal(FIREFOX_CONTENT_FALLBACK_OUTPUT, "background/firefox-content-fallbacks.generated.js");
assert.equal(GENERATED_ARTIFACT_FILES.length, 14);
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/protocol.js"));
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/summary-sites.js"));
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/topic-delete-sites.js"));
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/topic-delete-userscript-sources.js"));
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("userscripts/index.json"));
for (const entry of Object.values(CONTENT_ENTRIES)) {
  assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes(entry), `direct input inventory is missing ${entry}`);
}

const summaryExpected = [
  { id: "alpha", name: "Alpha", hosts: ["alpha.example"], pathPrefixes: ["/chat"], configVersion: 3, userscriptFile: "alpha.js", userscriptLength: 12, userscript: "return [];" },
  { id: "beta", name: "Beta", hosts: ["beta.example"], pathPrefixes: [], configVersion: 4, userscriptFile: "beta.js", userscriptLength: 13, userscript: "return [];" }
];
const summaryCatalog = summaryExpected.map(({ userscript, ...descriptor }) => ({ ...descriptor }));
assert.deepEqual(metadataDifferences(summaryExpected[0], summaryCatalog[0], ["userscript"]), []);
assert.doesNotThrow(() => assertSummaryCatalogMetadata(summaryExpected, summaryCatalog));
assert.throws(
  () => assertSummaryCatalogMetadata(summaryExpected, [
    { ...summaryCatalog[0], hosts: ["drifted.example"] },
    summaryCatalog[1]
  ]),
  /alpha metadata drifted[\s\S]*hosts/
);
assert.throws(
  () => assertSummaryCatalogMetadata(summaryExpected, [
    { ...summaryCatalog[0], unownedMetadata: true },
    summaryCatalog[1]
  ]),
  /alpha metadata drifted[\s\S]*unownedMetadata/
);
assert.throws(
  () => assertSummaryCatalogMetadata(summaryExpected, [...summaryCatalog].reverse()),
  /catalog order\/id at index 0/
);

const deleteSources = Object.fromEntries(Object.keys(TOPIC_DELETE_OUTPUTS).map((id, index) => [
  id,
  `// ==UserScript==\n// @version ${index + 1}.0.0\n// ==/UserScript==\n(() => ${index})();\n`
]));
const deleteDescriptors = Object.entries(TOPIC_DELETE_OUTPUTS).map(([id, filename], index) => {
  const source = deleteSources[id].trim();
  return {
    id,
    scriptVersion: `${index + 1}.0.0`,
    userscriptFile: `topic-delete-userscripts/${filename}`,
    userscriptLength: source.length
  };
});
assert.doesNotThrow(() => assertTopicDeleteDescriptors(deleteSources, deleteDescriptors));
assert.throws(
  () => assertTopicDeleteDescriptors(deleteSources, deleteDescriptors.map((item) => (
    item.id === "chatgpt" ? { ...item, scriptVersion: "stale" } : item
  ))),
  /chatgpt\.scriptVersion[\s\S]*generated @version/
);
assert.throws(
  () => assertTopicDeleteDescriptors(deleteSources, deleteDescriptors.map((item) => (
    item.id === "deepseek" ? { ...item, userscriptLength: item.userscriptLength + 1 } : item
  ))),
  /deepseek\.userscriptLength[\s\S]*generated length/
);

const deleteGenerator = generatorSource.slice(
  generatorSource.indexOf("async function generateDeleteSites()"),
  generatorSource.indexOf("\n(async () =>")
);
const deleteOutputWriteIndex = deleteGenerator.indexOf("expectedFile(");
const deleteDescriptorValidationIndex = deleteGenerator.indexOf("assertTopicDeleteDescriptors(");
assert.ok(deleteOutputWriteIndex >= 0 && deleteDescriptorValidationIndex >= 0);
assert.ok(
  deleteOutputWriteIndex < deleteDescriptorValidationIndex,
  "Delete generation must write outputs before descriptor validation so metadata can be measured and updated"
);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-generated-inventory-"));
try {
  const directInputs = generatedArtifactDirectInputFiles(root);
  const summaryIndex = JSON.parse(fs.readFileSync(path.join(root, "userscripts/index.json"), "utf8"));
  for (const config of summaryIndex.configs) {
    assert.ok(directInputs.includes(`userscripts/${config.userscriptFile}`));
  }
  for (const file of directInputs) {
    const source = path.join(root, file);
    const destination = path.join(temporaryRoot, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  assert.deepEqual(missingGeneratedArtifactDirectInputs(temporaryRoot), []);
  assert.doesNotThrow(() => assertGeneratedArtifactDirectInputs(temporaryRoot));

  for (const file of GENERATED_ARTIFACT_FILES) {
    const absolute = path.join(temporaryRoot, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, "");
  }
  assert.deepEqual(unexpectedGeneratedArtifacts(temporaryRoot), []);
  assert.doesNotThrow(() => assertGeneratedArtifactInventory(temporaryRoot));

  const contentOrphan = path.join(temporaryRoot, "content", "removed-entry.js");
  const deleteOrphan = path.join(temporaryRoot, "topic-delete-userscripts", "legacy.user.js");
  fs.writeFileSync(contentOrphan, "");
  fs.writeFileSync(deleteOrphan, "");
  assert.deepEqual(unexpectedGeneratedArtifacts(temporaryRoot), [
    "content/removed-entry.js",
    "topic-delete-userscripts/legacy.user.js"
  ]);
  assert.throws(
    () => assertGeneratedArtifactInventory(temporaryRoot),
    /content\/removed-entry\.js[\s\S]*topic-delete-userscripts\/legacy\.user\.js/
  );

  const missingSummaryInput = `userscripts/${summaryIndex.configs[0].userscriptFile}`;
  fs.rmSync(path.join(temporaryRoot, missingSummaryInput));
  assert.deepEqual(missingGeneratedArtifactDirectInputs(temporaryRoot), [missingSummaryInput]);
  assert.throws(
    () => assertGeneratedArtifactDirectInputs(temporaryRoot),
    /Declared direct generated-artifact inputs are missing/
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("generated artifact closed-world inventory: ok");
