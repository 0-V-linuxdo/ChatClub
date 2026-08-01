#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const EXTENSION_ID = "chatclub-test-extension";
const EXTENSION_URL = `chrome-extension://${EXTENSION_ID}/chatClub.html`;
const TAB_ID = 7;
const FRAME_ID = 11;
const FRAME_BINDING_ID = "a".repeat(64);
const BROWSER_DOCUMENT_ID = "browser-document-1";
const BRIDGE_DOCUMENT_ID = "bridge-document-1";
const FRAME_HREF = "https://chat.deepseek.com/a/chat/s/topic-1";
const CLAUDE_FRAME_HREF = "https://claude.ai/chat/thread-1";
const NOTION_FRAME_HREF = "https://app.notion.com/chat?t=thread-1";
const NOTION_FRAME_NAVIGATION_HREF = `${NOTION_FRAME_HREF}&__chatclub_frame_load_nonce=ccn-${"c".repeat(32)}`;
const CLAUDE_DIA_MENU_LABELS = Object.freeze({
  star: "\uE0E7 Star P",
  markUnread: "\uE06A Mark as unread U",
  rename: "\uE064 Rename R",
  addToProject: "\uE0C9 Add to project \uE02A",
  delete: "\uE101 Delete D",
  deleteCompact: "\uE101 DeleteD"
});

const sender = Object.freeze({
  id: EXTENSION_ID,
  url: EXTENSION_URL,
  frameId: 0,
  tab: Object.freeze({ id: TAB_ID, url: EXTENSION_URL })
});

function message(overrides = {}) {
  return {
    tabId: TAB_ID,
    expectedFrameId: FRAME_ID,
    expectedBindingId: FRAME_BINDING_ID,
    expectedBrowserDocumentId: BROWSER_DOCUMENT_ID,
    expectedBridgeDocumentId: BRIDGE_DOCUMENT_ID,
    expectedFrameHref: FRAME_HREF,
    x: 200,
    y: 140,
    hoverSettleMs: 0,
    keys: [{ key: "Enter", settleMs: 0 }],
    keySettleMs: 0,
    ...overrides
  };
}

function createAttestationElement(id, options = {}) {
  const attributes = { ...(options.attributes || {}) };
  const node = {
    id,
    role: options.role || "",
    parentElement: options.parentElement || null,
    isConnected: true,
    disabled: Boolean(options.disabled),
    innerText: options.innerText ?? options.text ?? "",
    textContent: options.textContent ?? options.text ?? "",
    getAttribute(name) {
      if (name === "role") return this.role;
      return Object.hasOwn(attributes, name) ? attributes[name] : "";
    },
    getBoundingClientRect() {
      return { left: 10, top: 10, right: 210, bottom: 50, width: 200, height: 40 };
    },
    contains(other) {
      for (let current = other; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    },
    querySelectorAll() { return []; }
  };
  return node;
}

function createClaudeAttestationWindow(options = {}) {
  const body = createAttestationElement("body");
  const titleRoot = createAttestationElement("title-root", {
    parentElement: body,
    attributes: { "data-testid": "chat-title-split" }
  });
  const titleTrigger = createAttestationElement("title-trigger", {
    parentElement: titleRoot,
    attributes: {
      "aria-label": "More options for Identifier code verification",
      "aria-expanded": options.titleExpanded === false ? "false" : "true",
      ...(options.titleOwnsOnly
        ? { "aria-owns": options.titleControlsId || "menu" }
        : { "aria-controls": options.titleControlsId || "menu" })
    }
  });
  const menu = createAttestationElement("menu", { parentElement: body, role: "menu" });
  const unrelatedMenu = createAttestationElement("unrelated-menu", { parentElement: body, role: "menu" });
  const star = createAttestationElement("star", {
    parentElement: menu,
    role: "menuitem",
    text: CLAUDE_DIA_MENU_LABELS.star
  });
  const markUnread = createAttestationElement("mark-unread", {
    parentElement: menu,
    role: "menuitem",
    text: CLAUDE_DIA_MENU_LABELS.markUnread
  });
  const rename = createAttestationElement("rename", {
    parentElement: menu,
    role: "menuitem",
    text: CLAUDE_DIA_MENU_LABELS.rename
  });
  const addToProject = createAttestationElement("add-to-project", {
    parentElement: menu,
    role: "menuitem",
    text: CLAUDE_DIA_MENU_LABELS.addToProject
  });
  const combinedFingerprint = createAttestationElement("combined-fingerprint", {
    parentElement: menu,
    role: "menuitem",
    innerText: CLAUDE_DIA_MENU_LABELS.markUnread,
    textContent: CLAUDE_DIA_MENU_LABELS.markUnread,
    attributes: { "aria-label": CLAUDE_DIA_MENU_LABELS.rename }
  });
  const deleteLabel = options.deleteLabel ?? CLAUDE_DIA_MENU_LABELS.delete;
  const deleteItem = createAttestationElement("delete", {
    parentElement: menu,
    role: "menuitem",
    innerText: options.deleteInnerText ?? deleteLabel,
    textContent: options.deleteTextContent
      ?? (!Object.hasOwn(options, "deleteLabel") ? CLAUDE_DIA_MENU_LABELS.deleteCompact : deleteLabel),
    attributes: {
      ...(Object.hasOwn(options, "deleteAriaLabel") ? { "aria-label": options.deleteAriaLabel } : {}),
      ...(Object.hasOwn(options, "deleteTitle") ? { title: options.deleteTitle } : {})
    }
  });
  const renameTextbox = createAttestationElement("rename-textbox", {
    parentElement: menu,
    role: "textbox",
    text: "Identifier code verification"
  });
  const items = options.sameFingerprintNode
    ? [combinedFingerprint, deleteItem]
    : [star, markUnread, rename, addToProject, deleteItem];
  menu.querySelectorAll = () => items;
  titleRoot.querySelectorAll = () => [titleTrigger];
  const nodes = {
    body,
    titleRoot,
    titleTrigger,
    menu,
    unrelatedMenu,
    star,
    markUnread,
    rename,
    addToProject,
    combinedFingerprint,
    deleteItem,
    renameTextbox
  };
  const focusName = options.focus || "deleteItem";
  const document = {
    body,
    documentElement: body,
    activeElement: nodes[focusName] || body,
    hasFocus: () => options.documentHasFocus !== false,
    getElementById(id) {
      if (id === menu.id) return menu;
      if (id === unrelatedMenu.id) return unrelatedMenu;
      return null;
    },
    querySelectorAll(selector) {
      return String(selector || "").includes("chat-title-split") ? [titleRoot] : [menu, unrelatedMenu];
    }
  };
  const window = {
    document,
    location: { href: CLAUDE_FRAME_HREF },
    __CHATCLUB_FRAME_BINDING_ID__: FRAME_BINDING_ID,
    __CHATCLUB_CONTENT_DOCUMENT_ID__: BRIDGE_DOCUMENT_ID,
    getComputedStyle: () => ({ display: "block", visibility: "visible" })
  };
  return { window, document, nodes };
}

function createApi(options = {}) {
  const expectedBrowserDocumentId = options.expectedBrowserDocumentId || BROWSER_DOCUMENT_ID;
  const targetHref = options.targetHref || FRAME_HREF;
  const legacyDocument = expectedBrowserDocumentId.startsWith("legacy:");
  const state = {
    attached: false,
    detached: false,
    attachCalls: 0,
    detachCalls: 0,
    commands: [],
    frameCalls: 0,
    attestationCalls: 0,
    frame: {
      frameId: FRAME_ID,
      parentFrameId: 0,
      documentId: legacyDocument ? "" : expectedBrowserDocumentId,
      url: targetHref,
      ...(options.frame || {})
    },
    attestation: {
      frameBindingId: FRAME_BINDING_ID,
      bridgeDocumentId: BRIDGE_DOCUMENT_ID,
      legacyDocumentId: legacyDocument ? expectedBrowserDocumentId : `legacy:${"b".repeat(64)}`,
      legacyDocumentValid: true,
      href: targetHref,
      documentHasFocus: true,
      claudeDeleteShortcutReady: true,
      ...(options.attestation || {})
    }
  };
  const api = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (value = "") => `chrome-extension://${EXTENSION_ID}/${value}`
    },
    webNavigation: {
      async getFrame(details) {
        assert.deepEqual(details, { tabId: TAB_ID, frameId: FRAME_ID });
        state.frameCalls += 1;
        options.onGetFrame?.(state);
        return state.frame ? { ...state.frame } : null;
      }
    },
    scripting: {
      async executeScript(details) {
        state.attestationCalls += 1;
        options.onAttest?.(state, details);
        const target = details?.target || {};
        if (legacyDocument) assert.deepEqual(target.frameIds, [FRAME_ID]);
        else assert.deepEqual(target.documentIds, [expectedBrowserDocumentId]);
        let attestation = { ...state.attestation };
        if (options.attestationWindow) {
          assert.equal(typeof details.func, "function", "real attestation tests must execute the injected analyzer");
          const hadWindow = Object.hasOwn(globalThis, "window");
          const previousWindow = globalThis.window;
          try {
            globalThis.window = options.attestationWindow.window;
            attestation = details.func();
          } finally {
            if (hadWindow) globalThis.window = previousWindow;
            else delete globalThis.window;
          }
        }
        return [{
          frameId: FRAME_ID,
          documentId: state.frame?.documentId || "",
          result: attestation
        }];
      }
    },
    debugger: {
      async attach(target, version) {
        assert.deepEqual(target, { tabId: TAB_ID });
        assert.equal(version, "1.3");
        state.attachCalls += 1;
        if (options.attachError) throw options.attachError;
        state.attached = true;
        options.onAttach?.(state);
      },
      async detach(target) {
        assert.deepEqual(target, { tabId: TAB_ID });
        state.detached = true;
        state.detachCalls += 1;
        options.onDetach?.(state);
      },
      async sendCommand(target, command, params) {
        assert.deepEqual(target, { tabId: TAB_ID });
        state.commands.push({ command, params });
        options.onCommand?.(state, command, params);
      }
    }
  };
  if (options.omitFrameId) delete state.frame.frameId;
  return { api, state };
}

(async () => {
  const appRuntimeSource = fs.readFileSync(path.join(root, "app/topic-delete/runtime.js"), "utf8");
  for (const field of [
    "expectedFrameId",
    "expectedBindingId",
    "expectedBrowserDocumentId",
    "expectedBridgeDocumentId",
    "expectedFrameHref"
  ]) {
    assert.match(appRuntimeSource, new RegExp(`\\b${field}\\b`), `trusted input requests must carry ${field}`);
  }
  for (const [helper, action] of [
    ["dispatchClick", "dispatchTrustedClick"],
    ["dispatchHover", "dispatchTrustedMouseMove"]
  ]) {
    assert.match(
      appRuntimeSource,
      new RegExp(`async function ${helper}\\([^)]*target[^)]*\\)[\\s\\S]*?action: \\"${action}\\"[\\s\\S]{0,180}\\.\\.\\.target`),
      `${action} must forward the caller's exact revalidated iframe identity snapshot`
    );
  }
  assert.match(
    appRuntimeSource,
    /async function dispatchKeySequence\([^)]*beforeDispatch[^)]*\)[\s\S]*?const target = await beforeDispatch\(\)[\s\S]*?action: "dispatchTrustedKeySequence"[\s\S]{0,180}\.\.\.target/,
    "dispatchTrustedKeySequence must forward a fresh exact identity snapshot"
  );
  assert.match(appRuntimeSource, /trustedBridgeDocumentId\(iframe\) !== expectedDocumentId/);
  assert.match(appRuntimeSource, /return await trustedInputTarget\(iframe, expectedDocumentId\)/);
  assert.match(appRuntimeSource, /String\(instruction\?\.documentId \|\| ""\) === documentId/);

  const moduleUrl = pathToFileURL(path.join(root, "background/trusted-input.js")).href;
  const {
    dispatchTrustedClick,
    dispatchTrustedKeySequence,
    dispatchTrustedMouseMove
  } = await import(moduleUrl);

  {
    const { api, state } = createApi();
    assert.deepEqual(
      await dispatchTrustedClick(api, message(), sender),
      { tabId: TAB_ID, frameId: FRAME_ID, x: 200, y: 140 }
    );
    assert.deepEqual(
      state.commands,
      [
        {
          command: "Input.dispatchMouseEvent",
          params: {
            x: 200,
            y: 140,
            modifiers: 0,
            type: "mouseMoved",
            button: "none",
            buttons: 0,
            clickCount: 0
          }
        },
        {
          command: "Input.dispatchMouseEvent",
          params: {
            x: 200,
            y: 140,
            modifiers: 0,
            type: "mousePressed",
            button: "left",
            buttons: 1,
            clickCount: 1
          }
        },
        {
          command: "Input.dispatchMouseEvent",
          params: {
            x: 200,
            y: 140,
            modifiers: 0,
            type: "mouseReleased",
            button: "left",
            buttons: 0,
            clickCount: 1
          }
        }
      ]
    );
    assert.equal(state.attached, true);
    assert.equal(state.detached, true);
    assert.ok(state.attestationCalls >= 4, "click identity must be re-attested before each effectful phase");
  }

  {
    const { api, state } = createApi({ attachError: new Error("Dia debugger attach rejected") });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /attach rejected/i);
    assert.equal(state.attachCalls, 1);
    assert.equal(state.attached, false);
    assert.equal(state.detachCalls, 0, "a debugger session that never attached must not be detached");
    assert.equal(state.commands.length, 0, "attach rejection must suppress all input");
  }

  for (const phase of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    const { api, state } = createApi({
      onCommand(_current, _command, params) {
        if (params.type === phase) throw new Error(`${phase} delivery is unknown`);
      }
    });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /delivery is unknown/i, phase);
    const attempted = state.commands.map((entry) => entry.params.type);
    const expected = phase === "mouseMoved"
      ? ["mouseMoved"]
      : phase === "mousePressed"
        ? ["mouseMoved", "mousePressed"]
        : ["mouseMoved", "mousePressed", "mouseReleased"];
    assert.deepEqual(attempted, expected, `${phase} failure must stop without replay or a later phase`);
    assert.equal(attempted.filter((value) => value === phase).length, 1, `${phase} must be attempted at most once`);
    assert.equal(state.detachCalls, 1, `${phase} failure must detach the debugger`);
  }

  for (const phase of ["mouseMoved", "mousePressed"]) {
    const { api, state } = createApi({
      onCommand(current, _command, params) {
        if (params.type === phase) current.frame.documentId = `browser-document-after-${phase}`;
      }
    });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /document changed/i, phase);
    const attempted = state.commands.map((entry) => entry.params.type);
    assert.deepEqual(
      attempted,
      phase === "mouseMoved" ? ["mouseMoved"] : ["mouseMoved", "mousePressed"],
      `${phase} navigation must suppress every later input phase`
    );
    assert.equal(state.detachCalls, 1, `${phase} navigation must detach the debugger`);
  }

  {
    const { api, state } = createApi();
    await dispatchTrustedMouseMove(api, message(), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["mouseMoved"]);
    assert.ok(state.attestationCalls >= 2, "hover identity must be checked before and after debugger attachment");
  }

  {
    const { api, state } = createApi({
      targetHref: NOTION_FRAME_HREF,
      frame: { url: NOTION_FRAME_NAVIGATION_HREF },
      attestation: { href: NOTION_FRAME_HREF }
    });
    await dispatchTrustedMouseMove(api, message({ expectedFrameHref: NOTION_FRAME_HREF }), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["mouseMoved"]);
    assert.ok(state.attestationCalls >= 2, "the document-bound Notion nonce cleanup race must remain attestable");
  }

  {
    const secondNavigationHref = `${NOTION_FRAME_HREF}&__chatclub_frame_load_nonce=ccn-${"d".repeat(32)}`;
    const { api, state } = createApi({
      targetHref: NOTION_FRAME_HREF,
      frame: { url: NOTION_FRAME_NAVIGATION_HREF },
      attestation: { href: NOTION_FRAME_HREF },
      onGetFrame(current) {
        if (current.frameCalls >= 2) current.frame.url = secondNavigationHref;
      }
    });
    await assert.rejects(
      dispatchTrustedMouseMove(api, message({ expectedFrameHref: NOTION_FRAME_HREF }), sender),
      /navigated during verification/i
    );
    assert.equal(state.commands.length, 0, "a changed Notion load nonce must fail before trusted pointer input");
  }

  {
    const { api, state } = createApi({ omitFrameId: true });
    await dispatchTrustedMouseMove(api, message(), sender);
    assert.deepEqual(
      state.commands.map((entry) => entry.params.type),
      ["mouseMoved"],
      "webNavigation.getFrame may omit the frameId already supplied in its exact lookup"
    );
  }

  {
    const legacyDocumentId = `legacy:${"d".repeat(64)}`;
    const { api, state } = createApi({ expectedBrowserDocumentId: legacyDocumentId });
    await dispatchTrustedMouseMove(api, message({ expectedBrowserDocumentId: legacyDocumentId }), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["mouseMoved"]);
  }

  {
    const legacyDocumentId = `legacy:${"d".repeat(64)}`;
    const { api, state } = createApi({
      expectedBrowserDocumentId: legacyDocumentId,
      attestation: { legacyDocumentValid: false }
    });
    await assert.rejects(
      dispatchTrustedMouseMove(api, message({ expectedBrowserDocumentId: legacyDocumentId }), sender),
      /legacy document attestation changed/i
    );
    assert.equal(state.attached, false);
    assert.equal(state.commands.length, 0);
  }

  {
    const { api, state } = createApi();
    await dispatchTrustedKeySequence(api, message(), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["keyDown", "keyUp"]);
    assert.ok(state.attestationCalls >= 3, "key identity must be re-attested before down and up events");
  }

  {
    const attestationWindow = createClaudeAttestationWindow();
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    assert.deepEqual(
      await dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d", settleMs: 0 }]
      }), sender),
      { tabId: TAB_ID, frameId: FRAME_ID, keys: ["d"] }
    );
    const descriptor = {
      key: "d",
      code: "KeyD",
      windowsVirtualKeyCode: 68,
      nativeVirtualKeyCode: 2,
      modifiers: 0,
      autoRepeat: false,
      isKeypad: false
    };
    assert.deepEqual(
      state.commands,
      [
        { command: "Input.dispatchKeyEvent", params: { ...descriptor, type: "rawKeyDown" } },
        { command: "Input.dispatchKeyEvent", params: { ...descriptor, type: "keyUp" } }
      ],
      "the Claude menu shortcut must use Dia's raw lowercase d CDP descriptor"
    );
    assert.ok(
      state.commands.every(({ params }) => !Object.hasOwn(params, "text") && !Object.hasOwn(params, "unmodifiedText")),
      "Delete D must never insert printable text into a focused Claude control"
    );
    assert.equal(state.detachCalls, 1);
  }

  {
    const attestationWindow = createClaudeAttestationWindow({ titleOwnsOnly: true });
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await dispatchTrustedKeySequence(api, message({
      expectedFrameHref: CLAUDE_FRAME_HREF,
      kind: "claude-menu-delete-shortcut",
      site: "claude",
      keys: [{ key: "d", settleMs: 0 }]
    }), sender);
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["rawKeyDown", "keyUp"]);
  }

  {
    const attestationWindow = createClaudeAttestationWindow({ titleExpanded: false });
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i
    );
    assert.equal(state.attachCalls, 0, "a closed title menu must fail before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  for (const phase of ["rawKeyDown", "keyUp"]) {
    const { api, state } = createApi({
      targetHref: CLAUDE_FRAME_HREF,
      onCommand(_current, command, params) {
        if (command === "Input.dispatchKeyEvent" && params.type === phase) {
          throw new Error(`lowercase d ${phase} delivery is unknown`);
        }
      }
    });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d", settleMs: 0 }]
      }), sender),
      /lowercase d .* delivery is unknown/i,
      phase
    );
    const attempted = state.commands.map((entry) => entry.params.type);
    assert.deepEqual(
      attempted,
      phase === "rawKeyDown" ? ["rawKeyDown"] : ["rawKeyDown", "keyUp"],
      `${phase} failure must stop the lowercase d shortcut without replay`
    );
    assert.equal(attempted.filter((value) => value === phase).length, 1, `${phase} must be attempted at most once`);
    assert.equal(state.detachCalls, 1, `${phase} failure must detach the debugger`);
  }

  for (const [focusLabel, focus] of [
    ["Mark as unread", "markUnread"],
    ["Rename", "rename"],
    ["menu root", "menu"],
    ["document body", "body"],
    ["rename textbox", "renameTextbox"]
  ]) {
    const attestationWindow = createClaudeAttestationWindow({ focus });
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i,
      focusLabel
    );
    assert.equal(state.attachCalls, 0, `${focusLabel} focus must fail before debugger attachment`);
    assert.equal(state.commands.length, 0, `${focusLabel} focus must not emit D`);
  }

  {
    const attestationWindow = createClaudeAttestationWindow({ titleControlsId: "unrelated-menu" });
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i
    );
    assert.equal(state.attachCalls, 0, "D must fail before debugger attach when the focused menu is not controlled by the current title trigger");
    assert.equal(state.commands.length, 0);
  }

  for (const maliciousLabel of [
    "\uE101 Delete project D",
    "\uE101 Deleted D"
  ]) {
    const attestationWindow = createClaudeAttestationWindow({ deleteLabel: maliciousLabel });
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i,
      maliciousLabel
    );
    assert.equal(state.attachCalls, 0);
    assert.equal(state.commands.length, 0, `PUA lookalike ${JSON.stringify(maliciousLabel)} must not emit D`);
  }

  for (const [conflictLabel, values] of [
    ["aria-label", { deleteAriaLabel: "Delete project D" }],
    ["title", { deleteTitle: "Delete account D" }],
    ["innerText", { deleteInnerText: "Delete workspace D" }],
    ["textContent Deleted", { deleteTextContent: "\uE101 Deleted" }],
    ["textContent DELETED", { deleteTextContent: "\uE101 DELETED" }]
  ]) {
    const attestationWindow = createClaudeAttestationWindow(values);
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i,
      conflictLabel
    );
    assert.equal(state.attachCalls, 0, `${conflictLabel} conflict must fail before debugger attachment`);
    assert.equal(state.commands.length, 0);
  }

  {
    const attestationWindow = createClaudeAttestationWindow({ sameFingerprintNode: true });
    const { api, state } = createApi({ targetHref: CLAUDE_FRAME_HREF, attestationWindow });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i
    );
    assert.equal(state.attachCalls, 0, "one element must not supply both Claude menu fingerprint roles");
    assert.equal(state.commands.length, 0);
  }

  for (const invalid of [
    { kind: "trusted-key-sequence", site: "claude", keys: [{ key: "d" }] },
    { kind: "claude-menu-delete-shortcut", site: "other", keys: [{ key: "d" }] },
    { kind: "claude-menu-delete-shortcut", site: "claude", keys: [{ key: "D" }] },
    { kind: "claude-menu-delete-shortcut", site: "claude", keys: [{ key: "d", shiftKey: true }] },
    { kind: "claude-menu-delete-shortcut", site: "claude", keys: [{ key: "d" }, { key: "Enter" }] }
  ]) {
    const { api, state } = createApi();
    await assert.rejects(
      dispatchTrustedKeySequence(api, message(invalid), sender),
      /outside the verified Claude menu contract/i
    );
    assert.equal(state.attachCalls, 0, "an invalid Claude d contract must fail before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  {
    const { api, state } = createApi({
      targetHref: CLAUDE_FRAME_HREF,
      attestation: { documentHasFocus: false }
    });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost keyboard focus/i
    );
    assert.equal(state.attachCalls, 0, "a blurred Claude document must fail before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  {
    const { api, state } = createApi({
      targetHref: CLAUDE_FRAME_HREF,
      attestation: { claudeDeleteShortcutReady: false }
    });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i
    );
    assert.equal(state.attachCalls, 0, "a changed same-document menu must fail before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  {
    const { api, state } = createApi();
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /target is not Claude/i
    );
    assert.equal(state.attachCalls, 0, "the exact D contract must still reject a non-Claude frame before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  {
    const { api, state } = createApi({
      targetHref: CLAUDE_FRAME_HREF,
      onAttach(current) {
        current.attestation.claudeDeleteShortcutReady = false;
      }
    });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost the owned Claude Delete D menu/i
    );
    assert.equal(state.attachCalls, 1);
    assert.equal(state.detachCalls, 1);
    assert.equal(state.commands.length, 0, "menu focus loss after attach must suppress keyDown");
  }

  {
    const { api, state } = createApi({
      targetHref: CLAUDE_FRAME_HREF,
      onCommand(current, command, params) {
        if (command === "Input.dispatchKeyEvent" && params.type === "rawKeyDown") {
          current.attestation.documentHasFocus = false;
        }
      }
    });
    await assert.rejects(
      dispatchTrustedKeySequence(api, message({
        expectedFrameHref: CLAUDE_FRAME_HREF,
        kind: "claude-menu-delete-shortcut",
        site: "claude",
        keys: [{ key: "d" }]
      }), sender),
      /lost keyboard focus/i
    );
    assert.deepEqual(state.commands.map((entry) => entry.params.type), ["rawKeyDown"]);
    assert.equal(state.detachCalls, 1, "focus loss after rawKeyDown must stop without replay");
  }

  for (const [label, options, expected] of [
    ["conflicting returned frame", { frame: { frameId: FRAME_ID + 1 } }, /direct child iframe/i],
    ["nested frame", { frame: { parentFrameId: 3 } }, /direct child iframe/i],
    ["browser document", { frame: { documentId: "browser-document-2" } }, /document changed/i],
    ["binding", { attestation: { frameBindingId: "c".repeat(64) } }, /attestation changed/i],
    ["bridge document", { attestation: { bridgeDocumentId: "bridge-document-2" } }, /attestation changed/i],
    ["frame URL", { frame: { url: "https://chat.deepseek.com/a/chat/s/topic-2" } }, /target URL changed/i]
  ]) {
    const { api, state } = createApi(options);
    await assert.rejects(dispatchTrustedClick(api, message(), sender), expected, label);
    assert.equal(state.attached, false, `${label} mismatch must fail before debugger attachment`);
    assert.equal(state.commands.length, 0, `${label} mismatch must not dispatch input`);
  }

  {
    const { api, state } = createApi();
    await assert.rejects(
      dispatchTrustedClick(api, message(), { ...sender, id: "different-extension" }),
      /current ChatClub extension page/i
    );
    assert.equal(state.attached, false);
  }

  {
    const { api, state } = createApi({
      onAttach(current) {
        current.frame.documentId = "browser-document-after-navigation";
      }
    });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /document changed/i);
    assert.equal(state.attached, true, "the test must navigate only after debugger attachment");
    assert.equal(state.detached, true, "a failed post-attach attestation must detach the debugger");
    assert.equal(state.commands.length, 0, "navigation between preflight and execution must suppress all input");
  }

  {
    let navigated = false;
    const { api, state } = createApi({
      onAttest(current) {
        if (!navigated) {
          navigated = true;
          current.frame.documentId = "browser-document-during-attestation";
        }
      }
    });
    await assert.rejects(dispatchTrustedClick(api, message(), sender), /document changed|navigated/i);
    assert.equal(state.attached, false, "navigation during preflight attestation must fail before debugger attachment");
    assert.equal(state.commands.length, 0);
  }

  console.log("trusted input secure frame attestation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
