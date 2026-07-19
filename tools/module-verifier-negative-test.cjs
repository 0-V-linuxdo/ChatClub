#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const verifier = path.join(root, "tools/verify-modules.mjs");

function baseFiles() {
  return {
    "app/main.js": 'import { value } from "../shared/value.js";\nglobalThis.__fixtureAppValue = value;\n',
    "background/service-worker.js": 'import { value } from "../shared/value.js";\nglobalThis.__fixtureBackgroundValue = value;\n',
    "background/firefox-background.js": 'import "./service-worker.js";\n',
    "shared/value.js": "export const value = 1;\n"
  };
}

const fixtureBasePackagedFiles = Object.keys(baseFiles()).sort();

function writeFixtureFile(directory, relativePath, source) {
  const absolutePath = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source);
}

function runFixture(name, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `chatclub-module-${name}-`));
  const files = { ...baseFiles(), ...(options.files || {}) };
  try {
    for (const [file, source] of Object.entries(files)) writeFixtureFile(directory, file, source);
    const defaultPackagedFiles = Object.keys(files)
      .filter((file) => file.endsWith(".js") && !file.startsWith("content-src/") && !file.startsWith("build-src/"))
      .sort();
    const commonPackagedFiles = options.packagedFiles || defaultPackagedFiles;
    const defaultChromiumFiles = commonPackagedFiles.filter((file) => file !== "background/firefox-background.js");
    const chromiumFiles = [...(options.chromiumFiles || defaultChromiumFiles)].sort();
    const firefoxFiles = [...(options.firefoxFiles || commonPackagedFiles)].sort();
    const config = {
      root: ".",
      verifyToolchain: false,
      verifySizes: options.verifySizes === true,
      verifyExportLiveness: options.verifyExportLiveness === true,
      verifyNativeEntryBudgets: options.verifyNativeEntryBudgets === true,
      contentEntryPoints: options.contentEntryPoints || [],
      contentSafeSharedModules: options.contentSafeSharedModules || [],
      buildEntryPoints: options.buildEntryPoints || [],
      nativeEsmReachabilityAllowlist: options.nativeEsmReachabilityAllowlist || {},
      exportLivenessAllowlist: options.exportLivenessAllowlist || {},
      nativeEntryBudgets: options.nativeEntryBudgets || {},
      testFiles: options.testFiles || [],
      plans: {
        chromium: {
          files: chromiumFiles,
          manifest: { background: { service_worker: "background/service-worker.js", type: "module" } }
        },
        firefox: {
          files: firefoxFiles,
          manifest: { background: { scripts: ["background/firefox-background.js"], type: "module" } }
        }
      }
    };
    const configPath = path.join(directory, "fixture.json");
    if (options.sizeAllowlist) {
      writeFixtureFile(
        directory,
        "tools/module-size-allowlist.json",
        `${JSON.stringify(options.sizeAllowlist, null, 2)}\n`
      );
    }
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const result = spawnSync(process.execPath, [verifier, "--fixture", configPath], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000
    });
    if (result.error) throw result.error;
    return {
      status: result.status,
      output: `${result.stdout || ""}${result.stderr || ""}`
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function assertFixturePasses(name, options = {}) {
  const result = runFixture(name, options);
  assert.equal(result.status, 0, `${name} unexpectedly failed:\n${result.output}`);
  return result;
}

function assertFixtureFails(name, options, expected) {
  const result = runFixture(name, options);
  assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
  assert.match(result.output, expected, `${name} failed for the wrong reason:\n${result.output}`);
}

assertFixturePasses("positive-locals", {
  files: {
    "app/main.js": 'import { exerciseLocalBindings } from "./feature.js";\nexerciseLocalBindings(() => 1, {}, {}, class LocalFunction {}, () => {});\n',
    "app/feature.js": `
const registry = { require(value) { return value; } };
export function exerciseLocalBindings(require, module, exports, Function, importScripts) {
  module.exports = exports;
  importScripts();
  return registry.require(require()) + new Function().valueOf();
}
`.trimStart()
  }
});

assertFixtureFails("cycle", {
  files: {
    "app/main.js": 'import "./cycle.js";\nexport const main = true;\n',
    "app/cycle.js": 'import "./main.js";\nexport const cycle = true;\n'
  }
}, /ESM cycle: app\/cycle\.js -> app\/main\.js -> app\/cycle\.js/);

assertFixtureFails("illegal-layer", {
  files: {
    "app/main.js": 'import "../background/helper.js";\n',
    "background/helper.js": "export const helper = true;\n"
  }
}, /app\/main\.js: illegal app -> background dependency: background\/helper\.js/);

assertFixtureFails("computed-import", {
  files: {
    "app/main.js": 'const target = "./feature.js";\nvoid import(target);\n',
    "app/feature.js": "export const feature = true;\n"
  }
}, /app\/main\.js: computed dynamic import is forbidden/);

assertFixtureFails("unused-named-export", {
  files: {
    "app/main.js": 'import "./feature.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureValue = value;\n',
    "app/feature.js": "export const unusedFeature = 1;\n"
  },
  verifyExportLiveness: true
}, /app\/feature\.js: named export unusedFeature has no runtime consumer or internal use/);

assertFixtureFails("internal-only-named-export", {
  files: {
    "app/main.js": 'import "./feature.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureValue = value;\n',
    "app/feature.js": "export function internalHelper() { return 1; }\nglobalThis.__internalHelper = internalHelper();\n"
  },
  verifyExportLiveness: true
}, /app\/feature\.js: named export internalHelper is used only inside its defining module/);

const testOnlyFixtureFiles = {
  "app/main.js": 'import "./feature.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureValue = value;\n',
  "app/feature.js": "export const testHook = 1;\n",
  "tools/feature-test.cjs": '(async () => { const { testHook } = await import("../app/feature.js"); void testHook; })();\n'
};
assertFixtureFails("test-only-named-export", {
  files: testOnlyFixtureFiles,
  testFiles: ["tools/feature-test.cjs"],
  verifyExportLiveness: true
}, /app\/feature\.js: named export testHook is consumed only by tests/);

const reasonedTestOnlyResult = assertFixturePasses("reasoned-test-only-export", {
  files: testOnlyFixtureFiles,
  testFiles: ["tools/feature-test.cjs"],
  exportLivenessAllowlist: {
    "app/feature.js#testHook": {
      kind: "test-only",
      reason: "Fixture exposes deterministic state only to its focused regression consumer."
    }
  },
  verifyExportLiveness: true
});
assert.match(reasonedTestOnlyResult.output, /\d+ named exports analyzed with 1 exceptions/);

assertFixtureFails("stale-export-allowlist", {
  files: {
    "app/main.js": 'import { feature } from "./feature.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureValue = value + feature;\n',
    "app/feature.js": "export const feature = 1;\n"
  },
  exportLivenessAllowlist: {
    "app/feature.js#feature": {
      kind: "public-api",
      reason: "Fixture exception must become stale after a runtime consumer is introduced."
    }
  },
  verifyExportLiveness: true
}, /export liveness allowlist contains stale runtime entry: app\/feature\.js#feature/);

const nativeBudgetReason = "Native entry closures are held to their exact current dependency and source-byte footprint.";
const lazyBudgetReason = "The lazy controller remains outside the initial graph and its exact incremental static footprint is ratcheted.";
const nativeBudgetFiles = {
  "app/main.js": 'import "./runtime.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureAppValue = value;\n',
  "app/runtime.js": 'void import("./pocket/controller.js");\nvoid import("./settings/controller.js");\nvoid import("./summary/controller.js");\n',
  "app/lazy-common.js": "export const lazyCommon = true;\n",
  "app/pocket/controller.js": 'import { lazyCommon } from "../lazy-common.js";\nglobalThis.__fixturePocket = lazyCommon;\n',
  "app/settings/controller.js": 'import { lazyCommon } from "../lazy-common.js";\nglobalThis.__fixtureSettings = lazyCommon;\n',
  "app/summary/controller.js": 'import { lazyCommon } from "../lazy-common.js";\nglobalThis.__fixtureSummary = lazyCommon;\n'
};
const nativeBudgetSources = { ...baseFiles(), ...nativeBudgetFiles };
const byteSum = (...files) => files.reduce(
  (total, file) => total + Buffer.byteLength(nativeBudgetSources[file]),
  0
);
const appBudgetBytes = byteSum("app/main.js", "app/runtime.js", "shared/value.js");
const backgroundBudgetBytes = byteSum("background/service-worker.js", "shared/value.js");
const firefoxBudgetBytes = byteSum(
  "background/firefox-background.js",
  "background/service-worker.js",
  "shared/value.js"
);
const exactNativeEntryBudgets = {
  entries: {
    "app/main.js": {
      maxFiles: 3,
      targetFiles: 2,
      maxSourceBytes: appBudgetBytes,
      targetSourceBytes: appBudgetBytes - 1,
      reason: nativeBudgetReason
    },
    "background/service-worker.js": {
      maxFiles: 2,
      targetFiles: 1,
      maxSourceBytes: backgroundBudgetBytes,
      targetSourceBytes: backgroundBudgetBytes - 1,
      reason: nativeBudgetReason
    },
    "background/firefox-background.js": {
      maxFiles: 3,
      targetFiles: 2,
      maxSourceBytes: firefoxBudgetBytes,
      targetSourceBytes: firefoxBudgetBytes - 1,
      reason: nativeBudgetReason
    }
  },
  lazyBoundaries: Object.fromEntries([
    "app/pocket/controller.js",
    "app/settings/controller.js",
    "app/summary/controller.js"
  ].map((target) => [target, {
    owner: "app/runtime.js",
    maxFiles: 2,
    targetFiles: 1,
    maxSourceBytes: byteSum(target, "app/lazy-common.js"),
    targetSourceBytes: byteSum(target, "app/lazy-common.js") - 1,
    reason: lazyBudgetReason
  }]))
};

const nativeBudgetResult = assertFixturePasses("native-entry-budget-exact", {
  files: nativeBudgetFiles,
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: exactNativeEntryBudgets
});
assert.match(nativeBudgetResult.output, /3 initial-static entry closures and 3 lazy-boundary increments ratcheted/);

assertFixtureFails("native-entry-budget-exceeded", {
  files: {
    ...nativeBudgetFiles,
    "app/main.js": 'import "./runtime.js";\nimport "./feature.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureAppValue = value;\n',
    "app/feature.js": "globalThis.__fixtureFeature = true;\n"
  },
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: exactNativeEntryBudgets
}, /app\/main\.js: static footprint has 4 files, above budget 3/);

assertFixtureFails("firefox-entry-budget-exceeded", {
  files: {
    ...nativeBudgetFiles,
    "background/firefox-background.js": 'import "./firefox-only.js";\nimport "./service-worker.js";\n',
    "background/firefox-only.js": "globalThis.__fixtureFirefoxOnly = true;\n"
  },
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: exactNativeEntryBudgets
}, /background\/firefox-background\.js: static footprint has 4 files, above budget 3/);

assertFixtureFails("native-entry-budget-must-decrease", {
  files: nativeBudgetFiles,
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: {
    ...exactNativeEntryBudgets,
    entries: {
      ...exactNativeEntryBudgets.entries,
      "app/main.js": {
        ...exactNativeEntryBudgets.entries["app/main.js"],
        maxFiles: 4
      }
    }
  }
}, /app\/main\.js: static footprint improved to 3 files; lower maxFiles from 4/);

assertFixtureFails("native-entry-budget-rejects-stale-key", {
  files: nativeBudgetFiles,
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: {
    ...exactNativeEntryBudgets,
    entries: {
      ...exactNativeEntryBudgets.entries,
      "app/retired-entry.js": exactNativeEntryBudgets.entries["app/main.js"]
    }
  }
}, /stale native entry budget for app\/retired-entry\.js/);

assertFixtureFails("lazy-boundary-became-eager", {
  files: {
    ...nativeBudgetFiles,
    "app/runtime.js": 'import "./pocket/controller.js";\nvoid import("./settings/controller.js");\nvoid import("./summary/controller.js");\n'
  },
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: exactNativeEntryBudgets
}, /app\/pocket\/controller\.js: configured lazy boundary became statically reachable from app\/main\.js/);

assertFixtureFails("unbudgeted-lazy-boundary", {
  files: {
    ...nativeBudgetFiles,
    "app/runtime.js": `${nativeBudgetFiles["app/runtime.js"]}void import("./extra-controller.js");\n`,
    "app/extra-controller.js": "globalThis.__fixtureExtraController = true;\n"
  },
  verifyNativeEntryBudgets: true,
  nativeEntryBudgets: exactNativeEntryBudgets
}, /app\/extra-controller\.js: unbudgeted dynamic boundary from the app initial-static closure/);

assertFixtureFails("bare-import", {
  files: {
    "app/main.js": 'import "fixture-package";\n'
  }
}, /app\/main\.js: bare, absolute, or remote browser import is forbidden: fixture-package/);

for (const [name, source, expected] of [
  ["commonjs-require", 'const value = require("../shared/value.js");\nexport { value };\n', /free CommonJS require is forbidden/],
  ["commonjs-module", "export const value = 1;\nmodule.exports = { value };\n", /free CommonJS module\/exports globals are forbidden/],
  ["commonjs-exports", "exports.value = 1;\n", /free CommonJS module\/exports globals are forbidden/],
  ["eval", 'eval("globalThis.compromised = true");\n', /eval is forbidden in browser ESM/],
  ["global-eval", 'globalThis.eval("globalThis.compromised = true");\n', /eval is forbidden in browser ESM/],
  ["function-constructor", 'new Function("return 1");\n', /global Function constructor is forbidden in browser ESM/],
  ["function-call", 'Function("return 1")();\n', /global Function constructor is forbidden in browser ESM/],
  ["computed-global-function", 'globalThis["Function"]("return 1")();\n', /global Function constructor is forbidden in browser ESM/],
  ["window-function", 'window.Function("return 1")();\n', /global Function constructor is forbidden in browser ESM/],
  ["aliased-function", 'const DynamicFunction = Function;\nDynamicFunction("return 1")();\n', /global Function constructor is forbidden in browser ESM/],
  ["import-scripts", 'importScripts("https:\/\/example.invalid\/runtime.js");\n', /importScripts is forbidden in browser ESM/]
]) {
  assertFixtureFails(name, {
    files: {
      "app/main.js": 'import "./feature.js";\n',
      "app/feature.js": source
    }
  }, expected);
}

assertFixtureFails("orphan", {
  files: {
    "shared/orphan.js": "export const orphan = true;\n"
  }
}, /chromium package: native ESM module is unreachable from runtime entries: shared\/orphan\.js/);

assertFixturePasses("explicit-orphan-allowlist", {
  files: {
    "shared/orphan.js": "export const orphan = true;\n"
  },
  nativeEsmReachabilityAllowlist: {
    "shared/orphan.js": "Fixture compatibility facade is intentionally packaged without a runtime importer."
  }
});

assertFixtureFails("stale-orphan-allowlist", {
  nativeEsmReachabilityAllowlist: {
    "shared/value.js": "Fixture entry should be rejected after the module becomes reachable from runtime roots."
  }
}, /native ESM reachability allowlist contains stale entry: shared\/value\.js/);

assertFixtureFails("content-author-orphan", {
  files: {
    "content-src/entry.js": 'import "./reachable.js";\n',
    "content-src/reachable.js": "export const reachable = true;\n",
    "content-src/orphan.js": "export const orphan = true;\n"
  },
  contentEntryPoints: ["content-src/entry.js"]
}, /content author ESM module is unreachable from declared content entries: content-src\/orphan\.js/);

assertFixturePasses("content-safe-shared-positive", {
  files: {
    "content-src/entry.js": 'import { safe } from "../shared/content-safe.js";\nglobalThis.__fixtureSafe = safe;\n',
    "shared/content-safe.js": "export const safe = true;\n"
  },
  packagedFiles: fixtureBasePackagedFiles,
  contentEntryPoints: ["content-src/entry.js"],
  contentSafeSharedModules: ["shared/content-safe.js"]
});

assertFixtureFails("content-safe-shared-direct-rejection", {
  files: {
    "content-src/entry.js": 'import "../shared/not-content-safe.js";\n',
    "shared/not-content-safe.js": "globalThis.__fixtureUnsafe = true;\n"
  },
  packagedFiles: fixtureBasePackagedFiles,
  contentEntryPoints: ["content-src/entry.js"]
}, /content-src\/entry\.js: content-safe shared dependency is not allowlisted: shared\/not-content-safe\.js/);

assertFixtureFails("content-safe-shared-transitive-rejection", {
  files: {
    "content-src/entry.js": 'import "../shared/content-safe.js";\n',
    "shared/content-safe.js": 'import "./not-content-safe.js";\n',
    "shared/not-content-safe.js": "globalThis.__fixtureUnsafe = true;\n"
  },
  packagedFiles: fixtureBasePackagedFiles,
  contentEntryPoints: ["content-src/entry.js"],
  contentSafeSharedModules: ["shared/content-safe.js"]
}, /shared\/content-safe\.js: content-safe shared dependency is not allowlisted: shared\/not-content-safe\.js/);

assertFixtureFails("content-safe-shared-stale-entry", {
  files: {
    "content-src/entry.js": 'import "../shared/content-safe.js";\n',
    "shared/content-safe.js": "globalThis.__fixtureSafe = true;\n",
    "shared/unused-safe.js": "globalThis.__fixtureUnusedSafe = true;\n"
  },
  packagedFiles: fixtureBasePackagedFiles,
  contentEntryPoints: ["content-src/entry.js"],
  contentSafeSharedModules: ["shared/content-safe.js", "shared/unused-safe.js"]
}, /stale content-safe shared module: shared\/unused-safe\.js/);

assertFixturePasses("build-graph-positive", {
  files: {
    "build-src/entry.js": 'import { value } from "../shared/value.js";\nexport const built = value;\n'
  },
  buildEntryPoints: ["build-src/entry.js"]
});

assertFixtureFails("build-cycle", {
  files: {
    "build-src/entry.js": 'import "./a.js";\n',
    "build-src/a.js": 'import "./b.js";\nexport const a = true;\n',
    "build-src/b.js": 'import "./a.js";\nexport const b = true;\n'
  },
  buildEntryPoints: ["build-src/entry.js"]
}, /ESM cycle: build-src\/a\.js -> build-src\/b\.js -> build-src\/a\.js/);

assertFixtureFails("build-illegal-layer", {
  files: {
    "build-src/entry.js": 'import "../app/main.js";\n'
  },
  buildEntryPoints: ["build-src/entry.js"]
}, /build-src\/entry\.js: illegal build-src -> app dependency: app\/main\.js/);

assertFixtureFails("build-missing-dependency", {
  files: {
    "build-src/entry.js": 'import "./missing.js";\n'
  },
  buildEntryPoints: ["build-src/entry.js"]
}, /build-src\/entry\.js: missing dependency \.\/missing\.js/);

assertFixtureFails("build-orphan", {
  files: {
    "build-src/entry.js": 'import "./reachable.js";\n',
    "build-src/reachable.js": "export const reachable = true;\n",
    "build-src/orphan.js": "export const orphan = true;\n"
  },
  buildEntryPoints: ["build-src/entry.js"]
}, /build author ESM module is unreachable from declared build entries: build-src\/orphan\.js/);

const largeModule = `${Array.from({ length: 1201 }, (_, index) => `// ratchet ${index}`).join("\n")}\nexport const large = true;\n`;
const largeModuleLines = largeModule.split(/\r?\n/).length;
const largeModuleBytes = Buffer.byteLength(largeModule);
const largeModuleReason = "Fixture module intentionally exceeds the default limit to exercise the decreasing line-count ratchet.";
assertFixturePasses("size-ratchet-exact", {
  files: {
    "app/main.js": 'import { large } from "./large.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureLarge = large + value;\n',
    "app/large.js": largeModule
  },
  verifySizes: true,
  sizeAllowlist: {
    "app/large.js": {
      maxLines: largeModuleLines,
      target: 1200,
      maxBytes: largeModuleBytes,
      targetBytes: largeModuleBytes - 1,
      reason: largeModuleReason
    }
  }
});
assertFixtureFails("size-ratchet-must-decrease", {
  files: {
    "app/main.js": 'import { large } from "./large.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureLarge = large + value;\n',
    "app/large.js": largeModule
  },
  verifySizes: true,
  sizeAllowlist: {
    "app/large.js": { maxLines: largeModuleLines + 1, target: 1200, reason: largeModuleReason }
  }
}, /line count improved.*lower maxLines/);
assertFixtureFails("size-byte-ratchet-must-decrease", {
  files: {
    "app/main.js": 'import { large } from "./large.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureLarge = large + value;\n',
    "app/large.js": largeModule
  },
  verifySizes: true,
  sizeAllowlist: {
    "app/large.js": {
      maxLines: largeModuleLines,
      target: 1200,
      maxBytes: largeModuleBytes + 1,
      targetBytes: largeModuleBytes,
      reason: largeModuleReason
    }
  }
}, /byte size improved.*lower maxBytes/);
assertFixtureFails("size-ratchet-rejects-minimum", {
  files: {
    "app/main.js": 'import { large } from "./large.js";\nimport { value } from "../shared/value.js";\nglobalThis.__fixtureLarge = large + value;\n',
    "app/large.js": largeModule
  },
  verifySizes: true,
  sizeAllowlist: {
    "app/large.js": { maxLines: largeModuleLines, target: 1200, minLines: 1200, reason: largeModuleReason }
  }
}, /unsupported fields: minLines/);

for (const giantFile of ["giant.js", "giant.generated.js"]) {
  assertFixtureFails(`single-line-byte-hard-limit-${giantFile}`, {
    files: {
      "app/main.js": `import "./${giantFile}";\n`,
      [`app/${giantFile}`]: `// ${"x".repeat(2 * 1024 * 1024)}\nexport const giant = true;\n`
    },
    verifySizes: true
  }, new RegExp(
    `app/${giantFile.replaceAll(".", "\\.")}: \\d+ bytes exceeds default author ESM limit 65536; `
    + "a structured size-ratchet exception is required"
  ));
}

{
  const files = {
    ...baseFiles(),
    "app/main.js": 'import { dependency } from "../shared/dependency.js";\nglobalThis.__fixtureDependency = dependency;\n',
    "shared/dependency.js": "export const dependency = true;\n"
  };
  const packagedFiles = Object.keys(files)
    .filter((file) => file.endsWith(".js") && file !== "shared/dependency.js")
    .sort();
  assertFixtureFails("package-closure", { files, packagedFiles }, /chromium package: app\/main\.js dependency is not packaged: shared\/dependency\.js/);
}

console.log("module verifier negative fixtures: ok");
