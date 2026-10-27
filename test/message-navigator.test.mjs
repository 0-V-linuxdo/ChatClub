import test from "node:test";
import assert from "node:assert/strict";
import { effectiveConfigs, storedConfigs, resolveConfig, validateConfig, clampSummary, covers } from "../src/plugins/message-navigator/model.js";

const builtins = [
  { id: "chatgpt", name: "ChatGPT", appIds: ["ChatGPT"], hosts: ["chatgpt.com"], messageSelector: "[data-message-author-role]" },
  { id: "claude", name: "Claude", appIds: ["Claude"], hosts: ["claude.ai"], messageSelector: ".m" },
];

test("built-ins come back unchanged when nothing is stored", () => {
  const list = effectiveConfigs(builtins, []);
  assert.deepEqual(list.map((c) => c.id), ["chatgpt", "claude"]);
  assert.equal(list[0].adapter, "chatgpt");
  assert.equal(list[0].summaryMaxChars, 60);
  assert.deepEqual(storedConfigs(builtins, list), []);
});

test("sparse overrides, custom entries and order round-trip", () => {
  const list = effectiveConfigs(builtins, []);
  list[1] = { ...list[1], enabled: false };
  list.push({ id: "custom-x", name: "X", hosts: ["x.com"], messageSelector: ".msg", builtIn: false });
  const stored = storedConfigs(builtins, list);
  assert.deepEqual(stored, [{ id: "claude", builtIn: true, enabled: false }, { id: "custom-x", name: "X", hosts: ["x.com"], messageSelector: ".msg", builtIn: false }]);
  const again = effectiveConfigs(builtins, stored);
  assert.deepEqual(again.map((c) => c.id), ["chatgpt", "claude", "custom-x"]);
  assert.equal(again.find((c) => c.id === "claude").enabled, false);
  assert.equal(again.find((c) => c.id === "claude").overridden, true);

  const reordered = [again.find((c) => c.id === "custom-x"), ...again.filter((c) => c.id !== "custom-x")];
  const s2 = storedConfigs(builtins, reordered);
  assert.deepEqual(s2.map((c) => c.id), ["custom-x", ...reordered.slice(1).map((c) => c.id)]);
  assert.deepEqual(effectiveConfigs(builtins, s2).map((c) => c.id), reordered.map((c) => c.id));
});

test("same-id custom entry overrides a built-in", () => {
  const list = effectiveConfigs(builtins, [{ id: "claude", builtIn: true, messageSelector: ".custom" }]);
  assert.deepEqual(list.map((c) => c.id), ["chatgpt", "claude"]);
  assert.equal(list[1].messageSelector, ".custom");
  assert.equal(list[1].overridden, true);
});

test("resolve: first enabled match, disabled-only match, generic fallback", () => {
  const list = effectiveConfigs(builtins, [{ id: "claude", builtIn: true, enabled: false }]);
  assert.equal(resolveConfig(list, { appId: "ChatGPT", href: "https://chatgpt.com/c/1" }).config.id, "chatgpt");
  assert.deepEqual(resolveConfig(list, { appId: "Claude", href: "https://claude.ai/chat/1" }), { config: null, disabled: true });
  assert.deepEqual(resolveConfig(list, { appId: "LocalTest", href: "http://127.0.0.1/x" }), { config: null });
  assert.equal(covers({ appIds: [], hosts: ["*.example.com"], pathPrefixes: ["/chat"] }, { href: "https://a.example.com/chat/2" }), true);
  assert.equal(covers({ appIds: [], hosts: ["example.com"], pathPrefixes: ["/chat"] }, { href: "https://example.com/" }), false);
});

test("validation and summary clamp", () => {
  assert.equal(validateConfig({ name: "", appIds: ["A"], messageSelector: ".m" }), "nav.sites.required.name");
  assert.equal(validateConfig({ name: "A", appIds: [], hosts: [], messageSelector: ".m" }), "nav.sites.required.scope");
  assert.equal(validateConfig({ name: "A", hosts: ["a.com"], messageSelector: " " }), "nav.sites.required.selector");
  assert.equal(validateConfig({ name: "A", hosts: ["a.com"], messageSelector: ".m" }), null);
  assert.equal(clampSummary(5), 20);
  assert.equal(clampSummary(500), 180);
  assert.equal(clampSummary("x"), 60);
});
