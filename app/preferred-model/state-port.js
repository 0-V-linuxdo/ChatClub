import { createScopedStatePort, stateAccess } from "../state/port.js";

const PREFERRED_MODEL_STATE_ACCESS = stateAccess([
  "activeTabs", "frameLoadingInstanceIds", "groups", "modelPreferenceDraft", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState", "promptImages", "promptSelection", "promptSendInFlight", "promptText"
], [
  "preferredModelGateFailedAppIds", "preferredModelGateFailedCount", "preferredModelGatePendingCount",
  "preferredModelGateReason", "preferredModelGateState", "promptImages", "promptSelection", "promptText"
]);

export function createPreferredModelStatePort(rootState) {
  return createScopedStatePort(rootState, "preferredModel", PREFERRED_MODEL_STATE_ACCESS);
}
