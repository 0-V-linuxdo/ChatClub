import { createScopedStatePort, stateAccess } from "../state/port.js";

const COMPOSER_STATE_ACCESS = stateAccess([
  "options", "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptLibrary", "promptSelection",
  "promptQueuedTargetCount", "promptSendingTargetCount", "promptSendHistory", "promptText", "shortcutConfig"
], [
  "promptHistoryCursor", "promptHistoryDraft", "promptImages", "promptSelection", "promptSendHistory",
  "promptQueuedTargetCount", "promptSendingTargetCount", "promptText"
]);

export function createComposerStatePort(rootState) {
  return createScopedStatePort(rootState, "composer", COMPOSER_STATE_ACCESS);
}
