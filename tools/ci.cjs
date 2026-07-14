#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const commands = [
  ["tools/check.cjs"],
  ["tools/run-node-tests.cjs"],
  ["tools/pack-extension.cjs", "--check"]
];

for (const [script, ...args] of commands) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("CI verification passed.");
