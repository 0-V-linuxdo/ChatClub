#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n?/g, "\n");
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const compact = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
const CLAUDE_DIA_MENU_LABELS = Object.freeze({
  star: "\uE0E7 Star P",
  markUnread: "\uE06A Mark as unread U",
  rename: "\uE064 Rename R",
  addToProject: "\uE0C9 Add to project \uE02A",
  delete: "\uE101 Delete D",
  deleteCompact: "\uE101 DeleteD"
});

function matchesExactLabelRepeats(value, labels) {
  const token = compact(value);
  return labels.some((label) => {
    const wanted = compact(label);
    return Boolean(wanted && token && token.length % wanted.length === 0 && token === wanted.repeat(token.length / wanted.length));
  });
}

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function element(id, options = {}) {
  const attributes = { ...(options.attributes || {}) };
  const node = {
    id,
    role: options.role || "",
    parentElement: options.parentElement || null,
    children: [],
    isConnected: true,
    innerText: options.innerText ?? options.text ?? "",
    textContent: options.textContent ?? options.text ?? "",
    box: options.box || rect(0, 0, 40, 32),
    getAttribute(name) {
      if (name === "role") return this.role;
      return Object.hasOwn(attributes, name) ? attributes[name] : "";
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    hasAttribute(name) {
      return name === "role" ? Boolean(this.role) : Object.hasOwn(attributes, name);
    },
    contains(other) {
      for (let current = other; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    },
    matches(selector) {
      if (selector.includes("[data-testid='chat-title-split']") || selector.includes('[data-testid="chat-title-split"]')) {
        return this.getAttribute("data-testid") === "chat-title-split";
      }
      if (selector.includes("[role='menuitem']") && this.role === "menuitem") return true;
      if (selector.includes("[role='menu']") && this.role === "menu") return true;
      if (selector.includes("[role='dialog']") && this.role === "dialog") return true;
      if (selector.includes("button") && this.getAttribute("data-kind") === "button") return true;
      return false;
    },
    closest(selector) {
      for (let current = this; current; current = current.parentElement) {
        if (current.matches?.(selector)) return current;
      }
      return null;
    }
  };
  if (node.parentElement) node.parentElement.children.push(node);
  return node;
}

function createFixture(options = {}) {
  const state = {
    route: options.href || "https://claude.ai/chat/thread-1",
    menuOpen: Boolean(options.existingMenu),
    confirmationOpen: Boolean(options.existingConfirmation),
    unrelatedMenuOpen: options.concurrentSameFingerprintMenu ? false : options.unrelatedMenu !== false,
    triggerClicks: 0,
    sidebarTriggerClicks: 0,
    deleteClicks: 0,
    unrelatedDeleteClicks: 0,
    confirmClicks: 0,
    deleteFocusCalls: 0,
    confirmFocusCalls: 0,
    confirmDomClicks: 0,
    waitCalls: 0,
    sleepCalls: 0,
    replacementTriggerActive: false,
    premountedMenuDismissed: false,
    confirmationRootReplaced: false,
    onConfirmFocus: null,
    insertedAttempt: null,
    onWaitStart: null,
    suppressNextWaitResult: false
  };
  const location = {
    origin: "https://claude.ai",
    get href() { return state.route; },
    set href(value) { state.route = String(value || ""); }
  };
  const body = element("body", { box: rect(0, 0, 1200, 900) });
  const titleRoot = element("title-root", {
    parentElement: body,
    attributes: { "data-testid": "chat-title-split" },
    box: rect(420, 12, 460, 64)
  });
  const titleControl = element("title-control", {
    parentElement: titleRoot,
    text: options.titleText || "Identifier code verification",
    attributes: {
      "data-kind": "button",
      "aria-label": options.titleEvidenceLabel || `${options.titleText || "Identifier code verification"}, rename chat`
    },
    box: rect(444, 24, 340, 36)
  });
  const trigger = element("title-trigger", {
    parentElement: titleRoot,
    attributes: {
      "data-kind": "button",
      "aria-label": options.triggerLabel || "More options for Identifier code verification",
      "aria-haspopup": "menu",
      "aria-expanded": state.menuOpen ? "true" : "false",
      ...(options.titleOwnsOnly
        ? { "aria-owns": options.titleControlsId || "owned-menu" }
        : { "aria-controls": options.titleControlsId || "owned-menu" })
    },
    box: rect(824, 24, 40, 36)
  });
  const replacementTrigger = element("replacement-title-trigger", {
    parentElement: titleRoot,
    attributes: {
      "data-kind": "button",
      "aria-label": options.triggerLabel || "More options for Identifier code verification",
      "aria-haspopup": "menu",
      "aria-expanded": state.menuOpen ? "true" : "false",
      ...(options.titleOwnsOnly
        ? { "aria-owns": options.titleControlsId || "owned-menu" }
        : { "aria-controls": options.titleControlsId || "owned-menu" })
    },
    box: rect(824, 24, 40, 36)
  });
  replacementTrigger.isConnected = false;
  const sidebar = element("sidebar", { parentElement: body, box: rect(0, 0, 300, 900) });
  const sidebarTrigger = element("sidebar-trigger", {
    parentElement: sidebar,
    attributes: {
      "data-kind": "button",
      "aria-label": "More options for Identifier code verification",
      "aria-haspopup": "menu",
      "aria-controls": "unrelated-menu"
    },
    box: rect(244, 160, 40, 36)
  });
  const unrelatedMenu = element("unrelated-menu", {
    parentElement: body,
    role: "menu",
    box: rect(40, 110, 260, 160)
  });
  const unrelatedDelete = element("unrelated-delete", {
    parentElement: unrelatedMenu,
    role: "menuitem",
    text: "Delete",
    attributes: { "data-kind": "button", "aria-label": "Delete" },
    box: rect(64, 150, 210, 38)
  });
  const unrelatedMarkRead = element("unrelated-mark-read", {
    parentElement: unrelatedMenu,
    role: "menuitem",
    text: CLAUDE_DIA_MENU_LABELS.markUnread,
    attributes: { "data-kind": "button" },
    box: rect(64, 116, 210, 32)
  });
  const unrelatedRename = element("unrelated-rename", {
    parentElement: unrelatedMenu,
    role: "menuitem",
    text: CLAUDE_DIA_MENU_LABELS.rename,
    attributes: { "data-kind": "button" },
    box: rect(64, 150, 210, 32)
  });
  const unrelatedShortcutDelete = element("unrelated-shortcut-delete", {
    parentElement: unrelatedMenu,
    role: "menuitem",
    innerText: CLAUDE_DIA_MENU_LABELS.delete,
    textContent: CLAUDE_DIA_MENU_LABELS.deleteCompact,
    attributes: { "data-kind": "button" },
    box: rect(64, 184, 210, 38)
  });
  const menu = element("owned-menu", {
    parentElement: body,
    role: "menu",
    box: rect(672, 74, 220, 180)
  });
  const menuStar = element("owned-star", {
    parentElement: menu,
    role: "menuitem",
    innerText: options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.star : "Star P",
    textContent: options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.star : "StarP",
    attributes: { "data-kind": "button" },
    box: rect(690, 82, 184, 36)
  });
  const menuMarkRead = element("owned-mark-read", {
    parentElement: menu,
    role: "menuitem",
    innerText: options.menuMarkInnerText || (options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.markUnread : "Mark as unread U"),
    textContent: options.menuMarkTextContent || (options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.markUnread : "Mark as unreadU"),
    attributes: {
      "data-kind": "button",
      ...(options.realPuaMenu && options.menuMarkAriaLabel == null
        ? {}
        : { "aria-label": options.menuMarkAriaLabel || "Mark as unread" }),
      ...(options.disableMenuMarkRead ? { disabled: "" } : {})
    },
    box: rect(690, 92, 184, 36)
  });
  const menuRename = element("owned-rename", {
    parentElement: menu,
    role: "menuitem",
    innerText: options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.rename : "Rename R",
    textContent: options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.rename : "RenameR",
    attributes: options.realPuaMenu
      ? { "data-kind": "button" }
      : { "data-kind": "button", "aria-label": "Rename" },
    box: rect(690, 136, 184, 36)
  });
  const menuAddProject = element("owned-add-project", {
    parentElement: menu,
    role: "menuitem",
    innerText: options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.addToProject : "Add to project",
    textContent: options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.addToProject : "Add to project",
    attributes: { "data-kind": "button" },
    box: rect(690, 172, 184, 36)
  });
  const renameTextbox = element("owned-rename-textbox", {
    parentElement: menu,
    role: "textbox",
    text: "Identifier code verification",
    attributes: { contenteditable: "true" },
    box: rect(690, 136, 184, 36)
  });
  const defaultDeleteText = options.realPuaMenu ? CLAUDE_DIA_MENU_LABELS.delete : "Delete";
  const deleteText = options.deleteText ?? defaultDeleteText;
  const deleteAriaLabel = Object.hasOwn(options, "deleteAriaLabel")
    ? options.deleteAriaLabel
    : (options.realPuaMenu ? null : deleteText);
  const deleteItem = element("owned-delete", {
    parentElement: menu,
    role: "menuitem",
    text: deleteText,
    innerText: options.deleteInnerText ?? deleteText,
    textContent: options.deleteTextContent
      ?? (options.realPuaMenu && !Object.hasOwn(options, "deleteText") ? CLAUDE_DIA_MENU_LABELS.deleteCompact : deleteText),
    attributes: {
      "data-kind": "button",
      ...(deleteAriaLabel == null ? {} : { "aria-label": deleteAriaLabel })
    },
    box: rect(690, 190, 184, 40)
  });
  const confirmation = element("owned-confirmation", {
    parentElement: body,
    role: "dialog",
    text: options.confirmationText || "Delete chat Are you sure you want to delete this chat? Cancel Delete",
    box: rect(360, 220, 480, 260)
  });
  const confirmHeading = element("owned-confirm-heading", {
    parentElement: confirmation,
    role: "heading",
    text: options.confirmationHeadingText || "Delete chat",
    box: rect(390, 244, 420, 36)
  });
  const cancelButton = element("owned-cancel", {
    parentElement: confirmation,
    role: "button",
    text: options.cancelText || "Cancel",
    attributes: { "data-kind": "button", "aria-label": options.cancelAriaLabel || options.cancelText || "Cancel" },
    box: rect(570, 420, 110, 38)
  });
  const confirmButton = element("owned-confirm", {
    parentElement: confirmation,
    role: "button",
    text: options.confirmText || "Delete",
    attributes: { "data-kind": "button", "aria-label": options.confirmAriaLabel || options.confirmText || "Delete" },
    box: rect(700, 420, 110, 38)
  });
  const duplicateConfirmButton = element("owned-confirm-duplicate", {
    parentElement: confirmation,
    role: "button",
    text: options.duplicateConfirmText || "Delete",
    attributes: { "data-kind": "button", "aria-label": options.duplicateConfirmAriaLabel || options.duplicateConfirmText || "Delete" },
    box: rect(700, 370, 110, 38)
  });
  duplicateConfirmButton.isConnected = Boolean(options.duplicateConfirmButton);
  const foreignConfirmation = element("foreign-confirmation", {
    parentElement: body,
    role: "dialog",
    text: "Delete chat Are you sure you want to delete this chat? Cancel Delete",
    box: rect(370, 230, 480, 260)
  });
  const foreignConfirmHeading = element("foreign-confirm-heading", {
    parentElement: foreignConfirmation,
    role: "heading",
    text: "Delete chat",
    box: rect(400, 254, 420, 36)
  });
  const foreignCancelButton = element("foreign-cancel", {
    parentElement: foreignConfirmation,
    role: "button",
    text: "Cancel",
    attributes: { "data-kind": "button", "aria-label": "Cancel" },
    box: rect(580, 430, 110, 38)
  });
  const foreignConfirmButton = element("foreign-confirm", {
    parentElement: foreignConfirmation,
    role: "button",
    text: "Delete",
    attributes: { "data-kind": "button", "aria-label": "Delete" },
    box: rect(710, 430, 110, 38)
  });

  const visible = (node) => {
    if (!node?.isConnected) return false;
    if (node === titleControl && options.hiddenTitleEvidence) return false;
    if (node === menu) return state.menuOpen || (options.premountedMenuRoot && !state.premountedMenuDismissed);
    if ([menuStar, menuMarkRead, menuRename, menuAddProject, renameTextbox, deleteItem].includes(node)) return state.menuOpen;
    if ([unrelatedMenu, unrelatedDelete, unrelatedMarkRead, unrelatedRename, unrelatedShortcutDelete].includes(node)) {
      return state.unrelatedMenuOpen;
    }
    if ([confirmation, confirmHeading, cancelButton, confirmButton, duplicateConfirmButton].includes(node)) {
      if (state.confirmationRootReplaced) return false;
      if (node === confirmHeading && options.omitConfirmHeading) return false;
      if (node === cancelButton && options.omitCancelButton) return false;
      if (node === duplicateConfirmButton && !options.duplicateConfirmButton) return false;
      return state.confirmationOpen && !options.unrelatedConfirmationOnly;
    }
    if ([foreignConfirmation, foreignConfirmHeading, foreignCancelButton, foreignConfirmButton].includes(node)) {
      return Boolean((options.concurrentConfirmation || options.unrelatedConfirmationOnly || state.confirmationRootReplaced) && state.confirmationOpen);
    }
    return true;
  };
  const nodeRect = (node) => visible(node) ? node.box : null;
  const menuRoots = () => [
    ...(state.unrelatedMenuOpen ? [unrelatedMenu] : []),
    ...(state.menuOpen || (options.premountedMenuRoot && !state.premountedMenuDismissed) ? [menu] : [])
  ];
  const qsa = (selector, queryRoot = document) => {
    const value = String(selector || "");
    const currentTrigger = state.replacementTriggerActive ? replacementTrigger : trigger;
    if (queryRoot === titleRoot) return [titleControl, currentTrigger];
    if (queryRoot === sidebar) return [sidebarTrigger];
    if (queryRoot === menu) {
      if (!state.menuOpen) return [];
      return [
        ...(options.realPuaMenu ? [menuStar] : []),
        ...(options.omitMenuReadState ? [] : [menuMarkRead]),
        ...(options.omitMenuConversationAction ? [] : [menuRename]),
        ...(options.realPuaMenu ? [menuAddProject] : []),
        deleteItem
      ];
    }
    if (queryRoot === unrelatedMenu) {
      if (!state.unrelatedMenuOpen) return [];
      return options.concurrentSameFingerprintMenu
        ? [unrelatedMarkRead, unrelatedRename, unrelatedShortcutDelete]
        : [unrelatedDelete];
    }
    if (queryRoot === confirmation) {
      if (!state.confirmationOpen || options.unrelatedConfirmationOnly) return [];
      if (/heading|\bh[1-4]\b/i.test(value)) return options.omitConfirmHeading ? [] : [confirmHeading];
      if (/button|role=['\"]button/i.test(value)) {
        return [
          ...(options.omitCancelButton ? [] : [cancelButton]),
          confirmButton,
          ...(options.duplicateConfirmButton ? [duplicateConfirmButton] : [])
        ];
      }
      return [];
    }
    if (queryRoot === foreignConfirmation) {
      if ((!options.concurrentConfirmation && !options.unrelatedConfirmationOnly && !state.confirmationRootReplaced) || !state.confirmationOpen) return [];
      if (/heading|\bh[1-4]\b/i.test(value)) return [foreignConfirmHeading];
      if (/button|role=['\"]button/i.test(value)) return [foreignCancelButton, foreignConfirmButton];
      return [];
    }
    if (queryRoot !== document) return [];
    if (value.includes("chat-title-split") && value.includes("button")) return [titleControl, currentTrigger];
    if (value.includes("chat-title-split")) return options.duplicateTitleRoot ? [titleRoot, { ...titleRoot }] : [titleRoot];
    if (value.includes("role='menu'") || value.includes('role="menu"') || value.includes("data-radix") || value.includes("data-floating")) return menuRoots();
    if (value.includes("aria-label") || value.includes("button") || value.includes("role='button'")) return [sidebarTrigger, currentTrigger];
    return [];
  };
  const eventListeners = new Map();
  const document = {
    body,
    documentElement: body,
    activeElement: body,
    hasFocus: () => options.documentHasFocus !== false,
    addEventListener(type, listener) {
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      eventListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      eventListeners.get(type)?.delete(listener);
    },
    getElementById(id) {
      if (id === menu.id) return menu;
      if (id === unrelatedMenu.id) return unrelatedMenu;
      if (id === confirmation.id) return confirmation;
      if (id === foreignConfirmation.id) return foreignConfirmation;
      return null;
    },
    querySelectorAll(selector) { return qsa(selector, document); },
    querySelector(selector) { return qsa(selector, document)[0] || null; },
    elementFromPoint(x, y) {
      const inside = (node) => {
        const box = nodeRect(node);
        return box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      };
      if (state.confirmationOpen && inside(confirmButton)) return confirmButton;
      if (state.menuOpen && inside(deleteItem)) return options.deleteItemNotTopmost ? body : deleteItem;
      if (state.unrelatedMenuOpen && inside(unrelatedDelete)) return unrelatedDelete;
      return body;
    }
  };
  const elementText = (node) => normalize([
    node?.getAttribute?.("aria-label"),
    node?.getAttribute?.("title"),
    node?.innerText,
    node?.textContent
  ].filter(Boolean).join(" "));
  const clickable = (node) => node;
  const setMenuOpen = (open, config = {}) => {
    state.menuOpen = Boolean(open);
    if (!state.menuOpen) state.premountedMenuDismissed = true;
    for (const node of [trigger, replacementTrigger]) {
      node.setAttribute("aria-expanded", state.menuOpen ? "true" : "false");
      if (!state.menuOpen && (config.removeBinding || options.removeMenuBindingOnClose)) {
        node.removeAttribute("aria-controls");
        node.removeAttribute("aria-owns");
      }
    }
  };
  const dispatchTrustedDeleteD = (overrides = {}) => {
    const event = {
      isTrusted: true,
      key: "d",
      keyCode: 68,
      repeat: false,
      isComposing: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: deleteItem,
      composedPath: () => [deleteItem, menu, body, document],
      ...overrides
    };
    for (const listener of [...(eventListeners.get("keydown") || [])]) listener(event);
    return event;
  };
  const clickAt = (node) => {
    if (node === trigger) {
      state.triggerClicks += 1;
      if (options.routeChangeOnTrigger) state.route = "https://claude.ai/chat/thread-2";
      if (options.concurrentSameFingerprintMenu) state.unrelatedMenuOpen = true;
      if (!options.ignoreTrigger && options.openOwnedMenu !== false) setMenuOpen(options.toggleTrigger ? !state.menuOpen : true);
      document.activeElement = state.menuOpen && !options.menuFocusOutside ? menuMarkRead : body;
      return true;
    }
    if (node === sidebarTrigger) {
      state.sidebarTriggerClicks += 1;
      return true;
    }
    if (node === unrelatedDelete) {
      state.unrelatedDeleteClicks += 1;
      return true;
    }
    if (node === deleteItem) {
      state.deleteClicks += 1;
      if (options.routeChangeOnDelete) state.route = "https://claude.ai/chat/thread-2";
      if (!options.ignoreDelete) {
        setMenuOpen(false);
        state.confirmationOpen = true;
        document.activeElement = confirmButton;
      }
      return true;
    }
    if (node === confirmButton) {
      state.confirmClicks += 1;
      if (!options.ignoreConfirm) state.confirmationOpen = false;
      document.activeElement = body;
      return true;
    }
    return false;
  };
  const focusNode = (node) => {
    if (node === deleteItem) state.deleteFocusCalls += 1;
    if (node === confirmButton) state.confirmFocusCalls += 1;
    if (node === deleteItem && options.ignoreDeleteFocus) return;
    if (node === confirmButton && options.ignoreConfirmFocus) return;
    document.activeElement = node;
    if (node === confirmButton && options.replaceConfirmationRootOnFocus) {
      state.confirmationRootReplaced = true;
      confirmation.isConnected = false;
      confirmHeading.isConnected = false;
      cancelButton.isConnected = false;
      confirmButton.isConnected = false;
    }
    if (node === confirmButton && typeof state.onConfirmFocus === "function") {
      const hook = state.onConfirmFocus;
      state.onConfirmFocus = null;
      hook();
    }
  };
  deleteItem.focus = () => focusNode(deleteItem);
  confirmButton.focus = () => focusNode(confirmButton);
  confirmButton.click = () => {
    state.confirmDomClicks += 1;
    return clickAt(confirmButton);
  };
  const waitFor = async (getter) => {
    state.waitCalls += 1;
    if (typeof state.onWaitStart === "function") {
      const hook = state.onWaitStart;
      state.onWaitStart = null;
      await hook();
    }
    if (state.suppressNextWaitResult) {
      state.suppressNextWaitResult = false;
      return null;
    }
    for (let index = 0; index < 3; index += 1) {
      const value = getter();
      if (value) return value;
    }
    return null;
  };
  const sleep = async () => {
    state.sleepCalls += 1;
    if (options.routeChangeBeforeDelete && state.menuOpen && state.deleteClicks === 0) {
      state.route = "https://claude.ai/chat/thread-2";
    }
  };
  const deleteDialogRoots = () => state.confirmationOpen
    ? state.confirmationRootReplaced
      ? [foreignConfirmation]
      : [
          ...(!options.unrelatedConfirmationOnly ? [confirmation] : []),
          ...(options.concurrentConfirmation || options.unrelatedConfirmationOnly ? [foreignConfirmation] : [])
        ]
    : [];
  const findDeleteConfirmButton = () => state.confirmationOpen ? confirmButton : null;
  const activateConfirmButton = (button, rootNode) => {
    assert.equal(button, confirmButton, "only the owned Claude confirmation button may be activated");
    assert.equal(rootNode, confirmation, "confirmation activation must retain its owned dialog root");
    return clickAt(button);
  };
  const clickDeleteConfirmIfPresent = async (_timeoutMs, guard = null) => {
    if (typeof guard === "function" && guard() !== true) return false;
    if (!state.confirmationOpen) return false;
    return activateConfirmButton(confirmButton, confirmation) && !state.confirmationOpen;
  };
  const trustedMenuClickForElement = (node, reason = "") => ({
    kind: node === trigger ? "conversation-menu-trigger" : "delete-menu-item",
    reason,
    framePoint: { x: node.box.left + node.box.width / 2, y: node.box.top + node.box.height / 2 },
    frameRect: { ...node.box }
  });
  const result = (ok, reason = "") => ({ ok, site: "claude", ...(reason ? { reason } : {}) });
  const deleteResult = (ok, site, reason = "", extra = {}) => ({ ok, site, ...(reason ? { reason } : {}), ...extra });
  const dependencies = {
    qsa,
    normalize,
    compact,
    deleteCompactToken: compact,
    modelRect: nodeRect,
    rect: nodeRect,
    deleteElementText: elementText,
    elementText,
    deleteClickableElement: clickable,
    clickable,
    isDisabledElement: (node) => node?.hasAttribute?.("disabled") === true,
    disabled: (node) => node?.hasAttribute?.("disabled") === true,
    svgSignature: () => "",
    visible,
    deleteLabelMatchesExactish: matchesExactLabelRepeats,
    matchesExactLabelRepeats,
    deleteLabelMatches: (value, labels, config = {}) => config.exact
      ? matchesExactLabelRepeats(value, labels)
      : labels.some((label) => compact(value).includes(compact(label))),
    DELETE_CANCEL_LABELS: ["Cancel", "取消"],
    matches: (node, selector) => node.matches(selector),
    visibleSelectorElements: () => menuRoots().filter(visible),
    deleteClickLayout: clickAt,
    deleteClick: clickAt,
    clickAt,
    closest: (node, selector) => node?.closest?.(selector) || null,
    findDeleteConfirmButton,
    clickDeleteConfirmIfPresent,
    deleteResult,
    dispatchDeleteKeyboardShortcut: () => false,
    clickDeleteConfirmIfAppears: async () => ({ appeared: false, confirmed: false }),
    deleteDialogRoots,
    deleteResultWithTrustedConfirm: (site, reason) => ({
      ok: false,
      site,
      reason,
      needsTrustedClick: true,
      trustedClick: trustedMenuClickForElement(confirmButton, reason)
    }),
    deleteResultWithTrustedDeleteShortcut: (site, reason) => deleteResult(false, site, reason),
    visibleDeleteCandidates: (queryRoot) => qsa("[role='menuitem'],button,[role='button']", queryRoot),
    visibleConfirmCandidates: (queryRoot) => qsa("button,[role='button']", queryRoot),
    modelElementArea: (node) => node.box.width * node.box.height,
    elementArea: (node) => node.box.width * node.box.height,
    modelElementFromPoint: ({ x, y } = {}) => document.elementFromPoint(x, y),
    deleteActivateUntil: async (node, getter) => {
      clickAt(node);
      return waitFor(getter);
    },
    waitForModel: waitFor,
    waitFor,
    sleep,
    deleteResultWithTrustedMenuClick: (site, reason, node) => ({
      ok: false,
      site,
      reason,
      needsTrustedMenuClick: true,
      trustedMenuClick: trustedMenuClickForElement(node, reason)
    }),
    trustedMenuClickForElement,
    result,
    SITE_ID: "claude",
    serializableRect: (box) => ({ ...box }),
    activateConfirmButton
  };
  return {
    options,
    state,
    location,
    document,
    setMenuOpen,
    dispatchTrustedDeleteD,
    nodes: {
      titleRoot,
      titleControl,
      trigger,
      replacementTrigger,
      sidebarTrigger,
      unrelatedMenu,
      unrelatedDelete,
      menu,
      menuStar,
      menuMarkRead,
      menuRename,
      menuAddProject,
      renameTextbox,
      deleteItem,
      confirmation,
      confirmHeading,
      cancelButton,
      confirmButton,
      foreignConfirmation,
      foreignConfirmHeading,
      foreignCancelButton,
      foreignConfirmButton
    },
    dependencies
  };
}

async function standaloneRunner(value) {
  const moduleUrl = `${pathToFileURL(path.join(root, "build-src/topic-delete-claude-helpers.js")).href}?test=${Date.now()}-${Math.random()}`;
  const { CLAUDE_DELETE_USERSCRIPT_HELPERS } = await import(moduleUrl);
  const keys = Object.keys(value.dependencies);
  const factory = new Function(
    ...keys,
    "document",
    "location",
    `"use strict"; ${CLAUDE_DELETE_USERSCRIPT_HELPERS}; return {
      claudeConversationIdFromHref,
      claudeConversationMenuTrigger,
      findClaudeDeleteMenuItem,
      deleteClaude
    };`
  );
  const api = factory(...keys.map((key) => value.dependencies[key]), value.document, value.location);
  return {
    api,
    run: (payload = {}) => api.deleteClaude(payload)
  };
}

async function nativeRunner(value) {
  global.document = value.document;
  global.location = value.location;
  global.window = { innerWidth: 1200, innerHeight: 900 };
  const moduleUrl = `${pathToFileURL(path.join(root, "content-src/capabilities/delete-sites.js")).href}?test=${Date.now()}-${Math.random()}`;
  const { createDeleteSitesCapability } = await import(moduleUrl);
  const api = createDeleteSitesCapability(value.dependencies);
  assert.equal(typeof api.deleteClaudeThread, "function", "native Claude deletion must remain directly testable");
  return {
    api,
    run: (payload = {}) => api.deleteClaudeThread(payload)
  };
}

function expectedPayload(extra = {}) {
  return {
    deleteAttemptId: "attempt-1",
    expectedDeleteIdentity: { provider: "claude", id: "thread-1" },
    ...extra
  };
}

(async () => {
  const standaloneSource = read("build-src/topic-delete-claude-helpers.js");
  const nativeFacadeSource = read("content-src/capabilities/delete-sites.js");
  const nativeSource = read("content-src/capabilities/delete-claude.js");
  const contentRuntimeSource = read("content-src/capabilities/delete-runtime.js");
  const runtimeSource = read("app/topic-delete/runtime.js");
  assert.match(nativeFacadeSource, /import \{ createDeleteClaudeCapability \} from "\.\/delete-claude\.js";/);
  assert.match(nativeFacadeSource, /const \{ deleteClaudeThread \} = createDeleteClaudeCapability\(deps\);/);
  assert.doesNotMatch(nativeFacadeSource, /function claudeConversationIdFromHref/, "the site facade must not retain Claude implementation details");
  for (const [name, source] of Object.entries({ native: nativeSource, standalone: standaloneSource })) {
    assert.match(source, /chat-title-split/, `${name}: the conversation menu must be title-bar scoped`);
    assert.match(source, /More options for\\s/, `${name}: the trigger must use Claude's explicit title-menu label`);
    assert.match(source, /claudeTitleEvidenceMatches/, `${name}: the trigger label must be corroborated by the current chat title`);
    assert.match(source, /claudeDeleteMenuHasConversationFingerprint/, `${name}: a naked Delete item must not identify a conversation menu`);
    assert.match(source, /stable current conversation identity not found/, `${name}: /new and malformed routes must fail closed`);
    assert.match(source, /unverified delete confirmation is already open/, `${name}: existing confirmations must never be adopted`);
    assert.match(source, /conversation-menu-trigger/, `${name}: the first trusted phase must identify the title trigger`);
    assert.match(source, /delete-menu-item/, `${name}: the second trusted phase must identify the exact Delete item`);
    assert.match(source, /addEventListener\("keydown"/, `${name}: Delete D must be observed in the exact isolated document`);
    assert.match(source, /setTimeout\(\(\) => \{[\s\S]*state\.invalid = true;[\s\S]*lease\.expiresAt/, `${name}: the one-shot D observer must expire with its lease`);
    assert.doesNotMatch(source, /claudeLeaseControlsDeleteConfirmation/, `${name}: confirmation ownership must not assume an item/dialog IDREF`);
  }
  assert.match(runtimeSource, /trustedMenuTriggerRetried/, "runtime must track the Claude title-trigger retry independently");
  assert.match(runtimeSource, /trustedMenuClickRetried/, "runtime must retain the Delete-item retry phase");
  assert.match(runtimeSource, /conversation-menu-trigger/, "runtime must route Claude's first trusted phase explicitly");
  assert.match(runtimeSource, /delete-menu-item/, "runtime must route Claude's second trusted phase explicitly");
  assert.match(runtimeSource, /firstKind === "conversation-menu-trigger"/, "only Claude's title trigger may enter the two-phase path");
  assert.match(
    runtimeSource,
    /firstKind !== "delete-menu-item" && firstKind !== "topic-menu-trigger"/,
    "unknown and out-of-contract first-phase kinds must fail closed"
  );
  assert.match(
    runtimeSource,
    /String\(deleteItemClick\?\.kind \|\| ""\)\.trim\(\) !== "delete-menu-item"/,
    "Claude's second trusted phase must be exactly the Delete menu item"
  );
  assert.match(runtimeSource, /payload\?\.trustedMenuTriggerRetried/, "the title-trigger phase must not repeat");
  assert.match(runtimeSource, /payload\?\.trustedMenuClickRetried/, "the Delete-item phase must not repeat");
  assert.match(runtimeSource, /firstClick\.framePoints\?\.length !== 1/, "Claude's title-trigger phase must carry one exact point");
  assert.equal(
    [...runtimeSource.matchAll(
      /trustedMenuClick\(\s*(?:result|triggerResult),\s*completion\?\.attemptId,\s*trustedBridgeDocumentId\(iframe\)\s*\)/g
    )].length,
    2,
    "both trusted phases must remain bound to the same attempt and document"
  );
  assert.match(runtimeSource, /trusted input origin document changed/, "document replacement must reject trusted input");
  assert.match(runtimeSource, /trusted input target conversation changed/, "route replacement must reject trusted input");
  assert.match(
    contentRuntimeSource,
    /trusted Claude Delete D shortcut requires the isolated native Claude runner/,
    "custom and MAIN-world runners must not authorize printable Claude shortcut input"
  );

  const parserFixture = createFixture();
  const parser = (await standaloneRunner(parserFixture)).api.claudeConversationIdFromHref;
  for (const [href, expected] of [
    ["https://claude.ai/chat/thread-1", "thread-1"],
    ["https://www.claude.ai/chat/thread-1?turn=2#answer", "thread-1"],
    ["https://team.claude.ai/chat/thread%20one", "thread one"]
  ]) {
    assert.equal(parser(href), expected, `Claude route identity: ${href}`);
  }
  for (const href of [
    "https://claude.ai/new",
    "https://claude.ai/chat",
    "https://claude.ai/chat/thread-1/extra",
    "https://claude.ai/chat/thread%2Fchild",
    "https://claude.ai/project/thread-1",
    "https://notclaude.ai/chat/thread-1",
    "http://claude.ai/chat/thread-1",
    "javascript:alert(1)"
  ]) {
    assert.equal(parser(href), "", `unsupported Claude route must not invent an identity: ${href}`);
  }

  const runners = [
    { name: "native", create: nativeRunner },
    { name: "standalone", create: standaloneRunner }
  ];
  for (const runner of runners) {
    {
      const value = createFixture({ unrelatedMenu: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, true, `${runner.name}: exact title menu, Delete, and owned confirmation should complete`);
      assert.equal(value.state.triggerClicks, 1);
      assert.equal(value.state.sidebarTriggerClicks, 0, `${runner.name}: a same-named sidebar button must never be activated`);
      assert.equal(value.state.deleteClicks, 1);
      assert.equal(value.state.unrelatedDeleteClicks, 0, `${runner.name}: a pre-existing unrelated Delete must never be activated`);
      assert.equal(value.state.confirmClicks, 1);
    }

    {
      const value = createFixture({ premountedMenuRoot: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, true, `${runner.name}: a reused pre-mounted menu root must be adopted only after it gains Claude's verified menu contents`);
      assert.equal(value.state.triggerClicks, 1);
      assert.equal(value.state.deleteClicks, 1);
      assert.equal(value.state.confirmClicks, 1);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: a reused root must not force a trusted trigger retry`);
    }

    {
      const value = createFixture({ titleOwnsOnly: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, true, `${runner.name}: an unambiguous current-title aria-owns binding must be accepted`);
      assert.equal(value.state.confirmClicks, 1);
    }

    {
      const value = createFixture({ realPuaMenu: true, removeMenuBindingOnClose: true });
      const api = await runner.create(value);
      const shortcut = await api.run(expectedPayload());
      assert.equal(shortcut.ok, false, `${runner.name}: Dia's real PUA-prefixed Delete D item must use its exact keyboard shortcut`);
      assert.equal(shortcut.needsTrustedKeySequence, true);
      assert.equal(shortcut.trustedKeySequence.kind, "claude-menu-delete-shortcut");
      assert.equal(shortcut.trustedKeySequence.site, "claude");
      assert.deepEqual(shortcut.trustedKeySequence.keys, [{ key: "d", settleMs: 420 }]);
      assert.equal(value.document.activeElement, value.nodes.menuMarkRead, `${runner.name}: the initial lease must not assume the menu's current focus is safe`);
      assert.equal(value.state.deleteFocusCalls, 0, `${runner.name}: parent iframe focus must happen before content focuses Delete D`);
      assert.equal(value.state.deleteClicks, 0, `${runner.name}: the shortcut path must not click the unstable Delete node`);

      const preflight = await api.run(expectedPayload({ trustedKeySequencePreflight: true }));
      assert.equal(preflight.needsTrustedKeySequence, true, `${runner.name}: only the still-focused exact Delete D item may pass the one-time preflight`);
      assert.equal(preflight.trustedKeySequence.kind, "claude-menu-delete-shortcut");
      assert.equal(value.document.activeElement, value.nodes.deleteItem, `${runner.name}: preflight must establish exact Delete D focus`);
      assert.equal(value.state.deleteFocusCalls, 1, `${runner.name}: preflight must focus Delete D exactly once`);

      value.dispatchTrustedDeleteD();
      value.setMenuOpen(false);
      assert.equal(value.nodes.trigger.getAttribute("aria-controls"), "", `${runner.name}: live-style closed menu may remove aria-controls after the observed D`);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.confirmButton;
      const completed = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(completed.ok, true, `${runner.name}: only the new strict Claude confirmation may complete after Delete D`);
      assert.equal(value.state.confirmClicks, 1);
      assert.equal(value.state.confirmFocusCalls, 1, `${runner.name}: final confirmation must receive exact focus once`);
      assert.equal(value.state.confirmDomClicks, 1, `${runner.name}: final confirmation must use one structural button click`);
      assert.equal(value.state.deleteClicks, 0);

      const duplicate = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(duplicate.ok, false, `${runner.name}: the consumed D continuation must not confirm twice`);
      assert.equal(value.state.confirmClicks, 1);
    }

    {
      const value = createFixture({
        realPuaMenu: true,
        concurrentSameFingerprintMenu: true,
        openOwnedMenu: false
      });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: a same-shaped sidebar menu must not replace the title trigger's controlled menu`);
      assert.equal(result.needsTrustedKeySequence, undefined);
      assert.equal(value.state.deleteFocusCalls, 0);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0);
    }

    {
      const value = createFixture({ realPuaMenu: true, concurrentConfirmation: true });
      const api = await runner.create(value);
      const shortcut = await api.run(expectedPayload());
      assert.equal(shortcut.needsTrustedKeySequence, true);
      const preflight = await api.run(expectedPayload({ trustedKeySequencePreflight: true }));
      assert.equal(preflight.needsTrustedKeySequence, true);
      value.dispatchTrustedDeleteD();
      value.setMenuOpen(false);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.confirmButton;
      const result = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(result.ok, false, `${runner.name}: two exact post-D confirmations must fail closed`);
      assert.equal(value.state.confirmClicks, 0);
      assert.equal(value.state.confirmDomClicks, 0);
    }

    {
      const value = createFixture({ realPuaMenu: true, replaceConfirmationRootOnFocus: true });
      const api = await runner.create(value);
      assert.equal((await api.run(expectedPayload())).needsTrustedKeySequence, true);
      assert.equal((await api.run(expectedPayload({ trustedKeySequencePreflight: true }))).needsTrustedKeySequence, true);
      value.dispatchTrustedDeleteD();
      value.setMenuOpen(false);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.cancelButton;
      const result = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(result.ok, false, `${runner.name}: focus-time frozen confirmation-root replacement must cancel the final click`);
      assert.equal(value.state.confirmFocusCalls, 1);
      assert.equal(value.state.confirmDomClicks, 0);
      assert.equal(value.state.confirmClicks, 0);
    }

    {
      const value = createFixture({ realPuaMenu: true });
      const api = await runner.create(value);
      assert.equal((await api.run(expectedPayload())).needsTrustedKeySequence, true);
      assert.equal((await api.run(expectedPayload({ trustedKeySequencePreflight: true }))).needsTrustedKeySequence, true);
      value.dispatchTrustedDeleteD();
      value.setMenuOpen(false);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.cancelButton;
      value.state.onConfirmFocus = () => {
        value.state.insertedAttempt = api.run(expectedPayload({ deleteAttemptId: "attempt-2" }));
      };
      const result = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      await value.state.insertedAttempt;
      assert.equal(result.ok, false, `${runner.name}: a new same-route attempt must invalidate the old confirming lease`);
      assert.equal(value.state.confirmFocusCalls, 1);
      assert.equal(value.state.confirmDomClicks, 0, `${runner.name}: the invalidated old continuation must not click`);
      assert.equal(value.state.confirmClicks, 0);
    }

    for (const [focusLabel, focusTarget] of [
      ["Mark as unread", (value) => value.nodes.menuMarkRead],
      ["Rename", (value) => value.nodes.menuRename],
      ["menu root", (value) => value.nodes.menu],
      ["document body", (value) => value.document.body],
      ["rename textbox", (value) => value.nodes.renameTextbox]
    ]) {
      const value = createFixture({ realPuaMenu: true, ignoreDeleteFocus: true });
      const api = await runner.create(value);
      const shortcut = await api.run(expectedPayload());
      assert.equal(shortcut.needsTrustedKeySequence, true);
      value.document.activeElement = focusTarget(value);
      const preflight = await api.run(expectedPayload({ trustedKeySequencePreflight: true }));
      assert.equal(preflight.ok, false, `${runner.name}: ${focusLabel} focus must fail before trusted D`);
      assert.match(preflight.reason, /could not establish exact menu focus|lost its owned menu focus/i, `${runner.name}: ${focusLabel}`);
      assert.equal(preflight.needsTrustedKeySequence, undefined);
      assert.equal(value.state.deleteFocusCalls, 1, `${runner.name}: ${focusLabel} must survive the failed exact-focus attempt`);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0);
    }

    {
      const value = createFixture({ realPuaMenu: true });
      const api = await runner.create(value);
      const shortcut = await api.run(expectedPayload());
      assert.equal(shortcut.needsTrustedKeySequence, true);
      value.state.confirmationOpen = true;
      const preflight = await api.run(expectedPayload({ trustedKeySequencePreflight: true }));
      assert.equal(preflight.ok, false, `${runner.name}: a confirmation that appears before D must invalidate the shortcut lease`);
      assert.match(preflight.reason, /confirmation appeared before trusted Delete D activation/i);
      assert.equal(preflight.needsTrustedKeySequence, undefined);
      assert.equal(value.state.confirmClicks, 0);
    }

    for (const [eventLabel, eventFor] of [
      ["missing event", null],
      ["untrusted event", () => ({ isTrusted: false })],
      ["modified event", () => ({ ctrlKey: true })],
      ["wrong event path", (value) => ({
        target: value.nodes.menuMarkRead,
        composedPath: () => [value.nodes.menuMarkRead, value.nodes.menu, value.document.body, value.document]
      })]
    ]) {
      const value = createFixture({ realPuaMenu: true });
      const api = await runner.create(value);
      assert.equal((await api.run(expectedPayload())).needsTrustedKeySequence, true);
      assert.equal((await api.run(expectedPayload({ trustedKeySequencePreflight: true }))).needsTrustedKeySequence, true);
      if (eventFor) value.dispatchTrustedDeleteD(eventFor(value));
      value.setMenuOpen(false);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.confirmButton;
      const result = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(result.ok, false, `${runner.name}: ${eventLabel} must not release the frozen D lease`);
      assert.match(result.reason, /keydown was not observed/i, `${runner.name}: ${eventLabel}`);
      assert.equal(value.state.confirmDomClicks, 0);
      assert.equal(value.state.confirmClicks, 0);
    }

    for (const [outcomeLabel, keepMenuOpen] of [
      ["menu remains open", true],
      ["menu closes without confirmation", false]
    ]) {
      const value = createFixture({ realPuaMenu: true });
      const api = await runner.create(value);
      const shortcut = await api.run(expectedPayload());
      assert.equal(shortcut.needsTrustedKeySequence, true);
      const preflight = await api.run(expectedPayload({ trustedKeySequencePreflight: true }));
      assert.equal(preflight.needsTrustedKeySequence, true);
      value.dispatchTrustedDeleteD();
      value.setMenuOpen(keepMenuOpen);
      value.state.confirmationOpen = false;
      value.document.activeElement = keepMenuOpen ? value.nodes.deleteItem : value.document.body;
      const unresolved = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(unresolved.ok, false, `${runner.name}: ${outcomeLabel} after D is not success`);
      assert.equal(unresolved.needsTrustedKeySequence, undefined, `${runner.name}: ${outcomeLabel} must not request D again`);
      assert.equal(unresolved.needsTrustedMenuClick, undefined, `${runner.name}: ${outcomeLabel} must not switch to another mutation path`);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0);
      const duplicate = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(duplicate.ok, false, `${runner.name}: ${outcomeLabel} consumes the continuation lease`);
      assert.equal(duplicate.needsTrustedKeySequence, undefined);
    }

    {
      const value = createFixture({ href: "https://claude.ai/new", existingConfirmation: true });
      const result = await (await runner.create(value)).run({ deleteAttemptId: "attempt-1" });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "stable current conversation identity not found");
      assert.equal(value.state.triggerClicks + value.state.deleteClicks + value.state.confirmClicks, 0, `${runner.name}: /new must fail before mutation`);
    }

    for (const triggerLabel of ["More options", "More options for", "More options for project actions"]) {
      const value = createFixture({ triggerLabel });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: a generic or title-mismatched menu label must be rejected`);
      assert.equal(result.reason, "conversation menu trigger not found");
      assert.equal(value.state.triggerClicks, 0);
    }

    {
      const value = createFixture({
        titleText: "Different conversation",
        titleEvidenceLabel: "Different conversation, rename chat"
      });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: the menu label must be corroborated by the current chat title control`);
      assert.equal(result.reason, "conversation menu trigger not found");
      assert.equal(value.state.triggerClicks, 0);
    }

    {
      const value = createFixture({ hiddenTitleEvidence: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: a hidden stale title clone must not corroborate the trigger`);
      assert.equal(result.reason, "conversation menu trigger not found");
      assert.equal(value.state.triggerClicks, 0);
    }

    {
      const value = createFixture();
      const result = await (await runner.create(value)).run({
        deleteAttemptId: "attempt-1",
        expectedDeleteIdentity: { provider: "notion", id: "thread-1" }
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "stable current conversation identity not found");
      assert.equal(value.state.triggerClicks + value.state.deleteClicks + value.state.confirmClicks, 0, `${runner.name}: another provider's identity must fail before mutation`);
    }

    for (const deleteText of ["Delete chat", "删除", "删除聊天"]) {
      const value = createFixture({ deleteText });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, true, `${runner.name}: exact localized Claude action must remain usable: ${deleteText}`);
      assert.equal(value.state.deleteClicks, 1);
      assert.equal(value.state.confirmClicks, 1);
    }

    {
      const value = createFixture({
        deleteText: "Delete D",
        deleteInnerText: "Delete D",
        deleteTextContent: "DeleteD",
        deleteAriaLabel: null,
        confirmText: "Delete",
        confirmAriaLabel: "Delete"
      });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: Claude's observed Delete D shortcut label must use its keyboard path`);
      assert.equal(result.needsTrustedKeySequence, true);
      assert.equal(result.trustedKeySequence.kind, "claude-menu-delete-shortcut");
      assert.equal(value.state.deleteClicks, 0);
      assert.equal(value.state.confirmClicks, 0);
    }

    for (const maliciousLabel of [
      "\uE101 Delete project D",
      "\uE101 Deleted D"
    ]) {
      const value = createFixture({
        realPuaMenu: true,
        deleteText: maliciousLabel,
        deleteInnerText: maliciousLabel,
        deleteTextContent: maliciousLabel,
        deleteAriaLabel: null
      });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: PUA lookalike ${JSON.stringify(maliciousLabel)} must not authorize D`);
      assert.equal(result.needsTrustedKeySequence, undefined);
      assert.equal(result.trustedKeySequence, undefined);
      assert.equal(value.state.deleteFocusCalls, 0);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0);
    }

    for (const conflictingTextContent of ["\uE101 Deleted", "\uE101 DELETED"]) {
      const value = createFixture({ realPuaMenu: true, deleteTextContent: conflictingTextContent });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(
        result.ok,
        false,
        `${runner.name}: an exact raw Delete D value must not override conflicting ${JSON.stringify(conflictingTextContent)}`
      );
      assert.equal(result.needsTrustedKeySequence, undefined);
      assert.equal(value.state.deleteFocusCalls, 0);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0);
    }

    {
      const value = createFixture({ deleteText: "Deleted", deleteAriaLabel: "Deleted" });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: the adjective Deleted must never be treated as the Delete D shortcut`);
      assert.equal(value.state.deleteClicks, 0);
    }

    for (const missingFingerprint of [
      { omitMenuReadState: true },
      { omitMenuConversationAction: true },
      { disableMenuMarkRead: true },
      {
        omitMenuConversationAction: true,
        menuMarkAriaLabel: "Mark as unread",
        menuMarkInnerText: "Rename R",
        menuMarkTextContent: "RenameR"
      }
    ]) {
      const value = createFixture(missingFingerprint);
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: a Delete item without Claude's conversation-menu fingerprint must fail closed`);
      assert.equal(value.state.deleteClicks, 0);
      assert.notEqual(result.trustedMenuClick?.kind, "delete-menu-item");
    }

    {
      const value = createFixture({ existingMenu: true, unrelatedMenu: false, toggleTrigger: true });
      const api = await runner.create(value);
      const result = await api.run(expectedPayload());
      assert.equal(result.ok, false);
      assert.equal(value.state.deleteClicks, 0, `${runner.name}: an already-open menu must not be adopted as this attempt's menu`);
      assert.equal(result.needsTrustedMenuClick, true, `${runner.name}: a failed synthetic title trigger may lease only that trigger`);
      assert.equal(result.trustedMenuClick.kind, "conversation-menu-trigger");
      value.setMenuOpen(true);
      const retried = await api.run(expectedPayload({ trustedMenuTriggerRetried: true }));
      assert.equal(retried.ok, false, `${runner.name}: a trusted title-trigger retry must not adopt an already-open verified baseline menu`);
      assert.equal(value.state.deleteClicks, 0, `${runner.name}: an existing verified menu must remain excluded after the trusted retry`);
    }

    {
      const value = createFixture({ existingConfirmation: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false);
      assert.equal(result.reason, "unverified delete confirmation is already open");
      assert.equal(value.state.triggerClicks + value.state.deleteClicks + value.state.confirmClicks, 0, `${runner.name}: an old confirmation must never be confirmed`);
    }

    for (const deleteText of ["Delete workspace", "Delete project", "Remove account", "删除工作区", "删除项目"]) {
      const value = createFixture({ deleteText, unrelatedMenu: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: ${deleteText} must be rejected`);
      assert.equal(value.state.deleteClicks, 0, `${runner.name}: unrelated destructive action must not be clicked`);
      assert.equal(value.state.unrelatedDeleteClicks, 0, `${runner.name}: baseline Delete must remain untouched`);
    }

    for (const conflictingLabels of [
      { deleteText: "Delete", deleteAriaLabel: "Delete workspace" },
      { deleteText: "Delete project", deleteAriaLabel: "Delete" },
      { deleteText: "Delete", deleteInnerText: "Delete", deleteTextContent: "Delete account" }
    ]) {
      const value = createFixture({ ...conflictingLabels, unrelatedMenu: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false, `${runner.name}: conflicting semantic labels must veto an apparently exact Delete`);
      assert.equal(value.state.deleteClicks, 0);
      assert.equal(value.state.unrelatedDeleteClicks, 0);
      assert.notEqual(result.trustedMenuClick?.kind, "delete-menu-item", `${runner.name}: a semantically conflicting item must never receive trusted coordinates`);
    }

    {
      const value = createFixture({ routeChangeOnTrigger: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false);
      assert.match(result.reason, /current conversation changed/);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0, `${runner.name}: route changes after trigger must stop before Delete`);
    }

    {
      const value = createFixture({ routeChangeBeforeDelete: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false);
      assert.match(result.reason, /current conversation changed/);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0, `${runner.name}: route changes before Delete activation must stop mutation`);
    }

    {
      const value = createFixture({ routeChangeOnDelete: true });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false);
      assert.match(result.reason, /current conversation changed/);
      assert.equal(value.state.confirmClicks, 0, `${runner.name}: route changes after Delete must block confirmation`);
    }

    {
      const value = createFixture({ confirmationText: "Delete project? Cancel Delete", confirmationOpen: false });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false);
      assert.equal(value.state.confirmClicks, 0, `${runner.name}: a non-chat confirmation must not be owned or clicked`);
    }

    for (const [structureLabel, options] of [
      ["missing Delete chat heading", { omitConfirmHeading: true }],
      ["missing exact prompt", { confirmationText: "Delete chat This cannot be undone. Cancel Delete" }],
      ["missing exact Cancel action", { omitCancelButton: true }],
      ["duplicate exact Delete action", { duplicateConfirmButton: true }]
    ]) {
      const value = createFixture({ realPuaMenu: true, ...options });
      const api = await runner.create(value);
      const shortcut = await api.run(expectedPayload());
      assert.equal(shortcut.needsTrustedKeySequence, true);
      const preflight = await api.run(expectedPayload({ trustedKeySequencePreflight: true }));
      assert.equal(preflight.needsTrustedKeySequence, true);
      value.dispatchTrustedDeleteD();
      value.setMenuOpen(false);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.confirmButton;
      const result = await api.run(expectedPayload({ trustedKeySequenceRetried: true }));
      assert.equal(result.ok, false, `${runner.name}: ${structureLabel} must not be treated as Claude's final confirmation`);
      assert.equal(result.needsTrustedClick, undefined, `${runner.name}: malformed confirmation must not fall back to trusted coordinates`);
      assert.equal(value.state.confirmFocusCalls, 0);
      assert.equal(value.state.confirmDomClicks, 0);
      assert.equal(value.state.confirmClicks, 0);
    }

    {
      const value = createFixture({ ignoreTrigger: true, ignoreDelete: true });
      const api = await runner.create(value);
      const triggerFailure = await api.run(expectedPayload());
      assert.equal(triggerFailure.ok, false);
      assert.equal(triggerFailure.needsTrustedMenuClick, true, `${runner.name}: ignored title activation must lease one trusted trigger click`);
      assert.equal(triggerFailure.trustedMenuClick.kind, "conversation-menu-trigger");

      value.setMenuOpen(true);
      const deleteFailure = await api.run(expectedPayload({ trustedMenuTriggerRetried: true }));
      assert.equal(deleteFailure.ok, false);
      assert.equal(deleteFailure.needsTrustedMenuClick, true, `${runner.name}: the first-phase retry may advance to one Delete-item lease: ${JSON.stringify(deleteFailure)}`);
      assert.equal(deleteFailure.trustedMenuClick.kind, "delete-menu-item");
      assert.equal(value.state.triggerClicks, 1, `${runner.name}: title trigger synthetic activation must not repeat on retry`);
      assert.equal(value.state.deleteClicks, 1, `${runner.name}: Delete synthetic activation occurs once after the trusted title click`);

      value.setMenuOpen(false);
      value.state.confirmationOpen = true;
      value.document.activeElement = value.nodes.confirmButton;
      const completed = await api.run(expectedPayload({ trustedMenuTriggerRetried: true, trustedMenuClickRetried: true }));
      assert.equal(completed.ok, true, `${runner.name}: the owned second-phase confirmation may finish once`);
      assert.equal(value.state.confirmClicks, 1);

      const duplicate = await api.run(expectedPayload({ trustedMenuTriggerRetried: true, trustedMenuClickRetried: true }));
      assert.equal(duplicate.ok, false, `${runner.name}: a consumed trusted phase must not be reusable`);
      assert.match(duplicate.reason, /no owned activation lease|already consumed|not expected|trusted/i);
      assert.equal(duplicate.needsTrustedMenuClick, undefined, `${runner.name}: a consumed trusted phase must not renew itself`);
    }

    {
      const value = createFixture({ realPuaMenu: true, ignoreTrigger: true });
      const api = await runner.create(value);
      let insertedResult = null;
      value.state.onWaitStart = async () => {
        value.options.ignoreTrigger = false;
        insertedResult = await api.run(expectedPayload({ deleteAttemptId: "attempt-2" }));
      };
      const replacedFirstClick = await api.run(expectedPayload());
      assert.equal(insertedResult?.needsTrustedKeySequence, true, `${runner.name}: the newer same-route attempt must own the menu it opened`);
      assert.equal(replacedFirstClick.ok, false, `${runner.name}: the superseded first-click attempt must fail closed`);
      assert.match(replacedFirstClick.reason, /lease was replaced/i);
      assert.equal(replacedFirstClick.needsTrustedKeySequence, undefined, `${runner.name}: the old attempt must not adopt the new attempt's menu`);
      assert.equal(value.state.triggerClicks, 2);
      assert.equal(value.state.deleteClicks + value.state.confirmClicks, 0);

      const insertedPreflight = await api.run(expectedPayload({
        deleteAttemptId: "attempt-2",
        trustedKeySequencePreflight: true
      }));
      assert.equal(insertedPreflight.needsTrustedKeySequence, true, `${runner.name}: old-attempt cleanup must retain the newer shortcut lease`);
      const cleanup = await api.run(expectedPayload({
        deleteAttemptId: "attempt-2",
        trustedKeySequenceRetried: true
      }));
      assert.equal(cleanup.ok, false, `${runner.name}: missing trusted D safely consumes the test lease`);
    }

    {
      const value = createFixture({ ignoreTrigger: true });
      const api = await runner.create(value);
      await api.run(expectedPayload());
      value.state.onWaitStart = async () => {
        value.options.ignoreTrigger = false;
        value.state.suppressNextWaitResult = true;
        value.state.insertedAttempt = api.run(expectedPayload({ deleteAttemptId: "attempt-2" }));
        await value.state.insertedAttempt;
      };
      const replacedWhileWaiting = await api.run(expectedPayload({ trustedMenuTriggerRetried: true }));
      assert.equal(replacedWhileWaiting.ok, false, `${runner.name}: a new same-route attempt must replace the old opening-menu lease`);
      assert.match(replacedWhileWaiting.reason, /lease was replaced/i);
      assert.equal(value.state.deleteClicks, 0, `${runner.name}: the old menu continuation must not activate Delete from the new attempt's menu`);
      assert.equal(value.state.deleteFocusCalls, 0, `${runner.name}: the old menu continuation must not lease Delete D from the new attempt's menu`);
      assert.equal(replacedWhileWaiting.needsTrustedKeySequence, undefined);
    }

    {
      const value = createFixture({ ignoreTrigger: true });
      const api = await runner.create(value);
      await api.run(expectedPayload());
      value.setMenuOpen(true);
      const wrongAttempt = await api.run(expectedPayload({ deleteAttemptId: "attempt-2", trustedMenuTriggerRetried: true }));
      assert.equal(wrongAttempt.ok, false, `${runner.name}: a trusted lease cannot cross attempt ids`);
      assert.equal(value.state.deleteClicks, 0);
    }

    {
      const value = createFixture({ ignoreTrigger: true });
      const api = await runner.create(value);
      await api.run(expectedPayload());
      value.setMenuOpen(true);
      value.nodes.trigger.isConnected = false;
      value.nodes.replacementTrigger.isConnected = true;
      value.state.replacementTriggerActive = true;
      const replacedTrigger = await api.run(expectedPayload({ trustedMenuTriggerRetried: true }));
      assert.equal(replacedTrigger.ok, false, `${runner.name}: a same-route title-trigger replacement must invalidate the lease`);
      assert.match(replacedTrigger.reason, /trigger changed|no owned activation lease|trusted/i);
      assert.equal(value.state.deleteClicks, 0);
    }

    {
      const value = createFixture({ ignoreTrigger: true });
      const api = await runner.create(value);
      await api.run(expectedPayload());
      value.setMenuOpen(true);
      value.location.href = "https://claude.ai/chat/thread-2";
      const wrongRoute = await api.run({
        deleteAttemptId: "attempt-1",
        expectedDeleteIdentity: { provider: "claude", id: "thread-2" },
        trustedMenuTriggerRetried: true
      });
      assert.equal(wrongRoute.ok, false, `${runner.name}: a trusted lease cannot cross Claude routes`);
      assert.equal(value.state.deleteClicks, 0);
    }
  }

  console.log("Claude route, title-menu, exact Delete, ownership, and two-phase trusted retry safety: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
