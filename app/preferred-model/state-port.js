import { createScopedStatePort, stateAccess } from "../state/port.js";

const PREFERRED_MODEL_STATE_ACCESS = stateAccess([
  "frameLoadingInstanceIds", "modelPreferenceDraft", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState"
], [
  "preferredModelGateFailedAppIds", "preferredModelGateFailedCount", "preferredModelGatePendingCount",
  "preferredModelGateReason", "preferredModelGateState"
]);

export function createPreferredModelStatePort(rootState) {
  return createScopedStatePort(rootState, "preferredModel", PREFERRED_MODEL_STATE_ACCESS);
}
