#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { enforceNodeVersion } = require("./node-version.cjs");

const root = path.resolve(__dirname, "..");
enforceNodeVersion({ context: "Node regression tests", strict: true });
const toolsDirectory = path.join(root, "tools");
const tests = fs.readdirSync(toolsDirectory)
  .filter((name) => name.endsWith("-test.cjs"))
  .sort()
  .map((name) => `tools/${name}`);

if (!tests.length) throw new Error("No Node regression scripts were discovered");

const ambiguousTests = fs.readdirSync(toolsDirectory)
  .filter((name) => /-test\.(?:js|mjs)$/.test(name));
if (ambiguousTests.length) {
  throw new Error(`Node tests must use the -test.cjs suffix: ${ambiguousTests.join(", ")}`);
}

for (const test of tests) {
  console.log(`\n> ${test}`);
  const result = spawnSync(process.execPath, [test], {
    cwd: root,
    stdio: "inherit",
    timeout: 60000,
    killSignal: "SIGTERM"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\n${tests.length} Node regression scripts passed.`);
