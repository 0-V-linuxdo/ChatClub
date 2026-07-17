const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { initSync, parse } = require("es-module-lexer");
const { assertContainedRegularFile } = require("./repository-files.cjs");

const CONTENT_ENTRIES = Object.freeze({
  "content/content.js": "content-src/content.js",
  "content/delete.js": "content-src/content-delete.js",
  "content/preload.js": "content-src/preload.js",
  "content/preferred-model.js": "content-src/content-preferred-model.js",
  "content/send.js": "content-src/content-send.js",
  "content/summary-bridge.js": "content-src/content-summary-bridge.js",
  "content/summary-userscripts.js": "content-src/summary-userscripts.js",
  "content/summary-userscripts-main.js": "content-src/summary-userscripts-main.js",
  "content/message-navigator.js": "content-src/message-navigator.js",
  "content/grok-cookie-bridge.js": "content-src/grok-cookie-bridge.js"
});
const CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES = Object.freeze({
  "content/content.js": "CONTENT_RUNTIME_CONTENT_BUNDLE_IDENTITY",
  "content/delete.js": "CONTENT_RUNTIME_DELETE_BUNDLE_IDENTITY",
  "content/grok-cookie-bridge.js": "CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY",
  "content/message-navigator.js": "CONTENT_RUNTIME_MESSAGE_NAVIGATOR_BUNDLE_IDENTITY",
  "content/preload.js": "CONTENT_RUNTIME_PRELOAD_BUNDLE_IDENTITY",
  "content/preferred-model.js": "CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY",
  "content/send.js": "CONTENT_RUNTIME_SEND_BUNDLE_IDENTITY",
  "content/summary-bridge.js": "CONTENT_RUNTIME_SUMMARY_BRIDGE_BUNDLE_IDENTITY",
  "content/summary-userscripts-main.js": "CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY",
  "content/summary-userscripts.js": "CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY"
});

const TOPIC_DELETE_OUTPUTS = Object.freeze({
  chatgpt: "chatgpt.user.js",
  deepseek: "deepseek.user.js",
  gemini: "gemini.user.js",
  grokMirror: "grok-mirror.user.js",
  grok: "grok.user.js",
  kagi: "kagi.user.js",
  notion: "notion.user.js"
});
const TOPIC_DELETE_SOURCE_FILES = Object.freeze([
  "build-src/topic-delete-gemini-helpers.js",
  "build-src/topic-delete-userscript-engine-core.js",
  "build-src/topic-delete-userscript-engine-sites.js",
  "build-src/topic-delete-userscript-sources.js"
]);

const CONTENT_OUTPUT_FILES = Object.freeze(Object.keys(CONTENT_ENTRIES).sort());
const CONTENT_RUNTIME_VERSION_MODULE = "shared/content-runtime-version.generated.js";
const FIREFOX_CONTENT_FALLBACK_OUTPUT = "background/firefox-content-fallbacks.generated.js";
const TOPIC_DELETE_OUTPUT_FILES = Object.freeze(
  Object.values(TOPIC_DELETE_OUTPUTS).map((file) => `topic-delete-userscripts/${file}`).sort()
);
const GENERATED_ARTIFACT_FILES = Object.freeze([
  ...CONTENT_OUTPUT_FILES,
  CONTENT_RUNTIME_VERSION_MODULE,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  ...TOPIC_DELETE_OUTPUT_FILES
].sort());

// Files opened directly or imported by a build-time generator. esbuild owns
// and resolves the transitive dependency closure behind each content entry.
const GENERATED_ARTIFACT_DIRECT_INPUT_FILES = Object.freeze([
  ...Object.values(CONTENT_ENTRIES),
  ...TOPIC_DELETE_SOURCE_FILES,
  "shared/protocol.js",
  "shared/summary-sites.js",
  "shared/topic-delete-sites.js",
  "userscripts/index.json"
].sort());

const CONTENT_RUNTIME_SOURCE_STATE_SCHEMA_VERSION = 1;
const CONTENT_RUNTIME_SOURCE_HASH_DOMAIN = "chatclub-content-runtime-source-v1";
const CONTENT_RUNTIME_BUNDLE_SOURCE_HASH_DOMAIN = "chatclub-content-runtime-bundle-source-v1";
const CONTENT_RUNTIME_BUILD_RECIPE_SCHEMA_VERSION = 1;
const CONTENT_RUNTIME_BUILD_RECIPE_HASH_DOMAIN = "chatclub-content-runtime-build-recipe-v1";
const CONTENT_RUNTIME_IMPLEMENTATION_HASH_DOMAIN = "chatclub-content-runtime-implementation-v2";
const CONTENT_RUNTIME_BUNDLE_IMPLEMENTATION_HASH_DOMAIN = "chatclub-content-runtime-bundle-implementation-v1";
const CONTENT_RUNTIME_BUILD_RECIPE_FILES = Object.freeze([
  "tools/generate-artifacts.cjs",
  "tools/generated-artifacts.cjs"
]);
const CONTENT_RUNTIME_BUILD_OPTIONS = Object.freeze({
  bundle: true,
  format: "iife",
  platform: "browser",
  targets: Object.freeze(["chrome120", "firefox136"]),
  splitting: false,
  minify: false,
  charset: "utf8",
  legalComments: "inline",
  virtualSummaryRegistrySchemaVersion: 1,
  runtimeIdentityModuleSchemaVersion: 2,
  firefoxFallbackSchemaVersion: 1
});

function repositoryFile(root, relativePath) {
  return assertContainedRegularFile(root, relativePath, {
    missingPrefix: "Content runtime source dependency is missing",
    symlinkPrefix: "Content runtime source dependency is a symbolic link",
    escapePrefix: "Content runtime source dependency escapes repository root",
    componentPrefix: "Content runtime source dependency contains a symbolic link component"
  });
}

function staticImports(root, owner) {
  initSync();
  const source = fs.readFileSync(repositoryFile(root, owner), "utf8");
  const [imports] = parse(source, owner);
  const dependencies = [];
  const virtualInputs = [];
  for (const record of imports) {
    if (record.d === -2) continue;
    if (record.d !== -1) {
      throw new Error(`${owner}: dynamic imports are forbidden in the content runtime source closure`);
    }
    const specifier = record.n;
    if (!specifier) continue;
    if (specifier === "chatclub:summary-registry") {
      virtualInputs.push(specifier);
      continue;
    }
    if (!specifier.startsWith(".")) {
      throw new Error(`${owner}: unsupported content runtime import ${JSON.stringify(specifier)}`);
    }
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(owner), specifier));
    if (dependency.startsWith("../") || path.posix.isAbsolute(dependency)) {
      throw new Error(`${owner}: content runtime import escapes the repository: ${specifier}`);
    }
    repositoryFile(root, dependency);
    dependencies.push(dependency);
  }
  return Object.freeze({
    dependencies: Object.freeze(dependencies),
    virtualInputs: Object.freeze(virtualInputs)
  });
}

function summaryRuntimeSourceFiles(root) {
  const indexPath = "userscripts/index.json";
  const index = JSON.parse(fs.readFileSync(repositoryFile(root, indexPath), "utf8"));
  const files = [indexPath];
  for (const config of Array.isArray(index.configs) ? index.configs : []) {
    if (typeof config?.userscriptFile !== "string" || !config.userscriptFile) {
      throw new Error(`${indexPath}: every Summary config needs userscriptFile`);
    }
    const relativePath = path.posix.join("userscripts", config.userscriptFile);
    repositoryFile(root, relativePath);
    files.push(relativePath);
  }
  return files;
}

function contentRuntimeSourceFiles(root) {
  const files = new Set(summaryRuntimeSourceFiles(root));
  const pending = Object.values(CONTENT_ENTRIES).sort();
  while (pending.length) {
    const file = pending.shift();
    if (file === CONTENT_RUNTIME_VERSION_MODULE || files.has(file)) continue;
    files.add(file);
    for (const dependency of staticImports(root, file).dependencies) {
      if (dependency !== CONTENT_RUNTIME_VERSION_MODULE && !files.has(dependency)) pending.push(dependency);
    }
  }
  return [...files].sort();
}

function contentRuntimeSourceState(root) {
  const files = contentRuntimeSourceFiles(root);
  const hash = crypto.createHash("sha256");
  hash.update(CONTENT_RUNTIME_SOURCE_HASH_DOMAIN).update("\0");
  for (const file of files) {
    const source = fs.readFileSync(repositoryFile(root, file));
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(source.length));
    hash.update(file).update("\0").update(length).update(source);
  }
  return Object.freeze({
    schemaVersion: CONTENT_RUNTIME_SOURCE_STATE_SCHEMA_VERSION,
    sha256: hash.digest("hex"),
    files: Object.freeze(files)
  });
}

function contentRuntimeBundleSourceState(root, outputPath) {
  const output = String(outputPath || "").trim();
  const entry = CONTENT_ENTRIES[output];
  if (!entry) throw new TypeError(`Unknown content runtime output: ${output}`);
  const files = new Set();
  const virtualInputs = new Set();
  const pending = [entry];
  while (pending.length) {
    const file = pending.shift();
    if (file === CONTENT_RUNTIME_VERSION_MODULE || files.has(file)) continue;
    files.add(file);
    const imports = staticImports(root, file);
    for (const virtualInput of imports.virtualInputs) {
      virtualInputs.add(virtualInput);
      if (virtualInput === "chatclub:summary-registry") {
        for (const sourceFile of summaryRuntimeSourceFiles(root)) files.add(sourceFile);
      }
    }
    for (const dependency of imports.dependencies) {
      if (dependency !== CONTENT_RUNTIME_VERSION_MODULE && !files.has(dependency)) pending.push(dependency);
    }
  }
  const sortedFiles = [...files].sort();
  const sortedVirtualInputs = [...virtualInputs].sort();
  const hash = crypto.createHash("sha256");
  hash.update(CONTENT_RUNTIME_BUNDLE_SOURCE_HASH_DOMAIN).update("\0");
  hash.update(output).update("\0").update(entry).update("\0");
  for (const virtualInput of sortedVirtualInputs) hash.update(virtualInput).update("\0");
  for (const file of sortedFiles) {
    const source = fs.readFileSync(repositoryFile(root, file));
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(source.length));
    hash.update(file).update("\0").update(length).update(source);
  }
  return Object.freeze({
    outputPath: output,
    entryPath: entry,
    sourceSha256: hash.digest("hex"),
    files: Object.freeze(sortedFiles),
    virtualInputs: Object.freeze(sortedVirtualInputs)
  });
}

function contentRuntimeBundleSourceStates(root) {
  return Object.freeze(Object.fromEntries(
    Object.keys(CONTENT_ENTRIES).sort().map((outputPath) => [
      outputPath,
      contentRuntimeBundleSourceState(root, outputPath)
    ])
  ));
}

function stableObjectJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableObjectJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableObjectJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentRuntimeBuildRecipeState(root) {
  const packageJson = JSON.parse(fs.readFileSync(repositoryFile(root, "package.json"), "utf8"));
  const esbuildVersion = String(packageJson.devDependencies?.esbuild || "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(esbuildVersion)) {
    throw new Error("package.json must pin an exact esbuild version for the content runtime recipe");
  }
  const descriptor = Object.freeze({
    schemaVersion: CONTENT_RUNTIME_BUILD_RECIPE_SCHEMA_VERSION,
    bundler: Object.freeze({ name: "esbuild", version: esbuildVersion }),
    options: CONTENT_RUNTIME_BUILD_OPTIONS
  });
  const hash = crypto.createHash("sha256");
  hash.update(CONTENT_RUNTIME_BUILD_RECIPE_HASH_DOMAIN).update("\0");
  hash.update(stableObjectJson(descriptor)).update("\0");
  for (const file of CONTENT_RUNTIME_BUILD_RECIPE_FILES) {
    const source = fs.readFileSync(repositoryFile(root, file));
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(source.length));
    hash.update(file).update("\0").update(length).update(source);
  }
  const sha256 = hash.digest("hex");
  return Object.freeze({
    ...descriptor,
    version: `${CONTENT_RUNTIME_BUILD_RECIPE_SCHEMA_VERSION}+recipe.${sha256}`,
    sha256,
    files: CONTENT_RUNTIME_BUILD_RECIPE_FILES
  });
}

function contentRuntimeImplementationSha256(protocolVersion, sourceSha256, buildRecipeSha256) {
  const version = String(protocolVersion || "").trim();
  const sourceDigest = String(sourceSha256 || "").trim().toLowerCase();
  const recipeDigest = String(buildRecipeSha256 || "").trim().toLowerCase();
  if (!version) throw new TypeError("Content runtime protocol version is required");
  if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new TypeError("Content runtime source SHA-256 is invalid");
  if (!/^[a-f0-9]{64}$/.test(recipeDigest)) throw new TypeError("Content runtime build-recipe SHA-256 is invalid");
  return crypto.createHash("sha256")
    .update(CONTENT_RUNTIME_IMPLEMENTATION_HASH_DOMAIN).update("\0")
    .update(version).update("\0")
    .update(sourceDigest).update("\0")
    .update(recipeDigest)
    .digest("hex");
}

function contentRuntimeImplementationVersion(protocolVersion, sourceSha256, buildRecipeSha256) {
  const digest = contentRuntimeImplementationSha256(protocolVersion, sourceSha256, buildRecipeSha256);
  return `${String(protocolVersion).trim()}+implementation.${digest}`;
}

function contentRuntimeBundleImplementationSha256(
  protocolVersion,
  outputPath,
  sourceSha256,
  buildRecipeSha256
) {
  const version = String(protocolVersion || "").trim();
  const output = String(outputPath || "").trim();
  const sourceDigest = String(sourceSha256 || "").trim().toLowerCase();
  const recipeDigest = String(buildRecipeSha256 || "").trim().toLowerCase();
  if (!version) throw new TypeError("Content runtime protocol version is required");
  if (!CONTENT_ENTRIES[output]) throw new TypeError(`Unknown content runtime output: ${output}`);
  if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new TypeError("Content runtime bundle source SHA-256 is invalid");
  if (!/^[a-f0-9]{64}$/.test(recipeDigest)) throw new TypeError("Content runtime build-recipe SHA-256 is invalid");
  return crypto.createHash("sha256")
    .update(CONTENT_RUNTIME_BUNDLE_IMPLEMENTATION_HASH_DOMAIN).update("\0")
    .update(version).update("\0")
    .update(output).update("\0")
    .update(sourceDigest).update("\0")
    .update(recipeDigest)
    .digest("hex");
}

function contentRuntimeBundleIdentities(protocolVersion, bundleSourceStates, buildRecipeSha256) {
  const states = bundleSourceStates && typeof bundleSourceStates === "object" ? bundleSourceStates : {};
  const expectedOutputs = Object.keys(CONTENT_ENTRIES).sort();
  const actualOutputs = Object.keys(states).sort();
  if (!isDeepStrictEqual(actualOutputs, expectedOutputs)) {
    throw new Error(
      `Content runtime bundle source inventory differs; expected ${expectedOutputs.join(", ")}, received ${actualOutputs.join(", ")}`
    );
  }
  return Object.freeze(Object.fromEntries(expectedOutputs.map((outputPath) => {
    const state = states[outputPath];
    if (state?.outputPath !== outputPath || state?.entryPath !== CONTENT_ENTRIES[outputPath]) {
      throw new Error(`Content runtime bundle source identity is invalid: ${outputPath}`);
    }
    const implementationSha256 = contentRuntimeBundleImplementationSha256(
      protocolVersion,
      outputPath,
      state.sourceSha256,
      buildRecipeSha256
    );
    return [outputPath, Object.freeze({
      outputPath,
      entryPath: state.entryPath,
      sourceSha256: state.sourceSha256,
      implementationSha256,
      implementationVersion: `${String(protocolVersion).trim()}+bundle.${implementationSha256}`
    })];
  })));
}

function contentRuntimeRegistryKey(baseKey) {
  const key = String(baseKey || "").trim();
  if (!/^__CHATCLUB_RUNTIME_REGISTRY_V\d+__$/.test(key)) {
    throw new TypeError("Content runtime registry base key is invalid");
  }
  return key;
}

function contentRuntimeVersionModule({
  protocolVersion,
  registryBaseKey,
  sourceSha256,
  buildRecipeVersion,
  buildRecipeSha256,
  bundleSourceStates
}) {
  const implementationSha256 = contentRuntimeImplementationSha256(
    protocolVersion,
    sourceSha256,
    buildRecipeSha256
  );
  const implementationVersion = contentRuntimeImplementationVersion(
    protocolVersion,
    sourceSha256,
    buildRecipeSha256
  );
  const bundleIdentities = contentRuntimeBundleIdentities(
    protocolVersion,
    bundleSourceStates,
    buildRecipeSha256
  );
  const registryKey = contentRuntimeRegistryKey(registryBaseKey);
  const serializedBundles = Object.entries(bundleIdentities)
    .map(([outputPath]) => `  ${JSON.stringify(outputPath)}: ${CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES[outputPath]}`)
    .join(",\n");
  const serializedBundleExports = Object.entries(bundleIdentities)
    .map(([outputPath, identity]) => (
      `export const ${CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES[outputPath]} = /* @__PURE__ */ Object.freeze(${JSON.stringify(identity)});`
    ))
    .join("\n");
  return "// Generated by tools/generate-artifacts.cjs. Do not edit.\n"
    + `export const CONTENT_RUNTIME_PROTOCOL_VERSION = ${JSON.stringify(protocolVersion)};\n`
    + `export const CONTENT_RUNTIME_SOURCE_SHA256 = ${JSON.stringify(sourceSha256)};\n`
    + `export const CONTENT_RUNTIME_BUILD_RECIPE_VERSION = ${JSON.stringify(buildRecipeVersion)};\n`
    + `export const CONTENT_RUNTIME_BUILD_RECIPE_SHA256 = ${JSON.stringify(buildRecipeSha256)};\n`
    + `export const CONTENT_RUNTIME_IMPLEMENTATION_SHA256 = ${JSON.stringify(implementationSha256)};\n`
    + `export const CONTENT_RUNTIME_IMPLEMENTATION_VERSION = ${JSON.stringify(implementationVersion)};\n`
    + `export const CONTENT_RUNTIME_GENERATION = CONTENT_RUNTIME_IMPLEMENTATION_VERSION;\n`
    + `export const CONTENT_RUNTIME_REGISTRY_KEY = ${JSON.stringify(registryKey)};\n`
    + `${serializedBundleExports}\n`
    + `export const CONTENT_RUNTIME_BUNDLE_IDENTITIES = /* @__PURE__ */ Object.freeze({\n${serializedBundles}\n});\n`;
}

function serializableMetadata(value, excludedKeys = []) {
  const excluded = new Set(excludedKeys);
  const source = Object.fromEntries(
    Object.entries(value || {}).filter(([key]) => !excluded.has(key))
  );
  try {
    return JSON.parse(JSON.stringify(source));
  } catch (error) {
    throw new Error(`Metadata is not JSON-serializable: ${error.message}`);
  }
}

function metadataDifferences(expected, actual, excludedKeys = []) {
  const canonical = serializableMetadata(expected, excludedKeys);
  const candidate = serializableMetadata(actual, excludedKeys);
  const keys = [...new Set([...Object.keys(canonical), ...Object.keys(candidate)])].sort();
  return keys.filter((key) => !isDeepStrictEqual(canonical[key], candidate[key]));
}

function assertSummaryCatalogMetadata(configs, catalog) {
  if (!Array.isArray(catalog) || catalog.length !== configs.length) {
    throw new Error("shared/summary-sites.js: lightweight catalog does not match userscripts/index.json");
  }
  for (let index = 0; index < configs.length; index += 1) {
    const expected = configs[index];
    const descriptor = catalog[index];
    if (descriptor?.id !== expected.id) {
      throw new Error(
        `shared/summary-sites.js: catalog order/id at index ${index} is ${JSON.stringify(descriptor?.id)}; expected ${JSON.stringify(expected.id)}`
      );
    }
    if (Object.hasOwn(descriptor, "userscript")) {
      throw new Error(`shared/summary-sites.js: ${expected.id} must not embed a userscript body`);
    }
    const differences = metadataDifferences(expected, descriptor, ["userscript"]);
    if (differences.length) {
      throw new Error(
        `shared/summary-sites.js: ${expected.id} metadata drifted from userscripts/index.json: ${differences.join(", ")}`
      );
    }
  }
}

function normalizeUserscriptSource(source) {
  return String(source || "").replace(/\r\n?/g, "\n").trim();
}

function userscriptVersion(source, file = "userscript") {
  const version = normalizeUserscriptSource(source).match(/^\/\/\s*@version\s+(\S+)\s*$/m)?.[1];
  if (!version) throw new Error(`${file}: missing @version`);
  return version;
}

function assertTopicDeleteDescriptors(sources, descriptors) {
  const expectedIds = Object.keys(TOPIC_DELETE_OUTPUTS).sort();
  const sourceIds = Object.keys(sources || {}).sort();
  if (!isDeepStrictEqual(sourceIds, expectedIds)) {
    throw new Error(
      `build-src/topic-delete-userscript-sources.js: source ids differ from generated output inventory; expected ${expectedIds.join(", ")}, received ${sourceIds.join(", ")}`
    );
  }
  if (!Array.isArray(descriptors)) {
    throw new Error("shared/topic-delete-sites.js: TOPIC_DELETE_SITE_CONFIGS must be an array");
  }
  const descriptorsById = new Map();
  for (const descriptor of descriptors) {
    if (!descriptor?.id || descriptorsById.has(descriptor.id)) {
      throw new Error(`shared/topic-delete-sites.js: duplicate or missing descriptor id ${JSON.stringify(descriptor?.id)}`);
    }
    descriptorsById.set(descriptor.id, descriptor);
  }
  const descriptorIds = [...descriptorsById.keys()].sort();
  if (!isDeepStrictEqual(descriptorIds, expectedIds)) {
    throw new Error(
      `shared/topic-delete-sites.js: descriptor ids differ from generated output inventory; expected ${expectedIds.join(", ")}, received ${descriptorIds.join(", ")}`
    );
  }
  for (const id of expectedIds) {
    const filename = TOPIC_DELETE_OUTPUTS[id];
    const outputPath = `topic-delete-userscripts/${filename}`;
    const source = normalizeUserscriptSource(sources[id]);
    const descriptor = descriptorsById.get(id);
    if (descriptor.userscriptFile !== outputPath) {
      throw new Error(`shared/topic-delete-sites.js: ${id}.userscriptFile must equal ${outputPath}`);
    }
    const version = userscriptVersion(source, outputPath);
    if (descriptor.scriptVersion !== version) {
      throw new Error(
        `shared/topic-delete-sites.js: ${id}.scriptVersion ${JSON.stringify(descriptor.scriptVersion)} does not match generated @version ${JSON.stringify(version)}`
      );
    }
    if (descriptor.userscriptLength !== source.length) {
      throw new Error(
        `shared/topic-delete-sites.js: ${id}.userscriptLength ${descriptor.userscriptLength} does not match generated length ${source.length}`
      );
    }
  }
}

function generatedArtifactDirectInputFiles(root) {
  const files = new Set(GENERATED_ARTIFACT_DIRECT_INPUT_FILES);
  const indexPath = path.join(root, "userscripts/index.json");
  if (fs.lstatSync(indexPath, { throwIfNoEntry: false })) {
    const index = JSON.parse(fs.readFileSync(repositoryFile(root, "userscripts/index.json"), "utf8"));
    for (const config of Array.isArray(index.configs) ? index.configs : []) {
      if (typeof config?.userscriptFile === "string" && config.userscriptFile) {
        files.add(`userscripts/${config.userscriptFile}`);
      }
    }
  }
  return [...files].sort();
}

function missingGeneratedArtifactDirectInputs(root) {
  return generatedArtifactDirectInputFiles(root).filter((file) => (
    !fs.lstatSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()
  ));
}

function assertGeneratedArtifactDirectInputs(root) {
  for (const file of generatedArtifactDirectInputFiles(root)) {
    if (fs.lstatSync(path.join(root, file), { throwIfNoEntry: false })) repositoryFile(root, file);
  }
  const missing = missingGeneratedArtifactDirectInputs(root);
  if (!missing.length) return;
  throw new Error(
    `Declared direct generated-artifact inputs are missing:\n${missing.map((file) => `  - ${file}`).join("\n")}`
  );
}

function filesUnder(directory, prefix) {
  const directoryEntry = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (directoryEntry?.isSymbolicLink()) {
    throw new Error(`Generated artifact directory is a symbolic link: ${prefix}`);
  }
  if (!directoryEntry?.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Generated artifact is a symbolic link: ${relative}`);
    if (entry.isDirectory()) files.push(...filesUnder(absolute, relative));
    else if (entry.isFile()) files.push(relative.replace(/\\/g, "/"));
  }
  return files;
}

function unexpectedGeneratedArtifacts(root) {
  const expected = new Set(GENERATED_ARTIFACT_FILES);
  return ["content", "topic-delete-userscripts"]
    .flatMap((directory) => filesUnder(path.join(root, directory), directory))
    .filter((file) => !expected.has(file))
    .sort();
}

function assertGeneratedArtifactInventory(root) {
  const unexpected = unexpectedGeneratedArtifacts(root);
  if (!unexpected.length) return;
  throw new Error(
    `Generated artifact directories contain unowned files:\n${unexpected.map((file) => `  - ${file}`).join("\n")}\n`
    + "Remove them or declare their canonical source in tools/generated-artifacts.cjs."
  );
}

module.exports = {
  CONTENT_ENTRIES,
  CONTENT_RUNTIME_BUNDLE_EXPORT_NAMES,
  CONTENT_RUNTIME_VERSION_MODULE,
  TOPIC_DELETE_OUTPUTS,
  TOPIC_DELETE_SOURCE_FILES,
  CONTENT_OUTPUT_FILES,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  TOPIC_DELETE_OUTPUT_FILES,
  GENERATED_ARTIFACT_FILES,
  GENERATED_ARTIFACT_DIRECT_INPUT_FILES,
  CONTENT_RUNTIME_SOURCE_STATE_SCHEMA_VERSION,
  CONTENT_RUNTIME_BUILD_RECIPE_SCHEMA_VERSION,
  CONTENT_RUNTIME_BUILD_RECIPE_FILES,
  CONTENT_RUNTIME_BUILD_OPTIONS,
  contentRuntimeSourceFiles,
  contentRuntimeSourceState,
  contentRuntimeBundleSourceState,
  contentRuntimeBundleSourceStates,
  contentRuntimeBuildRecipeState,
  contentRuntimeImplementationSha256,
  contentRuntimeImplementationVersion,
  contentRuntimeBundleImplementationSha256,
  contentRuntimeBundleIdentities,
  contentRuntimeRegistryKey,
  contentRuntimeVersionModule,
  metadataDifferences,
  assertSummaryCatalogMetadata,
  normalizeUserscriptSource,
  userscriptVersion,
  assertTopicDeleteDescriptors,
  generatedArtifactDirectInputFiles,
  missingGeneratedArtifactDirectInputs,
  assertGeneratedArtifactDirectInputs,
  unexpectedGeneratedArtifacts,
  assertGeneratedArtifactInventory
};
