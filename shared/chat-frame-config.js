import { hostMatchesPattern, normalizeHostList } from "./url-match.js";

export const CHAT_FRAME_ALLOW_FEATURES = Object.freeze([
  "microphone",
  "clipboard-write",
  "clipboard-read",
  "geolocation",
  "display-capture",
  "camera",
  "unload",
  "autoplay",
  "fullscreen",
  "shared-storage",
  "picture-in-picture",
  "storage-access",
  "web-share"
]);

export const CHAT_FRAME_SANDBOX_TOKENS = Object.freeze([
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-top-navigation",
  "allow-modals",
  "allow-downloads",
  "allow-presentation",
  "allow-storage-access-by-user-activation"
]);

const CHAT_FRAME_REFERRER_POLICIES = Object.freeze([
  "no-referrer",
  "no-referrer-when-downgrade",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url"
]);

// Kept as a short alias for Settings and other consumers that present the
// browser-defined ReferrerPolicy value set directly.
export const REFERRER_POLICIES = CHAT_FRAME_REFERRER_POLICIES;

const DEFAULT_CHAT_FRAME_ALLOW = CHAT_FRAME_ALLOW_FEATURES
  .map((feature) => `${feature} *`)
  .join("; ");

const DEFAULT_CHAT_FRAME_SANDBOX = CHAT_FRAME_SANDBOX_TOKENS.join(" ");
const DEFAULT_CHAT_FRAME_REFERRER_POLICY = "no-referrer";

const CHAT_FRAME_HIGH_RISK_ALLOW_FEATURES = Object.freeze([
  "microphone",
  "clipboard-write",
  "clipboard-read",
  "geolocation",
  "display-capture",
  "camera",
  "shared-storage",
  "storage-access",
  "web-share"
]);

const CHAT_FRAME_PROTECTED_ATTRIBUTES = Object.freeze([
  "allow",
  "sandbox",
  "referrerpolicy",
  "src",
  "srcdoc",
  "name",
  "id",
  "class",
  "dataset",
  "style"
]);

const ALLOW_FEATURE_SET = new Set(CHAT_FRAME_ALLOW_FEATURES);
const SANDBOX_TOKEN_SET = new Set(CHAT_FRAME_SANDBOX_TOKENS);
const REFERRER_POLICY_SET = new Set(CHAT_FRAME_REFERRER_POLICIES);
const HIGH_RISK_ALLOW_FEATURE_SET = new Set(CHAT_FRAME_HIGH_RISK_ALLOW_FEATURES);
const PROTECTED_ATTRIBUTE_SET = new Set(CHAT_FRAME_PROTECTED_ATTRIBUTES);
const ATTRIBUTE_NAME_PATTERN = /^[a-z_:][a-z0-9_.:-]*$/;
const POLICY_TOKEN_PATTERN = /^[a-z][a-z0-9-]*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SAFE_OBJECT_KEYS = new Set(["allow", "sandbox", "referrerPolicy", "attributes"]);
const DEDICATED_ATTRIBUTE_ORDER = new Map([
  ["allow", 0],
  ["sandbox", 1],
  ["referrerpolicy", 2]
]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function issue(code, path, message, details = {}) {
  return { code, path, message, ...details };
}

function stableUnique(values = []) {
  return Array.from(new Set(values)).sort();
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePolicyToken(left, right, knownOrder) {
  const leftIndex = knownOrder.indexOf(left);
  const rightIndex = knownOrder.indexOf(right);
  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
  if (leftIndex >= 0) return -1;
  if (rightIndex >= 0) return 1;
  return compareText(left, right);
}

function normalizedPolicyTokens(raw, knownTokens, path, errors, warnings) {
  if (typeof raw !== "string") {
    errors.push(issue("raw-value-type", path, "Raw policy value must be a string."));
    return null;
  }
  if (CONTROL_CHARACTER_PATTERN.test(raw)) {
    errors.push(issue("raw-control-character", path, "Raw policy value cannot contain control characters."));
    return null;
  }
  if (!raw.trim()) return { value: "", tokens: [] };
  const seen = new Set();
  const tokens = [];
  for (const tokenValue of raw.trim().split(/\s+/)) {
    const token = tokenValue.toLowerCase();
    if (!POLICY_TOKEN_PATTERN.test(token)) {
      errors.push(issue("raw-token-invalid", path, `Invalid policy token: ${tokenValue}`, { token: tokenValue }));
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (!knownTokens.includes(token)) {
      warnings.push(issue(
        "raw-token-unknown",
        path,
        `Unknown policy token will be kept for forward compatibility: ${token}`,
        { token }
      ));
    }
  }
  tokens.sort((left, right) => comparePolicyToken(left, right, knownTokens));
  return { value: tokens.join(" "), tokens };
}

function validAllowListToken(token) {
  if (token === "*") return true;
  if (/^'(?:self|none|src)'$/i.test(token)) return true;
  if (/^'[a-z][a-z0-9-]*'$/i.test(token)) return true;
  if (/^[a-z][a-z0-9-]*$/i.test(token)) return true;
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s;,]+$/i.test(token);
}

function normalizeAllowListToken(token) {
  if (/^'[a-z][a-z0-9-]*'$/i.test(token) || /^[a-z][a-z0-9-]*$/i.test(token)) {
    return token.toLowerCase();
  }
  return token;
}

function allowListTokenIsUnknown(token) {
  return token !== "*"
    && !["'self'", "'none'", "'src'"].includes(token)
    && !/^[a-z][a-z0-9+.-]*:\/\//i.test(token);
}

function normalizedRawAllow(raw, path, errors, warnings) {
  if (typeof raw !== "string") {
    errors.push(issue("raw-value-type", path, "Raw allow value must be a string."));
    return null;
  }
  if (CONTROL_CHARACTER_PATTERN.test(raw)) {
    errors.push(issue("raw-control-character", path, "Raw allow value cannot contain control characters."));
    return null;
  }
  if (!raw.trim()) return { value: "", directives: [] };
  const rawDirectives = raw.split(";");
  while (rawDirectives.length && !rawDirectives.at(-1).trim()) rawDirectives.pop();
  const directives = [];
  const seenFeatures = new Set();
  for (let index = 0; index < rawDirectives.length; index += 1) {
    const directive = rawDirectives[index].trim();
    const directivePath = `${path}[${index}]`;
    if (!directive) {
      errors.push(issue("allow-directive-empty", directivePath, "Allow policy cannot contain an empty directive."));
      continue;
    }
    const [rawFeature, ...rawAllowList] = directive.split(/\s+/);
    const feature = String(rawFeature || "").toLowerCase();
    if (!POLICY_TOKEN_PATTERN.test(feature)) {
      errors.push(issue("allow-feature-invalid", directivePath, `Invalid allow feature: ${rawFeature}`, { token: rawFeature }));
      continue;
    }
    if (seenFeatures.has(feature)) {
      errors.push(issue("allow-feature-duplicate", directivePath, `Duplicate allow feature: ${feature}`, { token: feature }));
      continue;
    }
    seenFeatures.add(feature);
    const allowList = [];
    const seenAllowList = new Set();
    for (const rawToken of rawAllowList) {
      if (!validAllowListToken(rawToken)) {
        errors.push(issue("allow-list-token-invalid", directivePath, `Invalid allow-list token: ${rawToken}`, { token: rawToken }));
        continue;
      }
      const token = normalizeAllowListToken(rawToken);
      if (seenAllowList.has(token)) continue;
      seenAllowList.add(token);
      allowList.push(token);
      if (allowListTokenIsUnknown(token)) {
        warnings.push(issue(
          "allow-list-token-unknown",
          directivePath,
          `Unknown allow-list token will be kept for forward compatibility: ${token}`,
          { token }
        ));
      }
    }
    if (allowList.includes("'none'") && allowList.length > 1) {
      errors.push(issue("allow-none-combination", directivePath, "'none' must be the only allow-list token."));
    }
    if (allowList.includes("*") && allowList.length > 1) {
      errors.push(issue("allow-wildcard-combination", directivePath, "* must be the only allow-list token."));
    }
    allowList.sort(compareText);
    if (!ALLOW_FEATURE_SET.has(feature)) {
      warnings.push(issue(
        "allow-feature-unknown",
        directivePath,
        `Unknown allow feature will be kept for forward compatibility: ${feature}`,
        { token: feature }
      ));
    }
    directives.push({ feature, allowList });
  }
  directives.sort((left, right) => comparePolicyToken(left.feature, right.feature, CHAT_FRAME_ALLOW_FEATURES));
  return {
    value: directives
      .map(({ feature, allowList }) => [feature, ...allowList].join(" "))
      .join("; "),
    directives
  };
}

function normalizeVisualSelection(raw, knownValues, path, errors) {
  if (!Array.isArray(raw)) {
    errors.push(issue("visual-values-type", path, "Visual policy selection must be an array."));
    return null;
  }
  const selected = new Set();
  for (let index = 0; index < raw.length; index += 1) {
    if (typeof raw[index] !== "string") {
      errors.push(issue("visual-value-type", `${path}[${index}]`, "Visual policy values must be strings."));
      continue;
    }
    const token = raw[index].trim().toLowerCase();
    if (!knownValues.includes(token)) {
      errors.push(issue("visual-value-unknown", `${path}[${index}]`, `Unknown visual policy value: ${raw[index]}`, { token: raw[index] }));
      continue;
    }
    selected.add(token);
  }
  return knownValues.filter((token) => selected.has(token));
}

function inspectAllow(raw, errors, warnings) {
  const path = "allow";
  if (!plainObject(raw)) {
    errors.push(issue("policy-type", path, "Allow configuration must be an object."));
    return null;
  }
  if (raw.mode === "omit") return { mode: "omit" };
  if (raw.mode === "visual") {
    const features = normalizeVisualSelection(raw.features, CHAT_FRAME_ALLOW_FEATURES, `${path}.features`, errors);
    return features ? { mode: "visual", features } : null;
  }
  if (raw.mode === "raw") {
    const parsed = normalizedRawAllow(raw.value, `${path}.value`, errors, warnings);
    return parsed ? { mode: "raw", value: parsed.value } : null;
  }
  errors.push(issue("policy-mode", `${path}.mode`, "Allow mode must be visual, raw, or omit."));
  return null;
}

function inspectSandbox(raw, errors, warnings) {
  const path = "sandbox";
  if (!plainObject(raw)) {
    errors.push(issue("policy-type", path, "Sandbox configuration must be an object."));
    return null;
  }
  if (raw.mode === "omit") return { mode: "omit" };
  if (raw.mode === "visual") {
    const tokens = normalizeVisualSelection(raw.tokens, CHAT_FRAME_SANDBOX_TOKENS, `${path}.tokens`, errors);
    return tokens ? { mode: "visual", tokens } : null;
  }
  if (raw.mode === "raw") {
    const parsed = normalizedPolicyTokens(raw.value, CHAT_FRAME_SANDBOX_TOKENS, `${path}.value`, errors, warnings);
    return parsed ? { mode: "raw", value: parsed.value } : null;
  }
  errors.push(issue("policy-mode", `${path}.mode`, "Sandbox mode must be visual, raw, or omit."));
  return null;
}

function inspectReferrerPolicy(raw, errors) {
  const path = "referrerPolicy";
  if (!plainObject(raw)) {
    errors.push(issue("policy-type", path, "Referrer policy configuration must be an object."));
    return null;
  }
  if (raw.mode === "omit") return { mode: "omit" };
  if (raw.mode === "value" && typeof raw.value === "string") {
    const value = raw.value.trim().toLowerCase();
    if (REFERRER_POLICY_SET.has(value)) return { mode: "value", value };
  }
  errors.push(issue(
    "referrer-policy-value",
    `${path}.value`,
    `Referrer policy must be one of: ${CHAT_FRAME_REFERRER_POLICIES.join(", ")}`
  ));
  return null;
}

function iframeAttributeNameError(rawName) {
  if (typeof rawName !== "string") return "attribute-name-type";
  const name = rawName.trim().toLowerCase();
  if (!name || !ATTRIBUTE_NAME_PATTERN.test(name)) return "attribute-name-invalid";
  if (PROTECTED_ATTRIBUTE_SET.has(name)) return "attribute-name-protected";
  if (name.startsWith("data-")) return "attribute-name-data";
  if (name.startsWith("on")) return "attribute-name-event";
  return "";
}

function inspectAttributes(raw, errors) {
  if (!Array.isArray(raw)) {
    errors.push(issue("attributes-type", "attributes", "Advanced attributes must be an array."));
    return null;
  }
  const attributes = [];
  const names = new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    const path = `attributes[${index}]`;
    if (!plainObject(entry)) {
      errors.push(issue("attribute-type", path, "Advanced attribute must be an object."));
      continue;
    }
    const nameError = iframeAttributeNameError(entry.name);
    const name = typeof entry.name === "string" ? entry.name.trim().toLowerCase() : "";
    if (nameError) {
      const messages = {
        "attribute-name-type": "Advanced attribute name must be a string.",
        "attribute-name-invalid": "Advanced attribute name is not a valid HTML attribute name.",
        "attribute-name-protected": `Advanced attribute is managed by ChatClub: ${name || entry.name}`,
        "attribute-name-data": "data-* attributes are reserved for ChatClub frame bindings.",
        "attribute-name-event": "Event-handler attributes (on*) are not allowed."
      };
      errors.push(issue(nameError, `${path}.name`, messages[nameError], { name }));
      continue;
    }
    if (names.has(name)) {
      errors.push(issue("attribute-name-duplicate", `${path}.name`, `Duplicate advanced attribute: ${name}`, { name }));
      continue;
    }
    names.add(name);
    if (typeof entry.value !== "string") {
      errors.push(issue("attribute-value-type", `${path}.value`, "Advanced attribute value must be a string.", { name }));
      continue;
    }
    attributes.push({ name, value: entry.value });
  }
  attributes.sort((left, right) => compareText(left.name, right.name));
  return attributes;
}

function grantedAllowFeature(feature, allowList = []) {
  return HIGH_RISK_ALLOW_FEATURE_SET.has(feature)
    && !(allowList.length === 1 && allowList[0] === "'none'");
}

function sandboxRiskKeys(tokens = []) {
  const selected = new Set(tokens);
  const risks = [];
  if (selected.has("allow-scripts") && selected.has("allow-same-origin")) {
    risks.push("sandbox:scripts-and-same-origin");
  }
  if (selected.has("allow-top-navigation")) risks.push("sandbox:top-navigation");
  if (selected.has("allow-popups-to-escape-sandbox")) risks.push("sandbox:escaping-popups");
  for (const token of selected) {
    if (!SANDBOX_TOKEN_SET.has(token)) risks.push(`sandbox:unknown:${token}`);
  }
  return risks;
}

function riskKeysFromNormalized(config) {
  if (!config) return [];
  const risks = [];
  if (config.allow?.mode === "visual") {
    for (const feature of config.allow.features) {
      if (HIGH_RISK_ALLOW_FEATURE_SET.has(feature)) risks.push(`allow:${feature}`);
    }
  } else if (config.allow?.mode === "raw") {
    const parsed = normalizedRawAllow(config.allow.value, "allow.value", [], []);
    for (const directive of parsed?.directives || []) {
      if (grantedAllowFeature(directive.feature, directive.allowList)) risks.push(`allow:${directive.feature}`);
      if (!ALLOW_FEATURE_SET.has(directive.feature)) risks.push(`allow:unknown:${directive.feature}`);
      for (const token of directive.allowList) {
        if (allowListTokenIsUnknown(token)) risks.push(`allow:unknown-token:${token}`);
      }
    }
  }
  if (config.sandbox?.mode === "omit") {
    risks.push("sandbox:omit");
  } else if (config.sandbox?.mode === "visual") {
    risks.push(...sandboxRiskKeys(config.sandbox.tokens));
  } else if (config.sandbox?.mode === "raw") {
    const parsed = normalizedPolicyTokens(config.sandbox.value, CHAT_FRAME_SANDBOX_TOKENS, "sandbox.value", [], []);
    risks.push(...sandboxRiskKeys(parsed?.tokens));
  }
  if (config.referrerPolicy?.mode === "value" && config.referrerPolicy.value === "unsafe-url") {
    risks.push("referrer-policy:unsafe-url");
  }
  return stableUnique(risks);
}

/**
 * Validate and canonicalize an iframe override without throwing.
 *
 * Missing/null/empty input is a valid inherited configuration and produces an
 * undefined value. Invalid input never yields a partial override.
 */
export function inspectIframeConfig(raw) {
  const errors = [];
  const warnings = [];
  if (raw === undefined || raw === null) {
    return { valid: true, value: undefined, errors, warnings, risks: [] };
  }
  if (!plainObject(raw)) {
    errors.push(issue("config-type", "iframeConfig", "iframeConfig must be an object."));
    return { valid: false, value: undefined, errors, warnings, risks: [] };
  }
  for (const key of Object.keys(raw)) {
    if (!SAFE_OBJECT_KEYS.has(key)) {
      warnings.push(issue("config-field-unknown", key, `Unknown iframeConfig field was discarded: ${key}`, { key }));
    }
  }
  const value = {};
  if (hasOwn(raw, "allow")) {
    const allow = inspectAllow(raw.allow, errors, warnings);
    if (allow) value.allow = allow;
  }
  if (hasOwn(raw, "sandbox")) {
    const sandbox = inspectSandbox(raw.sandbox, errors, warnings);
    if (sandbox) value.sandbox = sandbox;
  }
  if (hasOwn(raw, "referrerPolicy")) {
    const referrerPolicy = inspectReferrerPolicy(raw.referrerPolicy, errors);
    if (referrerPolicy) value.referrerPolicy = referrerPolicy;
  }
  if (hasOwn(raw, "attributes")) {
    const attributes = inspectAttributes(raw.attributes, errors);
    if (attributes?.length) value.attributes = attributes;
  }
  if (errors.length) return { valid: false, value: undefined, errors, warnings, risks: [] };
  const normalized = Object.keys(value).length ? value : undefined;
  return {
    valid: true,
    value: normalized,
    errors,
    warnings,
    risks: riskKeysFromNormalized(normalized)
  };
}

export function normalizeIframeConfig(raw, options = {}) {
  const result = inspectIframeConfig(raw);
  if (!result.valid && options?.strict === true) {
    const error = new TypeError(result.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
    error.code = "INVALID_IFRAME_CONFIG";
    error.issues = result.errors;
    throw error;
  }
  return result.value;
}

export function iframeConfigRiskKeys(config) {
  return inspectIframeConfig(config).risks;
}

export function inspectBuiltinChatAppIframeConfigs(raw, builtinIds = []) {
  const value = {};
  const invalid = [];
  const warnings = [];
  const risks = [];
  if (raw === undefined || raw === null) return { valid: true, value, invalid, warnings, risks };
  if (!plainObject(raw)) {
    invalid.push({
      id: "",
      errors: [issue("builtin-configs-type", "builtinChatAppIframeConfigs", "Built-in iframe configurations must be an object.")]
    });
    return { valid: false, value, invalid, warnings, risks };
  }
  const knownIds = new Set((Array.isArray(builtinIds) ? builtinIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  for (const [rawId, rawConfig] of Object.entries(raw)) {
    const id = String(rawId || "").trim();
    if (!id || ["__proto__", "constructor", "prototype"].includes(id) || (knownIds.size && !knownIds.has(id))) {
      invalid.push({
        id,
        errors: [issue("builtin-id-unknown", `builtinChatAppIframeConfigs.${id}`, `Unknown built-in chat app: ${id || rawId}`)]
      });
      continue;
    }
    const inspected = inspectIframeConfig(rawConfig);
    if (!inspected.valid) {
      invalid.push({ id, errors: inspected.errors });
      continue;
    }
    if (inspected.value) value[id] = inspected.value;
    if (inspected.warnings.length) warnings.push({ id, warnings: inspected.warnings });
    if (inspected.risks.length) risks.push({ id, risks: inspected.risks });
  }
  return { valid: invalid.length === 0, value, invalid, warnings, risks };
}

export function normalizeBuiltinChatAppIframeConfigs(raw, builtinIds = [], options = {}) {
  const result = inspectBuiltinChatAppIframeConfigs(raw, builtinIds);
  if (!result.valid && options?.strict === true) {
    const issues = result.invalid.flatMap((entry) => entry.errors);
    const error = new TypeError(issues.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
    error.code = "INVALID_BUILTIN_IFRAME_CONFIGS";
    error.issues = issues;
    throw error;
  }
  return result.value;
}

function normalizedSource(app, source) {
  const raw = String(source || app?.chatAppSource || app?.source || "").trim().toLowerCase();
  if (["custom", "user"].includes(raw) || app?.builtIn === false) return "custom";
  if (["builtin", "built-in", "built_in"].includes(raw) || app?.builtIn === true) return "builtin";
  return hasOwn(app || {}, "iframeConfig") ? "custom" : "builtin";
}

function iframeConfigForApp(app, options = {}) {
  const source = normalizedSource(app, options.source);
  const raw = source === "custom"
    ? app?.iframeConfig
    : options.options?.builtinChatAppIframeConfigs?.[app?.id];
  return normalizeIframeConfig(raw);
}

function appHostPatterns(app) {
  const hosts = normalizeHostList(app?.hosts);
  try {
    const ownHost = new URL(app?.url || "").hostname;
    if (ownHost) hosts.unshift(ownHost.toLowerCase());
  } catch {}
  return Array.from(new Set(hosts));
}

function chatFrameUrlInScope(app, url = app?.url) {
  let hostname = "";
  try {
    const parsed = new URL(url || "");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    hostname = parsed.hostname;
  } catch {
    return false;
  }
  return appHostPatterns(app).some((pattern) => hostMatchesPattern(pattern, hostname));
}

function appMatchesGrokEmbedHost(app) {
  return appHostPatterns(app).some((pattern) => {
    const host = pattern.replace(/^\*\./, "");
    return host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai");
  });
}

function chatFrameDefaultNeedsSandbox(app) {
  return !(app?.noSandbox || appMatchesGrokEmbedHost(app));
}

function canonicalAttributeEntries(attributes = {}) {
  return Object.entries(attributes)
    .filter(([name, value]) => Boolean(name) && value !== undefined && value !== null)
    .map(([name, value]) => ({ name: String(name).toLowerCase(), value: String(value) }))
    .sort((left, right) => {
      const leftOrder = DEDICATED_ATTRIBUTE_ORDER.get(left.name);
      const rightOrder = DEDICATED_ATTRIBUTE_ORDER.get(right.name);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }
      return compareText(left.name, right.name);
    });
}

function chatFrameContractSignature(contract = {}) {
  let entries = [];
  if (Array.isArray(contract)) {
    entries = contract.map((entry) => Array.isArray(entry)
      ? { name: entry[0], value: entry[1] }
      : entry);
  } else if (Array.isArray(contract?.entries)) {
    entries = contract.entries;
  } else {
    entries = canonicalAttributeEntries(contract?.attributes || contract);
  }
  const attributes = Object.fromEntries(entries
    .filter((entry) => entry && entry.name !== undefined && entry.value !== undefined)
    .map((entry) => [String(entry.name).toLowerCase(), String(entry.value)]));
  return JSON.stringify(canonicalAttributeEntries(attributes).map(({ name, value }) => [name, value]));
}

function applyAllowConfig(attributes, config) {
  if (!config) return;
  if (config.mode === "omit") {
    delete attributes.allow;
  } else if (config.mode === "raw") {
    attributes.allow = config.value;
  } else {
    const selected = new Set(config.features);
    attributes.allow = CHAT_FRAME_ALLOW_FEATURES
      .map((feature) => `${feature} ${selected.has(feature) ? "*" : "'none'"}`)
      .join("; ");
  }
}

function applySandboxConfig(attributes, config) {
  if (!config) return;
  if (config.mode === "omit") {
    delete attributes.sandbox;
  } else if (config.mode === "raw") {
    attributes.sandbox = config.value;
  } else {
    attributes.sandbox = config.tokens.join(" ");
  }
}

function applyReferrerPolicyConfig(attributes, config) {
  if (!config) return;
  if (config.mode === "omit") delete attributes.referrerpolicy;
  else attributes.referrerpolicy = config.value;
}

/**
 * Resolve the complete iframe-owned attribute contract for a target URL.
 * ChatClub's internal src/name/class/dataset/listener attributes are purposely
 * outside this contract and remain owned by the frame renderer.
 */
export function resolveChatFrameAttributeContract(input = {}) {
  const app = input.app || {};
  const source = normalizedSource(app, input.source);
  const targetUrl = hasOwn(input, "url") ? input.url : app.url || "";
  const inScope = chatFrameUrlInScope(app, targetUrl);
  const hasExplicitConfig = hasOwn(input, "iframeConfig");
  const configuredOverride = normalizeIframeConfig(
    hasExplicitConfig ? input.iframeConfig : iframeConfigForApp(app, { source, options: input.options })
  );
  const effectiveOverride = inScope ? configuredOverride : undefined;
  const attributes = {
    allow: DEFAULT_CHAT_FRAME_ALLOW,
    referrerpolicy: DEFAULT_CHAT_FRAME_REFERRER_POLICY
  };
  if (!inScope || chatFrameDefaultNeedsSandbox(app)) attributes.sandbox = DEFAULT_CHAT_FRAME_SANDBOX;
  if (effectiveOverride) {
    applyAllowConfig(attributes, effectiveOverride.allow);
    applySandboxConfig(attributes, effectiveOverride.sandbox);
    applyReferrerPolicyConfig(attributes, effectiveOverride.referrerPolicy);
    for (const { name, value } of effectiveOverride.attributes || []) attributes[name] = value;
  }
  const entries = canonicalAttributeEntries(attributes);
  const signature = chatFrameContractSignature(entries);
  return {
    attributes: Object.fromEntries(entries.map(({ name, value }) => [name, value])),
    entries,
    signature,
    inScope
  };
}
