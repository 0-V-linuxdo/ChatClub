#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

class FakeNode {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
  }

  get isConnected() {
    for (let node = this; node; node = node.parentNode) {
      if (node === this.ownerDocument) return true;
    }
    return false;
  }

  remove() {
    if (!this.parentNode?.children) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

class FakeTextNode extends FakeNode {
  constructor(ownerDocument, value) {
    super(ownerDocument);
    this.nodeType = 3;
    this.textContent = String(value);
  }
}

function matchesSelector(node, selector) {
  const value = String(selector || "").trim();
  if (!value || node.nodeType !== 1) return false;

  const attribute = value.match(/^(?:([a-z][\w-]*))?\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'))?\]$/i);
  if (attribute) {
    if (attribute[1] && node.tagName.toLowerCase() !== attribute[1].toLowerCase()) return false;
    const actual = node.getAttribute(attribute[2]);
    if (actual === null) return false;
    const expected = attribute[3] ?? attribute[4];
    return expected === undefined || actual === expected;
  }

  const className = value.match(/^(?:([a-z][\w-]*))?\.([\w-]+)$/i);
  if (className) {
    if (className[1] && node.tagName.toLowerCase() !== className[1].toLowerCase()) return false;
    return node.className.split(/\s+/).includes(className[2]);
  }

  return node.tagName.toLowerCase() === value.toLowerCase();
}

class FakeElement extends FakeNode {
  constructor(ownerDocument, tagName) {
    super(ownerDocument);
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.className = "";
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = String(value);
      }
    };
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      node.ownerDocument = this.ownerDocument;
      this.children.push(node);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  dispatchEvent(event) {
    if (!event?.type) throw new TypeError("Fake events require a type");
    if (event.target == null) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    if (event.bubbles !== false && !event.cancelBubble) this.parentNode?.dispatchEvent?.(event);
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: "click", bubbles: true, target: this });
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (matchesSelector(child, selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FakeDocument extends FakeNode {
  constructor() {
    super();
    this.ownerDocument = this;
    this.listeners = new Map();
    this.documentElement = new FakeElement(this, "html");
    this.body = new FakeElement(this, "body");
    this.documentElement.parentNode = this;
    this.documentElement.append(this.body);
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createTextNode(value) {
    return new FakeTextNode(this, value);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    if (!event?.type) throw new TypeError("Fake events require a type");
    if (event.target == null) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return !event.defaultPrevented;
  }

  querySelectorAll(selector) {
    const matches = [];
    if (matchesSelector(this.documentElement, selector)) matches.push(this.documentElement);
    matches.push(...this.documentElement.querySelectorAll(selector));
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function javaScriptFilesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javaScriptFilesUnder(absolute));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(absolute);
  }
  return files;
}

function directFunctionSource(file, functionName) {
  const source = fs.readFileSync(file, "utf8");
  const startPattern = new RegExp(`^  (?:async\\s+)?function\\s+${functionName}\\s*\\(`, "m");
  const match = startPattern.exec(source);
  assert.ok(match, `${path.relative(root, file)} must keep ${functionName} discoverable`);
  const remainderStart = match.index + match[0].length;
  const nextFunction = /^  (?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(source.slice(remainderStart));
  const end = nextFunction ? remainderStart + nextFunction.index : source.length;
  return source.slice(match.index, end);
}

function event(type, properties = {}) {
  return {
    type,
    bubbles: true,
    cancelBubble: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
    stopImmediatePropagation() {
      this.cancelBubble = true;
      this.immediatePropagationStopped = true;
    },
    ...properties
  };
}

(async () => {
  const previousNode = global.Node;
  const previousDocument = global.document;
  const document = new FakeDocument();
  global.Node = FakeNode;
  global.document = document;

  try {
    const moduleUrl = `${pathToFileURL(path.join(root, "ui/dom.js")).href}?modal-close-policy=${Date.now()}`;
    const {
      button,
      claimTopmostPopoverEscape,
      confirmationModal,
      editorModal,
      el,
      modal,
      isDismissalEscape,
      taskModal,
      viewerModal
    } = await import(moduleUrl);

    const createFixture = (factory) => {
      let dialog = null;
      let closeCount = 0;
      const close = () => {
        closeCount += 1;
        dialog?.remove();
      };
      const cancelButton = button("Cancel", close);
      const primaryButton = button("Save", close, "primary");
      const content = el("div", { class: "settings-editor-form" },
        el("input", { value: "unsaved draft" }),
        el("div", { class: "settings-dialog-actions" }, cancelButton, primaryButton)
      );
      dialog = factory("Platform", content, close, false, "Close");
      return {
        cancelButton,
        closeCount: () => closeCount,
        content,
        dialog,
        primaryButton
      };
    };

    const defaultFixture = createFixture(modal);
    defaultFixture.dialog.click();
    assert.equal(defaultFixture.closeCount(), 1, "the default modal policy must still close on a backdrop click");
    assert.equal(defaultFixture.dialog.isConnected, false, "the default backdrop click must remove the modal");

    const viewerFixture = createFixture(viewerModal);
    const viewerPanel = viewerFixture.dialog.querySelector(".modal");
    const viewerBody = viewerFixture.dialog.querySelector(".modal-body");
    assert.ok(viewerPanel && viewerBody, "the viewer modal must render its panel and body");
    viewerPanel.click();
    viewerBody.click();
    document.dispatchEvent(event("keydown", { key: "Escape", target: viewerBody }));
    assert.equal(viewerFixture.closeCount(), 0, "viewer content and Escape must not be mistaken for a backdrop click");
    viewerFixture.dialog.click();
    assert.equal(viewerFixture.closeCount(), 1, "viewer modals may close on a backdrop click");
    assert.equal(viewerFixture.dialog.isConnected, false, "a viewer backdrop click must remove the modal");

    const restrictedFactories = [
      ["editor", editorModal],
      ["task", taskModal],
      ["confirmation", confirmationModal]
    ];
    for (const [type, factory] of restrictedFactories) {
      const fixture = createFixture(factory);
      const panel = fixture.dialog.querySelector(".modal");
      const body = fixture.dialog.querySelector(".modal-body");
      assert.ok(panel && body, `${type} modal must render its panel and body`);

      fixture.dialog.click();
      panel.click();
      body.click();
      document.dispatchEvent(event("keydown", { key: "Escape", target: body }));
      assert.equal(fixture.closeCount(), 0, `${type} backdrop, content, and Escape must not dismiss the modal`);
      assert.equal(fixture.dialog.isConnected, true, `${type} dismissal attempts must preserve the modal and draft content`);
      assert.equal(
        fixture.content.querySelector("input").getAttribute("value"),
        "unsaved draft",
        `${type} dismissal attempts must preserve the draft`
      );
      fixture.dialog.remove();
    }

    for (const [type, factory] of [["viewer", viewerModal], ...restrictedFactories]) {
      for (const [label, control] of [
        ["top close button", (fixture) => fixture.dialog.querySelector('[aria-label="Close"]')],
        ["bottom cancel button", (fixture) => fixture.cancelButton],
        ["bottom primary button", (fixture) => fixture.primaryButton]
      ]) {
        const fixture = createFixture(factory);
        const target = control(fixture);
        assert.ok(target, `${type} ${label} must be rendered`);
        target.click();
        assert.equal(fixture.closeCount(), 1, `${type} ${label} must explicitly close the modal`);
        assert.equal(fixture.dialog.isConnected, false, `${type} ${label} must remove the modal`);
      }
    }

    assert.equal(isDismissalEscape(event("keydown", { key: "Escape" })), true, "plain Escape must be eligible for dismissal");
    assert.equal(isDismissalEscape(event("keydown", { key: "Escape", isComposing: true })), false, "IME composition Escape must not dismiss overlays");
    assert.equal(isDismissalEscape(event("keydown", { key: "Escape", keyCode: 229 })), false, "IME keyCode 229 must not dismiss overlays");

    const olderPopover = el("div", { class: "popover-menu older-popover" });
    const newerPopover = el("div", { class: "popover-menu newer-popover" });
    document.body.append(olderPopover, newerPopover);
    const olderEscape = event("keydown", { key: "Escape" });
    assert.equal(
      claimTopmostPopoverEscape(olderEscape, ".older-popover"),
      false,
      "a background popover owner must not claim Escape"
    );
    const newerEscape = event("keydown", { key: "Escape" });
    assert.equal(
      claimTopmostPopoverEscape(newerEscape, ".newer-popover"),
      true,
      "only the topmost popover owner may claim Escape"
    );
    assert.equal(newerEscape.defaultPrevented, true, "claimed popover Escape must prevent the browser default");
    assert.equal(newerEscape.immediatePropagationStopped, true, "claimed popover Escape must stop sibling owner handlers");
    olderPopover.remove();
    newerPopover.remove();

    const appDirectory = path.join(root, "app");
    const appFiles = javaScriptFilesUnder(appDirectory);
    const appSources = appFiles.map((file) => fs.readFileSync(file, "utf8"));
    const allAppSource = appSources.join("\n");
    const wrapperNames = ["editorModal", "viewerModal", "taskModal", "confirmationModal"];
    const expectedInventory = new Map([
      ["editorModal", 9],
      ["viewerModal", 3],
      ["taskModal", 1],
      ["confirmationModal", 1]
    ]);

    assert.equal(occurrences(allAppSource, /\bmodal\s*\(/g), 0, "app code must not call the raw modal helper");
    for (const [wrapperName, expected] of expectedInventory) {
      assert.equal(
        occurrences(allAppSource, new RegExp(`\\b${wrapperName}\\s*\\(`, "g")),
        expected,
        `app modal inventory must contain exactly ${expected} ${wrapperName} call(s)`
      );
    }
    assert.equal(
      wrapperNames.reduce((total, wrapperName) => (
        total + occurrences(allAppSource, new RegExp(`\\b${wrapperName}\\s*\\(`, "g"))
      ), 0),
      14,
      "all fourteen app modal call sites must use a typed wrapper"
    );

    for (let index = 0; index < appFiles.length; index += 1) {
      const importBlocks = appSources[index].matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*\/ui\/dom\.js["'];/g);
      for (const importBlock of importBlocks) {
        const importedNames = importBlock[1]
          .split(",")
          .map((entry) => entry.trim().split(/\s+as\s+/)[0])
          .filter(Boolean);
        assert.ok(
          !importedNames.includes("modal"),
          `${path.relative(root, appFiles[index])} must import a typed modal wrapper instead of raw modal`
        );
      }
    }

    const callSites = [
      ["app/settings/controller.js", "openSettings", "editorModal", "Settings"],
      ["app/settings/profiles.js", "openEditor", "editorModal", "API profile editor"],
      ["app/settings/apps.js", "openCustomEditor", "editorModal", "custom platform editor"],
      ["app/settings/prompt-templates.js", "openPromptTemplateEditor", "editorModal", "prompt template editor"],
      ["app/settings/summary.js", "openSummaryCollectorEditor", "editorModal", "Summary collector editor"],
      ["app/settings/message-navigation.js", "openSiteEditor", "editorModal", "Message Navigator editor"],
      ["app/settings/topic-deletion.js", "openSiteEditor", "editorModal", "Delete Site editor"],
      ["app/prompt-library/controller.js", "openPromptLibraryEditor", "editorModal", "Prompt Library editor"],
      ["app/workspace/frame-controller.js", "openGoToUrlDialog", "editorModal", "Go To URL editor"],
      ["app/settings/apps.js", "openBuiltInDetails", "viewerModal", "built-in platform details"],
      ["app/prompt-library/controller.js", "openPromptLibraryDialog", "viewerModal", "Prompt Library manager"],
      ["app/pocket/controller.js", "openPocketPanel", "viewerModal", "Pocket history viewer"],
      ["app/optimize/controller.js", "openOptimizeCompareDialog", "taskModal", "prompt optimization task"],
      ["app/settings/import-export.js", "openImportConfirmDialog", "confirmationModal", "import confirmation"]
    ];

    for (const [relativeFile, functionName, expectedWrapper, label] of callSites) {
      const source = directFunctionSource(path.join(root, relativeFile), functionName);
      for (const wrapperName of ["modal", ...wrapperNames]) {
        const expected = wrapperName === expectedWrapper ? 1 : 0;
        assert.equal(
          occurrences(source, new RegExp(`\\b${wrapperName}\\s*\\(`, "g")),
          expected,
          `${label} must use ${expectedWrapper} and no other modal helper`
        );
      }
    }

    const importDialogSource = directFunctionSource(
      path.join(root, "app/settings/import-export.js"),
      "openImportConfirmDialog"
    );
    assert.match(
      importDialogSource,
      /const\s+close\s*=\s*\(closeOptions\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*?if\s*\(importing\s*&&\s*closeOptions\?\.force\s*!==\s*true\)\s*return\s*;[\s\S]*?dialog\?\.remove\(\)\s*;/,
      "an import in progress must reject ordinary top-close and Cancel attempts"
    );
    assert.match(
      importDialogSource,
      /confirmButton\.disabled\s*=\s*importing\s*\|\|\s*!hasSelection\s*;/,
      "the import confirmation action must be disabled while busy"
    );
    assert.match(
      importDialogSource,
      /cancelButton\.disabled\s*=\s*importing\s*;/,
      "the import Cancel action must be disabled while busy"
    );
    assert.match(
      importDialogSource,
      /importControls\.forEach\([\s\S]*?node\.disabled\s*=\s*importing\s*\|\|\s*unavailable\s*;[\s\S]*?\}\)\s*;/,
      "import item and mode controls must be disabled while busy"
    );
    assert.match(
      importDialogSource,
      /querySelector\(\s*["']\.modal-header \.icon-button["']\s*\)[\s\S]*?headerCloseButton\.disabled\s*=\s*importing\s*;/,
      "the modal X control must be disabled while importing"
    );

    const confirmStart = importDialogSource.indexOf("const confirm = async");
    const duplicateGuard = importDialogSource.indexOf("if (importing) return", confirmStart);
    const busyStart = importDialogSource.indexOf("importing = true", confirmStart);
    const busyRender = importDialogSource.indexOf("updateState()", busyStart);
    const applyImport = importDialogSource.indexOf("await applyImportedConfig", busyRender);
    assert.ok(confirmStart >= 0, "the async import confirmation handler must remain discoverable");
    assert.ok(duplicateGuard > confirmStart && duplicateGuard < busyStart, "confirm must reject duplicate activation before entering busy state");
    assert.ok(busyStart > duplicateGuard && busyRender > busyStart, "confirm must enter and render busy state before applying imported data");
    assert.ok(applyImport > busyRender, "import application must begin only after controls enter busy state");
    assert.match(
      importDialogSource,
      /if\s*\(ok\)\s*\{\s*close\(\s*\{\s*force\s*:\s*true\s*\}\s*\)\s*;\s*return\s*;\s*\}/,
      "a successful import must use the explicit force-close path"
    );
    assert.match(
      importDialogSource,
      /finally\s*\{\s*if\s*\(dialog\?\.isConnected\)\s*\{\s*importing\s*=\s*false\s*;\s*updateState\(\)\s*;\s*\}\s*\}/,
      "a failed or rejected import must restore enabled controls in finally"
    );
    assert.match(
      importDialogSource,
      /if\s*\(error\?\.importCommitted\)\s*\{[\s\S]*?toast\(t\(["']toast\.importCommittedRefreshFailed["']\),\s*["']error["']\)[\s\S]*?close\(\s*\{\s*force\s*:\s*true\s*\}\s*\)[\s\S]*?return\s*;/,
      "a post-commit refresh failure must close instead of presenting the import as safely retryable"
    );

    const applyImportSource = directFunctionSource(
      path.join(root, "app/settings/import-export.js"),
      "applyImportedConfig"
    );
    const committedWriteIndex = applyImportSource.indexOf("await saveImportedConfigPatch");
    const postCommitTryIndex = applyImportSource.indexOf("try {", committedWriteIndex);
    const committedErrorIndex = applyImportSource.indexOf("throw committedImportError(error)", postCommitTryIndex);
    assert.ok(committedWriteIndex >= 0, "the durable import write must remain discoverable");
    assert.ok(postCommitTryIndex > committedWriteIndex, "post-write refresh work must be separated from the durable write");
    assert.ok(committedErrorIndex > postCommitTryIndex, "post-write failures must be marked as already committed");

    console.log("Typed modal behavior and inventory regression checks passed.");
  } finally {
    if (previousNode === undefined) delete global.Node;
    else global.Node = previousNode;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
