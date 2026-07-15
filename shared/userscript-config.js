export function isCustomUserscriptConfig(config = {}) {
  return Boolean(config && (
    config.builtIn === false
    || config.sourceMode === "custom"
    || config.userscriptOverride === true
    || typeof config.customUserscript === "string"
  ));
}

export function customUserscriptSource(config = {}) {
  if (!config || typeof config !== "object") return "";
  if (typeof config.customUserscript === "string") return config.customUserscript;
  // This branch exists only for v1/v2 input. v3 persistence always uses customUserscript.
  if (isCustomUserscriptConfig(config) && typeof config.userscript === "string") return config.userscript;
  return "";
}
