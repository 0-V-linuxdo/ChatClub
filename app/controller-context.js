function controllerLabel(controllerName) {
  return controllerName || "Controller";
}

export function requireControllerContext(ctx, controllerName, name) {
  const value = ctx?.[name];
  if (value === undefined || value === null) {
    throw new TypeError(`${controllerLabel(controllerName)} requires ${name}.`);
  }
  return value;
}

export function requireControllerFunction(ctx, controllerName, name) {
  const value = requireControllerContext(ctx, controllerName, name);
  if (typeof value !== "function") {
    throw new TypeError(`${controllerLabel(controllerName)} requires ${name} to be a function.`);
  }
  return value;
}

export function optionalControllerFunction(ctx, name, fallback) {
  const value = ctx?.[name];
  if (value == null) return fallback;
  if (typeof value !== "function") {
    throw new TypeError(`Optional controller dependency ${name} must be a function when provided.`);
  }
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
