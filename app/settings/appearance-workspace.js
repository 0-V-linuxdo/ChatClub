import { t } from "../../shared/i18n.js";
import { el, field } from "../../ui/dom.js";
import { createAppearanceOverlayInfoButton } from "./appearance-model-selection-overlay.js";

export const APPEARANCE_WORKSPACE_TAB_IDS = Object.freeze(["general", "color", "overlays"]);
const WORKSPACE_PANEL_ID = "appearance-workspace-panel";
const workspaceTabId = (id) => `appearance-workspace-tab-${id}`;
const LOADING_OVERLAY_HELP_ID = "appearance-loading-overlay-help";
const MODEL_OVERLAY_OPACITY_HELP_ID = "appearance-model-selection-overlay-opacity-help";

export function createAppearanceWorkspacePane({
  activeId,
  clickReorderControl,
  colorControl,
  columnCount,
  language,
  onSelect,
  overlayOpacityControl,
  pocketIconControl,
  selectionOverlayControls,
  settingsBlock,
  settingsInnerTabs,
  svgIcon,
  themeMode
}) {
  const appearanceRow = (node) => el("div", { class: "appearance-field-row" }, node);
  const generalCol = (...rows) => el("div", { class: "appearance-general-col" }, ...rows);
  const overlayRangeRow = (title, info, control, extraClass = "") => appearanceRow(
    el("div", { class: extraClass ? `appearance-overlay-row ${extraClass}` : "appearance-overlay-row" },
      el("span", { class: "appearance-overlay-copy" },
        el("strong", {}, title),
        info
      ),
      control
    )
  );
  const generalBlock = () => settingsBlock(
    t("appearance.workspaceGeneral"),
    t("appearance.workspaceGeneralTabDesc"),
    el("div", { class: "appearance-field-list" },
      generalCol(
        appearanceRow(field(t("appearance.themeMode"), themeMode)),
        appearanceRow(field(t("appearance.language"), language)),
        appearanceRow(field(t("appearance.maxColumns"), columnCount))
      ),
      generalCol(
        appearanceRow(pocketIconControl),
        clickReorderControl ? appearanceRow(clickReorderControl) : null
      )
    )
  );
  const colorBlock = () => settingsBlock(
    t("appearance.workspaceColor"),
    t("appearance.workspaceColorTabDesc"),
    el("div", { class: "appearance-field-list" },
      appearanceRow(field(t("appearance.primaryColor"), colorControl))
    )
  );
  const overlaysBlock = () => settingsBlock(
    t("appearance.workspaceOverlays"),
    t("appearance.workspaceOverlaysTabDesc"),
    el("div", { class: "appearance-field-list" },
      overlayRangeRow(
        t("appearance.loadingOverlay"),
        createAppearanceOverlayInfoButton(
          svgIcon,
          t("appearance.loadingOverlayHelp"),
          LOADING_OVERLAY_HELP_ID,
          "settings.appearance.loadingOverlay"
        ),
        overlayOpacityControl
      ),
      el("div", { class: "appearance-overlays-model" },
        appearanceRow(selectionOverlayControls.toggleControl),
        overlayRangeRow(
          t("appearance.modelSelectionOverlayOpacity"),
          createAppearanceOverlayInfoButton(
            svgIcon,
            t("appearance.modelSelectionOverlayOpacityHelp"),
            MODEL_OVERLAY_OPACITY_HELP_ID,
            "settings.appearance.modelSelectionOverlayOpacity"
          ),
          selectionOverlayControls.opacityControl,
          "appearance-overlays-child"
        )
      )
    )
  );
  const activeBlock = activeId === "color"
    ? colorBlock()
    : activeId === "overlays"
      ? overlaysBlock()
      : generalBlock();
  const selectAndRestoreFocus = (id) => {
    onSelect(id);
    document.querySelector?.(
      `[data-appearance-workspace-tab-id="${id}"]`
    )?.focus?.({ preventScroll: true });
  };
  const tabs = settingsInnerTabs([
    ["general", t("appearance.workspaceGeneral"), t("appearance.workspaceGeneralTabDesc")],
    ["color", t("appearance.workspaceColor"), t("appearance.workspaceColorTabDesc")],
    ["overlays", t("appearance.workspaceOverlays"), t("appearance.workspaceOverlaysTabDesc")]
  ], activeId, selectAndRestoreFocus);
  tabs.setAttribute("aria-label", t("appearance.workspaceTabsLabel"));
  Array.from(tabs.children).forEach((tab, index) => {
    const id = APPEARANCE_WORKSPACE_TAB_IDS[index];
    tab.id = workspaceTabId(id);
    tab.dataset.appearanceWorkspaceTabId = id;
    tab.setAttribute("tabindex", id === activeId ? "0" : "-1");
    tab.setAttribute("aria-controls", WORKSPACE_PANEL_ID);
    tab.addEventListener("keydown", (event) => {
      const currentIndex = APPEARANCE_WORKSPACE_TAB_IDS.indexOf(id);
      let nextIndex = currentIndex;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + APPEARANCE_WORKSPACE_TAB_IDS.length) % APPEARANCE_WORKSPACE_TAB_IDS.length;
      else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % APPEARANCE_WORKSPACE_TAB_IDS.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = APPEARANCE_WORKSPACE_TAB_IDS.length - 1;
      else return;
      event.preventDefault();
      const nextId = APPEARANCE_WORKSPACE_TAB_IDS[nextIndex];
      if (nextId === activeId) tab.focus?.();
      else selectAndRestoreFocus(nextId);
    });
  });
  return el("div", { class: "settings-pane appearance-workspace-pane" },
    tabs,
    el("div", {
      id: WORKSPACE_PANEL_ID,
      class: `appearance-workspace-subpane is-${activeId}`,
      role: "tabpanel",
      tabindex: "0",
      "aria-labelledby": workspaceTabId(activeId)
    }, activeBlock)
  );
}
