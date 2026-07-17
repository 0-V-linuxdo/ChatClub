import {
  RUNTIME_REGISTRY_ABI_VERSION,
  RUNTIME_REGISTRY_KEY
} from "../../shared/protocol.js";
import { CONTENT_RUNTIME_IMPLEMENTATION_VERSION } from "../../shared/content-runtime-version.generated.js";

// eslint-disable-next-line chatclub-realm/no-cross-realm-global -- explicit injectable DOM-global default keeps broker tests hermetic.
export function runtimeRegistry(target = globalThis) {
  const broker = target[RUNTIME_REGISTRY_KEY];
  if (
    !broker
    || broker.abiVersion !== RUNTIME_REGISTRY_ABI_VERSION
    || typeof broker.beginGeneration !== "function"
  ) {
    throw new Error("Content base runtime broker must be installed before optional capabilities");
  }
  return broker.beginGeneration(CONTENT_RUNTIME_IMPLEMENTATION_VERSION);
}
