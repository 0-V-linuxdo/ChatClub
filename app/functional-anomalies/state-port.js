import { createScopedStatePort, stateAccess } from "../state/port.js";

const FUNCTIONAL_ANOMALY_STATE_ACCESS = stateAccess(
  ["functionalAnomalyRecords"],
  ["functionalAnomalyRecords"]
);

export function createFunctionalAnomalyStatePort(rootState) {
  return createScopedStatePort(rootState, "functionalAnomalies", FUNCTIONAL_ANOMALY_STATE_ACCESS);
}
