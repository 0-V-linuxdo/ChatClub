#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n?/g, "\n");
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const compact = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");

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
    triggerClicks: 0,
    sidebarTriggerClicks: 0,
    deleteClicks: 0,
    unrelatedDeleteClicks: 0,
    confirmClicks: 0,
    waitCalls: 0,
    sleepCalls: 0,
    replacementTriggerActive: false
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
      "aria-haspopup": "menu"
    },
    box: rect(824, 24, 40, 36)
  });
  const replacementTrigger = element("replacement-title-trigger", {
    parentElement: titleRoot,
    attributes: {
      "data-kind": "button",
      "aria-label": options.triggerLabel || "More options for Identifier code verification",
      "aria-haspopup": "menu"
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
      "aria-haspopup": "menu"
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
  const menu = element("owned-menu", {
    parentElement: body,
    role: "menu",
    box: rect(672, 74, 220, 180)
  });
  const menuMarkRead = element("owned-mark-read", {
    parentElement: menu,
    role: "menuitem",
    innerText: options.menuMarkInnerText || "Mark as unread U",
    textContent: options.menuMarkTextContent || "Mark as unreadU",
    attributes: {
      "data-kind": "button",
      "aria-label": options.menuMarkAriaLabel || "Mark as unread",
      ...(options.disableMenuMarkRead ? { disabled: "" } : {})
    },
    box: rect(690, 92, 184, 36)
  });
  const menuRename = element("owned-rename", {
    parentElement: menu,
    role: "menuitem",
    innerText: "Rename R",
    textContent: "RenameR",
    attributes: { "data-kind": "button", "aria-label": "Rename" },
    box: rect(690, 136, 184, 36)
  });
  const deleteItem = element("owned-delete", {
    parentElement: menu,
    role: "menuitem",
    text: options.deleteText || "Delete",
    innerText: options.deleteInnerText,
    textContent: options.deleteTextContent,
    attributes: {
      "data-kind": "button",
      ...(options.deleteAriaLabel === null ? {} : { "aria-label": options.deleteAriaLabel || options.deleteText || "Delete" })
    },
    box: rect(690, 190, 184, 40)
  });
  const confirmation = element("owned-confirmation", {
    parentElement: body,
    role: "dialog",
    text: options.confirmationText || "Delete chat? This action cannot be undone. Cancel Delete",
    box: rect(360, 220, 480, 260)
  });
  const confirmButton = element("owned-confirm", {
    parentElement: confirmation,
    role: "button",
    text: options.confirmText || "Delete",
    attributes: { "data-kind": "button", "aria-label": options.confirmAriaLabel || options.confirmText || "Delete" },
    box: rect(700, 420, 110, 38)
  });

  const visible = (node) => {
    if (!node?.isConnected) return false;
    if (node === titleControl && options.hiddenTitleEvidence) return false;
    if (node === menu || node === menuMarkRead || node === menuRename || node === deleteItem) return state.menuOpen;
    if (node === unrelatedMenu || node === unrelatedDelete) return options.unrelatedMenu !== false;
    if (node === confirmation || node === confirmButton) return state.confirmationOpen;
    return true;
  };
  const nodeRect = (node) => visible(node) ? node.box : null;
  const menuRoots = () => [
    ...(options.unrelatedMenu !== false ? [unrelatedMenu] : []),
    ...(state.menuOpen ? [menu] : [])
  ];
  const qsa = (selector, queryRoot = document) => {
    const value = String(selector || "");
    const currentTrigger = state.replacementTriggerActive ? replacementTrigger : trigger;
    if (queryRoot === titleRoot) return [titleControl, currentTrigger];
    if (queryRoot === sidebar) return [sidebarTrigger];
    if (queryRoot === menu) {
      if (!state.menuOpen) return [];
      return [
        ...(options.omitMenuReadState ? [] : [menuMarkRead]),
        ...(options.omitMenuConversationAction ? [] : [menuRename]),
        deleteItem
      ];
    }
    if (queryRoot === unrelatedMenu) return options.unrelatedMenu !== false ? [unrelatedDelete] : [];
    if (queryRoot === confirmation) return state.confirmationOpen ? [confirmButton] : [];
    if (queryRoot !== document) return [];
    if (value.includes("chat-title-split") && value.includes("button")) return [titleControl, currentTrigger];
    if (value.includes("chat-title-split")) return options.duplicateTitleRoot ? [titleRoot, { ...titleRoot }] : [titleRoot];
    if (value.includes("role='menu'") || value.includes('role="menu"') || value.includes("data-radix") || value.includes("data-floating")) return menuRoots();
    if (value.includes("aria-label") || value.includes("button") || value.includes("role='button'")) return [sidebarTrigger, currentTrigger];
    return [];
  };
  const document = {
    body,
    documentElement: body,
    getElementById() { return null; },
    querySelectorAll(selector) { return qsa(selector, document); },
    querySelector(selector) { return qsa(selector, document)[0] || null; },
    elementFromPoint(x, y) {
      const inside = (node) => {
        const box = nodeRect(node);
        return box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      };
      if (state.confirmationOpen && inside(confirmButton)) return confirmButton;
      if (state.menuOpen && inside(deleteItem)) return deleteItem;
      if (options.unrelatedMenu !== false && inside(unrelatedDelete)) return unrelatedDelete;
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
  const clickAt = (node) => {
    if (node === trigger) {
      state.triggerClicks += 1;
      if (options.routeChangeOnTrigger) state.route = "https://claude.ai/chat/thread-2";
      if (!options.ignoreTrigger) state.menuOpen = true;
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
        state.menuOpen = false;
        state.confirmationOpen = true;
      }
      return true;
    }
    if (node === confirmButton) {
      state.confirmClicks += 1;
      if (!options.ignoreConfirm) state.confirmationOpen = false;
      return true;
    }
    return false;
  };
  const waitFor = async (getter) => {
    state.waitCalls += 1;
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
  const deleteDialogRoots = () => state.confirmationOpen ? [confirmation] : [];
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
    nodes: {
      titleRoot,
      titleControl,
      trigger,
      replacementTrigger,
      sidebarTrigger,
      unrelatedMenu,
      unrelatedDelete,
      menu,
      menuMarkRead,
      menuRename,
      deleteItem,
      confirmation,
      confirmButton
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
      const value = createFixture({ deleteText, confirmText: deleteText, confirmAriaLabel: deleteText });
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
      assert.equal(result.ok, true, `${runner.name}: Claude's observed Delete D shortcut label must remain usable`);
      assert.equal(value.state.deleteClicks, 1);
      assert.equal(value.state.confirmClicks, 1);
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
      const value = createFixture({ existingMenu: true, unrelatedMenu: false });
      const result = await (await runner.create(value)).run(expectedPayload());
      assert.equal(result.ok, false);
      assert.equal(value.state.deleteClicks, 0, `${runner.name}: an already-open menu must not be adopted as this attempt's menu`);
      assert.equal(result.needsTrustedMenuClick, true, `${runner.name}: a failed synthetic title trigger may lease only that trigger`);
      assert.equal(result.trustedMenuClick.kind, "conversation-menu-trigger");
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

    {
      const value = createFixture({ ignoreTrigger: true, ignoreDelete: true });
      const api = await runner.create(value);
      const triggerFailure = await api.run(expectedPayload());
      assert.equal(triggerFailure.ok, false);
      assert.equal(triggerFailure.needsTrustedMenuClick, true, `${runner.name}: ignored title activation must lease one trusted trigger click`);
      assert.equal(triggerFailure.trustedMenuClick.kind, "conversation-menu-trigger");

      value.state.menuOpen = true;
      const deleteFailure = await api.run(expectedPayload({ trustedMenuTriggerRetried: true }));
      assert.equal(deleteFailure.ok, false);
      assert.equal(deleteFailure.needsTrustedMenuClick, true, `${runner.name}: the first-phase retry may advance to one Delete-item lease`);
      assert.equal(deleteFailure.trustedMenuClick.kind, "delete-menu-item");
      assert.equal(value.state.triggerClicks, 1, `${runner.name}: title trigger synthetic activation must not repeat on retry`);
      assert.equal(value.state.deleteClicks, 1, `${runner.name}: Delete synthetic activation occurs once after the trusted title click`);

      value.state.menuOpen = false;
      value.state.confirmationOpen = true;
      const completed = await api.run(expectedPayload({ trustedMenuTriggerRetried: true, trustedMenuClickRetried: true }));
      assert.equal(completed.ok, true, `${runner.name}: the owned second-phase confirmation may finish once`);
      assert.equal(value.state.confirmClicks, 1);

      const duplicate = await api.run(expectedPayload({ trustedMenuTriggerRetried: true, trustedMenuClickRetried: true }));
      assert.equal(duplicate.ok, false, `${runner.name}: a consumed trusted phase must not be reusable`);
      assert.match(duplicate.reason, /no owned activation lease|already consumed|not expected|trusted/i);
      assert.equal(duplicate.needsTrustedMenuClick, undefined, `${runner.name}: a consumed trusted phase must not renew itself`);
    }

    {
      const value = createFixture({ ignoreTrigger: true });
      const api = await runner.create(value);
      await api.run(expectedPayload());
      value.state.menuOpen = true;
      const wrongAttempt = await api.run(expectedPayload({ deleteAttemptId: "attempt-2", trustedMenuTriggerRetried: true }));
      assert.equal(wrongAttempt.ok, false, `${runner.name}: a trusted lease cannot cross attempt ids`);
      assert.equal(value.state.deleteClicks, 0);
    }

    {
      const value = createFixture({ ignoreTrigger: true });
      const api = await runner.create(value);
      await api.run(expectedPayload());
      value.state.menuOpen = true;
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
      value.state.menuOpen = true;
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
