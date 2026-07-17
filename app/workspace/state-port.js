import { createScopedStatePort, stateAccess } from "../state/port.js";

export const WORKSPACE_STATE_ACCESS = stateAccess(
  ["activeTabs", "customConfig", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"],
  ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"]
);

export function createWorkspaceStatePort(rootState) {
  return createScopedStatePort(rootState, "workspace", WORKSPACE_STATE_ACCESS);
}
