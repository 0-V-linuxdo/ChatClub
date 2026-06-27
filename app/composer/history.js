export const PROMPT_HISTORY_LIVE_CURSOR = -1;

function hasModifier(event) {
  return Boolean(event?.altKey || event?.ctrlKey || event?.metaKey || event?.shiftKey);
}

function isComposing(event) {
  return Boolean(event?.isComposing || event?.keyCode === 229);
}

export function shouldOpenPromptLibraryFromSlash(event, value = "", selectionStart = 0, selectionEnd = selectionStart) {
  return event?.key === "/"
    && !hasModifier(event)
    && !isComposing(event)
    && String(value || "").trim() === ""
    && Number(selectionStart || 0) === 0
    && Number(selectionEnd || 0) === 0;
}

export function promptCursorLineState(value = "", selectionStart = 0) {
  const text = String(value || "");
  const cursor = Math.max(0, Math.min(Number(selectionStart || 0), text.length));
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  return {
    atFirstLine: !before.includes("\n"),
    atLastLine: !after.includes("\n")
  };
}

export function shouldNavigatePromptHistory(event, value = "", selectionStart = 0, selectionEnd = selectionStart) {
  if (!event || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
  if (hasModifier(event) || isComposing(event)) return false;
  if (Number(selectionStart || 0) !== Number(selectionEnd || 0)) return false;
  const lineState = promptCursorLineState(value, selectionStart);
  return event.key === "ArrowUp" ? lineState.atFirstLine : lineState.atLastLine;
}

export function promptHistoryNavigate({
  history = [],
  cursor = PROMPT_HISTORY_LIVE_CURSOR,
  draft = "",
  currentText = "",
  direction = "up"
} = {}) {
  const entries = (Array.isArray(history) ? history : [])
    .map((item) => String(item?.text || item || ""))
    .filter(Boolean);
  if (!entries.length) {
    return { handled: false, cursor, draft, text: currentText };
  }

  if (direction === "up") {
    const nextDraft = cursor === PROMPT_HISTORY_LIVE_CURSOR ? String(currentText || "") : String(draft || "");
    const nextCursor = Math.min(cursor + 1, entries.length - 1);
    return {
      handled: nextCursor !== cursor || cursor === PROMPT_HISTORY_LIVE_CURSOR,
      cursor: nextCursor,
      draft: nextDraft,
      text: entries[nextCursor] || ""
    };
  }

  if (cursor === PROMPT_HISTORY_LIVE_CURSOR) {
    return { handled: false, cursor, draft, text: currentText };
  }
  if (cursor <= 0) {
    return {
      handled: true,
      cursor: PROMPT_HISTORY_LIVE_CURSOR,
      draft: "",
      text: String(draft || "")
    };
  }
  const nextCursor = cursor - 1;
  return {
    handled: true,
    cursor: nextCursor,
    draft: String(draft || ""),
    text: entries[nextCursor] || ""
  };
}
