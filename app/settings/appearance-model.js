import { TAB_GROUP_HEADER_BUTTONS } from "../../shared/constants.js";
import { moveListItem } from "./kit.js";

export function tabGroupButtonsModeForPlacement(placement) {
  return TAB_GROUP_HEADER_BUTTONS.some((item) => !item.requiredPinned && placement[item.id] === "menu")
    ? "hidden"
    : "pinned";
}

export function tabGroupButtonPlacementValue(value) {
  return value === "menu" || value === "hidden" ? value : "pinned";
}

export function topbarPromptPlaceholderRawText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function topbarPromptPlaceholderPreview(value, limit = 120) {
  const text = topbarPromptPlaceholderRawText(value);
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

export function moveTopbarPromptPlaceholderItems(items, sourceIndex, targetIndex, placement) {
  const sourceId = String(sourceIndex);
  const targetId = String(targetIndex);
  return moveListItem(items.map((text, index) => ({ id: String(index), text })), sourceId, targetId, placement)
    .map((item) => item.text);
}
