import { CONTENT_BRIDGE_VERSION } from "../shared/protocol.js";
import { CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import { createSummaryRunnerRegistry } from "chatclub:summary-registry";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";

function installSummaryIsolatedRuntime() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  runtimes.register("summary-runners", {
    version: CONTENT_BRIDGE_VERSION,
    api: Object.freeze({ scripts: createSummaryRunnerRegistry(), runtimeIdentity })
  });
}

installSummaryIsolatedRuntime();
