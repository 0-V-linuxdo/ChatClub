import { t } from "../../shared/i18n.js";
import { el } from "../../ui/dom.js";
import { createAppearanceOverlayInfoButton } from "./appearance-model-selection-overlay.js";

// The controls are built in appearance.js and labelled here, so both sides
// share these ids: each row's <label for> and each control's
// aria-describedby must name the same node.
export const APPEARANCE_WORKSPACE_FIELD_IDS = Object.freeze({
  themeMode: "appearance-theme-mode",
  primaryColor: "appearance-primary-color",
  primaryColorHelp: "appearance-primary-color-help",
  language: "appearance-language",
  columnCount: "appearance-column-count",
  pocketIconHelp: "appearance-pocket-icon-help",
  clickReorder: "appearance-click-reorder",
  clickReorderHelp: "appearance-click-reorder-help",
  loadingOverlay: "appearance-loading-overlay-enabled",
  loadingOverlayHelp: "appearance-loading-overlay-help",
  modelSelectionOverlay: "appearance-model-selection-overlay-enabled",
  modelSelectionOverlayHelp: "appearance-model-selection-overlay-help"
});

// Workspace is one scrolling page of two cards. It used to be a third tab row
// (General / Color / Overlays) under the Appearance row under the sidebar, so
// eight controls sat behind three clicks and four stacked headings, and the
// Color tab held a single field.
export function createAppearanceWorkspacePane({
  clickReorderControl,
  colorControl,
  columnCount,
  language,
  overlayOpacityControl,
  overlayToggleControl,
  pocketIconControl,
  selectionOverlayControls,
  settingsBlock,
  settingsFieldGrid,
  settingsFieldRow,
  svgIcon,
  themeMode
}) {
  const ids = APPEARANCE_WORKSPACE_FIELD_IDS;
  const generalBlock = settingsBlock(t("appearance.workspaceGeneral"), "",
    settingsFieldGrid(
      settingsFieldRow(t("appearance.themeMode"), themeMode, { htmlFor: ids.themeMode }),
      settingsFieldRow(t("appearance.primaryColor"), colorControl, {
        htmlFor: ids.primaryColor,
        help: t("appearance.primaryColorHelp"),
        helpId: ids.primaryColorHelp
      }),
      settingsFieldRow(t("appearance.language"), language, { htmlFor: ids.language }),
      settingsFieldRow(t("appearance.maxColumns"), columnCount, { htmlFor: ids.columnCount }),
      settingsFieldRow(t("appearance.pocketIcon"), pocketIconControl, {
        help: t("appearance.pocketIconDesc"),
        helpId: ids.pocketIconHelp
      }),
      clickReorderControl
        ? settingsFieldRow(t("appearance.clickReorderButtons"), clickReorderControl, {
          htmlFor: ids.clickReorder,
          help: t("appearance.clickReorderButtonsHelp"),
          helpId: ids.clickReorderHelp
        })
        : null
    )
  );
  // Each overlay row keeps its enable switch beside the opacity it enables,
  // and folds the explanation into the ghost (i) beside its name.
  const overlaysBlock = settingsBlock(t("appearance.workspaceOverlays"), "",
    settingsFieldGrid(
      settingsFieldRow(t("appearance.loadingOverlay"), [overlayToggleControl, overlayOpacityControl], {
        htmlFor: ids.loadingOverlay,
        info: createAppearanceOverlayInfoButton(
          svgIcon,
          t("appearance.loadingOverlayHelp"),
          ids.loadingOverlayHelp,
          "settings.appearance.loadingOverlay"
        )
      }),
      settingsFieldRow(
        t("appearance.modelSelectionOverlay"),
        [selectionOverlayControls.toggleControl, selectionOverlayControls.opacityControl],
        {
          htmlFor: ids.modelSelectionOverlay,
          className: "appearance-overlays-model",
          info: createAppearanceOverlayInfoButton(
            svgIcon,
            `${t("appearance.modelSelectionOverlayHelp")} ${t("appearance.modelSelectionOverlayOpacityHelp")}`,
            ids.modelSelectionOverlayHelp,
            "settings.appearance.modelSelectionOverlay"
          )
        }
      )
    )
  );
  return el("div", { class: "settings-pane appearance-workspace-pane" }, generalBlock, overlaysBlock);
}
