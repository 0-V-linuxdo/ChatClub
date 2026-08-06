#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const runtimeSource = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const nextTurn = () => new Promise((resolve) => { setImmediate(resolve); });

function createRuntime() {
  const listeners = new Set();
  return {
    id: "chatclub",
    getURL: (file = "") => `chrome-extension://chatclub/${file}`,
    onMessage: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); }
    },
    listeners
  };
}

function image(id = "image-1") {
  return {
    id,
    name: `${id}.png`,
    type: "image/png",
    size: 3,
    lastModified: 123,
    dataUrl: "data:image/png;base64,QUJD"
  };
}

function createComposer(initial = {}) {
  let draft = {
    text: String(initial.text || ""),
    images: clone(initial.images || []),
    revision: Number(initial.revision) || 0
  };
  const calls = { adopted: [], admitted: [], cleared: [] };
  const snapshot = () => Object.freeze({
    text: draft.text,
    images: Object.freeze(clone(draft.images)),
    revision: draft.revision
  });
  return {
    calls,
    draft: () => clone(draft),
    replace(next) {
      draft = { text: String(next.text || ""), images: clone(next.images || []), revision: draft.revision + 1 };
    },
    hasDraft() { return Boolean(draft.text.trim() || draft.images.length); },
    captureDraftSnapshot: snapshot,
    adoptDraftSnapshot(value) {
      draft = { text: String(value.text || ""), images: clone(value.images || []), revision: draft.revision + 1 };
      const adopted = snapshot();
      calls.adopted.push(adopted);
      return adopted;
    },
    admitSnapshot(value, options) {
      calls.admitted.push({ snapshot: value, frames: Array.from(options.frames || []) });
      return {
        admittedCount: options.frames.length,
        targetCount: options.frames.length,
        settlement: new Promise(() => {})
      };
    },
    clearDraftIfSnapshotCurrent(value) {
      calls.cleared.push(value);
      if (
        value.revision !== draft.revision
        || value.text !== draft.text
        || JSON.stringify(value.images) !== JSON.stringify(draft.images)
      ) return false;
      draft = { text: "", images: [], revision: draft.revision + 1 };
      return true;
    }
  };
}

function createWorkspace(appIds = []) {
  const frames = appIds.map((appId, index) => ({ frameId: index + 1, appId, dataset: { appId } }));
  return {
    frames,
    currentFrames: () => frames,
    frameApp: (frame) => frame?.appId ? { id: frame.appId } : null
  };
}

function locator(handoffId) {
  const createdAt = Date.now();
  return {
    version: 1,
    backend: "session",
    handoffId,
    byteLength: 100,
    createdAt,
    expiresAt: createdAt + (5 * 60 * 1000)
  };
}

function createPayloadStore(payloadById = new Map()) {
  const calls = { put: [], get: [], remove: [] };
  return {
    calls,
    async put(handoffId, payload) {
      calls.put.push({ handoffId, payload: clone(payload) });
      payloadById.set(handoffId, clone(payload));
      return locator(handoffId);
    },
    async get(value) {
      calls.get.push(clone(value));
      return clone(payloadById.get(value.handoffId)) || null;
    },
    async remove(value) {
      calls.remove.push(clone(value));
      payloadById.delete(value.handoffId);
      return true;
    }
  };
}

function createTimers() {
  const timers = new Map();
  let nextId = 0;
  return {
    timers,
    schedule(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    cancel(id) { timers.delete(id); }
  };
}

(async () => {
  const controllerModule = await import(moduleUrl("app/workspace/prompt-handoff-controller.js"));
  const requests = await import(moduleUrl("shared/background-requests.js"));
  const protocol = await import(moduleUrl("shared/protocol.js"));
  const handoff = await import(moduleUrl("shared/workspace-prompt-handoff.js"));
  const ACTION = requests.BACKGROUND_REQUEST_ACTIONS;

  function controllerOptions(overrides = {}) {
    const runtime = overrides.runtime || createRuntime();
    const composer = overrides.composer || createComposer();
    const workspace = overrides.workspace || createWorkspace(["ChatGPT"]);
    return {
      api: overrides.api || { runtime },
      runtime,
      requestBackground: overrides.requestBackground || (async () => ({})),
      composer,
      workspace,
      appCatalog: overrides.appCatalog || (() => [
        { id: "ChatGPT", url: "https://chatgpt.com/" },
        { id: "Claude", url: "https://claude.ai/new" }
      ]),
      workspaceGeneration: overrides.workspaceGeneration || (() => "workspace-generation-test"),
      basePresetId: overrides.basePresetId || (() => "default"),
      payloadStore: overrides.payloadStore || createPayloadStore(),
      createHandoffId: overrides.createHandoffId || (() => "prompt-handoff-controller-1234"),
      locationHref: overrides.locationHref || "chrome-extension://chatclub/chatClub.html#workspace=page-source-controller-1234",
      currentTabId: overrides.currentTabId || (async () => 11),
      scheduleTimeout: overrides.scheduleTimeout,
      cancelTimeout: overrides.cancelTimeout,
      isOptionsPage: overrides.isOptionsPage,
      autoStartClaim: overrides.autoStartClaim ?? false
    };
  }

  {
    const runtime = createRuntime();
    const composer = createComposer();
    const payloadStore = createPayloadStore();
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      runtime,
      composer,
      payloadStore,
      requestBackground: async (action, payload) => {
        calls.push({ action, payload });
        return { workspaceId: "page-empty-target-1234", tabId: 20 };
      }
    }));
    assert.equal(controller.install(), true);
    assert.equal(controller.install(), false, "receipt listener installation must be idempotent");
    assert.equal(runtime.listeners.size, 1);
    await controller.openNewWorkspaceTab();
    assert.deepEqual(calls, [{ action: ACTION.OPEN_WORKSPACE_TAB, payload: {} }]);
    assert.equal(payloadStore.calls.put.length, 0, "an empty draft must not allocate a handoff payload");
    controller.dispose();
    assert.equal(runtime.listeners.size, 0);
  }

  {
    const composer = createComposer({ text: "send this", images: [image()] });
    const workspace = createWorkspace(["ChatGPT", "Claude", "ChatGPT"]);
    const payloadStore = createPayloadStore();
    const timers = createTimers();
    const openGate = deferred();
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      workspace,
      payloadStore,
      scheduleTimeout: timers.schedule,
      cancelTimeout: timers.cancel,
      requestBackground(action, payload) {
        calls.push({ action, payload: clone(payload) });
        if (action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT) return openGate.promise;
        return Promise.resolve({});
      }
    }));
    const firstOpen = controller.openNewWorkspaceTab();
    const secondOpen = controller.openNewWorkspaceTab();
    assert.equal(firstOpen, secondOpen, "a pending Logo action must guard duplicate tab creation");
    await nextTurn();
    assert.equal(payloadStore.calls.put.length, 1);
    assert.deepEqual(payloadStore.calls.put[0].payload.appIdGroups, [["ChatGPT"], ["Claude"], ["ChatGPT"]]);
    assert.equal(calls.filter((call) => call.action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT).length, 1);
    const openCall = calls.find((call) => call.action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT);
    assert.deepEqual(Object.keys(openCall.payload).sort(), ["handoffId", "locator"]);
    assert.equal(JSON.stringify(openCall.payload).includes("send this"), false, "prompt text must stay out of runtime messages");
    openGate.resolve({
      handoffId: openCall.payload.handoffId,
      workspaceId: "page-target-controller-1234",
      tabId: 22
    });
    const openedResponse = await firstOpen;
    assert.equal(composer.draft().text, "send this", "source draft must remain until an admitted receipt");
    assert.equal(timers.timers.size, 1, "source pending state must have a bounded lifetime");
    assert.deepEqual(await controller.openNewWorkspaceTab(), openedResponse);
    assert.equal(
      calls.filter((call) => call.action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT).length,
      1,
      "the same pending draft revision must not open another target before its settlement receipt"
    );

    const receipt = {
      source: protocol.EXTENSION_RUNTIME_RELAY_SOURCE,
      action: handoff.WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
      sourceTabId: 11,
      handoffId: openCall.payload.handoffId,
      outcome: "admitted",
      admittedCount: 3
    };
    assert.equal(await controller.handleSettlementReceipt(receipt, { tab: { id: 99 } }), false);
    assert.equal(composer.draft().text, "send this", "a tab-originated imitation receipt must be ignored");
    assert.equal(await controller.handleSettlementReceipt({ ...receipt, sourceTabId: 12 }, {}), false);
    assert.equal(await controller.handleSettlementReceipt(receipt, {}), true);
    assert.equal(composer.draft().text, "", "an exact admitted receipt must clear the captured source revision");
    assert.equal(timers.timers.size, 0);
  }

  {
    const composer = createComposer({ text: "original" });
    const payloadStore = createPayloadStore();
    let handoffIndex = 0;
    const opens = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      payloadStore,
      createHandoffId: () => `prompt-handoff-revision-${String(++handoffIndex).padStart(4, "0")}`,
      requestBackground: async (action, payload) => {
        if (action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT) {
          opens.push(clone(payload));
          return { handoffId: payload.handoffId, workspaceId: "page-revision-target-1234", tabId: 30 };
        }
        return {};
      }
    }));
    await controller.openNewWorkspaceTab();
    composer.replace({ text: "newer text" });
    await controller.handleSettlementReceipt({
      source: protocol.EXTENSION_RUNTIME_RELAY_SOURCE,
      action: handoff.WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
      sourceTabId: 11,
      handoffId: opens[0].handoffId,
      outcome: "admitted",
      admittedCount: 1
    }, {});
    assert.equal(composer.draft().text, "newer text", "a receipt must not clear edits made after the source snapshot");
  }

  {
    const composer = createComposer({ text: "retry after rejection" });
    let handoffIndex = 0;
    const opens = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      createHandoffId: () => `prompt-handoff-rejected-${String(++handoffIndex).padStart(4, "0")}`,
      requestBackground: async (action, payload) => {
        if (action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT) {
          opens.push(clone(payload));
          return { handoffId: payload.handoffId, workspaceId: "page-rejected-target-1234", tabId: 31 };
        }
        return {};
      }
    }));
    await controller.openNewWorkspaceTab();
    await controller.handleSettlementReceipt({
      source: protocol.EXTENSION_RUNTIME_RELAY_SOURCE,
      action: handoff.WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
      sourceTabId: 11,
      handoffId: opens[0].handoffId,
      outcome: "rejected",
      admittedCount: 0
    }, {});
    assert.equal(composer.draft().text, "retry after rejection");
    await controller.openNewWorkspaceTab();
    assert.equal(opens.length, 2, "a rejected settlement must unlock a deliberate retry of the retained revision");
  }

  {
    const payloadStore = createPayloadStore();
    let backgroundCalls = 0;
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer: createComposer({ text: "no target" }),
      workspace: createWorkspace([]),
      payloadStore,
      requestBackground: async (_action, payload) => {
        backgroundCalls += 1;
        return { handoffId: payload.handoffId, workspaceId: "page-no-target-1234", tabId: 33 };
      }
    }));
    await controller.openNewWorkspaceTab();
    assert.equal(backgroundCalls, 1, "a contentful no-target draft must still open its empty handoff workspace");
    assert.deepEqual(payloadStore.calls.put[0].payload.appIdGroups, []);
  }

  {
    const composer = createComposer({ text: "removed app" });
    const frame = { dataset: { appId: "RemovedApp" } };
    const workspace = {
      currentFrames: () => [frame],
      frameApp: () => ({ id: "ChatGPT" })
    };
    const payloadStore = createPayloadStore();
    let openPayload = null;
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      workspace,
      payloadStore,
      requestBackground: async (action, payload) => {
        if (action !== ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT) return {};
        openPayload = clone(payload);
        return { handoffId: payload.handoffId, workspaceId: "page-removed-target-1234", tabId: 31 };
      }
    }));
    await controller.openNewWorkspaceTab();
    assert.deepEqual(
      payloadStore.calls.put[0].payload.appIdGroups,
      [["RemovedApp"]],
      "an unknown declared app id must not be rewritten to frameApp()'s default fallback"
    );
    assert.ok(openPayload?.locator);
  }

  {
    const composer = createComposer({ text: "missing identity" });
    const workspace = {
      currentFrames: () => [{}],
      frameApp: () => ({ id: "ChatGPT" })
    };
    const payloadStore = createPayloadStore();
    let backgroundCalls = 0;
    let openPayload = null;
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      workspace,
      payloadStore,
      requestBackground: async (_action, payload) => {
        backgroundCalls += 1;
        openPayload = clone(payload);
        return { handoffId: payload.handoffId, workspaceId: "page-empty-targets-1234", tabId: 32 };
      }
    }));
    await controller.openNewWorkspaceTab();
    assert.equal(backgroundCalls, 1, "a contentful draft must still open a target when no exact source target is available");
    assert.deepEqual(payloadStore.calls.put[0].payload.appIdGroups, []);
    assert.ok(openPayload.locator);
    assert.equal(composer.draft().text, "missing identity", "the source draft must remain pending with no target admission");
  }

  {
    for (const delivered of [false, undefined]) {
      const payloadStore = createPayloadStore();
      const timers = createTimers();
      const alarmCalls = [];
      const error = new Error(delivered === false ? "pre-delivery" : "unknown delivery");
      if (delivered !== undefined) error.delivered = delivered;
      const runtime = createRuntime();
      const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
        api: {
          runtime,
          alarms: {
            async create(name, details) { alarmCalls.push({ name, details: clone(details) }); }
          }
        },
        runtime,
        composer: createComposer({ text: "delivery state" }),
        payloadStore,
        scheduleTimeout: timers.schedule,
        cancelTimeout: timers.cancel,
        requestBackground: async (action) => {
          if (action === ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT) throw error;
          return {};
        }
      }));
      await assert.rejects(controller.openNewWorkspaceTab(), error);
      assert.equal(
        payloadStore.calls.remove.length,
        delivered === false ? 1 : 0,
        "only an explicit pre-delivery failure may eagerly remove the payload"
      );
      assert.equal(alarmCalls.length, 1, "persisted payloads must wake the named background cleanup alarm");
      assert.equal(alarmCalls[0].name, handoff.WORKSPACE_PROMPT_HANDOFF_ALARM);
      if (delivered === undefined) {
        assert.equal(timers.timers.size, 1, "unknown delivery must retain a bounded source cleanup timer");
        Array.from(timers.timers.values())[0].callback();
        await nextTurn();
        assert.equal(payloadStore.calls.remove.length, 1, "the source TTL must reclaim an unknown-undelivered payload");
      } else {
        assert.equal(timers.timers.size, 0, "explicit pre-delivery cleanup must cancel the source timer");
      }
    }
  }

  {
    const claimError = new Error("claim transport unavailable");
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      autoStartClaim: true,
      requestBackground: async (action, payload) => {
        calls.push({ action, payload: clone(payload) });
        if (action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) throw claimError;
        return {};
      }
    }));
    const launch = await controller.prepareInitialLaunch();
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.CLAIM_FAILED);
    assert.equal(launch.error, claimError, "claim failures must remain available for runtime diagnostics");
    assert.equal(calls.filter((call) => call.action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF).length, 1);
    await controller.prepareInitialLaunch();
    assert.equal(
      calls.filter((call) => call.action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF).length,
      1,
      "an unknown claim failure must not be retried automatically"
    );
  }

  {
    const workspaceId = "page-noncanonical-1234";
    const hrefs = [
      `chrome-extension://chatclub/chatClub.html?workspace=${workspaceId}`,
      `chrome-extension://chatclub/chatClub.html#workspace=${workspaceId}&extra=1`,
      `chrome-extension://chatclub/chatClub.html#extra=1&workspace=${workspaceId}`
    ];
    for (const locationHref of hrefs) {
      let backgroundCalls = 0;
      const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
        autoStartClaim: true,
        locationHref,
        requestBackground: async () => { backgroundCalls += 1; return {}; }
      }));
      const launch = await controller.prepareInitialLaunch();
      assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.NOT_WORKSPACE_PAGE);
      assert.equal(backgroundCalls, 0, "only the exact canonical workspace URL may claim a prompt handoff");
    }
  }

  {
    const claimError = new Error("claim was not delivered");
    claimError.delivered = false;
    let claimCalls = 0;
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      autoStartClaim: true,
      requestBackground: async (action) => {
        if (action !== ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) return {};
        claimCalls += 1;
        if (claimCalls === 1) throw claimError;
        return { claimed: false };
      }
    }));
    const launch = await controller.prepareInitialLaunch();
    assert.equal(claimCalls, 2, "an explicit pre-delivery claim failure may retry once");
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.NOT_CLAIMED);
  }

  {
    const targetWorkspaceId = "page-target-launch-1234";
    const handoffId = "prompt-handoff-target-1234";
    const payloadStore = createPayloadStore(new Map([[handoffId, {
      text: "target prompt",
      images: [image("target-image")],
      appIdGroups: [["ChatGPT"], ["Missing"], ["ChatGPT"]]
    }]]));
    const composer = createComposer();
    const workspace = createWorkspace(["ChatGPT", "ChatGPT"]);
    const settleGate = deferred();
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      workspace,
      payloadStore,
      autoStartClaim: true,
      locationHref: `chrome-extension://chatclub/chatClub.html#workspace=${targetWorkspaceId}`,
      requestBackground(action, payload) {
        calls.push({ action, payload: clone(payload) });
        if (action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) {
          return Promise.resolve({
            claimed: true,
            handoffId,
            claimId: "prompt-claim-target-123456",
            locator: locator(handoffId)
          });
        }
        if (action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF) return settleGate.promise;
        return Promise.resolve({});
      }
    }));
    assert.equal(
      calls[0].action,
      ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF,
      "the target claim must start synchronously when the controller is created"
    );
    const launch = await controller.prepareInitialLaunch();
    assert.equal(launch.claimed, true);
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.READY);
    assert.equal(launch.diagnostics.requestedTargetCount, 3);
    assert.equal(launch.diagnostics.acceptedTargetCount, 2);
    assert.equal(launch.diagnostics.skipped.length, 1);
    assert.deepEqual(launch.snapshot.groups.map((group) => group.tabs[0].appId), ["ChatGPT", "ChatGPT"]);
    assert.deepEqual(launch.snapshot.groups.map((group) => group.tabs[0].currentHref), ["https://chatgpt.com/", "https://chatgpt.com/"]);
    assert.equal(composer.draft().text, "target prompt", "target draft must be adopted before frame admission");
    assert.equal(calls.some((call) => call.action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF), false);

    const admission = controller.admitInitialLaunch(launch);
    assert.equal(admission.admittedCount, 2);
    assert.equal(composer.calls.admitted.length, 1);
    assert.deepEqual(composer.calls.admitted[0].frames, workspace.frames);
    assert.equal(composer.draft().text, "", "target draft must clear after at least one queue admission");
    const settleCall = calls.find((call) => call.action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF);
    assert.deepEqual(settleCall.payload, {
      workspaceId: targetWorkspaceId,
      handoffId,
      claimId: "prompt-claim-target-123456",
      admittedCount: 2
    });
    assert.equal(
      controller.admitInitialLaunch(launch),
      admission,
      "repeated admission calls must return the first result without another send or settlement"
    );
    assert.equal(calls.filter((call) => call.action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF).length, 1);
    settleGate.resolve({ settled: true, outcome: "admitted" });
    assert.equal((await admission.handoffSettlement).ok, true);
  }

  {
    const targetWorkspaceId = "page-invalid-target-1234";
    const handoffId = "prompt-handoff-invalid-1234";
    const payloadStore = createPayloadStore(new Map([[handoffId, {
      text: "keep visible",
      images: [],
      appIdGroups: [["Missing"]]
    }]]));
    const composer = createComposer();
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      workspace: createWorkspace(["ChatGPT"]),
      payloadStore,
      autoStartClaim: true,
      locationHref: `chrome-extension://chatclub/chatClub.html#workspace=${targetWorkspaceId}`,
      requestBackground: async (action, payload) => {
        calls.push({ action, payload: clone(payload) });
        if (action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) {
          return {
            claimed: true,
            handoffId,
            claimId: "prompt-claim-invalid-1234",
            locator: locator(handoffId)
          };
        }
        return { settled: true, outcome: "rejected" };
      }
    }));
    const launch = await controller.prepareInitialLaunch();
    assert.equal(launch.snapshot, null);
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.NO_VALID_TARGETS);
    assert.equal(composer.draft().text, "keep visible", "an all-invalid layout must still adopt the target draft");
    assert.equal(composer.calls.admitted.length, 0);
    assert.equal(calls.filter((call) => call.action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF).length, 1);
    assert.equal(calls.at(-1).payload.admittedCount, 0);
    controller.admitInitialLaunch(launch);
    assert.equal(composer.calls.admitted.length, 0, "an invalid launch must never fall back to unrelated current frames");
    assert.equal(calls.filter((call) => call.action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF).length, 1);
  }

  for (const delivered of [false, undefined]) {
    const targetWorkspaceId = `page-settle-retry-${delivered === false ? "safe" : "unknown"}-1234`;
    const handoffId = `prompt-handoff-settle-${delivered === false ? "safe" : "unknown"}-1234`;
    const payloadStore = createPayloadStore(new Map([[handoffId, {
      text: "settlement retry",
      images: [],
      appIdGroups: [["ChatGPT"]]
    }]]));
    let settleCalls = 0;
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer: createComposer(),
      workspace: createWorkspace(["ChatGPT"]),
      payloadStore,
      autoStartClaim: true,
      locationHref: `chrome-extension://chatclub/chatClub.html#workspace=${targetWorkspaceId}`,
      requestBackground: async (action) => {
        if (action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) {
          return { claimed: true, handoffId, claimId: "prompt-claim-settle-retry-1234", locator: locator(handoffId) };
        }
        if (action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF) {
          settleCalls += 1;
          if (settleCalls === 1) {
            const error = new Error("settlement transport failure");
            if (delivered !== undefined) error.delivered = delivered;
            throw error;
          }
          return { settled: true, outcome: "admitted" };
        }
        return {};
      }
    }));
    const launch = await controller.prepareInitialLaunch();
    const admission = controller.admitInitialLaunch(launch);
    const settlement = await admission.handoffSettlement;
    assert.equal(settleCalls, delivered === false ? 2 : 1);
    assert.equal(settlement.ok, delivered === false, "only an explicit pre-delivery settlement failure may retry");
  }

  {
    const targetWorkspaceId = "page-mismatched-frame-1234";
    const handoffId = "prompt-handoff-mismatch-1234";
    const payloadStore = createPayloadStore(new Map([[handoffId, {
      text: "do not misroute",
      images: [],
      appIdGroups: [["ChatGPT"]]
    }]]));
    const composer = createComposer();
    const frame = { dataset: { appId: "RemovedApp" } };
    const workspace = {
      currentFrames: () => [frame],
      frameApp: () => ({ id: "ChatGPT" })
    };
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      workspace,
      payloadStore,
      autoStartClaim: true,
      locationHref: `chrome-extension://chatclub/chatClub.html#workspace=${targetWorkspaceId}`,
      requestBackground: async (action, payload) => {
        calls.push({ action, payload: clone(payload) });
        if (action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) {
          return {
            claimed: true,
            handoffId,
            claimId: "prompt-claim-mismatch-1234",
            locator: locator(handoffId)
          };
        }
        return { settled: true, outcome: "rejected" };
      }
    }));
    const launch = await controller.prepareInitialLaunch();
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.READY);
    const admission = controller.admitInitialLaunch(launch);
    assert.equal(admission.admittedCount, 0);
    assert.equal(composer.calls.admitted.length, 0, "a mismatched declared frame app must fail closed before queue admission");
    assert.equal(composer.draft().text, "do not misroute");
    assert.equal(calls.at(-1).payload.admittedCount, 0);
  }

  {
    const targetWorkspaceId = "page-read-retry-target-1234";
    const handoffId = "prompt-handoff-read-retry-1234";
    const payloadStore = createPayloadStore(new Map([[handoffId, {
      text: "survives one read failure",
      images: [],
      appIdGroups: [["ChatGPT"]]
    }]]));
    const readPayload = payloadStore.get.bind(payloadStore);
    let readCount = 0;
    payloadStore.get = async (value) => {
      readCount += 1;
      if (readCount === 1) throw new Error("transient payload read failure");
      return readPayload(value);
    };
    const composer = createComposer();
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      payloadStore,
      autoStartClaim: true,
      locationHref: `chrome-extension://chatclub/chatClub.html#workspace=${targetWorkspaceId}`,
      requestBackground: async (action) => action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF
        ? { claimed: true, handoffId, claimId: "prompt-claim-read-retry-1234", locator: locator(handoffId) }
        : { settled: true, outcome: "rejected" }
    }));
    const launch = await controller.prepareInitialLaunch();
    assert.equal(readCount, 2, "a claimed payload read may be retried once without another claim or send");
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.READY);
    assert.equal(composer.draft().text, "survives one read failure");
  }

  {
    const targetWorkspaceId = "page-missing-payload-1234";
    const handoffId = "prompt-handoff-missing-1234";
    const composer = createComposer();
    const calls = [];
    const controller = controllerModule.createWorkspacePromptHandoffController(controllerOptions({
      composer,
      payloadStore: createPayloadStore(),
      autoStartClaim: true,
      locationHref: `chrome-extension://chatclub/chatClub.html#workspace=${targetWorkspaceId}`,
      requestBackground: async (action, payload) => {
        calls.push({ action, payload: clone(payload) });
        if (action === ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF) {
          return {
            claimed: true,
            handoffId,
            claimId: "prompt-claim-missing-1234",
            locator: locator(handoffId)
          };
        }
        return { settled: true, outcome: "rejected" };
      }
    }));
    const launch = await controller.prepareInitialLaunch();
    assert.equal(launch.diagnostics.reason, controllerModule.PROMPT_HANDOFF_LAUNCH_REASON.PAYLOAD_UNAVAILABLE);
    assert.equal(composer.calls.adopted.length, 0);
    assert.equal(calls.filter((call) => call.action === ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF).length, 1);
    assert.equal(calls.at(-1).payload.admittedCount, 0);
  }

  assert.match(runtimeSource, /workspacePromptHandoffController\.openNewWorkspaceTab\(\)/);
  assert.match(runtimeSource, /isOptionsPage: isOptionsPage \|\| browserSessionRestore\.reloadRequested/);
  const prepareIndex = runtimeSource.indexOf("await workspacePromptHandoffController.prepareInitialLaunch()");
  const hydrateIndex = runtimeSource.indexOf("promptHandoffLaunch.claimed && !promptHandoffLaunch.snapshot ? workspaceController.hydrateEmptyPromptHandoffWorkspace()");
  const renderIndex = runtimeSource.indexOf("render();", hydrateIndex);
  const admissionIndex = runtimeSource.indexOf("workspacePromptHandoffController.admitInitialLaunch(promptHandoffLaunch)");
  const frameWaitIndex = runtimeSource.indexOf("await waitForInitialWorkspaceFrameRestoration()", admissionIndex);
  assert.ok(prepareIndex > runtimeSource.indexOf("await configService.load()"), "target payload layout must wait for config loading");
  assert.match(runtimeSource, /hydrateEmptyPromptHandoffWorkspace\(\) : workspaceController\.hydrateGroups\(promptHandoffLaunch\.snapshot \|\| workspaceSessionSnapshot\)/);
  assert.ok(prepareIndex < hydrateIndex && hydrateIndex < renderIndex && renderIndex < admissionIndex);
  assert.ok(admissionIndex < frameWaitIndex, "target prompt admission must happen before the existing iframe restoration wait");
  assert.match(runtimeSource, /PROMPT_HANDOFF_LAUNCH_REASON\.CLAIM_FAILED[\s\S]*?lazyControllerError\("Prompt Handoff"/);

  console.log("workspace prompt handoff controller tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
