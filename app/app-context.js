/**
 * @typedef {object} AppContext
 * @property {any} state
 * @property {() => void} [render]
 * @property {() => void} [syncSummaryPanel]
 * @property {() => void} [syncWorkspaceDom]
 * @property {(message: string, type?: string) => HTMLElement | void} [toast]
 * @property {(name: string) => SVGElement} [svgIcon]
 * @property {(options?: { focus?: boolean }) => HTMLTextAreaElement | null} [syncPromptInputNode]
 * @property {() => Promise<void>} [notifyConfigReload]
 * @property {() => void} [applyTheme]
 * @property {() => string} [syncI18nLanguage]
 * @property {() => void} [hydrateGroups]
 * @property {() => void} [enterTopbarEditMode]
 * @property {(url: string) => boolean | Promise<boolean>} [openTabUrl]
 * @property {(iframe: HTMLIFrameElement, action: string, data?: any, timeoutMs?: number) => Promise<any>} [sendToIframe]
 */

export const APP_CONTEXT_KEYS = Object.freeze([
  "state",
  "render",
  "syncSummaryPanel",
  "syncWorkspaceDom",
  "toast",
  "svgIcon",
  "syncPromptInputNode",
  "notifyConfigReload",
  "applyTheme",
  "syncI18nLanguage",
  "hydrateGroups",
  "enterTopbarEditMode",
  "openTabUrl",
  "sendToIframe"
]);

export const APP_CONTEXT_REQUIRED_KEYS = Object.freeze(["state"]);

/**
 * @param {Partial<AppContext>} services
 * @returns {Readonly<AppContext>}
 */
export function createAppContext(services = {}) {
  if (!services || typeof services !== "object") {
    throw new TypeError("App context services must be an object.");
  }
  for (const key of APP_CONTEXT_REQUIRED_KEYS) {
    if (!(key in services)) {
      throw new TypeError(`App context requires ${key}.`);
    }
  }
  return Object.freeze({ ...services });
}

/**
 * @param {Readonly<AppContext>} ctx
 * @param {string[]} keys
 * @param {string} label
 * @returns {Readonly<Record<string, any>>}
 */
export function pickAppContext(ctx, keys, label = "controller") {
  if (!ctx || typeof ctx !== "object") {
    throw new TypeError(`${label} requires an app context object.`);
  }
  if (!Array.isArray(keys)) {
    throw new TypeError(`${label} requires an app context key list.`);
  }
  const picked = {};
  for (const key of keys) {
    if (!(key in ctx)) {
      throw new TypeError(`${label} requires app context.${key}.`);
    }
    picked[key] = ctx[key];
  }
  return Object.freeze(picked);
}

/**
 * @param {Readonly<AppContext>} ctx
 * @param {string[]} keys
 * @returns {Readonly<Record<string, any>>}
 */
export function pickOptionalAppContext(ctx, keys) {
  const picked = {};
  for (const key of keys || []) {
    if (key in (ctx || {})) picked[key] = ctx[key];
  }
  return Object.freeze(picked);
}
