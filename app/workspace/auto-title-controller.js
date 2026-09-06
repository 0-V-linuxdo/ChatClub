import { conversationTitleFromDocumentTitle } from "../../shared/topic-title.js";
import { conversationHrefFromLocation } from "../../shared/workspace-tab-memory.js";
import { frameNewChatPending } from "./frame-loading.js";

// A conversation renders asynchronously after its route commits, and some
// sites publish their title even later. Probe on a short bounded schedule
// instead of once; every attempt re-checks that the desk still wants a name.
const AUTO_TITLE_PROBE_DELAYS_MS = Object.freeze([900, 2600, 6000, 12000]);
const OPENING_MAX_CHARS = 180;

function hostnameOf(value) {
  try {
    return new URL(String(value || "")).hostname;
  } catch {
    return "";
  }
}

/**
 * The question a Pocket batch was saved with, for naming the desk that a
 * batch restore just filled. Entries are ordered as Pocket displays them.
 */
export function openingPromptFromPocketEntries(entries = []) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    const text = String(entry?.userMessage || "").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, OPENING_MAX_CHARS * 4);
  }
  return "";
}

/**
 * Auto-name a desk whose frames hold conversations the user did not start
 * through the ChatClub composer, for example a Pocket restore or a chat
 * picked from the site's own sidebar. The site-published conversation title
 * wins when the document title carries one; otherwise the first user message
 * goes through the same topic-title generation as a composer prompt. Desks
 * that already have a title, custom or generated, are never renamed.
 */
export function createWorkspaceAutoTitleController({
  topicTitle,
  sendToContentFrame,
  frameApp,
  inferAppName,
  probeConfigForFrame,
  workspaceId,
  delays = AUTO_TITLE_PROBE_DELAYS_MS,
  setTimer = (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimer = (handle) => globalThis.clearTimeout(handle)
} = {}) {
  for (const [name, value] of Object.entries({ sendToContentFrame, frameApp, probeConfigForFrame, workspaceId })) {
    if (typeof value !== "function") throw new TypeError(`Workspace auto title controller requires ${name}().`);
  }
  if (
    typeof topicTitle?.canAutoGenerate !== "function"
    || typeof topicTitle?.maybeAdoptTitle !== "function"
    || typeof topicTitle?.maybeGenerateFromPrompt !== "function"
  ) {
    throw new TypeError("Workspace auto title controller requires the topic title controller.");
  }
  const schedule = Array.isArray(delays) && delays.length ? delays.map((ms) => Math.max(0, Number(ms) || 0)) : [0];
  const pendingByFrame = new WeakMap();
  const trackedFrames = new Set();

  function frameConversationHref(iframe) {
    return conversationHrefFromLocation(iframe?.dataset?.currentHref)
      || conversationHrefFromLocation(iframe?.dataset?.currentThreadHref);
  }

  function frameAppName(iframe) {
    try {
      const app = frameApp(iframe);
      const name = typeof inferAppName === "function" ? inferAppName(app) : app?.name;
      return String(name || app?.name || app?.id || iframe?.dataset?.appId || "").trim();
    } catch {
      return String(iframe?.dataset?.appId || "").trim();
    }
  }

  function cancelFrame(iframe) {
    const pending = iframe ? pendingByFrame.get(iframe) : null;
    if (!pending) return false;
    if (pending.timer !== null) clearTimer(pending.timer);
    pendingByFrame.delete(iframe);
    trackedFrames.delete(iframe);
    return true;
  }

  function stillWanted(iframe, pending) {
    return Boolean(
      iframe?.isConnected !== false
      && pendingByFrame.get(iframe) === pending
      && !frameNewChatPending(iframe)
      && workspaceId() === pending.workspaceId
      && frameConversationHref(iframe) === pending.href
      && topicTitle.canAutoGenerate()
    );
  }

  function armAttempt(iframe, pending) {
    if (pending.attempt >= schedule.length) {
      cancelFrame(iframe);
      return;
    }
    const delay = schedule[pending.attempt];
    pending.attempt += 1;
    pending.timer = setTimer(() => {
      pending.timer = null;
      runAttempt(iframe, pending).catch(() => {});
    }, delay);
  }

  async function adoptDocumentTitle(iframe, pending) {
    let meta = null;
    try {
      meta = await sendToContentFrame(iframe, "getPageMeta", {}, 1800);
    } catch {
      return "";
    }
    const reportedHref = String(meta?.href || "");
    if (reportedHref && conversationHrefFromLocation(reportedHref) !== pending.href) return "";
    const title = conversationTitleFromDocumentTitle(meta?.title, {
      appName: frameAppName(iframe),
      hostname: hostnameOf(reportedHref || pending.href)
    });
    if (!title || !stillWanted(iframe, pending)) return "";
    return topicTitle.maybeAdoptTitle(title);
  }

  async function generateFromOpening(iframe, pending) {
    let config = null;
    try {
      config = probeConfigForFrame(iframe, pending.href);
    } catch {
      config = null;
    }
    if (!config || typeof config !== "object") return "";
    let result = null;
    try {
      result = await sendToContentFrame(iframe, "getConversationOpening", {
        config: { ...config, summaryMaxChars: OPENING_MAX_CHARS }
      }, 2500);
    } catch {
      return "";
    }
    const reportedHref = String(result?.href || "");
    if (reportedHref && conversationHrefFromLocation(reportedHref) !== pending.href) return "";
    if (!stillWanted(iframe, pending)) return "";
    const publishedTitle = conversationTitleFromDocumentTitle(result?.title, {
      appName: frameAppName(iframe),
      hostname: hostnameOf(reportedHref || pending.href)
    });
    if (publishedTitle) return topicTitle.maybeAdoptTitle(publishedTitle);
    const opening = String(result?.openingText || "").trim();
    if (!opening) return "";
    return topicTitle.maybeGenerateFromPrompt(opening, { stillWanted: () => stillWanted(iframe, pending) });
  }

  async function runAttempt(iframe, pending) {
    if (!stillWanted(iframe, pending)) {
      cancelFrame(iframe);
      return;
    }
    if (typeof topicTitle.isGenerating === "function" && topicTitle.isGenerating()) {
      // The composer (or a Pocket restore) is already turning its prompt into
      // this desk's title; probing now would only race that request.
      armAttempt(iframe, pending);
      return;
    }
    pending.running = true;
    let named = "";
    try {
      named = await adoptDocumentTitle(iframe, pending);
      if (!named && stillWanted(iframe, pending)) named = await generateFromOpening(iframe, pending);
    } finally {
      pending.running = false;
    }
    if (pendingByFrame.get(iframe) !== pending) return;
    if (named || !stillWanted(iframe, pending)) {
      cancelFrame(iframe);
      return;
    }
    armAttempt(iframe, pending);
  }

  /**
   * Called on frame location and load events. Returns true when a probe
   * schedule is active for this frame afterwards.
   */
  function observeFrame(iframe) {
    if (!iframe || iframe.isConnected === false) return false;
    if (!topicTitle.canAutoGenerate() || frameNewChatPending(iframe)) {
      cancelFrame(iframe);
      return false;
    }
    const href = frameConversationHref(iframe);
    if (!href) {
      cancelFrame(iframe);
      return false;
    }
    const currentWorkspaceId = String(workspaceId() || "");
    const existing = pendingByFrame.get(iframe);
    if (existing && existing.href === href && existing.workspaceId === currentWorkspaceId) return true;
    cancelFrame(iframe);
    const pending = { href, workspaceId: currentWorkspaceId, attempt: 0, timer: null, running: false };
    pendingByFrame.set(iframe, pending);
    trackedFrames.add(iframe);
    armAttempt(iframe, pending);
    return true;
  }

  function observeFrames(frames = []) {
    let active = 0;
    for (const iframe of Array.isArray(frames) ? frames : []) {
      if (observeFrame(iframe)) active += 1;
    }
    return active;
  }

  function dispose() {
    for (const iframe of [...trackedFrames]) cancelFrame(iframe);
  }

  return Object.freeze({
    cancelFrame,
    dispose,
    observeFrame,
    observeFrames,
    isObserving: (iframe) => pendingByFrame.has(iframe)
  });
}
