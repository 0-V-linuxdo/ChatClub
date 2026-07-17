import { CONTENT_BRIDGE_VERSION } from "./protocol.js";
import {
  CONTENT_RUNTIME_BUILD_RECIPE_SHA256,
  CONTENT_RUNTIME_BUILD_RECIPE_VERSION,
  CONTENT_RUNTIME_IMPLEMENTATION_SHA256,
  CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
  CONTENT_RUNTIME_PROTOCOL_VERSION,
  CONTENT_RUNTIME_SOURCE_SHA256
} from "./content-runtime-version.generated.js";

if (CONTENT_RUNTIME_PROTOCOL_VERSION !== CONTENT_BRIDGE_VERSION) {
  throw new Error("Generated content runtime identity does not match the packaged protocol");
}

export const CONTENT_RUNTIME_IDENTITY = Object.freeze({
  protocolVersion: CONTENT_RUNTIME_PROTOCOL_VERSION,
  implementationVersion: CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
  implementationSha256: CONTENT_RUNTIME_IMPLEMENTATION_SHA256,
  sourceSha256: CONTENT_RUNTIME_SOURCE_SHA256,
  buildRecipeVersion: CONTENT_RUNTIME_BUILD_RECIPE_VERSION,
  buildRecipeSha256: CONTENT_RUNTIME_BUILD_RECIPE_SHA256
});

const IDENTITY_FIELDS = Object.freeze(Object.keys(CONTENT_RUNTIME_IDENTITY));
const BUNDLE_IDENTITY_FIELDS = Object.freeze([
  "outputPath",
  "entryPath",
  "sourceSha256",
  "implementationSha256",
  "implementationVersion"
]);

export function normalizeContentRuntimeBundleIdentity(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.freeze(Object.fromEntries(
    BUNDLE_IDENTITY_FIELDS.map((field) => [field, String(source[field] || "")])
  ));
}

export function createContentRuntimeBundleIdentity(bundle) {
  const normalized = normalizeContentRuntimeBundleIdentity(bundle);
  if (BUNDLE_IDENTITY_FIELDS.some((field) => !normalized[field])) {
    throw new TypeError("Packaged content runtime bundle identity is incomplete");
  }
  return Object.freeze({ ...CONTENT_RUNTIME_IDENTITY, bundle: normalized });
}

export function normalizeContentRuntimeIdentity(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const identity = Object.fromEntries(
    IDENTITY_FIELDS.map((field) => [field, String(source[field] || "")])
  );
  if (source.bundle && typeof source.bundle === "object") {
    identity.bundle = normalizeContentRuntimeBundleIdentity(source.bundle);
  }
  return Object.freeze(identity);
}

export function contentRuntimeIdentityMatches(value, expected = CONTENT_RUNTIME_IDENTITY) {
  const candidate = normalizeContentRuntimeIdentity(value);
  const wanted = normalizeContentRuntimeIdentity(expected);
  return IDENTITY_FIELDS.every((field) => candidate[field] && candidate[field] === wanted[field]);
}

export function contentRuntimeBundleIdentityMatches(value, expectedBundleIdentity) {
  let expected;
  try {
    expected = expectedBundleIdentity?.bundle
      ? normalizeContentRuntimeIdentity(expectedBundleIdentity)
      : createContentRuntimeBundleIdentity(expectedBundleIdentity);
  } catch {
    return false;
  }
  const candidate = normalizeContentRuntimeIdentity(value);
  if (!contentRuntimeIdentityMatches(candidate, expected) || !candidate.bundle) return false;
  return BUNDLE_IDENTITY_FIELDS.every((field) => (
    candidate.bundle[field]
    && candidate.bundle[field] === expected.bundle[field]
  ));
}

export function assertContentRuntimeBundleIdentity(value, expectedBundleIdentity, label = "Content runtime bundle identity") {
  const identity = normalizeContentRuntimeIdentity(value);
  if (!contentRuntimeBundleIdentityMatches(identity, expectedBundleIdentity)) {
    const outputPath = String(expectedBundleIdentity?.bundle?.outputPath || expectedBundleIdentity?.outputPath || "");
    throw new Error(`${label} does not match packaged bundle ${outputPath}`);
  }
  return identity;
}

export function assertContentRuntimeIdentity(value, label = "Content runtime identity") {
  const identity = normalizeContentRuntimeIdentity(value);
  if (!contentRuntimeIdentityMatches(identity)) {
    throw new Error(`${label} does not match the packaged content runtime generation`);
  }
  return identity;
}
