#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);
const NONCE_A = `ccn-${"a".repeat(32)}`;
const NONCE_B = `ccn-${"b".repeat(32)}`;
const PARAM = "__chatclub_frame_load_nonce";
const RULE_ID_MIN = 1_840_000_000;
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => { setImmediate(resolve); });

function fakeClock(start = 1_000) {
  let current = start;
  let nextTimer = 0;
  const timers = new Map();
  return {
    now: () => current,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: current + delay, callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    async advance(ms) {
      current += ms;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= current);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
      await flush();
    },
    timers
  };
}

function fakeApi(options = {}) {
  const rules = new Map((options.rules || []).map((rule) => [rule.id, plain(rule)]));
  const calls = { debugger: 0, getSessionRules: 0, updates: [], inFlight: 0, maxInFlight: 0 };
  const api = {
    runtime: { getURL: () => options.extensionUrl || "chrome-extension://chatclub/" },
    debugger: {
      async getTargets() { calls.debugger += 1; throw new Error("Notion must never show a debugger banner"); },
      async attach() { calls.debugger += 1; throw new Error("Notion must never attach a debugger"); },
      async sendCommand() { calls.debugger += 1; throw new Error("Notion must never evaluate in a target"); }
    },
    declarativeNetRequest: {
      async getSessionRules() {
        calls.getSessionRules += 1;
        return [...rules.values()].map(plain);
      },
      async updateSessionRules(details) {
        calls.inFlight += 1;
        calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
        calls.updates.push(plain(details));
        try {
          if (typeof options.beforeUpdate === "function") await options.beforeUpdate(details, calls.updates.length);
          for (const id of details.removeRuleIds || []) rules.delete(id);
          for (const rule of details.addRules || []) rules.set(rule.id, plain(rule));
        } finally {
          calls.inFlight -= 1;
        }
      }
    }
  };
  if (options.sessionRules === false) delete api.declarativeNetRequest.getSessionRules;
  return { api, calls, rules };
}

(async () => {
  const frameConfig = await load("shared/chat-frame-config.js");
  const notion = await load("background/notion-frame-preflight.js");
  const source = read("background/notion-frame-preflight.js");
  const targetA = frameConfig.notionFrameLoadTarget("https://app.notion.com/ai?mode=new#composer", NONCE_A);
  const targetB = frameConfig.notionFrameLoadTarget("https://app.notion.com/chat?t=second", NONCE_B);
  const replayTargetA = frameConfig.notionFrameLoadTarget("https://app.notion.com/chat?t=replay", NONCE_A);

  assert.deepEqual(targetA, {
    logicalHref: "https://app.notion.com/ai?mode=new#composer",
    navigationHref: `https://app.notion.com/ai?mode=new&${PARAM}=${NONCE_A}#composer`,
    nonce: NONCE_A
  });
  assert.equal(frameConfig.stripNotionFrameLoadNonce(targetA.navigationHref), targetA.logicalHref);
  assert.equal(frameConfig.stripValidNotionFrameLoadNonce(targetA.navigationHref), targetA.logicalHref);
  assert.equal(frameConfig.frameDocumentUrlsMatch(targetA.navigationHref, targetA.logicalHref), true);
  assert.equal(frameConfig.frameDocumentUrlsMatch(targetA.logicalHref, targetA.navigationHref), true);
  assert.equal(
    frameConfig.frameDocumentUrlsMatch(
      targetA.navigationHref,
      targetA.navigationHref.replace(NONCE_A, `ccn-${"f".repeat(32)}`)
    ),
    false
  );
  assert.equal(
    frameConfig.stripValidNotionFrameLoadNonce("https://app.notion.com/ai?__chatclub_frame_load_nonce=garbage"),
    "https://app.notion.com/ai?__chatclub_frame_load_nonce=garbage"
  );
  assert.equal(
    frameConfig.stripValidNotionFrameLoadNonce(
      "https://app.notion.com/ai?__chatclub_frame_load_nonce=ccn-0123456789abcdef0123456789abcdef&__chatclub_frame_load_nonce=ccn-fedcba9876543210fedcba9876543210"
    ),
    "https://app.notion.com/ai?__chatclub_frame_load_nonce=ccn-0123456789abcdef0123456789abcdef&__chatclub_frame_load_nonce=ccn-fedcba9876543210fedcba9876543210"
  );
  assert.deepEqual(frameConfig.notionFrameLoadRequest(targetA.navigationHref, NONCE_A), {
    navigationHref: targetA.navigationHref,
    networkHref: `https://app.notion.com/ai?mode=new&${PARAM}=${NONCE_A}`,
    nonce: NONCE_A
  });

  const ruleFixture = fakeApi();
  const ruleRuntime = notion.createNotionFramePreflightRuntime(ruleFixture.api, fakeClock());
  assert.deepEqual(
    await ruleRuntime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 70 }),
    { applicable: true, armed: true, reason: "" }
  );
  const rule = ruleFixture.calls.updates[0].addRules[0];
  assert.ok(rule);
  assert.equal(rule.action.type, "modifyHeaders");
  assert.equal(Object.hasOwn(rule.action, "requestHeaders"), false, "the SW fetch rule must be response-header-only");
  assert.deepEqual(rule.action.responseHeaders, [
    { header: "X-Frame-Options", operation: "remove" },
    { header: "Content-Security-Policy", operation: "remove" },
    { header: "Content-Security-Policy-Report-Only", operation: "remove" }
  ]);
  assert.deepEqual(rule.condition.requestDomains, ["app.notion.com"]);
  assert.deepEqual(rule.condition.initiatorDomains, ["app.notion.com"]);
  assert.deepEqual(rule.condition.requestMethods, ["get"]);
  assert.deepEqual(rule.condition.resourceTypes, ["xmlhttprequest", "other"]);
  assert.equal(Object.hasOwn(rule.condition, "tabIds"), false, "Service Worker fetches must not depend on a tab id");
  for (const resourceType of ["main_frame", "sub_frame", "websocket", "script", "image"]) {
    assert.ok(!rule.condition.resourceTypes.includes(resourceType), `${resourceType} must remain outside the ephemeral rule`);
  }
  const match = new RegExp(rule.condition.regexFilter);
  const networkHref = frameConfig.notionFrameLoadRequest(targetA.navigationHref, NONCE_A).networkHref;
  assert.ok(match.test(networkHref), "the exact fallback fetch must match");
  assert.ok(match.test(`${networkHref}&assetsVersion=23.13.20260728.0917&clientBuildTarget=web`), "the current official SW pinned fetch must match");
  assert.ok(!match.test(`${networkHref}&assetsVersion=23&clientBuildTarget=web&extra=1`));
  assert.ok(!match.test(networkHref.replace(NONCE_A, NONCE_B)), "another nonce must not match");
  assert.ok(!match.test(networkHref.replace("app.notion.com", "app.notion.com.evil.test")));
  assert.deepEqual(
    await ruleRuntime.prepareFrameLoad({ url: "https://app.notion.com/ai", preflightId: NONCE_A, tabId: 70 }),
    { applicable: false, armed: false, reason: "" }
  );
  const oversizedTarget = frameConfig.notionFrameLoadTarget(
    `https://app.notion.com/ai?q=${"x".repeat(2_000)}`,
    NONCE_A
  );
  assert.deepEqual(
    await ruleRuntime.prepareFrameLoad({ url: oversizedTarget.navigationHref, preflightId: NONCE_A, tabId: 70 }),
    { applicable: true, armed: false, reason: "invalid-rule" },
    "oversized regex rules must fail closed"
  );
  assert.doesNotMatch(source, /\b(?:debugger|getTargets|Runtime\.evaluate|DEBUG_instance)\b/, "Notion preflight must have no debug-banner path");

  {
    const clock = fakeClock();
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    assert.deepEqual(
      await runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 71 }),
      { applicable: true, armed: true, reason: "" }
    );
    assert.equal(fake.calls.debugger, 0);
    assert.equal(fake.calls.updates.length, 1);
    assert.deepEqual(fake.calls.updates[0].removeRuleIds, [RULE_ID_MIN]);
    assert.equal(fake.calls.updates[0].addRules[0].id, RULE_ID_MIN);
    assert.equal(runtime.activeSessionRules().length, 1);
    assert.equal([...clock.timers.values()][0].delay, 10_000);
    await clock.advance(9_999);
    assert.equal(runtime.activeSessionRules().length, 1);
    await clock.advance(1);
    assert.equal(runtime.activeSessionRules().length, 0);
    assert.deepEqual(fake.calls.updates.at(-1), { removeRuleIds: [RULE_ID_MIN] }, "timer cleanup must remove only its exact lease rule id");
    assert.equal(fake.rules.has(RULE_ID_MIN), false);
  }

  {
    const clock = fakeClock();
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    await Promise.all([
      runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 72 }),
      runtime.prepareFrameLoad({ url: targetB.navigationHref, preflightId: NONCE_B, tabId: 72 })
    ]);
    assert.equal(fake.calls.maxInFlight, 1, "ephemeral DNR mutations must be serialized");
    const [firstRule, secondRule] = runtime.activeSessionRules();
    assert.notEqual(firstRule.id, secondRule.id);
    runtime.settleNavigation({ tabId: 999, url: targetA.navigationHref });
    runtime.settleNavigation({ tabId: 72, url: targetA.logicalHref });
    runtime.settleNavigation({ tabId: 72, url: replayTargetA.navigationHref });
    await flush();
    assert.equal(runtime.activeSessionRules().length, 2, "wrong-tab, nonce-free, and same-nonce different-URL events must not release a lease");
    runtime.settleNavigation({ tabId: 72, url: targetA.navigationHref });
    await flush();
    assert.deepEqual(runtime.activeSessionRules().map((item) => item.id), [secondRule.id]);
    assert.deepEqual(fake.calls.updates.at(-1), { removeRuleIds: [firstRule.id] });
    assert.equal(fake.rules.has(secondRule.id), true, "settling one nonce must not remove another concurrent rule");
    runtime.handleTabRemoved(72);
    await flush();
    assert.equal(runtime.activeSessionRules().length, 0);
    assert.deepEqual(fake.calls.updates.at(-1), { removeRuleIds: [secondRule.id] });
  }

  {
    const order = [];
    const fake = fakeApi({ beforeUpdate: async () => { order.push("ephemeral"); } });
    const runtime = notion.createNotionFramePreflightRuntime(fake.api);
    const update = runtime.dnrRuleUpdater(async (tabId) => {
      assert.equal(tabId, 73);
      order.push("base");
      return "session";
    });
    await update(73, { url: targetA.navigationHref, preflightId: NONCE_A });
    assert.deepEqual(order, ["base", "ephemeral"], "base document rules must refresh before the nonce rule is armed");
    assert.equal(fake.calls.debugger, 0, "PREPARE must make zero debugger calls");
    const updatesBeforePlain = fake.calls.updates.length;
    await update(73, { url: "https://grok.com/", preflightId: "grok" });
    assert.equal(fake.calls.updates.length, updatesBeforePlain, "non-Notion PREPARE must not install an ephemeral rule");
  }

  {
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api);
    assert.equal(
      await runtime.cancelFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A }, 731),
      true,
      "a timeout cancellation must bind the exact tab, nonce and URL even if PREPARE is still pending"
    );
    assert.deepEqual(
      await runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 731 }),
      { applicable: true, armed: false, reason: "cancelled" }
    );
    assert.equal(fake.calls.updates.length, 0, "a late PREPARE must not install after logical-URL fallback");
  }

  {
    let releaseInstall;
    const installStarted = new Promise((resolve) => { releaseInstall = resolve; });
    let continueInstall;
    const installGate = new Promise((resolve) => { continueInstall = resolve; });
    const fake = fakeApi({
      beforeUpdate: async (details) => {
        if (!details.addRules?.length) return;
        releaseInstall();
        await installGate;
      }
    });
    const runtime = notion.createNotionFramePreflightRuntime(fake.api);
    const preparing = runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 732 });
    await installStarted;
    const cancelling = runtime.cancelFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A }, 732);
    continueInstall();
    assert.deepEqual(await preparing, { applicable: true, armed: false, reason: "cancelled" });
    assert.equal(await cancelling, true);
    assert.equal(runtime.activeSessionRules().length, 0);
    assert.deepEqual(fake.calls.updates.at(-1), { removeRuleIds: [RULE_ID_MIN] });
  }

  {
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api);
    const update = runtime.dnrRuleUpdater(async () => "dynamic");
    await assert.rejects(
      update(74, { url: targetA.navigationHref, preflightId: NONCE_A }),
      /session-rules-unavailable/
    );
    assert.equal(fake.calls.updates.length, 0, "Notion must never fall back to a persistent dynamic nonce rule");
  }

  {
    const firefox = fakeApi({ extensionUrl: "moz-extension://chatclub/" });
    const runtime = notion.createNotionFramePreflightRuntime(firefox.api);
    assert.deepEqual(
      await runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 75 }),
      { applicable: true, armed: false, reason: "session-rules-unavailable" }
    );
    assert.equal(firefox.calls.debugger, 0, "Firefox debugger stubs must never be treated as a Notion capability");
    assert.equal(firefox.calls.updates.length, 0);
  }

  {
    let failed = false;
    const fake = fakeApi({
      beforeUpdate: async (details) => {
        if (details.addRules?.length && !failed) {
          failed = true;
          throw new Error("expected install failure");
        }
      }
    });
    const runtime = notion.createNotionFramePreflightRuntime(fake.api);
    assert.deepEqual(
      await runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 76 }),
      { applicable: true, armed: false, reason: "session-rule-install-failed" }
    );
    assert.equal(runtime.activeSessionRules().length, 0);
    assert.deepEqual(fake.calls.updates.at(-1), { removeRuleIds: [RULE_ID_MIN] });
  }

  {
    const staleA = { id: RULE_ID_MIN, action: { type: "block" }, condition: {} };
    const staleB = { id: RULE_ID_MIN + 19, action: { type: "block" }, condition: {} };
    const ordinary = { id: 91, action: { type: "block" }, condition: {} };
    const fake = fakeApi({ rules: [staleA, ordinary, staleB] });
    const runtime = notion.createNotionFramePreflightRuntime(fake.api);
    assert.equal(await runtime.cleanupStaleSessionRules(), true);
    assert.deepEqual(fake.calls.updates, [{ removeRuleIds: [RULE_ID_MIN, RULE_ID_MIN + 19] }]);
    assert.deepEqual([...fake.rules.keys()], [91], "startup cleanup must retain unrelated session rules");
  }

  console.log("Notion frame ephemeral session DNR preflight: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
