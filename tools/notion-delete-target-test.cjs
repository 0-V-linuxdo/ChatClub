#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${label} must remain directly testable`);
  return source.slice(start, end).trim();
}

function element(id, options = {}) {
  const attributes = { ...(options.attributes || {}) };
  const node = {
    id,
    text: options.text || "",
    innerText: options.innerText ?? options.text ?? "",
    textContent: options.textContent ?? options.text ?? "",
    role: options.role || "",
    parentElement: options.parentElement || null,
    isConnected: true,
    rect: options.rect || { left: 700, top: 60, right: 940, bottom: 96, width: 240, height: 36 },
    getAttribute(name) {
      if (name === "role") return this.role;
      return attributes[name] || "";
    },
    contains(other) {
      for (let current = other; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    },
    closest() {
      return null;
    },
    matches(selector) {
      return selector.includes("button") || (this.role && selector.includes(`[role='${this.role}']`));
    }
  };
  return node;
}

function fixture(options = {}) {
  const state = {
    menuOpen: false,
    confirmationOpen: false,
    triggerActivations: 0,
    deleteActivations: 0,
    unrelatedDeleteActivations: 0,
    confirmActivations: 0,
    confirmGuardChecks: 0,
    routeChangedForConfirm: false,
    ignoreDeleteActivation: Boolean(options.ignoreDeleteActivation)
  };
  const trigger = element("trigger", {
    role: "button",
    attributes: {
      "aria-label": options.triggerLabel || "Delete, rename, and more",
      "aria-haspopup": "menu"
    },
    rect: { left: 944, top: 12, right: 984, bottom: 44, width: 40, height: 32 }
  });
  const menu = element("menu", {
    role: "menu",
    rect: { left: 720, top: 48, right: 984, bottom: 180, width: 264, height: 132 }
  });
  const deleteItem = element("delete-item", {
    role: "menuitem",
    text: options.deleteItemText || "Delete Delete Delete Delete",
    innerText: options.deleteItemInnerText,
    textContent: options.deleteItemTextContent,
    attributes: options.deleteItemAriaLabel ? { "aria-label": options.deleteItemAriaLabel } : {},
    parentElement: menu,
    rect: { left: 736, top: 72, right: 968, bottom: 108, width: 232, height: 36 }
  });
  const deleteItemChild = element("delete-item-child", {
    text: "Delete",
    parentElement: deleteItem,
    rect: { left: 748, top: 78, right: 820, bottom: 102, width: 72, height: 24 }
  });
  const unrelatedMenu = element("unrelated-menu", {
    role: "menu",
    rect: { left: 80, top: 48, right: 344, bottom: 180, width: 264, height: 132 }
  });
  const unrelatedDeleteItem = element("unrelated-delete-item", {
    role: "menuitem",
    text: "Delete",
    parentElement: unrelatedMenu,
    rect: { left: 96, top: 72, right: 328, bottom: 108, width: 232, height: 36 }
  });
  const overlay = element("covering-overlay", {
    rect: { left: 720, top: 48, right: 984, bottom: 180, width: 264, height: 132 }
  });
  const confirmation = element("confirmation", {
    role: "dialog",
    text: "Are you sure you want to delete this chat? Cancel Delete",
    rect: { left: 300, top: 220, right: 700, bottom: 420, width: 400, height: 200 }
  });
  const confirmButton = element("confirm", {
    role: "button",
    text: "Delete",
    parentElement: confirmation,
    rect: { left: 580, top: 360, right: 680, bottom: 396, width: 100, height: 36 }
  });
  const document = {
    body: element("body"),
    getElementById(id) { return options.linkMenuWithAriaControls && id === "owned-menu" ? menu : null; },
    elementFromPoint(x, y) {
      const includes = (node) => x >= node.rect.left && x <= node.rect.right && y >= node.rect.top && y <= node.rect.bottom;
      if (state.confirmationOpen && includes(confirmButton)) return confirmButton;
      if (state.menuOpen && includes(deleteItem)) {
        if (options.coverDeleteItem) return overlay;
        return options.hitDeleteDescendant ? deleteItemChild : deleteItem;
      }
      if (options.unrelatedVisibleDeletePortal && includes(unrelatedDeleteItem)) return unrelatedDeleteItem;
      return this.body;
    }
  };
  if (options.linkMenuWithAriaControls) {
    trigger.getAttribute = (name) => {
      if (name === "role") return trigger.role;
      if (name === "aria-label") return options.triggerLabel || "Delete, rename, and more";
      if (name === "aria-haspopup") return "menu";
      if (name === "aria-controls") return "owned-menu";
      return "";
    };
  }
  const location = { href: "https://app.notion.com/chat?t=thread-1" };
  const visible = (node) => {
    if (node === menu || node === deleteItem || node === deleteItemChild || node === overlay) return state.menuOpen;
    if (node === unrelatedMenu || node === unrelatedDeleteItem) return Boolean(options.unrelatedVisibleDeletePortal);
    if (node === confirmation || node === confirmButton) return state.confirmationOpen;
    return Boolean(node?.isConnected);
  };
  const rect = (node) => visible(node) ? node.rect : null;
  const qsa = (_selector, queryRoot = document) => {
    if (queryRoot === menu) return state.menuOpen ? [deleteItem, deleteItemChild] : [];
    if (queryRoot === unrelatedMenu) return options.unrelatedVisibleDeletePortal ? [unrelatedDeleteItem] : [];
    if (queryRoot === confirmation) return state.confirmationOpen ? [confirmButton] : [];
    if (queryRoot === document) return [trigger];
    return [];
  };
  const menuRoots = () => [
    ...(options.unrelatedVisibleDeletePortal ? [unrelatedMenu] : []),
    ...(state.menuOpen ? [menu] : [])
  ];
  const openMenu = (node, getter) => {
    assert.equal(node, trigger, "the Notion trigger must open the menu before Delete is resolved");
    state.triggerActivations += 1;
    state.menuOpen = true;
    return getter();
  };
  const activateDelete = (node) => {
    if (node === unrelatedDeleteItem) {
      state.unrelatedDeleteActivations += 1;
      return true;
    }
    assert.equal(node, deleteItem, "only the exact Delete menu item may be activated");
    state.deleteActivations += 1;
    if (!state.ignoreDeleteActivation) {
      state.menuOpen = false;
      state.confirmationOpen = true;
    }
    return true;
  };
  const clickable = (node) => node === deleteItemChild ? deleteItem : node;
  const finishConfirmation = async (_timeoutMs, guard = null) => {
    state.confirmGuardChecks += 1;
    if (options.routeChangeBeforeConfirmGuard && !state.routeChangedForConfirm) {
      state.routeChangedForConfirm = true;
      location.href = "https://app.notion.com/chat?t=thread-2";
    }
    if (typeof guard === "function" && guard() !== true) return false;
    if (!state.confirmationOpen) return false;
    state.confirmActivations += 1;
    state.confirmationOpen = false;
    return true;
  };
  return {
    state,
    trigger,
    menu,
    deleteItem,
    deleteItemChild,
    unrelatedMenu,
    unrelatedDeleteItem,
    overlay,
    confirmation,
    confirmButton,
    document,
    location,
    visible,
    rect,
    qsa,
    clickable,
    elementFromPoint: (point) => document.elementFromPoint(point?.x, point?.y),
    menuRoots,
    openMenu,
    activateDelete,
    finishConfirmation
  };
}

function compact(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function repeatedExactLabel(value, labels) {
  const token = compact(value);
  return labels.some((label) => {
    const wanted = compact(label);
    if (!wanted || !token || token.length % wanted.length !== 0) return false;
    const repeats = token.length / wanted.length;
    return repeats >= 1 && repeats <= 6 && token === wanted.repeat(repeats);
  });
}

function nativeDependencies(value) {
  const text = (node) => {
    if (node === value.trigger) return node.getAttribute("aria-label");
    return node?.text || "";
  };
  return {
    qsa: value.qsa,
    normalize: (input) => String(input || "").replace(/\s+/g, " ").trim(),
    deleteCompactToken: compact,
    modelRect: value.rect,
    modelElementFromPoint: value.elementFromPoint,
    deleteElementText: text,
    deleteClickableElement: value.clickable,
    isDisabledElement: () => false,
    svgSignature: () => "",
    visible: value.visible,
    deleteLabelMatchesExactish: (input, labels) => repeatedExactLabel(input, labels),
    deleteLabelMatches: (input, labels, options = {}) => options.exact
      ? repeatedExactLabel(input, labels)
      : labels.some((label) => compact(input).includes(compact(label))),
    DELETE_CANCEL_LABELS: ["Cancel", "取消"],
    matches: (node, selector) => node.matches(selector),
    visibleSelectorElements: () => value.menuRoots().filter(value.visible),
    deleteClickLayout: () => false,
    sleep: async () => {},
    deleteClick: value.activateDelete,
    closest: () => null,
    findDeleteConfirmButton: () => value.state.confirmationOpen ? value.confirmButton : null,
    clickDeleteConfirmIfPresent: value.finishConfirmation,
    deleteResult: (ok, site, reason = "", extra = {}) => ({ ok, site, ...(reason ? { reason } : {}), ...extra }),
    dispatchDeleteKeyboardShortcut: () => false,
    clickDeleteConfirmIfAppears: async () => ({ appeared: false, confirmed: false }),
    deleteDialogRoots: () => value.state.confirmationOpen ? [value.confirmation] : [],
    deleteResultWithTrustedConfirm: (site, reason) => ({
      ok: false,
      site,
      reason,
      needsTrustedClick: true,
      trustedClick: { nodeId: value.confirmButton.id }
    }),
    deleteResultWithTrustedDeleteShortcut: (site, reason) => ({ ok: false, site, reason }),
    visibleDeleteCandidates: () => [],
    modelElementArea: (node) => node.rect.width * node.rect.height,
    deleteActivateUntil: async (node, getter) => value.openMenu(node, getter),
    waitForModel: async (getter) => getter(),
    deleteResultWithTrustedMenuClick: (site, reason, node) => ({
      ok: false,
      site,
      reason,
      needsTrustedMenuClick: true,
      trustedMenuClick: { nodeId: node.id }
    })
  };
}

function standaloneRunner(source, value) {
  const notionSource = section(
    source,
    "  const NOTION_DELETE_MENU_ROOT_SELECTOR",
    "\n  function deepSeekChatId",
    "standalone Notion delete state machine"
  );
  assert.doesNotMatch(notionSource, /openTriggerAndClickDelete\(/, "standalone Notion must not use the global contains-match menu helper");
  const factory = new Function(
    "compact",
    "visible",
    "rect",
    "deleteDialogRoots",
    "document",
    "elementArea",
    "disabled",
    "clickable",
    "elementText",
    "qsa",
    "location",
    "clickUntil",
    "sleep",
    "waitFor",
    "findDeleteConfirmButton",
    "trustedMenuClickForElement",
    "result",
    "clickDeleteConfirmIfPresent",
    "resultWithTrustedDeleteConfirm",
    "topRightMenuTrigger",
    "clickAt",
    `"use strict"; ${notionSource}; return { deleteNotion, findNotionDeleteMenuItem, notionDeleteLabelMatchesExact };`
  );
  const api = factory(
    compact,
    value.visible,
    value.rect,
    () => value.state.confirmationOpen ? [value.confirmation] : [],
    value.document,
    (node) => node.rect.width * node.rect.height,
    () => false,
    value.clickable,
    (node) => node === value.trigger ? node.getAttribute("aria-label") : node?.text || "",
    (selector, queryRoot) => selector.includes("role='menu'") && queryRoot === value.document
      ? value.menuRoots().filter(value.visible)
      : value.qsa(selector, queryRoot),
    value.location,
    async (node, getter) => value.openMenu(node, getter),
    async () => {},
    async (getter) => getter(),
    () => value.state.confirmationOpen ? value.confirmButton : null,
    (node, reason) => ({ nodeId: node.id, reason }),
    (ok, reason = "") => ({ ok, site: "notion", ...(reason ? { reason } : {}) }),
    value.finishConfirmation,
    (reason) => ({
      ok: false,
      site: "notion",
      reason,
      needsTrustedClick: true,
      trustedClick: { nodeId: value.confirmButton.id }
    }),
    () => value.trigger,
    value.activateDelete
  );
  return api;
}

(async () => {
  global.document = null;
  global.window = { innerWidth: 1000 };
  global.location = null;
  const moduleUrl = `${pathToFileURL(path.join(root, "content-src/capabilities/delete-sites.js")).href}?test=${Date.now()}`;
  const { createDeleteSitesCapability } = await import(moduleUrl);
  const standaloneSource = read("build-src/topic-delete-userscript-engine-sites.js");

  const expectedIdentity = { expectedDeleteIdentity: { provider: "notion", id: "thread-1" } };
  const runners = [
    {
      name: "native",
      create(value) {
        global.document = value.document;
        global.location = value.location;
        const api = createDeleteSitesCapability(nativeDependencies(value));
        return { run: (payload = expectedIdentity) => api.deleteNotionThread(payload) };
      }
    },
    {
      name: "standalone",
      create(value) {
        const api = standaloneRunner(standaloneSource, value);
        return { api, run: (payload = expectedIdentity) => api.deleteNotion(payload) };
      }
    }
  ];

  for (const runner of runners) {
    {
      const value = fixture({ unrelatedVisibleDeletePortal: true, hitDeleteDescendant: true });
      const result = await runner.create(value).run();
      assert.equal(result.ok, true, `${runner.name}: the newly opened owned portal must win over an unrelated visible Delete portal`);
      assert.equal(value.state.triggerActivations, 1, `${runner.name}: the Delete-bearing trigger label must not be mistaken for the menu item`);
      assert.equal(value.state.deleteActivations, 1);
      assert.equal(value.state.unrelatedDeleteActivations, 0, `${runner.name}: a baseline Delete portal must never be activated`);
      assert.equal(value.state.confirmActivations, 1);
      assert.ok(value.state.confirmGuardChecks > 0, `${runner.name}: confirmation must be protected by the owned route/root guard`);
    }

    {
      const value = fixture({ ignoreDeleteActivation: true });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "delete menu item did not open confirmation");
      assert.equal(result.needsTrustedMenuClick, true, `${runner.name}: an ignored synthetic activation must lease one exact trusted click`);
      assert.equal(result.trustedMenuClick.nodeId, "delete-item");
      assert.equal(value.state.menuOpen, true);
    }

    {
      const value = fixture({ coverDeleteItem: true });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "owned delete menu item not found");
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: a covered/stale menu item must fail the center hit-test`);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: covered coordinates must not be leased`);
    }

    {
      const value = fixture({ ignoreDeleteActivation: true });
      value.state.menuOpen = true;
      const result = await runner.create(value).run({ ...expectedIdentity, trustedMenuClickRetried: true });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "trusted delete menu click did not open an owned confirmation");
      assert.equal(value.state.triggerActivations, 0, `${runner.name}: trusted retry must not reopen the menu`);
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: trusted retry must not repeat Delete`);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: trusted retry must not renew itself`);
    }

    {
      const value = fixture();
      value.state.confirmationOpen = true;
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "unverified delete confirmation is already open");
      assert.equal(value.state.triggerActivations, 0);
      assert.equal(value.state.deleteActivations, 0);
      assert.equal(value.state.confirmActivations, 0, `${runner.name}: a pre-existing confirmation must fail closed`);
    }

    {
      const value = fixture({ routeChangeBeforeConfirmGuard: true });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "current conversation changed during delete confirmation");
      assert.equal(value.state.confirmActivations, 0, `${runner.name}: route changes must block confirmation activation`);
      assert.equal(result.needsTrustedClick, undefined, `${runner.name}: route changes must not lease global confirm coordinates`);
    }

    {
      const value = fixture();
      value.location.href = "https://app.notion.com/chat";
      value.state.confirmationOpen = true;
      const result = await runner.create(value).run({});
      assert.equal(result.ok, false);
      assert.equal(result.reason, "stable current conversation identity not found");
      assert.equal(value.state.confirmActivations, 0, `${runner.name}: missing identity must fail before confirmation`);
    }

    {
      const value = fixture();
      value.state.confirmationOpen = true;
      const result = await runner.create(value).run({
        expectedDeleteIdentity: { provider: "gemini", id: "thread-1" }
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "stable current conversation identity not found");
      assert.equal(value.state.confirmActivations, 0, `${runner.name}: a non-Notion expected identity must fail closed`);
    }

    {
      const value = fixture();
      value.state.confirmationOpen = true;
      const result = await runner.create(value).run({ ...expectedIdentity, trustedMenuClickRetried: true });
      assert.equal(result.ok, true, `${runner.name}: a correlated trusted-menu retry may finish its resulting confirmation`);
      assert.equal(value.state.triggerActivations, 0);
      assert.equal(value.state.deleteActivations, 0);
      assert.equal(value.state.confirmActivations, 1);
    }

    {
      const value = fixture({ deleteItemText: "delete-button Delete" });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "owned delete menu item not found");
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: label matching must reject contains matches with unrelated tokens`);
    }

    {
      const value = fixture({ deleteItemText: "Delete workspace" });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "owned delete menu item not found");
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: descendant Delete text must not whitelist a broader clickable parent`);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: a broader clickable parent must not lease trusted coordinates`);
    }

    {
      const value = fixture({ deleteItemText: "Delete", deleteItemAriaLabel: "Delete workspace" });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "owned delete menu item not found");
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: a non-exact authoritative aria-label must veto exact visible text`);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: vetoed authoritative labels must not lease trusted coordinates`);
    }

    {
      const value = fixture({
        deleteItemText: "Delete",
        deleteItemInnerText: "Delete",
        deleteItemTextContent: "Delete workspace"
      });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "owned delete menu item not found");
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: broader target textContent must veto exact innerText`);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: divergent broader target text must not lease trusted coordinates`);
    }

    {
      const value = fixture({
        deleteItemText: "Delete workspace",
        deleteItemAriaLabel: "Delete"
      });
      const result = await runner.create(value).run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, "owned delete menu item not found");
      assert.equal(value.state.deleteActivations, 0, `${runner.name}: exact aria-label must not override broader visible target text`);
      assert.equal(result.needsTrustedMenuClick, undefined, `${runner.name}: broader visible text must veto trusted coordinates`);
    }
  }

  {
    const value = fixture();
    const api = standaloneRunner(standaloneSource, value);
    assert.equal(api.notionDeleteLabelMatchesExact("Delete Delete topic"), true, "mixed repetitions of allowed labels must remain exact");
    assert.equal(api.notionDeleteLabelMatchesExact("delete-button Delete"), false, "unrelated words must not turn contains matching back on");
  }

  console.log("Notion Delete exact menu targeting and activation outcomes: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
