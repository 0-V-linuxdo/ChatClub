import { el } from "../../ui/dom.js";

function restartPreferredModelSelectionOverlayAttention(indicator) {
  if (!indicator) return;
  indicator.classList.remove("preferred-model-selection-overlay-attention");
  void indicator.offsetWidth;
  indicator.classList.add("preferred-model-selection-overlay-attention");
}

function suppressPreferredModelSelectionOverlayInteraction(event) {
  event.preventDefault();
  event.stopPropagation();
}

function handlePreferredModelSelectionOverlayPointerDown(event, indicator) {
  if (event.pointerType !== "touch" && event.button !== 0) return;
  suppressPreferredModelSelectionOverlayInteraction(event);
  restartPreferredModelSelectionOverlayAttention(indicator);
}

export function renderPreferredModelSelectionOverlay() {
  const text = el("div", { class: "preferred-model-selection-overlay-text" });
  const indicator = el("div", { class: "preferred-model-selection-overlay-indicator" },
    el("span", {
      class: "preferred-model-selection-overlay-spinner",
      "aria-hidden": "true"
    }),
    text
  );
  return el("div", {
    class: "preferred-model-selection-overlay",
    role: "note",
    tabindex: "-1",
    hidden: true,
    onpointerdown: (event) => handlePreferredModelSelectionOverlayPointerDown(event, indicator),
    onclick: suppressPreferredModelSelectionOverlayInteraction,
    oncontextmenu: suppressPreferredModelSelectionOverlayInteraction,
    onwheel: suppressPreferredModelSelectionOverlayInteraction
  }, indicator);
}
