#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { createWorkspaceMessageNavigatorController } = await import(
    pathToFileURL(path.join(root, "app/workspace/message-navigator-controller.js")).href
  );
  const calls = [];
  const iframe = {
    dataset: {
      appId: "ChatGPT",
      currentHref: "https://chatgpt.com/c/example",
      messageNavigatorActivationRevision: "6",
      messageNavigatorEnabled: "1"
    },
    src: "https://chatgpt.com/c/example",
    getAttribute() { return this.src; }
  };
  const state = {
    groups: [],
    officialRulesActivationRevision: 7,
    options: {
      messageNavigatorEffectMode: "pulse",
      primaryColor: "#123456",
      messageNavigatorSiteConfigs: [{
        id: "chatgpt",
        name: "ChatGPT",
        enabled: true,
        appIds: ["ChatGPT"],
        hosts: ["chatgpt.com"],
        pathPrefixes: ["/c"],
        adapter: "chatgpt",
        messageSelector: "[data-message-author-role]"
      }]
    }
  };
  const controller = createWorkspaceMessageNavigatorController({
    state,
    appById: () => ({ id: "ChatGPT", name: "ChatGPT", url: "https://chatgpt.com/" }),
    openableTabUrl: (value) => /^https:\/\//.test(String(value || "")) ? String(value) : "",
    knownNoConversationPage: () => false,
    sendToContentFrame: async (_frame, action, payload) => {
      calls.push({ action, payload });
      return { ok: true };
    },
    activeChatForGroup: () => null,
    activeIframe: () => null,
    activeHref: async () => "",
    activeShortcutGroupId: () => "",
    notify() {},
    recordFunctionalAnomaly() {},
    syncWorkspaceDom() {},
    closePopovers() {}
  });

  const firstPayload = controller.messageNavigatorPayloadForFrame(iframe);
  assert.equal(firstPayload.activationRevision, 7);
  assert.equal(firstPayload.config.officialRulesActivationRevision, 7);
  assert.equal(firstPayload.options.activationRevision, 7);

  await controller.reapplyMessageNavigatorForFrame(iframe);
  assert.equal(iframe.dataset.messageNavigatorActivationRevision, "7");
  assert.equal(calls.at(-1).action, "setMessageNavigator");
  assert.equal(calls.at(-1).payload.activationRevision, 7);

  state.officialRulesActivationRevision = 8;
  await controller.reapplyMessageNavigatorForFrame(iframe);
  assert.equal(iframe.dataset.messageNavigatorActivationRevision, "8");
  assert.equal(calls.at(-1).payload.config.officialRulesActivationRevision, 8);

  const runtimeSource = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
  assert.match(runtimeSource, /key === "chatclubOfficialRulesStateV1"|createAppConfigService/);
  assert.match(runtimeSource, /messageNavigatorActivationRevision !== String\(revision\)/);
  assert.match(runtimeSource, /reapplyMessageNavigatorForFrame/);

  console.log("message navigator official-rules activation sync: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
