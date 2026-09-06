import { generateTopicTitle as defaultGenerateTopicTitle } from "../../shared/api.js";
import { workspaceSessionWorkspaceId } from "../../shared/workspace-session.js";
import { sanitizeTopicTitle, topicTitleFromPrompt } from "../../shared/topic-title.js";

export function createWorkspaceTopicTitleController({
  state,
  rememberWorkspaceSession,
  render,
  generateTopicTitle = defaultGenerateTopicTitle,
  extensionApi,
  workspaceId
} = {}) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Workspace topic title controller requires state.");
  }
  if (typeof rememberWorkspaceSession !== "function" || typeof render !== "function") {
    throw new TypeError("Workspace topic title controller requires rememberWorkspaceSession() and render().");
  }

  let generationToken = 0;
  let generationsInFlight = 0;
  let storageUnsubscriber = null;

  function currentTitle() {
    return String(state.topicTitle || "").trim();
  }

  function isCustom() {
    return state.topicTitleCustom === true;
  }

  function canAutoGenerate() {
    return !isCustom() && !currentTitle();
  }

  /** True while a composer or Pocket prompt is still being turned into a title. */
  function isGenerating() {
    return generationsInFlight > 0;
  }

  function applyTitle(title, custom) {
    const next = sanitizeTopicTitle(title);
    if (custom) {
      state.topicTitle = next;
      state.topicTitleCustom = true;
    } else {
      if (isCustom() || currentTitle()) return false;
      if (!next) return false;
      state.topicTitle = next;
      state.topicTitleCustom = false;
    }
    rememberWorkspaceSession();
    render();
    return true;
  }

  function setCustomTitle(title) {
    return applyTitle(title, true);
  }

  /**
   * Adopt an already-final auto title, such as the conversation title a chat
   * site publishes in its document title. Custom and existing titles win.
   */
  function maybeAdoptTitle(title) {
    if (!canAutoGenerate()) return currentTitle();
    const next = sanitizeTopicTitle(title);
    if (!next) return "";
    generationToken += 1;
    return applyTitle(next, false) ? next : currentTitle();
  }

  /**
   * Generate an auto title from conversation text. `stillWanted()` lets the
   * caller drop a late result once the desk it was meant for has moved on,
   * for example after New Chat rebound this page to a new workspace id.
   */
  async function maybeGenerateFromPrompt(text, { stillWanted = () => true } = {}) {
    const prompt = String(text || "").trim();
    if (!prompt) return "";
    if (!canAutoGenerate()) return currentTitle();
    const token = ++generationToken;
    const fallback = topicTitleFromPrompt(prompt);
    let title = "";
    generationsInFlight += 1;
    try {
      title = await generateTopicTitle(state.options, prompt);
    } catch {
      title = fallback;
    } finally {
      generationsInFlight -= 1;
    }
    if (token !== generationToken || isCustom() || currentTitle()) return currentTitle();
    if (!stillWanted()) return "";
    const next = sanitizeTopicTitle(title) || fallback;
    if (!next) return "";
    applyTitle(next, false);
    return next;
  }

  function syncFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    const nextTitle = String(snapshot.topicTitle || "").trim();
    const nextCustom = snapshot.topicTitleCustom === true;
    if (isCustom() && !nextCustom) return false;
    if (currentTitle() === nextTitle && isCustom() === nextCustom) return false;
    if (currentTitle() && !nextTitle) generationToken += 1;
    state.topicTitle = nextTitle;
    state.topicTitleCustom = nextCustom;
    render();
    return true;
  }

  function onStorageChanged(changes, areaName) {
    if (areaName && areaName !== "local") return;
    const currentWorkspaceId = typeof workspaceId === "function" ? workspaceId() : workspaceId;
    if (!currentWorkspaceId) return;
    const keys = changes && typeof changes === "object" ? Object.keys(changes) : [];
    const key = keys.find((item) => workspaceSessionWorkspaceId(item) === currentWorkspaceId);
    if (!key) return;
    syncFromSnapshot(changes[key]?.newValue?.snapshot);
  }

  function install() {
    if (storageUnsubscriber) return;
    try {
      const api = typeof extensionApi === "function" ? extensionApi() : extensionApi;
      const eventRef = api?.storage?.onChanged;
      if (!eventRef?.addListener) return;
      eventRef.addListener(onStorageChanged);
      storageUnsubscriber = () => eventRef.removeListener?.(onStorageChanged);
    } catch {}
  }

  function dispose() {
    try { storageUnsubscriber?.(); } catch {}
    storageUnsubscriber = null;
  }

  return Object.freeze({
    canAutoGenerate,
    isGenerating,
    setCustomTitle,
    maybeAdoptTitle,
    maybeGenerateFromPrompt,
    syncFromSnapshot,
    install,
    dispose
  });
}
