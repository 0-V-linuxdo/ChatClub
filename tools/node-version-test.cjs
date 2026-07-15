#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  SUPPORTED_NODE_MAJORS,
  nodeMajor,
  supportedNodeVersion,
  enforceNodeVersion
} = require("./node-version.cjs");

assert.deepEqual(SUPPORTED_NODE_MAJORS, [22, 24]);
assert.equal(nodeMajor("24.1.0"), 24);
assert.equal(supportedNodeVersion("22.15.0"), true);
assert.equal(supportedNodeVersion("24.0.0"), true);
assert.equal(supportedNodeVersion("23.11.0"), false);
assert.equal(supportedNodeVersion("19.6.1"), false);
assert.throws(
  () => enforceNodeVersion({ context: "Release packaging", strict: true, version: "19.6.1" }),
  /Release packaging requires Node\.js 22\.x or 24\.x/
);
let warning = "";
assert.equal(enforceNodeVersion({
  context: "Local diagnostics",
  strict: false,
  version: "19.6.1",
  warn: (message) => { warning = message; }
}), false);
assert.match(warning, /Warning: Local diagnostics requires Node\.js 22\.x or 24\.x/);

console.log("Node release runtime guard: ok");
