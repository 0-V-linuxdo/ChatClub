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

  async function maybeGenerateFromPrompt(text) {
    const prompt = String(text || "").trim();
    if (!prompt) return "";
    if (!canAutoGenerate()) return currentTitle();
    const token = ++generationToken;
    const fallback = topicTitleFromPrompt(prompt);
    let title = "";
    try {
      title = await generateTopicTitle(state.options, prompt);
    } catch {
      title = fallback;
    }
    if (token !== generationToken || isCustom() || currentTitle()) return currentTitle();
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
    setCustomTitle,
    maybeGenerateFromPrompt,
    syncFromSnapshot,
    install,
    dispose
  });
}
