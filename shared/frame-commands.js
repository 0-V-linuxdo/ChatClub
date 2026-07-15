function command(options) {
  return Object.freeze({
    timeoutMs: 5000,
    mutating: false,
    features: Object.freeze([]),
    ...options
  });
}

// The single command contract shared by the extension page, background router,
// and bundled content handler. `mutating` means an acknowledged delivery must
// never be retried automatically, even when its response times out.
export const FRAME_COMMAND_SPECS = Object.freeze({
  getLocationHref: command({ timeoutMs: 1200 }),
  getPageMeta: command({ timeoutMs: 1800 }),
  getPageText: command({ timeoutMs: 2500 }),
  getSummaryRuntimeState: command({ timeoutMs: 1800, features: Object.freeze(["summary"]) }),
  collectSummary: command({ timeoutMs: 36000, mutating: true, features: Object.freeze(["summary"]) }),
  sendText: command({ timeoutMs: 12000, mutating: true }),
  newChatPreprocess: command({ timeoutMs: 1500, mutating: true }),
  prepareNavigationFocusGuard: command({ timeoutMs: 1200, mutating: true, transport: "main-world" }),
  adoptNavigationFocusGuard: command({ timeoutMs: 1200, mutating: true, transport: "main-world" }),
  deleteThread: command({ timeoutMs: 37000, mutating: true }),
  getDeleteConfirmState: command({ timeoutMs: 2400 }),
  applyPreferredModel: command({ timeoutMs: 18000, mutating: true }),
  cancelPreferredModelApply: command({ timeoutMs: 2000, mutating: true }),
  setMessageNavigator: command({ timeoutMs: 6000, mutating: true }),
  hideMessageNavigatorMenu: command({ timeoutMs: 2000, mutating: true }),
  getMessageNavigatorState: command({ timeoutMs: 2000 })
});

export function frameCommandSpec(commandName) {
  return FRAME_COMMAND_SPECS[String(commandName || "")] || null;
}
