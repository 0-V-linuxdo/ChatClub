// Builds a `Site<Name>` adapter plugin (spec v1.3 §18.4): data-only contributions to `site.adapter`,
// plus optional in-page content bundles that register site hooks.

import { definePlugin } from "../kernel/define.js";

/**
 * @param {object} o
 * @param {string} o.name plugin name, e.g. "SiteChatGPT"
 * @param {string} o.appId Apps id the adapter belongs to
 * @param {string[]} o.hosts
 * @param {{ zh: string, en: string }} o.description
 * @param {object} o.capabilities { summary?, messageNavigator?, deleteThread?, preferredModel?, send? }
 * @param {object[]} [o.content] content bundles (each with hosts defaulting to o.hosts)
 */
export function defineSitePlugin({ name, appId, hosts, description, capabilities, content = [], start }) {
  const descKey = `plugin.${name}.description`;
  return definePlugin({
    name,
    description: descKey,
    authors: ["ChatClub"],
    icon: "globe",
    tags: ["sites"],
    enabledByDefault: true,
    requiresReload: true,
    startAt: "init",
    dependencies: ["Sites"],
    usesExtensionPoints: ["site.adapter"],
    content: content.map((c) => ({ hosts, world: "ISOLATED", runAt: "document_idle", commands: {}, ...c })),
    strings: { zh: { [descKey]: description.zh }, en: { [descKey]: description.en } },
    app: {
      start(ctx) {
        ctx.contribute("site.adapter", { id: appId, appId, hosts, capabilities });
        start?.(ctx);
      },
    },
  });
}

/** Summary site config with the defaults of 04 §1.8. */
export function summaryConfig(fields) {
  return {
    enabled: true,
    builtIn: true,
    sourceMode: "builtIn",
    userscriptRunMode: "serial",
    fallbackMode: "structuredOnly",
    officialRuleHints: {},
    officialRuleWaitMs: 0,
    configVersion: 1,
    ...fields,
  };
}

/** Message navigator site config (v2 05 §3.1). `appIds` and `hosts` default to the adapter's. */
export function navigatorConfig(fields) {
  return { enabled: true, builtIn: true, pathPrefixes: [], userSelector: "", assistantSelector: "", thinkingSelector: "", textCleanupSelectors: [], summaryMaxChars: 60, ...fields };
}

/**
 * Topic-delete site config (v2 05 §4.3). `flow` is shortcut | headerMenu | rowMenu | titleMenu;
 * `trusted` says per step (open / pick / confirm) whether a trusted retry ("retry") or trusted-only ("always") is allowed.
 */
export function deleteConfig(fields) {
  return { enabled: true, builtIn: true, pathPrefixes: [], slots: {}, trusted: {}, trustedBudget: 1, ...fields };
}

/** Preferred-model menu data (v2 05 §5.1): where the model menu is and how its options read. */
export function modelConfig(fields) {
  return { readBack: false, closesOnSelect: false, settleMs: 600, ...fields };
}
