#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertPackagedDirectory, assertPackagedRegularFile } = require("./package-plan.cjs");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatclub-package-symlink-"));
try {
  const packageRoot = path.join(temporaryRoot, "package");
  const outsideRoot = path.join(temporaryRoot, "outside");
  fs.mkdirSync(path.join(packageRoot, "internal"), { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "regular.js"), "export const regular = true;\n");
  fs.writeFileSync(path.join(packageRoot, "internal", "inside.js"), "export const inside = true;\n");
  fs.writeFileSync(path.join(outsideRoot, "outside.js"), "export const outside = true;\n");

  assert.equal(
    assertPackagedRegularFile(packageRoot, "regular.js"),
    path.join(packageRoot, "regular.js")
  );

  fs.symlinkSync(path.join(outsideRoot, "outside.js"), path.join(packageRoot, "linked.js"), "file");
  assert.throws(
    () => assertPackagedRegularFile(packageRoot, "linked.js"),
    /pack entry is a symbolic link/
  );

  fs.symlinkSync(outsideRoot, path.join(packageRoot, "escaped"), "dir");
  assert.throws(
    () => assertPackagedRegularFile(packageRoot, "escaped/outside.js"),
    /pack entry escapes package root/
  );

  fs.symlinkSync(path.join(packageRoot, "internal"), path.join(packageRoot, "aliased"), "dir");
  assert.throws(
    () => assertPackagedRegularFile(packageRoot, "aliased/inside.js"),
    /pack entry contains a symbolic link component/
  );

  const outsideEmptyTree = path.join(temporaryRoot, "outside-empty-tree");
  fs.mkdirSync(outsideEmptyTree);
  fs.symlinkSync(outsideEmptyTree, path.join(packageRoot, "empty-tree"), "dir");
  assert.throws(
    () => assertPackagedDirectory(packageRoot, "empty-tree"),
    /Pack allowlist directory is a symbolic link/
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("package plan symbolic-link containment: ok");
