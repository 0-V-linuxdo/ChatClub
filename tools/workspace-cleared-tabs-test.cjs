#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/workspace/cleared-tabs-controller.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../styles/chatclub.css"), "utf8");
  assert.match(source, /class: "workspace-cleared-tabs-banner"/);
  assert.doesNotMatch(source, /absorbIntoCurrent/);
  assert.doesNotMatch(source, /currentWorkspaceIsEmpty/);
  assert.doesNotMatch(source, /createActionButton/, "banner actions must keep visible labels outside the compact topbar action-button rules");
  assert.match(source, /workspace\.clearedTabs\.dismiss/);
  assert.match(source, /"danger"/, "Dismiss must use the danger button variant");
  assert.match(css, /\.workspace-cleared-tabs-banner \.button-danger:hover\s*\{[^}]*background:\s*var\(--danger\)/, "Dismiss hover must turn red");
  assert.match(source, /workspace-cleared-tabs-banner-count/, "the cleared-tab count must be a highlighted node");
  assert.match(source, /plural: n === 1 \? "" : "s"/, "English banner copy must choose tab vs tabs");
  assert.match(source, /WORKSPACE_SESSION_RECOVERY_KEY/, "the banner must observe durable recovery changes");
  assert.match(source, /lastShell = shell/, "the controller must retain its rendered shell for late recovery candidates");
  assert.match(source, /syncBanner\(lastShell\)/, "late recovery candidates must update the existing shell");
  assert.match(source, /foregroundHost/, "recovery controls must support a foreground Settings host");
  assert.match(source, /next\.inert = suppressed/, "the covered base banner must not remain keyboard-focusable");
  assert.match(source, /next\.setAttribute\("aria-hidden", "true"\)/,
    "the covered base banner must not expose duplicate status/actions to assistive technology");
  assert.doesNotMatch(source, /refreshFailures > RETRY_DELAYS_MS\.length/,
    "background startup retries must not stop after a fixed number of failures");
  assert.match(source, /Math\.min\([\s\S]*?refreshFailures - 1[\s\S]*?RETRY_DELAYS_MS\.length - 1/,
    "background startup retries must continue at the capped delay");
  assert.match(css, /\.workspace-cleared-tabs-banner\s*\{[^}]*justify-content:\s*center/, "banner copy and actions must sit in the center");
  assert.match(css, /\.workspace-cleared-tabs-banner-count\s*\{[^}]*background:\s*var\(--primary\)/, "the count must use a filled badge, not colored text alone");
  assert.doesNotMatch(css, /\.app-shell\.fullscreen-mode \.workspace-cleared-tabs-banner\s*\{[^}]*display:\s*none/, "fullscreen mode must not hide the only restore prompt");
  assert.match(css, /\.app-shell\.fullscreen-mode\.has-cleared-tabs-banner\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/, "fullscreen mode must reserve a row for recovery");
  assert.match(css, /\.settings-modal\.has-cleared-tabs-banner\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/,
    "Settings must reserve a visible row for recovery controls");
  const i18n = fs.readFileSync(path.join(__dirname, "../shared/i18n.js"), "utf8");
  assert.match(i18n, /workspace\.clearedTabs\.banner": "\{count\} closed or cleared ChatClub tab\{plural\} can be restored/);
  assert.doesNotMatch(i18n, /tab\(s\)/);
  const { createWorkspaceClearedTabsController } = await import("../app/workspace/cleared-tabs-controller.js");
  const { WORKSPACE_SESSION_RECOVERY_KEY } = await import("../shared/workspace-session.js");

  function extensionEvent() {
    const listeners = new Set();
    return {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
      emit(...args) { for (const listener of [...listeners]) listener(...args); },
      size() { return listeners.size; }
    };
  }

  function domEvents() {
    const listeners = new Map();
    return {
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      emit(type, event = {}) { for (const listener of [...(listeners.get(type) || [])]) listener(event); },
      size(type) { return listeners.get(type)?.size || 0; }
    };
  }

  const waitForRefresh = () => new Promise((resolve) => { setTimeout(resolve, 120); });
  const clearedItem = (workspaceId, values = {}) => ({
    workspaceId,
    eventId: `event-${workspaceId}`,
    windowId: 1,
    index: 0,
    pinned: false,
    ...values
  });

  function controller(overrides = {}) {
    const calls = [];
    const toasts = [];
    let renders = 0;
    const { requestBackground: overrideRequest, ...rest } = overrides;
    const api = createWorkspaceClearedTabsController({
      requestBackground: async (action, payload = {}) => {
        calls.push({ action, payload });
        if (overrideRequest) return overrideRequest(action, payload);
        if (action === "listClearedWorkspaceTabs") {
          return { tabs: [clearedItem("page-aaaaaaaaaaaa")] };
        }
        if (action === "restoreClearedWorkspaceTabs") {
          return {
            restored: 1,
            absorbed: null,
            opened: [{ workspaceId: "page-aaaaaaaaaaaa", tabId: 91 }],
            tabs: []
          };
        }
        if (action === "dismissClearedWorkspaceTabs") return { dismissed: 1, tabs: [] };
        return {};
      },
      toast: (message, kind) => { toasts.push({ message, kind }); },
      render: () => { renders += 1; },
      ...rest
    });
    return { api, calls, toasts, get renders() { return renders; } };
  }

  {
    const fixture = controller();
    const listed = await fixture.api.refresh();
    assert.equal(listed.length, 1);
    await fixture.api.restore();
    assert.deepEqual(fixture.calls.map((call) => call.action), [
      "listClearedWorkspaceTabs",
      "restoreClearedWorkspaceTabs"
    ]);
    assert.equal(Object.hasOwn(fixture.calls[1].payload, "absorbIntoCurrent"), false);
    assert.deepEqual(fixture.calls[1].payload.candidates, [{
      workspaceId: "page-aaaaaaaaaaaa",
      eventId: "event-page-aaaaaaaaaaaa"
    }]);
    assert.equal(fixture.api.currentItems().length, 0);
    assert.equal(fixture.renders, 1);
    assert.equal(fixture.toasts[0].kind, "success");
  }

  {
    const remaining = clearedItem("page-bbbbbbbbbbbb", { index: 1 });
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listClearedWorkspaceTabs") return {
          tabs: [
            clearedItem("page-aaaaaaaaaaaa"),
            remaining
          ]
        };
        if (action === "restoreClearedWorkspaceTabs") return {
          restored: 1,
          absorbed: null,
          opened: [{ workspaceId: "page-aaaaaaaaaaaa", tabId: 91 }],
          remainingTabs: [remaining]
        };
        return {};
      }
    });
    await fixture.api.refresh();
    await fixture.api.restore();
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [remaining.workspaceId]);
    assert.equal(fixture.toasts.at(-1).kind, "success");
  }

  {
    const pending = clearedItem("page-cccccccccccc", { windowId: 2 });
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listClearedWorkspaceTabs") return { tabs: [pending] };
        if (action === "restoreClearedWorkspaceTabs") return {
          restored: 0,
          absorbed: null,
          opened: [],
          tabs: [pending]
        };
        return {};
      }
    });
    await fixture.api.refresh();
    await fixture.api.restore();
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [pending.workspaceId]);
    assert.equal(fixture.toasts.at(-1).kind, "error");
  }

  {
    const first = clearedItem("page-dddddddddddd", { windowId: 3 });
    const second = clearedItem("page-eeeeeeeeeeee", { windowId: 3, index: 1 });
    let restored = false;
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listClearedWorkspaceTabs") return { tabs: restored ? [second] : [first, second] };
        if (action === "restoreClearedWorkspaceTabs") {
          restored = true;
          return { restored: 1, absorbed: null, opened: [{ workspaceId: first.workspaceId, tabId: 92 }] };
        }
        return {};
      }
    });
    await fixture.api.refresh();
    await fixture.api.restore();
    assert.deepEqual(fixture.calls.map((call) => call.action), [
      "listClearedWorkspaceTabs",
      "restoreClearedWorkspaceTabs",
      "listClearedWorkspaceTabs"
    ]);
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [second.workspaceId]);
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    await fixture.api.dismiss();
    assert.equal(fixture.calls.at(-1).action, "dismissClearedWorkspaceTabs");
    assert.deepEqual(fixture.calls.at(-1).payload.candidates, [{
      workspaceId: "page-aaaaaaaaaaaa",
      eventId: "event-page-aaaaaaaaaaaa"
    }]);
    assert.equal(fixture.api.currentItems().length, 0);
    assert.equal(fixture.renders, 1);
  }

  {
    const first = clearedItem("page-dismissracea");
    const concurrent = clearedItem("page-dismissraceb", { index: 1 });
    const fixture = controller({
      requestBackground: async (action, payload) => {
        if (action === "listClearedWorkspaceTabs") return { tabs: [first] };
        if (action === "dismissClearedWorkspaceTabs") {
          assert.deepEqual(payload.candidates, [{ workspaceId: first.workspaceId, eventId: first.eventId }]);
          return { dismissed: 1, tabs: [concurrent] };
        }
        return {};
      }
    });
    await fixture.api.refresh();
    await fixture.api.dismiss();
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [concurrent.workspaceId],
      "a candidate arriving after render must remain visible after scoped dismiss");
  }

  for (const actionName of ["restore", "dismiss"]) {
    const first = clearedItem(`page-${actionName}stalea`);
    const concurrent = clearedItem(`page-${actionName}staleb`, { index: 1 });
    const backgroundAction = actionName === "restore"
      ? "restoreClearedWorkspaceTabs"
      : "dismissClearedWorkspaceTabs";
    let listed = [first];
    let settleAction;
    const fixture = controller({
      requestBackground: async (action) => {
        if (action === "listClearedWorkspaceTabs") return { tabs: listed };
        if (action === backgroundAction) return new Promise((resolve) => { settleAction = resolve; });
        return {};
      }
    });
    await fixture.api.refresh();
    const pendingAction = fixture.api[actionName]();
    listed = [concurrent];
    await fixture.api.refresh();
    settleAction(actionName === "restore"
      ? { restored: 1, absorbed: null, opened: [{ workspaceId: first.workspaceId, tabId: 93 }], tabs: [] }
      : { dismissed: 1, tabs: [] });
    await pendingAction;
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [concurrent.workspaceId],
      `a stale ${actionName} response must not erase a newer observed recovery event`);
  }

  {
    const onCreated = extensionEvent();
    const onRemoved = extensionEvent();
    const onUpdated = extensionEvent();
    const onChanged = extensionEvent();
    const ownerDocument = domEvents();
    const ownerWindow = domEvents();
    let listed = [clearedItem("page-ffffffffffff", { windowId: 4 })];
    const fixture = controller({
      extensionApi: () => ({
        tabs: { onCreated, onRemoved, onUpdated },
        storage: { onChanged }
      }),
      document: ownerDocument,
      window: ownerWindow,
      requestBackground: async (action) => action === "listClearedWorkspaceTabs" ? { tabs: listed } : {}
    });
    assert.equal(fixture.api.install(), true);
    assert.equal(fixture.api.install(), false, "listener installation must be idempotent");
    assert.equal(onCreated.size(), 1);
    assert.equal(onRemoved.size(), 1);
    assert.equal(onUpdated.size(), 1);
    assert.equal(onChanged.size(), 1);
    assert.equal(ownerDocument.size("visibilitychange"), 1);
    assert.equal(ownerWindow.size("pageshow"), 1);

    onChanged.emit({ unrelated: { newValue: true } }, "local");
    onChanged.emit({ [WORKSPACE_SESSION_RECOVERY_KEY]: { newValue: {} } }, "sync");
    await waitForRefresh();
    assert.equal(fixture.calls.length, 0, "only local recovery changes may refresh the banner");

    onCreated.emit({});
    onRemoved.emit(1, {});
    onUpdated.emit(1, {}, {});
    ownerDocument.emit("visibilitychange");
    ownerWindow.emit("pageshow");
    onChanged.emit({ [WORKSPACE_SESSION_RECOVERY_KEY]: { newValue: {} } }, "local");
    await waitForRefresh();
    assert.equal(fixture.calls.length, 1, "bursty lifecycle events must collapse into one refresh");
    assert.equal(fixture.api.currentItems()[0].workspaceId, listed[0].workspaceId);

    listed = [clearedItem("page-gggggggggggg", { windowId: 4, index: 1 })];
    onRemoved.emit(2, {});
    assert.equal(fixture.api.detach(), true);
    assert.equal(fixture.api.detach(), false, "detach must be idempotent");
    await waitForRefresh();
    assert.equal(fixture.calls.length, 1, "detach must cancel a pending refresh");
    assert.equal(onCreated.size(), 0);
    assert.equal(onRemoved.size(), 0);
    assert.equal(onUpdated.size(), 0);
    assert.equal(onChanged.size(), 0);
    assert.equal(ownerDocument.size("visibilitychange"), 0);
    assert.equal(ownerWindow.size("pageshow"), 0);
  }

  {
    const recovered = clearedItem("page-racerecovery1", { windowId: 5 });
    let requestCount = 0;
    let resolveOldRequest;
    const fixture = controller({
      document: { visibilityState: "visible" },
      requestBackground: async (action) => {
        assert.equal(action, "listClearedWorkspaceTabs");
        requestCount += 1;
        if (requestCount === 1) {
          return new Promise((resolve) => { resolveOldRequest = resolve; });
        }
        if (requestCount === 2) throw new Error("newer refresh failed");
        return { tabs: [recovered] };
      }
    });
    fixture.api.install();
    const oldRefresh = fixture.api.refresh();
    await assert.rejects(fixture.api.refresh(), /newer refresh failed/);
    resolveOldRequest({ tabs: [] });
    await oldRefresh;
    await new Promise((resolve) => { setTimeout(resolve, 350); });
    assert.equal(requestCount, 3, "an older success must not cancel the newer failure's retry");
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [recovered.workspaceId]);
    fixture.api.detach();
  }

  {
    const previous = clearedItem("page-validbeforebad", { windowId: 5 });
    const recovered = clearedItem("page-validafterretry", { windowId: 5, index: 1 });
    let requestCount = 0;
    const fixture = controller({
      document: { visibilityState: "visible" },
      requestBackground: async (action) => {
        assert.equal(action, "listClearedWorkspaceTabs");
        requestCount += 1;
        if (requestCount === 1) return { tabs: [{ workspaceId: "page-missingeventid", windowId: 5 }] };
        return { tabs: [recovered] };
      }
    });
    fixture.api.setItems([previous]);
    fixture.api.install();
    await assert.rejects(fixture.api.refresh(), /requires workspaceId and eventId/);
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [previous.workspaceId],
      "a malformed inventory must not partially clear the last valid banner state");
    await new Promise((resolve) => { setTimeout(resolve, 350); });
    assert.equal(requestCount, 2, "a malformed inventory must enter the normal retry path");
    assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [recovered.workspaceId]);
    fixture.api.detach();
  }

  {
    let requests = 0;
    const fixture = controller({
      document: { visibilityState: "visible" },
      inventoryTimeoutMs: 20,
      requestBackground: async () => {
        requests += 1;
        return new Promise(() => {});
      }
    });
    fixture.api.install();
    await assert.rejects(fixture.api.refresh(), /inventory timed out/);
    assert.equal(requests, 1, "a hung inventory request must time out and enter the retry path");
    fixture.api.detach();
  }

  {
    class FakeNode {
      constructor(tagName = "") {
        this.tagName = tagName;
        this.children = [];
        this.className = "";
        this.attributes = {};
        this.listeners = {};
        this.parentNode = null;
        this.isConnected = true;
        this.classList = {
          toggle: (name, force) => {
            const names = new Set(this.className.split(/\s+/).filter(Boolean));
            if (force) names.add(name);
            else names.delete(name);
            this.className = [...names].join(" ");
          }
        };
      }

      setAttribute(name, value) { this.attributes[name] = String(value); }
      removeAttribute(name) { delete this.attributes[name]; }
      addEventListener(type, listener) { this.listeners[type] = listener; }
      append(...children) {
        for (const child of children) {
          child.parentNode = this;
          this.children.push(child);
        }
      }
      prepend(child) {
        child.parentNode = this;
        this.children.unshift(child);
      }
      after(child) {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        child.parentNode = this.parentNode;
        this.parentNode.children.splice(index + 1, 0, child);
      }
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      }
      replaceWith(next) {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        next.parentNode = this.parentNode;
        this.parentNode.children[index] = next;
        this.parentNode = null;
      }
      querySelector(selector) {
        const className = selector.startsWith(".") ? selector.slice(1) : "";
        return this.children.find((child) => child.className.split(/\s+/).includes(className)) || null;
      }
    }

    const previousNode = globalThis.Node;
    const previousDocument = globalThis.document;
    globalThis.Node = FakeNode;
    globalThis.document = {
      createElement: (tagName) => new FakeNode(tagName),
      createTextNode: (text) => Object.assign(new FakeNode("#text"), { textContent: text })
    };
    try {
      const foregroundItem = clearedItem("page-settingsfront", { windowId: 5 });
      let foregroundItems = [];
      const settingsModal = new FakeNode("section");
      settingsModal.className = "settings-modal";
      const settingsHeader = new FakeNode("header");
      settingsHeader.className = "modal-header";
      settingsModal.append(settingsHeader, new FakeNode("div"));
      const foregroundFixture = controller({
        foregroundHost: () => settingsModal,
        requestBackground: async (action) => {
          if (action === "listClearedWorkspaceTabs") return { tabs: foregroundItems };
          if (action === "dismissClearedWorkspaceTabs") {
            foregroundItems = []; return { dismissed: 1, tabs: [] };
          }
          return {};
        }
      });
      const foregroundShell = new FakeNode("main");
      foregroundFixture.api.syncBanner(foregroundShell);
      await foregroundFixture.api.refresh();
      foregroundItems = [foregroundItem];
      await foregroundFixture.api.refresh();
      assert.ok(settingsModal.querySelector(".workspace-cleared-tabs-banner"),
        "a candidate arriving after Settings opens must be actionable in the foreground modal");
      assert.match(settingsModal.className, /\bhas-cleared-tabs-banner\b/);
      const coveredBanner = foregroundShell.querySelector(".workspace-cleared-tabs-banner");
      const foregroundBanner = settingsModal.querySelector(".workspace-cleared-tabs-banner");
      assert.equal(coveredBanner.inert, true, "the banner behind Settings must not be focusable");
      assert.equal(coveredBanner.attributes["aria-hidden"], "true",
        "the banner behind Settings must be hidden from assistive technology");
      assert.equal(foregroundBanner.inert, false, "the foreground banner must remain actionable");
      assert.equal(foregroundBanner.attributes["aria-hidden"], undefined);

      settingsModal.isConnected = false;
      foregroundFixture.api.syncBanner(foregroundShell);
      const uncoveredBanner = foregroundShell.querySelector(".workspace-cleared-tabs-banner");
      assert.equal(uncoveredBanner.inert, false, "closing Settings must reactivate the base banner");
      assert.equal(uncoveredBanner.attributes["aria-hidden"], undefined,
        "closing Settings must restore base-banner accessibility");
      settingsModal.isConnected = true;
      await foregroundFixture.api.dismiss();
      assert.equal(settingsModal.querySelector(".workspace-cleared-tabs-banner"), null);
      assert.equal(foregroundShell.querySelector(".workspace-cleared-tabs-banner"), null);

      const recovered = clearedItem("page-hhhhhhhhhhhh", { windowId: 5 });
      let requests = 0;
      let rejectRequests = true;
      const fixture = controller({
        document: { visibilityState: "visible" },
        requestBackground: async (action) => {
          if (action === "dismissClearedWorkspaceTabs") return { dismissed: 1, tabs: [] };
          assert.equal(action, "listClearedWorkspaceTabs");
          requests += 1;
          if (rejectRequests) throw new Error("temporary background startup failure");
          return { tabs: [recovered] };
        }
      });
      const shell = new FakeNode("main");
      assert.equal(fixture.api.install(), true);
      fixture.api.syncBanner(shell);

      await assert.rejects(fixture.api.refresh(), /temporary background startup failure/);
      rejectRequests = false;
      await new Promise((resolve) => { setTimeout(resolve, 350); });

      assert.equal(requests, 2, "the first failure must retry after the initial 250ms backoff");
      assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [recovered.workspaceId]);
      const displayed = shell.querySelector(".workspace-cleared-tabs-banner");
      assert.ok(displayed, "the successful retry must display the recovered-tab banner");
      assert.match(shell.className, /\bhas-cleared-tabs-banner\b/);

      rejectRequests = true;
      await assert.rejects(fixture.api.refresh(), /temporary background startup failure/);
      assert.deepEqual(fixture.api.currentItems().map((item) => item.workspaceId), [recovered.workspaceId],
        "a later refresh failure must retain already displayed recovery items");
      assert.equal(shell.querySelector(".workspace-cleared-tabs-banner"), displayed,
        "a later refresh failure must not clear the displayed recovery banner");

      await fixture.api.dismiss();
      assert.equal(shell.querySelector(".workspace-cleared-tabs-banner"), null,
        "dismiss must update a failure shell without rebuilding the application");
      assert.equal(fixture.renders, 0, "a connected failure shell must be updated owner-locally");

      assert.equal(fixture.api.detach(), true);
      await new Promise((resolve) => { setTimeout(resolve, 350); });
      assert.equal(requests, 3, "detach must cancel the pending retry");
    } finally {
      globalThis.Node = previousNode;
      globalThis.document = previousDocument;
    }
  }

  console.log("workspace cleared tabs banner: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
