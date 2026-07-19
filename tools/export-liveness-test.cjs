#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyzeNamedExportLiveness } = require("./export-liveness.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-export-liveness-"));

function write(file, source) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function analyze(allowlist = {}) {
  const moduleFiles = [
    "app/entry.js",
    "app/dynamic.js",
    "app/namespace.js",
    "shared/barrel.js",
    "shared/core.js",
    "shared/dynamic-all.js",
    "shared/star.js"
  ];
  return analyzeNamedExportLiveness({
    root,
    moduleFiles,
    reportFiles: moduleFiles,
    runtimeConsumerFiles: moduleFiles,
    toolFiles: ["tools/build.cjs"],
    testFiles: ["tools/feature-test.cjs", "tools/loader-test.cjs"],
    allowlist
  });
}

try {
  write("shared/core.js", `
export const named = 1;
export const throughNamedReexport = 2;
export const throughStar = 3;
export const namespaceProperty = 4;
export const namespaceUnused = 5;
export const dynamicNamed = 6;
export const toolOnly = 8;
export const testOnly = 9;
export const publicApi = 10;
export const loaderDirect = 11;
export const loaderArray = 12;
export function selfUsedHelper() { return 11; }
void selfUsedHelper();
`.trimStart());
  write("shared/barrel.js", `
export { throughNamedReexport as renamed } from "./core.js";
export * from "./star.js";
`.trimStart());
  write("shared/star.js", 'export { throughStar } from "./core.js";\n');
  write("shared/dynamic-all.js", "export const first = 1;\nexport const second = 2;\n");
  write("app/namespace.js", `
import * as core from "../shared/core.js";
globalThis.__namespaceFixture = core.namespaceProperty;
`.trimStart());
  write("app/dynamic.js", `
const { dynamicNamed } = await import("../shared/core.js");
globalThis.__dynamicNamedFixture = dynamicNamed;
void import("../shared/dynamic-all.js").then((module) => { globalThis.__dynamicNamespaceFixture = module.first; });
`.trimStart());
  write("app/entry.js", `
import { named } from "../shared/core.js";
import { renamed, throughStar } from "../shared/barrel.js";
import "./namespace.js";
import "./dynamic.js";
globalThis.__entryFixture = named + renamed + throughStar;
`.trimStart());
  write("tools/build.cjs", `
(async () => {
  const { toolOnly } = await import("../shared/core.js");
  globalThis.__toolFixture = toolOnly;
})();
`.trimStart());
  write("tools/feature-test.cjs", `
(async () => {
  const { testOnly } = await import("../shared/core.js");
  void testOnly;
})();
`.trimStart());
  write("tools/loader-test.cjs", `
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const load = (file) => import(\`${"${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}"}\`);
(async () => {
  const direct = await load("shared/core.js");
  void direct.loaderDirect;
  const [{ loaderArray }] = await Promise.all([load("shared/core.js")]);
  void loaderArray;
})();
`.trimStart());

  const baseline = analyze();
  assert.deepEqual(
    baseline.candidates.map(({ key, classification }) => [key, classification]),
    [
      ["shared/core.js#loaderArray", "test-only"],
      ["shared/core.js#loaderDirect", "test-only"],
      ["shared/core.js#namespaceUnused", "public-or-unused"],
      ["shared/core.js#publicApi", "public-or-unused"],
      ["shared/core.js#selfUsedHelper", "internal-only"],
      ["shared/core.js#testOnly", "test-only"]
    ]
  );
  assert.ok(
    baseline.errors.some((error) => /selfUsedHelper is used only inside its defining module/.test(error)),
    "self-use keeps a binding live but must not justify its export surface"
  );
  assert.ok(baseline.stats.namedRuntimeDemands > 0);
  assert.ok(baseline.stats.namespaceRuntimeDemands > 0, "dynamic namespace imports must be classified");
  assert.ok(baseline.stats.toolDemands > 0, "build-tool consumers must keep build APIs live");

  const allowed = analyze({
    "shared/core.js#namespaceUnused": {
      kind: "public-api",
      reason: "Fixture external API intentionally has no repository-local consumer."
    },
    "shared/core.js#loaderArray": {
      kind: "test-only",
      reason: "Fixture uses a literal loader through Promise.all array destructuring in a focused test."
    },
    "shared/core.js#loaderDirect": {
      kind: "test-only",
      reason: "Fixture uses a literal loader and namespace property access in a focused test."
    },
    "shared/core.js#publicApi": {
      kind: "public-api",
      reason: "Fixture public contract remains available to an external integration."
    },
    "shared/core.js#selfUsedHelper": {
      kind: "public-api",
      reason: "Fixture keeps an internally exercised helper available to an external integration."
    },
    "shared/core.js#testOnly": {
      kind: "test-only",
      reason: "Fixture exposes deterministic state only to the focused regression test."
    }
  });
  assert.deepEqual(allowed.errors, []);
  assert.equal(allowed.stats.exceptions, 6);

  const stale = analyze({
    "shared/core.js#named": {
      kind: "public-api",
      reason: "Fixture stale exception must be rejected after gaining a runtime consumer."
    }
  });
  assert.ok(stale.errors.some((error) => /stale runtime entry: shared\/core\.js#named/.test(error)));

  const wrongKind = analyze({
    "shared/core.js#testOnly": {
      kind: "public-api",
      reason: "Fixture deliberately misclassifies an API whose only consumer is a test."
    }
  });
  assert.ok(wrongKind.errors.some((error) => /only detected consumer is a test/.test(error)));

  console.log("named export runtime, namespace, dynamic, loader-helper, re-export, self-use, tool, and test liveness: ok");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
