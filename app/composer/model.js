const PROMPT_COLLAPSED_HEIGHT = 38;
const PROMPT_IMAGE_EXPANDED_HEIGHT = 180;

function promptPreviewText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function promptCollapsedPreview(value = "", placeholder = "") {
  const text = promptPreviewText(value);
  return {
    text: text || placeholder,
    title: text || placeholder,
    empty: !text
  };
}

function promptExpandedMaxHeight(viewportHeight = 0) {
  return Math.min(180, Math.max(88, Math.round(Number(viewportHeight || 0) * 0.36)));
}

export function promptInputHeight(scrollHeight, viewportHeight, expanded, options = {}) {
  if (!expanded) {
    return {
      height: PROMPT_COLLAPSED_HEIGHT,
      overflowY: "hidden"
    };
  }
  if (options?.hasImages) {
    return {
      height: PROMPT_IMAGE_EXPANDED_HEIGHT,
      overflowY: "hidden"
    };
  }
  const maxHeight = promptExpandedMaxHeight(viewportHeight);
  const height = Math.max(PROMPT_COLLAPSED_HEIGHT, Math.min(Number(scrollHeight || 0), maxHeight));
  return {
    height,
    overflowY: Number(scrollHeight || 0) > maxHeight ? "auto" : "hidden"
  };
}
