import { createScopedStatePort, stateAccess } from "../state/port.js";

export const POCKET_STATE_ACCESS = stateAccess(
  ["groups", "options", "pocketEntries", "summaryPreviewItems"],
  ["options", "pocketEntries"]
);

export function createPocketStatePort(rootState) {
  return createScopedStatePort(rootState, "pocket", POCKET_STATE_ACCESS);
}
