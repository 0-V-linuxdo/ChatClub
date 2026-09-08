import { t } from "../../shared/i18n.js";
import { normalizeModelPreferenceSelectionOverlayOpacity } from "../../shared/storage-schema.js";
import { el } from "../../ui/dom.js";

const TOGGLE_HELP_ID = "appearance-model-selection-overlay-help";
const TOGGLE_INPUT_ID = "appearance-model-selection-overlay-enabled";

export function createAppearanceOverlayInfoButton(svgIcon, help, helpId, tooltipId) {
  return el("button", {
    id: helpId,
    class: "appearance-overlay-info tooltip-trigger",
    type: "button",
    "aria-label": help,
    "data-tooltip": help,
    "data-tooltip-id": tooltipId,
    "data-tooltip-placement": "top",
    "data-tooltip-wrap": "true"
  }, svgIcon("info"));
}

export function createModelSelectionOverlayAppearanceControls(dependencies = {}) {
  const {
    state,
    queueAppearanceAutoSave,
    syncPreferredModelSelectionOverlays,
    redraw
  } = dependencies;
  const enabled = state.options.modelPreferenceSelectionOverlayEnabled !== false;
  const toggle = el("input", {
    id: TOGGLE_INPUT_ID,
    type: "checkbox",
    role: "switch",
    checked: enabled,
    "aria-label": t("appearance.modelSelectionOverlay"),
    "aria-describedby": TOGGLE_HELP_ID
  });
  toggle.checked = enabled;
  const opacityDraft = normalizeModelPreferenceSelectionOverlayOpacity(
    state.options.modelPreferenceSelectionOverlayOpacity
  );
  const opacityValue = el("span", { class: "appearance-range-value" }, `${opacityDraft}%`);
  const opacitySlider = el("input", {
    class: "appearance-range-slider",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(opacityDraft),
    disabled: !enabled,
    "aria-label": t("appearance.modelSelectionOverlayOpacity"),
    "aria-describedby": TOGGLE_HELP_ID,
    "aria-valuetext": `${opacityDraft}%`
  });
  const syncOpacity = () => {
    const nextOpacity = normalizeModelPreferenceSelectionOverlayOpacity(opacitySlider.value, opacityDraft);
    opacitySlider.value = String(nextOpacity);
    opacitySlider.setAttribute("aria-valuetext", `${nextOpacity}%`);
    opacityValue.textContent = `${nextOpacity}%`;
    queueAppearanceAutoSave({ modelPreferenceSelectionOverlayOpacity: nextOpacity }, {
      optimistic: true,
      onPreview: () => {
        document.documentElement.style.setProperty(
          "--preferred-model-selection-overlay-opacity",
          String(nextOpacity / 100)
        );
        syncPreferredModelSelectionOverlays();
      },
      redrawOnError: redraw
    });
  };
  opacitySlider.addEventListener("input", syncOpacity);
  opacitySlider.addEventListener("change", syncOpacity);
  toggle.addEventListener("change", () => {
    const nextEnabled = toggle.checked;
    opacitySlider.disabled = !nextEnabled;
    queueAppearanceAutoSave({ modelPreferenceSelectionOverlayEnabled: nextEnabled }, {
      optimistic: true,
      onPreview: syncPreferredModelSelectionOverlays,
      redrawOnError: redraw
    });
  });

  return Object.freeze({
    toggleControl: el("span", { class: "appearance-toggle-control" }, toggle),
    opacityControl: el("div", { class: "appearance-range-control" },
      opacitySlider,
      opacityValue
    )
  });
}
