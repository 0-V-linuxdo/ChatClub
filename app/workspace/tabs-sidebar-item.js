import { t } from "../../shared/i18n.js";
import { TABS_SIDEBAR_HOVER_BUTTONS } from "../../shared/constants.js";
import {
  normalizePocketIcon,
  normalizeTabsSidebarButtonOrder,
  normalizeTabsSidebarButtonPlacement
} from "../../shared/storage-schema.js";
import { createMenuButton } from "../../ui/components.js";
import {
  claimTopmostPopoverEscape,
  el,
  iconButton
} from "../../ui/dom.js";
import { workspaceIdValue } from "./tabs-sidebar-sort.js";

function hoverActionsWidth(count) {
  if (!count) return "0px";
  return `${count * 28 + Math.max(0, count - 1) * 2 + 16}px`;
}

function tabsSidebarHoverConfig(getOptions) {
  const options = typeof getOptions === "function" ? getOptions() : {};
  const placement = normalizeTabsSidebarButtonPlacement(options?.tabsSidebarButtonPlacement);
  const order = normalizeTabsSidebarButtonOrder(options?.tabsSidebarButtonOrder);
  const byId = new Map(TABS_SIDEBAR_HOVER_BUTTONS.map((item) => [item.id, item]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);
  return {
    pinned: ordered.filter((item) => placement[item.id] === "pinned"),
    folded: ordered.filter((item) => placement[item.id] === "menu")
  };
}

export function createTabsSidebarHoverMenu({
  ownerDocument,
  createIcon,
  getOptions,
  onPin,
  onPocket,
  onEdit,
  onDelete
}) {
  let hoverMenuCleanup = null;

  function closeHoverMenu() {
    hoverMenuCleanup?.();
    hoverMenuCleanup = null;
    [".workspace-tabs-sidebar-hover-menu", ".workspace-tabs-sidebar-hover-backdrop"].forEach((selector) => {
      ownerDocument?.querySelectorAll?.(selector)?.forEach?.((node) => node.remove?.());
    });
    ownerDocument?.querySelectorAll?.(".workspace-tabs-sidebar-item.is-menu-open")
      ?.forEach?.((node) => node.classList?.remove?.("is-menu-open"));
    ownerDocument?.querySelectorAll?.(".workspace-tabs-sidebar-item-more")
      ?.forEach?.((node) => node.setAttribute?.("aria-expanded", "false"));
  }

  function pocketIconName() {
    return normalizePocketIcon(typeof getOptions === "function" ? getOptions()?.pocketIcon : "");
  }

  function hoverMenuButton(id, item, row) {
    const resolveRow = (event) => event?.currentTarget?.closest?.(".workspace-tabs-sidebar-item") || row;
    if (id === "pin") {
      const pinLabel = item.pinned ? t("workspace.tabs.unpin") : t("workspace.tabs.pin");
      return createMenuButton({
        label: pinLabel,
        icon: createIcon("pin"),
        onClick: () => {
          closeHoverMenu();
          onPin(item);
        },
        tooltipLabel: pinLabel,
        tooltipId: "workspace.tabs.pin"
      });
    }
    if (id === "pocket") {
      return createMenuButton({
        label: t("workspace.tabs.pocket"),
        icon: createIcon(pocketIconName()),
        onClick: () => {
          closeHoverMenu();
          onPocket(item);
        },
        tooltipId: "workspace.tabs.pocket"
      });
    }
    if (id === "edit") {
      return createMenuButton({
        label: t("workspace.tabs.edit"),
        icon: createIcon("edit"),
        onClick: (event) => {
          closeHoverMenu();
          onEdit(item, resolveRow(event));
        },
        tooltipId: "workspace.tabs.edit"
      });
    }
    if (id === "delete") {
      return createMenuButton({
        label: t("workspace.tabs.delete"),
        icon: createIcon("trash"),
        variant: "danger",
        onClick: () => {
          closeHoverMenu();
          onDelete(item);
        },
        tooltipId: "workspace.tabs.delete"
      });
    }
    return null;
  }

  function openHoverMenu(event, item, row) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const anchor = event.currentTarget;
    if (row?.classList?.contains?.("is-menu-open")) {
      closeHoverMenu();
      return;
    }
    closeHoverMenu();
    const { folded } = tabsSidebarHoverConfig(getOptions);
    if (!folded.length) return;
    row?.classList?.add?.("is-menu-open");
    anchor?.setAttribute?.("aria-expanded", "true");
    const rect = anchor.getBoundingClientRect?.() || { bottom: 0, right: 0 };
    const view = ownerDocument.defaultView || globalThis;
    const backdrop = el("div", {
      class: "popover-backdrop workspace-tabs-sidebar-hover-backdrop",
      onpointerdown: (pointerEvent) => {
        pointerEvent.preventDefault();
        closeHoverMenu();
      }
    });
    const menu = el("div", {
      class: "popover-menu workspace-tabs-sidebar-hover-menu",
      role: "menu",
      style: {
        top: `${Number(rect.bottom) + 5}px`,
        right: `${Math.max(8, Number(view.innerWidth || 0) - Number(rect.right || 0))}px`
      },
      onpointerdown: (pointerEvent) => pointerEvent.stopPropagation(),
      onclick: (pointerEvent) => pointerEvent.stopPropagation()
    }, folded.map((entry) => hoverMenuButton(entry.id, item, row)).filter(Boolean));
    (ownerDocument.body || ownerDocument.documentElement)?.append?.(backdrop, menu);
    const onOutside = (pointerEvent) => {
      const target = pointerEvent.target;
      if (menu.contains?.(target) || anchor.contains?.(target) || anchor === target) return;
      closeHoverMenu();
    };
    const onKeydown = (keyEvent) => {
      if (!claimTopmostPopoverEscape(keyEvent, ".workspace-tabs-sidebar-hover-menu")) return;
      closeHoverMenu();
    };
    const onViewport = () => closeHoverMenu();
    ownerDocument.addEventListener?.("pointerdown", onOutside, true);
    ownerDocument.addEventListener?.("focusin", onOutside, true);
    ownerDocument.addEventListener?.("keydown", onKeydown, true);
    view.addEventListener?.("resize", onViewport, true);
    view.addEventListener?.("scroll", onViewport, true);
    view.addEventListener?.("blur", onViewport, true);
    hoverMenuCleanup = () => {
      ownerDocument.removeEventListener?.("pointerdown", onOutside, true);
      ownerDocument.removeEventListener?.("focusin", onOutside, true);
      ownerDocument.removeEventListener?.("keydown", onKeydown, true);
      view.removeEventListener?.("resize", onViewport, true);
      view.removeEventListener?.("scroll", onViewport, true);
      view.removeEventListener?.("blur", onViewport, true);
    };
  }

  function renderHoverAction(id, item) {
    if (id === "pin") {
      const pinLabel = item.pinned ? t("workspace.tabs.unpin") : t("workspace.tabs.pin");
      const pinButton = iconButton(
        pinLabel,
        createIcon("pin"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          onPin(item);
        },
        `workspace-tabs-sidebar-item-pin${item.pinned ? " is-pinned" : ""}`,
        pinLabel,
        "",
        "workspace.tabs.pin"
      );
      pinButton.setAttribute?.("aria-pressed", item.pinned ? "true" : "false");
      return pinButton;
    }
    if (id === "pocket") {
      return iconButton(
        t("workspace.tabs.pocket"),
        createIcon(pocketIconName()),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          onPocket(item);
        },
        "workspace-tabs-sidebar-item-pocket",
        t("workspace.tabs.pocket"),
        "",
        "workspace.tabs.pocket"
      );
    }
    if (id === "edit") {
      return iconButton(
        t("workspace.tabs.edit"),
        createIcon("edit"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          onEdit(item, event?.currentTarget?.closest?.(".workspace-tabs-sidebar-item"));
        },
        "workspace-tabs-sidebar-item-edit",
        t("workspace.tabs.edit"),
        "",
        "workspace.tabs.edit"
      );
    }
    if (id === "delete") {
      return iconButton(
        t("workspace.tabs.delete"),
        createIcon("trash"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          onDelete(item);
        },
        "workspace-tabs-sidebar-item-delete",
        t("workspace.tabs.delete"),
        "",
        "workspace.tabs.delete"
      );
    }
    return null;
  }

  function renderItemActions(item) {
    const { pinned, folded } = tabsSidebarHoverConfig(getOptions);
    const rowRef = { row: null };
    const actionNodes = pinned.map((entry) => renderHoverAction(entry.id, item)).filter(Boolean);
    if (folded.length) {
      const moreButton = iconButton(
        t("chat.more"),
        createIcon("more"),
        (event) => openHoverMenu(
          event,
          item,
          event?.currentTarget?.closest?.(".workspace-tabs-sidebar-item") || rowRef.row
        ),
        "workspace-tabs-sidebar-item-more",
        t("chat.more"),
        "",
        "workspace.tabs.more"
      );
      moreButton.setAttribute?.("aria-expanded", "false");
      moreButton.setAttribute?.("aria-haspopup", "menu");
      actionNodes.push(moreButton);
    }
    return {
      actionCount: pinned.length + (folded.length ? 1 : 0),
      actionNodes,
      rowRef
    };
  }

  return Object.freeze({ closeHoverMenu, openHoverMenu, renderItemActions });
}

export function renderTabsSidebarItem({
  item,
  index,
  label,
  favicons = null,
  createIcon,
  suppressActivate,
  activateTab,
  bindItemDrag,
  actionCount,
  actionNodes,
  rowRef,
  nested = false
}) {
  const row = el("div", {
    class: [
      "workspace-tabs-sidebar-item",
      item.current ? "is-current" : "",
      item.live ? "" : "is-closed",
      item.pinned ? "is-pinned" : "",
      nested ? "is-nested" : ""
    ].filter(Boolean).join(" "),
    role: "listitem",
    dataset: {
      kind: "tab",
      workspaceId: workspaceIdValue(item.workspaceId),
      pinned: item.pinned ? "1" : ""
    },
    style: actionCount ? { "--tabs-sidebar-actions-width": hoverActionsWidth(actionCount) } : null
  },
    el("button", {
      class: "workspace-tabs-sidebar-item-focus",
      type: "button",
      "aria-current": item.current ? "page" : null,
      onclick: () => {
        if (suppressActivate()) return;
        activateTab(item).catch(() => {});
      }
    },
      el("span", { class: "workspace-tabs-sidebar-item-index" }, String(index + 1)),
      favicons,
      item.pinned
        ? el("span", {
          class: "workspace-tabs-sidebar-item-pin-mark",
          "aria-hidden": "true"
        }, createIcon("pin"))
        : null,
      el("span", { class: "workspace-tabs-sidebar-item-label" }, label)
    ),
    actionNodes.length
      ? el("div", { class: "workspace-tabs-sidebar-item-actions" }, actionNodes)
      : null
  );
  if (rowRef) rowRef.row = row;
  bindItemDrag(row, item, "tab");
  return row;
}

export function renderTabsSidebarDivider(labelKey) {
  return el("div", {
    class: "workspace-tabs-sidebar-divider",
    role: "separator",
    "aria-label": t(labelKey)
  }, el("span", { class: "workspace-tabs-sidebar-divider-label" }, t(labelKey)));
}

export function renderTabsSidebarGroup(labelKey) {
  return el("div", {
    class: "workspace-tabs-sidebar-group",
    role: "heading",
    "aria-level": "5",
    dataset: { kind: "group" }
  }, t(labelKey));
}

export function renderTabsSidebarFolder({
  folder,
  count,
  createIcon,
  onToggle,
  onRename,
  onDelete,
  bindItemDrag
}) {
  const name = folder.name || t("workspace.tabs.folderUntitled");
  const row = el("div", {
    class: `workspace-tabs-sidebar-folder${folder.collapsed ? " is-collapsed" : ""}`,
    role: "listitem",
    dataset: {
      kind: "folder",
      folderId: folder.id
    }
  },
    el("button", {
      class: "workspace-tabs-sidebar-folder-toggle",
      type: "button",
      "aria-expanded": folder.collapsed ? "false" : "true",
      onclick: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        onToggle(folder);
      }
    },
      createIcon(folder.collapsed ? "chevronRight" : "chevronDown"),
      createIcon("folder"),
      el("span", { class: "workspace-tabs-sidebar-folder-label" }, name),
      el("span", { class: "workspace-tabs-sidebar-folder-count" }, String(count))
    ),
    el("div", { class: "workspace-tabs-sidebar-item-actions workspace-tabs-sidebar-folder-actions" },
      iconButton(
        t("workspace.tabs.renameFolder"),
        createIcon("edit"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          onRename(folder, event?.currentTarget?.closest?.(".workspace-tabs-sidebar-folder"));
        },
        "workspace-tabs-sidebar-folder-edit",
        t("workspace.tabs.renameFolder"),
        "",
        "workspace.tabs.renameFolder"
      ),
      iconButton(
        t("workspace.tabs.deleteFolder"),
        createIcon("trash"),
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          onDelete(folder);
        },
        "workspace-tabs-sidebar-folder-delete",
        t("workspace.tabs.deleteFolder"),
        "",
        "workspace.tabs.deleteFolder"
      )
    )
  );
  bindItemDrag(row, folder, "folder");
  return row;
}
