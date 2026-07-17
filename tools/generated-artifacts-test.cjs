#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CONTENT_ENTRIES,
  CONTENT_RUNTIME_VERSION_MODULE,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  TOPIC_DELETE_OUTPUTS,
  TOPIC_DELETE_SOURCE_FILES,
  GENERATED_ARTIFACT_FILES,
  GENERATED_ARTIFACT_DIRECT_INPUT_FILES,
  CONTENT_RUNTIME_BUILD_RECIPE_FILES,
  contentRuntimeBundleIdentities,
  contentRuntimeBundleSourceStates,
  contentRuntimeBuildRecipeState,
  contentRuntimeBundleImplementationSha256,
  contentRuntimeImplementationSha256,
  contentRuntimeImplementationVersion,
  contentRuntimeRegistryKey,
  contentRuntimeSourceFiles,
  contentRuntimeSourceState,
  contentRuntimeVersionModule,
  assertGeneratedArtifactDirectInputs,
  assertSummaryCatalogMetadata,
  assertTopicDeleteDescriptors,
  generatedArtifactDirectInputFiles,
  metadataDifferences,
  missingGeneratedArtifactDirectInputs,
  unexpectedGeneratedArtifacts,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");
const { assertContainedOutputPath } = require("./repository-files.cjs");

const root = path.resolve(__dirname, "..");
const generatorSource = fs.readFileSync(path.join(root, "tools/generate-artifacts.cjs"), "utf8");
assert.match(generatorSource, /assertContainedOutputPath\(base, relativePath\)/);

assert.equal(Object.keys(CONTENT_ENTRIES).length, 10);
assert.equal(Object.keys(TOPIC_DELETE_OUTPUTS).length, 7);
assert.equal(FIREFOX_CONTENT_FALLBACK_OUTPUT, "background/firefox-content-fallbacks.generated.js");
assert.equal(CONTENT_RUNTIME_VERSION_MODULE, "shared/content-runtime-version.generated.js");
assert.equal(GENERATED_ARTIFACT_FILES.length, 19);
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/protocol.js"));
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/summary-sites.js"));
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("shared/topic-delete-sites.js"));
for (const file of TOPIC_DELETE_SOURCE_FILES) {
  assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes(file), `direct input inventory is missing ${file}`);
}
assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes("userscripts/index.json"));
for (const entry of Object.values(CONTENT_ENTRIES)) {
  assert.ok(GENERATED_ARTIFACT_DIRECT_INPUT_FILES.includes(entry), `direct input inventory is missing ${entry}`);
}

const runtimeSourceFiles = contentRuntimeSourceFiles(root);
const runtimeSourceState = contentRuntimeSourceState(root);
const runtimeBundleSourceStates = contentRuntimeBundleSourceStates(root);
const runtimeBuildRecipeState = contentRuntimeBuildRecipeState(root);
assert.deepEqual(runtimeSourceState.files, runtimeSourceFiles);
assert.match(runtimeSourceState.sha256, /^[a-f0-9]{64}$/);
assert.ok(runtimeSourceFiles.includes("content-src/content.js"));
assert.ok(runtimeSourceFiles.includes("shared/protocol.js"));
assert.ok(runtimeSourceFiles.includes("userscripts/index.json"));
assert.equal(
  runtimeSourceFiles.includes(CONTENT_RUNTIME_VERSION_MODULE),
  false,
  "the generated version module must not recursively hash itself"
);
assert.match(runtimeBuildRecipeState.sha256, /^[a-f0-9]{64}$/);
assert.match(runtimeBuildRecipeState.version, /^1\+recipe\.[a-f0-9]{64}$/);
assert.deepEqual(runtimeBuildRecipeState.files, CONTENT_RUNTIME_BUILD_RECIPE_FILES);
assert.deepEqual(Object.keys(runtimeBundleSourceStates), Object.keys(CONTENT_ENTRIES).sort());
for (const [outputPath, state] of Object.entries(runtimeBundleSourceStates)) {
  assert.equal(state.outputPath, outputPath);
  assert.equal(state.entryPath, CONTENT_ENTRIES[outputPath]);
  assert.match(state.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(state.files.includes(state.entryPath));
  assert.equal(state.files.includes(CONTENT_RUNTIME_VERSION_MODULE), false);
}
assert.deepEqual(
  runtimeBundleSourceStates["content/summary-userscripts-main.js"].virtualInputs,
  ["chatclub:summary-registry"]
);
assert.ok(runtimeBundleSourceStates["content/summary-userscripts-main.js"].files.includes("userscripts/index.json"));
assert.equal(runtimeBundleSourceStates["content/preload.js"].files.includes("userscripts/index.json"), false);
const runtimeBundleIdentities = contentRuntimeBundleIdentities(
  "bridge-v1",
  runtimeBundleSourceStates,
  runtimeBuildRecipeState.sha256
);
for (const [outputPath, identity] of Object.entries(runtimeBundleIdentities)) {
  assert.equal(identity.outputPath, outputPath);
  assert.match(identity.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    identity.implementationSha256,
    contentRuntimeBundleImplementationSha256(
      "bridge-v1",
      outputPath,
      identity.sourceSha256,
      runtimeBuildRecipeState.sha256
    )
  );
  assert.equal(identity.implementationVersion, `bridge-v1+bundle.${identity.implementationSha256}`);
}
const runtimeImplementationSha256 = contentRuntimeImplementationSha256(
  "bridge-v1",
  runtimeSourceState.sha256,
  runtimeBuildRecipeState.sha256
);
const runtimeImplementationVersion = contentRuntimeImplementationVersion(
  "bridge-v1",
  runtimeSourceState.sha256,
  runtimeBuildRecipeState.sha256
);
const runtimeRegistryKey = contentRuntimeRegistryKey("__CHATCLUB_RUNTIME_REGISTRY_V1__");
assert.equal(runtimeImplementationVersion, `bridge-v1+implementation.${runtimeImplementationSha256}`);
assert.equal(runtimeRegistryKey, "__CHATCLUB_RUNTIME_REGISTRY_V1__");
assert.match(
  contentRuntimeVersionModule({
    protocolVersion: "bridge-v1",
    registryBaseKey: "__CHATCLUB_RUNTIME_REGISTRY_V1__",
    sourceSha256: runtimeSourceState.sha256,
    buildRecipeVersion: runtimeBuildRecipeState.version,
    buildRecipeSha256: runtimeBuildRecipeState.sha256,
    bundleSourceStates: runtimeBundleSourceStates
  }),
  new RegExp(runtimeImplementationSha256, "g")
);

const runtimeFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-runtime-source-state-"));
try {
  for (const file of [...runtimeSourceFiles, CONTENT_RUNTIME_VERSION_MODULE]) {
    const source = path.join(root, file);
    const destination = path.join(runtimeFixtureRoot, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  const baseline = contentRuntimeSourceState(runtimeFixtureRoot);
  const baselineBundles = contentRuntimeBundleSourceStates(runtimeFixtureRoot);
  fs.appendFileSync(path.join(runtimeFixtureRoot, CONTENT_RUNTIME_VERSION_MODULE), "// stale generated edit\n");
  assert.equal(
    contentRuntimeSourceState(runtimeFixtureRoot).sha256,
    baseline.sha256,
    "generated runtime-version output must not feed back into its author-source hash"
  );
  fs.appendFileSync(path.join(runtimeFixtureRoot, "content-src/content.js"), "\n// author-source fingerprint probe\n");
  const changed = contentRuntimeSourceState(runtimeFixtureRoot);
  assert.notEqual(changed.sha256, baseline.sha256, "a transitive author-source edit must change the runtime hash");
  assert.notEqual(
    contentRuntimeImplementationVersion("bridge-v1", changed.sha256, runtimeBuildRecipeState.sha256),
    contentRuntimeImplementationVersion("bridge-v1", baseline.sha256, runtimeBuildRecipeState.sha256),
    "a transitive author-source edit must change the implementation version without a manual token bump"
  );
  assert.notEqual(
    contentRuntimeImplementationVersion("bridge-v1", changed.sha256, runtimeBuildRecipeState.sha256),
    contentRuntimeImplementationVersion("bridge-v1", baseline.sha256, runtimeBuildRecipeState.sha256),
    "a transitive author-source edit must move persistent runtimes to a new broker generation"
  );

  const summaryScript = JSON.parse(
    fs.readFileSync(path.join(runtimeFixtureRoot, "userscripts/index.json"), "utf8")
  ).configs[0].userscriptFile;
  fs.appendFileSync(path.join(runtimeFixtureRoot, "userscripts", summaryScript), "\n// summary bundle identity probe\n");
  const summaryChangedBundles = contentRuntimeBundleSourceStates(runtimeFixtureRoot);
  assert.notEqual(
    summaryChangedBundles["content/summary-userscripts-main.js"].sourceSha256,
    baselineBundles["content/summary-userscripts-main.js"].sourceSha256,
    "a virtual Summary registry input must change the bundle that embeds it"
  );
  assert.notEqual(
    summaryChangedBundles["content/summary-userscripts.js"].sourceSha256,
    baselineBundles["content/summary-userscripts.js"].sourceSha256,
    "each Summary bundle embedding the virtual registry must receive its own new identity"
  );
  const summaryBundleOutputs = new Set([
    "content/summary-userscripts-main.js",
    "content/summary-userscripts.js"
  ]);
  for (const outputPath of Object.keys(CONTENT_ENTRIES).filter((item) => !summaryBundleOutputs.has(item))) {
    if (outputPath === "content/content.js") continue;
    assert.equal(
      summaryChangedBundles[outputPath].sourceSha256,
      baselineBundles[outputPath].sourceSha256,
      `a Summary userscript body must not change unrelated bundle identity ${outputPath}`
    );
  }
} finally {
  fs.rmSync(runtimeFixtureRoot, { recursive: true, force: true });
}

const recipeFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-runtime-recipe-state-"));
try {
  for (const file of ["package.json", ...CONTENT_RUNTIME_BUILD_RECIPE_FILES]) {
    const destination = path.join(recipeFixtureRoot, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  const baseline = contentRuntimeBuildRecipeState(recipeFixtureRoot);
  fs.appendFileSync(
    path.join(recipeFixtureRoot, "tools/generate-artifacts.cjs"),
    "\n// virtual registry recipe fingerprint probe\n"
  );
  const changed = contentRuntimeBuildRecipeState(recipeFixtureRoot);
  assert.notEqual(
    changed.sha256,
    baseline.sha256,
    "a generator or virtual-registry semantic edit must change the build-recipe fingerprint"
  );
  assert.notEqual(
    contentRuntimeImplementationVersion("bridge-v1", runtimeSourceState.sha256, changed.sha256),
    contentRuntimeImplementationVersion("bridge-v1", runtimeSourceState.sha256, baseline.sha256),
    "a build-recipe edit must change the runtime generation without an author-source edit"
  );
} finally {
  fs.rmSync(recipeFixtureRoot, { recursive: true, force: true });
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

  const outsideGeneratedOutput = path.join(temporaryRoot, "outside-generated-output.js");
  fs.writeFileSync(outsideGeneratedOutput, "external output must never be followed\n");
  const linkedContentOutput = path.join(temporaryRoot, "content", "content.js");
  fs.rmSync(linkedContentOutput);
  fs.symlinkSync(outsideGeneratedOutput, linkedContentOutput, "file");
  assert.throws(
    () => assertContainedOutputPath(temporaryRoot, "content/content.js"),
    /Generated output path contains a symbolic link/
  );
  assert.throws(
    () => assertGeneratedArtifactInventory(temporaryRoot),
    /Generated artifact is a symbolic link: content\/content\.js/
  );
  fs.rmSync(linkedContentOutput);
  fs.writeFileSync(linkedContentOutput, "");

  const linkedDeleteOutput = path.join(temporaryRoot, "topic-delete-userscripts", "chatgpt.user.js");
  fs.rmSync(linkedDeleteOutput);
  fs.symlinkSync(outsideGeneratedOutput, linkedDeleteOutput, "file");
  assert.throws(
    () => assertGeneratedArtifactInventory(temporaryRoot),
    /Generated artifact is a symbolic link: topic-delete-userscripts\/chatgpt\.user\.js/
  );
  fs.rmSync(linkedDeleteOutput);
  fs.writeFileSync(linkedDeleteOutput, "");

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
