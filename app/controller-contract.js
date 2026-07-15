function label(name) {
  return String(name || "Controller");
}

function valueMatches(value, expected) {
  if (expected === "any") return value !== undefined && value !== null;
  if (expected === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === expected;
}

export function validateControllerContract(value, controllerName, specification, kind = "dependencies") {
  const name = label(controllerName);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} ${kind} must be an object.`);
  }
  const spec = specification && typeof specification === "object" ? specification : {};
  const allowed = new Set(Object.keys(spec));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${name} received extra ${kind} field ${key}.`);
  }
  for (const [key, declaration] of Object.entries(spec)) {
    const optional = String(declaration).endsWith("?");
    const expected = optional ? String(declaration).slice(0, -1) : String(declaration);
    const current = value[key];
    if (current == null && optional) continue;
    if (current == null) throw new TypeError(`${name} requires ${key}.`);
    if (!valueMatches(current, expected)) {
      throw new TypeError(`${name} requires ${key} to be ${expected}.`);
    }
  }
  return Object.freeze({ ...value });
}

export function requireControllerContext(ctx, controllerName, name) {
  const value = ctx?.[name];
  if (value === undefined || value === null) throw new TypeError(`${label(controllerName)} requires ${name}.`);
  return value;
}

export function requireControllerFunction(ctx, controllerName, name) {
  const value = requireControllerContext(ctx, controllerName, name);
  if (typeof value !== "function") throw new TypeError(`${label(controllerName)} requires ${name} to be a function.`);
  return value;
}

export function optionalControllerFunction(ctx, name, fallback) {
  const value = ctx?.[name];
  if (value == null) return fallback;
  if (typeof value !== "function") throw new TypeError(`Optional controller dependency ${name} must be a function when provided.`);
  return value;
}

export function optionalControllerObject(ctx, name, fallback = {}) {
  const value = ctx?.[name];
  if (value == null) return fallback;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Optional controller dependency ${name} must be an object when provided.`);
  }
  return value;
}
