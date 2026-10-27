import test from "node:test";
import assert from "node:assert/strict";
import {
  validateComponent, validateChannel, forbiddenField, verifySignature, signingInput, base64urlEncode, sha256Hex,
  checkWatermark, raiseWatermark, applyCandidate, rollbackLast, effectiveComponent, overlayConfig, pendingDeleteHosts,
  defaultState, componentDiff, nextCheckAt, compareVersions, CHECK_INTERVAL_MS, BACKOFF_MS,
} from "../src/plugins/official-rules/model.js";

const comp = (over = {}) => ({ schemaVersion: 1, rulesApiVersion: 1, feature: "summary", siteId: "gemini", revision: 2, status: "active", hosts: ["gemini.google.com"], pathPrefixes: [], selectors: { userRoot: ["user-query"] }, parameters: { waitMs: 500 }, ...over });

test("components are data only and within limits", () => {
  assert.equal(validateComponent(comp(), { feature: "summary", siteId: "gemini", revision: 2 }), null);
  assert.equal(validateComponent(comp({ selectors: { onClick: ["x"] } })), "forbiddenField:selectors.onClick");
  assert.equal(validateComponent(comp({ executeScript: "x" })), "forbiddenField:executeScript");
  assert.equal(validateComponent(comp({ selectors: { nope: ["x"] } })), "slot:nope");
  assert.equal(validateComponent(comp({ selectors: { userRoot: Array(9).fill("a") } })), "slotList:userRoot");
  assert.equal(validateComponent(comp({ selectors: { userRoot: ["a".repeat(513)] } })), "selector:userRoot");
  assert.equal(validateComponent(comp({ parameters: { waitMs: 70000 } })), "parameterRange:waitMs");
  assert.equal(validateComponent(comp(), { feature: "summary", siteId: "gemini", revision: 3 }), "pointerMismatch");
  assert.equal(forbiddenField({ a: [{ coordinates: 1 }] }), "a[0].coordinates");
  assert.equal(validateChannel({ schemaVersion: 1, channel: "stable", sequence: 1, rulesVersion: "1", rulesApiVersion: 1, minExtensionVersion: "2.0.0", catalog: { url: "c.json", signatureUrl: "c.sig.json", size: 10, sha256: "0".repeat(64), keyId: "k1" } }), null);
});

test("signatures are domain separated ES256 over the raw bytes", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  const bytes = new TextEncoder().encode('{"a":1}');
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signingInput("catalog", bytes));
  const sigDoc = { schemaVersion: 1, keyId: "k1", algorithm: "ES256", signature: base64urlEncode(sig) };
  assert.deepEqual(await verifySignature({ current: jwk }, "catalog", bytes, sigDoc), { ok: true, keyId: "k1" });
  // the same signature can't pass as another document kind
  assert.equal((await verifySignature({ current: jwk }, "channel", bytes, sigDoc)).ok, false);
  assert.equal((await verifySignature({ current: jwk }, "catalog", new TextEncoder().encode('{"a":2}'), sigDoc)).ok, false);
  assert.equal((await verifySignature({ current: jwk }, "catalog", bytes, { ...sigDoc, keyId: "other" })).reason, "unknownKey");
  assert.equal((await sha256Hex(bytes)).length, 64);
});

test("watermarks refuse rollbacks and survive rollback of the last update", () => {
  let wm = raiseWatermark(undefined, 5, { "summary/gemini": { revision: 2, sha256: "aa" } });
  assert.equal(checkWatermark(wm, 4), "sequenceRollback");
  assert.equal(checkWatermark(wm, 6, [{ feature: "summary", siteId: "gemini", revision: 1, sha256: "bb" }]), "revisionRollback:summary/gemini");
  assert.equal(checkWatermark(wm, 6, [{ feature: "summary", siteId: "gemini", revision: 2, sha256: "bb" }]), "hashChanged:summary/gemini");
  assert.equal(checkWatermark(wm, 6, [{ feature: "summary", siteId: "gemini", revision: 3, sha256: "cc" }]), null);

  let s = { ...defaultState(), mode: "manual", candidate: { sequence: 6, rulesVersion: "6", keyId: "k1", components: { "summary/gemini": { ...comp({ revision: 3 }), sha256: "cc" } }, removed: [] } };
  s = applyCandidate(s, 1000);
  assert.equal(s.current.sequence, 6);
  assert.equal(effectiveComponent(s, "summary/gemini").revision, 3);
  assert.equal(s.watermark.sequence, 6);
  s = rollbackLast(s);
  assert.equal(s.current, null);
  assert.equal(effectiveComponent(s, "summary/gemini"), null);
  assert.equal(s.watermark.sequence, 6);
});

test("overlay puts official data under user overrides and gates new delete hosts", () => {
  const base = { id: "gemini", hosts: ["gemini.google.com"], officialRuleHints: { userRoot: ["old"], assistantRoot: ["model-response"] } };
  const out = overlayConfig("summary", base, comp());
  assert.deepEqual(out.officialRuleHints, { userRoot: ["user-query"], assistantRoot: ["model-response"] });
  assert.equal(out.officialRuleWaitMs, 500);
  const del = { id: "gemini", hosts: ["gemini.google.com"], slots: { menuRoot: "a" } };
  const c = { revision: 1, status: "active", hosts: ["gemini.google.com", "gemini.google.cn"], selectors: { menuRoot: ["b", "c"] } };
  assert.deepEqual(overlayConfig("delete", del, c).hosts, ["gemini.google.com"]);
  assert.deepEqual(overlayConfig("delete", del, c, { approvedHosts: new Set(["gemini.google.cn"]) }).hosts, ["gemini.google.com", "gemini.google.cn"]);
  assert.equal(overlayConfig("delete", del, c).slots.menuRoot, "b, c");
  const state = { ...defaultState(), current: { components: { "delete/gemini": c } } };
  assert.deepEqual(pendingDeleteHosts(state, ["gemini.google.com"]), [{ key: "delete/gemini", host: "gemini.google.cn", approved: false }]);
});

test("diffs, schedule and versions", () => {
  const d = componentDiff(comp(), comp({ selectors: { userRoot: ["x"] }, parameters: {} }));
  assert.deepEqual(d.map((x) => x.field), ["selectors.userRoot", "parameters.waitMs"]);
  const s = { ...defaultState(), mode: "auto", lastCheckAt: 1000, jitterMs: 5 };
  assert.equal(nextCheckAt(s), 1000 + CHECK_INTERVAL_MS + 5);
  assert.equal(nextCheckAt({ ...s, failures: 2 }), 1000 + BACKOFF_MS[1]);
  assert.equal(nextCheckAt({ ...s, failures: 9 }), 1000 + BACKOFF_MS[3]);
  assert.equal(nextCheckAt({ ...s, mode: "manual" }), null);
  assert.equal(compareVersions("2.0.10", "2.0.9"), 1);
});

test("background check verifies the signed chain, stages a candidate and applies it", async () => {
  const store = {};
  globalThis.chrome = {
    storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, structuredClone(o)) } },
    alarms: { create: async () => {}, clear: async () => {} },
    runtime: { getManifest: () => ({ version: "2.0.0" }) },
  };
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  const files = {};
  const base = "https://rules.example.com/stable/";
  const put = async (kind, name, doc) => {
    const bytes = new TextEncoder().encode(JSON.stringify(doc));
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signingInput(kind, bytes));
    files[base + name] = bytes;
    files[base + name.replace(/\.json$/, ".sig.json")] = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, keyId: "k1", algorithm: "ES256", signature: base64urlEncode(sig) }));
    return { url: name, signatureUrl: name.replace(/\.json$/, ".sig.json"), size: bytes.length, sha256: await sha256Hex(bytes), keyId: "k1" };
  };
  const cptr = await put("component", "summary-gemini-3.json", comp({ revision: 3 }));
  const catPtr = await put("catalog", "catalog-7.json", { schemaVersion: 1, sequence: 7, releaseNotes: "fix gemini", components: [{ ...cptr, feature: "summary", siteId: "gemini", revision: 3 }] });
  await put("channel", "channel.json", { schemaVersion: 1, channel: "stable", sequence: 7, rulesVersion: "2026.10.22", rulesApiVersion: 1, minExtensionVersion: "2.0.0", publishedAt: "2026-10-22", catalog: catPtr });
  globalThis.fetch = async (url) => {
    const bytes = files[url];
    return { ok: !!bytes, status: bytes ? 200 : 404, url, arrayBuffer: async () => (bytes ?? new Uint8Array()).buffer.slice(0) };
  };
  const mod = await import("../src/plugins/official-rules/background.js");
  mod.configureForTest({ CHANNEL_URL: `${base}channel.json`, KEYS: { current: jwk } });
  const h = mod.default.handlers;
  let s = await h.checkOfficialRulesUpdate.handle({});
  assert.equal(s.status, "updateAvailable", s.lastError);
  assert.equal(s.candidate.sequence, 7);
  assert.deepEqual(s.candidate.diffs["summary/gemini"].map((d) => d.field).sort(), ["hosts", "parameters.waitMs", "selectors.userRoot", "status"]);
  s = await h.applyOfficialRulesUpdate.handle({});
  assert.equal(s.current.components["summary/gemini"].revision, 3);
  assert.equal(s.watermark.sequence, 7);
  s = await h.checkOfficialRulesUpdate.handle({});
  assert.equal(s.status, "upToDate");
  // a tampered catalog is refused
  files[base + "catalog-7.json"] = new TextEncoder().encode("{}");
  await h.resetOfficialRules.handle({});
  s = await h.checkOfficialRulesUpdate.handle({});
  assert.equal(s.status, "error");
  assert.equal(s.lastError, "sizeMismatch");
  assert.equal(s.watermark.sequence, 7, "reset keeps the watermark");
  // urls outside the channel directory are never fetched
  mod.configureForTest({ CHANNEL_URL: "", KEYS: {} });
  s = await h.checkOfficialRulesUpdate.handle({});
  assert.equal(s.lastError, "notConfigured");
});
