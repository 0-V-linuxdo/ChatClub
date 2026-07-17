import { createScopedStatePort, stateAccess } from "../state/port.js";

export const COMPOSER_STATE_ACCESS = stateAccess([
  "options", "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptLibrary", "promptSelection",
  "promptSendHistory", "promptSendInFlight", "promptText", "shortcutConfig"
], [
  "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptSelection", "promptSendHistory",
  "promptSendInFlight", "promptText"
]);

export function createComposerStatePort(rootState) {
  return createScopedStatePort(rootState, "composer", COMPOSER_STATE_ACCESS);
}
