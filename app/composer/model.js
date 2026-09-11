export const PROMPT_COLLAPSED_HEIGHT = 40;
const PROMPT_TEXT_EXPANDED_MAX_HEIGHT = 180;

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

export function promptCollapsedHeightFor(node) {
  const shell = node?.classList?.contains?.("prompt-shell") ? node : node?.closest?.(".prompt-shell");
  if (shell && typeof getComputedStyle === "function") {
    try {
      const value = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--prompt-collapsed-height"));
      if (Number.isFinite(value) && value > 0) return value;
    } catch {}
  }
  return PROMPT_COLLAPSED_HEIGHT;
}

function promptExpandedMaxHeight(viewportHeight = 0) {
  return Math.min(PROMPT_TEXT_EXPANDED_MAX_HEIGHT, Math.max(88, Math.round(Number(viewportHeight || 0) * 0.36)));
}

export function promptComposeShouldStack({
  empty,
  expanded,
  search,
  naturalHeight,
  collapsedHeight,
  value
} = {}) {
  if (empty === true || expanded !== true || search === true) return false;
  if (String(value || "").includes("\n")) return true;
  const collapsed = Number(collapsedHeight) > 0 ? Number(collapsedHeight) : PROMPT_COLLAPSED_HEIGHT;
  return Number(naturalHeight || 0) > collapsed + 8;
}

// Attached images render as their own in-flow strip above the input line, so
// the textarea itself sizes from its text alone in every mode.
// Empty focused/expanded compose must stay on the collapsed token: Chromium
// still lays out a wrapping native placeholder and inflates scrollHeight.
export function promptInputHeight(scrollHeight, viewportHeight, expanded, options = {}) {
  const collapsedHeight = Number(options.collapsedHeight) > 0
    ? Number(options.collapsedHeight)
    : PROMPT_COLLAPSED_HEIGHT;
  if (!expanded || options.empty === true) {
    return {
      height: collapsedHeight,
      overflowY: "hidden"
    };
  }
  const minHeight = collapsedHeight;
  const maxHeight = promptExpandedMaxHeight(viewportHeight);
  const naturalHeight = Math.max(0, Number(scrollHeight || 0));
  const height = Math.max(minHeight, Math.min(naturalHeight, maxHeight));
  return {
    height,
    overflowY: naturalHeight > maxHeight ? "auto" : "hidden"
  };
}
