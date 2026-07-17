#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  CONTENT_ENTRIES,
  GENERATED_ARTIFACT_DIRECT_INPUT_FILES,
  TOPIC_DELETE_SOURCE_FILES,
  assertGeneratedArtifactDirectInputs,
  contentRuntimeSourceFiles
} = require("./generated-artifacts.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const verifier = path.join(repositoryRoot, "tools/verify-modules.mjs");

function write(root, relativePath, source) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-author-symlink-"));
try {
  const generatorRoot = path.join(temporaryRoot, "generator");
  for (const file of GENERATED_ARTIFACT_DIRECT_INPUT_FILES) {
    write(generatorRoot, file, file === "userscripts/index.json" ? '{"configs":[]}\n' : "");
  }

  const outsideContentDependency = path.join(temporaryRoot, "outside-content-dependency.js");
  fs.writeFileSync(outsideContentDependency, "export const outside = true;\n");
  write(generatorRoot, CONTENT_ENTRIES["content/content.js"], 'import "./linked-dependency.js";\n');
  fs.symlinkSync(
    outsideContentDependency,
    path.join(generatorRoot, "content-src/linked-dependency.js"),
    "file"
  );
  assert.throws(
    () => contentRuntimeSourceFiles(generatorRoot),
    /Content runtime source dependency is a symbolic link: content-src\/linked-dependency\.js/
  );

  write(generatorRoot, CONTENT_ENTRIES["content/content.js"], "");
  fs.rmSync(path.join(generatorRoot, "content-src/linked-dependency.js"));
  const buildInput = TOPIC_DELETE_SOURCE_FILES[0];
  const outsideBuildInput = path.join(temporaryRoot, "outside-build-input.js");
  fs.writeFileSync(outsideBuildInput, "export const outsideBuild = true;\n");
  fs.rmSync(path.join(generatorRoot, buildInput));
  fs.symlinkSync(outsideBuildInput, path.join(generatorRoot, buildInput), "file");
  assert.throws(
    () => assertGeneratedArtifactDirectInputs(generatorRoot),
    new RegExp(`Content runtime source dependency is a symbolic link: ${buildInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
  );

  const verifierRoot = path.join(temporaryRoot, "verifier");
  write(verifierRoot, "app/main.js", 'import { value } from "../shared/value.js";\nglobalThis.__value = value;\n');
  write(verifierRoot, "background/service-worker.js", 'import { value } from "../shared/value.js";\nglobalThis.__value = value;\n');
  write(verifierRoot, "background/firefox-background.js", 'import "./service-worker.js";\n');
  write(verifierRoot, "shared/value.js", "export const value = 1;\n");
  fs.mkdirSync(path.join(verifierRoot, "content-src"), { recursive: true });
  fs.mkdirSync(path.join(verifierRoot, "build-src"), { recursive: true });
  fs.symlinkSync(outsideContentDependency, path.join(verifierRoot, "content-src/entry.js"), "file");
  fs.symlinkSync(outsideBuildInput, path.join(verifierRoot, "build-src/entry.js"), "file");
  const commonFiles = [
    "app/main.js",
    "background/firefox-background.js",
    "background/service-worker.js",
    "shared/value.js"
  ];
  const fixture = {
    root: ".",
    verifyToolchain: false,
    verifySizes: false,
    contentEntryPoints: ["content-src/entry.js"],
    plans: {
      chromium: {
        files: commonFiles.filter((file) => file !== "background/firefox-background.js"),
        manifest: { background: { service_worker: "background/service-worker.js", type: "module" } }
      },
      firefox: {
        files: commonFiles,
        manifest: { background: { scripts: ["background/firefox-background.js"], type: "module" } }
      }
    }
  };
  write(verifierRoot, "fixture.json", `${JSON.stringify(fixture, null, 2)}\n`);
  const result = spawnSync(process.execPath, [verifier, "--fixture", path.join(verifierRoot, "fixture.json")], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30_000
  });
  if (result.error) throw result.error;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.notEqual(result.status, 0, "author-source symlink fixture unexpectedly passed");
  assert.match(output, /content-src\/entry\.js: symbolic links are forbidden/);
  assert.match(output, /build-src\/entry\.js: symbolic links are forbidden/);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("author and build source symbolic-link containment: ok");
