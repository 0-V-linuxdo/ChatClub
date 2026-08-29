const SUMMARY_OFFICIAL_MAX_TURNS = 1000;
const SUMMARY_OFFICIAL_MAX_TEXT_LENGTH = 2 * 1024 * 1024;
const PACKAGED_SUMMARY_CHROME_SELECTORS = Object.freeze([
  "button",
  "[role='button']",
  "[role='toolbar']",
  "[role='menu']",
  "[role='menuitem']",
  "[aria-label*='copy' i]",
  "[title*='copy' i]",
  "[data-testid*='copy' i]",
  ".code-buttons"
]);
const COLLECTABLE_SLOTS = Object.freeze(["conversationRoot", "messageRoot", "actionBar", "messageCopy"]);
const SLOT_HIT_KEYS = Object.freeze([
  ...COLLECTABLE_SLOTS,
  "userRoot",
  "assistantRoot",
  "userRoleSignal",
  "assistantRoleSignal"
]);

function selectorList(value) {
  return (Array.isArray(value) ? value : [])
    .map((selector) => String(selector || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function selectorUnion(value) {
  return selectorList(value).join(",");
}

function safeMatches(element, selectors) {
  const selector = selectorUnion(selectors);
  if (!selector) return false;
  try { return Boolean(element?.matches?.(selector)); } catch { return false; }
}

function safeQuery(element, selectors) {
  const selector = selectorUnion(selectors);
  if (!selector) return false;
  try { return Boolean(element?.querySelector?.(selector)); } catch { return false; }
}

function roleForElement(element, hints = {}) {
  const user = safeMatches(element, hints.userRoot)
    || safeQuery(element, hints.userRoot)
    || safeQuery(element, hints.userRoleSignal);
  const assistant = safeMatches(element, hints.assistantRoot)
    || safeQuery(element, hints.assistantRoot)
    || safeQuery(element, hints.assistantRoleSignal);
  if (user === assistant) return "";
  return user ? "user" : "assistant";
}

function cloneText(element, cleanupSelectors, normalize) {
  let clone;
  try { clone = element?.cloneNode?.(true); } catch { return ""; }
  if (!clone) return "";
  const selector = selectorUnion(cleanupSelectors);
  if (selector) {
    try { clone.querySelectorAll(selector).forEach((node) => node.remove()); } catch { return ""; }
  }
  return normalize(clone.innerText || clone.textContent || "");
}

function orderedUnique(elements = []) {
  const seen = new Set();
  return elements.filter((element) => {
    if (!element || seen.has(element)) return false;
    seen.add(element);
    return true;
  }).sort((left, right) => {
    try {
      const position = left.compareDocumentPosition(right);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    } catch {}
    return 0;
  });
}

function messageRootsFromActions(root, hints, qsa, closest) {
  const messageRootSelector = selectorUnion(hints.messageRoot);
  if (!messageRootSelector) return [];
  const actions = [
    ...selectorList(hints.actionBar),
    ...selectorList(hints.messageCopy)
  ].flatMap((selector) => qsa(selector, root).slice(0, SUMMARY_OFFICIAL_MAX_TURNS));
  return actions.map((action) => closest(action, messageRootSelector)).filter(Boolean);
}

function countSlot(hints, slot, root, qsa, opts) {
  return selectorList(hints?.[slot]).reduce((count, selector) => (
    count + (qsa(selector, root, opts) || []).length
  ), 0);
}

function officialSummaryMissHits(miss = "") {
  return {
    conversationRoots: 0,
    messageRoots: 0,
    classified: 0,
    user: 0,
    assistant: 0,
    droppedNoRole: 0,
    droppedNoText: 0,
    slots: {},
    miss: String(miss || "")
  };
}

export function inspectOfficialSummaryCollection(config = {}, deps = {}) {
  const fail = (miss) => ({ messages: null, hits: officialSummaryMissHits(miss) });
  const hints = config?.officialRuleHints;
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return fail("no-hints");
  const { qsa, closest, visible, normalize } = deps;
  if (![qsa, closest, visible, normalize].every((fn) => typeof fn === "function")) return fail("no-hints");

  const documentRoot = globalThis.document;
  if (!documentRoot) return fail("no-hints");
  if (!COLLECTABLE_SLOTS.some((slot) => selectorList(hints[slot]).length)) return fail("empty-slots");

  const conversationRoots = selectorList(hints.conversationRoot)
    .flatMap((selector) => qsa(selector, documentRoot, { all: false }))
    .filter(visible);
  const root = conversationRoots[0] || documentRoot;
  const directMessages = selectorList(hints.messageRoot)
    .flatMap((selector) => qsa(selector, root).slice(0, SUMMARY_OFFICIAL_MAX_TURNS));
  const elements = orderedUnique([
    ...directMessages,
    ...messageRootsFromActions(root, hints, qsa, closest)
  ]).filter(visible).slice(0, SUMMARY_OFFICIAL_MAX_TURNS);
  const slots = Object.fromEntries(SLOT_HIT_KEYS.map((slot) => [
    slot,
    slot === "conversationRoot"
      ? conversationRoots.length
      : slot === "messageRoot"
        ? directMessages.length
        : countSlot(hints, slot, root, qsa)
  ]));
  const hits = {
    ...officialSummaryMissHits(elements.length ? "" : "no-message-roots"),
    conversationRoots: conversationRoots.length,
    messageRoots: elements.length,
    slots
  };
  if (!elements.length) return { messages: null, hits };

  const cleanup = [
    ...PACKAGED_SUMMARY_CHROME_SELECTORS,
    ...selectorList(hints.cleanup),
    ...selectorList(hints.actionBar),
    ...selectorList(hints.messageCopy),
    ...selectorList(hints.nestedCodeAction),
    ...selectorList(hints.referenceAction)
  ];
  const messages = [];
  let totalTextLength = 0;
  for (const element of elements) {
    const role = roleForElement(element, hints);
    if (!role) {
      hits.droppedNoRole += 1;
      continue;
    }
    const text = cloneText(element, cleanup, normalize);
    if (!text) {
      hits.droppedNoText += 1;
      continue;
    }
    totalTextLength += text.length;
    if (totalTextLength > SUMMARY_OFFICIAL_MAX_TEXT_LENGTH) {
      hits.miss = "oversize";
      return { messages: null, hits };
    }
    hits.classified += 1;
    hits[role] += 1;
    messages.push({ role, text });
  }
  const hasUser = messages.some((message) => message.role === "user");
  const hasAssistant = messages.some((message) => message.role === "assistant");
  if (!hasUser || !hasAssistant) {
    hits.miss = !hasUser && !hasAssistant ? "no-pair" : (hasUser ? "no-assistant" : "no-user");
    return { messages: null, hits };
  }
  return { messages, hits };
}

export function collectOfficialSummaryMessages(config = {}, deps = {}) {
  return inspectOfficialSummaryCollection(config, deps).messages;
}
