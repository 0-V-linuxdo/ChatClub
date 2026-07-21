import { STORAGE_KEYS } from "../shared/constants.js";
import {
  normalizeFunctionalAnomalyRecords,
  recordFunctionalAnomaly
} from "../shared/functional-anomalies.js";
import { isStorageQuotaError } from "../shared/storage-schema.js";

function localStorageArea(api) {
  return api?.storage?.local || api;
}

export function createFunctionalAnomalyStore(api, options = {}) {
  const storage = localStorageArea(api);
  if (
    typeof storage?.get !== "function"
    || typeof storage?.set !== "function"
    || typeof storage?.remove !== "function"
  ) {
    throw new TypeError("Functional anomaly storage.local is unavailable");
  }

  let operationChain = Promise.resolve();
  const queue = (operation) => {
    const queued = operationChain.catch(() => {}).then(operation);
    operationChain = queued.then(() => undefined, () => undefined);
    return queued;
  };

  async function readRecords() {
    const stored = await storage.get(STORAGE_KEYS.functionalAnomalies);
    return normalizeFunctionalAnomalyRecords(stored?.[STORAGE_KEYS.functionalAnomalies]);
  }

  async function writeWithQuotaPruning(records) {
    let candidate = normalizeFunctionalAnomalyRecords(records);
    if (!candidate.length) {
      await storage.remove(STORAGE_KEYS.functionalAnomalies);
      return [];
    }
    while (true) {
      try {
        await storage.set({ [STORAGE_KEYS.functionalAnomalies]: candidate });
        return candidate;
      } catch (error) {
        if (!isStorageQuotaError(error)) throw error;
        if (candidate.length <= 1) {
          await storage.remove(STORAGE_KEYS.functionalAnomalies);
          try {
            await storage.set({ [STORAGE_KEYS.functionalAnomalies]: candidate });
            return candidate;
          } catch (retryError) {
            if (!isStorageQuotaError(retryError)) throw retryError;
            return [];
          }
        }
        candidate = candidate.slice(0, -1);
      }
    }
  }

  function list() {
    return queue(readRecords);
  }

  function record(details = {}) {
    return queue(async () => {
      const current = await readRecords();
      const next = recordFunctionalAnomaly(current, details, {
        now: options.now,
        createId: options.createId
      });
      const records = await writeWithQuotaPruning(next.records);
      return {
        record: records.find((entry) => entry.id === next.record.id) || next.record,
        records
      };
    });
  }

  function remove(id) {
    return queue(async () => {
      const targetId = String(id || "").trim();
      const current = await readRecords();
      const records = current.filter((entry) => entry.id !== targetId);
      return writeWithQuotaPruning(records);
    });
  }

  function clear() {
    return queue(async () => {
      await storage.remove(STORAGE_KEYS.functionalAnomalies);
      return [];
    });
  }

  return Object.freeze({ list, record, remove, clear });
}
