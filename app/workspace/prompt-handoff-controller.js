import { BACKGROUND_REQUEST_ACTIONS } from "../../shared/background-requests.js";
import { EXTENSION_RUNTIME_RELAY_SOURCE } from "../../shared/protocol.js";
import {
  WORKSPACE_PROMPT_HANDOFF_ALARM,
  WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION,
  WORKSPACE_PROMPT_HANDOFF_TTL_MS,
  createWorkspacePromptHandoffId,
  createWorkspacePromptPayloadStore,
  normalizeWorkspacePromptHandoffId,
  normalizeWorkspacePromptPayloadLocator
} from "../../shared/workspace-prompt-handoff.js";
import {
  normalizeWorkspaceSessionId,
  workspaceSessionIdFromUrl,
  workspaceSessionUrl
} from "../../shared/workspace-session.js";
import { createPromptHandoffWorkspaceSnapshot } from "./prompt-handoff-layout.js";

const ACTION = BACKGROUND_REQUEST_ACTIONS;

export const PROMPT_HANDOFF_LAUNCH_REASON = Object.freeze({
  READY: "ready",
  OPTIONS_PAGE: "options-page",
  NOT_WORKSPACE_PAGE: "not-workspace-page",
  NOT_CLAIMED: "not-claimed",
  CLAIM_FAILED: "claim-failed",
  INVALID_CLAIM: "invalid-claim",
  PAYLOAD_UNAVAILABLE: "payload-unavailable",
  DRAFT_ADOPTION_FAILED: "draft-adoption-failed",
  NO_VALID_TARGETS: "no-valid-targets"
});

function requiredFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`Workspace prompt handoff requires ${label}().`);
  return value;
}

function requiredMethods(value, label, methods) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`Workspace prompt handoff requires ${label}.`);
  }
  for (const method of methods) requiredFunction(value[method], `${label}.${method}`);
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonnegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function promptSnapshotHasContent(snapshot) {
  return Boolean(text(snapshot?.text) || (Array.isArray(snapshot?.images) && snapshot.images.length));
}

function controllerError(code, message, delivered = false) {
  const error = new Error(message);
  error.code = code;
  error.delivered = delivered;
  return error;
}

function exactChatClubWorkspaceId(api, href) {
  try {
    const actualHref = new URL(String(href || "")).href;
    const baseHref = api?.runtime?.getURL?.("chatClub.html");
    if (!baseHref) return "";
    const workspaceId = workspaceSessionIdFromUrl(actualHref);
    return workspaceId && workspaceSessionUrl(baseHref, workspaceId) === actualHref ? workspaceId : "";
  } catch {
    return "";
  }
}

function claimResult(value, workspaceId) {
  if (value?.claimed !== true) {
    return Object.freeze({ claimed: false, workspaceId, reason: PROMPT_HANDOFF_LAUNCH_REASON.NOT_CLAIMED });
  }
  const handoffId = normalizeWorkspacePromptHandoffId(value.handoffId);
  const claimId = normalizeWorkspacePromptHandoffId(value.claimId);
  const locator = normalizeWorkspacePromptPayloadLocator(value.locator);
  if (!handoffId || !claimId || !locator || locator.handoffId !== handoffId) {
    return Object.freeze({ claimed: false, workspaceId, reason: PROMPT_HANDOFF_LAUNCH_REASON.INVALID_CLAIM });
  }
  return Object.freeze({ claimed: true, workspaceId, handoffId, claimId, locator });
}

function frameAppId(frame) {
  return text(frame?.dataset?.appId);
}

function sourceAppIdGroups(workspace) {
  const frames = Array.from(workspace.currentFrames() || []).filter(Boolean);
  const groups = [];
  for (const frame of frames) {
    const appId = frameAppId(frame);
    if (appId) groups.push([appId]);
  }
  return groups;
}

function launchDiagnostics(reason, details = {}) {
  return Object.freeze({
    reason,
    requestedTargetCount: nonnegativeInteger(details.requestedTargetCount),
    acceptedTargetCount: nonnegativeInteger(details.acceptedTargetCount),
    skipped: Object.freeze(Array.from(details.skipped || [], (entry) => Object.freeze({ ...entry })))
  });
}

/**
 * Owns the page side of the one-shot prompt handoff. Prompt bytes remain in
 * the payload store; background requests and receipts carry metadata only.
 */
export function createWorkspacePromptHandoffController(dependencies = {}) {
  const api = dependencies.api;
  if (!api || typeof api !== "object") throw new TypeError("Workspace prompt handoff requires an extension API.");
  const runtime = dependencies.runtime || api.runtime;
  const requestBackground = requiredFunction(dependencies.requestBackground, "requestBackground");
  const composer = requiredMethods(dependencies.composer, "composer", [
    "hasDraft",
    "captureDraftSnapshot",
    "adoptDraftSnapshot",
    "admitSnapshot",
    "clearDraftIfSnapshotCurrent"
  ]);
  const workspace = requiredMethods(dependencies.workspace, "workspace", ["currentFrames", "frameApp"]);
  const appCatalog = requiredFunction(dependencies.appCatalog, "appCatalog");
  const workspaceGeneration = requiredFunction(dependencies.workspaceGeneration, "workspaceGeneration");
  const basePresetId = requiredFunction(dependencies.basePresetId, "basePresetId");
  const payloadStore = dependencies.payloadStore || createWorkspacePromptPayloadStore(api);
  const createHandoffId = dependencies.createHandoffId || createWorkspacePromptHandoffId;
  const createLaunchSnapshot = dependencies.createLaunchSnapshot || createPromptHandoffWorkspaceSnapshot;
  const locationHref = typeof dependencies.locationHref === "function"
    ? dependencies.locationHref
    : () => String(dependencies.locationHref || globalThis.location?.href || "");
  const getCurrentTabId = typeof dependencies.currentTabId === "function"
    ? dependencies.currentTabId
    : async () => null;
  const scheduleTimeout = dependencies.scheduleTimeout || globalThis.setTimeout?.bind(globalThis);
  const cancelTimeout = dependencies.cancelTimeout || globalThis.clearTimeout?.bind(globalThis);
  const isOptionsPage = dependencies.isOptionsPage === true;
  const autoStartClaim = dependencies.autoStartClaim !== false;
  const layoutName = text(dependencies.layoutName) || "Prompt";
  const pendingSources = new Map();
  const launchRecords = new WeakMap();
  let openingPromise = null;
  let initialClaimPromise = null;
  let preparedLaunchPromise = null;
  let preparedLaunch = null;
  let installed = false;
  let disposed = false;

  async function wakePayloadCleanup() {
    if (typeof api.alarms?.create !== "function") return false;
    try {
      await Promise.resolve(api.alarms.create(WORKSPACE_PROMPT_HANDOFF_ALARM, { when: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }

  function forgetPendingSource(handoffId) {
    const pending = pendingSources.get(handoffId);
    if (!pending) return false;
    pendingSources.delete(handoffId);
    if (pending.timeoutId !== null && typeof cancelTimeout === "function") cancelTimeout(pending.timeoutId);
    return true;
  }

  function rememberPendingSource(handoffId, snapshot, sourceTabId, locator) {
    forgetPendingSource(handoffId);
    const pending = { snapshot, sourceTabId, locator, timeoutId: null, openPromise: null };
    let timeoutId = null;
    if (typeof scheduleTimeout === "function") {
      timeoutId = scheduleTimeout(() => {
        if (pendingSources.get(handoffId) !== pending) return;
        pendingSources.delete(handoffId);
        void payloadStore.remove(locator).catch(() => {});
      }, WORKSPACE_PROMPT_HANDOFF_TTL_MS);
      timeoutId?.unref?.();
    }
    pending.timeoutId = timeoutId;
    pendingSources.set(handoffId, pending);
    return pending;
  }

  function pendingSourceForSnapshot(snapshot) {
    return Array.from(pendingSources.values()).find((pending) => (
      pending.snapshot?.revision === snapshot?.revision
    )) || null;
  }

  async function handleSettlementReceipt(message, sender = {}) {
    if (
      message?.source !== EXTENSION_RUNTIME_RELAY_SOURCE
      || message?.action !== WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION
      || sender?.tab
      || (sender?.id && api.runtime?.id && sender.id !== api.runtime.id)
    ) return false;
    const handoffId = normalizeWorkspacePromptHandoffId(message.handoffId);
    const sourceTabId = positiveInteger(message.sourceTabId);
    const pending = pendingSources.get(handoffId);
    if (!handoffId || sourceTabId === null || !pending) return false;
    if (pending.sourceTabId !== null && pending.sourceTabId !== sourceTabId) return false;
    forgetPendingSource(handoffId);
    if (message.outcome !== "admitted" || nonnegativeInteger(message.admittedCount) <= 0) return true;
    try {
      composer.clearDraftIfSnapshotCurrent(pending.snapshot, { focus: false });
    } catch {}
    return true;
  }

  function runtimeListener(message, sender) {
    if (
      message?.source !== EXTENSION_RUNTIME_RELAY_SOURCE
      || message?.action !== WORKSPACE_PROMPT_HANDOFF_SETTLED_ACTION
    ) return false;
    void handleSettlementReceipt(message, sender);
    return false;
  }

  function install() {
    if (installed || disposed) return false;
    if (typeof runtime?.onMessage?.addListener !== "function") {
      throw new TypeError("Workspace prompt handoff requires runtime.onMessage.addListener().");
    }
    runtime.onMessage.addListener(runtimeListener);
    installed = true;
    return true;
  }

  function dispose() {
    if (installed && typeof runtime?.onMessage?.removeListener === "function") {
      runtime.onMessage.removeListener(runtimeListener);
    }
    installed = false;
    disposed = true;
    for (const handoffId of Array.from(pendingSources.keys())) forgetPendingSource(handoffId);
  }

  async function openWorkspaceWithPrompt(snapshot) {
    if (!promptSnapshotHasContent(snapshot)) {
      return requestBackground(ACTION.OPEN_WORKSPACE_TAB, {});
    }
    const appIdGroups = sourceAppIdGroups(workspace);
    const handoffId = normalizeWorkspacePromptHandoffId(createHandoffId("prompt-handoff"));
    if (!handoffId) throw controllerError("HANDOFF_INVALID", "Unable to create a prompt handoff id");
    const locator = await payloadStore.put(handoffId, {
      text: snapshot.text,
      images: snapshot.images,
      appIdGroups
    });
    await wakePayloadCleanup();
    let resolvedSourceTabId = null;
    try { resolvedSourceTabId = positiveInteger(await getCurrentTabId()); } catch {}
    const pending = rememberPendingSource(handoffId, snapshot, resolvedSourceTabId, locator);
    pending.openPromise = (async () => {
      try {
        const response = await requestBackground(ACTION.OPEN_WORKSPACE_TAB_WITH_PROMPT, { handoffId, locator });
        if (response?.handoffId !== handoffId || !normalizeWorkspaceSessionId(response?.workspaceId)) {
          throw controllerError("HANDOFF_RESPONSE_INVALID", "Workspace prompt handoff response is invalid", true);
        }
        return response;
      } catch (error) {
        if (error?.delivered === false) {
          forgetPendingSource(handoffId);
          await payloadStore.remove(locator).catch(() => {});
        }
        throw error;
      }
    })();
    return pending.openPromise;
  }

  function openNewWorkspaceTab() {
    if (openingPromise) return openingPromise;
    let operation;
    try {
      const snapshot = composer.captureDraftSnapshot();
      const pending = promptSnapshotHasContent(snapshot) ? pendingSourceForSnapshot(snapshot) : null;
      operation = pending?.openPromise || (promptSnapshotHasContent(snapshot)
        ? openWorkspaceWithPrompt(snapshot)
        : requestBackground(ACTION.OPEN_WORKSPACE_TAB, {}));
    } catch (error) {
      operation = Promise.reject(error);
    }
    const current = Promise.resolve(operation).finally(() => {
      if (openingPromise === current) openingPromise = null;
    });
    openingPromise = current;
    return current;
  }

  function startInitialClaim() {
    if (initialClaimPromise) return initialClaimPromise;
    if (isOptionsPage) {
      initialClaimPromise = Promise.resolve(Object.freeze({
        claimed: false,
        workspaceId: "",
        reason: PROMPT_HANDOFF_LAUNCH_REASON.OPTIONS_PAGE
      }));
      return initialClaimPromise;
    }
    let href = "";
    try { href = locationHref(); } catch {}
    const workspaceId = exactChatClubWorkspaceId(api, href);
    if (!workspaceId) {
      initialClaimPromise = Promise.resolve(Object.freeze({
        claimed: false,
        workspaceId: "",
        reason: PROMPT_HANDOFF_LAUNCH_REASON.NOT_WORKSPACE_PAGE
      }));
      return initialClaimPromise;
    }
    initialClaimPromise = (async () => {
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return claimResult(
            await requestBackground(ACTION.CLAIM_WORKSPACE_PROMPT_HANDOFF, { workspaceId }),
            workspaceId
          );
        } catch (error) {
          lastError = error;
          if (error?.delivered !== false) break;
        }
      }
      return Object.freeze({
        claimed: false,
        workspaceId,
        reason: PROMPT_HANDOFF_LAUNCH_REASON.CLAIM_FAILED,
        error: lastError
      });
    })();
    return initialClaimPromise;
  }

  function createPublicLaunch(claim, snapshot, diagnostics, record = null) {
    const launch = Object.freeze({
      claimed: claim?.claimed === true,
      workspaceId: text(claim?.workspaceId),
      handoffId: text(claim?.handoffId),
      error: claim?.error || null,
      snapshot: snapshot || null,
      diagnostics
    });
    if (record) launchRecords.set(launch, record);
    preparedLaunch = launch;
    return launch;
  }

  function settleRecord(record, admittedCount) {
    if (record.settlementPromise) return record.settlementPromise;
    const count = nonnegativeInteger(admittedCount);
    record.settlementPromise = (async () => {
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestBackground(ACTION.SETTLE_WORKSPACE_PROMPT_HANDOFF, {
            workspaceId: record.claim.workspaceId,
            handoffId: record.claim.handoffId,
            claimId: record.claim.claimId,
            admittedCount: count
          });
          return Object.freeze({ ok: response?.settled === true, response });
        } catch (error) {
          lastError = error;
          if (error?.delivered !== false) break;
        }
      }
      return Object.freeze({ ok: false, error: lastError });
    })();
    return record.settlementPromise;
  }

  function terminalClaimedLaunch(claim, reason, details = {}) {
    const record = { claim, draftSnapshot: null, acceptedAppIds: [], settlementPromise: null, admissionResult: null };
    const launch = createPublicLaunch(claim, null, launchDiagnostics(reason, details), record);
    settleRecord(record, 0);
    return launch;
  }

  function prepareInitialLaunch() {
    if (preparedLaunchPromise) return preparedLaunchPromise;
    preparedLaunchPromise = (async () => {
      const claim = await startInitialClaim();
      if (!claim.claimed) {
        return createPublicLaunch(claim, null, launchDiagnostics(claim.reason));
      }
      let payload = null;
      for (let attempt = 0; attempt < 2 && !payload; attempt += 1) {
        try {
          payload = await payloadStore.get(claim.locator);
        } catch {
          payload = null;
        }
      }
      if (!payload) return terminalClaimedLaunch(claim, PROMPT_HANDOFF_LAUNCH_REASON.PAYLOAD_UNAVAILABLE);

      let draftSnapshot;
      try {
        draftSnapshot = composer.adoptDraftSnapshot({ text: payload.text, images: payload.images }, { focus: false });
      } catch {
        return terminalClaimedLaunch(claim, PROMPT_HANDOFF_LAUNCH_REASON.DRAFT_ADOPTION_FAILED, {
          requestedTargetCount: payload.appIdGroups?.length
        });
      }

      let layout;
      try {
        layout = createLaunchSnapshot({
          appIdGroups: payload.appIdGroups,
          apps: await Promise.resolve(appCatalog()),
          generation: await Promise.resolve(workspaceGeneration()),
          basePresetId: await Promise.resolve(basePresetId()),
          layoutName
        });
      } catch {
        layout = { snapshot: null, acceptedAppIds: [], skipped: [] };
      }
      const acceptedAppIds = Array.from(layout?.acceptedAppIds || [], text).filter(Boolean);
      const diagnostics = launchDiagnostics(
        layout?.snapshot && acceptedAppIds.length
          ? PROMPT_HANDOFF_LAUNCH_REASON.READY
          : PROMPT_HANDOFF_LAUNCH_REASON.NO_VALID_TARGETS,
        {
          requestedTargetCount: payload.appIdGroups?.length,
          acceptedTargetCount: acceptedAppIds.length,
          skipped: layout?.skipped
        }
      );
      const record = {
        claim,
        draftSnapshot,
        acceptedAppIds,
        settlementPromise: null,
        admissionResult: null
      };
      const launch = createPublicLaunch(claim, layout?.snapshot || null, diagnostics, record);
      if (!launch.snapshot || !acceptedAppIds.length) settleRecord(record, 0);
      return launch;
    })();
    return preparedLaunchPromise;
  }

  function exactLaunchFrames(acceptedAppIds) {
    const frames = Array.from(workspace.currentFrames() || []).filter(Boolean);
    if (frames.length !== acceptedAppIds.length) return [];
    for (let index = 0; index < frames.length; index += 1) {
      if (frameAppId(frames[index]) !== acceptedAppIds[index]) return [];
    }
    return frames;
  }

  function admitInitialLaunch(launch = preparedLaunch) {
    const record = launch && launchRecords.get(launch);
    if (!record) {
      return Object.freeze({ admittedCount: 0, targetCount: 0, settlement: Promise.resolve([]), handoffSettlement: null });
    }
    if (record.admissionResult) return record.admissionResult;
    if (!launch.snapshot || launch.diagnostics.reason !== PROMPT_HANDOFF_LAUNCH_REASON.READY) {
      const result = Object.freeze({
        admittedCount: 0,
        targetCount: 0,
        settlement: Promise.resolve([]),
        handoffSettlement: settleRecord(record, 0)
      });
      record.admissionResult = result;
      return result;
    }
    const frames = exactLaunchFrames(record.acceptedAppIds);
    let admission;
    let error = null;
    try {
      admission = frames.length
        ? composer.admitSnapshot(record.draftSnapshot, { frames })
        : { admittedCount: 0, targetCount: 0, settlement: Promise.resolve([]) };
    } catch (caught) {
      error = caught;
      admission = { admittedCount: 0, targetCount: frames.length, settlement: Promise.resolve([]) };
    }
    const admittedCount = nonnegativeInteger(admission?.admittedCount);
    if (admittedCount > 0) {
      try { composer.clearDraftIfSnapshotCurrent(record.draftSnapshot, { focus: false }); } catch {}
    }
    const result = Object.freeze({
      admittedCount,
      targetCount: nonnegativeInteger(admission?.targetCount),
      settlement: admission?.settlement || Promise.resolve([]),
      handoffSettlement: settleRecord(record, admittedCount),
      ...(error ? { error } : {})
    });
    record.admissionResult = result;
    return result;
  }

  if (autoStartClaim) startInitialClaim();

  return Object.freeze({
    admitInitialLaunch,
    dispose,
    handleSettlementReceipt,
    install,
    openNewWorkspaceTab,
    prepareInitialLaunch,
    startInitialClaim
  });
}
