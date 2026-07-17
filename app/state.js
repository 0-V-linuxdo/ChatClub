import { createComposerStatePort, COMPOSER_STATE_ACCESS } from "./composer/state-port.js";
import { createFaviconStatePort, FAVICON_STATE_ACCESS } from "./favicon/state-port.js";
import { createOptimizeStatePort, OPTIMIZE_STATE_ACCESS } from "./optimize/state-port.js";
import { createPocketStatePort, POCKET_STATE_ACCESS } from "./pocket/state-port.js";
import { createPreferredModelStatePort, PREFERRED_MODEL_STATE_ACCESS } from "./preferred-model/state-port.js";
import {
  createSettingsSectionStatePorts,
  SETTINGS_SECTION_STATE_ACCESS,
  SETTINGS_STATE_SECTION_IDS,
  SETTINGS_UI_SECTION_STATE_PORT,
  settingsStatePortForUiSection
} from "./settings/state-ports.js";
import { createSummaryStatePort, SUMMARY_STATE_ACCESS } from "./summary/state-port.js";
import { createTopbarStatePort, TOPBAR_STATE_ACCESS } from "./topbar/state-port.js";
import { createWorkspaceStatePort, WORKSPACE_STATE_ACCESS } from "./workspace/state-port.js";

export { createAppState } from "./state/schema.js";
export { createScopedStatePort, objectStateAccess, stateAccess } from "./state/port.js";
export {
  COMPOSER_STATE_ACCESS,
  FAVICON_STATE_ACCESS,
  OPTIMIZE_STATE_ACCESS,
  POCKET_STATE_ACCESS,
  PREFERRED_MODEL_STATE_ACCESS,
  SETTINGS_SECTION_STATE_ACCESS,
  SETTINGS_STATE_SECTION_IDS,
  SETTINGS_UI_SECTION_STATE_PORT,
  SUMMARY_STATE_ACCESS,
  TOPBAR_STATE_ACCESS,
  WORKSPACE_STATE_ACCESS,
  createComposerStatePort,
  createFaviconStatePort,
  createOptimizeStatePort,
  createPocketStatePort,
  createPreferredModelStatePort,
  createSettingsSectionStatePorts,
  createSummaryStatePort,
  createTopbarStatePort,
  createWorkspaceStatePort,
  settingsStatePortForUiSection
};

export const FEATURE_STATE_ACCESS = Object.freeze({
  workspace: WORKSPACE_STATE_ACCESS,
  summary: SUMMARY_STATE_ACCESS,
  pocket: POCKET_STATE_ACCESS,
  optimize: OPTIMIZE_STATE_ACCESS,
  composer: COMPOSER_STATE_ACCESS,
  preferredModel: PREFERRED_MODEL_STATE_ACCESS,
  topbar: TOPBAR_STATE_ACCESS,
  favicon: FAVICON_STATE_ACCESS
});

const FEATURE_PORT_CREATORS = Object.freeze({
  workspace: createWorkspaceStatePort,
  summary: createSummaryStatePort,
  pocket: createPocketStatePort,
  optimize: createOptimizeStatePort,
  composer: createComposerStatePort,
  preferredModel: createPreferredModelStatePort,
  topbar: createTopbarStatePort,
  favicon: createFaviconStatePort
});

export function createFeatureStatePort(rootState, feature) {
  const createPort = FEATURE_PORT_CREATORS[feature];
  if (!createPort) throw new TypeError(`Unknown feature state: ${feature}`);
  return createPort(rootState);
}

export function createFeatureStatePorts(rootState) {
  const ports = Object.fromEntries(Object.entries(FEATURE_PORT_CREATORS)
    .map(([feature, createPort]) => [feature, createPort(rootState)]));
  ports.settingsSections = createSettingsSectionStatePorts(rootState);
  return Object.freeze(ports);
}
