export function createCommandDispatcher(commandSpecs, handlers = {}) {
  const specifications = commandSpecs && typeof commandSpecs === "object" ? commandSpecs : {};
  const routes = handlers && typeof handlers === "object" ? handlers : {};
  for (const command of Object.keys(specifications)) {
    if (typeof routes[command] !== "function") {
      throw new TypeError(`Missing content command handler: ${command}`);
    }
  }
  for (const command of Object.keys(routes)) {
    if (!Object.hasOwn(specifications, command)) {
      throw new TypeError(`Unknown content command handler: ${command}`);
    }
  }
  return async function dispatchContentCommand(commandName, data = {}) {
    const command = String(commandName || "");
    const handler = routes[command];
    if (!handler) throw new Error(`Unknown action: ${command}`);
    return handler(data);
  };
}
