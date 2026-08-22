import { createScopedStatePort, stateAccess } from "../state/port.js";

const WORKSPACE_STATE_ACCESS = stateAccess(
  ["activeTabs", "customConfig", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "officialRulesActivationRevision", "options", "temporaryLayoutPreset", "topicTitle", "topicTitleCustom"],
  ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset", "topicTitle", "topicTitleCustom"]
);

export function createWorkspaceStatePort(rootState) {
  return createScopedStatePort(rootState, "workspace", WORKSPACE_STATE_ACCESS);
}
