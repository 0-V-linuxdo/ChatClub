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
const registeredSender = (tabId, frameId, url, documentId = `document-${tabId}-${frameId}`) => ({
  tab: { id: tabId },
  frameId,
  documentId,
  url
});
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
  const storageState = options.storageState || {};
  const calls = {
    debugger: 0,
    alarmCreates: [],
    alarmClears: [],
    getSessionRules: 0,
    storageGets: 0,
    storageSets: [],
    updates: [],
    inFlight: 0,
    maxInFlight: 0
  };
  const api = {
    runtime: { getURL: () => options.extensionUrl || "chrome-extension://chatclub/" },
    alarms: {
      async create(name, details) {
        if (typeof options.beforeAlarmCreate === "function") await options.beforeAlarmCreate(name, details);
        calls.alarmCreates.push({ name, details: plain(details) });
      },
      async clear(name) {
        calls.alarmClears.push(name);
        return true;
      }
    },
    storage: {
      session: {
        async get(key) {
          calls.storageGets += 1;
          return Object.hasOwn(storageState, key) ? { [key]: plain(storageState[key]) } : {};
        },
        async set(value) {
          calls.storageSets.push(plain(value));
          Object.assign(storageState, plain(value));
        }
      }
    },
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
  if (options.sessionStorage === false) delete api.storage.session;
  if (options.alarms === false) delete api.alarms;
  return { api, calls, rules, storageState };
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
  assert.equal(frameConfig.notionFrameLoadTarget("https://app.notion.com/logout", NONCE_A), null);
  assert.equal(frameConfig.notionFrameLoadRequest(`https://app.notion.com/logout?${PARAM}=${NONCE_A}`, NONCE_A), null);
  for (const href of [
    "https://app.notion.com/%6Cogout",
    "https://app.notion.com/log%6fut",
    "https://app.notion.com/auth%2Fcallback"
  ]) {
    assert.equal(frameConfig.notionFrameLoadTarget(href, NONCE_A), null, `${href} must not be preflighted`);
  }

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
  const updatesBeforeLogout = ruleFixture.calls.updates.length;
  assert.deepEqual(
    await ruleRuntime.prepareFrameLoad({
      url: `https://app.notion.com/logout?${PARAM}=${NONCE_A}`,
      preflightId: NONCE_A,
      tabId: 70
    }),
    { applicable: false, armed: false, reason: "" }
  );
  assert.equal(ruleFixture.calls.updates.length, updatesBeforeLogout, "logout must never install a Notion response-header rule");
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
    const firstClock = fakeClock();
    let failExpiredRemoval = false;
    const fake = fakeApi({
      beforeUpdate: async (details) => {
        if (!failExpiredRemoval || !details.removeRuleIds?.length || details.addRules?.length) return;
        failExpiredRemoval = false;
        throw new Error("fixture alarm cleanup failed");
      }
    });
    const firstRuntime = notion.createNotionFramePreflightRuntime(fake.api, firstClock);
    await firstRuntime.prepareFrameLoad({ url: targetB.navigationHref, preflightId: NONCE_B, tabId: 715 });
    await firstRuntime.beginNavigation({ tabId: 715, frameId: 15, parentFrameId: 0, url: targetB.navigationHref });
    const leaseAlarm = fake.calls.alarmCreates.at(-1);
    assert.ok(leaseAlarm?.name, "an active lease must have a durable MV3 wake-up alarm");
    assert.equal(leaseAlarm.details.when, 1_000 + (5 * 60_000));
    assert.equal(leaseAlarm.details.periodInMinutes, 0.5, "the wake-up alarm must retry after worker or DNR failures");
    const restartedRuntime = notion.createNotionFramePreflightRuntime(fake.api, fakeClock(1_000 + (5 * 60_000) + 1));
    failExpiredRemoval = true;
    await assert.rejects(
      restartedRuntime.handleAlarm({ name: leaseAlarm.name }),
      /fixture alarm cleanup failed/
    );
    assert.equal(fake.rules.has(RULE_ID_MIN), true, "a failed alarm cleanup must retain the tracked rule for retry");
    assert.equal(await restartedRuntime.handleAlarm({ name: leaseAlarm.name }), true);
    assert.equal(restartedRuntime.activeSessionRules().length, 0, "an alarm wake-up must reap a lease after worker suspension");
    assert.equal(fake.rules.has(RULE_ID_MIN), false);
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
  }

  {
    const clock = fakeClock();
    let failRemoval = false;
    const fake = fakeApi({
      beforeUpdate: async (details) => {
        if (!failRemoval || !details.removeRuleIds?.length || details.addRules?.length) return;
        failRemoval = false;
        throw new Error("fixture lease removal failed");
      }
    });
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    await runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 716 });
    await runtime.beginNavigation({ tabId: 716, frameId: 16, parentFrameId: 0, url: targetA.navigationHref });
    failRemoval = true;
    assert.equal(await runtime.settleRegisteredFrame(registeredSender(716, 16, targetA.navigationHref)), 0);
    assert.equal(fake.rules.has(RULE_ID_MIN), true, "a failed DNR removal must remain tracked");
    assert.equal(runtime.activeSessionRules().length, 0);
    assert.equal(runtime.hasActiveLeases(), true, "pending removal must remain part of the fail-closed ownership set");
    const retryAlarm = fake.calls.alarmCreates.at(-1);
    assert.equal(retryAlarm.details.when, clock.now(), "a failed removal must arm an immediate durable retry");
    const restartedRuntime = notion.createNotionFramePreflightRuntime(fake.api, fakeClock(clock.now() + 1));
    assert.equal(await restartedRuntime.handleAlarm({ name: retryAlarm.name }), true);
    assert.equal(fake.rules.has(RULE_ID_MIN), false, "a worker restart must retry the tracked DNR removal");
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
  }

  {
    const clock = fakeClock();
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    assert.deepEqual(
      await runtime.prepareFrameLoad(
        { url: targetA.navigationHref, preflightId: NONCE_A, tabId: 711 },
        { parentDocumentId: "parent-document-a" }
      ),
      { applicable: true, armed: true, reason: "" }
    );
    assert.equal(
      await runtime.beginNavigation({
        tabId: 711,
        frameId: 0,
        parentFrameId: -1,
        parentDocumentId: "parent-document-a",
        url: targetA.navigationHref
      }),
      false,
      "the top frame must not claim a direct-child lease"
    );
    assert.equal(
      await runtime.beginNavigation({
        tabId: 711,
        frameId: 9,
        parentFrameId: 4,
        parentDocumentId: "parent-document-a",
        url: targetA.navigationHref
      }),
      false,
      "a nested frame must not claim a direct-child lease"
    );
    assert.equal(
      await runtime.beginNavigation({
        tabId: 711,
        frameId: 9,
        parentFrameId: 0,
        parentDocumentId: "another-parent-document",
        url: targetA.navigationHref
      }),
      false,
      "a different extension-page document must not claim the lease"
    );
    assert.equal(
      await runtime.beginNavigation({
        tabId: 711,
        frameId: 9,
        parentFrameId: 0,
        parentDocumentId: "parent-document-a",
        url: replayTargetA.navigationHref
      }),
      false,
      "the same nonce on another Notion URL must not claim the lease"
    );
    assert.equal(
      await runtime.beginNavigation({
        tabId: 711,
        frameId: 9,
        parentFrameId: 0,
        parentDocumentId: "parent-document-a",
        url: targetA.navigationHref
      }),
      true
    );
    const ledger = fake.storageState.chatclubNotionFramePreflightLeasesV1;
    assert.equal(ledger.version, 1);
    assert.equal(ledger.leases[RULE_ID_MIN].phase, "navigating");
    assert.equal(ledger.leases[RULE_ID_MIN].frameId, 9);
    assert.equal([...clock.timers.values()][0].delay, 5 * 60_000, "a begun navigation must replace the prepared watchdog with an orphan cap");
    const navigationDeadline = ledger.leases[RULE_ID_MIN].deadlineAt;
    assert.equal(
      await runtime.beginNavigation({
        tabId: 711,
        frameId: 9,
        parentFrameId: 0,
        parentDocumentId: "parent-document-a",
        url: targetA.navigationHref
      }),
      true
    );
    assert.equal(
      fake.storageState.chatclubNotionFramePreflightLeasesV1.leases[RULE_ID_MIN].deadlineAt,
      navigationDeadline,
      "a duplicate onBeforeNavigate must not extend the orphan cap indefinitely"
    );
    await clock.advance(10_001);
    assert.equal(runtime.activeSessionRules().length, 1, "the original ten-second watchdog must not expire a slow SW fallback");
    await runtime.settleRegisteredFrame(registeredSender(711, 8, targetA.navigationHref));
    assert.equal(runtime.activeSessionRules().length, 1, "another registered frame must not settle the claimed direct child");
    await runtime.settleRegisteredFrame(registeredSender(711, 9, "https://app.notion.com/ai?redirected=1"));
    assert.equal(runtime.activeSessionRules().length, 1, "a different registered document URL must not settle the nonce lease");
    await runtime.settleRegisteredFrame(registeredSender(711, 9, targetA.logicalHref));
    assert.equal(runtime.activeSessionRules().length, 0, "the registered logical document must settle its nonce-bound frame lifecycle");
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
  }

  {
    const firstClock = fakeClock();
    const fake = fakeApi();
    const firstRuntime = notion.createNotionFramePreflightRuntime(fake.api, firstClock);
    await firstRuntime.prepareFrameLoad(
      { url: targetA.navigationHref, preflightId: NONCE_A, tabId: 712 },
      { parentDocumentId: "surviving-parent" }
    );
    await firstRuntime.beginNavigation({
      tabId: 712,
      frameId: 12,
      parentFrameId: 0,
      parentDocumentId: "surviving-parent",
      url: targetA.navigationHref
    });
    const updatesBeforeRestart = fake.calls.updates.length;
    const restartedClock = fakeClock(2_000);
    const restartedRuntime = notion.createNotionFramePreflightRuntime(fake.api, restartedClock);
    assert.equal(await restartedRuntime.initialize(), true);
    assert.equal(restartedRuntime.activeSessionRules().length, 1, "a valid navigating ledger must survive MV3 worker restart");
    assert.equal(fake.calls.updates.length, updatesBeforeRestart, "startup reconciliation must not delete a valid live rule");
    await restartedClock.advance(20_000);
    assert.equal(restartedRuntime.activeSessionRules().length, 1, "restored navigation must also outlive the original prepared watchdog");
    await restartedRuntime.settleRegisteredFrame(registeredSender(712, 12, targetA.navigationHref));
    assert.equal(restartedRuntime.activeSessionRules().length, 0);
    assert.equal(fake.rules.has(RULE_ID_MIN), false);
  }

  {
    const firstClock = fakeClock();
    const fake = fakeApi();
    const firstRuntime = notion.createNotionFramePreflightRuntime(fake.api, firstClock);
    await firstRuntime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 713 });
    fake.rules.delete(RULE_ID_MIN);
    const restartedRuntime = notion.createNotionFramePreflightRuntime(fake.api, fakeClock(2_000));
    assert.equal(await restartedRuntime.initialize(), true);
    assert.equal(restartedRuntime.activeSessionRules().length, 0, "a ledger without its exact DNR rule must not be guessed back into existence");
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
    assert.equal(fake.rules.has(RULE_ID_MIN), false);
  }

  {
    const clock = fakeClock();
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    await runtime.prepareFrameLoad({ url: targetB.navigationHref, preflightId: NONCE_B, tabId: 714 });
    await runtime.beginNavigation({ tabId: 714, frameId: 14, parentFrameId: 0, url: targetB.navigationHref });
    await clock.advance(5 * 60_000);
    assert.equal(runtime.activeSessionRules().length, 0, "a missing terminal event must still be bounded by the orphan cap");
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
    const ordinaryRule = { id: 91, action: { type: "block" }, condition: {} };
    const staleReservedRule = { id: RULE_ID_MIN + 99, action: { type: "block" }, condition: {} };
    assert.deepEqual(
      runtime.sessionRulesWithActiveLeases([ordinaryRule, staleReservedRule]).map(({ id }) => id),
      [ordinaryRule.id, firstRule.id, secondRule.id],
      "DNR replace and rollback must drop stale reserved IDs and merge only the current leases"
    );
    assert.equal(runtime.hasActiveLeases(), true);
    await runtime.settleRegisteredFrame(registeredSender(999, 7, targetA.navigationHref));
    await runtime.settleRegisteredFrame(registeredSender(72, 7, targetA.logicalHref));
    await runtime.settleRegisteredFrame(registeredSender(72, 7, replayTargetA.navigationHref));
    assert.equal(runtime.activeSessionRules().length, 2, "a terminal event before the exact navigation begins must not release a lease");
    assert.equal(await runtime.beginNavigation({ tabId: 72, frameId: 7, parentFrameId: 0, url: targetA.navigationHref }), true);
    assert.equal(await runtime.beginNavigation({ tabId: 72, frameId: 8, parentFrameId: 0, url: targetB.navigationHref }), true);
    await runtime.settleRegisteredFrame(registeredSender(72, 99, targetA.navigationHref));
    assert.equal(runtime.activeSessionRules().length, 2, "another frame must not settle the claimed navigation");
    await runtime.settleRegisteredFrame(registeredSender(72, 7, targetA.navigationHref));
    assert.deepEqual(runtime.activeSessionRules().map((item) => item.id), [secondRule.id]);
    assert.deepEqual(fake.calls.updates.at(-1), { removeRuleIds: [firstRule.id] });
    assert.equal(fake.rules.has(secondRule.id), true, "settling one nonce must not remove another concurrent rule");
    await runtime.handleTabRemoved(72);
    assert.equal(runtime.activeSessionRules().length, 0);
    assert.equal(runtime.hasActiveLeases(), false);
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
    const clock = fakeClock();
    const fake = fakeApi();
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    let continueBaseUpdate;
    const baseUpdateGate = new Promise((resolve) => { continueBaseUpdate = resolve; });
    let baseUpdateStarted;
    const baseStarted = new Promise((resolve) => { baseUpdateStarted = resolve; });
    const update = runtime.dnrRuleUpdater(async () => {
      baseUpdateStarted();
      await baseUpdateGate;
      return "session";
    });
    const preparing = update(
      730,
      { url: targetA.navigationHref, preflightId: NONCE_A },
      { documentId: "slow-base-parent" }
    );
    await baseStarted;
    assert.equal(
      await runtime.cancelFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A }, 730),
      true
    );
    await clock.advance(10_001);
    continueBaseUpdate();
    await assert.rejects(preparing, /cancelled/);
    assert.equal(fake.rules.size, 0, "a timed-out PREPARE must not arm after a slow base-rule refresh");
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
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
    assert.equal(fake.rules.has(RULE_ID_MIN), false, "a failed atomic install must not leave a rule behind");
  }

  {
    const clock = fakeClock();
    let failAlarmCreate = true;
    let failCompensationRemoval = true;
    const fake = fakeApi({
      beforeAlarmCreate: async () => {
        if (!failAlarmCreate) return;
        failAlarmCreate = false;
        throw new Error("fixture alarm creation failed");
      },
      beforeUpdate: async (details) => {
        if (!failCompensationRemoval || !details.removeRuleIds?.length || details.addRules?.length) return;
        failCompensationRemoval = false;
        throw new Error("fixture compensation removal failed");
      }
    });
    const runtime = notion.createNotionFramePreflightRuntime(fake.api, clock);
    assert.deepEqual(
      await runtime.prepareFrameLoad({ url: targetA.navigationHref, preflightId: NONCE_A, tabId: 733 }),
      { applicable: true, armed: false, reason: "session-rule-install-failed" }
    );
    assert.equal(fake.rules.has(RULE_ID_MIN), true, "an unconfirmed compensation removal must retain physical-rule ownership");
    assert.equal(runtime.activeSessionRules().length, 0, "a failed installation must never expose the retained rule for new loading");
    assert.equal(runtime.hasActiveLeases(), true, "pending removal must continue to block dynamic fallback");
    assert.ok(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases[RULE_ID_MIN]);
    assert.equal(fake.calls.alarmCreates.at(-1).details.periodInMinutes, 0.5);
    await clock.advance(1_000);
    assert.equal(fake.rules.has(RULE_ID_MIN), false, "the tracked local retry must finish compensation");
    assert.equal(runtime.hasActiveLeases(), false);
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
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
    assert.equal(fake.rules.has(RULE_ID_MIN), false, "a failed atomic install must not leave a rule behind");
    assert.deepEqual(fake.storageState.chatclubNotionFramePreflightLeasesV1.leases, {});
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
