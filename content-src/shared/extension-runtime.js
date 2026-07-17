import { createBackgroundRequestContractClient } from "../../shared/background-request-core.js";

function sendExtensionRuntimeMessage(message) {
  const extensionApi = globalThis.browser || globalThis.chrome;
  const promiseRuntime = globalThis.browser?.runtime;
  if (promiseRuntime?.sendMessage) return promiseRuntime.sendMessage(message);
  return new Promise((resolve, reject) => {
    if (!extensionApi?.runtime?.sendMessage) {
      reject(new Error("Extension runtime messaging is unavailable"));
      return;
    }
    extensionApi.runtime.sendMessage(message, (response) => {
      const runtimeError = extensionApi.runtime.lastError?.message;
      if (runtimeError) reject(new Error(runtimeError));
      else resolve(response);
    });
  });
}

export const requestBackground = createBackgroundRequestContractClient(sendExtensionRuntimeMessage);
