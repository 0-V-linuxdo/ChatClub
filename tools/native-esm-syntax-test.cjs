#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { NATIVE_BROWSER_TARGETS, nativeEsmSyntaxRequiresLowering } = require("./native-esm-syntax.cjs");

(async () => {
  const verifier = fs.readFileSync(path.join(__dirname, "verify-modules.mjs"), "utf8");
  assert.match(verifier, /nativeEsmSyntaxRequiresLowering\(source, file\)/);
  assert.match(verifier, /nativeRuntimeModules\.has\(file\)/);
  assert.deepEqual(NATIVE_BROWSER_TARGETS, ["chrome120", "firefox136"]);
  const supported = await nativeEsmSyntaxRequiresLowering(
    'const value = globalThis.config?.value ?? "fallback";\nexport { value };\n',
    "supported.js"
  );
  assert.equal(supported.requiresLowering, false);

  const future = await nativeEsmSyntaxRequiresLowering(
    "using resource = acquire();\nexport { resource };\n",
    "future.js"
  );
  assert.equal(future.requiresLowering, true, "syntax that esbuild lowers for Chrome 120 must be rejected for native ESM");
  assert.doesNotMatch(future.nativeCode, /__using/);
  assert.match(future.targetedCode, /__using/);

  console.log("native ESM target syntax guard: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
