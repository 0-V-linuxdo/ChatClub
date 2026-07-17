#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  CONTENT_OUTPUT_FILES,
  FIREFOX_CONTENT_FALLBACK_OUTPUT
} = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const destinations = [];

try {
  for (const target of ["chromium", "firefox"]) {
    const outputName = `dev-build-test-${target}-${process.pid}`;
    const destination = path.join(root, "output", outputName);
    destinations.push(destination);
    const result = spawnSync(process.execPath, [
      "tools/dev-build.cjs",
      "--target",
      target,
      "--name",
      outputName
    ], {
      cwd: root,
      encoding: "utf8",
      timeout: 60000
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const output of CONTENT_OUTPUT_FILES) {
      const code = fs.readFileSync(path.join(destination, output), "utf8");
      const sourceMap = JSON.parse(fs.readFileSync(path.join(destination, `${output}.map`), "utf8"));
      assert.match(code, new RegExp(`//# sourceMappingURL=${path.basename(output)}\\.map\\s*$`));
      assert.equal(sourceMap.sourceRoot, "chatclub:///");
      assert.ok(Array.isArray(sourceMap.sources) && sourceMap.sources.length > 0, `${output} source map needs sources`);
      assert.equal(sourceMap.sources.length, sourceMap.sourcesContent.length, `${output} source contents must be embedded`);
      for (const source of sourceMap.sources) {
        assert.doesNotMatch(source, /^(?:[a-z]:)?\//i, `${output} source names must be repository-relative`);
        assert.doesNotMatch(source, /(?:^|\/)\.\.(?:\/|$)/, `${output} source names must not escape the repository`);
        assert.doesNotMatch(source, /Users\//, `${output} source names must not expose a host path`);
      }
    }
    assert.ok(fs.statSync(path.join(destination, "manifest.json")).isFile());
    assert.equal(fs.existsSync(path.join(destination, "shared/storage.js")), false);
    assert.equal(fs.existsSync(path.join(destination, "userscripts/index.json")), false);
    if (target === "firefox") {
      const fallback = fs.readFileSync(path.join(destination, FIREFOX_CONTENT_FALLBACK_OUTPUT), "utf8");
      for (const output of CONTENT_OUTPUT_FILES) {
        assert.ok(
          fallback.includes(`//# sourceURL=chatclub:///${output}?firefox-fallback`),
          `${output} Firefox development fallback needs a stable sourceURL`
        );
      }
      assert.ok(fallback.split(/\r?\n/).length > 1000, "Firefox development fallbacks must remain unminified");
    }
  }
  console.log(`${CONTENT_OUTPUT_FILES.length * 2} cross-target development content source maps verified.`);
} finally {
  for (const destination of destinations) fs.rmSync(destination, { recursive: true, force: true });
}
