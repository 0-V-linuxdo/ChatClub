#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyzeCommonJsExportLiveness } = require("./cjs-export-liveness.cjs");

function analyze(files, allowlist = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-cjs-liveness-"));
  try {
    for (const [file, source] of Object.entries(files)) {
      const absolute = path.join(directory, file);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, source);
    }
    return analyzeCommonJsExportLiveness({
      root: directory,
      files: Object.keys(files),
      allowlist
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

assert.deepEqual(analyze({
  "tools/library.cjs": "const used = 1; const hidden = 2; module.exports = { used }; void hidden;\n",
  "tools/consumer.cjs": 'const library = require("./library.cjs"); void library.used;\n'
}).errors, []);

assert.match(analyze({
  "tools/library.cjs": "const unused = 1; module.exports = { unused };\n"
}).errors.join("\n"), /CommonJS export unused has no tool or test consumer/);

assert.match(analyze({
  "tools/library.cjs": "const present = 1; module.exports = { present };\n",
  "tools/consumer.cjs": 'const { missing } = require("./library.cjs"); void missing;\n'
}).errors.join("\n"), /requires missing CommonJS export tools\/library\.cjs#missing/);

const testOnlyFiles = {
  "tools/library.cjs": "const seam = 1; module.exports = { seam };\n",
  "tools/library-test.cjs": 'const { seam } = require("./library.cjs"); void seam;\n'
};
assert.match(
  analyze(testOnlyFiles).errors.join("\n"),
  /CommonJS export seam is consumed only by tests/
);
assert.deepEqual(analyze(testOnlyFiles, {
  "tools/library.cjs#seam": {
    kind: "test-only",
    reason: "The fixture keeps this deterministic seam solely for its focused CommonJS regression test."
  }
}).errors, []);

assert.match(analyze({
  "tools/library.cjs": "const live = 1; module.exports = { live };\n",
  "tools/consumer.cjs": 'const { live } = require("./library.cjs"); void live;\n'
}, {
  "tools/library.cjs#live": {
    kind: "test-only",
    reason: "This intentionally stale fixture entry must be rejected once a tool consumes the export."
  }
}).errors.join("\n"), /allowlist contains stale entry: tools\/library\.cjs#live/);

console.log("CommonJS export liveness analyzer: ok");
