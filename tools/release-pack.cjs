#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { enforceNodeVersion } = require("./node-version.cjs");

const root = path.resolve(__dirname, "..");
const RELEASE_PREFLIGHT = Object.freeze([
  Object.freeze(["tools/check.cjs"]),
  Object.freeze(["tools/run-node-tests.cjs"])
]);

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function releasePack(args = process.argv.slice(2)) {
  enforceNodeVersion({ context: "Release packaging", strict: true });
  for (const [script, ...scriptArgs] of RELEASE_PREFLIGHT) run(script, scriptArgs);
  run("tools/pack-extension.cjs", args);
}

if (require.main === module) {
  try {
    releasePack();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = { RELEASE_PREFLIGHT };
