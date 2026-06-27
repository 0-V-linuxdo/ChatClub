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
  return typeof value === "function" ? value : fallback;
}

export function optionalControllerObject(ctx, name, fallback = {}) {
  const value = ctx?.[name];
  if (value == null) return fallback;
  return typeof value === "object" ? value : fallback;
}
