#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  TOPIC_DELETE_OUTPUTS,
  TOPIC_DELETE_SOURCE_FILES
} = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lineCount = (source) => source.split(/\r?\n/).length;
const sha256 = (source) => crypto.createHash("sha256").update(source).digest("hex");

(async () => {
  assert.deepEqual(TOPIC_DELETE_SOURCE_FILES, [
    "build-src/topic-delete-gemini-helpers.js",
    "build-src/topic-delete-userscript-engine-core.js",
    "build-src/topic-delete-userscript-engine-sites.js",
    "build-src/topic-delete-userscript-sources.js"
  ]);
  for (const file of TOPIC_DELETE_SOURCE_FILES) {
    const lines = lineCount(read(file));
    assert.ok(lines < 1200, `${file} must remain below 1200 lines; received ${lines}`);
  }

  const assembly = read("build-src/topic-delete-userscript-sources.js");
  assert.match(assembly, /from "\.\/topic-delete-gemini-helpers\.js"/);
  assert.match(assembly, /from "\.\/topic-delete-userscript-engine-core\.js"/);
  assert.match(assembly, /from "\.\/topic-delete-userscript-engine-sites\.js"/);
  assert.match(assembly, /DELETE_USERSCRIPT_ENGINE_CORE \+ DELETE_USERSCRIPT_ENGINE_SITES/);
  assert.doesNotMatch(assembly, /const GEMINI_CONVERSATION_ACTION_SELECTOR/);
  assert.doesNotMatch(assembly, /function deepSeekCurrentRow/);

  const sizeAllowlist = JSON.parse(read("tools/module-size-allowlist.json"));
  for (const file of TOPIC_DELETE_SOURCE_FILES) {
    assert.equal(
      Object.hasOwn(sizeAllowlist, file),
      false,
      `${file} must not retain a module-size exception after the split`
    );
  }

  const moduleUrl = `${pathToFileURL(path.join(root, "build-src/topic-delete-userscript-sources.js")).href}?test=${Date.now()}`;
  const { TOPIC_DELETE_USERSCRIPT_SOURCES } = await import(moduleUrl);
  const hashes = {};
  for (const [id, filename] of Object.entries(TOPIC_DELETE_OUTPUTS)) {
    const expected = read(`topic-delete-userscripts/${filename}`);
    const actual = TOPIC_DELETE_USERSCRIPT_SOURCES[id];
    assert.equal(typeof actual, "string", `${id} must export a userscript string`);
    assert.equal(actual, expected, `${id} split modules must reproduce the generated userscript byte-for-byte`);
    hashes[id] = sha256(actual);
  }
  assert.equal(Object.keys(hashes).length, 7);

  console.log(`topic Delete build modules: ok (${JSON.stringify(hashes)})`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
