#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const previous = { document: globalThis.document, Node: globalThis.Node, location: globalThis.location };
  globalThis.Node = { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 };
  const documentRoot = {};
  const conversation = {};
  const element = (role, text, order) => ({
    role,
    text,
    matches(selector) {
      return selector === `.${role}` || (selector === ".overlap" && Boolean(role));
    },
    querySelector() { return null; },
    cloneNode() {
      return { innerText: text, textContent: text, querySelectorAll() { return []; } };
    },
    compareDocumentPosition(other) {
      return order < other.order ? 4 : order > other.order ? 2 : 0;
    },
    order
  });
  const user = element("user", "same visible text", 1);
  const assistant = element("assistant", "same visible text", 2);
  const repeatedAssistant = element("assistant", "same visible text", 3);
  const messages = [user, assistant, repeatedAssistant];
  globalThis.document = documentRoot;
  try {
    const { collectOfficialSummaryMessages } = await import("../content-src/capabilities/summary-official-rules.js");
    const qsa = (selector, root) => {
      if (root === documentRoot && selector === ".conversation") return [conversation];
      if (root === conversation && selector === ".message") return messages;
      return [];
    };
    const base = {
      officialRuleHints: {
        conversationRoot: [".conversation"],
        messageRoot: [".message"],
        userRoot: [".user"],
        assistantRoot: [".assistant"],
        cleanup: [], actionBar: [], messageCopy: [], userRoleSignal: [], assistantRoleSignal: [],
        nestedCodeAction: [], referenceAction: []
      }
    };
    const deps = { qsa, closest: () => null, visible: () => true, normalize: (value) => String(value || "").trim() };
    assert.deepEqual(collectOfficialSummaryMessages(base, deps), [
      { role: "user", text: "same visible text" },
      { role: "assistant", text: "same visible text" },
      { role: "assistant", text: "same visible text" }
    ], "remote hints must classify by explicit role and preserve distinct repeated turns");
    assert.equal(collectOfficialSummaryMessages({
      ...base,
      officialRuleHints: { ...base.officialRuleHints, userRoot: [".overlap"], assistantRoot: [".overlap"] }
    }, deps), null, "overlapping roles must fail closed");
    assert.equal(collectOfficialSummaryMessages({
      ...base,
      officialRuleHints: { ...base.officialRuleHints, assistantRoot: [".missing"] }
    }, deps), null, "single-role results must fail closed");
    const { createSummaryCapability } = await import("../content-src/capabilities/summary-runtime.js");
    let customCalls = 0;
    const capability = createSummaryCapability({
      requestBackground: async () => {
        customCalls += 1;
        return { data: { messages: [{ role: "user", text: "custom prompt" }, { role: "assistant", text: "custom answer" }] } };
      },
      EXECUTE_SUMMARY_USERSCRIPT_REQUEST: {},
      contentDocumentId: "fixture-document",
      merge: (items) => items,
      hasUserAndAssistant: (items) => items.some((item) => item.role === "user") && items.some((item) => item.role === "assistant"),
      collectOfficialSummaryMessages: () => { throw new Error("official collector must not run for custom source"); }
    });
    const customResult = await capability.collectSummary({
      expectedDocumentId: "fixture-document",
      config: {
        id: "chatgpt",
        builtIn: true,
        sourceMode: "custom",
        officialRuleHints: base.officialRuleHints
      }
    });
    assert.equal(customCalls, 1);
    assert.deepEqual(customResult.messages.map(({ role }) => role), ["user", "assistant"]);

    let officialCalls = 0;
    const packagedMessages = [{ role: "user", text: "packaged prompt" }, { role: "assistant", text: "packaged answer" }];
    const officialMessages = [{ role: "user", text: "official prompt" }, { role: "assistant", text: "official answer" }];
    const scopedCapability = createSummaryCapability({
      contentDocumentId: "fixture-document",
      runtimes: {
        require() {
          return {
            scripts: {
              chatgpt: async (api) => (await api.collectOfficialCandidate()) || packagedMessages
            }
          };
        }
      },
      CONTENT_BRIDGE_VERSION: "fixture",
      merge: (items) => items,
      hasUserAndAssistant: (items) => items.some((item) => item.role === "user") && items.some((item) => item.role === "assistant"),
      collectOfficialSummaryMessages: () => {
        officialCalls += 1;
        return officialMessages;
      },
      qsa: () => [],
      closest: () => null,
      visible: () => true,
      normalize: (value) => String(value || ""),
      sleep: async () => {}
    });
    const scopedConfig = {
      id: "chatgpt",
      builtIn: true,
      userscriptRunMode: "serial",
      officialRuleRevision: 1,
      officialRuleHosts: ["chatgpt.com"],
      officialRulePathPrefixes: ["/new"],
      officialRuleHints: base.officialRuleHints,
      officialRuleWaitMs: 60000
    };
    globalThis.location = { href: "https://sibling.chatgpt.com/new/thread" };
    assert.deepEqual((await scopedCapability.collectSummary({ config: scopedConfig })).messages, packagedMessages);
    globalThis.location.href = "https://chatgpt.com/old/thread";
    assert.deepEqual((await scopedCapability.collectSummary({ config: scopedConfig })).messages, packagedMessages);
    assert.equal(officialCalls, 0, "out-of-scope Summary URLs must not query signed selector hints or wait parameters");
    globalThis.location.href = "https://chatgpt.com/new/thread";
    assert.deepEqual((await scopedCapability.collectSummary({ config: scopedConfig })).messages, officialMessages);
    assert.equal(officialCalls, 1, "exact signed HTTPS host and path may use official Summary hints");

    officialCalls = 0;
    let pageCalls = 0;
    let runnerCalls = 0;
    const pipelineCapability = createSummaryCapability({
      contentDocumentId: "fixture-document",
      runtimes: {
        require() {
          return {
            scripts: {
              chatgpt: async () => {
                runnerCalls += 1;
                return packagedMessages;
              }
            }
          };
        }
      },
      CONTENT_BRIDGE_VERSION: "fixture",
      merge: (items) => items,
      hasUserAndAssistant: (items) => items.some((item) => item.role === "user") && items.some((item) => item.role === "assistant"),
      collectOfficialSummaryMessages: () => {
        officialCalls += 1;
        return officialMessages;
      },
      pageSummaryRequest: async () => {
        pageCalls += 1;
        return { messages: packagedMessages };
      },
      qsa: () => [],
      closest: () => null,
      visible: () => true,
      normalize: (value) => String(value || ""),
      sleep: async () => {}
    });
    const pageWorldConfig = { ...scopedConfig, userscriptRunMode: "pageWorldFirst" };
    const officialFirst = await pipelineCapability.collectSummary({ config: pageWorldConfig });
    assert.deepEqual(officialFirst.messages, officialMessages, "JSON-first pipeline must return official turns before page-world JS");
    assert.equal(officialFirst.stage, "official");
    assert.equal(pageCalls, 0, "pageWorldFirst must not run when official JSON already collected a conversation");
    assert.equal(runnerCalls, 0, "packaged JS must not run when official JSON already collected a conversation");
    assert.equal(officialCalls, 1, "official JSON is a pipeline stage, not a runner helper");

    officialCalls = 0;
    const noRunnerCapability = createSummaryCapability({
      contentDocumentId: "fixture-document",
      runtimes: { require() { return { scripts: {} }; } },
      CONTENT_BRIDGE_VERSION: "fixture",
      merge: (items) => items,
      hasUserAndAssistant: (items) => items.some((item) => item.role === "user") && items.some((item) => item.role === "assistant"),
      collectOfficialSummaryMessages: () => {
        officialCalls += 1;
        return officialMessages;
      },
      pageSummaryRequest: async () => {
        throw new Error("page-world JS must not run for an official-only collector");
      },
      qsa: () => [],
      closest: () => null,
      visible: () => true,
      normalize: (value) => String(value || ""),
      sleep: async () => {}
    });
    const officialOnly = await noRunnerCapability.collectSummary({
      config: { ...scopedConfig, userscriptRunMode: "serial" }
    });
    assert.deepEqual(officialOnly.messages, officialMessages, "official JSON must collect without a packaged runner");
    assert.equal(officialOnly.stage, "official");
    assert.equal(officialCalls, 1);

    const { summaryConfigHasCollector } = await import("../shared/summary-sites.js");
    assert.equal(summaryConfigHasCollector({ userscriptFile: "poe.js" }), true);
    assert.equal(summaryConfigHasCollector({
      officialRuleHints: { messageRoot: [".message"], userRoot: [".user"], assistantRoot: [".assistant"] }
    }), true, "filled official slots are a collector even without a userscript file");
    assert.equal(summaryConfigHasCollector({
      officialRuleHints: { messageRoot: [], userRoot: [], assistantRoot: [] }
    }), false, "empty packaged official slots are not a collector by themselves");
    assert.equal(summaryConfigHasCollector({
      builtIn: false,
      sourceMode: "custom",
      customUserscript: "return [];"
    }), true);

    console.log("official Summary selector hints remain strict, role-safe, and DOM-identity based: ok");
  } finally {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.Node === undefined) delete globalThis.Node;
    else globalThis.Node = previous.Node;
    if (previous.location === undefined) delete globalThis.location;
    else globalThis.location = previous.location;
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
