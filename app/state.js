import { createComposerStatePort } from "./composer/state-port.js";
import { createFaviconStatePort } from "./favicon/state-port.js";
import { createFunctionalAnomalyStatePort } from "./functional-anomalies/state-port.js";
import { createOptimizeStatePort } from "./optimize/state-port.js";
import { createPocketStatePort } from "./pocket/state-port.js";
import { createPreferredModelStatePort } from "./preferred-model/state-port.js";
import { createSettingsSectionStatePorts } from "./settings/state-ports.js";
import { createSummaryStatePort } from "./summary/state-port.js";
import { createTopbarStatePort } from "./topbar/state-port.js";
import { createWorkspaceStatePort } from "./workspace/state-port.js";

export { createAppState } from "./state/schema.js";

const FEATURE_PORT_CREATORS = Object.freeze({
  workspace: createWorkspaceStatePort,
  summary: createSummaryStatePort,
  pocket: createPocketStatePort,
  optimize: createOptimizeStatePort,
  composer: createComposerStatePort,
  preferredModel: createPreferredModelStatePort,
  topbar: createTopbarStatePort,
  favicon: createFaviconStatePort,
  functionalAnomalies: createFunctionalAnomalyStatePort
});

export function createFeatureStatePorts(rootState) {
  const ports = Object.fromEntries(Object.entries(FEATURE_PORT_CREATORS)
    .map(([feature, createPort]) => [feature, createPort(rootState)]));
  ports.settingsSections = createSettingsSectionStatePorts(rootState);
  return Object.freeze(ports);
}
