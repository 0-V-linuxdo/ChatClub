// Sortable settings table (v2 06 §1.2 sizes, §1.4 ordering): drag the row handle to reorder;
// optional move up / down buttons while the MoveButtons plugin is on.

import { h, icon } from "./dom.js";
import * as ui from "./ui.js";

const DRAG_THRESHOLD = 4;

export const TABLE_STYLE = String.raw`
.cc-stable { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.cc-stable-head, .cc-stable-row { display: grid; grid-template-columns: var(--cols); align-items: center; column-gap: 0; }
.cc-stable-head { min-height: 36px; background: var(--panel-2); color: var(--muted); font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--line); }
.cc-stable-head > div, .cc-stable-row > div { padding: 0 12px; min-width: 0; }
.cc-stable-row { position: relative; min-height: 56px; border-bottom: 1px solid var(--line); background: var(--panel); }
.cc-stable-row:last-child { border-bottom: 0; }
.cc-stable-row.dragging { opacity: .5; }
.cc-stable-row.drop-before::before, .cc-stable-row.drop-after::after { content: ""; position: absolute; left: 8px; right: 8px; height: 2px; background: var(--primary); }
.cc-stable-row.drop-before::before { top: -1px; }
.cc-stable-row.drop-after::after { bottom: -1px; }
.cc-stable .grip { cursor: grab; color: var(--muted); display: inline-flex; padding: 6px 0; touch-action: none; }
.cc-stable .actions { display: flex; justify-content: flex-end; gap: 4px; }
.cc-stable .actions .cc-icon-btn { width: 32px; height: 32px; }
.cc-stable .cell-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-stable-empty { padding: 24px; text-align: center; color: var(--muted); }
.cc-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; margin: 2px 4px 2px 0; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--line); font-size: 12px; font-weight: 600; }
.cc-section-toolbar { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.cc-section-toolbar .desc { flex: 1; color: var(--muted); font-size: var(--fs-small); }
`;

/**
 * columns: [{ label, width = "1fr", render(row, index) -> Node|string, className }]
 * rows: data rows; key(row) -> id; onReorder(ids) saves a new order (immediately).
 * actions(row, index) -> Node[]; actionsWidth: grid width of the actions column; moveButtons: bool; empty: text; t: translate.
 */
export function settingsTable({ columns, rows, key = (r) => r.id, onReorder, actions, actionsWidth = "auto", moveButtons = false, empty = "", t = (k) => k }) {
  const sortable = typeof onReorder === "function";
  const cols = [sortable ? "40px" : null, ...columns.map((c) => c.width ?? "1fr"), actions ? actionsWidth : null].filter(Boolean).join(" ");
  const table = h("div.cc-stable", { style: { "--cols": cols } });
  table.append(h("div.cc-stable-head", sortable ? h("div") : null, columns.map((c) => h("div", c.label ?? "")), actions ? h("div", { style: { textAlign: "right" } }, t("settings.table.actions")) : null));
  if (!rows.length) {
    table.append(h("div.cc-stable-empty", empty));
    return table;
  }
  const ids = rows.map(key);
  const move = (from, to) => {
    if (to < 0 || to >= ids.length || from === to) return;
    const next = [...ids];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    onReorder(next);
  };
  rows.forEach((row, index) => {
    const el = h("div.cc-stable-row", { dataset: { key: ids[index] } });
    if (sortable) {
      const grip = h("span.grip", { attrs: { "aria-label": t("settings.table.drag"), role: "button", tabindex: "-1" } }, icon("grip", { size: 16 }));
      grip.addEventListener("pointerdown", (event) => startDrag(event, el, index));
      el.append(h("div", grip));
    }
    for (const c of columns) {
      const content = c.render(row, index);
      el.append(h("div", { class: c.className ?? "" }, content ?? ""));
    }
    if (actions) {
      const box = h("div.actions");
      if (sortable && moveButtons) {
        box.append(
          ui.iconButton({ icon: "chevronUp", label: t("settings.table.moveUp"), disabled: index === 0, onClick: () => move(index, index - 1) }),
          ui.iconButton({ icon: "chevronDown", label: t("settings.table.moveDown"), disabled: index === rows.length - 1, onClick: () => move(index, index + 1) }));
      }
      box.append(...(actions(row, index) ?? []).filter(Boolean));
      el.append(box);
    }
    table.append(el);
  });

  function startDrag(event, el, from) {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = event.clientY;
    let dragging = false;
    let target = null;
    const rowsEls = () => [...table.querySelectorAll(".cc-stable-row")];
    const marks = () => rowsEls().forEach((r) => r.classList.remove("drop-before", "drop-after", "dragging"));
    const onMove = (e) => {
      if (!dragging && Math.abs(e.clientY - start) < DRAG_THRESHOLD) return;
      dragging = true;
      marks();
      el.classList.add("dragging");
      const list = rowsEls();
      target = list.length;
      for (let i = 0; i < list.length; i += 1) {
        const r = list[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          target = i;
          break;
        }
      }
      if (target < list.length) list[target].classList.add("drop-before");
      else list[list.length - 1].classList.add("drop-after");
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      marks();
      if (!dragging || target === null) return;
      let to = target;
      if (to > from) to -= 1;
      move(from, to);
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }
  return table;
}

/** Whether sortable lists show move up / down buttons: the MoveButtons plugin is on. */
export const reorderButtonsOn = (host) => !!host.isPluginEnabled?.("MoveButtons");
