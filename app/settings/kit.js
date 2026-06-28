import { t } from "../../shared/i18n.js";
import { createSettingsIconAction, createSettingsList } from "../../ui/components.js";
import { el } from "../../ui/dom.js";

export const SETTINGS_SECTIONS = [
  ["appearance", "settings.appearance.title", "settings.appearance.desc", "palette"],
  ["profiles", "settings.profiles.title", "settings.profiles.desc", "key"],
  ["apps", "settings.apps.title", "settings.apps.desc", "apps"],
  ["models", "settings.models.title", "settings.models.desc", "model"],
  ["summary", "settings.summary.title", "settings.summary.desc", "summary"],
  ["optimize", "settings.optimize.title", "settings.optimize.desc", "sparkles"],
  ["prompts", "settings.prompts.title", "settings.prompts.desc", "library"],
  ["shortcuts", "settings.shortcuts.title", "settings.shortcuts.desc", "keyboard"],
  ["io", "settings.io.title", "settings.io.desc", "transfer"]
];

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

export function cleanupSettingsDragRows(selector) {
  document.querySelectorAll(selector).forEach((row) => {
    row.classList.remove("dragging", "drop-before", "drop-after");
  });
}

export function createSettingsKit({ svgIcon }) {
  function settingsBlock(title, description, ...children) {
    return el("section", { class: "ui-card settings-block" },
      el("div", { class: "ui-card-header settings-block-header" },
        el("div", {},
          el("h4", {}, title),
          description ? el("p", {}, description) : null
        )
      ),
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

  function settingsEmptyRow(message) {
    return el("div", { class: "ui-empty-state settings-empty-row" }, message);
  }

  function settingsListDropPlacement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  return Object.freeze({
    settingsActions,
    settingsBlock,
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  });
}
