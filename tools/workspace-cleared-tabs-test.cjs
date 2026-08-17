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
  assert.match(css, /\.workspace-cleared-tabs-banner\s*\{[^}]*justify-content:\s*center/, "banner copy and actions must sit in the center");
  assert.match(css, /\.workspace-cleared-tabs-banner-count\s*\{[^}]*background:\s*var\(--primary\)/, "the count must use a filled badge, not colored text alone");
  const i18n = fs.readFileSync(path.join(__dirname, "../shared/i18n.js"), "utf8");
  assert.match(i18n, /workspace\.clearedTabs\.banner": "\{count\} ChatClub tab\{plural\} \{were\}/);
  assert.doesNotMatch(i18n, /tab\(s\)/);
  const { createWorkspaceClearedTabsController } = await import("../app/workspace/cleared-tabs-controller.js");

  function controller(overrides = {}) {
    const calls = [];
    const toasts = [];
    let renders = 0;
    const api = createWorkspaceClearedTabsController({
      requestBackground: async (action, payload = {}) => {
        calls.push({ action, payload });
        if (action === "listClearedWorkspaceTabs") {
          return { tabs: [{ workspaceId: "page-aaaaaaaaaaaa", windowId: 1, index: 0, pinned: false }] };
        }
        if (action === "restoreClearedWorkspaceTabs") {
          return {
            restored: 1,
            absorbed: null,
            opened: [{ workspaceId: "page-aaaaaaaaaaaa", tabId: 91 }]
          };
        }
        if (action === "dismissClearedWorkspaceTabs") return { dismissed: 1, tabs: [] };
        return {};
      },
      toast: (message, kind) => { toasts.push({ message, kind }); },
      render: () => { renders += 1; },
      ...overrides
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
    assert.equal(fixture.api.currentItems().length, 0);
    assert.equal(fixture.renders, 1);
    assert.equal(fixture.toasts[0].kind, "success");
  }

  {
    const fixture = controller();
    await fixture.api.refresh();
    await fixture.api.dismiss();
    assert.equal(fixture.calls.at(-1).action, "dismissClearedWorkspaceTabs");
    assert.equal(fixture.api.currentItems().length, 0);
    assert.equal(fixture.renders, 1);
  }

  console.log("workspace cleared tabs banner: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
