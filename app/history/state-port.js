import { createScopedStatePort, stateAccess } from "../state/port.js";

const HISTORY_STATE_ACCESS = stateAccess(
  ["options", "promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"],
  ["promptHistoryCursor", "promptHistoryDraft", "promptSelection", "promptSendHistory", "promptText"]
);

export function createHistoryStatePort(rootState) {
  return createScopedStatePort(rootState, "history", HISTORY_STATE_ACCESS);
}
