// TabDragDrop: drag a tab within its strip, into another column, onto "new group", or drag a
// single-tab column sideways to reorder columns (02 §5).

const DRAG_THRESHOLD = 6;
const MARKS = ["drop-left", "drop-right", "drop-target", "drop-before", "drop-after", "dragging-col", "drag-ghost"];

export default {
  start(ctx) {
    const workspace = ctx.services.get("workspace");
    const root = workspace?.root;
    if (!root) return;

    const columns = () => [...root.querySelectorAll(".cc-ws-col")];
    const colOf = (groupId) => columns().find((col) => col.dataset.groupId === groupId) ?? null;
    const tabEls = (col) => [...(col?.querySelectorAll(".cc-ws-tabs .cc-ws-tab") ?? [])];
    const tabEl = (tabId) => root.querySelector(`.cc-ws-tab[data-tab-id="${CSS.escape(tabId)}"]`);
    const tabCount = (groupId) => workspace.groups().find((g) => g.id === groupId)?.tabs.length ?? 0;

    let dragState = null;

    const clearDropMarks = () => {
      root.querySelectorAll(MARKS.map((m) => `.${m}`).join(",")).forEach((el) => el.classList.remove(...MARKS));
      document.querySelectorAll("[data-ws-drop].drop-hover").forEach((el) => el.classList.remove("drop-hover"));
    };

    const computeDrop = (x, y) => {
      const newGroupEl = [...document.querySelectorAll('[data-ws-drop="new-group"]')].find((el) => {
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
      if (newGroupEl) return { kind: "newGroup", el: newGroupEl };
      const tolerance = 8;
      const cols = columns();
      for (const col of cols) {
        if (col.offsetParent === null) continue;
        const r = col.querySelector(".cc-ws-head")?.getBoundingClientRect();
        if (!r || x < r.left || x > r.right || y < r.top - tolerance || y > r.bottom + tolerance) continue;
        const tabs = tabEls(col);
        let index = tabs.length;
        for (let i = 0; i < tabs.length; i += 1) {
          const tr = tabs[i].getBoundingClientRect();
          if (x < tr.left + tr.width / 2) {
            index = i;
            break;
          }
        }
        return { kind: "tab", groupId: col.dataset.groupId, index };
      }
      if (tabCount(dragState.groupId) === 1) {
        let index = cols.length;
        for (let i = 0; i < cols.length; i += 1) {
          const r = cols[i].getBoundingClientRect();
          if (x < r.left + r.width / 2) {
            index = i;
            break;
          }
        }
        return { kind: "column", index };
      }
      return null;
    };

    const onDragMove = (event) => {
      if (!dragState) return;
      if (!dragState.started) {
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < DRAG_THRESHOLD) return;
        dragState.started = true;
        root.classList.add("dragging");
      }
      clearDropMarks();
      tabEl(dragState.tabId)?.classList.add("drag-ghost");
      const drop = (dragState.drop = computeDrop(event.clientX, event.clientY));
      if (!drop) return;
      if (drop.kind === "tab") {
        const col = colOf(drop.groupId);
        col?.querySelector(".cc-ws-tabs")?.classList.add("drop-target");
        const tabs = tabEls(col);
        if (drop.index < tabs.length) tabs[drop.index].classList.add("drop-left");
        else tabs[tabs.length - 1]?.classList.add("drop-right");
      } else if (drop.kind === "newGroup") {
        drop.el.classList.add("drop-hover");
      } else if (drop.kind === "column") {
        colOf(dragState.groupId)?.classList.add("dragging-col");
        const cols = columns();
        if (cols[drop.index]) cols[drop.index].classList.add("drop-before");
        else cols[cols.length - 1]?.classList.add("drop-after");
      }
    };

    const endDrag = (cancelled) => {
      const state = dragState;
      clearDropMarks();
      root.classList.remove("dragging");
      if (!state) return;
      if (state.started) {
        // Swallow the click that follows the drag.
        state.suppressClick = true;
        setTimeout(() => {
          if (dragState === state) dragState = null;
        }, 0);
      } else dragState = null;
      if (!state.started || cancelled || !state.drop) return;
      const drop = state.drop;
      if (drop.kind === "tab") workspace.moveTab(state.tabId, drop.groupId, drop.index);
      else if (drop.kind === "newGroup") workspace.moveTabToNewGroup(state.tabId);
      else if (drop.kind === "column") workspace.moveGroup(state.groupId, drop.index);
      ctx.events.emit("Workspace:dragFinished", {});
    };

    let finish = null;
    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const head = event.target.closest?.(".cc-ws-head");
      const el = event.target.closest?.(".cc-ws-tab");
      if (!head || !el || event.target.closest("button")) return;
      const groupId = head.closest(".cc-ws-col")?.dataset.groupId;
      if (!groupId) return;
      dragState = { tabId: el.dataset.tabId, groupId, startX: event.clientX, startY: event.clientY, started: false, suppressClick: false, drop: null };
      const onMove = (e) => onDragMove(e);
      const onUp = (e) => finish(e.type === "pointercancel");
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
        }
      };
      finish = (cancelled) => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        window.removeEventListener("keydown", onKey, true);
        finish = null;
        endDrag(cancelled);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      window.addEventListener("keydown", onKey, true);
    };
    const onClick = (event) => {
      if (dragState?.suppressClick && event.target.closest?.(".cc-ws-tab")) event.stopPropagation();
    };
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("click", onClick, true);
    ctx.onDispose(() => {
      finish?.(true);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("click", onClick, true);
    });
  },
};
