import { createScopedStatePort, stateAccess } from "../state/port.js";

const FAVICON_STATE_ACCESS = stateAccess(
  ["customConfig", "faviconCache", "options"],
  ["faviconCache"]
);

export function createFaviconStatePort(rootState) {
  return createScopedStatePort(rootState, "favicon", FAVICON_STATE_ACCESS);
}
