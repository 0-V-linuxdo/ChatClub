#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { RELEASE_PREFLIGHT } = require("./release-pack.cjs");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.scripts.pack, "node tools/release-pack.cjs");
assert.equal(packageJson.scripts["pack:firefox"], "node tools/release-pack.cjs --target firefox");
assert.deepEqual(RELEASE_PREFLIGHT, [
  ["tools/check.cjs"],
  ["tools/run-node-tests.cjs"]
]);
assert.doesNotMatch(packageJson.scripts.pack, /npm run pack/);

console.log("release pack fail-closed preflight: ok");
