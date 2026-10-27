// Drag-and-drop zones for button placement settings (06 §3.4, §3.5): items are chips that move between
// zones (e.g. pinned / folded into More / hidden) and reorder inside one. Keyboard: Left/Right reorder,
// Up/Down move to the previous / next zone. A `locked` item stays in its zone.

import { h, icon, clear } from "./dom.js";

export const ZONE_BOARD_STYLE = String.raw`
.cc-zones-desc { margin: 0 0 10px; color: var(--muted); font-size: var(--fs-small, 12px); }
.cc-zones { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.cc-zone { border: 1px dashed var(--line); border-radius: var(--radius); padding: 8px; background: var(--panel); }
.cc-zone.over { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 6%, var(--panel)); }
.cc-zone-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; font-weight: var(--fw-semibold); }
.cc-zone-head .note { font-weight: normal; color: var(--muted); font-size: var(--fs-small, 12px); }
.cc-zone-items { display: flex; flex-wrap: wrap; gap: 6px; min-height: 32px; align-items: center; }
.cc-zone-empty { color: var(--muted); font-size: var(--fs-small, 12px); padding: 0 4px; }
.cc-zone-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel-2, var(--panel)); cursor: grab; user-select: none; font-size: var(--fs-body); }
.cc-zone-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
.cc-zone-chip.locked { cursor: default; opacity: .85; }
.cc-zone-chip.dragging { opacity: .4; }
.cc-zone-chip.drop-before { box-shadow: -3px 0 0 var(--primary); }
.cc-zone-chip .lock { color: var(--muted); }
`;

/**
 * @param {object} o
 * @param {{id: string, label: string, note?: string}[]} o.zones
 * @param {{id: string, label: string, icon?: string, locked?: string}[]} o.items  locked = the zone it must stay in
 * @param {(id: string) => string} o.zoneOf current zone of an item
 * @param {string[]} o.order current order of item ids
 * @param {(placement: Record<string, string>, order: string[]) => void} o.onChange
 * @param {string} [o.emptyText]
 * @param {string} [o.lockedTip]
 */
export function zoneBoard({ zones, items, zoneOf, order, onChange, emptyText = "", lockedTip = "" }) {
  const zoneIds = zones.map((z) => z.id);
  const placement = {};
  for (const item of items) {
    const z = item.locked ?? zoneOf(item.id);
    placement[item.id] = zoneIds.includes(z) ? z : zoneIds[0];
  }
  const pos = new Map((order ?? []).map((id, i) => [id, i]));
  let sequence = items.map((it, i) => ({ id: it.id, rank: pos.has(it.id) ? pos.get(it.id) : 1000 + i })).sort((a, b) => a.rank - b.rank).map((x) => x.id);
  const byId = new Map(items.map((it) => [it.id, it]));
  const root = h("div.cc-zones");
  let dragId = null;

  const commit = (focusId) => {
    onChange({ ...placement }, [...sequence]);
    render();
    if (focusId) root.querySelector(`[data-item-id="${CSS.escape(focusId)}"]`)?.focus();
  };
  const moveTo = (id, zone, beforeId = null) => {
    if (byId.get(id)?.locked) return;
    placement[id] = zone;
    sequence = sequence.filter((x) => x !== id);
    const at = beforeId ? sequence.indexOf(beforeId) : -1;
    if (at >= 0) sequence.splice(at, 0, id);
    else {
      // After the last item of the target zone keeps zones visually grouped.
      const last = sequence.reduce((acc, x, i) => (placement[x] === zone ? i : acc), -1);
      sequence.splice(last + 1, 0, id);
    }
  };

  const chip = (item) => {
    const el = h("span.cc-zone-chip", {
      class: item.locked ? "locked" : "",
      attrs: { tabindex: "0", role: "button", draggable: item.locked ? "false" : "true", "aria-roledescription": "draggable", "data-item-id": item.id, ...(item.locked && lockedTip ? { "data-tip": lockedTip } : {}) },
    }, item.icon ? icon(item.icon, { size: 14 }) : null, h("span", item.label), item.locked ? h("span.lock", icon("pin", { size: 12 })) : null);
    el.addEventListener("dragstart", (e) => {
      if (item.locked) return e.preventDefault();
      dragId = item.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      el.classList.remove("dragging");
      root.querySelectorAll(".over, .drop-before").forEach((n) => n.classList.remove("over", "drop-before"));
    });
    el.addEventListener("dragover", (e) => {
      if (!dragId || dragId === item.id) return;
      e.preventDefault();
      root.querySelectorAll(".drop-before").forEach((n) => n.classList.remove("drop-before"));
      el.classList.add("drop-before");
    });
    el.addEventListener("drop", (e) => {
      if (!dragId || dragId === item.id) return;
      e.preventDefault();
      e.stopPropagation();
      moveTo(dragId, placement[item.id], item.id);
      commit();
    });
    el.addEventListener("keydown", (e) => {
      if (item.locked) return;
      const zoneIdx = zoneIds.indexOf(placement[item.id]);
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const next = zoneIds[zoneIdx + (e.key === "ArrowUp" ? -1 : 1)];
        if (!next) return;
        e.preventDefault();
        moveTo(item.id, next);
        commit(item.id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const same = sequence.filter((x) => placement[x] === placement[item.id]);
        const i = same.indexOf(item.id);
        const j = i + (e.key === "ArrowLeft" ? -1 : 1);
        if (j < 0 || j >= same.length) return;
        e.preventDefault();
        const a = sequence.indexOf(item.id);
        const b = sequence.indexOf(same[j]);
        [sequence[a], sequence[b]] = [sequence[b], sequence[a]];
        commit(item.id);
      }
    });
    return el;
  };

  const render = () => {
    clear(root);
    for (const zone of zones) {
      const list = h("div.cc-zone-items");
      const ids = sequence.filter((id) => placement[id] === zone.id);
      for (const id of ids) list.append(chip(byId.get(id)));
      if (!ids.length) list.append(h("span.cc-zone-empty", emptyText));
      const box = h("div.cc-zone", { dataset: { zone: zone.id } }, h("div.cc-zone-head", h("span", zone.label), zone.note ? h("span.note", zone.note) : null), list);
      box.addEventListener("dragover", (e) => {
        if (!dragId) return;
        e.preventDefault();
        box.classList.add("over");
      });
      box.addEventListener("dragleave", (e) => {
        if (!box.contains(e.relatedTarget)) box.classList.remove("over");
      });
      box.addEventListener("drop", (e) => {
        if (!dragId) return;
        e.preventDefault();
        moveTo(dragId, zone.id);
        commit();
      });
      root.append(box);
    }
  };
  render();
  return root;
}
