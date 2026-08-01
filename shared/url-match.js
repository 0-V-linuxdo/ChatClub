export function normalizeHost(host) {
  const raw = String(host || "").trim().toLowerCase();
  if (!raw || /\s|:\/\/|[/?#@]/.test(raw)) return "";
  const wildcard = raw.startsWith("*.");
  const candidate = wildcard ? raw.slice(2) : raw;
  if (!candidate || candidate.includes("*") || (!candidate.startsWith("[") && candidate.includes(":"))) return "";
  let hostname = "";
  try {
    const parsed = new URL(`http://${candidate}`);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
    hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
  if (!hostname || hostname.length > 253) return "";
  const bracketedIpv6 = hostname.startsWith("[") && hostname.endsWith("]");
  if (!bracketedIpv6) {
    const labels = hostname.split(".");
    if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return "";
  }
  if (wildcard && (bracketedIpv6 || /^\d+(?:\.\d+){3}$/.test(hostname) || hostname === "localhost")) return "";
  return wildcard ? `*.${hostname}` : hostname;
}

export function normalizeHostList(hosts = []) {
  return Array.from(new Set((Array.isArray(hosts) ? hosts : []).map(normalizeHost).filter(Boolean)));
}

export function hostMatchesPattern(pattern, host) {
  const normalizedPattern = normalizeHost(pattern);
  const normalizedHost = normalizeHost(host);
  if (!normalizedPattern || !normalizedHost) return false;
  if (normalizedPattern === normalizedHost) return true;
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
  }
  return false;
}

export function configMatchesHref(config, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  const hosts = Array.isArray(config.hosts) ? config.hosts : [];
  const officialHttpsHosts = Array.isArray(config.officialRuleHttpsHosts)
    ? config.officialRuleHttpsHosts
    : [];
  const officialHttpsMatch = officialHttpsHosts.some((host) => hostMatchesPattern(host, url.hostname));
  if (officialHttpsMatch && url.protocol !== "https:") return false;
  if (!officialHttpsMatch && !hosts.some((host) => hostMatchesPattern(host, url.hostname))) return false;
  const prefixes = Array.isArray(config.pathPrefixes) ? config.pathPrefixes.filter(Boolean) : [];
  return prefixes.length === 0 || prefixes.some((prefix) => url.pathname.startsWith(prefix));
}

export function officialRuleConfigMatchesHref(config, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const hostname = normalizeHost(url.hostname);
  if (!hostname || hostname.startsWith("*.")) return false;
  const hosts = Array.isArray(config?.officialRuleHosts) ? config.officialRuleHosts : [];
  const exactHostMatch = hosts.some((host) => {
    const candidate = normalizeHost(host);
    return Boolean(candidate && !candidate.startsWith("*.") && candidate === hostname);
  });
  if (!exactHostMatch) return false;
  const prefixes = Array.isArray(config?.officialRulePathPrefixes)
    ? config.officialRulePathPrefixes.map((prefix) => String(prefix || "").trim()).filter(Boolean)
    : [];
  return prefixes.length === 0 || prefixes.some((prefix) => url.pathname.startsWith(prefix));
}

export function deleteConfigAuthorizedForHref(config, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const hostname = normalizeHost(url.hostname);
  if (!hostname || hostname.startsWith("*.")) return false;
  return (Array.isArray(config?.deleteAuthorizedHosts) ? config.deleteAuthorizedHosts : [])
    .some((host) => {
      const candidate = normalizeHost(host);
      return Boolean(candidate && !candidate.startsWith("*.") && candidate === hostname);
    });
}

export function findSummarySiteConfig(configs, href) {
  return (configs || []).find((config) => config.enabled !== false && configMatchesHref(config, href)) || null;
}

function originMatchPattern(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

function hostMatchPattern(host) {
  const raw = normalizeHost(host);
  if (!raw) return [];
  if (raw.startsWith("*.")) {
    const suffix = raw.slice(2);
    return [`https://*.${suffix}/*`, `http://*.${suffix}/*`, `https://${suffix}/*`, `http://${suffix}/*`];
  }
  return [`https://${raw}/*`, `http://${raw}/*`];
}

export function uniqueMatchPatterns(chatApps) {
  const patterns = new Set();
  for (const app of chatApps || []) {
    const own = originMatchPattern(app.url);
    if (own) patterns.add(own);
    for (const host of app.hosts || []) {
      for (const pattern of hostMatchPattern(host)) patterns.add(pattern);
    }
    for (const host of app.officialRuleHttpsHosts || []) {
      const raw = normalizeHost(host);
      if (raw && !raw.startsWith("*.")) patterns.add(`https://${raw}/*`);
    }
  }
  return Array.from(patterns).sort();
}
