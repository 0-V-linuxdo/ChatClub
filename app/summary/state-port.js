import { createScopedStatePort, stateAccess } from "../state/port.js";

const SUMMARY_STATE_ACCESS = stateAccess([
  "options", "summaryBusy", "summaryComposing", "summaryContexts", "summaryDiagnostics", "summaryError", "summaryExpandedKeys",
  "summaryLoadingPhase", "summaryMaximized", "summaryNotice", "summaryOpen", "summaryPreviewItems",
  "summaryPreviewRefreshingKeys", "summaryQuestion", "summaryResult", "summarySize", "summaryStatus", "summaryView"
], [
  "summaryBusy", "summaryComposing", "summaryContexts", "summaryDiagnostics", "summaryError", "summaryExpandedKeys",
  "summaryLoadingPhase", "summaryMaximized", "summaryNotice", "summaryOpen", "summaryPreviewItems",
  "summaryPreviewRefreshingKeys", "summaryQuestion", "summaryResult", "summarySize", "summaryStatus", "summaryView"
]);

export function createSummaryStatePort(rootState) {
  return createScopedStatePort(rootState, "summary", SUMMARY_STATE_ACCESS);
}
