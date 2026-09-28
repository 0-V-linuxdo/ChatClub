import { t } from "../../shared/i18n.js";
import { moveOrderedIdsByDelta } from "../../shared/app-picker-order.js";
import { createReorderButtons, createSettingsIconAction, createSettingsList } from "../../ui/components.js";
import { el } from "../../ui/dom.js";
import { SETTINGS_SECTIONS } from "./sections.js";
export { SETTINGS_SECTIONS } from "./sections.js";

export function settingsSectionMeta(active) {
  const [id, labelKey, descriptionKey, icon] = SETTINGS_SECTIONS.find(([sectionId]) => sectionId === active) || SETTINGS_SECTIONS[0];
  return { id, label: t(labelKey), description: t(descriptionKey), icon };
}

export function moveListItem(items, sourceId, targetId, placement) {
  if (!sourceId || !targetId || sourceId === targetId) return items;
  const source = items.find((item) => item.id === sourceId);
  if (!source) return items;
  const withoutSource = items.filter((item) => item.id !== sourceId);
  const targetIndex = withoutSource.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return items;
  const insertIndex = targetIndex + (placement === "after" ? 1 : 0);
  return [...withoutSource.slice(0, insertIndex), source, ...withoutSource.slice(insertIndex)];
}

export function moveListItemByDelta(items, sourceId, delta = 0) {
  const list = Array.isArray(items) ? items.slice() : [];
  const ids = list.map((item) => String(item?.id || ""));
  const nextIds = moveOrderedIdsByDelta(ids, sourceId, delta);
  if (nextIds.join("\0") === ids.join("\0")) return list;
  const byId = new Map(list.map((item) => [String(item?.id || ""), item]));
  return nextIds.map((id) => byId.get(id)).filter(Boolean);
}

// A table pane scrolls its `.settings-list-fill`, not `.settings-main`, so a
// redraw that replaces the pane must carry the list offsets across itself.
export function captureSettingsListScroll(root) {
  return Array.from(root?.querySelectorAll?.(".settings-list-fill") || [], (list) => [list.scrollTop, list.scrollLeft]);
}

export function restoreSettingsListScroll(root, offsets = []) {
  root?.querySelectorAll?.(".settings-list-fill").forEach((list, index) => {
    if (!offsets[index]) return;
    [list.scrollTop, list.scrollLeft] = offsets[index];
  });
}

// Filling is only worth it while every table keeps its header and two rows
// (or all of itself when shorter) in view; past that the pane scrolls whole.
export function syncSettingsListFill(main) {
  if (!main?.classList || typeof main.querySelectorAll !== "function") return;
  main.classList.remove("settings-list-fill-off");
  const squeezed = Array.from(main.querySelectorAll(".settings-list-fill")).some((list) => {
    const floor = Array.from(list.children).slice(0, 3).reduce((sum, child) => sum + child.offsetHeight, 0);
    return list.clientHeight + 1 < Math.min(list.scrollHeight, floor);
  });
  main.classList.toggle("settings-list-fill-off", squeezed);
}

export function cleanupSettingsDragRows(selector) {
  document.querySelectorAll(selector).forEach((row) => {
    row.classList.remove("dragging", "drop-before", "drop-after");
  });
}

export function createSettingsKit({ svgIcon }) {
  function settingsBlock(title, description, ...children) {
    return el("section", { class: "ui-card settings-block" },
      title || description
        ? el("div", { class: "ui-card-header settings-block-header" },
          el("div", {},
            el("h4", {}, title),
            description ? el("p", {}, description) : null
          )
        )
        : null,
      el("div", { class: "ui-card-body settings-block-body" }, children)
    );
  }

  function settingsActions(...children) {
    return el("div", { class: "ui-action-row settings-actions" }, children);
  }

  function settingsList(headers, rows, extraClass = "") {
    return createSettingsList({ headers, rows, className: extraClass });
  }

  function settingsIconAction(label, iconName, onClick, extraClass = "", disabled = false, tooltipId = "") {
    return createSettingsIconAction({ label, icon: svgIcon(iconName), onClick, className: `tooltip-trigger ${extraClass}`.trim(), disabled, tooltipId });
  }

  // Explanatory copy that would otherwise fill a callout box lives on this
  // ghost (i) instead: the text is both the tooltip and the accessible name, and
  // `id` lets a control point `aria-describedby` at it. The warning tone keeps a
  // risk note distinguishable from plain help without bringing the box back.
  function settingsInfoButton(help, { tooltipId, id = "", tone = "", placement = "center" } = {}) {
    return el("button", {
      id: id || null,
      class: `settings-info-button tooltip-trigger ${tone === "warning" ? "settings-info-button-warning" : ""}`.trim(),
      type: "button",
      "aria-label": help,
      "data-tooltip": help,
      "data-tooltip-id": tooltipId,
      "data-tooltip-placement": placement,
      "data-tooltip-wrap": "true"
    }, svgIcon("info"));
  }

  function settingsInfoTitle(title, help, options = {}) {
    return el("span", { class: "settings-info-title" },
      el("span", {}, title),
      settingsInfoButton(help, options)
    );
  }

  function settingsPaneToolbar(copy, ...actions) {
    return el("div", { class: "ui-toolbar settings-pane-toolbar" },
      el("p", { class: "settings-pane-lead" }, copy),
      actions.length ? el("div", { class: "ui-toolbar-actions settings-pane-toolbar-actions" }, actions) : null
    );
  }

  function settingsInnerTabs(tabs, activeId, onSelect) {
    return el("div", { class: "settings-inner-tabs", role: "tablist" },
      tabs.map(([id, label, description]) => {
        const active = id === activeId;
        return el("button", {
          class: `settings-inner-tab ${active ? "active" : ""}`,
          type: "button",
          role: "tab",
          "aria-selected": String(active),
          onclick: () => {
            if (active) return;
            onSelect(id);
          }
        },
          el("strong", {}, label),
          description ? el("span", {}, description) : null
        );
      })
    );
  }

  function settingsPrimaryAction(label, iconName, onClick) {
    return el("button", { class: "button button-primary ui-primary-action settings-primary-action", type: "button", onclick: onClick },
      svgIcon(iconName),
      el("span", {}, label)
    );
  }

  function settingsDragHandle(label) {
    return el("span", { class: "settings-drag-handle", title: label, "aria-label": label }, svgIcon("grip"));
  }

  function settingsReorderHandle(label, { ids = [], id = "", onMove } = {}) {
    const list = Array.isArray(ids) ? ids.map((value) => String(value || "")).filter(Boolean) : [];
    const key = String(id || "");
    const index = list.indexOf(key);
    return el("div", { class: "settings-reorder" },
      settingsDragHandle(label),
      createReorderButtons({
        upLabel: t("common.moveUp"),
        downLabel: t("common.moveDown"),
        upIcon: svgIcon("chevronUp"),
        downIcon: svgIcon("chevronDown"),
        canMoveUp: index > 0,
        canMoveDown: index >= 0 && index < list.length - 1,
        onMoveUp: () => onMove?.(-1),
        onMoveDown: () => onMove?.(1)
      })
    );
  }

  function settingsEmptyRow(message) {
    return el("div", { class: "ui-empty-state settings-empty-row" }, message);
  }

  function settingsListDropPlacement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function settingsValueChips(items, emptyLabel) {
    const values = (items || []).filter(Boolean);
    return el("div", { class: "summary-host-chips" },
      values.length
        ? values.map((item) => el("code", {}, item))
        : el("span", { class: "muted" }, emptyLabel)
    );
  }

  return Object.freeze({
    settingsActions,
    settingsBlock,
    settingsDragHandle,
    settingsReorderHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsInfoButton,
    settingsInfoTitle,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction,
    settingsValueChips
  });
}
