import { MESSAGE_NAVIGATOR_SITE_CONFIGS } from "./message-navigator-sites.js";
import {
  OFFICIAL_RULES_BASELINE_COMPONENTS,
  officialRulesComponentKey
} from "./official-rules-baseline.js";
import { OFFICIAL_RULES_SELECTOR_SLOTS } from "./official-rules-contract.js";
import { SUMMARY_SITE_CONFIGS } from "./summary-sites.js";
import { TOPIC_DELETE_SITE_CONFIGS } from "./topic-delete-sites.js";

const configsByFeature = Object.freeze({
  summary: new Map(SUMMARY_SITE_CONFIGS.map((config) => [config.id, config])),
  messageNavigator: new Map(MESSAGE_NAVIGATOR_SITE_CONFIGS.map((config) => [config.id, config])),
  delete: new Map(TOPIC_DELETE_SITE_CONFIGS.map((config) => [config.id, config]))
});

function cloneStrings(values = []) {
  return Object.freeze((Array.isArray(values) ? values : []).map(String));
}

function emptySelectors(feature) {
  return Object.freeze(Object.fromEntries(
    (OFFICIAL_RULES_SELECTOR_SLOTS[feature] || []).map((slot) => [slot, Object.freeze([])])
  ));
}

function packagedParameters(feature, config) {
  if (feature === "summary") return Object.freeze({ waitMs: 0 });
  if (feature === "messageNavigator") {
    return Object.freeze({ summaryMaxChars: Math.max(20, Math.min(180, Number(config?.summaryMaxChars) || 60)) });
  }
  return Object.freeze({ timeoutMs: Math.max(5000, Math.min(45000, Number(config?.userscriptTimeoutMs) || 15000)) });
}

function packagedComponent({ feature, siteId }) {
  const config = configsByFeature[feature]?.get(siteId);
  if (!config) throw new TypeError(`Packaged official-rules config is unavailable: ${officialRulesComponentKey(feature, siteId)}`);
  return Object.freeze({
    schemaVersion: 1,
    rulesApiVersion: 1,
    feature,
    siteId,
    revision: 0,
    status: "active",
    hosts: cloneStrings(config.hosts),
    pathPrefixes: cloneStrings(config.pathPrefixes),
    selectors: emptySelectors(feature),
    parameters: packagedParameters(feature, config)
  });
}

export const OFFICIAL_RULES_PACKAGED_COMPONENTS = Object.freeze(Object.fromEntries(
  OFFICIAL_RULES_BASELINE_COMPONENTS.map((entry) => [entry.key, packagedComponent(entry)])
));

export const OFFICIAL_RULES_PACKAGED_SNAPSHOT = Object.freeze({
  source: "packaged",
  sequence: 0,
  rulesVersion: "packaged",
  keyId: "",
  channelHash: "",
  catalogHash: "",
  officialTargets: Object.freeze(Object.fromEntries(
    OFFICIAL_RULES_BASELINE_COMPONENTS.map(({ feature, siteId, key }) => [
      key,
      Object.freeze({ feature, siteId, revision: 0 })
    ])
  )),
  createdAt: 0
});

export const OFFICIAL_RULES_PACKAGED_MATERIALIZED = Object.freeze({
  snapshot: OFFICIAL_RULES_PACKAGED_SNAPSHOT,
  channel: null,
  catalog: null,
  components: OFFICIAL_RULES_PACKAGED_COMPONENTS
});

export function resolvePackagedOfficialRulesSnapshot(snapshot = OFFICIAL_RULES_PACKAGED_SNAPSHOT) {
  if (snapshot?.source !== "packaged") throw new TypeError("Expected a packaged official-rules snapshot");
  return OFFICIAL_RULES_PACKAGED_MATERIALIZED;
}
