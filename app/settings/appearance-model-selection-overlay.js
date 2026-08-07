import { t } from "../../shared/i18n.js";
import { normalizeModelPreferenceSelectionOverlayOpacity } from "../../shared/storage-schema.js";
import { el } from "../../ui/dom.js";

const TOGGLE_HELP_ID = "appearance-model-selection-overlay-help";
const OPACITY_HELP_ID = "appearance-model-selection-overlay-opacity-help";

export function createModelSelectionOverlayAppearanceControls(dependencies = {}) {
  const {
    state,
    queueAppearanceAutoSave,
    syncPreferredModelSelectionOverlays,
    redraw
  } = dependencies;
  const enabled = state.options.modelPreferenceSelectionOverlayEnabled !== false;
  const toggle = el("input", {
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
    "aria-describedby": OPACITY_HELP_ID,
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
    toggleControl: el("label", { class: "appearance-toggle-control" },
      el("span", { class: "appearance-toggle-copy" },
        el("strong", {}, t("appearance.modelSelectionOverlay")),
        el("small", { id: TOGGLE_HELP_ID }, t("appearance.modelSelectionOverlayHelp"))
      ),
      toggle
    ),
    opacityControl: el("div", { class: "appearance-range-control" },
      opacitySlider,
      opacityValue,
      el("small", { id: OPACITY_HELP_ID, class: "appearance-range-help" }, t("appearance.modelSelectionOverlayOpacityHelp"))
    )
  });
}
