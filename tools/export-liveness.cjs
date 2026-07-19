const fs = require("node:fs");
const path = require("node:path");
const { Linter } = require("eslint");

const ALLOWLIST_KINDS = new Set(["public-api", "test-only"]);

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
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return "";
}

function exportedName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "Literal") return String(node.value || "");
  return "";
}

function patternNames(pattern, output = []) {
  if (!pattern) return output;
  if (pattern.type === "Identifier") output.push(pattern.name);
  else if (pattern.type === "RestElement") patternNames(pattern.argument, output);
  else if (pattern.type === "AssignmentPattern") patternNames(pattern.left, output);
  else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements || []) patternNames(element, output);
  } else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties || []) {
      patternNames(property.type === "RestElement" ? property.argument : property.value, output);
    }
  }
  return output;
}

function declarationNames(declaration) {
  if (!declaration) return [];
  if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
    return declaration.id?.name ? [declaration.id.name] : [];
  }
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations.flatMap((item) => patternNames(item.id));
  }
  return [];
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

function parseSource(source, file, sourceType = "module") {
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(source, [{
    languageOptions: {
      ecmaVersion: "latest",
      sourceType,
      parserOptions: { range: true }
    }
  }], { filename: file });
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(`${file}: export-liveness parse failed: ${fatal.message}`);
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

function moduleScope(sourceCode) {
  return sourceCode.scopeManager.scopes.find((scope) => scope.type === "module") || null;
}

function variableForIdentifier(sourceCode, identifier) {
  if (!identifier?.name) return null;
  for (const scope of sourceCode.scopeManager.scopes) {
    for (const variable of scope.variables) {
      if (variable.name !== identifier.name) continue;
      if (variable.identifiers.some((item) => item.range?.[0] === identifier.range?.[0])) return variable;
    }
  }
  return null;
}

function namespaceReferenceDemands(variable) {
  const names = new Set();
  let all = false;
  for (const reference of variable?.references || []) {
    const identifier = reference.identifier;
    if (!reference.isRead() || variable.identifiers.includes(identifier)) continue;
    const parent = identifier.parent;
    if (parent?.type === "MemberExpression" && parent.object === identifier) {
      const name = propertyName(parent);
      if (name) names.add(name);
      else all = true;
      continue;
    }
    if (parent?.type === "VariableDeclarator" && parent.init === identifier && parent.id.type === "ObjectPattern") {
      for (const name of patternNames(parent.id)) names.add(name);
      continue;
    }
    if (parent?.type === "AssignmentExpression" && parent.right === identifier && parent.left.type === "ObjectPattern") {
      for (const name of patternNames(parent.left)) names.add(name);
      continue;
    }
    all = true;
  }
  return { all, names };
}

function constantInitializer(sourceCode, name) {
  for (const scope of sourceCode?.scopeManager?.scopes || []) {
    const variable = scope.variables.find((item) => item.name === name);
    const definition = variable?.defs.find((item) => item.type === "Variable");
    if (definition?.node?.init) return definition.node.init;
  }
  return null;
}

function staticPathJoin(node, sourceCode, pending, parameterBindings) {
  if (
    node?.type !== "CallExpression"
    || node.callee?.type !== "MemberExpression"
    || node.callee.object?.name !== "path"
    || propertyName(node.callee) !== "join"
  ) return "";
  const parts = [];
  for (const argument of node.arguments) {
    if (argument.type === "Identifier" && argument.name === "root" && !parts.length) continue;
    if (argument.type === "Literal" && typeof argument.value === "string") parts.push(argument.value);
    else {
      const value = staticDynamicImportSpecifier(argument, sourceCode, pending, parameterBindings);
      if (!value) return "";
      parts.push(value);
    }
  }
  return parts.length ? path.posix.join(...parts.map(normalizedPath)) : "";
}

function staticDynamicImportSpecifier(
  node,
  sourceCode = null,
  pending = new Set(),
  parameterBindings = new Map()
) {
  if (!node) return "";
  if (node.type === "Identifier" && parameterBindings.has(node.name) && !pending.has(node.name)) {
    pending.add(node.name);
    const value = staticDynamicImportSpecifier(
      parameterBindings.get(node.name),
      sourceCode,
      pending,
      parameterBindings
    );
    pending.delete(node.name);
    return value;
  }
  if (node.type === "Literal" && typeof node.value === "string") return node.value.split(/[?#]/, 1)[0];
  if (node.type === "TemplateLiteral") {
    if (!node.expressions.length) return String(node.quasis[0]?.value?.cooked || "").split(/[?#]/, 1)[0];
    if (
      node.quasis[0]?.value?.cooked === ""
      && (node.quasis[1]?.value?.cooked || "").startsWith("?")
    ) {
      return staticDynamicImportSpecifier(node.expressions[0], sourceCode, pending, parameterBindings);
    }
    return "";
  }
  if (node.type === "CallExpression" && node.callee?.name === "moduleUrl") {
    const value = node.arguments[0];
    return value?.type === "Literal" && typeof value.value === "string" ? value.value : "";
  }
  if (
    node.type === "CallExpression"
    && (node.callee?.name === "pathToFileURL" || propertyName(node.callee) === "pathToFileURL")
  ) {
    return staticDynamicImportSpecifier(node.arguments[0], sourceCode, pending, parameterBindings);
  }
  if (node.type === "MemberExpression" && propertyName(node) === "href") {
    return staticDynamicImportSpecifier(node.object, sourceCode, pending, parameterBindings);
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return staticDynamicImportSpecifier(node.left, sourceCode, pending, parameterBindings)
      || staticDynamicImportSpecifier(node.right, sourceCode, pending, parameterBindings);
  }
  if (node.type === "CallExpression") {
    const joined = staticPathJoin(node, sourceCode, pending, parameterBindings);
    if (joined) return joined;
  }
  if (node.type === "Identifier" && sourceCode && !pending.has(node.name)) {
    pending.add(node.name);
    const value = staticDynamicImportSpecifier(
      constantInitializer(sourceCode, node.name),
      sourceCode,
      pending,
      parameterBindings
    );
    pending.delete(node.name);
    return value;
  }
  return "";
}

function resolvedDynamicTarget(owner, sourceNode, knownModules, sourceCode, parameterBindings = new Map()) {
  const specifier = normalizedPath(
    staticDynamicImportSpecifier(sourceNode, sourceCode, new Set(), parameterBindings)
  );
  if (!specifier) return "";
  const target = specifier.startsWith(".") ? relativeTarget(owner, specifier) : specifier.replace(/^\/+/, "");
  return knownModules.has(target) ? target : "";
}

function unwrapDynamicImport(node) {
  let current = node;
  while (
    current.parent?.type === "AwaitExpression"
    || current.parent?.type === "ChainExpression"
    || current.parent?.type === "ParenthesizedExpression"
  ) current = current.parent;
  return current;
}

function demandsForPattern(pattern, sourceCode) {
  if (pattern?.type === "ObjectPattern") {
    return { all: false, names: new Set(patternNames(pattern)) };
  }
  if (pattern?.type === "Identifier") return namespaceReferenceDemands(variableForIdentifier(sourceCode, pattern));
  return { all: true, names: new Set() };
}

function promiseAllElementDemands(node, sourceCode) {
  const array = node.parent;
  if (array?.type !== "ArrayExpression") return null;
  const call = array.parent;
  if (
    call?.type !== "CallExpression"
    || call.arguments[0] !== array
    || call.callee?.type !== "MemberExpression"
    || call.callee.object?.name !== "Promise"
    || propertyName(call.callee) !== "all"
  ) return null;
  const current = unwrapDynamicImport(call);
  const parent = current.parent;
  const index = array.elements.indexOf(node);
  if (index < 0) return { all: true, names: new Set() };
  if (parent?.type === "VariableDeclarator" && parent.init === current && parent.id.type === "ArrayPattern") {
    return demandsForPattern(parent.id.elements[index], sourceCode);
  }
  if (
    parent?.type === "AssignmentExpression"
    && parent.right === current
    && parent.left.type === "ArrayPattern"
  ) return demandsForPattern(parent.left.elements[index], sourceCode);
  return { all: true, names: new Set() };
}

function dynamicImportDemands(node, sourceCode) {
  const aggregateUsage = promiseAllElementDemands(node, sourceCode);
  if (aggregateUsage) return aggregateUsage;
  const current = unwrapDynamicImport(node);
  const parent = current.parent;
  if (
    parent?.type === "MemberExpression"
    && parent.object === current
    && propertyName(parent) === "then"
    && parent.parent?.type === "CallExpression"
  ) {
    const callback = parent.parent.arguments[0];
    const parameter = callback?.params?.[0];
    if (parameter?.type === "ObjectPattern") return { all: false, names: new Set(patternNames(parameter)) };
    return { all: true, names: new Set() };
  }
  if (parent?.type === "MemberExpression" && parent.object === current) {
    const name = propertyName(parent);
    return { all: !name, names: new Set(name ? [name] : []) };
  }
  if (parent?.type === "VariableDeclarator" && parent.init === current) {
    return demandsForPattern(parent.id, sourceCode);
  }
  if (parent?.type === "AssignmentExpression" && parent.right === current) {
    if (parent.left.type === "ObjectPattern") return { all: false, names: new Set(patternNames(parent.left)) };
  }
  if (parent?.type === "ExpressionStatement") return { all: false, names: new Set() };
  return { all: true, names: new Set() };
}

function returnedImportExpression(functionNode) {
  let value = functionNode?.body;
  if (value?.type === "BlockStatement") {
    const returns = value.body.filter((statement) => statement.type === "ReturnStatement");
    if (returns.length !== 1) return null;
    value = returns[0].argument;
  }
  while (value?.type === "AwaitExpression" || value?.type === "ChainExpression") value = value.argument;
  return value?.type === "ImportExpression" ? value : null;
}

function dynamicImportHelpers(sourceCode) {
  const helpers = new Map();
  walkAst(sourceCode.ast, (node) => {
    let identifier = null;
    let functionNode = null;
    if (
      node.type === "VariableDeclarator"
      && node.id.type === "Identifier"
      && ["ArrowFunctionExpression", "FunctionExpression"].includes(node.init?.type)
    ) {
      identifier = node.id;
      functionNode = node.init;
    } else if (node.type === "FunctionDeclaration" && node.id) {
      identifier = node.id;
      functionNode = node;
    }
    if (!functionNode || functionNode.params.some((parameter) => parameter.type !== "Identifier")) return;
    const importExpression = returnedImportExpression(functionNode);
    const variable = variableForIdentifier(sourceCode, identifier);
    if (!importExpression || !variable) return;
    helpers.set(variable, {
      importExpression,
      parameters: functionNode.params.map((parameter) => parameter.name)
    });
  });
  return helpers;
}

function referencedVariable(sourceCode, identifier) {
  for (const scope of sourceCode.scopeManager.scopes) {
    const reference = scope.references.find((item) => (
      item.identifier.range?.[0] === identifier.range?.[0]
    ));
    if (reference?.resolved) return reference.resolved;
  }
  return null;
}

function moduleRecord(root, file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const sourceCode = parseSource(source, file, "module");
  const directExports = new Map();
  const exportStars = [];
  for (const node of sourceCode.ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        for (const name of declarationNames(node.declaration)) {
          directExports.set(name, { kind: "local", localName: name });
        }
      }
      for (const specifier of node.specifiers || []) {
        const name = exportedName(specifier.exported);
        if (!name) continue;
        if (node.source) {
          const target = relativeTarget(file, node.source.value);
          directExports.set(name, {
            kind: "reexport",
            target,
            importedName: exportedName(specifier.local)
          });
        } else {
          directExports.set(name, { kind: "local", localName: exportedName(specifier.local) });
        }
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      const declaration = node.declaration;
      const localName = declaration?.type === "Identifier"
        ? declaration.name
        : declaration?.id?.name || "";
      directExports.set("default", { kind: "local", localName });
    } else if (node.type === "ExportAllDeclaration") {
      const target = relativeTarget(file, node.source?.value);
      if (!target) continue;
      if (node.exported) {
        directExports.set(exportedName(node.exported), { kind: "namespace-reexport", target });
      } else exportStars.push(target);
    }
  }

  const scope = moduleScope(sourceCode);
  const selfUsed = new Set();
  for (const [name, descriptor] of directExports) {
    if (descriptor.kind !== "local" || !descriptor.localName) continue;
    const variable = scope?.variables.find((item) => item.name === descriptor.localName);
    if ((variable?.references || []).some((reference) => (
      reference.isRead()
      && reference.identifier.parent?.type !== "ExportSpecifier"
    ))) selfUsed.add(name);
  }
  return { file, sourceCode, directExports, exportStars, selfUsed };
}

function addDemand(demands, target, name, mode, owner) {
  if (!target || !name) return;
  const key = `${target}#${name}`;
  if (!demands.has(key)) demands.set(key, { target, name, modes: new Set(), owners: new Set() });
  demands.get(key).modes.add(mode);
  demands.get(key).owners.add(owner);
}

function collectModuleDemands(record, knownModules, demands, modePrefix) {
  const { file, sourceCode } = record;
  const importHelpers = dynamicImportHelpers(sourceCode);
  for (const node of sourceCode.ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    const target = relativeTarget(file, node.source.value);
    if (!knownModules.has(target)) continue;
    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        addDemand(demands, target, exportedName(specifier.imported), `${modePrefix}:named`, file);
      } else if (specifier.type === "ImportDefaultSpecifier") {
        addDemand(demands, target, "default", `${modePrefix}:default`, file);
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        const namespace = namespaceReferenceDemands(variableForIdentifier(sourceCode, specifier.local));
        if (namespace.all) addDemand(demands, target, "*", `${modePrefix}:namespace`, file);
        for (const name of namespace.names) addDemand(demands, target, name, `${modePrefix}:namespace-property`, file);
      }
    }
  }
  walkAst(sourceCode.ast, (node) => {
    let source = null;
    let parameterBindings = new Map();
    if (node.type === "ImportExpression") source = node.source;
    else if (node.type === "CallExpression" && node.callee.type === "Identifier") {
      const helper = importHelpers.get(referencedVariable(sourceCode, node.callee));
      if (!helper) return;
      source = helper.importExpression.source;
      parameterBindings = new Map(helper.parameters.map((name, index) => [name, node.arguments[index]]));
    } else return;
    const target = resolvedDynamicTarget(file, source, knownModules, sourceCode, parameterBindings);
    if (!target) return;
    const usage = dynamicImportDemands(node, sourceCode);
    if (usage.all) addDemand(demands, target, "*", `${modePrefix}:dynamic-namespace`, file);
    for (const name of usage.names) addDemand(demands, target, name, `${modePrefix}:dynamic-named`, file);
  });
}

function collectExternalDemands(root, files, knownModules, modePrefix) {
  const demands = new Map();
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const sourceCode = parseSource(source, file, file.endsWith(".mjs") ? "module" : "script");
    const record = { file, sourceCode };
    collectModuleDemands(record, knownModules, demands, modePrefix);
  }
  return demands;
}

function effectiveExportNames(records, file, pending = new Set(), memo = new Map()) {
  if (memo.has(file)) return memo.get(file);
  if (pending.has(file)) return new Set();
  pending.add(file);
  const record = records.get(file);
  const names = new Set(record?.directExports.keys() || []);
  for (const target of record?.exportStars || []) {
    for (const name of effectiveExportNames(records, target, pending, memo)) {
      if (name !== "default") names.add(name);
    }
  }
  pending.delete(file);
  memo.set(file, names);
  return names;
}

function resolveDemands(records, initialDemands) {
  const live = new Set();
  const evidence = new Map();
  const queue = [...initialDemands.values()].map((item) => ({ ...item }));
  const visited = new Set();
  const effectiveMemo = new Map();
  while (queue.length) {
    const demand = queue.shift();
    const visitKey = `${demand.target}#${demand.name}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    const record = records.get(demand.target);
    if (!record) continue;
    if (demand.name === "*") {
      for (const name of effectiveExportNames(records, demand.target, new Set(), effectiveMemo)) {
        queue.push({ ...demand, name });
      }
      continue;
    }
    const descriptor = record.directExports.get(demand.name);
    if (descriptor) {
      live.add(visitKey);
      evidence.set(visitKey, demand);
      if (descriptor.kind === "reexport") {
        queue.push({ ...demand, target: descriptor.target, name: descriptor.importedName });
      } else if (descriptor.kind === "namespace-reexport") {
        queue.push({ ...demand, target: descriptor.target, name: "*" });
      }
      continue;
    }
    for (const target of record.exportStars) {
      if (effectiveExportNames(records, target, new Set(), effectiveMemo).has(demand.name)) {
        queue.push({ ...demand, target, name: demand.name });
      }
    }
  }
  return { live, evidence };
}

function validateAllowlist(raw) {
  const errors = [];
  const entries = new Map();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { entries, errors: ["export liveness allowlist must be an object"] };
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[^#]+\.js#[A-Za-z_$][\w$-]*$/.test(key)) {
      errors.push(`export liveness allowlist has invalid key: ${key}`);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`export liveness allowlist ${key} must be an object`);
      continue;
    }
    const unknown = Object.keys(value).filter((field) => !new Set(["kind", "reason"]).has(field));
    if (unknown.length) errors.push(`export liveness allowlist ${key} has unsupported fields: ${unknown.join(", ")}`);
    if (!ALLOWLIST_KINDS.has(value.kind)) errors.push(`export liveness allowlist ${key} has invalid kind ${JSON.stringify(value.kind)}`);
    if (typeof value.reason !== "string" || value.reason.trim().length < 32) {
      errors.push(`export liveness allowlist ${key} has no meaningful reason`);
    }
    entries.set(key, value);
  }
  return { entries, errors };
}

function analyzeNamedExportLiveness(options) {
  const root = path.resolve(options.root);
  const moduleFiles = [...new Set(options.moduleFiles || [])].sort();
  const knownModules = new Set(moduleFiles);
  const reportFiles = new Set(options.reportFiles || moduleFiles);
  const runtimeConsumerFiles = new Set(options.runtimeConsumerFiles || moduleFiles);
  const records = new Map(moduleFiles.map((file) => [file, moduleRecord(root, file)]));
  const runtimeDemands = new Map();
  for (const file of runtimeConsumerFiles) {
    const record = records.get(file);
    if (record) collectModuleDemands(record, knownModules, runtimeDemands, "runtime");
  }
  const toolDemands = collectExternalDemands(root, options.toolFiles || [], knownModules, "tool");
  const testDemands = collectExternalDemands(root, options.testFiles || [], knownModules, "test");
  for (const [key, demand] of toolDemands) {
    if (!runtimeDemands.has(key)) runtimeDemands.set(key, demand);
    else {
      for (const mode of demand.modes) runtimeDemands.get(key).modes.add(mode);
      for (const owner of demand.owners) runtimeDemands.get(key).owners.add(owner);
    }
  }
  const runtimeResolution = resolveDemands(records, runtimeDemands);
  const testResolution = resolveDemands(records, testDemands);
  const selfUsed = new Set();
  for (const record of records.values()) {
    for (const name of record.selfUsed) selfUsed.add(`${record.file}#${name}`);
  }
  const allowlist = validateAllowlist(options.allowlist || {});
  const errors = [...allowlist.errors];
  const candidates = [];
  const reportedNamedExports = [...reportFiles].reduce((total, file) => (
    total + [...(records.get(file)?.directExports.keys() || [])].filter((name) => name !== "default").length
  ), 0);
  const usedAllowlist = new Set();
  for (const file of [...reportFiles].sort()) {
    const record = records.get(file);
    if (!record) continue;
    for (const name of [...record.directExports.keys()].sort()) {
      if (name === "default") continue;
      const key = `${file}#${name}`;
      if (runtimeResolution.live.has(key)) {
        if (allowlist.entries.has(key)) errors.push(`export liveness allowlist contains stale runtime entry: ${key}`);
        continue;
      }
      const testOnly = testResolution.live.has(key);
      const classification = testOnly ? "test-only" : selfUsed.has(key) ? "internal-only" : "public-or-unused";
      candidates.push({ file, name, key, classification });
      const exception = allowlist.entries.get(key);
      if (!exception) {
        errors.push(
          testOnly
            ? `${file}: named export ${name} is consumed only by tests; add a reasoned test-only exception or remove the export`
            : selfUsed.has(key)
              ? `${file}: named export ${name} is used only inside its defining module; keep it local instead of exporting it`
              : `${file}: named export ${name} has no runtime consumer or internal use`
        );
        continue;
      }
      usedAllowlist.add(key);
      if (exception.kind === "test-only" && !testOnly) {
        errors.push(`export liveness allowlist ${key} is marked test-only but has no detected test consumer`);
      }
      if (exception.kind === "public-api" && testOnly) {
        errors.push(`export liveness allowlist ${key} is public-api but its only detected consumer is a test; use test-only`);
      }
    }
  }
  for (const key of allowlist.entries.keys()) {
    if (!usedAllowlist.has(key) && !errors.some((error) => error.includes(`stale runtime entry: ${key}`))) {
      errors.push(`export liveness allowlist contains stale or unknown entry: ${key}`);
    }
  }
  return Object.freeze({
    errors: Object.freeze(errors),
    candidates: Object.freeze(candidates),
    stats: Object.freeze({
      modules: records.size,
      reportedNamedExports,
      namedRuntimeDemands: [...runtimeDemands.values()].filter((item) => item.name !== "*").length,
      namespaceRuntimeDemands: [...runtimeDemands.values()].filter((item) => item.name === "*").length,
      toolDemands: toolDemands.size,
      runtimeLiveExports: runtimeResolution.live.size,
      selfUsedExports: selfUsed.size,
      testLiveExports: testResolution.live.size,
      nonRuntimeExports: candidates.length,
      exceptions: allowlist.entries.size
    })
  });
}

module.exports = { analyzeNamedExportLiveness };
