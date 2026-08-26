import {
  OFFICIAL_RULES_COMPONENT_KEYS,
  OFFICIAL_RULES_FEATURES,
  findOfficialRulesBaselineComponent,
  officialRulesCanonicalExactHost,
  officialRulesComponentKey,
  officialRulesHostAuthorization
} from "./official-rules-baseline.js";

const OFFICIAL_RULES_SCHEMA_VERSION = 1;
export const OFFICIAL_RULES_API_VERSION = 1;
const OFFICIAL_RULES_CHANNEL_API_VERSION_MAX = 65_535;
const OFFICIAL_RULES_SIGNATURE_SCHEMA_VERSION = 1;
const OFFICIAL_RULES_SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";
export const OFFICIAL_RULES_CHANNEL_URL = "https://0-v-linuxdo.github.io/ChatClub-rules/stable/channel.json";
export const OFFICIAL_RULES_CHANNEL_SIGNATURE_URL = "https://0-v-linuxdo.github.io/ChatClub-rules/stable/channel.sig.json";
const OFFICIAL_RULES_RELEASE_PREFIX = "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/";

export const OFFICIAL_RULES_LIMITS = Object.freeze({
  channelBytes: 32 * 1024,
  catalogBytes: 64 * 1024,
  componentBytes: 64 * 1024,
  signatureBytes: 1024,
  releaseComponentBytes: 512 * 1024,
  selectorChars: 512,
  selectorsPerSlot: 8,
  selectorsPerComponent: 64
});

export const OFFICIAL_RULES_SELECTOR_SLOTS = Object.freeze({
  summary: Object.freeze([
    "conversationRoot",
    "messageRoot",
    "userRoot",
    "assistantRoot",
    "cleanup",
    "actionBar",
    "messageCopy",
    "userRoleSignal",
    "assistantRoleSignal",
    "nestedCodeAction",
    "referenceAction"
  ]),
  messageNavigator: Object.freeze([
    "conversationRoot",
    "message",
    "userRole",
    "assistantRole",
    "content",
    "effectTarget",
    "exclude",
    "composer"
  ]),
  delete: Object.freeze([
    "scope",
    "conversationLink",
    "conversationRow",
    "menuTrigger",
    "menuRoot",
    "deleteCandidate",
    "dialog",
    "confirmCandidate",
    "completionLinks"
  ])
});

const OFFICIAL_RULES_PARAMETER_KEYS = Object.freeze({
  summary: Object.freeze(["waitMs"]),
  messageNavigator: Object.freeze(["summaryMaxChars"]),
  delete: Object.freeze(["timeoutMs"])
});

const CHANNEL_KEYS = Object.freeze([
  "schemaVersion",
  "channel",
  "sequence",
  "rulesVersion",
  "rulesApiVersion",
  "minExtensionVersion",
  "publishedAt",
  "catalog"
]);
const CATALOG_REF_KEYS = Object.freeze(["url", "signatureUrl", "size", "sha256", "keyId"]);
const CATALOG_KEYS = Object.freeze([
  "schemaVersion",
  "channel",
  "sequence",
  "rulesVersion",
  "rulesApiVersion",
  "minExtensionVersion",
  "publishedAt",
  "releaseNotes",
  "components"
]);
const COMPONENT_POINTER_KEYS = Object.freeze([
  "feature",
  "siteId",
  "revision",
  "url",
  "signatureUrl",
  "size",
  "sha256",
  "keyId"
]);
const COMPONENT_KEYS = Object.freeze([
  "schemaVersion",
  "rulesApiVersion",
  "feature",
  "siteId",
  "revision",
  "status",
  "hosts",
  "pathPrefixes",
  "selectors",
  "parameters"
]);
const SIGNATURE_KEYS = Object.freeze(["schemaVersion", "keyId", "algorithm", "signature"]);
const COMPONENT_STATUSES = new Set(["active", "disabled", "retired"]);
const FORBIDDEN_FIELD_TOKENS = Object.freeze([
  "adapter",
  "bridge",
  "click",
  "code",
  "command",
  "coordinate",
  "dependenc",
  "execute",
  "expression",
  "function",
  "import",
  "operation",
  "profile",
  "require",
  "runner",
  "script",
  "step",
  "trustedinput",
  "userscript",
  "wasm",
  "world"
]);
const utf8Encoder = new TextEncoder();
const EMPTY_ARRAY = Object.freeze([]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(errors, path, code, message) {
  errors.push(Object.freeze({ path, code, message }));
}

function fieldLooksForbidden(field) {
  const compact = String(field || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return FORBIDDEN_FIELD_TOKENS.some((token) => compact.includes(token));
}

function exactObject(value, keys, path, errors, options = {}) {
  if (!plainObject(value)) {
    issue(errors, path, "object-required", `${options.label || "Value"} must be a plain object.`);
    return false;
  }
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) issue(errors, `${path}.${key}`, "field-required", `Missing required field ${key}.`);
  }
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    let code = fieldLooksForbidden(key) ? "forbidden-field" : "unknown-field";
    if (options.ownerByKey?.has(key)) code = "cross-component-field";
    issue(errors, `${path}.${key}`, code, `Field ${key} is not allowed in ${options.label || "this object"}.`);
  }
  return true;
}

function documentInput(raw, byteLimit, kind, errors) {
  let source;
  let value = raw;
  if (typeof raw === "string") {
    source = raw;
  } else {
    try {
      source = JSON.stringify(raw);
    } catch {
      issue(errors, "$", "json-serialization-failed", `${kind} cannot be serialized as JSON.`);
      return undefined;
    }
    if (typeof source !== "string") {
      issue(errors, "$", "json-document-required", `${kind} must be a JSON object or JSON document string.`);
      return undefined;
    }
  }
  if (utf8Encoder.encode(source).byteLength > byteLimit) {
    issue(errors, "$", "document-too-large", `${kind} exceeds its ${byteLimit}-byte limit.`);
    return undefined;
  }
  if (typeof raw !== "string") return value;
  try {
    value = JSON.parse(source);
  } catch {
    issue(errors, "$", "invalid-json", `${kind} is not valid JSON.`);
    return undefined;
  }
  return value;
}

function positiveSafeInteger(value, path, errors, options = {}) {
  const minimum = options.allowZero === true ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    issue(errors, path, "positive-safe-integer-required", `${path} must be a safe integer greater than or equal to ${minimum}.`);
    return minimum;
  }
  return value;
}

function boundedSafeInteger(value, path, errors, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    issue(errors, path, "integer-out-of-range", `${path} must be an integer from ${minimum} through ${maximum}.`);
    return minimum;
  }
  return value;
}

function fixedVersion(value, expected, path, errors) {
  if (value !== expected) {
    issue(errors, path, "unsupported-version", `${path} must equal ${expected}.`);
    return expected;
  }
  return value;
}

function text(value, path, errors, options = {}) {
  if (typeof value !== "string") {
    issue(errors, path, "string-required", `${path} must be a string.`);
    return "";
  }
  const normalized = options.trim === false ? value : value.trim();
  if (!options.allowEmpty && !normalized) issue(errors, path, "string-empty", `${path} must not be empty.`);
  if (options.maxChars && normalized.length > options.maxChars) {
    issue(errors, path, "string-too-long", `${path} exceeds ${options.maxChars} characters.`);
  }
  if (options.pattern && normalized && !options.pattern.test(normalized)) {
    issue(errors, path, "string-format-invalid", `${path} has an invalid format.`);
  }
  if (/[^\t\n\r\x20-\x7e\u0080-\uffff]/.test(normalized)) {
    issue(errors, path, "string-control-character", `${path} contains a disallowed control character.`);
  }
  return normalized;
}

function channelName(value, path, errors) {
  const normalized = text(value, path, errors, { maxChars: 32, pattern: /^[a-z][a-z0-9-]*$/ });
  if (normalized && normalized !== "stable") {
    issue(errors, path, "channel-unsupported", `${path} must equal stable for the fixed stable endpoint.`);
  }
  return normalized;
}

function rulesVersion(value, path, errors) {
  return text(value, path, errors, { maxChars: 64, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ });
}

function extensionVersion(value, path, errors) {
  const normalized = text(value, path, errors, { maxChars: 32, pattern: /^\d+(?:\.\d+){3}$/ });
  if (!/^\d+(?:\.\d+){3}$/.test(normalized)) return normalized;
  const valid = normalized.split(".").every((part) => (
    /^(?:0|[1-9]\d*)$/.test(part) && Number(part) <= 65535
  ));
  if (!valid) issue(errors, path, "extension-version-invalid", `${path} must be a four-part Chrome extension version.`);
  return normalized;
}

function publishedAt(value, path, errors) {
  const normalized = text(value, path, errors, {
    maxChars: 32,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
  });
  if (normalized && !Number.isFinite(Date.parse(normalized))) {
    issue(errors, path, "timestamp-invalid", `${path} must be a valid UTC timestamp.`);
  }
  return normalized;
}

function sha256(value, path, errors) {
  return text(value, path, errors, { maxChars: 64, pattern: /^[0-9a-f]{64}$/ });
}

function keyId(value, path, errors) {
  return text(value, path, errors, { maxChars: 64, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ });
}

function base64UrlP1363(value, path, errors) {
  const normalized = text(value, path, errors, { maxChars: 86, pattern: /^[A-Za-z0-9_-]{86}$/ });
  if (!/^[A-Za-z0-9_-]{86}$/.test(normalized)) return normalized;
  try {
    const standard = normalized.replace(/-/g, "+").replace(/_/g, "/") + "==";
    const decoded = atob(standard);
    if (decoded.length !== 64) issue(errors, path, "signature-length-invalid", `${path} must encode a 64-byte IEEE-P1363 r||s signature.`);
    const canonical = btoa(decoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (canonical !== normalized) issue(errors, path, "signature-encoding-invalid", `${path} must use canonical unpadded base64url.`);
  } catch {
    issue(errors, path, "signature-encoding-invalid", `${path} must be unpadded base64url.`);
  }
  return normalized;
}

function safeReleaseSegment(raw) {
  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded || decoded === "." || decoded === ".." || /[\\/%?#\u0000-\u001f\u007f]/.test(decoded)) return null;
    if (encodeURIComponent(decoded) !== raw) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function inspectOfficialRulesReleaseUrl(value) {
  const errors = [];
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    issue(errors, "$", "release-url-required", "Release asset URL must be a non-empty string.");
    return { valid: false, errors };
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    issue(errors, "$", "release-url-invalid", "Release asset URL is invalid.");
    return { valid: false, errors };
  }
  const segments = parsed.pathname.split("/");
  const fixed = segments.length === 7
    && segments[0] === ""
    && segments[1] === "0-V-linuxdo"
    && segments[2] === "ChatClub-rules"
    && segments[3] === "releases"
    && segments[4] === "download";
  const tag = fixed ? safeReleaseSegment(segments[5]) : null;
  const asset = fixed ? safeReleaseSegment(segments[6]) : null;
  const canonical = tag && asset
    ? `${OFFICIAL_RULES_RELEASE_PREFIX}${encodeURIComponent(tag)}/${encodeURIComponent(asset)}`
    : "";
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "github.com"
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !tag
    || !asset
    || canonical !== raw
  ) {
    issue(errors, "$", "release-url-out-of-scope", "URL must be a canonical asset URL in the dedicated ChatClub-rules GitHub release repository.");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: Object.freeze({ url: canonical, tag, asset }), errors: EMPTY_ARRAY };
}

function releaseUrl(value, path, errors) {
  const inspected = inspectOfficialRulesReleaseUrl(value);
  if (!inspected.valid) {
    for (const entry of inspected.errors) issue(errors, path, entry.code, entry.message);
    return Object.freeze({ url: "", tag: "", asset: "" });
  }
  return inspected.value;
}

function signedReference(value, path, errors, maximumSize, options = {}) {
  if (options.exact !== false) {
    exactObject(value, CATALOG_REF_KEYS, path, errors, { label: "signed release reference" });
  }
  const payload = releaseUrl(value?.url, `${path}.url`, errors);
  const signature = releaseUrl(value?.signatureUrl, `${path}.signatureUrl`, errors);
  if (payload.asset && (!payload.asset.endsWith(".json") || payload.asset.endsWith(".sig.json"))) {
    issue(errors, `${path}.url`, "payload-asset-invalid", "Signed payload assets must be JSON documents, not signature documents.");
  }
  if (options.kind === "catalog" && payload.asset && payload.asset !== "catalog.json") {
    issue(errors, `${path}.url`, "catalog-asset-invalid", "The immutable catalog release asset must be named catalog.json.");
  }
  if (payload.tag && signature.tag && (
    payload.tag !== signature.tag || signature.asset !== `${payload.asset}.sig.json`
  )) {
    issue(errors, `${path}.signatureUrl`, "signature-url-mismatch", "Signature URL must name the payload asset plus .sig.json in the same release tag.");
  }
  return {
    url: payload.url,
    signatureUrl: signature.url,
    size: boundedSafeInteger(value?.size, `${path}.size`, errors, 1, maximumSize),
    sha256: sha256(value?.sha256, `${path}.sha256`, errors),
    keyId: keyId(value?.keyId, `${path}.keyId`, errors)
  };
}

function metadata(value, path, errors, options = {}) {
  return {
    schemaVersion: fixedVersion(value?.schemaVersion, OFFICIAL_RULES_SCHEMA_VERSION, `${path}.schemaVersion`, errors),
    channel: channelName(value?.channel, `${path}.channel`, errors),
    sequence: positiveSafeInteger(value?.sequence, `${path}.sequence`, errors),
    rulesVersion: rulesVersion(value?.rulesVersion, `${path}.rulesVersion`, errors),
    rulesApiVersion: options.channelEnvelope === true
      ? boundedSafeInteger(
        value?.rulesApiVersion,
        `${path}.rulesApiVersion`,
        errors,
        1,
        OFFICIAL_RULES_CHANNEL_API_VERSION_MAX
      )
      : fixedVersion(value?.rulesApiVersion, OFFICIAL_RULES_API_VERSION, `${path}.rulesApiVersion`, errors),
    minExtensionVersion: extensionVersion(value?.minExtensionVersion, `${path}.minExtensionVersion`, errors),
    publishedAt: publishedAt(value?.publishedAt, `${path}.publishedAt`, errors)
  };
}

function result(value, errors) {
  return errors.length
    ? { valid: false, errors: Object.freeze(errors) }
    : { valid: true, value: deepFreeze(value), errors: EMPTY_ARRAY };
}

function normalize(inspected, code, label) {
  if (inspected.valid) return inspected.value;
  const error = new TypeError(`${label} is invalid.`);
  error.code = code;
  error.errors = inspected.errors;
  throw error;
}

export function inspectOfficialRulesSignature(raw) {
  const errors = [];
  const value = documentInput(raw, OFFICIAL_RULES_LIMITS.signatureBytes, "Official rules signature", errors);
  if (value === undefined) return result(null, errors);
  exactObject(value, SIGNATURE_KEYS, "$", errors, { label: "official rules signature" });
  const normalized = {
    schemaVersion: fixedVersion(value?.schemaVersion, OFFICIAL_RULES_SIGNATURE_SCHEMA_VERSION, "$.schemaVersion", errors),
    keyId: keyId(value?.keyId, "$.keyId", errors),
    algorithm: text(value?.algorithm, "$.algorithm", errors, { maxChars: 32 }),
    signature: base64UrlP1363(value?.signature, "$.signature", errors)
  };
  if (normalized.algorithm !== OFFICIAL_RULES_SIGNATURE_ALGORITHM) {
    issue(errors, "$.algorithm", "signature-algorithm-invalid", `$.algorithm must equal ${OFFICIAL_RULES_SIGNATURE_ALGORITHM}.`);
  }
  return result(normalized, errors);
}

export function inspectOfficialRulesChannel(raw) {
  const errors = [];
  const value = documentInput(raw, OFFICIAL_RULES_LIMITS.channelBytes, "Official rules channel", errors);
  if (value === undefined) return result(null, errors);
  exactObject(value, CHANNEL_KEYS, "$", errors, { label: "official rules channel" });
  const normalized = {
    ...metadata(value, "$", errors, { channelEnvelope: true }),
    catalog: signedReference(value?.catalog, "$.catalog", errors, OFFICIAL_RULES_LIMITS.catalogBytes, { kind: "catalog" })
  };
  return result(normalized, errors);
}

export function normalizeOfficialRulesChannel(raw) {
  return normalize(inspectOfficialRulesChannel(raw), "INVALID_OFFICIAL_RULES_CHANNEL", "Official rules channel");
}

function componentIdentity(value, path, errors, options = {}) {
  const feature = text(value?.feature, `${path}.feature`, errors, { maxChars: 32 });
  const siteId = text(value?.siteId, `${path}.siteId`, errors, {
    maxChars: 64,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/
  });
  if (!OFFICIAL_RULES_FEATURES.includes(feature)) {
    issue(errors, `${path}.feature`, "feature-unknown", `Unknown official rules feature ${feature || "(empty)"}.`);
  }
  if (feature && siteId && !findOfficialRulesBaselineComponent(feature, siteId)) {
    issue(errors, `${path}.siteId`, "component-unknown", `Unknown official rules component ${officialRulesComponentKey(feature, siteId)}.`);
  }
  return {
    feature,
    siteId,
    revision: positiveSafeInteger(value?.revision, `${path}.revision`, errors, {
      allowZero: options.allowBaselineRevisionZero === true
    })
  };
}

function componentPointer(value, path, errors) {
  exactObject(value, COMPONENT_POINTER_KEYS, path, errors, { label: "component pointer" });
  const identity = componentIdentity(value, path, errors);
  const reference = signedReference(value, path, errors, OFFICIAL_RULES_LIMITS.componentBytes, {
    exact: false,
    kind: "component"
  });
  return { ...identity, ...reference };
}

export function inspectOfficialRulesCatalog(raw, options = {}) {
  const requireCompleteBaseline = options.requireCompleteBaseline !== false;
  const errors = [];
  const value = documentInput(raw, OFFICIAL_RULES_LIMITS.catalogBytes, "Official rules catalog", errors);
  if (value === undefined) return result(null, errors);
  exactObject(value, CATALOG_KEYS, "$", errors, { label: "official rules catalog" });
  const parsedPointers = [];
  if (!Array.isArray(value?.components)) {
    issue(errors, "$.components", "array-required", "Catalog components must be an array.");
  } else {
    for (let index = 0; index < value.components.length; index += 1) {
      parsedPointers.push(componentPointer(value.components[index], `$.components[${index}]`, errors));
    }
  }
  const pointerByKey = new Map();
  for (let index = 0; index < parsedPointers.length; index += 1) {
    const pointer = parsedPointers[index];
    const key = officialRulesComponentKey(pointer.feature, pointer.siteId);
    if (!key) continue;
    if (pointerByKey.has(key)) {
      issue(errors, `$.components[${index}]`, "component-duplicate", `Catalog component ${key} is duplicated.`);
      continue;
    }
    pointerByKey.set(key, pointer);
  }
  if (requireCompleteBaseline) {
    for (const key of OFFICIAL_RULES_COMPONENT_KEYS) {
      if (!pointerByKey.has(key)) issue(errors, "$.components", "component-missing", `Catalog is missing component ${key}.`);
    }
    if (parsedPointers.length !== OFFICIAL_RULES_COMPONENT_KEYS.length) {
      issue(errors, "$.components", "component-count-invalid", `Catalog must contain exactly ${OFFICIAL_RULES_COMPONENT_KEYS.length} component pointers.`);
    }
  } else if (Array.isArray(value?.components) && parsedPointers.length === 0) {
    issue(errors, "$.components", "component-missing", "A stored official-rules catalog must retain at least one signed component pointer.");
  }
  const normalized = {
    ...metadata(value, "$", errors),
    releaseNotes: text(value?.releaseNotes, "$.releaseNotes", errors, {
      allowEmpty: true,
      maxChars: 4096,
      trim: false
    }),
    components: OFFICIAL_RULES_COMPONENT_KEYS.map((key) => pointerByKey.get(key)).filter(Boolean)
  };
  return result(normalized, errors);
}

export function normalizeOfficialRulesCatalog(raw, options = {}) {
  return normalize(inspectOfficialRulesCatalog(raw, options), "INVALID_OFFICIAL_RULES_CATALOG", "Official rules catalog");
}

function selectorStructureValid(selector) {
  const stack = [];
  let quote = "";
  let escaped = false;
  for (const character of selector) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[" || character === "(") stack.push(character);
    if (character === "]" || character === ")") {
      const expected = character === "]" ? "[" : "(";
      if (stack.pop() !== expected) return false;
    }
  }
  return !escaped && !quote && stack.length === 0;
}

function selector(value, path, errors) {
  const normalized = text(value, path, errors, { maxChars: OFFICIAL_RULES_LIMITS.selectorChars });
  if (!normalized) return normalized;
  if (/[{};`\u0000-\u001f\u007f]/.test(normalized) || /\$\{|<\/?script\b|\b(?:javascript|vbscript):|data\s*:\s*text\/(?:html|javascript)|@import\b|\burl\s*\(|\b(?:eval|function|import|execute|click|confirm)\s*\(|=>/i.test(normalized)) {
    issue(errors, path, "selector-code-like", `${path} contains code-like syntax that is not allowed in declarative rules.`);
  }
  if (!selectorStructureValid(normalized)) {
    issue(errors, path, "selector-structure-invalid", `${path} has unbalanced selector syntax.`);
  }
  return normalized;
}

function selectorOwners() {
  const owners = new Map();
  for (const [feature, slots] of Object.entries(OFFICIAL_RULES_SELECTOR_SLOTS)) {
    for (const slot of slots) {
      if (!owners.has(slot)) owners.set(slot, new Set());
      owners.get(slot).add(feature);
    }
  }
  return owners;
}

function parameterOwners() {
  const owners = new Map();
  for (const [feature, keys] of Object.entries(OFFICIAL_RULES_PARAMETER_KEYS)) {
    for (const key of keys) owners.set(key, feature);
  }
  return owners;
}

const SELECTOR_OWNERS = selectorOwners();
const PARAMETER_OWNERS = parameterOwners();

function componentSelectors(value, feature, siteId, path, errors) {
  const profile = findOfficialRulesBaselineComponent(feature, siteId)?.profile || "unknown";
  const slots = OFFICIAL_RULES_SELECTOR_SLOTS[feature] || EMPTY_ARRAY;
  exactObject(value, slots, path, errors, {
    label: `${feature || "unknown"}/${profile} packaged-profile selector hints`,
    ownerByKey: SELECTOR_OWNERS
  });
  const normalized = {};
  let total = 0;
  for (const slot of slots) {
    const slotPath = `${path}.${slot}`;
    const rawSelectors = value?.[slot];
    if (!Array.isArray(rawSelectors)) {
      issue(errors, slotPath, "array-required", `${slotPath} must be an array.`);
      normalized[slot] = [];
      continue;
    }
    if (rawSelectors.length > OFFICIAL_RULES_LIMITS.selectorsPerSlot) {
      issue(errors, slotPath, "selector-slot-limit", `${slotPath} exceeds ${OFFICIAL_RULES_LIMITS.selectorsPerSlot} selectors.`);
    }
    const seen = new Set();
    normalized[slot] = [];
    for (let index = 0; index < rawSelectors.length; index += 1) {
      const parsed = selector(rawSelectors[index], `${slotPath}[${index}]`, errors);
      if (!parsed) continue;
      if (seen.has(parsed)) {
        issue(errors, `${slotPath}[${index}]`, "selector-duplicate", `${slotPath} contains a duplicate selector.`);
        continue;
      }
      seen.add(parsed);
      normalized[slot].push(parsed);
      total += 1;
    }
  }
  if (total > OFFICIAL_RULES_LIMITS.selectorsPerComponent) {
    issue(errors, path, "selector-component-limit", `${path} exceeds ${OFFICIAL_RULES_LIMITS.selectorsPerComponent} selectors.`);
  }
  if (total > 0 && feature === "summary") {
    const hasUserRole = normalized.userRoot.length > 0 || normalized.userRoleSignal.length > 0;
    const hasAssistantRole = normalized.assistantRoot.length > 0 || normalized.assistantRoleSignal.length > 0;
    if (!normalized.messageRoot.length || !hasUserRole || !hasAssistantRole) {
      issue(
        errors,
        path,
        "summary-selector-profile-incomplete",
        `${path} must include messageRoot plus stable user and assistant role selectors when Summary hints are present.`
      );
    }
  }
  if (total > 0 && feature === "messageNavigator") {
    if (!normalized.message.length || !normalized.userRole.length || !normalized.assistantRole.length || !normalized.composer.length) {
      issue(
        errors,
        path,
        "message-navigator-selector-profile-incomplete",
        `${path} must include message, userRole, assistantRole, and composer when Message Navigator hints are present.`
      );
    }
  }
  return normalized;
}

function componentParameters(value, feature, siteId, path, errors) {
  const profile = findOfficialRulesBaselineComponent(feature, siteId)?.profile || "unknown";
  const keys = OFFICIAL_RULES_PARAMETER_KEYS[feature] || EMPTY_ARRAY;
  exactObject(value, keys, path, errors, {
    label: `${feature || "unknown"}/${profile} packaged-profile parameters`,
    ownerByKey: PARAMETER_OWNERS
  });
  if (feature === "summary") {
    return { waitMs: boundedSafeInteger(value?.waitMs, `${path}.waitMs`, errors, 0, 60000) };
  }
  if (feature === "messageNavigator") {
    return { summaryMaxChars: boundedSafeInteger(value?.summaryMaxChars, `${path}.summaryMaxChars`, errors, 20, 180) };
  }
  if (feature === "delete") {
    return { timeoutMs: boundedSafeInteger(value?.timeoutMs, `${path}.timeoutMs`, errors, 5000, 45000) };
  }
  return {};
}

function componentHosts(value, feature, siteId, path, errors) {
  if (!Array.isArray(value)) {
    issue(errors, path, "array-required", `${path} must be an array.`);
    return [];
  }
  const normalizedHosts = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const hostPath = `${path}[${index}]`;
    if (typeof value[index] !== "string" || !value[index].trim()) {
      issue(errors, hostPath, "host-required", `${hostPath} must be a non-empty hostname string.`);
      continue;
    }
    const raw = value[index].trim();
    const normalized = officialRulesCanonicalExactHost(raw);
    if (!normalized) {
      issue(errors, hostPath, "host-exact-required", `${hostPath} must be a canonical exact ASCII hostname without scheme, wildcard, IP, port, or IDN encoding.`);
      continue;
    }
    const authorization = officialRulesHostAuthorization(feature, siteId, normalized);
    if (!authorization.allowed) {
      const code = authorization.reason === "delete-alias-not-safe"
        ? "delete-alias-not-safe"
        : "host-outside-trust-roots";
      issue(errors, hostPath, code, code === "delete-alias-not-safe"
        ? `${normalized} is a new Delete host, but the packaged runner has no fixed provider/route aliasSafe declaration.`
        : `${normalized} is outside the packaged trust roots for ${officialRulesComponentKey(feature, siteId)}.`);
      continue;
    }
    if (seen.has(normalized)) {
      issue(errors, hostPath, "host-duplicate", `${path} contains a duplicate hostname.`);
      continue;
    }
    seen.add(normalized);
    normalizedHosts.push(normalized);
  }
  return normalizedHosts;
}

function pathPrefixes(value, path, errors) {
  if (!Array.isArray(value)) {
    issue(errors, path, "array-required", `${path} must be an array.`);
    return [];
  }
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const prefix = text(value[index], itemPath, errors, { maxChars: 2048 });
    if (!prefix) continue;
    const unsafeEncoding = /%(?:2e|2f|3f|23|5c)/i.test(prefix);
    const unsafeSegment = prefix.split("/").some((segment) => segment === "." || segment === "..");
    if (
      !prefix.startsWith("/")
      || prefix.startsWith("//")
      || /[\\?#\s\u0000-\u001f\u007f]/.test(prefix)
      || prefix.includes("://")
      || unsafeEncoding
      || unsafeSegment
    ) {
      issue(errors, itemPath, "path-prefix-invalid", `${itemPath} must be a canonical absolute HTTPS URL path prefix without authority, dot segments, query, or fragment.`);
      continue;
    }
    if (seen.has(prefix)) {
      issue(errors, itemPath, "path-prefix-duplicate", `${path} contains a duplicate path prefix.`);
      continue;
    }
    seen.add(prefix);
    output.push(prefix);
  }
  return output;
}

export function inspectOfficialRulesComponent(raw, options = {}) {
  const errors = [];
  const value = documentInput(raw, OFFICIAL_RULES_LIMITS.componentBytes, "Official rules component", errors);
  if (value === undefined) return result(null, errors);
  exactObject(value, COMPONENT_KEYS, "$", errors, { label: "official rules component" });
  const identity = componentIdentity(value, "$", errors, options);
  const status = text(value?.status, "$.status", errors, { maxChars: 16 });
  if (!COMPONENT_STATUSES.has(status)) {
    issue(errors, "$.status", "component-status-invalid", "Component status must be active, disabled, or retired.");
  }
  const hosts = componentHosts(value?.hosts, identity.feature, identity.siteId, "$.hosts", errors);
  if (status === "active" && hosts.length === 0) {
    issue(errors, "$.hosts", "active-host-required", "An active component must retain at least one authorized HTTPS host.");
  }
  const normalized = {
    schemaVersion: fixedVersion(value?.schemaVersion, OFFICIAL_RULES_SCHEMA_VERSION, "$.schemaVersion", errors),
    rulesApiVersion: fixedVersion(value?.rulesApiVersion, OFFICIAL_RULES_API_VERSION, "$.rulesApiVersion", errors),
    ...identity,
    status,
    hosts,
    pathPrefixes: pathPrefixes(value?.pathPrefixes, "$.pathPrefixes", errors),
    selectors: componentSelectors(value?.selectors, identity.feature, identity.siteId, "$.selectors", errors),
    parameters: componentParameters(value?.parameters, identity.feature, identity.siteId, "$.parameters", errors)
  };
  return result(normalized, errors);
}

export function normalizeOfficialRulesComponent(raw, options = {}) {
  return normalize(
    inspectOfficialRulesComponent(raw, options),
    "INVALID_OFFICIAL_RULES_COMPONENT",
    "Official rules component"
  );
}
