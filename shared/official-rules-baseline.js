import { MESSAGE_NAVIGATOR_SITE_CONFIGS } from "./message-navigator-sites.js";
import { SUMMARY_SITE_CONFIGS } from "./summary-sites.js";
import { TOPIC_DELETE_SITE_CONFIGS } from "./topic-delete-sites.js";
import { normalizeHost } from "./url-match.js";

export const OFFICIAL_RULES_FEATURES = Object.freeze([
  "summary",
  "messageNavigator",
  "delete"
]);

const IPV4 = /^\d+(?:\.\d+){3}$/;

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function exactAsciiHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.startsWith("*.") || raw.includes(":")) return "";
  const normalized = normalizeHost(raw);
  if (
    !normalized
    || normalized !== raw
    || normalized.startsWith("[")
    || IPV4.test(normalized)
    || normalized === "localhost"
    || normalized.split(".").some((label) => label.startsWith("xn--"))
  ) return "";
  return normalized;
}

function trustRoots(hosts = []) {
  return Object.freeze(uniqueStrings(hosts).map((host) => {
    const normalized = normalizeHost(host);
    return exactAsciiHost(normalized.startsWith("*.") ? normalized.slice(2) : normalized);
  }).filter(Boolean));
}

function packagedExactHosts(hosts = []) {
  return Object.freeze(uniqueStrings(hosts).map(exactAsciiHost).filter(Boolean));
}

function componentKey(feature, siteId) {
  return `${feature}/${siteId}`;
}

function deleteAliasPolicy(site) {
  const declaredAliasSafe = site?.aliasSafe === true;
  const provider = String(site?.provider || site?.scriptId || "").trim();
  const routeGrammar = String(site?.routeGrammar || "").trim();
  return Object.freeze({
    // An alias is never inferred from a wildcard host. A future packaged runner
    // must opt in and bind the alias to both a provider and a route grammar.
    aliasSafe: declaredAliasSafe && Boolean(provider) && Boolean(routeGrammar),
    provider,
    routeGrammar
  });
}

function baselineComponent(feature, site, profile) {
  const siteId = String(site?.id || "").trim();
  if (!siteId) throw new TypeError(`Official rules ${feature} baseline site is missing an id.`);
  const hosts = uniqueStrings(site.hosts);
  const exactHosts = feature === "delete" ? uniqueStrings(site.deleteAuthorizedHosts || hosts) : hosts;
  const paths = Object.freeze(uniqueStrings(site.pathPrefixes));
  return Object.freeze({
    key: componentKey(feature, siteId),
    feature,
    siteId,
    profile: String(profile || siteId).trim(),
    packagedExactHosts: packagedExactHosts(exactHosts),
    trustRoots: trustRoots(hosts),
    pathPrefixes: paths,
    deleteAliasPolicy: feature === "delete"
      ? deleteAliasPolicy(site)
      : Object.freeze({ aliasSafe: false, provider: "", routeGrammar: "" })
  });
}

const summaryComponents = SUMMARY_SITE_CONFIGS.map((site) => (
  baselineComponent("summary", site, site.id)
));

const messageNavigatorComponents = MESSAGE_NAVIGATOR_SITE_CONFIGS.map((site) => (
  baselineComponent("messageNavigator", site, site.adapter)
));

const deleteComponents = TOPIC_DELETE_SITE_CONFIGS.map((site) => (
  baselineComponent("delete", site, site.scriptId)
));

export const OFFICIAL_RULES_BASELINE_COMPONENTS = Object.freeze([
  ...summaryComponents,
  ...messageNavigatorComponents,
  ...deleteComponents
]);

export const OFFICIAL_RULES_COMPONENT_KEYS = Object.freeze(
  OFFICIAL_RULES_BASELINE_COMPONENTS.map(({ key }) => key)
);

if (new Set(OFFICIAL_RULES_COMPONENT_KEYS).size !== OFFICIAL_RULES_COMPONENT_KEYS.length) {
  throw new TypeError("Official rules packaged baseline contains a duplicate component key.");
}

const baselineByKey = new Map(
  OFFICIAL_RULES_BASELINE_COMPONENTS.map((component) => [component.key, component])
);

export function officialRulesComponentKey(feature, siteId) {
  const normalizedFeature = String(feature || "").trim();
  const normalizedSiteId = String(siteId || "").trim();
  if (!normalizedFeature || !normalizedSiteId) return "";
  return componentKey(normalizedFeature, normalizedSiteId);
}

export function findOfficialRulesBaselineComponent(feature, siteId) {
  return baselineByKey.get(officialRulesComponentKey(feature, siteId)) || null;
}

function officialRulesTrustRoots(feature, siteId) {
  return findOfficialRulesBaselineComponent(feature, siteId)?.trustRoots || Object.freeze([]);
}

export function officialRulesCanonicalExactHost(host) {
  return exactAsciiHost(host);
}

function officialRulesHostWithinTrustRoots(feature, siteId, host) {
  const normalized = exactAsciiHost(host);
  if (!normalized) return false;
  return officialRulesTrustRoots(feature, siteId).some((root) => (
    normalized === root || normalized.endsWith(`.${root}`)
  ));
}

export function officialRulesHostAuthorization(feature, siteId, host) {
  const normalized = exactAsciiHost(host);
  const baseline = findOfficialRulesBaselineComponent(feature, siteId);
  if (!normalized || !baseline || !officialRulesHostWithinTrustRoots(feature, siteId, normalized)) {
    return Object.freeze({ allowed: false, host: normalized, reason: "outside-trust-root", alias: false });
  }
  const packaged = baseline.packagedExactHosts.includes(normalized);
  if (feature !== "delete" || packaged) {
    return Object.freeze({ allowed: true, host: normalized, reason: packaged ? "packaged-host" : "trusted-alias", alias: !packaged });
  }
  if (!baseline.deleteAliasPolicy.aliasSafe) {
    return Object.freeze({ allowed: false, host: normalized, reason: "delete-alias-not-safe", alias: true });
  }
  return Object.freeze({
    allowed: true,
    host: normalized,
    reason: "delete-alias-safe",
    alias: true,
    provider: baseline.deleteAliasPolicy.provider,
    routeGrammar: baseline.deleteAliasPolicy.routeGrammar
  });
}
