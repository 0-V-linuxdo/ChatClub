import { createChatGptAdapter } from "./sites/chatgpt.js";
import { createGeminiAdapter } from "./sites/gemini.js";
import { createGrokAdapter } from "./sites/grok.js";
import { createKagiAdapter } from "./sites/kagi.js";
import { createNotionAdapter } from "./sites/notion.js";
import { createStandardAdapters } from "./sites/standard.js";

const REQUIRED_ADAPTER_IDS = Object.freeze([
  "aiStudio",
  "chatgpt",
  "claude",
  "deepseek",
  "gemini",
  "generic",
  "grok",
  "kagi",
  "lechat",
  "notion",
  "poe"
]);

function validateAdapter(id, adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError(`Message Navigator adapter ${id} must be an object.`);
  }
  if (typeof adapter.collect !== "function") {
    throw new TypeError(`Message Navigator adapter ${id} requires collect().`);
  }
  for (const hook of ["role", "target", "effectTarget", "summaryElement", "text"]) {
    if (adapter[hook] != null && typeof adapter[hook] !== "function") {
      throw new TypeError(`Message Navigator adapter ${id} hook ${hook} must be a function.`);
    }
  }
  return adapter;
}

export function createMessageNavigatorAdapters(dependencies = undefined) {
  if (dependencies !== undefined) {
    throw new TypeError("Message Navigator adapters own their site logic and do not accept injected callbacks.");
  }
  const adapters = Object.assign(Object.create(null), createStandardAdapters(), {
    chatgpt: createChatGptAdapter(),
    gemini: createGeminiAdapter(),
    grok: createGrokAdapter(),
    kagi: createKagiAdapter(),
    notion: createNotionAdapter()
  });
  const actualIds = Object.keys(adapters).sort();
  const expectedIds = [...REQUIRED_ADAPTER_IDS].sort();
  if (
    actualIds.length !== expectedIds.length
    || actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new TypeError(`Message Navigator adapter registry mismatch: ${actualIds.join(", ")}.`);
  }
  for (const id of REQUIRED_ADAPTER_IDS) adapters[id] = Object.freeze(validateAdapter(id, adapters[id]));
  return Object.freeze(adapters);
}

export { REQUIRED_ADAPTER_IDS, validateAdapter };
