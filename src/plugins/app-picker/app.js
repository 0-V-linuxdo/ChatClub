// AppPicker: the large app picker used by "add group" and "add app" (v2 02 §7).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { appIconImg } from "../../lib/app-icon.js";
import { SECTION_IDS } from "./index.js";
import { reorderButtonsOn } from "../../lib/settings-table.js";

const DRAG_THRESHOLD = 6;

/** Picker width (02 §7.1). */
export function pickerWidth(vw) {
  if (vw < 760) return Math.max(320, vw - 16);
  return Math.min(1680, Math.max(880, vw - 32));
}

/** Sorts ids by a stored order; unknown ids keep their catalog order after the known ones. */
export function applyOrder(items, order, key = (x) => x.id) {
  const pos = new Map((Array.isArray(order) ? order : []).map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, rank: pos.has(key(item)) ? pos.get(key(item)) : 10000 + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.item);
}

/** Groups apps into picker sections; built-ins whose host a custom app also uses are hidden. */
export function buildSections(apps) {
  const customHosts = new Set(apps.filter((a) => !a.builtin).flatMap((a) => a.hosts ?? []));
  const sections = Object.fromEntries(SECTION_IDS.map((id) => [id, []]));
  for (const app of apps) {
    if (!app.builtin) {
      sections.custom.push(app);
      continue;
    }
    if ((app.hosts ?? []).some((host) => customHosts.has(host))) continue;
    const section = sections[app.section] ? app.section : "aggregator";
    sections[section].push(app);
  }
  return sections;
}

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const apps = ctx.services.get("apps");
    const workspace = () => ctx.services.get("workspace");
    let open = null;

    const sectionOrder = () => {
      const stored = Array.isArray(ctx.settings.appPickerSectionOrder) ? ctx.settings.appPickerSectionOrder.filter((id) => SECTION_IDS.includes(id)) : [];
      return [...stored, ...SECTION_IDS.filter((id) => !stored.includes(id))];
    };
    const appOrder = (section) => ctx.settings.appPickerAppOrders?.[section] ?? [];
    const saveAppOrder = (section, ids) => (ctx.settings.appPickerAppOrders = { ...(ctx.settings.appPickerAppOrders ?? {}), [section]: ids });
    const showMove = () => reorderButtonsOn(ctx.host);

    /** Generic pointer drag inside a container: returns the new index or null. */
    const makeSortable = (container, itemSelector, axis, onDrop) => {
      container.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const handle = event.target.closest(itemSelector);
        if (!handle || !container.contains(handle) || event.target.closest(".moves, .cc-compact-btn")) return;
        const items = () => [...container.querySelectorAll(`:scope > ${itemSelector}`)];
        const from = items().indexOf(handle);
        if (from < 0) return;
        const start = { x: event.clientX, y: event.clientY };
        let dragging = false;
        let target = null;
        const clearMarks = () => items().forEach((el) => el.classList.remove("drop-before", "drop-after", "dragging"));
        const move = (e) => {
          if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
          dragging = true;
          clearMarks();
          handle.classList.add("dragging");
          const list = items();
          target = list.length;
          for (let i = 0; i < list.length; i += 1) {
            const r = list[i].getBoundingClientRect();
            const mid = axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2;
            if ((axis === "x" ? e.clientX : e.clientY) < mid) {
              target = i;
              break;
            }
          }
          if (target < list.length) list[target].classList.add("drop-before");
          else list[list.length - 1]?.classList.add("drop-after");
        };
        const up = () => {
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", up, true);
          window.removeEventListener("pointercancel", cancel, true);
          clearMarks();
          if (!dragging) return;
          // Swallow the click that ends a drag.
          window.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
          }, { capture: true, once: true });
          let to = target;
          if (to > from) to -= 1;
          if (to !== from && to !== null) onDrop(from, to);
        };
        const cancel = () => {
          dragging = false;
          up();
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", cancel, true);
      });
    };

    const moveIn = (list, from, to) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    };

    const openPicker = (anchor, onPick) => {
      if (open) {
        const same = open.anchor === anchor;
        open.close();
        open = null;
        if (same) return; // clicking the trigger again closes it
      }
      const vw = window.innerWidth;
      const width = pickerWidth(vw);
      const rect = anchor?.getBoundingClientRect?.() ?? { left: 16, bottom: 52 };
      const state = shellUi.openPopover({
        anchor,
        className: "cc-app-picker",
        onClose: () => {
          if (open === state) open = null;
        },
        render: ({ close, el, reposition }) => {
          el.style.width = `${width}px`;
          const grid = h("div.cc-app-picker-grid");
          const render = () => {
            clear(grid);
            const sections = buildSections(apps.list());
            const order = sectionOrder();
            order.forEach((sectionId, sIndex) => {
              const list = applyOrder(sections[sectionId], appOrder(sectionId));
              if (sectionId !== "custom" && !list.length) return;
              const head = h("div.cc-app-section-head", h("span", t(`picker.section.${sectionId}`)), h("span.grow"));
              if (showMove()) {
                head.append(
                  ui.iconButton({ icon: "chevronLeft", compact: true, label: t("picker.moveLeft"), disabled: sIndex === 0, onClick: () => {
                    ctx.settings.appPickerSectionOrder = moveIn(order, sIndex, sIndex - 1);
                    render();
                  } }),
                  ui.iconButton({ icon: "chevronRight", compact: true, label: t("picker.moveRight"), disabled: sIndex === order.length - 1, onClick: () => {
                    ctx.settings.appPickerSectionOrder = moveIn(order, sIndex, sIndex + 1);
                    render();
                  } }),
                );
              }
              if (sectionId === "custom") {
                const editor = ctx.services.get("appSettings");
                if (editor?.openCustomAppEditor) {
                  head.append(ui.button({ label: t("picker.addCustom"), icon: "plus", variant: "ghost", onClick: () => {
                    close();
                    editor.openCustomAppEditor();
                  } }));
                }
              }
              const rows = h("div.cc-app-rows");
              list.forEach((app, aIndex) => {
                const row = h("button.cc-app-row", { type: "button", dataset: { appId: app.id } },
                  appIconImg(ctx.host, app),
                  h("span.name", app.name),
                  app.builtin && app.provider && app.provider !== app.name ? h("span.provider", app.provider) : null);
                if (showMove()) {
                  const ids = list.map((a) => a.id);
                  row.append(h("span.moves",
                    ui.iconButton({ icon: "chevronUp", compact: true, label: t("picker.moveUp"), disabled: aIndex === 0, onClick: (e) => {
                      e.stopPropagation();
                      saveAppOrder(sectionId, moveIn(ids, aIndex, aIndex - 1));
                      render();
                    } }),
                    ui.iconButton({ icon: "chevronDown", compact: true, label: t("picker.moveDown"), disabled: aIndex === list.length - 1, onClick: (e) => {
                      e.stopPropagation();
                      saveAppOrder(sectionId, moveIn(ids, aIndex, aIndex + 1));
                      render();
                    } })));
                }
                row.addEventListener("click", () => {
                  close();
                  onPick(app.id);
                });
                rows.append(row);
              });
              if (sectionId === "custom" && !list.length) rows.append(h("div.cc-empty", { style: { padding: "8px", color: "var(--muted)" } }, t("picker.emptyCustom")));
              makeSortable(rows, ".cc-app-row", "y", (from, to) => {
                saveAppOrder(sectionId, moveIn(list.map((a) => a.id), from, to));
                render();
              });
              grid.append(h("section.cc-app-section", { dataset: { section: sectionId } }, head, rows));
            });
          };
          render();
          makeSortable(grid, ".cc-app-section", "x", (from, to) => {
            const visible = [...grid.querySelectorAll(":scope > .cc-app-section")].map((s) => s.dataset.section);
            const nextVisible = moveIn(visible, from, to);
            const hidden = sectionOrder().filter((id) => !visible.includes(id));
            ctx.settings.appPickerSectionOrder = [...nextVisible, ...hidden];
            render();
          });
          queueMicrotask(() => {
            el.style.left = `${Math.max(8, Math.min(rect.left - 28, vw - width - 8))}px`;
            el.style.top = `${rect.bottom + 6}px`;
            el.style.maxHeight = `${window.innerHeight - rect.bottom - 6 - 12}px`;
            el.querySelector(".cc-app-row")?.focus({ preventScroll: true });
          });
          void reposition;
          return grid;
        },
      });
      state.anchor = anchor;
      open = state;
      // Scrolling the page also closes it (02 §7.2).
      const onScroll = (event) => {
        if (state.menu.contains(event.target)) return;
        state.close();
      };
      window.addEventListener("scroll", onScroll, true);
      const prevClose = state.close;
      state.close = () => {
        window.removeEventListener("scroll", onScroll, true);
        prevClose();
      };
    };

    const addGroupFlow = (anchor) => openPicker(anchor, (appId) => workspace()?.addGroup(appId));

    ctx.contribute("topbar.item", {
      id: "addGroup",
      labelKey: "picker.addGroup",
      icon: "plus",
      shortcutAction: "openAppPicker",
      // Doubles as a drop target for dragged tabs (02 §5).
      dataset: { wsDrop: "new-group" },
      onClick: ({ anchor }) => addGroupFlow(anchor),
    });
    ctx.contribute("tabGroup.button", {
      id: "addApp",
      icon: "plus",
      labelKey: "picker.addApp",
      defaultPlacement: "pinned",
      order: 0,
      onClick: (g) => openPicker(g.anchor, (appId) => workspace()?.addTab(g.groupId, appId)),
    });
    ctx.contribute("shortcut.action", {
      id: "openAppPicker",
      labelKey: "picker.shortcut",
      run: () => {
        const el = ctx.services.get("topbar")?.itemElement?.("addGroup");
        const btn = el?.matches?.("button") ? el : el?.querySelector?.("button");
        addGroupFlow(btn ?? document.querySelector(".cc-topbar"));
      },
    });

    ctx.services.provide("appPicker", { open: openPicker });
  },
};
