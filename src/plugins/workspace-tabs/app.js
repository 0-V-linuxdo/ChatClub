// WorkspaceTabs: the ChatClub tabs sidebar (v2 02 §10), the brand button and new workspace tabs (02 §13).

import { h, clear, icon, uid, debounce } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { appIconImg } from "../../lib/app-icon.js";
import { isGenericTitle } from "../../lib/titles.js";
import { SIDEBAR_BUTTON_ORDER } from "./index.js";
import { zoneBoard } from "../../lib/zone-board.js";
import { displayName, buildSections, normalizeFolders, normalizeSort, moveIntoFolder, SORTS } from "./model.js";
import { reorderButtonsOn } from "../../lib/settings-table.js";

const OPEN_KEY = "chatclubWorkspaceTabsSidebarOpenV1";
const WIDTH_KEY = "chatclubWorkspaceTabsSidebarWidthV1";
const PINNED_KEY = "chatclubWorkspaceTabsPinnedV1";
const SORT_KEY = "chatclubWorkspaceTabsSidebarSortV1";
const FOLDERS_KEY = "chatclubWorkspaceTabsSidebarFoldersV1";
const DRAG_THRESHOLD = 6;
const MAX_ICONS = 4;

const readJson = (store, key, fallback) => {
  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeJson = (store, key, value) => {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: keep working with the in-memory value
  }
};

export default {
  start(ctx) {
    const t = ctx.t;
    const shell = ctx.services.get("shell");
    const shellUi = ctx.services.get("ui");
    const workspace = ctx.services.get("workspace");
    const session = ctx.services.get("workspaceSession");
    const apps = ctx.services.get("apps");
    if (!workspace || !session) return;
    const buttons = ctx.extensionPoint("tabsSidebar.button");

    // ------------------------------------------------------------ local state
    let open = (() => {
      try {
        return sessionStorage.getItem(OPEN_KEY) === "1" || sessionStorage.getItem(OPEN_KEY) === "true";
      } catch {
        return false;
      }
    })();
    let width = Math.min(560, Math.max(220, Number(readJson(localStorage, WIDTH_KEY, 320)) || 320));
    let pinned = (readJson(localStorage, PINNED_KEY, []) ?? []).filter((x) => typeof x === "string");
    let sort = normalizeSort(readJson(localStorage, SORT_KEY, "activity"));
    let folders = normalizeFolders(readJson(localStorage, FOLDERS_KEY, []));
    const savePinned = () => writeJson(localStorage, PINNED_KEY, pinned);
    const saveFolders = () => writeJson(localStorage, FOLDERS_KEY, folders);
    let items = [];
    let editing = null; // { kind: "item"|"folder", id }
    let menuOpenFor = null;

    // ------------------------------------------------------------ DOM
    const countEl = h("span.count", "0");
    const sortBtn = ui.iconButton({ icon: "arrowUpDown", label: t("tabs.sort", { name: t(`tabs.sort.${sort}`) }), tipId: "workspace.tabs.sortActivity" });
    const folderBtn = ui.iconButton({ icon: "folderPlus", label: t("tabs.newFolder"), tipId: "workspace.tabs.newFolder" });
    const closeOthersBtn = ui.iconButton({ icon: "copyMinus", label: t("tabs.closeOthers"), tipId: "workspace.tabs.closeOthers" });
    const list = h("div.cc-tabs-list", { attrs: { role: "list" } });
    const resizer = h("div.cc-tabs-resize", { attrs: { "aria-hidden": "true" } });
    const panel = h("aside.cc-tabs", { attrs: { "aria-label": t("tabs.title") } },
      h("div.cc-tabs-head", countEl, h("span.title", t("tabs.title")), folderBtn, sortBtn, closeOthersBtn), list, resizer);
    panel.hidden = !open;
    panel.style.setProperty("--tabs-w", `${width}px`);
    shell.sidebarSlot.append(panel);
    ctx.onDispose(() => panel.remove());

    // ------------------------------------------------------------ data
    const appName = (id) => apps.get(id)?.name ?? id;
    const selfItem = () => {
      const groups = workspace.groups();
      const layout = workspace.getLayoutInfo?.() ?? {};
      return {
        title: workspace.getTopic().title,
        layoutName: layout.type === "temporary" ? layout.name ?? "" : "",
        appIds: [...new Set(groups.flatMap((g) => g.tabs.map((tb) => tb.appId)))],
      };
    };
    const refresh = async () => {
      let response;
      try {
        response = await session.list();
      } catch (error) {
        ctx.logger.warn("Listing ChatClub tabs failed:", error?.message || error);
        return;
      }
      const selfId = workspace.workspaceId();
      const raw = Array.isArray(response?.items) ? response.items : [];
      items = raw.map((x) => (x.workspaceId === selfId || x.isSelf ? { ...x, ...selfItem(), isSelf: true, live: true, workspaceId: selfId } : x));
      if (!items.some((x) => x.isSelf)) items.unshift({ workspaceId: selfId, live: true, isSelf: true, createdAt: Date.now(), ...selfItem() });
      // Forget pins and folder entries whose memory is gone.
      const known = new Set(items.map((x) => x.workspaceId));
      const nextPinned = pinned.filter((id) => known.has(id));
      if (nextPinned.length !== pinned.length) {
        pinned = nextPinned;
        savePinned();
      }
      render();
      return items;
    };
    const refreshSoon = debounce(() => open && refresh(), 250);

    const nameOf = (item, index = 1) => displayName(item, { index, appName, newTabLabel: t("tabs.newTab") });

    // ------------------------------------------------------------ page title (02 §10.2)
    const updateTitle = () => {
      const self = { ...selfItem(), isSelf: false, live: true };
      const name = displayName(self, { appName, newTabLabel: "ChatClub" });
      document.title = isGenericTitle(self.title) && isGenericTitle(self.layoutName) ? "ChatClub" : name;
    };
    ctx.events.on("Workspace:topicChanged", updateTitle);
    ctx.events.on("Workspace:ready", updateTitle);

    // ------------------------------------------------------------ actions
    const isPinned = (id) => pinned.includes(id);
    const togglePin = (item) => {
      if (isPinned(item.workspaceId)) pinned = pinned.filter((id) => id !== item.workspaceId);
      else pinned = [item.workspaceId, ...pinned];
      savePinned();
      render();
      arrangeBrowserTabs();
    };
    /** Puts the open ChatClub tabs of this window in sidebar order, starting at their leftmost position. */
    const arrangeBrowserTabs = async () => {
      const ordered = flatOrder().filter((x) => x.live && typeof x.tabId === "number");
      const self = items.find((x) => x.isSelf);
      const windowId = self?.windowId ?? ordered[0]?.windowId;
      const inWindow = ordered.filter((x) => x.windowId === windowId);
      if (inWindow.length < 2) return;
      const start = Math.min(...inWindow.map((x) => x.index ?? 0));
      try {
        await session.moveTabs(inWindow.map((x) => x.tabId), windowId, start);
      } catch (error) {
        ctx.logger.warn("Arranging ChatClub tabs failed:", error?.message || error);
      }
    };
    const activate = async (item) => {
      if (item.isSelf) return;
      if (item.live && typeof item.tabId === "number") {
        const result = await session.focusTab(item.tabId).catch(() => null);
        if (result?.ok) return;
        await refresh();
        const again = items.find((x) => x.workspaceId === item.workspaceId);
        if (again?.live) return;
      }
      const opened = await session.openWorkspaceTab({ workspaceId: item.workspaceId }).catch(() => null);
      if (!opened?.ok) shellUi.toast(t("tabs.openFailed"), "error");
    };
    const saveTitle = async (item, title) => {
      const text = String(title ?? "").trim();
      if (item.isSelf) workspace.setTopic({ title: text, custom: !!text });
      else await session.setTitle(item.workspaceId, text, !!text).catch(() => {});
      editing = null;
      await refresh();
    };
    const deleteItem = async (item) => {
      const title = nameOf(item);
      const ok = await shellUi.confirm({ title: t("tabs.delete.title", { title }), description: t("tabs.delete.desc"), confirmText: t("tabs.delete.confirm"), danger: true });
      if (!ok) return;
      await session.deleteMemory(item.workspaceId).catch(() => {});
      pinned = pinned.filter((id) => id !== item.workspaceId);
      savePinned();
      folders = moveIntoFolder(folders, item.workspaceId, null);
      saveFolders();
      await ctx.services.get("fullText")?.deleteWorkspace?.(item.workspaceId)?.catch?.(() => {});
      if (item.isSelf) {
        session.forgetPageSnapshot?.();
        try {
          const tab = await chrome.tabs.getCurrent();
          if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
        } catch {
          window.close();
        }
        return;
      }
      await refresh();
    };

    // ------------------------------------------------------------ hover buttons (02 §10.2)
    ctx.contribute("tabsSidebar.button", {
      id: "pin",
      icon: (item) => (isPinned(item.workspaceId) ? "pinOff" : "pin"),
      labelKey: (item) => (isPinned(item.workspaceId) ? "tabs.btn.unpin" : "tabs.btn.pin"),
      tipId: "workspace.tabs.pin",
      order: 10,
      onClick: (item) => togglePin(item),
    });
    ctx.contribute("tabsSidebar.button", {
      id: "edit",
      icon: "edit",
      labelKey: "tabs.btn.edit",
      tipId: "workspace.tabs.edit",
      order: 30,
      onClick: (item) => {
        editing = { kind: "item", id: item.workspaceId };
        render();
      },
    });
    ctx.contribute("tabsSidebar.button", {
      id: "delete",
      icon: "trash",
      labelKey: "tabs.btn.delete",
      tipId: "workspace.tabs.delete",
      danger: true,
      order: 40,
      onClick: (item) => deleteItem(item),
    });

    // Appearance → ChatClub tabs (06 §3.5): the sidebar row buttons in three zones; More stays pinned.
    ctx.contribute("appearance.group", {
      id: "WorkspaceTabs:sidebarButtons",
      tab: "chatclubTabs",
      order: 0,
      titleKey: "tabs.zones.card",
      render(container) {
        const resolveStatic = (v) => {
          try {
            return typeof v === "function" ? v({}) : v;
          } catch {
            return null;
          }
        };
        const items = [
          ...buttons.sorted().map((b) => ({ id: b.id, label: t(resolveStatic(b.labelKey) ?? b.id), icon: resolveStatic(b.icon) })),
          { id: "more", label: t("tabs.btn.more"), icon: "more", locked: "pinned" },
        ];
        container.append(
          h("p.cc-zones-desc", t("tabs.zones.desc")),
          zoneBoard({
            zones: [
              { id: "pinned", label: t("workspace.zones.pinned") },
              { id: "menu", label: t("workspace.zones.menu"), note: t("tabs.zones.menuNote") },
              { id: "hidden", label: t("workspace.zones.hidden") },
            ],
            items,
            zoneOf: (id) => placementOf(id),
            order: Array.isArray(ctx.settings.tabsSidebarButtonOrder) ? ctx.settings.tabsSidebarButtonOrder : SIDEBAR_BUTTON_ORDER,
            emptyText: t("workspace.zones.empty"),
            lockedTip: t("tabs.zones.moreLocked"),
            onChange: (placement, order) => {
              delete placement.more;
              ctx.settings.tabsSidebarButtonPlacement = placement;
              ctx.settings.tabsSidebarButtonOrder = order.filter((id) => id !== "more");
            },
          }),
        );
      },
    });

    const placementOf = (id) => {
      if (id === "more") return "pinned";
      const v = ctx.settings.tabsSidebarButtonPlacement?.[id];
      return v === "pinned" || v === "menu" || v === "hidden" ? v : "pinned";
    };
    const orderedButtons = () => {
      const order = Array.isArray(ctx.settings.tabsSidebarButtonOrder) ? ctx.settings.tabsSidebarButtonOrder : SIDEBAR_BUTTON_ORDER;
      const pos = new Map(order.map((id, i) => [id, i]));
      return buttons.sorted().map((b, i) => ({ b, rank: pos.has(b.id) ? pos.get(b.id) : 1000 + i })).sort((x, y) => x.rank - y.rank).map((x) => x.b);
    };
    const resolve = (value, item) => (typeof value === "function" ? value(item) : value);
    const rowButtons = (item, row) => {
      const box = h("span.actions");
      const menuEntries = [];
      for (const entry of orderedButtons()) {
        if (entry.visible && !entry.visible(item)) continue;
        const placement = placementOf(entry.id);
        if (placement === "hidden") continue;
        const label = t(resolve(entry.labelKey, item));
        const disabled = !!resolve(entry.disabled, item);
        if (placement === "menu") {
          if (!disabled) menuEntries.push({ label, icon: resolve(entry.icon, item), danger: !!entry.danger, onClick: () => entry.onClick(item) });
          continue;
        }
        box.append(ui.iconButton({ icon: resolve(entry.icon, item), compact: true, label, tipId: entry.tipId ?? `workspace.tabs.${entry.id}`, disabled, className: entry.danger ? "danger" : "", onClick: (e) => {
          e.stopPropagation();
          entry.onClick(item);
        } }));
      }
      const more = ui.iconButton({ icon: "more", compact: true, label: t("tabs.btn.more"), tipId: "workspace.tabs.more", disabled: !menuEntries.length, onClick: (e) => {
        e.stopPropagation();
        const normal = menuEntries.filter((m) => !m.danger);
        const danger = menuEntries.filter((m) => m.danger);
        menuOpenFor = item.workspaceId;
        row.classList.add("menu-open");
        shellUi.openMenu({ anchor: more, align: "end", items: [...normal, ...(normal.length && danger.length ? ["separator"] : []), ...danger], onClose: () => {
          menuOpenFor = null;
          row.classList.remove("menu-open");
        } });
      } });
      box.append(more);
      return box;
    };

    // ------------------------------------------------------------ rendering
    const reorderOn = () => reorderButtonsOn(ctx.host);
    let lastFlat = [];
    const flatOrder = () => lastFlat;

    const iconStack = (item) => {
      const box = h("span.icons");
      for (const id of (item.appIds ?? []).slice(0, MAX_ICONS)) {
        const app = apps.get(id);
        if (app) box.append(appIconImg(ctx.host, app));
      }
      return box;
    };

    const editRow = (initial, onSave, onCancel) => {
      const input = ui.textInput({ value: initial });
      const finish = (save) => (save ? onSave(input.value) : onCancel());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      });
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
      return [input,
        ui.iconButton({ icon: "x", compact: true, label: t("tabs.cancel"), onClick: (e) => (e.stopPropagation(), finish(false)) }),
        ui.iconButton({ icon: "check", compact: true, label: t("tabs.save"), onClick: (e) => (e.stopPropagation(), finish(true)) })];
    };

    const itemRow = (item, index, { inFolder = null, siblings = [] } = {}) => {
      const row = h("div.cc-tabs-row", { class: [item.isSelf ? "self" : "", inFolder ? "in-folder" : "", menuOpenFor === item.workspaceId ? "menu-open" : ""].join(" "), attrs: { role: "listitem", tabindex: "0" }, dataset: { workspaceId: item.workspaceId, folderId: inFolder ?? "" } });
      if (editing?.kind === "item" && editing.id === item.workspaceId) {
        row.classList.add("editing");
        row.append(...editRow(item.title && !isGenericTitle(item.title) ? item.title : nameOf(item, index), (v) => saveTitle(item, v), () => {
          editing = null;
          render();
        }));
        return row;
      }
      row.append(h("span.num", String(index)));
      if (isPinned(item.workspaceId)) row.append(h("span.pin-mark", icon("pin", { size: 13 })));
      const name = nameOf(item, index);
      row.append(h("span.name", { attrs: { title: name } }, name), iconStack(item), rowButtons(item, row));
      if (inFolder && reorderOn()) {
        const pos = siblings.indexOf(item.workspaceId);
        row.querySelector(".actions").prepend(
          ui.iconButton({ icon: "chevronUp", compact: true, label: t("tabs.moveUp"), disabled: pos <= 0, onClick: (e) => (e.stopPropagation(), moveInFolder(inFolder, item.workspaceId, -1)) }),
          ui.iconButton({ icon: "chevronDown", compact: true, label: t("tabs.moveDown"), disabled: pos >= siblings.length - 1, onClick: (e) => (e.stopPropagation(), moveInFolder(inFolder, item.workspaceId, 1)) }));
      }
      row.addEventListener("click", (e) => {
        if (e.target.closest(".actions")) return;
        activate(item);
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target === row) activate(item);
      });
      return row;
    };

    const moveInFolder = (folderId, workspaceId, delta) => {
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      const i = folder.workspaceIds.indexOf(workspaceId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= folder.workspaceIds.length) return;
      [folder.workspaceIds[i], folder.workspaceIds[j]] = [folder.workspaceIds[j], folder.workspaceIds[i]];
      saveFolders();
      render();
    };
    const moveFolder = (folderId, delta) => {
      const i = folders.findIndex((f) => f.id === folderId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= folders.length) return;
      [folders[i], folders[j]] = [folders[j], folders[i]];
      saveFolders();
      render();
    };

    const folderRow = (folder, count, fIndex) => {
      const row = h("div.cc-tabs-folder", { dataset: { folderRow: folder.id } });
      if (editing?.kind === "folder" && editing.id === folder.id) {
        row.append(...editRow(folder.name || t("tabs.folder.untitled"), (v) => {
          folder.name = String(v).trim() || t("tabs.folder.untitled");
          editing = null;
          saveFolders();
          render();
        }, () => {
          editing = null;
          render();
        }));
        return row;
      }
      const actions = h("span.actions",
        reorderOn() ? ui.iconButton({ icon: "chevronUp", compact: true, label: t("tabs.moveUp"), disabled: fIndex === 0, onClick: (e) => (e.stopPropagation(), moveFolder(folder.id, -1)) }) : null,
        reorderOn() ? ui.iconButton({ icon: "chevronDown", compact: true, label: t("tabs.moveDown"), disabled: fIndex === folders.length - 1, onClick: (e) => (e.stopPropagation(), moveFolder(folder.id, 1)) }) : null,
        ui.iconButton({ icon: "edit", compact: true, label: t("tabs.folder.rename"), onClick: (e) => {
          e.stopPropagation();
          editing = { kind: "folder", id: folder.id };
          render();
        } }),
        ui.iconButton({ icon: "trash", compact: true, label: t("tabs.folder.delete"), className: "danger", onClick: async (e) => {
          e.stopPropagation();
          const ok = await shellUi.confirm({ title: t("tabs.folder.delete"), description: t("tabs.folder.deleteConfirm"), danger: true });
          if (!ok) return;
          folders = folders.filter((f) => f.id !== folder.id);
          saveFolders();
          render();
        } }));
      row.append(icon(folder.collapsed ? "chevronRight" : "chevronDown", { size: 14 }), icon("folder", { size: 15 }), h("span.name", folder.name || t("tabs.folder.untitled")), h("span.n", String(count)), actions);
      row.addEventListener("click", (e) => {
        if (e.target.closest(".actions")) return;
        folder.collapsed = !folder.collapsed;
        saveFolders();
        render();
      });
      return row;
    };

    const render = () => {
      clear(list);
      countEl.textContent = String(items.length);
      closeOthersBtn.disabled = !items.some((x) => x.live && !x.isSelf);
      sortBtn.dataset.tip = t("tabs.sort", { name: t(`tabs.sort.${sort}`) });
      const sections = buildSections(items, { pinned, folders, sort, nameOf: (x) => nameOf(x) });
      const flat = [];
      if (!items.length) {
        list.append(h("div.cc-tabs-empty", t("tabs.empty")));
        lastFlat = flat;
        return;
      }
      for (const section of sections) {
        if (section.kind === "folder") {
          const fIndex = folders.indexOf(section.folder);
          list.append(folderRow(section.folder, section.items.length, fIndex));
          if (section.folder.collapsed) {
            flat.push(...section.items);
            continue;
          }
          const ids = section.items.map((x) => x.workspaceId);
          section.items.forEach((item, i) => list.append(itemRow(item, i + 1, { inFolder: section.folder.id, siblings: ids })));
          flat.push(...section.items);
          continue;
        }
        if (section.kind !== "all") list.append(h("div.cc-tabs-sec", t(`tabs.section.${section.id}`)));
        section.items.forEach((item, i) => list.append(itemRow(item, i + 1)));
        flat.push(...section.items);
      }
      lastFlat = flat;
    };

    // ------------------------------------------------------------ drag (02 §10.4)
    list.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".actions, input, button")) return;
      const source = event.target.closest(".cc-tabs-row, .cc-tabs-folder");
      if (!source || source.classList.contains("editing")) return;
      const isFolder = source.classList.contains("cc-tabs-folder");
      const start = { x: event.clientX, y: event.clientY };
      let dragging = false;
      let drop = null;
      const marks = () => list.querySelectorAll(".drop-before, .drop-after, .drop-into, .dragging").forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-into", "dragging"));
      const move = (e) => {
        if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
        dragging = true;
        marks();
        source.classList.add("dragging");
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".cc-tabs-row, .cc-tabs-folder");
        drop = null;
        if (!over || over === source || !list.contains(over)) return;
        const r = over.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        if (isFolder) {
          if (!over.classList.contains("cc-tabs-folder")) return;
          drop = { kind: "folderOrder", target: over.dataset.folderRow, after };
          over.classList.add(after ? "drop-after" : "drop-before");
        } else if (over.classList.contains("cc-tabs-folder")) {
          drop = { kind: "into", folderId: over.dataset.folderRow };
          over.classList.add("drop-into");
        } else if (over.dataset.folderId) {
          drop = { kind: "inFolder", folderId: over.dataset.folderId, target: over.dataset.workspaceId, after };
          over.classList.add(after ? "drop-after" : "drop-before");
        } else {
          drop = { kind: "out" };
          over.classList.add(after ? "drop-after" : "drop-before");
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", up, true);
        marks();
        if (!dragging) return;
        window.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
        }, { capture: true, once: true });
        if (!drop) return;
        if (isFolder) {
          const id = source.dataset.folderRow;
          const moving = folders.find((f) => f.id === id);
          const rest = folders.filter((f) => f.id !== id);
          let at = rest.findIndex((f) => f.id === drop.target);
          if (drop.after) at += 1;
          rest.splice(at, 0, moving);
          folders = rest;
        } else {
          const id = source.dataset.workspaceId;
          if (drop.kind === "into") folders = moveIntoFolder(folders, id, drop.folderId);
          else if (drop.kind === "out") folders = moveIntoFolder(folders, id, null);
          else {
            const folder = folders.find((f) => f.id === drop.folderId);
            const others = folder.workspaceIds.filter((x) => x !== id);
            const at = others.indexOf(drop.target) + (drop.after ? 1 : 0);
            folders = moveIntoFolder(folders, id, drop.folderId, others[at] ?? null);
          }
        }
        saveFolders();
        render();
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", up, true);
    });

    // ------------------------------------------------------------ header actions
    folderBtn.addEventListener("click", () => {
      const folder = { id: `folder-${uid("f").replace(/^f-?/, "")}`, name: t("tabs.folder.untitled"), collapsed: false, workspaceIds: [] };
      folders = [...folders, folder];
      saveFolders();
      editing = { kind: "folder", id: folder.id };
      render();
    });
    sortBtn.addEventListener("click", () => {
      shellUi.openMenu({ anchor: sortBtn, align: "end", items: SORTS.map((id) => ({ label: t(`tabs.sort.${id}`), checked: sort === id, onClick: () => {
        sort = id;
        writeJson(localStorage, SORT_KEY, sort);
        render();
      } })) });
    });
    closeOthersBtn.addEventListener("click", async () => {
      await session.closeOthers().catch(() => {});
      await refresh();
    });

    // ------------------------------------------------------------ resize
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startW = width;
      const move = (e) => {
        width = Math.min(560, Math.max(220, startW + e.clientX - startX));
        panel.style.setProperty("--tabs-w", `${width}px`);
      };
      const up = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        writeJson(localStorage, WIDTH_KEY, width);
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
    });

    // ------------------------------------------------------------ open / close
    const setOpen = (next) => {
      open = !!next;
      panel.hidden = !open;
      try {
        sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
      } catch {
        // ignore
      }
      ctx.services.get("topbar")?.refresh?.();
      if (open) refresh();
    };
    if (open) refresh();
    const onKey = (event) => {
      if (!open || event.key !== "Escape" || event.defaultPrevented) return;
      if (shellUi.hasOpenLayer()) return;
      if (editing) {
        editing = null;
        render();
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    ctx.onDispose(() => document.removeEventListener("keydown", onKey));

    // Live refresh while open: browser tab changes, session records, this page's own state.
    const onTabs = () => refreshSoon();
    for (const ev of [chrome.tabs?.onCreated, chrome.tabs?.onRemoved, chrome.tabs?.onUpdated, chrome.tabs?.onMoved, chrome.tabs?.onAttached]) {
      ev?.addListener(onTabs);
      ctx.onDispose(() => ev?.removeListener(onTabs));
    }
    const onStorage = (changes, area) => {
      if (area === "local" && Object.keys(changes).some((k) => k.startsWith("chatclubWorkspaceSession"))) refreshSoon();
    };
    chrome.storage?.onChanged?.addListener(onStorage);
    ctx.onDispose(() => chrome.storage?.onChanged?.removeListener(onStorage));
    ctx.events.on("Workspace:changed", () => {
      updateTitle();
      if (!open) return;
      const self = items.find((x) => x.isSelf);
      if (self) Object.assign(self, selfItem(), { workspaceId: workspace.workspaceId() });
      refreshSoon();
    });

    // ------------------------------------------------------------ new workspace tab (02 §13)
    const openNewWorkspaceTab = async () => {
      const handoff = ctx.services.get("promptHandoff");
      const composer = ctx.services.get("composer");
      if (handoff && composer && !composer.isEmpty()) return handoff.openWithDraft();
      const result = await session.openWorkspaceTab({}).catch(() => null);
      if (!result?.ok) shellUi.toast(t("tabs.openFailed"), "error");
      return result;
    };

    // ------------------------------------------------------------ top bar & shortcuts
    ctx.contribute("topbar.item", {
      id: "workspaceTabs",
      icon: () => (open ? "sidebarCollapse" : "sidebarExpand"),
      labelKey: () => (open ? "tabs.toggle.close" : "tabs.toggle.open"),
      shortcutAction: "toggleWorkspaceTabsSidebar",
      active: () => open,
      onClick: () => setOpen(!open),
    });
    ctx.contribute("topbar.item", {
      id: "brand",
      labelKey: "tabs.brand",
      shortcutAction: "openNewWorkspaceTab",
      render: () => {
        const btn = h("button.cc-topbar-brand", { type: "button", "aria-label": t("tabs.brand"), dataset: { tip: t("tabs.brand"), tipId: "topbar.brand" } },
          h("img", { src: chrome.runtime.getURL("icons/logo.svg"), alt: "" }), h("span", "ChatClub"));
        btn.addEventListener("click", () => openNewWorkspaceTab());
        return btn;
      },
    });
    ctx.contribute("shortcut.action", { id: "toggleWorkspaceTabsSidebar", labelKey: "tabs.shortcut.toggle", run: () => setOpen(!open) });
    ctx.contribute("shortcut.action", { id: "openNewWorkspaceTab", labelKey: "tabs.shortcut.newTab", run: () => openNewWorkspaceTab() });

    ctx.services.provide("workspaceTabs", {
      isOpen: () => open,
      setOpen,
      refresh,
      /** Fresh list of tabs and memories (this page overridden by its live state). */
      load: async () => (await refresh()) ?? items,
      items: () => items.map((x) => ({ ...x })),
      nameOf: (item) => nameOf(item),
      activate,
      openNewWorkspaceTab,
    });
  },
};
