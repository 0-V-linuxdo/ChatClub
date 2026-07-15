const fs = require("node:fs");
const path = require("node:path");

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
const TOPIC_DELETE_OUTPUT_FILES = Object.freeze(
  Object.values(TOPIC_DELETE_OUTPUTS).map((file) => `topic-delete-userscripts/${file}`).sort()
);
const GENERATED_ARTIFACT_FILES = Object.freeze([
  ...CONTENT_OUTPUT_FILES,
  ...TOPIC_DELETE_OUTPUT_FILES
].sort());

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
  TOPIC_DELETE_OUTPUT_FILES,
  GENERATED_ARTIFACT_FILES,
  unexpectedGeneratedArtifacts,
  assertGeneratedArtifactInventory
};
