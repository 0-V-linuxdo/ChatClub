import { CONTENT_BRIDGE_VERSION } from "../shared/protocol.js";
import { createSummaryRunnerRegistry } from "chatclub:summary-registry";
import { runtimeRegistry } from "./shared/runtime-registry.js";

export function installSummaryIsolatedRuntime() {
  runtimeRegistry(window).register("summary-runners", {
    version: CONTENT_BRIDGE_VERSION,
    api: Object.freeze({ scripts: createSummaryRunnerRegistry() })
  });
}

installSummaryIsolatedRuntime();
