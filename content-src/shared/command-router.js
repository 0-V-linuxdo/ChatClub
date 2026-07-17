import { FRAME_COMMAND_SPECS } from "../../shared/frame-commands.js";

function commandCapability(command) {
  const spec = FRAME_COMMAND_SPECS[command];
  if (!spec) return "";
  return String(spec.capability || spec.features?.[0] || "base");
}

export function contentCommandRouter(runtimes, version) {
  return runtimes.install("content-command-router", version, () => {
    const routes = new Map();
    const owners = new Map();

    function register(capability, owner, handlers = {}) {
      const feature = String(capability || "").trim();
      const token = String(owner || "").trim();
      if (!feature || !token) throw new TypeError("Content command registration requires capability and owner");
      unregister(token);
      const commands = [];
      for (const [command, handler] of Object.entries(handlers)) {
        if (!FRAME_COMMAND_SPECS[command]) throw new TypeError(`Unknown content command handler: ${command}`);
        if (commandCapability(command) !== feature) {
          throw new TypeError(`Content command ${command} belongs to ${commandCapability(command)}, not ${feature}`);
        }
        if (typeof handler !== "function") throw new TypeError(`Content command ${command} requires a handler`);
        const existing = routes.get(command);
        if (existing && existing.owner !== token) throw new Error(`Content command ${command} is already registered`);
        routes.set(command, Object.freeze({ owner: token, handler }));
        commands.push(command);
      }
      owners.set(token, Object.freeze(commands));
      return () => unregister(token);
    }

    function unregister(owner) {
      const token = String(owner || "");
      const commands = owners.get(token) || [];
      for (const command of commands) {
        if (routes.get(command)?.owner === token) routes.delete(command);
      }
      owners.delete(token);
    }

    async function dispatch(commandName, data = {}) {
      const command = String(commandName || "");
      const spec = FRAME_COMMAND_SPECS[command];
      if (!spec) throw new Error(`Unknown action: ${command}`);
      const route = routes.get(command);
      if (!route) {
        const capability = commandCapability(command);
        const error = new Error(`Content capability is not installed: ${capability}`);
        error.code = "CAPABILITY_UNAVAILABLE";
        error.capability = capability;
        throw error;
      }
      return route.handler(data);
    }

    return {
      api: Object.freeze({ dispatch, register, unregister, commandCapability }),
      dispose() {
        routes.clear();
        owners.clear();
      }
    };
  });
}

export function installContentCapability(runtimes, options = {}) {
  const capability = String(options.capability || "").trim();
  const owner = String(options.owner || `content-capability:${capability}`).trim();
  const version = String(options.version || "").trim();
  const handlers = options.handlers || {};
  const onActivate = typeof options.activate === "function" ? options.activate : null;
  const onDispose = typeof options.dispose === "function" ? options.dispose : null;
  if (!capability || !owner || !version) throw new TypeError("Content capability installation is incomplete");
  const router = contentCommandRouter(runtimes, options.routerVersion || version);
  return runtimes.install(owner, version, () => {
    let unregister = null;
    return {
      api: Object.freeze({ capability, commands: Object.freeze(Object.keys(handlers)) }),
      activate() {
        unregister = router.register(capability, owner, handlers);
        onActivate?.();
      },
      dispose() {
        try { onDispose?.(); } catch {}
        unregister?.();
        unregister = null;
      }
    };
  });
}
