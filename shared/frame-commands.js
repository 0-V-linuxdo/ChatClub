function command(options) {
  return Object.freeze({
    timeoutMs: 5000,
    mutating: false,
    features: Object.freeze([]),
    ...options
  });
}

const CONTENT_CAPABILITIES = Object.freeze([
  "base",
  "send",
  "summary",
  "preferred-model",
  "delete",
  "message-navigator"
]);

function contentBundle(options) {
  return Object.freeze({
    world: "ISOLATED",
    runAt: "document_idle",
    ...options,
    ...(options.hosts ? { hosts: Object.freeze([...options.hosts]) } : {})
  });
}

export const CONTENT_BUNDLES = Object.freeze({
  preload: contentBundle({ id: "chatclub-preload", file: "content/preload.js", world: "MAIN", runAt: "document_start" }),
  grokCookie: contentBundle({
    id: "chatclub-grok-cookie-bridge",
    file: "content/grok-cookie-bridge.js",
    hosts: ["grok.com"],
    runAt: "document_start"
  }),
  content: contentBundle({ id: "chatclub-content", file: "content/content.js" }),
  summaryMain: contentBundle({ id: "chatclub-summary-userscripts-main", file: "content/summary-userscripts-main.js", world: "MAIN" }),
  summaryIsolated: contentBundle({ id: "chatclub-summary-userscripts", file: "content/summary-userscripts.js" }),
  summaryBridge: contentBundle({ id: "chatclub-summary-bridge", file: "content/summary-bridge.js" }),
  send: contentBundle({ id: "chatclub-send", file: "content/send.js" }),
  preferredModel: contentBundle({ id: "chatclub-preferred-model", file: "content/preferred-model.js" }),
  delete: contentBundle({ id: "chatclub-delete", file: "content/delete.js" }),
  messageNavigator: contentBundle({ id: "chatclub-message-navigator", file: "content/message-navigator.js" })
});

const CONTENT_CAPABILITY_BUNDLES = Object.freeze({
  base: Object.freeze([
    CONTENT_BUNDLES.preload,
    CONTENT_BUNDLES.content
  ]),
  send: Object.freeze([CONTENT_BUNDLES.send]),
  summary: Object.freeze([
    CONTENT_BUNDLES.summaryMain,
    CONTENT_BUNDLES.summaryIsolated,
    CONTENT_BUNDLES.summaryBridge
  ]),
  "preferred-model": Object.freeze([CONTENT_BUNDLES.preferredModel]),
  delete: Object.freeze([CONTENT_BUNDLES.delete]),
  "message-navigator": Object.freeze([CONTENT_BUNDLES.messageNavigator])
});
const CONTENT_ANCILLARY_BUNDLES = Object.freeze({
  "grok-cookie": CONTENT_BUNDLES.grokCookie
});

function contentInjectionHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/^\*\./, "").replace(/^\.+|\.+$/g, "");
  }
}

export function normalizeContentCapabilityFeatures(features = []) {
  if (!Array.isArray(features)) throw new TypeError("Content capability features must be an array");
  const requested = new Set(features.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
  const supported = CONTENT_CAPABILITIES.filter((capability) => capability !== "base");
  const unsupported = [...requested].filter((capability) => !supported.includes(capability));
  if (unsupported.length) {
    throw new TypeError(`Unsupported content capabilities: ${unsupported.sort().join(", ")}`);
  }
  return Object.freeze(supported.filter((capability) => requested.has(capability)));
}

export function contentInjectionPlan(options = {}) {
  const features = normalizeContentCapabilityFeatures(options.features || []);
  const hosts = new Set([
    ...(Array.isArray(options.frameUrls) ? options.frameUrls : []),
    options.frameUrl,
    options.frameHost
  ].map(contentInjectionHost).filter(Boolean));
  const ancillary = Object.values(CONTENT_ANCILLARY_BUNDLES).filter((spec) => (
    spec.hosts.some((host) => hosts.has(contentInjectionHost(host)))
  ));
  const base = CONTENT_CAPABILITY_BUNDLES.base;
  return Object.freeze([
    base[0],
    ...ancillary,
    ...base.slice(1),
    ...features.flatMap((feature) => CONTENT_CAPABILITY_BUNDLES[feature])
  ]);
}

// The single command contract shared by the extension page, background router,
// and bundled content handler. `mutating` means an acknowledged delivery must
// never be retried automatically, even when its response times out.
export const FRAME_COMMAND_SPECS = Object.freeze({
  getLocationHref: command({ timeoutMs: 1200, capability: "base" }),
  getPageMeta: command({ timeoutMs: 1800, capability: "base" }),
  getPageText: command({ timeoutMs: 2500, capability: "base" }),
  getSummaryRuntimeState: command({ timeoutMs: 1800, features: Object.freeze(["summary"]) }),
  collectSummary: command({ timeoutMs: 36000, mutating: true, features: Object.freeze(["summary"]) }),
  sendText: command({ timeoutMs: 12000, mutating: true, features: Object.freeze(["send"]) }),
  newChatPreprocess: command({ timeoutMs: 1500, mutating: true, features: Object.freeze(["send"]) }),
  prepareNavigationFocusGuard: command({ timeoutMs: 1200, mutating: true, transport: "main-world", features: Object.freeze(["preferred-model"]) }),
  adoptNavigationFocusGuard: command({ timeoutMs: 1200, mutating: true, transport: "main-world", features: Object.freeze(["preferred-model"]) }),
  deleteThread: command({ timeoutMs: 37000, mutating: true, features: Object.freeze(["delete"]) }),
  getDeleteConfirmState: command({ timeoutMs: 2400, features: Object.freeze(["delete"]) }),
  applyPreferredModel: command({ timeoutMs: 18000, mutating: true, features: Object.freeze(["preferred-model"]) }),
  cancelPreferredModelApply: command({ timeoutMs: 2000, mutating: true, features: Object.freeze(["preferred-model"]) }),
  setMessageNavigator: command({ timeoutMs: 6000, mutating: true, features: Object.freeze(["message-navigator"]) }),
  hideMessageNavigatorMenu: command({ timeoutMs: 2000, mutating: true, features: Object.freeze(["message-navigator"]) }),
  getMessageNavigatorState: command({ timeoutMs: 2000, features: Object.freeze(["message-navigator"]) })
});

export function frameCommandSpec(commandName) {
  return FRAME_COMMAND_SPECS[String(commandName || "")] || null;
}
