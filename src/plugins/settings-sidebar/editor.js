// Settings control: the sidebar entries as a sortable table with a visibility switch per row.

import { h, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";
import { applyLayout, PINNED } from "./layout.js";

let ctxRef = null;
export function setEditorContext(ctx) {
  ctxRef = ctx;
}

export function layoutEditor({ value, setValue }) {
  const box = h("div.cc-sidebar-editor");
  const ctx = ctxRef;
  if (!ctx) return box;
  const t = ctx.t;
  let layout = { order: [...(value?.order ?? [])], hidden: [...(value?.hidden ?? [])] };
  const save = (next) => {
    layout = next;
    setValue(next.order.length || next.hidden.length ? next : null);
    render();
  };
  const render = () => {
    const sections = ctx.extensionPoint("settings.section");
    const rows = applyLayout(sections.sorted(), layout, { includeHidden: true }).filter((e) => e.id !== PINNED);
    const hidden = new Set(layout.hidden);
    const table = settingsTable({
      t,
      rows,
      moveButtons: reorderButtonsOn(ctx.host),
      onReorder: (ids) => save({ ...layout, order: ids }),
      columns: [
        { label: t("settingsSidebar.col.section"), render: (e) => h("span.cc-sidebar-editor-name", icon(e.icon ?? "settings", { size: 15 }), h("span", e.titleKey ? t(e.titleKey) : e.id)) },
        { label: t("settingsSidebar.col.visible"), width: "72px", className: "cc-sidebar-editor-switch", render: (e) => ui.toggleSwitch({
          checked: !hidden.has(e.id),
          label: t("settingsSidebar.col.visible"),
          onChange: (on) => save({ ...layout, hidden: on ? layout.hidden.filter((id) => id !== e.id) : [...layout.hidden, e.id] }),
        }) },
      ],
      // Move buttons only render in the actions column.
      actions: reorderButtonsOn(ctx.host) ? () => [] : null,
      actionsWidth: "80px",
    });
    box.replaceChildren(table);
  };
  render();
  return box;
}
