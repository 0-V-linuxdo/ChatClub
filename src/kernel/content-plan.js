// Injection plan for content capabilities (spec §13.2). App and background compute it the same way.

export const CONTENT_SCRIPT_PREFIX = "chatclub-cap-";

export function hostToMatchPatterns(hostOrPattern) {
  const value = String(hostOrPattern).trim();
  if (!value) return [];
  if (value.includes("://")) return [value.endsWith("/*") || value.includes("/", value.indexOf("://") + 3) ? value : `${value}/*`];
  if (value.startsWith("*.")) return [`https://${value}/*`];
  return [`https://${value}/*`, `https://*.${value}/*`];
}

export function contentBundlePath(capabilityId) {
  return `content/${capabilityId}.js`;
}

/**
 * @param {import("./host.js").PluginHost} host
 * @param {{ defaultHosts?: string[] }} options hosts of every registered chatApp
 */
export function computeContentPlan(host, { defaultHosts = [] } = {}) {
  const plan = [];
  for (const name of host.order) {
    const plugin = host.plugins[name];
    if (!plugin.content?.length || !host.isPluginEnabled(name)) continue;
    for (const cap of plugin.content) {
      const hosts = cap.hosts?.length ? cap.hosts : defaultHosts;
      const matches = [...new Set(hosts.flatMap(hostToMatchPatterns))].sort();
      if (!matches.length) continue;
      plan.push({
        id: CONTENT_SCRIPT_PREFIX + cap.id,
        plugin: name,
        capability: cap.id,
        js: [contentBundlePath(cap.id)],
        world: cap.world === "MAIN" ? "MAIN" : "ISOLATED",
        runAt: cap.runAt === "document_start" ? "document_start" : cap.runAt === "document_end" ? "document_end" : "document_idle",
        matches,
        allFrames: true,
      });
    }
  }
  return plan;
}

export function planSignature(plan) {
  return JSON.stringify(plan.map((p) => [p.id, p.js, p.world, p.runAt, p.matches]));
}
