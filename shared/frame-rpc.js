import { currentExtensionTabId, requestBackground, runtimeSendMessage } from "./extension-api.js";
import {
  BACKGROUND_REQUEST_ACTIONS,
  FRAME_ROUTE_ERROR_CODES,
  createBackgroundRequestClient
} from "./background-requests.js";
import { CONTENT_RUNTIME_IDENTITY } from "./content-runtime-identity.js";
import { contentRuntimePackageBundleIdentityMatches } from "./content-runtime-package-identity.js";
import { frameCommandSpec } from "./frame-commands.js";

const MAX_TIMEOUT_MS = 60000;
const ERROR_CODES = new Set(FRAME_ROUTE_ERROR_CODES);

class FrameCommandError extends Error {
  constructor(code, message, details = {}) {
    super(String(message || code || "Frame command failed"));
    this.name = "FrameCommandError";
    this.code = ERROR_CODES.has(code) ? code : "REMOTE_ERROR";
    this.command = String(details.command || "");
    if (typeof details.delivered === "boolean") this.delivered = details.delivered;
    if (details.cause !== undefined) this.cause = details.cause;
  }
}

function bridgeDocumentId(iframe) {
  return String(iframe?.dataset?.preferredModelDocumentId || "").trim();
}

function boundedTimeout(value, fallback) {
  return Math.max(250, Math.min(MAX_TIMEOUT_MS, Number(value) || fallback));
}

function asFrameError(error, command, fallbackCode = "REMOTE_ERROR") {
  if (error instanceof FrameCommandError) return error;
  const message = error?.message || String(error || `Frame command failed: ${command}`);
  const code = ERROR_CODES.has(error?.code) ? error.code
    : /timeout/i.test(message) ? "TIMEOUT"
      : /not registered/i.test(message) ? "NOT_REGISTERED"
        : fallbackCode;
  return new FrameCommandError(code, message, {
    command,
    ...(typeof error?.delivered === "boolean" ? { delivered: error.delivered } : {}),
    cause: error
  });
}

function abortable(promise, signal, command) {
  if (!signal) return promise;
  if (signal.aborted) {
    // The transport promise is created before this helper is entered. Observe a
    // late transport rejection even though the caller has already aborted.
    promise.catch(() => {});
    return Promise.reject(new FrameCommandError("ABORTED", `Frame command aborted: ${command}`, { command }));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new FrameCommandError("ABORTED", `Frame command aborted: ${command}`, { command, delivered: true }));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

export class FrameRuntimePort {
  constructor(options = {}) {
    this.ensureRuntime = typeof options.ensureRuntime === "function" ? options.ensureRuntime : null;
    this.invalidateRuntime = typeof options.invalidateRuntime === "function" ? options.invalidateRuntime : null;
    this.currentTabId = options.currentTabId || currentExtensionTabId;
    this.sendRuntimeMessage = options.sendRuntimeMessage || runtimeSendMessage;
    this.requestBackground = options.requestBackground
      || createBackgroundRequestClient(this.sendRuntimeMessage);
    this.registrations = new WeakMap();
  }

  registration(iframe) {
    const remembered = iframe && this.registrations.get(iframe);
    const documentId = bridgeDocumentId(iframe) || String(remembered?.documentId || "");
    const datasetImplementation = String(
      iframe?.dataset?.preferredModelContentRuntimeImplementation || ""
    );
    if (
      !documentId
      || datasetImplementation !== CONTENT_RUNTIME_IDENTITY.implementationVersion
      || (remembered?.runtimeIdentity && !contentRuntimePackageBundleIdentityMatches(remembered.runtimeIdentity, "content/content.js"))
    ) return null;
    return { ...(remembered || {}), documentId };
  }

  invalidate(iframe, reason = "invalidated") {
    if (iframe) this.registrations.delete(iframe);
    this.invalidateRuntime?.(iframe, reason);
  }

  async ensure(iframe, { features = [], force = false } = {}) {
    if (!iframe || iframe.isConnected === false) throw new FrameCommandError("STALE_DOCUMENT", "iframe is detached", { delivered: false });
    const current = this.registration(iframe);
    const capabilityDocumentCurrent = String(iframe.dataset?.contentRuntimeCapabilitiesDocumentId || "") === current?.documentId;
    const installedCapabilities = capabilityDocumentCurrent
      ? new Set(String(iframe.dataset?.contentRuntimeCapabilities || "").split(",").filter(Boolean))
      : new Set();
    const capabilitiesReady = features.every((feature) => installedCapabilities.has(feature));
    const summaryReady = !features.includes("summary") || (
      capabilitiesReady
      && String(iframe.dataset?.summaryRuntimeDocumentId || "") === current?.documentId
      && Boolean(iframe.dataset?.summaryRuntimeBridgeVersion)
    );
    if (!force && current && capabilitiesReady && summaryReady) return current;
    if (!this.ensureRuntime) {
      const registration = this.registration(iframe);
      if (registration && capabilitiesReady && summaryReady) return registration;
      if (registration && features.length) {
        throw new FrameCommandError("INJECTION_FAILED", `Content capabilities are unavailable: ${features.join(", ")}`, { delivered: false });
      }
      throw new FrameCommandError("NOT_REGISTERED", "Content document is not registered", { delivered: false });
    }
    let result;
    try {
      result = await this.ensureRuntime(iframe, { summary: features.includes("summary"), features });
    } catch (error) {
      throw new FrameCommandError("INJECTION_FAILED", error?.message || String(error), { delivered: false, cause: error });
    }
    if (!result?.ok || !result.registration?.documentId) {
      throw new FrameCommandError("INJECTION_FAILED", result?.reason || "Content runtime could not be prepared", { delivered: false });
    }
    this.registrations.set(iframe, result.registration);
    return result.registration;
  }

  async request(iframe, commandName, data = {}, options = {}) {
    const command = String(commandName || "");
    const spec = frameCommandSpec(command);
    if (!spec) throw new FrameCommandError("REMOTE_ERROR", `Unknown frame command: ${command}`, { command, delivered: false });
    const timeoutMs = boundedTimeout(options.timeoutMs, spec.timeoutMs);
    const features = [...new Set([...(spec.features || []), ...(options.features || [])])];
    if (options.signal?.aborted) {
      throw new FrameCommandError("ABORTED", `Frame command aborted: ${command}`, { command, delivered: false });
    }
    if (options.skipEnsure) {
      if (!this.registration(iframe)) {
        throw new FrameCommandError("NOT_REGISTERED", `Content document is not registered: ${command}`, { command, delivered: false });
      }
    } else {
      await this.ensure(iframe, { features, force: spec.mutating });
    }

    const send = async () => {
      const documentId = bridgeDocumentId(iframe);
      if (!documentId) throw new FrameCommandError("NOT_REGISTERED", `Content document is not registered: ${command}`, { command, delivered: false });
      const appTabId = await this.currentTabId();
      if (!Number.isInteger(appTabId)) throw new FrameCommandError("NOT_REGISTERED", `Extension tab is unavailable: ${command}`, { command, delivered: false });
      let response;
      try {
        response = await abortable(this.requestBackground(
          BACKGROUND_REQUEST_ACTIONS.SEND_FRAME_COMMAND,
          {
            appTabId,
            bridgeDocumentId: documentId,
            command,
            data,
            timeoutMs
          }
        ), options.signal, command);
      } catch (error) {
        throw asFrameError(error, command);
      }
      if (!response?.success) {
        throw new FrameCommandError(response?.code || "REMOTE_ERROR", response?.error || `Frame command failed: ${command}`, {
          command,
          ...(typeof response?.delivered === "boolean" ? { delivered: response.delivered } : {})
        });
      }
      return response.data;
    };

    try {
      return await send();
    } catch (error) {
      const frameError = asFrameError(error, command);
      const recoverableBeforeDelivery = !spec.mutating
        && frameError.delivered === false
        && ["NOT_REGISTERED", "STALE_DOCUMENT", "INJECTION_FAILED"].includes(frameError.code);
      if (!recoverableBeforeDelivery) throw frameError;
      this.invalidate(iframe, `${command}:${frameError.code}`);
      await this.ensure(iframe, { features });
      return send();
    }
  }
}

export async function verifyContentFrameRegistration(documentId) {
  const token = String(documentId || "").trim();
  if (!token) return false;
  const appTabId = await currentExtensionTabId();
  if (!Number.isInteger(appTabId)) return false;
  try {
    const response = await requestBackground(BACKGROUND_REQUEST_ACTIONS.VERIFY_FRAME_CONTEXT, {
      appTabId,
      bridgeDocumentId: token
    });
    return response?.success ? response.data || null : false;
  } catch {
    return false;
  }
}
