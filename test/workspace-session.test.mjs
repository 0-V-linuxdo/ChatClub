import { test } from "node:test";
import assert from "node:assert/strict";

function fakeChrome(initial, tabs = []) {
  const data = { ...initial };
  globalThis.chrome = {
    runtime: { getURL: (p) => `chrome-extension://x/${p}` },
    tabs: { query: async () => tabs, get: async (id) => tabs.find((t) => t.id === id) },
    storage: {
      local: {
        get: async (key) => (key === null ? { ...data } : { [key]: data[key] }),
        set: async (obj) => Object.assign(data, obj),
        remove: async (keys) => [].concat(keys).forEach((k) => delete data[k]),
      },
    },
  };
  return data;
}

test("legacy Mirror records move to workspace records (07 §2)", async () => {
  const gen = "chatclub-workspace-session-default-v1";
  const data = fakeChrome({
    "chatclubWorkspaceSessionMirror:12": { generation: gen, snapshot: { groups: [{ tabs: [{ appId: "Claude", currentHref: "https://claude.ai/chat/a" }], activeIndex: 0 }] } },
    "chatclubWorkspaceSessionMirror:7": { generation: gen, snapshot: { groups: [] } },
    "chatclubWorkspaceSessionMirror:9": { generation: "old", snapshot: { groups: [] } },
    "chatclubWorkspaceSessionMirror:5": { groups: [] },
  }, [{ id: 7, url: "chrome-extension://x/chatClub.html#workspace=page-0123abcd-0000", windowId: 1, index: 0 }]);
  const mod = await import("../src/plugins/workspace-session/background.js");
  await mod.default.start({ logger: console });
  const keys = Object.keys(data);
  assert.ok(!keys.some((k) => k.startsWith("chatclubWorkspaceSessionMirror:")));
  assert.equal(data["chatclubWorkspaceSessionWorkspace:page-legacy-tab-12"].detachReason, "migrated");
  assert.equal(data["chatclubWorkspaceSessionWorkspace:page-0123abcd-0000"].tabId, 7);
  assert.equal(data["chatclubWorkspaceSessionBinding:7"], "page-0123abcd-0000");
  assert.ok(!data["chatclubWorkspaceSessionWorkspace:page-legacy-tab-9"]);
  assert.equal(data.chatclubWorkspaceSessionGeneration, gen);
});
