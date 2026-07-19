#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { CONTENT_ENTRIES } = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

(async () => {
  const [packageIdentity, generated] = await Promise.all([
    load("shared/content-runtime-package-identity.js"),
    load("shared/content-runtime-version.generated.js")
  ]);
  assert.deepEqual(
    Object.keys(generated.CONTENT_RUNTIME_BUNDLE_IDENTITIES),
    Object.keys(CONTENT_ENTRIES).sort(),
    "the generated runtime identity must enumerate every packaged content bundle"
  );
  for (const outputPath of Object.keys(CONTENT_ENTRIES)) {
    const entryIdentity = packageIdentity.contentRuntimeIdentityForBundle(outputPath);
    assert.equal(packageIdentity.contentRuntimePackageBundleIdentityMatches(entryIdentity, outputPath), true);
    assert.equal(entryIdentity.bundle.outputPath, outputPath);
    assert.equal(entryIdentity.bundle.entryPath, CONTENT_ENTRIES[outputPath]);
    assert.equal(Object.isFrozen(entryIdentity), true);
    assert.equal(Object.isFrozen(entryIdentity.bundle), true);
    assert.equal(
      packageIdentity.contentRuntimePackageBundleIdentityMatches({
        ...entryIdentity,
        bundle: { ...entryIdentity.bundle, implementationSha256: "0".repeat(64) }
      }, outputPath),
      false,
      `${outputPath} must reject a different bundle digest within the same generation`
    );
  }
  assert.throws(
    () => packageIdentity.contentRuntimeIdentityForBundle("content/not-packaged.js"),
    /Unknown packaged content runtime bundle/
  );
  console.log("content runtime generation and bundle identities: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
