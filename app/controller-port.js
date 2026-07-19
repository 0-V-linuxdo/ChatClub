function portLabel(name) {
  return String(name || "Controller").trim() || "Controller";
}

export function createBindOnceControllerPort(name, methodNames = []) {
  const label = portLabel(name);
  const methods = Array.from(new Set((Array.isArray(methodNames) ? methodNames : [])
    .map((method) => String(method || "").trim())
    .filter(Boolean)));
  if (!methods.length) throw new TypeError(`${label} port requires at least one method.`);

  let target = null;
  const port = Object.freeze(Object.fromEntries(methods.map((method) => [method, (...args) => {
    if (!target) throw new Error(`${label} port is not bound.`);
    return target[method](...args);
  }])));

  return Object.freeze({
    port,
    bind(controller) {
      if (target) throw new Error(`${label} port is already bound.`);
      if (!controller || typeof controller !== "object" || Array.isArray(controller)) {
        throw new TypeError(`${label} port target must be an object.`);
      }
      for (const method of methods) {
        if (typeof controller[method] !== "function") {
          throw new TypeError(`${label} port target requires ${method}().`);
        }
      }
      target = controller;
      return port;
    }
  });
}
