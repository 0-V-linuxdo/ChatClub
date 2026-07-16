const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

const CONTENT_ENTRIES = Object.freeze({
  "content/content.js": "content-src/content.js",
  "content/preload.js": "content-src/preload.js",
  "content/summary-userscripts.js": "content-src/summary-userscripts.js",
  "content/summary-userscripts-main.js": "content-src/summary-userscripts-main.js",
  "content/message-navigator.js": "content-src/message-navigator.js",
  "content/grok-cookie-bridge.js": "content-src/grok-cookie-bridge.js"
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

const CONTENT_OUTPUT_FILES = Object.freeze(Object.keys(CONTENT_ENTRIES).sort());
const FIREFOX_CONTENT_FALLBACK_OUTPUT = "background/firefox-content-fallbacks.generated.js";
const TOPIC_DELETE_OUTPUT_FILES = Object.freeze(
  Object.values(TOPIC_DELETE_OUTPUTS).map((file) => `topic-delete-userscripts/${file}`).sort()
);
const GENERATED_ARTIFACT_FILES = Object.freeze([
  ...CONTENT_OUTPUT_FILES,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  ...TOPIC_DELETE_OUTPUT_FILES
].sort());

// Files opened directly by the generator. esbuild owns and resolves the
// transitive dependency closure behind each content entry point.
const GENERATED_ARTIFACT_DIRECT_INPUT_FILES = Object.freeze([
  ...Object.values(CONTENT_ENTRIES),
  "shared/protocol.js",
  "shared/summary-sites.js",
  "shared/topic-delete-sites.js",
  "shared/topic-delete-userscript-sources.js",
  "userscripts/index.json"
].sort());

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
      `shared/topic-delete-userscript-sources.js: source ids differ from generated output inventory; expected ${expectedIds.join(", ")}, received ${sourceIds.join(", ")}`
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
  if (fs.statSync(indexPath, { throwIfNoEntry: false })?.isFile()) {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
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
    !fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()
  ));
}

function assertGeneratedArtifactDirectInputs(root) {
  const missing = missingGeneratedArtifactDirectInputs(root);
  if (!missing.length) return;
  throw new Error(
    `Declared direct generated-artifact inputs are missing:\n${missing.map((file) => `  - ${file}`).join("\n")}`
  );
}

function filesUnder(directory, prefix) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
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
  TOPIC_DELETE_OUTPUTS,
  CONTENT_OUTPUT_FILES,
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  TOPIC_DELETE_OUTPUT_FILES,
  GENERATED_ARTIFACT_FILES,
  GENERATED_ARTIFACT_DIRECT_INPUT_FILES,
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
