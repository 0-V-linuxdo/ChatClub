import { createScopedStatePort, stateAccess } from "../state/port.js";

const TOPBAR_STATE_ACCESS = stateAccess([
  "activeTabs", "fullscreenGroupId", "groups", "options", "preferredModelGateFailedAppIds",
  "preferredModelGateFailedCount", "preferredModelGatePendingCount", "preferredModelGateReason",
  "preferredModelGateState", "promptImages", "promptSendInFlight", "promptText", "shortcutConfig", "summaryOpen",
  "promptLibrary", "temporaryLayoutPreset", "topbarEditDragId", "topbarEditLayoutDraft", "topbarEditMode"
], ["options", "topbarEditDragId", "topbarEditLayoutDraft", "topbarEditMode"]);

export function createTopbarStatePort(rootState) {
  return createScopedStatePort(rootState, "topbar", TOPBAR_STATE_ACCESS);
}
