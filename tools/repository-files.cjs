const fs = require("node:fs");
const path = require("node:path");

function safeRepositoryRelative(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe repository path: ${relativePath}`);
  }
  return normalized;
}

function assertContainedRegularFile(baseRoot, relativePath, options = {}) {
  const file = safeRepositoryRelative(relativePath);
  const absoluteRoot = path.resolve(baseRoot);
  const absoluteFile = path.join(absoluteRoot, ...file.split("/"));
  const prefixes = {
    missing: options.missingPrefix || "Repository file is missing",
    symlink: options.symlinkPrefix || "Repository file is a symbolic link",
    escape: options.escapePrefix || "Repository file escapes repository root",
    component: options.componentPrefix || "Repository file contains a symbolic link component"
  };
  const fileEntry = fs.lstatSync(absoluteFile, { throwIfNoEntry: false });
  if (fileEntry?.isSymbolicLink()) throw new Error(`${prefixes.symlink}: ${file}`);
  if (!fileEntry?.isFile()) throw new Error(`${prefixes.missing}: ${file}`);

  const canonicalRoot = fs.realpathSync(absoluteRoot);
  const canonicalFile = fs.realpathSync(absoluteFile);
  const relativeCanonicalPath = path.relative(canonicalRoot, canonicalFile);
  if (
    !relativeCanonicalPath
    || relativeCanonicalPath === ".."
    || relativeCanonicalPath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeCanonicalPath)
  ) {
    throw new Error(`${prefixes.escape}: ${file}`);
  }

  let cursor = absoluteRoot;
  for (const segment of file.split("/").slice(0, -1)) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`${prefixes.component}: ${file} (${segment})`);
    }
  }
  return absoluteFile;
}

function assertContainedDirectory(baseRoot, relativePath, options = {}) {
  const directory = safeRepositoryRelative(relativePath);
  const absoluteRoot = path.resolve(baseRoot);
  const absoluteDirectory = path.join(absoluteRoot, ...directory.split("/"));
  const prefix = options.prefix || "Repository directory";
  const entry = fs.lstatSync(absoluteDirectory, { throwIfNoEntry: false });
  if (entry?.isSymbolicLink()) throw new Error(`${prefix} is a symbolic link: ${directory}`);
  if (!entry?.isDirectory()) throw new Error(`${prefix} is missing: ${directory}`);

  const canonicalRoot = fs.realpathSync(absoluteRoot);
  const canonicalDirectory = fs.realpathSync(absoluteDirectory);
  const relativeCanonicalPath = path.relative(canonicalRoot, canonicalDirectory);
  if (
    !relativeCanonicalPath
    || relativeCanonicalPath === ".."
    || relativeCanonicalPath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeCanonicalPath)
  ) {
    throw new Error(`${prefix} escapes repository root: ${directory}`);
  }

  let cursor = absoluteRoot;
  for (const segment of directory.split("/").slice(0, -1)) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`${prefix} contains a symbolic link component: ${directory} (${segment})`);
    }
  }
  return absoluteDirectory;
}

function assertContainedOutputPath(baseRoot, relativePath, options = {}) {
  const file = safeRepositoryRelative(relativePath);
  const absoluteRoot = path.resolve(baseRoot);
  const rootEntry = fs.lstatSync(absoluteRoot, { throwIfNoEntry: false });
  const prefix = options.prefix || "Generated output path";
  if (rootEntry?.isSymbolicLink()) throw new Error(`${prefix} root is a symbolic link: ${absoluteRoot}`);
  if (!rootEntry?.isDirectory()) throw new Error(`${prefix} root is missing: ${absoluteRoot}`);

  const canonicalRoot = fs.realpathSync(absoluteRoot);
  const absoluteFile = path.join(absoluteRoot, ...file.split("/"));
  let cursor = absoluteRoot;
  const segments = file.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    const entry = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (!entry) break;
    if (entry.isSymbolicLink()) throw new Error(`${prefix} contains a symbolic link: ${file}`);
    const final = index === segments.length - 1;
    if ((!final && !entry.isDirectory()) || (final && !entry.isFile())) {
      throw new Error(`${prefix} is not a regular file path: ${file}`);
    }
    const relativeCanonicalPath = path.relative(canonicalRoot, fs.realpathSync(cursor));
    if (
      relativeCanonicalPath === ".."
      || relativeCanonicalPath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeCanonicalPath)
    ) {
      throw new Error(`${prefix} escapes output root: ${file}`);
    }
  }
  return absoluteFile;
}

module.exports = {
  safeRepositoryRelative,
  assertContainedRegularFile,
  assertContainedDirectory,
  assertContainedOutputPath
};
