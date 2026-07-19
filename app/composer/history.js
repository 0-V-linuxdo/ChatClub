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

function promptCursorLineState(value = "", selectionStart = 0) {
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
  currentImages = [],
  currentText = "",
  direction = "up"
} = {}) {
  const entries = (Array.isArray(history) ? history : [])
    .map((item) => {
      if (typeof item === "string") return { text: item, images: [] };
      return {
        text: String(item?.text || item?.prompt || item?.content || ""),
        images: Array.isArray(item?.images) ? item.images : []
      };
    })
    .filter((item) => item.text || item.images.length);
  if (!entries.length) {
    return { handled: false, cursor, draft, text: currentText, images: currentImages };
  }

  if (direction === "up") {
    const nextDraft = cursor === PROMPT_HISTORY_LIVE_CURSOR
      ? { text: String(currentText || ""), images: Array.isArray(currentImages) ? currentImages : [] }
      : (draft && typeof draft === "object" ? draft : { text: String(draft || ""), images: [] });
    const nextCursor = Math.min(cursor + 1, entries.length - 1);
    return {
      handled: nextCursor !== cursor || cursor === PROMPT_HISTORY_LIVE_CURSOR,
      cursor: nextCursor,
      draft: nextDraft,
      text: entries[nextCursor]?.text || "",
      images: entries[nextCursor]?.images || []
    };
  }

  if (cursor === PROMPT_HISTORY_LIVE_CURSOR) {
    return { handled: false, cursor, draft, text: currentText, images: currentImages };
  }
  if (cursor <= 0) {
    const liveDraft = draft && typeof draft === "object" ? draft : { text: String(draft || ""), images: [] };
    return {
      handled: true,
      cursor: PROMPT_HISTORY_LIVE_CURSOR,
      draft: "",
      text: String(liveDraft.text || ""),
      images: Array.isArray(liveDraft.images) ? liveDraft.images : []
    };
  }
  const nextCursor = cursor - 1;
  return {
    handled: true,
    cursor: nextCursor,
    draft,
    text: entries[nextCursor]?.text || "",
    images: entries[nextCursor]?.images || []
  };
}
