import { createScopedStatePort, stateAccess } from "../state/port.js";

const OPTIMIZE_STATE_ACCESS = stateAccess(
  ["options", "promptSelection", "promptText"],
  ["promptSelection", "promptText"]
);

export function createOptimizeStatePort(rootState) {
  return createScopedStatePort(rootState, "optimize", OPTIMIZE_STATE_ACCESS);
}
