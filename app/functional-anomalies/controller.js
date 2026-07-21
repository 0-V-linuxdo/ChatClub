import { BACKGROUND_REQUEST_ACTIONS } from "../../shared/background-requests.js";
import {
  formatFunctionalAnomalyExport,
  functionalAnomalyHost
} from "../../shared/functional-anomalies.js";
import { validateControllerContract } from "../controller-contract.js";

const RECORD_FIELDS = Object.freeze([
  "feature", "operation", "appId", "appName", "errorName", "errorCode", "reason", "message", "severity"
]);

function defined(target, key, value) {
  if (value !== undefined && value !== null && value !== "") target[key] = String(value);
}

function errorField(error, key) {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return undefined;
  try {
    return error[key];
  } catch {
    return undefined;
  }
}

function anomalyPayload(details, appVersion, surface) {
  const source = details && typeof details === "object" && !Array.isArray(details) ? details : {};
  const error = source.error;
  const payload = {};
  for (const field of RECORD_FIELDS) defined(payload, field, source[field]);
  defined(payload, "errorName", source.errorName ?? errorField(error, "name"));
  defined(payload, "errorCode", source.errorCode ?? errorField(error, "code"));
  const delivered = source.delivered ?? errorField(error, "delivered");
  if (typeof delivered === "boolean") payload.delivered = delivered;
  defined(payload, "reason", source.reason ?? errorField(error, "reason"));
  defined(
    payload,
    "message",
    errorField(error, "functionalAnomalyMessage")
      ?? source.message
      ?? errorField(error, "message")
      ?? (typeof error === "string" || typeof error === "number" ? String(error) : undefined)
  );
  const host = functionalAnomalyHost({ host: source.host, href: source.href });
  defined(payload, "host", host);
  defined(payload, "appVersion", appVersion);
  defined(payload, "surface", surface);
  return payload;
}

export function settledOperationFailure(result, fallbackMessage = "Operation failed") {
  if (result?.status === "rejected") {
    return result.reason || new Error(String(fallbackMessage || "Operation failed"));
  }
  if (result?.status !== "fulfilled" || result.value !== true) {
    return new Error(String(fallbackMessage || "Operation failed"));
  }
  return null;
}

export function createFunctionalAnomalyController({ state, requestBackground, appVersion, surface }) {
  validateControllerContract(
    { state, requestBackground, appVersion, surface },
    "Functional anomaly controller",
    { state: "object", requestBackground: "function", appVersion: "string", surface: "string" }
  );

  const listeners = new Set();

  function snapshot() {
    const records = Array.isArray(state.functionalAnomalyRecords) ? state.functionalAnomalyRecords : [];
    return records.map((record) => ({ ...record }));
  }

  function notify() {
    const records = snapshot();
    for (const listener of listeners) {
      try {
        listener(records);
      } catch {
        // Observers cannot make anomaly management fail.
      }
    }
  }

  function replaceRecords(records) {
    state.functionalAnomalyRecords = Array.isArray(records)
      ? records.map((record) => ({ ...record }))
      : [];
    notify();
    return snapshot();
  }

  async function record(details = {}) {
    try {
      const response = await requestBackground(
        BACKGROUND_REQUEST_ACTIONS.RECORD_FUNCTIONAL_ANOMALIES,
        anomalyPayload(details, appVersion, surface)
      );
      replaceRecords(response?.records);
      return response?.record && typeof response.record === "object" ? { ...response.record } : null;
    } catch {
      return null;
    }
  }

  async function refresh() {
    const response = await requestBackground(BACKGROUND_REQUEST_ACTIONS.LIST_FUNCTIONAL_ANOMALIES, {});
    return replaceRecords(response?.records);
  }

  async function remove(id) {
    const response = await requestBackground(BACKGROUND_REQUEST_ACTIONS.REMOVE_FUNCTIONAL_ANOMALIES, {
      id: String(id || "").trim()
    });
    return replaceRecords(response?.records);
  }

  async function clear() {
    const response = await requestBackground(BACKGROUND_REQUEST_ACTIONS.CLEAR_FUNCTIONAL_ANOMALIES, {});
    return replaceRecords(response?.records);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Functional anomaly subscriber must be a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function exportText(records = snapshot()) {
    return formatFunctionalAnomalyExport(records);
  }

  return Object.freeze({ record, refresh, remove, clear, snapshot, subscribe, exportText });
}
