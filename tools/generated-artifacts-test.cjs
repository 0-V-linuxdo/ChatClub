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
  unexpectedGeneratedArtifacts,
  assertGeneratedArtifactInventory
} = require("./generated-artifacts.cjs");

assert.equal(Object.keys(CONTENT_ENTRIES).length, 6);
assert.equal(Object.keys(TOPIC_DELETE_OUTPUTS).length, 7);
assert.equal(FIREFOX_CONTENT_FALLBACK_OUTPUT, "background/firefox-content-fallbacks.generated.js");
assert.equal(GENERATED_ARTIFACT_FILES.length, 14);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-generated-inventory-"));
try {
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
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("generated artifact closed-world inventory: ok");
