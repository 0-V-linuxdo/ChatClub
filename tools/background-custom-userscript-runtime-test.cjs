#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const SUMMARY_ACTION = "executeSummaryUserscript";
const DELETE_ACTION = "executeTopicDeleteUserscript";
const REQUEST = Object.freeze({
  INSTALL_TOPIC_DELETE_USERSCRIPT: "installTopicDeleteUserscript",
  EXECUTE_SUMMARY_USERSCRIPT: SUMMARY_ACTION,
  EXECUTE_TOPIC_DELETE_USERSCRIPT: DELETE_ACTION
});
const senderUrl = "https://chatgpt.com/c/thread-1";
const sender = Object.freeze({
  id: "chatclub-test",
  tab: Object.freeze({ id: 21, url: "moz-extension://chatclub-test/chatClub.html" }),
  frameId: 9,
  documentId: "document-1",
  url: senderUrl
});

function runtimeFixture(createCustomUserscriptRuntime, options = {}) {
  const events = [];
  const scriptCalls = [];
  const userScriptCalls = [];
  const api = {
    runtime: {
      id: "chatclub-test",
      getURL: (file = "") => `moz-extension://chatclub-test/${file}`
    },
    webNavigation: {
      async getFrame() {
        events.push("get-frame");
        return {
          tabId: 21,
          frameId: 9,
          parentFrameId: 0,
          documentId: "document-1",
          url: senderUrl
        };
      }
    },
    scripting: {
      async executeScript(details) {
        scriptCalls.push(details);
        if (typeof options.probe === "function") {
          return [{ documentId: "document-1", result: options.probe(details) }];
        }
        throw new Error("Unexpected scripting.executeScript call");
      }
    },
    userScripts: {
      async execute(details) {
        userScriptCalls.push(details);
        return options.executeUserScript(details, userScriptCalls.length);
      }
    }
  };
  const runtime = createCustomUserscriptRuntime(api, {
    async loadOptions() {
      events.push("load-options");
      return options.storedOptions;
    },
    async loadCustomConfig() {
      events.push("load-custom-config");
      return [];
    }
  });
  return {
    events,
    handlers: new Map(runtime.requestHandlers(REQUEST)),
    scriptCalls,
    userScriptCalls
  };
}

(async () => {
  const { createCustomUserscriptRuntime } = await import(
    pathToFileURL(path.join(root, "background/custom-userscript-runtime.js")).href
  );
  const summaryConfig = Object.freeze({
    id: "custom-summary",
    name: "Custom Summary",
    enabled: true,
    builtIn: false,
    hosts: ["chatgpt.com"],
    customUserscript: "return [{ role: 'user', text: 'question' }, { role: 'assistant', text: 'answer' }];"
  });

  for (const mode of ["missing-executor", "stale-generation"]) {
    const globals = [];
    const fixture = runtimeFixture(createCustomUserscriptRuntime, {
      storedOptions: { summarySiteConfigs: [summaryConfig], topicDeleteSiteConfigs: [] },
      executeUserScript: async () => {
        throw new Error("custom Summary source must not execute when its packaged runtime is unavailable");
      },
      probe(details) {
        assert.equal(details.world, "MAIN");
        assert.equal(typeof details.func, "function");
        const [executorKey, registryKey, abiVersion, generation] = details.args;
        globals.push(executorKey, registryKey);
        globalThis[registryKey] = {
          abiVersion,
          activeGenerationVersion: mode === "stale-generation" ? "generation-old" : generation,
          acquireGeneration() {
            throw new Error("an unavailable Summary runtime must fail before generation acquisition");
          }
        };
        if (mode === "stale-generation") globalThis[executorKey] = () => {};
        else delete globalThis[executorKey];
        return details.func(...details.args);
      }
    });
    try {
      await assert.rejects(
        fixture.handlers.get(SUMMARY_ACTION)({ configId: summaryConfig.id }, sender),
        /MAIN-world runtime is unavailable or stale/
      );
      assert.equal(fixture.scriptCalls.length, 1);
      assert.equal(fixture.scriptCalls.some((details) => Array.isArray(details.files)), false);
      assert.equal(fixture.userScriptCalls.length, 0);
      assert.deepEqual(fixture.events.slice(0, 2), ["load-options", "get-frame"]);
    } finally {
      for (const key of globals) delete globalThis[key];
    }
  }

  const deleteConfig = Object.freeze({
    id: "custom-delete",
    name: "Custom Delete",
    enabled: true,
    builtIn: false,
    sourceMode: "custom",
    hosts: ["chatgpt.com"],
    customUserscript: `// ==UserScript==
// @name Custom Delete
// ==/UserScript==
globalThis.ChatClubDeleteSites = globalThis.ChatClubDeleteSites || {};
globalThis.ChatClubDeleteSites.customDelete = { id: "custom-delete", menuCommand() { return { ok: true }; } };`
  });
  const deletePayload = Object.freeze({
    deleteAttemptId: "attempt-1",
    expectedDeleteIdentity: Object.freeze({ provider: "chatgpt", id: "thread-1" })
  });

  {
    const fixture = runtimeFixture(createCustomUserscriptRuntime, {
      storedOptions: { summarySiteConfigs: [], topicDeleteSiteConfigs: [deleteConfig] },
      async executeUserScript() {
        throw new Error("MAIN world execution failed after dispatch");
      }
    });
    await assert.rejects(
      fixture.handlers.get(DELETE_ACTION)({ configId: deleteConfig.id, payload: deletePayload }, sender),
      /world execution failed after dispatch/
    );
    assert.equal(fixture.userScriptCalls.length, 1, "an unknown destructive execution failure must never retry");
    assert.deepEqual(fixture.events.slice(0, 2), ["load-options", "get-frame"]);
    assert.match(fixture.userScriptCalls[0].js[0].code, /target URL changed before execution/);
    assert.match(fixture.userScriptCalls[0].js[0].code, /target URL changed before menuCommand/);
    assert.equal(fixture.userScriptCalls[0].js[0].code.includes(senderUrl), true);
  }

  {
    const fixture = runtimeFixture(createCustomUserscriptRuntime, {
      storedOptions: { summarySiteConfigs: [], topicDeleteSiteConfigs: [deleteConfig] },
      async executeUserScript(_details, callNumber) {
        if (callNumber === 1) throw new TypeError('Unexpected property "world"');
        return [{
          documentId: "document-1",
          result: JSON.stringify({ ok: true, site: "custom-delete" })
        }];
      }
    });
    const result = await fixture.handlers.get(DELETE_ACTION)(
      { configId: deleteConfig.id, payload: deletePayload },
      sender
    );
    assert.deepEqual(result, { data: { ok: true, site: "custom-delete" } });
    assert.equal(fixture.userScriptCalls.length, 2, "an explicit pre-delivery world option rejection may use compatibility fallback once");
    assert.equal(fixture.userScriptCalls[0].world, "MAIN");
    assert.equal(Object.hasOwn(fixture.userScriptCalls[1], "world"), false);
    assert.deepEqual(fixture.userScriptCalls[1].target, { tabId: 21, documentIds: ["document-1"] });
  }

  {
    const fixture = runtimeFixture(createCustomUserscriptRuntime, {
      storedOptions: { summarySiteConfigs: [], topicDeleteSiteConfigs: [deleteConfig] },
      async executeUserScript() {
        throw new Error("identity rejection must occur before injection");
      }
    });
    await assert.rejects(
      fixture.handlers.get(DELETE_ACTION)({
        configId: deleteConfig.id,
        payload: { ...deletePayload, expectedDeleteIdentity: { provider: "chatgpt", id: "thread-2" } }
      }, sender),
      /target identity does not match/
    );
    assert.equal(fixture.userScriptCalls.length, 0);
    assert.equal(fixture.events.includes("get-frame"), false);
  }

  console.log("background custom userscript runtime safety: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
