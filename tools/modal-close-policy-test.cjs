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
    this.checked = false;
    this.disabled = false;
    this.classList = {
      add: (name) => {
        const parts = String(this.className || "").split(/\s+/).filter(Boolean);
        if (!parts.includes(name)) this.className = [...parts, name].join(" ");
      },
      remove: (name) => {
        this.className = String(this.className || "").split(/\s+/).filter((part) => part && part !== name).join(" ");
      },
      contains: (name) => String(this.className || "").split(/\s+/).includes(name),
      toggle: (name, force) => {
        const on = force === undefined ? !this.classList.contains(name) : Boolean(force);
        if (on) this.classList.add(name);
        else this.classList.remove(name);
        return on;
      }
    };
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
    if (name === "disabled") this.disabled = true;
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  toggleAttribute(name, force) {
    const enabled = force === undefined ? !this.attributes.has(name) : Boolean(force);
    if (enabled) this.setAttribute(name, "");
    else {
      this.attributes.delete(name);
      if (name === "disabled") this.disabled = false;
    }
    return enabled;
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
    if (this.disabled) return;
    if (this.tagName === "INPUT" && this.getAttribute("type") === "checkbox") {
      this.checked = !this.checked;
      this.dispatchEvent({ type: "change", bubbles: true, target: this });
    }
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

  get textContent() {
    return this.children.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this.children = [];
    const text = String(value ?? "");
    if (text) this.append(new FakeTextNode(this.ownerDocument, text));
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

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((entry) => entry !== listener));
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
  const startPattern = new RegExp(`^(?:  )?(?:async\\s+)?function\\s+${functionName}\\s*\\(`, "m");
  const match = startPattern.exec(source);
  assert.ok(match, `${path.relative(root, file)} must keep ${functionName} discoverable`);
  const remainderStart = match.index + match[0].length;
  const nextFunction = /^(?:  )?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(source.slice(remainderStart));
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
      openConfirmationAction,
      taskModal,
      toast,
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
        el("div", { class: "modal-footer" }, cancelButton, primaryButton)
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
    assert.equal(viewerPanel.getAttribute("role"), "dialog", "typed modals must expose the dialog role");
    assert.equal(viewerPanel.getAttribute("aria-modal"), "true", "typed modals must expose aria-modal");
    const viewerTitleId = viewerPanel.getAttribute("aria-labelledby");
    assert.ok(viewerTitleId, "typed modals must label the dialog from the title");
    assert.equal(viewerPanel.querySelector("h2")?.getAttribute("id"), viewerTitleId, "aria-labelledby must point at the visible title");
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

    const confirmationCopy = el("p", {}, "This cannot be undone.");
    const confirmationFixture = createFixture((title, content, onClose, wide, closeLabel) => (
      confirmationModal(title, el("div", {}, confirmationCopy, content), onClose, wide, closeLabel)
    ));
    const confirmationPanel = confirmationFixture.dialog.querySelector(".modal");
    assert.equal(confirmationPanel.getAttribute("role"), "alertdialog", "confirmation modals must use alertdialog");
    const confirmationDescId = confirmationPanel.getAttribute("aria-describedby");
    assert.ok(confirmationDescId, "confirmation modals must describe the prompt");
    assert.equal(confirmationCopy.getAttribute("id"), confirmationDescId, "aria-describedby must point at the confirmation copy");
    const hoistedFooter = confirmationPanel.querySelector(".modal-footer");
    assert.ok(hoistedFooter, "modal footer must exist");
    assert.equal(hoistedFooter.parentNode, confirmationPanel, "modal footer must hoist out of the body");
    confirmationFixture.dialog.remove();

    let confirmed = 0;
    const actionFixture = openConfirmationAction({
      title: "Delete custom platform",
      body: "Delete Demo?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      onConfirm: async () => {
        confirmed += 1;
      }
    });
    const actionPanel = actionFixture.querySelector(".modal");
    assert.equal(actionPanel.getAttribute("role"), "alertdialog", "openConfirmationAction must open confirmationModal");
    assert.equal(actionPanel.className.includes("modal-alertdialog"), true, "openConfirmationAction must keep confirmation chrome");
    assert.equal(actionPanel.dataset.overlayTone, "danger", "openConfirmationAction defaults to danger tone");
    assert.equal(actionPanel.className.includes("modal-tone-danger"), true, "openConfirmationAction must stamp danger tone chrome");
    actionFixture.click();
    document.dispatchEvent(event("keydown", { key: "Escape", target: actionPanel }));
    assert.equal(actionFixture.isConnected, true, "openConfirmationAction must ignore backdrop and Escape");
    assert.equal(confirmed, 0, "ignored dismissal must not run the confirm action");
    actionFixture.querySelector(".button-danger").click();
    for (let i = 0; i < 20 && actionFixture.isConnected; i += 1) await Promise.resolve();
    assert.equal(confirmed, 1, "the confirm action must run exactly once");
    assert.equal(actionFixture.isConnected, false, "a successful confirm must close the dialog");

    const warningFixture = openConfirmationAction({
      title: "Import will replace Pocket",
      body: "Replace current Pocket content?",
      confirmLabel: "Replace",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      variant: "primary",
      tone: "warning",
      onConfirm: async () => {}
    });
    const warningPanel = warningFixture.querySelector(".modal");
    assert.equal(warningPanel.dataset.overlayTone, "warning", "openConfirmationAction must honor warning tone");
    assert.equal(warningPanel.className.includes("modal-tone-warning"), true, "warning confirmations must stamp warning chrome");
    assert.equal(warningPanel.getAttribute("role"), "alertdialog", "warning confirmations stay alertdialog");
    warningFixture.remove();

    const neutralFixture = openConfirmationAction({
      title: "Apply official rules update",
      body: "Apply this release atomically.",
      confirmLabel: "Apply",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      variant: "primary",
      tone: "neutral",
      onConfirm: async () => {}
    });
    const neutralPanel = neutralFixture.querySelector(".modal");
    assert.equal(neutralPanel.dataset.overlayTone, "neutral", "openConfirmationAction must honor neutral tone");
    assert.equal(neutralPanel.className.includes("modal-tone-neutral"), true, "neutral confirmations must stamp neutral chrome");
    assert.equal(neutralPanel.getAttribute("role"), "dialog", "neutral confirmations must use dialog");
    assert.equal(neutralPanel.className.includes("modal-alertdialog"), true, "neutral confirmations keep confirmation chrome");
    neutralFixture.remove();

    let cancelled = 0;
    const cancelFixture = openConfirmationAction({
      title: "Delete custom platform",
      body: "Delete Demo?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      onConfirm: async () => {
        cancelled += 1;
      }
    });
    cancelFixture.querySelector(".button-secondary").click();
    assert.equal(cancelled, 0, "Cancel must not run the confirm action");
    assert.equal(cancelFixture.isConnected, false, "Cancel must close the themed confirmation");

    let closed = 0;
    const closeFixture = openConfirmationAction({
      title: "Delete custom platform",
      body: "Delete Demo?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      onConfirm: async () => {
        closed += 1;
      }
    });
    closeFixture.querySelector('[aria-label="Close"]').click();
    assert.equal(closed, 0, "the header close action must not run the confirm action");
    assert.equal(closeFixture.isConnected, false, "the header close action must close the themed confirmation");

    let releaseBusy;
    const busyPending = new Promise((resolve) => {
      releaseBusy = resolve;
    });
    let busyConfirmed = 0;
    const busyFixture = openConfirmationAction({
      title: "Delete custom platform",
      body: "Delete Demo?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      onConfirm: async () => {
        busyConfirmed += 1;
        await busyPending;
      }
    });
    busyFixture.querySelector(".button-danger").click();
    for (let i = 0; i < 20 && busyConfirmed === 0; i += 1) await Promise.resolve();
    assert.equal(busyConfirmed, 1, "an in-flight confirm must start before later close attempts");
    busyFixture.querySelector(".button-secondary").click();
    busyFixture.querySelector('[aria-label="Close"]').click();
    assert.equal(busyFixture.isConnected, true, "an in-flight confirmation must reject Cancel and top-close");
    releaseBusy();
    for (let i = 0; i < 20 && busyFixture.isConnected; i += 1) await Promise.resolve();
    assert.equal(busyFixture.isConnected, false, "a settled in-flight confirm must force-close");

    let acknowledged = 0;
    const ackFixture = openConfirmationAction({
      title: "Reset all ChatClub data",
      body: "This clears local data.",
      confirmLabel: "Reset Everything",
      cancelLabel: "Cancel",
      closeLabel: "Close",
      acknowledge: "I understand this will erase all local ChatClub data.",
      onConfirm: async () => {
        acknowledged += 1;
      }
    });
    const ackPanel = ackFixture.querySelector(".modal");
    const ackBody = ackFixture.querySelector(".overlay-confirmation");
    assert.equal(ackPanel.getAttribute("aria-describedby"), ackBody.getAttribute("id"), "helper bodies must describe the whole confirmation root");
    const ackConfirm = ackFixture.querySelector(".button-danger");
    assert.equal(ackConfirm.disabled, true, "acknowledge confirms stay disabled until checked");
    ackConfirm.click();
    assert.equal(acknowledged, 0, "unchecked acknowledge must not run the confirm action");
    ackFixture.querySelector("input").click();
    assert.equal(ackConfirm.disabled, false, "checking acknowledge must enable the danger action");
    ackConfirm.click();
    for (let i = 0; i < 20 && ackFixture.isConnected; i += 1) await Promise.resolve();
    assert.equal(acknowledged, 1, "checked acknowledge must run the confirm action");
    assert.equal(ackFixture.isConnected, false, "a successful acknowledged confirm must close");

    let undone = 0;
    toast("Prompt history item deleted", "info", {
      actionLabel: "Undo",
      onAction: () => {
        undone += 1;
      }
    });
    const toastItem = document.body.querySelector(".toast-actionable") || document.querySelector(".toast-actionable");
    assert.ok(toastItem, "actionable toasts must render a visual item");
    const toastAction = toastItem.querySelector(".toast-action");
    assert.equal(toastAction?.textContent, "Undo", "actionable toasts must expose the action label");
    toastAction.click();
    assert.equal(undone, 1, "toast undo must run the action once");
    toastAction.click();
    assert.equal(undone, 1, "toast undo must ignore a second click");

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
    const wrapperNames = ["editorModal", "viewerModal", "taskModal", "confirmationModal", "openConfirmationAction"];
    const expectedInventory = new Map([
      ["editorModal", 11],
      ["viewerModal", 5],
      ["taskModal", 1],
      ["confirmationModal", 0],
      ["openConfirmationAction", 15]
    ]);

    assert.equal(occurrences(allAppSource, /\bmodal\s*\(/g), 0, "app code must not call the raw modal helper");
    assert.equal(occurrences(allAppSource, /\bwindow\.confirm\s*\(/g), 0, "app code must not use unthemed window.confirm");
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
      32,
      "all thirty-two app overlay call sites must use a typed wrapper or openConfirmationAction"
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
      ["app/settings/apps.js", "openIframePermissionEditor", "editorModal", "iframe permission editor"],
      ["app/settings/prompt-templates.js", "openPromptTemplateEditor", "editorModal", "prompt template editor"],
      ["app/settings/summary.js", "openSummaryCollectorEditor", "editorModal", "Summary collector editor"],
      ["app/settings/message-navigation.js", "openSiteEditor", "editorModal", "Message Navigator editor"],
      ["app/settings/topic-deletion.js", "openSiteEditor", "editorModal", "Delete Site editor"],
      ["app/prompt-library/controller.js", "openPromptLibraryEditor", "editorModal", "Prompt Library editor"],
      ["app/workspace/frame-controller.js", "openGoToUrlDialog", "editorModal", "Go To URL editor"],
      ["app/workspace/tabs-sidebar-controller.js", "openDeleteConfirmation", "openConfirmationAction", "ChatClub tab delete confirmation"],
      ["app/settings/apps.js", "openBuiltInDetails", "viewerModal", "built-in platform details"],
      ["app/settings/functional-anomalies.js", "openDetails", "viewerModal", "functional anomaly details"],
      ["app/prompt-library/controller.js", "openPromptLibraryDialog", "viewerModal", "Prompt Library manager"],
      ["app/pocket/controller.js", "openPocketPanel", "viewerModal", "Pocket history viewer"],
      ["app/history/controller.js", "openHistoryPanel", "viewerModal", "Prompt History viewer"],
      ["app/optimize/controller.js", "openOptimizeCompareDialog", "taskModal", "prompt optimization task"],
      ["app/settings/import-export.js", "openFullResetDialog", "openConfirmationAction", "full reset confirmation"],
      ["app/settings/import-export.js", "openImportConfirmDialog", "editorModal", "import confirmation"],
      ["app/settings/apps.js", "openIframeRiskConfirmation", "openConfirmationAction", "iframe risk confirmation"],
      ["app/settings/functional-anomalies.js", "openMutationConfirmation", "openConfirmationAction", "functional anomaly mutation confirmation"],
      ["app/settings/official-rules.js", "openConfirmation", "openConfirmationAction", "official rules mutation confirmation"],
      ["app/settings/apps.js", "removeCustom", "openConfirmationAction", "custom platform delete confirmation"],
      ["app/settings/profiles.js", "remove", "openConfirmationAction", "API profile delete confirmation"],
      ["app/settings/prompt-templates.js", "deletePromptTemplate", "openConfirmationAction", "prompt template delete confirmation"],
      ["app/settings/summary.js", "deleteSummaryCollector", "openConfirmationAction", "Summary collector delete confirmation"],
      ["app/settings/message-navigation.js", "deleteSite", "openConfirmationAction", "Message Navigator site delete confirmation"],
      ["app/settings/topic-deletion.js", "deleteSite", "openConfirmationAction", "Delete Site delete confirmation"],
      ["app/settings/history.js", "clear", "openConfirmationAction", "Settings history clear confirmation"],
      ["app/prompt-library/controller.js", "deletePromptLibraryItem", "openConfirmationAction", "Prompt Library delete confirmation"],
      ["app/runtime.js", "deleteThreadOnFrames", "openConfirmationAction", "topbar delete-all-topics confirmation"],
      ["app/workspace/frame-controller.js", "deleteActiveThreadForGroup", "openConfirmationAction", "in-group delete-topic confirmation"]
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

    const fullResetSource = directFunctionSource(
      path.join(root, "app/settings/import-export.js"),
      "openFullResetDialog"
    );
    assert.match(
      fullResetSource,
      /openConfirmationAction\s*\(/,
      "full reset must use openConfirmationAction instead of a hand-rolled confirmationModal"
    );
    assert.match(
      fullResetSource,
      /acknowledge:\s*t\("io.fullResetAcknowledge"\)/,
      "full reset must require an explicit acknowledgement before the danger action"
    );
    assert.match(
      fullResetSource,
      /io\.fullResetAcknowledge/,
      "full reset acknowledgement copy must stay on the helper call"
    );
    assert.doesNotMatch(
      fullResetSource,
      /confirmationModal\s*\(/,
      "full reset must not open confirmationModal directly"
    );

    const functionalAnomalyConfirmationSource = directFunctionSource(
      path.join(root, "app/settings/functional-anomalies.js"),
      "openMutationConfirmation"
    );
    assert.match(
      functionalAnomalyConfirmationSource,
      /openConfirmationAction\s*\(/,
      "functional anomaly mutations must use openConfirmationAction instead of a hand-rolled confirmationModal"
    );
    assert.match(
      functionalAnomalyConfirmationSource,
      /await mutate\(\)/,
      "functional anomaly mutation confirmations must run the mutation through onConfirm"
    );
    assert.match(
      functionalAnomalyConfirmationSource,
      /toast\(t\(successKey\),\s*"success"\)/,
      "successful functional anomaly mutations must keep their success toast"
    );
    assert.doesNotMatch(
      functionalAnomalyConfirmationSource,
      /confirmationModal\s*\(/,
      "functional anomaly mutations must not open confirmationModal directly"
    );

    const deleteThreadSource = directFunctionSource(path.join(root, "app/runtime.js"), "deleteThreadOnFrames");
    assert.match(
      deleteThreadSource,
      /acknowledge:\s*t\("topbar.deleteThreadAcknowledge"\)/,
      "delete-all-topics must require acknowledgement"
    );
    assert.match(
      deleteThreadSource,
      /busyLabel:\s*t\("common.applying"\)/,
      "delete-all-topics must show applying busy copy"
    );

    const inGroupDeleteSource = directFunctionSource(path.join(root, "app/workspace/frame-controller.js"), "deleteActiveThreadForGroup");
    assert.match(
      inGroupDeleteSource,
      /acknowledge:\s*t\("topbar.deleteThreadAcknowledge"\)/,
      "in-group topic delete must require acknowledgement"
    );
    assert.match(
      inGroupDeleteSource,
      /busyLabel:\s*t\("common.applying"\)/,
      "in-group topic delete must show applying busy copy"
    );

    const officialRulesSource = fs.readFileSync(path.join(root, "app/settings/official-rules.js"), "utf8");
    assert.match(officialRulesSource, /busyLabel:\s*t\("common.applying"\)/, "official-rules mutations must show applying busy copy");
    assert.match(officialRulesSource, /tone: approve \? "warning" : "neutral"/, "authorizing a Delete Sites domain must use warning tone");
    assert.doesNotMatch(officialRulesSource, /official-rules-confirmation-modal/, "official-rules must not stamp a private confirmation modal class");

    const historySettingsRemove = directFunctionSource(path.join(root, "app/settings/history.js"), "remove");
    assert.doesNotMatch(historySettingsRemove, /openConfirmationAction/, "Settings history item delete must use an undo toast");
    assert.match(historySettingsRemove, /actionLabel:\s*t\("common.undo"\)/, "Settings history item delete must offer undo");

    const historyViewerRemove = directFunctionSource(path.join(root, "app/history/controller.js"), "remove");
    assert.doesNotMatch(historyViewerRemove, /openConfirmationAction/, "Prompt History item delete must use an undo toast");
    assert.match(historyViewerRemove, /actionLabel:\s*t\("common.undo"\)/, "Prompt History item delete must offer undo");

    const placeholderDelete = directFunctionSource(path.join(root, "app/settings/appearance-topbar.js"), "deleteTopbarPromptPlaceholderItem");
    assert.doesNotMatch(placeholderDelete, /openConfirmationAction/, "topbar placeholder delete must use an undo toast");
    assert.match(placeholderDelete, /actionLabel:\s*t\("common.undo"\)/, "topbar placeholder delete must offer undo");

    const applyImportSource = directFunctionSource(
      path.join(root, "app/settings/import-export.js"),
      "applyImportedConfig"
    );
    const committedWriteIndex = applyImportSource.indexOf("await importConfigPatch");
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
