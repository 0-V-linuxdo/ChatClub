const PROMPT_COLLAPSED_HEIGHT = 38;
const PROMPT_TEXT_EXPANDED_MAX_HEIGHT = 180;
const PROMPT_IMAGE_EXPANDED_MIN_HEIGHT = 180;
const PROMPT_IMAGE_EXPANDED_MAX_HEIGHT = 360;

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

function promptExpandedMaxHeight(viewportHeight = 0, hasImages = false) {
  if (hasImages) {
    return Math.min(
      PROMPT_IMAGE_EXPANDED_MAX_HEIGHT,
      Math.max(PROMPT_IMAGE_EXPANDED_MIN_HEIGHT, Math.round(Number(viewportHeight || 0) * 0.55))
    );
  }
  return Math.min(PROMPT_TEXT_EXPANDED_MAX_HEIGHT, Math.max(88, Math.round(Number(viewportHeight || 0) * 0.36)));
}

export function promptInputHeight(scrollHeight, viewportHeight, expanded, options = {}) {
  if (!expanded) {
    return {
      height: PROMPT_COLLAPSED_HEIGHT,
      overflowY: "hidden"
    };
  }
  const hasImages = Boolean(options?.hasImages);
  const minHeight = hasImages ? PROMPT_IMAGE_EXPANDED_MIN_HEIGHT : PROMPT_COLLAPSED_HEIGHT;
  const maxHeight = promptExpandedMaxHeight(viewportHeight, hasImages);
  const naturalHeight = Math.max(0, Number(scrollHeight || 0));
  const height = Math.max(minHeight, Math.min(naturalHeight, maxHeight));
  return {
    height,
    overflowY: naturalHeight > maxHeight ? "auto" : "hidden"
  };
}
