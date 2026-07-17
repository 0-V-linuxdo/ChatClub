import {
  TOPIC_DELETE_BRIDGE_SOURCE,
  TOPIC_DELETE_MENU_COMMAND_EVENT,
  TOPIC_DELETE_PING_EVENT,
  TOPIC_DELETE_READY_EVENT,
  TOPIC_DELETE_REQUEST_EVENT,
  TOPIC_DELETE_RESULT_EVENT
} from "../shared/protocol.js";
import { GEMINI_DELETE_USERSCRIPT_HELPERS } from "./topic-delete-gemini-helpers.js";
import { DELETE_USERSCRIPT_ENGINE_CORE } from "./topic-delete-userscript-engine-core.js";
import { DELETE_USERSCRIPT_ENGINE_SITES } from "./topic-delete-userscript-engine-sites.js";

const DELETE_USERSCRIPT_VERSION = "2026.07.16.1";
const GEMINI_DELETE_USERSCRIPT_VERSION = "2026.07.16.1";
const DELETE_USERSCRIPT_NAMESPACE = "https://chatclub.local/delete-sites";

const DELETE_USERSCRIPT_ENGINE = DELETE_USERSCRIPT_ENGINE_CORE + DELETE_USERSCRIPT_ENGINE_SITES;

function metadataLines(items = []) {
  return items.map(([key, value]) => `// ${key.padEnd(12, " ")} ${value}`).join("\n");
}

function standaloneDeleteUserscript({ id, name, description, matches, keys, version = DELETE_USERSCRIPT_VERSION, helpers = "", runner = "" }) {
  const header = [
    "// ==UserScript==",
    metadataLines([
      ["@name", `ChatClub Delete Site - ${name}`],
      ["@namespace", DELETE_USERSCRIPT_NAMESPACE],
      ["@version", version],
      ["@description", description],
      ...matches.map((match) => ["@match", match]),
      ["@run-at", "document-idle"],
      ["@grant", "GM_registerMenuCommand"],
      ["@grant", "unsafeWindow"]
    ]),
    "// ==/UserScript=="
  ].join("\n");
  const engine = DELETE_USERSCRIPT_ENGINE
    .replace("__CHATCLUB_DELETE_SITE_ID__", JSON.stringify(id))
    .replace("__CHATCLUB_DELETE_SITE_NAME__", JSON.stringify(name))
    .replace("__CHATCLUB_DELETE_SITE_KEYS__", JSON.stringify([id, name, ...(keys || [])]))
    .replace("__CHATCLUB_DELETE_SITE_VERSION__", JSON.stringify(version))
    .replace("__CHATCLUB_DELETE_REQUEST_EVENT__", JSON.stringify(TOPIC_DELETE_REQUEST_EVENT))
    .replace("__CHATCLUB_DELETE_MENU_COMMAND_EVENT__", JSON.stringify(TOPIC_DELETE_MENU_COMMAND_EVENT))
    .replace("__CHATCLUB_DELETE_RESULT_EVENT__", JSON.stringify(TOPIC_DELETE_RESULT_EVENT))
    .replace("__CHATCLUB_DELETE_PING_EVENT__", JSON.stringify(TOPIC_DELETE_PING_EVENT))
    .replace("__CHATCLUB_DELETE_READY_EVENT__", JSON.stringify(TOPIC_DELETE_READY_EVENT))
    .replace("__CHATCLUB_DELETE_BRIDGE_SOURCE__", JSON.stringify(TOPIC_DELETE_BRIDGE_SOURCE))
    .replace("__CHATCLUB_DELETE_SITE_HELPERS__\n", helpers)
    .replace("__CHATCLUB_DELETE_SITE_RUNNER__", runner);
  return `${header}\n\n${engine.trimEnd()}\n`;
}

export const KAGI_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "kagi",
  name: "Kagi Assistant",
  description: "Delete the current Kagi Assistant chat when ChatClub or the userscript menu requests it.",
  matches: ["https://assistant.kagi.com/*"],
  keys: ["Kagi"]
});

export const CHATGPT_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "chatgpt",
  name: "ChatGPT",
  description: "Delete the current ChatGPT chat when ChatClub or the userscript menu requests it.",
  matches: ["https://chatgpt.com/*", "https://*.chatgpt.com/*", "https://chat.openai.com/*", "https://*.chat.openai.com/*"],
  keys: ["ChatGPT"]
});

export const GEMINI_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "gemini",
  name: "Gemini",
  description: "Delete the current Gemini conversation when ChatClub or the userscript menu requests it.",
  matches: ["https://gemini.google.com/*", "https://*.gemini.google.com/*"],
  keys: ["Gemini"],
  version: GEMINI_DELETE_USERSCRIPT_VERSION,
  helpers: GEMINI_DELETE_USERSCRIPT_HELPERS,
  runner: "    gemini: deleteGemini,\n"
});

export const GROK_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "grok",
  name: "Grok",
  description: "Delete the current Grok conversation when ChatClub or the userscript menu requests it.",
  matches: ["https://grok.com/*", "https://*.grok.com/*", "https://grok.x.ai/*", "https://*.grok.x.ai/*"],
  keys: ["Grok"]
});

export const GROK_MIRROR_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "grokMirror",
  name: "Grok Mirror",
  description: "Delete the current Grok Mirror conversation when ChatClub or the userscript menu requests it.",
  matches: ["https://gk.dairoot.cn/*", "https://*.gk.dairoot.cn/*"],
  keys: ["GrokMirror"]
});

export const NOTION_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "notion",
  name: "Notion AI",
  description: "Delete the current Notion AI chat when ChatClub or the userscript menu requests it.",
  matches: ["https://app.notion.com/*", "https://notion.so/*", "https://www.notion.so/*", "https://*.notion.so/*"],
  keys: ["NotionAI"]
});

export const DEEPSEEK_DELETE_USERSCRIPT = standaloneDeleteUserscript({
  id: "deepseek",
  name: "DeepSeek",
  description: "Delete the current DeepSeek chat when ChatClub or the userscript menu requests it.",
  matches: ["https://deepseek.com/*", "https://*.deepseek.com/*"],
  keys: ["DeepSeek"]
});

export const TOPIC_DELETE_USERSCRIPT_SOURCES = Object.freeze({
  chatgpt: CHATGPT_DELETE_USERSCRIPT,
  gemini: GEMINI_DELETE_USERSCRIPT,
  kagi: KAGI_DELETE_USERSCRIPT,
  grok: GROK_DELETE_USERSCRIPT,
  grokMirror: GROK_MIRROR_DELETE_USERSCRIPT,
  notion: NOTION_DELETE_USERSCRIPT,
  deepseek: DEEPSEEK_DELETE_USERSCRIPT
});
