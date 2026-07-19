#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { Linter } = require("eslint");

const root = path.resolve(__dirname, "..");
const ALLOWLIST_FILE = "tools/cjs-export-liveness-allowlist.json";

function normalizedPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativeTarget(owner, specifier) {
  const value = String(specifier || "");
  if (!value.startsWith(".")) return "";
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(owner), value));
  return target.startsWith("../") || path.posix.isAbsolute(target) ? "" : target;
}

function propertyName(node) {
  if (!node) return "";
  if (!node.computed && node.type === "Property" && node.key?.type === "Identifier") return node.key.name;
  if (!node.computed && node.type === "MemberExpression" && node.property?.type === "Identifier") {
    return node.property.name;
  }
  const property = node.type === "Property" ? node.key : node.property;
  if (node.computed && property?.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  if (node.type === "Property" && property?.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  return "";
}

function attachParents(node, parent = null) {
  if (!node || typeof node !== "object") return;
  if (node.type) Object.defineProperty(node, "parent", { configurable: true, value: parent });
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "tokens" || key === "comments") continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) attachParents(child, node);
    } else if (value?.type) attachParents(value, node);
  }
}

function parseSource(source, file) {
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(source, [{
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: file.endsWith(".mjs") ? "module" : "commonjs",
      parserOptions: { range: true }
    }
  }], { filename: file });
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(`${file}: CommonJS export-liveness parse failed: ${fatal.message}`);
  const sourceCode = linter.getSourceCode();
  attachParents(sourceCode.ast);
  return sourceCode;
}

function walkAst(node, visitor) {
  if (!node?.type) return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "tokens" || key === "comments") continue;
    if (Array.isArray(value)) {
      for (const child of value) walkAst(child, visitor);
    } else if (value?.type) walkAst(value, visitor);
  }
}

function moduleExportsMember(node) {
  return node?.type === "MemberExpression"
    && node.object?.type === "Identifier"
    && node.object.name === "module"
    && propertyName(node) === "exports";
}

function exportedProperties(sourceCode, file) {
  const exports = new Set();
  const unsupported = [];
  walkAst(sourceCode.ast, (node) => {
    if (node.type !== "AssignmentExpression" || node.operator !== "=") return;
    if (moduleExportsMember(node.left)) {
      if (node.right.type !== "ObjectExpression") {
        unsupported.push(`${file}: module.exports must use a statically analyzable object literal`);
        return;
      }
      for (const property of node.right.properties) {
        if (property.type === "SpreadElement") {
          unsupported.push(`${file}: module.exports object spreads are not statically analyzable`);
          continue;
        }
        const name = propertyName(property);
        if (name) exports.add(name);
        else unsupported.push(`${file}: module.exports contains a computed export name`);
      }
      return;
    }
    if (node.left?.type !== "MemberExpression") return;
    if (moduleExportsMember(node.left.object)) {
      const name = propertyName(node.left);
      if (name) exports.add(name);
      else unsupported.push(`${file}: module.exports contains a computed export name`);
    } else if (node.left.object?.type === "Identifier" && node.left.object.name === "exports") {
      const name = propertyName(node.left);
      if (name) exports.add(name);
      else unsupported.push(`${file}: exports contains a computed export name`);
    }
  });
  return { exports, errors: unsupported };
}

function patternDemands(pattern) {
  const names = new Set();
  let all = false;
  if (pattern?.type !== "ObjectPattern") return { names, all: true };
  for (const property of pattern.properties) {
    if (property.type === "RestElement") {
      all = true;
      continue;
    }
    const name = propertyName(property);
    if (name) names.add(name);
    else all = true;
  }
  return { names, all };
}

function mergeDemand(target, demand) {
  if (demand.all) target.all = true;
  for (const name of demand.names) target.names.add(name);
}

function variableForDefinition(sourceCode, identifier) {
  for (const scope of sourceCode.scopeManager.scopes) {
    for (const variable of scope.variables) {
      if (variable.identifiers.some((item) => item.range?.[0] === identifier.range?.[0])) return variable;
    }
  }
  return null;
}

function namespaceDemand(sourceCode, identifier) {
  const demand = { names: new Set(), all: false };
  const variable = variableForDefinition(sourceCode, identifier);
  if (!variable) return { names: demand.names, all: true };
  for (const reference of variable.references) {
    if (!reference.isRead() || reference.identifier === identifier) continue;
    const node = reference.identifier;
    const parent = node.parent;
    if (parent?.type === "MemberExpression" && parent.object === node) {
      const name = propertyName(parent);
      if (name) demand.names.add(name);
      else demand.all = true;
    } else if (parent?.type === "VariableDeclarator" && parent.init === node) {
      mergeDemand(demand, patternDemands(parent.id));
    } else if (parent?.type === "AssignmentExpression" && parent.right === node) {
      mergeDemand(demand, patternDemands(parent.left));
    } else {
      demand.all = true;
    }
  }
  return demand;
}

function requireDemand(node, sourceCode) {
  const parent = node.parent;
  if (parent?.type === "MemberExpression" && parent.object === node) {
    const name = propertyName(parent);
    return { names: new Set(name ? [name] : []), all: !name };
  }
  if (parent?.type === "VariableDeclarator" && parent.init === node) {
    if (parent.id.type === "ObjectPattern") return patternDemands(parent.id);
    if (parent.id.type === "Identifier") return namespaceDemand(sourceCode, parent.id);
  }
  if (parent?.type === "AssignmentExpression" && parent.right === node) {
    if (parent.left.type === "ObjectPattern") return patternDemands(parent.left);
    if (parent.left.type === "Identifier") return { names: new Set(), all: true };
  }
  if (parent?.type === "ExpressionStatement") return { names: new Set(), all: false };
  return { names: new Set(), all: true };
}

function defaultTestFile(file) {
  return /(?:^|\/)[^/]+-test\.cjs$/.test(file);
}

function analyzeCommonJsExportLiveness({
  root: analysisRoot,
  files,
  allowlist = {},
  testFiles = null
}) {
  const normalizedFiles = [...new Set(files.map(normalizedPath))].sort();
  const testFileSet = testFiles ? new Set(testFiles.map(normalizedPath)) : null;
  const isTest = (file) => testFileSet ? testFileSet.has(file) : defaultTestFile(file);
  const parsed = new Map();
  const exportsByFile = new Map();
  const errors = [];

  for (const file of normalizedFiles) {
    const source = fs.readFileSync(path.join(analysisRoot, file), "utf8");
    const sourceCode = parseSource(source, file);
    parsed.set(file, sourceCode);
    if (!file.endsWith(".cjs") || isTest(file)) continue;
    const result = exportedProperties(sourceCode, file);
    if (result.exports.size) exportsByFile.set(file, result.exports);
    errors.push(...result.errors);
  }

  const consumers = new Map();
  for (const [file, sourceCode] of parsed) {
    walkAst(sourceCode.ast, (node) => {
      if (
        node.type !== "CallExpression"
        || node.callee?.type !== "Identifier"
        || node.callee.name !== "require"
        || node.arguments.length !== 1
        || node.arguments[0].type !== "Literal"
        || typeof node.arguments[0].value !== "string"
      ) return;
      let target = relativeTarget(file, node.arguments[0].value);
      if (!exportsByFile.has(target) && exportsByFile.has(`${target}.cjs`)) target = `${target}.cjs`;
      if (!target || target === file || !exportsByFile.has(target)) return;
      const demand = requireDemand(node, sourceCode);
      if (!consumers.has(target)) consumers.set(target, new Map());
      const byConsumer = consumers.get(target);
      if (!byConsumer.has(file)) byConsumer.set(file, { names: new Set(), all: false });
      mergeDemand(byConsumer.get(file), demand);
    });
  }

  const usedAllowlist = new Set();
  let exportedNames = 0;
  for (const [target, byConsumer] of consumers) {
    const names = exportsByFile.get(target) || new Set();
    for (const [consumer, demand] of byConsumer) {
      for (const name of demand.names) {
        if (!names.has(name)) {
          errors.push(`${consumer}: requires missing CommonJS export ${target}#${name}`);
        }
      }
    }
  }
  for (const [file, names] of exportsByFile) {
    exportedNames += names.size;
    const byConsumer = consumers.get(file) || new Map();
    for (const name of names) {
      const key = `${file}#${name}`;
      const consumingFiles = [...byConsumer]
        .filter(([, demand]) => demand.all || demand.names.has(name))
        .map(([consumer]) => consumer);
      const runtimeConsumers = consumingFiles.filter((consumer) => !isTest(consumer));
      const testConsumers = consumingFiles.filter(isTest);
      if (runtimeConsumers.length) continue;
      if (!testConsumers.length) {
        errors.push(`${file}: CommonJS export ${name} has no tool or test consumer`);
        continue;
      }
      const exception = allowlist[key];
      if (
        !exception
        || exception.kind !== "test-only"
        || typeof exception.reason !== "string"
        || exception.reason.trim().length < 32
      ) {
        errors.push(`${file}: CommonJS export ${name} is consumed only by tests; a reasoned test-only allowlist entry is required`);
        continue;
      }
      usedAllowlist.add(key);
    }
  }
  for (const key of Object.keys(allowlist)) {
    if (!usedAllowlist.has(key)) errors.push(`CommonJS export liveness allowlist contains stale entry: ${key}`);
  }
  return Object.freeze({
    errors: Object.freeze(errors),
    stats: Object.freeze({ exportedNames, exceptions: usedAllowlist.size })
  });
}

function repositoryToolFiles() {
  const files = [];
  function collect(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) collect(path.join(directory, entry.name), relative);
      else if (entry.isFile() && /\.(?:cjs|mjs)$/.test(entry.name)) files.push(relative);
    }
  }
  collect(path.join(root, "tools"), "tools");
  return files.sort();
}

if (require.main === module) {
  let allowlist = {};
  try {
    allowlist = JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST_FILE), "utf8"));
  } catch (error) {
    console.error(`${ALLOWLIST_FILE}: invalid CommonJS export-liveness allowlist: ${error.message}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    try {
      const result = analyzeCommonJsExportLiveness({
        root,
        files: repositoryToolFiles(),
        allowlist
      });
      if (result.errors.length) {
        console.error("CommonJS export liveness failed:");
        for (const error of result.errors) console.error(`  - ${error}`);
        process.exitCode = 1;
      } else {
        console.log(
          `CommonJS export liveness passed (${result.stats.exportedNames} exports, `
          + `${result.stats.exceptions} reasoned test-only seams).`
        );
      }
    } catch (error) {
      console.error(`CommonJS export liveness failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = { analyzeCommonJsExportLiveness };
