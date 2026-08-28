import { createScopedStatePort, stateAccess } from "../state/port.js";

const SHARE_STATE_ACCESS = stateAccess([
  "groups", "activeTabs", "fullscreenGroupId", "options",
  "shareBusy", "shareError", "shareFormat", "shareImageLayout", "shareMaximized", "shareOpen",
  "sharePreviewText", "sharePreviewUrl", "shareScope", "shareSelectedKeys",
  "shareSize", "shareStatus"
], [
  "shareBusy", "shareError", "shareFormat", "shareImageLayout", "shareMaximized", "shareOpen",
  "sharePreviewText", "sharePreviewUrl", "shareScope", "shareSelectedKeys",
  "shareSize", "shareStatus"
]);

export function createShareStatePort(rootState) {
  return createScopedStatePort(rootState, "share", SHARE_STATE_ACCESS);
}
