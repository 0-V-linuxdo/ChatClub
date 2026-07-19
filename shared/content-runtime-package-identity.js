import { CONTENT_RUNTIME_BUNDLE_IDENTITIES } from "./content-runtime-version.generated.js";
import {
  assertContentRuntimeBundleIdentity,
  contentRuntimeBundleIdentityMatches,
  createContentRuntimeBundleIdentity
} from "./content-runtime-identity.js";

const CONTENT_RUNTIME_ENTRY_IDENTITIES = Object.freeze(Object.fromEntries(
  Object.entries(CONTENT_RUNTIME_BUNDLE_IDENTITIES).map(([outputPath, bundle]) => [
    outputPath,
    createContentRuntimeBundleIdentity(bundle)
  ])
));

export function contentRuntimeIdentityForBundle(outputPath) {
  const output = String(outputPath || "").trim();
  const identity = CONTENT_RUNTIME_ENTRY_IDENTITIES[output];
  if (!identity) throw new TypeError(`Unknown packaged content runtime bundle: ${output}`);
  return identity;
}

export function contentRuntimePackageBundleIdentityMatches(value, expectedOutputPath) {
  let expected;
  try {
    expected = contentRuntimeIdentityForBundle(expectedOutputPath);
  } catch {
    return false;
  }
  return contentRuntimeBundleIdentityMatches(value, expected);
}

export function assertContentRuntimePackageBundleIdentity(
  value,
  expectedOutputPath,
  label = "Content runtime bundle identity"
) {
  return assertContentRuntimeBundleIdentity(
    value,
    contentRuntimeIdentityForBundle(expectedOutputPath),
    label
  );
}
