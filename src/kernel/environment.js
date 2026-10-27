// Runtime requirement checks for `requires` (spec §5.1, §6 step 2).

export function detectEnvironment(g = globalThis) {
  const chromeApi = g.chrome;
  const isFirefox = typeof g.browser !== "undefined" && typeof g.browser?.runtime?.getBrowserInfo === "function";
  return {
    chromium: !isFirefox,
    firefox: isFirefox,
    userScripts: !!chromeApi?.userScripts,
    debugger: !!chromeApi?.debugger,
  };
}

/** Returns the list of requirements that are not met. Unknown requirements count as unmet. */
export function unmetRequirements(requires, env) {
  if (!Array.isArray(requires) || requires.length === 0) return [];
  return requires.filter((req) => {
    if (typeof req === "function") {
      try {
        return !req(env);
      } catch {
        return true;
      }
    }
    return env[req] !== true;
  });
}
